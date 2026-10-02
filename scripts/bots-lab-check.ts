import assert from "node:assert/strict";
import { applyControl, ARENA_RADIUS, canonicalBuild, CAP, createFightV4, FAMILIES, hashV4, hit, preset, resultV4, runFightV4, shieldFacing, SLOTS, stepFightV4, type StateV4 } from "../src/app/bots/lab/engine";
let checks = 0;
function check(name: string, fn: () => void) { fn(); checks++; console.log("PASS", name); }
check("all families and mixed builds terminate, stay bounded, and reproduce exactly", () => {
  let fights = 0; const counts: Record<string, number> = {}; const rows: string[] = [];
  for (const a of FAMILIES) for (const b of FAMILIES) {
    let wins = 0, frames = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const left = preset(a), right = preset(b, 1);
      if (seed % 3 === 0) { left.parts.legL = { family: b, design: 0 }; left.parts.head = { family: b, design: 1 }; }
      const s = createFightV4(seed, left, right);
      while (!s.done) {
        stepFightV4(s);
        for (const f of s.fighters) { assert(Number.isInteger(f.x) && Number.isInteger(f.z)); assert(Math.hypot(f.x, f.z) < ARENA_RADIUS + 2); assert(f.armour.every(n => Number.isInteger(n) && n >= 0)); }
        assert(s.frame <= CAP);
      }
      const repeat = runFightV4(seed, left, right); assert.deepEqual(resultV4(s), resultV4(repeat));
      for (const e of s.events) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      assert(s.events.some(e => e.kind === "hit" || e.kind === "block"), `${a}/${b} seed ${seed} had no contact`); fights++; wins += s.winner === 0 ? 1 : 0; frames += s.frame;
    }
    rows.push(`${a}/${b}: ${wins}/24 left wins, ${(frames / 24 / 60).toFixed(1)}s`);
  }
  for (const event of ["shot", "block", "stun", "knockdown", "dodge", "break", "interrupt"]) assert(counts[event] > 0, `${event} never occurs`);
  console.log(rows.join("\n")); console.log(`${fights} repeatable fights`, counts);
});
check("control never refreshes or chains through recovery protection", () => {
  const s = createFightV4(1, preset("brute"), preset("hotshot")); s.frame = 100;
  assert(applyControl(s, 1, "stun", 0)); assert.equal(s.fighters[1].stunnedUntil, 124); assert.equal(s.fighters[1].immuneUntil, 244);
  for (const frame of [101, 123, 124, 243]) { s.frame = frame; assert(!applyControl(s, 1, "knockdown", 0)); }
  s.frame = 244; assert(applyControl(s, 1, "knockdown", 0)); assert.equal(s.fighters[1].downUntil, 316); assert.equal(s.fighters[1].immuneUntil, 436);
});
check("fully mixed independent sockets and all three weapons stay playable", () => {
  for (let seed = 100; seed < 164; seed++) {
    const build = preset(FAMILIES[seed % 3]);
    SLOTS.forEach((slot, i) => { build.parts[slot] = { family: FAMILIES[(seed * (i + 3) + i) % 3], design: ((seed >> (i % 5)) & 1) as 0 | 1 }; });
    const s = runFightV4(seed, build, preset(FAMILIES[(seed + 1) % 3], 1));
    assert(s.done && s.frame <= CAP); assert(s.events.some(e => e.kind === "hit" || e.kind === "block"), `mixed seed ${seed} had no contact`);
    assert.deepEqual(resultV4(s), resultV4(runFightV4(seed, build, preset(FAMILIES[(seed + 1) % 3], 1))));
  }
});
check("frontal shields block, rear shots bypass them, and control cancels an unreleased shot", () => {
  const s = createFightV4(9, preset("deadeye"), preset("brute")), f = s.fighters[1];
  f.yaw = 1571; assert(shieldFacing(s, 1, f.x + 1000, f.z)); assert(!shieldFacing(s, 1, f.x - 1000, f.z));
  f.action = { kind: "hammer", started: 0, windup: 66, recovery: 51, released: false };
  assert(applyControl(s, 1, "stun", 0)); assert.equal(f.action, null); assert(s.events.some(e => e.kind === "interrupt"));
  function strike(front: boolean) { const t = createFightV4(23, preset("deadeye"), preset("brute")); t.fighters[1].yaw = front ? -1571 : 1571; for (let i = 0; i < 3; i++) hit(t, 0, "rifle"); return t; }
  const front = strike(true), rear = strike(false); assert(front.events.some(e => e.kind === "block")); assert(!rear.events.some(e => e.kind === "block")); assert(rear.fighters[0].dealt > front.fighters[0].dealt);
});
check("arm loss disables ranged attacks, leg loss disables rolls, and range prevents phantom melee hits", () => {
  const s = createFightV4(4, preset("deadeye"), preset("hotshot")); s.fighters[0].armour[3] = 0; s.fighters[1].armour[4] = 0;
  while (!s.done) stepFightV4(s);
  assert(!s.events.some(e => e.who === 0 && e.kind === "shot")); assert(!s.events.some(e => e.who === 1 && e.kind === "dodge"));
  const far = createFightV4(1, preset("brute"), preset("brute"));
  far.fighters[0].action = { kind: "hammer", started: -66, windup: 66, recovery: 51, released: false };
  stepFightV4(far); assert(far.events.some(e => e.kind === "miss")); assert(!far.events.some(e => e.kind === "hit"));
  const unarmed = createFightV4(1, preset("brute"), preset("hotshot")); unarmed.fighters[0].armour[2] = unarmed.fighters[0].armour[3] = 0;
  while (!unarmed.done) stepFightV4(unarmed);
  assert(!unarmed.events.some(e => e.who === 0 && ["windup", "hit", "shot"].includes(e.kind)), "missing both arms prevents phantom punches");
});
check("input snapshots are canonical and isolated from subsequent equipment edits", () => {
  const a = preset("hotshot"), s = createFightV4(0, a, preset("brute")), before = hashV4(s.builds);
  a.weapon = "rifle"; a.parts.head.family = "deadeye"; assert.equal(hashV4(s.builds), before);
  assert.throws(() => canonicalBuild({ ...a, parts: {} } as typeof a));
  assert.throws(() => createFightV4(-1, a, a));
  assert.deepEqual(Object.keys(s.builds[0].parts), SLOTS);
});
console.log(`${checks} Combat Lab checks passed.`);
