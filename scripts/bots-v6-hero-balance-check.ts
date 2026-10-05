import assert from "node:assert/strict";
import { MAX_FRAMES_V6, presetV6, runFightV6 } from "../src/lib/bots/v6";
import { HERO_COLLISION_VERSION_V6 } from "../src/lib/bots/v6/hero-collision";

// Reviewed geometry diagnostic, separate from the full four-tier catalogue gate.
// Never use a reduced sample or a single split as a release approval.
const styles = ["tank", "speed", "ranged"] as const;
const count = Number(process.env.BOTS_V6_HERO_SEEDS ?? 16);
const selected = process.env.BOTS_V6_HERO_SPLIT ?? "both";
assert.ok(Number.isInteger(count) && count >= 8 && count <= 64);
assert.ok(["train", "heldout", "both"].includes(selected));
const failures: string[] = [];
let games = 0;
for (const split of ["train", "heldout"] as const) {
  if (selected !== "both" && selected !== split) continue;
  const scores = styles.map(() => ({ wins: 0, games: 0 }));
  let splitSideWins = 0;
  for (let a = 0; a < styles.length; a++) for (let b = a + 1; b < styles.length; b++) {
    let wins = 0, sideWins = 0, timeouts = 0;
    for (let i = 1; i <= count; i++) for (const swap of [0, 1]) {
      // Fresh held-out bank: no numeric tuning has used these seeds.
      const seed = (split === "train" ? i * 7919 : 0x4ab93000 + i * 130363) >>> 0;
      const left = presetV6(styles[swap ? b : a], 3, { signature: true, collisionVersion: HERO_COLLISION_VERSION_V6 });
      const right = presetV6(styles[swap ? a : b], 3, { signature: true, collisionVersion: HERO_COLLISION_VERSION_V6 });
      const result = runFightV6(seed, left, right, { autoSpecial: [true, true] });
      const firstStyleWon = result.winner === swap;
      wins += Number(firstStyleWon);
      sideWins += Number(result.winner === 0);
      scores[firstStyleWon ? a : b].wins++;
      scores[a].games++; scores[b].games++;
      timeouts += Number(result.frames === MAX_FRAMES_V6);
      games++;
    }
    const rate = wins / (count * 2), pair = `${styles[a]}/${styles[b]}`;
    splitSideWins += sideWins;
    console.log(JSON.stringify({ split, pair, tier: 3, signature: true, collisionVersion: HERO_COLLISION_VERSION_V6, matches: count * 2, firstStyleWinRate: rate, firstSideWinRate: sideWins / (count * 2), timeouts }));
    if (rate < .3 || rate > .7) failures.push(`${split} ${pair}: ${rate * 100}% (required 30–70%)`);
    if (timeouts) failures.push(`${split} ${pair}: ${timeouts} timeouts`);
  }
  const outcomes = styles.map((style, i) => ({ style, ...scores[i], winRate: scores[i].wins / scores[i].games }));
  for (const score of outcomes) if (score.winRate < .4 || score.winRate > .6) failures.push(`${split} ${score.style}: ${score.winRate * 100}% overall (required 40–60%)`);
  const sideBias = Math.abs(splitSideWins / (count * 6) - .5);
  if (sideBias >= .05) failures.push(`${split} first-side bias ${sideBias * 100}pp (required <5pp)`);
  console.log(JSON.stringify({ split, outcomes, sideBias }));
}
console.log(JSON.stringify({ ok: failures.length === 0 && count >= 16 && selected === "both", scope: "T3 authored-hero diagnostic; does not certify the full catalogue", seedsPerSplit: count, selected, games, failures }));
assert.ok(count >= 16 && selected === "both", "A reduced sample or single split cannot certify even the T3 hero balance gate.");
assert.equal(failures.length, 0, failures.join("\n"));
