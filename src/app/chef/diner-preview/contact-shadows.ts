import * as THREE from 'three';
import type { DinerSceneData } from './scene-types';

export interface ContactShadows {
  root: THREE.Group;
  update: (data: DinerSceneData, floorHeight: (x: number, y: number) => number) => void;
  setActorPosition: (id: string, x: number, y: number, angle: number) => void;
  dispose: () => void;
}

// Surface attachments and flat marks already sit on another visible surface.
// Giving them a floor blob would imply a second, invisible furnishing below.
const NO_FLOOR_SHADOW = new Set([
  'spill', 'welcome_mat', 'service_hatch', 'staff_door', 'lift_gate',
  'counter_till', 'counter_book', 'keepsake_shelf', 'chrome_clock', 'diner_clock',
  'milkshake_sign', 'garden_poster', 'coffee_print', 'burger_print', 'deer_trophy',
  'chandelier', 'art_deco_chandelier',
]);

function contactTexture(): THREE.DataTexture {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    const radius = Math.hypot(u, v), edge = 1 - THREE.MathUtils.smoothstep(radius, .60, 1);
    // A broad penumbra and a small inner contact core share the same draw.
    const alpha = edge * (.66 * Math.exp(-radius * radius * 3.7) + .34 * Math.exp(-radius * radius * 20));
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
    pixels[i + 3] = Math.round(255 * alpha);
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'miniature-contact-falloff';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Cheap local grounding alongside the directional shadow map. All blobs use
 * one material, texture and instanced draw; no render targets or extra lights. */
export function createContactShadows(): ContactShadows {
  const root = new THREE.Group();
  root.name = 'miniature-contact-shadows';
  root.userData.inputPassthrough = true;
  root.raycast = () => {};
  const texture = contactTexture();
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: '#684930', map: texture, transparent: true, opacity: .13,
    depthWrite: false, depthTest: true, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  let capacity = 0, mesh: THREE.InstancedMesh | null = null, disposed = false;
  const transform = new THREE.Object3D();
  const actorIndices = new Map<string, number>();
  let actorFloorHeight: ((x: number, y: number) => number) | null = null;

  function reserve(required: number) {
    if (required <= capacity) return;
    capacity = Math.max(128, 2 ** Math.ceil(Math.log2(required)));
    if (mesh) { root.remove(mesh); mesh.dispose(); }
    mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = 'floor-contact-ellipses';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.inputPassthrough = true;
    mesh.raycast = () => {};
    mesh.frustumCulled = false;
    mesh.renderOrder = -2;
    mesh.count = 0;
    root.add(mesh);
  }

  function update(data: DinerSceneData, floorHeight: (x: number, y: number) => number) {
    if (disposed) return;
    actorIndices.clear();
    actorFloorHeight = floorHeight;
    reserve(data.objects.length + data.people.length + data.tables.reduce((sum, table) => sum + table.seats.length + 1, 0));
    if (!mesh) return;
    let count = 0;
    const add = (x: number, y: number, width: number, depth: number, angle = 0) => {
      const floor = floorHeight(x, y);
      if (![x, y, floor, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) return;
      transform.position.set(x, floor + .012, y);
      transform.rotation.set(0, angle, 0);
      transform.scale.set(width, 1, depth);
      transform.updateMatrix();
      mesh!.setMatrixAt(count++, transform.matrix);
    };

    for (const object of data.objects) {
      if (object.mount || NO_FLOOR_SHADOW.has(object.kind)) continue;
      const floor = floorHeight(object.x, object.y);
      if (object.elevation !== undefined && Math.abs(object.elevation - floor) > .035) continue;
      const raw = object.footprint ?? (object.kind === 'pass' || object.kind === 'queue_bench' ? [2, 1] : [1, 1]);
      const turned = (object.rotation ?? 0) % 2 === 1;
      const w = raw[turned ? 1 : 0], h = raw[turned ? 0 : 1];
      const small = object.kind === 'parcel' ? .80 : object.kind === 'plant' ? .78 : 1;
      add(object.x + (w - 1) / 2, object.y + (h - 1) / 2, w * 1.22 * small, h * 1.16 * small);
    }
    for (const table of data.tables) {
      const raw = table.footprint ?? [table.capacity === 4 ? 2 : 1, table.capacity === 1 ? 1 : 2];
      const turned = (table.rotation ?? 0) % 2 === 1;
      const w = raw[turned ? 1 : 0], h = raw[turned ? 0 : 1];
      add(table.x + (w - 1) / 2, table.y + (h - 1) / 2, w * 1.14, h * 1.10);
      for (const seat of table.seats) add(seat.x, seat.y, table.kind === 'booth' ? .98 : .74, table.kind === 'booth' ? .92 : .72);
    }
    for (const person of data.people) {
      if (person.hidden) continue;
      const angle = person.target
        ? Math.atan2(person.x - person.target.x, person.y - person.target.y)
        : Math.PI - (person.facing ?? 0) * Math.PI / 2;
      const index = count;
      add(person.x, person.y, .67, .49, angle);
      if (count > index) actorIndices.set(person.id, index);
    }
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Follow the interpolated actor and its working stance after animation,
   * without rebuilding furniture shadows or using simulation tile centres. */
  function setActorPosition(id: string, x: number, y: number, angle: number) {
    if (disposed || !mesh || !actorFloorHeight) return;
    const index = actorIndices.get(id);
    if (index === undefined || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) return;
    const floor = actorFloorHeight(x, y);
    if (!Number.isFinite(floor)) return;
    transform.position.set(x, floor + .012, y);
    transform.rotation.set(0, angle, 0);
    transform.scale.set(.67, 1, .49);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    mesh?.dispose();
    root.clear();
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }
  return { root, update, setActorPosition, dispose };
}
