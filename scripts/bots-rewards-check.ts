/**
 * BATTLE BOTS REWARDS CHECK - the table-driven gate that keeps
 * src/app/bots/_engine/rewards.ts equal BY VALUE to the tracking module's
 * doma-reporter/modules/battlebots/coins.js (the source of truth). Shaped
 * like scripts/bots-harness.ts (report(), ALL CHECKS GREEN / exit 1).
 *
 *   npx tsx scripts/bots-rewards-check.ts
 *
 * Two layers:
 *  (t) the FROZEN table below: every row is a number copied from coins.js
 *      by hand, so the web side is checked even when the bot repo is not on
 *      this machine.
 *  (m) the MIRROR: when doma-reporter sits beside this repo (or BB_COINS_JS
 *      points at coins.js), the same rows are replayed through the module
 *      itself and both answers must agree. Read-only; the module is never
 *      edited from here.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import {
  BATTLE_COINS_DAY_CEILING,
  DEFENDER_GHOST_WIN_COINS,
  PVE,
  STAKE_MAX,
  STAKE_MIN,
  assertBattleCoinsDay,
  assertStake,
  battleCoinsPve,
  battleCoinsPvp,
  battlePointsPve,
  battlePointsPvp,
  fightRewards,
  gapMultiplier,
  gapWords,
  houseBonus,
  levelForXp,
  repeatDecay,
  weightClassIndex,
  weightClassOf,
} from "../src/app/bots/_engine/rewards";

let failures = 0;
function report(ok: boolean, tag: string, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${tag}  ${detail}`);
}

// ── (t) the frozen table, copied from coins.js by value ─────────────────────

const PVE_EXPECT = {
  easy: { win: 10, lose: 3, points: 1 },
  medium: { win: 20, lose: 5, points: 2 },
  hard: { win: 40, lose: 8, points: 4 },
} as const;
const GAP_EXPECT: [number, number][] = [[-3, 0.25], [-2, 0.25], [-1, 0.5], [0, 1], [1, 1.5], [2, 2], [3, 2]];
const DECAY_EXPECT: [number, number][] = [[0, 1], [1, 0.5], [2, 0.25], [7, 0.25]];
/** stake, class gap, won, coins (2 x S plus the floored house bonus) */
const PVP_COINS_EXPECT: [number, number, boolean, number][] = [
  [25, 0, true, 50],
  [25, 0, false, 0],
  [25, 1, true, 62], // 50 + floor(12.5)
  [25, 2, true, 75],
  [25, 3, true, 75], // max 100 percent
  [25, -1, true, 50], // challenging down: no bonus
  [100, 1, true, 250],
  [500, 2, true, 1500],
  [500, -2, false, 0],
];
/** class gap, won, prior fights vs the same wallet, points */
const PVP_POINTS_EXPECT: [number, boolean, number, number][] = [
  [0, true, 0, 5],
  [1, true, 0, 7.5],
  [2, true, 0, 10],
  [-1, true, 0, 2.5],
  [-2, true, 0, 1.25],
  [0, false, 0, 1],
  [0, true, 1, 2.5],
  [0, true, 2, 1.25],
  [2, false, 3, 0.25],
];

for (const d of ["easy", "medium", "hard"] as const) {
  const e = PVE_EXPECT[d];
  report(PVE[d].win === e.win && PVE[d].lose === e.lose && PVE[d].points === e.points, "(t) pve", `${d}: ${PVE[d].win} / ${PVE[d].lose} coins, ${PVE[d].points} points`);
  report(battleCoinsPve(d, true) === e.win && battleCoinsPve(d, false) === e.lose, "(t) pve coins", `${d} win ${battleCoinsPve(d, true)} lose ${battleCoinsPve(d, false)}`);
  report(battlePointsPve(d, true) === e.points && battlePointsPve(d, false) === 0, "(t) pve points", `${d} win ${battlePointsPve(d, true)} lose 0`);
}
report(STAKE_MIN === 25 && STAKE_MAX === 500, "(t) stake range", `${STAKE_MIN}..${STAKE_MAX}`);
for (const [gap, want] of GAP_EXPECT) report(gapMultiplier(gap) === want, "(t) gap", `gap ${gap} -> ${gapMultiplier(gap)}`);
for (const [n, want] of DECAY_EXPECT) report(repeatDecay(n) === want, "(t) decay", `prior ${n} -> ${repeatDecay(n)}`);
for (const [stake, gap, won, want] of PVP_COINS_EXPECT) {
  report(battleCoinsPvp(stake, gap, won) === want, "(t) pvp coins", `stake ${stake} gap ${gap} ${won ? "win" : "loss"} -> ${battleCoinsPvp(stake, gap, won)}`);
}
for (const [gap, won, prior, want] of PVP_POINTS_EXPECT) {
  report(battlePointsPvp(gap, won, prior) === want, "(t) pvp points", `gap ${gap} ${won ? "win" : "loss"} prior ${prior} -> ${battlePointsPvp(gap, won, prior)}`);
}

// the bonus is floored, never rounded up (whole coins)
report(houseBonus(25, 1) === 12 && houseBonus(75, 1) === 37, "(t) bonus floors", `25 -> ${houseBonus(25, 1)}, 75 -> ${houseBonus(75, 1)}`);

// the breakers throw
let threw = 0;
for (const bad of [24, 501, 25.5, -25, Number.NaN]) {
  try {
    assertStake(bad);
  } catch {
    threw += 1;
  }
}
report(threw === 5, "(t) stake breaker", `${threw} of 5 bad stakes threw`);
let ceilingThrew = false;
try {
  assertBattleCoinsDay(BATTLE_COINS_DAY_CEILING - 100, 1500);
} catch {
  ceilingThrew = true;
}
report(ceilingThrew, "(t) day ceiling", `${BATTLE_COINS_DAY_CEILING - 100} + 1500 throws`);
let okBelow = true;
try {
  assertBattleCoinsDay(0, 1500);
} catch {
  okBelow = false;
}
report(okBelow, "(t) day ceiling", "0 + 1500 passes");

// weight classes are the bot tier bands
report(weightClassIndex(5) === 0 && weightClassIndex(24) === 0 && weightClassIndex(25) === 1 && weightClassIndex(54) === 1 && weightClassIndex(55) === 2 && weightClassIndex(79) === 2 && weightClassIndex(80) === 3 && weightClassIndex(100) === 3, "(t) classes", `light <25, middle 25..54, heavy 55..79, super 80+ (${weightClassOf(5)} ${weightClassOf(30)} ${weightClassOf(60)} ${weightClassOf(90)})`);

// levels: L2 5, L3 12, L4 20, L5 30, L6 42, L7 56, L8 72, L9 90, L10 110
const levelRows: [number, number][] = [[0, 1], [4, 1], [5, 2], [12, 3], [20, 4], [29, 4], [30, 5], [42, 6], [56, 7], [72, 8], [90, 9], [110, 10], [999, 10]];
report(levelRows.every(([xp, l]) => levelForXp(xp) === l), "(t) levels", levelRows.map(([xp, l]) => `${xp}:${levelForXp(xp)}${levelForXp(xp) === l ? "" : "!"}`).join(" "));

// the one-fight table: net movement per side
{
  const win = fightRewards({ mode: "pvp", attackerWon: true, classGap: 1, stake: 100, priorVsOpponent: 0 });
  report(win.stakeHeld === 100 && win.stakePayout === 250 && win.houseBonus === 50 && win.attacker.points === 7.5 && win.defender.coins === 0 && !win.attackerRepair, "(t) pvp win", `hold 100, payout ${win.stakePayout}, bonus ${win.houseBonus}, points ${win.attacker.points}`);
  const loss = fightRewards({ mode: "pvp", attackerWon: false, classGap: 1, stake: 100, priorVsOpponent: 0 });
  report(loss.stakeHeld === 100 && loss.stakePayout === 100 && loss.houseBonus === 0 && loss.attacker.points === 1 && loss.defender.coins === DEFENDER_GHOST_WIN_COINS && loss.attackerRepair, "(t) pvp loss", `hold 100, defender takes ${loss.stakePayout} + ${loss.defender.coins}, attacker repairs`);
  const pve = fightRewards({ mode: "pve", difficulty: "hard", attackerWon: true, attackerTier: 2, dropRoll: 34 });
  report(pve.attacker.coins === 40 && pve.attacker.points === 4 && pve.attacker.xp === 3 && pve.drop === 3 && !pve.attackerRepair, "(t) pve hard win", `40 coins, 4 points, drop T${pve.drop} on roll 34`);
  const pveMiss = fightRewards({ mode: "pve", difficulty: "hard", attackerWon: true, attackerTier: 2, dropRoll: 35 });
  report(pveMiss.drop === null, "(t) pve drop edge", "roll 35 at 35 percent is no drop");
  const pveLoss = fightRewards({ mode: "pve", difficulty: "easy", attackerWon: false, attackerTier: 1, dropRoll: 0 });
  report(pveLoss.attacker.coins === 3 && pveLoss.attacker.points === 0 && pveLoss.attacker.xp === 1 && pveLoss.drop === null && pveLoss.attackerRepair, "(t) pve easy loss", "3 coins, 0 points, 1 xp, repair");
  const spar = fightRewards({ mode: "spar", attackerWon: false });
  report(spar.attacker.coins === 0 && spar.attacker.points === 0 && spar.attacker.xp === 0 && !spar.attackerRepair && spar.stakeHeld === 0, "(t) spar", "pays nothing, breaks nothing");
}

// the words never carry a dash or a dollar (the dashes are spelled as
// escapes so this file itself stays clean under the dash scan)
const words = [-3, -2, -1, 0, 1, 2, 3].map(gapWords).join(" | ");
report(!/[\u2013\u2014$]/.test(words), "(t) words", words);

// ── (m) the mirror: replay the same rows through coins.js when it is here ───

const candidates = [
  process.env.BB_COINS_JS || "",
  path.resolve(process.cwd(), "..", "trading-bot", "doma-reporter", "modules", "battlebots", "coins.js"),
  path.resolve(process.cwd(), "..", "doma-reporter", "modules", "battlebots", "coins.js"),
].filter(Boolean);
const coinsJs = candidates.find((p) => fs.existsSync(p));
if (!coinsJs) {
  console.log(`SKIP  (m) mirror  coins.js not on this machine (looked at ${candidates.join(", ")})`);
} else {
  type CoinsJs = {
    PVE: Record<string, { win: number; lose: number; points: number }>;
    PVP_STAKE_MIN: number;
    PVP_STAKE_MAX: number;
    battleCoinsPve: (d: string, won: boolean) => number;
    battleCoinsPvp: (stake: number, gap: number, won: boolean) => number;
    battlePointsPve: (d: string, won: boolean) => number;
    battlePointsPvp: (gap: number, won: boolean, prior: number) => number;
    gapMultiplier: (gap: number) => number;
    repeatDecay: (n: number) => number;
  };
  // anchored on the repo's package.json, not import.meta.url: the repo has
  // no "type": "module", so tsx runs this file as CommonJS
  const req = createRequire(path.join(process.cwd(), "package.json"));
  const mod = req(coinsJs) as CoinsJs;
  console.log(`      (m) mirror  ${coinsJs}`);
  for (const d of ["easy", "medium", "hard"] as const) {
    report(mod.PVE[d].win === PVE[d].win && mod.PVE[d].lose === PVE[d].lose && mod.PVE[d].points === PVE[d].points, "(m) pve", `${d} agrees`);
    report(mod.battleCoinsPve(d, true) === battleCoinsPve(d, true) && mod.battleCoinsPve(d, false) === battleCoinsPve(d, false), "(m) pve coins", `${d} agrees`);
    report(mod.battlePointsPve(d, true) === battlePointsPve(d, true) && mod.battlePointsPve(d, false) === battlePointsPve(d, false), "(m) pve points", `${d} agrees`);
  }
  report(mod.PVP_STAKE_MIN === STAKE_MIN && mod.PVP_STAKE_MAX === STAKE_MAX, "(m) stake range", `${mod.PVP_STAKE_MIN}..${mod.PVP_STAKE_MAX}`);
  for (const [gap] of GAP_EXPECT) report(mod.gapMultiplier(gap) === gapMultiplier(gap), "(m) gap", `gap ${gap} agrees (${gapMultiplier(gap)})`);
  for (const [n] of DECAY_EXPECT) report(mod.repeatDecay(n) === repeatDecay(n), "(m) decay", `prior ${n} agrees`);
  for (const [stake, gap, won] of PVP_COINS_EXPECT) report(mod.battleCoinsPvp(stake, gap, won) === battleCoinsPvp(stake, gap, won), "(m) pvp coins", `stake ${stake} gap ${gap} ${won ? "win" : "loss"} agrees (${battleCoinsPvp(stake, gap, won)})`);
  for (const [gap, won, prior] of PVP_POINTS_EXPECT) report(mod.battlePointsPvp(gap, won, prior) === battlePointsPvp(gap, won, prior), "(m) pvp points", `gap ${gap} ${won ? "win" : "loss"} prior ${prior} agrees (${battlePointsPvp(gap, won, prior)})`);
}

console.log(failures === 0 ? "\nALL CHECKS GREEN" : `\n${failures} CHECK(S) RED`);
process.exit(failures === 0 ? 0 : 1);
