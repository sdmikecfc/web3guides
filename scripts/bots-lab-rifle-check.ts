import assert from "node:assert/strict";
import { createFightV4, preset, RIFLE, stepFightV4 } from "../src/app/bots/lab/engine";

const crowded = createFightV4(2, preset("deadeye"), preset("hotshot"));
crowded.frame = 48;
Object.assign(crowded.fighters[0], { x: 0, z: 0, nextDodge: 99999, action: { kind: "rifle", started: 0, windup: 49, recovery: 49, released: false } });
Object.assign(crowded.fighters[1], { x: 0, z: 1450, nextAction: 99999 });
stepFightV4(crowded);
assert(!crowded.events.some(e => e.kind === "shot"), "crowding prevents a point-blank shot");
assert(crowded.events.some(e => e.kind === "interrupt" && e.who === 0), "close pressure cancels aim");
assert(crowded.fighters[0].moveZ < 0, "the rifle withdraws instead of standing still");

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
  fights++;
}
assert(escapes > 0 && shots > 0);
console.log(`PASS close-range aim cancellation, retreat during recovery, escape cooldown and firing clearance across ${fights} fights (${shots} shots, ${escapes} rifle escapes)`);
