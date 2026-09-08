/** Reuse the approved garage moulds in the isolated lab; never alter legacy art. */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createToy } from "../src/app/bots/_view/toy3d";
import { CARD_BY_ID } from "../src/lib/bots/fixtures";
import type { Build, Part } from "../src/app/bots/_engine/parts";

// GLTFExporter uses FileReader only to package buffers when textures are absent.
class BufferReader {
  result: ArrayBuffer | string | null = null; onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then(v => { this.result = v; this.onloadend?.(); }); }
  readAsDataURL(blob: Blob) { void blob.arrayBuffer().then(v => { this.result = `data:${blob.type};base64,${Buffer.from(v).toString("base64")}`; this.onloadend?.(); }); }
}
Object.assign(globalThis, { FileReader: BufferReader });
const folder = "public/bots-art/3d/toy-lab"; mkdirSync(folder, { recursive: true });
const templates = {
  brute: { head: [7, 5], torso: [7, 6], arms: [0, 2], legs: [0, 5] },
  hotshot: { head: [0, 2], torso: [2, 1], arms: [3, 5], legs: [2, 1] },
  deadeye: { head: [1, 4], torso: [3, 0], arms: [7, 4], legs: [7, 6] },
};
const pick = (slot: string, variant: number): Part => {
  const card = Object.values(CARD_BY_ID).find(p => p.slot === slot && (p.tier - 1) * 2 + p.design - 1 === variant);
  if (!card) throw new Error(`Missing original ${slot} ${variant}`);
  return { id: card.id, s: [1, 1, 1] };
};
const marker = 0x7db29e;
const manifest = { version: "toy-lab-v1", origin: "Existing Model Kombat garage moulds, adapted for isolated clay deformation", license: "Project-owned original assets", units: "metres", up: "+Y", front: "+Z", parts: {} as Record<string, object> };

/** Split long triangle edges without smoothing away the approved silhouette. */
function dense(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = mergeVertices(source), attr = geo.getAttribute("position"), positions = Array.from(attr.array), index = Array.from(geo.index!.array);
  let faces = index;
  for (let pass = 0; pass < 6; pass++) {
    const next: number[] = [], edges = new Map<string, number>(); let split = false;
    const edgeLength = (a: number, b: number) => Math.hypot(...[0, 1, 2].map(k => positions[a * 3 + k] - positions[b * 3 + k]) as [number, number, number]);
    const midpoint = (a: number, b: number) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`; let id = edges.get(key);
      if (id === undefined) { id = positions.length / 3; for (let k = 0; k < 3; k++) positions.push((positions[a * 3 + k] + positions[b * 3 + k]) / 2); edges.set(key, id); } return id;
    };
    // Every face sharing a split edge must consume its midpoint. Independent
    // triangle subdivision produces T-junctions which open into tears on denting.
    for (let i = 0; i < faces.length; i += 3) {
      const [a, b, c] = faces.slice(i, i + 3);
      for (const [u, v] of [[a, b], [b, c], [c, a]]) if (edgeLength(u, v) > .075) { midpoint(u, v); split = true; }
    }
    const edge = (a: number, b: number) => edges.get(a < b ? `${a}:${b}` : `${b}:${a}`);
    for (let i = 0; i < faces.length; i += 3) {
      const [a, b, c] = faces.slice(i, i + 3), ab = edge(a, b), bc = edge(b, c), ca = edge(c, a);
      const mask = (ab === undefined ? 0 : 1) | (bc === undefined ? 0 : 2) | (ca === undefined ? 0 : 4);
      if (mask === 0) next.push(a, b, c);
      if (mask === 1) next.push(a, ab!, c, ab!, b, c);
      if (mask === 2) next.push(b, bc!, a, bc!, c, a);
      if (mask === 4) next.push(c, ca!, b, ca!, a, b);
      if (mask === 3) next.push(b, bc!, ab!, a, ab!, c, ab!, bc!, c);
      if (mask === 5) next.push(a, ab!, ca!, ab!, b, c, ab!, c, ca!);
      if (mask === 6) next.push(c, ca!, bc!, a, b, ca!, b, bc!, ca!);
      if (mask === 7) next.push(a, ab!, ca!, ab!, b, bc!, ca!, bc!, c, ab!, bc!, ca!);
    }
    faces = next; if (!split) break;
  }
  geo.dispose(); const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); out.setIndex(faces); out.computeVertexNormals(); return out;
}
async function main() {
  for (const [family, selections] of Object.entries(templates)) for (const design of [0, 1]) {
    const build: Build = { head: pick("head", selections.head[design]), torso: pick("torso", selections.torso[design]), arms: pick("arms", selections.arms[design]), legs: pick("legs", selections.legs[design]), weapon: { id: "empty.weapon", s: [0, 0, 0] } };
    const toy = createToy(build, { paint: { head: marker, torso: marker, armL: marker, armR: marker, legL: marker, legR: marker } }); toy.root.updateMatrixWorld(true);
    for (const [kind, socket] of [["head", "head"], ["torso", "torso"], ["arm", "armR"], ["leg", "legR"]] as const) {
      const group = new THREE.Group(), sourceSocket = toy.sockets[socket], inverse = sourceSocket.matrixWorld.clone().invert();
      const chunks = new Map<string, { geometry: THREE.BufferGeometry[]; material: THREE.MeshStandardMaterial; bone: string; clay: boolean }>();
      const scale = kind === "head" ? new THREE.Vector3(.88, .82, .88) : kind === "torso" ? new THREE.Vector3(family === "brute" ? .94 : .85, .85, .88) : kind === "arm" ? new THREE.Vector3(.94, .86, .94) : new THREE.Vector3(.92, .65, .88);
      sourceSocket.traverse(o => {
        if (!(o instanceof THREE.Mesh) || o.userData.socket !== socket) return;
        const old = o.material as THREE.MeshPhysicalMaterial, paint = old.color.getHex() === marker;
        const geo = o.geometry.clone(); geo.applyMatrix4(inverse.clone().multiply(o.matrixWorld)); geo.scale(scale.x, scale.y, scale.z); geo.computeBoundingBox();
        const box = geo.boundingBox!, centre = box.getCenter(new THREE.Vector3());
        let bone: string = kind;
        if (kind === "arm") { bone = centre.y < -.78 ? "hand" : centre.y < -.47 ? "lower" : "upper"; geo.translate(0, bone === "hand" ? .98 : bone === "lower" ? .48 : 0, 0); }
        if (kind === "leg") { bone = centre.y < -.65 ? "foot" : centre.y < -.33 ? "lower" : "upper"; geo.translate(0, bone === "foot" ? .85 : bone === "lower" ? .42 : 0, 0); }
        // Ocular drums, hardware and tiny trim keep their original polished finish.
        const size = box.getSize(new THREE.Vector3()), clay = paint && (size.x > .35 && size.y > .30 || kind === "arm" || kind === "leg");
        geo.deleteAttribute("uv"); geo.deleteAttribute("normal");
        const prepared = clay ? dense(geo) : geo; if (clay) geo.dispose(); else prepared.computeVertexNormals();
        const key = `${bone}:${old.uuid}:${clay}`; let chunk = chunks.get(key);
        if (!chunk) {
          const material = new THREE.MeshStandardMaterial({ color: old.color, metalness: old.metalness, roughness: old.roughness, emissive: old.emissive, emissiveIntensity: old.emissiveIntensity });
          material.name = paint ? clay ? "clay" : "paint" : "hardware";
          if (clay) { material.roughness = .82; material.metalness = 0; }
          chunk = { geometry: [], material, bone, clay }; chunks.set(key, chunk);
        }
        chunk.geometry.push(prepared.index ? prepared.toNonIndexed() : prepared); if (prepared.index) prepared.dispose();
      });
      for (const c of Array.from(chunks.values())) {
        const merged = mergeGeometries(c.geometry)!; c.geometry.forEach(g => g.dispose()); const welded = mergeVertices(merged); merged.dispose();
        const mesh = new THREE.Mesh(welded, c.material); mesh.name = `${c.bone}_${c.material.name}`; mesh.userData = { bone: c.bone, clay: c.clay, paint: c.material.name === "clay" || c.material.name === "paint" }; group.add(mesh);
      }
      const name = `${family}-${kind}-${design}`, bytes = Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true }) as ArrayBuffer);
      writeFileSync(`${folder}/${name}.glb`, bytes);
      manifest.parts[name] = { file: `${name}.glb`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), source: build[kind === "arm" ? "arms" : kind === "leg" ? "legs" : kind].id };
      group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
    }
    toy.dispose();
  }
  const weapons = JSON.parse(readFileSync("public/bots-art/3d/clay-lab/manifest.json", "utf8"));
  for (const kind of ["hammer", "baton", "rifle", "shield"]) { const bytes = readFileSync(`public/bots-art/3d/clay-lab/${kind}.glb`); writeFileSync(`${folder}/${kind}.glb`, bytes); manifest.parts[kind] = weapons.parts[kind]; }
  const flame = readFileSync(`${folder}/flamethrower.glb`);
  manifest.parts.flamethrower = { file: "flamethrower.glb", bytes: flame.length, sha256: createHash("sha256").update(flame).digest("hex"), source: "art-src/bots/blender/build_lab_flamethrower.py" };
  writeFileSync(`${folder}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log("Exported 24 original toy modules and 5 lab weapon/shield modules.");
}
void main().catch(e => { console.error(e); process.exitCode = 1; });
