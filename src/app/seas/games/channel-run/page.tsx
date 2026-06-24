"use client";

/**
 * THE CHANNEL RUN · Conquer the Seas daily auto-scroller.
 *
 * Paperboy-style 5-lane channel, 90 seconds. The channel is a centered
 * PORTRAIT COLUMN (playW = min(w - 24, h * 0.6, 560)); outside it the canvas
 * is open dark sea, then a seeded strip of night coastline on each side, so
 * a wide monitor gets a tall narrow strip with small ships and long
 * sightlines instead of giant close-up sprites. The full obstacle timeline
 * is built up front from seededRng(dayKeyUTC() + ":channel-run"), so every
 * captain faces the same sea today. Dodge rocks and whirlpools, shoot enemy
 * sloops and barrels, sail over doubloons. Score = distance (10/s) + kill
 * and pickup points.
 *
 * Captain stats: hull sets HP (1 + min(4, floor(log10(1 + hull_usd)))) and
 * the HULL CLASS (>= 100 Flagship, >= 50 Galleon, >= 25 Frigate, >= 5
 * Sloop, else Dinghy), which sets the player sprite width (laneW * 0.34 ..
 * 0.66) and with it the hitbox width (0.48 of sprite width each side).
 * cannons cut volley cooldown (max(300, 900 - 120*cannons) ms) AND set the
 * VOLLEY TIER: 0-1 = one bow shot, 2-3 = two straight rail shots, 4-5 =
 * triple (two rail shots angled SPREAD_DEG outward + one straight bow
 * shot). sails speed up lane tweens (x(1 + 0.15*sails)).
 *
 * The player ship is COMPOSED from Kenney top-down parts on an offscreen
 * canvas, once per (hull class, volley tier) and cached: hull + one sail +
 * exactly as many visible cannons as the volley fires, mounted where the
 * shots actually spawn. Muzzle flash positions come from the same geometry.
 *
 * RENDERING RULE: canvas entities are ALWAYS sprites (Kenney PNGs) or drawn
 * vector shapes, never emoji or text glyphs. Emoji fonts size unpredictably
 * across devices (tofu boxes, giant glyphs); emoji live only in DOM chrome
 * (HUD chips, buttons, overlays). Everything on canvas is sized relative to
 * laneW (= playW / 5) so nothing can ever render giant.
 */

import { useEffect, useRef, useState } from "react";
import type { Captain } from "../shared";
import {
  FG,
  FG3,
  GOLD,
  GOLD_BRIGHT,
  HAIRLINE,
  INK,
  KENNEY,
  GameHeader,
  ScoreBanner,
  dayKeyUTC,
  drawSprite,
  loadImages,
  seededRng,
  useSeasGame,
} from "../shared";

const GAME_KEY = "channel-run";
const DURATION = 90; // seconds
const LANES = 5;
const SCROLL = 0.55; // canvas heights per second, downward
const SHIP_Y = 0.8; // ship center as fraction of column height (low = long sightline)
const BALL_VY = 0.88; // cannonball, heights per second
const SHOT_VY = -1.55; // player shot, heights per second
const SPREAD_DEG = 14; // outward lean of the two rail cannons in the x3 volley
const FX_CAP = 48; // hard ceiling on concurrent cosmetic fx (rings/muzzle/booms); render-only, never gameplay

/**
 * LIVES. The hull-derived hp pool decides how many hits a single life can soak
 * (1 for a dinghy/guest, up to 5 for a flagship); LIVES is a separate top-level
 * counter so even a single-hp dinghy survives several mistakes and a scored run
 * lasts ~60-90s instead of ending on the first hit. Losing the last hp of a
 * life burns one life, then (if any remain) the hull hp refills, the ship
 * respawns at lane center and a longer grace window opens. The run ends only
 * when the last life is gone (hp <= 0 AND lives <= 0) or the channel completes.
 * LIVES never touch the score: dist is capped by DURATION and bonusPts come
 * from the fixed daily timeline, so surviving longer can never push the score
 * past the same natural cap a flawless run already hits.
 */
const START_LIVES = 3;
const HIT_INVULN = 1.2; // grace seconds after a non-fatal hit (unchanged)
const RESPAWN_INVULN = 2.2; // longer grace after losing a life and respawning

/**
 * SPYGLASS lookahead (captain.fittings.spyglass, 0-5). Pure information aid:
 * for each hazard still ahead in the daily timeline, once it is within
 * (LEAD_BASE + spyglass * LEAD_PER) seconds of entering the visible top of
 * the channel, a faint pulsing chevron ping is drawn in its lane at the top
 * edge. Higher spyglass = longer warning. Level 0 (and all guests) = no
 * pings. This NEVER touches spawn timing, positions, collisions, scoring or
 * submit; it only reads g.events (already built from the daily seed).
 */
const SPYGLASS_LEAD_BASE = 0.55; // seconds of warning at spyglass 1
const SPYGLASS_LEAD_PER = 0.5; // extra warning seconds per spyglass level
const PING_ROSE = "248,113,140"; // hits (rock, whirlpool): unshootable danger
const PING_GOLD = "240,180,92"; // shootables (enemy sloop): can be cleared with fire

/**
 * The playable channel is a centered portrait column, NOT the full canvas.
 * Everything (lanes, sprites, hitboxes) derives from laneW = playW / 5, so
 * on a wide desktop the game reads like a tall Paperboy strip flanked by
 * coastline and open sea, instead of five giant lanes spanning the monitor.
 */
function channelLayout(w: number, h: number) {
  const playW = Math.max(100, Math.min(w - 24, h * 0.6, 560));
  const playX0 = (w - playW) / 2;
  return { playW, playX0, laneW: playW / LANES };
}

/**
 * Hull class from captain.hull_usd, EXACTLY matching the bot's tiers.
 * Index 0..4 = Dinghy, Sloop, Frigate, Galleon, Flagship.
 */
function hullClassOf(hullUsd: number): number {
  return hullUsd >= 100 ? 4 : hullUsd >= 50 ? 3 : hullUsd >= 25 ? 2 : hullUsd >= 5 ? 1 : 0;
}
const CLASS_W = [0.34, 0.42, 0.5, 0.58, 0.66]; // sprite width in laneW units, Dinghy..Flagship
const CLASS_NAMES = ["Dinghy", "Sloop", "Frigate", "Galleon", "Flagship"];

/** Volley tier from cannons fitting level: 0-1 one bow shot, 2-3 rail pair, 4-5 triple. */
function volleyOf(cannons: number): 1 | 2 | 3 {
  return cannons >= 4 ? 3 : cannons >= 2 ? 2 : 1;
}

/**
 * Sprite manifest (each one visually verified against the PNG):
 *   hullL    hullLarge (1)   pristine brown top-down hull, 50x108, bow up
 *   hullS    hullSmall (1)   pristine narrow hull, 40x108, bow up
 *   sailL    sailLarge (7)   pristine gold sail, white X emblem, 66 wide
 *   sailS    sailSmall (7)   pristine gold yard sail strip, 42x9
 *   cannon   cannon          top-down cannon, carriage left, BARREL POINTS RIGHT
 *   flagG    flag (6)        gold masthead pennant, 6x22
 *   nest     nest            crow's-nest bowl, 20x18 (Flagship bow platform)
 *   pole     pole            mast disc seen from above, 12x11 (Sloop detail)
 *   player   ship (5)        pre-composed Kenney ship, fallback only
 *   enemy    ship (2)        dark pirate livery with skull sail (rotated 180)
 *   rock     tile_66         gray water-rock cluster, lighter top facets
 *   plant    tile_70         three-lobed green shore plant (coast prop)
 *   ball     cannonBall      round dark shot (enemy fire and player shots)
 *   boom1-3  explosion       sloop death burst, played over ~300ms
 *   fire1-2  fire            hull flames right after the player takes a hit
 * Whirlpools, barrels, coins, wake, water and land are drawn procedurally.
 */
/**
 * Premium AI backdrop art (optional). These two seamless tiles replace the
 * flat-colour fills: bg-channel-water paints the channel, bg-channel-coast
 * paints the seeded banks. They flow through the same loadImages() path
 * (no-op onerror), so a missing or slow file leaves naturalWidth === 0 and
 * every draw site falls back to the original procedural fill. Web paths under
 * /seas-art/ (public/seas-art/).
 */
const BG_WATER_SRC = "/seas-art/bg-channel-water.png";
const BG_COAST_SRC = "/seas-art/bg-channel-coast.png";

const SPRITE_SRC = {
  bgWater: BG_WATER_SRC,
  bgCoast: BG_COAST_SRC,
  hullL: KENNEY.part("hullLarge (1)"),
  hullS: KENNEY.part("hullSmall (1)"),
  sailL: KENNEY.part("sailLarge (7)"),
  sailS: KENNEY.part("sailSmall (7)"),
  cannon: KENNEY.part("cannon"),
  flagG: KENNEY.flag(6),
  nest: KENNEY.part("nest"),
  pole: KENNEY.part("pole"),
  player: KENNEY.ship(5),
  enemy: KENNEY.ship(2),
  rock: KENNEY.tile(66),
  plant: KENNEY.tile(70),
  ball: KENNEY.part("cannonBall"),
  boom1: KENNEY.explosion(1),
  boom2: KENNEY.explosion(2),
  boom3: KENNEY.explosion(3),
  fire1: KENNEY.fire(1),
  fire2: KENNEY.fire(2),
};

type Muzzle = { mx: number; my: number; ang: number }; // px from sprite center (source units), ang rad from straight up

type PlayerSprite = {
  cnv: HTMLCanvasElement | null; // null = composition failed, draw fallback
  cw: number; // composition canvas size in source units
  ch: number;
  refW: number; // the ship's visual span in source units; laneW * CLASS_W maps to this
  muzzles: Muzzle[];
};

/**
 * Compose the player ship from Kenney parts onto an offscreen canvas, using
 * the part offsets reverse-engineered from the official pre-composed ships
 * (hull centered, sail full-width above the midline, flag at the masthead,
 * nest on the bow platform). Pixel-diffed against ship (1): sail at y=24
 * (96% pixel match), hull at (8,5), flag at (30,0) (100%), nest at (23,14).
 * Cannons: the source barrel points RIGHT, so -PI/2 points it up the
 * channel; rail cannons sit on the gunwales with muzzles at mid-hull
 * (where rail shots spawn), the bow cannon tucks under the sail with its
 * barrel poking out over the foredeck. Muzzle offsets are computed from the
 * same geometry so flashes and shots always match the art.
 */
function composeShip(imgs: Record<string, HTMLImageElement>, cls: number, volley: 1 | 2 | 3): PlayerSprite {
  const big = cls >= 2;
  const cw = big ? 74 : 64; // extra width so outward-leaning rail cannons never clip
  const ch = 113;
  const refW = big ? 66 : 42; // sail span = the ship's visual width
  const cx = cw / 2;
  const bowY = big ? 24 : 22; // bow cannon pivot
  const railY = 71; // rail cannon pivot: muzzle (14.5px up) lands at mid-hull y=56.5
  const railDX = big ? 25 : 20; // gunwale offset from centerline
  const half = 14.5; // cannon sprite is 29px long, pivot center, muzzle at +half
  const lean = (SPREAD_DEG * Math.PI) / 180;

  const muzzles: Muzzle[] = [];
  if (volley !== 2) muzzles.push({ mx: 0, my: bowY - half - ch / 2, ang: 0 });
  if (volley >= 2) {
    for (const side of [-1, 1] as const) {
      const ang = volley === 3 ? side * lean : 0;
      muzzles.push({
        mx: side * railDX + half * Math.sin(ang),
        my: railY - half * Math.cos(ang) - ch / 2,
        ang,
      });
    }
  }

  const hull = big ? imgs.hullL : imgs.hullS;
  const sail = big ? imgs.sailL : imgs.sailS;
  const cnv = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const S = 2; // compose at 2x so DPR-2 screens stay crisp
  const c = cnv ? cnv.getContext("2d") : null;
  if (!cnv || !c || !hasImg(hull) || !hasImg(sail)) return { cnv: null, cw, ch, refW, muzzles };
  cnv.width = cw * S;
  cnv.height = ch * S;

  const put = (img: HTMLImageElement | undefined, x: number, y: number) => {
    if (hasImg(img)) c.drawImage(img, x * S, y * S, img.naturalWidth * S, img.naturalHeight * S);
  };
  const putRot = (img: HTMLImageElement | undefined, x: number, y: number, rot: number) => {
    if (!hasImg(img)) return;
    c.save();
    c.translate(x * S, y * S);
    c.rotate(rot);
    c.drawImage(img, (-img.naturalWidth * S) / 2, (-img.naturalHeight * S) / 2, img.naturalWidth * S, img.naturalHeight * S);
    c.restore();
  };

  put(hull, big ? 12 : 12, 5); // hull centered: (74-50)/2 = 12, (64-40)/2 = 12
  if (!big && cls === 1) put(imgs.pole, 26, 33); // mast disc peeking below the yard sail
  if (big && cls === 4) put(imgs.nest, 27, 14); // bow platform, top half shows above the sail
  if (volley !== 2) putRot(imgs.cannon, cx, bowY, -Math.PI / 2); // under the sail, barrel out over the foredeck
  put(sail, big ? 4 : 11, big ? 24 : 30); // sail above the hull midline
  if (big && cls >= 3) put(imgs.flagG, 34, 0); // gold pennant at the masthead
  if (volley >= 2) {
    for (const side of [-1, 1] as const) {
      putRot(imgs.cannon, cx + side * railDX, railY, -Math.PI / 2 + (volley === 3 ? side * lean : 0));
    }
  }
  return { cnv, cw, ch, refW, muzzles };
}

/**
 * Seeded coastline: every captain sees the same banks today. Each side gets
 * a waterline X-offset curve from three summed sines (total amplitude
 * ~8-22px, wavelengths 300-700px) plus a slow long-wavelength drift, and a
 * slowly varying land-strip width. Purely visual: the curve may intrude at
 * most 10px into the outer lane and never touches collisions.
 */
type CoastSide = { amp: number[]; wl: number[]; ph: number[]; landAmp: number; landWl: number; landPh: number };
type Coast = { key: string; left: CoastSide; right: CoastSide };

function buildCoast(key: string): Coast {
  const rng = seededRng(key + ":coast");
  const side = (): CoastSide => ({
    amp: [5 + rng() * 5, 2.5 + rng() * 4.5, 1.5 + rng() * 2.5, 5 + rng() * 5], // 4th = slow drift
    wl: [420 + rng() * 280, 320 + rng() * 160, 500 + rng() * 200, 1900 + rng() * 900],
    ph: [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2],
    landAmp: 14 + rng() * 22,
    landWl: 1400 + rng() * 800,
    landPh: rng() * Math.PI * 2,
  });
  return { key, left: side(), right: side() };
}

function coastOffset(s: CoastSide, u: number): number {
  let o = 0;
  for (let i = 0; i < 4; i++) o += s.amp[i] * Math.sin((u / s.wl[i]) * Math.PI * 2 + s.ph[i]);
  return o;
}

function coastLandW(s: CoastSide, u: number): number {
  return 82 + s.landAmp * Math.sin((u / s.landWl) * Math.PI * 2 + s.landPh);
}

/**
 * Decoration cell sizes (world px). Cached so the seeded contents of a cell are
 * generated exactly once per day, not re-seeded every frame.
 */
const CELL_VEG = 190;
const CELL_PROP = 760;

/** One precomputed vegetation cell: 1-2 blobs, world-space (X resolved at draw). */
type VegBlob = { uu: number; offX: number; rx: number; ry: number; alpha: number };
type VegCell = { blobs: VegBlob[] };
/** One precomputed shore prop, or null if this cell is empty (the r() >= 0.85 skip). */
type PropCell = { uu: number; offX: number; size: number; isRock: boolean };

/**
 * Reproduce, with the IDENTICAL sequence of r() draws as the original inline
 * loop, one vegetation cell's blobs. Positions are stored in world space and as
 * a pre-coastXat horizontal OFFSET (offX), so the only thing applied per frame
 * at draw time is coastXat(uu) (layout-dependent) and + scrollPx (the screen Y).
 * Same random consumption => visually identical to the un-cached path.
 */
function buildVegCell(coastKey: string, sideKey: "L" | "R", k: number): VegCell {
  const r = seededRng(`${coastKey}:veg:${sideKey}:${k}`);
  const m = r() < 0.5 ? 1 : 2;
  const blobs: VegBlob[] = [];
  for (let j = 0; j < m; j++) {
    const uu = k * CELL_VEG + r() * (CELL_VEG - 30);
    const offX = 12 + r() * 34; // dir applied at draw
    const rx = 12 + r() * 17;
    const ry = 7 + r() * 9;
    const alpha = 0.55 + r() * 0.35;
    blobs.push({ uu, offX, rx, ry, alpha });
  }
  return { blobs };
}

/** Reproduce one shore-prop cell with the IDENTICAL r() draw order; null = empty. */
function buildPropCell(coastKey: string, sideKey: "L" | "R", k: number): PropCell | null {
  const r = seededRng(`${coastKey}:prop:${sideKey}:${k}`);
  if (r() >= 0.85) return null;
  const uu = k * CELL_PROP + 40 + r() * (CELL_PROP - 220);
  const isRock = r() < 0.55;
  const size = isRock ? 28 + r() * 12 : 20 + r() * 9;
  const offX = 18 + r() * 26 + size * 0.35; // dir applied at draw
  return { uu, offX, size, isRock };
}

type EvKind = "rock" | "whirl" | "sloop" | "barrel" | "coin";

type Ev = {
  t: number;
  lane: number;
  kind: EvKind;
  vx?: number; // sloop drift, lanes per second
  fireDelay?: number;
  firePeriod?: number;
};

type Ent = {
  kind: EvKind | "ball";
  x: number; // lane units, 0..4 (lane centers at integers)
  y: number; // canvas heights, 0 = top
  vx: number; // lanes per second
  vy: number; // heights per second
  alive: boolean;
  nextFire: number; // absolute game time (sloops only)
  firePeriod: number;
};

type Shot = { x: number; y: number; vx: number; alive: boolean }; // vx in lanes/s (angled volley shots)

type Fx = { x: number; y: number; age: number; max: number; color: string; kind?: "boom" | "muzzle" };

type Game = {
  running: boolean;
  t: number;
  evIdx: number;
  events: Ev[];
  ents: Ent[];
  shots: Shot[];
  fx: Fx[];
  shipX: number;
  shipTarget: number;
  hp: number;
  maxHp: number;
  lives: number; // remaining lives (run ends when this hits 0 with no hp left)
  maxLives: number;
  invuln: number; // seconds of grace after a hit
  cooldown: number; // ms until next volley
  cooldownMax: number;
  classW: number; // player sprite width in laneW units (hull class)
  spyglass: number; // spyglass fitting 0-5: lookahead ping warning level (render-only)
  tween: number; // lane-change speed, lanes per second
  dist: number; // distance points (10/s)
  bonusPts: number; // kill + pickup points
  kills: number;
  pickups: number;
  shake: number;
  submitted: boolean;
};

// Collision radii in lane units, tuned to the (smaller) sprite sizes below.
const ENT_R: Record<string, number> = {
  rock: 0.28,
  whirl: 0.26,
  sloop: 0.26,
  barrel: 0.21,
  coin: 0.22,
  ball: 0.1,
};

function hasImg(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return !!img && img.naturalWidth > 0;
}

/**
 * In-place array compaction: keep only items for which `keep` is true, preserving
 * order, WITHOUT allocating a new array (unlike .filter()). Used in the hot loop
 * to drop dead entities/shots/fx each frame with zero per-frame garbage. Same
 * keep-semantics as the .filter() calls it replaces.
 */
function compact<T>(arr: T[], keep: (item: T) => boolean): void {
  let w = 0;
  for (let r = 0; r < arr.length; r++) {
    const item = arr[r];
    if (keep(item)) arr[w++] = item;
  }
  arr.length = w;
}

/**
 * A single LIVES pip for the DOM HUD: a drawn SVG heart (never a canvas glyph,
 * never an emoji). Held lives are filled gold; a spent life is a hollow gold
 * outline so the captain can read remaining lives at a glance.
 */
function heartPipSvg(held: boolean): string {
  const path =
    "M9 15.5C9 15.5 1.6 11.1 1.6 6.2C1.6 3.9 3.4 2.2 5.6 2.2C7 2.2 8.3 3 9 4.2C9.7 3 11 2.2 12.4 2.2C14.6 2.2 16.4 3.9 16.4 6.2C16.4 11.1 9 15.5 9 15.5Z";
  const fill = held ? GOLD : "none";
  const stroke = held ? "rgba(0,15,22,0.55)" : "rgba(240,180,92,0.55)";
  return `<svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true" style="display:block"><path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

function pathRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Procedural whirlpool: darker eye + three pale-teal arcs, each turning slowly. */
function drawWhirl(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,6,10,0.62)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const rr = r * (0.42 + i * 0.29);
    const a0 = t * (0.9 + i * 0.35) + i * 2.4;
    ctx.strokeStyle = `rgba(150,210,216,${0.62 - i * 0.14})`;
    ctx.lineWidth = Math.max(1.5, r * 0.11);
    ctx.beginPath();
    ctx.arc(0, 0, rr, a0, a0 + Math.PI * 1.45);
    ctx.stroke();
  }
  ctx.restore();
}

/** Procedural doubloon: gold disc, darker inner ring, white glint, scaleX spin. */
function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, phase: number) {
  const squish = 0.65 + 0.35 * Math.abs(Math.sin(phase));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(squish, 1);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.strokeStyle = "#8a5e23";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(122,84,32,0.9)";
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.33, -r * 0.33, r * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
  ctx.restore();
}

/** Procedural wooden barrel (the Kenney cannonLoose part reads as a cannon tube, not a barrel). */
function drawBarrel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  const bh = w * 1.16;
  ctx.save();
  ctx.translate(x, y);
  pathRoundRect(ctx, -w / 2, -bh / 2, w, bh, w * 0.26);
  ctx.fillStyle = "#9c6a39";
  ctx.fill();
  ctx.strokeStyle = "#3a2412";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(34,20,9,0.6)";
  ctx.fillRect(-w / 2 + 1, -bh * 0.31, w - 2, bh * 0.11);
  ctx.fillRect(-w / 2 + 1, bh * 0.2, w - 2, bh * 0.11);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(-w * 0.3, -bh * 0.4, w * 0.13, bh * 0.8);
  ctx.restore();
}

/** Fallback rock: rounded gray polygon cluster with a lighter top facet. */
function drawRockCluster(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  const s = w / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-s * 0.95, s * 0.35);
  ctx.lineTo(-s * 0.7, -s * 0.2);
  ctx.lineTo(-s * 0.25, -s * 0.52);
  ctx.lineTo(s * 0.28, -s * 0.4);
  ctx.lineTo(s * 0.62, -s * 0.02);
  ctx.lineTo(s * 0.95, s * 0.16);
  ctx.lineTo(s * 0.78, s * 0.48);
  ctx.lineTo(-s * 0.55, s * 0.52);
  ctx.closePath();
  ctx.fillStyle = "#55656e";
  ctx.fill();
  ctx.strokeStyle = "#2e3c43";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.2);
  ctx.lineTo(-s * 0.25, -s * 0.52);
  ctx.lineTo(s * 0.28, -s * 0.4);
  ctx.lineTo(s * 0.05, -s * 0.04);
  ctx.lineTo(-s * 0.42, 0);
  ctx.closePath();
  ctx.fillStyle = "#7d8e97";
  ctx.fill();
  ctx.restore();
}

/** Fallback cannonball: dark disc with a top-left highlight. */
function drawBallVector(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#1c2b33";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fill();
}

/**
 * Spyglass warning ping: a small downward-pointing chevron + thin arc at the
 * top edge of a lane, telling the captain a hazard is about to scroll in.
 * `prog` is 0..1 (0 = just appeared, 1 = hazard about to enter), so the ping
 * brightens and the chevron firms up as the danger nears; `pulse` is a slow
 * breathing factor. Kept low-alpha and small so it never clutters the lanes.
 */
function drawWarnPing(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, rgb: string, prog: number, pulse: number) {
  const near = Math.min(1, Math.max(0, prog));
  const a = (0.12 + near * 0.34) * (0.62 + 0.38 * pulse); // faint, swelling as it nears
  const half = w * 0.42;
  const drop = w * 0.34;
  ctx.save();
  ctx.lineWidth = Math.max(1.5, w * 0.09);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // soft guiding arc just above the chevron
  ctx.strokeStyle = `rgba(${rgb},${a * 0.55})`;
  ctx.beginPath();
  ctx.arc(x, y - drop * 0.5, half * 1.05, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();
  // chevron pointing down the lane toward where the hazard will appear
  ctx.strokeStyle = `rgba(${rgb},${a})`;
  ctx.beginPath();
  ctx.moveTo(x - half, y);
  ctx.lineTo(x, y + drop);
  ctx.lineTo(x + half, y);
  ctx.stroke();
  ctx.restore();
}

/** Fallback hull (the original vector boat) in case ship sprites fail to load. */
function drawHullVector(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hw: number,
  hh: number,
  fill: string,
  hole: string,
  down = false,
) {
  ctx.save();
  ctx.translate(x, y);
  if (down) ctx.scale(1, -1);
  ctx.beginPath();
  ctx.moveTo(0, -hh);
  ctx.quadraticCurveTo(hw, -hh * 0.1, hw * 0.62, hh);
  ctx.lineTo(-hw * 0.62, hh);
  ctx.quadraticCurveTo(-hw, -hh * 0.1, 0, -hh);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, hh * 0.15, Math.min(hw, hh) * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = hole;
  ctx.fill();
  ctx.restore();
}

/**
 * Same sea for every captain today: the whole 90s timeline comes from the
 * daily seed and nothing else. Hazards every ~0.8-1.2s (1.3x the original
 * cadence, so the longer column stays readable and hazards overlap less),
 * pickups sprinkled, occasional calm windows.
 */
function buildTimeline(): Ev[] {
  const rng = seededRng(dayKeyUTC() + ":" + GAME_KEY);
  const evs: Ev[] = [];
  let t = 2.2;
  while (t < 87) {
    if (rng() < 0.07) t += 2.2 + rng() * 1.6; // brief calm window
    const lane = Math.floor(rng() * LANES);
    const r = rng();
    if (r < 0.4) {
      evs.push({ t, lane, kind: "rock" });
    } else if (r < 0.62) {
      evs.push({ t, lane, kind: "whirl" });
    } else if (r < 0.8) {
      evs.push({
        t,
        lane,
        kind: "sloop",
        vx: (rng() < 0.5 ? -1 : 1) * (0.18 + rng() * 0.3),
        fireDelay: 0.5 + rng() * 0.9,
        firePeriod: 1.7 + rng() * 1.1,
      });
    } else if (r < 0.9) {
      evs.push({ t, lane, kind: "barrel" });
    } else {
      evs.push({ t, lane, kind: "coin" });
    }
    const p = rng();
    if (p < 0.16) {
      evs.push({ t: t + 0.3, lane: Math.floor(rng() * LANES), kind: rng() < 0.7 ? "coin" : "barrel" });
    }
    if (p < 0.05) {
      const cl = Math.floor(rng() * LANES);
      for (let k = 0; k < 3; k++) evs.push({ t: t + 0.55 + k * 0.18, lane: cl, kind: "coin" });
    }
    t += 0.78 + rng() * 0.39; // 1.3x the old 0.6 + 0.3r spacing
  }
  evs.sort((a, b) => a.t - b.t);
  return evs;
}

export default function ChannelRunPage() {
  const { captain, identityChecked, submitScore, submitState, lastResult } = useSeasGame(GAME_KEY);

  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [finalScore, setFinalScore] = useState(0);
  const [finalStats, setFinalStats] = useState({ dist: 0, kills: 0, pickups: 0 });
  const [imagesReady, setImagesReady] = useState(false);
  const [preview, setPreview] = useState<{ url: string; w: number; h: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const gameRef = useRef<Game | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const endedAtRef = useRef(0);
  const phaseRef = useRef(phase);
  const captainRef = useRef<Captain | null>(captain);
  const submitRef = useRef(submitScore);
  const identityRef = useRef(identityChecked);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const imagesReadyRef = useRef(false);
  const composedRef = useRef<Record<string, PlayerSprite>>({});
  const playerSpriteRef = useRef<PlayerSprite | null>(null);
  const coastRef = useRef<Coast | null>(null);
  // Premium backdrop patterns, built ONCE from the loaded textures (never per
  // frame). `false` = not built yet; `null` = texture missing/failed, use the
  // procedural fallback. Their tile heights drive the scroll wrap.
  const waterPatRef = useRef<CanvasPattern | null | false>(false);
  const coastPatRef = useRef<CanvasPattern | null | false>(false);
  const waterTileHRef = useRef(0);
  const coastTileHRef = useRef(0);
  // The channel-water vertical gradient depends only on canvas height, so it is
  // cached and rebuilt only when h changes (createLinearGradient per frame was a
  // hot-loop allocation). Keyed by the h it was built for.
  const waterGradRef = useRef<{ h: number; grad: CanvasGradient } | null>(null);
  // Moonlight shimmer gradient: shape depends only on its width (shw), so it is
  // built once at an origin-relative span and the context is translated to the
  // drifting column each frame (was a per-frame createLinearGradient). Keyed by shw.
  const shimmerGradRef = useRef<{ shw: number; grad: CanvasGradient } | null>(null);
  // Reusable coastline sample buffers: filled in place each frame instead of
  // allocating three fresh arrays (new Array(n)) every frame.
  const coastBufRef = useRef<{ ys: number[]; lxs: number[]; rxs: number[] }>({ ys: [], lxs: [], rxs: [] });
  // Per-day cache of the seeded coastline decorations (vegetation blobs + shore
  // props). Each cell's contents are fully deterministic from (coast.key, side,
  // cellIndex) and the world-space positions are scroll-independent, so they are
  // computed ONCE per cell the first time it scrolls into view and reused every
  // frame after. This replaces a hot-loop that built a fresh seededRng closure
  // (new closure + a template-string seed + an FNV hash over it) for every veg
  // and prop cell, every frame, every side — the dominant source of per-frame
  // GC churn. Keyed by coast.key so it self-clears when the daily sea changes.
  const coastDecoRef = useRef<{
    key: string;
    veg: Map<string, VegCell>;
    prop: Map<string, PropCell | null>;
  }>({ key: "", veg: new Map(), prop: new Map() });
  // Single reusable DOMMatrix for pattern scrolling: setTransform's matrix was
  // allocated fresh (new DOMMatrix) twice per frame; this mutates one in place.
  const patMatrixRef = useRef<DOMMatrix | null>(null);
  const reduceMotionRef = useRef(false);
  const hudRef = useRef({ score: -1, hp: -1, maxHp: -1, lives: -1, maxLives: -1 });
  const heartsElRef = useRef<HTMLDivElement | null>(null);
  const livesElRef = useRef<HTMLDivElement | null>(null);
  const scoreElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    captainRef.current = captain;
  }, [captain]);
  useEffect(() => {
    submitRef.current = submitScore;
  }, [submitScore]);
  useEffect(() => {
    identityRef.current = identityChecked;
  }, [identityChecked]);

  // preload all sprites; runs cannot start until this resolves (it never rejects)
  useEffect(() => {
    let dead = false;
    loadImages(SPRITE_SRC).then((m) => {
      if (dead) return;
      imagesRef.current = m;
      imagesReadyRef.current = true;
      setImagesReady(true);
    });
    return () => {
      dead = true;
    };
  }, []);

  // Honor prefers-reduced-motion for the new backdrop: when set, the textures
  // are painted static (no vertical scroll). Gameplay is untouched; only the
  // decorative backdrop motion is gated. Read once and kept live via listener.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotionRef.current = mq.matches;
    const onChange = () => {
      reduceMotionRef.current = mq.matches;
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  /**
   * Build the two repeating backdrop patterns ONCE, the first frame a 2D
   * context and the loaded textures are both available. A failed/missing
   * texture (naturalWidth === 0) leaves the ref null so the draw sites fall
   * back to the original flat-colour fills.
   */
  const ensurePatterns = (ctx: CanvasRenderingContext2D, imgs: Record<string, HTMLImageElement>) => {
    if (waterPatRef.current === false) {
      const img = imgs.bgWater;
      if (hasImg(img)) {
        waterPatRef.current = ctx.createPattern(img, "repeat");
        waterTileHRef.current = img.naturalHeight;
      } else {
        waterPatRef.current = null;
      }
    }
    if (coastPatRef.current === false) {
      const img = imgs.bgCoast;
      if (hasImg(img)) {
        coastPatRef.current = ctx.createPattern(img, "repeat");
        coastTileHRef.current = img.naturalHeight;
      } else {
        coastPatRef.current = null;
      }
    }
  };

  /** Composed-ship cache: one offscreen canvas per (hull class, volley tier). */
  const getComposedShip = (cls: number, volley: 1 | 2 | 3): PlayerSprite => {
    const key = cls + ":" + volley;
    const cached = composedRef.current[key];
    if (cached) return cached;
    const ps = composeShip(imagesRef.current, cls, volley);
    composedRef.current[key] = ps;
    return ps;
  };

  // start-screen ship preview: the actual composed sprite for this captain's stats
  useEffect(() => {
    if (!imagesReady) return;
    const hull = Math.max(0, captain?.hull_usd ?? 0);
    const cls = hullClassOf(hull);
    const ps = getComposedShip(cls, volleyOf(captain?.fittings?.cannons ?? 0));
    if (!ps.cnv) {
      setPreview(null);
      return;
    }
    const w = (38 + cls * 10) * (ps.cw / ps.refW); // ship span 38..78px, canvas margin scales with it
    setPreview({ url: ps.cnv.toDataURL(), w: Math.round(w), h: Math.round((w * ps.ch) / ps.cw) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesReady, captain]);

  const drawFrame = (g: Game) => {
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext("2d") : null;
    const { w, h, dpr } = sizeRef.current;
    if (!ctx || w <= 0 || h <= 0) return;
    const imgs = imagesRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ensurePatterns(ctx, imgs); // build the backdrop patterns once, then no-op

    const { playW, playX0, laneW } = channelLayout(w, h);
    const xpx = (lx: number) => playX0 + (lx + 0.5) * laneW;

    // open sea beyond the coast: darkest layer of the depth hierarchy
    ctx.fillStyle = "#02141c";
    ctx.fillRect(0, 0, w, h);

    // occasional foam flecks on the open sea, so the outer margins read as water
    if (playX0 > 48) {
      ctx.fillStyle = "#9fd1d9";
      for (let k = 0; k < 6; k++) {
        const tw = Math.sin(g.t * 1.3 + k * 2.1 + 0.7);
        if (tw <= 0.3) continue;
        const fy = (((k * 0.173 + g.t * (0.3 + (k % 3) * 0.08)) % 1.06) - 0.03) * h;
        const fxm = 10 + ((k * 37.7) % (playX0 - 18));
        ctx.globalAlpha = (tw - 0.3) * 0.2;
        ctx.beginPath();
        ctx.arc(k % 2 === 0 ? fxm : w - fxm, fy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    ctx.save();
    if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake * 8, (Math.random() - 0.5) * g.shake * 8);

    /**
     * Seeded coastline + channel water. The land scrolls with the world
     * (same speed as entities); the waterline curves are sampled once per
     * frame into arrays shared by the water polygon, land fill, highlight
     * band and foam line.
     */
    const dayKey = dayKeyUTC();
    if (!coastRef.current || coastRef.current.key !== dayKey) coastRef.current = buildCoast(dayKey);
    const coast = coastRef.current;
    const scrollPx = g.t * SCROLL * h;

    // Reset the per-day decoration cache when the sea changes (new day).
    const deco = coastDecoRef.current;
    if (deco.key !== coast.key) {
      deco.key = coast.key;
      deco.veg.clear();
      deco.prop.clear();
    }

    /**
     * Paint a pre-built backdrop pattern across the WHOLE canvas (it is always
     * called inside an active clip, so it only colours the clipped region).
     * The tile is offset vertically so the texture scrolls down with the run,
     * wrapped to the tile height to keep the matrix offset tiny. When the user
     * prefers reduced motion the offset is frozen, so the backdrop is static.
     * Returns true when it painted, false when the pattern was unavailable and
     * the caller must keep its flat-colour fill.
     */
    const paintScrollingPattern = (pat: CanvasPattern | null | false, tileH: number): boolean => {
      if (!pat) return false;
      const off = reduceMotionRef.current || tileH <= 0 ? 0 : scrollPx % tileH;
      if (typeof DOMMatrix !== "undefined" && typeof pat.setTransform === "function") {
        // reuse one DOMMatrix instead of allocating a fresh one twice per frame
        let mat = patMatrixRef.current;
        if (!mat) {
          mat = new DOMMatrix();
          patMatrixRef.current = mat;
        }
        mat.a = 1;
        mat.b = 0;
        mat.c = 0;
        mat.d = 1;
        mat.e = 0;
        mat.f = off;
        pat.setTransform(mat);
      }
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
      return true;
    };

    const baseOff = Math.min(14, playX0 * 0.5 + 2); // mean waterline sits just outside the column
    const leftXat = (u: number) => Math.min(playX0 + 10, playX0 - baseOff + coastOffset(coast.left, u));
    const rightXat = (u: number) => Math.max(playX0 + playW - 10, playX0 + playW + baseOff - coastOffset(coast.right, u));

    const step = 12;
    const n = Math.ceil(h / step) + 3;
    // reuse the same three buffers every frame (no per-frame array allocation);
    // they only grow when the canvas gets taller, never shrink-thrash
    const buf = coastBufRef.current;
    const ys = buf.ys;
    const lxs = buf.lxs;
    const rxs = buf.rxs;
    for (let i = 0; i < n; i++) {
      ys[i] = i * step - step;
      lxs[i] = leftXat(ys[i] - scrollPx);
      rxs[i] = rightXat(ys[i] - scrollPx);
    }

    // channel water: polygon between the two waterlines, deep-teal gradient
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(rxs[0], ys[0]);
    for (let i = 1; i < n; i++) ctx.lineTo(rxs[i], ys[i]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(lxs[i], ys[i]);
    ctx.closePath();
    let wgCache = waterGradRef.current;
    if (!wgCache || wgCache.h !== h) {
      const wg = ctx.createLinearGradient(0, 0, 0, h);
      wg.addColorStop(0, "#07242f");
      wg.addColorStop(0.5, "#0a2a38");
      wg.addColorStop(1, "#061b24");
      wgCache = { h, grad: wg };
      waterGradRef.current = wgCache;
    }
    ctx.fillStyle = wgCache.grad;
    ctx.fill();
    ctx.clip(); // everything below stays inside the water

    // premium water texture over the deep-teal base, scrolling with the run;
    // if the tile is missing this no-ops and the gradient above shows through
    paintScrollingPattern(waterPatRef.current, waterTileHRef.current);

    // two layers of wave arcs scrolling at different speeds (world-indexed rows)
    for (let b = 0; b < 2; b++) {
      const alpha = b === 0 ? 0.06 : 0.09;
      const speed = b === 0 ? 0.34 : 0.52; // heights per second, downward
      const segW = laneW * (0.62 + b * 0.16);
      const rowH = laneW * (0.95 + b * 0.35);
      const off = g.t * speed * h;
      ctx.strokeStyle = `rgba(159,209,217,${alpha})`;
      ctx.lineWidth = 1.5;
      const kLo = Math.floor((-rowH - off) / rowH);
      const kHi = Math.ceil((h + rowH - off) / rowH);
      ctx.beginPath();
      for (let k = kLo; k <= kHi; k++) {
        const yy = k * rowH + off;
        const brick = (((k % 2) + 2) % 2) * segW * 0.5;
        for (let xx = playX0 - 50 + brick; xx < playX0 + playW + 50; xx += segW) {
          const cx = xx + segW * 0.5;
          const cr = segW * 0.4;
          const a0 = Math.PI * 1.08;
          ctx.moveTo(cx + Math.cos(a0) * cr, yy + Math.sin(a0) * cr);
          ctx.arc(cx, yy, cr, a0, Math.PI * 1.92);
        }
      }
      ctx.stroke();
    }

    // faint moonlight shimmer column drifting across the channel (gradient cached
    // by width, translated to the drifting x so its shape never re-allocates)
    const shx = playX0 + playW * (0.5 + 0.27 * Math.sin(g.t * 0.1 + 1.3));
    const shw = laneW * 1.3;
    let sgCache = shimmerGradRef.current;
    if (!sgCache || sgCache.shw !== shw) {
      const sg = ctx.createLinearGradient(-shw / 2, 0, shw / 2, 0);
      sg.addColorStop(0, "rgba(170,222,230,0)");
      sg.addColorStop(0.5, "rgba(170,222,230,0.05)");
      sg.addColorStop(1, "rgba(170,222,230,0)");
      sgCache = { shw, grad: sg };
      shimmerGradRef.current = sgCache;
    }
    ctx.save();
    ctx.translate(shx, 0);
    ctx.fillStyle = sgCache.grad;
    ctx.fillRect(-shw / 2, 0, shw, h);
    ctx.restore();

    // sparse foam flecks, fading in and out as they drift
    ctx.fillStyle = "#cfeef2";
    for (let k = 0; k < 8; k++) {
      const tw = Math.sin(g.t * 1.9 + k * 2.7);
      if (tw <= 0.25) continue;
      const fy = (((k * 0.219 + g.t * (0.42 + (k % 3) * 0.1)) % 1.08) - 0.04) * h;
      const fxp = playX0 + (((k * 1.83 + 0.4) % LANES) / LANES) * playW + laneW * 0.3;
      ctx.globalAlpha = (tw - 0.25) * 0.28;
      ctx.beginPath();
      ctx.arc(fxp, fy, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // soft lane separators, slightly lighter than the water
    ctx.strokeStyle = "rgba(248,253,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 1; i < LANES; i++) {
      ctx.beginPath();
      ctx.moveTo(playX0 + i * laneW, 0);
      ctx.lineTo(playX0 + i * laneW, h);
      ctx.stroke();
    }
    ctx.restore(); // end water clip

    /**
     * Land strips: night sand from the waterline outward, a lighter band
     * hugging the water, dark vegetation blobs and seeded shore props
     * (rock clusters and plants) in world cells, then a gently waving foam
     * line on the boundary itself.
     */
    const drawLand = (xs: number[], dir: -1 | 1, sideP: CoastSide, sideKey: "L" | "R") => {
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (let i = 1; i < n; i++) ctx.lineTo(xs[i], ys[i]);
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(xs[i] - dir * coastLandW(sideP, ys[i] - scrollPx), ys[i]);
      ctx.closePath();
      ctx.fillStyle = "#241d12";
      ctx.fill();
      ctx.save();
      ctx.clip();

      // premium coast texture clipped to the seeded coastline shape, scrolling
      // with the run; missing tile no-ops and the flat #241d12 fill shows through
      paintScrollingPattern(coastPatRef.current, coastTileHRef.current);

      // highlight band along the waterline (the water half of the stroke is clipped away)
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (let i = 1; i < n; i++) ctx.lineTo(xs[i], ys[i]);
      ctx.strokeStyle = "#2e2517";
      ctx.lineWidth = 20;
      ctx.stroke();

      const coastXat = dir < 0 ? leftXat : rightXat;
      const u0 = ys[0] - scrollPx;
      const u1 = ys[n - 1] - scrollPx;

      // dark vegetation blobs, ~190px world cells. Cell contents are cached per
      // day (deco.veg); only coastXat(uu) (layout) and + scrollPx (screen Y) are
      // applied here, so output is identical to the old per-frame seeded path.
      ctx.fillStyle = "#10271a";
      for (let k = Math.floor(u0 / CELL_VEG); k <= Math.floor(u1 / CELL_VEG); k++) {
        const ck = sideKey + ":" + k;
        let cell = deco.veg.get(ck);
        if (cell === undefined) {
          cell = buildVegCell(coast.key, sideKey, k);
          deco.veg.set(ck, cell);
        }
        for (const b of cell.blobs) {
          ctx.globalAlpha = b.alpha;
          ctx.beginPath();
          ctx.ellipse(coastXat(b.uu) - dir * b.offX, b.uu + scrollPx, b.rx, b.ry, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // shore props every ~600-900px: rock cluster or plant, cached per day.
      for (let k = Math.floor(u0 / CELL_PROP); k <= Math.floor(u1 / CELL_PROP); k++) {
        const ck = sideKey + ":" + k;
        let cell = deco.prop.get(ck);
        if (cell === undefined) {
          cell = buildPropCell(coast.key, sideKey, k);
          deco.prop.set(ck, cell);
        }
        if (cell === null) continue;
        const px2 = coastXat(cell.uu) - dir * cell.offX;
        const py2 = cell.uu + scrollPx;
        if (cell.isRock) {
          drawSprite(ctx, imgs.rock, px2, py2, cell.size);
        } else if (hasImg(imgs.plant)) {
          ctx.globalAlpha = 0.8;
          drawSprite(ctx, imgs.plant, px2, py2, cell.size);
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();

      // gently waving foam line where water meets land
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const fxw = xs[i] + Math.sin(ys[i] * 0.045 + g.t * 2.2) * 1.3;
        if (i === 0) ctx.moveTo(fxw, ys[i]);
        else ctx.lineTo(fxw, ys[i]);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    drawLand(lxs, -1, coast.left, "L");
    drawLand(rxs, 1, coast.right, "R");

    // entities: sprites or vector shapes only, all sized off laneW
    const cullMargin = h * 0.15; // generous: covers the tallest sprite's half-height
    for (const e of g.ents) {
      const ex = xpx(e.x);
      const ey = e.y * h;
      if (ey < -cullMargin || ey > h + cullMargin) continue; // skip fully off-screen
      if (e.kind === "ball") {
        const bw = laneW * 0.11;
        ctx.fillStyle = "rgba(248,253,255,0.16)"; // pale halo keeps dark shot visible on teal
        ctx.beginPath();
        ctx.arc(ex, ey, bw * 0.85, 0, Math.PI * 2);
        ctx.fill();
        if (hasImg(imgs.ball)) drawSprite(ctx, imgs.ball, ex, ey, bw);
        else drawBallVector(ctx, ex, ey, bw * 0.5);
      } else if (e.kind === "rock") {
        // grounding shadow so the gray cluster pops on the lighter water
        ctx.fillStyle = "rgba(1,10,14,0.42)";
        ctx.beginPath();
        ctx.ellipse(ex, ey + laneW * 0.1, laneW * 0.3, laneW * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        if (hasImg(imgs.rock)) drawSprite(ctx, imgs.rock, ex, ey, laneW * 0.55);
        else drawRockCluster(ctx, ex, ey, laneW * 0.55);
      } else if (e.kind === "whirl") {
        drawWhirl(ctx, ex, ey, laneW * 0.26, g.t);
      } else if (e.kind === "sloop") {
        // soft pale halo keeps the dark pirate sloop readable on the teal channel
        ctx.fillStyle = "rgba(205,236,242,0.08)";
        ctx.beginPath();
        ctx.ellipse(ex, ey, laneW * 0.3, laneW * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        if (hasImg(imgs.enemy)) drawSprite(ctx, imgs.enemy, ex, ey, laneW * 0.46, Math.PI);
        else drawHullVector(ctx, ex, ey, laneW * 0.19, laneW * 0.42, "#8a4040", INK, true);
      } else if (e.kind === "barrel") {
        drawBarrel(ctx, ex, ey, laneW * 0.31);
      } else {
        drawCoin(ctx, ex, ey, laneW * 0.15, g.t * 2.8 + e.x * 4.7 + e.y * 3);
      }
    }

    /**
     * Spyglass lookahead pings (render-only; reads the already-built daily
     * timeline). For every hazard still ahead (un-spawned events, g.evIdx
     * onward), if it is within the lead window it gets a faint chevron in its
     * lane at the top edge. Lead time grows with spyglass; level 0 draws
     * nothing. Coins and barrels are not hazards, so they are skipped. This
     * derives purely from g.events / g.evIdx and changes no game state.
     */
    if (g.spyglass > 0) {
      const lead = SPYGLASS_LEAD_BASE + g.spyglass * SPYGLASS_LEAD_PER;
      const pingW = laneW * 0.34;
      const pingY = laneW * 0.16; // just inside the top edge of the column
      const pulse = 0.5 + 0.5 * Math.sin(g.t * 5.2);
      for (let i = g.evIdx; i < g.events.length; i++) {
        const ev = g.events[i];
        const until = ev.t - g.t; // seconds until this hazard scrolls into view
        if (until > lead) break; // events are sorted by t; nothing further is in range
        if (ev.kind === "coin" || ev.kind === "barrel") continue; // not a hazard to dodge
        const prog = 1 - until / lead; // 0 just appeared, 1 about to enter
        const rgb = ev.kind === "sloop" ? PING_GOLD : PING_ROSE; // gold = shootable, rose = hit
        drawWarnPing(ctx, xpx(ev.lane), pingY, pingW, rgb, prog, pulse);
      }
    }

    // player shots: cannonball with a short gold trail and rim
    for (const s of g.shots) {
      const px = xpx(s.x);
      const py = s.y * h;
      const bw = laneW * 0.11;
      ctx.fillStyle = "rgba(255,207,126,0.3)";
      ctx.fillRect(px - 1.5, py + bw * 0.5, 3, bw * 0.9);
      ctx.fillStyle = "rgba(255,207,126,0.12)";
      ctx.fillRect(px - 1, py + bw * 1.4, 2, bw * 1.1);
      if (hasImg(imgs.ball)) drawSprite(ctx, imgs.ball, px, py, bw);
      else drawBallVector(ctx, px, py, bw * 0.5);
      ctx.strokeStyle = "rgba(255,207,126,0.65)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, bw * 0.5 + 1, 0, Math.PI * 2);
      ctx.stroke();
    }

    // fx: expanding rings, muzzle pops, plus Kenney explosion frames for sloop kills
    for (const f of g.fx) {
      const p = f.age / f.max;
      if (f.kind === "boom") {
        const frame = p < 0.34 ? imgs.boom1 : p < 0.67 ? imgs.boom2 : imgs.boom3;
        if (hasImg(frame)) {
          ctx.globalAlpha = 1 - Math.max(0, (p - 0.75) / 0.25) * 0.6;
          drawSprite(ctx, frame, xpx(f.x), f.y * h, laneW * 0.6);
          ctx.globalAlpha = 1;
          continue;
        }
      }
      if (f.kind === "muzzle") {
        // small flash right at the firing muzzle
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(xpx(f.x), f.y * h, laneW * (0.05 + p * 0.06), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xpx(f.x), f.y * h, laneW * (0.12 + p * 0.42), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // player ship: stat-composed Kenney sprite with V wake, subtle bob and sway
    const sx = xpx(g.shipX);
    const bob = Math.sin(g.t * 2.2) * laneW * 0.03;
    const sy = SHIP_Y * h + bob;
    const ps = playerSpriteRef.current;
    const shipW = laneW * g.classW; // the ship's visual span (hull class width)
    const pImg = imgs.player;
    const shipH = ps ? (shipW * ps.ch) / ps.refW : hasImg(pImg) ? (pImg.naturalHeight / pImg.naturalWidth) * shipW : Math.max(28, laneW * 0.9);

    const sternY = sy + shipH * 0.3;
    ctx.lineWidth = 1.5;
    for (const dir of [-1, 1]) {
      const x0 = sx + dir * shipW * 0.16;
      ctx.strokeStyle = "rgba(248,253,255,0.28)";
      ctx.beginPath();
      ctx.moveTo(x0, sternY);
      ctx.lineTo(x0 + dir * shipW * 0.15, sternY + shipH * 0.28);
      ctx.stroke();
      ctx.strokeStyle = "rgba(248,253,255,0.11)";
      ctx.beginPath();
      ctx.moveTo(x0 + dir * shipW * 0.15, sternY + shipH * 0.28);
      ctx.lineTo(x0 + dir * shipW * 0.33, sternY + shipH * 0.62);
      ctx.stroke();
    }

    if (g.invuln > 0) ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(g.t * 18));
    if (ps && ps.cnv) {
      const cw2 = shipW * (ps.cw / ps.refW); // composition canvas is wider than the ship span
      const ch2 = (cw2 * ps.ch) / ps.cw;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.sin(g.t * 1.6) * 0.03);
      ctx.drawImage(ps.cnv, -cw2 / 2, -ch2 / 2, cw2, ch2);
      ctx.restore();
    } else if (hasImg(pImg)) {
      drawSprite(ctx, pImg, sx, sy, shipW, Math.sin(g.t * 1.6) * 0.03);
    } else {
      drawHullVector(ctx, sx, sy, shipW * 0.48, Math.max(14, laneW * 0.42), GOLD, INK);
    }
    ctx.globalAlpha = 1;

    // fresh hit: brief flames licking the hull (on top of the blink above)
    if (g.invuln > 0.6) {
      const flame = Math.floor(g.t * 12) % 2 === 0 ? imgs.fire1 : imgs.fire2;
      drawSprite(ctx, flame, sx + shipW * 0.1, sy - shipH * 0.08, laneW * 0.18);
    }

    ctx.restore();

    // HUD: timer bar stays on canvas (plain rects); hearts and score live in DOM
    ctx.fillStyle = "rgba(248,253,255,0.08)";
    ctx.fillRect(0, 0, w, 3);
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, 0, w * Math.max(0, 1 - g.t / DURATION), 3);

    const hud = hudRef.current;
    const scoreNow = Math.floor(g.dist + g.bonusPts);
    if (scoreElRef.current && scoreNow !== hud.score) {
      hud.score = scoreNow;
      scoreElRef.current.textContent = String(scoreNow);
    }
    if (livesElRef.current && (g.lives !== hud.lives || g.maxLives !== hud.maxLives)) {
      hud.lives = g.lives;
      hud.maxLives = g.maxLives;
      // lives = drawn SVG heart pips (NOT canvas, NOT emoji): filled gold while
      // the life is held, hollow once it is spent
      let html = "";
      for (let i = 0; i < g.maxLives; i++) {
        const held = i < g.lives;
        html += heartPipSvg(held);
      }
      livesElRef.current.innerHTML = html;
    }
    if (heartsElRef.current && (g.hp !== hud.hp || g.maxHp !== hud.maxHp)) {
      hud.hp = g.hp;
      hud.maxHp = g.maxHp;
      let html = "";
      for (let i = 0; i < g.maxHp; i++) html += `<span style="opacity:${i < g.hp ? 1 : 0.18}">❤️</span>`;
      heartsElRef.current.innerHTML = html;
    }
  };

  const endRun = (g: Game) => {
    if (!g.running) return;
    g.running = false;
    endedAtRef.current = Date.now();
    const score = Math.round(g.dist + g.bonusPts);
    const stats = { dist: Math.round(g.dist), kills: g.kills, pickups: g.pickups };
    setFinalScore(score);
    setFinalStats(stats);
    phaseRef.current = "over";
    setPhase("over");
    if (!g.submitted) {
      g.submitted = true; // exactly one submit per run
      submitRef.current(score, stats);
    }
  };

  const stepGame = (g: Game, dt: number) => {
    g.t += dt;
    g.dist += 10 * dt;
    g.cooldown = Math.max(0, g.cooldown - dt * 1000);
    g.invuln = Math.max(0, g.invuln - dt);
    g.shake = Math.max(0, g.shake - dt * 2);

    // spawn due events at the top of the channel
    while (g.evIdx < g.events.length && g.events[g.evIdx].t <= g.t) {
      const ev = g.events[g.evIdx++];
      g.ents.push({
        kind: ev.kind,
        x: ev.lane,
        y: -0.08,
        vx: ev.kind === "sloop" ? (ev.vx ?? 0.2) : 0,
        vy: ev.kind === "sloop" ? SCROLL * 0.85 : SCROLL,
        alive: true,
        nextFire: ev.kind === "sloop" ? g.t + (ev.fireDelay ?? 1) : 0,
        firePeriod: ev.firePeriod ?? 2,
      });
    }

    // animated lane tween (sails make this faster)
    const dx = g.shipTarget - g.shipX;
    const mv = g.tween * dt;
    if (Math.abs(dx) <= mv) g.shipX = g.shipTarget;
    else g.shipX += Math.sign(dx) * mv;

    // entities drift down; sloops slide sideways and fire
    for (const e of g.ents) {
      if (!e.alive) continue;
      e.y += e.vy * dt;
      if (e.kind === "sloop") {
        e.x += e.vx * dt;
        if (e.x < 0) {
          e.x = 0;
          e.vx = Math.abs(e.vx);
        } else if (e.x > LANES - 1) {
          e.x = LANES - 1;
          e.vx = -Math.abs(e.vx);
        }
        if (e.y > 0.02 && e.y < SHIP_Y - 0.12 && g.t >= e.nextFire) {
          e.nextFire = g.t + e.firePeriod;
          g.ents.push({ kind: "ball", x: e.x, y: e.y + 0.04, vx: 0, vy: BALL_VY, alive: true, nextFire: 0, firePeriod: 0 });
        }
      }
      if (e.y > 1.15) e.alive = false;
    }

    for (const s of g.shots) {
      if (!s.alive) continue;
      s.x += s.vx * dt; // angled volley shots drift outward
      s.y += SHOT_VY * dt;
      if (s.y < -0.05) s.alive = false;
    }

    const { w, h } = sizeRef.current;
    if (w > 0 && h > 0) {
      const { playX0, laneW } = channelLayout(w, h);
      const xpx = (lx: number) => playX0 + (lx + 0.5) * laneW;

      // shots vs targets (rocks absorb shots; whirls, coins, balls pass)
      for (const s of g.shots) {
        if (!s.alive) continue;
        for (const e of g.ents) {
          if (!e.alive || e.kind === "whirl" || e.kind === "coin" || e.kind === "ball") continue;
          const rr = ENT_R[e.kind] * laneW + laneW * 0.07;
          const ddx = xpx(e.x) - xpx(s.x);
          const ddy = (e.y - s.y) * h;
          if (ddx * ddx + ddy * ddy < rr * rr) {
            s.alive = false;
            if (e.kind === "sloop") {
              e.alive = false;
              g.bonusPts += 100;
              g.kills += 1;
              g.fx.push({ x: e.x, y: e.y, age: 0, max: 0.32, color: GOLD_BRIGHT, kind: "boom" });
            } else if (e.kind === "barrel") {
              e.alive = false;
              g.bonusPts += 50;
              g.kills += 1;
              g.fx.push({ x: e.x, y: e.y, age: 0, max: 0.35, color: GOLD });
            }
            break;
          }
        }
      }

      // ship vs entities (hitbox width tracks the class-sized sprite)
      const sx = xpx(g.shipX);
      const halfW = laneW * g.classW * 0.48;
      const halfH = Math.max(14, laneW * 0.42);
      for (const e of g.ents) {
        if (!e.alive || e.kind === "barrel") continue; // barrels drift past the hull
        const er = ENT_R[e.kind] * laneW;
        if (Math.abs(xpx(e.x) - sx) < halfW + er * 0.8 && Math.abs((e.y - SHIP_Y) * h) < halfH + er * 0.8) {
          if (e.kind === "coin") {
            e.alive = false;
            g.bonusPts += 25;
            g.pickups += 1;
            g.fx.push({ x: e.x, y: e.y, age: 0, max: 0.3, color: GOLD_BRIGHT });
          } else if (g.invuln <= 0) {
            e.alive = false;
            g.hp -= 1;
            g.shake = 0.5;
            g.fx.push({ x: g.shipX, y: SHIP_Y, age: 0, max: 0.45, color: FG });
            if (g.hp <= 0 && g.lives > 1) {
              // last hp of this life gone: burn a life, refill the hull, recenter
              // the ship and open a longer grace window so the captain sails on
              g.lives -= 1;
              g.hp = g.maxHp;
              g.shipX = 2;
              g.shipTarget = 2;
              g.invuln = RESPAWN_INVULN;
            } else {
              g.invuln = HIT_INVULN;
            }
          }
        }
      }
    }

    for (const f of g.fx) {
      f.age += dt;
      if (f.kind === "boom") f.y += SCROLL * 0.85 * dt; // burst rides the current with the wreck
    }
    // in-place compaction (no new arrays per frame); identical keep-semantics
    compact(g.fx, (f) => f.age < f.max);
    compact(g.ents, (e) => e.alive);
    compact(g.shots, (s) => s.alive);
    // defensive cap on PURELY-COSMETIC fx only (rings, muzzle pops, booms): they
    // never touch collisions/score/lives, so trimming the oldest excess is safe.
    // ents and shots are left uncapped because they drive gameplay.
    if (g.fx.length > FX_CAP) g.fx.splice(0, g.fx.length - FX_CAP);

    // run ends at the natural channel completion, or when the final life's hull
    // is spent (the respawn branch above only refills while lives > 1, so a
    // surviving hp <= 0 here means this was the last life)
    if (g.hp <= 0 && g.lives > 0) g.lives = 0; // last life spent: empty the pips
    if (g.t >= DURATION || (g.hp <= 0 && g.lives <= 0)) endRun(g);
  };

  const loop = (ts: number) => {
    const g = gameRef.current;
    if (!g || !g.running) return;
    const last = lastTsRef.current;
    lastTsRef.current = ts;
    const dt = last === null ? 0 : Math.min(0.05, (ts - last) / 1000);
    stepGame(g, dt);
    drawFrame(g);
    if (g.running) rafRef.current = requestAnimationFrame(loop);
  };

  const startRun = () => {
    if (phaseRef.current === "playing") return;
    if (!imagesReadyRef.current) return; // sprites still loading; button shows a waiting state
    const cap = captainRef.current;
    const hull = Math.max(0, cap?.hull_usd ?? 0);
    const cannons = cap?.fittings?.cannons ?? 0;
    const sails = cap?.fittings?.sails ?? 0;
    const spyglass = Math.max(0, Math.min(5, cap?.fittings?.spyglass ?? 0));
    const maxHp = 1 + Math.min(4, Math.floor(Math.log10(1 + hull)));
    const cls = hullClassOf(hull);
    playerSpriteRef.current = getComposedShip(cls, volleyOf(cannons));
    const g: Game = {
      running: true,
      t: 0,
      evIdx: 0,
      events: buildTimeline(),
      ents: [],
      shots: [],
      fx: [],
      shipX: 2,
      shipTarget: 2,
      hp: maxHp,
      maxHp,
      lives: START_LIVES,
      maxLives: START_LIVES,
      invuln: 0,
      cooldown: 0,
      cooldownMax: Math.max(300, 900 - 120 * cannons),
      classW: CLASS_W[cls],
      spyglass,
      tween: 7 * (1 + 0.15 * sails),
      dist: 0,
      bonusPts: 0,
      kills: 0,
      pickups: 0,
      shake: 0,
      submitted: false,
    };
    gameRef.current = g;
    hudRef.current = { score: -1, hp: -1, maxHp: -1, lives: -1, maxLives: -1 };
    phaseRef.current = "playing";
    setPhase("playing");
    lastTsRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  };

  const steer = (d: number) => {
    const g = gameRef.current;
    if (!g || !g.running) return;
    g.shipTarget = Math.max(0, Math.min(LANES - 1, Math.round(g.shipTarget) + d));
  };

  /**
   * Tiered volley, one ball per mounted cannon (cooldown formula unchanged):
   *   cannons 0-1  x1  bow cannon, straight up from the bow muzzle
   *   cannons 2-3  x2  port + starboard rail cannons, straight up from mid-hull
   *   cannons 4-5  x3  rail cannons leaning SPREAD_DEG outward + straight bow shot
   * Shots and muzzle flashes spawn at the composed sprite's actual muzzle
   * offsets, so the art and the gameplay can never drift apart.
   */
  const fire = () => {
    const g = gameRef.current;
    if (!g || !g.running || g.cooldown > 0) return;
    g.cooldown = g.cooldownMax;
    const ps = playerSpriteRef.current;
    const { w, h } = sizeRef.current;
    if (!ps || w <= 0 || h <= 0) {
      g.shots.push({ x: g.shipX, y: SHIP_Y, vx: 0, alive: true });
      return;
    }
    const { laneW } = channelLayout(w, h);
    const scalePx = (laneW * g.classW) / ps.refW; // source px -> screen px
    for (const m of ps.muzzles) {
      const mxLane = (m.mx * scalePx) / laneW;
      const myH = (m.my * scalePx) / h;
      // lanes/s that makes the climb match the muzzle angle in pixel space
      const vx = m.ang === 0 ? 0 : Math.abs(SHOT_VY) * Math.tan(m.ang) * (h / laneW);
      g.shots.push({ x: g.shipX + mxLane, y: SHIP_Y + myH, vx, alive: true });
      g.fx.push({ x: g.shipX + mxLane, y: SHIP_Y + myH, age: 0, max: 0.12, color: GOLD_BRIGHT, kind: "muzzle" });
    }
  };

  // canvas sizing (DPR capped at 1.5: high-DPR phones gain no visual detail
  // here but pay 2-3x the fill cost, which is the main source of "laggy")
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const fit = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      sizeRef.current = { w, h, dpr };
      const g = gameRef.current;
      if (g) drawFrame(g);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard: arrows / A / D steer, Space fires, Space or Enter starts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === "Space" || code === "ArrowLeft" || code === "ArrowRight" || code === "ArrowUp" || code === "ArrowDown") {
        e.preventDefault();
      }
      const ph = phaseRef.current;
      if (ph === "playing") {
        if (code === "ArrowLeft" || code === "KeyA") steer(-1);
        else if (code === "ArrowRight" || code === "KeyD") steer(1);
        else if (code === "Space") fire();
      } else if (!e.repeat && (code === "Space" || code === "Enter")) {
        if (identityRef.current && Date.now() - endedAtRef.current > 700) startRun();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const g = gameRef.current;
      if (g) g.running = false;
    };
  }, []);

  // start-screen stat chips (guests: hull 0, fittings 0)
  const uiHull = Math.max(0, captain?.hull_usd ?? 0);
  const uiCannons = captain?.fittings?.cannons ?? 0;
  const uiSails = captain?.fittings?.sails ?? 0;
  const uiMaxHp = 1 + Math.min(4, Math.floor(Math.log10(1 + uiHull)));
  const uiCd = Math.max(300, 900 - 120 * uiCannons);
  const uiCls = hullClassOf(uiHull);
  const uiVolley = volleyOf(uiCannons);
  const uiSpyglass = Math.max(0, Math.min(5, captain?.fittings?.spyglass ?? 0));

  const overlayStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 20,
    textAlign: "center",
    background: "rgba(0,15,22,0.8)",
    backdropFilter: "blur(3px)",
    fontFamily: "system-ui, sans-serif",
  };

  const chipStyle: React.CSSProperties = {
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 999,
    padding: "5px 12px",
    color: FG,
    fontSize: 13,
    background: "rgba(248,253,255,0.04)",
    whiteSpace: "nowrap",
  };

  const goldBtn: React.CSSProperties = {
    background: GOLD,
    color: INK,
    border: "none",
    borderRadius: 999,
    padding: "14px 40px",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  };

  return (
    <div
      style={{
        background: INK,
        height: "100dvh",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <GameHeader title="The Channel Run" captain={captain} />
      <div ref={wrapRef} style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => {
            if (phaseRef.current !== "playing") return;
            const rect = e.currentTarget.getBoundingClientRect();
            steer(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
          }}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
            WebkitTapHighlightColor: "transparent",
            userSelect: "none",
          }}
        />

        {/* DOM HUD: emoji are fine here (never on canvas); updated via refs, no re-renders */}
        {phase !== "ready" && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 10,
              right: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              pointerEvents: "none",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {/* LIVES: drawn SVG heart pips (filled = held, hollow = spent) */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    color: GOLD,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textShadow: "0 1px 3px rgba(0,15,22,0.8)",
                  }}
                >
                  LIVES
                </span>
                <div ref={livesElRef} style={{ display: "flex", gap: 3 }} />
              </div>
              {/* hull HP for the current life */}
              <div ref={heartsElRef} style={{ fontSize: 14, display: "flex", gap: 3 }} />
            </div>
            <div
              ref={scoreElRef}
              style={{
                color: FG,
                fontSize: 16,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                textShadow: "0 1px 3px rgba(0,15,22,0.8)",
              }}
            >
              0
            </div>
          </div>
        )}

        {phase === "playing" && (
          <button
            aria-label="fire"
            onPointerDown={(e) => {
              e.preventDefault();
              fire();
            }}
            style={{
              position: "absolute",
              right: 14,
              bottom: "max(14px, env(safe-area-inset-bottom))",
              width: 64,
              height: 64,
              borderRadius: "50%",
              border: "1px solid rgba(240,180,92,0.5)",
              background: "rgba(240,180,92,0.14)",
              fontSize: 26,
              lineHeight: 1,
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTapHighlightColor: "transparent",
              cursor: "pointer",
            }}
          >
            🔥
          </button>
        )}

        {phase === "ready" && (
          <div style={overlayStyle}>
            {/* the captain's actual composed ship: hull class + mounted cannons */}
            {preview && (
              <div
                aria-hidden
                style={{
                  width: preview.w,
                  height: preview.h,
                  backgroundImage: `url(${preview.url})`,
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                  filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.45))",
                }}
              />
            )}
            <div style={{ color: FG, fontSize: 15 }}>⬅️ ➡️ dodge 🪨 🌀 · 🔥 shoot 🛶 🛢️ · take 💰</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <span style={chipStyle}>🚢 {CLASS_NAMES[uiCls]}</span>
              <span style={chipStyle}>🛟 {START_LIVES} lives</span>
              <span style={chipStyle}>❤️ x{uiMaxHp} hull</span>
              <span style={chipStyle}>
                🔥 {(uiCd / 1000).toFixed(1)}s x{uiVolley}
              </span>
              <span style={chipStyle}>⛵ +{uiSails * 15}%</span>
              <span style={chipStyle}>🔭 Lookahead {uiSpyglass > 0 ? `${uiSpyglass}x` : "off"}</span>
            </div>
            <button
              onClick={startRun}
              disabled={!identityChecked || !imagesReady}
              style={{ ...goldBtn, opacity: identityChecked && imagesReady ? 1 : 0.4 }}
            >
              {imagesReady ? "▶ START" : "…"}
            </button>
            <div style={{ color: FG3, fontSize: 12 }}>⏱ 90s</div>
          </div>
        )}

        {phase === "over" && (
          <div style={overlayStyle}>
            <div style={{ fontSize: 40 }}>🏁</div>
            <div style={{ width: "100%", maxWidth: 420 }}>
              <ScoreBanner state={submitState} result={lastResult} score={finalScore} />
            </div>
            <div style={{ color: FG3, fontSize: 14 }}>
              📏 {finalStats.dist} · 💥 {finalStats.kills} · 💰 {finalStats.pickups}
            </div>
            {/* How rewards work, spelled out (players said it wasn't obvious): a run
                banks a flat Glory for finishing ON TOP of doubloons by score. Show the
                concrete Glory if the submit result carries it, else static copy.
                Display only, the scoring/submit above is untouched. */}
            <div style={{ color: FG3, fontSize: 12, lineHeight: 1.4 }}>
              💰 Doubloons by score · 🏴‍☠️{" "}
              {(lastResult?.glory ?? 0) > 0 ? `+${lastResult?.glory} Glory for finishing` : "Glory for finishing"}
            </div>
            <button onClick={startRun} style={goldBtn}>
              ↻ Play again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
