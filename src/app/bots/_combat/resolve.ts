/**
 * BATTLE BOTS RESOLVER - the fight as a pure function (engine doc section
 * 3). `resolveFight(seed, a, b, oa, ob, mode)` runs on the server once and on
 * the client again to draw it; the two hashes must match. Also exposed as
 * createFight / stepFight for the renderer's fixed-timestep replay.
 *
 * PURE AND HEADLESS (house kit, the s7/games/crypt/sim.ts idiom): no wall
 * clock, no unseeded randomness, no DOM, no floats in state. Every number
 * stored on the state is a whole number, so fnv1a(JSON.stringify(state)) is
 * platform-stable (the determinism gate).
 *
 * LAWS THIS FILE ENFORCES:
 *  - FORKED RNG, PLAIN STATE. One stream per side per purpose via
 *    rngFork(seed, "A" | "B", purpose). The attacker rolls hit, target, dmg
 *    and crit from its own streams; the defender rolls block and luck (the
 *    bounce) from its own. Stream positions live in state as integer
 *    cursors; the live closures ride alongside in Fight.rng and are never
 *    hashed. A change to build A never moves a draw of build B (gate g).
 *  - FIXED 60 Hz BEATS, HARD CAP 5400 FRAMES. Frame 0: the faster bot
 *    (higher SPEED) starts at half its interval, the other at the full one;
 *    tie on SPEED: the lower bot total first; still tied: side B, the
 *    challenged bot. Same-frame swings resolve in that same order.
 *  - ONE SWING, SIX STEPS, ONE ROLL EACH: miss, block, where, how hard,
 *    bounce, break. The fight ends the instant a body breaks (no double KO).
 *  - HANGMAN EFFECTS from the frame a part breaks: leg off = dodge -4 and
 *    interval +6 each; arm off = damage -25 percent, block chance halved
 *    (both gone: 0), body shielding -25 percent; head off = accuracy -8 and
 *    no crits; body off = knockout. The victim staggers 30 frames.
 *  - TIRED AT 3600 (60 s): every dodge and block chance is halved for both.
 *    TIMEOUT AT 5400: higher body armor percent wins; tie: more damage
 *    dealt; tie: side B.
 *  - THE SEED SELECTS. Builds are inputs; nothing here invents a part.
 *  - ILLEGAL BUILDS THROW. A breaker, never a clamp.
 */

import { fnv1a, rngFork, type Rng } from "../_engine/rng";
import {
  NO_ORDERS,
  PIECE,
  PIECE_COUNT,
  TIMEOUT_WHY,
  type FightEvent,
  type FightResult,
  type Mode,
  type Orders,
  type Piece,
  type Side,
} from "../_engine/parts";
import { SHIELD_PERCENT, blockChance, deriveFighter, hitChance, startingArmor, type Fighter } from "./derive";
import { assertModularBuild as assertLegalBuild, type CombatBuild as Build } from "@/lib/bots/combat-model";
const ENGINE_VERSION = 3;

// ── the beat knobs (engine doc 3.2) ─────────────────────────────────────────

export const BEAT = {
  FPS: 60,
  CAP_F: 5400,
  TIRED_F: 3600,
  STAGGER_F: 30,
  /** dmg x (SWING_LO + roll x SWING_RANGE / 100) / 100: 70 to 130 percent
   * (the doc's 85 to 115, widened in the week 1 tuning pass; see derive.ts). */
  SWING_LO: 70,
  SWING_RANGE: 61,
  /** a blocked hit lands on the blocking arm at dmg / BLOCK_DIVISOR (the
   * doc's half made block a stat that cost you your arms; see derive.ts) */
  BLOCK_DIVISOR: 4,
  /** hangman effects */
  LEG_DODGE: 4,
  LEG_INTERVAL: 6,
  HEAD_ACC: 8,
  ARM_DMG_QUARTERS: 1,
  /** target weights in PIECE order: head, body, armL, armR, legL, legR */
  WEIGHTS: [2, 8, 3, 3, 2, 2] as readonly number[],
  FOCUS_WEIGHT: 6,
} as const;

// ── streams ─────────────────────────────────────────────────────────────────

const PURPOSES = ["hit", "block", "target", "dmg", "crit", "luck"] as const;
const P_HIT = 0;
const P_BLOCK = 1;
const P_TARGET = 2;
const P_DMG = 3;
const P_CRIT = 4;
const P_LUCK = 5;
const STREAMS_PER_SIDE = PURPOSES.length;
const SIDE_IDS: readonly string[] = ["A", "B"];

/** All twelve streams for a seed, fast-forwarded to `cursors` (all zero for
 * a fresh fight; a mid-fight snapshot resumes exactly). */
export function streamsFor(seed: number, cursors: readonly number[]): Rng[] {
  const out: Rng[] = [];
  for (let side = 0; side < 2; side++) {
    for (let p = 0; p < STREAMS_PER_SIDE; p++) {
      const rng = rngFork(seed, SIDE_IDS[side], PURPOSES[p]);
      const skip = cursors[side * STREAMS_PER_SIDE + p] ?? 0;
      for (let i = 0; i < skip; i++) rng();
      out.push(rng);
    }
  }
  return out;
}

// ── state ───────────────────────────────────────────────────────────────────

export interface SideState {
  armor: number[];     // per piece, PIECE order; 0 = broken
  armorMax: number[];
  swingT: number;      // frames until the next swing
  staggerT: number;    // frames of stagger left (swing timer paused)
  bounceUsed: number;  // 0 | 1
  dealt: number;       // damage dealt, the second timeout tiebreak
  swings: number;
  hits: number;
}

export interface FightState {
  v: number;           // ENGINE_VERSION
  seed: number;
  mode: Mode;
  frame: number;       // frames stepped so far
  first: Side;         // initiative: who resolves first inside a frame
  tired: number;       // 0 | 1
  done: number;        // 0 | 1
  winner: number;      // -1 until done
  end: number;         // 0 running, 1 ko, 2 timeout
  builds: [Build, Build];
  orders: [Orders, Orders];
  fighters: [Fighter, Fighter];
  sides: [SideState, SideState];
  cursors: number[];   // draws taken per stream, side x purpose
  log: FightEvent[];
}

/** The state plus its live streams. Hash the state, never the streams. */
export interface Fight {
  st: FightState;
  rng: Rng[];
}

function newSide(f: Fighter): SideState {
  const armor = startingArmor(f);
  return {
    armor,
    armorMax: armor.slice(),
    swingT: 0,
    staggerT: 0,
    bounceUsed: 0,
    dealt: 0,
    swings: 0,
    hits: 0,
  };
}

/** Initiative (engine doc 3.2): higher SPEED, then lower total, then B. */
function initiative(a: Fighter, b: Fighter): Side {
  if (a.speed !== b.speed) return a.speed > b.speed ? 0 : 1;
  if (a.total !== b.total) return a.total < b.total ? 0 : 1;
  return 1;
}

export function createFight(
  seed: number,
  a: Build,
  b: Build,
  oa: Orders = NO_ORDERS,
  ob: Orders = NO_ORDERS,
  mode: Mode = "spar",
): Fight {
  assertLegalBuild(a, "build A");
  assertLegalBuild(b, "build B");
  const s = seed >>> 0;
  const fa = deriveFighter(a, oa);
  const fb = deriveFighter(b, ob);
  const sides: [SideState, SideState] = [newSide(fa), newSide(fb)];
  const first = initiative(fa, fb);
  const fighters: [Fighter, Fighter] = [fa, fb];
  sides[first].swingT = Math.floor(fighters[first].interval / 2);
  sides[1 - first].swingT = fighters[1 - first].interval;
  const cursors = new Array<number>(2 * STREAMS_PER_SIDE).fill(0);
  const st: FightState = {
    v: ENGINE_VERSION,
    seed: s,
    mode,
    frame: 0,
    first,
    tired: 0,
    done: 0,
    winner: -1,
    end: 0,
    builds: [a, b],
    orders: [oa, ob],
    fighters,
    sides,
    cursors,
    log: [{ t: "start", f: 0 }],
  };
  return { st, rng: streamsFor(s, cursors) };
}

// ── draws ───────────────────────────────────────────────────────────────────

/** One draw from one named stream: an int in 0..n-1, cursor advanced. */
function draw(fight: Fight, side: Side, purpose: number, n: number): number {
  const idx = side * STREAMS_PER_SIDE + purpose;
  const r = Math.floor(fight.rng[idx]() * n);
  fight.st.cursors[idx] += 1;
  return r;
}

// ── piece bookkeeping ───────────────────────────────────────────────────────

function brokenLegs(s: SideState): number {
  return (s.armor[PIECE.LEG_L] === 0 ? 1 : 0) + (s.armor[PIECE.LEG_R] === 0 ? 1 : 0);
}

function intactArms(s: SideState): number {
  return (s.armor[PIECE.ARM_L] > 0 ? 1 : 0) + (s.armor[PIECE.ARM_R] > 0 ? 1 : 0);
}

function currentInterval(f: Fighter, s: SideState): number {
  return f.interval + BEAT.LEG_INTERVAL * brokenLegs(s);
}

/** Weighted pick over intact pieces; broken pieces drop out and the weights
 * renormalize, so the finisher phase happens by itself. Focus adds +6 to a
 * slot (+3 to each of a pair). */
function pickPiece(fight: Fight, who: Side, target: SideState, focus: number): Piece {
  const w: number[] = new Array<number>(PIECE_COUNT);
  let total = 0;
  for (let p = 0; p < PIECE_COUNT; p++) {
    let weight = target.armor[p] > 0 ? BEAT.WEIGHTS[p] : 0;
    if (weight > 0) {
      if (focus === 1 && (p === PIECE.LEG_L || p === PIECE.LEG_R)) weight += BEAT.FOCUS_WEIGHT / 2;
      else if (focus === 2 && (p === PIECE.ARM_L || p === PIECE.ARM_R)) weight += BEAT.FOCUS_WEIGHT / 2;
      else if (focus === 3 && p === PIECE.HEAD) weight += BEAT.FOCUS_WEIGHT;
      else if (focus === 4 && p === PIECE.BODY) weight += BEAT.FOCUS_WEIGHT;
    }
    w[p] = weight;
    total += weight;
  }
  let r = draw(fight, who, P_TARGET, total);
  for (let p = 0; p < PIECE_COUNT; p++) {
    if (w[p] === 0) continue;
    if (r < w[p]) return p as Piece;
    r -= w[p];
  }
  return PIECE.BODY;
}

/** Steps 5 and 6 of a swing: the bounce, then the break and its effects. */
function applyDamage(fight: Fight, attacker: Side, victim: Side, piece: Piece, dmg: number): void {
  const st = fight.st;
  const f = st.frame;
  const s = st.sides[victim];
  if (s.armor[piece] <= 0) return;
  if (dmg < s.armor[piece]) {
    s.armor[piece] -= dmg;
    return;
  }
  if (s.bounceUsed === 0) {
    const roll = draw(fight, victim, P_LUCK, 100);
    if (roll < st.fighters[victim].bounceChance) {
      s.armor[piece] = 1;
      s.bounceUsed = 1;
      st.log.push({ t: "bounce", f, who: victim, part: piece });
      return;
    }
  }
  s.armor[piece] = 0;
  st.log.push({ t: "break", f, who: victim, part: piece });
  if (piece === PIECE.BODY) {
    st.done = 1;
    st.end = 1;
    st.winner = attacker;
    st.log.push({ t: "ko", f, winner: attacker });
    return;
  }
  s.staggerT = BEAT.STAGGER_F;
  st.log.push({ t: "stagger", f, who: victim });
}

// ── one swing (engine doc 3.2, six steps in order) ──────────────────────────

function swing(fight: Fight, who: Side): void {
  const st = fight.st;
  const f = st.frame;
  const tgt: Side = who === 0 ? 1 : 0;
  const A = st.fighters[who];
  const B = st.fighters[tgt];
  const sa = st.sides[who];
  const sb = st.sides[tgt];
  sa.swings += 1;
  st.log.push({ t: "swing", f, who, target: tgt });

  // 1. miss?
  let acc = A.acc - (sa.armor[PIECE.HEAD] === 0 ? BEAT.HEAD_ACC : 0);
  if (acc < 0) acc = 0;
  let dodge = B.dodge - BEAT.LEG_DODGE * brokenLegs(sb);
  if (dodge < 0) dodge = 0;
  if (st.tired) dodge = Math.floor(dodge / 2);
  if (draw(fight, who, P_HIT, 100) >= hitChance(acc, dodge)) {
    st.log.push({ t: "miss", f, who });
    return;
  }

  // how hard (the swing roll is needed by a block, so it comes before step 2)
  let base = A.damagePerHit;
  const brokenArmsA = 2 - intactArms(sa);
  if (brokenArmsA > 0) base = Math.floor((base * (4 - BEAT.ARM_DMG_QUARTERS * brokenArmsA)) / 4);
  const swingPct = BEAT.SWING_LO + Math.floor((draw(fight, who, P_DMG, 100) * BEAT.SWING_RANGE) / 100);
  let dmg = Math.floor((base * swingPct) / 100);

  // 2. block? only with an intact arm; a blocked hit never crits; the
  //    sturdier arm blocks and takes a quarter of the hit
  const armsB = intactArms(sb);
  if (armsB > 0) {
    let bc = blockChance(B.block);
    if (armsB === 1) bc = Math.floor(bc / 2);
    if (st.tired) bc = Math.floor(bc / 2);
    if (draw(fight, tgt, P_BLOCK, 100) < bc) {
      const left = sb.armor[PIECE.ARM_L];
      const right = sb.armor[PIECE.ARM_R];
      const arm: Piece = left >= right ? PIECE.ARM_L : PIECE.ARM_R;
      const taken = Math.floor(dmg / BEAT.BLOCK_DIVISOR);
      sa.hits += 1;
      sa.dealt += taken;
      st.log.push({ t: "block", f, who: tgt, arm, dmg: taken });
      if (taken > 0) applyDamage(fight, who, tgt, arm, taken);
      return;
    }
  }

  // 3. where?
  const piece = pickPiece(fight, who, sb, A.focus);

  // 4. crit and shielding
  let crit = 0;
  const critRoll = draw(fight, who, P_CRIT, 100);
  if (critRoll < A.critChance && sa.armor[PIECE.HEAD] > 0) {
    crit = 1;
    dmg *= 2;
  }
  if (piece === PIECE.BODY) dmg = Math.floor((dmg * SHIELD_PERCENT[armsB]) / 100);
  if (dmg < 1) dmg = 1;
  sa.hits += 1;
  sa.dealt += dmg;
  st.log.push({ t: "hit", f, who, part: piece, dmg, crit });

  // 5 and 6. bounce, break, effects
  applyDamage(fight, who, tgt, piece, dmg);
}

// ── the beats ───────────────────────────────────────────────────────────────

function timeout(fight: Fight): void {
  const st = fight.st;
  const f = st.frame;
  const a = st.sides[0];
  const b = st.sides[1];
  // body armor percent, compared without division
  const aPct = a.armor[PIECE.BODY] * b.armorMax[PIECE.BODY];
  const bPct = b.armor[PIECE.BODY] * a.armorMax[PIECE.BODY];
  let winner: Side;
  let why: number;
  if (aPct !== bPct) {
    winner = aPct > bPct ? 0 : 1;
    why = TIMEOUT_WHY.BODY;
  } else if (a.dealt !== b.dealt) {
    winner = a.dealt > b.dealt ? 0 : 1;
    why = TIMEOUT_WHY.DAMAGE;
  } else {
    winner = 1;
    why = TIMEOUT_WHY.CHALLENGED;
  }
  st.done = 1;
  st.end = 2;
  st.winner = winner;
  st.log.push({ t: "timeout", f, winner, why });
}

/** Advance one frame. A no-op once the fight is done. */
export function stepFight(fight: Fight): void {
  const st = fight.st;
  if (st.done) return;
  if (st.frame >= BEAT.CAP_F) {
    timeout(fight);
    return;
  }
  const f = st.frame;
  if (f === BEAT.TIRED_F) {
    st.tired = 1;
    st.log.push({ t: "tired", f });
  }
  const order: [Side, Side] = st.first === 0 ? [0, 1] : [1, 0];
  for (const who of order) {
    const s = st.sides[who];
    if (s.staggerT > 0) {
      s.staggerT -= 1;
      continue;
    }
    s.swingT -= 1;
    if (s.swingT <= 0) {
      swing(fight, who);
      if (st.done) {
        st.frame = f + 1;
        return;
      }
      s.swingT = currentInterval(st.fighters[who], s);
    }
  }
  st.frame = f + 1;
}

export function fightDone(fight: Fight): boolean {
  return fight.st.done === 1;
}

export function fightHash(st: FightState): number {
  return fnv1a(JSON.stringify(st));
}

/** Run a fight to its end and hand back the live object (the harness reads
 * the final state; the renderer wants resolveFight). */
export function runFight(
  seed: number,
  a: Build,
  b: Build,
  oa: Orders = NO_ORDERS,
  ob: Orders = NO_ORDERS,
  mode: Mode = "spar",
): Fight {
  const fight = createFight(seed, a, b, oa, ob, mode);
  while (!fight.st.done) stepFight(fight);
  return fight;
}

export function resultOf(fight: Fight): FightResult {
  const st = fight.st;
  if (!st.done) throw new Error("resultOf: fight is not finished");
  return {
    winner: st.winner as Side,
    frames: st.frame,
    end: st.end === 1 ? "ko" : "timeout",
    log: st.log,
    hash: fightHash(st),
    engineVersion: ENGINE_VERSION,
  };
}

/** The pure function the server stores and the client re-runs. */
export function resolveFight(
  seed: number,
  a: Build,
  b: Build,
  oa: Orders = NO_ORDERS,
  ob: Orders = NO_ORDERS,
  mode: Mode = "spar",
): FightResult {
  return resultOf(runFight(seed, a, b, oa, ob, mode));
}
