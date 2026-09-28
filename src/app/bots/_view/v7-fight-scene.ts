"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { fighterPoseV7 } from "@/lib/bots/v7/pose";
import type { BuildV7, EventV7, StateV7 } from "@/lib/bots/v7/types";
import { createLabSet } from "../lab/staging";
import { createToyV7, type ToyV7 } from "./v7-toy";
import { createEffectsV7 } from "./v7-effects";

export interface PresentationV7 { mode: "fight" | "turntable" | "weapon-demo"; focusSide?: 0 | 1; orbit?: boolean }
/** Explicit art-review inputs. No game route supplies these overrides. */
export interface VisualReviewV7 {
  modelUrls?: [string | undefined, string | undefined];
  canonicalFraming?: boolean;
  effects?: boolean;
  stillCrowd?: boolean;
  inspectionAngle?: number;
}
const point = (p: readonly number[]) => new THREE.Vector3(p[0] / 1000, p[1] / 1000, p[2] / 1000);
interface Debris { object: THREE.Object3D; event: EventV7; origin: THREE.Vector3; rotation: THREE.Quaternion; velocity: THREE.Vector3; axis: THREE.Vector3 }

function travelSampleV7(f: StateV7["fighters"][number], frame: number, ago: number) {
  const target = frame - ago, trail = f.motionTrail;
  if (!trail.length) return { x: f.x, z: f.z };
  if (target <= trail[0].frame) return trail[0];
  for (let i = 0; i < trail.length; i++) {
    const a = trail[i], b = trail[i + 1] ?? { frame, x: f.x, z: f.z };
    if (target <= b.frame) { const t = Math.min(1, Math.max(0, (target - a.frame) / Math.max(1, b.frame - a.frame))); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }
  }
  return { x: f.x, z: f.z };
}

/** A ringside operator follows the exchange without crossing to its other side.
 * The short recording-based average is independent of render rate and seek order. */
export function exchangeCameraV7(state: StateV7, aspect: number, moving: boolean) {
  let x = 0, z = 0, weight = 0;
  for (let i = 0; i < 5; i++) {
    const w = 5 - i, a = travelSampleV7(state.fighters[0], state.frame, i * 6), b = travelSampleV7(state.fighters[1], state.frame, i * 6);
    x += (a.x + b.x) * .5 * w; z += (a.z + b.z) * .5 * w; weight += w;
  }
  x /= weight * 1000; z /= weight * 1000;
  const portrait = aspect < .85;
  // This small truck correction responds to real lateral travel, not the angle
  // between fighters. Circling and passing one another cannot whip the camera.
  const truck = moving ? Math.max(-.08, Math.min(.08, x / 80 - z / 160)) : 0;
  return { x, z, angle: (portrait ? .76 : .16) + truck, elevation: portrait ? .68 : .35, fov: 37 };
}

/** New rig + deterministic director. Older fights keep their original renderer. */
export async function createFightSceneV7(canvas: HTMLCanvasElement, builds: [BuildV7, BuildV7], initial: Partial<PresentationV7> = {}, review: VisualReviewV7 = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .93;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(37, 1, .1, 100);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), environment = pmrem.fromScene(room, .055);
  room.dispose(); pmrem.dispose(); scene.environment = environment.texture; scene.environmentIntensity = .62;
  const ambient = new THREE.HemisphereLight(0xffead6, 0x263443, 1.1); scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffe4bf, 3.35); key.position.set(-3.5, 7, 5); key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .5, far: 22 }); key.shadow.camera.updateProjectionMatrix();
  key.shadow.mapSize.set(2048, 2048); key.shadow.normalBias = .016; key.shadow.bias = -.00008; key.shadow.radius = 3; scene.add(key);
  const rim = new THREE.DirectionalLight(0x9dcdff, 2.45); rim.position.set(3, 4.5, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffcc89, .85); fill.position.set(5, 2.5, 3); scene.add(fill);
  let toys: ToyV7[] = [], framingToys: ToyV7[] = [], stage: Awaited<ReturnType<typeof createLabSet>> | undefined;
  let effects: ReturnType<typeof createEffectsV7> | undefined;
  let disposed = false;
  function release() {
    key.shadow.dispose(); scene.background = null; scene.environment = null; scene.clear(); environment.dispose(); renderer.dispose();
    if (!canvas.isConnected) renderer.forceContextLoss();
  }
  try {
    const settled = await Promise.allSettled(builds.map((build, i) => createToyV7(build, review.modelUrls?.[i])));
    toys = settled.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
    const failure = settled.find(r => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (failure) throw failure.reason;
    if (review.canonicalFraming) {
      const frames = await Promise.allSettled(builds.map(build => createToyV7(build)));
      framingToys = frames.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
      const failedFrame = frames.find(r => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (failedFrame) throw failedFrame.reason;
    }
    stage = await createLabSet(scene, 6.75, true); toys.forEach(t => scene.add(t.root));
    effects = createEffectsV7(scene, toys);
  } catch (error) { toys.forEach(t => t.dispose()); framingToys.forEach(t => t.dispose()); stage?.dispose(); release(); throw error; }
  // Keep the existing miniature arena, while giving its surface a less washed-out finish.
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    // The original animated audience reaches down behind the ring. An opaque
    // floor outside the ring would cover its lower rows as the camera moves.
    if (o.geometry instanceof THREE.PlaneGeometry && o.geometry.parameters.width === 100) { o.visible = false; return; }
    if (!(o.geometry instanceof THREE.CylinderGeometry)) return;
    const p = o.geometry.parameters;
    if (p.radiusTop > 5 && p.height < .1) { const m = o.material as THREE.MeshStandardMaterial; m.color.setHex(0xc9b59a); m.roughness = .83; }
    // The director can travel beyond the old fixed-camera backdrop. Surround
    // that complete travel volume so retreating near a rail cannot expose a void.
    if (p.radiusTop === 10.8 && p.openEnded) { o.scale.set(2.8, 4, 2.8); o.position.y = 4.8; }
  });
  const anchors = [new THREE.Group(), new THREE.Group()];
  const bounds = new THREE.Box3(), partBounds = new THREE.Box3(), debrisBounds = new THREE.Box3();
  const aim = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), backward = new THREE.Vector3(), offset = new THREE.Vector3(), worldUp = new THREE.Vector3(0, 1, 0);
  const debris: Debris[] = [], broken = [new Set<string>(), new Set<string>()];
  let presentation: PresentationV7 = { mode: "fight", focusSide: 0, orbit: true, ...initial };
  let width = 1000, height = 650, cursor = 0, previousFrame = -1, drawMs = 0, displayFrame = 0;
  const sampled = [fighterPoseV7 as unknown, fighterPoseV7 as unknown];
  function clearDebris() { debris.forEach(d => d.object.removeFromParent()); debris.length = 0; broken.forEach(s => s.clear()); }
  function reset() { if (disposed) return; cursor = 0; previousFrame = -1; clearDebris(); toys.forEach(t => t.reset()); effects!.reset(); }
  function addDebris(e: EventV7) {
    if (!e.slot || broken[e.who].has(e.slot)) return;
    broken[e.who].add(e.slot);
    const object = toys[e.who].detach(e.slot, e.detachPose); if (!object) return;
    scene.add(object);
    const origin = object.position.clone(), rotation = object.quaternion.clone();
    const velocity = e.impulse ? point(e.impulse) : new THREE.Vector3(e.who ? .9 : -.9, 1.8, .4);
    if (velocity.length() < .5) velocity.multiplyScalar(1.5).add(new THREE.Vector3(e.who ? .8 : -.8, 1.4, .25));
    velocity.y = Math.max(1.1, Math.min(2.8, velocity.y)); velocity.clampLength(.5, 3.5);
    const axis = new THREE.Vector3(Math.sin(e.id * 2.7), .35, Math.cos(e.id * 1.3)).normalize();
    debris.push({ object, event: e, origin, rotation, velocity, axis });
  }
  function render(state: StateV7, _wallTime: number, cinematic: boolean, reduced: boolean, shownFrame = state.frame) {
    if (disposed) return;
    const start = performance.now(); displayFrame = shownFrame;
    if (state.frame < previousFrame) reset(); previousFrame = state.frame;
    const showroom = presentation.mode === "turntable", focus = presentation.focusSide ?? 0;
    toys.forEach((toy, i) => {
      const sample = fighterPoseV7(state, i as 0 | 1, shownFrame); sampled[i] = sample;
      toy.root.position.set(0, 0, 0); toy.pose(state.fighters[i], sample, shownFrame, reduced);
      toy.root.visible = !showroom || focus === i;
      if (showroom) toy.root.position.set(-state.fighters[i].x / 1000, 0, -state.fighters[i].z / 1000);
      toy.root.updateMatrixWorld(true);
      const framing = framingToys[i];
      if (framing) {
        framing.pose(state.fighters[i], sample, shownFrame, reduced);
        framing.root.visible = toy.root.visible;
        framing.root.position.copy(toy.root.position);
        framing.root.updateMatrixWorld(true);
      }
      anchors[i].position.set(showroom ? 0 : state.fighters[i].x / 1000, 0, showroom ? 0 : state.fighters[i].z / 1000);
    });
    while (cursor < state.events.length) {
      const e = state.events[cursor++];
      if (e.kind === "hit" || e.kind === "burn" || e.kind === "block") toys[e.target].impact(e);
      if (e.kind === "break") addDebris(e);
    }
    for (const d of debris) {
      d.object.visible = !showroom;
      const age = Math.max(0, (shownFrame - d.event.frame) / 60);
      const flight = (d.velocity.y + Math.sqrt(d.velocity.y ** 2 + 19.6 * Math.max(.05, d.origin.y - .15))) / 9.8;
      const travel = Math.min(age, flight) + Math.min(.28, Math.max(0, age - flight)) * .3;
      d.object.position.copy(d.origin).addScaledVector(d.velocity, travel);
      d.object.position.y = age <= flight ? d.origin.y + d.velocity.y * age - 4.9 * age * age : .15 + Math.abs(Math.sin(Math.min(.6, age - flight) * 10)) * .16 * Math.max(0, 1 - (age - flight) / .6);
      d.object.quaternion.copy(d.rotation).multiply(new THREE.Quaternion().setFromAxisAngle(d.axis, reduced ? .45 : Math.min(flight + .25, age) * 4.2));
      d.object.updateMatrixWorld(true); debrisBounds.setFromObject(d.object);
      if (debrisBounds.min.y < .014) d.object.position.y += .014 - debrisBounds.min.y;
    }
    stage!.update(showroom, width, height, anchors, !review.stillCrowd && !reduced && !state.done);
    effects!.setVisible(review.effects !== false);
    if (review.effects !== false) effects!.render(state, shownFrame, reduced, showroom ? (focus === 0 ? 1 : 0) : -1);
    bounds.makeEmpty();
    (framingToys.length ? framingToys : toys).forEach(t => {
      if (!t.root.visible) return;
      t.root.traverseVisible(o => {
        if (!(o instanceof THREE.Mesh)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        partBounds.copy(o.geometry.boundingBox!).applyMatrix4(o.matrixWorld); bounds.union(partBounds);
      });
    });
    if (bounds.isEmpty()) bounds.setFromCenterAndSize(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(4, 3, 3));
    bounds.getCenter(aim);
    const exchange = exchangeCameraV7(state, camera.aspect, cinematic && !reduced);
    const angle = showroom ? state.fighters[focus].yaw / 1000 + .30 + (review.inspectionAngle ?? 0) + (presentation.orbit && !reduced ? shownFrame / 60 * .28 : 0) : exchange.angle;
    const elevation = showroom ? .23 : exchange.elevation, fov = showroom ? 32 : exchange.fov;
    if (!showroom) {
      aim.set(exchange.x, 1.4, exchange.z);
      // Keep room for the next guard, duck or counter rather than tightening on
      // every retracted arm. Actual mesh bounds still win for wide weapons.
      state.fighters.forEach(f => {
        bounds.expandByPoint(offset.set(f.x / 1000 - .9, 0, f.z / 1000 - .9));
        bounds.expandByPoint(offset.set(f.x / 1000 + .9, 2.9, f.z / 1000 + .9));
      });
    }
    camera.fov = fov; camera.updateProjectionMatrix();
    backward.set(Math.sin(angle), elevation, Math.cos(angle)).normalize(); right.crossVectors(worldUp, backward).normalize(); up.crossVectors(backward, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2)), tanH = tanV * camera.aspect;
    let distance = showroom ? 4.7 : 5.8;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      offset.set(x, y, z).sub(aim);
      distance = Math.max(distance, Math.abs(offset.dot(right)) / (tanH * .83) + offset.dot(backward), Math.abs(offset.dot(up)) / (tanV * .80) + offset.dot(backward));
    }
    camera.position.copy(aim).addScaledVector(backward, distance + .28); camera.lookAt(aim);
    renderer.render(scene, camera); drawMs = performance.now() - start;
  }
  return {
    render, reset,
    setPresentation(next: Partial<PresentationV7>) { presentation = { ...presentation, ...next }; },
    setReview(next: Pick<VisualReviewV7, "effects" | "stillCrowd" | "inspectionAngle">) { review = { ...review, ...next }; },
    resize(w: number, h: number, dpr: number) {
      if (disposed) return; width = Math.max(1, w); height = Math.max(1, h); camera.aspect = width / height; camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(width < 600 ? 1.35 : 1.25, dpr)); renderer.setSize(width, height, false);
      const size = width < 700 ? 1024 : 2048;
      if (key.shadow.mapSize.x !== size) { key.shadow.mapSize.set(size, size); key.shadow.map?.dispose(); key.shadow.map = null; key.shadow.needsUpdate = true; }
    },
    stats() { return { dents: toys.reduce((n, t) => n + t.dents, 0), scorches: toys.reduce((n, t) => n + t.scorches, 0), vertices: toys.reduce((n, t) => n + t.changedVertices, 0), gripError: Math.max(...toys.map(t => t.gripError)), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, drawMs, crowd: stage!.crowdState().playing, displayFrame }; },
    inspect() { return { camera: { position: camera.position.toArray(), target: aim.toArray(), fov: camera.fov }, poses: sampled, actors: toys.map(t => t.inspect()), damage: toys.map(t => ({ dents: t.dents, vertices: t.changedVertices })), textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }; },
    dispose() { if (disposed) return; disposed = true; clearDebris(); effects!.dispose(); toys.forEach(t => t.dispose()); framingToys.forEach(t => t.dispose()); scene.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); }); stage!.dispose(); release(); },
  };
}
export type FightSceneV7 = Awaited<ReturnType<typeof createFightSceneV7>>;
