/** Real GLB regression: a sticker or earned mark cannot replace a chosen mould. */
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
import { FACE_IDS, HAT_KINDS, type BotLook } from "../src/app/bots/_view/look";

const folder = "public/bots-art/3d/pilot/";
const manifest = JSON.parse(readFileSync(folder + "manifest.json", "utf8"));
const originalFetch = globalThis.fetch, originalLoad = GLTFLoader.prototype.loadAsync, originalDocument = globalThis.document;
// Canvas drawing is left to browser visual QA; the actual Three.js geometry,
// projection, materials, skinning and disposal all run here without a GPU.
const context = new Proxy({}, { get: () => () => undefined, set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document;
globalThis.fetch = async () => new Response(JSON.stringify(manifest));
GLTFLoader.prototype.loadAsync = async function(url) {
  const bytes = readFileSync(folder + url.split("/").pop());
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
};
process.env.NEXT_PUBLIC_BOTS_TOY_PILOT = "1";

function moulds(toy: CombatToy, onlyAuthored = false) {
  toy.root.updateMatrixWorld(true);
  const parts: Record<string, string[]> = {};
  toy.root.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o.userData.cosmetic || onlyAuthored && !(o instanceof THREE.SkinnedMesh)) return;
    const hash = createHash("sha256");
    for (const key of ["position", "normal", "skinIndex", "skinWeight"]) {
      const a = o.geometry.getAttribute(key)?.array;
      if (a) hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    hash.update(JSON.stringify({ matrix: o.matrixWorld.elements, materials: (Array.isArray(o.material) ? o.material : [o.material]).map(m => ({ name: m.name, color: (m as THREE.MeshStandardMaterial).color?.getHex() })) }));
    (parts[o.userData.socket] ??= []).push(hash.digest("hex"));
  });
  Object.values(parts).forEach(a => a.sort()); return parts;
}
function decorations(toy: CombatToy) {
  const result: THREE.Mesh[] = [];
  toy.root.traverse(o => { if (o instanceof THREE.Mesh && o.userData.cosmetic) result.push(o); });
  return result;
}

async function main() {
  let state = demoWelcome(freshGameDemo());
  for (const socket of BEGINNER_ORDER) {
    const offer = BEGINNER_OFFERS.find(o => o.part.slot === EQUIPMENT_KIND[socket] && manifest.parts[o.artKey]);
    assert(offer); state = demoBuy(state, socket, offer.id);
  }
  const build = engineBuild(state.builds[1], state.parts);
  const base = await createCombatToy(build, {}, false, "inspection");
  assert(base.blender); const before = moulds(base);
  const looks: BotLook[] = [
    ...["plate", "bolt", "star", "stripes", "wrenches", "heart"].flatMap(id => ["chest", "cheek", "boot"].map(spot => ({ sticker: { id, spot, color: 0x86afa0 } } as BotLook))),
    ...FACE_IDS.filter(face => face !== "calm").map(face => ({ face })),
    ...HAT_KINDS.map(kind => ({ hat: { kind, color: 0xc9755e } })),
    { plate: 42 }, { earned: { wins: 40, repairs: 3, level: 10, crown: true } },
    { face: "stars", sticker: { id: "bolt", spot: "chest", color: 0xe3c666 }, plate: 27, hat: { kind: "ears", color: 0x86afa0 }, earned: { wins: 25, repairs: 2, level: 10, crown: true } },
  ];
  for (const look of looks) {
    const toy = await createCombatToy(build, look, false, "inspection");
    assert(toy.blender, `${JSON.stringify(look)} keeps the authored renderer`);
    assert.deepEqual(moulds(toy), before, "all seven chosen part buffers, colours and transforms remain identical");
    const decals = decorations(toy); assert(decals.length > 0, "selected cosmetics have visible geometry");
    for (const mesh of decals) {
      const positions = mesh.geometry.getAttribute("position").array;
      assert(Array.from(positions).every(Number.isFinite), "projected decoration coordinates are finite");
      const socket = mesh.userData.socket as Socket;
      toy.setVisible(socket, false); assert.equal(mesh.visible, false, "lost parts hide their cosmetics");
      toy.setVisible(socket, true);
    }
    const detachable = decals.find(m => m.userData.socket === "torso");
    if (detachable) {
      const loose = toy.freezePart("torso");
      assert(loose.children.length > before.torso.length, "detached body retains cosmetics");
      loose.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    }
    const geometries = new Set(decals.map(m => m.geometry)), textures = new Set(decals.flatMap(m => (Array.isArray(m.material) ? m.material : [m.material]).map(m => (m as THREE.MeshStandardMaterial).map).filter(Boolean)));
    let disposedGeometry = 0, disposedTextures = 0;
    geometries.forEach(g => g.addEventListener("dispose", () => disposedGeometry++));
    textures.forEach(t => t!.addEventListener("dispose", () => disposedTextures++));
    toy.dispose(); toy.dispose();
    assert.equal(disposedGeometry, geometries.size); assert.equal(disposedTextures, textures.size);
    assert.deepEqual(moulds(base), before, "disposing a decorated instance preserves shared parts");
  }
  console.log(`PASS: ${looks.length} looks preserve all seven real GLB parts, attach visible cosmetics, follow limb loss and dispose once.`);

  const nativeOffer = BEGINNER_OFFERS.find(o => o.part.slot === "torso" && !manifest.parts[o.artKey]);
  assert(nativeOffer);
  const p = BEGINNER_ORDER.map(s => s === "torso" ? { id: nativeOffer.id, s: [1, 1, 1] as [number, number, number], ...(nativeOffer.color ? { paint: nativeOffer.color } : {}) } : combatPart(build, s));
  const mixedBuild = modularBuild(p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
  const mixedBase = await createCombatToy(mixedBuild), mixed = await createCombatToy(mixedBuild, { sticker: { id: "bolt", spot: "chest", color: 0xf1d790 }, face: "sleepy" });
  assert(mixed.blender); assert.deepEqual(moulds(mixed, true), moulds(mixedBase, true), "a native chest sticker preserves neighbouring Blender parts");
  mixedBase.dispose(); mixed.dispose();

  // Simulate unavailable canvas support: a cosmetic failure cannot invoke a
  // complete-model fallback or invalidate an otherwise usable authored toy.
  globalThis.document = { createElement: () => ({ getContext: () => null }) } as unknown as Document;
  const unavailable = await createCombatToy(build, { sticker: { id: "bolt", spot: "chest", color: 0xf1d790 } });
  assert(unavailable.blender); unavailable.dispose(); base.dispose();
  console.log("PASS: mixed native/authored builds and missing canvas retain selected model identity.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = originalFetch; GLTFLoader.prototype.loadAsync = originalLoad; globalThis.document = originalDocument;
});
