"use client";

import * as THREE from "three";
import type { Socket } from "@/lib/bots/fixtures";
import type { CombatToy } from "./combat-toy";

export interface CombatDamageEvent { frame: number; slot: Socket; amount: number; critical?: boolean; kind?: "blunt" | "blade" | "projectile" }
export interface CombatDamage {
  hit(event: CombatDamageEvent): { point: THREE.Vector3; moved: number } | null;
  reset(): void;
  dispose(): void;
  readonly dents: number;
  readonly changedVertices: number;
}

/** Added vertices, not the model's existing vertices. No work runs per frame. */
export const COMBAT_DAMAGE_VERTEX_BUDGET = 28000;
const SLOTS = ["head", "torso", "armL", "armR", "legL", "legR"] as const;
const BUDGET = { head: 6000, torso: 6500, armL: 3500, armR: 3500, legL: 4250, legR: 4250 };
type ArmourSlot = typeof SLOTS[number];
const vector = (a: ArrayLike<number>, i: number, out: THREE.Vector3) => out.set(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);

/** Split long edges with shared midpoints. Flat faces stay exactly flat; short
 * bevel edges do not consume the budget. Skin joints are categorical, so only
 * their weights are blended, never the joint numbers themselves. */
function armourGeometry(source: THREE.BufferGeometry, toPart: THREE.Matrix4, spacing: number, allowance: number) {
  const geometry = source.clone(), names = Object.keys(source.attributes);
  const data: Record<string, number[]> = {}, sizes: Record<string, number> = {};
  for (const name of names) {
    const a = source.getAttribute(name); sizes[name] = a.itemSize; data[name] = [];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) data[name].push(a.getComponent(i, c));
  }
  let triangles = source.index ? Array.from(source.index.array) : Array.from({ length: source.getAttribute("position").count }, (_, i) => i);
  const initial = data.position.length / 3, limit = initial + Math.max(0, allowance);
  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  const midpoint = (a: number, b: number) => {
    const index = data.position.length / 3;
    for (const name of names) {
      const size = sizes[name], values = data[name];
      if (name === "skinIndex" || name === "skinWeight") continue;
      for (let c = 0; c < size; c++) values.push((values[a * size + c] + values[b * size + c]) / 2);
    }
    if (data.skinIndex && data.skinWeight) {
      const weights = new Map<number, number>();
      for (const at of [a, b]) for (let c = 0; c < 4; c++) {
        const joint = data.skinIndex[at * 4 + c], weight = data.skinWeight[at * 4 + c] * .5;
        if (weight) weights.set(joint, (weights.get(joint) ?? 0) + weight);
      }
      const joints = Array.from(weights).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
      const total = joints.reduce((n, j) => n + j[1], 0) || 1;
      for (let c = 0; c < 4; c++) { data.skinIndex.push(joints[c]?.[0] ?? 0); data.skinWeight.push((joints[c]?.[1] ?? 0) / total); }
    }
    return index;
  };
  for (let pass = 0; pass < 9 && data.position.length / 3 < limit; pass++) {
    const edges = new Map<string, { a: number; b: number; length: number }>();
    const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
    for (let t = 0; t < triangles.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = triangles[t + e], b = triangles[t + (e + 1) % 3], id = key(a, b);
      if (edges.has(id)) continue;
      vector(data.position, a, pa).applyMatrix4(toPart); vector(data.position, b, pb).applyMatrix4(toPart);
      const length = pa.distanceToSquared(pb);
      if (length > spacing * spacing) edges.set(id, { a, b, length });
    }
    if (!edges.size) break;
    const splits = new Map<string, number>();
    for (const [id, edge] of Array.from(edges).sort((a, b) => b[1].length - a[1].length).slice(0, limit - data.position.length / 3)) splits.set(id, midpoint(edge.a, edge.b));
    const next: number[] = [];
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
      const ab = splits.get(key(a, b)), bc = splits.get(key(b, c)), ca = splits.get(key(c, a));
      if (ab !== undefined && bc !== undefined && ca !== undefined) next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      else if (ab !== undefined && bc !== undefined) next.push(ab, b, bc, a, ab, c, ab, bc, c);
      else if (bc !== undefined && ca !== undefined) next.push(bc, c, ca, b, bc, a, bc, ca, a);
      else if (ca !== undefined && ab !== undefined) next.push(ca, a, ab, c, ca, b, ca, ab, b);
      else if (ab !== undefined) next.push(a, ab, c, ab, b, c);
      else if (bc !== undefined) next.push(b, bc, a, bc, c, a);
      else if (ca !== undefined) next.push(c, ca, b, ca, a, b);
      else next.push(a, b, c);
    }
    triangles = next;
  }
  for (const name of names) geometry.setAttribute(name, new THREE.BufferAttribute(name === "skinIndex" ? new Uint16Array(data[name]) : new Float32Array(data[name]), sizes[name]));
  geometry.setIndex(triangles); geometry.clearGroups(); geometry.setDrawRange(0, Infinity);
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  if (!geometry.getAttribute("color")) geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(data.position.length).fill(1), 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

interface Surface {
  mesh: THREE.Mesh; slot: ArmourSlot; originalGeometry: THREE.BufferGeometry; originalMaterial: THREE.Material;
  geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial;
  position: Float32Array; normal: Float32Array; color: Float32Array;
  partPosition: Float32Array; partNormal: Float32Array; inverse: THREE.Matrix3[];
  deformation: Float32Array; touched: Uint8Array; maxDepth: number; geometryDisposed: boolean; materialDisposed: boolean;
}

function materialOf(mesh: THREE.Mesh) { return Array.isArray(mesh.material) ? null : mesh.material as THREE.MeshStandardMaterial; }
function enamel(material: THREE.MeshStandardMaterial) {
  const physical = material as THREE.MeshPhysicalMaterial;
  return physical.isMeshPhysicalMaterial && Math.abs(physical.metalness - .07) < .001 && Math.abs(physical.roughness - .31) < .001 && Math.abs(physical.clearcoat - .78) < .001;
}
function areaOf(mesh: THREE.Mesh) {
  const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute("position") as THREE.BufferAttribute);
  const scale = mesh.getWorldScale(new THREE.Vector3());
  // Reflected left limbs have a negative scale component. Surface area and
  // subdivision shares use magnitudes, never the reflection's orientation.
  scale.set(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
  const size = box.getSize(new THREE.Vector3()).multiply(scale);
  return size.x * size.y + size.x * size.z + size.y * size.z;
}

/** Create at the rig's rest pose, before arena positioning/animation. Damage is
 * encoded in geometry and colour attributes, so ordinary skinning and freezePart
 * carry it naturally. Dispose this controller before disposing its toy. */
export function createCombatDamage(toy: CombatToy): CombatDamage {
  toy.root.updateMatrixWorld(true);
  const surfaces: Surface[] = [], bounds = new Map<ArmourSlot, THREE.Box3>();
  const meshes: THREE.Mesh[] = [];
  toy.root.traverse(o => { if (o instanceof THREE.Mesh && SLOTS.includes(o.userData.socket) && !o.userData.cosmetic && !o.name.startsWith("cosmetic:") && !Object.keys(o.geometry.morphAttributes).length) meshes.push(o); });
  let disposed = false, dents = 0, changedVertices = 0;
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  for (const slot of SLOTS) {
    const candidates = meshes.filter(m => m.userData.socket === slot && materialOf(m));
    // Native paint has no name. Each part's dominant enamel is its hull paint;
    // ivory fittings use another shared material and hats have their own enamel.
    const nativeMaterials = new Map<THREE.Material, number>();
    for (const mesh of candidates) {
      const material = materialOf(mesh)!;
      if (!(mesh instanceof THREE.SkinnedMesh) && enamel(material)) nativeMaterials.set(material, (nativeMaterials.get(material) ?? 0) + areaOf(mesh));
    }
    const nativePaint = Array.from(nativeMaterials).sort((a, b) => b[1] - a[1])[0]?.[0];
    const painted = candidates.filter(m => materialOf(m)!.name === "paint" || !(m instanceof THREE.SkinnedMesh) && materialOf(m) === nativePaint);
    const area = painted.reduce((sum, m) => sum + areaOf(m), 0) || 1;
    const box = new THREE.Box3(); bounds.set(slot, box);
    const partInverse = toy.bones[slot].matrixWorld.clone().invert();
    for (const mesh of painted) {
      const originalGeometry = mesh.geometry, originalMaterial = materialOf(mesh)!;
      const toPart = new THREE.Matrix4().multiplyMatrices(partInverse, mesh.matrixWorld);
      const geometry = armourGeometry(originalGeometry, toPart, slot === "head" || slot === "torso" ? .10 : .072, Math.floor(BUDGET[slot] * areaOf(mesh) / area));
      const p = geometry.getAttribute("position") as THREE.BufferAttribute, n = geometry.getAttribute("normal") as THREE.BufferAttribute;
      const material = originalMaterial.clone(); material.vertexColors = true; material.needsUpdate = true;
      const surface: Surface = { mesh, slot, originalGeometry, originalMaterial, geometry, material,
        position: new Float32Array(p.array), normal: new Float32Array(n.array), color: new Float32Array(geometry.getAttribute("color").array),
        partPosition: new Float32Array(p.count * 3), partNormal: new Float32Array(p.count * 3), inverse: [], deformation: new Float32Array(p.count * 3), touched: new Uint8Array(p.count),
        maxDepth: slot === "head" || slot === "torso" ? .14 : .085, geometryDisposed: false, materialDisposed: false };
      geometry.addEventListener("dispose", () => { surface.geometryDisposed = true; });
      material.addEventListener("dispose", () => { surface.materialDisposed = true; });
      const skin = mesh as THREE.SkinnedMesh;
      if (skin.isSkinnedMesh) skin.skeleton.update();
      const maps = new Map<string, { forward: THREE.Matrix4; inverse: THREE.Matrix3; normal: THREE.Matrix3 }>();
      for (let i = 0; i < p.count; i++) {
        const indices = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
        const key = skin.isSkinnedMesh ? [0, 1, 2, 3].map(c => `${indices.getComponent(i, c)}:${weights.getComponent(i, c)}`).join("/") : "rigid";
        let map = maps.get(key);
        if (!map) {
          let forward = toPart.clone();
          if (skin.isSkinnedMesh) {
            const weighted = new THREE.Matrix4(); weighted.elements.fill(0);
            for (let c = 0; c < 4; c++) {
              const joint = indices.getComponent(i, c), weight = weights.getComponent(i, c);
              for (let j = 0; j < 16; j++) weighted.elements[j] += skin.skeleton.boneMatrices[joint * 16 + j] * weight;
            }
            forward = forward.multiply(skin.bindMatrixInverse).multiply(weighted).multiply(skin.bindMatrix);
          }
          map = { forward, inverse: new THREE.Matrix3().setFromMatrix4(forward).invert(), normal: new THREE.Matrix3().getNormalMatrix(forward) }; maps.set(key, map);
        }
        surface.inverse.push(map.inverse);
        point.fromBufferAttribute(p, i).applyMatrix4(map.forward); point.toArray(surface.partPosition, i * 3); box.expandByPoint(point);
        normal.fromBufferAttribute(n, i).applyMatrix3(map.normal).normalize().toArray(surface.partNormal, i * 3);
      }
      mesh.geometry = geometry; mesh.material = material; surfaces.push(surface);
    }
  }

  function reset() {
    if (disposed) return;
    for (const s of surfaces) {
      (s.geometry.getAttribute("position").array as Float32Array).set(s.position);
      (s.geometry.getAttribute("normal").array as Float32Array).set(s.normal);
      (s.geometry.getAttribute("color").array as Float32Array).set(s.color);
      for (const name of ["position", "normal", "color"]) s.geometry.getAttribute(name).needsUpdate = true;
      s.geometry.computeBoundingBox(); s.geometry.computeBoundingSphere(); s.touched.fill(0); s.deformation.fill(0);
    }
    dents = 0; changedVertices = 0;
  }

  return {
    get dents() { return dents; }, get changedVertices() { return changedVertices; }, reset,
    hit(event) {
      if (disposed || !Number.isFinite(event.frame) || !Number.isFinite(event.amount) || event.amount <= 0 || event.slot === "weapon") return null;
      // A lethal hit is delivered after the simulation hides the socket, just
      // before freezePart captures it. Its final dent must still be recorded.
      const slot = event.slot as ArmourSlot, box = bounds.get(slot), eligible = surfaces.filter(s => s.slot === slot);
      if (!box || box.isEmpty() || !eligible.length) return null;
      let hash = 2166136261;
      for (const c of `${event.frame}:${slot}:${event.amount}:${event.critical ? 1 : 0}:${event.kind ?? "blunt"}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
      const random = () => { hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0; return hash / 4294967296; };
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const zone = Math.floor(random() * 3); // Front, left flank, right flank.
      const side = zone === 1 ? -1 : zone === 2 ? 1 : random() < .5 ? -1 : 1;
      center.x += size.x * side * (zone === 0 ? .05 + random() * .10 : .12 + random() * .14);
      center.y = box.min.y + size.y * (slot === "head" ? .68 + random() * .20 : .30 + random() * .40);
      const outward = new THREE.Vector3(side * (zone === 0 ? .10 + random() * .35 : 1.45 + random() * .30), .04 + random() * .12, zone === 0 ? 1 : .9).normalize();
      const ray = new THREE.Ray(center.clone().addScaledVector(outward, size.length() + 1), outward.clone().negate());
      let contact: { s: Surface; vertex: number; point: THREE.Vector3; normal: THREE.Vector3 } | null = null, nearest = Infinity;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3(), bary = new THREE.Vector3(), faceNormal = new THREE.Vector3();
      for (const s of eligible) {
        const index = s.geometry.index!;
        for (let t = 0; t < index.count; t += 3) {
          const ia = index.getX(t), ib = index.getX(t + 1), ic = index.getX(t + 2);
          vector(s.partPosition, ia, a); vector(s.partPosition, ib, b); vector(s.partPosition, ic, c);
          if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
          // Native left limbs use a reflected transform. Triangle winding then
          // flips in part space, while the transformed shading normal still
          // identifies the real outside of the armour.
          THREE.Triangle.getBarycoord(hit, a, b, c, bary);
          faceNormal.copy(vector(s.partNormal, ia, normal)).multiplyScalar(bary.x);
          faceNormal.addScaledVector(vector(s.partNormal, ib, normal), bary.y).addScaledVector(vector(s.partNormal, ic, normal), bary.z).normalize();
          if (faceNormal.dot(outward) < .08) continue;
          const distance = hit.distanceToSquared(ray.origin);
          if (distance >= nearest) continue;
          nearest = distance;
          const vertex = [ia, ib, ic].sort((u, v) => vector(s.partPosition, u, point).distanceToSquared(hit) - vector(s.partPosition, v, point).distanceToSquared(hit))[0];
          contact = { s, vertex, point: hit.clone(), normal: faceNormal.clone() };
        }
      }
      // Narrow rods and separated fingers may leave a hole through the aim ray.
      // Choose an actual outward paint vertex instead of inventing an impact.
      if (!contact) for (const s of eligible) for (let i = 0; i < s.touched.length; i++) {
        vector(s.partNormal, i, normal); if (normal.dot(outward) < .4) continue;
        vector(s.partPosition, i, point);
        const score = point.distanceToSquared(center);
        if (score < nearest) { nearest = score; contact = { s, vertex: i, point: point.clone(), normal: normal.clone() }; }
      }
      if (!contact) return null;
      const strength = THREE.MathUtils.clamp(Math.sqrt(event.amount / 10), .7, 1.35) * (event.critical ? 1.2 : 1);
      const large = slot === "head" || slot === "torso";
      const radius = (slot === "torso" ? .40 : slot === "head" ? .37 : .24) * (event.kind === "projectile" ? .78 : 1) * (event.critical ? 1.13 : 1);
      const depth = (large ? .083 : .058) * strength;
      const tangent = new THREE.Vector3(0, 1, 0).cross(contact.normal).normalize(), across = contact.normal.clone().cross(tangent).normalize();
      const delta = new THREE.Vector3(), displacement = new THREE.Vector3();
      let moved = 0;
      for (const s of eligible) {
        let changed = false, shaded = false;
        const positions = s.geometry.getAttribute("position") as THREE.BufferAttribute, colors = s.geometry.getAttribute("color") as THREE.BufferAttribute;
        for (let i = 0; i < positions.count; i++) {
          vector(s.partPosition, i, point); delta.copy(point).sub(contact.point);
          vector(s.partNormal, i, normal);
          if (normal.dot(contact.normal) < .12 || Math.abs(delta.dot(contact.normal)) > radius * .62 || point.length() < .15) continue;
          const x = delta.dot(tangent), y = delta.dot(across);
          const r = event.kind === "blade" ? Math.hypot(x / (radius * 1.4), y / (radius * .47)) : Math.hypot(x, y) / radius;
          if (r >= 1.25) continue;
          if (r < 1) {
            const crater = -depth * Math.pow(Math.max(0, 1 - (r / .82) ** 2), 2);
            const rim = depth * .30 * Math.exp(-(((r - .78) / .13) ** 2)) * (1 - r);
            displacement.copy(contact.normal).multiplyScalar(crater + rim);
            vector(s.deformation, i, delta).add(displacement);
            // Limit total displacement from the pristine mould, not per blow.
            delta.clampLength(0, s.maxDepth).toArray(s.deformation, i * 3);
            vector(s.position, i, point).add(delta.applyMatrix3(s.inverse[i]));
            if (point.distanceToSquared(displacement.fromBufferAttribute(positions, i)) > 1e-12) {
              positions.setXYZ(i, point.x, point.y, point.z); moved++; changed = true;
              if (!s.touched[i]) { s.touched[i] = 1; changedVertices++; }
            }
          }
          // A soft bruise extends beyond the physical dent. Its centre keeps
          // the same darkness limit, and the extra footprint never moves clay.
          const shade = 1 - .40 * strength * Math.pow(1 - r / 1.25, 1.2);
          for (let channel = 0; channel < 3; channel++) {
            const current = colors.getComponent(i, channel), next = Math.min(current, s.color[i * colors.itemSize + channel] * Math.max(.42, shade));
            if (next < current) { colors.setComponent(i, channel, next); shaded = true; }
          }
        }
        if (shaded) colors.needsUpdate = true;
        if (changed) {
          positions.needsUpdate = true; s.geometry.computeVertexNormals();
          const normals = s.geometry.getAttribute("normal") as THREE.BufferAttribute;
          for (let i = 0; i < normals.count; i++) if (!s.touched[i]) normals.setXYZ(i, s.normal[i * 3], s.normal[i * 3 + 1], s.normal[i * 3 + 2]);
          normals.needsUpdate = true; s.geometry.computeBoundingBox(); s.geometry.computeBoundingSphere();
        }
      }
      if (!moved) return null;
      dents++;
      toy.root.updateMatrixWorld(true);
      const mesh = contact.s.mesh as THREE.SkinnedMesh; if (mesh.isSkinnedMesh) mesh.skeleton.update();
      return { point: mesh.getVertexPosition(contact.vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld), moved };
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const s of surfaces) {
        if (s.mesh.geometry === s.geometry) s.mesh.geometry = s.originalGeometry;
        if (s.mesh.material === s.material) s.mesh.material = s.originalMaterial;
        if (!s.geometryDisposed) s.geometry.dispose();
        if (!s.materialDisposed) s.material.dispose();
      }
      surfaces.length = 0; bounds.clear(); dents = 0; changedVertices = 0;
    },
  };
}
