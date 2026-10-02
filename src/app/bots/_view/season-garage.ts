"use client";
import * as THREE from "three";
import { createFightV6, fighterPoseV6, type BuildV6 } from "@/lib/bots/v6";
import { createToyV6 } from "./v6-toy";
import type { RoomDisplayToy } from "./living-room";

/** Adapt exact seasonal models to the existing approved display room. */
export async function createSeasonGarageToy(build: BuildV6): Promise<RoomDisplayToy> {
  const toy = await createToyV6(build);
  try {
    const state = createFightV6(0, build, build);
    state.fighters[0].x = state.fighters[0].z = state.fighters[0].yaw = 0;
    state.fighters[1].x = 0; state.fighters[1].z = 6000;
    const rest = fighterPoseV6(state, 0);
    const resetPose = () => toy.pose(state.fighters[0], 0, rest, true);
    resetPose();
    for (const socket of ["legL", "legR"] as const) toy.slots[socket]!.traverse(node => { if (node instanceof THREE.Mesh) node.userData.socket = socket; });
    return { root: toy.root, sockets: { head: toy.slots.head!, torso: toy.slots.torso!, armL: toy.slots.armL! }, bones: { legL: toy.slots.legL!, legR: toy.slots.legR! }, resetPose,
      // The garage never plays old-engine locomotion on a new rigid rig.
      applyClip() {}, dispose: () => toy.dispose() };
  } catch (error) { toy.dispose(); throw error; }
}

export function seasonGarageBounds(model: RoomDisplayToy) {
  model.root.updateMatrixWorld(true);
  const body = new THREE.Box3().makeEmpty(), feet = new THREE.Box3().makeEmpty(), piece = new THREE.Box3();
  model.root.traverseVisible(node => { if (!(node instanceof THREE.Mesh)) return; if (!node.geometry.boundingBox) node.geometry.computeBoundingBox(); piece.copy(node.geometry.boundingBox!).applyMatrix4(node.matrixWorld); body.union(piece); if (node.userData.socket === "legL" || node.userData.socket === "legR") feet.union(piece); });
  return { min: body.min.toArray(), max: body.max.toArray(), feet: feet.min.y, supportGap: feet.min.y - .44 };
}
