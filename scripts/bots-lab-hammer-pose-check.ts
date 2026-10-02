import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createClayRobot } from "../src/app/bots/lab/robot";
import { createFightV4, preset, WEAPON } from "../src/app/bots/lab/engine";

const originalLoad = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function (url) {
  const bytes = readFileSync("public/bots-art/3d/toy-lab/" + url.split("/").pop());
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
};

async function main() {
  let minimumAlignment = 1;
  for (const family of ["brute", "hotshot", "deadeye"] as const) for (const design of [0, 1] as const) {
    const build = preset(family, design); build.weapon = "hammer";
    const robot = await createClayRobot(build);
    try {
      // The GLB combines both brass endcaps in one mesh. Read their actual
      // extreme-X vertices and normals, not a duplicate of the pose formula.
      const brass = robot.meshes.weapon.find(mesh => mesh.name === "weapon_brass");
      assert(brass, "hammer has its physical brass endcaps");
      const vertices = brass.geometry.getAttribute("position"), normals = brass.geometry.getAttribute("normal");
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(brass.matrix);
      const points = Array.from({ length: vertices.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(brass.matrix));
      const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
      const positiveBounds = new THREE.Box3(), negativeBounds = new THREE.Box3(), normal = new THREE.Vector3();
      points.forEach((point, i) => {
        if (Math.abs(point.x - maxX) < .00001) { positiveBounds.expandByPoint(point); normal.add(new THREE.Vector3().fromBufferAttribute(normals, i).applyNormalMatrix(normalMatrix)); }
        if (Math.abs(point.x - minX) < .00001) negativeBounds.expandByPoint(point);
      });
      const positive = positiveBounds.getCenter(new THREE.Vector3()), negative = negativeBounds.getCenter(new THREE.Vector3()); normal.normalize();
      const centre = positive.clone().add(negative).multiplyScalar(.5);
      assert(normal.x > .99, "exported face normal is +X before mounting");
      for (const yaw of [0, 1571, -2400]) {
        const state = createFightV4(5, build, preset("brute")), fighter = state.fighters[0];
        fighter.x = fighter.z = 0; fighter.yaw = yaw;
        fighter.action = { kind: "hammer", started: 0, windup: WEAPON.hammer.windup, recovery: WEAPON.hammer.recovery, released: false };
        const snapshots: { centre: THREE.Vector3; face: THREE.Vector3; normal: THREE.Vector3 }[] = [];
        for (let age = WEAPON.hammer.windup - 4; age <= WEAPON.hammer.windup; age++) {
          state.frame = age; const immutable = JSON.stringify(state);
          robot.pose(fighter, state, 0, age / 60);
          assert.equal(JSON.stringify(state), immutable, "presentation never changes combat state or recorded impacts");
          snapshots.push({ centre: robot.bones.weapon.localToWorld(centre.clone()), face: robot.bones.weapon.localToWorld(positive.clone()), normal: normal.clone().transformDirection(robot.bones.weapon.matrixWorld) });
        }
        for (let i = 1; i < snapshots.length; i++) {
          const previous = snapshots[i - 1], current = snapshots[i], velocity = current.centre.clone().sub(previous.centre);
          const alignment = current.normal.dot(velocity.clone().normalize()); minimumAlignment = Math.min(minimumAlignment, alignment);
          assert(velocity.y < -.02, `${family}/${design}: hammer head must descend through contact`);
          assert(alignment > .82, `${family}/${design}: brass face must lead the head velocity, got ${alignment.toFixed(3)}`);
          assert(current.face.clone().sub(current.centre).dot(velocity) > 0, "brass endcap arrives ahead of the broad side");
        }
        assert(robot.tip().distanceTo(snapshots.at(-1)!.face) < .001, `tip resolves to the actual brass impact face: local ${positive.toArray()}, difference ${robot.tip().distanceTo(snapshots.at(-1)!.face)}`);
        state.frame = WEAPON.hammer.windup + WEAPON.hammer.recovery;
        robot.pose(fighter, state, 0, state.frame / 60); const recovered = robot.tip();
        fighter.action = null; robot.pose(fighter, state, 0, state.frame / 60);
        assert(recovered.distanceTo(robot.tip()) < .000001, "recovery blends into the same idle grip without snapping");
      }
    } finally { robot.dispose(); }
  }
  console.log(`PASS actual hammer endcaps lead downward contact for all six family/design assemblies and three facings (minimum alignment ${minimumAlignment.toFixed(3)}); face tip, smooth recovery and simulation isolation`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { GLTFLoader.prototype.loadAsync = originalLoad; });
