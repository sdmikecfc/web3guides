"use client";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createLabSet } from "../lab/staging";
import { createToyV6, type ToyV6 } from "./v6-toy";
import { fighterPoseV6 } from "@/lib/bots/v6/engine";
import type { BuildV6, StateV6 } from "@/lib/bots/v6/types";

export async function createFightSceneV6(canvas: HTMLCanvasElement, builds: [BuildV6, BuildV6]) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, .1, 110);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture; scene.environmentIntensity = .5; room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffebd1, 0x483c32, 1.1));
  const key = new THREE.DirectionalLight(0xffddb1, 3.5); key.position.set(-4, 9, 5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 25 }); key.shadow.camera.updateProjectionMatrix(); key.shadow.normalBias = .025; scene.add(key);
  const rim = new THREE.DirectionalLight(0xbed9ff, 2); rim.position.set(4, 5, -5); scene.add(rim);
  let toys: ToyV6[] = [], stage: Awaited<ReturnType<typeof createLabSet>> | undefined;
  try {
    const loaded = await Promise.allSettled(builds.map(createToyV6));
    toys = loaded.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
    const failure = loaded.find(r => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (failure) throw failure.reason;
    stage = await createLabSet(scene, 6.75, true); toys.forEach(t => scene.add(t.root));
  } catch (error) { toys.forEach(t => t.dispose()); environment.dispose(); renderer.dispose(); throw error; }
  const g = new THREE.IcosahedronGeometry(.045, 0), mat = new THREE.MeshBasicMaterial({ color: 0xffd9a4 });
  const shots = new THREE.InstancedMesh(g, mat, 160); shots.frustumCulled = false; scene.add(shots);
  const flashG = new THREE.IcosahedronGeometry(.1, 0), flashM = new THREE.MeshBasicMaterial({ color: 0xffdba7, transparent: true });
  const flashes = new THREE.InstancedMesh(flashG, flashM, 64); flashes.frustumCulled = false; scene.add(flashes);
  const shieldG = new THREE.SphereGeometry(1, 24, 16), shieldM = new THREE.MeshBasicMaterial({ color: 0x79deef, transparent: true, opacity: .17, wireframe: true, depthWrite: false });
  const shields = toys.map(() => { const mesh = new THREE.Mesh(shieldG, shieldM); scene.add(mesh); return mesh; });
  const fieldG = new THREE.TorusGeometry(1.3, .045, 6, 40), fieldM = new THREE.MeshBasicMaterial({ color: 0x92c8ff, transparent: true, opacity: .6 });
  const fields = toys.map(() => { const mesh = new THREE.Mesh(fieldG, fieldM); mesh.rotation.x = -Math.PI / 2; scene.add(mesh); return mesh; });
  const dummy = new THREE.Object3D(), extent = new THREE.Box3(), meshBounds = new THREE.Box3(), centre = new THREE.Vector3(), aim = new THREE.Vector3(0, 1.4, 0), offset = new THREE.Vector3();
  const backward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), worldUp = new THREE.Vector3(0, 1, 0);
  const effects: { tick: number; point: THREE.Vector3; size: number }[] = [];
  const broken = [new Set<string>(), new Set<string>()], debris: { object: THREE.Object3D; tick: number; position: THREE.Vector3; quaternion: THREE.Quaternion; side: number }[] = [];
  let cursor = 0, width = 1000, height = 650, frame = -1, first = true, drawMs = 0, disposed = false, lastTime = 0, cameraAngle = .35;
  function clearDebris() { debris.forEach(d => d.object.removeFromParent()); debris.length = 0; broken.forEach(s => s.clear()); }
  function reset() { cursor = 0; frame = -1; effects.length = 0; clearDebris(); toys.forEach(t => t.reset()); cameraAngle = .35; first = true; }
  return {
    render(state: StateV6, wallTime: number, cinematic: boolean, reduced: boolean) {
      if (disposed) return;
      const begin = performance.now(), delta = Math.min(.1, Math.max(0, (wallTime - lastTime) / 1000)); lastTime = wallTime;
      if (state.frame < frame) reset(); frame = state.frame;
      toys.forEach((toy, i) => toy.pose(state.fighters[i], state.frame, fighterPoseV6(state, i as 0 | 1), reduced));
      while (cursor < state.events.length) {
        const e = state.events[cursor++];
        if (e.kind === "hit" || e.kind === "burn" || e.kind === "block") toys[e.target].impact(e);
        if ((e.kind === "hit" || e.kind === "block" || e.kind === "shot") && (e.worldPoint || e.origin)) effects.push({ tick: e.frame, point: new THREE.Vector3().fromArray((e.worldPoint ?? e.origin)!).multiplyScalar(.001), size: e.kind === "shot" ? .6 : 1.1 });
        if (e.kind === "break" && e.slot && !broken[e.who].has(e.slot)) {
          broken[e.who].add(e.slot); const part = toys[e.who].slots[e.slot];
          if (part) { const copy = part.clone(true); copy.visible = true; part.updateWorldMatrix(true, true); copy.position.copy(part.getWorldPosition(new THREE.Vector3())); copy.quaternion.copy(part.getWorldQuaternion(new THREE.Quaternion())); scene.add(copy); debris.push({ object: copy, tick: e.frame, position: copy.position.clone(), quaternion: copy.quaternion.clone(), side: e.who }); }
        }
      }
      let n = 0;
      for (const p of state.projectiles.slice(-160)) { dummy.position.set(p.x / 1000, p.y / 1000, p.z / 1000); dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(p.vx, p.vy, p.vz).normalize()); dummy.scale.set(p.radius / 45, p.radius / 45, Math.max(2, Math.hypot(p.vx, p.vy, p.vz) / 55)); dummy.updateMatrix(); shots.setMatrixAt(n++, dummy.matrix); }
      shots.count = n; shots.instanceMatrix.needsUpdate = true; n = 0;
      for (let i = effects.length - 1; i >= 0; i--) { const e = effects[i], age = (frame - e.tick) / 60; if (age > .25) { effects.splice(i, 1); continue; } if (reduced || n >= 64) continue; dummy.position.copy(e.point); dummy.scale.setScalar(e.size * (1 - age * 4)); dummy.quaternion.identity(); dummy.updateMatrix(); flashes.setMatrixAt(n++, dummy.matrix); }
      flashes.count = n; flashes.instanceMatrix.needsUpdate = true;
      debris.forEach(d => { const age = Math.max(0, (frame - d.tick) / 60); d.object.position.copy(d.position); if (!reduced) { d.object.position.x += (d.side ? 1 : -1) * Math.min(.85, age * 1.5); d.object.position.y = Math.max(.15, d.position.y + .8 * age - 4.9 * age * age); d.object.quaternion.copy(d.quaternion); d.object.rotateZ(Math.min(2, age * 3)); } });
      toys.forEach((toy, i) => { const f = state.fighters[i]; shields[i].visible = f.special?.style === "tank"; shields[i].position.set(f.x / 1000, 1.45, f.z / 1000); shields[i].scale.set(1.05, 1.5, .85); fields[i].visible = !!f.special && f.special.style !== "tank"; fields[i].position.set(f.x / 1000, .04, f.z / 1000); });
      stage!.update(false, width, height, toys.map(t => t.root), !reduced);
      // Frame the projected bounds of BOTH models, including their weapon tips.
      // The same calculation supports a narrow phone and a short landscape view.
      extent.makeEmpty();
      toys.forEach(t => t.root.traverseVisible(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        meshBounds.copy(object.geometry.boundingBox!).applyMatrix4(object.matrixWorld); extent.union(meshBounds);
      }));
      if (extent.isEmpty()) extent.setFromCenterAndSize(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(4, 3, 4));
      extent.getCenter(centre);
      aim.lerp(centre, first ? 1 : 1 - Math.exp(-delta * 7));
      // Look across the combat axis, so one robot cannot hide the other's hands.
      // Keep the same side of that axis and turn gently; steady/reduced-motion
      // cameras choose this angle once instead of orbiting during the fight.
      const dx = state.fighters[1].x - state.fighters[0].x, dz = state.fighters[1].z - state.fighters[0].z;
      if (Math.hypot(dx, dz) > 100 && (first || (cinematic && !reduced))) {
        const crossAngle = Math.atan2(-dz, dx) + .12;
        let turn = Math.atan2(Math.sin(crossAngle - cameraAngle), Math.cos(crossAngle - cameraAngle));
        if (turn > Math.PI / 2) turn -= Math.PI; else if (turn < -Math.PI / 2) turn += Math.PI;
        cameraAngle += first ? turn : Math.max(-delta * .7, Math.min(delta * .7, turn * (1 - Math.exp(-delta * 3))));
      }
      backward.set(Math.sin(cameraAngle), .39, Math.cos(cameraAngle)).normalize();
      right.crossVectors(worldUp, backward).normalize(); up.crossVectors(backward, right).normalize();
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
      let distance = 6.5;
      for (const x of [extent.min.x, extent.max.x]) for (const y of [extent.min.y, extent.max.y]) for (const z of [extent.min.z, extent.max.z]) { offset.set(x, y, z).sub(aim); distance = Math.max(distance, Math.abs(offset.dot(right)) / (tanH * .82) + offset.dot(backward), Math.abs(offset.dot(up)) / (tanV * .70) + offset.dot(backward)); }
      const goal = aim.clone().addScaledVector(backward, distance + .35); camera.position.lerp(goal, first ? 1 : 1 - Math.exp(-delta * 6)); camera.lookAt(aim); first = false;
      renderer.render(scene, camera); drawMs = performance.now() - begin;
    },
    resize(w: number, h: number, dpr: number) { width = Math.max(1, w); height = Math.max(1, h); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(1.5, dpr)); renderer.setSize(width, height, false); first = true; },
    reset,
    stats() { return { dents: toys.reduce((n, t) => n + t.dents, 0), scorches: toys.reduce((n, t) => n + t.scorches, 0), vertices: toys.reduce((n, t) => n + t.changedVertices, 0), gripError: Math.max(...toys.map(t => t.gripError)), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, drawMs, crowd: stage!.crowdState().playing }; },
    dispose() { disposed = true; clearDebris(); toys.forEach(t => t.dispose()); stage!.dispose(); [g, flashG, shieldG, fieldG].forEach(x => x.dispose()); [mat, flashM, shieldM, fieldM].forEach(x => x.dispose()); environment.dispose(); renderer.dispose(); },
  };
}
export type FightSceneV6 = Awaited<ReturnType<typeof createFightSceneV6>>;
