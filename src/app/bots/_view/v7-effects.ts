import * as THREE from "three";
import type { EventV7, StateV7 } from "@/lib/bots/v7/types";
import type { ToyV7 } from "./v7-toy";

const UP = new THREE.Vector3(0, 1, 0), FORWARD = new THREE.Vector3(0, 0, 1);
const COLORS = { tank: 0xffba52, speed: 0x45ebff, ranged: 0xba86ff };
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const from = (v: readonly number[]) => new THREE.Vector3(v[0] / 1000, v[1] / 1000, v[2] / 1000);

/** Bounded event effects. No particles, camera choices or ghosts determine a hit. */
export function createEffectsV7(scene: THREE.Scene, toys: ToyV7[]) {
  const root = new THREE.Group(); root.name = "remaster_effects"; scene.add(root);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const mat = <T extends THREE.Material>(m: T) => { materials.push(m); return m; };
  const dummy = new THREE.Object3D(), color = new THREE.Color(), point = new THREE.Vector3(), direction = new THREE.Vector3(), tangent = new THREE.Vector3(), bitangent = new THREE.Vector3();
  const flecks = new THREE.InstancedMesh(geo(new THREE.IcosahedronGeometry(.025, 0)), mat(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), 224);
  const tracers = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(.015, .028, 1, 5)), mat(new THREE.MeshBasicMaterial({ color: 0xffebc8, toneMapped: false })), 80);
  const flares = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(1, 8, 6)), mat(new THREE.MeshBasicMaterial({ color: 0xffe7b1, toneMapped: false, transparent: true, opacity: .8, depthWrite: false })), 48);
  const contacts = new THREE.InstancedMesh(geo(new THREE.TorusGeometry(1, .025, 4, 24)), mat(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: .65, depthWrite: false })), 24);
  [flecks, tracers, flares, contacts].forEach(o => { o.count = 0; o.frustumCulled = false; root.add(o); });
  const shieldGeometry = geo(new THREE.SphereGeometry(1, 36, 24));
  const shields = toys.map(() => {
    const m = mat(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, strength: { value: 1 }, impact: { value: 0 }, impactPoint: { value: new THREE.Vector3() } },
      vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vW; varying vec2 vUv;
        void main(){ vUv=uv; vec4 p=modelViewMatrix*vec4(position,1.); vP=p.xyz; vN=normalize(normalMatrix*normal); vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*p; }`,
      fragmentShader: `uniform float time; uniform float strength; uniform float impact; uniform vec3 impactPoint;
        varying vec3 vN; varying vec3 vP; varying vec3 vW; varying vec2 vUv;
        void main(){ float rim=pow(1.-abs(dot(normalize(vN),normalize(-vP))),2.6);
          vec2 cell=vec2(vUv.x*18.,vUv.y*12.); cell.x+=mod(floor(cell.y),2.)*.5;
          vec2 edge=abs(fract(cell)-.5); float grid=smoothstep(.455,.49,max(edge.x,edge.y));
          float pulse=exp(-pow((length(vW-impactPoint)-impact*2.8)*7.,2.))*step(.001,impact)*(1.-impact);
          vec3 c=mix(vec3(1.,.50,.12),vec3(1.,.92,.68),pulse);
          float a=(rim*.5+grid*.1+.025+pulse*.6)*(.35+.65*strength); gl_FragColor=vec4(c,a); }`,
    }));
    const mesh = new THREE.Mesh(shieldGeometry, m); mesh.visible = false; root.add(mesh); return mesh;
  });
  const fieldGeometry = geo(new THREE.TorusGeometry(1, .014, 6, 96));
  const fields = toys.map(() => {
    const group = new THREE.Group(); root.add(group);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(fieldGeometry, mat(new THREE.MeshBasicMaterial({ color: COLORS.ranged, transparent: true, opacity: .3, depthWrite: false, toneMapped: false })));
      ring.rotation.x = -Math.PI / 2; group.add(ring);
    }
    return group;
  });
  const trailGeometry = () => {
    const g = geo(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12 * 2 * 3), 3));
    g.setAttribute("age", new THREE.BufferAttribute(new Float32Array(12 * 2), 1));
    const indices: number[] = []; for (let i = 0; i < 11; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(indices); g.setDrawRange(0, 0); return g;
  };
  const trailMaterials = toys.map(() => mat(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color(COLORS.speed) }, strength: { value: .48 } },
    vertexShader: `attribute float age; varying float a; void main(){a=age;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 tint; uniform float strength; varying float a; void main(){gl_FragColor=vec4(tint,a*strength);}`,
  })));
  const trails = toys.map((_, side) => [0, 1].map(() => { const m = new THREE.Mesh(trailGeometry(), trailMaterials[side]); m.frustumCulled = false; root.add(m); return m; }));
  const ghostMaterials = toys.map(() => [0, 1].map((_, i) => mat(new THREE.MeshBasicMaterial({ color: COLORS.speed, transparent: true, opacity: i ? .045 : .095, depthWrite: false, blending: THREE.AdditiveBlending }))));
  const ghosts: (THREE.Group | null)[][] = toys.map(() => [null, null]);
  const arcs = new THREE.LineSegments(geo(new THREE.BufferGeometry()), mat(new THREE.LineBasicMaterial({ color: 0x84e8ff, transparent: true, opacity: .85, toneMapped: false })));
  arcs.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(96 * 6), 3)); arcs.frustumCulled = false; root.add(arcs);
  let disposed = false;
  function clearGhosts() { ghosts.forEach(pair => pair.forEach(g => g?.removeFromParent())); ghosts.forEach(pair => pair.fill(null)); }

  function render(state: StateV7, frame: number, reduced: boolean, hiddenSide = -1) {
    if (disposed) return;
    let sparks = 0, flashes = 0, bolts = 0, rings = 0, arcVertices = 0;
    const arcPositions = arcs.geometry.getAttribute("position") as THREE.BufferAttribute;
    const recent = state.events.filter(e => frame - e.frame >= 0 && frame - e.frame < 54);
    for (const e of recent) {
      if (e.who === hiddenSide || e.target === hiddenSide) continue;
      const age = (frame - e.frame) / 60;
      if (e.kind !== "hit" && e.kind !== "block" && e.kind !== "shot" && e.kind !== "land" && e.kind !== "break") continue;
      const anchor = e.worldPoint ?? e.origin; if (!anchor) continue;
      const isShot = e.kind === "shot", isGround = e.kind === "land", isBlock = e.kind === "block", parry = isBlock && e.defence === "parry";
      const heavy = e.weapon === "hammer" || e.weapon === "shoulder_cannon" || e.kind === "break", blunt = ["hammer", "shove", "punch", "kick"].includes(e.weapon ?? "");
      const origin = from(anchor), normal = new THREE.Vector3(...(e.worldNormal ?? e.direction ?? [0, 1, 0])).normalize();
      tangent.crossVectors(normal, UP); if (tangent.lengthSq() < .01) tangent.set(1, 0, 0); tangent.normalize(); bitangent.crossVectors(normal, tangent).normalize();
      if (age < .055 && !isGround && !reduced && flashes < 48) {
        dummy.position.copy(origin); dummy.scale.setScalar((isShot ? .13 : heavy ? .15 : .065) * (1 - age / .065));
        dummy.quaternion.identity(); dummy.updateMatrix(); flares.setMatrixAt(flashes, dummy.matrix);
        flares.setColorAt(flashes++, color.setHex(parry ? 0xccefff : 0xffe7b1));
      }
      // A short local compression ring marks a real blunt impact or guard.
      // Missed attacks and attempted dodges never receive a contact cue.
      if (!reduced && !isShot && !isGround && age < .16 && rings < 24 && (isBlock || blunt || e.critical)) {
        const t = age / .16, radius = (isBlock ? .08 : .12) + t * (heavy ? .26 : .16);
        dummy.position.copy(origin).addScaledVector(normal, .012); dummy.quaternion.setFromUnitVectors(FORWARD, normal); dummy.scale.setScalar(radius * (1 - t * .3)); dummy.updateMatrix();
        contacts.setMatrixAt(rings, dummy.matrix); contacts.setColorAt(rings++, color.setHex(parry ? 0xb9e8f5 : isBlock ? COLORS.tank : 0xd7b895));
      }
      const count = reduced ? 2 : isGround ? 3 : parry ? 12 : heavy ? 15 : isShot ? 4 : blunt ? 5 : 8;
      for (let k = 0; k < count && sparks < 224; k++) {
        const seed = e.id * 43 + k, life = reduced ? .1 : isGround ? .12 + hash(seed + 1) * .12 : (heavy ? .18 : .10) + hash(seed + 1) * .18;
        if (age > life) continue;
        direction.copy(normal).multiplyScalar(isBlock ? .35 : .6).addScaledVector(tangent, (hash(seed) - .5) * (parry ? 3.2 : 1.8)).addScaledVector(bitangent, (hash(seed + 2) - .2) * 1.2).normalize();
        const speed = isGround ? .45 : (parry ? 2.3 : heavy ? 2 : 1.4) * (.5 + hash(seed + 4));
        dummy.position.copy(origin).addScaledVector(direction, age * speed); dummy.position.y = Math.max(.025, dummy.position.y - age * age * 3.6);
        const fade = 1 - age / life;
        const chunk = blunt && !isBlock;
        dummy.scale.set(isGround ? 2 * fade : chunk ? 1.4 * fade : .55 * fade, isGround ? .6 * fade : chunk ? 1.1 * fade : .4 * fade, chunk ? 1.3 * fade : 3.5 * fade);
        dummy.quaternion.setFromUnitVectors(FORWARD, direction); dummy.updateMatrix(); flecks.setMatrixAt(sparks, dummy.matrix);
        color.setHex(isGround ? 0xa98b64 : parry ? 0xb9e8f5 : e.weapon === "shock_blade" ? 0x6ddcff : chunk || k % 3 === 0 ? 0xb49a80 : 0xffcd79);
        flecks.setColorAt(sparks++, color);
      }
      if (e.weapon === "shock_blade" && age < .22 && !reduced) {
        for (let k = 0; k < 5 && arcVertices + 2 <= 192; k++) {
          point.copy(origin).add(new THREE.Vector3((hash(e.id + k) - .5) * .7, hash(e.id + 21 + k) * .5, (hash(e.id + k + 11) - .5) * .6));
          arcPositions.setXYZ(arcVertices++, origin.x, origin.y, origin.z); arcPositions.setXYZ(arcVertices++, point.x, point.y, point.z);
        }
      }
    }
    for (const p of state.projectiles.slice(-80)) {
      if (p.who === hiddenSide) continue;
      direction.set(p.vx, p.vy, p.vz).normalize();
      dummy.position.set(p.x / 1000, p.y / 1000, p.z / 1000); dummy.quaternion.setFromUnitVectors(UP, direction);
      dummy.scale.set(p.weapon === "shoulder_cannon" ? 2 : 1, Math.min(.65, Math.hypot(p.vx, p.vy, p.vz) / 900), p.weapon === "shoulder_cannon" ? 2 : 1);
      dummy.updateMatrix(); tracers.setMatrixAt(bolts++, dummy.matrix);
    }
    flecks.count = sparks; flares.count = flashes; tracers.count = bolts; contacts.count = rings;
    [flecks, flares, tracers, contacts].forEach(m => { m.instanceMatrix.needsUpdate = true; });
    [flecks, flares, contacts].forEach(m => { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    arcs.geometry.setDrawRange(0, arcVertices); arcPositions.needsUpdate = true;
    state.fighters.forEach((f, side) => {
      const active = side !== hiddenSide && !!f.special && frame <= f.special.until;
      const shield = shields[side]; shield.visible = active && f.special!.style === "tank";
      shield.position.set(f.x / 1000, 1.38, f.z / 1000); shield.scale.set(1.06, 1.48, .94);
      const uniforms = (shield.material as THREE.ShaderMaterial).uniforms;
      uniforms.time.value = frame / 60; uniforms.strength.value = Math.max(0, (f.special?.shieldLeft ?? 0) / Math.max(1, state.stats[side].armour[1] * .35));
      const shieldHit = [...recent].reverse().find(e => e.target === side && (e.absorbed ?? 0) > 0 && e.worldPoint);
      uniforms.impact.value = shieldHit ? Math.min(1, (frame - shieldHit.frame) / 30) : 0;
      if (shieldHit?.worldPoint) uniforms.impactPoint.value.copy(from(shieldHit.worldPoint));
      const field = fields[side]; field.visible = active && f.special!.style === "ranged";
      // The effect surrounds the affected opponent, making the slowed target clear.
      const rival = state.fighters[side === 0 ? 1 : 0]; field.position.set(rival.x / 1000, .07, rival.z / 1000);
      field.children.forEach((child, i) => { const phase = reduced ? i / 3 : ((frame - (f.special?.started ?? frame)) / 75 + i / 3) % 1; child.scale.setScalar(.7 + phase * 1.3); child.position.y = reduced ? 0 : Math.sin(phase * Math.PI) * .14; ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - phase) * .48; });
      const speed = active && f.special!.style === "speed";
      const evading = !!f.defence && (f.defence.kind === "roll" || f.defence.kind === "backstep") && frame >= f.defence.started && frame < f.defence.until;
      const history = f.motionTrail.filter(p => frame - p.frame <= (speed ? 44 : 16)).slice(-12);
      let travelled = 0; for (let i = 1; i < history.length; i++) travelled += Math.hypot(history[i].x - history[i - 1].x, history[i].z - history[i - 1].z);
      const movingTrail = side !== hiddenSide && !reduced && (speed || evading) && travelled > (speed ? 80 : 110);
      trailMaterials[side].uniforms.tint.value.setHex(speed ? COLORS.speed : 0xd6c3a1);
      trailMaterials[side].uniforms.strength.value = speed ? .4 : .16;
      for (let lane = 0; lane < 2; lane++) {
        const trail = trails[side][lane]; trail.visible = movingTrail;
        const positions = trail.geometry.getAttribute("position") as THREE.BufferAttribute, ages = trail.geometry.getAttribute("age") as THREE.BufferAttribute;
        history.forEach((p, i) => {
          const prev = history[Math.max(0, i - 1)], next = history[Math.min(history.length - 1, i + 1)];
          direction.set(next.x - prev.x, 0, next.z - prev.z).normalize();
          const width = .025 + .10 * i / Math.max(1, history.length - 1), offset = lane ? .29 : -.29;
          for (let j = 0; j < 2; j++) { const spread = offset + (j ? width : -width); positions.setXYZ(i * 2 + j, p.x / 1000 + direction.z * spread, .08 + (lane ? .04 : 0), p.z / 1000 - direction.x * spread); ages.setX(i * 2 + j, i / Math.max(1, history.length - 1)); }
        });
        trail.geometry.setDrawRange(0, Math.max(0, history.length - 1) * 6); positions.needsUpdate = true; ages.needsUpdate = true;
      }
      if (speed && movingTrail && Math.hypot(f.moveX, f.moveZ) > 5) {
        // Reuse meshes and sample the displayed pose directly: seeking a frame
        // must not inherit whichever silhouette a previous render happened to cache.
        ghosts[side] = ghostMaterials[side].map((m, i) => {
          const g = toys[side].silhouette(m, ghosts[side][i] ?? undefined);
          if (!g.parent) root.add(g); return g;
        });
        ghosts[side].forEach((g, i) => {
          if (!g) return;
          const p = f.motionTrail[Math.max(0, f.motionTrail.length - 3 - i * 3)];
          g.visible = !!p; if (p) g.position.set((p.x - f.x) / 1000, 0, (p.z - f.z) / 1000);
        });
      } else { ghosts[side].forEach(g => { if (g) g.visible = false; }); }
    });
  }
  return {
    render,
    setVisible(visible: boolean) { root.visible = visible; },
    reset() { clearGhosts(); [flecks, flares, tracers, contacts].forEach(m => { m.count = 0; }); },
    dispose() { if (disposed) return; disposed = true; clearGhosts(); [flecks, flares, tracers, contacts].forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.removeFromParent(); },
  };
}
