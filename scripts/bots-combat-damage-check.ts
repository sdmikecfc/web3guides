/** Real exported meshes and skinning, without a browser or WebGL renderer. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createCombatToy, type CombatToy } from "../src/app/bots/_view/combat-toy";
import { createCombatDamage, COMBAT_DAMAGE_VERTEX_BUDGET, type CombatDamageEvent } from "../src/app/bots/_view/combat-damage";
import { freshGameDemo, demoWelcome, demoBuy } from "../src/lib/bots/game-demo";
import { BEGINNER_OFFERS, BEGINNER_ORDER } from "../src/lib/bots/beginner-catalog";
import { EQUIPMENT_KIND } from "../src/lib/bots/equipment";
import { engineBuild, type Socket } from "../src/lib/bots/fixtures";
import { combatPart, modularBuild } from "../src/lib/bots/combat-model";
import type { BotLook } from "../src/app/bots/_view/look";

const folder = "public/bots-art/3d/pilot/", manifest = JSON.parse(readFileSync(folder + "manifest.json", "utf8"));
const originalFetch = globalThis.fetch, originalLoad = GLTFLoader.prototype.loadAsync, originalDocument = globalThis.document;
const context = new Proxy({}, { get: () => () => undefined, set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document;
globalThis.fetch = async () => new Response(JSON.stringify(manifest));
GLTFLoader.prototype.loadAsync = async function(url) {
  const bytes = readFileSync(folder + url.split("/").pop());
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
};
process.env.NEXT_PUBLIC_BOTS_TOY_PILOT = "1";
const slots: Socket[] = ["head", "torso", "armL", "armR", "legL", "legR"];
function meshes(toy: CombatToy) { const result: THREE.Mesh[] = []; toy.root.traverse(o => { if (o instanceof THREE.Mesh) result.push(o); }); return result; }
function hash(geometry: THREE.BufferGeometry) {
  const hash = createHash("sha256");
  for (const name of Object.keys(geometry.attributes).sort()) { const a = geometry.getAttribute(name).array; hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
  if (geometry.index) { const a = geometry.index.array; hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
  return hash.digest("hex");
}
function snapshots(toy: CombatToy) { return meshes(toy).map(mesh => ({ mesh, geometry: mesh.geometry, material: mesh.material, hash: hash(mesh.geometry) })); }
function triangleArea(geometry: THREE.BufferGeometry) {
  const p = geometry.getAttribute("position"), index = geometry.index, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let total = 0;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) { a.fromBufferAttribute(p, index ? index.getX(i) : i); b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1); c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2); total += new THREE.Triangle(a, b, c).getArea(); }
  return total;
}
function pointsOf(root: THREE.Object3D) {
  root.updateMatrixWorld(true); const points: string[] = [], v = new THREE.Vector3();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o instanceof THREE.SkinnedMesh) o.skeleton.update();
    for (let i = 0; i < o.geometry.getAttribute("position").count; i++) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); points.push([v.x, v.y, v.z].map(n => Math.round(n * 1000)).join(",")); }
  });
  return points.sort();
}

async function main() {
  let state = demoWelcome(freshGameDemo());
  for (const slot of BEGINNER_ORDER) { const offer = BEGINNER_OFFERS.find(o => o.part.slot === EQUIPMENT_KIND[slot] && manifest.parts[o.artKey]); assert(offer); state = demoBuy(state, slot, offer.id); }
  const build = engineBuild(state.builds[1], state.parts);
  const look: BotLook = { paint: Object.fromEntries(slots.map(s => [s, 0x619bb7])), face: "happy", sticker: { id: "bolt", spot: "chest", color: 0xffcc66 }, hat: { kind: "ears", color: 0xff7755 }, earned: { wins: 26, level: 10, repairs: 3 } };
  const left = await createCombatToy(build, look), right = await createCombatToy(build, look);
  assert(left.blender && right.blender);
  const originals = snapshots(left), untouched = snapshots(right);
  const began = performance.now(), damage = createCombatDamage(left), prepMs = performance.now() - began;
  const owned = originals.filter(s => s.geometry !== s.mesh.geometry), pristine = meshes(left).map(m => hash(m.geometry));
  assert.equal(owned.length, 6, "only six painted GLB armour primitives are cloned");
  const added = owned.reduce((n, s) => n + s.mesh.geometry.getAttribute("position").count - s.geometry.getAttribute("position").count, 0);
  assert(added > 500 && added <= COMBAT_DAMAGE_VERTEX_BUDGET, "low-poly armour gets useful density within the strict budget");
  for (const old of owned) {
    assert.equal((old.material as THREE.Material).name, "paint");
    const now = old.mesh.geometry;
    assert(Math.abs(triangleArea(now) - triangleArea(old.geometry)) < .00003, "subdivision preserves every original plane and bevel without smoothing the silhouette");
    for (const name of Object.keys(old.geometry.attributes)) {
      const before = old.geometry.getAttribute(name), after = now.getAttribute(name);
      for (let i = 0; i < before.count; i++) for (let c = 0; c < before.itemSize; c++) assert(Math.abs(before.getComponent(i, c) - after.getComponent(i, c)) < 1e-6, `original ${name} values survive subdivision`);
    }
    const weights = now.getAttribute("skinWeight"), joints = now.getAttribute("skinIndex");
    for (let i = 0; i < weights.count; i++) {
      assert(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-5);
      for (let c = 0; c < 4; c++) assert(Number.isInteger(joints.getComponent(i, c)), "subdivision never averages joint numbers");
    }
  }
  const events: CombatDamageEvent[] = slots.flatMap((slot, i) => [
    { frame: 18 + i * 35, slot, amount: 12, kind: "blunt" },
    { frame: 35 + i * 35, slot, amount: 20, critical: true, kind: i % 2 ? "blade" : "projectile" },
  ]);
  const hitStart = performance.now();
  for (const event of events) { const result = damage.hit(event); assert(result && result.moved > 3, `${event.slot} ${event.kind} deforms a visible patch`); assert(result.point.toArray().every(Number.isFinite)); }
  const hitMs = performance.now() - hitStart;
  assert.equal(damage.dents, events.length); assert(damage.changedVertices > 100);
  const damaged = meshes(left).map(m => hash(m.geometry));
  assert.notDeepEqual(damaged, pristine);
  for (const old of untouched) { assert.equal(old.mesh.geometry, old.geometry); assert.equal(hash(old.geometry), old.hash, "other robot and shared source buffers are untouched"); }
  for (const old of originals.filter(o => !owned.includes(o))) { assert.equal(old.mesh.geometry, old.geometry); assert.equal(old.mesh.material, old.material); assert.equal(hash(old.geometry), old.hash, "eyes, brass, joints, rubber, weapons and cosmetics cannot deform"); }
  assert(owned.some(o => {
    const a = o.mesh.geometry.getAttribute("color"), original = o.geometry.getAttribute("color");
    for (let i = 0; i < original.count; i++) if (a.getX(i) < original.getX(i) * .98) return true;
    return false;
  }), "recesses receive localized colour shading");

  const otherDamage = createCombatDamage(right);
  for (const event of events) {
    right.root.position.set(4, 2, -7); right.root.rotation.y = .4 + event.frame * .01; right.root.scale.setScalar(.68);
    right.bones.armL.rotation.z = .8; right.bones.armR.rotation.x = -.7; right.bones.head.rotation.y = .3;
    right.root.updateMatrixWorld(true); assert(otherDamage.hit(event));
  }
  assert.deepEqual(meshes(right).map(m => hash(m.geometry)), damaged, "posing, root scaling and render cadence never determine damage");
  damage.reset(); assert.equal(damage.dents, 0); assert.equal(damage.changedVertices, 0); assert.deepEqual(meshes(left).map(m => hash(m.geometry)), pristine, "reset restores pristine densified buffers");
  for (const event of events) damage.hit(event);
  assert.deepEqual(meshes(left).map(m => hash(m.geometry)), damaged, "replaying identical events rebuilds identical dents and marks");
  assert.equal(damage.hit({ frame: 1, slot: "weapon", amount: 30 }), null); assert.equal(damage.hit({ frame: 2, slot: "head", amount: 0 }), null);

  left.bones.armL.rotation.z = .7; left.root.rotation.y = -.4; left.root.position.set(-1, 0, 2); left.root.updateMatrixWorld(true);
  left.setVisible("armL", false);
  const killing = damage.hit({ frame: 950, slot: "armL", amount: 30, critical: true });
  assert(killing && killing.moved > 0, "lethal hit still dents the already hidden part before its break event");
  const sourceArm = new THREE.Group();
  for (const m of meshes(left).filter(m => m.userData.socket === "armL")) {
    const g = m.geometry.clone(), p = g.getAttribute("position"), v = new THREE.Vector3();
    if (m instanceof THREE.SkinnedMesh) m.skeleton.update();
    for (let i = 0; i < p.count; i++) { m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); p.setXYZ(i, v.x, v.y, v.z); }
    sourceArm.add(new THREE.Mesh(g, m.material));
  }
  const detached = left.freezePart("armL");
  assert.deepEqual(pointsOf(detached), pointsOf(sourceArm), "posed detached armour contains the actual skinned dents, including the killing blow");
  const detachedHashes = detached.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh).map(m => hash(m.geometry));
  damage.reset(); assert.deepEqual(detached.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh).map(m => hash(m.geometry)), detachedHashes, "detached geometry owns its damage independently");
  function partPoints(mesh: THREE.Mesh) {
    left.root.updateMatrixWorld(true); if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update();
    const inverse = left.bones[mesh.userData.socket].matrixWorld.clone().invert(), p = new THREE.Vector3(), values: THREE.Vector3[] = [];
    for (let i = 0; i < mesh.geometry.getAttribute("position").count; i++) values.push(mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse).clone());
    return values;
  }
  const undamagedPoints = owned.map(s => partPoints(s.mesh));
  for (let i = 0; i < 250; i++) damage.hit({ frame: 1000 + i, slot: slots[i % 6], amount: 100, critical: true });
  assert.equal(owned.reduce((n, s) => n + s.mesh.geometry.getAttribute("position").count - s.geometry.getAttribute("position").count, 0), added, "repeated impacts never grow geometry");
  for (let j = 0; j < owned.length; j++) {
    const s = owned[j];
    assert(Array.from(s.mesh.geometry.getAttribute("position").array).every(Number.isFinite));
    const points = partPoints(s.mesh), limit = ["head", "torso"].includes(s.mesh.userData.socket) ? .1401 : .0851;
    for (let i = 0; i < points.length; i++) assert(points[i].distanceTo(undamagedPoints[j][i]) <= limit, "hundreds of critical hits remain bounded in part space");
  }
  const geos = owned.map(s => s.mesh.geometry), mats = owned.map(s => s.mesh.material as THREE.Material);
  const counts = new Map<object, number>();
  for (const resource of [...geos, ...mats]) { counts.set(resource, 0); resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource)! + 1)); }
  damage.dispose(); damage.dispose();
  assert(Array.from(counts.values()).every(n => n === 1), "owned geometry/materials dispose exactly once");
  for (const old of originals) { assert.equal(old.mesh.geometry, old.geometry); assert.equal(old.mesh.material, old.material); assert.equal(hash(old.geometry), old.hash); }
  assert.equal(damage.hit(events[0]), null);
  for (const root of [sourceArm, detached]) root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  otherDamage.dispose(); left.dispose(); right.dispose();

  const nativeOffer = BEGINNER_OFFERS.find(o => o.part.slot === "torso" && !manifest.parts[o.artKey]); assert(nativeOffer);
  const mixedParts = BEGINNER_ORDER.map(s => s === "torso" ? { id: nativeOffer.id, s: [1, 1, 1] as [number, number, number] } : combatPart(build, s));
  const alternatives = [
    { label: "native", build, native: true },
    { label: "mixed native chest/authored limbs", build: modularBuild(mixedParts[0], mixedParts[1], mixedParts[2], mixedParts[3], mixedParts[4], mixedParts[5], mixedParts[6]), native: false },
  ];
  for (const variant of alternatives) {
    const toy = await createCombatToy(variant.build, look, variant.native), before = snapshots(toy), effect = createCombatDamage(toy);
    assert.equal(toy.blender, !variant.native);
    const altered = before.filter(v => v.geometry !== v.mesh.geometry);
    assert(altered.length >= 6, `${variant.label} identifies armour`);
    for (const v of altered) {
      const mat = v.material as THREE.MeshStandardMaterial;
      assert(mat.name === "paint" || mat.color.getHex() === 0x619bb7, `${variant.label} leaves ivory fittings and hats alone`);
    }
    if (variant.native) {
      assert(meshes(toy).some(m => m.userData.socket === "armL" && m.getWorldScale(new THREE.Vector3()).x < 0), "fixture includes the real reflected native left arm");
      const reflected = await createCombatToy(variant.build, look, true); reflected.root.scale.x = -1; reflected.root.updateMatrixWorld(true);
      const prior = snapshots(reflected), reflectedDamage = createCombatDamage(reflected);
      assert.deepEqual(prior.map(s => [s.mesh.geometry !== s.geometry, s.mesh.geometry.getAttribute("position").count]), before.map(s => [s.mesh.geometry !== s.geometry, s.mesh.geometry.getAttribute("position").count]), "reflection cannot change paint selection or subdivision allocation");
      for (const slot of ["armL", "armR"] as const) {
        const added = prior.filter(s => s.mesh.userData.socket === slot).reduce((n, s) => n + s.mesh.geometry.getAttribute("position").count - s.geometry.getAttribute("position").count, 0);
        assert(added >= 0 && added <= 3500, "each reflected arm stays inside its own vertex allowance");
      }
      assert(prior.reduce((n, s) => n + s.mesh.geometry.getAttribute("position").count - s.geometry.getAttribute("position").count, 0) <= COMBAT_DAMAGE_VERTEX_BUDGET, "negative scales cannot inflate the robot budget through cancellation");
      reflectedDamage.dispose(); reflected.dispose();
    }
    for (const slot of slots) { toy.setVisible(slot, false); assert(effect.hit({ frame: 15, slot, amount: 20, critical: true }), `${variant.label} hidden ${slot} can take its killing dent`); }
    assert(altered.reduce((n, v) => n + v.mesh.geometry.getAttribute("position").count - v.geometry.getAttribute("position").count, 0) <= COMBAT_DAMAGE_VERTEX_BUDGET);
    effect.reset(); effect.dispose();
    for (const v of before) { assert.equal(v.mesh.geometry, v.geometry); assert.equal(v.mesh.material, v.material); assert.equal(hash(v.geometry), v.hash); }
    toy.dispose();
  }
  const catalogue = BEGINNER_OFFERS.filter(o => o.part.slot !== "weapon");
  for (const offer of catalogue) {
    const p = BEGINNER_ORDER.map(s => EQUIPMENT_KIND[s] === offer.part.slot ? { id: offer.id, s: [1, 1, 1] as [number, number, number] } : combatPart(build, s));
    const toy = await createCombatToy(modularBuild(p[0], p[1], p[2], p[3], p[4], p[5], p[6]), look);
    const original = snapshots(toy), effect = createCombatDamage(toy);
    const owned = original.filter(s => s.mesh.geometry !== s.geometry);
    for (const s of owned) assert((s.material as THREE.Material).name === "paint" || (s.material as THREE.MeshStandardMaterial).color.getHex() === 0x619bb7, `${offer.artKey} only clones its own paint`);
    assert(owned.reduce((n, s) => n + s.mesh.geometry.getAttribute("position").count - s.geometry.getAttribute("position").count, 0) <= COMBAT_DAMAGE_VERTEX_BUDGET);
    for (const slot of slots.filter(s => EQUIPMENT_KIND[s] === offer.part.slot)) {
      for (const kind of ["blunt", "blade", "projectile"] as const) {
        const result = effect.hit({ frame: 20, slot, kind, amount: 15 });
        assert(result?.moved, `${offer.artKey} ${slot} accepts ${kind} damage`);
      }
    }
    effect.dispose(); toy.dispose();
  }
  const broadOffer = BEGINNER_OFFERS.find(o => o.artKey === "torso.peeperBox"); assert(broadOffer);
  const broadParts = BEGINNER_ORDER.map(s => s === "torso" ? { id: broadOffer.id, s: [1, 1, 1] as [number, number, number] } : combatPart(build, s));
  const broadToy = await createCombatToy(modularBuild(broadParts[0], broadParts[1], broadParts[2], broadParts[3], broadParts[4], broadParts[5], broadParts[6]));
  const broadDamage = createCombatDamage(broadToy);
  const panels = meshes(broadToy).filter(m => m.userData.socket === "torso" && (m.material as THREE.Material).name === "paint").map(mesh => ({ mesh, normals: new Float32Array(mesh.geometry.getAttribute("normal").array), basis: new THREE.Matrix3().getNormalMatrix(broadToy.bones.torso.matrixWorld.clone().invert().multiply(mesh.matrixWorld)) }));
  const distribution = { front: 0, left: 0, right: 0 };
  for (let i = 0; i < 20; i++) {
    const impact = broadDamage.hit({ frame: 100 + i * 17, slot: "torso", amount: 12, kind: "blunt" }); assert(impact);
    const p = new THREE.Vector3(), n = new THREE.Vector3(); let closest = Infinity;
    for (const panel of panels) {
      if (panel.mesh instanceof THREE.SkinnedMesh) panel.mesh.skeleton.update();
      for (let v = 0; v < panel.mesh.geometry.getAttribute("position").count; v++) {
        panel.mesh.getVertexPosition(v, p).applyMatrix4(panel.mesh.matrixWorld);
        const distance = p.distanceToSquared(impact.point);
        if (distance < closest) { closest = distance; n.fromArray(panel.normals, v * 3).applyMatrix3(panel.basis).normalize(); }
      }
    }
    assert(closest < 1e-9, "reported impact lies on actual armour");
    if (Math.abs(n.x) > Math.abs(n.z)) distribution[n.x < 0 ? "left" : "right"]++;
    else if (n.z > .5) distribution.front++;
  }
  assert(distribution.front > 0 && distribution.left > 0 && distribution.right > 0, "twenty deterministic blows reach the broad torso front and both flanks");
  broadDamage.dispose(); broadToy.dispose();
  console.log(`PASS: ${catalogue.length} body mould choices, real fight GLBs, native/mixed armour, all 6 body slots and 3 impacts, hidden lethal hit, posed detachment, shared/protected surfaces, deterministic replay/reset and exact disposal. Broad torso 20-hit distribution ${JSON.stringify(distribution)}. Added ${added}/${COMBAT_DAMAGE_VERTEX_BUDGET} vertices; Node CPU preparation ${prepMs.toFixed(1)}ms, ${(hitMs / events.length).toFixed(2)}ms/hit (not rendering FPS).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = originalFetch; GLTFLoader.prototype.loadAsync = originalLoad; globalThis.document = originalDocument;
});
