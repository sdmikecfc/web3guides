import * as THREE from "three";
import { createLabSet } from "./staging";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createClayRobot, type ClayRobot } from "./robot";
import { COMBAT_RENDER_SCALE, FLAME, createFightV4, type BuildV4, type EventV4, type Side, type StateV4 } from "./engine";

export interface LabScene {
  builds(a: BuildV4, b: BuildV4): Promise<void>;
  render(state: StateV4, time: number, showroom: boolean, cinematic: boolean, reduced: boolean): void;
  reset(): void; damage(kind: "hammer" | "projectile" | "blade"): number; inspectDamage(enabled: boolean): void;
  resize(width: number, height: number): void; dispose(): void;
  metrics(): { drawCalls: number; triangles: number; geometries: number; dents: number };
}
interface Burst { point: THREE.Vector3; start: number; colour: THREE.Color; kind: EventV4["kind"] }
export async function createLabScene(canvas: HTMLCanvasElement, onEvent: (event: EventV4) => void): Promise<LabScene> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x211810); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x211810);
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 60), target = new THREE.Vector3(0, 1.20, 0);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), env = pmrem.fromScene(room, .03); scene.environment = env.texture; scene.environmentIntensity = .36; room.dispose(); pmrem.dispose();
  const ambient = new THREE.HemisphereLight(0xffefcf, 0x56504a, 1.1); scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffddb0, 4.1); key.position.set(-3.5, 8, -3.8); key.castShadow = true;
  key.target.position.set(0, 1.8, 0); scene.add(key.target);
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -7; key.shadow.camera.right = key.shadow.camera.top = 7; key.shadow.camera.far = 25; key.shadow.normalBias = .025; key.shadow.bias = -.0002; key.shadow.radius = 5; scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff3e2, 2.0); fill.position.set(1.5, 4.5, 7); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffce91, 1.9); rim.position.set(4, 5, -2); scene.add(rim);
  const set = await createLabSet(scene);
  const particleGeometry = new THREE.BufferGeometry(), particlePositions = new Float32Array(96 * 3), particleColours = new Float32Array(96 * 3);
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3)); particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColours, 3));
  const particleMat = new THREE.PointsMaterial({ size: .065, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
  const particles = new THREE.Points(particleGeometry, particleMat); particles.frustumCulled = false; scene.add(particles);
  const bulletGeo = new THREE.SphereGeometry(.052, 8, 6), bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe6ab });
  const bullets = new THREE.InstancedMesh(bulletGeo, bulletMat, 24); bullets.frustumCulled = false; scene.add(bullets);
  const tracerGeo = new THREE.CylinderGeometry(.013, .013, 1, 6), tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd98e, transparent: true, opacity: .82, depthWrite: false });
  const tracers = new THREE.InstancedMesh(tracerGeo, tracerMat, 12); tracers.frustumCulled = false; scene.add(tracers);
  const flameGeo = new THREE.IcosahedronGeometry(1, 0), flameMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .82, depthWrite: false });
  const flames = new THREE.InstancedMesh(flameGeo, flameMat, 128); flames.frustumCulled = false; scene.add(flames);
  flames.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(128 * 3), 3);
  const flashes = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.20, 0), new THREE.MeshBasicMaterial({ color: 0xffefaf, transparent: true, opacity: .9, depthWrite: false })); scene.add(m); return m; });
  let shots: { event: EventV4; muzzle: THREE.Vector3 }[] = [];
  const indicatorGeo = new THREE.TorusGeometry(.23, .015, 6, 24), indicatorMat = new THREE.MeshBasicMaterial({ color: 0xb2e9dd });
  const indicators = [0, 1].map(() => { const m = new THREE.Mesh(indicatorGeo, indicatorMat); scene.add(m); return m; });
  let robots: [ClayRobot, ClayRobot] | null = null, generation = 0, dead = false, eventIndex = 0, lastFrame = 0, latest: StateV4 | null = null;
  let burst: Burst[] = [], cameraHit = -100, cameraSide: Side = 0, damageIndex = 0, width = 1000, height = 600, inspectClay = false, shadowTick = -1;
  let fightAngle = .12, cameraTime = 0;
  const dummy = new THREE.Object3D();
  function reset() { robots?.forEach(r => r.reset()); eventIndex = 0; lastFrame = 0; burst = []; shots = []; cameraHit = -100; damageIndex = 0; inspectClay = false; shadowTick = -1; }
  const api: LabScene = {
    async builds(a, b) {
      const epoch = ++generation; const results = await Promise.allSettled([createClayRobot(a), createClayRobot(b)]);
      if (dead || epoch !== generation || results.some(r => r.status === "rejected")) {
        results.forEach(r => { if (r.status === "fulfilled") r.value.dispose(); });
        const failed = results.find(r => r.status === "rejected"); if (failed?.status === "rejected") throw failed.reason; return;
      }
      robots?.forEach(r => r.dispose()); robots = results.map(r => (r as PromiseFulfilledResult<ClayRobot>).value) as [ClayRobot, ClayRobot];
      robots.forEach(r => scene.add(r.root)); latest = createFightV4(1, a, b); reset();
      api.render(latest, 0, true, false, false); await renderer.compileAsync(scene, camera);
    },
    reset,
    inspectDamage(enabled) { inspectClay = enabled; shadowTick = -1; },
    damage(kind) {
      if (!robots || !latest) return 0;
      inspectClay = true;
      shadowTick = -1;
      const points = [[-.23, .7, .5], [.21, .40, .5], [0, .57, .5]];
      const e: EventV4 = { id: damageIndex, frame: 0, kind: "hit", who: 1, target: 0, slot: "torso", weapon: kind === "projectile" ? "rifle" : kind === "blade" ? "baton" : "hammer", point: points[damageIndex++ % 3].map(x => x * 1000) as [number, number, number], normal: [0, 0, 1000], damage: 15 };
      const point = robots[0].impact(e); burst.push({ point, start: -1, colour: new THREE.Color(0xe0ad73), kind: "hit" });
      return robots[0].dents;
    },
    render(state, time, showroom, cinematic, reduced) {
      if (!robots || dead) return;
      latest = state; if (state.frame < lastFrame) reset(); lastFrame = state.frame;
      const poseTick = Math.floor((showroom ? time : state.frame / 60) * 20), shadowDirty = !showroom || poseTick !== shadowTick;
      robots.forEach((r, i) => {
        if (showroom && i === 1) { r.root.visible = false; return; }
        r.pose(state.fighters[i], state, i as Side, time, showroom);
        r.root.visible = !showroom || i === 0;
        r.meshes.weapon.forEach(m => { m.visible = !(showroom && inspectClay); });
        if (showroom && inspectClay) {
          r.bones.armL.rotation.set(.05, 0, -.24); r.bones.elbowL.rotation.set(0, 0, 0);
          r.bones.armR.rotation.set(.05, 0, .24); r.bones.elbowR.rotation.set(0, 0, 0); r.bones.handR.rotation.set(0, 0, 0);
        }
        if (showroom && i === 0) { r.root.position.x = 0; r.root.rotation.y = -.12; r.root.updateMatrixWorld(true); }
      });
      set.update(showroom, width, height, robots.map(r => r.root), !reduced);
      ambient.intensity = showroom ? 1.1 : .65; fill.intensity = showroom ? 1.8 : 1.3;
      if (!showroom) while (eventIndex < state.events.length) {
        const e = state.events[eventIndex++];
        if (e.kind === "shot") shots.push({ event: e, muzzle: robots[e.who].tip() });
        if (e.kind === "hit" || e.kind === "block") {
          const point = robots[e.target].impact(e);
          burst.push({ point, start: state.frame / 60, colour: new THREE.Color(e.kind === "block" ? 0xe6d49a : e.weapon === "baton" ? 0x9ef1de : 0xc9996d), kind: e.kind });
          if (e.weapon === "hammer") { cameraHit = time; cameraSide = e.target; }
        }
        if (e.kind === "break" && e.slot) robots[e.who].detach(e.slot, scene, state.frame);
        if (e.kind === "knockdown" || e.kind === "ko") { cameraHit = time; cameraSide = e.target; }
        onEvent(e);
      }
      robots.forEach(r => r.debris(state.frame));
      const fxTime = showroom ? time : state.frame / 60;
      burst.forEach(b => { if (b.start === -1) b.start = fxTime; }); burst = burst.filter(b => fxTime - b.start < .6);
      let index = 0;
      for (const b of burst.slice(-6)) for (let n = 0; n < 14 && index < 96; n++, index++) {
        const age = fxTime - b.start, angle = n * 2.399, speed = .8 + (n % 3) * .4;
        particlePositions[index * 3] = b.point.x + Math.cos(angle) * age * speed;
        particlePositions[index * 3 + 1] = b.point.y + Math.sin(angle) * age * speed + age * .5 - age * age * 2;
        particlePositions[index * 3 + 2] = b.point.z + (n % 2 ? 1 : -1) * age * .55;
        particleColours.set([b.colour.r * (1 - age), b.colour.g * (1 - age), b.colour.b * (1 - age)], index * 3);
      }
      particleGeometry.setDrawRange(0, index); (particleGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true; (particleGeometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
      bullets.count = Math.min(24, showroom ? 0 : state.projectiles.length);
      state.projectiles.slice(0, 24).forEach((p, i) => { dummy.position.set(p.x / 1000 * COMBAT_RENDER_SCALE, 1.5 * COMBAT_RENDER_SCALE, p.z / 1000 * COMBAT_RENDER_SCALE); dummy.scale.set(1, 1, 2.6); dummy.rotation.y = Math.atan2(p.vx, p.vz); dummy.updateMatrix(); bullets.setMatrixAt(i, dummy.matrix); }); bullets.instanceMatrix.needsUpdate = true;
      shots = shots.filter(shot => state.frame - shot.event.frame < 14);
      // End a trail when its simulation projectile makes contact or expires.
      // Muzzle flashes live separately, including shots that hit in this step.
      const flyingShots = shots.filter(shot => state.projectiles.some(p => p.id === shot.event.id)).slice(-12);
      tracers.count = showroom ? 0 : flyingShots.length;
      const axis = new THREE.Vector3(0, 1, 0);
      flyingShots.forEach((shot, i) => {
        const projectile = state.projectiles.find(p => p.id === shot.event.id)!;
        const endpoint = new THREE.Vector3(projectile.x, 1500, projectile.z).multiplyScalar(COMBAT_RENDER_SCALE / 1000);
        const travel = endpoint.distanceTo(shot.muzzle), dir = endpoint.sub(shot.muzzle).normalize(), length = Math.min(1.5, travel);
        dummy.position.copy(shot.muzzle).addScaledVector(dir, travel - length / 2); dummy.quaternion.setFromUnitVectors(axis, dir); dummy.scale.set(1, length, 1); dummy.updateMatrix(); tracers.setMatrixAt(i, dummy.matrix);
      }); tracers.instanceMatrix.needsUpdate = true;
      flashes.forEach((flash, i) => {
        const recent = shots.findLast(shot => shot.event.who === i && state.frame - shot.event.frame < 6);
        flash.visible = !showroom && !!recent;
        if (recent) { flash.position.copy(recent.muzzle); flash.scale.setScalar(1 - (state.frame - recent.event.frame) / 7); }
      });
      let flameCount = 0;
      robots.forEach((robot, i) => {
        const f = state.fighters[i], action = f.action, age = action ? state.frame - action.started - action.windup : -1;
        const firing = !showroom && action?.kind === "flamethrower" && action.released && age >= 0 && age < FLAME.duration && f.armour[3] > 0;
        if (firing) {
          const muzzle = robot.tip(), forward = robot.bones.weapon.getWorldDirection(new THREE.Vector3()), right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
          const rival = state.fighters[1 - i];
          const toRival = new THREE.Vector3(rival.x, 0, rival.z).multiplyScalar(COMBAT_RENDER_SCALE / 1000).sub(muzzle); toRival.y = 0;
          const horizontal = forward.clone().setY(0).normalize(), along = toRival.dot(horizontal);
          const across = toRival.clone().addScaledVector(horizontal, -along).length();
          const jetLength = along > 0 && across < .6 * COMBAT_RENDER_SCALE ? Math.max(.08, Math.min(1.6 * COMBAT_RENDER_SCALE, along - .32 * COMBAT_RENDER_SCALE)) : 1.6 * COMBAT_RENDER_SCALE;
          for (let j = 0; j < 40; j++) {
            const progress = ((j / 40 + state.frame * .065) % 1), spread = .035 + progress * Math.min(.32, jetLength * .24), angle = j * 2.399;
            dummy.position.copy(muzzle).addScaledVector(forward, progress * jetLength).addScaledVector(right, Math.cos(angle) * spread);
            dummy.position.y += Math.sin(angle) * spread + progress * .1;
            dummy.rotation.set(j, state.frame * .1, 0); dummy.scale.setScalar((.065 + progress * .15) * COMBAT_RENDER_SCALE); dummy.updateMatrix(); flames.setMatrixAt(flameCount, dummy.matrix);
            flames.setColorAt(flameCount++, new THREE.Color().setHSL(.13 - progress * .11, 1, .60 - progress * .29));
          }
        }
        if (!showroom && f.burnUntil > state.frame) for (let j = 0; j < 20; j++) {
          const rise = (state.frame * .023 + j / 20) % 1, angle = j * 2.399;
          dummy.position.copy(robot.root.position).add(new THREE.Vector3(Math.cos(angle) * .39, .8 + rise * 1.2, Math.sin(angle) * .37).multiplyScalar(COMBAT_RENDER_SCALE));
          dummy.rotation.set(0, j, 0); dummy.scale.setScalar(.13 * (1 - rise)); dummy.updateMatrix(); flames.setMatrixAt(flameCount, dummy.matrix); flames.setColorAt(flameCount++, new THREE.Color(0xff6b16));
        }
      });
      flames.count = flameCount; flames.instanceMatrix.needsUpdate = true; if (flames.instanceColor) flames.instanceColor.needsUpdate = true;
      indicators.forEach((m, i) => {
        const f = state.fighters[i]; m.visible = !showroom && (f.stunnedUntil > state.frame || f.immuneUntil > state.frame);
        m.position.set(f.x / 1000 * COMBAT_RENDER_SCALE, (f.downUntil > state.frame ? 1.25 : 3.2) * COMBAT_RENDER_SCALE, f.z / 1000 * COMBAT_RENDER_SCALE); m.rotation.set(Math.PI / 2, time * 2, 0); m.scale.setScalar(f.stunnedUntil > state.frame ? 1 : .6);
      });
      const aspect = width / height, isPhone = aspect < 1;
      const hit = cinematic && !reduced ? Math.max(0, 1 - (time - cameraHit) / .85) : 0;
      if (showroom) {
        fightAngle = .12;
        const angle = cinematic && !reduced ? Math.sin(time * .17) * .45 + .18 : .30;
        const radius = inspectClay ? (isPhone ? 3.5 : 3.0) : isPhone ? 8.1 : 7.9;
        const focus = 0;
        camera.position.set(focus + Math.sin(angle) * radius, inspectClay ? 2.05 : 3.4, Math.cos(angle) * radius); target.set(focus, inspectClay ? 1.67 : 1.40, inspectClay ? .3 : 0);
      } else {
        const midpoint = new THREE.Vector3((state.fighters[0].x + state.fighters[1].x) / 2000 * COMBAT_RENDER_SCALE, 1.15, (state.fighters[0].z + state.fighters[1].z) / 2000 * COMBAT_RENDER_SCALE);
        const spread = Math.hypot(state.fighters[0].x - state.fighters[1].x, state.fighters[0].z - state.fighters[1].z) / 1000 * COMBAT_RENDER_SCALE;
        const radius = (isPhone ? 16 : 12.6) + Math.max(0, spread - 3) * .65;
        let desired = Math.atan2(-(state.fighters[1].z - state.fighters[0].z), state.fighters[1].x - state.fighters[0].x);
        if (Math.cos(desired) < 0) desired += desired < 0 ? Math.PI : -Math.PI;
        desired = THREE.MathUtils.clamp(desired, -1.05, 1.05);
        fightAngle += (desired - fightAngle) * (1 - Math.exp(-Math.min(.05, Math.max(0, time - cameraTime)) * 2));
        const angle = cinematic && !reduced ? fightAngle : .12;
        target.copy(midpoint); camera.position.set(midpoint.x * .30 + Math.sin(angle) * radius, 5.4 - hit * .4, midpoint.z * .3 + Math.cos(angle) * radius - hit * .5);
        if (hit > 0) target.x += (state.fighters[cameraSide].x / 1000 * COMBAT_RENDER_SCALE - midpoint.x) * .14 * hit;
      }
      cameraTime = time;
      camera.lookAt(target); renderer.shadowMap.needsUpdate = shadowDirty; shadowTick = poseTick; renderer.render(scene, camera);
      canvas.dataset.drawCalls = String(renderer.info.render.calls); canvas.dataset.triangles = String(renderer.info.render.triangles); canvas.dataset.dents = String(robots[0].dents + robots[1].dents); canvas.dataset.frame = String(state.frame);
      const crowd = set.crowdState(); canvas.dataset.crowdMotion = crowd.playing ? "playing" : crowd.failed ? "unavailable" : "still"; canvas.dataset.crowdTime = crowd.time.toFixed(2);
    },
    resize(w, h) { if (w <= 0 || h <= 0 || dead) return; width = w; height = h; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 650 ? 1.25 : 1.6)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < .8 ? 43 : 35; camera.updateProjectionMatrix(); },
    metrics() { return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, dents: robots ? robots[0].dents + robots[1].dents : 0 }; },
    dispose() {
      dead = true; generation++; robots?.forEach(r => r.dispose()); set.dispose();
      particleGeometry.dispose(); particleMat.dispose(); bulletGeo.dispose(); bulletMat.dispose(); indicatorGeo.dispose(); indicatorMat.dispose(); env.texture.dispose(); env.dispose(); renderer.dispose();
      tracerGeo.dispose(); tracerMat.dispose(); flameGeo.dispose(); flameMat.dispose(); flashes.forEach(f => { f.geometry.dispose(); (f.material as THREE.Material).dispose(); f.removeFromParent(); });
    },
  };
  return api;
}
