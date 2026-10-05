/**
 * ASCENT (THE SPIRE) STANDALONE CHECK - the week-2 game's own merge gate,
 * mirroring scripts/s7-harness.ts gate-for-gate WITHOUT touching it (the
 * harness is being refactored in another lane; ascent wires into it after
 * this game lands). Run from the web3guides repo root:
 *
 *   npx tsx scripts/s7-ascent-check.ts            verify every gate
 *   npx tsx scripts/s7-ascent-check.ts --record   (re)record the baseline tape
 *
 * GATES (ADR-0120 semantics, the harness lettering):
 *  (0)  content validation - every authored-tower law is executable: every
 *       consecutive ledge pair within max jump range, exactly 3 checkpoints,
 *       wind schedule inside the storm band only, repeat-band seams chain
 *  (a)  DOUBLE REPLAY, BYTE-IDENTICAL vs the frozen baseline in tape.ts;
 *       plus the ascent-specific stats-matter shape: the max loadout on the
 *       SAME tape hashes DIFFERENT (charge speed moved the run) but reaches
 *       height >= the null run (a faster meter can only add attempts, never
 *       shrink a jump - the never-jump-power law, proven every run)
 *  (b2) CLASS MOVES OUTCOMES on the same tape (two classes, equal level and
 *       gear, different final hash)
 *  (c)  MAX-LOADOUT ORACLE FITS THE RATE ENVELOPE and the sanity ceiling()
 *  (d)  AFK: a neutral-input run scores exactly 0 (you start on the floor
 *       and only landings bank height); TIMER: every run ends at exactly
 *       RUN_FRAMES (10800) and died is always false
 *  (e)  registry mirror - SKIPPED BY DESIGN: ascent stays out of
 *       src/lib/s7/games.ts until the week-2 wiring; the check prints the
 *       numbers the registry entry must carry instead
 *
 * The greedy bot (full-charge straight up, aim center) records the tape: it
 * climbs the authored on-ramp stack and then hops in place forever, which is
 * exactly what a baseline needs - deterministic, height-banking, boring.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Loadout } from "../src/app/s7/games/_shared/rules/core";
import * as sim from "../src/app/s7/games/ascent/sim";
import * as content from "../src/app/s7/games/ascent/content";
import * as tape from "../src/app/s7/games/ascent/tape";

// ---------------------------------------------------------------------------
// shapes (the harness contract, verbatim semantics)
// ---------------------------------------------------------------------------

interface InputFrame {
  px: number | null;
  py: number | null;
  down: boolean;
  space: boolean;
}

const NEUTRAL: InputFrame = { px: null, py: null, down: false, space: false };

interface TapeEvent extends InputFrame {
  t: number;
}

interface RunBaseline {
  score: number;
  hash: number;
  frames: number;
  died: boolean;
}

const MAX_LOADOUT: Loadout = { classId: "barbarian", level: 20, gear: { weapon: 3, armor: 3, trinket: 3 } };
const CLASS_A: Loadout = { classId: "barbarian", level: 5, gear: { weapon: 1, armor: 1, trinket: 1 } };
const CLASS_B: Loadout = { classId: "wizard", level: 5, gear: { weapon: 1, armor: 1, trinket: 1 } };

const FRAME_CAP = 60 * 60 * 12; // hard stop so a broken sim can never hang
const POINTER_EVERY = 6;

const W = tape.TAPE_W;
const H = tape.TAPE_H;
const DT = tape.TAPE_DT;

function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const hashState = (s: unknown): number => fnv1a(JSON.stringify(s));
const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");

interface RunResult extends RunBaseline {
  secs: number;
  simSecs: number;
  detail: string;
}

const toSim = (i: InputFrame): sim.SimInput => ({
  px: i.px == null ? null : i.px / W,
  py: i.py == null ? null : i.py / H,
  down: i.down,
  space: i.space,
});

function finish(s: sim.AscentState, f: number): RunResult {
  return {
    score: Math.round(sim.ascentScore(s)),
    hash: hashState(s),
    frames: f,
    died: sim.ascentDied(),
    secs: f * DT,
    simSecs: sim.ascentSimSecs(s),
    detail: sim.ascentDetail(s),
  };
}

function replay(loadout: Loadout | null, events: TapeEvent[]): RunResult {
  const s = sim.createAscent(W, H, tape.TAPE_SEED, false, loadout);
  let cur: InputFrame = NEUTRAL;
  let ei = 0;
  let f = 0;
  for (; f < FRAME_CAP; f++) {
    if (sim.ascentDone(s)) break;
    while (ei < events.length && events[ei].t <= f) {
      const e = events[ei];
      cur = { px: e.px, py: e.py, down: e.down, space: e.space };
      ei++;
    }
    sim.stepAscent(s, DT, toSim(cur));
  }
  return finish(s, f);
}

/** The greedy bot: grounded = hold down with the pointer dead center (aim
 * straight up; the meter auto-fires at full); airborne = hands off. */
function ascentBot(): (s: sim.AscentState) => InputFrame {
  return (s: sim.AscentState) =>
    s.grounded === 1 ? { px: W / 2, py: H / 2, down: true, space: false } : NEUTRAL;
}

function botRun(loadout: Loadout | null): RunResult {
  const s = sim.createAscent(W, H, tape.TAPE_SEED, false, loadout);
  const bot = ascentBot();
  let f = 0;
  for (; f < FRAME_CAP; f++) {
    if (sim.ascentDone(s)) break;
    const want = bot(s);
    sim.stepAscent(s, DT, toSim({
      px: want.px == null ? null : Math.round(want.px),
      py: want.py == null ? null : Math.round(want.py),
      down: want.down,
      space: want.space,
    }));
  }
  return finish(s, f);
}

function recordTape(loadout: Loadout | null): { events: TapeEvent[]; result: RunResult } {
  const s = sim.createAscent(W, H, tape.TAPE_SEED, false, loadout);
  const bot = ascentBot();
  const events: TapeEvent[] = [];
  let cur: InputFrame = NEUTRAL;
  let f = 0;
  for (; f < FRAME_CAP; f++) {
    if (sim.ascentDone(s)) break;
    const want = bot(s);
    const q: InputFrame = {
      px: want.px == null ? null : Math.round(want.px),
      py: want.py == null ? null : Math.round(want.py),
      down: want.down,
      space: want.space,
    };
    const flagsChanged = q.down !== cur.down || q.space !== cur.space;
    const moved = (q.px ?? -1) !== (cur.px ?? -1) || (q.py ?? -1) !== (cur.py ?? -1);
    if (flagsChanged || (moved && f % POINTER_EVERY === 0)) {
      cur = q;
      events.push({ t: f, ...q });
    }
    sim.stepAscent(s, DT, toSim(cur));
  }
  return { events, result: finish(s, f) };
}

// ---------------------------------------------------------------------------
// gates
// ---------------------------------------------------------------------------

let failures = 0;
function report(ok: boolean, gate: string, msg: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "[OK] " : "[FAIL]"} ascent ${gate} ${msg}`);
}

function sameRun(x: RunBaseline, y: RunBaseline): boolean {
  return x.score === y.score && x.hash === y.hash && x.frames === y.frames && x.died === y.died;
}

function verify(): void {
  console.log(`\n=== ascent (THE SPIRE) - ${content.TOWER_SCREENS} screens, timer ${sim.RUN_FRAMES} frames ===`);

  if (!tape.BASELINE.recorded || tape.TAPE.length === 0) {
    report(false, "(a)", "tape not recorded yet - run: npx tsx scripts/s7-ascent-check.ts --record");
    return;
  }
  const T = tape.TAPE as TapeEvent[];

  // (a) double replay byte-identity + the stats-matter shape
  const z1 = replay(null, T);
  const z2 = replay(null, T);
  const x1 = replay(MAX_LOADOUT, T);
  const x2 = replay(MAX_LOADOUT, T);
  const zStable = sameRun(z1, z2);
  const xStable = sameRun(x1, x2);
  const zBase = sameRun(z1, tape.BASELINE.zero);
  const xBase = sameRun(x1, tape.BASELINE.max);
  report(
    zStable && xStable && zBase && xBase,
    "(a)",
    `double replay byte-identical vs baseline: null score ${z1.score} hash ${hex(z1.hash)} ${z1.frames}f` +
      `${zStable ? " x2" : " UNSTABLE"}${zBase ? "" : ` != baseline ${tape.BASELINE.zero.score}/${hex(tape.BASELINE.zero.hash)}`}; ` +
      `max score ${x1.score} hash ${hex(x1.hash)}${xStable ? " x2" : " UNSTABLE"}${xBase ? "" : " != baseline"}`,
  );
  report(
    z1.hash !== x1.hash && x1.score >= z1.score,
    "(a2)",
    `stats matter, jump power does not: max hash ${hex(x1.hash)} ${z1.hash !== x1.hash ? "differs" : "IDENTICAL"} ` +
      `and max height ${x1.score} ${x1.score >= z1.score ? ">=" : "BELOW"} null height ${z1.score} on the same tape`,
  );

  // (b2) class moves outcomes at equal level/gear
  const ca = replay(CLASS_A, T);
  const cb = replay(CLASS_B, T);
  report(
    ca.hash !== cb.hash,
    "(b2)",
    `class moves outcomes at equal level/gear: ${CLASS_A.classId} ${ca.score}/${hex(ca.hash)} vs ${CLASS_B.classId} ${cb.score}/${hex(cb.hash)}`,
  );

  // (c) oracle fits the envelope + ceiling
  const oracle = botRun(MAX_LOADOUT);
  const r = sim.rate();
  const env = Math.round(r.perSec * oracle.simSecs + r.burst);
  report(
    oracle.score <= env && oracle.score <= sim.ceiling(),
    "(c)",
    `max-loadout oracle ${oracle.score} fits envelope ${env} (${r.perSec}/s x ${oracle.simSecs.toFixed(1)}s sim + ${r.burst}) ` +
      `and <= ceiling ${sim.ceiling()} (${oracle.detail})`,
  );

  // (d) AFK scores 0; the timer ends every run at exactly RUN_FRAMES
  const afk = replay(null, []);
  report(
    afk.score === 0,
    "(d)",
    `AFK probe: neutral input scores ${afk.score} (floor height; the law is 0)`,
  );
  const allExact =
    afk.frames === sim.RUN_FRAMES &&
    z1.frames === sim.RUN_FRAMES &&
    x1.frames === sim.RUN_FRAMES &&
    oracle.frames === sim.RUN_FRAMES;
  const noDeath = !afk.died && !z1.died && !x1.died && !oracle.died;
  report(
    allExact && noDeath,
    "(d2)",
    `timer: every run ends at exactly ${sim.RUN_FRAMES} frames (afk ${afk.frames}, null ${z1.frames}, max ${x1.frames}, oracle ${oracle.frames}) ` +
      `and died is always false (${noDeath ? "yes" : "NO"})`,
  );

  // (e) the registry entry stays out until week 2; print what it must carry
  console.log(
    `[note] ascent (e) registry mirror deferred by design (game stays dark until week 2). ` +
      `The entry must carry: ratePerSec ${r.perSec}, burst ${r.burst}, maxScore ${sim.ceiling()} ` +
      `(>= 5x oracle ${oracle.score}: ${sim.ceiling() >= 5 * Math.max(1, oracle.score) ? "holds" : "FAILS"}).`,
  );

  // tower stats for the build report
  const cps = content.LEDGES.filter((l) => l.cp === 1).map((l) => l.y);
  const decoys = content.LEDGES.filter((l) => l.route === 0).map((l) => l.y);
  console.log(
    `[note] tower: ${content.TOWER_SCREENS} screens (${content.TOWER_TOP} units), ${content.LEDGES.length} authored ledges ` +
      `(${content.LEDGES.length - decoys.length} main line + ${decoys.length} decoys at y ${decoys.join(", ")}) + ` +
      `${content.REPEAT_LEDGES.length}-ledge repeat band every ${content.REPEAT_H} units above the crown; ` +
      `checkpoints at y ${cps.join(", ")}; ${content.BOUNCE_WALLS.length} bounce walls; ` +
      `${content.WIND.length} wind gusts (storm band ${content.STORM_Y0}..${content.STORM_Y1}); ` +
      `full-charge apex ~${sim.APEX_MAX} units.`,
  );
}

// ---------------------------------------------------------------------------
// recording (emit format mirrors the harness so the future wiring is a move)
// ---------------------------------------------------------------------------

const TAPE_REL_PATH = "src/app/s7/games/ascent/tape.ts";

function emitTapeFile(events: TapeEvent[], zero: RunResult, max: RunResult): string {
  const rows = events
    .map((e) => `  { t: ${e.t}, px: ${e.px}, py: ${e.py}, down: ${e.down}, space: ${e.space} },`)
    .join("\n");
  return `/**
 * THE SPIRE (ascent) BASELINE TAPE - recorded ${new Date().toISOString().slice(0, 10)} by
 * \`npx tsx scripts/s7-ascent-check.ts --record\`. DO NOT EDIT BY HAND and
 * do not re-record casually: this file IS the byte-identity baseline the
 * check script replays to prove the sim's behavior did not move. Re-record
 * ONLY when the sim itself deliberately changes, and say so in the commit.
 *
 * Replay contract (scripts/s7-ascent-check.ts, mirroring s7-harness.ts):
 * fixed ${DT.toFixed(6)}s steps at ${W}x${H}; an event applies from frame t onward;
 * px/py are integer pixels in that viewport (adapters convert to sim space).
 * BASELINE hashes are fnv1a32 over JSON.stringify of the final sim state.
 *
 * null-loadout replay: score ${zero.score}, ${zero.frames} frames (~${zero.secs.toFixed(1)}s), ${zero.detail}
 * max-loadout replay:  score ${max.score}, ${max.frames} frames (~${max.secs.toFixed(1)}s), ${max.detail}
 */

export interface TapeEvent {
  t: number; // frame index the event takes effect (fixed TAPE_DT steps)
  px: number | null;
  py: number | null;
  down: boolean;
  space: boolean;
}

export const TAPE_GAME = "ascent";
export const TAPE_SEED = "${tape.TAPE_SEED}";
export const TAPE_W = ${W};
export const TAPE_H = ${H};
export const TAPE_DT = 1 / 60;
export const TAPE: TapeEvent[] = [
${rows}
];
export const BASELINE = {
  recorded: true,
  zero: { score: ${zero.score}, hash: ${zero.hash}, frames: ${zero.frames}, died: ${zero.died} },
  max: { score: ${max.score}, hash: ${max.hash}, frames: ${max.frames}, died: ${max.died} },
};
`;
}

function record(): void {
  console.log(`\n=== recording ascent baseline tape (seed "${tape.TAPE_SEED}") ===`);
  const rec = recordTape(null);
  const zero = replay(null, rec.events);
  if (!sameRun(zero, rec.result)) {
    report(false, "(record)", `downsampled replay diverged from the live recording (record ${rec.result.score}/${hex(rec.result.hash)} vs replay ${zero.score}/${hex(zero.hash)})`);
    return;
  }
  const max = replay(MAX_LOADOUT, rec.events);
  fs.writeFileSync(path.join(ROOT, TAPE_REL_PATH), emitTapeFile(rec.events, zero, max), "utf8");
  console.log(
    `[OK]  ascent tape: ${rec.events.length} events over ${zero.frames} frames (~${zero.secs.toFixed(1)}s); ` +
      `null ${zero.score} (${zero.detail}); max ${max.score} (${max.detail})`,
  );
  console.log(`[OK]  wrote ${TAPE_REL_PATH} - re-run WITHOUT --record to verify against the fresh baseline`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, "src", "app", "s7", "games", "ascent"))) {
  console.error("Run from the web3guides repo root (src/app/s7/games/ascent not found under cwd).");
  process.exit(2);
}

// gate (0): the authored-tower laws are executable
try {
  content.validateContent();
  console.log(
    "[OK]  ascent content tables validate (main-route reach chain, decoy landability, merged y-sort, " +
      "3 checkpoints, storm-band wind, repeat seams, wall placement)",
  );
} catch (e) {
  report(false, "(content)", String(e instanceof Error ? e.message : e));
}

if (process.argv.includes("--record")) {
  record();
} else {
  verify();
}

console.log(failures === 0 ? "\nALL CHECKS GREEN" : `\n${failures} CHECK(S) FAILED`);
if (failures > 0) process.exit(1);
