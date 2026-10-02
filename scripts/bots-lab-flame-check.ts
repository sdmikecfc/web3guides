import assert from "node:assert/strict";
import { applyControl, createFightV4, FAMILIES, FLAME, hit, preset, resultV4, runFightV4, stepFightV4, WEAPONS } from "../src/app/bots/lab/engine";
const build = preset("hotshot"); build.weapon = "flamethrower";
function ready(range = 2200, angle = 0) {
  const s = createFightV4(6, build, preset("brute"));
  Object.assign(s.fighters[0], { x: 0, z: 0, yaw: 0, nextDodge: 99999, action: { kind: "flamethrower", started: -22, windup: 22, recovery: 114, released: true } });
  Object.assign(s.fighters[1], { x: Math.round(Math.sin(angle) * range), z: Math.round(Math.cos(angle) * range), yaw: 0, nextAction: 99999, nextDodge: 99999 });
  return s;
}
const front = ready(); front.stats[1].shield = 0;
for (let i = 0; i < 47; i++) stepFightV4(front);
assert(front.events.some(e => e.kind === "hit" && e.weapon === "flamethrower"));
assert(front.fighters[1].burnUntil > front.frame);
for (const s of [ready(5000), ready(2200, Math.PI / 2)]) {
  for (let i = 0; i < 35; i++) stepFightV4(s);
  assert(!s.events.some(e => e.kind === "hit"), "flame cannot hit outside its cone/range");
}
const interrupted = ready(); interrupted.fighters[0].action!.released = false;
applyControl(interrupted, 0, "stun", 1);
for (let i = 0; i < 20; i++) stepFightV4(interrupted);
assert(!interrupted.events.some(e => e.kind === "hit" && e.who === 0));
const active = ready(); applyControl(active, 0, "knockdown", 1);
for (let i = 0; i < 50; i++) stepFightV4(active);
assert(!active.events.some(e => e.kind === "hit" && e.who === 0), "control extinguishes an already released burst");
const shield = ready(); shield.fighters[1].yaw = Math.PI * 1000;
for (let i = 0; i < 3; i++) hit(shield, 0, "flamethrower");
assert(shield.events.some(e => e.kind === "block")); assert.equal(shield.fighters[1].burnUntil, 0, "blocked heat does not ignite clay");
const burn = ready(); for (let i = 0; i < 3; i++) hit(burn, 0, "flamethrower");
const expiry = burn.fighters[1].burnUntil;
assert(expiry > 0);
for (const f of burn.fighters) { f.action = null; f.nextAction = 99999; }
burn.fighters[0].armour[3] = 0;
while (burn.frame < expiry + 60) stepFightV4(burn);
const ticks = burn.events.filter(e => e.kind === "burn");
assert(ticks.length > 0 && ticks.every(e => e.frame < expiry && e.damage! <= FLAME.burnDamage), "burn continues after source arm loss and expires");
{
  const s = ready();
  s.fighters[0].action!.released = false; s.fighters[0].armour[3] = 0; s.fighters[0].action = null;
  for (let i = 0; i < 180 && !s.done; i++) stepFightV4(s);
  assert(!s.events.some(e => e.kind === "flame" || (e.kind === "hit" && e.who === 0 && e.weapon === "flamethrower")));
}
let matches = 0;
for (const family of FAMILIES) for (const weapon of WEAPONS) for (let seed = 1; seed <= 12; seed++) {
  const a = preset(family); a.weapon = "flamethrower"; a.parts.armL = { family: FAMILIES[seed % 3], design: (seed % 2) as 0 | 1 };
  const b = preset(FAMILIES[(seed + 1) % 3], 1); b.weapon = weapon;
  const s = runFightV4(seed, a, b); assert(s.done && s.events.some(e => e.kind === "hit" || e.kind === "block"));
  assert.deepEqual(resultV4(s), resultV4(runFightV4(seed, a, b))); matches++;
}
console.log(`PASS flame cone/range, interruptions, shield protection, bounded burn duration, arm loss, and ${matches} repeatable mixed-weapon fights`);
