"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createCombatToy, type CombatToy } from "./combat-toy";
import { createCombatDamage, type CombatDamage } from "./combat-damage";
import { createWeaponContactSolver } from "./weapon-surface";
import { createLabSet } from "../lab/staging";
import type { StyleEquipment } from "./style-equipment";
import type { CombatBuild } from "@/lib/bots/combat-model";
import type { Socket } from "@/lib/bots/fixtures";
import type { BotLook } from "./look";

type Side = 0 | 1;
export interface StyleVisualEvent {
  id: number; frame: number; kind: string; who: Side; target: Side; slot?: Socket; damage?: number; weapon?: string;
  point?: [number, number, number]; normal?: [number, number, number]; mount?: string; critical?: boolean;
}
export interface StyleVisualFighter {
  x: number; z: number; yaw: number; armour: number[]; moveX: number; moveZ: number;
  action: { kind: string; started: number; windup: number; recovery: number; released: boolean; mount?: string; special?: string } | null;
  stunnedUntil: number; downUntil: number; dodgeUntil: number;
  special: { active: boolean; kind: string; endsAt: number; shield: number; finisher: boolean };
}
export interface StyleVisualState {
  frame: number; done: boolean; winner: Side | null; fighters: [StyleVisualFighter, StyleVisualFighter];
  events: StyleVisualEvent[]; projectiles: { id: number; who: Side; x: number; z: number; vx: number; vz: number; mount?: string }[];
}
export interface StyleFightScene {
  builds(a: CombatBuild, b: CombatBuild, looks: [BotLook, BotLook]): Promise<void>;
  render(state: StyleVisualState, wallTime: number, cinematic: boolean, reduced: boolean): void;
  resize(w: number, h: number, dpr: number): void;
  reset(): void;
  stats(): { dents: number; vertices: number; drawCalls: number; triangles: number; drawMs: number; crowd: boolean };
  dispose(): void;
}
const SLOTS: Socket[] = ["head", "torso", "armL", "armR", "legL", "legR"];
const POS = .88 / 1000, TOY_SCALE = .62;
const arms = ["armL", "armR", "elbowL", "elbowR", "wristL", "wristR"];
const legs = ["legL", "legR", "kneeL", "kneeR", "ankleL", "ankleR"];
const clamp = (n: number) => THREE.MathUtils.clamp(n, 0, 1);
const ease = (n: number) => { const u = clamp(n); return u * u * (3 - 2 * u); };
type StyledToy = CombatToy & { styleEquipment?: StyleEquipment };

/** One arena and two real saved toy assemblies. The renderer never changes combat state. */
export async function createStyleFightScene(canvas: HTMLCanvasElement): Promise<StyleFightScene> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, .1, 70);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture; scene.environmentIntensity = .3; pmrem.dispose(); room.dispose();
  const ambient = new THREE.HemisphereLight(0xffe9c5, 0x44372e, .9); scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffd9a1, 4.0); key.position.set(-4, 8, -3); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -6.5, right: 6.5, top: 6.5, bottom: -6.5, near: .5, far: 25 });
  key.shadow.camera.updateProjectionMatrix(); key.shadow.bias = -.0002; key.shadow.normalBias = .025; key.shadow.radius = 3; scene.add(key);
  const face = new THREE.DirectionalLight(0xfff0da, 1.8); face.position.set(1, 4, 7); scene.add(face);
  const rim = new THREE.DirectionalLight(0xfcc278, 1.5); rim.position.set(4, 5, -4); scene.add(rim);
  const set = await createLabSet(scene);
  const ownedG = new Set<THREE.BufferGeometry>(), ownedM = new Set<THREE.Material>();
  function effect(g: THREE.BufferGeometry, color: number, opacity: number) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); ownedG.add(g); ownedM.add(m); scene.add(mesh); return mesh;
  }
  const shield = [0, 1].map(() => effect(new THREE.SphereGeometry(1, 28, 18), 0x99e5db, .20));
  const shieldRims = [0, 1].map(() => effect(new THREE.TorusGeometry(1, .025, 6, 48), 0xc7ffee, .8));
  const fields = [0, 1].map(() => effect(new THREE.TorusGeometry(1, .03, 6, 64), 0x8fb9ff, .8));
  fields.forEach(m => { m.rotation.x = -Math.PI / 2; });
  const wakes = [0, 1].map(() => effect(new THREE.TorusGeometry(.48, .025, 6, 24, Math.PI * 1.4), 0xf6c879, .8));
  wakes.forEach(m => { m.rotation.x = -Math.PI / 2; });
  const flashes = Array.from({ length: 4 }, () => effect(new THREE.IcosahedronGeometry(.15, 0), 0xffe4a7, .9));
  const tracerG = new THREE.CylinderGeometry(.014, .014, 1, 6), tracerM = new THREE.MeshBasicMaterial({ color: 0xffd998 });
  ownedG.add(tracerG); ownedM.add(tracerM); const tracers = new THREE.InstancedMesh(tracerG, tracerM, 64); tracers.frustumCulled = false; scene.add(tracers);
  const sparkG = new THREE.IcosahedronGeometry(.027, 0), sparkM = new THREE.MeshBasicMaterial({ color: 0xffd59b });
  ownedG.add(sparkG); ownedM.add(sparkM); const sparks = new THREE.InstancedMesh(sparkG, sparkM, 160); sparks.frustumCulled = false; scene.add(sparks);
  const dummy = new THREE.Object3D(), temp = new THREE.Vector3(), goal = new THREE.Vector3(), target = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), parentQ = new THREE.Quaternion(), rootQ = new THREE.Quaternion();
  const contact = createWeaponContactSolver();
  let toys: StyledToy[] = [], damage: CombatDamage[] = [], disposed = false, generation = 0, eventCursor = 0, lastFrame = -1;
  let width = 1000, height = 650, drawMs = 0, emphasisAt = -100, emphasisSide: Side = 0;
  const impacts: { frame: number; point: THREE.Vector3; strong: boolean }[] = [];
  const shots: { frame: number; side: Side; mount: number; point: THREE.Vector3 }[] = [];
  const debris: { mesh: THREE.Group; frame: number; origin: THREE.Vector3; quaternion: THREE.Quaternion; side: Side; floor?: number }[] = [];
  const broken = [new Set<Socket>(), new Set<Socket>()];
  function clearDebris() { for (const d of debris) { d.mesh.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); d.mesh.removeFromParent(); } debris.length = 0; }
  function reset() { eventCursor = 0; lastFrame = -1; impacts.length = shots.length = 0; emphasisAt = -100; broken.forEach(s => s.clear()); clearDebris(); damage.forEach(d => d.reset()); }
  function muzzle(toy: StyledToy, mount: number) { return toy.styleEquipment ? toy.styleEquipment.muzzles[mount].getWorldPosition(new THREE.Vector3()) : toy.tip(new THREE.Vector3()); }
  function pose(st: StyleVisualState, time: number) {
    const stepped = Math.floor(st.frame / 3) * 3, t = stepped / 60;
    toys.forEach((toy, side) => {
      const f = st.fighters[side], a = f.action, moving = Math.hypot(f.moveX, f.moveZ) > 0;
      toy.resetPose(); toy.root.scale.setScalar(TOY_SCALE); toy.root.position.set(f.x * POS, .015, f.z * POS); toy.root.rotation.set(0, f.yaw / 1000, 0);
      toy.applyClip("guard", 0, 1, arms);
      const missingLegs = Number(f.armour[4] <= 0) + Number(f.armour[5] <= 0);
      if (moving && !st.done && missingLegs === 0) toy.applyClip("advance", (t * 2.3) % 1, 1, legs);
      if (a) {
        const age = stepped - a.started, prep = clamp(age / Math.max(1, a.windup));
        const finish = clamp((age - a.windup) / Math.max(1, a.recovery));
        const u = !a.released ? .48 * (prep < .6 ? prep * .38 : .23 + .77 * ease((prep - .6) / .4)) : .5 + .5 * finish;
        const rifle = a.kind === "rifle" || a.kind === "smg" || a.kind.includes("uzi") || a.kind.includes("pistol") || a.kind.includes("burst");
        if (rifle) toy.styleEquipment?.poseAim();
        else {
          const clip = a.special === "charge" ? "braced-thrust" : a.kind === "hammer" ? "overhead" : a.kind === "shove" ? "punch" : "diagonal-cut";
          toy.applyClip(clip, u, 1, arms, a.mount === "left" || a.mount === "L");
          toy.bones.torso.rotation.y += Math.sin(u * Math.PI) * (clip === "diagonal-cut" ? .18 : .05);
          if (a.kind === "hammer" && !a.special && !a.released && missingLegs === 0) toy.root.position.y += Math.sin(prep * Math.PI) * .32;
          if (a.special === "charge") toy.bones.torso.rotation.x += .18 * prep;
        }
      }
      const burst = f.special.active && f.special.finisher && /slow|ranged/.test(f.special.kind);
      toy.styleEquipment?.setBurst(burst); if (burst) toy.styleEquipment?.poseAim();
      toy.styleEquipment?.setBlade(a?.special === "flank", a?.mount === "left" ? "L" : "R");
      if (f.dodgeUntil > st.frame && missingLegs === 0) {
        toy.root.position.y += .10; toy.bones.torso.rotation.x = .27;
        toy.bones.armL.rotation.z -= .15; toy.bones.armR.rotation.z += .15;
      }
      if (f.stunnedUntil > st.frame) { toy.bones.head.rotation.z = Math.sin(t * 22) * .12; toy.bones.torso.rotation.x = -.12; }
      const fallen = f.downUntil > st.frame || st.done && st.winner !== side;
      if (fallen) { toy.root.rotation.x = -1.3; toy.root.position.y = .85; toy.applyClip("knockout", .8, 1, arms); }
      else if (missingLegs === 2) { toy.root.position.y -= .65; toy.root.rotation.x = .12; }
      else if (missingLegs === 1) toy.root.rotation.z = f.armour[4] <= 0 ? -.13 : .13;
      for (let i = 0; i < 6; i++) toy.setVisible(SLOTS[i], f.armour[i] > 0 || i === 1);
      toy.setVisible("weapon", f.armour[3] > 0 || /paired|dual/.test(toy.styleEquipment?.weaponKind ?? "") && f.armour[2] > 0);
      toy.root.updateMatrixWorld(true);
      if (toy.blender && !fallen && missingLegs < 2) {
        let floor = Infinity;
        for (const s of ["L", "R"] as const) {
          if (f.armour[s === "L" ? 4 : 5] <= 0) continue;
          const ankle = toy.bones["ankle" + s]; if (!ankle) continue;
          if (toy.movement[s === "L" ? 0 : 1] !== "wheel") { ankle.parent!.getWorldQuaternion(parentQ); toy.root.getWorldQuaternion(rootQ); ankle.quaternion.copy(parentQ.invert().multiply(rootQ)); }
          toy.root.updateMatrixWorld(true); floor = Math.min(floor, temp.set(0, -.16, 0).applyMatrix4(ankle.matrixWorld).y);
        }
        if (Number.isFinite(floor)) toy.root.position.y += .02 - floor;
        if (a?.kind === "hammer" && !a.special && !a.released && missingLegs === 0) toy.root.position.y += Math.sin(clamp((stepped - a.started) / a.windup) * Math.PI) * .35;
      }
      toy.root.updateMatrixWorld(true);
      const recent = st.events.slice(-16).findLast(e => e.who === side && (e.kind === "hit" || e.kind === "block") && e.frame <= st.frame && st.frame - e.frame <= 3 && e.weapon !== "rifle" && !/smg|pistol|uzi|burst/.test(e.weapon ?? ""));
      if (recent && recent.slot && recent.mount !== "left" && !a?.special && f.armour[3] > 0 && !fallen) {
        toys[recent.target].target(recent.slot, goal); contact(toy, goal, 1 - (st.frame - recent.frame) / 4, false);
      }
      shield[side].visible = f.special.active && /shield|tank/.test(f.special.kind) && f.special.shield > 0;
      shield[side].position.copy(toy.root.position).add(new THREE.Vector3(0, 1.22, 0)); shield[side].scale.set(1.05, 1.44, .99);
      shieldRims[side].visible = shield[side].visible; shieldRims[side].position.copy(shield[side].position); shieldRims[side].quaternion.copy(camera.quaternion); shieldRims[side].scale.set(1.08, 1.46, 1);
      fields[side].visible = f.special.active && /slow|ranged/.test(f.special.kind); fields[side].position.copy(toy.root.position); fields[side].position.y = .035; fields[side].scale.setScalar(1.45 + Math.sin(time * 5) * .04);
      wakes[side].visible = f.special.active && /overdrive|speed/.test(f.special.kind); wakes[side].position.copy(toy.root.position); wakes[side].position.y = .04; wakes[side].rotation.z = -f.yaw / 1000;
    });
  }
  const api: StyleFightScene = {
    async builds(a, b, looks) {
      const epoch = ++generation, results = await Promise.allSettled([createCombatToy(a, looks[0]), createCombatToy(b, looks[1])]);
      if (disposed || epoch !== generation || results.some(r => r.status === "rejected")) { results.forEach(r => { if (r.status === "fulfilled") r.value.dispose(); }); if (results.some(r => r.status === "rejected")) throw new Error("The robot models could not load."); return; }
      reset(); damage.forEach(d => d.dispose()); toys.forEach(t => t.dispose());
      toys = results.map(r => (r as PromiseFulfilledResult<StyledToy>).value); damage = toys.map(t => createCombatDamage(t)); toys.forEach(t => scene.add(t.root));
      await renderer.compileAsync(scene, camera);
    },
    reset,
    resize(w, h, dpr) { width = Math.max(1, w); height = Math.max(1, h); renderer.setPixelRatio(Math.min(dpr, width < 600 ? 1.3 : 1.5)); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); },
    render(st, wallTime, cinematic, reduced) {
      if (disposed || toys.length !== 2) return;
      const started = performance.now(); if (st.frame < lastFrame) reset(); lastFrame = st.frame; pose(st, wallTime);
      while (eventCursor < st.events.length) {
        const e = st.events[eventCursor++];
        if (e.kind === "hit" || e.kind === "block") {
          const kind = e.weapon === "rifle" || e.weapon === "smg" || /pistol|uzi|burst/.test(e.weapon ?? "") ? "projectile" : /blade|backstab/.test(e.weapon ?? "") ? "blade" : "blunt";
          const hit = e.slot && damage[e.target].hit({ frame: e.frame, slot: e.slot, amount: e.damage ?? 0, point: e.point, normal: e.normal, kind, critical: e.critical });
          const point = hit ? hit.point : toys[e.target].target(e.slot ?? "torso", new THREE.Vector3());
          const strong = e.weapon === "hammer" || !!e.critical; impacts.push({ frame: e.frame, point: point.clone(), strong });
          if (strong) { emphasisAt = wallTime; emphasisSide = e.target; }
        }
        if (e.kind === "shot") { const mount = e.mount === "L" || e.mount === "left" ? 0 : 1; shots.push({ frame: e.frame, side: e.who, mount, point: muzzle(toys[e.who], mount) }); }
        if (e.kind === "break" && e.slot && !broken[e.who].has(e.slot)) {
          broken[e.who].add(e.slot); toys[e.who].setVisible(e.slot, true); if (e.slot === "armR") toys[e.who].setVisible("weapon", true);
          const mesh = toys[e.who].freezePart(e.slot); scene.add(mesh); toys[e.who].setVisible(e.slot, false);
          debris.push({ mesh, frame: e.frame, origin: mesh.position.clone(), quaternion: mesh.quaternion.clone(), side: e.who }); emphasisAt = wallTime; emphasisSide = e.who;
        }
      }
      while (impacts.length && st.frame - impacts[0].frame > 45) impacts.shift(); while (shots.length && st.frame - shots[0].frame > 8) shots.shift();
      let count = 0;
      for (const p of st.projectiles.slice(0, 64)) { dummy.position.set(p.x * POS, 1.13, p.z * POS); temp.set(p.vx, 0, p.vz).normalize(); dummy.quaternion.setFromUnitVectors(up, temp); dummy.scale.set(1, .35, 1); dummy.updateMatrix(); tracers.setMatrixAt(count++, dummy.matrix); }
      tracers.count = count; tracers.instanceMatrix.needsUpdate = true;
      flashes.forEach((m, i) => { const shot = shots.findLast(s => s.side === Math.floor(i / 2) && s.mount === i % 2); m.visible = !!shot; if (shot) { m.position.copy(shot.point); m.scale.setScalar(1 - (st.frame - shot.frame) / 9); m.rotation.z = st.frame; } });
      count = 0;
      for (const p of impacts.slice(-8)) for (let i = 0; i < 15 && count < 160; i++) { const age = (st.frame - p.frame) / 60, angle = i * 2.399; dummy.position.copy(p.point).add(temp.set(Math.cos(angle) * age * 1.5, Math.sin(angle) * age * 1.3 + age * .7 - age * age * 2, (i % 3 - 1) * age)); dummy.scale.setScalar((p.strong ? 1.5 : 1) * Math.max(0, 1 - age / .7)); dummy.updateMatrix(); sparks.setMatrixAt(count++, dummy.matrix); }
      sparks.count = count; sparks.instanceMatrix.needsUpdate = true;
      for (const d of debris) {
        const age = Math.max(0, (st.frame - d.frame) / 60), flight = Math.min(.62, age), sign = d.side ? 1 : -1;
        d.mesh.position.copy(d.origin); d.mesh.position.x += sign * flight * 1.05; d.mesh.position.z += flight * .7;
        d.mesh.position.y = Math.max(.14, d.origin.y * (1 - flight / .62) + Math.sin(flight / .62 * Math.PI) * .55);
        d.mesh.quaternion.copy(d.quaternion); d.mesh.rotateZ(flight * sign * 3.7); d.mesh.rotateX(flight * 2);
        if (age >= .62) { if (d.floor === undefined) { d.mesh.updateMatrixWorld(true); d.floor = d.mesh.position.y + .025 - new THREE.Box3().setFromObject(d.mesh).min.y; } d.mesh.position.y = d.floor; }
      }
      const span = Math.abs(toys[0].root.position.x - toys[1].root.position.x) + 3.4;
      const z = Math.max(11.8, span / (2 * Math.tan(THREE.MathUtils.degToRad(38 / 2)) * camera.aspect));
      const movingCamera = cinematic && !reduced, impact = movingCamera ? Math.max(0, 1 - (wallTime - emphasisAt) / .48) : 0;
      const orbit = movingCamera ? Math.sin(wallTime * .16) * .12 : 0;
      target.set((toys[0].root.position.x + toys[1].root.position.x) * .23, 1.0, (toys[0].root.position.z + toys[1].root.position.z) * .15);
      if (impact) target.x += (toys[emphasisSide].root.position.x - target.x) * impact * .16;
      camera.position.set(Math.sin(orbit) * z + target.x, 5.4 + z * .10, Math.cos(orbit) * z - impact * .34); camera.lookAt(target);
      set.update(false, width, height, toys.map(t => t.root), !reduced);
      renderer.render(scene, camera); drawMs = performance.now() - started;
    },
    stats() { return { dents: damage.reduce((n, d) => n + d.dents, 0), vertices: damage.reduce((n, d) => n + d.changedVertices, 0), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, drawMs, crowd: set.crowdState().playing }; },
    dispose() { if (disposed) return; disposed = true; generation++; clearDebris(); damage.forEach(d => d.dispose()); toys.forEach(t => t.dispose()); ownedG.forEach(g => g.dispose()); ownedM.forEach(m => m.dispose()); set.dispose(); environment.dispose(); renderer.dispose(); scene.clear(); },
  };
  return api;
}
