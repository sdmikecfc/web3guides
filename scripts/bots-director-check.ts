/** Pure presentation regressions: real combat logs plus focused equipment-loss cases.
 * Run with the repo's TypeScript runner. Never records or changes an engine baseline. */
import assert from "node:assert/strict";
import { directFight, activeAttack, actionTime, ringPosition } from "../src/app/bots/_view/fight-director";
import { CANON } from "../src/app/bots/_engine/catalog";
import { runFight as legacyFight, fightHash } from "../src/app/bots/_engine/resolve";
import { fnv1a } from "../src/app/bots/_engine/rng";
import { runFight } from "../src/lib/bots/combat";
import { SHOWCASE } from "../src/lib/bots/showcase";
import { combatPart, modularBuild } from "../src/lib/bots/combat-model";
import { gameCard } from "../src/lib/bots/beginner-catalog";
import type { Build, FightEvent, Part, Side } from "../src/app/bots/_engine/parts";

let checks = 0, failures = 0;
function check(name: string, test: () => void) {
  checks++;
  try { test(); console.log(`PASS ${name}`); }
  catch (e) { failures++; console.error(`FAIL ${name}: ${e instanceof Error ? e.message : e}`); }
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(freeze); }
  return v;
}
function piece(id: string): Part {
  const c = gameCard(id); assert(c, `Unknown test part ${id}`);
  return { id: c.id, s: [...c.s], ...(c.color ? { paint: c.color } : {}) };
}
function legs(left: string, right = left): Build {
  const b = SHOWCASE.a;
  return modularBuild(b.head, b.torso, combatPart(b, "armL"), combatPart(b, "armR"), piece(left), piece(right), b.weapon);
}
const boot = legs("legs.sprocketPegs");
const contacts = (count = 15): FightEvent[] => Array.from({ length: count }, (_, i) => ({ t: "hit", f: 30 + i * 45, who: 0, part: 1, dmg: 1, crit: 0 }));

check("every real hit, miss and block has exactly one directed contact at its original frame", () => {
  const cases: readonly (readonly [Build, Build])[] = [
    [CANON.T1, CANON.T1], [CANON.T4, CANON.T4], [SHOWCASE.a, SHOWCASE.b],
    [legs("legs.pistonTreads", "legs.sprocketPegs"), SHOWCASE.b],
  ];
  let count = 0; const kinds = new Set<string>();
  for (const builds of cases) for (let seed = 1; seed <= 40; seed++) {
    const fight = runFight(seed, builds[0], builds[1]);
    const before = JSON.stringify(fight.st);
    const log = freeze(fight.st.log), originals = log.filter(e => e.t === "hit" || e.t === "miss" || e.t === "block");
    const direction = directFight(log, freeze(builds));
    assert.equal(direction.attacks.length, originals.length);
    assert.equal(direction.finalFrame, log[log.length - 1]?.f ?? 0);
    originals.forEach((event, i) => {
      assert(event.t === "hit" || event.t === "miss" || event.t === "block");
      kinds.add(event.t); count++;
      const a = direction.attacks[i];
      const attacker: Side = event.t === "block" ? (event.who === 0 ? 1 : 0) : event.who;
      assert.equal(a.index, i); assert.equal(a.frame, event.f); assert.equal(a.attacker, attacker);
      assert.equal(a.defender, attacker === 0 ? 1 : 0); assert.equal(a.outcome, event.t);
      assert.equal(a.part, event.t === "hit" ? event.part : event.t === "block" ? event.arm : 1);
      assert.equal(a.strong, event.t === "hit" && !!event.crit);
      assert(a.begin <= a.frame && a.end >= a.frame, `contact outside animation: ${seed}/${i}`);
      assert.equal(activeAttack(direction, attacker, event.f)?.index, i);
      assert.equal(actionTime(a, event.f), .5, "the contact pose occurs exactly on the engine frame");
      assert(actionTime(a, a.begin) >= 0 && actionTime(a, a.end) <= 1);
    });
    assert.deepEqual(directFight(log, builds), direction);
    assert.equal(JSON.stringify(fight.st), before, "presentation mutated engine state or log");
  }
  assert(count > 1000); assert.deepEqual(Array.from(kinds).sort(), ["block", "hit", "miss"]);
});

check("block actor is the defender and contact uses that defender's actual left/right arm", () => {
  const log: FightEvent[] = [
    { t: "block", f: 30, who: 1, arm: 2, dmg: 2 },
    { t: "block", f: 65, who: 0, arm: 3, dmg: 2 },
  ];
  const a = directFight(log, [boot, boot]).attacks;
  assert.deepEqual(a.map(x => [x.attacker, x.defender, x.part, x.frame]), [[0, 1, 2, 30], [1, 0, 3, 65]]);
});

check("lost right arm removes weapon moves; missing arms/legs select only available moves", () => {
  const log: FightEvent[] = [
    { t: "hit", f: 30, who: 0, part: 1, dmg: 1, crit: 0 },
    { t: "break", f: 40, who: 0, part: 3 },
    { t: "hit", f: 60, who: 0, part: 1, dmg: 1, crit: 0 },
    { t: "break", f: 70, who: 0, part: 2 },
    { t: "hit", f: 90, who: 0, part: 1, dmg: 1, crit: 0 },
    { t: "break", f: 100, who: 0, part: 4 },
    { t: "hit", f: 120, who: 0, part: 1, dmg: 1, crit: 0 },
    { t: "break", f: 130, who: 0, part: 5 },
    { t: "miss", f: 150, who: 0 },
  ];
  const d = directFight(log, [boot, boot]);
  assert.deepEqual(d.attacks.slice(1).map(a => a.move), ["punch", "kick", "shove", "shove"]);
  assert.deepEqual(d.breakFrames[0], [Infinity, Infinity, 70, 40, 100, 130]);
  assert(d.attacks.filter(a => a.frame > 40).every(a => ["punch", "kick", "shove"].includes(a.move)));
  assert(d.attacks.filter(a => a.frame > 100).every(a => a.move !== "kick"));
  for (const side of [0, 1] as const) for (const lost of [4, 5] as const) {
    const seq: FightEvent[] = [{ t: "break", who: side, part: lost, f: 0 }, ...contacts().map(e => ({ ...e, who: side }))];
    assert(directFight(seq, [boot, boot]).attacks.every(a => a.move !== "kick"));
  }
});

check("wheel and track moulds never kick, including unlike legs and neutral beginner IDs", () => {
  // These are the actual geometry variants: peeper=v1 wheel, piston=v5 track.
  for (const id of ["legs.peeperStilts", "legs.pistonTreads", "beginner.v1.legs.peeperStilts", "beginner.v1.legs.pistonTreads"]) {
    for (const builds of [[legs(id, "legs.sprocketPegs"), boot], [legs("legs.sprocketPegs", id), boot]] as const) {
      const attacks = directFight(contacts(), builds).attacks;
      assert(attacks.every(a => a.move !== "kick"), `${id} incorrectly produced a kick`);
    }
  }
  assert(directFight(contacts(), [legs("legs.lanternStruts"), boot]).attacks.some(a => a.move === "kick"), "real boot moulds should retain kicking variety");
});

check("ring positions are deterministic, finite and safely within the physical mat", () => {
  const fight = runFight(75, SHOWCASE.a, SHOWCASE.b), d = directFight(fight.st.log, [SHOWCASE.a, SHOWCASE.b]);
  const matRadius = 5.86 * .94; // The actual arena floor, including its stage scale.
  const bodyAndWeaponMargin = 2.2;
  for (const seed of [0, 1, 75, 85, 0xffffffff]) for (let frame = 0; frame <= 5400; frame += 3) {
    const positions = ([0, 1] as const).map(side => {
      const p = ringPosition(d, side, frame, seed);
      assert.deepEqual(p, ringPosition(d, side, frame, seed));
      assert(Object.values(p).every(Number.isFinite));
      assert(Math.hypot(p.x, p.z) + bodyAndWeaponMargin < matRadius, `left the mat at ${seed}/${frame}`);
      assert(p.advance >= 0 && p.advance <= 1); return p;
    });
    assert(Math.hypot(positions[1].x - positions[0].x, positions[1].z - positions[0].z) > 1.8, "fighter roots overlap");
  }
});

check("moving between contact envelopes cannot teleport a fighter in one frame", () => {
  // Regression: expiring the preceding contact at frame+17 caused a .367-unit snap here.
  for (const seed of [7, 75, 85]) {
    const fight = runFight(seed, SHOWCASE.a, SHOWCASE.b), d = directFight(fight.st.log, [SHOWCASE.a, SHOWCASE.b]);
    for (const side of [0, 1] as const) {
      let last = ringPosition(d, side, 0, seed);
      for (let frame = 1; frame <= d.finalFrame + 90; frame++) {
        const p = ringPosition(d, side, frame, seed);
        const step = Math.hypot(p.x - last.x, p.z - last.z);
        assert(step < .08, `teleport ${step.toFixed(3)} units at seed${seed}/frame${frame}/side${side}`);
        last = p;
      }
    }
  }
});

check("directing all 200 legacy baseline fights leaves every original hash and rollup unchanged", () => {
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const roll = (rows: string[]) => hex(fnv1a(rows.join(",")));
  const expected = ["fa0df511", "98c10093", "e750eafb", "9e5392ed"];
  const all: string[] = [];
  ([CANON.T1, CANON.T2, CANON.T3, CANON.T4] as const).forEach((build, i) => {
    const hashes: string[] = [];
    for (let seed = 0; seed < 50; seed++) {
      const fight = legacyFight(fnv1a(`bots-baseline-${seed}`), build, build);
      const before = fightHash(fight.st);
      const d = directFight(freeze(fight.st.log), freeze([build, build] as const));
      for (const a of d.attacks) { activeAttack(d, a.attacker, a.frame); actionTime(a, a.frame); ringPosition(d, a.attacker, a.frame, seed); }
      assert.equal(fightHash(fight.st), before); hashes.push(hex(before));
    }
    assert.equal(roll(hashes), expected[i]); all.push(...hashes);
  });
  assert.equal(roll(all), "9fd36ca7");
});

console.log(`${checks - failures}/${checks} director checks passed.`);
if (failures) process.exitCode = 1;
