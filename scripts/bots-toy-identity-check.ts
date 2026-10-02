/** Real GLB assemblies: choosing one part must preserve every other socket. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createCombatToy, type CombatToy } from "../src/app/bots/_view/combat-toy";
import { BEGINNER_OFFERS, BEGINNER_ORDER } from "../src/lib/bots/beginner-catalog";
import { freshGameDemo, demoWelcome, demoBuy } from "../src/lib/bots/game-demo";
import { engineBuild, type Socket } from "../src/lib/bots/fixtures";
import { EQUIPMENT_KIND } from "../src/lib/bots/equipment";
import { combatPart, modularBuild } from "../src/lib/bots/combat-model";
import type { Build } from "../src/app/bots/_engine/parts";

const folder = "public/bots-art/3d/pilot/";
const manifest = JSON.parse(readFileSync(folder + "manifest.json", "utf8"));
const originalFetch = globalThis.fetch, originalLoad = GLTFLoader.prototype.loadAsync;
// Use the shipped bytes and the actual Three.js parser; no network or GPU needed.
globalThis.fetch = async () => new Response(JSON.stringify(manifest));
GLTFLoader.prototype.loadAsync = async function(url) {
  const bytes = readFileSync(folder + url.split("/").pop());
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
};
process.env.NEXT_PUBLIC_BOTS_TOY_PILOT = "1";

function appearance(toy: CombatToy, socket: Socket) {
  toy.resetPose();
  toy.applyClip("guard", .5, 1, ["armL", "armR", "elbowL", "elbowR", "wristL", "wristR"]);
  toy.root.updateMatrixWorld(true);
  const meshes: string[] = [];
  toy.root.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o.userData.socket !== socket) return;
    const hash = createHash("sha256");
    for (const key of ["position", "normal", "skinIndex", "skinWeight"]) {
      const a = o.geometry.getAttribute(key)?.array;
      if (a) hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    const materials = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.MeshStandardMaterial[];
    hash.update(JSON.stringify({ transform: o.matrixWorld.elements, color: materials.map(m => m.color?.getHex()) }));
    meshes.push(hash.digest("hex"));
  });
  return meshes.sort();
}

async function main() {
  let state = demoWelcome(freshGameDemo());
  for (const socket of BEGINNER_ORDER.filter(s => s !== "weapon")) {
    const choices = BEGINNER_OFFERS.filter(o => o.part.slot === EQUIPMENT_KIND[socket]);
    state = demoBuy(state, socket, choices[socket === "head" || socket === "torso" || socket.startsWith("leg") ? 1 : 0].id);
  }
  const base = await createCombatToy(engineBuild(state.builds[1], state.parts), {}, false, "inspection");
  assert(base.blender, "test body uses the authored GLB models");
  const before = Object.fromEntries(BEGINNER_ORDER.map(s => [s, appearance(base, s)]));
  for (const offer of BEGINNER_OFFERS.filter(o => o.part.slot === "weapon")) {
    const complete = demoBuy(state, "weapon", offer.id);
    const toy = await createCombatToy(engineBuild(complete.builds[1], complete.parts), {}, false, "inspection");
    for (const socket of BEGINNER_ORDER.filter(s => s !== "weapon")) {
      assert.deepEqual(appearance(toy, socket), before[socket], `${offer.part.name} must preserve ${socket} geometry, paint and pose`);
    }
    assert(appearance(toy, "weapon").length > 0, `${offer.part.name} is visible`);
    toy.setVisible("weapon", false);
    assert(toy.root.children.length > 0);
    toy.dispose();
    assert.deepEqual(appearance(base, "head"), before.head, "disposing another build preserves shared artwork");
  }
  base.dispose();
  console.log("PASS: all eight final weapon choices preserve the six selected body parts.");

  const ready = demoBuy(state, "weapon", BEGINNER_OFFERS.find(o => o.part.slot === "weapon")!.id);
  const built = engineBuild(ready.builds[1], ready.parts);
  const reference = await createCombatToy(built);
  for (const socket of BEGINNER_ORDER) {
    const offer = BEGINNER_OFFERS.find(o => o.part.slot === EQUIPMENT_KIND[socket] && !manifest.parts[o.artKey]);
    if (!offer) continue;
    const parts = BEGINNER_ORDER.map(s => s === socket ? { id: offer.id, s: [1,1,1] as [number,number,number], ...(offer.color ? {paint: offer.color} : {}) } : combatPart(built, s));
    const next: Build = modularBuild(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6]);
    const toy = await createCombatToy(next);
    for (const other of BEGINNER_ORDER.filter(s => s !== socket)) {
      assert.deepEqual(appearance(toy, other), appearance(reference, other), `changing ${socket} must preserve ${other}`);
    }
    const native: THREE.Mesh[] = [];
    toy.root.traverse(o => { if (o instanceof THREE.Mesh && o.userData.socket === socket) native.push(o); });
    assert(native.length > 0 && native.every(m => !(m instanceof THREE.SkinnedMesh)), `${socket} uses its own native art`);
    const geometries = new Set(native.map(m => m.geometry));
    let disposed = 0;
    geometries.forEach(g => g.addEventListener("dispose", () => disposed++));
    toy.dispose(); toy.dispose();
    assert.equal(disposed, geometries.size, "native geometry is disposed exactly once");
  }
  reference.dispose();
  console.log("PASS: unsupported choices on every socket preserve their neighbours in the fight rig and dispose cleanly.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = originalFetch;
  GLTFLoader.prototype.loadAsync = originalLoad;
});
