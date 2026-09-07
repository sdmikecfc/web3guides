/**
 * Domain Kitchen headless soak (ADR-0101): proves world.ts runs renderer-free
 * and deterministically — the same gate discipline as scripts/s5-harness.ts.
 *
 *   1. Two worlds, same seed, 30 sim-minutes each: identical state hashes.
 *   2. A different seed: a different hash (the rng actually feeds the state).
 *   3. Step cost: report ticks/sec so sim regressions show up as numbers.
 *
 * Run: npx tsx scripts/dk-soak.mts
 */

import {
  createWorld,
  hashWorld,
  stepWorld,
} from "../src/app/chef/game/_engine/world";
import { TRATTORIA } from "../src/app/chef/game/_engine/rooms";

const TICKS = 60 * 60 * 30; // 30 sim-minutes at 1/60

function run(seed: string) {
  const w = createWorld(seed, TRATTORIA);
  for (let i = 0; i < TICKS; i++) stepWorld(w, TRATTORIA);
  return w;
}

const t0 = performance.now();
const a = run("dk-soak");
const t1 = performance.now();
const b = run("dk-soak");
const c = run("dk-soak-other");

const ha = hashWorld(a);
const hb = hashWorld(b);
const hc = hashWorld(c);

const ms = t1 - t0;
console.log(`soak: ${TICKS} ticks in ${ms.toFixed(1)}ms (${Math.round(TICKS / (ms / 1000)).toLocaleString()} ticks/sec)`);
console.log(`hash same-seed:  ${ha} vs ${hb} -> ${ha === hb ? "MATCH" : "MISMATCH"}`);
console.log(`hash other-seed: ${hc} -> ${hc !== ha ? "DIFFERS (good)" : "SAME (bad)"}`);
console.log(`end state: tick=${a.tick} t=${a.timeSec.toFixed(1)}s steam=${a.ambient.steam.length} candle=${a.ambient.candle.toFixed(3)}`);

if (ha !== hb) {
  console.error("DETERMINISM FAILURE: same seed diverged");
  process.exit(1);
}
if (hc === ha) {
  console.error("SEED FAILURE: different seed produced identical state");
  process.exit(1);
}
console.log("soak PASS");
