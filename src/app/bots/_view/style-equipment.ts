"use client";

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { CombatToy } from "./combat-toy";
import type { Socket } from "@/lib/bots/fixtures";

export interface StylePartVisual { style: "tank" | "speed" | "ranged"; tier: number; weaponKind?: string }
export interface StyleEquipment {
  weaponKind: string;
  muzzles: [THREE.Object3D, THREE.Object3D];
  setBurst(active: boolean): void;
  setBlade(active: boolean, side?: "L" | "R"): void;
  poseAim(): void;
  contact(side: "L" | "R", out: THREE.Vector3): THREE.Vector3;
}

/** Authored toy attachments. Every mesh/material belongs to this one assembly. */
export function attachStyleEquipment(toy: CombatToy, parts: Partial<Record<Socket, StylePartVisual>>): StyleEquipment {
  const ownedGeometry = new Set<THREE.BufferGeometry>(), ownedMaterials = new Set<THREE.Material>();
  const accessories: THREE.Mesh[] = [], groups: THREE.Group[] = [];
  const socketVisible: Partial<Record<Socket, boolean>> = {};
  const material = (color: number, metalness = 0, roughness = .42) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness }); ownedMaterials.add(m); return m;
  };
  const enamel = material(0x7fa99c, .05), ivory = material(0xefe1bd, .03), brass = material(0xbd9858, .7, .28);
  const dark = material(0x343a3b, .32), rubber = material(0x222729, .02, .8);
  const mint = material(0x8fe3ce, .1), amber = material(0xe7b95f, .25);
  function group(parent: THREE.Object3D, socket: Socket, position: [number, number, number]) {
    const g = new THREE.Group(); g.position.set(...position); g.userData.socket = socket;
    parent.add(g); groups.push(g); return g;
  }
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, position: [number, number, number], socket: Socket) {
    ownedGeometry.add(geometry); const m = new THREE.Mesh(geometry, mat); m.position.set(...position);
    m.castShadow = m.receiveShadow = true; m.userData.socket = socket; m.userData.styleAccessory = true;
    m.name = "style:" + socket; parent.add(m); accessories.push(m); return m;
  }
  const box = (parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], mat: THREE.Material, socket: Socket, radius = .045) => mesh(parent, new RoundedBoxGeometry(...size, 2, radius), mat, position, socket);
  function barrel(parent: THREE.Object3D, radius: number, length: number, position: [number, number, number], mat: THREE.Material, socket: Socket) {
    const m = mesh(parent, new THREE.CylinderGeometry(radius, radius, length, 12), mat, position, socket); m.rotation.x = Math.PI / 2; return m;
  }
  function gun(parent: THREE.Object3D, socket: Socket, compact: boolean) {
    const scale = compact ? .75 : .9, g = group(parent, socket, [0, -.03, .24]);
    g.name = compact ? "Retractable toy machine pistol" : "Toy precision rifle";
    g.scale.setScalar(scale);
    box(g, [.24, .25, compact ? .54 : .8], [0, .14, .21], dark, socket);
    box(g, [.27, .16, .42], [0, .19, .16], enamel, socket);
    box(g, [.16, .33, .16], [0, -.10, .06], rubber, socket);
    box(g, [.14, .24, .19], [0, -.09, .32], brass, socket);
    barrel(g, compact ? .067 : .082, compact ? .32 : .55, [0, .14, compact ? .57 : .83], dark, socket);
    barrel(g, compact ? .083 : .104, .075, [0, .14, compact ? .75 : 1.12], brass, socket);
    barrel(g, compact ? .046 : .063, .078, [0, .14, compact ? .755 : 1.125], rubber, socket);
    for (let i = 0; i < 3; i++) box(g, [.018, .075, .018], [.14, .21, .02 + i * .09], ivory, socket, .006);
    if (!compact) {
      box(g, [.23, .24, .24], [0, .08, -.29], ivory, socket);
      box(g, [.12, .08, .16], [0, .33, .22], brass, socket);
      barrel(g, .093, .32, [0, .42, .23], dark, socket);
      barrel(g, .071, .015, [0, .42, .40], mint, socket);
    }
    const muzzle = new THREE.Object3D(); muzzle.name = "muzzle"; muzzle.position.set(0, .14, compact ? .81 : 1.18); g.add(muzzle);
    return { group: g, muzzle };
  }
  function blade(parent: THREE.Object3D, side: "L" | "R") {
    const g = group(parent, "weapon", [0, 0, .31]); g.name = "Paired toy blade " + side;
    box(g, [.105, .25, .115], [0, 0, 0], rubber, "weapon");
    box(g, [.36, .065, .20], [0, .18, 0], brass, "weapon");
    const shape = new THREE.Shape(); shape.moveTo(-.10, .2); shape.lineTo(-.10, .71); shape.lineTo(.02, 1.02); shape.lineTo(.15, .68); shape.lineTo(.15, .2); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: .095, bevelEnabled: true, bevelSegments: 2, bevelSize: .028, bevelThickness: .02, steps: 1 }); geo.translate(0, 0, -.045);
    mesh(g, geo, ivory, [0, 0, 0], "weapon");
    box(g, [.032, .48, .11], [.02, .47, 0], amber, "weapon", .01);
    g.rotation.y = -Math.PI / 2;
    return g;
  }

  const weaponKind = parts.weapon?.weaponKind ?? "hammer";
  const replace = weaponKind === "rifle" || weaponKind === "blade" || /paired|dual/.test(weaponKind);
  const originalWeapons: THREE.Mesh[] = [];
  toy.root.traverse(o => { if (o instanceof THREE.Mesh && o.userData.socket === "weapon") { originalWeapons.push(o); if (replace) { o.userData.styleReplaced = true; o.visible = false; } } });
  const held: [THREE.Group | null, THREE.Group | null] = [null, null];
  const rifles: ReturnType<typeof gun>[] = [];
  if (weaponKind === "rifle") { const r = gun(toy.bones.wristR, "weapon", false); rifles.push(r); held[1] = r.group; }
  else if (replace) { if (weaponKind !== "blade") held[0] = blade(toy.bones.wristL, "L"); held[1] = blade(toy.bones.wristR, "R"); }
  if (held[1]) {
    toy.bones.weapon = held[1]; toy.sockets.weapon = held[1];
    if (weaponKind === "rifle") toy.weaponContact.set(0, .14, 1.18); else toy.weaponContact.set(.15, .68, 0);
    toy.weaponFace = weaponKind === "rifle" ? undefined : new THREE.Vector3(1, 0, 0);
  }

  // Finishers have their own mounts; a mixed body/weapon build keeps its identity.
  const pistols = [gun(toy.bones.wristL, "armL", true), gun(toy.bones.wristR, "armR", true)] as const;
  pistols.forEach(p => { p.group.visible = false; });
  const builtBlades = parts.torso?.style === "speed" && parts.torso.tier >= 3 ? [blade(toy.bones.wristL, "L"), blade(toy.bones.wristR, "R")] : [];
  builtBlades.forEach(g => { g.visible = false; });
  let bursting = false, bladeSide: "L" | "R" | null = null;
  for (const socket of ["head", "torso", "armL", "armR", "legL", "legR"] as Socket[]) {
    const part = parts[socket]; if (!part || part.tier < 2) continue;
    const parent = toy.bones[socket], left = socket.endsWith("L") ? -1 : 1;
    if (socket.startsWith("arm") && part.style === "tank" && part.tier >= 3) {
      box(parent, [.57, .34, .64], [left * .12, -.03, -.015], enamel, socket, .11);
      box(parent, [.60, .055, .67], [left * .12, -.16, -.015], brass, socket, .025);
    }
    if (socket === "torso") {
      const reactor = group(parent, socket, [0, .70, -.52]);
      box(reactor, [part.style === "tank" ? .82 : .54, .57, .17], [0, 0, 0], dark, socket, .07);
      for (const x of [-.16, .16]) box(reactor, [.06, .32, .03], [x, 0, -.1], part.style === "speed" ? amber : mint, socket, .012);
    }
    if (socket === "head" && part.tier >= 3) {
      if (part.style === "tank") {
        for (const x of [-1, 1]) {
          const horn = mesh(parent, new THREE.ConeGeometry(.115, .38, 12), brass, [x * .57, 1.35, -.07], socket); horn.rotation.z = -x * .45;
          const brow = box(parent, [.32, .08, .09], [x * .27, 1.02, .55], dark, socket, .028); brow.rotation.z = x * .14;
        }
      } else if (part.style === "ranged") {
        barrel(parent, .16, .17, [.43, .73, .56], brass, socket);
        barrel(parent, .12, .018, [.43, .73, .655], mint, socket);
      } else {
        const fin = box(parent, [.08, .3, .51], [0, 1.32, -.14], brass, socket); fin.rotation.x = -.25;
      }
    }
    if (part.tier === 4 && socket.startsWith("leg")) {
      box(parent, [.12, .40, .16], [left * .22, -.47, -.08], brass, socket, .035);
    }
  }
  const oldVisible = toy.setVisible.bind(toy), oldReset = toy.resetPose.bind(toy), oldFreeze = toy.freezePart.bind(toy), oldDispose = toy.dispose.bind(toy), oldTip = toy.tip.bind(toy);
  function visibility() {
    const isolatedWeapon = socketVisible.head === false && socketVisible.torso === false;
    originalWeapons.forEach(m => { m.userData.styleReplaced = replace || bursting || !!bladeSide; m.visible = !m.userData.styleReplaced && socketVisible.weapon !== false && (isolatedWeapon || socketVisible.armR !== false); });
    held.forEach((g, i) => { if (g) g.visible = !bursting && !bladeSide && socketVisible.weapon !== false && (isolatedWeapon || socketVisible[i === 0 ? "armL" : "armR"] !== false); });
    pistols.forEach((p, i) => { p.group.visible = bursting && socketVisible[i === 0 ? "armL" : "armR"] !== false; });
    builtBlades.forEach((g, i) => { g.visible = bladeSide === (i === 0 ? "L" : "R") && socketVisible[i === 0 ? "armL" : "armR"] !== false; });
  }
  toy.setVisible = (socket, visible) => { socketVisible[socket] = visible; oldVisible(socket, visible); accessories.filter(m => m.userData.socket === socket).forEach(m => { m.visible = visible; }); visibility(); };
  toy.resetPose = () => { oldReset(); visibility(); };
  toy.tip = out => rifles.length && !bursting ? rifles[0].muzzle.getWorldPosition(out) : bursting ? pistols[1].muzzle.getWorldPosition(out) : oldTip(out);
  toy.freezePart = socket => {
    const frozen = oldFreeze(socket); frozen.updateMatrixWorld(true);
    const remove: THREE.Object3D[] = []; frozen.traverse(o => { if (o.userData.styleAccessory || o.userData.styleReplaced) remove.push(o); });
    remove.forEach(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); o.removeFromParent(); });
    for (const original of accessories) {
      const ownedSocket = original.userData.socket;
      if (ownedSocket !== socket && !(socket.startsWith("arm") && ownedSocket === "weapon" && toy.bones[socket === "armL" ? "wristL" : "wristR"].getObjectById(original.id))) continue;
      if (pistols.some(p => !bursting && p.group.getObjectById(original.id))) continue;
      if (held.some(g => (bursting || !!bladeSide) && g?.getObjectById(original.id))) continue;
      if (builtBlades.some((g, i) => bladeSide !== (i === 0 ? "L" : "R") && g.getObjectById(original.id))) continue;
      const copy = new THREE.Mesh(original.geometry.clone(), original.material); original.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale); copy.castShadow = copy.receiveShadow = true; frozen.attach(copy);
    }
    return frozen;
  };
  let disposed = false;
  toy.dispose = () => { if (disposed) return; disposed = true; groups.forEach(g => g.removeFromParent()); ownedGeometry.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose()); oldDispose(); };
  const result: StyleEquipment = {
    weaponKind,
    muzzles: [pistols[0].muzzle, rifles[0]?.muzzle ?? pistols[1].muzzle],
    setBurst(active) { bursting = active; visibility(); result.muzzles[1] = active ? pistols[1].muzzle : rifles[0]?.muzzle ?? pistols[1].muzzle; },
    setBlade(active, side = "R") { bladeSide = active ? side : null; visibility(); },
    poseAim() {
      for (const side of ["L", "R"] as const) {
        if (side === "L" && !bursting) continue;
        // Fold the elbow so the stock stays beside the body. A straight arm
        // would put the muzzle through a nearby rival before a shot is fired.
        toy.bones["arm" + side].rotation.set(-.28, side === "L" ? .15 : -.15, side === "L" ? -.08 : .08);
        toy.bones["elbow" + side].rotation.set(1.60, 0, 0);
        toy.bones["wrist" + side].rotation.set(-1.32, 0, 0);
      }
    },
    contact(side, out) { const g = held[side === "L" ? 0 : 1]; return g ? out.copy(toy.weaponContact).applyMatrix4(g.matrixWorld) : oldTip(out); },
  };
  visibility(); return result;
}
