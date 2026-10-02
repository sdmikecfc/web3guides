/**
 * S5 HEADLESS GAME HARNESS - the standing determinism / ceiling / pacing proof
 * for every Season 5 sim (the tool the sim headers call "the headless proof").
 *
 * Run from the web3guides repo root:
 *
 *   npx tsx scripts/s5-harness.ts                    verify every wired game
 *   npx tsx scripts/s5-harness.ts tankbuster         verify one game
 *   npx tsx scripts/s5-harness.ts --record tankbuster  (re)record the baseline
 *                                                    tape + rewrite tape.ts,
 *                                                    then verify it
 *
 * CHECKS PER GAME (the per-game merge gate):
 *  (a) DOUBLE REPLAY, BYTE-IDENTICAL - the recorded input tape replays twice
 *      on the tape's seed; both runs must produce the identical final score
 *      AND the identical fnv1a hash of the full final sim state, and both
 *      must equal the BASELINE frozen in tape.ts. Because the baseline was
 *      captured against the pre-transform sim tree, a green (a) after any
 *      page/shell refactor is the proof the refactor changed nothing.
 *  (b) STATS MOVE OUTCOMES - the same tape replayed with a max-stat build
 *      must produce a different gameplay outcome (score, run length or
 *      survival) than the zero-stat build: stats are real, not cosmetic.
 *  (c) MAX-STAT ORACLE UNDER THE CEILING - a scripted omniscient bot plays a
 *      live max-stat run; its score must stay at or under BOTH the in-sim
 *      ceiling and the registry maxScore (margin printed).
 *  (d) PACING / AFK PROBE - an empty tape (nobody touches anything) must end
 *      the run BEFORE the registry floorMs, so an AFK run can never bank.
 *      Games marked afkStrict=false report the number without failing the
 *      suite (documented per-game below).
 *  (e) CEILING vs REGISTRY - where the sim exports ceiling() (or the harness
 *      can derive it exactly from exported constants), assert the registry
 *      maxScore equals the ceiling plus the documented ~10% margin.
 *
 * TAPES: src/app/s5/games/<key>/tape.ts, arrays of {t, px, py, down, space}
 * where t is the FRAME INDEX (fixed TAPE_DT steps) the event takes effect and
 * px/py are sim-input coordinates (world coordinates once a game's shell
 * converts pointer to world space; for the current sims that space is the
 * canvas pixel space at TAPE_W x TAPE_H). Tapes are frozen recordings of the
 * oracle bot, downsampled, quantized, and NEVER regenerated implicitly: only
 * --record rewrites them, because a rewritten tape resets the byte-identity
 * baseline the page transforms are proven against.
 *
 * The harness itself uses no Math.random, no Date-dependent logic in any sim
 * path, and steps every sim at a fixed 1/60s: same seed + same tape = same
 * bytes, forever, on any machine.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { GAME_RULES } from "../src/lib/s5/games";
import * as hl from "../src/app/s5/games/warpath/sim";
import * as wb from "../src/app/s5/games/warhawks/sim";
import * as ac from "../src/app/s5/games/armorclash/sim";
import * as vg from "../src/app/s5/games/vanguard/sim";
import * as hlTape from "../src/app/s5/games/warpath/tape";
import * as wbTape from "../src/app/s5/games/warhawks/tape";
import * as acTape from "../src/app/s5/games/armorclash/tape";
import * as vgTape from "../src/app/s5/games/vanguard/tape";

// ---------------------------------------------------------------------------
// shared shapes
// ---------------------------------------------------------------------------

interface InputFrame {
  px: number | null;
  py: number | null;
  down: boolean;
  space: boolean;
}

interface TapeEvent extends InputFrame {
  t: number; // frame index the event takes effect
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

interface Stats {
  botox: number;
  drugs: number;
  ozempic: number;
  aura: number;
  optics: number;
}

const MAX_STATS: Stats = { botox: 4, drugs: 4, ozempic: 4, aura: 30, optics: 4 };

const NEUTRAL: InputFrame = { px: null, py: null, down: false, space: false };

/** Hard stop so a broken sim can never hang the gate (12 minutes at 60fps). */
const FRAME_CAP = 60 * 60 * 12;

/** Pointer downsample: refresh the aimed/held point every N frames while
 * flags are steady; every down/space flip is emitted frame-exact. */
const POINTER_EVERY = 6;

interface Adapter<S> {
  key: string;
  create: (w: number, h: number, seed: string, stats: Stats | null) => S;
  step: (s: S, dt: number, input: InputFrame) => void;
  done: (s: S) => boolean;
  score: (s: S) => number;
  died: (s: S) => boolean;
  detail: (s: S) => string;
  /** Exact legit ceiling from live sim constants + where it comes from. */
  ceiling: () => { total: number; source: string };
  /** Omniscient scripted player (deterministic; reads sim state only). */
  bot: () => (s: S, frame: number) => InputFrame;
  tape: TapeModule;
  tapeRelPath: string;
  /** false = report the AFK number without failing the suite (documented). */
  afkStrict: boolean;
  afkNote?: string;
}

type AnyAdapter = Adapter<unknown>;
function wrap<S>(a: Adapter<S>): AnyAdapter {
  return a as unknown as AnyAdapter;
}

// ---------------------------------------------------------------------------
// deterministic state hash (fnv1a over the JSON of the final state; the rng
// closures are functions and drop out of JSON, everything else is data)
// ---------------------------------------------------------------------------

/** The harness owns its hash. This used to call `tb.fnv1a` — tankbuster's
 * export — which quietly made EVERY game's byte-identity check depend on one
 * game's folder existing. Retiring that game would have broken all four (a)
 * checks at once, and the failure would have looked like a determinism bug
 * rather than a missing import. Same algorithm, no cross-game coupling. */
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
  detail: string;
}

function replay(a: AnyAdapter, stats: Stats | null, tape: TapeEvent[]): RunResult {
  const m = a.tape;
  const s = a.create(m.TAPE_W, m.TAPE_H, m.TAPE_SEED, stats);
  let cur: InputFrame = NEUTRAL;
  let ei = 0;
  let f = 0;
  for (; f < FRAME_CAP; f++) {
    if (a.done(s)) break;
    while (ei < tape.length && tape[ei].t <= f) {
      const e = tape[ei];
      cur = { px: e.px, py: e.py, down: e.down, space: e.space };
      ei++;
    }
    a.step(s, m.TAPE_DT, cur);
  }
  return {
    score: Math.round(a.score(s)),
    hash: hashState(s),
    frames: f,
    died: a.died(s),
    secs: f * m.TAPE_DT,
    detail: a.detail(s),
  };
}

/** Live bot run (check c). Deterministic: the bot reads only sim state. */
function botRun(a: AnyAdapter, stats: Stats | null): RunResult {
  const m = a.tape;
  const s = a.create(m.TAPE_W, m.TAPE_H, m.TAPE_SEED, stats);
  const bot = a.bot();
  let f = 0;
  for (; f < FRAME_CAP; f++) {
    if (a.done(s)) break;
    const want = bot(s, f);
    a.step(s, m.TAPE_DT, {
      px: want.px == null ? null : Math.round(want.px),
      py: want.py == null ? null : Math.round(want.py),
      down: want.down,
      space: want.space,
    });
  }
  return {
    score: Math.round(a.score(s)),
    hash: hashState(s),
    frames: f,
    died: a.died(s),
    secs: f * m.TAPE_DT,
    detail: a.detail(s),
  };
}

/** Record the bot's play as a downsampled, quantized event tape. The sim is
 * fed EXACTLY the downsampled input (cur), so replaying the emitted tape
 * reproduces this run byte for byte. */
function recordTape(a: AnyAdapter, stats: Stats | null): { events: TapeEvent[]; result: RunResult } {
  const m = a.tape;
  const s = a.create(m.TAPE_W, m.TAPE_H, m.TAPE_SEED, stats);
  const bot = a.bot();
  const events: TapeEvent[] = [];
  let cur: InputFrame = NEUTRAL;
  let f = 0;
  for (; f < FRAME_CAP; f++) {
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
  return {
    events,
    result: {
      score: Math.round(a.score(s)),
      hash: hashState(s),
      frames: f,
      died: a.died(s),
      secs: f * m.TAPE_DT,
      detail: a.detail(s),
    },
  };
}

// ---------------------------------------------------------------------------
// HOLDLINE (Hold the Line) adapter + oracle bot
// ---------------------------------------------------------------------------

/**
 * The Hold the Line oracle drives the one-pointer grammar the sim defines:
 * QUICK TAP (1 frame down + up) aims the turret and queues a shot, LONG HOLD
 * steers the hull, SPACE held keeps the gun cycling at the current angle.
 * Priorities: planting sappers > walking sappers > heavies > cars; drive to
 * the crate when the field is quiet.
 *
 * TWO PERSONAS, ONE SCRIPT (the round-2 tune): the zero-stat recording (the
 * tape, checks a/b/d) keeps the deliberately COARSE mid-skill handling
 * (~0.6s between re-aims, ~0.7s steering holds); on a maxed build (detected
 * via mods.ranging, which only a high-Optics/Caliber build carries) the
 * oracle re-aims and re-plans on the faster cadence the retuned TURRET_SLEW
 * actually supports, so check (c) probes a genuinely STRONG run. Reach comes
 * from the sim's own effRange, so the bot never wastes the Caliber ring or a
 * RANGE BOOST. Deterministic either way: it reads sim state only.
 */
function warpathBot(): (s: hl.WarpathState, frame: number) => InputFrame {
  let gest: "none" | "tap" | "up" | "hold" | "holdup" = "none";
  let gestT = 0;
  let gx = 0;
  let gy = 0;
  let tapCd = 0;
  let choicePhase = 0; // 0 not yet acted, 1 released, 2 pressed, 3 done
  return (s) => {
    if (tapCd > 0) tapCd--;
    if (s.phase !== "play") {
      gest = "none";
      gestT = 0;
      return NEUTRAL;
    }
    // THE FINAL ASSAULT GATE (wave 14 -> 15): a paused build-choice. The sim
    // resolves it on a FRESH press (freshDown), so any gesture already mid-
    // flight is abandoned, released for one frame to force a real down-edge,
    // then pressed on the RIGHT of the hull (HOT SHELLS) - the aggressive
    // pick, matching the oracle's own play-for-the-strong-build spirit
    // elsewhere in this file (e.g. the warhawks bomb-first plan).
    if (s.choicePending) {
      gest = "none";
      gestT = 0;
      if (choicePhase === 0) {
        choicePhase = 1;
        return { px: s.px, py: s.py, down: false, space: false };
      }
      if (choicePhase === 1) {
        choicePhase = 2;
        return { px: s.px + 80 * s.k, py: s.roadY, down: true, space: false };
      }
      return { px: s.px + 80 * s.k, py: s.roadY, down: false, space: false };
    }
    choicePhase = 0;
    const k = s.k;
    const sharp = s.mods.ranging; // maxed build: play at the slew's real pace
    const range = hl.effRange(s) * k;

    // survey the field
    let shoot: hl.Foe | null = null;
    let shootScore = Infinity;
    let threat: hl.Foe | null = null;
    let threatScore = Infinity;
    let anyInRange = false;
    for (const f of s.foes) {
      if (f.hp <= 0 || f.ko > 0) continue;
      const d = Math.hypot(f.x - s.px, f.y - s.py);
      if (d < range) anyInRange = true;
      const prio = f.plant > 0 ? 0 : f.kind === "sapper" ? 1000 : f.kind === "heavy" ? 2000 : 3000;
      if (d < range * 0.92 && prio + d < shootScore) {
        shootScore = prio + d;
        shoot = f;
      }
      if (prio + d < threatScore) {
        threatScore = prio + d;
        threat = f;
      }
    }
    const space = anyInRange; // level-held: the gun re-fires at the last angle

    // gesture machine (one pointer: gestures serialize)
    if (gest === "tap") {
      gest = "up";
      return { px: gx, py: gy, down: true, space };
    }
    if (gest === "up") {
      gest = "none";
      return { px: gx, py: gy, down: false, space };
    }
    if (gest === "hold") {
      gestT--;
      if (gestT <= 0) gest = "holdup";
      return { px: gx, py: gy, down: true, space };
    }
    if (gest === "holdup") {
      gest = "none";
      return { px: gx, py: gy, down: false, space };
    }

    // idle: choose the next gesture
    if (shoot && tapCd === 0) {
      gx = shoot.x;
      gy = shoot.y;
      gest = "tap";
      tapCd = sharp ? 18 : 36; // mid-skill ~0.6s between re-aims; strong ~0.3s
      return { px: gx, py: gy, down: true, space };
    }
    let dest: { x: number; y: number } | null = null;
    if (threat && (threat.plant > 0 || threat.kind === "sapper")) {
      // a planting or walking sapper somewhere: close on it
      dest = { x: threat.x, y: threat.y };
    }
    if (!dest && s.drop && s.drop.fall <= 0 && !s.drop.gone && !shoot) {
      dest = { x: s.drop.x, y: s.drop.y };
    }
    if (!dest && threat) dest = { x: threat.x, y: threat.y };
    if (!dest) dest = { x: s.W / 2, y: s.roadY + 54 * k }; // home post
    if (Math.hypot(dest.x - s.px, dest.y - s.py) > 30 * k) {
      gx = dest.x;
      gy = dest.y;
      gest = "hold";
      gestT = sharp ? 24 : 42; // mid-skill ~0.7s steering holds; strong ~0.4s
      return { px: gx, py: gy, down: true, space };
    }
    return { px: s.px, py: s.py, down: false, space };
  };
}

// ---------------------------------------------------------------------------
// WARBIRDS adapter + oracle bot
// ---------------------------------------------------------------------------

/**
 * The Warbirds oracle drives the VERTICAL sim's one-thumb grammar in CANVAS
 * coords (the tape contract; the rebuilt game needs no pointerTransform, so the
 * sim's input space IS canvas pixel space, which is what tapes record).
 *
 * IT HOLDS THE STICK. The sim reads input.px EVERY frame a hold is live, so the
 * oracle keeps `down` true for the whole run and just walks px — the coarse
 * hold/release cycle the horizontal build used could not react inside a flak
 * telegraph. The only reason it ever lets go is to shoot: a tap needs a fresh
 * down, so a gun burst is a 3-frame RELEASE -> PRESS -> LIFT interruption with
 * px FROZEN across it (tap detection now measures X-only movement, and a moved
 * pointer would be read as steering). Bombs never use the pointer at all: they
 * go out as 1-frame SPACE pulses, so a tap can never chain into an accidental
 * double-tap.
 *
 * IT PLAYS FOR THE BOMB, because that is where 88.5% of the board's points are.
 * The release solution is closed form — a bomb dropped now lands at (s.x, s.wy +
 * BOMB_LEAD), the pipper the HUD draws — so the plan is an INTERCEPT: of every
 * live ground target ahead, take the one that reaches the pipper row soonest AND
 * that the plane's own roll rate can still reach in time (tCover < tArrive), fly
 * that lane, and pulse SPACE the frame the solution lands inside the blast.
 * Guns are a free side-order: a tap whenever an air target sits in the forward
 * cone, since tracers cannot reach the deck.
 *
 * Steering priority, softest first so the hard rules overwrite: the bomb
 * intercept -> a flak telegraph PREDICTED onto our row (the exact test the sim
 * will run, so the dodge is a reversal, not a guess) -> converging bullets
 * projected onto our row -> a fighter's collision lane -> balloon bags and
 * CABLES -> and LAST, as an absolute constraint, the ridge lines (instant death,
 * so they outrank every softer dodge above).
 * Deterministic: reads sim state only, no rng, no wall clock.
 */
function warhawksBot(): (s: wb.WarState, frame: number) => InputFrame {
  // NO TAP MACHINE. The old bot opened a 3-frame quick-tap whenever an air
  // target entered the gun cone, which was correct when a tap fired the guns.
  // The guns are automatic now and a quick tap DROPS A BOMB, so that machine
  // had become a bomb-waster pointed at the sky. The bot holds the pointer
  // down for the whole run (that is pure steering) and pulses SPACE for bombs.
  let gx = -1;
  let spaceCd = 0;
  return (s) => {
    if (spaceCd > 0) spaceCd--;
    if (s.phase !== "play") return NEUTRAL;
    const k = s.k;
    const lead = wb.BOMB_LEAD * k;
    const fwd = wb.SCROLL * k; // px/s the plane eats forward: the whole clock
    const roll = wb.ROLL * s.mods.rollMul * k;
    if (gx < 0) gx = s.x;

    // ── bomb: the pipper IS the solution, so the test is one distance ──────
    let space = false;
    if (s.bombCd <= 0 && spaceCd <= 0) {
      const iy = s.wy + lead; // where a bomb released this frame lands
      let hit = false;
      for (const g of s.grounds) {
        if (g.dead) continue;
        if (Math.hypot(s.x - g.x, iy - g.wy) < (wb.BLAST * k + g.w) * 0.8) {
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const a of s.aas) {
          if (a.dead) continue;
          if (Math.hypot(s.x - a.x, iy - a.wy) < wb.BLAST * k * 0.8) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        space = true;
        spaceCd = 10;
      }
    }

    // ── the 3-frame gun tap: px MUST NOT MOVE across it ────────────────────


    // ── steering: DESIRED lane, then a candidate-lane cost search ──────────
    // Sequential "dodge threat A then threat B" overwrites fight each other
    // whenever two threats overlap (measured: hits arrived in 2-4s clusters), so
    // the plan is scored instead. First the lane we WANT, then the safest lane
    // near it.
    //
    // 1) DESIRED: the bomb intercept. Of every live ground target ahead, take
    //    the one that reaches the pipper row soonest AND that the plane's own
    //    roll rate can still reach in time (tCover < tArrive); anything it
    //    cannot make is written off and the next one taken.
    let desired = s.x;
    let bestT = Infinity;
    const consider = (tx: number, twy: number) => {
      const tArrive = (twy - (s.wy + lead)) / fwd; // s until it hits the pipper row
      if (tArrive < -0.15 || tArrive > 14 || tArrive >= bestT) return;
      if (Math.abs(tx - s.x) / roll > tArrive + 0.35) return; // unreachable
      bestT = tArrive;
      desired = tx;
    };
    for (const g of s.grounds) if (!g.dead) consider(g.x, g.wy);
    for (const a of s.aas) if (!a.dead) consider(a.x, a.wy);

    // 2) DANGER(lane): how badly a given lane is threatened. Each term is the
    //    overlap depth in px, so two half-overlaps add up and the search can
    //    find the gap between them instead of ping-ponging.
    const cableW = 3.5 + wb.PLANE_R * 0.55; // design px, the sim's own cable test
    const danger = (c: number): number => {
      let d = 0;
      // flak telegraphs: run the sim's OWN test forward. A telegraph blooms at
      // (tl.x, tl.wy) in tl.t seconds, by which time our row is s.wy + fwd*tl.t.
      for (const tl of s.teles) {
        const rowThen = s.wy + fwd * tl.t;
        if (Math.abs(tl.wy - rowThen) > wb.FLAK_R * k + 24 * k) continue;
        d += Math.max(0, wb.FLAK_R * k + 30 * k - Math.abs(tl.x - c));
      }
      // live bursts that have not spent their one hit test yet
      for (const fb of s.bursts) {
        if (fb.hitDone) continue;
        if (Math.abs(fb.wy - s.wy) > fb.r + 26 * k) continue;
        d += Math.max(0, fb.r + 28 * k - Math.abs(fb.x - c));
      }
      // converging bullets: closing rate along the forward axis includes OUR
      // own advance, so project with (vwy - fwd), not vwy alone
      for (const eb of s.ebullets) {
        const close = eb.vwy - fwd;
        if (Math.abs(close) < 1e-6) continue;
        const tHit = (s.wy - eb.wy) / close;
        if (tHit <= 0 || tHit > 1.0) continue; // rings/spirals fly slower and linger
        const xAt = eb.x + eb.vx * tHit;
        d += Math.max(0, 26 * k - Math.abs(xAt - c)) * (1.4 - tHit);
      }
      // fighters that can reach our row. Collision is fatal, and it is
      // PREDICTED: a diver closes at SCROLL + 95 px/s while sliding INTO our
      // lane, and an overtaking climber deliberately crosses our row aiming for
      // s.x + 40, so the lane is tested against where each fighter WILL be.
      // (Only "chase" is skipped: it sits behind us and tracks without ever
      // crossing.) Weighted x1 on purpose — measured, over-weighting this term
      // costs more bombing lanes than the collisions it saves (38px/x1 landed
      // 5/16 for a mean 44% of ceiling; 46px/x2 dropped to 4/16 and 41%).
      for (const f of s.fighters) {
        if (f.dead || f.state === "wait" || f.state === "gone" || f.state === "chase") continue;
        for (const ahead of [0, 0.25, 0.5]) {
          const fwy = f.wy + (f.vwy - fwd) * ahead;
          if (Math.abs(fwy - s.wy) > 44 * k) continue;
          d += Math.max(0, 38 * k - Math.abs(f.x + f.vx * ahead - c));
        }
      }
      // the ridge lines: instant death, weighted so nothing outbids them
      d += Math.max(0, s.laneMin + 26 * k - c) * 8;
      d += Math.max(0, c - (s.laneMax - 26 * k)) * 8;
      return d;
    };

    // 3) pick the cheapest lane: safety dominates, then nearness to the bomb
    //    line, then reachability. The candidate set is ABSOLUTE (fixed lanes
    //    across the corridor plus the bomb line and the current position), NOT
    //    offsets from s.x — offsets re-derived from a moving plane every frame
    //    make the plan non-committal and the plane jitters in place instead of
    //    clearing the threat (measured: relative offsets landed 0/16, absolute
    //    lanes 10/16 on the identical sim).
    const lo = s.laneMin + 22 * k;
    const hi = s.laneMax - 22 * k;
    const LANES = 15;
    let target = s.x;
    let bestCost = Infinity;
    const weigh = (c0: number) => {
      const c = Math.max(lo, Math.min(hi, c0));
      const cost = danger(c) * 7 + Math.abs(c - desired) * 0.5 + Math.abs(c - s.x) * 0.18;
      if (cost < bestCost) {
        bestCost = cost;
        target = c;
      }
    };
    for (let i = 0; i < LANES; i++) weigh(lo + ((hi - lo) * i) / (LANES - 1));
    weigh(desired);
    weigh(s.x);
    gx = target;

    // ── the SECOND AXIS, new. `py` used to be s.planeSy, the fixed station,
    // which was a no-op. The plane can move forward and back now, so the bot
    // uses it the way the change intends it to be used.
    //
    // Default station is slightly FORWARD of centre: in a vertical shooter
    // that buys reaction time, because more of the road ahead is on screen.
    // Below a third of a tank that is abandoned and the nearest fuel drop
    // becomes the plan, because running dry is now the most likely way a
    // competent run ends.
    let py = s.H * 0.62;
    if (s.fuel < wb.FUEL_MAX * 0.34) {
      let best: { x: number; wy: number } | null = null;
      let bd = Infinity;
      for (const d of s.drops) {
        if (d.life <= 0 || d.kind !== "fuel") continue;
        const dd = Math.hypot(d.x - s.x, d.wy - s.wy);
        if (dd < bd) {
          bd = dd;
          best = d;
        }
      }
      if (best) {
        gx = best.x;
        py = wb.sy(s, best.wy);
      }
    }
    return { px: gx, py, down: true, space };
  };
}

// ---------------------------------------------------------------------------
// ROLL OUT oracle bot
// ---------------------------------------------------------------------------
/** Plays the positioning game the way the design intends: it does not aim,
 * because there is nothing to aim. It picks a STAND whose slope throws a shell
 * onto the nearest enemy, drives there, and pulls the trigger when its own
 * ballistic walk says the shot lands. Everything it reads is state; it rolls
 * nothing and it never uses a key the tape channel cannot carry. */
/**
 * BREAKTHROUGH's oracle. Steering is the only verb, so the whole bot is a
 * priority list over "where should the leader be right now".
 *
 *   1. DODGE. A hazard inside the look-ahead window outranks everything else:
 *      men are the currency and an obstacle is the one thing that spends them
 *      for nothing in return.
 *   2. THE BETTER GATE, evaluated against the CURRENT crowd. This is the real
 *      decision the game asks, and the reason a flat "always take the multiply"
 *      bot would prove nothing: +30 crushes x2 at eight men and is a disaster
 *      at eighty.
 *   3. SWEEP a straggler if one is roughly on the way.
 *   4. Hold the middle, which is the best default against an unseen hazard.
 *
 * Enemy columns are deliberately NOT avoided. You are meant to go through them,
 * they pay per man, and steering around one is how a player loses points.
 */
/**
 * VANGUARD's oracle. It has one job the other bots do not: it has to NAVIGATE.
 *
 * Deliberately simple and deterministic -- it drives at the live rally point,
 * steers around whatever building is directly in the way, and fires whenever
 * something hostile is roughly down the barrel. It is not meant to play well;
 * checks (c) and (d) only need it to be competent enough to prove the ceiling
 * is not reachable and honest enough to be reproducible.
 */
function vanguardBot(): (s: vg.VgState, frame: number) => InputFrame {
  let fireEvery = 0;
  return (s, frame) => {
    const cp = s.route[s.cpIdx];
    if (!cp) return NEUTRAL;
    let wantX = cp.x;
    let wantY = cp.y;

    // If a building blocks the straight line, aim at the nearest lattice node
    // that does not -- the streets are the graph, so this is enough to move.
    let blocked = false;
    for (const b of s.buildings) {
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = s.px + (cp.x - s.px) * t;
        const y = s.py + (cp.y - s.py) * t;
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
    }
    if (blocked) {
      let bd = Infinity;
      for (const nx of s.nodeX) {
        for (const ny of s.nodeY) {
          const toNode = Math.hypot(nx - s.px, ny - s.py);
          if (toNode < 30 || toNode > 260) continue;
          const d = Math.hypot(nx - cp.x, ny - cp.y) + toNode * 0.5;
          if (d < bd) {
            bd = d;
            wantX = nx;
            wantY = ny;
          }
        }
      }
    }

    // Fire on a cadence when a truck is roughly ahead: a tap is a RELEASE in
    // this game, so the bot uses the space edge instead of faking a tap.
    fireEvery++;
    let space = false;
    if (fireEvery % 40 === 0) {
      for (const tk of s.trucks) {
        if (!tk.alive || !tk.spawned) continue;
        const a = Math.atan2(tk.y - s.py, tk.x - s.px);
        let d = a - s.pa;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < 0.25 && Math.hypot(tk.x - s.px, tk.y - s.py) < 340) {
          space = true;
          break;
        }
      }
    }
    return { px: wantX, py: wantY, down: true, space };
  };
}

function armorclashBot(): (s: ac.AcState, frame: number) => InputFrame {
  let gx = 180;
  let gy = 250;
  let phase = 0; // 0 idle, 1 press queued, 2 release queued
  let cd = 0;
  return (s) => {
    if (cd > 0) cd--;
    if (s.phase !== "play") {
      phase = 0;
      return NEUTRAL;
    }
    if (phase === 1) {
      phase = 2;
      return { px: gx, py: gy, down: true, space: false };
    }
    if (phase === 2) {
      phase = 0;
      cd = 10;
      return { px: gx, py: gy, down: false, space: false };
    }
    if (cd > 0) return { px: gx, py: gy, down: false, space: false };

    // the most advanced enemy on OUR half is the thing that has to die first
    let threat: ac.Unit | null = null;
    let ty = -1;
    for (const u of s.units) {
      if (u.dead || u.side !== 1) continue;
      if (u.y > ac.RIVER_Y1 && u.y > ty) {
        ty = u.y;
        threat = u;
      }
    }

    // pick a hand slot: the dearest card we can afford answers a threat, the
    // cheapest keeps a push rolling
    let wantSlot = -1;
    let bestCost = threat ? -1 : 99;
    for (let i = 0; i < 4; i++) {
      const c = ac.CARDS[s.hand[i]];
      if (!c || c.cost > s.mana) continue;
      if (threat ? c.cost > bestCost : c.cost < bestCost) {
        bestCost = c.cost;
        wantSlot = i;
      }
    }
    if (wantSlot < 0) return { px: gx, py: gy, down: false, space: false };

    if (s.sel !== wantSlot) {
      const r = ac.slotRect(wantSlot);
      gx = (r.x0 + r.x1) / 2;
      gy = (r.y0 + r.y1) / 2;
      phase = 1;
      return { px: gx, py: gy, down: false, space: false };
    }

    if (threat) {
      // meet it goal-side, so our tank is between the threat and our tower
      gx = Math.max(20, Math.min(ac.VIEW_W - 20, threat.x));
      gy = Math.max(ac.RIVER_Y1 + 10, Math.min(ac.FIELD_H - 12, threat.y + 26));
    } else {
      // push the lane whose enemy tower is already softer; ties go left
      let lane = 0;
      let bestHp = Infinity;
      for (const t of s.towers) {
        if (t.side !== 1 || t.big || t.dead) continue;
        if (t.hp < bestHp) {
          bestHp = t.hp;
          lane = t.x < ac.VIEW_W / 2 ? 0 : 1;
        }
      }
      gx = ac.BRIDGE_XS[lane];
      gy = ac.RIVER_Y1 + 16;
    }
    phase = 1;
    return { px: gx, py: gy, down: false, space: false };
  };
}


// ---------------------------------------------------------------------------
// THE WIRED SLATE
// ---------------------------------------------------------------------------
// One entry per live game key. There is no auto-discovery on purpose: a game
// only enters the merge gate when somebody deliberately wires it here, and a
// retired game leaves the gate by leaving this array.
const ADAPTERS: AnyAdapter[] = [
  wrap<ac.AcState>({
    key: "armorclash",
    create: (w, h, seed, stats) => ac.createArmorclash(w, h, seed, false, stats),
    step: (s, dt, input) =>
      ac.stepArmorclash(s, dt, {
        px: input.px,
        py: input.py,
        down: input.down,
        left: false,
        right: false,
        up: false,
        downKey: false,
        space: input.space,
      }),
    done: (s) => ac.armorclashDone(s),
    score: (s) => ac.armorclashScore(s),
    died: (s) => !s.win,
    detail: (s) =>
      `${s.win ? "river taken" : `lost (${s.deathCause})`} ` +
      `round ${s.round}/${ac.ROUNDS}, kills ${s.kills}, HQs ${s.hqDownEnemy}, ` +
      `towers ${s.towersDownEnemy}, deploys ${s.deploysPlayer}v${s.deploysEnemy}`,
    ceiling: () => {
      const c = ac.ceiling();
      return {
        total: c.total,
        source:
          `sim ceiling(): kills ${c.kills} + tower damage and razes ${c.towers} + ` +
          `round wins ${c.rounds} + clock ${c.clock}`,
      };
    },
    bot: armorclashBot,
    tape: acTape as TapeModule,
    tapeRelPath: "src/app/s5/games/armorclash/tape.ts",
    // Two independent guards, either of which alone ends an idle run with 0:
    // IDLE_SCUTTLE_T scuttles at 15s, and tower kills pay nothing, so a run
    // that deploys nothing cannot score even while its towers work.
    afkStrict: true,
  }),
  wrap<hl.WarpathState>({
    key: "warpath",
    create: (w, h, seed, stats) => hl.createWarpath(w, h, seed, false, stats),
    step: (s, dt, input) =>
      hl.stepWarpath(s, dt, {
        px: input.px,
        py: input.py,
        down: input.down,
        left: false,
        right: false,
        up: false,
        downKey: false,
        space: input.space,
      }),
    done: (s) => hl.warpathDone(s),
    score: (s) => hl.warpathScore(s),
    died: (s) => !s.win,
    detail: (s) =>
      `${s.win ? "siegebreaker down" : "lost"} ` +
      `wave ${s.wave}, squad ${hl.warpathSquadAlive(s)}/${hl.TRUCKS}, kills ${s.kills}`,
    ceiling: () => {
      const c = hl.ceiling();
      return {
        total: c.total,
        source:
          `sim ceiling(): kills ${c.kills} + survival ${c.survival} + drops ${c.drops} + ` +
          `siegebreaker ${c.boss} + relief ${c.relief}`,
      };
    },
    bot: warpathBot,
    tape: hlTape as TapeModule,
    tapeRelPath: "src/app/s5/games/warpath/tape.ts",
    // An untouched run is targeted by every enemy on the field (see the
    // retarget site) and the squad holds fire, so it dies well short of the
    // 60s floor having scored nothing.
    afkStrict: true,
  }),
  wrap<wb.WarState>({
    key: "warhawks",
    create: (w, h, seed, stats) => wb.createWarhawks(w, h, seed, false, stats),
    step: (s, dt, input) =>
      wb.stepWarhawks(s, dt, {
        px: input.px,
        py: input.py,
        down: input.down,
        left: false,
        right: false,
        up: false,
        downKey: false,
        space: input.space,
      }),
    done: (s) => wb.warDone(s),
    score: (s) => wb.warScore(s),
    died: (s) => !s.won,
    detail: (s) =>
      `${s.won ? "landed" : `down leg ${s.leg + 1} (${s.deathCause})`} ` +
      `${s.bombsOnTarget}/${s.bombsLanded} bombs on target, grazes ${s.grazes}, chains ${s.chains}`,
    ceiling: () => {
      const c = wb.ceiling();
      return {
        total: c.total,
        source:
          `sim ceiling(): fighters ${c.fighters} + AA ${c.aa} + tanks ${c.tanks} + ` +
          `turrets ${c.turrets} + bases ${c.bases} + graze ${c.graze} + chains ${c.chains} + ` +
          `flagship ${c.flagship} + leg bonuses ${c.bonuses} + landing ${c.landing} ` +
          `[bomb-only ${c.bombs} vs gun-only ${c.guns}]`,
      };
    },
    bot: warhawksBot,
    tape: wbTape as TapeModule,
    tapeRelPath: "src/app/s5/games/warhawks/tape.ts",
    // No thumb means no slide: the plane drifts into a ridge line inside
    // single-digit seconds, which is plain physics rather than a rule.
    afkStrict: true,
  }),
  wrap<vg.VgState>({
    key: "vanguard",
    create: (w, h, seed, stats) => vg.createVanguard(w, h, seed, false, stats),
    step: (s, dt, input) =>
      vg.stepVanguard(s, dt, {
        px: input.px,
        py: input.py,
        down: input.down,
        left: false,
        right: false,
        up: false,
        downKey: false,
        space: input.space,
      }),
    done: (s) => vg.vanguardDone(s),
    score: (s) => vg.vanguardScore(s),
    died: (s) => s.died,
    detail: (s) =>
      `${s.win ? "linked up" : s.died ? "hull breached" : "out of time"} ` +
      `rally ${s.cpIdx}/${s.route.length}, ${s.kills} trucks, ${s.breaches} breaches, hull ${Math.round(s.hp)}`,
    ceiling: () => {
      const c = vg.ceiling();
      return {
        total: c.total,
        source: `sim ceiling(): rallies ${c.rallies} + final ${c.final} + trucks ${c.trucks} + breaches ${c.breaches} + time ${c.time}`,
      };
    },
    bot: vanguardBot,
    tape: vgTape as TapeModule,
    tapeRelPath: "src/app/s5/games/vanguard/tape.ts",
    // THE TRUCKS ARE THE AFK GATE. A tank that never steers drives into the
    // first wall and sits there; the convoy converges on a stationary target
    // and machine-guns it down well inside the bank floor.
    afkStrict: true,
  }),
];

// ---------------------------------------------------------------------------
// tape.ts writer (record mode)
// ---------------------------------------------------------------------------

function emitTapeFile(a: AnyAdapter, events: TapeEvent[], zero: RunResult, max: RunResult): string {
  const m = a.tape;
  // nullness lives in flag bits 2/3, NEVER in a coordinate sentinel: aim
  // points can be legitimately negative (foes engaged beyond the canvas edge)
  const rows = events
    .map(
      (e) =>
        `[${e.t},${e.px ?? 0},${e.py ?? 0},${(e.down ? 1 : 0) | (e.space ? 2 : 0) | (e.px == null ? 4 : 0) | (e.py == null ? 8 : 0)}]`,
    )
    .join(",\n");
  const displayName = GAME_RULES[a.key]?.name ?? a.key;
  return `/**
 * ${displayName.toUpperCase()} BASELINE TAPE - recorded ${new Date().toISOString().slice(0, 10)} by
 * \`npx tsx scripts/s5-harness.ts --record ${a.key}\` against the pre-transform
 * sim tree. DO NOT EDIT BY HAND and do not re-record casually: this file IS
 * the byte-identity baseline the harness replays after every page/shell
 * refactor to prove the sim's behavior did not move. Re-record ONLY when the
 * sim itself deliberately changes (which invalidates old tapes by design),
 * and say so in the commit.
 *
 * Replay contract (scripts/s5-harness.ts): fixed ${m.TAPE_DT.toFixed(6)}s steps at
 * ${m.TAPE_W}x${m.TAPE_H}; an event applies from frame t onward; px/py are sim-input
 * coordinates (may be negative: foes are engaged beyond the canvas edge);
 * flags bit0=down, bit1=space, bit2=px is null, bit3=py is null (null =
 * pointer never moved). BASELINE hashes are fnv1a32 over JSON.stringify of
 * the final sim state (rng closures drop out of JSON).
 *
 * zero-stat replay: score ${zero.score}, ${zero.frames} frames (~${zero.secs.toFixed(1)}s), ${zero.detail}
 * max-stat replay:  score ${max.score}, ${max.frames} frames (~${max.secs.toFixed(1)}s), ${max.detail}
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

/** [t, px, py, flags(bit0 down, bit1 space, bit2 px null, bit3 py null)] */
const ROWS: [number, number, number, number][] = [
${rows}
];

export const TAPE: TapeEvent[] = ROWS.map((r) => ({
  t: r[0],
  px: (r[3] & 4) === 4 ? null : r[1],
  py: (r[3] & 8) === 8 ? null : r[2],
  down: (r[3] & 1) === 1,
  space: (r[3] & 2) === 2,
}));

export const BASELINE = {
  recorded: true,
  zero: { score: ${zero.score}, hash: 0x${hex(zero.hash)}, frames: ${zero.frames}, died: ${zero.died} },
  max: { score: ${max.score}, hash: 0x${hex(max.hash)}, frames: ${max.frames}, died: ${max.died} },
};
`;
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

let failures = 0;

function report(pass: boolean, key: string, label: string, msg: string, warnOnly = false) {
  const tag = pass ? "[PASS]" : warnOnly ? "[WARN]" : "[FAIL]";
  if (!pass && !warnOnly) failures++;
  console.log(`${tag} ${key} ${label} ${msg}`);
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
  console.log(`\n=== ${a.key} (${rules.name}) - maxScore ${rules.maxScore}, floor ${rules.floorMs / 1000}s ===`);
  if (!m.BASELINE.recorded || m.TAPE.length === 0) {
    report(false, a.key, "(a)", `tape not recorded yet - run: npx tsx scripts/s5-harness.ts --record ${a.key}`);
    return;
  }

  // (a) double replay, byte-identical, against the frozen baseline
  const z1 = replay(a, null, m.TAPE);
  const z2 = replay(a, null, m.TAPE);
  const x1 = replay(a, MAX_STATS, m.TAPE);
  const x2 = replay(a, MAX_STATS, m.TAPE);
  const zStable = sameRun(z1, z2);
  const xStable = sameRun(x1, x2);
  const zBase = sameRun(z1, m.BASELINE.zero);
  const xBase = sameRun(x1, m.BASELINE.max);
  report(
    zStable && xStable && zBase && xBase,
    a.key,
    "(a)",
    `double replay byte-identical vs baseline: zero score ${z1.score} hash ${hex(z1.hash)} ${z1.frames}f` +
      `${zStable ? " x2" : " UNSTABLE"}${zBase ? "" : ` != baseline ${m.BASELINE.zero.score}/${hex(m.BASELINE.zero.hash)}`}; ` +
      `max score ${x1.score} hash ${hex(x1.hash)}${xStable ? " x2" : " UNSTABLE"}${xBase ? "" : " != baseline"}`,
  );

  // (b) stats move outcomes on the same tape
  const moved = z1.score !== x1.score || z1.frames !== x1.frames || z1.died !== x1.died;
  report(
    moved,
    a.key,
    "(b)",
    `stats move outcomes: zero {score ${z1.score}, ${z1.secs.toFixed(1)}s, ${z1.died ? "died" : "survived"}} vs ` +
      `max {score ${x1.score}, ${x1.secs.toFixed(1)}s, ${x1.died ? "died" : "survived"}}`,
  );

  // (c) live max-stat oracle stays under the ceiling and the registry clamp
  const oracle = botRun(a, MAX_STATS);
  const ceil = a.ceiling();
  const underMax = oracle.score <= rules.maxScore;
  const underCeil = oracle.score <= ceil.total;
  report(
    underMax && underCeil,
    a.key,
    "(c)",
    `max-stat oracle ${oracle.score} <= ceiling ${ceil.total} and <= maxScore ${rules.maxScore} ` +
      `(margin ${rules.maxScore - oracle.score}; ${oracle.secs.toFixed(1)}s, ${oracle.detail})`,
  );

  // (d) AFK probe: an empty tape must not be bankable.
  //
  // This used to assert "ends before floorMs" alone. Since 2026-08-03 the score
  // route also lets a SHORT run bank when it scored like a win (fastWinFrac),
  // so the probe checks the rule that actually ships: an idle run is safe only
  // if it dies before the floor AND could not clear the fast-win bar. Testing
  // the old half would pass while the real gate leaked.
  const afk = replay(a, null, []);
  const ended = afk.frames < FRAME_CAP;
  const fastWinBar = Math.round(rules.maxScore * ((rules as { fastWinFrac?: number }).fastWinFrac ?? 0));
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

  // (e) registry maxScore = ceiling + documented ~10% margin
  const lo = ceil.total;
  const hi = Math.round(ceil.total * 1.12);
  const inBand = rules.maxScore > lo && rules.maxScore <= hi;
  report(
    inBand,
    a.key,
    "(e)",
    `registry maxScore ${rules.maxScore} within (ceiling ${ceil.total}, +12% ${hi}] - ${ceil.source}`,
  );
}

function recordGame(a: AnyAdapter): void {
  console.log(`\n=== recording ${a.key} baseline tape (seed "${a.tape.TAPE_SEED}") ===`);
  const rec = recordTape(a, null); // the canonical stock-tank recording
  const zero = replay(a, null, rec.events);
  if (!sameRun(zero, rec.result)) {
    report(false, a.key, "(record)", `downsampled replay diverged from the live recording (record ${rec.result.score}/${hex(rec.result.hash)} vs replay ${zero.score}/${hex(zero.hash)})`);
    return;
  }
  const max = replay(a, MAX_STATS, rec.events);
  const file = emitTapeFile(a, rec.events, zero, max);
  const target = path.join(ROOT, a.tapeRelPath);
  fs.writeFileSync(target, file, "utf8");
  // hot-swap a copy so verify in this same process sees the fresh tape (the
  // imported module namespace itself is frozen under ESM)
  a.tape = { ...a.tape, TAPE: rec.events, BASELINE: { recorded: true, zero, max } };
  console.log(
    `[OK]  ${a.key} tape: ${rec.events.length} events over ${zero.frames} frames (~${zero.secs.toFixed(1)}s); ` +
      `zero ${zero.score} (${zero.detail}); max ${max.score} (${max.detail})`,
  );
  console.log(`[OK]  wrote ${a.tapeRelPath}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, "src", "app", "s5", "games"))) {
  console.error("Run from the web3guides repo root (src/app/s5/games not found under cwd).");
  process.exit(2);
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
process.exit(failures === 0 ? 0 : 1);
