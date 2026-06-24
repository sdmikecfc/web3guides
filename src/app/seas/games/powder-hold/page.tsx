"use client";

/**
 * THE POWDER HOLD · Conquer the Seas mini-game (gameKey "powder-hold").
 * Suika-style cannonball merging inside a ship's hold. 60-second timed score attack.
 * Drop balls, same caliber merges into the next, do not overfill past the line.
 * Pumps fitting adds overflow grace: 2.5 + 0.4 * pumps seconds.
 *
 * Rendering: NES-era wooden powder hold. Procedural metallic cannonballs
 * (cached offscreen sprites), plank walls with iron brackets, hemp rope fill
 * line, Kenney explosion flash on merges. Canvas never draws emoji glyphs;
 * emoji live in DOM chrome only.
 *
 * Backdrop: the player stands inside the ship, below deck. The primary
 * backdrop is a premium AI-painted below-deck powder-hold scene
 * (/seas-art/bg-powderhold.png, portrait 1024x1536: hull ribs, a glowing
 * hanging lantern, a porthole with moonlit sea, powder kegs, a cannonball
 * pyramid, coiled rope). It is loaded best-effort via new Image() with a
 * no-op onerror and drawn to COVER the canvas (center-crop) behind every
 * gameplay element, one drawImage per frame. If the image is missing or
 * still loading, the code falls back to the original procedural interior
 * (curved hull ribs, ceiling planks with crossbeams, brass porthole,
 * hanging lantern, cargo silhouettes), painted ONCE into an offscreen
 * canvas and blitted. The bilge pump that grows with the pumps fitting is
 * gameplay-meaningful, so it is drawn on top of either backdrop. Only the
 * lantern glow is drawn per frame so it can pulse.
 */

import { useEffect, useRef, useState } from "react";
import {
  useSeasGame,
  GameHeader,
  ScoreBanner,
  KENNEY,
  loadImages,
  drawSprite,
  INK,
  GOLD,
  GOLD_BRIGHT,
  FG,
  FG3,
  HAIRLINE,
} from "../shared";

const RADII = [14, 20, 28, 38, 50, 64, 80] as const;
const MERGE_SCORE = [2, 5, 10, 20, 40, 80, 160] as const;
const KRAKEN = 6;
const GRAVITY = 2070;
const GAME_SECONDS = 60; // timed score attack: the run always ends here (overflow rarely fires, so the timer is the real ender)
const DROP_COOLDOWN_MS = 650;
const MAX_BALLS = 70;
const MERGE_CONTACT_MS = 40;
const MIN_BALL_AGE_MS = 700;
// stacking physics: balls in contact bleed energy fast and can never be
// launched upward by a collision faster than MAX_BOUNCE_VY (px/s)
const AIR_DAMP = 0.994;
const CONTACT_DAMP = 0.975;
const MAX_BOUNCE_VY = 140;
const FLOOR_FRICTION = 0.85;
const WALL_FRICTION = 0.96;

// caliber ring ramp: dull iron, bronze, brass, then glowing gold on top
const RING_RAMP = ["#697077", "#7d7a72", "#90805f", "#a8854e", "#c4964a", "#ecba50", "#ffd35e"] as const;

// wood and iron palette for the hold
const WOOD_A = "#5a4030";
const WOOD_B = "#4a3426";
const WOOD_SEAM = "#2e211a";
const WOOD_EDGE = "#241a12";
const IRON_PLATE = "#3a434b";
const IRON_BOLT = "#7c878f";
const WALL_T = 11;
const HOLD_CR = 16;
const BALL_GRADIENT_CSS =
  "radial-gradient(circle at 32% 30%, #5a6a78 0%, #3c4854 45%, #1b222a 78%, #07090c 100%)";

const tierRadius = (t: number): number => RADII[t] ?? 14;
const tierScore = (t: number): number => MERGE_SCORE[t] ?? 0;
const ringColor = (t: number): string => RING_RAMP[t] ?? RING_RAMP[0];

type Ball = {
  id: number;
  tier: number;
  x: number;
  y: number;
  px: number;
  py: number;
  r: number;
  born: number;
  hit?: boolean;
};

type Pop = { x: number; y: number; text: string; age: number; gold: boolean; big?: boolean };
type Flash = { x: number; y: number; r: number; age: number; gold: boolean; rot: number };
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; size: number };

type Geo = {
  left: number;
  right: number;
  top: number;
  floor: number;
  fillLine: number;
  dropY: number;
};

type Phase = "start" | "playing" | "over";

function computeGeo(w: number, h: number): Geo {
  const holdW = Math.min(Math.max(w - 28, 200), 430);
  const left = (w - holdW) / 2;
  // Halve the playable vertical extent and keep it centered. The old column
  // ran from top:92 down to floor:(h-12). We pull the top down and the floor
  // up by a quarter of that span each, so the resulting column height
  // (floor - top) is ~50% of the original while staying vertically centered.
  const oldTop = 92;
  const oldFloor = Math.max(h - 12, 200);
  const inset = (oldFloor - oldTop) / 4;
  const top = oldTop + inset;
  const floor = oldFloor - inset;
  return {
    left,
    right: left + holdW,
    top,
    floor,
    // fill line and drop ceiling keep their original offsets from the top
    // (16 below it, 36 above it) so the rope line and drop point follow.
    fillLine: top + 16,
    dropY: top - 36,
  };
}

/* ------------------------------------------------------------------ */
/* Procedural cannonball painting (one shader for all 7 calibers)      */
/* ------------------------------------------------------------------ */

function paintBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, tier: number): void {
  // iron body: light top-left rolling to near-black bottom-right
  const body = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.1, cx - R * 0.08, cy - R * 0.04, R * 1.12);
  body.addColorStop(0, "#5a6a78");
  body.addColorStop(0.45, "#3c4854");
  body.addColorStop(0.8, "#1b222a");
  body.addColorStop(1, "#07090c");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // subtle rim light catching the lower edge
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(cx + R * 0.04, cy + R * 0.05, R * 0.93, Math.PI * 0.22, Math.PI * 0.78);
  ctx.strokeStyle = "rgba(148,178,202,0.30)";
  ctx.lineWidth = Math.max(1, R * 0.09);
  ctx.stroke();
  ctx.restore();

  // engraved caliber ring: dark groove with a metal ridge on top
  const rr = R * 0.64;
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(1.2, R * 0.085);
  ctx.stroke();
  ctx.save();
  if (tier >= 5) {
    ctx.shadowColor = ringColor(tier);
    ctx.shadowBlur = R * 0.2;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor(tier);
  ctx.lineWidth = Math.max(1, R * 0.05);
  ctx.stroke();
  ctx.restore();

  // dark outer edge keeps the sphere crisp against the hull
  ctx.beginPath();
  ctx.arc(cx, cy, R - Math.max(0.5, R * 0.02), 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,8,12,0.5)";
  ctx.lineWidth = Math.max(1, R * 0.04);
  ctx.stroke();

  // crisp glint plus a faint secondary
  ctx.beginPath();
  ctx.arc(cx - R * 0.4, cy - R * 0.44, Math.max(1.3, R * 0.12), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - R * 0.16, cy - R * 0.56, Math.max(0.8, R * 0.05), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();

  // Kraken Shot mark: small head dome and 3 short curved arms, no emoji
  if (tier === KRAKEN) {
    const gold = ringColor(KRAKEN);
    ctx.save();
    ctx.strokeStyle = gold;
    ctx.fillStyle = gold;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.4, R * 0.055);
    ctx.beginPath();
    ctx.arc(cx, cy - R * 0.14, R * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.1, cy - R * 0.02);
    ctx.quadraticCurveTo(cx - R * 0.3, cy + R * 0.18, cx - R * 0.22, cy + R * 0.34);
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + R * 0.04, cy + R * 0.22, cx - R * 0.04, cy + R * 0.36);
    ctx.moveTo(cx + R * 0.1, cy - R * 0.02);
    ctx.quadraticCurveTo(cx + R * 0.3, cy + R * 0.18, cx + R * 0.22, cy + R * 0.34);
    ctx.stroke();
    ctx.restore();
  }
}

// offscreen sprite cache (2x supersampled) so 80 balls stay cheap per frame
const SPRITE_SS = 2;
const SPRITE_PAD = 4;
const ballSpriteCache = new Map<number, HTMLCanvasElement | null>();

function getBallSprite(tier: number): HTMLCanvasElement | null {
  const hit = ballSpriteCache.get(tier);
  if (hit !== undefined) return hit;
  let made: HTMLCanvasElement | null = null;
  try {
    if (typeof document !== "undefined") {
      const r0 = tierRadius(tier);
      const half = (r0 + SPRITE_PAD) * SPRITE_SS;
      const c = document.createElement("canvas");
      c.width = half * 2;
      c.height = half * 2;
      const cctx = c.getContext("2d");
      if (cctx) {
        paintBall(cctx, half, half, r0 * SPRITE_SS, tier);
        made = c;
      }
    }
  } catch {
    made = null;
  }
  ballSpriteCache.set(tier, made);
  return made;
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  tier: number,
  alpha: number,
  now: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (tier === KRAKEN) {
    // slow pulsing gold aura
    const pulse = 0.5 + 0.5 * Math.sin(now / 380);
    const ar = r + 9 + pulse * 8;
    const aura = ctx.createRadialGradient(x, y, r * 0.55, x, y, ar);
    aura.addColorStop(0, "rgba(240,180,92,0)");
    aura.addColorStop(0.62, `rgba(240,180,92,${(0.1 + pulse * 0.12).toFixed(3)})`);
    aura.addColorStop(1, "rgba(240,180,92,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y, ar, 0, Math.PI * 2);
    ctx.fill();
  }
  const spr = getBallSprite(tier);
  if (spr) {
    const k = r / tierRadius(tier);
    const dh = (tierRadius(tier) + SPRITE_PAD) * k;
    ctx.drawImage(spr, x - dh, y - dh, dh * 2, dh * 2);
  } else {
    paintBall(ctx, x, y, r, tier);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* The hold: hull backdrop, plank walls and floor, brackets and bolts  */
/* ------------------------------------------------------------------ */

function holdPath(ctx: CanvasRenderingContext2D, geo: Geo): void {
  ctx.beginPath();
  ctx.moveTo(geo.left, geo.top);
  ctx.lineTo(geo.left, geo.floor - HOLD_CR);
  ctx.quadraticCurveTo(geo.left, geo.floor, geo.left + HOLD_CR, geo.floor);
  ctx.lineTo(geo.right - HOLD_CR, geo.floor);
  ctx.quadraticCurveTo(geo.right, geo.floor, geo.right, geo.floor - HOLD_CR);
  ctx.lineTo(geo.right, geo.top);
}

function drawBolt(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 2.3, 0, Math.PI * 2);
  ctx.fillStyle = IRON_BOLT;
  ctx.fill();
  ctx.strokeStyle = "rgba(8,12,16,0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x - 0.7, y - 0.7, 0.8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fill();
}

function drawCap(ctx: CanvasRenderingContext2D, x: number, topY: number): void {
  ctx.beginPath();
  ctx.roundRect(x, topY - 3, WALL_T + 3, 11, 2);
  ctx.fillStyle = IRON_PLATE;
  ctx.fill();
  ctx.strokeStyle = "rgba(8,12,16,0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPlankStrip(
  ctx: CanvasRenderingContext2D,
  axis: "v" | "h",
  fixed: number,
  from: number,
  to: number,
  thickness: number,
  step: number,
  seedBase: number,
): void {
  const len = to - from;
  if (len <= 4) return;
  const n = Math.max(1, Math.round(len / step));
  const seg = len / n;
  ctx.save();
  ctx.lineCap = "butt";
  for (let i = 0; i < n; i++) {
    const a = from + i * seg;
    const b = a + seg;
    // alternating plank tones
    ctx.strokeStyle = i % 2 === 0 ? WOOD_A : WOOD_B;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    if (axis === "v") {
      ctx.moveTo(fixed, a + 0.5);
      ctx.lineTo(fixed, b - 0.5);
    } else {
      ctx.moveTo(a + 0.5, fixed);
      ctx.lineTo(b - 0.5, fixed);
    }
    ctx.stroke();
    // 1px seam between planks
    if (i < n - 1) {
      ctx.strokeStyle = WOOD_SEAM;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (axis === "v") {
        ctx.moveTo(fixed - thickness / 2, Math.round(b) + 0.5);
        ctx.lineTo(fixed + thickness / 2, Math.round(b) + 0.5);
      } else {
        ctx.moveTo(Math.round(b) + 0.5, fixed - thickness / 2);
        ctx.lineTo(Math.round(b) + 0.5, fixed + thickness / 2);
      }
      ctx.stroke();
    }
    // a few darker knots, deterministic so they do not flicker
    const hsh = ((i * 7919 + seedBase * 104729) >>> 0) % 11;
    if (hsh < 3) {
      const kc = a + seg * (0.3 + (hsh / 11) * 0.4);
      const off = ((hsh % 3) - 1) * (thickness * 0.18);
      ctx.fillStyle = "rgba(28,19,12,0.85)";
      ctx.beginPath();
      if (axis === "v") ctx.arc(fixed + off, kc, 1.6, 0, Math.PI * 2);
      else ctx.arc(kc, fixed + off, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHold(ctx: CanvasRenderingContext2D, geo: Geo): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";

  // wood frame: dark seam edge, then the plank band
  holdPath(ctx, geo);
  ctx.strokeStyle = WOOD_EDGE;
  ctx.lineWidth = WALL_T * 2 + 3;
  ctx.stroke();
  holdPath(ctx, geo);
  ctx.strokeStyle = WOOD_B;
  ctx.lineWidth = WALL_T * 2;
  ctx.stroke();

  // iron corner plates over the rounded bottom corners
  ctx.strokeStyle = IRON_PLATE;
  ctx.lineWidth = WALL_T * 2 - 2;
  ctx.beginPath();
  ctx.moveTo(geo.left, geo.floor - HOLD_CR - 9);
  ctx.quadraticCurveTo(geo.left, geo.floor, geo.left + HOLD_CR + 9, geo.floor);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(geo.right, geo.floor - HOLD_CR - 9);
  ctx.quadraticCurveTo(geo.right, geo.floor, geo.right - HOLD_CR - 9, geo.floor);
  ctx.stroke();

  // interior: very dark hull, two faint diagonal support beams, floor shadow
  holdPath(ctx, geo);
  ctx.save();
  ctx.clip();
  const holdW = geo.right - geo.left;
  const hull = ctx.createLinearGradient(0, geo.top, 0, geo.floor);
  hull.addColorStop(0, "#16110c");
  hull.addColorStop(1, "#0a0806");
  ctx.fillStyle = hull;
  ctx.fillRect(geo.left, geo.top, holdW, geo.floor - geo.top);
  ctx.strokeStyle = "rgba(126,90,58,0.075)";
  ctx.lineWidth = 17;
  ctx.beginPath();
  ctx.moveTo(geo.left + holdW * 0.04, geo.top + 26);
  ctx.lineTo(geo.left + holdW * 0.62, geo.floor + 8);
  ctx.moveTo(geo.right - holdW * 0.04, geo.top + 26);
  ctx.lineTo(geo.right - holdW * 0.62, geo.floor + 8);
  ctx.stroke();
  const fsh = ctx.createLinearGradient(0, geo.floor - 64, 0, geo.floor);
  fsh.addColorStop(0, "rgba(0,0,0,0)");
  fsh.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = fsh;
  ctx.fillRect(geo.left, geo.floor - 64, holdW, 64);
  ctx.restore();

  // plank detail on the visible bands (vertical plank seams + knots)
  drawPlankStrip(ctx, "v", geo.left - WALL_T / 2, geo.top + 2, geo.floor - HOLD_CR - 8, WALL_T - 3, 31, 1);
  drawPlankStrip(ctx, "v", geo.right + WALL_T / 2, geo.top + 2, geo.floor - HOLD_CR - 8, WALL_T - 3, 31, 2);
  drawPlankStrip(ctx, "h", geo.floor + WALL_T / 2, geo.left + HOLD_CR + 8, geo.right - HOLD_CR - 8, WALL_T - 3, 24, 3);

  // reinforced rim: iron caps on the wall tops, 4 bolts total
  drawCap(ctx, geo.left - WALL_T - 1.5, geo.top);
  drawCap(ctx, geo.right - 1.5, geo.top);
  drawBolt(ctx, geo.left - WALL_T / 2, geo.top + 3);
  drawBolt(ctx, geo.right + WALL_T / 2, geo.top + 3);
  drawBolt(ctx, geo.left + 3, geo.floor - 3);
  drawBolt(ctx, geo.right - 3, geo.floor - 3);

  // inner edge highlight, like lantern light catching the boards
  holdPath(ctx, geo);
  ctx.strokeStyle = "rgba(214,164,106,0.20)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Rope fill line, warning marker, lantern glow                        */
/* ------------------------------------------------------------------ */

function drawRope(ctx: CanvasRenderingContext2D, geo: Geo, prog: number, now: number): void {
  const x0 = geo.left + 5;
  const x1 = geo.right - 5;
  const y = geo.fillLine;
  const pulse = 0.5 + 0.5 * Math.sin(now / 90);
  // hemp tan blending to rose as the overflow fuse burns
  const cr = Math.round(200 + 55 * prog);
  const cg = Math.round(162 - 62 * prog);
  const cb = Math.round(106 + 18 * prog);
  const alpha = Math.min(1, 0.42 + prog * 0.55);
  ctx.save();
  if (prog > 0) {
    ctx.shadowColor = "rgba(255,90,118,0.85)";
    ctx.shadowBlur = 4 + 9 * prog * pulse;
  }
  ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 5) {
    const yy = y + Math.sin((x - x0) * 0.18) * 1.7;
    if (x === x0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.lineTo(x1, y + Math.sin((x1 - x0) * 0.18) * 1.7);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // cross-hatch ticks suggesting the rope twist
  ctx.strokeStyle = `rgba(120,92,56,${(alpha * 0.8).toFixed(3)})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0 + 4; x < x1 - 2; x += 9) {
    const yy = y + Math.sin((x - x0) * 0.18) * 1.7;
    ctx.moveTo(x - 1.6, yy + 2.2);
    ctx.lineTo(x + 1.6, yy - 2.2);
  }
  ctx.stroke();
  ctx.restore();
}

/** Gold triangle with a dark exclamation bar: the no-emoji warning marker. */
function drawTriangleBang(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s * 0.95, y + s * 0.78);
  ctx.lineTo(x - s * 0.95, y + s * 0.78);
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.strokeStyle = "#7a4f17";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#1c1206";
  ctx.fillRect(x - 1.4, y - s * 0.45, 2.8, s * 0.72);
  ctx.beginPath();
  ctx.arc(x, y + s * 0.5, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Ship-interior backdrop: hull ribs, deck, porthole, lantern, cargo.  */
/* Painted ONCE into an offscreen canvas (rebuilt only on resize or    */
/* when the pumps fitting changes), then blitted each frame in one     */
/* drawImage. Only the lantern glow is drawn per frame so it pulses.   */
/* Everything stays at low brightness so the metallic balls and the    */
/* gold rope fill line keep the contrast.                              */
/* ------------------------------------------------------------------ */

const clampN = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** Bottom of the ceiling-plank band, roughly 12% of viewport height. */
const deckBandBottom = (h: number): number => Math.min(Math.round(h * 0.12), 78);

type LanternM = { x: number; bandB: number; bodyW: number; bodyH: number; glassY: number; cy: number };

function lanternMetrics(w: number, h: number): LanternM {
  const geo = computeGeo(w, h);
  const bandB = deckBandBottom(h);
  const chain = clampN(h * 0.022, 8, 15);
  const bodyH = clampN(h * 0.038, 17, 26);
  const bodyW = bodyH * 0.62;
  const glassY = bandB + chain + 9;
  return { x: w - clampN(geo.left * 0.55, 20, 140), bandB, bodyW, bodyH, glassY, cy: glassY + bodyH / 2 };
}

/** Per-frame pulsing glass glow; the lantern body itself lives in the backdrop. */
function drawLanternGlow(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
  const a = 0.08 + 0.02 * Math.sin(now / 640);
  const g = ctx.createRadialGradient(x, y, 2, x, y, 130);
  g.addColorStop(0, `rgba(240,180,92,${a.toFixed(3)})`);
  g.addColorStop(1, "rgba(240,180,92,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - 130, y - 130, 260, 260);
}

function drawHangingLantern(b: CanvasRenderingContext2D, m: LanternM): void {
  // short chain of links from the crossbeam underside down to the cap
  const y0 = m.bandB + 6;
  const capY = m.glassY - 3;
  const span = Math.max(6, capY - y0);
  b.strokeStyle = "#262019";
  b.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    const ly = y0 + (span / 3) * (i + 0.5);
    b.beginPath();
    b.ellipse(m.x, ly, 1.5, (span / 3) * 0.55, 0, 0, Math.PI * 2);
    b.stroke();
  }
  // top cap trapezoid
  b.fillStyle = "#1e1a15";
  b.beginPath();
  b.moveTo(m.x - m.bodyW * 0.2, capY - 3);
  b.lineTo(m.x + m.bodyW * 0.2, capY - 3);
  b.lineTo(m.x + m.bodyW * 0.5, m.glassY);
  b.lineTo(m.x - m.bodyW * 0.5, m.glassY);
  b.closePath();
  b.fill();
  // warm glass with a tiny flame hint
  const gx = m.x - m.bodyW / 2;
  const glass = b.createLinearGradient(0, m.glassY, 0, m.glassY + m.bodyH);
  glass.addColorStop(0, "#f0b45c");
  glass.addColorStop(0.55, "#d28f3a");
  glass.addColorStop(1, "#8a5a22");
  b.fillStyle = glass;
  b.beginPath();
  b.roundRect(gx + 1.2, m.glassY + 1.2, m.bodyW - 2.4, m.bodyH - 2.4, 2);
  b.fill();
  b.fillStyle = "rgba(255,238,200,0.85)";
  b.beginPath();
  b.ellipse(m.x, m.glassY + m.bodyH * 0.58, 1.3, 2.4, 0, 0, Math.PI * 2);
  b.fill();
  // dark metal cage frame and two bars
  b.strokeStyle = "#231e18";
  b.lineWidth = 1.8;
  b.beginPath();
  b.roundRect(gx, m.glassY, m.bodyW, m.bodyH, 2.5);
  b.stroke();
  b.lineWidth = 1.1;
  b.beginPath();
  b.moveTo(m.x - m.bodyW * 0.17, m.glassY + 1);
  b.lineTo(m.x - m.bodyW * 0.17, m.glassY + m.bodyH - 1);
  b.moveTo(m.x + m.bodyW * 0.17, m.glassY + 1);
  b.lineTo(m.x + m.bodyW * 0.17, m.glassY + m.bodyH - 1);
  b.stroke();
  // base cap and finial
  b.fillStyle = "#1e1a15";
  b.fillRect(gx - 1.2, m.glassY + m.bodyH, m.bodyW + 2.4, 3);
  b.beginPath();
  b.arc(m.x, m.glassY + m.bodyH + 4.6, 1.5, 0, Math.PI * 2);
  b.fill();
}

function drawPorthole(b: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  // seat shadow into the planks
  b.beginPath();
  b.arc(cx, cy + 1.5, r + 3, 0, Math.PI * 2);
  b.fillStyle = "rgba(0,0,0,0.35)";
  b.fill();
  // night sea behind the glass
  const sea = b.createLinearGradient(0, cy - r, 0, cy + r);
  sea.addColorStop(0, "#0c2733");
  sea.addColorStop(0.55, "#082030");
  sea.addColorStop(1, "#051018");
  b.beginPath();
  b.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  b.fillStyle = sea;
  b.fill();
  b.save();
  b.beginPath();
  b.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  b.clip();
  // tiny moon glint with a faint halo
  b.fillStyle = "rgba(214,228,232,0.75)";
  b.beginPath();
  b.arc(cx + r * 0.3, cy - r * 0.34, Math.max(1.6, r * 0.1), 0, Math.PI * 2);
  b.fill();
  b.fillStyle = "rgba(214,228,232,0.10)";
  b.beginPath();
  b.arc(cx + r * 0.3, cy - r * 0.34, Math.max(3, r * 0.22), 0, Math.PI * 2);
  b.fill();
  // two low wave lines
  b.strokeStyle = "rgba(140,196,206,0.20)";
  b.lineWidth = 1.2;
  for (const [wy, amp] of [
    [cy + r * 0.22, r * 0.07],
    [cy + r * 0.5, r * 0.05],
  ] as const) {
    b.beginPath();
    let first = true;
    for (let x = cx - r; x <= cx + r; x += 3) {
      const yy = wy + Math.sin((x - cx) / (r * 0.32)) * amp;
      if (first) {
        b.moveTo(x, yy);
        first = false;
      } else b.lineTo(x, yy);
    }
    b.stroke();
  }
  b.restore();
  // brass ring with a lighter inner rim and four rivets
  b.beginPath();
  b.arc(cx, cy, r, 0, Math.PI * 2);
  b.strokeStyle = "#6b5a33";
  b.lineWidth = Math.max(3, r * 0.18);
  b.stroke();
  b.beginPath();
  b.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
  b.strokeStyle = "#8a774a";
  b.lineWidth = 1.2;
  b.stroke();
  b.beginPath();
  b.arc(cx, cy, r * 1.09, 0, Math.PI * 2);
  b.strokeStyle = "rgba(10,7,4,0.8)";
  b.lineWidth = 1.5;
  b.stroke();
  b.fillStyle = "#4a3f24";
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i + Math.PI / 4;
    b.beginPath();
    b.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.max(1.2, r * 0.06), 0, Math.PI * 2);
    b.fill();
  }
}

function drawCrate(b: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const g = b.createLinearGradient(0, y, 0, y + s);
  g.addColorStop(0, "#20160d");
  g.addColorStop(1, "#170f08");
  b.fillStyle = g;
  b.fillRect(x, y, s, s);
  b.strokeStyle = "#0d0905";
  b.lineWidth = 1.5;
  b.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  // X brace
  const inset = s * 0.14;
  b.strokeStyle = "#291c0f";
  b.lineWidth = Math.max(2, s * 0.09);
  b.beginPath();
  b.moveTo(x + inset, y + inset);
  b.lineTo(x + s - inset, y + s - inset);
  b.moveTo(x + s - inset, y + inset);
  b.lineTo(x + inset, y + s - inset);
  b.stroke();
  // faint top edge light
  b.strokeStyle = "rgba(140,105,64,0.12)";
  b.lineWidth = 1;
  b.beginPath();
  b.moveTo(x + 1, y + 1.5);
  b.lineTo(x + s - 1, y + 1.5);
  b.stroke();
}

function drawRopeCoil(b: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  b.save();
  b.lineWidth = Math.max(2, R * 0.16);
  for (let i = 0; i < 3; i++) {
    b.strokeStyle = i % 2 === 0 ? "#2b2113" : "#241b10";
    b.beginPath();
    b.ellipse(cx, cy - i * 1.2, R * (1 - i * 0.3), R * (1 - i * 0.3) * 0.34, 0, 0, Math.PI * 2);
    b.stroke();
  }
  b.strokeStyle = "#241b10";
  b.lineWidth = Math.max(1.5, R * 0.12);
  b.beginPath();
  b.moveTo(cx + R * 0.9, cy + 1);
  b.quadraticCurveTo(cx + R * 1.35, cy + 2, cx + R * 1.5, cy - 2);
  b.stroke();
  b.restore();
}

function drawKeg(b: CanvasRenderingContext2D, cx: number, floorY: number, kw: number): void {
  const kh = kw * 1.3;
  const x = cx - kw / 2;
  const y = floorY - kh;
  const g = b.createLinearGradient(x, 0, x + kw, 0);
  g.addColorStop(0, "#190f08");
  g.addColorStop(0.45, "#241810");
  g.addColorStop(1, "#150d07");
  b.fillStyle = g;
  b.beginPath();
  b.roundRect(x, y, kw, kh, kw * 0.16);
  b.fill();
  b.strokeStyle = "#0d0905";
  b.lineWidth = 1.5;
  b.stroke();
  // stave seams
  b.strokeStyle = "rgba(10,7,4,0.7)";
  b.lineWidth = 1;
  b.beginPath();
  b.moveTo(cx - kw * 0.17, y + 3);
  b.lineTo(cx - kw * 0.17, y + kh - 2);
  b.moveTo(cx + kw * 0.17, y + 3);
  b.lineTo(cx + kw * 0.17, y + kh - 2);
  b.stroke();
  // two dull iron hoops
  for (const fy of [y + kh * 0.2, y + kh * 0.74]) {
    b.fillStyle = "#14171a";
    b.fillRect(x - 1, fy, kw + 2, 3);
    b.fillStyle = "rgba(124,135,143,0.12)";
    b.fillRect(x - 1, fy, kw + 2, 1);
  }
  // lid hint
  b.fillStyle = "#1a120a";
  b.beginPath();
  b.ellipse(cx, y + 2, kw / 2 - 2.5, 2.4, 0, 0, Math.PI * 2);
  b.fill();
}

/** Pyramid of 4 balls reusing the smallest-caliber shader, dimmed to a prop. */
function drawCannonPyramid(b: CanvasRenderingContext2D, cx: number, floorY: number, rb: number): void {
  const yb = floorY - rb;
  const spots: ReadonlyArray<readonly [number, number]> = [
    [cx - rb * 2, yb],
    [cx, yb],
    [cx + rb * 2, yb],
    [cx - rb, yb - rb * 1.7],
  ];
  for (const [sx, sy] of spots) {
    paintBall(b, sx, sy, rb, 0);
    b.fillStyle = "rgba(7,6,4,0.58)";
    b.beginPath();
    b.arc(sx, sy, rb + 0.6, 0, Math.PI * 2);
    b.fill();
  }
}

/** Bilge pump set dressing: one pipe segment per pump level, capped at 5. */
function drawBilgePump(b: CanvasRenderingContext2D, x: number, floorY: number, level: number): void {
  const segs = clampN(Math.round(level), 1, 5);
  const segH = 12;
  const pw = 8;
  const topY = floorY - 4 - segs * segH;
  // base plinth
  b.fillStyle = "#15181b";
  b.fillRect(x - pw / 2 - 3, floorY - 4, pw + 6, 4);
  // pipe segments with collar rings
  for (let i = 0; i < segs; i++) {
    const sy = floorY - 4 - (i + 1) * segH;
    const g = b.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
    g.addColorStop(0, "#262d33");
    g.addColorStop(0.5, "#1c2227");
    g.addColorStop(1, "#14191d");
    b.fillStyle = g;
    b.fillRect(x - pw / 2, sy, pw, segH);
    b.fillStyle = "rgba(150,165,175,0.12)";
    b.fillRect(x - pw / 2 + 1, sy, 1, segH);
    b.fillStyle = "#11151a";
    b.fillRect(x - pw / 2 - 1.5, sy - 1, pw + 3, 2.5);
  }
  // cap, lever handle and knob
  b.fillStyle = "#1c2227";
  b.fillRect(x - pw / 2 - 2, topY - 4, pw + 4, 5);
  b.strokeStyle = "#2b2114";
  b.lineWidth = 3;
  b.lineCap = "round";
  b.beginPath();
  b.moveTo(x + 1, topY - 2);
  b.lineTo(x + 16, topY - 14);
  b.stroke();
  b.lineCap = "butt";
  b.fillStyle = "#191208";
  b.beginPath();
  b.arc(x + 16, topY - 14, 2.4, 0, Math.PI * 2);
  b.fill();
  // spout stub and a tiny water arc down to the boards
  b.fillStyle = "#1a2024";
  b.fillRect(x - pw / 2 - 6, topY + 3, 7, 4);
  b.strokeStyle = "rgba(116,176,186,0.30)";
  b.lineWidth = 1.4;
  b.beginPath();
  b.moveTo(x - pw / 2 - 5, topY + 7);
  b.quadraticCurveTo(x - pw / 2 - 14, topY + (floorY - topY) * 0.45, x - pw / 2 - 17, floorY - 1.5);
  b.stroke();
  b.fillStyle = "rgba(116,176,186,0.22)";
  b.beginPath();
  b.arc(x - pw / 2 - 12, topY + (floorY - topY) * 0.5, 1.1, 0, Math.PI * 2);
  b.fill();
  b.beginPath();
  b.arc(x - pw / 2 - 15.5, topY + (floorY - topY) * 0.75, 1.1, 0, Math.PI * 2);
  b.fill();
  b.fillStyle = "rgba(116,176,186,0.08)";
  b.beginPath();
  b.ellipse(x - pw / 2 - 16, floorY - 1, 7, 2, 0, 0, Math.PI * 2);
  b.fill();
}

/**
 * Bilge-pump prop, positioned beside the hold's right wall. Gameplay-meaningful
 * (it grows with the pumps fitting), so it is drawn on top of EITHER backdrop:
 * baked into the procedural backdrop, or blitted per frame over the AI image.
 */
function drawPumpProp(b: CanvasRenderingContext2D, w: number, h: number, pumps: number): void {
  if (pumps <= 0) return;
  const geo = computeGeo(w, h);
  const gutter = geo.left;
  drawBilgePump(b, Math.min(geo.right + WALL_T + clampN(gutter * 0.12, 10, 26), w - 12), geo.floor, pumps);
}

function paintShipBackdrop(b: CanvasRenderingContext2D, w: number, h: number, pumps: number): void {
  const geo = computeGeo(w, h);
  const gutter = geo.left;
  const floorY = geo.floor;
  const bandB = deckBandBottom(h);
  b.save();
  b.lineCap = "butt";
  b.lineJoin = "round";

  // hull wall: horizontal planking strips at very low contrast
  b.fillStyle = "#171008";
  b.fillRect(0, 0, w, h);
  const row = clampN(h * 0.045, 16, 28);
  let ri = 0;
  for (let y = bandB; y < h; y += row, ri++) {
    b.fillStyle = ri % 2 === 0 ? "#1a1309" : "#171008";
    b.fillRect(0, y, w, row);
    b.fillStyle = "rgba(9,6,3,0.85)";
    b.fillRect(0, y, w, 1);
    // staggered butt joints between planks
    const stride = w * 0.34;
    b.fillStyle = "rgba(9,6,3,0.55)";
    for (let x = (ri % 3) * stride * 0.33 + stride * 0.18; x < w; x += stride) {
      b.fillRect(Math.round(x), y + 1, 1, row - 1);
    }
  }

  // gentle darkening toward the bilge
  const dg = b.createLinearGradient(0, h * 0.45, 0, h);
  dg.addColorStop(0, "rgba(0,0,0,0)");
  dg.addColorStop(1, "rgba(0,0,0,0.28)");
  b.fillStyle = dg;
  b.fillRect(0, Math.round(h * 0.45), w, h);

  // curved hull ribs hugging the screen edges, bowing outward
  const ribW = clampN(gutter * 0.16, 8, 17);
  const ribGap = clampN(gutter * 0.24, ribW + 4, 46);
  const bow = clampN(gutter * 0.1, 5, 20);
  const ribTop = bandB - 2;
  const ribSpan = floorY + 6 - ribTop;
  const drawRib = (xc: number, dir: 1 | -1): void => {
    const ribPath = (): void => {
      b.beginPath();
      b.moveTo(xc, ribTop);
      b.quadraticCurveTo(xc + dir * bow, ribTop + ribSpan / 2, xc, ribTop + ribSpan);
    };
    ribPath();
    b.strokeStyle = "#0f0a05";
    b.lineWidth = ribW + 2;
    b.stroke();
    const g = b.createLinearGradient(0, ribTop, 0, ribTop + ribSpan);
    g.addColorStop(0, "#2a1d10");
    g.addColorStop(1, "#1c140c");
    ribPath();
    b.strokeStyle = g;
    b.lineWidth = ribW;
    b.stroke();
    ribPath();
    b.strokeStyle = "rgba(12,8,4,0.7)";
    b.lineWidth = 1;
    b.stroke();
    // subtle highlight where deck light catches the rib shoulder
    b.strokeStyle = "rgba(206,158,100,0.10)";
    b.lineWidth = Math.max(1.5, ribW * 0.3);
    b.lineCap = "round";
    b.beginPath();
    b.moveTo(xc, ribTop + 6);
    b.quadraticCurveTo(xc + dir * bow * 0.35, ribTop + ribSpan * 0.16, xc + dir * bow * 0.45, ribTop + ribSpan * 0.27);
    b.stroke();
    b.lineCap = "butt";
  };
  for (let i = 0; i < 3; i++) {
    const off = ribW * 0.5 + 2 + i * ribGap;
    drawRib(off, -1);
    drawRib(w - off, 1);
  }

  // deck above: ceiling plank band with a heavy edge beam underneath
  const rows = 3;
  const rh = bandB / rows;
  for (let i = 0; i < rows; i++) {
    const y = i * rh;
    b.fillStyle = i % 2 === 0 ? "#1d140c" : "#19110a";
    b.fillRect(0, y, w, rh + 1);
    b.fillStyle = "rgba(8,5,3,0.85)";
    b.fillRect(0, Math.round(y + rh) - 1, w, 1);
    const stride2 = w * 0.3;
    b.fillStyle = "rgba(8,5,3,0.6)";
    for (let x = (w * (0.12 + i * 0.21)) % stride2; x < w; x += stride2) {
      b.fillRect(Math.round(x), y + 1, 1, rh - 1);
    }
  }
  b.fillStyle = "#120c06";
  b.fillRect(0, bandB - 5, w, 5);
  b.fillStyle = "rgba(206,158,100,0.10)";
  b.fillRect(0, bandB - 1, w, 1);

  // two heavy crossbeams; the right one carries the lantern chain
  const lm = lanternMetrics(w, h);
  const beamW = clampN(w * 0.035, 16, 36);
  for (const bx of [w * 0.26, lm.x]) {
    const bg = b.createLinearGradient(bx - beamW / 2, 0, bx + beamW / 2, 0);
    bg.addColorStop(0, "#1a1109");
    bg.addColorStop(0.5, "#271a0e");
    bg.addColorStop(1, "#150d07");
    b.fillStyle = bg;
    b.fillRect(bx - beamW / 2, 0, beamW, bandB + 7);
    b.strokeStyle = "rgba(8,5,3,0.9)";
    b.lineWidth = 1;
    b.strokeRect(bx - beamW / 2 + 0.5, -2, beamW - 1, bandB + 8.5);
    b.fillStyle = "rgba(206,158,100,0.12)";
    b.fillRect(bx - beamW / 2 + 1, bandB + 5, beamW - 2, 1.5);
    b.fillStyle = "rgba(124,135,143,0.4)";
    for (const ox of [-beamW * 0.26, beamW * 0.26]) {
      b.beginPath();
      b.arc(bx + ox, bandB + 1.5, 1.6, 0, Math.PI * 2);
      b.fill();
    }
  }

  // thin light shafts leaking between the deck planks
  const shaft = (sx: number, sw: number, len: number, slant: number): void => {
    const y0 = bandB + 2;
    const y1 = bandB + len;
    const sg = b.createLinearGradient(0, y0, 0, y1);
    sg.addColorStop(0, "rgba(240,200,120,0.055)");
    sg.addColorStop(1, "rgba(240,200,120,0)");
    b.fillStyle = sg;
    b.beginPath();
    b.moveTo(sx, y0);
    b.lineTo(sx + sw, y0);
    b.lineTo(sx + sw + slant, y1);
    b.lineTo(sx + slant, y1);
    b.closePath();
    b.fill();
  };
  shaft(gutter * 0.3, clampN(w * 0.012, 6, 13), h * 0.34, h * 0.05);
  shaft(w * 0.47, clampN(w * 0.016, 8, 16), h * 0.3, h * 0.04);
  shaft(w - gutter * 0.5, clampN(w * 0.012, 6, 12), h * 0.3, h * 0.045);

  // brass porthole onto the night sea, upper-left
  const pr = clampN(w * 0.04, 12, 46);
  drawPorthole(b, Math.max(gutter * 0.5, pr + 12), bandB + pr + clampN(h * 0.06, 16, 44), pr);

  // cargo silhouettes resting on the floor at both sides
  const s1 = clampN(gutter * 0.42, 30, 70);
  const crateX = Math.max(4, gutter * 0.1);
  drawCrate(b, crateX, floorY - s1, s1);
  drawCrate(b, crateX + s1 * 0.16, floorY - s1 - s1 * 0.74, s1 * 0.74);
  drawRopeCoil(b, crateX + s1 + clampN(gutter * 0.18, 14, 44), floorY - 5, clampN(gutter * 0.16, 12, 30));
  drawCannonPyramid(b, w - gutter * 0.55, floorY, clampN(gutter * 0.12, 8, 17));
  drawKeg(b, w - gutter * 0.24, floorY, clampN(gutter * 0.26, 20, 48));

  // bilge pump beside the hold's right wall (only when the fitting is owned)
  drawPumpProp(b, w, h, pumps);

  // floor shadow ledge grounds the props
  const fs = b.createLinearGradient(0, floorY - 46, 0, floorY);
  fs.addColorStop(0, "rgba(0,0,0,0)");
  fs.addColorStop(1, "rgba(0,0,0,0.30)");
  b.fillStyle = fs;
  b.fillRect(0, floorY - 46, w, 46);
  b.fillStyle = "rgba(0,0,0,0.24)";
  b.fillRect(0, floorY, w, Math.max(0, h - floorY));
  b.fillStyle = "rgba(9,6,3,0.9)";
  b.fillRect(0, floorY, w, 1);

  // the hanging lantern itself (its glow pulses per frame in draw())
  drawHangingLantern(b, lm);
  b.restore();
}

/* ------------------------------------------------------------------ */
/* Premium AI backdrop: /seas-art/bg-powderhold.png drawn to COVER.    */
/* Loaded once, best-effort. A no-op onerror plus the `ok` flag mean a */
/* missing or slow image never throws and never blocks the game; the   */
/* procedural paintShipBackdrop above remains the fallback path.       */
/* ------------------------------------------------------------------ */

const BG_ART_SRC = "/seas-art/bg-powderhold.png";

type BgArt = { img: HTMLImageElement; ok: boolean };

let bgArt: BgArt | null = null;

/** Lazily kick off the single backdrop image load (browser only). */
function getBgArt(): BgArt | null {
  if (bgArt) return bgArt;
  if (typeof window === "undefined" || typeof Image === "undefined") return null;
  const state: BgArt = { img: new Image(), ok: false };
  state.img.onload = () => {
    state.ok = true;
  };
  // Missing or failed asset never throws: the procedural backdrop covers it.
  state.img.onerror = () => {
    state.ok = false;
  };
  state.img.src = BG_ART_SRC;
  bgArt = state;
  return state;
}

/**
 * Draw the loaded backdrop image to fully cover w x h (object-fit: cover),
 * scaling to fill and center-cropping the overflow. Returns true on success,
 * false if the image is not ready so the caller can use the fallback.
 */
function drawBackdropCover(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const art = getBgArt();
  if (!art || !art.ok) return false;
  const iw = art.img.naturalWidth;
  const ih = art.img.naturalHeight;
  if (iw <= 0 || ih <= 0) return false;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(art.img, dx, dy, dw, dh);
  return true;
}

function Dot({ size, tier }: { size: number; tier: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: BALL_GRADIENT_CSS,
        display: "inline-block",
        boxShadow: `inset 0 0 0 2px ${ringColor(tier)}55, inset 0 -2px 4px rgba(0,8,12,0.5)`,
      }}
    />
  );
}

export default function PowderHoldPage() {
  const { captain, identityChecked, submitScore, submitState, lastResult } = useSeasGame("powder-hold");

  const [phase, setPhase] = useState<Phase>("start");
  const [finalScore, setFinalScore] = useState(0);
  const [finalBiggest, setFinalBiggest] = useState(0);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 360, h: 600, dpr: 1 });
  const geoRef = useRef<Geo>(computeGeo(360, 600));
  const backdropRef = useRef<HTMLCanvasElement | null>(null);
  const backdropKeyRef = useRef("");

  const phaseRef = useRef<Phase>("start");
  const ballsRef = useRef<Ball[]>([]);
  const contactRef = useRef<Map<string, number>>(new Map());
  const popsRef = useRef<Pop[]>([]);
  const flashesRef = useRef<Flash[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const scoreRef = useRef(0);
  const biggestRef = useRef(0);
  const krakenSeenRef = useRef(false);
  const overflowRef = useRef(0);
  const runEndRef = useRef(0); // performance.now() timestamp the timed run ends at
  const warnXRef = useRef(0);
  const lastDropRef = useRef(0);
  const idRef = useRef(1);
  const currentRef = useRef(0);
  const nextRef = useRef(1);
  const aimXRef = useRef(180);
  const keysRef = useRef({ left: false, right: false });
  const submittedRef = useRef(false);

  const captainRef = useRef(captain);
  useEffect(() => {
    captainRef.current = captain;
  }, [captain]);
  const submitRef = useRef(submitScore);
  useEffect(() => {
    submitRef.current = submitScore;
  }, [submitScore]);

  // merge flash sprite (game keeps working if the image is missing)
  useEffect(() => {
    let dead = false;
    void loadImages({ explosion: KENNEY.explosion(1) }).then((imgs) => {
      if (!dead) imagesRef.current = imgs;
    });
    return () => {
      dead = true;
    };
  }, []);

  const graceSeconds = (): number => 2.5 + 0.4 * (captainRef.current?.fittings.pumps ?? 0);

  const clampAim = (x: number): number => {
    const geo = geoRef.current;
    const r = tierRadius(currentRef.current);
    return Math.min(Math.max(x, geo.left + r + 1), geo.right - r - 1);
  };

  const spawnSparks = (x: number, y: number, color: string): void => {
    const n = 6 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 110 + Math.random() * 170;
      sparksRef.current.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 70,
        age: 0,
        life: 0.4 + Math.random() * 0.25,
        color,
        size: 1.4 + Math.random() * 1.6,
      });
    }
  };

  const mergePair = (a: Ball, b: Ball, now: number): void => {
    const balls = ballsRef.current;
    const ia = balls.indexOf(a);
    if (ia >= 0) balls.splice(ia, 1);
    const ib = balls.indexOf(b);
    if (ib >= 0) balls.splice(ib, 1);
    const t = a.tier;
    const gained = tierScore(t);
    scoreRef.current += gained;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    popsRef.current.push({ x: mx, y: my - 12, text: `+${gained}`, age: 0, gold: t >= 4 });
    spawnSparks(mx, my, ringColor(Math.min(t + 1, KRAKEN)));
    if (t < KRAKEN) {
      const nt = t + 1;
      const r = tierRadius(nt);
      balls.push({ id: idRef.current++, tier: nt, x: mx, y: my, px: mx, py: my + 0.1, r, born: now });
      flashesRef.current.push({ x: mx, y: my, r: r + 8, age: 0, gold: nt >= 5, rot: Math.random() * Math.PI * 2 });
      if (nt > biggestRef.current) biggestRef.current = nt;
      if (nt === KRAKEN && !krakenSeenRef.current) {
        krakenSeenRef.current = true;
        popsRef.current.push({ x: mx, y: my - r - 16, text: "KRAKEN!", age: -0.4, gold: true, big: true });
        flashesRef.current.push({ x: mx, y: my, r: r + 48, age: 0, gold: true, rot: Math.random() * Math.PI * 2 });
      }
    } else {
      flashesRef.current.push({ x: mx, y: my, r: 130, age: 0, gold: true, rot: Math.random() * Math.PI * 2 });
    }
  };

  const enforceCap = (now: number): void => {
    const balls = ballsRef.current;
    let guard = 0;
    while (balls.length > MAX_BALLS && guard++ < 24) {
      let fused = false;
      for (let t = 0; t < KRAKEN && !fused; t++) {
        const same = balls.filter((b) => b.tier === t);
        if (same.length >= 2) {
          same.sort((p, q) => p.born - q.born);
          const a = same[0];
          const b = same[1];
          if (a && b) {
            mergePair(a, b, now);
            fused = true;
          }
        }
      }
      if (!fused) break;
    }
  };

  const drop = (now: number): void => {
    if (phaseRef.current !== "playing") return;
    if (now - lastDropRef.current < DROP_COOLDOWN_MS) return;
    lastDropRef.current = now;
    const t = currentRef.current;
    const r = tierRadius(t);
    const x = clampAim(aimXRef.current) + (Math.random() - 0.5) * 0.6;
    ballsRef.current.push({ id: idRef.current++, tier: t, x, y: geoRef.current.dropY, px: x, py: geoRef.current.dropY, r, born: now });
    if (t > biggestRef.current) biggestRef.current = t;
    currentRef.current = nextRef.current;
    nextRef.current = Math.floor(Math.random() * 3);
    aimXRef.current = clampAim(aimXRef.current);
    enforceCap(now);
  };

  const endGame = (): void => {
    if (phaseRef.current !== "playing") return;
    phaseRef.current = "over";
    const score = Math.round(scoreRef.current);
    setFinalScore(score);
    setFinalBiggest(biggestRef.current);
    setPhase("over");
    for (const b of ballsRef.current) {
      if (Math.random() < 0.3) flashesRef.current.push({ x: b.x, y: b.y, r: b.r + 10, age: 0, gold: true, rot: Math.random() * Math.PI * 2 });
    }
    flashesRef.current.push({ x: warnXRef.current, y: geoRef.current.fillLine, r: 96, age: 0, gold: true, rot: Math.random() * Math.PI * 2 });
    if (!submittedRef.current) {
      submittedRef.current = true;
      void submitRef.current(score, { biggest: tierRadius(biggestRef.current) });
    }
  };

  const startRun = (): void => {
    ballsRef.current = [];
    contactRef.current.clear();
    popsRef.current = [];
    flashesRef.current = [];
    sparksRef.current = [];
    scoreRef.current = 0;
    biggestRef.current = 0;
    krakenSeenRef.current = false;
    overflowRef.current = 0;
    lastDropRef.current = 0;
    idRef.current = 1;
    submittedRef.current = false;
    currentRef.current = Math.floor(Math.random() * 3);
    nextRef.current = Math.floor(Math.random() * 3);
    const geo = geoRef.current;
    aimXRef.current = (geo.left + geo.right) / 2;
    runEndRef.current = performance.now() + GAME_SECONDS * 1000;
    phaseRef.current = "playing";
    setPhase("playing");
  };

  const stepPhysics = (dt: number, now: number): void => {
    const balls = ballsRef.current;
    const geo = geoRef.current;

    for (const b of balls) {
      // heavier damping on balls that touched anything last substep: stacks settle
      const damp = b.hit ? CONTACT_DAMP : AIR_DAMP;
      const vx = (b.x - b.px) * damp;
      const vy = (b.y - b.py) * damp;
      b.px = b.x;
      b.py = b.y;
      b.x += vx;
      b.y += vy + GRAVITY * dt * dt;
      b.hit = false;
    }

    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (!a) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (!b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minD = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 < minD * minD && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            const overlap = minD - d;
            const nx = dx / d;
            const ny = dy / d;
            const ma = a.r * a.r;
            const mb = b.r * b.r;
            const wa = mb / (ma + mb);
            const wb = ma / (ma + mb);
            a.x -= nx * overlap * wa;
            a.y -= ny * overlap * wa;
            b.x += nx * overlap * wb;
            b.y += ny * overlap * wb;
            a.hit = true;
            b.hit = true;
          }
        }
        if (a.x < geo.left + a.r) {
          a.x = geo.left + a.r;
          a.py = a.y - (a.y - a.py) * WALL_FRICTION;
          a.hit = true;
        }
        if (a.x > geo.right - a.r) {
          a.x = geo.right - a.r;
          a.py = a.y - (a.y - a.py) * WALL_FRICTION;
          a.hit = true;
        }
        if (a.y > geo.floor - a.r) {
          a.y = geo.floor - a.r;
          a.px = a.x - (a.x - a.px) * FLOOR_FRICTION;
          a.hit = true;
        }
        if (a.y < a.r) {
          a.y = a.r;
          a.hit = true;
        }
      }
    }

    // anti-trampoline: a contact may never launch a ball upward faster than
    // MAX_BOUNCE_VY; clamp the implied verlet velocity when it points up
    const maxUp = MAX_BOUNCE_VY * dt;
    for (const b of balls) {
      if (b.hit && b.y - b.py < -maxUp) b.py = b.y + maxUp;
    }

    const contact = contactRef.current;
    const touched = new Set<string>();
    const consumed = new Set<number>();
    const queue: Array<[Ball, Ball]> = [];
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b || a.tier !== b.tier) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minD = a.r + b.r + 1.5;
        if (dx * dx + dy * dy <= minD * minD) {
          const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
          const ms = (contact.get(key) ?? 0) + dt * 1000;
          contact.set(key, ms);
          touched.add(key);
          if (ms >= MERGE_CONTACT_MS && !consumed.has(a.id) && !consumed.has(b.id)) {
            consumed.add(a.id);
            consumed.add(b.id);
            queue.push([a, b]);
          }
        }
      }
    }
    for (const k of Array.from(contact.keys())) {
      if (!touched.has(k)) contact.delete(k);
    }
    for (const [a, b] of queue) mergePair(a, b, now);
  };

  const checkOverflow = (dt: number, now: number): void => {
    const geo = geoRef.current;
    let offending: Ball | null = null;
    for (const b of ballsRef.current) {
      // any ball whose center sits above the rope arms the fuse, settled or not;
      // only a freshly dropped ball passing through the top gets a pass
      if (b.y < geo.fillLine && now - b.born > MIN_BALL_AGE_MS) {
        offending = b;
        break;
      }
    }
    if (offending) {
      overflowRef.current += dt;
      warnXRef.current = offending.x;
      if (overflowRef.current >= graceSeconds()) endGame();
    } else {
      overflowRef.current = 0;
    }
  };

  // ship backdrop cache: repainted only on resize, dpr change, or pumps change
  const ensureBackdrop = (w: number, h: number): HTMLCanvasElement | null => {
    const dpr = sizeRef.current.dpr;
    const pumps = Math.min(captainRef.current?.fittings.pumps ?? 0, 5);
    const key = `${w}|${h}|${dpr}|${pumps}`;
    if (backdropRef.current && backdropKeyRef.current === key) return backdropRef.current;
    try {
      const c = backdropRef.current ?? document.createElement("canvas");
      backdropRef.current = c;
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
      const bctx = c.getContext("2d");
      if (bctx) {
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintShipBackdrop(bctx, w, h, pumps);
      }
      backdropKeyRef.current = key;
      return c;
    } catch {
      return null;
    }
  };

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void => {
    const geo = geoRef.current;
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, w, h);

    // ship-interior backdrop: premium AI art drawn to cover, behind everything.
    // If the image is missing or still loading, fall back to the cached
    // procedural interior. Either way the gameplay-meaningful bilge pump is
    // drawn on top so it grows visibly with the pumps fitting.
    const usedArt = drawBackdropCover(ctx, w, h);
    if (usedArt) {
      const pumps = Math.min(captainRef.current?.fittings.pumps ?? 0, 5);
      drawPumpProp(ctx, w, h, pumps);
    } else {
      const bd = ensureBackdrop(w, h);
      if (bd) ctx.drawImage(bd, 0, 0, w, h);
    }
    const lm = lanternMetrics(w, h);
    drawLanternGlow(ctx, lm.x, lm.cy, now);

    // the wooden powder hold
    drawHold(ctx, geo);

    // rope fill line (hemp tan, glows rose while the fuse counts)
    const prog = phaseRef.current === "playing" ? Math.min(1, overflowRef.current / graceSeconds()) : 0;
    drawRope(ctx, geo, prog, now);

    // balls
    for (const b of ballsRef.current) drawBall(ctx, b.x, b.y, b.r, b.tier, 1, now);

    // overflow warning: rising pulsing triangle-bang while the fuse counts
    if (prog > 0 && phaseRef.current === "playing") {
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(now / 90));
      drawTriangleBang(ctx, warnXRef.current, geo.fillLine - 18 - prog * 18, 11);
      ctx.restore();
    }

    // effects: explosion flashes, ring sparks, score pops
    const boom = imagesRef.current["explosion"];
    for (const f of flashesRef.current) {
      if (f.age < 0) continue;
      const k = f.age / 0.5;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k) * 0.9;
      drawSprite(ctx, boom, f.x, f.y, f.r * (1.15 + k), f.rot);
      ctx.globalAlpha = Math.max(0, 1 - k) * 0.35;
      ctx.strokeStyle = f.gold ? GOLD_BRIGHT : FG;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.55 + k * 0.85), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const s of sparksRef.current) {
      const k = s.age / s.life;
      if (k >= 1) continue;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.95;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.6, s.size * (1 - k * 0.6)), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const p of popsRef.current) {
      if (p.age < 0) continue;
      const k = p.age / 0.9;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = p.gold ? GOLD_BRIGHT : FG;
      ctx.font = p.big ? "800 24px system-ui, sans-serif" : "700 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.text, p.x, p.y - k * 34);
      ctx.restore();
    }

    // dropper: wooden chute holding the current ball + aim guide
    if (phaseRef.current === "playing") {
      const t = currentRef.current;
      const r = tierRadius(t);
      const ax = clampAim(aimXRef.current);

      // chute boards
      const chuteTop = 8;
      const mouthY = geo.dropY - r * 0.35;
      const halfTop = r + 9;
      const halfMouth = r + 3;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ax - halfTop, chuteTop);
      ctx.lineTo(ax + halfTop, chuteTop);
      ctx.lineTo(ax + halfMouth, mouthY);
      ctx.lineTo(ax - halfMouth, mouthY);
      ctx.closePath();
      const wg = ctx.createLinearGradient(ax - halfTop, 0, ax + halfTop, 0);
      wg.addColorStop(0, "#553d2b");
      wg.addColorStop(0.5, "#6a4c35");
      wg.addColorStop(1, "#463323");
      ctx.fillStyle = wg;
      ctx.fill();
      ctx.strokeStyle = WOOD_EDGE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = "rgba(36,26,18,0.65)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, chuteTop + 2);
      ctx.lineTo(ax, mouthY - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(ax, mouthY, Math.max(2, halfMouth - 2), 4.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#080605";
      ctx.fill();
      ctx.restore();

      // aim guide: hemp tan dotted line
      ctx.save();
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = "rgba(200,162,106,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, geo.dropY + r + 2);
      ctx.lineTo(ax, geo.floor - 2);
      ctx.stroke();
      ctx.restore();

      const since = now - lastDropRef.current;
      const ready = since >= DROP_COOLDOWN_MS;
      drawBall(ctx, ax, geo.dropY, r, t, ready ? 1 : 0.45, now);
      if (!ready) {
        const f = since / DROP_COOLDOWN_MS;
        ctx.save();
        ctx.strokeStyle = "rgba(240,180,92,0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ax, geo.dropY, r + 5, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // chevron above the dropper
      ctx.save();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ax - 6, geo.dropY - r - 14);
      ctx.lineTo(ax, geo.dropY - r - 8);
      ctx.lineTo(ax + 6, geo.dropY - r - 14);
      ctx.stroke();
      ctx.restore();
    }

    // HUD: score (left), pumps chip + framed wooden next-preview (right)
    ctx.save();
    ctx.fillStyle = GOLD;
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(Math.round(scoreRef.current)), Math.max(geo.left, 14), 36);
    ctx.restore();

    // countdown timer (top center): the run is a 60s timed score attack
    if (phaseRef.current === "playing") {
      const left = Math.max(0, (runEndRef.current - now) / 1000);
      ctx.save();
      ctx.fillStyle = left <= 10 ? "#ff6b6b" : GOLD;
      ctx.font = "800 24px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`${Math.ceil(left)}s`, w / 2, 40);
      ctx.restore();
    }

    const slot = 44;
    const slotX = geo.right - slot;
    ctx.save();
    const chipGrad = ctx.createLinearGradient(0, 8, 0, 8 + slot);
    chipGrad.addColorStop(0, "#4e3727");
    chipGrad.addColorStop(1, "#33251a");
    ctx.beginPath();
    ctx.roundRect(slotX, 8, slot, slot, 10);
    ctx.fillStyle = chipGrad;
    ctx.fill();
    ctx.strokeStyle = WOOD_EDGE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(slotX + 2, 10, slot - 4, slot - 4, 8);
    ctx.strokeStyle = "rgba(214,164,106,0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = IRON_BOLT;
    ctx.globalAlpha = 0.8;
    for (const [nx, ny] of [
      [slotX + 5, 13],
      [slotX + slot - 5, 13],
      [slotX + 5, 8 + slot - 5],
      [slotX + slot - 5, 8 + slot - 5],
    ] as const) {
      ctx.beginPath();
      ctx.arc(nx, ny, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    drawBall(ctx, slotX + slot / 2, 8 + slot / 2, tierRadius(nextRef.current) * 0.42, nextRef.current, 0.95, now);

    const pumps = captainRef.current?.fittings.pumps ?? 0;
    if (pumps > 0) {
      const label = `${graceSeconds().toFixed(1)}s`;
      ctx.save();
      ctx.font = "12px system-ui, sans-serif";
      const tw = ctx.measureText(label).width;
      const iconW = 13;
      const chipW = tw + iconW + 22;
      const chipX = slotX - 10 - chipW;
      ctx.fillStyle = "rgba(74,52,38,0.6)";
      ctx.strokeStyle = "rgba(214,164,106,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(chipX, 17, chipW, 26, 13);
      ctx.fill();
      ctx.stroke();
      // little drawn bucket (pumps fitting), no emoji on canvas
      const ix = chipX + 9;
      const iy = 30;
      ctx.strokeStyle = IRON_BOLT;
      ctx.fillStyle = IRON_BOLT;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ix + 5, iy - 1.5, 4.2, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ix + 0.5, iy - 1.5);
      ctx.lineTo(ix + 9.5, iy - 1.5);
      ctx.lineTo(ix + 8, iy + 6);
      ctx.lineTo(ix + 2, iy + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = FG;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, ix + iconW + 5, 31);
      ctx.restore();
    }
  };

  // main loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      const canvas = canvasRef.current;
      const ctx = canvas ? canvas.getContext("2d") : null;
      if (canvas && ctx) {
        const { w, h, dpr } = sizeRef.current;
        geoRef.current = computeGeo(w, h);
        if (phaseRef.current === "playing") {
          const sp = 470 * dt;
          if (keysRef.current.left) aimXRef.current -= sp;
          if (keysRef.current.right) aimXRef.current += sp;
          aimXRef.current = clampAim(aimXRef.current);
          const sub = dt / 2;
          stepPhysics(sub, now);
          stepPhysics(sub, now);
          checkOverflow(dt, now);
          if (now >= runEndRef.current) endGame();
        }
        for (const p of popsRef.current) p.age += dt;
        for (const f of flashesRef.current) f.age += dt;
        for (const s of sparksRef.current) {
          s.age += dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vy += 880 * dt;
        }
        popsRef.current = popsRef.current.filter((p) => p.age < 0.9);
        flashesRef.current = flashesRef.current.filter((f) => f.age < 0.5);
        sparksRef.current = sparksRef.current.filter((s) => s.age < s.life);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(ctx, w, h, now);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // canvas sizing (DPR capped at 2)
  useEffect(() => {
    const fit = () => {
      const el = canvasRef.current;
      const wrap = wrapRef.current;
      if (!el || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.max(1, Math.round(rect.width * dpr));
      el.height = Math.max(1, Math.round(rect.height * dpr));
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      geoRef.current = computeGeo(rect.width, rect.height);
    };
    fit();
    window.addEventListener("resize", fit);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      window.removeEventListener("resize", fit);
      if (ro) ro.disconnect();
    };
  }, []);

  // keyboard: arrows move, space drops
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        keysRef.current.left = true;
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        keysRef.current.right = true;
        e.preventDefault();
      } else if (e.key === " " || e.code === "Space") {
        if (phaseRef.current === "playing") {
          drop(performance.now());
          e.preventDefault();
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keysRef.current.left = false;
      else if (e.key === "ArrowRight") keysRef.current.right = false;
    };
    const clear = () => {
      keysRef.current.left = false;
      keysRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aimFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    aimXRef.current = clampAim(e.clientX - rect.left);
  };

  const buttonStyle: React.CSSProperties = {
    background: GOLD,
    color: INK,
    border: "none",
    borderRadius: 12,
    padding: "14px 44px",
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  };

  const overlayStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    background: "rgba(0,15,22,0.88)",
    color: FG,
    fontFamily: "system-ui, sans-serif",
    textAlign: "center",
    padding: 20,
    zIndex: 5,
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
        overscrollBehavior: "none",
      }}
    >
      <GameHeader title="The Powder Hold" captain={captain} />
      <div ref={wrapRef} style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => {
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* not critical */
            }
            aimFromPointer(e);
          }}
          onPointerMove={aimFromPointer}
          onPointerUp={(e) => {
            aimFromPointer(e);
            drop(performance.now());
          }}
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            touchAction: "none",
            cursor: "crosshair",
          }}
        />

        {phase === "start" && (
          <div style={overlayStyle}>
            <div style={{ fontSize: 52, lineHeight: 1 }}>💣</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Dot size={16} tier={1} />
              <span style={{ color: FG3, fontSize: 18 }}>+</span>
              <Dot size={16} tier={1} />
              <span style={{ color: GOLD, fontSize: 18 }}>=</span>
              <Dot size={26} tier={2} />
              <span style={{ color: GOLD_BRIGHT, fontSize: 18 }}>✨</span>
            </div>
            <div style={{ fontSize: 15, color: FG }}>Match sizes to merge. ⏱️ 60 seconds, biggest score wins!</div>
            <div style={{ fontSize: 13, color: FG3 }}>👆 ←→ aim · tap / ␣ drop</div>
            {captain && (captain.fittings.pumps ?? 0) > 0 && (
              <div
                style={{
                  fontSize: 13,
                  color: FG,
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: 14,
                  padding: "5px 12px",
                  background: "rgba(240,180,92,0.08)",
                }}
              >
                🪣 +{(0.4 * (captain.fittings.pumps ?? 0)).toFixed(1)}s
              </div>
            )}
            <button style={{ ...buttonStyle, opacity: identityChecked ? 1 : 0.5 }} disabled={!identityChecked} onClick={startRun}>
              START
            </button>
          </div>
        )}

        {phase === "over" && (
          <div style={overlayStyle}>
            <div style={{ fontSize: 44, lineHeight: 1 }}>💥</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: GOLD_BRIGHT }}>{finalScore}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>🏆</span>
              <span
                style={{
                  width: Math.min(64, tierRadius(finalBiggest) * 1.1),
                  height: Math.min(64, tierRadius(finalBiggest) * 1.1),
                  borderRadius: "50%",
                  background: BALL_GRADIENT_CSS,
                  border: `2px solid ${ringColor(finalBiggest)}`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  boxShadow: finalBiggest === KRAKEN ? `0 0 18px ${GOLD}` : "inset 0 -3px 6px rgba(0,8,12,0.5)",
                }}
              >
                {finalBiggest === KRAKEN ? "🐙" : ""}
              </span>
            </div>
            <div style={{ width: "min(92%, 360px)" }}>
              <ScoreBanner state={submitState} result={lastResult} score={finalScore} />
            </div>
            <button style={buttonStyle} onClick={startRun}>
              ↻ Play again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
