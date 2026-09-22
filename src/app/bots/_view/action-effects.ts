"use client";

import * as THREE from "three";
import type { Side } from "../_engine/parts";

export interface ActionImpact {
  frame: number;
  side: Side;
  point: THREE.Vector3;
  strong: boolean;
  kind?: "blunt" | "blade" | "projectile";
}

export interface ActionEffects {
  /** time is the existing presentation clock in seconds (FightFx.time).
   * Supply recorded hit/block impacts only. This module never creates hits. */
  render(time: number, impacts: readonly ActionImpact[], enabled: boolean): void;
  dispose(): void;
}

const MAX_IMPACTS = 2;
const CHIPS_PER_IMPACT = 18;
const RAYS_PER_IMPACT = 6;
const LIFE = .62;
const FLOOR = .044;
const TAU = Math.PI * 2;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** Stateless event noise: independent of rendering cadence, seeking and
 * the gameplay RNG. No mutable random stream survives a render call. */
function noise(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) | 0;
  x = Math.imul(x ^ x >>> 16, 0x21f0aaad);
  x = Math.imul(x ^ x >>> 15, 0x735a2d97);
  return ((x ^ x >>> 15) >>> 0) / 4294967296;
}

/** Small, pooled physical accents. All geometry/materials are created once;
 * rendering only rewrites fixed instance buffers and existing mesh transforms.
 * The longest accent lasts .62s, leaving the persistent clay dent unobscured. */
export function createActionEffects(scene: THREE.Scene): ActionEffects {
  const group = new THREE.Group();
  group.name = "Recorded action impacts";
  group.visible = false;
  scene.add(group);

  const chipGeometry = new THREE.IcosahedronGeometry(.042, 0);
  const chipMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .94, metalness: 0, flatShading: true,
  });
  // Neutral clay interiors: never repaint or borrow another robot's surface.
  const clay = [0xc6ae88, 0xe0c9a2, 0xbda27f, 0xd7c2a0] as const;
  const chips = new THREE.InstancedMesh(chipGeometry, chipMaterial, MAX_IMPACTS * CHIPS_PER_IMPACT);
  chips.name = "Clay impact chips (36 maximum)";
  chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chips.frustumCulled = false;
  chips.castShadow = false;
  chips.receiveShadow = true;
  chips.count = 0;
  group.add(chips);

  const rayGeometry = new THREE.BoxGeometry(.014, 1, .014);
  const rayMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe2ab, transparent: true, opacity: .8,
    depthWrite: false, toneMapped: false,
  });
  const rays = new THREE.InstancedMesh(rayGeometry, rayMaterial, MAX_IMPACTS * RAYS_PER_IMPACT);
  rays.name = "Short impact streaks (12 maximum)";
  rays.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rays.frustumCulled = false;
  rays.count = 0;
  group.add(rays);

  const ringGeometry = new THREE.RingGeometry(.84, 1, 40);
  const slashGeometry = new THREE.RingGeometry(.90, 1, 28, 1, -.78, 1.56);
  slashGeometry.translate(-.83, 0, 0);
  const floorRings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  const hitRings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  const slashes: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  const accentMaterials: THREE.MeshBasicMaterial[] = [];
  const makeAccent = (geometry: THREE.RingGeometry, color: number, name: string) => {
    const material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false, depthTest: true, toneMapped: false,
    });
    accentMaterials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  for (let i = 0; i < MAX_IMPACTS; i++) {
    const floor = makeAccent(ringGeometry, 0xe0c497, "Brief floor shock ring");
    floor.rotation.x = -Math.PI / 2;
    floorRings.push(floor);
    hitRings.push(makeAccent(ringGeometry, 0xffe4b6, "Brief armour shock ring"));
    slashes.push(makeAccent(slashGeometry, 0xffe7c2, "Blade contact sliver"));
  }

  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  // Allocate instanceColor once, before the first animated frame.
  for (let i = 0; i < MAX_IMPACTS * CHIPS_PER_IMPACT; i++) {
    chips.setColorAt(i, tint.setHex(clay[i % clay.length]));
  }
  if (chips.instanceColor) chips.instanceColor.setUsage(THREE.DynamicDrawUsage);

  let disposed = false;
  const valid = (impact: ActionImpact, time: number) => {
    const age = time - impact.frame / 60;
    return age >= 0 && age < LIFE && Number.isFinite(impact.frame)
      && Number.isFinite(impact.point.x) && Number.isFinite(impact.point.y) && Number.isFinite(impact.point.z);
  };

  return {
    render(time, impacts, enabled) {
      if (disposed) return;
      chips.count = 0;
      rays.count = 0;
      for (let i = 0; i < MAX_IMPACTS; i++) {
        floorRings[i].visible = false;
        hitRings[i].visible = false;
        slashes[i].visible = false;
      }
      group.visible = false;
      if (!enabled || !Number.isFinite(time)) return;

      // Select the newest two live events without assuming input ordering or
      // allocating a filtered/sorted list. Equal-frame events retain input order.
      let newest = -1, previous = -1;
      for (let i = 0; i < impacts.length; i++) {
        if (!valid(impacts[i], time)) continue;
        if (newest < 0 || impacts[i].frame >= impacts[newest].frame) {
          previous = newest;
          newest = i;
        } else if (previous < 0 || impacts[i].frame >= impacts[previous].frame) previous = i;
      }
      if (newest < 0) return;
      group.visible = true;
      let chipCount = 0, rayCount = 0;

      for (let slot = 0; slot < MAX_IMPACTS; slot++) {
        const index = slot === 0 ? newest : previous;
        if (index < 0) break;
        const impact = impacts[index], age = time - impact.frame / 60;
        const kind = impact.kind ?? "blunt";
        const dir = impact.side === 0 ? -1 : 1;
        const seed = (impact.frame | 0) ^ Math.imul(impact.side + 1, 0x45d9f3b)
          ^ (kind === "blade" ? 0x18ad : kind === "projectile" ? 0x936b : 0x372f);
        const point = impact.point;

        // A heavy blunt contact gets a fast expanding ellipse on the floor
        // plus a much smaller ring at the impact. Both are depth-tested.
        if (kind === "blunt" && impact.strong && age < .42) {
          const u = age / .42, radius = .12 + ease(u) * 1.05;
          const floor = floorRings[slot];
          floor.visible = true;
          floor.position.set(point.x, FLOOR, point.z);
          floor.scale.setScalar(radius);
          floor.material.opacity = .30 * (1 - u) * (1 - u);
          if (age < .19) {
            const hit = hitRings[slot], h = age / .19;
            hit.visible = true;
            hit.position.set(point.x, point.y, point.z + .035);
            hit.rotation.set(0, dir * .20, 0);
            hit.scale.setScalar(.075 + ease(h) * .26);
            hit.material.opacity = .56 * (1 - h) * (1 - h);
          }
        }

        if (kind === "blade" && age < .27) {
          const u = age / .27, slash = slashes[slot];
          slash.visible = true;
          slash.position.set(point.x + dir * age * .35, point.y + age * .20, point.z + .045);
          slash.rotation.set(0, dir * .12, dir * (.50 + noise(seed, 81) * .40));
          const size = .30 + ease(age / .11) * (impact.strong ? .68 : .43);
          slash.scale.set(size, size, 1);
          slash.material.opacity = .68 * Math.pow(1 - u, 1.5);
        }

        // Chips shrink away before .62s. Their ballistic trajectory is evaluated
        // directly from age, so a replay seek never depends on prior frames.
        const chipTotal = impact.strong ? CHIPS_PER_IMPACT : kind === "projectile" ? 7 : 10;
        const chipFade = 1 - ease((age - .38) / (LIFE - .38));
        for (let n = 0; n < chipTotal; n++) {
          const a = noise(seed, n * 8) * TAU;
          const speed = (impact.strong ? 1.3 : .85) * (.48 + noise(seed, n * 8 + 1));
          const vx = Math.cos(a) * speed + dir * .25;
          const vz = Math.sin(a) * speed * .58;
          const vy = .65 + noise(seed, n * 8 + 2) * (impact.strong ? 1.45 : .85);
          const gravity = 7;
          const startY = Math.max(FLOOR, point.y);
          const landing = (vy + Math.sqrt(vy * vy + 2 * gravity * (startY - FLOOR))) / gravity;
          let y = startY + vy * age - gravity * age * age * .5;
          if (age > landing) {
            const bounce = age - landing;
            y = FLOOR + Math.max(0, .10 * Math.sin(Math.min(1, bounce / .16) * Math.PI));
          }
          const size = (.60 + noise(seed, n * 8 + 3) * .75) * chipFade;
          transform.position.set(point.x + vx * age, Math.max(FLOOR, y), point.z + vz * age);
          transform.rotation.set(a + age * (3 + noise(seed, n * 8 + 4) * 5), age * dir * 5, a * .7 + age * 7);
          transform.scale.set(size, size * (.42 + noise(seed, n * 8 + 5) * .52), size * .72);
          transform.updateMatrix();
          chips.setMatrixAt(chipCount, transform.matrix);
          chips.setColorAt(chipCount, tint.setHex(clay[Math.floor(noise(seed, n * 8 + 6) * clay.length)]));
          chipCount++;
        }

        // The thrust burst is narrow and fast; blade accents use only two
        // streaks. Existing arena sparks can remain the ordinary blunt cue.
        const rayLife = kind === "projectile" ? .22 : kind === "blade" ? .17 : .15;
        const rayTotal = kind === "projectile" ? RAYS_PER_IMPACT : kind === "blade" ? 2 : impact.strong ? 4 : 0;
        if (age < rayLife) {
          const u = age / rayLife, fade = 1 - u;
          for (let n = 0; n < rayTotal; n++) {
            const a = kind === "projectile"
              ? (n - 2.5) * .24 + (dir < 0 ? Math.PI : 0)
              : n / Math.max(1, rayTotal) * TAU + noise(seed, 151) * .6;
            const travel = .06 + age * (kind === "projectile" ? 2.4 : 1.4);
            const length = (.08 + noise(seed, 160 + n) * .18) * fade;
            transform.position.set(point.x + Math.cos(a) * travel, point.y + Math.sin(a) * travel, point.z + .045 + (n % 2) * .012);
            transform.rotation.set(0, 0, a - Math.PI / 2);
            transform.scale.set(fade, length, fade);
            transform.updateMatrix();
            rays.setMatrixAt(rayCount++, transform.matrix);
          }
        }
      }

      chips.count = chipCount;
      rays.count = rayCount;
      if (chipCount) {
        chips.instanceMatrix.needsUpdate = true;
        if (chips.instanceColor) chips.instanceColor.needsUpdate = true;
      }
      if (rayCount) rays.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      chips.dispose();
      rays.dispose();
      chipGeometry.dispose();
      rayGeometry.dispose();
      ringGeometry.dispose();
      slashGeometry.dispose();
      chipMaterial.dispose();
      rayMaterial.dispose();
      for (let i = 0; i < accentMaterials.length; i++) accentMaterials[i].dispose();
      group.clear();
    },
  };
}
