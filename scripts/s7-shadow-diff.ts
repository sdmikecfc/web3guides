/**
 * THE SHADOW-FIXTURE DIFF (ADR-0129, the Wednesday gate) - proves the engine
 * carve against the LIVE Season 6, field by field, cent by cent.
 *
 *   npx tsx scripts/s7-shadow-diff.ts
 *
 * WHAT IT PROVES TODAY (scope grows as the carve grows; the gate reports its
 * own coverage honestly):
 *  1. MONEY: the live S6 target rows fed through BOTH the shipped S6 math
 *     (lib/s6/data finalizeTargetMoney) and the engine's carved math
 *     (src/season/money with the S6 fixture's config) - every slice, every
 *     secured figure, and the pool aggregates must agree to the cent.
 *  2. PEAKS: paidPeakPct agreement per target (the ADR-0076 floor rule).
 *  3. THEME: the S6 fixture's declared tokens vs the LIVE theme the site
 *     serves (code default + DB overlay) - a fixture that drifts from reality
 *     would make every later diff a lie.
 *  4. WINDOW: the fixture's season window vs the live s6_season config row.
 *
 * NOT YET COVERED (lands with the reader carve): readTargets itself, strings
 * surfaces, the map. The gate prints this so nobody mistakes partial green
 * for full green.
 */
// Zero-dep .env.local loader (no dotenv in this repo; Next loads env itself
// in-server, but this gate runs standalone): parse KEY=VALUE lines, no
// expansion, existing process env wins.
import * as fsEnv from "node:fs";
try {
  for (const ln of fsEnv.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(ln.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch { /* absent env file: the strict snapshot will say so */ }

import { getSeasonSnapshotUncached as s6Snapshot, paidPeakPct as s6Peak } from "../src/lib/s6/data";
import { POOL_FULL_USD as S6_POOL } from "../src/lib/s6/games";
import { finalizeTargetMoney, paidPeakPct, type MoneyTarget } from "../src/season/money";
import { S6_FIXTURE } from "../src/seasons/s6/season.config";

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? "[OK]  " : "[FAIL]"} ${what}`);
  if (!ok) failures += 1;
}

(async () => {
  const snap = await s6Snapshot();
  if (snap.empty || snap.targets.length === 0) {
    console.error("live S6 snapshot is empty - run with DB env (.env.local) present");
    process.exit(2);
  }
  console.log(`live S6: ${snap.targets.length} targets, pool full $${snap.pool.full}, secured $${snap.pool.secured}\n`);

  // ---- 1+2. MONEY: same rows, both engines ---------------------------------
  check(S6_FIXTURE.money.poolFullUsd === S6_POOL, `fixture pool $${S6_FIXTURE.money.poolFullUsd} == shipped POOL_FULL_USD $${S6_POOL}`);

  // Clone raw rows so the engine computes from scratch (poolShare/securedUsd
  // zeroed) while the snapshot keeps the shipped math's answers.
  const clones: (MoneyTarget & { domain: string })[] = snap.targets.map((t) => ({
    domain: t.domain,
    status: t.status,
    bondingFdv: t.bondingFdv,
    initialFdv: t.initialFdv,
    poolShareUsd: t.poolShareUsd,
    peakProgress: t.peakProgress,
    poolShare: 0,
    securedUsd: 0,
  }));
  const agg = finalizeTargetMoney(clones, S6_FIXTURE.money);

  let sliceOk = true;
  let securedOk = true;
  let peakOk = true;
  for (let i = 0; i < snap.targets.length; i++) {
    const live = snap.targets[i];
    const mine = clones[i];
    const dSlice = Math.abs(live.poolShare - mine.poolShare);
    const dSec = Math.abs(live.securedUsd - mine.securedUsd);
    const pk = paidPeakPct(mine);
    const livePk = s6Peak(live);
    if (dSlice > 0.005) { sliceOk = false; console.log(`   slice drift ${live.domain}: s6 $${live.poolShare.toFixed(2)} vs engine $${mine.poolShare.toFixed(2)}`); }
    if (dSec > 0.005) { securedOk = false; console.log(`   secured drift ${live.domain}: s6 $${live.securedUsd.toFixed(2)} vs engine $${mine.securedUsd.toFixed(2)}`); }
    if (pk !== livePk) { peakOk = false; console.log(`   peak drift ${live.domain}: s6 ${livePk}% vs engine ${pk}%`); }
  }
  check(sliceOk, `every slice agrees to the cent across ${snap.targets.length} targets`);
  check(securedOk, "every secured figure agrees to the cent");
  check(peakOk, "every paid peak %% agrees (ADR-0076 floor)");
  const sliceSum = Math.round(clones.reduce((s, t) => s + t.poolShare * 100, 0));
  check(sliceSum === Math.round(S6_POOL * 100), `engine slices sum to the pool exactly ($${(sliceSum / 100).toFixed(2)})`);
  check(Math.abs(agg.secured - snap.pool.secured) <= 0.005, `pool secured agrees: s6 $${snap.pool.secured} vs engine $${agg.secured}`);
  check(Math.abs(agg.unlocked - snap.pool.unlocked) <= 0.005, `pool unlocked agrees: s6 $${snap.pool.unlocked} vs engine $${agg.unlocked}`);

  // ---- 3. THEME: fixture vs the live served theme --------------------------
  const th = snap.theme;
  const fx = S6_FIXTURE.theme;
  check(fx.seasonName === th.seasonName, `seasonName "${fx.seasonName}"`);
  check(fx.target.singular === th.target.singular && fx.target.plural === th.target.plural, `target "${fx.target.singular}/${fx.target.plural}"`);
  check(fx.player.singular === th.player.singular && fx.player.plural === th.player.plural, `player "${fx.player.singular}/${fx.player.plural}"`);
  check(fx.points === th.points, `points "${fx.points}"`);
  check(fx.playCurrency === th.playCurrency, `playCurrency "${fx.playCurrency}"`);
  check(fx.bondedWord.toLowerCase() === th.bondedWord.toLowerCase(), `bondedWord "${fx.bondedWord}"`);
  check(
    fx.statusWord.pending === th.statusWord.pending && fx.statusWord.live === th.statusWord.live && fx.statusWord.failed === th.statusWord.failed,
    `statusWord ladder ${fx.statusWord.pending}/${fx.statusWord.live}/${fx.statusWord.failed}`,
  );
  check(
    fx.teams[0]?.key === th.teams[0]?.key && fx.teams[0]?.name === th.teams[0]?.name,
    `team fixture "${fx.teams[0]?.name}" vs live "${th.teams[0]?.name}" (key ${th.teams[0]?.key})`,
  );

  // ---- 4. WINDOW -----------------------------------------------------------
  const liveEnd = snap.season.endAt ? Date.parse(snap.season.endAt) : null;
  check(liveEnd !== null && liveEnd === Date.parse(S6_FIXTURE.window.endAt), `season end ${S6_FIXTURE.window.endAt} matches live config`);

  console.log(`\nNOT YET COVERED by this diff: readTargets carve, strings surfaces, the map renderer.`);
  console.log(failures === 0 ? "SHADOW DIFF GREEN (covered scope)" : `${failures} DRIFT(S) FOUND`);
  if (failures > 0) process.exit(1);
})().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
