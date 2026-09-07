import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createClayRobot, type ClayRobot } from "./robot";
import { createFightV4, type BuildV4, type EventV4, type Side, type StateV4 } from "./engine";

export interface LabScene {
  builds(a: BuildV4, b: BuildV4): Promise<void>;
  render(state: StateV4, time: number, showroom: boolean, cinematic: boolean, reduced: boolean): void;
  reset(): void; damage(kind: "hammer" | "projectile" | "blade"): number;
  resize(width: number, height: number): void; dispose(): void;
  metrics(): { drawCalls: number; triangles: number; geometries: number; dents: number };
}
interface Burst { point: THREE.Vector3; start: number; colour: THREE.Color; kind: EventV4["kind"] }
export async function createLabScene(canvas: HTMLCanvasElement, onEvent: (event: EventV4) => void): Promise<LabScene> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x182320); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.13;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x182320); scene.fog = new THREE.Fog(0x182320, 17, 34);
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 60), target = new THREE.Vector3(0, 1.20, 0);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), env = pmrem.fromScene(room, .03); scene.environment = env.texture; room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xe9e6c5, 0x29372f, 2.1));
  const key = new THREE.DirectionalLight(0xffdb9d, 4.1); key.position.set(-4, 8, 5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -7; key.shadow.camera.right = key.shadow.camera.top = 7; key.shadow.camera.far = 25; key.shadow.normalBias = .035; key.shadow.bias = -.0002; scene.add(key);
  const rim = new THREE.DirectionalLight(0x84c8b8, 2.2); rim.position.set(3, 5, -6); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffb077, .7); fill.position.set(6, 3, 4); scene.add(fill);
  const ownedGeometry = new Set<THREE.BufferGeometry>(), ownedMaterial = new Set<THREE.Material>();
  function material(colour: number, roughness = .82, metalness = 0) { const m = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness }); ownedMaterial.add(m); return m; }
  function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.receiveShadow = true; ownedGeometry.add(g); scene.add(o); return o; }
  const floor = mesh(new THREE.CylinderGeometry(5.7, 5.85, .25, 72), material(0x697362), 0, -.16); floor.castShadow = true;
  const rimFloor = mesh(new THREE.TorusGeometry(5.46, .028, 8, 96), material(0xe0bc77), 0, -.015); rimFloor.rotation.x = -Math.PI / 2;
  const centre = mesh(new THREE.RingGeometry(1.0, 1.02, 64), material(0x9a9f81), 0, -.027); centre.rotation.x = -Math.PI / 2;
  const surround = mesh(new THREE.PlaneGeometry(70, 70), material(0x19231e), 0, -.30); surround.rotation.x = -Math.PI / 2;
  const panelMat = material(0x283a31), metal = material(0x536050, .5, .35), gold = material(0xae8850, .49, .45);
  for (let i = 0; i < 12; i++) {
    if (i < 4 || i > 8) continue;
    const a = i / 12 * Math.PI * 2, x = Math.sin(a) * 7.6, z = Math.cos(a) * 7.6;
    const panel = mesh(new THREE.BoxGeometry(3.0, 2.6, .18), panelMat, x, 1, z); panel.rotation.y = a;
    mesh(new THREE.CylinderGeometry(.075, .075, 3.5, 8), metal, x, 1.4, z);
    const lamp = mesh(new THREE.BoxGeometry(.36, .1, .34), gold, x, 3.2, z); lamp.rotation.y = a;
  }
  // A real floor inscription stays in the miniature set as the camera moves.
  const sign = document.createElement("canvas"); sign.width = 1024; sign.height = 256;
  const ctx = sign.getContext("2d")!; ctx.clearRect(0, 0, 1024, 256); ctx.textAlign = "center";
  ctx.fillStyle = "#c8c4a3"; ctx.font = "900 120px Arial"; ctx.fillText("MODEL KOMBAT", 512, 144); ctx.font = "24px Arial"; ctx.fillText("D O M A   /   C O M B A T   L A B", 512, 200);
  const signTex = new THREE.CanvasTexture(sign); signTex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, opacity: .34, depthWrite: false }); ownedMaterial.add(signMat);
  const signMesh = mesh(new THREE.PlaneGeometry(4.7, 1.175), signMat, 0, -.022, 3.25); signMesh.rotation.x = -Math.PI / 2;
  const particleGeometry = new THREE.BufferGeometry(), particlePositions = new Float32Array(96 * 3), particleColours = new Float32Array(96 * 3);
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3)); particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColours, 3));
  const particleMat = new THREE.PointsMaterial({ size: .065, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
  const particles = new THREE.Points(particleGeometry, particleMat); particles.frustumCulled = false; scene.add(particles);
  const bulletGeo = new THREE.SphereGeometry(.052, 8, 6), bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe6ab });
  const bullets = new THREE.InstancedMesh(bulletGeo, bulletMat, 24); bullets.frustumCulled = false; scene.add(bullets);
  const indicatorGeo = new THREE.TorusGeometry(.23, .015, 6, 24), indicatorMat = new THREE.MeshBasicMaterial({ color: 0xb2e9dd });
  const indicators = [0, 1].map(() => { const m = new THREE.Mesh(indicatorGeo, indicatorMat); scene.add(m); return m; });
  let robots: [ClayRobot, ClayRobot] | null = null, generation = 0, dead = false, eventIndex = 0, lastFrame = 0, latest: StateV4 | null = null;
  let burst: Burst[] = [], cameraHit = -100, cameraSide: Side = 0, damageIndex = 0, width = 1000, height = 600, inspectClay = false;
  const dummy = new THREE.Object3D();
  function reset() { robots?.forEach(r => r.reset()); eventIndex = 0; lastFrame = 0; burst = []; cameraHit = -100; damageIndex = 0; inspectClay = false; }
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
    damage(kind) {
      if (!robots || !latest) return 0;
      inspectClay = true;
      const points = [[-.23, .7, .5], [.21, .40, .5], [0, .57, .5]];
      const e: EventV4 = { id: damageIndex, frame: 0, kind: "hit", who: 1, target: 0, slot: "torso", weapon: kind === "projectile" ? "rifle" : kind === "blade" ? "baton" : "hammer", point: points[damageIndex++ % 3].map(x => x * 1000) as [number, number, number], normal: [0, 0, 1000], damage: 15 };
      const point = robots[0].impact(e); burst.push({ point, start: -1, colour: new THREE.Color(0xe0ad73), kind: "hit" });
      return robots[0].dents;
    },
    render(state, time, showroom, cinematic, reduced) {
      if (!robots || dead) return;
      latest = state; if (state.frame < lastFrame) reset(); lastFrame = state.frame;
      robots.forEach((r, i) => r.pose(state.fighters[i], state, i as Side, time, showroom));
      if (!showroom) while (eventIndex < state.events.length) {
        const e = state.events[eventIndex++];
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
      state.projectiles.slice(0, 24).forEach((p, i) => { dummy.position.set(p.x / 1000, 1.73, p.z / 1000); dummy.scale.set(1, 1, 2.6); dummy.rotation.y = Math.atan2(p.vx, p.vz); dummy.updateMatrix(); bullets.setMatrixAt(i, dummy.matrix); }); bullets.instanceMatrix.needsUpdate = true;
      indicators.forEach((m, i) => {
        const f = state.fighters[i]; m.visible = !showroom && (f.stunnedUntil > state.frame || f.immuneUntil > state.frame);
        m.position.set(f.x / 1000, f.downUntil > state.frame ? 1.25 : 3.2, f.z / 1000); m.rotation.set(Math.PI / 2, time * 2, 0); m.scale.setScalar(f.stunnedUntil > state.frame ? 1 : .6);
      });
      const aspect = width / height, isPhone = aspect < 1;
      const hit = cinematic && !reduced ? Math.max(0, 1 - (time - cameraHit) / .85) : 0;
      if (showroom) {
        const angle = cinematic && !reduced ? Math.sin(time * .17) * .72 : .12;
        const radius = inspectClay ? (isPhone ? 10 : 7) : isPhone ? 14.6 : 11.5;
        const focus = inspectClay ? -1.6 : 0;
        camera.position.set(focus + Math.sin(angle) * radius, inspectClay ? 3.5 : 5.0, Math.cos(angle) * radius); target.set(focus, 1.35, 0);
      } else {
        const midpoint = new THREE.Vector3((state.fighters[0].x + state.fighters[1].x) / 2000, 1.25, (state.fighters[0].z + state.fighters[1].z) / 2000);
        const spread = Math.hypot(state.fighters[0].x - state.fighters[1].x, state.fighters[0].z - state.fighters[1].z) / 1000;
        const radius = (isPhone ? 16 : 12.6) + Math.max(0, spread - 3) * .65;
        const angle = cinematic && !reduced ? Math.sin(time * .14) * .4 : .12;
        target.copy(midpoint); camera.position.set(midpoint.x * .30 + Math.sin(angle) * radius, 5.4 - hit * .4, midpoint.z * .3 + Math.cos(angle) * radius - hit * .5);
        if (hit > 0) target.x += (state.fighters[cameraSide].x / 1000 - midpoint.x) * .14 * hit;
      }
      camera.lookAt(target); renderer.render(scene, camera);
      canvas.dataset.drawCalls = String(renderer.info.render.calls); canvas.dataset.triangles = String(renderer.info.render.triangles); canvas.dataset.dents = String(robots[0].dents + robots[1].dents); canvas.dataset.frame = String(state.frame);
    },
    resize(w, h) { if (w <= 0 || h <= 0 || dead) return; width = w; height = h; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 650 ? 1.25 : 1.6)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < .8 ? 43 : 35; camera.updateProjectionMatrix(); },
    metrics() { return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, dents: robots ? robots[0].dents + robots[1].dents : 0 }; },
    dispose() {
      dead = true; generation++; robots?.forEach(r => r.dispose()); ownedGeometry.forEach(g => g.dispose()); ownedMaterial.forEach(m => m.dispose());
      particleGeometry.dispose(); particleMat.dispose(); bulletGeo.dispose(); bulletMat.dispose(); indicatorGeo.dispose(); indicatorMat.dispose(); signTex.dispose(); env.texture.dispose(); env.dispose(); renderer.dispose();
    },
  };
  return api;
}
