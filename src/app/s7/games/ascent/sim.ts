/**
 * ASCENT (THE SPIRE) - the S7 Jump King / Getting Over It mirror. One fixed
 * authored tower, charge-and-release precision jumps, a 3-MINUTE TIMER, and
 * one wrong move dumps you screens down with barely any checkpoints (pure
 * Foddy style, Mike's own spec). Score = the highest LEDGE you ever stood on,
 * in integer height units, plus nothing.
 *
 * PURE AND HEADLESS (house kit): no Math.random, no Date, no canvas. This sim
 * rolls NOTHING at all - it has no RNG streams and no rngCursors, because
 * every source of variation is authored in content.ts (the tower, the wind
 * schedule, the repeat band). A tape therefore replays byte-identically by
 * construction; the check script proves it anyway.
 *
 * LAWS THIS FILE ENFORCES:
 *  - FODDY PURITY. Hold down = charge (visible meter), px while charging =
 *    aim, release = jump. AIRBORNE: NO CONTROL - no air steering, no double
 *    jump, no ledge grab. Walls bounce, slick slopes slide, and the only
 *    verbs are where you aimed and how long you held.
 *  - NO RESPAWNS, NO DEATH. Falling never kills and nothing teleports you.
 *    The 3 checkpoint ledges are just wide flat stances you cannot slide off
 *    (natural resting spots); a fall goes as far as the ledges let it. The
 *    TIMER is the only end: the run banks at frame RUN_FRAMES exactly and
 *    died is always false.
 *  - STATS NEVER TOUCH JUMP POWER (the stats-matter gate, tuned subtle).
 *    derive(loadout) maps to (a) CHARGE SPEED - a stronger build fills the
 *    meter slightly faster, so a skilled player fits more attempts into the
 *    180 seconds, and (b) GRIP - a small reduction in slide speed on slick
 *    slopes. Full charge is the SAME jump for every build, always; class
 *    flavors the FX trail page-side and nothing else.
 *  - CEILING-NEUTRALITY (ADR-0070 lineage) falls out of the above: gear buys
 *    tempo and footing, never height-per-jump, so the skill ceiling is the
 *    same tower for everyone. Scores never cap (ADR-0120): the tower is
 *    finite but the authored High Spire repeat band above the crown keeps
 *    height open for a run that tops it.
 *  - AFK = 0. You start standing on the floor at height 0 and only landings
 *    bank height, so an idle run scores exactly 0 with no special case.
 *  - INTEGER STATE. Positions and velocities are x100 fixed-point ints;
 *    every stored number is an int, so fnv1a(JSON.stringify(state)) is
 *    platform-stable. No floats ever touch state.
 *
 * INPUT (the s7 harness tape contract): {px, py, down, space} with px/py
 * NORMALIZED [0,1] or null, at fixed dt (one step = one 60th-second frame).
 *    hold down (grounded)  -> charge the meter
 *    px while charging     -> aim: 0 = full left, 0.5 = straight up, 1 = right
 *                             (SIGNED-SQUARE response: the centre half of the
 *                             screen covers only aim +/-25 for fine vertical
 *                             control; the edges still reach +/-100)
 *    release down          -> jump (charge below CHARGE_MIN just cancels)
 *    space                 -> unused (reserved; the sim ignores it)
 *  py is read by nothing; the meter auto-releases at full charge (the Jump
 *  King idiom - a held press cannot stall the run).
 *
 * RESOLVED SPEC AMBIGUITIES (documented choices):
 *  - Charging needs no down-EDGE: holding down while grounded charges, so a
 *    press held through a landing starts the next charge on touch (Jump King
 *    behavior; deterministic, and tapes stay honest).
 *  - Sliding off a slick slope CANCELS any charge in progress and you leave
 *    the ledge at slide speed with zero lift (the cruel part is the point).
 *  - HEIGHT BANKS ON LANDING only: maxY tracks the ledges you actually stood
 *    on, never an airborne apex, so flailing near a wall pays nothing.
 *  - A landing lower than the last stance counts one fall and the height
 *    difference into the tally (display + share copy; score ignores it).
 *  - Wall and bounce-wall hits reflect vx at BOUNCE_PCT and cost nothing
 *    else; the outer walls always bounce, the two authored walls only at
 *    their heights. The bounce test is the player's center point.
 *  - Wind (authored schedule, storm band only) shoves vx while AIRBORNE
 *    only; a grounded climber is never pushed. The renderer reads the same
 *    windAt() so the streaks always match the shove.
 *  - demo=true ignores the tape and drives a scripted full-charge showcase
 *    brain that aims for the nearest ledge above (pure function of state).
 */

import { derive, fnv1a, type ClassId, type Loadout } from "../_shared/rules/core";
import {
  BOUNCE_WALLS,
  LEDGES,
  REPEAT_H,
  REPEAT_LEDGES,
  RUN_FRAMES,
  TOWER_TOP,
  WALL_L,
  WALL_R,
  bandIndexFor,
  windAt,
  type Ledge,
} from "./content";

export { fnv1a };
export { RUN_FRAMES };

// ── input ───────────────────────────────────────────────────────────────────

export interface SimInput {
  px: number | null; // [0,1]
  py: number | null; // [0,1]
  down: boolean;
  space: boolean;
}

// ── constants ───────────────────────────────────────────────────────────────

export const FPS = 60;

// fixed-point physics (x100 units); one step = one 60th-second frame
export const G100 = 55;         // gravity per frame (0.55 units/f^2)
export const VY_MIN100 = 480;   // the smallest jump's lift (4.8 units/f)
export const VY_MAX100 = 1750;  // full charge lift: apex ~278 units
export const VX_MAX100 = 700;   // full charge full-side push (7 units/f)
export const VX_CAP100 = 900;   // wind can never push past this
export const CHARGE_MAX = 6000; // meter units; auto-release when full
export const CHARGE_MIN = 500;  // a shorter tap cancels instead of hopping
export const SLIDE100 = 90;     // slick slope base slide (0.9 units/f)
export const BOUNCE_PCT = 65;   // vx keeps 65% on a wall bounce, reversed
export const PLAYER_R = 10;     // half-width against the outer walls
export const TOE = 6;           // landing/stance grace past a ledge edge

/** Full-charge reach, exported for draw hints and the check script's
 * documentation: apex = VY_MAX100^2 / (2 * G100 * 100). */
export const APEX_MAX = Math.floor((VY_MAX100 * VY_MAX100) / (2 * G100 * 100)); // ~278

// ── state ───────────────────────────────────────────────────────────────────

export interface AscentState {
  W: number;
  H: number;
  demo: boolean;
  /** Kept for the franchise create() contract; the tower is fixed and the
   * sim rolls nothing, so the seed influences NOTHING (documented law). */
  seed: number;
  frame: number;
  ended: number; // 0|1 - the timer is the only end
  // the climber (x100 fixed-point)
  x100: number;
  y100: number;
  vx100: number;
  vy100: number;
  grounded: number; // 0|1
  ledgeIdx: number; // -1 = the floor; authored index; repeat band encoded above N
  // the verb
  charging: number; // 0|1
  charge: number;   // 0..CHARGE_MAX
  aim: number;      // -100 (full left) .. 100 (full right), captured while charging
  // the loadout envelope (ints, resolved once at create)
  classId: ClassId;
  level: number;
  chargeRate100: number; // meter units per held frame
  grip100: number;       // % slide reduction on slick slopes (0..50)
  // the tally (monotonic counters the page diffs; maxY IS the score)
  maxY: number;     // highest ledge ever stood on (integer units)
  lastGroundY: number;
  jumps: number;
  autoJumps: number; // released by the full meter, not the player
  lands: number;
  falls: number;    // landings below the previous stance
  fellUnits: number;
  bounces: number;
  slideF: number;   // frames spent sliding on slick stone
  gustF: number;    // airborne frames the wind actually shoved
  bandTop: number;  // highest palette band ever stood in
  prevDown: number; // 0|1
}

// ── validity + ceiling (ADR-0120: rate plateaus, score never caps) ──────────

/** THE VALIDITY ENVELOPE - honest max-climb math. The tallest authored gap
 * is ~210 units; clearing it needs ~5/6 charge (~46 frames at the fastest
 * legal charge rate ~109/f) plus ~31 frames of flight, so a perfect line
 * sustains ~210 units per ~77 frames = ~164 units/s. perSec 240 covers it
 * with margin; burst covers one full gap landing on the scoring tick. */
export function rate(): { perSec: number; burst: number } {
  return { perSec: 240, burst: 400 };
}

/** THE FAR-OFF SANITY CLAMP (generous by design, per the harness law that
 * maxScore >= 5x the oracle). The run is HARD-CAPPED at 180s, so even the
 * impossible sustained envelope tops out near 240 x 180 + 400 = 43,600.
 * Round far up: nothing legitimate ever grazes this. */
export function ceiling(): number {
  return 250_000;
}

// ── integer helpers ─────────────────────────────────────────────────────────

/** Truncating integer divide (magnitudes here stay far under 2^31). */
function idiv(a: number, b: number): number {
  return (a / b) | 0;
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── the tower (authored lookup; the repeat band is arithmetic, not RNG) ─────

const N_LEDGES = LEDGES.length;
const N_REPEAT = REPEAT_LEDGES.length;

/** Ledge by state index: -1 = floor, 0..N-1 authored, N + k*RN + j = repeat
 * pattern ledge j of tile k. Returns a plain descriptor (repeat ys shifted
 * to absolute world units). */
export function ledgeByIdx(idx: number): Ledge {
  if (idx < 0) return { x0: WALL_L, x1: WALL_R, y: 0, kind: 0, cp: 0, route: 1 };
  if (idx < N_LEDGES) return LEDGES[idx];
  const r = idx - N_LEDGES;
  const k = idiv(r, N_REPEAT);
  const j = r - k * N_REPEAT;
  const p = REPEAT_LEDGES[j];
  return { x0: p.x0, x1: p.x1, y: TOWER_TOP + k * REPEAT_H + p.y, kind: p.kind, cp: 0, route: 1 };
}

/** Every ledge with y in [yLo, yHi], as state indices, ascending. Linear
 * over the authored book plus arithmetic repeat tiles; call rates are
 * per-frame landing sweeps and per-paint view queries, both cheap. */
export function ledgeIdxInRange(yLo: number, yHi: number, out: number[]): number[] {
  out.length = 0;
  for (let i = 0; i < N_LEDGES; i++) {
    const y = LEDGES[i].y;
    if (y > yHi) break;
    if (y >= yLo) out.push(i);
  }
  if (yHi > TOWER_TOP) {
    const k0 = Math.max(0, idiv(Math.max(0, yLo - TOWER_TOP - REPEAT_H), REPEAT_H));
    const k1 = idiv(yHi - TOWER_TOP, REPEAT_H) + 1;
    for (let k = k0; k <= k1; k++) {
      for (let j = 0; j < N_REPEAT; j++) {
        const y = TOWER_TOP + k * REPEAT_H + REPEAT_LEDGES[j].y;
        if (y >= yLo && y <= yHi) out.push(N_LEDGES + k * N_REPEAT + j);
      }
    }
  }
  return out;
}

// ── create ──────────────────────────────────────────────────────────────────

const DEFAULT_LOADOUT: Loadout = {
  classId: "barbarian",
  level: 1,
  gear: { weapon: 0, armor: 0, trinket: 0 },
};

/** The subtle stat envelope (the panel tune): charge speed rides the derived
 * speed and attack numbers (about 100..110 across the whole loadout space),
 * grip rides armor class (0..~26% slide reduction). NEVER jump power. */
export function envelopeFor(loadout: Loadout | null): { chargeRate100: number; grip100: number } {
  const dv = derive(loadout || DEFAULT_LOADOUT);
  const chargeRate100 = 100 + idiv(Math.max(0, dv.speed - 95), 4) + idiv(dv.atkBonus, 2);
  const grip100 = clampInt((dv.ac - 10) * 4, 0, 50);
  return { chargeRate100, grip100 };
}

export function createAscent(
  w: number,
  h: number,
  seed: string,
  demo: boolean,
  loadout: Loadout | null,
): AscentState {
  const lo = loadout || DEFAULT_LOADOUT;
  const env = envelopeFor(lo);
  return {
    W: w | 0,
    H: h | 0,
    demo,
    seed: fnv1a(seed || "ascent"),
    frame: 0,
    ended: 0,
    x100: 400 * 100, // the floor spawn, center of the tower
    y100: 0,
    vx100: 0,
    vy100: 0,
    grounded: 1,
    ledgeIdx: -1,
    charging: 0,
    charge: 0,
    aim: 0,
    classId: lo.classId,
    level: Math.max(1, Math.min(20, lo.level | 0)),
    chargeRate100: env.chargeRate100,
    grip100: env.grip100,
    maxY: 0,
    lastGroundY: 0,
    jumps: 0,
    autoJumps: 0,
    lands: 0,
    falls: 0,
    fellUnits: 0,
    bounces: 0,
    slideF: 0,
    gustF: 0,
    bandTop: 0,
    prevDown: 0,
  };
}

// ── verbs ───────────────────────────────────────────────────────────────────

function doJump(s: AscentState, auto: boolean): void {
  const c = s.charge;
  s.vy100 = VY_MIN100 + idiv(c * (VY_MAX100 - VY_MIN100), CHARGE_MAX);
  s.vx100 = idiv(s.aim * VX_MAX100 * c, 100 * CHARGE_MAX);
  s.grounded = 0;
  s.ledgeIdx = -1;
  s.charging = 0;
  s.charge = 0;
  s.jumps += 1;
  if (auto) s.autoJumps += 1;
}

const scanBuf: number[] = []; // reused landing-sweep buffer, never reallocated

function land(s: AscentState, idx: number, y: number): void {
  s.grounded = 1;
  s.ledgeIdx = idx;
  s.y100 = y * 100;
  s.vx100 = 0;
  s.vy100 = 0;
  s.lands += 1;
  if (y < s.lastGroundY) {
    s.falls += 1;
    s.fellUnits += s.lastGroundY - y;
  }
  s.lastGroundY = y;
  if (y > s.maxY) s.maxY = y;
  const b = bandIndexFor(y);
  if (b > s.bandTop) s.bandTop = b;
}

// ── the demo brain (scripted showcase; deterministic pure fn of state) ──────

/** Full-charge hops aimed at the nearest ledge above the current stance
 * (center to center, aim clamped). It climbs the on-ramp cleanly and then
 * flails like the rest of us - the attract loop is honest. */
function demoBrain(s: AscentState): SimInput {
  if (s.grounded === 0) return { px: null, py: null, down: false, space: false };
  const y = idiv(s.y100, 100);
  ledgeIdxInRange(y + 1, y + APEX_MAX, scanBuf);
  let px = 0.5;
  if (scanBuf.length > 0) {
    const t = ledgeByIdx(scanBuf[0]);
    const cx = idiv(t.x0 + t.x1, 2);
    const dx = cx - idiv(s.x100, 100);
    const aimWanted = clampInt(Math.round(dx / 3), -100, 100);
    // the inverse of the signed-square aim curve, so the demo's px lands on
    // the aim it intends (raw = sign(a) * round(sqrt(|a| * 100)))
    const raw = Math.sign(aimWanted) * Math.round(Math.sqrt(Math.abs(aimWanted) * 100));
    px = (raw + 100) / 200;
  }
  return { px, py: null, down: true, space: false };
}

// ── step ────────────────────────────────────────────────────────────────────

export function stepAscent(s: AscentState, dt: number, input: SimInput): void {
  void dt; // the contract: one call = one 60th-second frame; s counts frames
  if (s.ended === 1) return;
  s.frame += 1;
  const inp = s.demo ? demoBrain(s) : input;
  const down = inp.down ? 1 : 0;

  if (s.grounded === 1) {
    // slick stone slides first: footing decays even while you aim
    const here = ledgeByIdx(s.ledgeIdx);
    if (here.kind !== 0) {
      const dir = here.kind === 1 ? -1 : 1;
      const slide = idiv(SLIDE100 * (100 - s.grip100), 100);
      s.x100 += dir * slide;
      s.slideF += 1;
      const cx = idiv(s.x100, 100);
      if (cx < here.x0 - TOE || cx > here.x1 + TOE) {
        // slid off the edge: any charge is lost, the fall starts flat
        s.grounded = 0;
        s.ledgeIdx = -1;
        s.charging = 0;
        s.charge = 0;
        s.vx100 = dir * slide;
        s.vy100 = 0;
      }
    }
    if (s.grounded === 1) {
      if (down === 1) {
        s.charging = 1;
        s.charge = Math.min(CHARGE_MAX, s.charge + s.chargeRate100);
        if (inp.px !== null) {
          // SIGNED-SQUARE AIM CURVE: aim = sign(raw) * floor(raw^2 / 100).
          // The centre half of the screen compresses to +/-25 (fine control
          // around straight up); the edges still reach the full +/-100.
          // Integer and deterministic - raw is an int, the square divides out.
          const raw = clampInt(Math.round(inp.px * 200 - 100), -100, 100);
          s.aim = Math.sign(raw) * (((raw * raw) / 100) | 0);
        }
        if (s.charge >= CHARGE_MAX) doJump(s, true); // the full meter fires itself
      } else if (s.charging === 1) {
        if (s.charge >= CHARGE_MIN) doJump(s, false);
        else {
          s.charging = 0; // a fidget tap cancels instead of wasting a hop
          s.charge = 0;
        }
      }
    }
  } else {
    // AIRBORNE: no control (the Foddy law). Gravity, wind, walls, ledges.
    s.vy100 -= G100;
    const yNow = idiv(s.y100, 100);
    const gust = windAt(s.frame, yNow);
    if (gust !== 0) {
      s.vx100 = clampInt(s.vx100 + gust, -VX_CAP100, VX_CAP100);
      s.gustF += 1;
    }
    const prevX100 = s.x100;
    const prevY100 = s.y100;
    s.x100 += s.vx100;
    s.y100 += s.vy100;

    // outer walls always bounce (center +- PLAYER_R)
    const loX = (WALL_L + PLAYER_R) * 100;
    const hiX = (WALL_R - PLAYER_R) * 100;
    if (s.x100 < loX) {
      s.x100 = loX;
      if (s.vx100 < 0) {
        s.vx100 = -idiv(s.vx100 * BOUNCE_PCT, 100);
        s.bounces += 1;
      }
    } else if (s.x100 > hiX) {
      s.x100 = hiX;
      if (s.vx100 > 0) {
        s.vx100 = -idiv(s.vx100 * BOUNCE_PCT, 100);
        s.bounces += 1;
      }
    }

    // authored bounce walls: center-point crossing at this frame's height
    for (const w of BOUNCE_WALLS) {
      const wx100 = w.x * 100;
      const yPx = idiv(s.y100, 100);
      if (yPx < w.y0 || yPx > w.y1) continue;
      if (prevX100 < wx100 && s.x100 >= wx100) {
        s.x100 = wx100 - 100;
        s.vx100 = -idiv(s.vx100 * BOUNCE_PCT, 100);
        s.bounces += 1;
      } else if (prevX100 > wx100 && s.x100 <= wx100) {
        s.x100 = wx100 + 100;
        s.vx100 = -idiv(s.vx100 * BOUNCE_PCT, 100);
        s.bounces += 1;
      }
    }

    // landing sweep: falling only, onto the HIGHEST ledge top crossed this
    // frame whose span holds the center (+- TOE). One-sided platforms: the
    // way up passes clean through.
    if (s.vy100 < 0) {
      if (s.y100 <= 0) {
        s.y100 = 0;
        land(s, -1, 0); // the floor: the full-width reset stance
      } else {
        const yLo = idiv(s.y100, 100);
        const yHi = idiv(prevY100, 100);
        if (yHi >= yLo) {
          ledgeIdxInRange(yLo, yHi, scanBuf);
          const cx = idiv(s.x100, 100);
          let best = -1;
          let bestY = -1;
          for (let i = 0; i < scanBuf.length; i++) {
            const l = ledgeByIdx(scanBuf[i]);
            if (l.y * 100 > prevY100 || l.y * 100 < s.y100) continue;
            if (cx < l.x0 - TOE || cx > l.x1 + TOE) continue;
            if (l.y > bestY) {
              bestY = l.y;
              best = scanBuf[i];
            }
          }
          if (best >= 0) land(s, best, bestY);
        }
      }
    }
  }

  s.prevDown = down;
  if (s.frame >= RUN_FRAMES) s.ended = 1; // the 3-minute law, to the frame
}

// ── score + status ──────────────────────────────────────────────────────────

export function ascentDone(s: AscentState): boolean {
  return s.ended === 1;
}

/** Score = the highest ledge ever stood on, in integer units. Nothing else,
 * ever - not speed, not jumps, not survival (there is no death). */
export function ascentScore(s: AscentState): number {
  return s.maxY;
}

/** Falling never kills and the timer is the only end (harness adapter shape). */
export function ascentDied(): boolean {
  return false;
}

export function ascentSimSecs(s: AscentState): number {
  return s.frame / FPS;
}

export function ascentDetail(s: AscentState): string {
  return (
    `height ${s.maxY} band ${s.bandTop} jumps ${s.jumps} (${s.autoJumps} auto) ` +
    `lands ${s.lands} falls ${s.falls} fell ${s.fellUnits} bounces ${s.bounces} ` +
    `slid ${s.slideF}f gusts ${s.gustF}f`
  );
}
