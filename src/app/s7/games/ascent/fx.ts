/**
 * ASCENT FX STATE - the presentation-memory containers the clients diff sim
 * state into (the crypt/gauntlet pattern). Everything here is page-side and
 * pool-preallocated: the frame loop reuses these objects and never
 * allocates. Math.random is allowed HERE and nowhere near the sim - and the
 * ascent sim carries no RNG at all, so the split is trivially clean.
 *
 * The theater vocabulary: landing dust + a thud ring scaled by the fall,
 * the class-accent air trail (the ONLY thing class flavor touches, per the
 * spec), wind streaks that mirror windAt() exactly, band banners on the
 * palette transitions, floats for new-best height and long falls, and a
 * shake that only big falls earn.
 */

// ── clocks ──────────────────────────────────────────────────────────────────

export const DUST_S = 0.5;      // landing dust puff life
export const THUD_S = 0.35;     // landing ring life
export const TRAIL_S = 0.45;    // air-trail point life
export const STREAK_S = 0.4;    // wind streak life
export const FLOAT_S = 1.1;
export const BANNER_S = 2.6;    // band banner hold (drawBanner eases in/out)

/** A fall this tall (units) earns shake + the FELL float; smaller landings
 * just puff dust. */
export const BIG_FALL = 400;

// ── pools (preallocated; the frame loop never allocates) ────────────────────

export interface DustFx {
  on: boolean;
  t: number;
  x: number;
  y: number; // world y (draw projects through the camera)
  vx: number;
  vy: number;
  r: number;
}

export interface TrailFx {
  on: boolean;
  t: number;
  x: number;
  y: number;
}

export interface StreakFx {
  on: boolean;
  t: number;
  x: number;
  y: number;
  len: number;
  dir: number; // -1 | 1, matches the gust
}

export interface FloatFx {
  on: boolean;
  t: number;
  x: number;
  y: number; // world y
  text: string;
  color: string;
  big: boolean;
}

export interface ThudFx {
  t: number; // >= THUD_S = idle
  x: number;
  y: number;
  power: number; // 0..1, scaled by the fall
}

export interface Fx {
  time: number;
  shake: number;
  shakeAmp: number;
  banner: { text: string; sub: string; t: number; color: string };
  thud: ThudFx;
  dusts: DustFx[];
  trail: TrailFx[];
  streaks: StreakFx[];
  floats: FloatFx[];
  /** page-side camera (world y at the bottom of the view), smoothed */
  camY: number;
  camInit: boolean;
  /** fx.time when the storm rain gate last opened; -1 while closed. The
   * renderer owns this clock (draw.ts ramps the rain count 0->22 over ~2s
   * of band presence instead of popping); it resets whenever the camera
   * leaves the storm gate so re-entry ramps again. */
  rainOnAt: number;
}

export function mkFx(): Fx {
  return {
    time: 0,
    shake: 0,
    shakeAmp: 0,
    banner: { text: "", sub: "", t: 0, color: "#f0b340" },
    thud: { t: 99, x: 0, y: 0, power: 0 },
    dusts: Array.from({ length: 24 }, () => ({ on: false, t: 0, x: 0, y: 0, vx: 0, vy: 0, r: 2 })),
    trail: Array.from({ length: 40 }, () => ({ on: false, t: 0, x: 0, y: 0 })),
    streaks: Array.from({ length: 26 }, () => ({ on: false, t: 0, x: 0, y: 0, len: 40, dir: 1 })),
    floats: Array.from({ length: 8 }, () => ({ on: false, t: 0, x: 0, y: 0, text: "", color: "#fff", big: false })),
    camY: 0,
    camInit: false,
    rainOnAt: -1,
  };
}

// ── the pre-step snapshot the delta engine diffs against ────────────────────

export interface Prev {
  inited: boolean;
  y: number;         // world y (units)
  grounded: number;
  charging: number;
  maxY: number;
  lastGroundY: number;
  jumps: number;
  lands: number;
  falls: number;
  fellUnits: number;
  bounces: number;
  bandTop: number;
  band: number;      // band the climber currently STANDS in (banner edge)
  ended: number;
}

export function mkPrev(): Prev {
  return {
    inited: false,
    y: 0,
    grounded: 1,
    charging: 0,
    maxY: 0,
    lastGroundY: 0,
    jumps: 0,
    lands: 0,
    falls: 0,
    fellUnits: 0,
    bounces: 0,
    bandTop: 0,
    band: 0,
    ended: 0,
  };
}

// ── page-fx stream (the fx-RNG split law: never a sim stream) ───────────────

/** Tiny LCG for page-side jitter, the crypt idiom. */
export function mkLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
