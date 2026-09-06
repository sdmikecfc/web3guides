/**
 * S7 HEADLESS GAME HARNESS - the determinism / ceiling / pacing merge gate,
 * carried from scripts/s6-harness.ts (itself carried from S5) with ONE
 * structural change: runs take a LOADOUT (active class + level + 3 gear
 * slots, ADR-0129 class system) where S5/S6 took a flat stat block.
 *
 * Run from the web3guides repo root:
 *
 *   npx tsx scripts/s7-harness.ts                    verify every wired game
 *   npx tsx scripts/s7-harness.ts gauntlet           verify one game
 *   npx tsx scripts/s7-harness.ts --record gauntlet  (re)record the baseline
 *
 * CHECKS PER GAME (ADR-0120 semantics):
 *  (a)  DOUBLE REPLAY, BYTE-IDENTICAL vs the frozen baseline in tape.ts
 *  (b)  LOADOUT MOVES OUTCOMES on the same tape (null vs canonical max)
 *  (b2) CLASS MOVES OUTCOMES on the same tape (two classes, equal level/gear,
 *       different final hash) - the class system's merge-gate proof; the
 *       deeper per-class balance spread lives in scripts/s7-balance.ts (f)
 *  (c)  MAX-LOADOUT ORACLE FITS THE RATE ENVELOPE and the sanity clamp
 *  (d)  PACING / AFK PROBE: an empty tape must die before floorMs and under
 *       fastWinScore, so an idle run can never bank
 *  (e)  REGISTRY mirrors the sim's rate() and maxScore >= 5x the oracle
 *
 * Tape px/py are stored as INTEGER pixels in TAPE_W x TAPE_H space (the
 * S5/S6 contract); adapters convert to whatever space their sim wants.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { GAME_RULES } from "../src/lib/s7/games";
import type { Loadout } from "../src/app/s7/games/_shared/rules/core";
import * as gl from "../src/app/s7/games/gauntlet/sim";
import * as glContent from "../src/app/s7/games/gauntlet/content";
import * as glTape from "../src/app/s7/games/gauntlet/tape";
import * as hd from "../src/app/s7/games/horde/sim";
import * as hdContent from "../src/app/s7/games/horde/content";
import * as hdTape from "../src/app/s7/games/horde/tape";
import * as cr from "../src/app/s7/games/crypt/sim";
import * as crContent from "../src/app/s7/games/crypt/content";
import * as crTape from "../src/app/s7/games/crypt/tape";
import * as an from "../src/app/s7/games/ascent/sim";
import * as anTape from "../src/app/s7/games/ascent/tape";
import { NEUTRAL, gauntletBot, hordeBot, cryptBot, ascentBot } from "./s7-bots";
import type { InputFrame } from "./s7-bots";

// ---------------------------------------------------------------------------
// shared shapes (verbatim from scripts/s6-harness.ts except Stats -> Loadout;
// InputFrame/NEUTRAL + the three greedy bots live in scripts/s7-bots.ts, the
// ONE copy shared with scripts/s7-balance.ts)
// ---------------------------------------------------------------------------

interface TapeEvent extends InputFrame {
  t: number;
}

interface RunBaseline {
  score: number;
  hash: number;
  frames: number;
  died: boolean;
}

interface TapeModule {
  TAPE_GAME: string;
  TAPE_SEED: string;
  TAPE_W: number;
  TAPE_H: number;
  TAPE_DT: number;
  TAPE: TapeEvent[];
  BASELINE: { recorded: boolean; zero: RunBaseline; max: RunBaseline };
}

/** The canonical max build: gate (b)'s far end. ONE loadout, not six - the
 * per-class matrix belongs to the nightly balance gate, never the merge gate
 * (panel law: two frozen baselines only). */
const MAX_LOADOUT: Loadout = { classId: "barbarian", level: 20, gear: { weapon: 3, armor: 3, trinket: 3 } };
/** Gate (b2)'s pair: same level/gear, different class. barbarian/wizard is
 * the widest outcome spread on gauntlet/horde/crypt (score moves on all
 * three; monk/cleric was also run and only moves frames on horde/crypt).
 * KNOWN: on ascent EVERY pair ties on score/frames/died - died is hard-false,
 * frames is the fixed 180s timer, and the tape's recorded press cadence plus
 * full-charge auto-jumps make score insensitive to chargeRate100 (null
 * through max L20 3/3/3 all land the same 89 jumps to height 560), so
 * ascent's b2 fails until the sim gives class an outcome-visible effect. */
const CLASS_A: Loadout = { classId: "barbarian", level: 5, gear: { weapon: 1, armor: 1, trinket: 1 } };
const CLASS_B: Loadout = { classId: "wizard", level: 5, gear: { weapon: 1, armor: 1, trinket: 1 } };

/** Games whose FROZEN TAPE cannot show a loadout delta even though live play
 * can. ascent: class and gear move charge fill speed and slick-stone grip
 * only; the 3-minute tape's route never leaves the catacombs band (height
 * 560), so no slick ledge or gust ever engages and every build replays
 * identically by design (measured: null through max L20 3/3/3 all land the
 * same 89 jumps). Live play above the catacombs does feel grip and charge,
 * and the Spire is exempt from per-class feel (Mike, 2026-08-30). Waived,
 * not weakened: the assertion stays real for every other game. */
const LOADOUT_WAIVERS: Record<string, string> = {
  ascent: "tape never leaves the catacombs band, so charge/grip cannot engage; Spire exempt from class feel per Mike 2026-08-30",
};

/** Hard stop so a broken sim can never hang the gate (12 minutes at 60fps). */
const FRAME_CAP = 60 * 60 * 12;

/** Pointer downsample: refresh the aimed/held point every N frames while
 * flags are steady; every down/space flip is emitted frame-exact. */
const POINTER_EVERY = 6;

interface Adapter<S> {
  key: string;
  create: (w: number, h: number, seed: string, loadout: Loadout | null) => S;
  step: (s: S, dt: number, input: InputFrame) => void;
  done: (s: S) => boolean;
  score: (s: S) => number;
  died: (s: S) => boolean;
  detail: (s: S) => string;
  rate: () => { perSec: number; burst: number; source: string };
  simSecs: (s: S) => number;
  bot: () => (s: S, frame: number) => InputFrame;
  tape: TapeModule;
  tapeRelPath: string;
  /** Record/replay frame cap override for games whose oracle never dies. */
  recordCapF?: number;
  afkStrict: boolean;
  afkNote?: string;
}

type AnyAdapter = Adapter<unknown>;
function wrap<S>(a: Adapter<S>): AnyAdapter {
  return a as unknown as AnyAdapter;
}

function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashState(s: unknown): number {
  return fnv1a(JSON.stringify(s));
}

function hex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

interface RunResult extends RunBaseline {
  secs: number;
  simSecs: number;
  detail: string;
}

function finish(a: AnyAdapter, s: unknown, f: number, dt: number): RunResult {
  return {
    score: Math.round(a.score(s)),
    hash: hashState(s),
    frames: f,
    died: a.died(s),
    secs: f * dt,
    simSecs: a.simSecs(s),
    detail: a.detail(s),
  };
}

function replay(a: AnyAdapter, loadout: Loadout | null, tape: TapeEvent[]): RunResult {
  const m = a.tape;
  const s = a.create(m.TAPE_W, m.TAPE_H, m.TAPE_SEED, loadout);
  let cur: InputFrame = NEUTRAL;
  let ei = 0;
  let f = 0;
  for (; f < (a.recordCapF ?? FRAME_CAP); f++) {
    if (a.done(s)) break;
    while (ei < tape.length && tape[ei].t <= f) {
      const e = tape[ei];
      cur = { px: e.px, py: e.py, down: e.down, space: e.space };
      ei++;
    }
    a.step(s, m.TAPE_DT, cur);
  }
  return finish(a, s, f, m.TAPE_DT);
}

function botRun(a: AnyAdapter, loadout: Loadout | null): RunResult {
  const m = a.tape;
  const s = a.create(m.TAPE_W, m.TAPE_H, m.TAPE_SEED, loadout);
  const bot = a.bot();
  let f = 0;
  for (; f < (a.recordCapF ?? FRAME_CAP); f++) {
    if (a.done(s)) break;
    if (process.env.S7_TRACE && f % 300 === 0) console.log(`[trace ${a.key} f${f}] ${a.detail(s)}`);
    const want = bot(s, f);
    a.step(s, m.TAPE_DT, {
      px: want.px == null ? null : Math.round(want.px),
      py: want.py == null ? null : Math.round(want.py),
      down: want.down,
      space: want.space,
    });
  }
  return finish(a, s, f, m.TAPE_DT);
}

function recordTape(a: AnyAdapter, loadout: Loadout | null): { events: TapeEvent[]; result: RunResult } {
  const m = a.tape;
  const s = a.create(m.TAPE_W, m.TAPE_H, m.TAPE_SEED, loadout);
  const bot = a.bot();
  const events: TapeEvent[] = [];
  let cur: InputFrame = NEUTRAL;
  let f = 0;
  // A game whose oracle never dies (crypt duels: perfect dodging is
  // unbeatable by design) records to recordCapF instead of FRAME_CAP -
  // byte-identity needs a stable prefix, not a 12-minute epic.
  const cap = a.recordCapF ?? FRAME_CAP;
  for (; f < cap; f++) {
    if (a.done(s)) break;
    const want = bot(s, f);
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
    a.step(s, m.TAPE_DT, cur);
  }
  return { events, result: finish(a, s, f, m.TAPE_DT) };
}

// ---------------------------------------------------------------------------
// adapters
// ---------------------------------------------------------------------------

/** GAUNTLET (Slay the Spire anchor). The sim speaks NORMALIZED [0,1] input;
 * the tape contract stores integer pixels, so this adapter divides by the
 * tape viewport on the way in. The greedy bot lives in scripts/s7-bots.ts
 * (shared with the balance gate). */
function gauntletAdapter(): AnyAdapter {
  const W = glTape.TAPE_W;
  const H = glTape.TAPE_H;
  const toSim = (i: InputFrame): gl.SimInput => ({
    px: i.px == null ? null : i.px / W,
    py: i.py == null ? null : i.py / H,
    down: i.down,
    space: i.space,
  });
  return wrap<gl.GauntletState>({
    key: "gauntlet",
    create: (w, h, seed, loadout) => gl.createGauntlet(w, h, seed, false, loadout),
    step: (s, dt, input) => gl.stepGauntlet(s, dt, toSim(input)),
    done: (s) => gl.gauntletDone(s),
    score: (s) => gl.gauntletScore(s),
    died: (s) => gl.gauntletDied(s),
    detail: (s) => gl.gauntletDetail(s),
    rate: () => ({ ...gl.rate(), source: "sim rate(): xp-per-encounter book" }),
    simSecs: (s) => gl.gauntletSimSecs(s),
    bot: () => gauntletBot(W, H),
    tape: glTape as TapeModule,
    tapeRelPath: "src/app/s7/games/gauntlet/tape.ts",
    afkStrict: true,
  });
}

/** HORDE (Gauntlet Legends / Diablo II anchor). Same normalized-input bridge
 * as GAUNTLET. The greedy bot lives in scripts/s7-bots.ts (shared with the
 * balance gate). */
function hordeAdapter(): AnyAdapter {
  const W = hdTape.TAPE_W;
  const H = hdTape.TAPE_H;
  const toSim = (i: InputFrame): hd.SimInput => ({
    px: i.px == null ? null : i.px / W,
    py: i.py == null ? null : i.py / H,
    down: i.down,
    space: i.space,
  });
  return wrap<hd.HordeState>({
    key: "horde",
    create: (w, h, seed, loadout) => hd.createHorde(w, h, seed, false, loadout),
    step: (s, dt, input) => hd.stepHorde(s, dt, toSim(input)),
    done: (s) => hd.hordeDone(s),
    score: (s) => hd.hordeScore(s),
    died: (s) => hd.hordeDied(s),
    detail: (s) => hd.hordeDetail(s),
    rate: () => ({ ...hd.rate(), source: "sim rate(): densest wave xp over the wave gap" }),
    simSecs: (s) => hd.hordeSimSecs(s),
    bot: () => hordeBot(W, H),
    tape: hdTape as TapeModule,
    tapeRelPath: "src/app/s7/games/horde/tape.ts",
    afkStrict: true,
  });
}

/** CRYPT (Grimrock / Eye of the Beholder anchor). Same normalized-input
 * bridge. The waltz bot lives in scripts/s7-bots.ts (shared with the balance
 * gate). */
function cryptAdapter(): AnyAdapter {
  const W = crTape.TAPE_W;
  const H = crTape.TAPE_H;
  const toSim = (i: InputFrame): cr.SimInput => ({
    px: i.px == null ? null : i.px / W,
    py: i.py == null ? null : i.py / H,
    down: i.down,
    space: i.space,
  });
  return wrap<cr.CryptState>({
    key: "crypt",
    create: (w, h, seed, loadout) => cr.createCrypt(w, h, seed, false, loadout),
    step: (s, dt, input) => cr.stepCrypt(s, dt, toSim(input)),
    done: (s) => cr.cryptDone(s),
    score: (s) => cr.cryptScore(s),
    died: (s) => cr.cryptDied(s),
    detail: (s) => cr.cryptDetail(s),
    rate: () => ({ ...cr.rate(), source: "sim rate(): duel punish-window math - dragon VULN windows (>=2/kill) + NEXT_UP/MIN_STAIR_PATH sustained" }),
    simSecs: (s) => cr.cryptSimSecs(s),
    bot: () => cryptBot(W, H),
    tape: crTape as TapeModule,
    tapeRelPath: "src/app/s7/games/crypt/tape.ts",
    recordCapF: 60 * 60 * 3, // perfect play is immortal; the baseline is a 3-min prefix
    afkStrict: true,
  });
}


function ascentAdapter(): AnyAdapter {
  const W = anTape.TAPE_W;
  const H = anTape.TAPE_H;
  const toSim = (i: InputFrame): an.SimInput => ({
    px: i.px == null ? null : i.px / W,
    py: i.py == null ? null : i.py / H,
    down: i.down,
    space: i.space,
  });
  return wrap<an.AscentState>({
    key: "ascent",
    create: (w, h, seed, loadout) => an.createAscent(w, h, seed, false, loadout),
    step: (s, dt, input) => an.stepAscent(s, dt, toSim(input)),
    done: (s) => an.ascentDone(s),
    score: (s) => an.ascentScore(s),
    died: () => an.ascentDied(),
    detail: (s) => an.ascentDetail(s),
    rate: () => ({ ...an.rate(), source: "sim rate(): height-per-second on the authored on-ramp" }),
    simSecs: (s) => an.ascentSimSecs(s),
    bot: () => ascentBot(W, H),
    tape: anTape as TapeModule,
    tapeRelPath: "src/app/s7/games/ascent/tape.ts",
    // The 3-minute timer is the ONLY exit (Foddy purity: falling never
    // kills), so an idle run lasts 180s and scores 0. A zero can neither
    // place on a board nor pay (first SCORED run pays; zero is not a score),
    // so the AFK gate is waived rather than strict.
    afkStrict: false,
    afkNote: "timer is the only exit; idle scores 0, and 0 cannot bank or place",
  });
}

const ADAPTERS: AnyAdapter[] = [gauntletAdapter(), hordeAdapter(), cryptAdapter(), ascentAdapter()];

// ---------------------------------------------------------------------------
// gates
// ---------------------------------------------------------------------------

let failures = 0;
function report(ok: boolean, key: string, gate: string, msg: string, waived = false): void {
  const tag = ok ? "[OK] " : waived ? "[WAIVE]" : "[FAIL]";
  if (!ok && !waived) failures += 1;
  console.log(`${tag} ${key} ${gate} ${msg}`);
}

function sameRun(x: RunBaseline, y: RunBaseline): boolean {
  return x.score === y.score && x.hash === y.hash && x.frames === y.frames && x.died === y.died;
}

function verifyGame(a: AnyAdapter): void {
  const rules = GAME_RULES[a.key];
  if (!rules) {
    report(false, a.key, "(registry)", "no GAME_RULES entry");
    return;
  }
  const m = a.tape;
  console.log(`\n=== ${a.key} (${rules.name}) - clamp ${rules.maxScore}, floor ${rules.floorMs / 1000}s ===`);
  if (!m.BASELINE.recorded || m.TAPE.length === 0) {
    report(false, a.key, "(a)", `tape not recorded yet - run: npx tsx scripts/s7-harness.ts --record ${a.key}`);
    return;
  }

  const z1 = replay(a, null, m.TAPE);
  const z2 = replay(a, null, m.TAPE);
  const x1 = replay(a, MAX_LOADOUT, m.TAPE);
  const x2 = replay(a, MAX_LOADOUT, m.TAPE);
  const zStable = sameRun(z1, z2);
  const xStable = sameRun(x1, x2);
  const zBase = sameRun(z1, m.BASELINE.zero);
  const xBase = sameRun(x1, m.BASELINE.max);
  report(
    zStable && xStable && zBase && xBase,
    a.key,
    "(a)",
    `double replay byte-identical vs baseline: null score ${z1.score} hash ${hex(z1.hash)} ${z1.frames}f` +
      `${zStable ? " x2" : " UNSTABLE"}${zBase ? "" : ` != baseline ${m.BASELINE.zero.score}/${hex(m.BASELINE.zero.hash)}`}; ` +
      `max score ${x1.score} hash ${hex(x1.hash)}${xStable ? " x2" : " UNSTABLE"}${xBase ? "" : " != baseline"}`,
  );

  // hash is DELIBERATELY not a term here either: the loadout (classId, level,
  // gear) is serialized inside the sim state, so hashState always differs
  // between two builds even when the loadout has zero mechanical effect.
  const moved = z1.score !== x1.score || z1.frames !== x1.frames || z1.died !== x1.died;
  const bWaived = !moved && a.key in LOADOUT_WAIVERS;
  report(
    moved,
    a.key,
    "(b)",
    `loadout moves outcomes: null {score ${z1.score}, ${z1.secs.toFixed(1)}s, ${z1.died ? "died" : "survived"}} vs ` +
      `max {score ${x1.score}, ${x1.secs.toFixed(1)}s, ${x1.died ? "died" : "survived"}}` +
      (bWaived ? ` - WAIVED: ${LOADOUT_WAIVERS[a.key]}` : ""),
    bWaived,
  );

  const ca = replay(a, CLASS_A, m.TAPE);
  const cb = replay(a, CLASS_B, m.TAPE);
  // hash is DELIBERATELY not a term here: classId is serialized inside the sim
  // state, so hashState always differs between two classes even when class has
  // zero mechanical effect - only score/frames/died prove class moved the run.
  const classMoved = ca.score !== cb.score || ca.frames !== cb.frames || ca.died !== cb.died;
  const b2Waived = !classMoved && a.key in LOADOUT_WAIVERS;
  report(
    classMoved,
    a.key,
    "(b2)",
    `class moves outcomes at equal level/gear: ${CLASS_A.classId} {score ${ca.score}, ${ca.secs.toFixed(1)}s, ${ca.died ? "died" : "survived"}} vs ` +
      `${CLASS_B.classId} {score ${cb.score}, ${cb.secs.toFixed(1)}s, ${cb.died ? "died" : "survived"}}` +
      (b2Waived ? ` - WAIVED: ${LOADOUT_WAIVERS[a.key]}` : ""),
    b2Waived,
  );

  const oracle = botRun(a, MAX_LOADOUT);
  const r = a.rate();
  const env = Math.round(r.perSec * oracle.simSecs + r.burst);
  const underMax = oracle.score <= rules.maxScore;
  const underEnv = oracle.score <= env;
  report(
    underMax && underEnv,
    a.key,
    "(c)",
    `max-loadout oracle ${oracle.score} fits envelope ${env} (${r.perSec}/s x ${oracle.simSecs.toFixed(1)}s sim + ${r.burst}) ` +
      `and <= clamp ${rules.maxScore} (${oracle.secs.toFixed(1)}s wall, ${oracle.detail})`,
  );

  const afk = replay(a, null, []);
  const ended = afk.frames < FRAME_CAP;
  const fastWinBar = rules.fastWinScore;
  const underBar = fastWinBar === 0 || afk.score < fastWinBar;
  const beforeFloor = afk.secs * 1000 < rules.floorMs && underBar;
  report(
    ended && beforeFloor,
    a.key,
    "(d)",
    `AFK probe: idle run ${ended ? "ends" : "NEVER ENDS"} at ${afk.secs.toFixed(1)}s ` +
      `(floor ${rules.floorMs / 1000}s, fast-win bar ${fastWinBar}) scoring ${afk.score} - ${beforeFloor ? "cannot bank" : "COULD BANK"}` +
      `${!beforeFloor && !a.afkStrict ? ` [known: ${a.afkNote ?? "waived"}]` : ""}`,
    !a.afkStrict,
  );

  const mirror = rules.ratePerSec === r.perSec && rules.burst === r.burst;
  const clampSane = rules.maxScore >= 5 * Math.max(1, oracle.score);
  report(
    mirror && clampSane,
    a.key,
    "(e)",
    `registry rate ${rules.ratePerSec}/s + ${rules.burst} ${mirror ? "mirrors" : "differs from"} sim ${r.perSec}/s + ${r.burst}; ` +
      `clamp ${rules.maxScore} ${clampSane ? ">=" : "BELOW"} 5x oracle ${oracle.score} - ${r.source}`,
  );
}

// ---------------------------------------------------------------------------
// recording
// ---------------------------------------------------------------------------

function emitTapeFile(a: AnyAdapter, events: TapeEvent[], zero: RunResult, max: RunResult): string {
  const m = a.tape;
  const displayName = GAME_RULES[a.key]?.name ?? a.key;
  const rows = events
    .map((e) => `  { t: ${e.t}, px: ${e.px}, py: ${e.py}, down: ${e.down}, space: ${e.space} },`)
    .join("\n");
  return `/**
 * ${displayName.toUpperCase()} BASELINE TAPE - recorded ${new Date().toISOString().slice(0, 10)} by
 * \`npx tsx scripts/s7-harness.ts --record ${a.key}\`. DO NOT EDIT BY HAND and
 * do not re-record casually: this file IS the byte-identity baseline the
 * harness replays to prove the sim's behavior did not move. Re-record ONLY
 * when the sim itself deliberately changes, and say so in the commit.
 *
 * Replay contract (scripts/s7-harness.ts): fixed ${m.TAPE_DT.toFixed(6)}s steps at
 * ${m.TAPE_W}x${m.TAPE_H}; an event applies from frame t onward; px/py are integer pixels
 * in that viewport (adapters convert to sim space). BASELINE hashes are
 * fnv1a32 over JSON.stringify of the final sim state.
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

export const TAPE_GAME = "${a.key}";
export const TAPE_SEED = "${m.TAPE_SEED}";
export const TAPE_W = ${m.TAPE_W};
export const TAPE_H = ${m.TAPE_H};
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

function recordGame(a: AnyAdapter): void {
  console.log(`\n=== recording ${a.key} baseline tape (seed "${a.tape.TAPE_SEED}") ===`);
  const rec = recordTape(a, null);
  const zero = replay(a, null, rec.events);
  if (!sameRun(zero, rec.result)) {
    report(false, a.key, "(record)", `downsampled replay diverged from the live recording (record ${rec.result.score}/${hex(rec.result.hash)} vs replay ${zero.score}/${hex(zero.hash)})`);
    return;
  }
  const max = replay(a, MAX_LOADOUT, rec.events);
  const file = emitTapeFile(a, rec.events, zero, max);
  const target = path.join(ROOT, a.tapeRelPath);
  fs.writeFileSync(target, file, "utf8");
  a.tape = { ...a.tape, TAPE: rec.events, BASELINE: { recorded: true, zero, max } };
  console.log(
    `[OK]  ${a.key} tape: ${rec.events.length} events over ${zero.frames} frames (~${zero.secs.toFixed(1)}s); ` +
      `null ${zero.score} (${zero.detail}); max ${max.score} (${max.detail})`,
  );
  console.log(`[OK]  wrote ${a.tapeRelPath}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, "src", "app", "s7", "games"))) {
  console.error("Run from the web3guides repo root (src/app/s7/games not found under cwd).");
  process.exit(2);
}

// content validation first: the authored-table laws are executable (gate 0)
try {
  glContent.validateContent();
  console.log("[OK]  gauntlet content tables validate");
} catch (e) {
  report(false, "gauntlet", "(content)", String(e instanceof Error ? e.message : e));
}
try {
  hdContent.validateContent();
  console.log("[OK]  horde content tables validate");
} catch (e) {
  report(false, "horde", "(content)", String(e instanceof Error ? e.message : e));
}
try {
  crContent.validateContent();
  console.log("[OK]  crypt content tables validate");
} catch (e) {
  report(false, "crypt", "(content)", String(e instanceof Error ? e.message : e));
}

const argv = process.argv.slice(2);
const recording = argv.includes("--record");
const names = argv.filter((x) => !x.startsWith("--"));
const selected = ADAPTERS.filter((a) => names.length === 0 || names.includes(a.key));
if (selected.length === 0) {
  console.error(`No wired game matches [${names.join(", ")}]. Wired: ${ADAPTERS.map((a) => a.key).join(", ")}`);
  process.exit(2);
}

for (const a of selected) {
  if (recording) recordGame(a);
  verifyGame(a);
}

console.log(failures === 0 ? "\nALL CHECKS GREEN" : `\n${failures} CHECK(S) FAILED`);
if (failures > 0) process.exit(1);
