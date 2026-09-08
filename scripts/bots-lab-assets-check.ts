import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createClayRobot, dentGeometry } from "../src/app/bots/lab/robot";
import { COMBAT_RENDER_SCALE, createFightV4, preset, runFightV4, stepFightV4, SLOTS, type EventV4, type BuildV4, type Side } from "../src/app/bots/lab/engine";
const folder = "public/bots-art/3d/toy-lab/";
const digest = (a: ArrayBufferView) => createHash("sha256").update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest("hex");
const parse = new GLTFLoader(), originalLoad = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function(url) { const bytes = readFileSync(folder + url.split("/").pop()); return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, ""); };
async function main() {
  const manifest = JSON.parse(readFileSync(folder + "manifest.json", "utf8"));
  assert.equal(Object.keys(manifest.parts).length, 29);
  let totalBytes = 0, meshes = 0;
  for (const entry of Object.values(manifest.parts) as { file: string; bytes: number; sha256: string }[]) {
    const bytes = readFileSync(folder + entry.file); assert.equal(digest(bytes), entry.sha256); assert.equal(bytes.length, entry.bytes); totalBytes += bytes.length;
    const asset = await parse.loadAsync(entry.file); let clay = 0;
    asset.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return; meshes++;
      assert(["head", "torso", "upper", "lower", "hand", "foot", "weapon"].includes(o.userData.bone));
      const p = o.geometry.getAttribute("position"); assert(Array.from(p.array).every(Number.isFinite));
      if (o.userData.clay) { clay++; assert(p.count > 150); const mat = o.material as THREE.MeshStandardMaterial; assert(mat.roughness >= .8 && mat.metalness === 0); }
    });
    if (!/^(hammer|baton|rifle|flamethrower)\./.test(entry.file)) assert(clay > 0);
  }
  console.log(`PASS 29 GLBs: ${totalBytes} bytes, ${meshes} meshes, verified hashes, materials and attachment labels`);
  const b = preset("brute"), a = await createClayRobot(b), other = await createClayRobot(b), scene = new THREE.Scene(); scene.add(a.root, other.root);
  const state = createFightV4(9, b, b); a.pose(state.fighters[0], state, 0, 0, true); other.pose(state.fighters[1], state, 1, 0, true);
  const positions = (robot: typeof a) => Object.fromEntries([...SLOTS, "weapon" as const].map(s => [s, robot.meshes[s].map(m => digest(m.geometry.getAttribute("position").array))]));
  const colours = (robot: typeof a) => SLOTS.flatMap(s => robot.meshes[s].filter(m => m.userData.clay).map(m => digest(m.geometry.getAttribute("color").array)));
  const baseline = positions(a), isolated = positions(other);
  const originalColours = colours(a), otherColours = colours(other);
  for (const [i, weapon] of (["hammer", "rifle", "baton"] as const).map((w, i) => [i, w] as const)) {
    const e: EventV4 = { id: i, frame: i, kind: "hit", who: 1, target: 0, slot: "torso", weapon, point: [i * 140 - 150, 550, 500], normal: [0, 0, 1000] };
    const before = positions(a); a.impact(e); assert.notDeepEqual(positions(a).torso, before.torso, `${weapon} must move actual vertices`);
  }
  assert.deepEqual(positions(other), isolated, "identical part on a second robot is unchanged");
  assert.notDeepEqual(colours(a), originalColours, "surface marks accompany real dents");
  assert.deepEqual(colours(other), otherColours, "damage colour is isolated to the struck robot");
  for (const slot of SLOTS.filter(s => s !== "torso")) assert.deepEqual(positions(a)[slot], baseline[slot]);
  for (const m of a.meshes.torso.filter(m => !m.userData.clay)) assert.equal(digest(m.geometry.getAttribute("position").array), baseline.torso[a.meshes.torso.indexOf(m)], "protected mechanism unchanged");
  const dented = positions(a).torso; a.detach("torso", scene, 30); a.debris(65); assert.deepEqual(positions(a).torso, dented);
  a.reset(); assert.deepEqual(positions(a), baseline); assert.equal(a.dents, 0);
  assert.deepEqual(colours(a), originalColours, "reset restores clay colour");
  const heat: EventV4 = { id: 4, frame: 0, kind: "hit", who: 1, target: 0, slot: "torso", weapon: "flamethrower", point: [0, 550, 500], normal: [0, 0, 1000] };
  a.impact(heat);
  const scorched = colours(a);
  assert.notDeepEqual(scorched, originalColours, "heat leaves a visible surface scorch");
  assert.deepEqual(positions(a), baseline, "heat marks do not punch fake geometry craters");
  assert.equal(a.dents, 0); assert.deepEqual(colours(other), otherColours);
  a.detach("torso", scene, 30); a.debris(65); assert.deepEqual(colours(a), scorched);
  a.reset(); assert.deepEqual(colours(a), originalColours); a.impact(heat); assert.deepEqual(colours(a), scorched);
  a.reset();
  // Reconstruct the same ordered impacts twice, including detached pieces.
  const fight = runFightV4(2048, b, preset("hotshot", 1));
  const replay = (cadence: number) => { a.reset(); for (const e of fight.events) { state.frame = Math.floor(e.frame / cadence) * cadence; a.pose(state.fighters[0], state, 0, state.frame / 60); if ((e.kind === "hit" || e.kind === "block") && e.target === 0) a.impact(e); if (e.kind === "break" && e.who === 0 && e.slot) a.detach(e.slot, scene, e.frame); } return positions(a); };
  const replay60 = replay(1), replayColours = colours(a); a.bones.elbowL.rotation.x = .7; a.bones.elbowR.rotation.x = -1;
  assert.deepEqual(replay60, replay(4), "damage is independent of presentation cadence");
  assert.deepEqual(replayColours, colours(a), "damage marks reconstruct with the geometry");
  for (let i = 0; i < 12; i++) { a.reset(); a.detach("armR", scene, 10); a.debris(60); }
  a.reset(); assert.equal(scene.children.length, 2, "replay cleanup leaves no detached objects");
  const shell = a.meshes.torso.find(m => m.userData.clay)!;
  const rest = new Float32Array(shell.geometry.getAttribute("position").array), geo = shell.geometry;
  geo.computeBoundingBox(); const p = geo.boundingBox!.getCenter(new THREE.Vector3()); p.z = geo.boundingBox!.max.z;
  for (let i = 0; i < 50; i++) dentGeometry(geo, { point: p, normal: new THREE.Vector3(0, 0, 1), radius: .4, depth: .2, kind: "hammer" }, rest);
  const attr = geo.getAttribute("position"); for (let i = 0; i < attr.count; i++) assert(Math.hypot(attr.getX(i) - rest[i * 3], attr.getY(i) - rest[i * 3 + 1], attr.getZ(i) - rest[i * 3 + 2]) <= .190001);
  a.dispose(); other.dispose(); assert.equal(scene.children.length, 0);
  console.log("PASS geometry dents and heat scorch, protected hardware, isolation, detachment, deterministic damage reconstruction, reset, deformation limits and disposal");
  // Replay actual fixed-step fights with the same event batching as scene.render.
  // Equality alone could pass if neither replay ever changed a vertex.
  const scenarios: BuildV4[] = [preset("brute"), preset("hotshot"), preset("deadeye"), { ...preset("brute"), weapon: "flamethrower" }];
  for (const build of scenarios) {
    const opponent = preset("hotshot", 1), robots = await Promise.all([createClayRobot(build), createClayRobot(opponent)]);
    const arena = new THREE.Scene(); robots.forEach(robot => arena.add(robot.root));
    const clean = robots.map(positions);
    const replayActual = (cadence: number) => {
      robots.forEach(robot => robot.reset());
      const fight = createFightV4(2048, build, opponent);
      let seen = 0;
      const tally: Record<string, { hits: number; dents: number; vertices: number; scorches: number }> = {};
      const failed: { frame: number; who: Side; target: Side; slot: string; weapon: string; point: EventV4["point"]; normal: EventV4["normal"] }[] = [];
      while (!fight.done) {
        stepFightV4(fight);
        if (fight.frame % cadence !== 0 && !fight.done) continue;
        robots.forEach((robot, side) => robot.pose(fight.fighters[side], fight, side as Side, fight.frame / 60));
        for (const event of fight.events.slice(seen)) {
          if ((event.kind === "hit" || event.kind === "block") && event.slot) {
            const target = robots[event.target], clay = target.meshes[event.slot].filter(mesh => mesh.userData.clay);
            const before = clay.map(mesh => new Float32Array(mesh.geometry.getAttribute("position").array));
            const beforeColours = clay.map(mesh => digest(mesh.geometry.getAttribute("color").array)), beforeCount = target.dents;
            const key = `${event.weapon}/${event.slot}`, row = tally[key] ??= { hits: 0, dents: 0, vertices: 0, scorches: 0 };
            row.hits++; target.impact(event);
            let changed = 0;
            clay.forEach((mesh, index) => {
              const p = mesh.geometry.getAttribute("position"), original = before[index];
              for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - original[i * 3], p.getY(i) - original[i * 3 + 1], p.getZ(i) - original[i * 3 + 2]) > 1e-7) changed++;
            });
            if (event.weapon === "flamethrower") {
              assert.equal(changed, 0, "Real flame hits must scorch without geometry dents");
              assert.equal(target.dents, beforeCount, "Heat cannot inflate the dent counter");
              if (clay.some((mesh, i) => digest(mesh.geometry.getAttribute("color").array) !== beforeColours[i])) row.scorches++;
            } else {
              if (changed > 0) row.dents++;
              else failed.push({ frame: event.frame, who: event.who, target: event.target, slot: event.slot, weapon: event.weapon ?? "unknown", point: event.point, normal: event.normal });
              row.vertices += changed;
              assert.equal(target.dents - beforeCount, changed > 0 ? 1 : 0, "The dent counter must reflect actual vertex movement");
            }
          }
          if (event.kind === "break" && event.slot) robots[event.who].detach(event.slot, arena, fight.frame);
        }
        seen = fight.events.length; robots.forEach(robot => robot.debris(fight.frame));
      }
      return { tally, failed, positions: robots.map(positions), colours: robots.map(colours), events: fight.events, frames: fight.frame };
    };
    const fine = replayActual(1), coarse = replayActual(4);
    console.log(`ACTUAL ${build.weapon} seed 2048 (${fine.frames} frames): ${JSON.stringify(fine.tally)}`);
    assert.deepEqual(coarse.events, fine.events, "Presentation cadence cannot change the real fight events");
    assert.deepEqual(coarse.positions, fine.positions, "Real combat geometry reconstructs at 60 Hz and 15 Hz render cadence");
    assert.deepEqual(coarse.colours, fine.colours, "Real combat surface damage reconstructs at both cadences");
    assert.deepEqual(coarse.tally, fine.tally, "Every real impact reaches the same vertices at coarse cadence");
    assert.notDeepEqual(fine.positions, clean, `${build.weapon} fight must actually dent armour`);
    assert.deepEqual(fine.failed, [], `Real impacts did not deform their struck slots: ${JSON.stringify(fine.failed)}`);
    const primary = Object.entries(fine.tally).filter(([key]) => key.startsWith(`${build.weapon}/`)).map(([, row]) => row);
    assert(primary.reduce((sum, row) => sum + row.hits, 0) > 0, `The ${build.weapon} scenario must actually land that weapon`);
    if (build.weapon === "flamethrower") assert(primary.some(row => row.scorches > 0), "Real flame contact leaves visible surface colour damage");
    else assert(primary.some(row => row.dents > 0 && row.vertices > 0), `Real ${build.weapon} contacts must displace armour vertices`);
    robots.forEach(robot => robot.reset()); assert.deepEqual(robots.map(positions), clean, "Reset removes actual combat damage");
    robots.forEach(robot => robot.dispose()); assert.equal(arena.children.length, 0, "Real fight replays clean up detached parts");
  }
  console.log("PASS actual hammer, baton, rifle and flame fight impacts, per-slot vertex movement, coarse cadence reconstruction and reset");
  for (const f of ["brute", "hotshot", "deadeye"] as const) {
    const build = preset(f, 1); build.parts.armR = { family: "brute", design: 1 }; build.parts.legL = { family: "hotshot", design: 0 };
    const bot = await createClayRobot(build); bot.pose(createFightV4(1, build, b).fighters[0], state, 0, 0, true);
    const box = new THREE.Box3().setFromObject(bot.root); assert(Number.isFinite(box.max.y) && box.max.y < 4 && box.min.y > -.3);
    bot.dispose();
  }
  console.log("PASS all family assemblies with bulky mixed attachments");
  for (const family of ["brute", "hotshot", "deadeye"] as const) for (const design of [0, 1] as const) for (const weapon of ["rifle", "flamethrower"] as const) {
    const build = preset(family, design); build.weapon = weapon;
    const bot = await createClayRobot(build), fight = createFightV4(2, build, b);
    fight.fighters[0].x = fight.fighters[0].z = fight.fighters[0].yaw = 0;
    for (const distance of [1110, 1300, 1550, 1800, 2000, 2150, 2400, 3000]) {
      fight.fighters[1].x = 0; fight.fighters[1].z = distance;
      bot.pose(fight.fighters[0], fight, 0, 0);
      const tip = bot.tip();
      assert(tip.z < (distance / 1000 - .42) * COMBAT_RENDER_SCALE, `${family} ${design} ${weapon} muzzle enters opponent at ${distance} mm: ${tip.z}`);
    }
    bot.dispose();
  }
  console.log("PASS rifle and flame muzzle clearance on all six family/design assemblies from body contact to firing distance");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { GLTFLoader.prototype.loadAsync = originalLoad; });
