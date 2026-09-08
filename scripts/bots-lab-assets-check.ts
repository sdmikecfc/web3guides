import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createClayRobot, dentGeometry } from "../src/app/bots/lab/robot";
import { COMBAT_RENDER_SCALE, createFightV4, preset, runFightV4, SLOTS, type EventV4 } from "../src/app/bots/lab/engine";
const folder = "public/bots-art/3d/toy-lab/";
const digest = (a: ArrayBufferView) => createHash("sha256").update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest("hex");
const parse = new GLTFLoader(), originalLoad = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function(url) { const bytes = readFileSync(folder + url.split("/").pop()); return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, ""); };
async function main() {
  const manifest = JSON.parse(readFileSync(folder + "manifest.json", "utf8"));
  assert.equal(Object.keys(manifest.parts).length, 28);
  let totalBytes = 0, meshes = 0;
  for (const entry of Object.values(manifest.parts) as { file: string; bytes: number; sha256: string }[]) {
    const bytes = readFileSync(folder + entry.file); assert.equal(digest(bytes), entry.sha256); assert.equal(bytes.length, entry.bytes); totalBytes += bytes.length;
    const asset = await parse.loadAsync(entry.file); let clay = 0;
    asset.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return; meshes++;
      assert(["head", "torso", "upper", "lower", "hand", "foot", "weapon"].includes(o.userData.bone));
      const p = o.geometry.getAttribute("position"); assert(Array.from(p.array).every(Number.isFinite));
      if (o.userData.clay) { clay++; assert(p.count > 150); const mat = o.material as THREE.MeshStandardMaterial; assert(mat.roughness >= .8 && mat.metalness === 0); }
    });
    if (!/^(hammer|baton|rifle)\./.test(entry.file)) assert(clay > 0);
  }
  console.log(`PASS 28 GLBs: ${totalBytes} bytes, ${meshes} meshes, verified hashes, materials and attachment labels`);
  const b = preset("brute"), a = await createClayRobot(b), other = await createClayRobot(b), scene = new THREE.Scene(); scene.add(a.root, other.root);
  const state = createFightV4(9, b, b); a.pose(state.fighters[0], state, 0, 0, true); other.pose(state.fighters[1], state, 1, 0, true);
  const positions = (robot: typeof a) => Object.fromEntries([...SLOTS, "weapon" as const].map(s => [s, robot.meshes[s].map(m => digest(m.geometry.getAttribute("position").array))]));
  const colours = (robot: typeof a) => SLOTS.flatMap(s => robot.meshes[s].filter(m => m.userData.clay).map(m => digest(m.geometry.getAttribute("color").array)));
  const baseline = positions(a), isolated = positions(other);
  const originalColours = colours(a), otherColours = colours(other);
  for (const [i, weapon] of (["hammer", "rifle", "baton"] as const).map((w, i) => [i, w] as const)) {
    const e: EventV4 = { id: i, frame: i, kind: "hit", who: 1, target: 0, slot: "torso", weapon, point: [i * 140 - 150, 550, 500], normal: [0, 0, 1000] };
    const before = positions(a); a.impact(e); assert.notDeepEqual(positions(a).torso, before.torso, `${weapon} must move actual vertices`);
  }
  assert.deepEqual(positions(other), isolated, "identical part on a second robot is unchanged");
  assert.notDeepEqual(colours(a), originalColours, "surface marks accompany real dents");
  assert.deepEqual(colours(other), otherColours, "damage colour is isolated to the struck robot");
  for (const slot of SLOTS.filter(s => s !== "torso")) assert.deepEqual(positions(a)[slot], baseline[slot]);
  for (const m of a.meshes.torso.filter(m => !m.userData.clay)) assert.equal(digest(m.geometry.getAttribute("position").array), baseline.torso[a.meshes.torso.indexOf(m)], "protected mechanism unchanged");
  const dented = positions(a).torso; a.detach("torso", scene, 30); a.debris(65); assert.deepEqual(positions(a).torso, dented);
  a.reset(); assert.deepEqual(positions(a), baseline); assert.equal(a.dents, 0);
  assert.deepEqual(colours(a), originalColours, "reset restores clay colour");
  // Reconstruct the same ordered impacts twice, including detached pieces.
  const fight = runFightV4(2048, b, preset("hotshot", 1));
  const replay = (cadence: number) => { a.reset(); for (const e of fight.events) { state.frame = Math.floor(e.frame / cadence) * cadence; a.pose(state.fighters[0], state, 0, state.frame / 60); if ((e.kind === "hit" || e.kind === "block") && e.target === 0) a.impact(e); if (e.kind === "break" && e.who === 0 && e.slot) a.detach(e.slot, scene, e.frame); } return positions(a); };
  const replay60 = replay(1), replayColours = colours(a); a.bones.elbowL.rotation.x = .7; a.bones.elbowR.rotation.x = -1;
  assert.deepEqual(replay60, replay(4), "damage is independent of presentation cadence");
  assert.deepEqual(replayColours, colours(a), "damage marks reconstruct with the geometry");
  for (let i = 0; i < 12; i++) { a.reset(); a.detach("armR", scene, 10); a.debris(60); }
  a.reset(); assert.equal(scene.children.length, 2, "replay cleanup leaves no detached objects");
  const shell = a.meshes.torso.find(m => m.userData.clay)!;
  const rest = new Float32Array(shell.geometry.getAttribute("position").array), geo = shell.geometry;
  geo.computeBoundingBox(); const p = geo.boundingBox!.getCenter(new THREE.Vector3()); p.z = geo.boundingBox!.max.z;
  for (let i = 0; i < 50; i++) dentGeometry(geo, { point: p, normal: new THREE.Vector3(0, 0, 1), radius: .4, depth: .2, kind: "hammer" }, rest);
  const attr = geo.getAttribute("position"); for (let i = 0; i < attr.count; i++) assert(Math.hypot(attr.getX(i) - rest[i * 3], attr.getY(i) - rest[i * 3 + 1], attr.getZ(i) - rest[i * 3 + 2]) <= .190001);
  a.dispose(); other.dispose(); assert.equal(scene.children.length, 0);
  console.log("PASS geometry dents, protected hardware, isolation, detachment, deterministic damage reconstruction, reset, deformation limits and disposal");
  for (const f of ["brute", "hotshot", "deadeye"] as const) {
    const build = preset(f, 1); build.parts.armR = { family: "brute", design: 1 }; build.parts.legL = { family: "hotshot", design: 0 };
    const bot = await createClayRobot(build); bot.pose(createFightV4(1, build, b).fighters[0], state, 0, 0, true);
    const box = new THREE.Box3().setFromObject(bot.root); assert(Number.isFinite(box.max.y) && box.max.y < 4 && box.min.y > -.3);
    bot.dispose();
  }
  console.log("PASS all family assemblies with bulky mixed attachments");
  for (const family of ["brute", "hotshot", "deadeye"] as const) for (const design of [0, 1] as const) {
    const build = preset(family, design); build.weapon = "rifle";
    const bot = await createClayRobot(build), fight = createFightV4(2, build, b);
    fight.fighters[0].x = fight.fighters[0].z = fight.fighters[0].yaw = 0;
    for (const distance of [1110, 1300, 1550, 1800, 2000, 2150, 2400, 3000]) {
      fight.fighters[1].x = 0; fight.fighters[1].z = distance;
      bot.pose(fight.fighters[0], fight, 0, 0);
      const tip = bot.tip();
      assert(tip.z < (distance / 1000 - .42) * COMBAT_RENDER_SCALE, `${family} ${design} rifle muzzle enters opponent at ${distance} mm: ${tip.z}`);
    }
    bot.dispose();
  }
  console.log("PASS rifle muzzle clearance on all six family/design assemblies from body contact to firing distance");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { GLTFLoader.prototype.loadAsync = originalLoad; });
