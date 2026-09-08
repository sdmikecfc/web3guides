import assert from "node:assert/strict";
import { createFightV4, hit, preset, RIFLE, stepFightV4 } from "../src/app/bots/lab/engine";

const crowded = createFightV4(2, preset("deadeye"), preset("hotshot"));
crowded.frame = 48;
Object.assign(crowded.fighters[0], { x: 0, z: 0, nextDodge: 0, action: { kind: "rifle", started: 0, windup: 49, recovery: 49, released: false } });
Object.assign(crowded.fighters[1], { x: 0, z: 1450, nextAction: 99999 });
stepFightV4(crowded);
assert(!crowded.events.some(e => e.kind === "shot"), "crowding prevents a point-blank shot");
assert(crowded.events.some(e => e.kind === "interrupt" && e.who === 0), "close pressure cancels aim");
assert.equal(crowded.fighters[0].action?.kind, "shove", "the rifle answers close pressure with a shove");
for (let i = 0; i < 40; i++) stepFightV4(crowded);
assert(crowded.events.some(e => e.kind === "hit" && e.weapon === "shove"), "the left arm pushes the opponent");
assert(crowded.events.some(e => e.kind === "dodge" && e.weapon === "rifle"), "the push is followed by a dash");
assert(!crowded.events.some(e => e.kind === "stun" && e.who === 0), "displacement does not grant the rifle a free stun");

for (const missing of [2, 4, 5]) {
  const s = createFightV4(2, preset("deadeye"), preset("hotshot"));
  Object.assign(s.fighters[0], { x: 0, z: 0, nextDodge: 0 }); s.fighters[0].armour[missing] = 0;
  Object.assign(s.fighters[1], { x: 0, z: 1450, nextAction: 99999, nextDodge: 99999 });
  for (let i = 0; i < 45; i++) stepFightV4(s);
  const shove = s.events.some(e => e.who === 0 && e.kind === "windup" && e.weapon === "shove");
  const dash = s.events.some(e => e.who === 0 && e.kind === "dodge" && e.weapon === "rifle");
  assert.equal(shove, missing !== 2, "push-off requires the left arm");
  assert.equal(dash, missing === 2, "either missing leg prevents the dash, while left-arm loss still allows an escape step");
}
const shield = createFightV4(2, preset("deadeye"), preset("brute"));
shield.fighters[1].yaw = Math.round(Math.atan2(shield.fighters[0].x - shield.fighters[1].x, shield.fighters[0].z - shield.fighters[1].z) * 1000);
for (let i = 0; i < 3; i++) hit(shield, 0, "shove");
assert(shield.events.some(e => e.kind === "block")); assert.equal(shield.fighters[1].pushUntil, 0, "a braced shield resists the shove");
shield.fighters[1].dodgeUntil = 23; hit(shield, 0, "shove");
assert.equal(shield.events.at(-1)?.kind, "miss"); assert.equal(shield.fighters[1].pushUntil, 0, "an evaded shove cannot apply knockback");

const recovery = createFightV4(2, preset("deadeye"), preset("hotshot"));
recovery.frame = 60;
Object.assign(recovery.fighters[0], { x: 0, z: 0, nextDodge: 99999, action: { kind: "rifle", started: 0, windup: 49, recovery: 49, released: true } });
Object.assign(recovery.fighters[1], { x: 0, z: 2800, nextAction: 99999 });
stepFightV4(recovery);
assert(recovery.fighters[0].moveZ < 0, "recovery permits retreating footwork");

let fights = 0, escapes = 0, shots = 0;
for (const opponent of ["brute", "hotshot", "deadeye"] as const) for (const seed of [2048, ...Array.from({ length: 16 }, (_, i) => i + 1)]) {
  const s = createFightV4(seed, preset("deadeye"), preset(opponent, 1));
  let lastEscape = -Infinity;
  while (!s.done) {
    const start = s.events.length;
    stepFightV4(s);
    for (const e of s.events.slice(start)) {
      if (e.kind === "dodge" && e.weapon === "rifle" && e.who === 0) {
        assert(s.frame - lastEscape >= RIFLE.escapeCooldown, "escape cannot repeat without cooldown");
        lastEscape = s.frame; escapes++;
      }
      if (e.kind === "shot") {
        // The other fighter can finish its committed lunge later in this step.
        assert(Math.hypot(s.fighters[0].x - s.fighters[1].x, s.fighters[0].z - s.fighters[1].z) >= RIFLE.minimumRange - 120, "shot released inside the opponent");
        shots++;
      }
    }
  }
  assert(s.events.some(e => e.kind === "shot"), "every intact rifle matchup gets a firing opportunity");
  if (seed === 2048 && opponent === "hotshot") {
    assert(s.fighters[0].shots >= 8, "reported matchup must sustain shots beyond the opener");
    assert(s.events.filter(e => e.who === 0 && e.kind === "hit" && e.weapon === "rifle").length >= 5, "follow-up shots must actually connect");
    assert(s.events.some(e => e.who === 0 && e.kind === "hit" && e.weapon === "shove"));
    console.log(`Reported seed 2048: ${s.fighters[0].shots} shots, ${s.fighters[0].dealt} damage, winner ${s.winner}`);
  }
  fights++;
}
assert(escapes > 0 && shots > 0);
console.log(`PASS close-range aim cancellation, retreat during recovery, escape cooldown and firing clearance across ${fights} fights (${shots} shots, ${escapes} rifle escapes)`);
