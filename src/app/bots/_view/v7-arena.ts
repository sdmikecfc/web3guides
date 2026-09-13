import * as THREE from "three";

/** Low-cost miniature terraces fill the space between the ring and its distant audience plate. */
export function createRemasterTerraces(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name = "remaster_audience_terraces"; scene.add(root);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const mat = <T extends THREE.Material>(m: T) => { materials.push(m); return m; };
  const wood = mat(new THREE.MeshStandardMaterial({ color: 0x49372c, roughness: .95 }));
  const trim = mat(new THREE.MeshStandardMaterial({ color: 0x806444, roughness: .65, metalness: .25 }));
  for (let row = 0; row < 5; row++) {
    const radius = 7.45 + row * 1.05, y = -.3 + row * .28;
    const tier = new THREE.Mesh(geo(new THREE.RingGeometry(radius, radius + 1.05, 96)), wood);
    tier.rotation.x = -Math.PI / 2; tier.position.y = y; root.add(tier);
    const riser = new THREE.Mesh(geo(new THREE.CylinderGeometry(radius, radius, .3, 96, 1, true)), wood);
    riser.position.y = y - .15; root.add(riser);
    const rail = new THREE.Mesh(geo(new THREE.TorusGeometry(radius + .95, .025, 5, 96)), trim);
    rail.rotation.x = Math.PI / 2; rail.position.y = y + .025; root.add(rail);
  }
  const clay = mat(new THREE.MeshStandardMaterial({ color: 0x8b7869, roughness: .9 }));
  const eye = mat(new THREE.MeshBasicMaterial({ color: 0x251c16 }));
  const count = 5 * 72, heads = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(1, 10, 7)), clay, count);
  const bodies = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(1, 8, 5)), clay, count);
  const eyes = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(1, 5, 4)), eye, count * 2);
  [heads, bodies, eyes].forEach(o => { o.frustumCulled = false; root.add(o); });
  const dummy = new THREE.Object3D(), colour = new THREE.Color(), colours = [0xb68d59, 0x8f7660, 0x8e6c51, 0xb4a080, 0x765b49, 0x73837a];
  const spectators: { x: number; z: number; y: number; angle: number; size: number }[] = [];
  for (let row = 0; row < 5; row++) for (let seat = 0; seat < 72; seat++) {
    const i = row * 72 + seat, angle = (seat + (row % 2) * .5) / 72 * Math.PI * 2, radius = 7.95 + row * 1.05;
    const size = .85 + ((i * 17) % 13) / 40, y = -.3 + row * .28;
    spectators.push({ x:Math.sin(angle)*radius, z:Math.cos(angle)*radius, y, angle, size });
    colour.setHex(colours[i % colours.length]); heads.setColorAt(i, colour); bodies.setColorAt(i, colour.clone().multiplyScalar(.55));
  }
  let last = -1;
  function update(showroom: boolean, frame: number, reduced: boolean) {
    root.visible = !showroom; if (showroom) return;
    const stamp = reduced ? 0 : Math.floor(frame / 10); if (last === stamp) return; last = stamp;
    spectators.forEach((s, i) => {
      const bob = reduced ? 0 : Math.sin(stamp * .42 + i * 2.3) * .025;
      dummy.quaternion.identity(); dummy.position.set(s.x, s.y + .57 * s.size + bob, s.z); dummy.scale.set(.22*s.size,.25*s.size,.22*s.size); dummy.updateMatrix(); heads.setMatrixAt(i,dummy.matrix);
      dummy.position.y = s.y + .24*s.size; dummy.scale.set(.2*s.size,.29*s.size,.16*s.size); dummy.updateMatrix(); bodies.setMatrixAt(i,dummy.matrix);
      for (let side = 0; side < 2; side++) {
        const offset = side ? .065 : -.065;
        dummy.position.set(s.x-Math.sin(s.angle)*.2*s.size+Math.cos(s.angle)*offset, s.y+.6*s.size+bob, s.z-Math.cos(s.angle)*.2*s.size-Math.sin(s.angle)*offset);
        dummy.scale.setScalar(.028*s.size); dummy.updateMatrix(); eyes.setMatrixAt(i*2+side,dummy.matrix);
      }
    });
    [heads,bodies,eyes].forEach(o => { o.instanceMatrix.needsUpdate = true; });
  }
  return { update, dispose() { [heads,bodies,eyes].forEach(o=>o.dispose()); geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); root.removeFromParent(); } };
}
