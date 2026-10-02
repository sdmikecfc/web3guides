"use client";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { FighterPoseV6 } from "@/lib/bots/v6/engine";
import type { BuildV6, BodySocketV6, EventV6, FighterV6, SocketV6 } from "@/lib/bots/v6/types";
import { cardAssetV6, CATALOGUE_ASSET_ROOT_V6 } from "@/lib/bots/v6/assets";

const BASE = "/bots-art/3d/season-v6/";
const CACHE = new Map<string, Promise<THREE.Group>>();
const V = (a: readonly number[]) => new THREE.Vector3(a[0] / 1000, a[1] / 1000, a[2] / 1000);
const loader = new GLTFLoader();
function normalizeRig<T extends THREE.Object3D>(root: T): T {
  // Blender appends .001/.002 when several heroes share one authoring scene.
  // These are editor object names, never canonical attachment identifiers.
  root.traverse(o => {
    // GLTFLoader sanitizes dots out of node.name, but preserves Blender's exact
    // exported name in userData.name. Match that identity before renaming clones.
    const exported = typeof o.userData.name === "string" ? o.userData.name : o.name;
    const named = /^(slot_(?:head|torso|armL|armR|legL|legR|weapon)|arm[LR]_elbow|hand[LR]|weapon_(?:left|right|shoulder))(?:\.\d+)?$/.exec(exported);
    if (named && !(o instanceof THREE.Mesh)) o.name = named[1];
  });
  return root;
}
function source(file: string) {
  let promise = CACHE.get(file);
  if (!promise) { promise = loader.loadAsync(file.startsWith("/") ? file : BASE + file).then(g => g.scene); CACHE.set(file, promise); promise.catch(() => CACHE.delete(file)); }
  return promise;
}
interface Surface { mesh: THREE.Mesh; slot: BodySocketV6; original: Float32Array; originalNormal: Float32Array; rest: Float32Array; normal: Float32Array; inverse: THREE.Matrix4; touched: Uint8Array; depth: Float32Array }
interface Rest { node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion }
export interface ToyV6 {
  root: THREE.Group; body: THREE.Group; slots: Partial<Record<BodySocketV6, THREE.Object3D>>;
  pose(fighter: FighterV6, frame: number, shared: FighterPoseV6, reduced?: boolean): void;
  impact(event: EventV6): number; reset(): void; dispose(): void;
  readonly dents: number; readonly scorches: number; readonly changedVertices: number; readonly gripError: number;
}

/** A version-six model never substitutes an older random toy. */
export async function createToyV6(build: BuildV6): Promise<ToyV6> {
  const body = build.parts.torso;
  const review = build.collisionVersion === "mk6-collision-hero-1";
  const asset = cardAssetV6(body), weaponAsset = cardAssetV6(build.parts.weapon);
  if (!review && (!asset?.ready || !weaponAsset?.ready)) throw new Error("The chosen model could not load. Your selected parts are saved.");
  const raw = await source(review ? `${body.family}.t3.glb` : asset!.modelUrl), rig = normalizeRig(raw.clone(true)), root = new THREE.Group();
  root.name = "robot_world"; rig.name = "robot_body"; root.add(rig);
  if (!review) {
    const kit = normalizeRig((await source(weaponAsset!.modelUrl)).clone(true)); rig.add(kit);
    if (build.capabilities.paired) {
      const right = kit.getObjectByName("weapon_right"), left = right?.clone(true);
      if (!left) throw new Error("This weapon is missing its second hand attachment.");
      left.name = "weapon_left"; kit.add(left);
    }
  }
  const leftWeapon = root.getObjectByName("weapon_left");
  if (leftWeapon) leftWeapon.scale.x = -1;
  if (build.style === "ranged" && build.capabilities.tier3) {
    const sidearm = await source("special-sidearm.t3.glb");
    for (const side of ["left", "right"]) { const mount = new THREE.Group(); mount.name = `special_${side}`; const gun = sidearm.clone(true); gun.scale.setScalar(body.tier === 4 ? 1.06 : 1); mount.add(gun); mount.visible = false; rig.add(mount); }
  }
  const builtInBlade = build.style === "speed" && build.capabilities.tier3;
  if (builtInBlade) {
    const blade = normalizeRig((await source(CATALOGUE_ASSET_ROOT_V6 + "weapons/sword.t3.glb")).clone(true)).getObjectByName("weapon_right");
    if (!blade) throw new Error("The finishing blade attachment could not load.");
    for (const side of ["left", "right"]) { const mount = new THREE.Group(); mount.name = `finisher_${side}`; const mesh = blade.clone(true); mesh.scale.setScalar(body.tier === 4 ? 1.06 : 1); if (side === "left") mesh.scale.x *= -1; mount.add(mesh); mount.visible = false; rig.add(mount); }
  }
  for (const slot of ["head", "armL", "armR", "legL", "legR"] as const) {
    const card = build.parts[slot];
    const partAsset = cardAssetV6(card);
    if (!review && !partAsset?.ready) throw new Error("The chosen part could not load. Your choices have been kept.");
    if (card.family === body.family && card.tier === body.tier) continue;
    const other = normalizeRig((await source(review ? `${card.family}.t3.glb` : partAsset!.modelUrl)).clone(true)), donor = other.getObjectByName(`slot_${slot}`)?.clone(true), current = root.getObjectByName(`slot_${slot}`);
    if (!donor || !current?.parent) throw new Error("A model attachment could not load.");
    donor.position.copy(current.position); donor.quaternion.copy(current.quaternion); current.parent.add(donor); current.removeFromParent();
  }
  // Validate before allocating any per-robot geometry or materials.
  for (const name of ["slot_head", "slot_torso", "slot_armL", "slot_armR", "slot_legL", "slot_legR", "armL_elbow", "armR_elbow", "handL", "handR"]) {
    if (!root.getObjectByName(name)) throw new Error(`This robot is missing its ${name} attachment.`);
  }
  const slots: ToyV6["slots"] = {}, rest: Rest[] = [], surfaces: Surface[] = [];
  const clonedMaterials = new Map<THREE.Material, THREE.Material>();
  const ownedMaterials = new Set<THREE.Material>(), ownedGeometry = new Set<THREE.BufferGeometry>();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (/^slot_(head|torso|armL|armR|legL|legR)$/.test(o.name) && !(o instanceof THREE.Mesh)) slots[o.name.slice(5) as BodySocketV6] = o;
    if (!(o instanceof THREE.Mesh)) { rest.push({ node: o, position: o.position.clone(), quaternion: o.quaternion.clone() }); return; }
    o.geometry = o.geometry.clone();
    ownedGeometry.add(o.geometry);
    const old = o.material;
    const clone = (m: THREE.Material) => {
      if (!clonedMaterials.has(m)) { const cloned = m.clone(); clonedMaterials.set(m, cloned); ownedMaterials.add(cloned); }
      return clonedMaterials.get(m)!;
    };
    o.material = Array.isArray(old) ? old.map(clone) : clone(old);
    o.castShadow = true; o.receiveShadow = true;
    if (o.userData.mk_surface !== "clay") return;
    const slot = o.userData.mk_slot as BodySocketV6, p = o.geometry.getAttribute("position"), n = o.geometry.getAttribute("normal");
    if (!slot || !p || !n) return;
    const toRoot = root.matrixWorld.clone().invert().multiply(o.matrixWorld), inv = toRoot.clone().invert();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(toRoot), points = new Float32Array(p.count * 3), normals = new Float32Array(p.count * 3);
    const pos = new THREE.Vector3(), nor = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      pos.fromBufferAttribute(p, i).applyMatrix4(toRoot); nor.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      pos.toArray(points, i * 3); nor.toArray(normals, i * 3);
    }
    const material = (o.material as THREE.MeshStandardMaterial).clone(); material.vertexColors = true; o.material = material;
    ownedMaterials.add(material);
    o.geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(p.count * 3).fill(1), 3));
    surfaces.push({ mesh: o, slot, original: new Float32Array(p.array), originalNormal: new Float32Array(n.array), rest: points, normal: normals, inverse: inv, touched: new Uint8Array(p.count), depth: new Float32Array(p.count) });
  });
  let dents = 0, scorches = 0, changedVertices = 0, gripError = 0, disposed = false;
  function resetPose() {
    for (const r of rest) { r.node.position.copy(r.position); r.node.quaternion.copy(r.quaternion); }
  }
  function pose(fighter: FighterV6, frame: number, shared: FighterPoseV6, reduced = false) {
    resetPose(); gripError = 0;
    root.position.set(fighter.x / 1000, 0, fighter.z / 1000); root.rotation.y = fighter.yaw / 1000;
    rig.position.copy(V(shared.body.translation)); rig.quaternion.fromArray(shared.body.orientation);
    const action = fighter.action;
    // Limb and weapon poses come from the same solver as collision detection.
    // Presentation never stretches the arm or invents a separate contact path.
    if (fighter.armour[1] <= 0 && !shared.body.knockdown) { root.rotation.x = Math.PI / 2; root.position.y = .48; }
    for (let i = 0; i < 6; i++) {
      const slot = ["head", "torso", "armL", "armR", "legL", "legR"][i] as BodySocketV6;
      if (slots[slot]) slots[slot]!.visible = fighter.armour[i] > 0;
    }
    slots.legL!.quaternion.fromArray(shared.legs.left.hipQuaternion); slots.legR!.quaternion.fromArray(shared.legs.right.hipQuaternion);
    for (const side of ["left", "right"] as const) {
      const suffix = side === "left" ? "L" : "R", arm = shared.arms[side];
      slots[`arm${suffix}`]!.quaternion.fromArray(arm.upperQuaternion);
      root.getObjectByName(`arm${suffix}_elbow`)!.quaternion.fromArray(arm.elbowQuaternion);
      root.getObjectByName(`hand${suffix}`)!.quaternion.fromArray(arm.handQuaternion);
    }
    for (const side of ["left", "right", "shoulder"] as const) {
      const weapon = root.getObjectByName(`weapon_${side}`); if (!weapon) continue;
      const index = side === "left" ? 2 : side === "right" ? 3 : 1;
      weapon.visible = fighter.armour[index] > 0;
      if (action?.special === "burst") weapon.visible = false;
      if (builtInBlade && action?.special === "flank") weapon.visible = false;
      if (action && (action.kind === "punch" || action.kind === "shove") && action.mount === side) weapon.visible = false;
      const mounted = shared.mounts[side];
      if (mounted) { weapon.position.copy(V(mounted.weaponOrigin)); weapon.quaternion.fromArray(mounted.orientation); }
      if (side === "shoulder") continue;
      const posed = shared.weapons[side];
      if (!posed) continue;
      weapon.position.copy(V(posed.weaponOrigin)); weapon.quaternion.fromArray(posed.orientation);
      gripError = Math.max(gripError, posed.gripError / 1000);
    }
    for (const side of ["left", "right"] as const) {
      const gun = root.getObjectByName(`special_${side}`), mounted = shared.mounts[side];
      if (!gun) continue;
      gun.visible = action?.special === "burst" && fighter.armour[side === "left" ? 2 : 3] > 0 && !!mounted;
      if (mounted) { gun.position.copy(V(mounted.weaponOrigin)); gun.quaternion.fromArray(mounted.orientation); }
    }
    for (const side of ["left", "right"] as const) {
      const blade = root.getObjectByName(`finisher_${side}`), posed = shared.weapons[side];
      if (!blade) continue;
      blade.visible = action?.special === "flank" && action.mount === side && fighter.armour[side === "left" ? 2 : 3] > 0 && !!posed;
      if (posed) { blade.position.copy(V(posed.weaponOrigin)); blade.quaternion.fromArray(posed.orientation); }
    }
    root.updateMatrixWorld(true);
  }
  function impact(event: EventV6) {
    if (!event.slot || !event.point || !event.normal || !(event.damage && event.damage > 0)) return 0;
    const proxy = build.collision.proxies.find(p => p.slot === event.slot); if (!proxy) return 0;
    const hit = new THREE.Vector3((proxy.center[0] + event.point[0] / 1000 * proxy.half[0]) / 1000, (proxy.center[1] - proxy.half[1] + event.point[1] / 1000 * proxy.half[1] * 2) / 1000, (proxy.center[2] + event.point[2] / 1000 * proxy.half[2]) / 1000);
    const outward = V(event.normal).normalize(), candidate = new THREE.Vector3(), normal = new THREE.Vector3();
    let nearest = Infinity, anchor = hit.clone();
    const selected = surfaces.filter(s => s.slot === event.slot);
    for (const s of selected) for (let i = 0; i < s.touched.length; i++) {
      candidate.fromArray(s.rest, i * 3); normal.fromArray(s.normal, i * 3);
      const score = candidate.distanceToSquared(hit) + (normal.dot(outward) < -.1 ? .3 : 0);
      if (score < nearest) { nearest = score; anchor.copy(candidate); }
    }
    const burn = event.kind === "burn" || event.weapon === "flame_sword" || event.weapon === "flamethrower";
    const heavy = event.weapon === "hammer" || event.weapon === "shoulder_cannon";
    const radius = burn ? .23 : heavy ? .26 : .16, depth = Math.min(.065, .022 + event.damage * .001);
    let changed = 0;
    for (const s of selected) {
      let surfaceChanged = 0;
      const p = s.mesh.geometry.getAttribute("position") as THREE.BufferAttribute, colors = s.mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        candidate.fromArray(s.rest, i * 3); normal.fromArray(s.normal, i * 3);
        const dist = candidate.distanceTo(anchor); if (dist > radius || normal.dot(outward) < -.25) continue;
        const u = dist / radius, falloff = (1 - u * u) ** 2;
        if (!burn) {
          s.depth[i] = Math.min(.11, s.depth[i] + depth * falloff);
          candidate.addScaledVector(normal, -s.depth[i]).applyMatrix4(s.inverse); p.setXYZ(i, candidate.x, candidate.y, candidate.z);
          if (!s.touched[i]) { s.touched[i] = 1; changedVertices++; }
        }
        const shade = burn ? .18 + u * .52 : .60 + u * .40;
        colors.setXYZ(i, Math.min(colors.getX(i), shade), Math.min(colors.getY(i), shade * (burn ? .82 : 1)), Math.min(colors.getZ(i), shade * (burn ? .65 : 1)));
        changed++; surfaceChanged++;
      }
      if (surfaceChanged) { p.needsUpdate = true; colors.needsUpdate = true; if (!burn) s.mesh.geometry.computeVertexNormals(); }
    }
    if (changed) { if (burn) scorches++; else dents++; }
    return changed;
  }
  return {
    root, body: rig, slots, pose, impact,
    reset() {
      resetPose(); dents = 0; scorches = 0; changedVertices = 0;
      for (const s of surfaces) {
        const p = s.mesh.geometry.getAttribute("position") as THREE.BufferAttribute; p.array.set(s.original); p.needsUpdate = true;
        const n = s.mesh.geometry.getAttribute("normal") as THREE.BufferAttribute; n.array.set(s.originalNormal); n.needsUpdate = true;
        s.depth.fill(0); s.touched.fill(0); const c = s.mesh.geometry.getAttribute("color") as THREE.BufferAttribute; c.array.fill(1); c.needsUpdate = true;
      }
      for (const node of Object.values(slots)) node!.visible = true;
    },
    dispose() {
      if (disposed) return; disposed = true;
      ownedGeometry.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose());
      ownedGeometry.clear(); ownedMaterials.clear(); clonedMaterials.clear(); root.removeFromParent();
    },
    get dents() { return dents; }, get scorches() { return scorches; }, get changedVertices() { return changedVertices; }, get gripError() { return Math.max(0, gripError); },
  };
}

export function setToyVisibilityV6(toy: ToyV6, slot?: SocketV6, visibleSlots?: readonly SocketV6[]) {
  const visible = new Set(slot ? [slot] : visibleSlots ?? ["head", "torso", "armL", "armR", "legL", "legR", "weapon"]);
  for (const [part, object] of Object.entries(toy.slots)) object!.visible = visible.has(part as SocketV6);
  for (const mount of ["left", "right", "shoulder"]) { const weapon = toy.root.getObjectByName(`weapon_${mount}`); if (weapon && !visible.has("weapon")) weapon.visible = false; }
}
