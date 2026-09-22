/**
 * SEASON 4 · THE GETAWAY — a 70 second GTA2-style top-down city escape.
 * Agency/hitman era, night. The job is done, the whole precinct wants the
 * bounty, and the city is a grid: building blocks, two-lane streets, and the
 * narrow alleys that save your life. Hit the glowing markers (the extraction
 * route) and reach the final one before the clock; patrol cars hunt you the
 * whole way.
 *
 * THE CITY (all procedural from the run seed, nothing replayable):
 * a GW x GH grid of rectangular blocks with varied footprints separated by
 * 2-lane streets (every third street is a MAJOR with double gold lines,
 * where roadblocks land at max heat). Most blocks are cut by a one-car-wide
 * ALLEY, the escape verb: patrol cars are too clumsy to follow, they
 * overshoot the mouth or clip the corner and spin out (cartoon stars, a
 * scored DROP). Alley entrances carry a subtle gold edge glow so they read
 * at speed. Rooftops draw OFFSET from their footprints by a per-building
 * parallax factor (GTA2's trick) so the skyline pops without a 3D engine;
 * rooftop vents, AC boxes, water towers and neon edges sell the aerial view.
 *
 * HEAT (the GTA stars, 1..5):
 * while any patrol has line of sight you are SPOTTED and heat climbs (one
 * star per ~7 seconds seen); clipping traffic or a roadblock bumps it too.
 * Thread an alley (or a smoke cloud, smoke blocks sight lines) and hold no
 * line of sight for ~3 seconds and heat falls a star, banking a GHOSTED
 * bonus. Heat sets the patrol budget and their speed; at 5 stars roadblocks
 * spawn on the majors ahead of you. Heat is also the risk/reward dial: every
 * checkpoint / drop / near-miss banks at x(1 + 0.2 x (heat - 1)).
 *
 * CONTROLS (the franchise mobile lesson, unchanged from the rally kit):
 * keyboard = A/D or arrows to steer, space = drop gadget. Touch = PRESS AND
 * HOLD where you want to go (the car turns toward the finger; the camera
 * never rotates so a screen angle IS a world angle) and a QUICK TAP anywhere
 * (<0.28s, <14px movement) = drop the gadget, ALTERNATING smoke then oil.
 * The on-canvas gadget dial is display-only. The speaker icon at the top
 * left toggles sound (taps there never drop a gadget).
 *
 * STAT BASELINE (bounded, ADR-0004; the numbers live in STAT_EFFECTS.getaway
 * in lib/s4/games.ts, the one shared place stat math is defined):
 *   botox   (Armor)   = PIT resistance (nudges cost less speed + jolt)
 *   drugs   (Ride)    = top speed
 *   ozempic (Gadgets) = handling / turn rate
 *   aura    (Weapon)  = gadget potency (smoke/oil radius)
 *
 * SCORE = checkpoints (500 x heat mult, 7 + the extraction) + patrols
 * dropped (600 x mult; gadget spins AND alley-juke corner clips both count)
 * + near misses (150 x mult) + GHOSTED heat drops (200) + hydrant bursts
 * (50, pure fun) + the extraction (3000 + 45 x seconds left). A strong run
 * lands ~9,000-14,000 (registry: maxScore 16000, toCredits s/140, floorMs
 * 30000, attempts 3). DNF banks everything collected.
 *
 * ART (CMO gate): everything draws as layered procedural vectors now; hero
 * sprites swap in by asset name once real art lands under
 * /public/s4-art/games/getaway/ (try-image-else-vector, hydration-safe):
 *   player.png   (agency-era getaway coupe, top-down, facing RIGHT)
 *   patrol.png   (patrol car with a light bar, top-down, facing RIGHT)
 *   traffic.png  (civilian sedan, top-down, facing RIGHT)
 *   smoke.png    (one smoke puff, drawn 3x per cloud at offsets)
 *   oil.png      (oil slick patch, roughly round)
 *
 * JUICE: siren light splash on the ground and wall bases, headlight cones,
 * streetlight pools, optional rain with wet-street light streaks, cartoon
 * spin-outs with dizzy stars, 50ms hit-stop, skid marks, hydrant geysers,
 * screenshake and film grain (all reduced-motion gated). The camera leads
 * along velocity and breathes with speed; it NEVER rotates.
 *
 * PRACTICE: /s4/games/getaway?practice=1 runs with zero server calls. In
 * practice the live state object is exposed as window.__getaway so a
 * scripted browser probe can verify the sim (teleport into an alley, watch
 * heat fall, etc.). Never set outside practice.
 */
"use client";

import { useEffect, useState } from "react";
import { GameShell, type GameHandle } from "../_shared/engine";
import { ACCENT } from "../_shared/shared";
import { createSfx, type Sfx } from "../_shared/sfx";
import { STAT_EFFECTS } from "@/lib/s4/games";

// ---- tuning -----------------------------------------------------------------
const RUN_SECONDS = 70; // the escape clock (DNF banks the score)
const COUNT = 2.4; // countdown before GO
const GW = 7; // city blocks across
const GH = 7; // city blocks down
const STREET_W = 104; // 2-lane street
const MAJOR_W = 132; // every 3rd street; roadblocks live here
const ALLEY_W = 46; // ONE car wide (player r=11 leaves ~12px a side)
const SIDEWALK = 13; // building inset from the block edge
const LANE = 26; // lane-center offset for traffic / hunting patrols
const BASE_TOP = 252; // px/s before Ride (drugs)
const ACCEL = 330;
const TURN = 2.5; // rad/s before Gadgets (ozempic)
const GRIP_DRY = 7.0; // rally grip model: lower = driftier
const GRIP_RAIN = 6.3;
const LEAD = 88; // camera looks ahead along the velocity
const CAM_LERP = 5.2;
const ZOOM_HI = 1.14; // camera breathes out with speed (never rotates)
const ZOOM_LO = 0.94;
const PLAYER_R = 11;
const GADGET_CD = 2.4; // seconds between drops (alternating smoke/oil)
const SMOKE_R = 34; // base radius before Weapon (aura) scaling
const SMOKE_LIFE = 2.8;
const OIL_R = 24;
const OIL_LIFE = 7;
const PIT_RANGE = 26; // patrol contact distance for a PIT nudge
const PIT_CD = 2.0; // per-patrol nudge cooldown
const PIT_SPEED_LOSS = 0.32; // fraction of speed a nudge costs, before Armor
const HIT_IFRAMES = 1.1;
const NEAR_IN = 40; // enter the near-miss bubble
const NEAR_OUT = 64; // leave it clean to bank the whoosh
const CP_R = 55; // checkpoint marker ring radius (drive through it)
const CP_SCORE = 500;
const DROP_SCORE = 600;
const NEAR_SCORE = 150;
const GHOST_SCORE = 200; // shedding a heat star (flat, no multiplier)
const HYDRANT_SCORE = 50; // pure fun
const ESCAPE_SCORE = 3000;
const TIME_BONUS = 45; // per second left at the extraction
const HEAT_MAX = 5;
const HEAT_SEEN_UP = 7; // seconds of being SPOTTED per star gained
const HEAT_CLIP = 3; // clipping traffic adds this many seen-seconds
const HEAT_DROP_SECS = 3; // unseen this long = shed a star
const SIGHT = 620; // patrol line-of-sight range
const COP_TURN_HUNT = 3.4; // street-nav steering, rad/s
const COP_TURN_PURSUIT = 2.6;
const COP_TURN_OVERSHOOT = 1.15; // clumsy: THIS is why alleys work
const WALL_SPIN_SPEED = 170; // a pursuing patrol over this into a wall spins
// PATROL BUDGET (Mike's playtest: "needs more cop spawns when one is destroyed;
// you go a long time without seeing cops"). Active hunters = heat + bonus, with
// a floor of 2 so you are rarely alone once heat >= 1, capped so max heat is
// pressure not a death squad. A dropped unit's replacement rolls in fast.
const COP_BUDGET_BONUS = 1; // active target = heat + this
const COP_BUDGET_FLOOR = 2; // ...but never fewer than this while the run is live
const COP_BUDGET_CAP = 5; // ...and never more than the old heat-5 max
const COP_REINFORCE_CD = 1.4; // a lost patrol is backfilled this fast (was a 2.2s trickle)
const COP_CALLOFF_CD = 2.6; // when heat falls, units peel off no faster than this (gentle, 1 at a time)
const COP_SPAWN_MIN = 400; // spawn ring: closer than before (was 520) so reinforcements are seen sooner
const COP_SPAWN_MAX = 820; // ...but still off-screen past the vignette (was 1150)
const ROOF_K = 0.055; // rooftop parallax factor (x per-building height)
const CIV_COUNT = 7; // ambient traffic near the player
const RB_LIFE = 12; // roadblock lifetime, seconds
const RB_CD = 7; // seconds between roadblock spawns at max heat
const SKID_CAP = 170;
const PART_CAP = 220;
const FLOAT_CAP = 24;
const TAP_MAX_T = 0.28; // quick tap = gadget (the proven numbers)
const TAP_MAX_MOVE = 14;
const MUTE_KEY = "s4_getaway_muted";
// Respect prefers-reduced-motion: shake, dense spray, grain flicker are gated
// (evaluated once at module load; SSR-safe via the typeof guard).
const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- the noir palette (charcoal + ice + crimson accents) ----------------------
const CHARCOAL = "#07080c";
const ASPHALT = "#101219";
const ASPHALT2 = "#0b0d13";
const SIDEWALK_C = "#171b24";
const ALLEY_C = "#0c0e15";
const WALL = "#0d0f16";
const INK = "#14161c";
const ICE = "#4dd8e6";
const CRIMSON = "#e33d4e";
const GOLD = ACCENT; // #f0b340: alley glow, markers, the getaway car's shine
const CREAM = "#f2e3c2";
const STEEL = "#8b95ad";
const WHITE = "#ffffff";
const ROOF_TONES = ["#161923", "#131722", "#1a1d26", "#181a20", "#141821", "#1c1916"];
const CIV_TONES = ["#39424f", "#4a3f36", "#2f4a41", "#513f4e", "#44464f", "#553a30"];
const DISTRICTS = ["DOCKSIDE", "THE OLD QUARTER", "NEON MILE", "CANAL WARD", "THE STACKS", "MIDTOWN GRID"];

// ---- stats -> in-game synergy (ADR-0004 pattern, bounded <= ~25%) -------------
// The shared registry entry: nothing else may define stat math.
const E = STAT_EFFECTS.getaway;

// ---- sfx (S4 shared kit; created after the Start click = a user gesture) -------
let sfxInst: Sfx | null = null;
function sfx(): Sfx {
  if (!sfxInst) {
    sfxInst = createSfx(true);
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1") sfxInst.setMuted(true);
    } catch {
      // storage can be unavailable; default (sound on) is fine
    }
  }
  return sfxInst;
}
function toggleMute() {
  const m = !sfx().muted();
  sfx().setMuted(m);
  try {
    window.localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    // non-fatal
  }
  if (!m) sfx().play("tap");
}

// ---- art hooks (post-CMO sprites swap in by name; vectors until then) ----------
function img(src: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const i = new Image();
  i.src = src;
  return i;
}
const ART: Record<string, HTMLImageElement | null> = {
  player: img("/s4-art/games/getaway/player.png"),
  patrol: img("/s4-art/games/getaway/patrol.png"),
  traffic: img("/s4-art/games/getaway/traffic.png"),
  smoke: img("/s4-art/games/getaway/smoke.png"),
  oil: img("/s4-art/games/getaway/oil.png"),
};
function ready(i: HTMLImageElement | null): i is HTMLImageElement {
  return !!i && i.complete && i.naturalWidth > 0;
}
/** Draw a sprite rotated to ang (art faces RIGHT), else the vector fallback. */
function sprRot(
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement | null,
  x: number,
  y: number,
  ang: number,
  size: number,
  fb: () => void,
) {
  if (ready(im)) {
    const h = size * (im.naturalHeight / im.naturalWidth);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.drawImage(im, -size / 2, -h / 2, size, h);
    ctx.restore();
  } else fb();
}

// ---- math ----------------------------------------------------------------------
function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function wrap(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
/** Steer heading toward target angle at a bounded rate; returns new heading. */
function turnToward(heading: number, target: number, maxStep: number): number {
  const d = wrap(target - heading);
  return heading + clamp(d, -maxStep, maxStep);
}
/** All run randomness flows from ONE mulberry32 stream (per-run procedural
 *  chaos, nothing replayable). The engine's RunContext does not expose the run
 *  nonce, so the seed mixes clock + Math.random like the rally donor; hashStr
 *  is here so the seed can switch to the nonce the day RunContext carries it. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** Deterministic 2D hash 0..1 for textures (no per-frame RNG, no flicker). */
function hash2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

// ---- geometry -------------------------------------------------------------------
interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** Does the segment (a,b) touch the rect? Slab test, endpoints-inside first. */
function segHitsRect(ax: number, ay: number, bx: number, by: number, r: Rect): boolean {
  if (Math.max(ax, bx) < r.x0 || Math.min(ax, bx) > r.x1) return false;
  if (Math.max(ay, by) < r.y0 || Math.min(ay, by) > r.y1) return false;
  if (ax > r.x0 && ax < r.x1 && ay > r.y0 && ay < r.y1) return true;
  const dx = bx - ax;
  const dy = by - ay;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < r.x0 || ax > r.x1) return false;
  } else {
    let ta = (r.x0 - ax) / dx;
    let tb = (r.x1 - ax) / dx;
    if (ta > tb) [ta, tb] = [tb, ta];
    tmin = Math.max(tmin, ta);
    tmax = Math.min(tmax, tb);
  }
  if (Math.abs(dy) < 1e-9) {
    if (ay < r.y0 || ay > r.y1) return false;
  } else {
    let ta = (r.y0 - ay) / dy;
    let tb = (r.y1 - ay) / dy;
    if (ta > tb) [ta, tb] = [tb, ta];
    tmin = Math.max(tmin, ta);
    tmax = Math.min(tmax, tb);
  }
  return tmin <= tmax;
}
/** Distance from point p to segment (a,b) — smoke clouds block sight lines. */
function segPointDist(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
/** Circle-vs-AABB resolve: where to put the circle + the outward normal.
 *  Null when clear. Callers wall-slide: kill only the normal velocity. */
function collideRect(
  px: number,
  py: number,
  r: number,
  rc: Rect,
): { x: number; y: number; nx: number; ny: number } | null {
  const cx = clamp(px, rc.x0, rc.x1);
  const cy = clamp(py, rc.y0, rc.y1);
  let dx = px - cx;
  let dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    dx /= d;
    dy /= d;
    return { x: cx + dx * r, y: cy + dy * r, nx: dx, ny: dy };
  }
  // center inside the rect: push out along the closest face
  const l = px - rc.x0;
  const ri = rc.x1 - px;
  const t = py - rc.y0;
  const bo = rc.y1 - py;
  const m = Math.min(l, ri, t, bo);
  if (m === l) return { x: rc.x0 - r, y: py, nx: -1, ny: 0 };
  if (m === ri) return { x: rc.x1 + r, y: py, nx: 1, ny: 0 };
  if (m === t) return { x: px, y: rc.y0 - r, nx: 0, ny: -1 };
  return { x: px, y: rc.y1 + r, nx: 0, ny: 1 };
}

// ---- city types ------------------------------------------------------------------
interface Street {
  c: number; // centerline coordinate (x for vertical, y for horizontal)
  w: number;
  major: boolean;
}
interface RoofDetail {
  kind: "vent" | "ac" | "hatch" | "tower" | "skylight";
  u: number; // 0..1 across the roof
  v: number;
  s: number; // size seed
}
interface Building extends Rect {
  tone: number; // ROOF_TONES index
  hf: number; // height factor: scales the rooftop parallax offset
  neonSide: number; // -1 = none, else 0..3 (top/right/bottom/left roof edge)
  neonCol: string;
  details: RoofDetail[];
  seed: number; // window hash seed
}
interface Alley extends Rect {
  horiz: boolean; // corridor runs left-right?
}
interface Hydrant {
  x: number;
  y: number;
  burst: number; // geyser seconds left after the player pops it
  done: boolean;
}
interface Parked {
  x: number;
  y: number;
  ang: number;
  tone: number;
  hitCd: number;
  nearArmed: boolean;
  nearDone: boolean;
}
interface CP {
  x: number;
  y: number;
  i: number;
  j: number;
  taken: boolean;
  final: boolean;
}
interface Drop {
  kind: "smoke" | "oil";
  x: number;
  y: number;
  r: number; // effective radius (Weapon-scaled at drop time)
  age: number;
  life: number;
}
interface Skid {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
  r: number;
}
interface Floater {
  x: number;
  y: number;
  txt: string;
  c: string;
  life: number;
}
type CopMode = "hunt" | "pursuit" | "overshoot" | "spin" | "gone";
interface Cop {
  x: number;
  y: number;
  heading: number;
  speed: number;
  mode: CopMode;
  modeT: number;
  ni: number; // hunt waypoint node (street lattice)
  nj: number;
  pi: number; // previous node (no instant backtracking)
  pj: number;
  lastX: number; // player's last SEEN position (the overshoot target)
  lastY: number;
  bumpCd: number;
  wallCd: number;
  spinA: number;
  alpha: number;
  nearFlag: boolean;
  nearDirty: boolean;
  nearCd: number;
  ph: number; // light-bar strobe phase
}
interface Civ {
  x: number;
  y: number;
  heading: number;
  speed: number;
  want: number;
  ni: number;
  nj: number;
  pi: number;
  pj: number;
  tone: number;
  hitCd: number;
  nearFlag: boolean;
  nearCd: number;
  jolt: number; // clipped-by-the-player wobble
}
interface RoadblockCar {
  ox: number;
  oy: number;
  ang: number;
}
interface Roadblock {
  x: number; // center of the blocked street
  y: number;
  horiz: boolean; // barrier line runs left-right (blocks a VERTICAL street)
  life: number;
  circles: { ox: number; oy: number; r: number }[];
  cars: RoadblockCar[];
  gapSide: number; // -1 | 1: which end has the threadable gap
  armedSign: number; // 0 until the player approaches; then sign of "along"
  hit: boolean;
  threaded: boolean;
}

// ---- state ---------------------------------------------------------------------
interface S {
  rng: () => number;
  practice: boolean;
  rainy: boolean;
  district: string;
  // city
  cityW: number;
  cityH: number;
  vs: Street[]; // vertical streets, left to right (GW+1)
  hs: Street[]; // horizontal streets, top to bottom (GH+1)
  blocks: Rect[];
  buildings: Building[];
  alleys: Alley[];
  lamps: { x: number; y: number }[];
  hydrants: Hydrant[];
  parked: Parked[];
  cps: CP[];
  cpIdx: number; // current marker in the extraction route
  // stat baseline (bounded by STAT_EFFECTS.getaway at init)
  topSpeed: number;
  turnMul: number;
  resist: number;
  gadgetMul: number;
  // player
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  eng: number;
  iframes: number;
  slipT: number; // sliding on your own oil (heading drifts)
  gadgetCd: number;
  nextGadget: "smoke" | "oil";
  lastSpace: boolean;
  lastDown: boolean;
  downAt: number;
  downX: number;
  downY: number;
  downMoved: boolean;
  prevRX: number; // previous rear-axle point for skid segments
  prevRY: number;
  // heat + pursuit
  heat: number;
  seenT: number; // seconds of accumulated SPOTTED time toward the next star
  noSeeT: number; // seconds with zero line of sight (3s = shed a star)
  anySight: boolean;
  heatFlash: number;
  cops: Cop[];
  spawnT: number;
  rbT: number; // roadblock spawn cooldown
  roadblocks: Roadblock[];
  civs: Civ[];
  // world entities
  drops: Drop[];
  skids: Skid[];
  parts: Particle[];
  floats: Floater[];
  // camera
  camX: number;
  camY: number;
  zoom: number;
  // run
  t: number; // total time incl. countdown
  started: boolean; // GO fired
  score: number;
  cpGot: number;
  dropsGot: number;
  nearMisses: number;
  ghosted: number;
  escaped: boolean;
  finishT: number;
  over: boolean;
  freezeT: number; // hit-stop
  shake: number;
  msg: string;
  msgT: number;
}

// ---- fx + scoring helpers ----------------------------------------------------------
function burst(s: S, x: number, y: number, c: string, n: number, sp: number) {
  const cap = REDUCED_MOTION ? PART_CAP / 3 : PART_CAP;
  for (let i = 0; i < n && s.parts.length < cap; i++) {
    const a = s.rng() * Math.PI * 2;
    const v = sp * (0.4 + s.rng() * 0.8);
    s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + s.rng() * 0.4, c, r: 1.5 + s.rng() * 2.5 });
  }
}
function float(s: S, x: number, y: number, txt: string, c: string) {
  if (s.floats.length < FLOAT_CAP) s.floats.push({ x, y, txt, c, life: 0.95 });
}
/** The heat dial IS the score multiplier: x1.0 at one star up to x1.8 at five. */
function heatMult(s: S): number {
  return 1 + 0.2 * (s.heat - 1);
}
/** Bank a heat-scaled score event; returns what it actually paid. */
function award(s: S, base: number): number {
  const v = Math.round(base * heatMult(s));
  s.score += v;
  return v;
}

// ---- city generation ----------------------------------------------------------------
function nodeX(s: S, i: number): number {
  return s.vs[i].c;
}
function nodeY(s: S, j: number): number {
  return s.hs[j].c;
}
function nearestNodeI(s: S, x: number): number {
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < s.vs.length; i++) {
    const d = Math.abs(x - s.vs[i].c);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}
function nearestNodeJ(s: S, y: number): number {
  let bj = 0;
  let bd = Infinity;
  for (let j = 0; j < s.hs.length; j++) {
    const d = Math.abs(y - s.hs[j].c);
    if (d < bd) {
      bd = d;
      bj = j;
    }
  }
  return bj;
}

function buildCity(s: S) {
  // seed: clock + Math.random mixed through hashStr (see mulberry32 note)
  const rng = mulberry32(hashStr(`${Date.now().toString(36)}:${Math.random()}`));
  s.rng = rng;
  s.district = DISTRICTS[Math.floor(rng() * DISTRICTS.length) % DISTRICTS.length];
  s.rainy = rng() < 0.5;

  // ── streets + blocks: alternating street / block spans on each axis ──────
  const colW: number[] = [];
  const rowH: number[] = [];
  for (let i = 0; i < GW; i++) colW.push(250 + rng() * 170);
  for (let j = 0; j < GH; j++) rowH.push(230 + rng() * 150);
  s.vs = [];
  s.hs = [];
  const blockX: number[] = [];
  const blockY: number[] = [];
  let x = 0;
  for (let i = 0; i <= GW; i++) {
    const major = i % 3 === 1;
    const w = major ? MAJOR_W : STREET_W;
    s.vs.push({ c: x + w / 2, w, major });
    x += w;
    if (i < GW) {
      blockX.push(x);
      x += colW[i];
    }
  }
  s.cityW = x;
  let y = 0;
  for (let j = 0; j <= GH; j++) {
    const major = j % 3 === 1;
    const w = major ? MAJOR_W : STREET_W;
    s.hs.push({ c: y + w / 2, w, major });
    y += w;
    if (j < GH) {
      blockY.push(y);
      y += rowH[j];
    }
  }
  s.cityH = y;

  // ── blocks -> buildings + the alley cuts ─────────────────────────────────
  s.blocks = [];
  s.buildings = [];
  s.alleys = [];
  s.hydrants = [];
  const mkBuilding = (r: Rect): Building => ({
    ...r,
    tone: Math.floor(rng() * ROOF_TONES.length) % ROOF_TONES.length,
    hf: 0.55 + rng() * 0.9,
    neonSide: rng() < 0.34 ? Math.floor(rng() * 4) % 4 : -1,
    neonCol: [CRIMSON, ICE, GOLD][Math.floor(rng() * 3) % 3],
    details: buildRoofDetails(rng),
    seed: Math.floor(rng() * 1e9),
  });
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const bl: Rect = { x0: blockX[i], y0: blockY[j], x1: blockX[i] + colW[i], y1: blockY[j] + rowH[j] };
      s.blocks.push(bl);
      const inner: Rect = { x0: bl.x0 + SIDEWALK, y0: bl.y0 + SIDEWALK, x1: bl.x1 - SIDEWALK, y1: bl.y1 - SIDEWALK };
      // ~62% of blocks are cut by a one-car alley (the escape verb). The cut
      // runs the FULL block depth so both mouths open onto streets.
      if (rng() < 0.62) {
        const horiz = rng() < 0.5;
        if (horiz) {
          const ay = inner.y0 + 56 + rng() * (inner.y1 - inner.y0 - 112 - ALLEY_W);
          s.alleys.push({ x0: bl.x0, y0: ay, x1: bl.x1, y1: ay + ALLEY_W, horiz: true });
          s.buildings.push(mkBuilding({ x0: inner.x0, y0: inner.y0, x1: inner.x1, y1: ay }));
          s.buildings.push(mkBuilding({ x0: inner.x0, y0: ay + ALLEY_W, x1: inner.x1, y1: inner.y1 }));
        } else {
          const ax = inner.x0 + 56 + rng() * (inner.x1 - inner.x0 - 112 - ALLEY_W);
          s.alleys.push({ x0: ax, y0: bl.y0, x1: ax + ALLEY_W, y1: bl.y1, horiz: false });
          s.buildings.push(mkBuilding({ x0: inner.x0, y0: inner.y0, x1: ax, y1: inner.y1 }));
          s.buildings.push(mkBuilding({ x0: ax + ALLEY_W, y0: inner.y0, x1: inner.x1, y1: inner.y1 }));
        }
      } else {
        s.buildings.push(mkBuilding(inner));
      }
      // hydrants live on sidewalk corners (popping one is a free show)
      if (rng() < 0.4) {
        const cx = rng() < 0.5 ? bl.x0 + 6 : bl.x1 - 6;
        const cy = rng() < 0.5 ? bl.y0 + 6 : bl.y1 - 6;
        s.hydrants.push({ x: cx, y: cy, burst: 0, done: false });
      }
    }
  }

  // ── streetlights: staggered down every street (pools drawn at night) ─────
  s.lamps = [];
  for (let i = 0; i < s.vs.length; i++) {
    const st = s.vs[i];
    for (let ly = 90 + (i % 2) * 95; ly < s.cityH - 60; ly += 190) {
      const side = Math.floor(ly / 190) % 2 === 0 ? 1 : -1;
      s.lamps.push({ x: st.c + side * (st.w / 2 - 6), y: ly });
    }
  }
  for (let j = 0; j < s.hs.length; j++) {
    const st = s.hs[j];
    for (let lx = 140 + (j % 2) * 95; lx < s.cityW - 60; lx += 190) {
      const side = Math.floor(lx / 190) % 2 === 0 ? 1 : -1;
      s.lamps.push({ x: lx, y: st.c + side * (st.w / 2 - 6) });
    }
  }

  // ── the extraction route: 8 markers hop 2-4 blocks at a time ─────────────
  const startI = 1 + Math.floor(rng() * 2);
  const startJ = GH - 1;
  const used = new Set<string>([`${startI},${startJ}`]);
  s.cps = [];
  let ci = startI;
  let cj = startJ;
  for (let k = 0; k < 8; k++) {
    let picked: { i: number; j: number } | null = null;
    for (let relax = 0; relax < 3 && !picked; relax++) {
      const lo = 2 - (relax > 1 ? 1 : 0);
      const hi = 4 + relax;
      const cands: { i: number; j: number; w: number }[] = [];
      for (let i = 0; i <= GW; i++) {
        for (let j = 0; j <= GH; j++) {
          const d = Math.abs(i - ci) + Math.abs(j - cj);
          if (d < lo || d > hi || used.has(`${i},${j}`)) continue;
          // bias short hops (2-3 blocks) so par pace fits the 70s clock
          cands.push({ i, j, w: d <= 3 ? 3 : 1 });
        }
      }
      if (cands.length === 0) continue;
      let total = 0;
      for (const c of cands) total += c.w;
      let roll = rng() * total;
      for (const c of cands) {
        roll -= c.w;
        if (roll <= 0) {
          picked = c;
          break;
        }
      }
      if (!picked) picked = cands[cands.length - 1];
    }
    if (!picked) picked = { i: Math.floor(rng() * (GW + 1)), j: Math.floor(rng() * (GH + 1)) };
    used.add(`${picked.i},${picked.j}`);
    s.cps.push({ i: picked.i, j: picked.j, x: 0, y: 0, taken: false, final: k === 7 });
    ci = picked.i;
    cj = picked.j;
  }
  for (const cp of s.cps) {
    cp.x = nodeX(s, cp.i);
    cp.y = nodeY(s, cp.j);
  }
  s.cpIdx = 0;

  // ── player start: on the start node, nosed toward the first marker ───────
  s.x = nodeX(s, startI);
  s.y = nodeY(s, startJ);
  const c0 = s.cps[0];
  s.heading = Math.abs(c0.x - s.x) > Math.abs(c0.y - s.y) ? (c0.x > s.x ? 0 : Math.PI) : c0.y > s.y ? Math.PI / 2 : -Math.PI / 2;

  // ── parked cars along street edges (never crowding an intersection) ──────
  s.parked = [];
  for (let tries = 0; tries < 40 && s.parked.length < 24; tries++) {
    const vertical = rng() < 0.5;
    if (vertical) {
      const st = s.vs[Math.floor(rng() * s.vs.length) % s.vs.length];
      const py = 80 + rng() * (s.cityH - 160);
      if (s.hs.some((h) => Math.abs(h.c - py) < 96)) continue;
      const side = rng() < 0.5 ? -1 : 1;
      const px = st.c + side * (st.w / 2 - 13);
      if (Math.hypot(px - s.x, py - s.y) < 170) continue;
      s.parked.push({ x: px, y: py, ang: Math.PI / 2, tone: Math.floor(rng() * CIV_TONES.length), hitCd: 0, nearArmed: false, nearDone: false });
    } else {
      const st = s.hs[Math.floor(rng() * s.hs.length) % s.hs.length];
      const px = 80 + rng() * (s.cityW - 160);
      if (s.vs.some((v) => Math.abs(v.c - px) < 96)) continue;
      const side = rng() < 0.5 ? -1 : 1;
      const py = st.c + side * (st.w / 2 - 13);
      if (Math.hypot(px - s.x, py - s.y) < 170) continue;
      s.parked.push({ x: px, y: py, ang: 0, tone: Math.floor(rng() * CIV_TONES.length), hitCd: 0, nearArmed: false, nearDone: false });
    }
  }

  // ── light ambient traffic seeded across the lattice ──────────────────────
  s.civs = [];
  for (let k = 0; k < CIV_COUNT; k++) {
    const ni = Math.floor(rng() * (GW + 1));
    const nj = Math.floor(rng() * (GH + 1));
    if (Math.hypot(nodeX(s, ni) - s.x, nodeY(s, nj) - s.y) < 320) continue;
    s.civs.push(mkCiv(s, ni, nj));
  }
}
function buildRoofDetails(rng: () => number): RoofDetail[] {
  const out: RoofDetail[] = [];
  const n = 2 + Math.floor(rng() * 4);
  for (let k = 0; k < n; k++) {
    const roll = rng();
    const kind: RoofDetail["kind"] = roll < 0.34 ? "vent" : roll < 0.62 ? "ac" : roll < 0.78 ? "hatch" : roll < 0.92 ? "skylight" : "tower";
    out.push({ kind, u: 0.15 + rng() * 0.7, v: 0.15 + rng() * 0.7, s: 0.6 + rng() * 0.9 });
  }
  return out;
}
function mkCiv(s: S, ni: number, nj: number): Civ {
  const sp = 92 + s.rng() * 40;
  return {
    x: nodeX(s, ni),
    y: nodeY(s, nj),
    heading: s.rng() * Math.PI * 2,
    speed: sp,
    want: sp,
    ni,
    nj,
    pi: ni,
    pj: nj,
    tone: Math.floor(s.rng() * CIV_TONES.length) % CIV_TONES.length,
    hitCd: 0,
    nearFlag: false,
    nearCd: 0,
    jolt: 0,
  };
}

// ---- line of sight ---------------------------------------------------------------
/** True when nothing solid (buildings) and no smoke cloud cuts the sight line. */
function hasLOS(s: S, ax: number, ay: number, bx: number, by: number): boolean {
  if (Math.hypot(bx - ax, by - ay) > SIGHT) return false;
  const lox = Math.min(ax, bx) - 2;
  const hix = Math.max(ax, bx) + 2;
  const loy = Math.min(ay, by) - 2;
  const hiy = Math.max(ay, by) + 2;
  for (const b of s.buildings) {
    if (b.x1 < lox || b.x0 > hix || b.y1 < loy || b.y0 > hiy) continue;
    if (segHitsRect(ax, ay, bx, by, b)) return false;
  }
  for (const dr of s.drops) {
    if (dr.kind !== "smoke") continue;
    const rNow = dr.r * (0.5 + 0.5 * Math.min(1, dr.age / 0.4));
    if (segPointDist(ax, ay, bx, by, dr.x, dr.y) < rNow * 0.9) return false;
  }
  return true;
}

// ---- patrol spawn + spin-out --------------------------------------------------------
function spawnCop(s: S) {
  // arrive from a lattice node out of frame: close enough to matter, far
  // enough to never pop in on screen
  let bi = 0;
  let bj = 0;
  let found = false;
  for (let tries = 0; tries < 24 && !found; tries++) {
    const i = Math.floor(s.rng() * (GW + 1));
    const j = Math.floor(s.rng() * (GH + 1));
    const d = Math.hypot(nodeX(s, i) - s.x, nodeY(s, j) - s.y);
    if (d > COP_SPAWN_MIN && d < COP_SPAWN_MAX) {
      bi = i;
      bj = j;
      found = true;
    }
  }
  if (!found) {
    bi = nearestNodeI(s, s.x) > GW / 2 ? 0 : GW;
    bj = nearestNodeJ(s, s.y) > GH / 2 ? 0 : GH;
  }
  s.cops.push({
    x: nodeX(s, bi),
    y: nodeY(s, bj),
    heading: s.rng() * Math.PI * 2,
    speed: 120,
    mode: "hunt",
    modeT: 0,
    ni: bi,
    nj: bj,
    pi: bi,
    pj: bj,
    lastX: s.x,
    lastY: s.y,
    bumpCd: 1.2 + s.rng(),
    wallCd: 0,
    spinA: 0,
    alpha: 1,
    nearFlag: false,
    nearDirty: false,
    nearCd: 0,
    ph: s.rng() * 6.3,
  });
}
/** Cartoon spin-out: the escape moment (gadget hit OR a clipped corner). */
function spinOutCop(s: S, c: Cop, why: string) {
  c.mode = "spin";
  c.modeT = 1.5;
  c.spinA = 0;
  s.dropsGot++;
  const v = award(s, DROP_SCORE);
  s.freezeT = Math.max(s.freezeT, 0.05);
  s.shake = Math.max(s.shake, 6);
  sfx().play("ko");
  burst(s, c.x, c.y, GOLD, REDUCED_MOTION ? 8 : 16, 220);
  burst(s, c.x, c.y, STEEL, REDUCED_MOTION ? 4 : 10, 150);
  float(s, c.x, c.y - 26, `${why} +${v}`, GOLD);
}
/** Heat climbs: play the siren sting, flash the stars, tighten the budget. */
function heatUp(s: S) {
  if (s.heat >= HEAT_MAX) return;
  s.heat++;
  s.heatFlash = 1;
  sfx().play("boost");
  float(s, s.x, s.y - 30, s.heat >= HEAT_MAX ? "MAX HEAT!" : "HEAT UP!", CRIMSON);
  if (s.heat >= HEAT_MAX) {
    s.msg = "MAX HEAT";
    s.msgT = 1.1;
  }
}
/** Clipping traffic / roadblocks feeds the seen-accumulator (spec: heat
 *  rises when spotted or when you clip traffic). */
function heatClip(s: S) {
  s.seenT += HEAT_CLIP;
  if (s.seenT >= HEAT_SEEN_UP) {
    s.seenT -= HEAT_SEEN_UP;
    heatUp(s);
  }
}

// ---- lattice navigation helpers ------------------------------------------------------
/** Greedy next node toward a target with a no-backtrack penalty. The street
 *  lattice is fully connected, so greedy Manhattan descent never dead-ends. */
function pickNextNode(
  s: S,
  fi: number,
  fj: number,
  pi: number,
  pj: number,
  ti: number,
  tj: number,
): { i: number; j: number } {
  let best: { i: number; j: number } | null = null;
  let bestScore = Infinity;
  const opts = [
    { i: fi - 1, j: fj },
    { i: fi + 1, j: fj },
    { i: fi, j: fj - 1 },
    { i: fi, j: fj + 1 },
  ];
  for (const o of opts) {
    if (o.i < 0 || o.i > GW || o.j < 0 || o.j > GH) continue;
    let score = Math.abs(o.i - ti) + Math.abs(o.j - tj) + s.rng() * 0.7;
    if (o.i === pi && o.j === pj) score += 1.5; // U-turns are a last resort
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best ?? { i: fi, j: fj };
}
/** Ambient traffic wanders: straight ahead when possible, turns for flavor. */
function civPickNext(s: S, c: Civ): { i: number; j: number } {
  const straight = { i: 2 * c.ni - c.pi, j: 2 * c.nj - c.pj };
  const opts: { i: number; j: number; w: number }[] = [];
  for (const o of [
    { i: c.ni - 1, j: c.nj },
    { i: c.ni + 1, j: c.nj },
    { i: c.ni, j: c.nj - 1 },
    { i: c.ni, j: c.nj + 1 },
  ]) {
    if (o.i < 0 || o.i > GW || o.j < 0 || o.j > GH) continue;
    if (o.i === c.pi && o.j === c.pj) continue; // no U-turns in traffic
    opts.push({ ...o, w: o.i === straight.i && o.j === straight.j ? 2.6 : 1 });
  }
  if (opts.length === 0) return { i: c.pi, j: c.pj }; // boxed in a corner: U-turn
  let total = 0;
  for (const o of opts) total += o.w;
  let roll = s.rng() * total;
  for (const o of opts) {
    roll -= o.w;
    if (roll <= 0) return o;
  }
  return opts[opts.length - 1];
}
/** Waypoint for a lattice driver: the node center plus a right-lane offset. */
function laneWaypoint(s: S, ni: number, nj: number, pi: number, pj: number): { x: number; y: number } {
  const tx = nodeX(s, ni);
  const ty = nodeY(s, nj);
  const dx = Math.sign(tx - nodeX(s, pi));
  const dy = Math.sign(ty - nodeY(s, pj));
  if (dx === 0 && dy === 0) return { x: tx, y: ty };
  return { x: tx + -dy * LANE, y: ty + dx * LANE };
}
/** Heading-based mover vs building walls. Returns "spun" for a hard corner
 *  clip by a chasing patrol (the alley-juke payoff), else wall-slides. */
function copWalls(s: S, c: Cop): boolean {
  for (const b of s.buildings) {
    if (c.x < b.x0 - 14 || c.x > b.x1 + 14 || c.y < b.y0 - 14 || c.y > b.y1 + 14) continue;
    const hit = collideRect(c.x, c.y, 12, b);
    if (!hit) continue;
    const vx = Math.cos(c.heading) * c.speed;
    const vy = Math.sin(c.heading) * c.speed;
    const into = -(vx * hit.nx + vy * hit.ny); // speed INTO the wall
    c.x = hit.x;
    c.y = hit.y;
    if ((c.mode === "pursuit" || c.mode === "overshoot") && into > WALL_SPIN_SPEED && c.wallCd <= 0) {
      spinOutCop(s, c, "CLIPPED THE CORNER!");
      return true;
    }
    // slide: keep only the tangential component
    const tx = vx - (vx * hit.nx + vy * hit.ny) * hit.nx;
    const ty = vy - (vx * hit.nx + vy * hit.ny) * hit.ny;
    const sp = Math.hypot(tx, ty);
    if (sp > 24) c.heading = Math.atan2(ty, tx);
    c.speed = Math.max(60, sp * 0.9);
    c.wallCd = 0.25;
    if (s.parts.length < PART_CAP) burst(s, hit.x - hit.nx * 12, hit.y - hit.ny * 12, GOLD, 2, 110);
  }
  return false;
}

// ---- the game ---------------------------------------------------------------------------
const handle: GameHandle<S> = {
  init: (_w, _h, run) => {
    sfx(); // audio unlock rides the Start click (a user gesture)
    const s: S = {
      rng: mulberry32(1),
      practice: run.practice,
      rainy: false,
      district: DISTRICTS[0],
      cityW: 1,
      cityH: 1,
      vs: [],
      hs: [],
      blocks: [],
      buildings: [],
      alleys: [],
      lamps: [],
      hydrants: [],
      parked: [],
      cps: [],
      cpIdx: 0,
      // persistent baseline, bounded HERE by the one effects const
      topSpeed: BASE_TOP * (1 + Math.min(E.drugs.cap, run.stats.drugs * E.drugs.perLevel)),
      turnMul: 1 + Math.min(E.ozempic.cap, run.stats.ozempic * E.ozempic.perLevel),
      resist: Math.min(E.botox.cap, run.stats.botox * E.botox.perLevel),
      gadgetMul: 1 + Math.min(E.aura.gadgetCap, run.stats.aura * E.aura.gadgetPerLevel),
      x: 0,
      y: 0,
      heading: -Math.PI / 2,
      vx: 0,
      vy: 0,
      eng: 0,
      iframes: 0,
      slipT: 0,
      gadgetCd: 0,
      nextGadget: "smoke",
      lastSpace: false,
      lastDown: false,
      downAt: 0,
      downX: 0,
      downY: 0,
      downMoved: false,
      prevRX: 0,
      prevRY: 0,
      heat: 1,
      seenT: 0,
      noSeeT: 0,
      anySight: false,
      heatFlash: 0,
      cops: [],
      spawnT: 3,
      rbT: 4,
      roadblocks: [],
      civs: [],
      drops: [],
      skids: [],
      parts: [],
      floats: [],
      camX: 0,
      camY: 0,
      zoom: ZOOM_HI,
      t: 0,
      started: false,
      score: 0,
      cpGot: 0,
      dropsGot: 0,
      nearMisses: 0,
      ghosted: 0,
      escaped: false,
      finishT: 0,
      over: false,
      freezeT: 0,
      shake: 0,
      msg: "",
      msgT: 0,
    };
    buildCity(s);
    s.prevRX = s.x - Math.cos(s.heading) * 11;
    s.prevRY = s.y - Math.sin(s.heading) * 11;
    s.camX = s.x;
    s.camY = s.y;
    spawnCop(s); // one unit already prowling at a single star
    // PRACTICE-ONLY debug hook: lets a scripted browser probe drive the sim
    // (teleport into an alley, verify heat falls). Never set on real runs.
    if (run.practice && typeof window !== "undefined") {
      (window as unknown as { __getaway?: unknown }).__getaway = s;
    }
    return s;
  },

  step: (s, dt, input, w, h) => {
    if (s.over) return;

    // HIT-STOP: the whole world freezes for a beat on big moments
    if (s.freezeT > 0) {
      s.freezeT -= dt;
      return;
    }

    s.t += dt;
    if (s.msgT > 0) s.msgT = Math.max(0, s.msgT - dt);
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
    if (s.heatFlash > 0) s.heatFlash = Math.max(0, s.heatFlash - dt * 2.2);

    // countdown: the city idles, the camera settles, then GO
    if (s.t < COUNT) {
      s.camX += (s.x - s.camX) * Math.min(1, CAM_LERP * dt);
      s.camY += (s.y - s.camY) * Math.min(1, CAM_LERP * dt);
      return;
    }
    if (!s.started) {
      s.started = true;
      s.msg = "GO!";
      s.msgT = 1.0;
      sfx().play("boost");
    }
    const raceT = s.t - COUNT;

    // extraction outro: coast out of frame, then hand over
    if (s.escaped) {
      s.finishT -= dt;
      s.eng *= 1 - 1.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 1 - 1.5 * dt;
      s.vy *= 1 - 1.5 * dt;
      s.camX += (s.x - s.camX) * Math.min(1, CAM_LERP * dt);
      s.camY += (s.y - s.camY) * Math.min(1, CAM_LERP * dt);
      for (const p of s.parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      s.parts = s.parts.filter((p) => p.life > 0);
      for (const f of s.floats) {
        f.y -= 34 * dt;
        f.life -= dt;
      }
      s.floats = s.floats.filter((f) => f.life > 0);
      if (s.finishT <= 0) s.over = true;
      return;
    }

    // DNF: the clock wins, everything collected banks (never a zero for trying)
    if (raceT >= RUN_SECONDS) {
      s.over = true;
      return;
    }

    if (s.iframes > 0) s.iframes = Math.max(0, s.iframes - dt);
    if (s.gadgetCd > 0) s.gadgetCd = Math.max(0, s.gadgetCd - dt);
    if (s.slipT > 0) s.slipT = Math.max(0, s.slipT - dt);
    if (s.rbT > 0) s.rbT = Math.max(0, s.rbT - dt);

    // ── input: QUICK TAP = gadget, PRESS AND HOLD = aim at the finger ────────
    // (the proven tapEdge implementation, the franchise mobile lesson)
    const pressEdge = input.down && !s.lastDown;
    const releaseEdge = !input.down && s.lastDown;
    if (pressEdge && input.px != null && input.py != null) {
      s.downAt = s.t;
      s.downX = input.px;
      s.downY = input.py;
      s.downMoved = false;
    }
    if (input.down && input.px != null && input.py != null && Math.hypot(input.px - s.downX, input.py - s.downY) > TAP_MAX_MOVE)
      s.downMoved = true;
    const tapEdge = releaseEdge && !s.downMoved && s.t - s.downAt < TAP_MAX_T;
    const spaceEdge = input.space && !s.lastSpace;
    s.lastDown = input.down;
    s.lastSpace = input.space;

    // the mute icon owns its corner: taps there toggle sound, never a gadget
    const muteTap = tapEdge && s.downX < 56 && s.downY > 44 && s.downY < 92;
    if (muteTap) toggleMute();

    let steer = 0;
    if (input.left && !input.right) steer = -1;
    else if (input.right && !input.left) steer = 1;
    else if (input.down && input.px != null && input.py != null && (s.downMoved || s.t - s.downAt >= 0.12)) {
      // hold: turn toward the held point. The camera never rotates, so a
      // screen angle IS a world angle; the car sits at the camera target
      // minus the lerp offset, scaled by the current zoom.
      const bx = (s.x - s.camX) * s.zoom + w / 2;
      const by = (s.y - s.camY) * s.zoom + h / 2;
      const want = Math.atan2(input.py - by, input.px - bx);
      steer = clamp(wrap(want - s.heading) / 0.5, -1, 1);
    }

    // ── GADGET DROP: alternating smoke / oil, laid behind the rear axle ──────
    if ((spaceEdge || (tapEdge && !muteTap)) && s.gadgetCd <= 0) {
      s.gadgetCd = GADGET_CD;
      const kind = s.nextGadget;
      s.nextGadget = kind === "smoke" ? "oil" : "smoke";
      const bx = s.x - Math.cos(s.heading) * 30;
      const by = s.y - Math.sin(s.heading) * 30;
      s.drops.push({
        kind,
        x: bx,
        y: by,
        r: (kind === "smoke" ? SMOKE_R : OIL_R) * s.gadgetMul,
        age: 0,
        life: kind === "smoke" ? SMOKE_LIFE : OIL_LIFE,
      });
      sfx().play("fire");
      float(s, bx, by - 18, kind === "smoke" ? "SMOKE!" : "OIL!", ICE);
      burst(s, bx, by, kind === "smoke" ? "#cfd4de" : "#3a3350", REDUCED_MOTION ? 3 : 7, 90);
    }

    // ── heading + the rally grip/drift model (wet streets are driftier) ──────
    const turnRate = TURN * s.turnMul * (0.6 + 0.4 * Math.min(1, s.eng / s.topSpeed));
    s.heading += steer * turnRate * dt;
    if (s.slipT > 0) s.heading += 2.6 * dt; // greasy: your own oil bites back
    s.eng += ACCEL * dt;
    if (s.eng > s.topSpeed) s.eng -= (s.eng - s.topSpeed) * Math.min(1, 4 * dt);
    if (s.eng < 0) s.eng = 0;
    const grip = (s.rainy ? GRIP_RAIN : GRIP_DRY) * (s.slipT > 0 ? 0.5 : 1);
    const dvx = Math.cos(s.heading) * s.eng;
    const dvy = Math.sin(s.heading) * s.eng;
    const gk = Math.min(1, grip * dt);
    s.vx += (dvx - s.vx) * gk;
    s.vy += (dvy - s.vy) * gk;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const slip = Math.hypot(dvx - s.vx, dvy - s.vy);

    // skid marks + spray (drift juice, capped + reduced-motion aware)
    const rx = s.x - Math.cos(s.heading) * 11;
    const ry = s.y - Math.sin(s.heading) * 11;
    if (slip > 120 && s.skids.length < SKID_CAP) {
      s.skids.push({ x0: s.prevRX, y0: s.prevRY, x1: rx, y1: ry, life: 2.2 });
    }
    s.prevRX = rx;
    s.prevRY = ry;
    if (slip > 130 && s.eng > 90 && s.parts.length < (REDUCED_MOTION ? 50 : PART_CAP)) {
      const back = s.heading + Math.PI;
      s.parts.push({
        x: rx,
        y: ry,
        vx: Math.cos(back) * 60 + (s.rng() - 0.5) * 60,
        vy: Math.sin(back) * 60 + (s.rng() - 0.5) * 60,
        life: 0.35,
        c: s.rainy ? "#3d4c5c" : "#3a4050",
        r: 1.5 + s.rng() * 1.8,
      });
    }

    // ── WALL-SLIDE on buildings (the rally lesson: never bounce). Kill only
    // the normal velocity so the car scrubs along brick instead of sticking. ──
    for (const b of s.buildings) {
      if (s.x < b.x0 - PLAYER_R - 2 || s.x > b.x1 + PLAYER_R + 2 || s.y < b.y0 - PLAYER_R - 2 || s.y > b.y1 + PLAYER_R + 2)
        continue;
      const hit = collideRect(s.x, s.y, PLAYER_R, b);
      if (!hit) continue;
      s.x = hit.x;
      s.y = hit.y;
      const vN = s.vx * hit.nx + s.vy * hit.ny;
      if (vN < 0) {
        s.vx -= vN * hit.nx;
        s.vy -= vN * hit.ny;
      }
      s.eng *= 0.96;
      if (s.parts.length < PART_CAP) burst(s, hit.x - hit.nx * PLAYER_R, hit.y - hit.ny * PLAYER_R, GOLD, 2, 120);
    }
    // city limits: the same slide against the outer edge
    {
      const m = PLAYER_R + 6;
      if (s.x < m) {
        s.x = m;
        if (s.vx < 0) s.vx = 0;
      } else if (s.x > s.cityW - m) {
        s.x = s.cityW - m;
        if (s.vx > 0) s.vx = 0;
      }
      if (s.y < m) {
        s.y = m;
        if (s.vy < 0) s.vy = 0;
      } else if (s.y > s.cityH - m) {
        s.y = s.cityH - m;
        if (s.vy > 0) s.vy = 0;
      }
    }

    // ── parked cars: clip = scrub + heat, thread = near-miss ─────────────────
    for (const pk of s.parked) {
      if (Math.abs(pk.x - s.x) > 90 || Math.abs(pk.y - s.y) > 90) continue;
      if (pk.hitCd > 0) pk.hitCd = Math.max(0, pk.hitCd - dt);
      const d = Math.hypot(pk.x - s.x, pk.y - s.y);
      if (d < 20 && pk.hitCd <= 0) {
        pk.hitCd = 0.9;
        pk.nearDone = true;
        s.eng *= 0.72;
        s.shake = Math.max(s.shake, 5);
        sfx().play("hit");
        heatClip(s);
        burst(s, pk.x, pk.y, STEEL, REDUCED_MOTION ? 4 : 9, 160);
        float(s, s.x, s.y - 22, "CLIPPED!", CRIMSON);
      } else if (d < NEAR_IN - 6 && !pk.nearDone) {
        pk.nearArmed = true;
      } else if (d > NEAR_OUT - 10 && pk.nearArmed && !pk.nearDone) {
        pk.nearArmed = false;
        if (s.eng > s.topSpeed * 0.55) {
          pk.nearDone = true;
          s.nearMisses++;
          const v = award(s, NEAR_SCORE);
          sfx().play("pickup");
          float(s, s.x, s.y - 22, `THREADED! +${v}`, ICE);
        }
      }
    }

    // ── hydrants burst (pure fun: a geyser and small change) ─────────────────
    for (const hy of s.hydrants) {
      if (hy.burst > 0) {
        hy.burst -= dt;
        if (s.parts.length < PART_CAP - 2) {
          for (let k = 0; k < 2; k++)
            s.parts.push({
              x: hy.x + (s.rng() - 0.5) * 6,
              y: hy.y,
              vx: (s.rng() - 0.5) * 60,
              vy: -50 - s.rng() * 130,
              life: 0.5,
              c: k === 0 ? ICE : "#d7f4fa",
              r: 1.6 + s.rng() * 2,
            });
        }
      }
      if (hy.done || Math.abs(hy.x - s.x) > 40 || Math.abs(hy.y - s.y) > 40) continue;
      if (Math.hypot(hy.x - s.x, hy.y - s.y) < 15) {
        hy.done = true;
        hy.burst = 3.2;
        s.score += HYDRANT_SCORE;
        sfx().play("tap");
        burst(s, hy.x, hy.y, ICE, REDUCED_MOTION ? 6 : 14, 170);
        float(s, hy.x, hy.y - 20, `SPLOOSH! +${HYDRANT_SCORE}`, ICE);
      }
    }

    // ── gadget drops age; the player can slip on aged oil ────────────────────
    for (const dr of s.drops) {
      dr.age += dt;
      if (dr.kind === "oil" && dr.age > 0.5 && s.slipT <= 0) {
        if (Math.hypot(dr.x - s.x, dr.y - s.y) < dr.r + 6) {
          s.slipT = 0.45;
          float(s, s.x, s.y - 20, "GREASY!", "#b18cff");
        }
      }
    }
    s.drops = s.drops.filter((dr) => dr.age < dr.life);

    // ── ambient traffic: lattice wanderers, obstacles with feelings ──────────
    for (const c of s.civs) {
      if (c.hitCd > 0) c.hitCd = Math.max(0, c.hitCd - dt);
      if (c.nearCd > 0) c.nearCd = Math.max(0, c.nearCd - dt);
      if (c.jolt > 0) c.jolt = Math.max(0, c.jolt - dt);
      const wp = laneWaypoint(s, c.ni, c.nj, c.pi, c.pj);
      c.heading = turnToward(c.heading, Math.atan2(wp.y - c.y, wp.x - c.x), 3.0 * dt);
      c.speed += (c.want * (c.jolt > 0 ? 0.25 : 1) - c.speed) * Math.min(1, 2.5 * dt);
      c.x += Math.cos(c.heading) * c.speed * dt;
      c.y += Math.sin(c.heading) * c.speed * dt;
      if (Math.hypot(wp.x - c.x, wp.y - c.y) < 26) {
        const nx = civPickNext(s, c);
        c.pi = c.ni;
        c.pj = c.nj;
        c.ni = nx.i;
        c.nj = nx.j;
      }
      // drifted far away: respawn as fresh traffic near the action
      if (Math.hypot(c.x - s.x, c.y - s.y) > 1500) {
        for (let tries = 0; tries < 12; tries++) {
          const i = Math.floor(s.rng() * (GW + 1));
          const j = Math.floor(s.rng() * (GH + 1));
          const d = Math.hypot(nodeX(s, i) - s.x, nodeY(s, j) - s.y);
          if (d > 550 && d < 1000) {
            Object.assign(c, mkCiv(s, i, j));
            break;
          }
        }
        continue;
      }
      const d = Math.hypot(c.x - s.x, c.y - s.y);
      // clip = scrub + HEAT (the spec's traffic rule); the civ gets shoved
      if (d < 21 && c.hitCd <= 0 && s.iframes <= 0) {
        c.hitCd = 1.5;
        c.jolt = 1.2;
        s.eng *= 0.7;
        s.shake = Math.max(s.shake, 6);
        sfx().play("hit");
        heatClip(s);
        const push = Math.atan2(c.y - s.y, c.x - s.x);
        c.x += Math.cos(push) * 10;
        c.y += Math.sin(push) * 10;
        c.heading += (s.rng() - 0.5) * 0.7;
        burst(s, (s.x + c.x) / 2, (s.y + c.y) / 2, STEEL, REDUCED_MOTION ? 4 : 9, 150);
        float(s, s.x, s.y - 22, "CLIPPED!", CRIMSON);
      } else if (d < NEAR_IN && c.hitCd <= 0) {
        c.nearFlag = true;
      } else if (d > NEAR_OUT && c.nearFlag) {
        c.nearFlag = false;
        if (c.nearCd <= 0 && c.hitCd <= 0 && s.eng > s.topSpeed * 0.55) {
          c.nearCd = 2;
          s.nearMisses++;
          const v = award(s, NEAR_SCORE);
          sfx().play("pickup");
          float(s, s.x, s.y - 22, `CLOSE! +${v}`, ICE);
        }
      }
    }

    // ── PATROLS: hunt the lattice, pursue on sight, overshoot into corners ───
    // Budget = heat + bonus, floored at 2 and capped at the old heat-5 max. A
    // spun/dropped unit no longer counts as active, so the moment one goes down
    // the block below backfills it within COP_REINFORCE_CD (fast, not a trickle).
    s.spawnT -= dt;
    const budget = clamp(s.heat + COP_BUDGET_BONUS, COP_BUDGET_FLOOR, COP_BUDGET_CAP);
    const active = s.cops.filter((c) => c.mode !== "spin" && c.mode !== "gone").length;
    if (active < budget) {
      // under strength (run start or a fresh drop): never wait long to refill
      if (s.spawnT > COP_REINFORCE_CD) s.spawnT = COP_REINFORCE_CD;
      if (s.spawnT <= 0) {
        spawnCop(s);
        s.spawnT = COP_REINFORCE_CD;
      }
    } else if (active > budget && s.spawnT <= 0) {
      // heat fell: peel ONE unit off (the farthest, so nearby pressure holds),
      // and only on the slow call-off cadence so cops never seem to vanish
      s.spawnT = COP_CALLOFF_CD;
      let far: Cop | null = null;
      let fd = -1;
      for (const c of s.cops) {
        if (c.mode === "spin" || c.mode === "gone") continue;
        const d = Math.hypot(c.x - s.x, c.y - s.y);
        if (d > fd) {
          fd = d;
          far = c;
        }
      }
      if (far) {
        far.mode = "gone";
        far.modeT = 0.7;
      }
    }

    const copTop = s.topSpeed * (0.88 + 0.05 * s.heat); // more heat = faster units
    const pni = nearestNodeI(s, s.x);
    const pnj = nearestNodeJ(s, s.y);
    s.anySight = false;
    for (const c of s.cops) {
      c.ph += dt;
      if (c.bumpCd > 0) c.bumpCd = Math.max(0, c.bumpCd - dt);
      if (c.wallCd > 0) c.wallCd = Math.max(0, c.wallCd - dt);
      if (c.nearCd > 0) c.nearCd = Math.max(0, c.nearCd - dt);

      if (c.mode === "spin") {
        c.modeT -= dt;
        c.spinA += 11 * dt;
        c.speed *= Math.max(0, 1 - 2.5 * dt);
        c.x += Math.cos(c.heading) * c.speed * dt;
        c.y += Math.sin(c.heading) * c.speed * dt;
        if (c.modeT <= 0) {
          c.mode = "gone";
          c.modeT = 0.6;
        }
        continue;
      }
      if (c.mode === "gone") {
        c.modeT -= dt;
        c.alpha = Math.max(0, Math.min(1, c.modeT / 0.6));
        continue;
      }

      const los = hasLOS(s, c.x, c.y, s.x, s.y);
      if (los) {
        s.anySight = true;
        c.lastX = s.x;
        c.lastY = s.y;
      }
      const d = Math.hypot(c.x - s.x, c.y - s.y);

      // mode transitions: the whole alley trick lives here. Losing sight of
      // you does NOT make them turn; it makes them barrel at your last known
      // spot with a lazy wheel (COP_TURN_OVERSHOOT) until brick finds them.
      if (c.mode === "hunt" && los) c.mode = "pursuit";
      else if (c.mode === "pursuit" && !los) {
        c.mode = "overshoot";
        c.modeT = 1.8;
      } else if (c.mode === "overshoot") {
        if (los) c.mode = "pursuit";
        else {
          c.modeT -= dt;
          if (c.modeT <= 0 || Math.hypot(c.lastX - c.x, c.lastY - c.y) < 30) {
            c.mode = "hunt";
            c.ni = nearestNodeI(s, c.x);
            c.nj = nearestNodeJ(s, c.y);
            c.pi = c.ni;
            c.pj = c.nj;
          }
        }
      }

      let want = copTop;
      if (c.mode === "hunt") {
        const wp = laneWaypoint(s, c.ni, c.nj, c.pi, c.pj);
        c.heading = turnToward(c.heading, Math.atan2(wp.y - c.y, wp.x - c.x), COP_TURN_HUNT * dt);
        if (d > 800) want *= 1.3; // rubber-band: never hopelessly lost
        if (Math.hypot(wp.x - c.x, wp.y - c.y) < 28) {
          const nx = pickNextNode(s, c.ni, c.nj, c.pi, c.pj, pni, pnj);
          c.pi = c.ni;
          c.pj = c.nj;
          c.ni = nx.i;
          c.nj = nx.j;
        }
      } else if (c.mode === "pursuit") {
        // aim a beat ahead of the player; rubber-band the closing speed
        const tx = s.x + s.vx * 0.15;
        const ty = s.y + s.vy * 0.15;
        c.heading = turnToward(c.heading, Math.atan2(ty - c.y, tx - c.x), COP_TURN_PURSUIT * dt);
        if (d > 700) want *= 1.3;
        else if (d > 380) want *= 1.12;
        else if (d < 140) want = Math.max(Math.hypot(s.vx, s.vy) * 1.06, 150);
      } else {
        // overshoot: full speed at the last-seen point, barely steering
        c.heading = turnToward(c.heading, Math.atan2(c.lastY - c.y, c.lastX - c.x), COP_TURN_OVERSHOOT * dt);
        want = Math.max(c.speed, copTop * 1.05);
      }
      c.speed += (want - c.speed) * Math.min(1, 2.2 * dt);
      c.x += Math.cos(c.heading) * c.speed * dt;
      c.y += Math.sin(c.heading) * c.speed * dt;
      c.x = clamp(c.x, 14, s.cityW - 14);
      c.y = clamp(c.y, 14, s.cityH - 14);

      // gadgets: smoke cloud or oil patch = spin-out (the whole point)
      let spun = false;
      for (const dr of s.drops) {
        const rNow = dr.kind === "smoke" ? dr.r * (0.5 + 0.5 * Math.min(1, dr.age / 0.4)) : dr.r;
        if (Math.hypot(dr.x - c.x, dr.y - c.y) < rNow + 8) {
          spinOutCop(s, c, dr.kind === "smoke" ? "SMOKED!" : "SLICKED!");
          spun = true;
          break;
        }
      }
      if (spun) continue;
      // brick: chasing units that clip a corner at speed spin out
      if (copWalls(s, c)) continue;

      // PIT nudge: contact on your quarter shoves + jolts you, Armor soaks it
      if (c.mode === "pursuit" && d < PIT_RANGE && c.bumpCd <= 0 && s.iframes <= 0) {
        c.bumpCd = PIT_CD;
        c.nearDirty = true;
        const soak = 1 - s.resist;
        s.eng *= 1 - PIT_SPEED_LOSS * soak;
        const ang = Math.atan2(s.y - c.y, s.x - c.x);
        const nx = Math.cos(ang);
        const ny = Math.sin(ang);
        s.vx += nx * 150 * (1 - s.resist * 0.5);
        s.vy += ny * 150 * (1 - s.resist * 0.5);
        const side = Math.sign(Math.sin(s.heading - ang)) || 1;
        s.heading += side * 0.28 * soak;
        s.iframes = HIT_IFRAMES;
        s.shake = Math.max(s.shake, 8);
        sfx().play("hurt");
        burst(s, (s.x + c.x) / 2, (s.y + c.y) / 2, WHITE, REDUCED_MOTION ? 4 : 10, 180);
        float(s, s.x, s.y - 26, s.resist > 0 ? "PIT! (armor held)" : "PIT!", CRIMSON);
      }

      // near miss: dive into the bubble and leave it without any contact
      if (d < NEAR_IN) {
        if (!c.nearFlag) {
          c.nearFlag = true;
          c.nearDirty = false;
        }
      } else if (d > NEAR_OUT && c.nearFlag) {
        c.nearFlag = false;
        if (!c.nearDirty && c.nearCd <= 0 && s.eng > s.topSpeed * 0.5) {
          c.nearCd = 2.0;
          s.nearMisses++;
          const v = award(s, NEAR_SCORE);
          sfx().play("pickup");
          float(s, s.x, s.y - 24, `CLOSE! +${v}`, ICE);
        }
      }
    }
    // keep two units from stacking on the same pixel of street
    for (let a = 0; a < s.cops.length; a++) {
      for (let b = a + 1; b < s.cops.length; b++) {
        const ca = s.cops[a];
        const cb = s.cops[b];
        if (ca.mode === "gone" || cb.mode === "gone") continue;
        const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
        if (d < 26 && d > 0.01) {
          const px = (ca.x - cb.x) / d;
          const py = (ca.y - cb.y) / d;
          ca.x += px * 30 * dt;
          ca.y += py * 30 * dt;
          cb.x -= px * 30 * dt;
          cb.y -= py * 30 * dt;
        }
      }
    }
    s.cops = s.cops.filter((c) => !(c.mode === "gone" && c.modeT <= 0));

    // ── HEAT: seen time climbs the stars, three unseen seconds sheds one ─────
    if (s.anySight) {
      s.noSeeT = 0;
      s.seenT += dt;
      if (s.seenT >= HEAT_SEEN_UP) {
        s.seenT -= HEAT_SEEN_UP;
        heatUp(s);
      }
    } else {
      s.noSeeT += dt;
      if (s.noSeeT >= HEAT_DROP_SECS) {
        s.noSeeT = 0;
        s.seenT = 0;
        if (s.heat > 1) {
          s.heat--;
          s.heatFlash = 1;
          s.ghosted++;
          s.score += GHOST_SCORE;
          sfx().play("pickup");
          float(s, s.x, s.y - 28, `GHOSTED +${GHOST_SCORE}`, ICE);
        }
      }
    }

    // ── roadblocks: max heat only, thrown across a MAJOR ahead of you ────────
    if (s.heat >= HEAT_MAX && s.rbT <= 0 && s.roadblocks.length < 2) {
      s.rbT = RB_CD;
      spawnRoadblock(s);
    }
    for (const rb of s.roadblocks) {
      rb.life -= dt;
      const along = rb.horiz ? s.y - rb.y : s.x - rb.x;
      const cross = rb.horiz ? s.x - rb.x : s.y - rb.y;
      const streetHalf = 70;
      if (Math.abs(cross) < streetHalf && Math.abs(along) < 130 && rb.armedSign === 0) rb.armedSign = Math.sign(along) || 1;
      // collision with the barrier line
      if (s.iframes <= 0 && !s.escaped) {
        for (const ci of rb.circles) {
          const cx = rb.x + ci.ox;
          const cy = rb.y + ci.oy;
          if (Math.hypot(cx - s.x, cy - s.y) < ci.r + PLAYER_R) {
            rb.hit = true;
            s.eng *= 0.45;
            s.iframes = 0.9;
            s.shake = Math.max(s.shake, 10);
            sfx().play("hurt");
            heatClip(s);
            burst(s, cx, cy, GOLD, REDUCED_MOTION ? 5 : 12, 200);
            float(s, s.x, s.y - 26, "ROADBLOCK!", CRIMSON);
            break;
          }
        }
      }
      // threading the gap: through the line, no contact, banked once
      if (rb.armedSign !== 0 && !rb.threaded && !rb.hit && Math.abs(along) > 130 && Math.sign(along) !== rb.armedSign && Math.abs(cross) < streetHalf) {
        rb.threaded = true;
        s.nearMisses++;
        const v = award(s, NEAR_SCORE);
        sfx().play("pickup");
        float(s, s.x, s.y - 24, `THREADED! +${v}`, GOLD);
      }
    }
    s.roadblocks = s.roadblocks.filter((rb) => rb.life > 0);

    // ── the extraction route: one live marker at a time ──────────────────────
    const cp = s.cps[s.cpIdx];
    if (cp && !cp.taken && Math.hypot(cp.x - s.x, cp.y - s.y) < CP_R) {
      cp.taken = true;
      if (cp.final) {
        s.escaped = true;
        s.finishT = 1.7;
        const left = Math.max(0, RUN_SECONDS - raceT);
        const bonus = ESCAPE_SCORE + Math.ceil(left) * TIME_BONUS;
        s.score += bonus;
        s.msg = "EXTRACTED!";
        s.msgT = 1.7;
        s.freezeT = Math.max(s.freezeT, 0.06);
        s.shake = Math.max(s.shake, 6);
        sfx().play("score");
        burst(s, s.x, s.y, GOLD, REDUCED_MOTION ? 10 : 30, 260);
        float(s, s.x, s.y - 30, `EXTRACTION +${bonus}`, GOLD);
      } else {
        s.cpGot++;
        const v = award(s, CP_SCORE);
        s.cpIdx++;
        s.shake = Math.max(s.shake, 3);
        sfx().play("score");
        float(s, cp.x, cp.y - 26, `CHECKPOINT +${v}`, CREAM);
      }
    }

    // ── camera: lead along velocity, zoom breathes with speed, never rotates ─
    const sp = Math.hypot(s.vx, s.vy) || 1;
    const tx = s.x + (s.vx / sp) * LEAD;
    const ty = s.y + (s.vy / sp) * LEAD;
    s.camX += (tx - s.camX) * Math.min(1, CAM_LERP * dt);
    s.camY += (ty - s.camY) * Math.min(1, CAM_LERP * dt);
    const zTarget = ZOOM_HI - (ZOOM_HI - ZOOM_LO) * clamp(sp / s.topSpeed, 0, 1);
    s.zoom += (zTarget - s.zoom) * Math.min(1, 2.5 * dt);

    // ── particles / floaters / skids tick ────────────────────────────────────
    for (const p of s.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    s.parts = s.parts.filter((p) => p.life > 0);
    for (const f of s.floats) {
      f.y -= 34 * dt;
      f.life -= dt;
    }
    s.floats = s.floats.filter((f) => f.life > 0);
    for (const k of s.skids) k.life -= dt;
    s.skids = s.skids.filter((k) => k.life > 0);
  },

  draw: (ctx, s, w, h) => {
    if (s.buildings.length === 0) return;

    // 1) night ambient
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#0b0e18");
    sky.addColorStop(1, CHARCOAL);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // 2) the world, in camera space (translate + zoom; the camera never rotates)
    ctx.save();
    let shx = 0;
    let shy = 0;
    if (s.shake > 0 && !REDUCED_MOTION) {
      shx = (Math.random() - 0.5) * s.shake;
      shy = (Math.random() - 0.5) * s.shake;
    }
    ctx.translate(w / 2, h / 2);
    ctx.scale(s.zoom, s.zoom);
    ctx.translate(-s.camX + shx, -s.camY + shy);

    // world-space view rect for culling
    const padX = (w / 2 + 80) / s.zoom;
    const padY = (h / 2 + 80) / s.zoom;
    const view: Rect = { x0: s.camX - padX, y0: s.camY - padY, x1: s.camX + padX, y1: s.camY + padY };
    const inView = (r: Rect) => !(r.x1 < view.x0 || r.x0 > view.x1 || r.y1 < view.y0 || r.y0 > view.y1);

    drawGroundAndStreets(ctx, s, view);

    // skid marks under everything that moves
    ctx.lineCap = "round";
    for (const k of s.skids) {
      ctx.strokeStyle = "rgba(10,9,8,0.45)";
      ctx.globalAlpha = clamp(k.life / 2.2, 0, 1) * 0.8;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(k.x0, k.y0);
      ctx.lineTo(k.x1, k.y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // oil patches sit ON the street, under cars
    for (const dr of s.drops) if (dr.kind === "oil") drawOil(ctx, dr);

    // the live marker (and a ghost of the next one)
    drawMarkers(ctx, s);

    // sidewalk props + parked cars
    for (const hy of s.hydrants) {
      if (hy.x < view.x0 - 20 || hy.x > view.x1 + 20 || hy.y < view.y0 - 20 || hy.y > view.y1 + 20) continue;
      drawHydrant(ctx, hy);
    }
    for (const lp of s.lamps) {
      if (lp.x < view.x0 - 20 || lp.x > view.x1 + 20 || lp.y < view.y0 - 20 || lp.y > view.y1 + 20) continue;
      drawLampPost(ctx, lp.x, lp.y);
    }
    for (const pk of s.parked) {
      if (pk.x < view.x0 - 40 || pk.x > view.x1 + 40 || pk.y < view.y0 - 40 || pk.y > view.y1 + 40) continue;
      drawParked(ctx, pk);
    }
    for (const rb of s.roadblocks) drawRoadblock(ctx, s, rb);

    // light layer BEFORE the cars + buildings: pools, cones, siren splash
    drawLights(ctx, s, view);

    // cars: traffic, patrols, then the player on top
    for (const c of s.civs) {
      if (c.x < view.x0 - 50 || c.x > view.x1 + 50 || c.y < view.y0 - 50 || c.y > view.y1 + 50) continue;
      drawCiv(ctx, c);
    }
    for (const c of s.cops) {
      if (c.x < view.x0 - 60 || c.x > view.x1 + 60 || c.y < view.y0 - 60 || c.y > view.y1 + 60) continue;
      drawCop(ctx, s, c);
    }
    drawPlayerCar(ctx, s);

    // smoke clouds float ABOVE the cars (they hide what is inside)
    for (const dr of s.drops) if (dr.kind === "smoke") drawSmoke(ctx, dr);

    // buildings LAST in world space: rooftops (offset by parallax) occlude
    // whatever drives behind them, exactly the GTA2 read
    for (const b of s.buildings) {
      if (!inView({ x0: b.x0 - 60, y0: b.y0 - 60, x1: b.x1 + 60, y1: b.y1 + 60 })) continue;
      drawBuilding(ctx, s, b);
    }
    // alley mouths glow gold OVER the wall bases so they read at speed
    for (const al of s.alleys) {
      if (!inView({ x0: al.x0 - 40, y0: al.y0 - 40, x1: al.x1 + 40, y1: al.y1 + 40 })) continue;
      drawAlleyGlow(ctx, s, al);
    }

    // particles + floaters over the roofline for readability
    for (const p of s.parts) {
      ctx.globalAlpha = clamp(p.life * 2.4, 0, 1);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = "800 13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const f of s.floats) {
      ctx.globalAlpha = clamp(f.life * 1.6, 0, 1);
      ctx.fillStyle = f.c;
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 3;
      ctx.strokeText(f.txt, f.x, f.y);
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // 3) screen-space finish: marker arrow, rain, the noir grade, HUD
    drawMarkerArrow(ctx, s, w, h);
    drawRain(ctx, s, w, h);
    drawNoir(ctx, s, w, h);
    drawHUD(ctx, s, w, h);
  },
  done: (s) => s.over,
  score: (s) => Math.round(s.score),
};

// ---- roadblock spawn (major streets only, thrown ahead of the player) --------------
function spawnRoadblock(s: S) {
  const sp = Math.hypot(s.vx, s.vy);
  const dx = sp > 20 ? s.vx / sp : Math.cos(s.heading);
  const dy = sp > 20 ? s.vy / sp : Math.sin(s.heading);
  const px = s.x + dx * 700;
  const py = s.y + dy * 700;
  // nearest lattice node that sits on a MAJOR street, far enough to set up
  let best: { i: number; j: number } | null = null;
  let bd = Infinity;
  for (let i = 0; i <= GW; i++) {
    for (let j = 0; j <= GH; j++) {
      if (!s.vs[i].major && !s.hs[j].major) continue;
      const nx = nodeX(s, i);
      const ny = nodeY(s, j);
      const dPlayer = Math.hypot(nx - s.x, ny - s.y);
      if (dPlayer < 420 || dPlayer > 1000) continue;
      const d = Math.hypot(nx - px, ny - py);
      if (d < bd) {
        bd = d;
        best = { i, j };
      }
    }
  }
  if (!best) return;
  // block the axis the player is travelling: moving mostly vertical means a
  // barrier ACROSS the vertical street (the line runs horizontally)
  const vertTravel = Math.abs(dy) > Math.abs(dx);
  const horiz = vertTravel ? s.vs[best.i].major : !s.hs[best.j].major ? true : false;
  const street = horiz ? s.vs[best.i] : s.hs[best.j];
  const half = street.w / 2 - 6;
  const gapSide = s.rng() < 0.5 ? -1 : 1;
  const circles: { ox: number; oy: number; r: number }[] = [];
  for (let o = -half + 10; o <= half - 10; o += 22) {
    // leave a one-car gap at the chosen end (thread it for a bonus)
    if (gapSide > 0 && o > half - 56) continue;
    if (gapSide < 0 && o < -half + 56) continue;
    circles.push({ ox: horiz ? o : 0, oy: horiz ? 0 : o, r: 13 });
  }
  const cars: RoadblockCar[] = [
    { ox: horiz ? -half * 0.45 : 0, oy: horiz ? 0 : -half * 0.45, ang: (horiz ? 0 : Math.PI / 2) + 0.5 },
    { ox: horiz ? half * 0.45 : 0, oy: horiz ? 0 : half * 0.45, ang: (horiz ? 0 : Math.PI / 2) - 0.5 },
  ];
  s.roadblocks.push({
    x: nodeX(s, best.i),
    y: nodeY(s, best.j),
    horiz,
    life: RB_LIFE,
    circles,
    cars,
    gapSide,
    armedSign: 0,
    hit: false,
    threaded: false,
  });
}

// ---- small draw helpers -------------------------------------------------------------
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawStarShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) {
  ctx.fillStyle = c;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// ---- draw: ground, streets, alleys ---------------------------------------------------
function drawGroundAndStreets(ctx: CanvasRenderingContext2D, s: S, view: Rect) {
  // asphalt base across the whole view (streets ARE the ground plane)
  const g = ctx.createLinearGradient(view.x0, view.y0, view.x0, view.y1);
  g.addColorStop(0, ASPHALT);
  g.addColorStop(1, ASPHALT2);
  ctx.fillStyle = g;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);

  // sidewalk slabs under every block
  for (const bl of s.blocks) {
    if (bl.x1 < view.x0 || bl.x0 > view.x1 || bl.y1 < view.y0 || bl.y0 > view.y1) continue;
    ctx.fillStyle = SIDEWALK_C;
    ctx.fillRect(bl.x0, bl.y0, bl.x1 - bl.x0, bl.y1 - bl.y0);
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bl.x0 + 0.5, bl.y0 + 0.5, bl.x1 - bl.x0 - 1, bl.y1 - bl.y0 - 1);
  }

  // alley corridors carve through the slabs (darker, grimier)
  for (const al of s.alleys) {
    if (al.x1 < view.x0 || al.x0 > view.x1 || al.y1 < view.y0 || al.y0 > view.y1) continue;
    ctx.fillStyle = ALLEY_C;
    ctx.fillRect(al.x0, al.y0, al.x1 - al.x0, al.y1 - al.y0);
    const cx = (al.x0 + al.x1) / 2;
    const cy = (al.y0 + al.y1) / 2;
    // clutter: a couple of trash bags hugging the walls + a puddle when wet
    const hs = hash2(Math.round(al.x0), Math.round(al.y0));
    ctx.fillStyle = "#080a10";
    if (al.horiz) {
      ctx.fillRect(al.x0 + (al.x1 - al.x0) * (0.2 + hs * 0.5), al.y0 + 3, 9, 6);
      ctx.fillRect(al.x0 + (al.x1 - al.x0) * (0.35 + hs * 0.4), al.y1 - 9, 11, 6);
    } else {
      ctx.fillRect(al.x0 + 3, al.y0 + (al.y1 - al.y0) * (0.2 + hs * 0.5), 6, 9);
      ctx.fillRect(al.x1 - 9, al.y0 + (al.y1 - al.y0) * (0.35 + hs * 0.4), 6, 11);
    }
    if (s.rainy) {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#1a2c38";
      ctx.beginPath();
      ctx.ellipse(cx, cy, al.horiz ? 26 : 9, al.horiz ? 9 : 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // lane markings: dashes on the two-lanes, double gold on the majors
  const y0 = Math.max(view.y0, 0);
  const y1 = Math.min(view.y1, s.cityH);
  for (const st of s.vs) {
    if (st.c + st.w / 2 < view.x0 || st.c - st.w / 2 > view.x1) continue;
    if (st.major) {
      ctx.strokeStyle = "rgba(240,179,64,0.30)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(st.c - 3, y0);
      ctx.lineTo(st.c - 3, y1);
      ctx.moveTo(st.c + 3, y0);
      ctx.lineTo(st.c + 3, y1);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(242,227,194,0.22)";
      ctx.lineWidth = 2;
      ctx.setLineDash([13, 19]);
      ctx.beginPath();
      ctx.moveTo(st.c, y0);
      ctx.lineTo(st.c, y1);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  const x0 = Math.max(view.x0, 0);
  const x1 = Math.min(view.x1, s.cityW);
  for (const st of s.hs) {
    if (st.c + st.w / 2 < view.y0 || st.c - st.w / 2 > view.y1) continue;
    if (st.major) {
      ctx.strokeStyle = "rgba(240,179,64,0.30)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, st.c - 3);
      ctx.lineTo(x1, st.c - 3);
      ctx.moveTo(x0, st.c + 3);
      ctx.lineTo(x1, st.c + 3);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(242,227,194,0.22)";
      ctx.lineWidth = 2;
      ctx.setLineDash([13, 19]);
      ctx.beginPath();
      ctx.moveTo(x0, st.c);
      ctx.lineTo(x1, st.c);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // crosswalk ticks at every intersection in view
  ctx.fillStyle = "rgba(242,227,194,0.12)";
  for (const v of s.vs) {
    if (v.c < view.x0 - 80 || v.c > view.x1 + 80) continue;
    for (const hzt of s.hs) {
      if (hzt.c < view.y0 - 80 || hzt.c > view.y1 + 80) continue;
      const hw = v.w / 2;
      const hh = hzt.w / 2;
      for (let k = -2; k <= 2; k++) {
        ctx.fillRect(v.c + k * 9 - 2, hzt.c - hh - 9, 4, 6);
        ctx.fillRect(v.c + k * 9 - 2, hzt.c + hh + 3, 4, 6);
        ctx.fillRect(v.c - hw - 9, hzt.c + k * 9 - 2, 6, 4);
        ctx.fillRect(v.c + hw + 3, hzt.c + k * 9 - 2, 6, 4);
      }
    }
  }
  // asphalt grain: deterministic dark flecks + the odd manhole
  const STEP = 56;
  for (let gx = Math.floor(view.x0 / STEP) * STEP; gx < view.x1; gx += STEP) {
    for (let gy = Math.floor(view.y0 / STEP) * STEP; gy < view.y1; gy += STEP) {
      const hs = hash2(gx, gy);
      if (hs > 0.55) continue;
      const X = gx + hs * 40;
      const Y = gy + hash2(gy, gx) * 40;
      if (hs < 0.06) {
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(X, Y, 5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#1a1e2a";
        ctx.beginPath();
        ctx.arc(X, Y, 1 + hs * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
}

// ---- draw: buildings (the GTA2 rooftop-parallax trick) --------------------------------
function drawBuilding(ctx: CanvasRenderingContext2D, s: S, b: Building) {
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const ox = (cx - s.camX) * ROOF_K * b.hf;
  const oy = (cy - s.camY) * ROOF_K * b.hf;
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;

  // footprint base (street-level walls)
  ctx.fillStyle = WALL;
  ctx.fillRect(b.x0, b.y0, bw, bh);

  // side faces: quads from every footprint corner up to the offset roof
  const fp = [
    [b.x0, b.y0],
    [b.x1, b.y0],
    [b.x1, b.y1],
    [b.x0, b.y1],
  ];
  for (let k = 0; k < 4; k++) {
    const a = fp[k];
    const c = fp[(k + 1) % 4];
    ctx.fillStyle = k % 2 === 0 ? "#111420" : "#0a0c12"; // horizontal vs vertical faces
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.lineTo(c[0] + ox, c[1] + oy);
    ctx.lineTo(a[0] + ox, a[1] + oy);
    ctx.closePath();
    ctx.fill();
  }
  // lit windows on the two visible wall faces
  if (Math.abs(ox) > 3) {
    const fx = ox > 0 ? b.x0 : b.x1; // roof shifts away from this face
    const rows = Math.max(1, Math.floor(bh / 40));
    for (let k = 0; k < rows; k++) {
      const hsv = hash2(b.seed + k, 7);
      if (hsv > 0.4) continue;
      ctx.globalAlpha = 0.25 + hsv;
      ctx.fillStyle = hsv < 0.15 ? ICE : GOLD;
      ctx.fillRect(fx + ox * 0.5 - 1.5, b.y0 + oy * 0.5 + 14 + k * 40 + hsv * 18, 3, 4);
    }
    ctx.globalAlpha = 1;
  }
  if (Math.abs(oy) > 3) {
    const fy = oy > 0 ? b.y0 : b.y1;
    const cols = Math.max(1, Math.floor(bw / 40));
    for (let k = 0; k < cols; k++) {
      const hsv = hash2(b.seed + 31 + k, 13);
      if (hsv > 0.4) continue;
      ctx.globalAlpha = 0.25 + hsv;
      ctx.fillStyle = hsv < 0.15 ? ICE : GOLD;
      ctx.fillRect(b.x0 + ox * 0.5 + 14 + k * 40 + hsv * 18, fy + oy * 0.5 - 1.5, 4, 3);
    }
    ctx.globalAlpha = 1;
  }

  // the roof, offset by the parallax vector
  const rx = b.x0 + ox;
  const ry = b.y0 + oy;
  ctx.fillStyle = ROOF_TONES[b.tone];
  ctx.fillRect(rx, ry, bw, bh);
  // parapet edge + inner line
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(rx + 0.5, ry + 0.5, bw - 1, bh - 1);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + 4.5, ry + 4.5, bw - 9, bh - 9);

  // rooftop furniture (vents / AC / hatches / skylights / a water tower)
  for (const d of b.details) {
    const dx = rx + d.u * bw;
    const dy = ry + d.v * bh;
    if (d.kind === "vent") {
      ctx.fillStyle = "#0c0e14";
      ctx.beginPath();
      ctx.arc(dx, dy, 5.5 * d.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#252a38";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(dx, dy, 5.5 * d.s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#1b202e";
      ctx.beginPath();
      ctx.moveTo(dx - 4 * d.s, dy);
      ctx.lineTo(dx + 4 * d.s, dy);
      ctx.stroke();
    } else if (d.kind === "ac") {
      ctx.fillStyle = "#1d2230";
      ctx.fillRect(dx - 7 * d.s, dy - 5 * d.s, 14 * d.s, 10 * d.s);
      ctx.strokeStyle = "#2c3346";
      ctx.lineWidth = 1;
      ctx.strokeRect(dx - 7 * d.s, dy - 5 * d.s, 14 * d.s, 10 * d.s);
      ctx.beginPath();
      ctx.arc(dx + 2 * d.s, dy, 3 * d.s, 0, Math.PI * 2);
      ctx.stroke();
    } else if (d.kind === "hatch") {
      ctx.fillStyle = "#20242f";
      ctx.fillRect(dx - 4, dy - 4, 8, 8);
      ctx.strokeStyle = "#0c0e14";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dx - 4, dy);
      ctx.lineTo(dx + 4, dy);
      ctx.stroke();
    } else if (d.kind === "skylight") {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = ICE;
      ctx.fillRect(dx - 7, dy - 5, 14, 10);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(77,216,230,0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(dx - 7, dy - 5, 14, 10);
    } else {
      // water tower: the classic rooftop silhouette
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(dx + 3, dy + 3, 10 * d.s, 8 * d.s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#241d15";
      ctx.beginPath();
      ctx.arc(dx, dy, 9 * d.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3a2f22";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(dx, dy, 9 * d.s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(dx, dy, 3.5 * d.s, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // neon roof edge: the noir skyline signature
  if (b.neonSide >= 0) {
    ctx.save();
    ctx.strokeStyle = b.neonCol;
    ctx.shadowColor = b.neonCol;
    ctx.shadowBlur = 9;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (b.neonSide === 0) {
      ctx.moveTo(rx + 3, ry + 2);
      ctx.lineTo(rx + bw - 3, ry + 2);
    } else if (b.neonSide === 1) {
      ctx.moveTo(rx + bw - 2, ry + 3);
      ctx.lineTo(rx + bw - 2, ry + bh - 3);
    } else if (b.neonSide === 2) {
      ctx.moveTo(rx + 3, ry + bh - 2);
      ctx.lineTo(rx + bw - 3, ry + bh - 2);
    } else {
      ctx.moveTo(rx + 2, ry + 3);
      ctx.lineTo(rx + 2, ry + bh - 3);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** Alley mouths carry a soft gold pulse + corner ticks: findable at speed. */
function drawAlleyGlow(ctx: CanvasRenderingContext2D, s: S, al: Alley) {
  const pulse = 0.13 + 0.05 * Math.sin(s.t * 3);
  const mouths = al.horiz
    ? [
        { x: al.x0 + 4, y: (al.y0 + al.y1) / 2 },
        { x: al.x1 - 4, y: (al.y0 + al.y1) / 2 },
      ]
    : [
        { x: (al.x0 + al.x1) / 2, y: al.y0 + 4 },
        { x: (al.x0 + al.x1) / 2, y: al.y1 - 4 },
      ];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const m of mouths) {
    const g = ctx.createRadialGradient(m.x, m.y, 3, m.x, m.y, 30);
    g.addColorStop(0, `rgba(240,179,64,${pulse})`);
    g.addColorStop(1, "rgba(240,179,64,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 30, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // corner ticks on the building edges at each mouth
  ctx.strokeStyle = "rgba(240,179,64,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (al.horiz) {
    for (const mx of [al.x0 + 1, al.x1 - 1]) {
      ctx.moveTo(mx, al.y0 - 1);
      ctx.lineTo(mx + (mx < (al.x0 + al.x1) / 2 ? 9 : -9), al.y0 - 1);
      ctx.moveTo(mx, al.y1 + 1);
      ctx.lineTo(mx + (mx < (al.x0 + al.x1) / 2 ? 9 : -9), al.y1 + 1);
    }
  } else {
    for (const my of [al.y0 + 1, al.y1 - 1]) {
      ctx.moveTo(al.x0 - 1, my);
      ctx.lineTo(al.x0 - 1, my + (my < (al.y0 + al.y1) / 2 ? 9 : -9));
      ctx.moveTo(al.x1 + 1, my);
      ctx.lineTo(al.x1 + 1, my + (my < (al.y0 + al.y1) / 2 ? 9 : -9));
    }
  }
  ctx.stroke();
}

// ---- draw: markers ---------------------------------------------------------------------
function drawMarkers(ctx: CanvasRenderingContext2D, s: S) {
  const cp = s.cps[s.cpIdx];
  if (!cp || s.escaped) return;
  const pulse = 0.7 + 0.3 * Math.sin(s.t * 4);
  ctx.save();
  // outer ring
  ctx.strokeStyle = cp.final ? CRIMSON : GOLD;
  ctx.shadowColor = cp.final ? CRIMSON : GOLD;
  ctx.shadowBlur = 12;
  ctx.globalAlpha = 0.4 + 0.3 * pulse;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, CP_R - 6, 0, Math.PI * 2);
  ctx.stroke();
  // rotating inner dashes
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([12, 14]);
  ctx.lineDashOffset = -s.t * 30;
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, CP_R - 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // center diamond
  ctx.globalAlpha = 1;
  ctx.fillStyle = cp.final ? CRIMSON : GOLD;
  ctx.save();
  ctx.translate(cp.x, cp.y);
  ctx.rotate(Math.PI / 4);
  const dsz = 6 + 2 * pulse;
  ctx.fillRect(-dsz / 2, -dsz / 2, dsz, dsz);
  ctx.restore();
  if (cp.final) {
    ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = CRIMSON;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    ctx.strokeText("EXTRACTION", cp.x, cp.y - CP_R - 6);
    ctx.fillText("EXTRACTION", cp.x, cp.y - CP_R - 6);
  }
  ctx.restore();
  // a faint ghost of the marker after this one (route feel, zero clutter)
  const nx = s.cps[s.cpIdx + 1];
  if (nx) {
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = nx.final ? CRIMSON : GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(nx.x, nx.y, CP_R - 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
/** Screen-edge chevron pointing at the live marker whenever it is off screen. */
function drawMarkerArrow(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  const cp = s.cps[s.cpIdx];
  if (!cp || s.escaped || s.t < COUNT) return;
  const sx = (cp.x - s.camX) * s.zoom + w / 2;
  const sy = (cp.y - s.camY) * s.zoom + h / 2;
  if (sx > 30 && sx < w - 30 && sy > 30 && sy < h - 30) return;
  const cxs = w / 2;
  const cys = h / 2;
  const ang = Math.atan2(sy - cys, sx - cxs);
  // clamp the chevron to the screen border
  const m = 26;
  let ax = cxs + Math.cos(ang) * w;
  let ay = cys + Math.sin(ang) * h;
  ax = clamp(ax, m, w - m);
  ay = clamp(ay, m, h - m);
  const pulse = 0.75 + 0.25 * Math.sin(s.t * 5);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = cp.final ? CRIMSON : GOLD;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -7);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- draw: drops -----------------------------------------------------------------------
function drawOil(ctx: CanvasRenderingContext2D, dr: Drop) {
  const fade = clamp((dr.life - dr.age) / 1.2, 0, 1);
  if (ready(ART.oil)) {
    ctx.globalAlpha = fade;
    const im = ART.oil;
    ctx.drawImage(im, dr.x - dr.r, dr.y - dr.r, dr.r * 2, dr.r * 2 * (im.naturalHeight / im.naturalWidth));
    ctx.globalAlpha = 1;
    return;
  }
  ctx.globalAlpha = fade;
  const g = ctx.createRadialGradient(dr.x - dr.r * 0.3, dr.y - dr.r * 0.3, dr.r * 0.1, dr.x, dr.y, dr.r);
  g.addColorStop(0, "rgba(96,74,128,0.65)");
  g.addColorStop(0.5, "rgba(22,17,32,0.85)");
  g.addColorStop(1, "rgba(10,8,16,0.7)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(dr.x, dr.y, dr.r, dr.r * 0.82, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade * 0.5;
  ctx.strokeStyle = "#a98fd8";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(dr.x, dr.y, dr.r * 0.55, dr.r * 0.4, 0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
function drawSmoke(ctx: CanvasRenderingContext2D, dr: Drop) {
  const grow = 0.5 + 0.5 * Math.min(1, dr.age / 0.4);
  const fade = clamp((dr.life - dr.age) / 0.9, 0, 1) * 0.85;
  const R = dr.r * grow;
  if (ready(ART.smoke)) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + dr.age * 0.7;
      const ox = Math.cos(a) * R * 0.3;
      const oy = Math.sin(a) * R * 0.3;
      ctx.globalAlpha = fade * (0.5 + 0.2 * Math.sin(dr.age * 3 + k));
      const im = ART.smoke;
      ctx.drawImage(im, dr.x + ox - R * 0.8, dr.y + oy - R * 0.8, R * 1.6, R * 1.6 * (im.naturalHeight / im.naturalWidth));
    }
    ctx.globalAlpha = 1;
    return;
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + dr.age * 0.8 + k;
    const ox = Math.cos(a) * R * 0.32;
    const oy = Math.sin(a) * R * 0.32;
    const rr = R * (0.55 + 0.15 * Math.sin(dr.age * 4 + k * 2));
    const g = ctx.createRadialGradient(dr.x + ox, dr.y + oy, rr * 0.2, dr.x + ox, dr.y + oy, rr);
    g.addColorStop(0, `rgba(214,218,228,${0.5 * fade})`);
    g.addColorStop(1, "rgba(150,155,170,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(dr.x + ox, dr.y + oy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = fade * 0.16;
  ctx.fillStyle = ICE;
  ctx.beginPath();
  ctx.arc(dr.x, dr.y, R * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---- draw: cars -------------------------------------------------------------------------
/** The agency getaway coupe, top-down, drawn facing RIGHT. */
function drawCoupe(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = INK;
  rrect(ctx, -13, -9.5, 7.5, 4.5, 2);
  ctx.fill();
  rrect(ctx, -13, 5, 7.5, 4.5, 2);
  ctx.fill();
  rrect(ctx, 6.5, -9.5, 7.5, 4.5, 2);
  ctx.fill();
  rrect(ctx, 6.5, 5, 7.5, 4.5, 2);
  ctx.fill();
  ctx.fillStyle = "#1e2028"; // rear spoiler
  rrect(ctx, -19, -6.5, 3.5, 13, 1.5);
  ctx.fill();
  ctx.fillStyle = CREAM; // long-hood coupe, crimson twin stripe
  rrect(ctx, -17, -7.5, 34, 15, 5.5);
  ctx.fill();
  ctx.strokeStyle = "#b8a577";
  ctx.lineWidth = 1;
  rrect(ctx, -17, -7.5, 34, 15, 5.5);
  ctx.stroke();
  ctx.fillStyle = CRIMSON;
  ctx.fillRect(-17, -3, 34, 1.9);
  ctx.fillRect(-17, 1.1, 34, 1.9);
  ctx.fillStyle = INK;
  rrect(ctx, -5, -5.5, 11, 11, 3);
  ctx.fill();
  ctx.fillStyle = "#3b4254";
  rrect(ctx, 4, -4.5, 3.5, 9, 1.5);
  ctx.fill();
  rrect(ctx, -6.5, -4.5, 3, 9, 1.5);
  ctx.fill();
  ctx.fillStyle = "#ffe9b0";
  ctx.fillRect(16, -5.5, 1.6, 3);
  ctx.fillRect(16, 2.5, 1.6, 3);
  ctx.fillStyle = CRIMSON;
  ctx.fillRect(-17.6, -5.5, 1.6, 3);
  ctx.fillRect(-17.6, 2.5, 1.6, 3);
}
/** Patrol car with a light bar, top-down, facing RIGHT (era-neutral cartoon). */
function drawPatrolCar(ctx: CanvasRenderingContext2D, phase: boolean) {
  ctx.fillStyle = INK;
  rrect(ctx, -12, -9, 7, 4, 2);
  ctx.fill();
  rrect(ctx, -12, 5, 7, 4, 2);
  ctx.fill();
  rrect(ctx, 6, -9, 7, 4, 2);
  ctx.fill();
  rrect(ctx, 6, 5, 7, 4, 2);
  ctx.fill();
  // black-and-white body
  ctx.fillStyle = "#dfe3ec";
  rrect(ctx, -16, -7, 32, 14, 5);
  ctx.fill();
  ctx.strokeStyle = "#9aa2b5";
  ctx.lineWidth = 1;
  rrect(ctx, -16, -7, 32, 14, 5);
  ctx.stroke();
  ctx.fillStyle = "#15171d"; // hood + trunk panels
  rrect(ctx, 8, -6, 7, 12, 3);
  ctx.fill();
  rrect(ctx, -15, -6, 6, 12, 3);
  ctx.fill();
  ctx.fillStyle = "#0d0f14"; // roof
  rrect(ctx, -5, -5, 10, 10, 3);
  ctx.fill();
  // light bar: ice cell + crimson cell, strobing
  ctx.fillStyle = phase ? ICE : "#1b4a52";
  ctx.fillRect(-2.6, -4.6, 2.4, 3.6);
  ctx.fillStyle = phase ? "#5a2028" : CRIMSON;
  ctx.fillRect(0.2, -4.6, 2.4, 3.6);
  ctx.fillStyle = phase ? ICE : "#1b4a52";
  ctx.fillRect(0.2, 1, 2.4, 3.6);
  ctx.fillStyle = phase ? "#5a2028" : CRIMSON;
  ctx.fillRect(-2.6, 1, 2.4, 3.6);
  ctx.fillStyle = "#d9e6ff";
  ctx.fillRect(15, -5, 1.5, 2.6);
  ctx.fillRect(15, 2.4, 1.5, 2.6);
}
/** Civilian sedan, top-down, facing RIGHT. */
function drawCivCar(ctx: CanvasRenderingContext2D, tone: number) {
  ctx.fillStyle = INK;
  rrect(ctx, -11, -8.5, 6.5, 4, 2);
  ctx.fill();
  rrect(ctx, -11, 4.5, 6.5, 4, 2);
  ctx.fill();
  rrect(ctx, 5.5, -8.5, 6.5, 4, 2);
  ctx.fill();
  rrect(ctx, 5.5, 4.5, 6.5, 4, 2);
  ctx.fill();
  ctx.fillStyle = CIV_TONES[tone];
  rrect(ctx, -15, -6.5, 30, 13, 4.5);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  rrect(ctx, -15, -6.5, 30, 13, 4.5);
  ctx.stroke();
  ctx.fillStyle = "rgba(10,12,18,0.85)";
  rrect(ctx, -4.5, -4.5, 9.5, 9, 2.5);
  ctx.fill();
  ctx.fillStyle = "#e8d9a8";
  ctx.fillRect(14, -4.5, 1.4, 2.4);
  ctx.fillRect(14, 2.1, 1.4, 2.4);
  ctx.fillStyle = "#7a2731";
  ctx.fillRect(-15.4, -4.5, 1.4, 2.4);
  ctx.fillRect(-15.4, 2.1, 1.4, 2.4);
}
function drawPlayerCar(ctx: CanvasRenderingContext2D, s: S) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(s.x + 2, s.y + 4, 16, 8, s.heading, 0, Math.PI * 2);
  ctx.fill();
  const blink = s.iframes > 0 && Math.floor(s.t * 18) % 2 === 0;
  if (blink) return;
  sprRot(ctx, ART.player, s.x, s.y, s.heading, 40, () => {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.heading);
    drawCoupe(ctx);
    ctx.restore();
  });
}
function drawCop(ctx: CanvasRenderingContext2D, s: S, c: Cop) {
  ctx.globalAlpha = c.alpha;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(c.x + 2, c.y + 4, 15, 7.5, c.heading + c.spinA, 0, Math.PI * 2);
  ctx.fill();
  const phase = Math.floor(c.ph * 7) % 2 === 0;
  sprRot(ctx, ART.patrol, c.x, c.y, c.heading + c.spinA, 38, () => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.heading + c.spinA);
    drawPatrolCar(ctx, phase);
    ctx.restore();
  });
  if (c.mode === "spin" || c.mode === "gone") {
    for (let k = 0; k < 3; k++) {
      const a = s.t * 5 + (k / 3) * Math.PI * 2;
      drawStarShape(ctx, c.x + Math.cos(a) * 18, c.y - 16 + Math.sin(a) * 5, 4, "#fff3b0");
    }
  }
  ctx.globalAlpha = 1;
}
function drawCiv(ctx: CanvasRenderingContext2D, c: Civ) {
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(c.x + 2, c.y + 3, 14, 7, c.heading, 0, Math.PI * 2);
  ctx.fill();
  sprRot(ctx, ART.traffic, c.x, c.y, c.heading, 34, () => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.heading + (c.jolt > 0 ? Math.sin(c.jolt * 20) * 0.1 : 0));
    drawCivCar(ctx, c.tone);
    ctx.restore();
  });
}
function drawParked(ctx: CanvasRenderingContext2D, pk: Parked) {
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(pk.x + 2, pk.y + 3, 13, 6.5, pk.ang, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(pk.x, pk.y);
  ctx.rotate(pk.ang);
  ctx.globalAlpha = 0.9;
  drawCivCar(ctx, pk.tone);
  ctx.restore();
  ctx.globalAlpha = 1;
}
function drawHydrant(ctx: CanvasRenderingContext2D, hy: Hydrant) {
  if (hy.burst > 0) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#2a4a5c";
    ctx.beginPath();
    ctx.ellipse(hy.x, hy.y + 2, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = CRIMSON;
  rrect(ctx, hy.x - 3, hy.y - 6, 6, 8, 2);
  ctx.fill();
  ctx.fillStyle = "#8f2531";
  ctx.beginPath();
  ctx.arc(hy.x, hy.y - 6, 3, Math.PI, 0);
  ctx.fill();
}
function drawLampPost(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#20242f";
  ctx.fillRect(x - 1.2, y - 2, 2.4, 5);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(x, y - 4, 2.6, 0, Math.PI * 2);
  ctx.fill();
}
function drawRoadblock(ctx: CanvasRenderingContext2D, s: S, rb: Roadblock) {
  const fade = clamp(rb.life / 1.2, 0, 1);
  ctx.globalAlpha = fade;
  // barrier stripe spanning the covered circles
  let lo = Infinity;
  let hi = -Infinity;
  for (const ci of rb.circles) {
    const o = rb.horiz ? ci.ox : ci.oy;
    lo = Math.min(lo, o - 11);
    hi = Math.max(hi, o + 11);
  }
  ctx.save();
  ctx.translate(rb.x, rb.y);
  if (!rb.horiz) ctx.rotate(Math.PI / 2);
  for (let o = lo; o < hi; o += 14) {
    ctx.fillStyle = Math.floor((o - lo) / 14) % 2 === 0 ? GOLD : INK;
    ctx.fillRect(o, -4, Math.min(14, hi - o), 8);
  }
  ctx.fillStyle = INK;
  ctx.fillRect(lo, 4, 3, 5);
  ctx.fillRect(hi - 3, 4, 3, 5);
  // flares at both ends
  const pulse = 0.5 + 0.5 * Math.sin(s.t * 6);
  ctx.globalAlpha = fade * (0.5 + 0.5 * pulse);
  ctx.fillStyle = CRIMSON;
  ctx.beginPath();
  ctx.arc(lo - 6, 0, 3, 0, Math.PI * 2);
  ctx.arc(hi + 6, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // the two parked patrol units
  ctx.globalAlpha = fade;
  for (const car of rb.cars) {
    ctx.save();
    ctx.translate(rb.x + car.ox, rb.y + car.oy);
    ctx.rotate(car.ang);
    drawPatrolCar(ctx, Math.floor(s.t * 6) % 2 === 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---- draw: light layer --------------------------------------------------------------
function drawLights(ctx: CanvasRenderingContext2D, s: S, view: Rect) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // streetlight pools (+ wet streaks when raining)
  for (const lp of s.lamps) {
    if (lp.x < view.x0 - 90 || lp.x > view.x1 + 90 || lp.y < view.y0 - 90 || lp.y > view.y1 + 90) continue;
    const g = ctx.createRadialGradient(lp.x, lp.y, 4, lp.x, lp.y, 64);
    g.addColorStop(0, "rgba(240,179,64,0.26)");
    g.addColorStop(1, "rgba(240,179,64,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 64, 0, Math.PI * 2);
    ctx.fill();
    if (s.rainy) {
      ctx.globalAlpha = 0.09;
      const lg = ctx.createLinearGradient(lp.x, lp.y, lp.x, lp.y + 44);
      lg.addColorStop(0, GOLD);
      lg.addColorStop(1, "rgba(240,179,64,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(lp.x - 3, lp.y, 6, 44);
      ctx.globalAlpha = 1;
    }
  }
  // headlight cones
  const cone = (x: number, y: number, ang: number, col: string, alpha: number, L: number) => {
    const SPREAD = 0.26;
    const tipX = x + Math.cos(ang) * 14;
    const tipY = y + Math.sin(ang) * 14;
    const g = ctx.createRadialGradient(tipX, tipY, 4, tipX, tipY, L);
    g.addColorStop(0, col);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.arc(tipX, tipY, L, ang - SPREAD, ang + SPREAD);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  cone(s.x, s.y, s.heading, "rgba(255,238,190,0.5)", 0.85, 120);
  for (const c of s.civs) {
    if (c.x < view.x0 - 140 || c.x > view.x1 + 140 || c.y < view.y0 - 140 || c.y > view.y1 + 140) continue;
    cone(c.x, c.y, c.heading, "rgba(232,217,168,0.35)", 0.5, 80);
  }
  // siren splash: the strobe paints the street and the wall bases
  for (const c of s.cops) {
    if (c.mode === "gone" || c.x < view.x0 - 120 || c.x > view.x1 + 120 || c.y < view.y0 - 120 || c.y > view.y1 + 120)
      continue;
    cone(c.x, c.y, c.heading + c.spinA, "rgba(210,228,255,0.4)", 0.7 * c.alpha, 110);
    const phase = Math.floor(c.ph * 7) % 2 === 0;
    const col = phase ? "rgba(77,216,230," : "rgba(227,61,78,";
    const g = ctx.createRadialGradient(c.x, c.y, 3, c.x, c.y, 52);
    g.addColorStop(0, `${col}0.30)`);
    g.addColorStop(1, `${col}0)`);
    ctx.globalAlpha = 0.75 * c.alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // the live marker throws a beacon glow
  const cp = s.cps[s.cpIdx];
  if (cp && !s.escaped) {
    const pulse = 0.1 + 0.06 * Math.sin(s.t * 4);
    const col = cp.final ? "227,61,78" : "240,179,64";
    const g = ctx.createRadialGradient(cp.x, cp.y, 6, cp.x, cp.y, 80);
    g.addColorStop(0, `rgba(${col},${pulse + 0.08})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, 80, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- draw: screen-space finish ---------------------------------------------------------
function drawRain(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  if (!s.rainy) return;
  const density = REDUCED_MOTION ? 10 : 30;
  ctx.save();
  ctx.strokeStyle = "rgba(160,220,235,0.26)";
  ctx.lineWidth = 1.2;
  for (let k = 0; k < density; k++) {
    const x = ((hash2(k, 1) * w * 1.3 + s.t * 40 * (0.5 + hash2(k, 3))) % (w + 40)) - 20;
    const y = (hash2(k, 2) * h + s.t * (480 + hash2(k, 5) * 220)) % h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5, y + 14);
    ctx.stroke();
  }
  ctx.restore();
}
/** The noir print: a cold grade, grain, vignette, and a max-heat edge pulse. */
function drawNoir(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  ctx.fillStyle = "rgba(77,216,230,0.028)";
  ctx.fillRect(0, 0, w, h);
  // grain (static under reduced motion, flickers at 12fps otherwise)
  const frame = REDUCED_MOTION ? 0 : Math.floor(s.t * 12);
  for (let k = 0; k < 120; k++) {
    const hs = hash2(k * 31 + frame * 7, k * 17 + frame * 13);
    const x = hs * w;
    const y = hash2(k * 13 + frame * 5, k * 7 + frame * 3) * h;
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = hs < 0.5 ? "#000" : "#fff";
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.82);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.44)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  // four+ stars: the screen edge breathes crimson (you are VERY wanted)
  if (s.heat >= 4 && !s.escaped) {
    const p = 0.05 + 0.035 * Math.sin(s.t * 5) + s.heatFlash * 0.05;
    const eg = ctx.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, h * 0.75);
    eg.addColorStop(0, "rgba(227,61,78,0)");
    eg.addColorStop(1, `rgba(227,61,78,${p})`);
    ctx.fillStyle = eg;
    ctx.fillRect(0, 0, w, h);
  }
}

// ---- HUD -----------------------------------------------------------------------------
function drawHUD(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  // score + run stats (top left)
  ctx.textAlign = "left";
  ctx.fillStyle = WHITE;
  ctx.font = "800 20px ui-sans-serif, system-ui, sans-serif";
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 3;
  const sc = String(Math.round(s.score));
  ctx.strokeText(sc, 12, 26);
  ctx.fillText(sc, 12, 26);
  ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = CREAM;
  const line = `${s.dropsGot} dropped · ${s.cpGot} markers`;
  ctx.strokeText(line, 12, 42);
  ctx.fillText(line, 12, 42);

  // mute toggle (its tap zone is exempt from gadget drops)
  drawMuteIcon(ctx);

  // clock (top right)
  const raceT = Math.max(0, s.t - COUNT);
  const left = Math.max(0, Math.ceil(RUN_SECONDS - raceT));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  ctx.textAlign = "right";
  ctx.font = "800 18px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = left <= 10 ? "#ffe9b0" : WHITE;
  ctx.strokeText(clock, w - 12, 26);
  ctx.fillText(clock, w - 12, 26);

  // HEAT STARS under the clock (the GTA read) + the score multiplier
  const starR = 6.5 + s.heatFlash * 2;
  for (let k = 0; k < HEAT_MAX; k++) {
    const x = w - 12 - (HEAT_MAX - 1 - k) * 17 - 6;
    const filled = k < s.heat;
    if (filled) drawStarShape(ctx, x, 40, starR, s.heat >= 4 ? CRIMSON : GOLD);
    else {
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, 40, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = s.escaped ? ICE : s.anySight ? CRIMSON : ICE;
  const status = s.escaped ? "GONE" : s.anySight ? "SPOTTED" : "CLEAR";
  ctx.strokeText(`x${heatMult(s).toFixed(1)} · ${status}`, w - 12, 58);
  ctx.fillText(`x${heatMult(s).toFixed(1)} · ${status}`, w - 12, 58);

  if (s.practice) {
    ctx.textAlign = "center";
    ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(94,234,212,0.9)";
    ctx.fillText("PRACTICE", w / 2, 18);
  }

  // gadget dial (display-only: a quick tap ANYWHERE drops; this shows what and when)
  const bx = 38;
  const by = h - 64;
  const readyNow = s.gadgetCd <= 0;
  ctx.fillStyle = readyNow ? "rgba(240,179,64,0.85)" : "rgba(13,17,32,0.6)";
  ctx.beginPath();
  ctx.arc(bx, by, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(bx, by, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = ICE;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(bx, by, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (readyNow ? 1 : clamp(1 - s.gadgetCd / GADGET_CD, 0, 1)));
  ctx.stroke();
  // icon: what drops NEXT (smoke puffs or an oil droplet)
  if (s.nextGadget === "smoke") {
    ctx.fillStyle = readyNow ? "#1a1205" : STEEL;
    ctx.beginPath();
    ctx.arc(bx - 5, by + 2, 4.4, 0, Math.PI * 2);
    ctx.arc(bx + 1, by - 3, 5.4, 0, Math.PI * 2);
    ctx.arc(bx + 6, by + 2.5, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = readyNow ? "#1a1205" : STEEL;
    ctx.beginPath();
    ctx.moveTo(bx, by - 8);
    ctx.bezierCurveTo(bx + 7, by + 1, bx + 5.5, by + 8, bx, by + 8);
    ctx.bezierCurveTo(bx - 5.5, by + 8, bx - 7, by + 1, bx, by - 8);
    ctx.fill();
  }
  ctx.textAlign = "center";
  ctx.font = "800 8.5px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = readyNow ? "rgba(26,18,5,0.9)" : "#5b6478";
  ctx.fillText("DROP", bx, by + 33);

  // speed bar (bottom left, under the dial)
  const spd = clamp(Math.hypot(s.vx, s.vy) / s.topSpeed, 0, 1);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(14, h - 20, 110, 6);
  ctx.fillStyle = spd > 0.9 ? GOLD : "#86f0c4";
  ctx.fillRect(14, h - 20, spd * 110, 6);

  // minimap: the whole grid + the hunt, bottom right
  drawMinimap(ctx, s, w, h);

  // countdown card
  if (s.t < COUNT) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(5,7,12,0.55)";
    ctx.fillRect(0, h * 0.3, w, h * 0.26);
    ctx.fillStyle = ICE;
    ctx.font = "800 24px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(s.district, w / 2, h * 0.38);
    ctx.fillStyle = "#aeb6c8";
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("hit the markers · alleys shed heat", w / 2, h * 0.38 + 20);
    ctx.fillStyle = CREAM;
    ctx.font = "800 46px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(String(Math.max(1, Math.ceil(COUNT - s.t))), w / 2, h * 0.38 + 66);
    ctx.fillStyle = STEEL;
    ctx.font = "600 11.5px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("hold to steer · quick tap drops smoke and oil", w / 2, h * 0.38 + 88);
  }

  // big message
  if (s.msgT > 0 && s.t >= COUNT) {
    ctx.globalAlpha = Math.min(1, s.msgT);
    ctx.textAlign = "center";
    ctx.fillStyle = s.msg.startsWith("EXTRACT") ? GOLD : s.msg === "GO!" ? ICE : CRIMSON;
    ctx.font = "800 30px ui-sans-serif, system-ui, sans-serif";
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 4;
    ctx.strokeText(s.msg, w / 2, h * 0.34);
    ctx.fillText(s.msg, w / 2, h * 0.34);
    ctx.globalAlpha = 1;
  }
}
function drawMuteIcon(ctx: CanvasRenderingContext2D) {
  const muted = sfxInst ? sfxInst.muted() : true;
  const x = 14;
  const y = 54;
  ctx.save();
  ctx.fillStyle = "rgba(13,17,32,0.55)";
  rrect(ctx, x - 2, y - 2, 34, 30, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  rrect(ctx, x - 2, y - 2, 34, 30, 7);
  ctx.stroke();
  ctx.fillStyle = muted ? "#5b6478" : CREAM;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 10);
  ctx.lineTo(x + 11, y + 10);
  ctx.lineTo(x + 17, y + 4);
  ctx.lineTo(x + 17, y + 22);
  ctx.lineTo(x + 11, y + 16);
  ctx.lineTo(x + 6, y + 16);
  ctx.closePath();
  ctx.fill();
  if (muted) {
    ctx.strokeStyle = CRIMSON;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 8);
    ctx.lineTo(x + 27, y + 18);
    ctx.stroke();
  } else {
    ctx.strokeStyle = ICE;
    ctx.lineWidth = 2;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.arc(x + 17, y + 13, 5 + k * 4, -0.8, 0.8);
      ctx.stroke();
    }
  }
  ctx.restore();
}
function drawMinimap(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  const mm = 92;
  const pad = 12;
  const mx = w - mm - pad;
  const my = h - mm - pad;
  const sc = (mm - 10) / Math.max(s.cityW, s.cityH);
  const MX = (x: number) => mx + 5 + x * sc + (mm - 10 - s.cityW * sc) / 2;
  const MY = (y: number) => my + 5 + y * sc + (mm - 10 - s.cityH * sc) / 2;
  ctx.fillStyle = "rgba(8,11,20,0.62)";
  rrect(ctx, mx, my, mm, mm, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  for (const bl of s.blocks) {
    ctx.fillRect(MX(bl.x0), MY(bl.y0), (bl.x1 - bl.x0) * sc, (bl.y1 - bl.y0) * sc);
  }
  const cp = s.cps[s.cpIdx];
  if (cp && !s.escaped) {
    const pulse = 0.6 + 0.4 * Math.sin(s.t * 5);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = cp.final ? CRIMSON : GOLD;
    ctx.beginPath();
    ctx.arc(MX(cp.x), MY(cp.y), 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const c of s.cops) {
    if (c.mode === "gone") continue;
    ctx.fillStyle = CRIMSON;
    ctx.beginPath();
    ctx.arc(MX(c.x), MY(c.y), 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(MX(s.x), MY(s.y), 2.6, 0, Math.PI * 2);
  ctx.fill();
}

// ---- page ------------------------------------------------------------------------------
export default function GetawayGame() {
  // ?practice=1 = free warm-up: no wallet gate, no server calls, nothing banks.
  // Read once on mount (plain <a> links force a reload when switching modes).
  const [practice, setPractice] = useState(false);
  useEffect(() => {
    setPractice(new URLSearchParams(window.location.search).get("practice") === "1");
  }, []);
  return (
    <GameShell
      game="getaway"
      title="The Getaway"
      practice={practice}
      instructions="The job is done and the whole city is looking for you. Hit every glowing marker across the grid and reach the extraction before the 70 second clock. Steer with A and D or the arrows, space drops your gadget. On a touch screen, press and hold where you want to go and the car follows your finger. Quick tap anywhere to drop, alternating smoke and oil. Patrol cars are too clumsy for the narrow alleys: thread the gold-edged cuts to break line of sight and your heat stars fall. Stay spotted and the heat climbs, bringing more and faster patrols, but every marker banks bigger while you are wanted."
      handle={handle}
    />
  );
}
