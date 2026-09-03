/**
 * FIGHT FX STATE (engine doc section 6, screens doc 4.2): the presentation
 * memory the fight viewer diffs the engine's event log into. Shape copied
 * from src/app/s7/games/crypt/fx.ts: page side, pool-preallocated, the frame
 * loop reuses these objects and never allocates, no Pixi import (scene.ts
 * paints from this, FightClient.tsx drives it), and NOTHING here decides an
 * outcome. Every number the viewer shows comes from the engine's state and
 * log; this file only remembers how long ago each thing happened so the
 * tweens can play.
 *
 * THE TUMBLE IS SEEDED FROM THE EVENT FRAME (engine doc 6): a broken part
 * flies on an arc drawn from mulberry32(fnv1a(seed | frame | side | piece))
 * and is integrated in fixed 1/60 s steps from the break, so every viewer,
 * every seek and every replay sees the same tumble and the same resting
 * debris. Math.random() is allowed on this page but is not used here, on
 * purpose.
 *
 * Clocks are in SECONDS of presentation time. Presentation time stops in a
 * hit-stop and slows in the knockout's slow motion; the owner advances it.
 */

import { fnv1a, mulberry32 } from "../_engine/rng";
import { PIECE, PIECE_COUNT, type Piece, type Side } from "../_engine/parts";

// ── clocks (engine doc 6 pacing, screens doc 4.2 moments) ───────────────────

export const TELL_F = 14; // swingT 14..1 is the tell: lean back, glint, tick
export const LUNGE_F = 6; // swingT 6..1: the hop-lunge, impact at 0
export const RECOVER_S = 0.2; // 12 frames hopping back
export const RECOIL_S = 0.12; // 6 px away from the hit, eased back
export const LEAN_S = 0.25; // the dodge lean
export const BLOCK_S = 0.3; // the arm across
export const CRUMB_S = 0.4;
export const SPARK_S = 0.25;
export const SMOKE_S = 1.4;
export const CRACK_S = 0.08; // cracked overlay fade in
export const HIT_STOP_S = 0.12;
export const SHAKE_S = 0.1;
export const SIT_S = 0.4; // the loser sits
export const ARMS_UP_S = 0.6; // the winner's arms up
export const SLOWMO_S = 1.5;
export const SLOWMO_RATE = 0.3;
export const KO_PUNCH_S = 0.3; // camera 1.04 on the KO
export const BLINK_S = 0.8; // the bulbs blink twice
export const CHEER_S = 0.9; // the stands throw arms up
export const BARS_SHOW_S = 2; // every HP bar shows for the first 2 s
export const DEBRIS_LIFE_S = 3; // a tumble is surely at rest by then
export const SHARE_AFTER_S = 1.5; // the Share offer after the KO

/** Debris physics (screens doc 4.2 break), sim px and seconds. */
export const TUMBLE = {
  VX_LO: 260,
  VX_HI: 420,
  VY: -380,
  SPIN_DPS: 540,
  GRAVITY: 1400,
  BOUNCE: 0.35,
  DT: 1 / 60,
} as const;

// ── per side ────────────────────────────────────────────────────────────────

export interface SideFx {
  /** seconds since our last impact frame (the hop back and the follow
   * through); negative = idle */
  recover: number;
  /** 1 when that swing missed: the swinger over-rotates 10 degrees */
  overRotate: number;
  /** seconds since a hit landed on us; negative = idle */
  recoil: number;
  recoilPiece: number;
  /** seconds since we dodged; negative = idle */
  lean: number;
  /** seconds since we blocked; negative = idle */
  block: number;
  blockArm: number;
  /** seconds since one of our parts cracked (the overlay fades in) */
  crack: number;
  crackPiece: number;
  /** seconds since the KO put us down; negative = standing */
  sit: number;
  /** seconds since the KO made us the winner; negative = not yet */
  armsUp: number;
  /** pieces that are gone, PIECE order (1 = broken); mirrors the engine's
   * armor === 0, kept here so the renderer never re-reads the whole log */
  gone: number[];
}

function mkSide(): SideFx {
  return {
    recover: -1,
    overRotate: 0,
    recoil: -1,
    recoilPiece: 0,
    lean: -1,
    block: -1,
    blockArm: PIECE.ARM_R,
    crack: -1,
    crackPiece: 0,
    sit: -1,
    armsUp: -1,
    gone: new Array<number>(PIECE_COUNT).fill(0),
  };
}

// ── pools ───────────────────────────────────────────────────────────────────

export interface Crumb {
  on: boolean;
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** 0 clay crumb, 1 brass spark */
  kind: number;
}

export interface Smoke {
  on: boolean;
  t: number;
  x: number;
  y: number;
  r: number;
  drift: number;
}

export interface Debris {
  on: boolean;
  side: Side;
  piece: Piece;
  /** the seeded stream for this exact break */
  seedKey: number;
  x0: number;
  y0: number;
  /** +1 flies to the right, -1 to the left (away from the hit) */
  dir: number;
  /** the floor line under the bots; the pit's front edge curves up from it
   * toward the sides (an ellipse), so a piece never rests on the rim */
  floorY: number;
  fcx: number;
  fcy: number;
  frx: number;
  fry: number;
  /** seconds since the break */
  t: number;
  /** fixed 1/60 steps integrated so far (deterministic across viewers) */
  steps: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  bounced: number;
  rest: boolean;
}

export interface FightFx {
  /** presentation seconds since the bell */
  time: number;
  /** seconds of hit-stop left; the whole scene freezes while > 0 */
  hitStop: number;
  /** seconds of shake left */
  shake: number;
  shakeAmp: number;
  /** seconds since the KO; negative = the fight is on */
  ko: number;
  /** seconds since the timeout call; negative = not called */
  timeout: number;
  /** seconds of crowd cheer left */
  cheer: number;
  /** presentation seconds since the last swing's tell started, per side */
  tellHeard: [number, number];
  sides: [SideFx, SideFx];
  crumbs: Crumb[];
  smoke: Smoke[];
  debris: Debris[];
}

export function mkFightFx(): FightFx {
  const crumbs: Crumb[] = [];
  for (let i = 0; i < 40; i++) crumbs.push({ on: false, t: 0, x: 0, y: 0, vx: 0, vy: 0, r: 3, kind: 0 });
  const smoke: Smoke[] = [];
  for (let i = 0; i < 6; i++) smoke.push({ on: false, t: 0, x: 0, y: 0, r: 20, drift: 0 });
  const debris: Debris[] = [];
  for (let i = 0; i < 12; i++) {
    debris.push({
      on: false, side: 0, piece: 0, seedKey: 0, x0: 0, y0: 0, dir: 1, floorY: 0, fcx: 0, fcy: 0, frx: 0, fry: 0,
      t: 0, steps: 0, x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, bounced: 0, rest: false,
    });
  }
  return {
    time: 0,
    hitStop: 0,
    shake: 0,
    shakeAmp: 0,
    ko: -1,
    timeout: -1,
    cheer: 0,
    tellHeard: [-1, -1],
    sides: [mkSide(), mkSide()],
    crumbs,
    smoke,
    debris,
  };
}

/** Back to the bell. The owner calls this on a seek before replaying the
 * events up to the target frame. */
export function resetFightFx(fx: FightFx): void {
  fx.time = 0;
  fx.hitStop = 0;
  fx.shake = 0;
  fx.shakeAmp = 0;
  fx.ko = -1;
  fx.timeout = -1;
  fx.cheer = 0;
  fx.tellHeard = [-1, -1];
  fx.sides = [mkSide(), mkSide()];
  for (const c of fx.crumbs) c.on = false;
  for (const s of fx.smoke) s.on = false;
  for (const d of fx.debris) d.on = false;
}

// ── the quantizer (stop-motion feel, engine doc 6) ──────────────────────────

const STEP_FPS = 12;

/** Rig tweens step at 12 fps while effects run at 60: t -> floor(t x 12) / 12. */
export function q12(t: number): number {
  return Math.floor(t * STEP_FPS) / STEP_FPS;
}

/** 0..1 progress of a timer over a life, quantized, clamped. -1 = idle. */
export function stepped(since: number, life: number): number {
  if (since < 0) return -1;
  if (since >= life) return 1;
  return Math.min(1, q12(since) / life);
}

/** the DK ease, cubic-bezier(0.32, 0.72, 0, 1), solved for y at x
 * (copied from _view/bay.ts) */
export function ease(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bx = (t: number) => 3 * 0.32 * t * (1 - t) * (1 - t) + t * t * t;
  const by = (t: number) => 3 * 0.72 * t * (1 - t) * (1 - t) + 3 * t * t * (1 - t) + t * t * t;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 16; i++) {
    t = (lo + hi) / 2;
    if (bx(t) < x) lo = t;
    else hi = t;
  }
  return by(t);
}

// ── spawns (the scene calls these with sim positions) ───────────────────────

export function spawnCrumbs(fx: FightFx, x: number, y: number, dir: number, n: number, kind: number): void {
  // a small fixed fan, so the puff reads the same on every viewer
  const fan = [[-0.6, -1.0], [0.2, -1.3], [0.9, -0.7], [-0.2, -0.5], [0.6, -1.1], [-0.9, -0.9]];
  let placed = 0;
  for (const c of fx.crumbs) {
    if (placed >= n) break;
    if (c.on) continue;
    const f = fan[placed % fan.length];
    c.on = true;
    c.t = 0;
    c.x = x;
    c.y = y;
    c.vx = (f[0] * 160 + dir * 120) * (kind === 1 ? 1.4 : 1);
    c.vy = f[1] * 220;
    c.r = kind === 1 ? 2.5 : 4 + (placed % 3);
    c.kind = kind;
    placed++;
  }
}

export function spawnSmoke(fx: FightFx, x: number, y: number): void {
  let placed = 0;
  for (const s of fx.smoke) {
    if (placed >= 3) break;
    if (s.on) continue;
    s.on = true;
    s.t = -placed * 0.12;
    s.x = x + (placed - 1) * 26;
    s.y = y;
    s.r = 22 + placed * 6;
    s.drift = (placed - 1) * 14;
    placed++;
  }
}

/** One stream per break, keyed by the fight seed and the event frame. */
export function tumbleKey(fightSeed: number, frame: number, side: Side, piece: Piece): number {
  return fnv1a(`${fightSeed >>> 0}|tumble|${frame}|${side}|${piece}`);
}

/** The pit floor's front edge as an ellipse (sim px); rx 0 = a flat floor. */
export interface PitFloor {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** the floor under a piece at x: the flat line near the middle, the pit's
 * curved front edge toward the sides */
export function floorAt(d: Debris, x: number): number {
  if (d.frx <= 0) return d.floorY;
  const k = (x - d.fcx) / d.frx;
  const inside = 1 - k * k;
  if (inside <= 0) return d.fcy;
  return Math.min(d.floorY, d.fcy + d.fry * Math.sqrt(inside));
}

export function spawnDebris(
  fx: FightFx,
  side: Side,
  piece: Piece,
  seedKey: number,
  x0: number,
  y0: number,
  dir: number,
  floorY: number,
  floor: PitFloor = { cx: 0, cy: 0, rx: 0, ry: 0 },
): Debris | null {
  for (const d of fx.debris) {
    if (d.on) continue;
    const rng = mulberry32(seedKey);
    d.on = true;
    d.side = side;
    d.piece = piece;
    d.seedKey = seedKey;
    d.x0 = x0;
    d.y0 = y0;
    d.dir = dir;
    d.floorY = floorY;
    d.fcx = floor.cx;
    d.fcy = floor.cy;
    d.frx = floor.rx;
    d.fry = floor.ry;
    d.t = 0;
    d.steps = 0;
    d.x = x0;
    d.y = y0;
    d.vx = dir * (TUMBLE.VX_LO + Math.floor(rng() * (TUMBLE.VX_HI - TUMBLE.VX_LO)));
    d.vy = TUMBLE.VY - Math.floor(rng() * 60);
    d.rot = 0;
    d.spin = dir * (TUMBLE.SPIN_DPS * (0.8 + rng() * 0.4)) * (Math.PI / 180);
    d.bounced = 0;
    d.rest = false;
    return d;
  }
  return null;
}

/** Integrate the tumble to its clock in fixed steps: one bounce on the pit
 * floor at 0.35, then it rests as debris. Same steps, same numbers, on every
 * machine. */
export function integrateDebris(d: Debris): void {
  if (!d.on || d.rest) return;
  const want = Math.min(Math.floor(d.t / TUMBLE.DT), Math.floor(DEBRIS_LIFE_S / TUMBLE.DT));
  while (d.steps < want && !d.rest) {
    d.vy += TUMBLE.GRAVITY * TUMBLE.DT;
    d.x += d.vx * TUMBLE.DT;
    d.y += d.vy * TUMBLE.DT;
    d.rot += d.spin * TUMBLE.DT;
    const floor = floorAt(d, d.x);
    if (d.y >= floor) {
      d.y = floor;
      if (d.bounced === 0 && d.vy > 120) {
        d.bounced = 1;
        d.vy = -d.vy * TUMBLE.BOUNCE;
        d.vx *= 0.5;
        d.spin *= 0.5;
      } else {
        d.rest = true;
        d.vx = 0;
        d.vy = 0;
        // a resting piece lies on its side, a quarter turn from where it was
        d.rot = Math.round(d.rot / (Math.PI / 2)) * (Math.PI / 2) + d.dir * 0.35;
      }
    }
    d.steps += 1;
  }
  if (d.steps >= Math.floor(DEBRIS_LIFE_S / TUMBLE.DT)) d.rest = true;
}

// ── the clock ───────────────────────────────────────────────────────────────

/** Advance every timer by dt seconds of presentation time. The owner has
 * already decided dt (zero in a hit-stop, slowed in the KO slow motion). */
export function tickFightFx(fx: FightFx, dt: number): void {
  fx.time += dt;
  if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt);
  if (fx.cheer > 0) fx.cheer = Math.max(0, fx.cheer - dt);
  if (fx.ko >= 0) fx.ko += dt;
  if (fx.timeout >= 0) fx.timeout += dt;
  for (const s of fx.sides) {
    if (s.recover >= 0) s.recover += dt;
    if (s.recoil >= 0) s.recoil += dt;
    if (s.lean >= 0) s.lean += dt;
    if (s.block >= 0) s.block += dt;
    if (s.crack >= 0) s.crack += dt;
    if (s.sit >= 0) s.sit += dt;
    if (s.armsUp >= 0) s.armsUp += dt;
    // timers that ran out go idle so the pose math never sees stale ones
    if (s.recover > RECOVER_S) s.recover = -1;
    if (s.recoil > RECOIL_S) s.recoil = -1;
    if (s.lean > LEAN_S) s.lean = -1;
    if (s.block > BLOCK_S) s.block = -1;
  }
  for (const c of fx.crumbs) {
    if (!c.on) continue;
    c.t += dt;
    if (c.t >= CRUMB_S) {
      c.on = false;
      continue;
    }
    c.vy += 900 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
  }
  for (const s of fx.smoke) {
    if (!s.on) continue;
    s.t += dt;
    if (s.t >= SMOKE_S) s.on = false;
  }
  for (const d of fx.debris) {
    if (!d.on) continue;
    d.t += dt;
    integrateDebris(d);
  }
}

/** Everything at its end state: a settled frame for prefers-reduced-motion
 * and for a seek that lands well past an event. */
export function settleFightFx(fx: FightFx): void {
  fx.hitStop = 0;
  fx.shake = 0;
  fx.cheer = 0;
  if (fx.ko >= 0) fx.ko = Math.max(fx.ko, SLOWMO_S + SHARE_AFTER_S + 1);
  for (const s of fx.sides) {
    s.recover = -1;
    s.recoil = -1;
    s.lean = -1;
    s.block = -1;
    if (s.crack >= 0) s.crack = CRACK_S + 1;
    if (s.sit >= 0) s.sit = Math.max(s.sit, SIT_S + 1);
    if (s.armsUp >= 0) s.armsUp = Math.max(s.armsUp, ARMS_UP_S + 1);
  }
  for (const c of fx.crumbs) c.on = false;
  for (const s of fx.smoke) s.on = false;
  for (const d of fx.debris) {
    if (!d.on) continue;
    d.t = DEBRIS_LIFE_S;
    integrateDebris(d);
  }
}
