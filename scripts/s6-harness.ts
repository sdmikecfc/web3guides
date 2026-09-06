/**
 * S6 HEADLESS GAME HARNESS - the standing determinism / ceiling / pacing proof
 * for every Season 6 sim. The S5 harness (scripts/s5-harness.ts) carried
 * verbatim: same five checks, same tape contract, same hash; only the wired
 * slate differs. A game only enters the merge gate when somebody deliberately
 * wires it into ADAPTERS below.
 *
 * Run from the web3guides repo root:
 *
 *   npx tsx scripts/s6-harness.ts                    verify every wired game
 *   npx tsx scripts/s6-harness.ts blackout           verify one game
 *   npx tsx scripts/s6-harness.ts --record blackout  (re)record the baseline
 *
 * CHECKS PER GAME (the per-game merge gate, ADR-0120 semantics):
 *  (a) DOUBLE REPLAY, BYTE-IDENTICAL vs the frozen baseline in tape.ts
 *  (b) STATS MOVE OUTCOMES on the same tape (zero vs max build)
 *  (c) MAX-STAT ORACLE FITS THE RATE ENVELOPE (perSec x simSecs + burst)
 *      and the far-off sanity clamp - scores never cap, validity does
 *  (d) PACING / AFK PROBE: an empty tape must die before floorMs AND under
 *      fastWinScore, so an idle run can never bank
 *  (e) REGISTRY mirrors the sim's rate() and maxScore >= 5x the oracle
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { GAME_RULES } from "../src/lib/s6/games";
import * as ij from "../src/app/s6/games/ironjaw/sim";
import * as ijTape from "../src/app/s6/games/ironjaw/tape";
import { validateLadders as validateIronjawLadders } from "../src/app/s6/games/ironjaw/ladders";
import * as st from "../src/app/s6/games/strain/sim";
import * as stTape from "../src/app/s6/games/strain/tape";
import { validateSets as validateStrainSets } from "../src/app/s6/games/strain/chambers";
import * as sc from "../src/app/s6/games/stopclock/sim";
import * as scTape from "../src/app/s6/games/stopclock/tape";
import { validateSets as validateStopclockSets } from "../src/app/s6/games/stopclock/rooms";
import * as rt from "../src/app/s6/games/riot/sim";
import * as rtTape from "../src/app/s6/games/riot/tape";
import { validateLevels as validateRiotLevels } from "../src/app/s6/games/riot/levels";
// The full S6 slate (Mike's anchors, mockups approved 2026-08-12).

// ---------------------------------------------------------------------------
// shared shapes (verbatim from scripts/s5-harness.ts)
// ---------------------------------------------------------------------------

interface InputFrame {
  px: number | null;
  py: number | null;
  down: boolean;
  space: boolean;
}

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
  /** The ADR-0120 validity envelope, mirrored from the sim's rate(). */
  rate: () => { perSec: number; burst: number; source: string };
  /** SIM seconds elapsed in a finished run (wall != sim where time scales). */
  simSecs: (s: S) => number;
  bot: () => (s: S, frame: number) => InputFrame;
  tape: TapeModule;
  tapeRelPath: string;
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
    simSecs: a.simSecs(s),
    detail: a.detail(s),
  };
}

function botRun(a: AnyAdapter, stats: Stats | null): RunResult {
  const m = a.tape;
  const s = a.create(m.TAPE_W, m.TAPE_H, m.TAPE_SEED, stats);
  const bot = a.bot();
  let f = 0;
  for (; f < FRAME_CAP; f++) {
    if (a.done(s)) break;
    // S6_TRACE=1 prints a state line every 5s of wall time (both run paths);
    // the standing debugging rule: measure, do not guess
    if (process.env.S6_TRACE && f % 300 === 0) console.log(`[trace ${a.key} f${f}] ${a.detail(s)}`);
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
    simSecs: a.simSecs(s),
    detail: a.detail(s),
  };
}

function recordTape(a: AnyAdapter, stats: Stats | null): { events: TapeEvent[]; result: RunResult } {
  const m = a.tape;
  const s = a.create(m.TAPE_W, m.TAPE_H, m.TAPE_SEED, stats);
  const bot = a.bot();
  const events: TapeEvent[] = [];
  let cur: InputFrame = NEUTRAL;
  let f = 0;
  for (; f < FRAME_CAP; f++) {
    if (a.done(s)) break;
    if (process.env.S6_TRACE && f % 300 === 0) console.log(`[trace ${a.key} f${f}] ${a.detail(s)}`);
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
      simSecs: a.simSecs(s),
      detail: a.detail(s),
    },
  };
}

// ---------------------------------------------------------------------------
// IRON JAW oracle bot
// ---------------------------------------------------------------------------

/**
 * Plays the fight the way the design intends. REWRITTEN 2026-08-14 for the
 * five-style opponent: the old oracle read only `tellSide`, so against the
 * new machine it bit every feint, tried to dodge chains it had no cooldown
 * for, and mashed the center at a machine that had stepped out of reach - it
 * died in 8.5s scoring 15. The four rules it now plays by, one per thing the
 * sim gained:
 *
 *   FEINTS ARE IGNORED. A feint never lands, so answering one only spends the
 *   dodge cooldown the real strike behind it needs. That is the whole point
 *   of the style and the oracle must not fall for it.
 *   GUARD IS THE SECOND ANSWER. When the dodge is still cooling and the
 *   incoming strike does NOT pierce (jab / combo link), hold the low strip:
 *   a block still staggers the machine, on a shorter window. Hooks and
 *   uppercuts pierce, so when those arrive on a cooling dodge the oracle
 *   eats them - that is the fight closing in, and it is what ends the run.
 *   CHAINS: only the LAST link opens a real window, so the oracle banks its
 *   cooldown by BLOCKING the opening links and spends the dodge on the
 *   closer, which is the link that pays the full vulnerability.
 *   THE OPENING IS THE ONLY GATE (2026-08-15): the reach test came out of the
 *   sim, so an earned stagger is punished from wherever the floor left it.
 *
 * IT DODGES BOTH WAYS (2026-08-15). It used to press LEFT for every "any"
 * strike, so the recorded baseline was 115 left rows against 10 right and the
 * right half of the game was never exercised by the gate at all - a bot that
 * only presses one side cannot prove a fight is not a one-side fight. On an
 * "any" strike it now ALTERNATES, deterministically off its own counter; a
 * hook still gets the side the hook demands.
 *
 * Deterministic: reads sim state only. Zones per the sim: L 60, C 180, R 300
 * at y 240; the guard strip is any press below y 400 (the bot holds 180/440).
 */
function ironjawBot(): (s: ij.IronjawState, frame: number) => InputFrame {
  /** frames the haymaker press is held: the release must bank >= HEAVY_CHARGE_F */
  const HEAVY_HOLD = ij.HEAVY_CHARGE_F + 2;
  const JAB_CD = 8;
  let down = false;
  let mode: "" | "guard" | "jab" | "heavy" = "";
  let heldF = 0;
  let jabCd = 0;
  /** which way the next free dodge goes: flipped on every "any" dodge */
  let anySide: "L" | "R" = "L";
  const out = (px: number, py: number, d: boolean): InputFrame => {
    down = d;
    return { px, py, down: d, space: false };
  };
  const idle = (): InputFrame => {
    mode = "";
    heldF = 0;
    return out(180, 240, false);
  };
  return (s) => {
    if (jabCd > 0) jabCd--;
    if (s.phase !== "bout") return idle();

    // ── finish an in-flight gesture (both verbs fire on the RELEASE edge) ──
    if (mode === "heavy") {
      heldF += 1;
      if (heldF >= HEAVY_HOLD) return idle(); // the release fires the haymaker
      return out(180, 240, true);
    }
    if (mode === "jab") {
      jabCd = JAB_CD;
      return idle(); // the release fires the jab
    }

    // ── the incoming strike ────────────────────────────────────────────────
    const P = s.phaseF; // frames until the wind-up resolves
    const live = s.oppPhase === "tell" && s.tellStyle !== "" && s.tellStyle !== "feint";
    if (live) {
      // an active dodge already covers this one (it outlasts the wind-up and
      // is on the side a hook demands): nothing to spend
      const covered = s.dodgeF > P && (s.tellSide === "any" || s.dodgeSide === s.tellSide);
      // the cooldown frees with at least one frame to press on
      const dodgeFeasible = s.dodgeCd < P;
      // ONLY THE CLOSING LINK IS WORTH THE COOLDOWN: an opening link opens
      // nothing, so it gets the shell and the dodge stays banked for the
      // closer. A piercing strike always wants the feet, chain or not.
      const lastLink = s.comboLeft <= 1;
      if (!covered && (lastLink || s.tellPierce) && dodgeFeasible) {
        // press as EARLY as the i-frame window still covers the resolve, so
        // the cooldown starts (and therefore ends) as early as possible
        if (s.dodgeCd === 0 && P <= s.dodgeWinF - 2) {
          if (down) return idle(); // a dodge needs a fresh press edge
          // a hook dictates the side; anything else alternates, so the tape
          // exercises both halves of the screen instead of one
          let side: "L" | "R";
          if (s.tellSide === "L" || s.tellSide === "R") {
            side = s.tellSide;
          } else {
            side = anySide;
            anySide = anySide === "L" ? "R" : "L";
          }
          return out(side === "R" ? 300 : 60, 240, true);
        }
        return idle(); // wait for the window / the cooldown, hands free
      }
      if (!covered && !s.tellPierce) {
        // THE SHELL. Hold it through the resolve; a hook or an uppercut would
        // go straight through it, which is why those never reach here.
        if (down && mode !== "guard") return idle(); // re-press into the strip
        mode = "guard";
        return out(180, 440, true);
      }
      if (!covered) return idle(); // pierces + no dodge left: this one lands
    }

    // ── spend the opening ──────────────────────────────────────────────────
    // ONLY when it is open: a swing at a machine that is not open costs a
    // stamina pip, finds air, and makes it sidestep.
    if (s.oppPhase === "vuln") {
      if (down) return idle(); // every punch needs its own press edge
      // the haymaker only starts if the whole hold fits inside the window
      if (s.phaseF >= HEAVY_HOLD + 4 && s.stamina >= 2) {
        mode = "heavy";
        heldF = 0;
        return out(180, 240, true);
      }
      if (s.stamina >= 1 && jabCd === 0) {
        mode = "jab";
        return out(180, 240, true);
      }
    }
    return idle();
  };
}

// ---------------------------------------------------------------------------
// STRAIN oracle bot
// ---------------------------------------------------------------------------

/**
 * Plays the growth loop the way the design intends: work the room, corrupt
 * what it can reach, and when the room is spent and the tier clears the lock,
 * park on the door and channel.
 *
 * THE 2026-08-14 REBUILD GAVE THE ROOMS WALLS, which changed the oracle's
 * job (the sibling SUPERHOT bot learned the same lesson two recordings in):
 * every walk is ROUTED around the blocking slab's near end, because a
 * straight-line walk into a corridor wall stands still forever, and every
 * escape candidate is rejected if it lands inside a wall.
 *
 * THE 2026-08-15 REBUILD MADE SIGHT A CONE, and an oracle that cannot see
 * cones cannot bound a stealth game - it would measure the envelope of a
 * player who walks down every sightline. So it plays quiet now:
 *   - it scores every candidate step by CONE EXPOSURE (the sim's own
 *     range -> angle -> raycast test, run against the point it is thinking of
 *     standing on), so it works corners and cover instead of open lanes;
 *   - when a detection meter is filling it BREAKS THE LINE rather than
 *     out-running a radius, and if no reachable point is any less exposed it
 *     uses the hide verb (space) and lets the meter drain at a third rate;
 *   - it prefers UNSEEN corrupts, which after the rebuild are legal at any
 *     tier, and that is both the correct play and the only way the new
 *     content is reachable at all;
 *   - AN UNAWARE WARDEN IS AN EXPLICIT TARGET. Gate (c) is worthless if the
 *     oracle never touches the warden (the pre-rebuild oracle ate zero in
 *     302 seconds), so "eat a warden" is now a measured outcome, not a hope.
 * THE 2026-08-15 ROUND-5 MANDATE (aware = uneatable at any tier) re-tuned it:
 * clocked machines are simply not valid targets any more (they become valid
 * again when their meter decays - that IS the loud fallback now), the
 * line-break threshold moved with the alarm (3s -> 1.8s, so break at 0.85),
 * and a lunge is only excused from the line-break when the target's own
 * meter is safely under awareS, because a target that crosses awareS
 * mid-lunge is uneatable on arrival.
 * THE 2026-08-16 ROUND-6 REBUILD gave the sim five new rules and the oracle
 * had to learn all five, because a bot that cannot play the new game cannot
 * bound it. What changed here:
 *   THE LATCH IS THE FIRST QUESTION. Feeding anchors the blob for the whole
 *   channel, so while latched the only decisions are HOLD and LET GO (space).
 *   It lets go when something that can hurt it would arrive before the meal
 *   lands, and when the detection meter would trip the floor mid-channel -
 *   the blob cannot break a line of sight while it is anchored.
 *   QUIET_GAP IS A TARGET FILTER. Anything more than two tiers up is not a
 *   meal, it is a bounce that wakes it, so the oracle grows into big prey.
 *   THE PURGE OUTRANKS EVERY PLAN. Past half purge, leaving beats farming.
 *   A LOCKDOWN IS SURVIVED, NOT CHANNELLED THROUGH: the hatch costs x3 and
 *   the floor is ARMED, so it breaks away, waits the lockdown out, and leaves
 *   when the room is clear around it.
 *   DANGER IS NOT A TIER TEST ANY MORE. On an armed floor every machine bites
 *   whatever its size, so "can this hurt me" asks the sim (floorArmed) and the
 *   nearest one that can is what the flee runs from.
 * THE 2026-08-17 ROUND-7 PASS taught it two authored entity classes and one
 * split rule, because a bot that cannot play the new game cannot bound it:
 *   THE WEDGE PREEMPTS EVERYTHING. A turret cannot be eaten, outgrown,
 *   outrun or waited out, and once it has acquired you it takes a plate every
 *   1.4s. So "am I in a cone that is filling" is asked above the purge door
 *   and above every retreat, and the answer is the same scored retreat the
 *   rest of the bot uses - which now finds crate shadows for free, because
 *   losClear() marches low cover exactly like the sim does.
 *   CRATES ARE ROUTES, NOT WALLS. The corner graph gained crate centres and
 *   flanks as waypoints while the movement tests stayed walls-only, so the bot
 *   can plan "stand behind that box" as a destination. Mixing the two up in
 *   either direction is the bug this split exists to prevent.
 *   THE LATCH IS A SMALL PART OF THE GAME AGAIN. Only OVER-tier meals anchor
 *   now, so the feed-bail logic fires on the meals where it always mattered,
 *   plus one new trigger: never finish a channel under a gun.
 * ONE FLEE STATE, ONE DESTINATION. Every fix above was found by measurement,
 * and every one of them was the same bug: two rules re-planning from their own
 * source every frame and cancelling each other out (pursue vs retreat at 14.4s,
 * hunter-flee vs biter-flee at 14.6s, both inside a 40px pocket while a hunter
 * walked up). A flee is a committed destination now.
 * The corner-graph router, the target lock and the give-up counters all stay:
 * they solve measured pathologies (700-second oscillation stalls) and denser
 * floors need them more, not less. Deterministic: reads sim state only.
 * S6_STRAIN_DBG=1 prints the decision branch every time it changes - the
 * standing rule is measure, do not guess, and every tuning round on this game
 * has needed exactly that trace.
 */
function strainBot(): (s: st.StrainState, frame: number) => InputFrame {
  const DBG = !!process.env.S6_STRAIN_DBG;
  let dbgLast = "";
  const dbg = (tag: string, f: InputFrame, s: st.StrainState): InputFrame => {
    if (DBG && tag !== dbgLast) {
      dbgLast = tag;
      console.log(`   [branch ${tag}] t=${s.t.toFixed(1)} hp=${s.hp} T${s.tier} @(${Math.round(s.px)},${Math.round(s.py)}) purge=${s.purge.toFixed(2)} alarm=${s.alarm}`);
    }
    return f;
  };
  let lastX = -1;
  let lastY = -1;
  let stuck = 0;
  let flip = false;
  // TARGET LOCK. Measured on the first recording of the walled build: the
  // bot sat at (235,289) under chamber 2's island for 700 seconds because
  // the NEAREST prey alternated between one on the left and one on the
  // right, and the router therefore alternated between the island's left
  // and right end. It oscillated over 8 px forever. A human picks a side
  // and commits, so the bot commits too: one target until it is eaten, the
  // chamber changes, or the chase visibly is not working.
  let lockIdx = -1;
  let lockF = 0;
  /** FLEE COMMITMENT (round 6). Measured on the third round-6 recording: the
   * snatch rule and the threat retreat swapped every few frames in chamber
   * one's top corner (pursue at 14.4s, retreat at 14.6, pursue at 14.7...),
   * so the blob jittered on the spot while a hunter it outruns 1.5:1 walked
   * up and killed it 18 seconds into the run. A human who decides to run,
   * runs; the bot commits for two thirds of a second at a time. */
  let fleeF = 0;
  let fleeX = 0;
  let fleeY = 0;
  /** ROUND 7: the turret break owns its own commitment counter, because it
   * preempts the ordinary flee and must not be cancelled by it. */
  let gunF = 0;
  let lockChamber = -1;
  let giveUps = 0;
  let lastEaten = -1;
  let corners: { x: number; y: number }[] = [];
  let adj: number[][] = [];
  let path: { x: number; y: number }[] = [];
  let pathT: { x: number; y: number } | null = null;
  let planAge = 0;
  let cornerChamber = -1;
  let cornerTier = -1;
  return (s) => {
    if (s.phase !== "chamber") return NEUTRAL;
    if (s.chamber !== lockChamber) {
      lockChamber = s.chamber;
      lockIdx = -1;
      lockF = 0;
      giveUps = 0;
    }
    const k = s.k;
    const W = s.W;
    const H = s.H;
    // THE PLANNER MUST KNOW HOW FAT IT IS. Measured on the second walled
    // recording: the bot planned a line past chamber 2's low slab that
    // cleared the wall RECTANGLE by half a pixel, walked into it, and its
    // 16 px body sat on that corner for 660 seconds. Every visibility test
    // below therefore inflates the walls by the blob's own radius, exactly
    // like the sim's own collision does.
    const R = st.BLOB_R_BY_TIER[Math.min(st.MAX_TIER, s.tier)] * k;
    const PAD = R * 0.95;

    const inWall = (x: number, y: number, pad: number): boolean => {
      for (const w of s.walls) {
        if (x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad) return true;
      }
      return false;
    };
    const segBlocked = (x1: number, y1: number, x2: number, y2: number): boolean => {
      // ENDPOINTS ARE EXCLUDED on purpose: the blob itself can legally hug a
      // slab (and a small meal can sit inside the blob's own inflated pad),
      // and a test that failed on its own feet would route forever.
      const steps = Math.max(10, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (7 * k)));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (inWall(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, PAD)) return true;
      }
      return false;
    };
    /** ROUND 7: SIGHT AND MOVEMENT ARE DIFFERENT QUESTIONS NOW. Crates block
     * the first and not the second, so the bot needs both tests and must never
     * mix them up - a router that thought crates were walls would refuse the
     * exact routes they exist to open, and a sight test that ignored them
     * would never find cover. */
    const sightSolid = (x: number, y: number): boolean => {
      if (inWall(x, y, 0)) return true;
      for (const w of s.lows) {
        if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
      }
      return false;
    };
    /** the sim's own sight test, at pad 0: sight is thin where a body is fat */
    const losClear = (x1: number, y1: number, x2: number, y2: number): boolean => {
      const steps = Math.max(6, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (5 * k)));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (sightSolid(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
      }
      return true;
    };
    /** would THIS eye see a blob standing at (tx,ty)? range -> angle -> cast,
     * the same order and the same numbers the sim uses. */
    const eyeOn = (
      ex: number,
      ey: number,
      efx: number,
      efy: number,
      er: number,
      ecos: number,
      tx: number,
      ty: number,
    ): boolean => {
      const dx = tx - ex;
      const dy = ty - ey;
      const d2 = dx * dx + dy * dy;
      if (d2 > er * er) return false;
      const d = Math.sqrt(d2);
      if (d < 1) return true;
      if ((dx / d) * efx + (dy / d) * efy < ecos) return false;
      return losClear(ex, ey, tx, ty);
    };
    /** how loud is it to stand at (x,y): live cones that reach it, weighted by
     * what the owner would do about it. Cameras count double (they only ever
     * cost you the alarm), a hunter's cone counts triple. */
    const exposure = (x: number, y: number): number => {
      let e = 0;
      for (const b of s.bots) {
        if (b.eaten) continue;
        if (eyeOn(b.x, b.y, b.fx, b.fy, b.visionR, b.visionCos, x, y)) e += b.hunter ? 3 : 1;
      }
      for (const c of s.cams) {
        if (eyeOn(c.x, c.y, c.fx, c.fy, c.r, c.visionCos, x, y)) e += 2;
      }
      // ROUND 7: A TURRET CONE IS THE MOST EXPENSIVE FLOOR IN THE GAME. Every
      // other eye costs you an alarm meter; this one costs a plate on a 1.4s
      // cadence and cannot be eaten, outgrown or waited out. Weighted 6 so the
      // Dijkstra toll below routes AROUND wedges by default and only crosses
      // one when the crate shadow makes the crossing cheap.
      for (const t of s.turrets) {
        if (eyeOn(t.x, t.y, t.fx, t.fy, t.r, t.visionCos, x, y)) e += 6;
      }
      return e;
    };

    if (Math.abs(s.px - lastX) < 0.4 && Math.abs(s.py - lastY) < 0.4) stuck++;
    else stuck = 0;
    lastX = s.px;
    lastY = s.py;
    if (stuck > 0 && stuck % 40 === 0) flip = !flip;

    // THE CORNER GRAPH. The sibling SUPERHOT bot walks to a blocking slab's
    // near END, which is enough for its five free-standing barriers but not
    // for these corridor mazes: measured, the near-end rule walked the blob
    // AWAY from the corridor it needed and it farmed one room until the
    // frame cap. Every wall's four padded corners are the waypoints a human
    // actually uses, so the bot uses them too.
    if (cornerChamber !== s.chamber || cornerTier !== s.tier) {
      cornerChamber = s.chamber;
      cornerTier = s.tier; // the blob got fatter: its corners moved out
      corners = [];
      // ROUND 7 PUT THE CRATES ON THE GRAPH TOO, and their CENTRES, not just
      // their corners: a crate's shadow is the destination now, and a bot that
      // only knew wall corners could never plan a route whose whole purpose is
      // to stand behind a box. Crate nodes are legal walking points (crates do
      // not collide) so they cost the router nothing but options.
      const nodes: { x: number; y: number }[] = [];
      for (const w of s.walls) {
        const xs = [w.x - R - 4 * k, w.x + w.w + R + 4 * k];
        const ys = [w.y - R - 4 * k, w.y + w.h + R + 4 * k];
        for (const cx of xs) for (const cy of ys) nodes.push({ x: cx, y: cy });
      }
      for (const w of s.lows) {
        nodes.push({ x: w.x + w.w / 2, y: w.y + w.h / 2 });
        nodes.push({ x: w.x - R * 0.5, y: w.y + w.h / 2 });
        nodes.push({ x: w.x + w.w + R * 0.5, y: w.y + w.h / 2 });
        nodes.push({ x: w.x + w.w / 2, y: w.y - R * 0.5 });
        nodes.push({ x: w.x + w.w / 2, y: w.y + w.h + R * 0.5 });
      }
      for (const n of nodes) {
        const x = Math.max(R, Math.min(W - R, n.x));
        const y = Math.max(R, Math.min(H - R, n.y));
        if (inWall(x, y, PAD)) continue;
        if (corners.some((c) => Math.hypot(c.x - x, c.y - y) < 11 * k)) continue; // dedupe touching slabs
        corners.push({ x, y });
      }
      // THE EDGES, ONCE PER CHAMBER. A one-hop corner picker was enough for
      // the old three-slab rooms and is a TRAP on these: measured on the first
      // dense recording, the blob cleared chamber 1 in 32 seconds and then
      // stood at (339,121) for 688 more, because corner A looked best from B
      // and B looked best from A. Precomputing the visibility graph turns the
      // walk into a real shortest path, so the route commits.
      adj = corners.map(() => new Array<number>(corners.length).fill(Infinity));
      for (let i = 0; i < corners.length; i++) {
        for (let j = i + 1; j < corners.length; j++) {
          if (segBlocked(corners[i].x, corners[i].y, corners[j].x, corners[j].y)) continue;
          const d = Math.hypot(corners[i].x - corners[j].x, corners[i].y - corners[j].y);
          adj[i][j] = d;
          adj[j][i] = d;
        }
      }
      path = [];
      pathT = null;
    }

    /** Dijkstra over the cached corner graph, with a LOUDNESS TOLL on every
     * node: the cheapest walk is the one that stays out of the cones. */
    const plan = (tx: number, ty: number): { x: number; y: number }[] => {
      const n = corners.length;
      const dist = new Array<number>(n).fill(Infinity);
      const prev = new Array<number>(n).fill(-1);
      const done = new Array<boolean>(n).fill(false);
      const toll = corners.map((c) => exposure(c.x, c.y) * 45 * k);
      for (let i = 0; i < n; i++) {
        if (segBlocked(s.px, s.py, corners[i].x, corners[i].y)) continue;
        dist[i] = Math.hypot(corners[i].x - s.px, corners[i].y - s.py) + toll[i];
      }
      for (;;) {
        let u = -1;
        let bd = Infinity;
        for (let i = 0; i < n; i++) {
          if (!done[i] && dist[i] < bd) {
            bd = dist[i];
            u = i;
          }
        }
        if (u < 0) break;
        done[u] = true;
        for (let v = 0; v < n; v++) {
          if (done[v] || adj[u][v] === Infinity) continue;
          const nd = dist[u] + adj[u][v] + toll[v];
          if (nd < dist[v]) {
            dist[v] = nd;
            prev[v] = u;
          }
        }
      }
      let best = -1;
      let bestCost = Infinity;
      for (let i = 0; i < n; i++) {
        if (dist[i] === Infinity) continue;
        if (segBlocked(corners[i].x, corners[i].y, tx, ty)) continue;
        const c = dist[i] + Math.hypot(corners[i].x - tx, corners[i].y - ty);
        if (c < bestCost) {
          bestCost = c;
          best = i;
        }
      }
      if (best < 0) {
        // nothing on the graph sees the target (it is tucked behind a slab):
        // walk to whatever gets us closest and re-plan from there
        for (let i = 0; i < n; i++) {
          if (dist[i] === Infinity) continue;
          const c = dist[i] + Math.hypot(corners[i].x - tx, corners[i].y - ty) * 2;
          if (c < bestCost) {
            bestCost = c;
            best = i;
          }
        }
      }
      if (best < 0) return [];
      const out: { x: number; y: number }[] = [];
      for (let cur = best; cur >= 0; cur = prev[cur]) out.push(corners[cur]);
      out.reverse();
      out.push({ x: tx, y: ty });
      return out;
    };

    /** ROUND 7: DOES THIS STRAIGHT LINE WALK THROUGH A GUN? Measured on the
     * first round-7 recording: the bot pursued a T4 at (298,111) in chamber 2,
     * clipped the turret wedge at (272,172) on the way, fled, and then walked
     * the identical straight line back in - fifteen seconds of ping-pong at
     * 60Hz while the purge climbed, which is the exact "two rules re-planning
     * from their own source" pathology this file has hit three times before.
     * The root cause was that goTo only ever asked about WALLS: a wedge is
     * invisible to a segment test, so the cheapest route was always through
     * it. Cones are a routing input now, and because eyeOn marches low cover,
     * a line that passes UNDER a crate reads as clear - which is precisely the
     * play the crates exist for. */
    const wedgeCrossed = (x1: number, y1: number, x2: number, y2: number): boolean => {
      if (s.turrets.length === 0) return false;
      const steps = Math.max(6, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (9 * k)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        for (const tu of s.turrets) {
          if (eyeOn(tu.x, tu.y, tu.fx, tu.fy, tu.r, tu.visionCos, x, y)) return true;
        }
      }
      return false;
    };

    /** Routed movement: straight when clear, else follow the planned path and
     * COMMIT to it (re-planning every frame is what oscillates). EVERY walk
     * goes through here. */
    const goTo = (tx: number, ty: number): InputFrame => {
      if (!segBlocked(s.px, s.py, tx, ty) && !wedgeCrossed(s.px, s.py, tx, ty)) {
        path = [];
        pathT = null;
        return { px: tx, py: ty, down: true, space: false };
      }
      planAge++;
      const drifted = !pathT || Math.hypot(pathT.x - tx, pathT.y - ty) > 26 * k;
      if (drifted || path.length === 0 || planAge > 45 || stuck > 50) {
        path = plan(tx, ty);
        pathT = { x: tx, y: ty };
        planAge = 0;
      }
      // STRING-PULL, NOT PROXIMITY. Measured on the first dense recording:
      // dropping a hop because we were within 13 px of it aimed the blob at
      // the hop AFTER it, straight through the baffle the hop existed to get
      // around, and it ground against chamber 4's stub at (260,256) for 600
      // seconds. A hop is only rounded when the next one is actually visible.
      // ...and the string-pull has to respect wedges too, or it would undo the
      // routing above by re-straightening the very hop that avoided the gun.
      const hopFree = (p: { x: number; y: number }) => !segBlocked(s.px, s.py, p.x, p.y) && !wedgeCrossed(s.px, s.py, p.x, p.y);
      while (path.length > 1 && hopFree(path[1])) path.shift();
      if (path.length > 0 && segBlocked(s.px, s.py, path[0].x, path[0].y)) {
        // a slide put a slab between us and our own next hop: re-plan now
        path = plan(tx, ty);
        planAge = 0;
        while (path.length > 1 && hopFree(path[1])) path.shift();
      }
      if (path.length > 0) {
        let w = path[0];
        const dxw = w.x - s.px;
        const dyw = w.y - s.py;
        if (Math.hypot(dxw, dyw) < 10 * k) {
          // WE ARE STANDING ON THE HOP. The sim ignores a pointer inside a
          // 3 px deadzone, so a hop we are already on is a hop we never leave:
          // measured, the blob held (78,234) aiming at (76,234) for 600
          // seconds. Push the aim THROUGH the hop, toward the next one.
          const nx = path.length > 1 ? path[1].x - w.x : dxw;
          const ny = path.length > 1 ? path[1].y - w.y : dyw;
          const nl = Math.hypot(nx, ny) || 1;
          w = { x: w.x + (nx / nl) * 26 * k, y: w.y + (ny / nl) * 26 * k };
        }
        return { px: w.x, py: w.y, down: true, space: false };
      }
      // nothing visible (should not happen in an authored room): shove along
      // the blocking slab's near end, flipping ends while we stay pinned
      let blocker: { x: number; y: number; w: number; h: number } | null = null;
      outer: for (let i = 1; i < 14; i++) {
        const t = i / 14;
        const x = s.px + (tx - s.px) * t;
        const y = s.py + (ty - s.py) * t;
        for (const w of s.walls) {
          if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) {
            blocker = w;
            break outer;
          }
        }
      }
      if (!blocker) return { px: tx, py: ty, down: true, space: false };
      const leftEnd = blocker.x - R - 6 * k;
      const rightEnd = blocker.x + blocker.w + R + 6 * k;
      let gx = tx < blocker.x + blocker.w / 2 ? leftEnd : rightEnd;
      if (flip) gx = gx === leftEnd ? rightEnd : leftEnd;
      const gy = s.py < blocker.y ? blocker.y - R - 6 * k : blocker.y + blocker.h + R + 6 * k;
      return {
        px: Math.max(R, Math.min(W - R, gx)),
        py: Math.max(R, Math.min(H - R, gy)),
        down: true,
        space: false,
      };
    };

    /** A SCORED RETREAT: sixteen bearings at two ranges, pick the reachable
     * point that is least SEEN and furthest from whatever is looking. The
     * pre-rebuild version maximised distance alone, which on a coned floor
     * walks you out of one lane and into the next camera. */
    const retreat = (away: { x: number; y: number } | null): { x: number; y: number; exp: number } => {
      let bx = s.px;
      let by = s.py;
      let bexp = exposure(s.px, s.py);
      let bestScore = -Infinity;
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI * 2 * i) / 16;
        for (const rad of [76, 128]) {
          const cx = s.px + Math.cos(a) * rad * k;
          const cy = s.py + Math.sin(a) * rad * k;
          const ix = Math.max(28 * k, Math.min(332 * k, cx));
          const iy = Math.max(28 * k, Math.min(452 * k, cy));
          if (inWall(ix, iy, R)) continue;
          const clampPenalty = (Math.abs(cx - ix) + Math.abs(cy - iy)) * 1.5;
          const wallPenalty = segBlocked(s.px, s.py, ix, iy) ? 90 * k : 0;
          const exp = exposure(ix, iy);
          const far = away ? Math.hypot(ix - away.x, iy - away.y) : 0;
          // ROUND 6: LEAVING THE CONE IS NOT LEAVING. A machine that has us
          // keeps its meter topped up the moment it turns back, and its search
          // memory walks it to where we stood - so a spot with the LINE broken
          // is worth far more than a spot that is merely off the nose. Without
          // this the bot "hid" in the open with five machines watching it and
          // the room never forgot: measured, 25 dead seconds in chamber 1.
          const blind = away && !losClear(away.x, away.y, ix, iy) ? 260 * k : 0;
          const sc = far + blind - clampPenalty - wallPenalty - exp * 150 * k;
          if (sc > bestScore) {
            bestScore = sc;
            bx = ix;
            by = iy;
            bexp = exp;
          }
        }
      }
      // THE CORNERS ARE THE ESCAPE ROUTES. A 16-bearing local sampler cannot
      // see a doorway: measured, the zero-stat oracle was chased into chamber
      // one's top strip, every local candidate was still in that strip or
      // clamped against the frame, and a 45 px/s machine killed a blob that
      // moves at 83 px/s. The corner graph already knows where the gaps are,
      // so the retreat picks from it too and the router walks us through.
      for (const c of corners) {
        const exp = exposure(c.x, c.y);
        const far = away ? Math.hypot(c.x - away.x, c.y - away.y) : 0;
        const blind = away && !losClear(away.x, away.y, c.x, c.y) ? 260 * k : 0;
        // a long walk is a real cost while something is chasing us
        const trip = Math.hypot(c.x - s.px, c.y - s.py) * 0.55;
        const sc = far + blind - trip - exp * 150 * k;
        if (sc > bestScore) {
          bestScore = sc;
          bx = c.x;
          by = c.y;
          bexp = exp;
        }
      }
      return { x: bx, y: by, exp: bexp };
    };

    // ── ROUND 6: THE LATCH IS THE FIRST QUESTION EVERY FRAME ────────────────
    // Feeding anchors the blob for the whole channel, so the only decision
    // that exists while latched is HOLD or LET GO. It lets go when something
    // that can hurt it would arrive before the meal finishes - the round-6
    // failure mode is being caught mid-meal, and a competent player reads it
    // one beat early. NOTE the space discipline: space is the release, so a
    // latched bot must never send it for any other reason.
    if (s.feedIdx >= 0) {
      const meal = s.bots[s.feedIdx];
      const left = Math.max(0, s.feedNeed - s.feedT);
      let bail = false;
      for (const b of s.bots) {
        if (b.eaten || b === meal) continue;
        if (b.tier <= s.tier) continue; // it cannot take a plate off us
        const knows = b.seenS >= s.awareS || (b.hunter && (b.pinned || s.alarm)) || b.searchF > 0;
        if (!knows) continue;
        const d = Math.hypot(b.x - s.px, b.y - s.py) - st.botR(b.tier) * k - R;
        // generous closing speed: hunter chase, purged, one tier up
        const spd = (b.hunter ? 62 : 52) * (1 + 0.45 * Math.min(2, s.purge)) * k;
        if (d / spd < left + 0.4) bail = true;
      }
      // ...and it lets go rather than trip the floor. The blob cannot break a
      // line of sight while it is anchored, so a meter that will cross the
      // alarm before the meal lands is a meal you do not get to finish: the
      // whole floor goes loud and arms itself for one corrupt. Measured, this
      // was how the zero-stat oracle tripped its alarms - mid-channel, with
      // no legal move left.
      let hotS = 0;
      for (const b of s.bots) if (!b.eaten && b.seenS > hotS) hotS = b.seenS;
      for (const c of s.cams) if (c.seenS > hotS) hotS = c.seenS;
      for (const t of s.turrets) if (t.seenS > hotS) hotS = t.seenS;
      if (!s.alarm && hotS > 0.15 && hotS + left >= st.SEEN_ALARM_S - 0.35) bail = true;
      // ROUND 7: A GUN IS THE ONE THING YOU NEVER FINISH A MEAL UNDER. The
      // blob is anchored for the whole channel and a turret does not have to
      // walk anywhere, so any lock that will complete before the meal does is
      // a plate and a torn meal, guaranteed. Let go and step out of the wedge.
      if (st.turretThreat(s) > 0.25) bail = true;
      if (bail) return dbg("feed-bail", { px: null, py: null, down: false, space: true }, s);
      return dbg("feed-hold", NEUTRAL, s); // hold the grip and take the meal
    }

    // ── who has eyes on us, and how hot is the meter ────────────────────────
    let hotBot: (typeof s.bots)[number] | null = null;
    let hot = 0;
    for (const b of s.bots) {
      if (!b.eaten && b.seenS > hot) {
        hot = b.seenS;
        hotBot = b;
      }
    }
    let camHot = 0;
    let camSrc: { x: number; y: number } | null = null;
    for (const c of s.cams) {
      if (c.seenS > camHot) {
        camHot = c.seenS;
        camSrc = c;
      }
    }
    // ── ROUND 7: GET OUT OF THE WEDGE, BEFORE ANYTHING ELSE ─────────────────
    // A turret is the only threat on the floor that cannot be outgrown, eaten,
    // outrun or waited out, and its clock is short: acquisition, then a plate
    // every 1.4 seconds for as long as you stand there. So it preempts every
    // other plan including the purge door - three seconds of stubbornness
    // under a gun is the whole HP bar. The escape target comes from the same
    // scored retreat everything else uses, which already prefers points the
    // source cannot SEE, and crates are opaque now: it walks into the shadow.
    {
      let gun: { x: number; y: number } | null = null;
      let gunLock = 0;
      for (const t of s.turrets) {
        const f = st.turretLockFrac(s, t);
        if (f > gunLock) {
          gunLock = f;
          gun = t;
        }
      }
      // A COMMITTED BREAK, for the same reason every other flee in this bot is
      // committed: the lock meter drains the instant the line breaks, so a
      // gate that re-asked "am I still being acquired" every frame would drop
      // the escape one step out of the wedge and hand the next rule a straight
      // line back into it.
      // HALF A LOCK, not a hair of one. Measured on the second round-7
      // recording: breaking at 0.2 meant the bot could never DASH, so a target
      // on the far side of a gunned slot produced a twelve-second ping-pong
      // between the crate and the wedge while the purge climbed. A competent
      // player crosses a cone knowing the acquisition will not finish; the
      // bar is "this shot is actually going to land".
      if (gun && gunLock > 0.5 && gunF <= 0) {
        const spot = retreat(gun);
        fleeX = spot.x;
        fleeY = spot.y;
        gunF = 45;
      }
      if (gunF > 0) {
        gunF--;
        if (Math.hypot(fleeX - s.px, fleeY - s.py) < 14 * k) gunF = 0;
        else return dbg("turret-break", goTo(fleeX, fleeY), s);
      }
    }

    // the live hunter, if it still outclasses us (deep laps: always)
    let threat: (typeof s.bots)[number] | null = null;
    for (const b of s.bots) {
      if (!b.eaten && b.hunter && b.tier > s.tier) threat = b;
    }
    /** IT HAS CLOCKED US = UNEATABLE. IMPORTED, NOT REIMPLEMENTED (round 6):
     * the gate has to ask the shipped sim, or it just reproduces whatever the
     * bot's author assumed about search memory and pinning and passes. */
    const clocked = (b: (typeof s.bots)[number]): boolean => st.botAware(s, b);
    // the meal we are already committed to (see the target lock below)
    const locked = lockIdx >= 0 ? s.bots[lockIdx] : undefined;
    const lockedLive = !!locked && !locked.eaten && !clocked(locked);
    // ── ROUND 6: THE PURGE OUTRANKS EVERY OTHER PLAN ────────────────────────
    // Measured on the first round-6 recording: the line-break retreat below
    // preempted the door, so on a purged floor (every cone 1.85x, an eye on
    // us at all times) the bot retreated forever, the purge kept climbing and
    // it burned 700 seconds in one corner with the hatch open. Leaving IS the
    // answer to the purge, so the rule sits above the retreats - it only
    // yields to something that can hurt us inside one body length.
    const canLeave = s.doorBlown || s.tier >= s.doorTier;
    // ...but a LOCKDOWN outranks the purge: the channel is x3 and the floor is
    // ARMED, so parking on the hatch mid-alarm is how the first round-6
    // recording died at 54s. Wait the lockdown out (it hard-expires) unless
    // the purge has gone past the point where waiting is worse.
    if (s.purge > 0.5 && canLeave && (!s.alarm || s.purge > 1.3)) {
      const panic = threat && Math.hypot(threat.x - s.px, threat.y - s.py) < 64 * k;
      if (!panic) return dbg("purge-door", goTo(s.doorX, s.doorY), s);
    }

    // ONE FLEE STATE, ONE DESTINATION. Measured on the fifth round-6
    // recording: the hunter retreat and the biter retreat each re-planned
    // from their own source every frame, so the bot alternated between two
    // escape points at 60Hz and travelled nowhere while a lockdown built on
    // top of it (14.6s to 20.5s, all inside one 40px pocket). A flee is now a
    // committed destination, dropped when it is reached or when it expires.
    const startFlee = (src: { x: number; y: number } | null, frames: number): void => {
      const spot = retreat(src);
      fleeX = spot.x;
      fleeY = spot.y;
      fleeF = frames;
    };
    if (fleeF > 0) {
      fleeF--;
      if (Math.hypot(fleeX - s.px, fleeY - s.py) < 14 * k) fleeF = 0;
      else return dbg("flee", goTo(fleeX, fleeY), s);
    }
    if (threat && clocked(threat)) {
      const d = Math.hypot(threat.x - s.px, threat.y - s.py);
      // A HUMAN SNATCHES. Chamber 1's last meal often sits inside the
      // hunter's patrol lane, and a bot that flees the whole lane never eats
      // it (measured: 700 seconds of oscillating between two safe corners).
      // If the meal is clearly closer than the hunter, take it.
      const md = lockedLive ? Math.hypot(locked.x - s.px, locked.y - s.py) : Infinity;
      const snatch = md < d * 0.55;
      // a hunter that has clocked us is COMING, so the retreat starts at its
      // sight range rather than at some ring that no longer exists
      // COMMIT. The gate used to be distance-only, so one retreat step pushed
      // us out of range, the next frame pursued straight back in, and the pair
      // alternated on the spot at 60Hz while the hunter closed.
      if (!snatch && d < threat.visionR + 40 * k) {
        startFlee(threat, 55);
        return dbg("threat-retreat", goTo(fleeX, fleeY), s);
      }
    }

    // NOTHING LEGAL TO EAT ON THIS FLOOR? THEN LEAVE IT. This has to sit above
    // the line-break retreat: measured, a room where every machine had gone
    // aware kept the retreat firing forever, the retreat found nothing quieter
    // and pressed the hide verb, and the bot sat in the open for 25 seconds
    // while the purge climbed. An open hatch always beats a staring contest.
    let anyMeal = false;
    for (const b of s.bots) {
      if (b.eaten) continue;
      if (b.tier - s.tier > st.QUIET_GAP) continue;
      if (clocked(b)) continue;
      anyMeal = true;
      break;
    }
    if (!anyMeal && canLeave) return dbg("nomeal-door", goTo(s.doorX, s.doorY), s);

    // ── BREAK THE LINE BEFORE THE ALARM ─────────────────────────────────────
    // A tripped floor pins the hunter on us and costs us the warden, so the
    // meter gets broken well short of it - unless we are one step from
    // swallowing the thing that is looking AND its own meter is still safely
    // under awareS (a target that crosses awareS mid-lunge is uneatable on
    // arrival now).
    // ROUND 7 DERIVES THE TRIGGER FROM THE SIM instead of carrying a literal.
    // It was 0.85 against a 3s alarm; the alarm is 2s now, and a hard-coded
    // 0.85 would have quietly become "break at 43%" - the standing lesson that
    // a gate which re-states a rule instead of importing it drifts the moment
    // the rule moves. 30% of the way to a lockdown is the bar.
    const breakAt = st.SEEN_ALARM_S * 0.3;
    const closing =
      lockedLive &&
      (locked as { seenS: number }).seenS < s.awareS * 0.6 &&
      Math.hypot((locked as { x: number }).x - s.px, (locked as { y: number }).y - s.py) < 40 * k;
    if (!s.alarm && !closing && (hot > breakAt || camHot > breakAt)) {
      const src = hot >= camHot ? hotBot : camSrc;
      const spot = retreat(src);
      // NOTHING QUIETER WITHIN REACH: press flat instead. Holding still fills
      // every meter at a third rate, so the drain wins and the floor stays
      // quiet. This is the hide verb doing exactly what it shipped for.
      if (spot.exp > 0 && spot.exp >= exposure(s.px, s.py)) {
        return { px: null, py: null, down: false, space: true };
      }
      return goTo(spot.x, spot.y);
    }

    // ── ROUND 6: ANYTHING AWARE THAT CAN TAKE A PLATE ───────────────────────
    // The old danger rule watched HUNTERS and nothing else, which was fine
    // when only a hunter could realistically corner you. Measured on the
    // round-6 recording: the zero-stat oracle was killed at T1 by a plain T2
    // patrol machine that had clocked it - three hits, 17 seconds in, while
    // the bot was busy deciding which meal to walk at. And on an ARMED floor
    // every tier bites, so the tier test has to ask the sim, not assume.
    {
      let biter: (typeof s.bots)[number] | null = null;
      let bd = Infinity;
      const armed = st.floorArmed(s);
      for (const b of s.bots) {
        if (b.eaten || !clocked(b)) continue;
        if (b.tier <= s.tier && !armed) continue;
        const d = Math.hypot(b.x - s.px, b.y - s.py);
        if (d < bd) {
          bd = d;
          biter = b;
        }
      }
      if (biter && bd < 120 * k) {
        startFlee(biter, 45);
        return dbg("biter-break", goTo(fleeX, fleeY), s);
      }
    }

    // ── ROUND 6: A LOUD FLOOR IS A FLOOR YOU LEAVE ──────────────────────────
    // Under lockdown the hunter is pinned on us for good, every machine is
    // searching, and the hatch takes three times as long. Nothing on the floor
    // is worth farming, so the play is: break away from anything that can
    // actually hurt us, then park on the door and pay the long channel. Only
    // when the door is still tier-locked is going quiet the whole plan.
    if (s.alarm) {
      // AN ARMED FLOOR BITES AT EVERY TIER, so "can it hurt me" is no longer a
      // tier question - anything aware and close is a plate. Find the nearest
      // one and treat it as the thing to break away from.
      let near: (typeof s.bots)[number] | null = null;
      let nd = Infinity;
      for (const b of s.bots) {
        if (b.eaten || !clocked(b)) continue;
        const d = Math.hypot(b.x - s.px, b.y - s.py);
        if (d < nd) {
          nd = d;
          near = b;
        }
      }
      if (near && nd < 96 * k) {
        const spot = retreat(near);
        return dbg("alarm-break", goTo(spot.x, spot.y), s);
      }
      // THE HATCH COSTS 7.5 SECONDS UNDER LOCKDOWN. Only pay it with the room
      // clear around us; otherwise sit the storm out - it hard-expires, and
      // the channel is 2.5s again the moment it does.
      if (canLeave && nd > 150 * k) return dbg("alarm-door", goTo(s.doorX, s.doorY), s);
      const src = near ?? threat ?? hotBot ?? camSrc;
      const spot = retreat(src);
      if (spot.exp > 0 && spot.exp >= exposure(s.px, s.py)) {
        return dbg("line-hide", { px: null, py: null, down: false, space: true }, s);
      }
      return dbg("line-break", goTo(spot.x, spot.y), s);
    }

    // ── the target: QUIET CORRUPTS FIRST ────────────────────────────────────
    // After the rebuild an unaware machine dies whatever its tier, so the
    // target list is no longer "things smaller than me": it is "things that
    // have not clocked me", plus the things I outgrew.
    if (s.eatenCount !== lastEaten) {
      lastEaten = s.eatenCount;
      giveUps = 0; // progress: the room is still worth working
    }
    const valid = (b: (typeof s.bots)[number]): boolean => {
      if (b.eaten) return false;
      // ROUND 5: aware = uneatable at ANY tier. The loud fallback is not a
      // separate rule any more - it is chasing something until it stops
      // seeing us and its meter decays, at which point it is valid again.
      // ROUND 6: and unseen no longer beats every tier. More than QUIET_GAP
      // above us and reaching it only wakes it, so it is not a meal, it is a
      // mistake - the oracle has to grow into the big prey like a player does.
      if (b.tier - s.tier > st.QUIET_GAP) return false;
      return !clocked(b);
    };
    const holdable = !!locked && valid(locked);
    if (holdable) lockF++;
    else {
      lockIdx = -1;
      lockF = 0;
    }
    if (lockF > 420) {
      lockIdx = -1; // 7 seconds on one meal means the route is not working
      lockF = 0;
      giveUps++;
    }
    // TAKE THE OPEN DOOR. Two failed approaches with no eat in between and a
    // tier that already clears the lock is exactly when a human stops
    // farming a guarded scrap and leaves. Without this the bot farms an
    // uncatchable meal until the frame cap.
    if (giveUps >= 2 && (s.doorBlown || s.tier >= s.doorTier)) return dbg("giveup-door", goTo(s.doorX, s.doorY), s);
    if (lockIdx < 0) {
      let bestCost = Infinity;
      for (let i = 0; i < s.bots.length; i++) {
        const b = s.bots[i];
        if (!valid(b)) continue;
        const d = Math.hypot(b.x - s.px, b.y - s.py);
        // heavier machines are worth walking for (a quiet T5 is 190 points on
        // the same approach a T2 pays 70 for); a machine that already sees us
        // will run or hit, so it is worth less; a big hunter is worth the walk
        // but only while it is asleep, and the warden is worth almost any walk
        let cost = d - 16 * k * Math.min(st.MAX_TIER, b.tier);
        if (b.hunter && b.tier > s.tier) cost += b.warden ? -60 * k : 70 * k;
        if (cost < bestCost) {
          bestCost = cost;
          lockIdx = i;
        }
      }
      lockF = 0;
    }
    // NOTHING LEGAL LEFT ON THIS FLOOR. Every machine is aware, searching or
    // too big to swallow - a human leaves rather than orbiting a room that
    // has nothing in it, and without this the bot orbits until the frame cap.
    if (lockIdx < 0 && canLeave) return dbg("nolock-door", goTo(s.doorX, s.doorY), s);
    if (lockIdx >= 0) {
      const best = s.bots[lockIdx];
      if (best.hunter && best.tier <= s.tier) {
        // THE INVERSION: it flees faster than prey, so cut the corner and aim
        // slightly ahead of where it is backing away to.
        const ax = best.x + (best.x - s.px) * 0.18;
        const ay = best.y + (best.y - s.py) * 0.18;
        return goTo(Math.max(R, Math.min(W - R, ax)), Math.max(R, Math.min(H - R, ay)));
      }
      // COME IN OFF ITS NOSE. If it can see us where we stand, walk to the
      // point behind it instead of straight down its own cone: that is the
      // difference between a corrupt and a hit.
      if (!clocked(best) && eyeOn(best.x, best.y, best.fx, best.fy, best.visionR, best.visionCos, s.px, s.py)) {
        const back = st.botR(best.tier) * k + R + 14 * k;
        const bx = Math.max(R, Math.min(W - R, best.x - best.fx * back));
        const by = Math.max(R, Math.min(H - R, best.y - best.fy * back));
        if (!inWall(bx, by, R)) return dbg("flank", goTo(bx, by), s);
      }
      return dbg("pursue", goTo(best.x, best.y), s);
    }

    // ROOM SPENT: break the door if the tier clears it. If it does NOT, the
    // old fallback walked at a locked hatch through everything that had gone
    // aware and died 18 seconds into the run - measured, zero stats, chamber
    // one. With nothing legal to eat and no way out, the play is the one a
    // human makes: break every line, sit down, and let the floor forget you.
    if (canLeave) return dbg("spent-door", goTo(s.doorX, s.doorY), s);
    {
      const src = threat ?? hotBot ?? camSrc;
      const spot = retreat(src);
      if (spot.exp > 0 && spot.exp >= exposure(s.px, s.py)) {
        return dbg("locked-hide", { px: null, py: null, down: false, space: true }, s);
      }
      return dbg("locked-quiet", goTo(spot.x, spot.y), s);
    }
  };
}

// ---------------------------------------------------------------------------
// STOPCLOCK oracle bot
// ---------------------------------------------------------------------------

/**
 * Plays SUPERHOT the way the design intends: dodge the projectile that is
 * actually going to hit (closest-approach test, move perpendicular to its
 * velocity), shoot the nearest threat with lead when it moves. The basic
 * shot is unlimited (priced in time), so the bot fires on cadence: press
 * space with the aim point, release next frame (the sim fires the tap on
 * the RELEASE edge). It never uses rockets - the envelope must bound strong
 * basic play; rockets are player upside the burst term covers. It plays
 * aggressively - time flows while it acts - because checks (c)/(d) need
 * competence and reproducibility, not camping. Deterministic: sim state only.
 * Design space 460x600.
 *
 * THE AIM IS DELIBERATELY UNLED (2026-08-17, the strafe change). Shooters now
 * slide along authored lanes from the first REPEAT lap on, and this policy
 * still aims at where a machine IS rather than where it will be. That is not
 * an oversight: the oracle dies inside the authored three on both stat
 * profiles (measured: max-stat dies in room 2 at 36.0s sim), where
 * strafeAmp() is zero and a lead term would be identically zero, so leading
 * would add a branch the gate can never execute. If a future tune ever walks
 * the oracle past room 3, teach it to lead here first - otherwise check (c)
 * would be reporting a blind oracle's ceiling instead of a strong player's.
 */
function stopclockBot(): (s: sc.StopclockState, frame: number) => InputFrame {
  let fireCd = 0;
  let fireStep = 0; // 1 = the release frame that actually fires the tap
  let aimX = 0;
  let aimY = 0;
  let lastX = -1;
  let lastY = -1;
  let stuck = 0;
  let flip = false; // stuck-flip: try the other barrier end
  return (s) => {
    if (s.phase !== "room") return NEUTRAL;
    if (fireCd > 0) fireCd--;
    const k = s.k;
    const DW = 460 * k;
    const DH = 600 * k;

    // any segment the barriers eat is not a real line (shots OR threats)
    const segBlocked = (x1: number, y1: number, x2: number, y2: number): boolean => {
      for (let i = 1; i < 14; i++) {
        const t = i / 14;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        for (const bar of s.barriers) {
          if (x > bar.x && x < bar.x + bar.w && y > bar.y && y < bar.y + bar.h) return true;
        }
      }
      return false;
    };

    if (Math.abs(s.px - lastX) < 0.4 && Math.abs(s.py - lastY) < 0.4) stuck++;
    else stuck = 0;
    lastX = s.px;
    lastY = s.py;
    if (stuck === 46) flip = !flip;

    /** Routed movement: straight when clear, around the blocking barrier's
     * near end when not. EVERY walk goes through here; two recordings
     * wedged on straight-line walks into slabs. */
    const goTo = (tx: number, ty: number): InputFrame => {
      if (segBlocked(s.px, s.py, tx, ty)) {
        let blocker: { x: number; y: number; w: number; h: number } | null = null;
        outer: for (let i = 1; i < 14; i++) {
          const t = i / 14;
          const x = s.px + (tx - s.px) * t;
          const y = s.py + (ty - s.py) * t;
          for (const bar of s.barriers) {
            if (x > bar.x && x < bar.x + bar.w && y > bar.y && y < bar.y + bar.h) {
              blocker = bar;
              break outer;
            }
          }
        }
        if (blocker) {
          const leftEnd = blocker.x - 28 * k;
          const rightEnd = blocker.x + blocker.w + 28 * k;
          let gx = tx < blocker.x + blocker.w / 2 ? leftEnd : rightEnd;
          if (flip) gx = gx === leftEnd ? rightEnd : leftEnd;
          const gy = s.py < blocker.y ? blocker.y - 24 * k : blocker.y + blocker.h + 24 * k;
          return {
            px: Math.max(20 * k, Math.min(DW - 20 * k, gx)),
            py: Math.max(20 * k, Math.min(DH - 20 * k, gy)),
            down: true,
            space: false,
          };
        }
      }
      return { px: tx, py: ty, down: true, space: false };
    };

    // the release frame of a queued tap: the sim fires on the space RELEASE
    // edge. `down` stays false so this never also reads as a pointer tap.
    if (fireStep === 1) {
      fireStep = 0;
      return { px: aimX, py: aimY, down: false, space: false };
    }

    // target: nearest live enemy (rushers first inside 150)
    let target: { x: number; y: number; kind: string } | null = null;
    let bd = Infinity;
    for (const e of s.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - s.px, e.y - s.py);
      const prio = e.kind === "rusher" && d < 150 * k ? d - 600 : d;
      if (prio < bd) {
        bd = prio;
        target = e;
      }
    }

    // the objective this frame (feeds the dodge bias, so alternating
    // volleys cannot orbit-pin us; the fifth recording stalled that way)
    const objX = target ? target.x : 230 * k;
    const objY = target ? target.y : 300 * k;

    // the projectile that will actually hit: closest-approach inside 0.8s,
    // phantom-filtered, dodged WITH FORWARD BIAS toward the objective.
    // Fat rockets get a wider miss radius; being slow, they resolve mostly
    // by the bot simply walking somewhere else (the design's own dodge).
    // THE ARC IS NOT PHANTOM-FILTERED (2026-08-15): an arcing bomb is thrown
    // OVER cover, so the wall between it and us proves nothing. Filtering it
    // like a bullet would have the oracle stand still under the one thing in
    // the game that cover does not answer.
    let dodge: { px: number; py: number } | null = null;
    let worst = Infinity;
    for (const b of s.bullets) {
      if (b.dead || b.mine) continue;
      if (!b.arc && segBlocked(b.x, b.y, s.px, s.py)) continue;
      const rx = b.x - s.px;
      const ry = b.y - s.py;
      const spd2 = b.vx * b.vx + b.vy * b.vy;
      if (spd2 < 1) continue;
      const tHit = -(rx * b.vx + ry * b.vy) / spd2;
      if (tHit < 0 || tHit > 0.8) continue;
      const cx = rx + b.vx * tHit;
      const cy = ry + b.vy * tHit;
      const miss = Math.hypot(cx, cy);
      const missR = (b.rocket ? 42 : 30) * k;
      if (miss < missR && tHit < worst) {
        worst = tHit;
        const vl = Math.hypot(b.vx, b.vy);
        const nx = -b.vy / vl;
        const ny = b.vx / vl;
        let side = cx * nx + cy * ny > 0 ? -1 : 1; // step AWAY from the pass point
        const od = Math.hypot(objX - s.px, objY - s.py) || 1;
        const ox = (objX - s.px) / od;
        const oy = (objY - s.py) / od;
        let px2 = Math.max(24 * k, Math.min(DW - 24 * k, s.px + nx * side * 84 * k + ox * 48 * k));
        let py2 = Math.max(24 * k, Math.min(DH - 24 * k, s.py + ny * side * 84 * k + oy * 48 * k));
        if (Math.hypot(px2 - s.px, py2 - s.py) < 14 * k) {
          side = -side; // the clamp pinned us in a corner: take the other side
          px2 = Math.max(24 * k, Math.min(DW - 24 * k, s.px + nx * side * 84 * k + ox * 48 * k));
          py2 = Math.max(24 * k, Math.min(DH - 24 * k, s.py + ny * side * 84 * k + oy * 48 * k));
        }
        dodge = { px: px2, py: py2 };
      }
    }

    if (dodge) return { px: dodge.px, py: dodge.py, down: true, space: false };

    if (target) {
      const dist = Math.hypot(target.x - s.px, target.y - s.py);
      const blocked = segBlocked(s.px, s.py, target.x, target.y);

      // THE 2026-08-14 REDESIGN CHANGED THE ORACLE'S JOB. Time now flows only
      // while you MOVE or shoot, and a shot's whole price is that surge. The
      // old policy stood still and tapped: the world then advanced 26 frames
      // per shot and froze again, so the bot's own bullets crawled at 4% and
      // it fired 1200 shots for 3 kills inside room 1. A human holds a move
      // key. So does the bot now: `down` stays HELD every engaging frame.
      //
      // The pointer is BOTH the walk target and the aim point, and fireShot
      // only reads the DIRECTION to it, so aiming at a standoff point ON the
      // line to the enemy flies the bullet straight through the enemy behind
      // it. That one trick lets a single px/py serve both verbs honestly.
      const dx = target.x - s.px;
      const dy = target.y - s.py;
      const dd = Math.hypot(dx, dy) || 1;
      const ux = dx / dd;
      const uy = dy / dd;
      // keep a working distance: close on a far shooter, back off a rusher
      const standoff = target.kind === "rusher" ? 210 * k : 150 * k;
      const step = dist - standoff; // + = advance, - = retreat along the line
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const walkX = clamp(s.px + ux * step, 24 * k, DW - 24 * k);
      const walkY = clamp(s.py + uy * step, 24 * k, DH - 24 * k);
      // never let the walk point collapse onto us: a zero-length pointer
      // vector reads as "no movement" and the freeze comes straight back
      const short = Math.hypot(walkX - s.px, walkY - s.py) < 18 * k;
      const aimAtX = short ? Math.round(s.px + ux * 90 * k) : Math.round(walkX);
      const aimAtY = short ? Math.round(s.py + uy * 90 * k) : Math.round(walkY);

      // OUT OF POSITION: walk (time flows, and that is the price of moving).
      // IN POSITION: stand frozen and shoot. A shot's own SHOT_SURGE_F forces
      // 26 frames of full time, which at BULLET_SPEED 380 carries a bullet
      // ~165 design units - further than the standoff - so a frozen shooter's
      // bullets do land. Walking between every shot instead just donates the
      // same 26 frames to every hostile on the board (measured: the bot died
      // at 15s doing that). Stop-start is the human policy and the safe one.
      const outOfPosition = !short && Math.abs(step) > 40 * k;
      if (outOfPosition && !blocked) return { px: aimAtX, py: aimAtY, down: true, space: false };

      // fire discipline: only on a clear line; rushers only once they are
      // close enough that the lead is honest
      const canShoot = fireCd === 0 && !blocked && (target.kind !== "rusher" || dist < 260 * k);
      if (canShoot) {
        aimX = aimAtX;
        aimY = aimAtY;
        fireStep = 1;
        fireCd = 36; // > the sim's 30-frame wall cooldown
        return { px: aimX, py: aimY, down: false, space: true };
      }
      if (blocked) return goTo(target.x, target.y); // open the angle (or land the punch)
      // cooldown ticking: hold the frozen line, aim ready
      return { px: aimAtX, py: aimAtY, down: false, space: false };
    }
    return NEUTRAL;
  };
}

// ---------------------------------------------------------------------------
// RIOT oracle bot
// ---------------------------------------------------------------------------

/**
 * Plays the brawler the way the design intends, through the same gesture
 * layer a thumb uses (CLICK LAW v3): a press+release with no pointer travel
 * is a CLICK (punch, any duration), one frame of space is a JUMP, and a
 * press DRAGGED to a target then held is a WALK - all in WORLD coordinates
 * (the adapter pins worldSize 640x400 and the sim reads input as world px;
 * the Client's pointerTransform adds camX for humans, so tapes replay
 * camera-free either way).
 *
 * Priorities, top down: walk off a bomb's floor mark; JUMP the limb boss's
 * z=0 laser sweep; y-strafe resolving tells (bolts, windups, charge lanes)
 * with an ALTERNATING side so both facings get exercised on the tape;
 * per-boss policies (dodge the called lane, run from the nova, punish the
 * wall stagger / limb jam / aura drop); jump-attack a raised guard (the
 * only verb that breaks it); otherwise y-align to the nearest machine,
 * close to |dx| ~ 42, and tap the chain. Pickups only when nothing is
 * winding up. Stuck-counter + flip escape (the stopclock recording
 * lesson). It survives the arena until the uncapped per-lap damage kills
 * it - which is the termination proof the frame cap needs.
 * Deterministic: reads sim state only.
 */
function riotBot(): (s: rt.RiotState, frame: number) => InputFrame {
  let tapStep = 0; // 1 = the release frame that fires the queued tap
  let downPrev = false; // what the bot emitted last frame
  let tapX = 0;
  let tapY = 0;
  let prevSpace = false;
  let dodgeSide: 1 | -1 = 1;
  let lastThreatF = -999;
  let lastX = -1;
  let lastY = -1;
  let stuck = 0;
  let flip = false;
  return (s, frame) => {
    const p = s.p;
    const out = (px: number | null, py: number | null, down: boolean, space: boolean): InputFrame => {
      prevSpace = space;
      downPrev = down;
      return { px, py, down, space };
    };
    const hold = (): InputFrame => out(null, null, false, false);
    if (s.phase !== "level" && s.phase !== "arena") {
      tapStep = 0;
      return hold();
    }
    // finish a queued tap COMMITTED: once the gesture starts, its press and
    // release frames fire no matter what the policy would rather do - a
    // 3-frame gesture that re-decides mid-flight never completes under the
    // CLICK LAW (measured: the max-stat oracle, seeing tells 12f earlier,
    // thrashed dodge-tap-dodge and died in fight 1 landing nothing).
    if (tapStep === 2) {
      tapStep = 1;
      return out(tapX, tapY, true, false);
    }
    if (tapStep === 1) {
      tapStep = 0;
      return out(tapX, tapY, false, false);
    }
    const clampY = (y: number) => Math.max(258, Math.min(384, y));
    /** CLICK LAW v3: movement exists only while the press is DRAGGED (pointer
     * >= DRAG_PX from its press origin), so a fresh walk gesture is a real
     * drag: the press lands ON the fighter, and the very next frame's pointer
     * update slides it to the target (>= 80px away by the projection below -
     * far past the 14px drag threshold). While the press stays held every
     * later re-aim keeps it classified as movement (drag is sticky per
     * press). Short-range targets still project 90px out along the bearing:
     * the sim clamps each step to the target's own axis distances (maxX/maxY
     * from the true delta), so overshooting the press point does not
     * overshoot the walk. */
    const walk = (x: number, y: number): InputFrame => {
      if (!downPrev) {
        // the drag-arming frame: land the finger on the fighter, drag next frame
        return out(Math.round(Math.max(s.camX + 18, Math.min(s.camX + 622, p.x))), Math.round(clampY(p.y)), true, false);
      }
      let wx = x;
      let wy = y;
      const dx = x - p.x;
      const dy = y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 80 && d > 0.01) {
        wx = p.x + (dx / d) * 90;
        wy = p.y + (dy / d) * 90;
      }
      return out(Math.round(Math.max(s.camX + 18, Math.min(s.camX + 622, wx))), Math.round(clampY(wy)), true, false);
    };
    const tap = (x: number, y: number): InputFrame => {
      // a tap after a held walk opens with a RELEASE (the walk press is
      // dragged by construction and the CLICK LAW eats a dragged release),
      // then the committed press-release lands on the next two frames.
      tapX = Math.round(x);
      tapY = Math.round(y);
      if (downPrev) {
        tapStep = 2;
        return out(null, null, false, false);
      }
      tapStep = 1;
      return out(tapX, tapY, true, false);
    };
    const jump = (): InputFrame => (prevSpace ? hold() : out(null, null, false, true));
    /** y-target off a called lane; the side alternates per dodge EPISODE
     * (flipping every frame would oscillate on the spot). */
    const dodgeYFrom = (lane: number): number => {
      if (frame - lastThreatF > 24) dodgeSide = dodgeSide === 1 ? -1 : 1;
      lastThreatF = frame;
      let ty = lane + dodgeSide * 54;
      if (ty < 260 || ty > 382) ty = lane - dodgeSide * 54;
      return clampY(ty);
    };

    // stuck-counter + flip (a wedged oracle farms nothing)
    if (Math.abs(p.x - lastX) < 0.4 && Math.abs(p.y - lastY) < 0.4) stuck++;
    else stuck = 0;
    lastX = p.x;
    lastY = p.y;
    if (stuck === 110) flip = !flip;

    // busy: the sim is playing our swing/stun out; hands off
    if (p.fsm === "attack" || p.fsm === "hit" || p.fsm === "down" || p.fsm === "getup" || p.freeze > 0) return hold();

    // airborne: spend the jump attack on whatever is under us
    if (p.z > 0) {
      if (p.fsm === "jump") {
        for (const e of s.enemies) {
          if (e.fsm === "dead") continue;
          if (Math.abs(e.x - p.x) < 60 && Math.abs(e.y - p.y) < 20) return tap(e.x, e.y);
        }
        if (s.boss && Math.abs(s.boss.x - p.x) < 70 && Math.abs(s.boss.y - p.y) < 26) return tap(s.boss.x, s.boss.y);
      }
      return hold();
    }

    // 1. a bomb's floor mark: be somewhere else (the arc contract's answer)
    for (const bm of s.bombs) {
      const d = Math.hypot(p.x - bm.tx, p.y - bm.ty);
      if (d < 58) {
        const ux = d > 1 ? (p.x - bm.tx) / d : 1;
        const uy = d > 1 ? (p.y - bm.ty) / d : 0;
        return walk(p.x + ux * 95, p.y + uy * 95);
      }
    }

    // 2. the tall sweep (z=0 bolt): the jump is the only answer
    for (const bl of s.bolts) {
      if (bl.dead || bl.mine || bl.z !== 0) continue;
      const approaching = (p.x - bl.x) * bl.vx > 0;
      if (approaching && Math.abs(bl.x - p.x) < 100) return jump();
    }

    // 3. torso bolts: break the lane (wide margin - fanned volleys converge)
    for (const bl of s.bolts) {
      if (bl.dead || bl.mine || bl.z === 0) continue;
      const approaching = (p.x - bl.x) * bl.vx > 0;
      if (approaching && Math.abs(bl.y - p.y) < 26 && Math.abs(bl.x - p.x) < 230) return walk(p.x, dodgeYFrom(bl.y));
    }

    // 4. the boss, by the book
    const b = s.boss;
    if (b) {
      const sideB = b.x >= p.x ? 1 : -1;
      if (b.fsm === "vuln" || b.fsm === "recover") {
        // tap only when a jab can LAND (reach 48, |dy| tolerance 12); walk
        // the diagonal otherwise. The windows are ~70f: measured on the limb
        // boss, dodging to 250-400px out meant arriving as they closed and
        // the oracle never scratched it - stay close, punish everything.
        if (Math.abs(b.y - p.y) > 11 || Math.abs(b.x - p.x) > 54) return walk(b.x - sideB * 44, b.y);
        return tap(b.x, b.y);
      }
      if (b.fsm === "tell") {
        if (b.kind === "charge" && b.attackId === 2) return walk(p.x, dodgeYFrom(b.lane));
        if (b.kind === "limbs" && b.attackId === 0) return walk(p.x, dodgeYFrom(b.lane));
        // the laser is JUMPED when it fires (priority 2) - hold punish range
        // instead of outrunning it across half the screen
        if (b.kind === "limbs" && b.attackId === 1) return walk(Math.max(s.camX + 40, b.x - sideB * 170), p.y);
        if (b.kind === "warp" && b.attackId === 1) return walk(p.x, dodgeYFrom(b.lane));
        if (b.kind === "warp" && b.attackId === 2) return walk(p.x + (p.x < b.x ? -1 : 1) * 150, p.y);
        // ABSOLUTE standoff, never a relative retreat (2026-08-17): backing
        // off p.x-90 per decision compounds - measured on the limbs boss, the
        // laser's 60 active frames walked the oracle 400+px out, phase-sped
        // gaps couldn't close it, and every vuln opened out of reach: a
        // frame-capped no-damage stalemate at boss hp 8. 140 clears every
        // non-lane hitbox (slam 84, sweep 100, nova 84) and keeps the next
        // window in walking range.
        return walk(b.x - sideB * 140, dodgeYFrom(b.y));
      }
      if (b.fsm === "attack") {
        if (b.kind === "charge" && b.attackId === 2) {
          // off the lane AND toward the wall it is about to eat: the stagger
          // window opens with the oracle already in punish range
          const wallX = b.vx < 0 ? s.camX + 96 : s.camX + 544;
          return walk(wallX, dodgeYFrom(b.y));
        }
        if (b.kind === "warp" && b.attackId === 1) return walk(p.x, dodgeYFrom(b.y));
        return walk(b.x - sideB * 130, p.y); // same law: hold, don't drift
      }
      // gap: chip when already adjacent, else hover JUST outside arm reach -
      // hovering at 120 left every ~70f window out of walking range
      if (Math.abs(b.y - p.y) <= 11 && Math.abs(b.x - p.x) <= 54) return tap(b.x, b.y);
      return walk(b.x - sideB * 84, b.y);
    }

    // 5. a charging charger owns its lane
    for (const e of s.enemies) {
      if (e.kind === "charger" && e.fsm === "attack" && Math.abs(p.y - e.lane) < 26 && (p.x - e.x) * e.vx > 0)
        return walk(p.x, dodgeYFrom(e.lane));
    }

    // 6. resolving tells: y-strafe out of the called lane
    let tellE: rt.RiotState["enemies"][number] | null = null;
    let tellD = Infinity;
    for (const e of s.enemies) {
      if (e.fsm !== "windup") continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 160 && d < tellD) {
        tellD = d;
        tellE = e;
      }
    }
    if (tellE) return walk(p.x, dodgeYFrom(tellE.kind === "charger" ? tellE.lane : tellE.y));

    // 7. the nearest machine (warm ones included: free damage on a walk-in)
    let target: rt.RiotState["enemies"][number] | null = null;
    let bd = Infinity;
    for (const e of s.enemies) {
      if (e.fsm === "dead") continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bd) {
        bd = d;
        target = e;
      }
    }

    // 8. pickups, only while nothing is winding up and nothing is close.
    // Weapons only while unarmed; a health pack only while HURT - the sim
    // leaves a pack on the ground under a full bar, so walking to one at
    // full HP would park the oracle on it forever (frame-cap deadlock).
    if (target === null || bd > 130) {
      for (const pk of s.pickups) {
        if (pk.taken) continue;
        const takeable = pk.kind === "health" ? p.hp < p.hpMax : p.weapon === "";
        if (!takeable) continue;
        if (Math.hypot(pk.x - p.x, pk.y - p.y) < 160) return walk(pk.x, pk.y);
      }
    }

    if (target) {
      const side = target.x >= p.x ? 1 : -1;
      // a raised frontal guard: jump attack is the verb that opens it
      const guardUp =
        target.kind === "blocker" &&
        (target.fsm === "approach" || target.fsm === "strafe" || target.fsm === "enter") &&
        (p.x - target.x) * target.face > 0;
      if (guardUp && Math.abs(target.y - p.y) <= 12 && Math.abs(target.x - p.x) < 64) return jump();
      if (Math.abs(target.y - p.y) > 8 || Math.abs(target.x - p.x) > 52) {
        const gx = target.x - side * 42;
        return walk(flip ? target.x + side * 42 : gx, flip ? clampY(target.y + 46) : target.y);
      }
      return tap(target.x, target.y);
    }

    // 9. nothing live: push right (levels) / hold the middle (arena)
    if (s.phase === "level") return walk(p.x + 150, 320);
    return walk(320, 330);
  };
}

// ---------------------------------------------------------------------------
// THE WIRED SLATE
// ---------------------------------------------------------------------------
// One entry per live game key; a game only enters the merge gate when
// somebody deliberately wires it here. The S6 slate (Mike's anchors,
// approved 2026-08-12): ironjaw (Super Punch-Out!!) / strain (Carrion-style
// virus) / stopclock (SUPERHOT).
const ADAPTERS: AnyAdapter[] = [
  wrap<ij.IronjawState>({
    key: "ironjaw",
    create: (w, h, seed, stats) => ij.createIronjaw(w, h, seed, false, stats),
    step: (s, dt, input) =>
      ij.stepIronjaw(s, dt, {
        px: input.px,
        py: input.py,
        down: input.down,
        left: false,
        right: false,
        up: false,
        downKey: false,
        space: input.space,
      }),
    done: (s) => ij.ironjawDone(s),
    score: (s) => ij.ironjawScore(s),
    died: (s) => s.phase === "dead" || s.phase === "timeout",
    detail: (s) =>
      `${s.phase === "dead" ? "KO'd" : s.phase === "timeout" ? "clock ran out" : "fighting"} ` +
      `${s.bout <= 2 ? `bout ${s.bout + 1}/3` : `defense ${s.bout - 2}`} vs ${s.oppKey}, ` +
      `dodged ${s.dodged}, landed ${s.landed}, ate ${s.eaten}, whiffed ${s.whiffs} (${s.slips} slipped), baited ${s.baited}`,
    rate: () => {
      // the validator rides the verify (strain/stopclock's exact pattern):
      // reactability floor + dodge-coverage ceiling + slot tier law, checked
      // against the sim's real base dodge window
      // DODGE_CD_BASE rides along now: a combo whose links are spaced tighter
      // than the dodge cooldown is undodgeable by arithmetic, not by skill.
      const errs = validateIronjawLadders(ij.DODGE_F_BASE, ij.DODGE_CD_BASE);
      if (errs.length) throw new Error(`ironjaw ladder set invalid:\n  - ${errs.join("\n  - ")}`);
      return { ...ij.rate(), source: "plateau KO 1000 + per-bout trimmings; min plateau bout ~16s" };
    },
    simSecs: (s) => s.t,
    bot: ironjawBot,
    tape: ijTape as TapeModule,
    tapeRelPath: "src/app/s6/games/ironjaw/tape.ts",
    // THE FIGHT IS THE AFK GATE: an untouched pilot never dodges, and bout
    // 1's authored pattern beats 3 armor down in well under the 60s floor,
    // scoring 0.
    afkStrict: true,
  }),
  wrap<st.StrainState>({
    key: "strain",
    create: (w, h, seed, stats) => st.createStrain(w, h, seed, false, stats),
    step: (s, dt, input) =>
      st.stepStrain(s, dt, {
        px: input.px,
        py: input.py,
        down: input.down,
        left: false,
        right: false,
        up: false,
        downKey: false,
        space: input.space,
      }),
    done: (s) => st.strainDone(s),
    score: (s) => st.strainScore(s),
    died: (s) => s.phase === "dead" || s.phase === "timeout",
    detail: (s) =>
      `${s.phase === "dead" ? "purged" : s.phase === "timeout" ? "backstop" : "loose"} ` +
      `depth ${s.chamber + 1}, tier T${s.tier}, ate ${s.eatenCount} (${s.quietEats} quiet, ${s.huntersEaten} hunters, ${s.wardensEaten} WARDENS), ` +
      `alarms ${s.alarmsTripped}, hp ${s.hp}/${s.hpMax}` +
      // ROUND 6 pressure readout: the numbers that say whether the run was
      // ever actually in danger, which is the whole point of the rebuild
      `, purge ${s.purge.toFixed(2)}${st.floorArmed(s) ? " ARMED" : ""}, startles ${s.startles}, feeds broken ${s.feedsBroken}` +
      // ROUND 7: rounds a turret actually put into the blob. A run with zero
      // of these never crossed a wedge badly, which is the readout that says
      // whether the new hazard is doing anything at all.
      `, turret hits ${s.turretHits}` +
      `, growth ${s.growth}/T${s.doorTier} door, left ${s.bots.filter((b) => !b.eaten).length} @(${Math.round(s.px)},${Math.round(s.py)})`,
    rate: () => {
      // the validator rides the verify: a bad authored set can never reach a
      // green gate, because the envelope itself refuses to exist. It now also
      // proves the INVERSION is funded and that no wall wedges a patrol.
      const errs = validateStrainSets();
      if (errs.length) throw new Error(`strain chamber sets invalid:\n  - ${errs.join("\n  - ")}`);
      return {
        ...st.rate(),
        source: "upper bound on the quiet-corrupt cadence (unseen dies at any tier); round-5 stealth mandate slowed the honest pace well under it; burst = the warden's head beside the fifth door",
      };
    },
    simSecs: (s) => s.t,
    bot: strainBot,
    tape: stTape as TapeModule,
    tapeRelPath: "src/app/s6/games/strain/tape.ts",
    // THE CHAMBER-1 HUNTER IS THE AFK GATE: its authored patrol sweeps the
    // spawn apron (validateSets asserts it), so an idle blob is found,
    // chased, and purged well inside the floor, scoring 0.
    afkStrict: true,
  }),
  wrap<sc.StopclockState>({
    key: "stopclock",
    create: (w, h, seed, stats) => sc.createStopclock(w, h, seed, false, stats),
    step: (s, dt, input) =>
      sc.stepStopclock(s, dt, {
        px: input.px,
        py: input.py,
        down: input.down,
        left: false,
        right: false,
        up: false,
        downKey: false,
        space: input.space,
      }),
    done: (s) => sc.stopclockDone(s),
    score: (s) => sc.stopclockScore(s),
    died: (s) => s.phase === "dead" || s.phase === "timeout",
    detail: (s) =>
      `${s.phase === "dead" ? "shot" : s.phase === "timeout" ? "backstop" : "in it"} ` +
      `room ${s.room + 1}, kills ${s.kills}, shots ${s.shotsFired}, rockets ${s.rockets}/${s.rocketCap}, ` +
      `wave ${s.waveN} (${s.roomT.toFixed(1)}s in room), ${s.t.toFixed(1)}s sim @(${Math.round(s.px)},${Math.round(s.py)})`,
    rate: () => {
      const errs = validateStopclockSets();
      if (errs.length) throw new Error(`stopclock room sets invalid:\n  - ${errs.join("\n  - ")}`);
      return { ...sc.rate(), source: "kill cadence ~1/1.2s sim x 80-160 pts + a clear chunk every ~15s" };
    },
    simSecs: (s) => s.t,
    bot: stopclockBot,
    tape: scTape as TapeModule,
    tapeRelPath: "src/app/s6/games/stopclock/tape.ts",
    // THE WARDEN'S PATIENCE IS THE AFK GATE: 8s of zero input leaks the
    // freeze back to full time, and room 1's rusher (validateSets asserts
    // it exists) closes and kills an idle pilot well inside the floor.
    afkStrict: true,
  }),
  wrap<rt.RiotState>({
    key: "riot",
    create: (w, h, seed, stats) =>
      rt.createRiot(w, h, seed, false, stats ?? { botox: 0, drugs: 0, ozempic: 0, aura: 0, optics: 0 }),
    step: (s, dt, input) =>
      rt.stepRiot(s, dt, {
        px: input.px,
        py: input.py,
        down: input.down,
        left: false,
        right: false,
        up: false,
        downKey: false,
        space: input.space,
      }),
    done: (s) => rt.riotDone(s),
    score: (s) => rt.riotScore(s),
    died: (s) => s.phase === "dead" || s.phase === "timeout",
    detail: (s) =>
      `${s.phase === "dead" ? "scrapped" : s.phase === "timeout" ? "backstop" : s.phase} ` +
      `lvl ${Math.min(3, s.level) + 1}${s.level >= 3 ? " (arena)" : ""}, fight ${s.fight}, wave ${s.wave}, arenaW ${s.arenaWave}, ` +
      `kills ${s.kills}, bosses ${s.bossesDown}, boss ${s.boss ? `${Math.max(0, Math.round(s.boss.hp))}/${s.boss.hpMax} ${s.boss.fsm}#${s.boss.attackId} @(${Math.round(s.boss.x)},${Math.round(s.boss.y)})` : "-"}, ` +
      `hp ${Math.max(0, Math.round(s.p.hp))}/${s.p.hpMax} @(${Math.round(s.p.x)},${Math.round(s.p.y)})`,
    rate: () => {
      // the validator rides the verify (the strain/stopclock pattern): a bad
      // authored set can never reach a green gate
      const errs = validateRiotLevels();
      if (errs.length) throw new Error(`riot level sets invalid:\n  - ${errs.join("\n  - ")}`);
      return {
        ...rt.rate(),
        source: "honest kill cadence ~1/1.1s x 100-180 pts + fight/boss chunks; burst = L3 boss 800 + a pipe double kill + margin",
      };
    },
    simSecs: (s) => s.t,
    bot: riotBot,
    tape: rtTape as TapeModule,
    tapeRelPath: "src/app/s6/games/riot/tape.ts",
    // THE L1 EXECUTIONER IS THE AFK GATE: a melee roamer 200-600px from the
    // spawn (validateLevels asserts it) walks in from frame 0 and beats an
    // idle 40hp pilot down in ~20s, scoring 0.
    afkStrict: true,
  }),
];

// ---------------------------------------------------------------------------
// tape.ts writer (record mode)
// ---------------------------------------------------------------------------

function emitTapeFile(a: AnyAdapter, events: TapeEvent[], zero: RunResult, max: RunResult): string {
  const m = a.tape;
  const rows = events
    .map(
      (e) =>
        `[${e.t},${e.px ?? 0},${e.py ?? 0},${(e.down ? 1 : 0) | (e.space ? 2 : 0) | (e.px == null ? 4 : 0) | (e.py == null ? 8 : 0)}]`,
    )
    .join(",\n");
  const displayName = GAME_RULES[a.key]?.name ?? a.key;
  return `/**
 * ${displayName.toUpperCase()} BASELINE TAPE - recorded ${new Date().toISOString().slice(0, 10)} by
 * \`npx tsx scripts/s6-harness.ts --record ${a.key}\` against the pre-transform
 * sim tree. DO NOT EDIT BY HAND and do not re-record casually: this file IS
 * the byte-identity baseline the harness replays after every page/shell
 * refactor to prove the sim's behavior did not move. Re-record ONLY when the
 * sim itself deliberately changes (which invalidates old tapes by design),
 * and say so in the commit.
 *
 * Replay contract (scripts/s6-harness.ts): fixed ${m.TAPE_DT.toFixed(6)}s steps at
 * ${m.TAPE_W}x${m.TAPE_H}; an event applies from frame t onward; px/py are sim-input
 * coordinates; flags bit0=down, bit1=space, bit2=px is null, bit3=py is null.
 * BASELINE hashes are fnv1a32 over JSON.stringify of the final sim state (rng
 * closures drop out of JSON).
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
// checks (verbatim from scripts/s5-harness.ts)
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
    report(false, a.key, "(a)", `tape not recorded yet - run: npx tsx scripts/s6-harness.ts --record ${a.key}`);
    return;
  }

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

  const moved = z1.score !== x1.score || z1.frames !== x1.frames || z1.died !== x1.died;
  report(
    moved,
    a.key,
    "(b)",
    `stats move outcomes: zero {score ${z1.score}, ${z1.secs.toFixed(1)}s, ${z1.died ? "died" : "survived"}} vs ` +
      `max {score ${x1.score}, ${x1.secs.toFixed(1)}s, ${x1.died ? "died" : "survived"}}`,
  );

  // (ADR-0120) the oracle must FIT THE RATE ENVELOPE: a legit score is
  // bounded by perSec x simSeconds + burst, never by a design ceiling; the
  // registry maxScore survives only as the absurdity clamp.
  const oracle = botRun(a, MAX_STATS);
  const r = a.rate();
  const env = Math.round(r.perSec * oracle.simSecs + r.burst);
  const underMax = oracle.score <= rules.maxScore;
  const underEnv = oracle.score <= env;
  report(
    underMax && underEnv,
    a.key,
    "(c)",
    `max-stat oracle ${oracle.score} fits envelope ${env} (${r.perSec}/s x ${oracle.simSecs.toFixed(1)}s sim + ${r.burst}) ` +
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

function recordGame(a: AnyAdapter): void {
  console.log(`\n=== recording ${a.key} baseline tape (seed "${a.tape.TAPE_SEED}") ===`);
  const rec = recordTape(a, null);
  const zero = replay(a, null, rec.events);
  if (!sameRun(zero, rec.result)) {
    report(false, a.key, "(record)", `downsampled replay diverged from the live recording (record ${rec.result.score}/${hex(rec.result.hash)} vs replay ${zero.score}/${hex(zero.hash)})`);
    return;
  }
  const max = replay(a, MAX_STATS, rec.events);
  const file = emitTapeFile(a, rec.events, zero, max);
  const target = path.join(ROOT, a.tapeRelPath);
  fs.writeFileSync(target, file, "utf8");
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
if (!fs.existsSync(path.join(ROOT, "src", "app", "s6", "games"))) {
  console.error("Run from the web3guides repo root (src/app/s6/games not found under cwd).");
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
