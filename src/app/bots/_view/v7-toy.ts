"use client";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { BuildV7, BodySocketV7, EventV7, FighterPoseV7, FighterV7 } from "@/lib/bots/v7/types";

const sourceCache = new Map<string, Promise<THREE.Group>>();
const loader = new GLTFLoader();
const slotNode: Record<BodySocketV7, string> = { head: "head", torso: "chest", armL: "shoulderL", armR: "shoulderR", legL: "hipL", legR: "hipR" };
const slots: BodySocketV7[] = ["head", "torso", "armL", "armR", "legL", "legR"];
const vec = (a: readonly number[]) => new THREE.Vector3(a[0] / 1000, a[1] / 1000, a[2] / 1000);

interface ClaySurface {
  mesh: THREE.Mesh; slot: BodySocketV7; node: string;
  original: Float32Array; normals: Float32Array; depth: Float32Array; touched: Uint8Array;
}

/** Each actor owns its deformable geometry. Cached source meshes are never posed or dented. */
export async function createToyV7(build: BuildV7) {
  let promise = sourceCache.get(build.rig.modelUrl);
  if (!promise) {
    promise = loader.loadAsync(build.rig.modelUrl).then(g => g.scene);
    sourceCache.set(build.rig.modelUrl, promise);
    promise.catch(() => sourceCache.delete(build.rig.modelUrl));
  }
  const root = (await promise).clone(true);
  const nodes = new Map<string, THREE.Object3D>();
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Map<THREE.Material, THREE.Material>();
  const surfaces: ClaySurface[] = [];
  root.traverse(o => {
    const exported = typeof o.userData.name === "string" ? o.userData.name : o.name;
    const canonical = exported.replace(/\.\d{3}$/, "");
    if (build.rig.nodes[canonical]) { o.name = canonical; nodes.set(canonical, o); }
  });
  for (const name of Object.keys(build.rig.nodes)) if (!nodes.has(name)) throw new Error(`The remastered ${build.name} is missing its ${name} joint.`);
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry = o.geometry.clone(); geometry.add(o.geometry);
    const cloneMaterial = (m: THREE.Material) => {
      if (!materials.has(m)) materials.set(m, m.clone());
      return materials.get(m)!;
    };
    o.material = Array.isArray(o.material) ? o.material.map(cloneMaterial) : cloneMaterial(o.material);
    o.castShadow = true; o.receiveShadow = true;
    if (o.userData.mk_surface !== "clay") return;
    let anchor: THREE.Object3D | null = o.parent;
    while (anchor && !nodes.has(anchor.name)) anchor = anchor.parent;
    const slot = o.userData.mk_slot as BodySocketV7;
    const p = o.geometry.getAttribute("position"), n = o.geometry.getAttribute("normal");
    if (!anchor || !slot || !p || !n) return;
    const ownMaterial = (o.material as THREE.MeshStandardMaterial).clone();
    ownMaterial.vertexColors = true;
    materials.set(ownMaterial, ownMaterial); o.material = ownMaterial;
    o.geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(p.count * 3).fill(1), 3));
    surfaces.push({ mesh: o, slot, node: anchor.name, original: new Float32Array(p.array), normals: new Float32Array(n.array), depth: new Float32Array(p.count), touched: new Uint8Array(p.count) });
  });
  let dents = 0, scorches = 0, changedVertices = 0, disposed = false, reachError = 0;
  const seen = new Set<number>();
  const inverse = new THREE.Matrix4(), point = new THREE.Vector3(), normal = new THREE.Vector3(), target = new THREE.Vector3();
  const delta = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();

  function pose(fighter: FighterV7, sample: FighterPoseV7, frame: number, reduced = false) {
    if (disposed) return;
    for (const [name, transform] of Object.entries(sample.nodes)) {
      const node = nodes.get(name);
      if (!node) continue;
      node.position.copy(vec(transform.position)); node.quaternion.fromArray(transform.quaternion);
    }
    reachError = sample.support.maxReachError;
    // Body destruction is a collapse, not the disappearance of the character.
    slots.forEach((slot, i) => { const node = nodes.get(slotNode[slot]); if (node) node.visible = slot === "torso" || fighter.armour[i] > 0; });
    // Holstered sidearms are root-mounted so their draw stays continuous. They
    // still belong to their hand and cannot float beside a missing arm.
    for (const [name, index] of [["backupGunL", 2], ["backupGun", 3]] as const) {
      const gun = nodes.get(name); if (gun) gun.visible = fighter.armour[index] > 0;
    }
    const active = fighter.special?.style === "speed";
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.material as THREE.MeshStandardMaterial;
      if (o.userData.mk_glow === "speed" && m.emissive) { m.emissive.setHex(active ? 0x28eaff : 0x123c48); m.emissiveIntensity = active ? 1.8 : .12; }
    });
    const key = root.getObjectByName("windingKey");
    if (key && !reduced) key.rotation.y = frame * .012;
    root.updateMatrixWorld(true);
  }

  function impact(event: EventV7) {
    if (disposed || seen.has(event.id) || !event.node || !event.point || !event.normal || !(event.damage && event.damage > 0)) return 0;
    seen.add(event.id);
    const hitNode = nodes.get(event.node); if (!hitNode) return 0;
    const burn = event.kind === "burn" || event.weapon === "flame_sword" || event.weapon === "flamethrower";
    const heavy = event.weapon === "hammer" || event.weapon === "shoulder_cannon" || event.weapon === "special_charge";
    const selected = surfaces.filter(s => s.node === event.node && (!event.slot || s.slot === event.slot));
    const radius = burn ? .25 : heavy ? .29 : .16;
    const depth = Math.min(.09, .025 + event.damage * .0011);
    let changed = 0;
    for (const s of selected) {
      inverse.copy(s.mesh.matrixWorld).invert().multiply(hitNode.matrixWorld);
      target.copy(vec(event.point)).applyMatrix4(inverse);
      normalMatrix.getNormalMatrix(inverse);
      normal.set(...event.normal).applyMatrix3(normalMatrix).normalize();
      const p = s.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      const colors = s.mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      let closest = Infinity, nearestIndex = -1;
      for (let i = 0; i < p.count; i++) {
        point.fromArray(s.original, i * 3); delta.fromArray(s.normals, i * 3);
        if (delta.dot(normal) < -.2) continue;
        const distance = point.distanceToSquared(target);
        if (distance < closest) { closest = distance; nearestIndex = i; }
      }
      // The collision shell is intentionally simple. Project its anchor to the
      // real outer clay surface, then deform only that surface's nearby vertices.
      if (nearestIndex < 0 || closest > .8 * .8) continue;
      target.fromArray(s.original, nearestIndex * 3);
      let touched = 0;
      for (let i = 0; i < p.count; i++) {
        point.fromArray(s.original, i * 3); delta.fromArray(s.normals, i * 3);
        const distance = point.distanceTo(target);
        if (distance > radius || delta.dot(normal) < -.2) continue;
        const u = distance / radius, envelope = (1 - u * u) ** 2;
        if (!burn) {
          s.depth[i] = Math.min(.14, s.depth[i] + depth * envelope);
          // Broad indentation with a slight displaced clay lip near its rim.
          const lip = Math.exp(-(((u - .79) / .11) ** 2)) * Math.min(.012, s.depth[i] * .18);
          point.addScaledVector(delta, -s.depth[i] + lip); p.setXYZ(i, point.x, point.y, point.z);
          if (!s.touched[i]) { s.touched[i] = 1; changedVertices++; }
        }
        const shade = burn ? .24 + .65 * u : .72 + .28 * u;
        colors.setXYZ(i, Math.min(colors.getX(i), shade), Math.min(colors.getY(i), shade * (burn ? .77 : 1)), Math.min(colors.getZ(i), shade * (burn ? .55 : 1)));
        touched++; changed++;
      }
      if (touched) { p.needsUpdate = true; colors.needsUpdate = true; if (!burn) s.mesh.geometry.computeVertexNormals(); }
    }
    if (changed) { if (burn) scorches++; else dents++; }
    return changed;
  }

  function detach(slot: BodySocketV7, recorded?: EventV7["detachPose"]) {
    if (slot === "torso") return null;
    const node = nodes.get(slotNode[slot]); if (!node) return null;
    node.updateWorldMatrix(true, true);
    const copy = node.clone(true); copy.visible = true;
    if (recorded) {
      copy.traverse(o => { const transform = recorded.nodes[o.name]; if (transform) { o.position.copy(vec(transform.position)); o.quaternion.fromArray(transform.quaternion); } });
      copy.position.copy(vec(recorded.world.position)); copy.quaternion.fromArray(recorded.world.quaternion);
    } else node.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
    return copy;
  }
  function silhouette(material: THREE.Material, ghost = new THREE.Group()) {
    root.updateMatrixWorld(true);
    for (let index = 0; index < surfaces.length; index++) {
      const surface = surfaces[index];
      let visible = true;
      for (let o: THREE.Object3D | null = surface.mesh; o; o = o.parent) if (!o.visible) visible = false;
      const mesh = (ghost.children[index] as THREE.Mesh | undefined) ?? new THREE.Mesh(surface.mesh.geometry, material);
      mesh.visible = visible;
      surface.mesh.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.castShadow = false; mesh.receiveShadow = false; if (!mesh.parent) ghost.add(mesh);
    }
    return ghost;
  }
  function reset() {
    seen.clear(); dents = 0; scorches = 0; changedVertices = 0;
    for (const s of surfaces) {
      const p = s.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      const n = s.mesh.geometry.getAttribute("normal") as THREE.BufferAttribute;
      p.array.set(s.original); p.needsUpdate = true; n.array.set(s.normals); n.needsUpdate = true;
      const c = s.mesh.geometry.getAttribute("color") as THREE.BufferAttribute; c.array.fill(1); c.needsUpdate = true;
      s.depth.fill(0); s.touched.fill(0);
    }
    for (const name of Object.values(slotNode)) { const node = nodes.get(name); if (node) node.visible = true; }
  }
  function inspect() {
    root.updateMatrixWorld(true);
    const world: Record<string, { position: number[]; quaternion: number[] }> = {};
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    nodes.forEach((node, name) => { node.getWorldPosition(p); node.getWorldQuaternion(q); world[name] = { position: p.toArray().map(n => n * 1000), quaternion: q.toArray() }; });
    // Read the owned vertex buffers, independently of the event counters.
    let hash = 2166136261;
    for (const s of surfaces) for (const name of ["position", "color"]) {
      const bytes = new Uint8Array(s.mesh.geometry.getAttribute(name).array.buffer);
      for (let i = 0; i < bytes.length; i++) { hash ^= bytes[i]; hash = Math.imul(hash, 16777619); }
    }
    return { world, geometryIds: surfaces.map(s => s.mesh.geometry.uuid), damageHash: (hash >>> 0).toString(16).padStart(8, "0"), dents, scorches, changedVertices };
  }
  return {
    root, nodes, pose, impact, detach, silhouette, reset, inspect,
    get dents() { return dents; }, get scorches() { return scorches; }, get changedVertices() { return changedVertices; }, get gripError() { return reachError; },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometry.forEach(g => g.dispose()); new Set(materials.values()).forEach(m => m.dispose()); geometry.clear(); materials.clear(); },
  };
}
export type ToyV7 = Awaited<ReturnType<typeof createToyV7>>;
