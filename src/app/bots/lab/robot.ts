import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SLOTS, type BuildV4, type Slot, type EventV4, type Fighter, type StateV4, type Side, type Point } from "./engine";

export const COLOURS = { brute: 0xbb7056, hotshot: 0x689e96, deadeye: 0x65728b };
const files = new Map<string, Promise<GLTF>>();
const loader = new GLTFLoader();
export function loadModule(name: string): Promise<GLTF> {
  let p = files.get(name);
  if (!p) { p = loader.loadAsync(`/bots-art/3d/clay-lab/${name}.glb`); files.set(name, p); p.catch(() => files.delete(name)); }
  return p;
}
export interface Dent { point: THREE.Vector3; normal: THREE.Vector3; radius: number; depth: number; kind: "hammer" | "projectile" | "blade" }
/** Rest-space deformation with a raised clay rim; never touches shared asset geometry. */
export function dentGeometry(geometry: THREE.BufferGeometry, dent: Dent, original: Float32Array): number {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute, v = new THREE.Vector3(), tangent = new THREE.Vector3(0, 1, 0).cross(dent.normal).normalize();
  if (tangent.lengthSq() < .1) tangent.set(1, 0, 0);
  const bitangent = new THREE.Vector3().crossVectors(dent.normal, tangent); let moved = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(dent.point);
    const along = v.dot(dent.normal);
    if (Math.abs(along) > dent.radius * .78) continue;
    const tx = v.dot(tangent), ty = v.dot(bitangent);
    const distance = dent.kind === "blade" ? Math.hypot(tx * .42, ty * 2.5) : Math.hypot(tx, ty);
    const u = distance / dent.radius; if (u > 1.25) continue;
    const crater = Math.pow(Math.max(0, 1 - u * u), 2);
    const rim = Math.exp(-Math.pow((u - .91) * 6.5, 2)) * .26;
    const depth = dent.depth * (crater - rim) * Math.max(0, 1 - Math.abs(along) / dent.radius);
    if (Math.abs(depth) < .00001) continue;
    const x = pos.getX(i) - dent.normal.x * depth, y = pos.getY(i) - dent.normal.y * depth, z = pos.getZ(i) - dent.normal.z * depth;
    const ox = original[i * 3], oy = original[i * 3 + 1], oz = original[i * 3 + 2];
    const limit = .19, len = Math.hypot(x - ox, y - oy, z - oz), scale = len > limit ? limit / len : 1;
    pos.setXYZ(i, ox + (x - ox) * scale, oy + (y - oy) * scale, oz + (z - oz) * scale); moved++;
  }
  if (moved) { pos.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox(); }
  return moved;
}
function fingerprintTexture(): THREE.DataTexture {
  const size = 128, bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x / size - .5, dy = y / size - .5, r = Math.hypot(dx * .75, dy), a = Math.atan2(dy, dx), mask = Math.max(0, 1 - r * 2);
    const ridge = Math.sin(r * 210 + Math.sin(a * 2) * 2) * mask;
    const i = (y * size + x) * 4;
    bytes[i] = 128 + Math.round(ridge * 19); bytes[i + 1] = 128 + Math.round(Math.cos(r * 210) * mask * 14); bytes[i + 2] = 252; bytes[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(bytes, size, size); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.repeat.set(2, 2); texture.needsUpdate = true; return texture;
}
export interface ClayRobot {
  root: THREE.Group; motion: THREE.Group; bones: Record<string, THREE.Group>; meshes: Record<Slot | "weapon", THREE.Mesh[]>;
  build: BuildV4; dents: number; reset(): void; pose(f: Fighter, s: StateV4, side: Side, time: number, showroom?: boolean): void;
  impact(event: EventV4): THREE.Vector3; detach(slot: Slot, scene: THREE.Scene, frame: number): void;
  debris(frame: number): void; dispose(): void; tip(): THREE.Vector3;
}
export async function createClayRobot(build: BuildV4): Promise<ClayRobot> {
  const names = SLOTS.map(s => `${build.parts[s].family}-${s.startsWith("arm") ? "arm" : s.startsWith("leg") ? "leg" : s}-${build.parts[s].design}`);
  const shield = build.parts.armL.family === "brute" && build.parts.armL.design === 1;
  const assets = await Promise.all([...names, build.weapon, ...(shield ? ["shield"] : [])].map(loadModule));
  const root = new THREE.Group(), motion = new THREE.Group(), rig = new THREE.Group(); motion.position.y = 1.2; rig.position.y = -1.2; root.add(motion); motion.add(rig);
  const bones: Record<string, THREE.Group> = {};
  function bone(name: string, parent: THREE.Object3D, x: number, y: number, z = 0) { const b = new THREE.Group(); b.name = name; b.position.set(x, y, z); bones[name] = b; parent.add(b); return b; }
  const torso = bone("torso", rig, 0, 1), width = build.parts.torso.family === "brute" ? .87 : .71;
  bone("head", torso, 0, 1.27).scale.setScalar(1.18);
  for (const side of ["L", "R"]) {
    const sign = side === "L" ? 1 : -1; // Robot's left is stage-right when facing the camera.
    const arm = bone("arm" + side, torso, sign * width, .97);
    const elbow = bone("elbow" + side, arm, 0, -.48);
    const hand = bone("hand" + side, elbow, 0, -.50, .03);
    if (side === "R") bone("weapon", hand, 0, -.07, .08);
    const leg = bone("leg" + side, rig, sign * .37, .96);
    const knee = bone("knee" + side, leg, 0, -.42);
    bone("foot" + side, knee, 0, -.43);
  }
  const meshes = Object.fromEntries([...SLOTS, "weapon"].map(s => [s, []])) as unknown as ClayRobot["meshes"];
  const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>(), originals = new Map<THREE.Mesh, Float32Array>();
  const homes = new Map<THREE.Mesh, { parent: THREE.Object3D; matrix: THREE.Matrix4 }>();
  const texture = fingerprintTexture();
  const detached: { group: THREE.Group; frame: number; start: THREE.Vector3; quaternion: THREE.Quaternion; direction: number }[] = [];
  function insert(asset: GLTF, slot: Slot | "weapon", isShield = false) {
    const source = asset.scene.clone(true); source.updateMatrixWorld(true); const list: THREE.Mesh[] = [];
    source.traverse(o => { if (o instanceof THREE.Mesh) list.push(o); });
    for (const mesh of list) {
      let label = String(mesh.userData.bone || slot);
      if (slot.startsWith("arm")) label = ({ upper: slot, lower: "elbow" + slot.slice(-1), hand: "hand" + slot.slice(-1) } as Record<string, string>)[label] ?? label;
      if (slot.startsWith("leg")) label = ({ upper: slot, lower: "knee" + slot.slice(-1), foot: "foot" + slot.slice(-1) } as Record<string, string>)[label] ?? label;
      const parent = bones[label]; if (!parent) throw new Error(`Invalid clay attachment ${label}`);
      const transform = mesh.matrixWorld.clone(); parent.add(mesh); transform.decompose(mesh.position, mesh.quaternion, mesh.scale);
      const originalMat = mesh.material as THREE.MeshStandardMaterial, mat = originalMat.clone();
      const clay = mesh.userData.clay === true;
      if (clay) {
        mat.color.setHex(COLOURS[build.parts[slot === "weapon" ? "armR" : slot].family]);
        mat.roughness = .82; mat.metalness = 0; mat.normalMap = texture; mat.normalScale.set(.18, .18);
        mesh.geometry = mesh.geometry.clone(); geometries.add(mesh.geometry);
        const p = mesh.geometry.getAttribute("position"), uv = new Float32Array(p.count * 2);
        for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 1.1; uv[i * 2 + 1] = p.getY(i) * 1.1; }
        mesh.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        originals.set(mesh, new Float32Array(p.array));
      }
      mat.envMapIntensity = clay ? .4 : .8; materials.add(mat); mesh.material = mat;
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.slot = slot; mesh.userData.shield = isShield;
      mesh.updateMatrix(); homes.set(mesh, { parent, matrix: mesh.matrix.clone() }); meshes[slot].push(mesh);
    }
  }
  SLOTS.forEach((s, i) => insert(assets[i], s)); insert(assets[6], "weapon"); if (shield) insert(assets[7], "armL", true);
  const rest = Object.values(bones).map(b => ({ b, p: b.position.clone() }));
  // Collision proxies stay in the slot's bind pose. Render cadence and animated
  // elbows cannot change which clay vertices receive a recorded replay impact.
  root.updateMatrixWorld(true);
  const proxies = new Map<THREE.Mesh, THREE.Mesh>();
  for (const slot of SLOTS) for (const mesh of meshes[slot]) if (originals.has(mesh)) {
    const proxy = new THREE.Mesh(mesh.geometry, mesh.material);
    proxy.matrixAutoUpdate = false;
    proxy.matrixWorld.copy(bones[slot].matrixWorld).invert().multiply(mesh.matrixWorld);
    proxy.matrix.copy(proxy.matrixWorld);
    proxy.userData.sourceMesh = mesh; proxies.set(mesh, proxy);
  }
  const raycaster = new THREE.Raycaster(), p = new THREE.Vector3(), n = new THREE.Vector3();
  const tipLocal = build.weapon === "rifle" ? new THREE.Vector3(0, .15, 1.18) : new THREE.Vector3(0, .9, 0);
  const robot: ClayRobot = {
    root, motion, bones, meshes, build, dents: 0,
    reset() {
      detached.forEach(d => d.group.removeFromParent()); detached.length = 0;
      homes.forEach((home, mesh) => { home.parent.add(mesh); home.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale); mesh.visible = true; });
      originals.forEach((original, mesh) => { const attr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute; attr.array.set(original); attr.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere(); });
      robot.dents = 0;
    },
    tip() { root.updateMatrixWorld(true); return bones.weapon.localToWorld(tipLocal.clone()); },
    pose(f, state, side, time, showroom = false) {
      const frame = Math.floor(state.frame / 5) * 5, other = state.fighters[1 - side];
      rest.forEach(({ b, p }) => { b.position.copy(p); b.rotation.set(0, 0, 0); b.scale.setScalar(1); });
      motion.rotation.set(0, 0, 0); motion.position.y = 1.2;
      root.position.set(f.x / 1000, .045, f.z / 1000); root.rotation.y = f.yaw / 1000;
      const tick = showroom ? Math.floor(time * 12) / 12 : frame / 60;
      bones.head.rotation.y = Math.sin(tick * 1.8 + side) * .035;
      bones.torso.position.y += Math.sin(tick * 3) * .012;
      bones.armL.rotation.z = -.10; bones.armR.rotation.z = .10;
      bones.armL.rotation.x = -.17; bones.elbowL.rotation.x = .05;
      bones.armR.rotation.x = -.12; bones.elbowR.rotation.x = -.12;
      const distance = Math.hypot(f.x - other.x, f.z - other.z), moving = !showroom && !f.action && !controlledPose(f, state.frame) && distance > (build.weapon === "rifle" ? 3700 : 1600);
      if (moving) for (const [i, leg] of [[0, "L"], [1, "R"]] as const) {
        const step = Math.sin(tick * (build.parts[("leg" + leg) as Slot].family === "brute" ? 8 : 13) + i * Math.PI);
        bones["leg" + leg].rotation.x = step * .25; bones["knee" + leg].rotation.x = Math.max(0, -step) * .42;
        bones["arm" + leg].rotation.x -= step * .18;
      }
      if (build.weapon === "rifle" && f.armour[3] > 0) {
        bones.armR.rotation.x = -1.1; bones.elbowR.rotation.x = -.35; bones.handR.rotation.x = 1.45;
        bones.armL.rotation.x = -.83; bones.elbowL.rotation.x = -.5; bones.armL.rotation.z = -.4;
      }
      const action = f.action;
      if (action && !controlledPose(f, state.frame)) {
        const age = frame - action.started, prep = Math.max(0, Math.min(1, age / action.windup)), recovery = Math.max(0, (age - action.windup) / action.recovery);
        if (action.kind === "hammer") {
          const swing = age < action.windup - 10 ? 0 : Math.min(1, (age - action.windup + 10) / 10);
          bones.armR.rotation.x = (1.75 * prep * (1 - swing) - 1.4 * swing) * (1 - recovery);
          bones.elbowR.rotation.x = -.4 * prep * (1 - swing) + .25 * swing;
          bones.weapon.rotation.x = swing * 1.3;
          bones.torso.rotation.y = -.22 * prep * (1 - swing) + .22 * swing;
          bones.torso.rotation.x = .13 * prep; bones.legL.rotation.x = -.12 * prep;
        } else if (action.kind === "baton" || action.kind === "punch") {
          const u = age < action.windup - 8 ? 0 : Math.min(1, (age - action.windup + 8) / 8);
          bones.armR.rotation.x = -.25 - 1.35 * u * (1 - recovery); bones.armR.rotation.z = .4 * (1 - u);
          bones.elbowR.rotation.x = -.35 * (1 - u); bones.weapon.rotation.x = u * 1.35;
          bones.torso.rotation.y = -.16 * prep + .3 * u * (1 - recovery);
          if (action.kind === "punch") { bones.armL.rotation.copy(bones.armR.rotation); bones.elbowL.rotation.copy(bones.elbowR.rotation); }
        } else {
          bones.torso.rotation.x = .06 * prep;
          if (action.released && recovery < .28) { bones.armR.rotation.x += .13 * Math.sin(recovery / .28 * Math.PI); bones.weapon.position.z -= .06; }
        }
      }
      if (f.stunnedUntil > state.frame) { bones.head.rotation.z = Math.sin(tick * 24) * .13; bones.torso.rotation.z = Math.sin(tick * 19) * .045; }
      if (!showroom && !controlledPose(f, state.frame)) {
        for (let i = state.events.length - 1; i >= 0; i--) {
          const event = state.events[i], age = frame - event.frame;
          if (age > 15) break;
          if (age < 0 || event.target !== side || (event.kind !== "hit" && event.kind !== "block")) continue;
          const reaction = Math.max(0, 1 - age / 15);
          if (event.kind === "block") { bones.elbowL.rotation.x -= .3 * reaction; bones.torso.rotation.x += .08 * reaction; }
          else { bones.torso.rotation.x -= reaction * (event.weapon === "hammer" ? .20 : event.weapon === "rifle" ? .10 : .07); bones.head.rotation.x -= reaction * .12; }
          break;
        }
      }
      if (f.downUntil > state.frame) {
        const age = 72 - (f.downUntil - state.frame), fall = age < 15 ? age / 15 : age < 43 ? 1 : Math.max(0, (72 - age) / 29);
        motion.rotation.x = -1.48 * fall; motion.position.y = 1.2 - .67 * fall;
        bones.legL.rotation.x = .3 * fall; bones.legR.rotation.x = .2 * fall;
      }
      if (f.dodgeUntil > state.frame) {
        const u = (23 - f.dodgeUntil + state.frame) / 23, roll = Math.sin(u * Math.PI);
        const fast = build.parts.legL.family === "hotshot" && build.parts.legR.family === "hotshot";
        const wheels = build.parts.legL.design === 1 || build.parts.legR.design === 1;
        motion.rotation.z = roll * (fast && !wheels ? 2.8 : .32) * (f.dodgeX > 0 ? 1 : -1);
        motion.position.y = fast && !wheels ? 1.2 - roll * .30 : 1.2;
        bones.legL.rotation.x = -.8 * roll; bones.kneeL.rotation.x = 1.3 * roll; bones.legR.rotation.x = -.75 * roll; bones.kneeR.rotation.x = 1.3 * roll;
      }
      if (f.armour[4] === 0 || f.armour[5] === 0) { motion.position.y -= .2; motion.rotation.z += f.armour[4] === 0 ? -.13 : .13; }
      if (f.armour[4] === 0 && f.armour[5] === 0) motion.position.y -= .46;
      if (state.done && state.winner !== side) { motion.rotation.x = -1.50; motion.position.y = .49; }
      if (showroom) { root.position.set(side === 0 ? -1.6 : 1.6, .045, 0); root.rotation.y = side === 0 ? .35 : -.35; }
      root.updateMatrixWorld(true);
    },
    impact(event) {
      const slot = event.slot ?? "torso", anchor = bones[slot]; root.updateMatrixWorld(true);
      p.set(...((event.point ?? [0, 520, 400]).map(x => x / 1000) as Point));
      const worldPoint = anchor.localToWorld(p.clone());
      n.set(...((event.normal ?? [0, 0, 1000]).map(x => x / 1000) as Point)).normalize();
      raycaster.set(p.clone().addScaledVector(n, 2), n.clone().negate());
      const candidates = meshes[slot].filter(m => originals.has(m) && (event.kind !== "block" || m.userData.shield)).map(m => proxies.get(m)!);
      let intersects = raycaster.intersectObjects(candidates, false);
      if (!intersects.length) {
        // Use each shell's centre for edge hits; protected hardware is never deformed.
        for (const mesh of candidates) {
          mesh.geometry.computeBoundingBox(); const centre = mesh.localToWorld(mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()));
          raycaster.set(centre.clone().addScaledVector(n, 2), n.clone().negate());
          intersects = raycaster.intersectObject(mesh, false); if (intersects.length) break;
        }
      }
      const hit = intersects[0]; if (!hit) return worldPoint;
      const proxy = hit.object as THREE.Mesh, mesh = proxy.userData.sourceMesh as THREE.Mesh, original = originals.get(mesh)!;
      const localPoint = proxy.worldToLocal(hit.point.clone());
      const normal = hit.face ? hit.face.normal.clone() : n.clone().transformDirection(proxy.matrixWorld.clone().invert());
      const kind = event.weapon === "rifle" ? "projectile" : event.weapon === "baton" ? "blade" : "hammer";
      const count = dentGeometry(mesh.geometry, { point: localPoint, normal, radius: kind === "hammer" ? .32 : kind === "projectile" ? .15 : .24, depth: kind === "hammer" ? .13 : kind === "projectile" ? .09 : .065, kind }, original);
      if (count) robot.dents++; return mesh.localToWorld(localPoint);
    },
    detach(slot, scene, frame) {
      const group = new THREE.Group(); scene.add(group);
      const list = slot === "armR" ? [...meshes.armR, ...meshes.weapon] : meshes[slot];
      root.updateMatrixWorld(true); const position = bones[slot].getWorldPosition(new THREE.Vector3()); group.position.copy(position); group.updateMatrixWorld(true);
      for (const mesh of list) group.attach(mesh);
      detached.push({ group, frame, start: position, quaternion: group.quaternion.clone(), direction: slot.endsWith("L") ? 1 : -1 });
    },
    debris(frame) {
      for (const d of detached) {
        const age = Math.max(0, (frame - d.frame) / 60), t = Math.min(1, age / .75);
        d.group.position.copy(d.start); d.group.position.x += d.direction * t * .8; d.group.position.z += t * .4;
        d.group.position.y = d.start.y * (1 - t) + .45 * Math.sin(t * Math.PI) + .28 * t;
        d.group.rotation.set(t * 1.3, t * 1.8, t * d.direction * 1.5);
      }
    },
    dispose() { detached.forEach(d => d.group.removeFromParent()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); texture.dispose(); root.removeFromParent(); },
  };
  return robot;
}
function controlledPose(f: Fighter, frame: number) { return f.stunnedUntil > frame || f.downUntil > frame; }
