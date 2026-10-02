/** Opt-in presentation checks only. No network, wallets, SQL or baseline writes. */
import assert from "node:assert/strict";
import { actionRingPosition, actionPose, actionClipTime } from "@/app/bots/_view/action-choreography";
import { directFight, actionTime, ringPosition } from "@/app/bots/_view/fight-director";
import { CANON } from "@/app/bots/_engine/catalog";
import { runFight as legacyFight, fightHash } from "@/app/bots/_engine/resolve";
import { fnv1a } from "@/app/bots/_engine/rng";
import { runFight } from "@/lib/bots/combat";
import { SHOWCASE } from "@/lib/bots/showcase";
import { combatPart, modularBuild } from "@/lib/bots/combat-model";
import { gameCard } from "@/lib/bots/beginner-catalog";
import type { Build, FightEvent, Part, Side } from "@/app/bots/_engine/parts";

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freeze);
  }
  return value;
}
function piece(id: string): Part {
  const card = gameCard(id); assert(card, `Unknown fixture ${id}`);
  return { id: card.id, s: [...card.s], ...(card.color ? { paint: card.color } : {}) };
}
function legs(left: string, right = left): Build {
  const build = SHOWCASE.a;
  return modularBuild(build.head, build.torso, combatPart(build, "armL"), combatPart(build, "armR"), piece(left), piece(right), build.weapon);
}
let checks = 0, failures = 0, frameSamples = 0, contacts = 0;
let maxRadius = 0, maxStep = 0, maxLift = 0, maxDodge = 0;
function check(name: string, work: () => void) {
  checks++;
  try { work(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error instanceof Error ? error.message : error}`); }
}

check("frozen real logs repeat exactly; action movement is finite, inside the ring and continuous", () => {
  const cases: readonly (readonly [Build, Build])[] = [
    [CANON.T1, CANON.T1], [CANON.T4, CANON.T4], [SHOWCASE.a, SHOWCASE.b],
    [legs("legs.pistonTreads", "legs.sprocketPegs"), legs("legs.sprocketPegs")],
  ];
  for (const builds of cases) for (const seed of [1, 7, 75, 85]) {
    const fight = runFight(seed, builds[0], builds[1]);
    const original = JSON.stringify(fight.st);
    const log = freeze(fight.st.log), direction = freeze(directFight(log, freeze(builds)));
    const regularBefore = ([0, 1] as const).map(side => [0, 30, direction.finalFrame].map(frame => ringPosition(direction, side, frame, seed)));
    for (const side of [0, 1] as const) {
      let last = actionRingPosition(direction, side, 0, seed);
      for (let frame = 0; frame <= direction.finalFrame + 90; frame++) {
        const position = actionRingPosition(direction, side, frame, seed);
        const pose = actionPose(direction, side, frame);
        assert.deepEqual(position, actionRingPosition(direction, side, frame, seed));
        assert.deepEqual(pose, actionPose(direction, side, frame));
        assert(Object.values(position).every(Number.isFinite), `non-finite root at ${seed}/${side}/${frame}`);
        assert(Object.values(pose).every(Number.isFinite), `non-finite pose at ${seed}/${side}/${frame}`);
        const radius = Math.hypot(position.x, position.z), step = Math.hypot(position.x - last.x, position.z - last.z);
        assert(radius < 3.15, `root radius ${radius.toFixed(5)} at ${seed}/${side}/${frame}`);
        assert(step <= .3 + 1e-12, `root step ${step.toFixed(5)} at ${seed}/${side}/${frame}`);
        assert(position.advance >= 0 && position.advance <= 1);
        assert(pose.lift >= -1e-10, `root below the floor at ${seed}/${side}/${frame}`);
        for (const part of [4, 5]) if (frame > direction.breakFrames[side][part]) {
          assert(Math.abs(pose.lift) < 1e-10, `hop after leg ${part} loss at ${seed}/${side}/${frame}`);
          assert(Math.abs(pose.dodge) < 1e-10, `dodge after leg ${part} loss at ${seed}/${side}/${frame}`);
        }
        maxRadius = Math.max(maxRadius, radius); maxStep = Math.max(maxStep, step);
        maxLift = Math.max(maxLift, pose.lift); maxDodge = Math.max(maxDodge, Math.abs(pose.dodge));
        frameSamples++; last = position;
      }
    }
    const regularAfter = ([0, 1] as const).map(side => [0, 30, direction.finalFrame].map(frame => ringPosition(direction, side, frame, seed)));
    assert.deepEqual(regularAfter, regularBefore, "action sampling changes ordinary ring paths");
    assert.deepEqual(directFight(log, builds), direction, "action sampling changes directed contacts");
    assert.equal(JSON.stringify(fight.st), original, "action sampling changes engine results");
  }
});

check("clip retiming retains exact contact phase and hops land on original engine contacts", () => {
  for (const seed of [1, 7, 75, 85, 0xffffffff]) {
    const builds = freeze([legs("legs.sprocketPegs"), SHOWCASE.b] as const);
    const fight = runFight(seed, builds[0], builds[1]);
    const direction = freeze(directFight(freeze(fight.st.log), builds));
    for (const action of direction.attacks) {
      assert.equal(actionClipTime(action, action.frame), .5, `contact phase drift at ${seed}/${action.index}`);
      assert.equal(actionTime(action, action.frame), .5, "ordinary clip timing changed");
      for (const side of [action.attacker, action.defender]) {
        assert(Math.abs(actionPose(direction, side, action.frame).lift) < 1e-10, `contact is airborne at ${seed}/${action.index}/side${side}`);
      }
      let last = -Infinity;
      for (let frame = action.begin - 2; frame <= action.end + 2; frame += .25) {
        const phase = actionClipTime(action, frame);
        assert(Number.isFinite(phase) && phase >= 0 && phase <= 1);
        assert(phase >= last, `clip time reversed at ${seed}/${action.index}/${frame}`);
        assert.equal(phase, actionClipTime(action, frame)); last = phase;
      }
      contacts++;
    }
  }
  assert(contacts > 20, "test needs real repeated contacts");
});

check("either leg loss suppresses hops and dodges even inside an ongoing action", () => {
  const boot = legs("legs.sprocketPegs");
  for (const side of [0, 1] as const) for (const part of [4, 5] as const) for (const loss of [16, 48, 94]) {
    const opponent: Side = side === 0 ? 1 : 0;
    const events: FightEvent[] = [
      { t: "hit", f: 30, who: side, part: 1, dmg: 3, crit: 1 },
      { t: "miss", f: 50, who: opponent },
      { t: "hit", f: 75, who: side, part: 0, dmg: 4, crit: 1 },
      { t: "miss", f: 105, who: opponent },
      { t: "hit", f: 135, who: side, part: 1, dmg: 3, crit: 0 },
      { t: "break", f: loss, who: side, part },
    ].sort((a, b) => a.f - b.f) as FightEvent[];
    const direction = freeze(directFight(freeze(events), freeze([boot, boot] as const)));
    for (let frame = loss + .25; frame <= 170; frame += .25) {
      const pose = actionPose(direction, side, frame);
      assert(Math.abs(pose.lift) < 1e-10, `hop with missing leg ${part} after ${loss} at ${frame}`);
      assert(Math.abs(pose.dodge) < 1e-10, `dodge with missing leg ${part} after ${loss} at ${frame}`);
    }
  }
});

check("all 200 frozen legacy result hashes and original director contacts remain unchanged", () => {
  const hex = (number: number) => (number >>> 0).toString(16).padStart(8, "0");
  const roll = (rows: string[]) => hex(fnv1a(rows.join(",")));
  const expected = ["fa0df511", "98c10093", "e750eafb", "9e5392ed"], all: string[] = [];
  [CANON.T1, CANON.T2, CANON.T3, CANON.T4].forEach((build, index) => {
    const hashes: string[] = [];
    for (let seed = 0; seed < 50; seed++) {
      const fight = legacyFight(fnv1a(`bots-baseline-${seed}`), build, build), before = fightHash(fight.st);
      const log = freeze(fight.st.log), direction = freeze(directFight(log, freeze([build, build] as const)));
      for (const action of direction.attacks) for (const frame of [action.begin, action.frame, action.end]) {
        actionRingPosition(direction, action.attacker, frame, seed);
        actionPose(direction, action.attacker, frame); actionClipTime(action, frame);
      }
      assert.equal(fightHash(fight.st), before);
      assert.deepEqual(directFight(log, [build, build]), direction);
      hashes.push(hex(before));
    }
    assert.equal(roll(hashes), expected[index]); all.push(...hashes);
  });
  assert.equal(roll(all), "9fd36ca7");
});

console.log(JSON.stringify({ checks: checks - failures, total: checks, frameSamples, contacts, maxRadius, maxStep, maxLift, maxDodge, engineBaseline: "9fd36ca7", liveServices: false }));
if (failures) process.exitCode = 1;
