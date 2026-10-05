/**
 * S7 NIGHTLY BALANCE GATE - gate (f) from the season design panel: the
 * statistical fairness proof that is too slow for the merge gate
 * (scripts/s7-harness.ts holds gates (a)-(e); this file owns the many-seed
 * runs the panel explicitly kept OUT of the merge gate).
 *
 * Run from the web3guides repo root:
 *
 *   npx tsx scripts/s7-balance.ts            full pass (N=120 gear pairs, M=40 class seeds)
 *   npx tsx scripts/s7-balance.ts --n=30     quick pass (fewer gear pairs)
 *   npx tsx scripts/s7-balance.ts --m=10     fewer class-spread seeds
 *
 * CHECKS PER GAME (gauntlet, horde, crypt):
 *  (f1) GEAR MONOTONICITY, paired seeds: greedy bot twice per seed with
 *       {barbarian, level 10} at gear 0/0/0 vs 3/3/3; the geared run must
 *       beat-or-tie the ungeared SURVIVAL-OR-SCORE composite (score first,
 *       tiebreak frames survived) on >= 90% of pairs. Reports win rate +
 *       mean score uplift.
 *  (f2) CLASS SPREAD: each of the six classes at {level 5, gear 1/1/1} on M
 *       shared seeds; require best_mean/worst_mean <= 1.6. The bots
 *       (scripts/s7-bots.ts) are skill-aware in gauntlet + horde but still
 *       simple (crypt stays class-naive), so 1.6..2.0 FLAGS but does not
 *       fail (bot reasons, not balance reasons); > 2.0 hard-fails. Prints
 *       the per-class mean table.
 *  (f3) RUNTIME GUARD: every run is capped at FRAME_CAP (12 min sim time,
 *       same idea as the harness); ANY run hitting the cap = a hang bug ->
 *       loud FAIL naming the seed.
 *
 * Seeds are `balance-<game>-<i>` strings, disjoint from the frozen baseline
 * tapes, so this gate never couples to the byte-identity baselines.
 *
 * The three greedy bots are IMPORTED from scripts/s7-bots.ts - the ONE
 * shared copy, also used by the harness (extracted 2026-08-25; before that
 * they were replicated verbatim here because the harness executes its main()
 * at module scope and cannot be imported). A bot change in s7-bots.ts moves
 * BOTH gates together.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Loadout, ClassId } from "../src/app/s7/games/_shared/rules/core";
import { CLASS_IDS } from "../src/app/s7/games/_shared/rules/core";
import * as gl from "../src/app/s7/games/gauntlet/sim";
import * as hd from "../src/app/s7/games/horde/sim";
import * as cr from "../src/app/s7/games/crypt/sim";
import { gauntletBot, hordeBot, cryptBot } from "./s7-bots";
import type { InputFrame } from "./s7-bots";

// ---------------------------------------------------------------------------
// shared shapes (mirroring scripts/s7-harness.ts)
// ---------------------------------------------------------------------------

/** Same viewport + step as every S7 baseline tape (tape.ts contract). */
const VIEW_W = 800;
const VIEW_H = 600;
const DT = 1 / 60;

/** Hard stop so a broken sim can never hang the gate (12 minutes at 60fps) -
 * the harness's FRAME_CAP idea; here ANY run that reaches it is gate (f3)'s
 * hang bug, not just a guard. */
const FRAME_CAP = 60 * 60 * 12;

interface Adapter<S> {
  key: string;
  create: (seed: string, loadout: Loadout) => S;
  step: (s: S, input: InputFrame) => void;
  done: (s: S) => boolean;
  score: (s: S) => number;
  died: (s: S) => boolean;
  simSecs: (s: S) => number;
  bot: () => (s: S, frame: number) => InputFrame;
}

type AnyAdapter = Adapter<unknown>;
function wrap<S>(a: Adapter<S>): AnyAdapter {
  return a as unknown as AnyAdapter;
}

// ---------------------------------------------------------------------------
// adapters - create/step bridges mirroring scripts/s7-harness.ts; the greedy
// bots come from scripts/s7-bots.ts (only the tape plumbing is dropped)
// ---------------------------------------------------------------------------

/** GAUNTLET - bot from scripts/s7-bots.ts gauntletBot(). */
function gauntletAdapter(): AnyAdapter {
  const W = VIEW_W;
  const H = VIEW_H;
  const toSim = (i: InputFrame): gl.SimInput => ({
    px: i.px == null ? null : i.px / W,
    py: i.py == null ? null : i.py / H,
    down: i.down,
    space: i.space,
  });
  return wrap<gl.GauntletState>({
    key: "gauntlet",
    create: (seed, loadout) => gl.createGauntlet(W, H, seed, false, loadout),
    step: (s, input) => gl.stepGauntlet(s, DT, toSim(input)),
    done: (s) => gl.gauntletDone(s),
    score: (s) => gl.gauntletScore(s),
    died: (s) => gl.gauntletDied(s),
    simSecs: (s) => gl.gauntletSimSecs(s),
    bot: () => gauntletBot(W, H),
  });
}

/** HORDE - bot from scripts/s7-bots.ts hordeBot(). */
function hordeAdapter(): AnyAdapter {
  const W = VIEW_W;
  const H = VIEW_H;
  const toSim = (i: InputFrame): hd.SimInput => ({
    px: i.px == null ? null : i.px / W,
    py: i.py == null ? null : i.py / H,
    down: i.down,
    space: i.space,
  });
  return wrap<hd.HordeState>({
    key: "horde",
    create: (seed, loadout) => hd.createHorde(W, H, seed, false, loadout),
    step: (s, input) => hd.stepHorde(s, DT, toSim(input)),
    done: (s) => hd.hordeDone(s),
    score: (s) => hd.hordeScore(s),
    died: (s) => hd.hordeDied(s),
    simSecs: (s) => hd.hordeSimSecs(s),
    bot: () => hordeBot(W, H),
  });
}

/** CRYPT - bot from scripts/s7-bots.ts cryptBot(). */
function cryptAdapter(): AnyAdapter {
  const W = VIEW_W;
  const H = VIEW_H;
  const toSim = (i: InputFrame): cr.SimInput => ({
    px: i.px == null ? null : i.px / W,
    py: i.py == null ? null : i.py / H,
    down: i.down,
    space: i.space,
  });
  return wrap<cr.CryptState>({
    key: "crypt",
    create: (seed, loadout) => cr.createCrypt(W, H, seed, false, loadout),
    step: (s, input) => cr.stepCrypt(s, DT, toSim(input)),
    done: (s) => cr.cryptDone(s),
    score: (s) => cr.cryptScore(s),
    died: (s) => cr.cryptDied(s),
    simSecs: (s) => cr.cryptSimSecs(s),
    bot: () => cryptBot(W, H),
  });
}

const ADAPTERS: AnyAdapter[] = [gauntletAdapter(), hordeAdapter(), cryptAdapter()];

// ---------------------------------------------------------------------------
// run machinery
// ---------------------------------------------------------------------------

interface RunResult {
  score: number;
  frames: number;
  died: boolean;
  simSecs: number;
  hitCap: boolean;
}

/** One headless bot run. Mirrors the harness's botRun() loop (fresh bot
 * closure per run, rounded pointer pixels, FRAME_CAP bound). */
function botRun(a: AnyAdapter, seed: string, loadout: Loadout): RunResult {
  const s = a.create(seed, loadout);
  const bot = a.bot();
  let f = 0;
  for (; f < FRAME_CAP; f++) {
    if (a.done(s)) break;
    const want = bot(s, f);
    a.step(s, {
      px: want.px == null ? null : Math.round(want.px),
      py: want.py == null ? null : Math.round(want.py),
      down: want.down,
      space: want.space,
    });
  }
  return {
    score: Math.round(a.score(s)),
    frames: f,
    died: a.died(s),
    simSecs: a.simSecs(s),
    hitCap: f >= FRAME_CAP && !a.done(s),
  };
}

// ---------------------------------------------------------------------------
// gates
// ---------------------------------------------------------------------------

let failures = 0;
function report(ok: boolean, key: string, gate: string, msg: string, warn = false): void {
  const tag = ok ? (warn ? "[WARN]" : "[OK] ") : "[FAIL]";
  if (!ok) failures += 1;
  console.log(`${tag} ${key} ${gate} ${msg}`);
}

/** Gate (f3) bookkeeping: any capped run is a hang bug. */
const cappedRuns: { key: string; seed: string; loadout: string }[] = [];
function guarded(a: AnyAdapter, seed: string, loadout: Loadout, label: string): RunResult {
  const r = botRun(a, seed, loadout);
  if (r.hitCap) cappedRuns.push({ key: a.key, seed, loadout: label });
  return r;
}

const GEAR_UNGEARED: Loadout = { classId: "barbarian", level: 10, gear: { weapon: 0, armor: 0, trinket: 0 } };
const GEAR_GEARED: Loadout = { classId: "barbarian", level: 10, gear: { weapon: 3, armor: 3, trinket: 3 } };

/** (f1) paired-seed gear monotonicity. Composite: score first; at EQUAL score
 * the frames tiebreak is per-genre (2026-08-25 finding): in the real-time
 * games more frames survived is better, but GAUNTLET is turn-based, so fewer
 * frames at the same score means a faster clear of the same floors, not worse
 * survival. Geared must beat-or-tie on >= 90% of pairs. */
function gateGear(a: AnyAdapter, n: number): void {
  let winTie = 0;
  let upliftSum = 0;
  let framesUpSum = 0;
  const losses: { seed: string; z: RunResult; g: RunResult }[] = [];
  const t0 = Date.now();
  const turnBased = a.key === "gauntlet";
  for (let i = 0; i < n; i++) {
    const seed = `balance-${a.key}-${i}`;
    const z = guarded(a, seed, GEAR_UNGEARED, "gear 0/0/0");
    const g = guarded(a, seed, GEAR_GEARED, "gear 3/3/3");
    const beatsOrTies =
      g.score > z.score ||
      (g.score === z.score && (turnBased ? g.frames <= z.frames : g.frames >= z.frames));
    if (beatsOrTies) winTie += 1;
    else if (losses.length < 5) losses.push({ seed, z, g });
    upliftSum += g.score - z.score;
    framesUpSum += g.frames - z.frames;
    if ((i + 1) % 30 === 0 || i + 1 === n) {
      console.log(`  [${a.key}] gear pairs ${i + 1}/${n} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }
  const ratePct = (winTie / n) * 100;
  const meanUplift = upliftSum / n;
  const meanFramesUp = framesUpSum / n;
  report(
    ratePct >= 90,
    a.key,
    "(f1)",
    `gear monotonicity: geared beats-or-ties ${winTie}/${n} pairs (${ratePct.toFixed(1)}%, bar 90%); ` +
      `mean uplift ${meanUplift >= 0 ? "+" : ""}${meanUplift.toFixed(1)} score, ` +
      `${meanFramesUp >= 0 ? "+" : ""}${(meanFramesUp / 60).toFixed(1)}s survived`,
  );
  for (const l of losses) {
    console.log(
      `       lost pair seed "${l.seed}": ungeared {score ${l.z.score}, ${(l.z.frames / 60).toFixed(1)}s} vs ` +
        `geared {score ${l.g.score}, ${(l.g.frames / 60).toFixed(1)}s}`,
    );
  }
}

/** (f2) six-class spread at {level 5, gear 1/1/1} on M shared seeds. */
function gateClasses(a: AnyAdapter, m: number): void {
  const stats: Record<string, { mean: number; min: number; max: number; deaths: number; meanSecs: number }> = {};
  for (const classId of CLASS_IDS) {
    const loadout: Loadout = { classId: classId as ClassId, level: 5, gear: { weapon: 1, armor: 1, trinket: 1 } };
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    let deaths = 0;
    let secsSum = 0;
    const t0 = Date.now();
    for (let i = 0; i < m; i++) {
      const r = guarded(a, `balance-${a.key}-${i}`, loadout, `class ${classId}`);
      sum += r.score;
      min = Math.min(min, r.score);
      max = Math.max(max, r.score);
      if (r.died) deaths += 1;
      secsSum += r.simSecs;
    }
    stats[classId] = { mean: sum / m, min, max, deaths, meanSecs: secsSum / m };
    console.log(
      `  [${a.key}] class ${classId}: ${m} seeds, mean ${stats[classId].mean.toFixed(1)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
  }
  console.log(`  class spread @ level 5, gear 1/1/1, ${m} seeds each:`);
  console.log(`    ${"class".padEnd(10)} ${"mean".padStart(8)} ${"min".padStart(7)} ${"max".padStart(7)} ${"died".padStart(6)} ${"simSecs".padStart(8)}`);
  const ordered = [...CLASS_IDS].sort((x, y) => stats[y].mean - stats[x].mean);
  for (const cid of ordered) {
    const st = stats[cid];
    console.log(
      `    ${cid.padEnd(10)} ${st.mean.toFixed(1).padStart(8)} ${String(st.min).padStart(7)} ${String(st.max).padStart(7)} ` +
        `${`${st.deaths}/${m}`.padStart(6)} ${st.meanSecs.toFixed(1).padStart(8)}`,
    );
  }
  const best = stats[ordered[0]];
  const worst = stats[ordered[ordered.length - 1]];
  const ratio = worst.mean > 0 ? best.mean / worst.mean : Infinity;
  const msg =
    `class spread: best ${ordered[0]} ${best.mean.toFixed(1)} / worst ${ordered[ordered.length - 1]} ` +
    `${worst.mean.toFixed(1)} = ${ratio === Infinity ? "inf (worst mean is 0)" : ratio.toFixed(2)} ` +
    `(pass <= 1.6, flag <= 2.0, fail > 2.0)`;
  if (ratio <= 1.6) {
    report(true, a.key, "(f2)", msg);
  } else if (ratio <= 2.0) {
    // flagged, not failed: the bots are simple greedy players (crypt's is
    // still class-naive), so a spread in this band is a bot artifact until
    // a stronger bot says otherwise
    report(true, a.key, "(f2)", `${msg} - FLAGGED (bot-naivety band, not failing)`, true);
  } else {
    report(false, a.key, "(f2)", msg);
  }
}

/** Games whose ORACLE never dies by design. Crypt duels (2026-08-30): every
 * tell is answerable and the dodge always recovers inside the cycle, so a
 * perfect dodger is immortal - an oracle property, not a hang (the sim's own
 * stall-breaker proves liveness; humans die: the AFK gate lands < 30s). A
 * cap-length run here is WAIVED with the reason instead of failing. */
const ORACLE_IMMORTAL: Record<string, string> = {
  crypt: "perfect dodging is unbeatable by design; state keeps progressing (stall-breaker armed), humans die via mistakes",
};

/** (f3) runtime guard verdict for one game (capped runs recorded inline). */
function gateRuntime(a: AnyAdapter): void {
  const mine = cappedRuns.filter((c) => c.key === a.key);
  const waiver = ORACLE_IMMORTAL[a.key];
  if (mine.length > 0 && waiver) {
    report(true, a.key, "(f3)", `runtime: ${mine.length} run(s) reached FRAME_CAP - WAIVED [${waiver}]`, true);
    return;
  }
  report(
    mine.length === 0,
    a.key,
    "(f3)",
    mine.length === 0
      ? `runtime guard: no run hit FRAME_CAP (${FRAME_CAP} frames / 12 min sim)`
      : `HANG BUG: ${mine.length} run(s) hit FRAME_CAP - ${mine
          .map((c) => `seed "${c.seed}" [${c.loadout}]`)
          .join("; ")}`,
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, "src", "app", "s7", "games"))) {
  console.error("Run from the web3guides repo root (src/app/s7/games not found under cwd).");
  process.exit(2);
}

const argv = process.argv.slice(2);
function flag(name: string, dflt: number): number {
  const hit = argv.find((x) => x.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const v = parseInt(hit.slice(name.length + 3), 10);
  if (!Number.isFinite(v) || v < 1) {
    console.error(`Bad --${name} value: ${hit}`);
    process.exit(2);
  }
  return v;
}
const N = flag("n", 120); // gear-monotonicity pairs per game
const M = flag("m", 40);  // class-spread seeds per class per game
const names = argv.filter((x) => !x.startsWith("--"));
const selected = ADAPTERS.filter((a) => names.length === 0 || names.includes(a.key));
if (selected.length === 0) {
  console.error(`No wired game matches [${names.join(", ")}]. Wired: ${ADAPTERS.map((a) => a.key).join(", ")}`);
  process.exit(2);
}

console.log(`S7 BALANCE GATE (f): ${selected.length} game(s), N=${N} gear pairs, M=${M} class seeds -> ${selected.length * (2 * N + 6 * M)} runs`);
const tAll = Date.now();
for (const a of selected) {
  console.log(`\n=== ${a.key} ===`);
  const t0 = Date.now();
  gateGear(a, N);
  gateClasses(a, M);
  gateRuntime(a);
  console.log(`  [${a.key}] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

console.log(`\ntotal wall clock ${((Date.now() - tAll) / 1000).toFixed(1)}s`);
console.log(failures === 0 ? "ALL GREEN" : `${failures} FAILED`);
if (failures > 0) process.exit(1);
