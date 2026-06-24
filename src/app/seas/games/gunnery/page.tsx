"use client";

/**
 * Conquer the Seas · Gunnery Drill.
 * 45-second shooting gallery: tap targets before they dive.
 * Reflex game: fresh random spawns every run (daily seed rule does not apply).
 *
 * Rendering rule of the fleet: canvas entities are ALWAYS Kenney sprites or
 * drawn vector shapes, never emoji glyphs (canvas emoji size unpredictably
 * per platform). Emoji live only in DOM chrome (overlays, chips, buttons).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Captain } from "../shared";
import {
  FG,
  FG3,
  GOLD,
  GOLD_BRIGHT,
  GameHeader,
  HAIRLINE,
  INK,
  KENNEY,
  ScoreBanner,
  drawSprite,
  loadImages,
  seededRng,
  useSeasGame,
} from "../shared";

const RUN_SECONDS = 45;
const COOLDOWN_S = 0.25;
const MULT_CAP = 2;
const ROSE = "#ff5d72";
const UI_FONT = "system-ui, sans-serif";
const BOOM_S = 0.26; // explosion sprite frames play over ~250ms

// Cosmetic CANNONS fitting (captain.fittings.cannons, 0-5). Purely visual:
// extra flanking barrels on the deck cannon, plus a two-shot burst at max.
// None of this touches hit detection, scoring, cadence, multiplier, or submit.
const MAX_CANNONS = 5; // a maxed-out battery: triggers the burst flourish
const FLANK_CAP = 3; // tasteful ceiling on extra barrels (so up to 4 total)
const BURST_DELAY_S = 0.08; // cosmetic second shot fires ~80ms after the first
const FLASH_S = 0.09; // muzzle-flash fade window (matches the existing flash)

// Gentle opening: full ease until EASE_HOLD_S, fading linearly to nothing by
// EASE_END_S, after which the standard difficulty ramp continues untouched.
const EASE_HOLD_S = 12;
const EASE_END_S = 30;
const EASE_RATE = 0.6; // spawns per second during the opening hold
const EASE_LIFE = 0.6; // +60% target hold time during the opening hold

/** Pale sea-spray blue used for ripples, splashes, wakes. */
function water(a: number): string {
  return `rgba(150,205,230,${a.toFixed(3)})`;
}

/** Base art unit: every target is sized in u so nothing can render giant. */
function unit(w: number, h: number): number {
  return Math.min(w, h) / 14;
}

const SPRITES: Record<string, string> = {
  dinghy1: KENNEY.dinghySmall(1),
  dinghy2: KENNEY.dinghySmall(2),
  dinghy3: KENNEY.dinghySmall(3),
  sloop: KENNEY.ship(3), // pristine red livery: highest contrast on the ink sea
  cannon: KENNEY.part("cannon"),
  boom1: KENNEY.explosion(1),
  boom2: KENNEY.explosion(2),
  boom3: KENNEY.explosion(3),
  // Premium AI backdrop (1536x1024): cinematic moonlit ocean with a full moon,
  // silver reflection path, distant tall-ship silhouette, stars, gentle waves.
  // Drawn scale-to-fill behind every gameplay element. If it is missing or
  // still loading, the procedural drawSea + drawGalleon below stand in.
  backdrop: "/seas-art/bg-gunnery.png",
  // LPC ship kit (CC0, /public/lpc-ship): tile atlases baked into the fallback galleon.
  shipHull: "/lpc-ship/lpc-ship.png",
  shipRig: "/lpc-ship/rigging.png",
  // Big Mike: the don't-shoot ally. Waves a white flag; friendly fire on him costs you.
  bigmike: "/bigmike.png",
};

type Imgs = Record<string, HTMLImageElement>;

type Target = {
  kind: "barrel" | "sloop" | "tentacle" | "ally";
  x: number;
  y: number;
  vx: number;
  born: number;
  life: number;
  r: number;
  pts: number;
  seed: number; // cosmetic only: sprite variant, rock phase, tentacle curl
  dead: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  color: string;
  size: number;
};

type Ring = { x: number; y: number; born: number; water?: boolean };
type Boom = { x: number; y: number; born: number };
type Floater = { x: number; y: number; text: string; born: number };

type Game = {
  elapsed: number;
  targets: Target[];
  particles: Particle[];
  rings: Ring[];
  booms: Boom[];
  floaters: Floater[];
  score: number;
  hits: number;
  misses: number;
  streak: number;
  bestStreak: number;
  mult: number;
  spawnAcc: number;
  lastShot: number;
  lastShotX: number;
  lastShotY: number;
  cannonAngle: number; // cosmetic: eased tilt toward the last shot
  over: boolean;
};

type Scenery = {
  stars: { x: number; y: number; r: number; p: number }[];
  waves: { x: number; y: number; len: number; p: number }[];
};

function horizonY(h: number): number {
  return h * 0.24;
}

/**
 * Fixed playfield: targets spawn and move inside a centered region capped at
 * PLAY_W x PLAY_H so target spacing stays consistent regardless of window
 * size (small windows shrink to min(w - 16, 760) x min(h - 80, 600)). The
 * band is kept inside the sea (below the horizon, above the deck cannon) and
 * centered in whatever sea height is available. The sea backdrop itself
 * still paints the full canvas.
 */
const PLAY_W = 760;
const PLAY_H = 600;
const PLAY_INSET = 24; // keeps sprites clear of the region edge

function playRect(w: number, h: number): { left: number; top: number; width: number; height: number } {
  const width = Math.max(120, Math.min(w - 16, PLAY_W));
  const seaTop = horizonY(h) + 50;
  const seaBottom = h - 70;
  const height = Math.max(20, Math.min(h - 80, PLAY_H, seaBottom - seaTop));
  const top = seaTop + Math.max(0, (seaBottom - seaTop - height) / 2);
  return { left: (w - width) / 2, top, width, height };
}

/** 1 while the run is in its gentle opening, fading linearly to 0 by EASE_END_S. */
function openingEase(elapsed: number): number {
  if (elapsed <= EASE_HOLD_S) return 1;
  if (elapsed >= EASE_END_S) return 0;
  return 1 - (elapsed - EASE_HOLD_S) / (EASE_END_S - EASE_HOLD_S);
}

/** Cosmetic night sky and shimmer layout. Seed is fixed: scenery only, not gameplay. */
function buildScenery(): Scenery {
  const rng = seededRng("gunnery-scenery");
  const stars = Array.from({ length: 70 }, () => ({
    x: rng(),
    y: rng() * 0.92,
    r: rng() < 0.25 ? 2 : 1,
    p: rng(),
  }));
  const waves = Array.from({ length: 26 }, () => ({
    x: rng() * 0.9,
    y: 0.1 + rng() * 0.84,
    len: 24 + rng() * 60,
    p: rng(),
  }));
  return { stars, waves };
}

// ── DON'T-SHOOT (anti-bot). Allied parley boats fly a white flag: shoot one and
// it is friendly fire — you lose points AND your combo resets. A human reads the
// flag and holds fire; a bot that blasts everything tanks its score and can't reach
// the cap. TUNABLE. ──────────────────────────────────────────────────────────────
const ALLY_SPAWN_CHANCE = 0.16; // ~1 in 6 spawns is a no-shoot ally
const ALLY_PENALTY = 60;        // points lost for friendly fire (plus the combo reset)

function spawnTarget(g: Game, w: number, h: number): void {
  const region = playRect(w, h);
  const roll = Math.random();
  let t: Target;
  const x = region.left + PLAY_INSET + Math.random() * Math.max(20, region.width - PLAY_INSET * 2);
  const y = region.top + Math.random() * region.height;
  const seed = Math.random();
  // Gentle opening: targets hold the surface up to 60% longer early in the run.
  const hold = 1 + EASE_LIFE * openingEase(g.elapsed);
  if (roll < ALLY_SPAWN_CHANCE) {
    // Friendly parley boat — drifts slowly like a civilian vessel. pts unused (the
    // fire handler applies the penalty); kept 0 so any stray math stays harmless.
    const dir = Math.random() < 0.5 ? -1 : 1;
    const vx = dir * (24 + Math.random() * 22);
    t = { kind: "ally", x, y, vx, born: g.elapsed, life: 1.5 * hold, r: 24, pts: 0, seed, dead: false };
  } else {
    // Rescale the remaining roll so the barrel/sloop/tentacle mix is unchanged.
    const r2 = (roll - ALLY_SPAWN_CHANCE) / (1 - ALLY_SPAWN_CHANCE);
    if (r2 < 0.56) {
      t = { kind: "barrel", x, y, vx: 0, born: g.elapsed, life: 1.6 * hold, r: 22, pts: 10, seed, dead: false };
    } else if (r2 < 0.86) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const vx = dir * (50 + Math.random() * 40);
      t = { kind: "sloop", x, y, vx, born: g.elapsed, life: 1.2 * hold, r: 24, pts: 25, seed, dead: false };
    } else {
      t = { kind: "tentacle", x, y, vx: 0, born: g.elapsed, life: 0.8 * hold, r: 20, pts: 50, seed, dead: false };
    }
  }
  g.targets.push(t);
}

function updateGame(g: Game, dt: number, w: number, h: number): void {
  g.elapsed += dt;
  // Spawn pacing: a gentle EASE_RATE opening, ramping linearly to meet the
  // standard curve at EASE_END_S; the standard ramp then continues to the end.
  const base = 1 + 1.5 * Math.min(1, g.elapsed / RUN_SECONDS);
  const baseAtEaseEnd = 1 + 1.5 * (EASE_END_S / RUN_SECONDS);
  const rate =
    g.elapsed >= EASE_END_S ? base : EASE_RATE + (baseAtEaseEnd - EASE_RATE) * (1 - openingEase(g.elapsed));
  g.spawnAcc += rate * dt;
  while (g.spawnAcc >= 1) {
    g.spawnAcc -= 1;
    spawnTarget(g, w, h);
  }
  const region = playRect(w, h);
  const boundL = region.left + PLAY_INSET;
  const boundR = region.left + region.width - PLAY_INSET;
  for (const t of g.targets) {
    if (t.vx !== 0) {
      t.x += t.vx * dt;
      if (t.x < boundL) {
        t.x = boundL;
        t.vx = -t.vx;
      } else if (t.x > boundR) {
        t.x = boundR;
        t.vx = -t.vx;
      }
    }
  }
  // Cosmetic dive splash: a target that ran out its clock slips under.
  for (const t of g.targets) {
    if (!t.dead && g.elapsed - t.born >= t.life) {
      g.rings.push({ x: t.x, y: t.y + t.r * 0.5, born: g.elapsed, water: true });
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
        const sp = 50 + Math.random() * 110;
        g.particles.push({
          x: t.x + (Math.random() - 0.5) * 12,
          y: t.y + t.r * 0.4,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          born: g.elapsed,
          life: 0.3 + Math.random() * 0.18,
          color: water(0.85),
          size: 2 + Math.random() * 2,
        });
      }
    }
  }
  g.targets = g.targets.filter((t) => !t.dead && g.elapsed - t.born < t.life);
  for (const p of g.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;
  }
  g.particles = g.particles.filter((p) => g.elapsed - p.born < p.life);
  g.rings = g.rings.filter((r) => g.elapsed - r.born < 0.35);
  g.booms = g.booms.filter((b) => g.elapsed - b.born < BOOM_S);
  g.floaters = g.floaters.filter((f) => g.elapsed - f.born < 0.8);
  // Cosmetic: ease the deck cannon toward wherever the captain last fired.
  const u = unit(w, h);
  const cy = h - u * 0.5;
  let want = 0;
  if (g.lastShot >= 0) {
    const raw = Math.atan2(g.lastShotY - cy, g.lastShotX - w / 2) + Math.PI / 2;
    want = Math.max(-0.32, Math.min(0.32, raw));
  }
  g.cannonAngle += (want - g.cannonAngle) * Math.min(1, dt * 9);
}

/**
 * Premium AI backdrop, drawn scale-to-fill (center-crop) so the cinematic
 * moonlit ocean covers the whole canvas behind every gameplay element. The
 * image already carries the moon, its silver reflection path, the distant
 * tall-ship silhouette, the stars, and the waves, so when it is present we
 * skip the procedural moon + galleon entirely. Returns true once it has
 * painted; false (image missing, broken, or still loading) tells the caller
 * to fall back to the procedural drawSea + drawGalleon. A solid INK fill is
 * laid down first so a transparent/partial image never shows the page behind.
 */
function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, imgs: Imgs): boolean {
  const img = imgs.backdrop;
  if (!img || !img.naturalWidth || !img.naturalHeight) return false;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  return true;
}

function drawSea(ctx: CanvasRenderingContext2D, w: number, h: number, now: number, sc: Scenery): void {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  const hY = horizonY(h);
  const u = unit(w, h);
  for (const s of sc.stars) {
    const a = 0.08 + 0.16 * (0.5 + 0.5 * Math.sin(now / 900 + s.p * 6.28));
    ctx.fillStyle = `rgba(248,253,255,${a.toFixed(3)})`;
    ctx.fillRect(s.x * w, s.y * (hY - 8), s.r, s.r);
  }

  // Low gold moon riding just above the horizon.
  const mx = w * 0.78;
  const my = hY - u * 1.05;
  const mr = u * 0.8;
  ctx.fillStyle = "rgba(240,180,92,0.07)";
  ctx.beginPath();
  ctx.arc(mx, my, mr * 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2d9a6";
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,15,22,0.12)";
  ctx.beginPath();
  ctx.arc(mx - mr * 0.3, my - mr * 0.12, mr * 0.2, 0, Math.PI * 2);
  ctx.arc(mx + mr * 0.26, my + mr * 0.3, mr * 0.13, 0, Math.PI * 2);
  ctx.arc(mx + mr * 0.12, my - mr * 0.42, mr * 0.09, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hY);
  ctx.lineTo(w, hY);
  ctx.stroke();

  // Shimmering moon reflection: thin gold slats, alpha-animated, fading with depth.
  const rows = 18;
  for (let i = 0; i < rows; i++) {
    const ry = hY + 6 + i * (u * 0.34);
    if (ry > h - 8) break;
    const hw = mr * (0.32 + 0.4 * (0.5 + 0.5 * Math.sin(now / 640 + i * 1.9)));
    const a = (0.028 + 0.05 * (0.5 + 0.5 * Math.sin(now / 480 + i * 2.4))) * (1 - i / rows);
    const jit = Math.sin(now / 1500 + i * 1.3) * u * 0.12;
    ctx.fillStyle = `rgba(240,180,92,${a.toFixed(3)})`;
    ctx.fillRect(mx - hw + jit, ry, hw * 2, 2);
  }

  // Two layered swell bands rolling at different speeds.
  const bands = [
    { f: 0.3, amp: u * 0.12, k: 0.05, sp: 1100, al: 0.05, lw: u * 0.3 },
    { f: 0.62, amp: u * 0.16, k: 0.032, sp: 1700, al: 0.038, lw: u * 0.42 },
  ];
  for (const b of bands) {
    const y0 = hY + (h - hY) * b.f;
    ctx.strokeStyle = water(b.al);
    ctx.lineWidth = b.lw;
    ctx.beginPath();
    for (let x = -20; x <= w + 20; x += 22) {
      const yy = y0 + Math.sin(x * b.k + now / b.sp) * b.amp;
      if (x === -20) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  ctx.lineWidth = 1;
  for (const v of sc.waves) {
    const a = 0.025 + 0.05 * (0.5 + 0.5 * Math.sin(now / 1400 + v.p * 6.28));
    const dx = Math.sin(now / 2300 + v.p * 9) * 8;
    const y = hY + v.y * (h - hY);
    ctx.strokeStyle = `rgba(248,253,255,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(v.x * w + dx, y);
    ctx.lineTo(v.x * w + dx + v.len, y);
    ctx.stroke();
  }
}

/**
 * Backdrop galleon. The CC0 LPC ship kit in /public/lpc-ship ships as 32px
 * tile ATLASES (hull sheet + rigging sheet), not finished pictures, so the
 * kit's big three-master is baked here as a tile list extracted from the
 * kit's preview map: 1081 entries, 4 chars each, packing
 * sheet(1) | tile index(10) | col(6) | row(7) bits in map paint order.
 * On first draw the tiles are blitted once into an offscreen canvas, a dark
 * veil is clipped onto the ship pixels with "source-atop" (silhouette with a
 * hint of sail detail), and a vertically flipped, depth-faded copy becomes
 * the water reflection. Both canvases are cached at module level; after that
 * each frame costs two drawImage calls.
 */
const GALLEON_COLS = 39;
const GALLEON_ROWS = 26;
const GALLEON_TILE = 32;
const GALLEON_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const GALLEON_TILES =
  "PQ+PPRAPQPCPQPEPQRGPRPIPRRKPQO+QPRAQQPCQRPEQPRGQRRIQPPKQPQ+RRPARQPCRPPERPRGRPPIRPPKRQQ4SPO6SPQ8S" +
  "PO+SPPASQPCSQRESPRGSQRISPPKSPOWTPQgTROiTRQkTRQmTSQoTQOqTQQsTSQuTSOwTPOyTRQ0TPO4TQO6TRQ8TRQ+TPRAT" +
  "RRCTQPETPPGTRRITQPKTQAKUPOSUQQUUPOWUQQgUQOiUROkURQmUSOoUQOqUQOsUPQuURQwUPQyUSO0UQO4UPQ6UPO8UPO+U" +
  "QPAURPCURPEUPRGURRIUPPKURAKVROSVQQUVPQWVSOgVSOiVPOkVROmVQOoVSOqVQOsVPOuVPQwVRQyVPQ0VQQ4VRQ6VRO8V" +
  "POUWSOgWSOiWRQkWROmWPQoWPOqWSQsWPOuWRQwWPQyWQQ0WPQ6WRQ8WQOgXPQiXROmXQOoXSOqXQOsXPOuXPQwXQQgYQQiY" +
  "ROmYPQoYPOqYSQsYPOuYRQwY1MUJ1OWJ1QYJ1MiJ1OkJ1QmJ1MuJ1OwJ1QyJ2MUK2OWK2QYK2MiK2OkK2QmK2MuK2OwK2QyK" +
  "3MUL3OWL3QYL3MiL3OkL3QmL3MuL3OwL3QyL4MUM4OWM4QYM4MiM4OkM4QmM4MuM4OwM4QyM5MUN5OWN5QYN5MiN5OkN5QmN" +
  "5MuN5OwN5QyN6MUO6OWO6QYO6MiO6OkO6QmO6MuO6OwO6QyO7MUP7OWP7QYP7MiP7OkP7QmP7MuP7OwP7QyP8MUQ8OWQ8QYQ" +
  "8MiQ8OkQ8QmQ8MuQ8OwQ8QyQ9MUR9OWR9QYR9MiR9OkR9QmR9MuR9OwR9QyR+MUS+OWS+QYS+MiS+OkS+QmS+MuS+OwS+QyS" +
  "CO+OCRAOCRCOCREOCRGOCRIOCTKONe8PDO+PDRAPDRCPDREPDRGPDRIPDTKPNe6QNc8QQw+QPRAQPPCQPnKQNg2RNi4ROe6R" +
  "Ra8RQw+RPnKROEOSOGQSOISSOKUSOMWSOOYSOQaSOQcSOSeSOUgSNWiSOYkSOYmSNSoSOUqSOUsSNWuSOYwSOYySOY0SOg2S" +
  "Qw+SQRASQPCSPnKSDaATDcCTDeETDgGTDiITDkKTPCMTPEOTPGQTPISTPKUTPMWTPOYTPQaTPOcTPSeTPg2TIa8TQw+TRRAT" +
  "PnKTEaAUEcCUEeEUEgGUEiIUEkKUQCMUQEOUPOQUQISUQKUUQMWUQOYUQQaUQOcUPSeUPg2USw+USjAUSjCUSjEUSjGUSjIU" +
  "S1KUFeEVFgGVFiIVFkKVRCMVREOVPOQVRISVRKUVRMWVROYVRQaVROcVPSeVPg2VUe+VURAVURCVUREVURGVURIVU1KVCaAW" +
  "GcCWGeEWGgGWGiIWCkKWSCMWSEOWSGQWSISWSKUWPOWWPOYWPQaWPOcWPSeWSg2WTQ4WUe+WUfAWUfCWUfEWUfGWUfIWV1KW" +
  "YAKXYCMXTEOXTGQXTISXTKUXTMWXTOYXTQaXTQcXTSeXTaiXTQkXTQmXTQoXTWqXKosXTauXTQwXTQyXTQ0XTg2XUQ4XUe6X" +
  "Ue8XUe+XUfAXUfCXTjEXTjGXU1IXTvKXZCMYZEOYZGQYZISYUKUYUMWYUOYYUQaYUQcYUSeYUYgYUaiYUQkYUQmYUQoYUSqY" +
  "UYsYUauYUQwYUQyYUQ0YUe2YUe4YUe6YUe8YUe+YUfAYTjCYUjEYUpGYVpIYaGQZaISZaKUZaMWZaOYZaQaZaQcZaQeZaQgZ" +
  "aQiZaQkZaQmZaQoZaQqZaQsZaQuZaQwZaQyZaQ0ZaQ2ZaQ4ZaQ6ZaQ8ZZg+ZZhAZZhCZZjEZZlGZACMRAEORAGQRAISRAKUR" +
  "AMWRAOYRAQaRAScRBCMSBEOSBGQSBISSBKUSBMWSBOYSBQaSBScSCCMTCEOTCGQTCISTCKUTDCMUDEOUq8kKq+mKr8wKr+yK" +
  "r8kLr+mLs8wLs+yLq8WMq+YMs8kMs+mMt8wMt+yMr8WNr+YNt8kNt+mNu8wNu+yNs8WOs+YOu8kOu+mOv8wOv+yOt8WPt+YP" +
  "v8kPv+mPw8wPw+yPEM+PDVKPu8WQu+YQw8kQw+mQx8wQx+yQEM+QDVKQv8WRv+YRx8kRx+mRy8wRy+yREM+RDVKRw8WSw+YS" +
  "y8kSy+mS08wS0+ySEM+SDVKSx8WTx+YTz8kTz+mT18wT1+yTEO+TERATERCTERETERGTERITETKTECMUy8WUy+YU08kU0+mU" +
  "28wU2+yUSe8UFO+UFRAUFRCUFREUFRGUFRIUFTKUFCMVFEOVFGQV04WV06YV34kV36mV34wV36yVSe6VTe8VGCMWGEOWGGQW" +
  "GISWGKUWGMWWGOYWGQaWGScWTe6WUe8WHEOXHGQXHISXHKUXHMWXHOYXHQaX1EiJ1GkJ1ImJ1KoJ2EiK2GkK2ImK2KoK1EuK" +
  "1GwK1IyK1K0K1EUL1GWL1IYL1KaL2EuL2GwL2IyL2K0L2EUM2GWM2IYM2KaMQ/MPR/MQR/MRR/MSR/MTR/MUS28VS4+VS7AV" +
  "S7CVS7EVS7GVS7IVS9KVS/MVT28WT4+WT7AWT7CWT7EWT7GWT7IWT9KWT/MWS24XS46XS68XS6+XS7AXS7CXS7EXS7GXS9IX" +
  "S/KXT24YT46YT68YT6+YT7AYT7CYT7EYT7GYT9IYT/KYyAkLyCmLyAwLyCyLzAkMzCmMzAwMzCyMyAWNyCYN0AkN0CmN0AwN" +
  "0CyNzAWOzCYO1AkO1CmO1AwO1CyO0AWP0CYP2AkP2CmP2AwP2CyP1AWQ1CYQ3AkQ3CmQ3AwQ3CyQ2AWR2CYR4AkR4CmR4AwR" +
  "4CyR3AWS3CYS5AkS5CmS5EoS5AwS5CyS5E0S4AWT4CYT6AkT6CmT6EoT6AwT6CyT6E0T5AWU5CYU5EaU7AkU7CmU7EoU7AwU" +
  "7CyU7E0U6AWV6CYV6EaV8AkV8CmV8EoV8AwV8CyV8E0V7AWW7CYW7EaW9AkW9CmW9EoW9AwW9CyW9E0W8GWX8IYX8KaX+GkX" +
  "+ImX+KoX+GwX+IyX+K0XgMiGgOkGgQmGgSuGgUwGgWyGhMiHhOkHhQmHhSuHhUwHhWyHgMUIgOWIgQYIiMiIiOkIiQmIiSuI" +
  "iUwIiWyIhMUJhOWJhQYJjMiJjOkJjQmJjSuJjUwJjWyJiMUKiOWKiQYKkMiKkOkKkQmKkSuKkUwKkWyKjMULjOWLjQYLlMiL" +
  "lOkLlQmLlSuLlUwLlWyLkMUMkOWMkQYMmMiMmOkMmQmMmSuMmUwMmWyMlMUNlOWNlQYNnMiNnOkNnQmNnSuNnUwNnWyNmMUO" +
  "mOWOmQYOoMiOoOkOoQmOoSuOoUwOoWyOnMUPnOWPnQYPpMiPpOkPpQmPpSuPpUwPpWyPoMUQoOWQoQYQqMiQqOkQqQmQqSuQ" +
  "qUwQqWyQpMURpOWRpQYRrMiRrOkRrQmRrSuRrUwRrWyRqMUSqOWSqQYSsWySrMUTrOWTrQYT8aiH8ckH8emH8goH4auH4cwH" +
  "4eyH4g0H9aiI9ckI9emI9goI5auI5cwI5eyI5g0I8aUJ8cWJ8eYJ8gaJ/SiJ/UkJ/WmJ/YoJ6SuJ6UwJ6WyJ6Y0J9aUK9cWK" +
  "9eYK9gaK7SuK7UwK7WyK7Y0K/SUL/UWL/WYL/YaLh4kAh6mAh8kBh+mBh4WCh6YCi8kCi+mCj8wCj+yCh8WDh+YDj8kDj+mD" +
  "k8wDk+yDi8WEi+YEk8kEk+mEl8wEl+yEj8WFj+YFl8kFl+mFm8wFm+yFk8WGk+YGm8kGm+mGn8wGn+yGl8WHl+YHn8kHn+mH" +
  "o8wHo+yHm8WIm+YIo8kIo+mIp8wIp+yIn8WJn+YJp8kJp+mJq4wJq6yJq4WKq6YK+aiI+ckI+emI+goI/aiJ/ckJ/emJ/goJ" +
  "6auJ6cwJ6eyJ6g0J+aUK+cWK+eYK+gaK7auK7cwK7eyK7g0K/aUL/cWL/eYL/gaLgGiAgIkAgGuAgIwAhGiBhIkBhKmBhGuB" +
  "hIwBhKyBgGUCgIWCiGiCiIkCiKmCiGuCiIwCiKyChGUDhIWDhKYDjGiDjIkDjKmDjGuDjIwDjKyDiGUEiIWEiKYEkGiEkIkE" +
  "kKmEkGuEkIwEkKyEjGUFjIWFjKYFlGiFlIkFlKmFlGuFlIwFlKyFkGUGkIWGkKYGmGiGmIkGmKmGmGuGmIwGmKyGlGUHlIWH" +
  "lKYHnGiHnIkHnKmHnGuHnIwHnKyHmGUImIWImKYIoGiIoIkIoKmIoGuIoIwIoKyInGUJnIWJnKYJpGiJpIkJpKmJpGuJpIwJ" +
  "pKyJoGUKoIWKoKYKqIkKqKmKqIwKqKyKpGULpIWLpKYLqIWMqKYM8auA8cwA8eyA8g0A9auB9cwB9eyB9g0B/SuC/UwC/WyC" +
  "/Y0C";

let galleonCache: { ship: HTMLCanvasElement; refl: HTMLCanvasElement } | null = null;
let galleonBroken = false;

function buildGalleonCache(
  hull: HTMLImageElement,
  rig: HTMLImageElement,
): { ship: HTMLCanvasElement; refl: HTMLCanvasElement } | null {
  const W = GALLEON_COLS * GALLEON_TILE;
  const H = GALLEON_ROWS * GALLEON_TILE;
  const ship = document.createElement("canvas");
  ship.width = W;
  ship.height = H;
  const ctx = ship.getContext("2d");
  if (!ctx) return null;
  const code: Record<string, number> = {};
  for (let i = 0; i < GALLEON_B64.length; i++) code[GALLEON_B64[i]] = i;
  for (let i = 0; i + 3 < GALLEON_TILES.length; i += 4) {
    const v =
      (code[GALLEON_TILES[i]] << 18) |
      (code[GALLEON_TILES[i + 1]] << 12) |
      (code[GALLEON_TILES[i + 2]] << 6) |
      code[GALLEON_TILES[i + 3]];
    const sheet = (v >> 23) & 1 ? rig : hull;
    const idx = (v >> 13) & 1023;
    const tx = (v >> 7) & 63;
    const ty = v & 127;
    ctx.drawImage(
      sheet,
      (idx % 32) * GALLEON_TILE,
      (idx >> 5) * GALLEON_TILE,
      GALLEON_TILE,
      GALLEON_TILE,
      tx * GALLEON_TILE,
      ty * GALLEON_TILE,
      GALLEON_TILE,
      GALLEON_TILE,
    );
  }
  // Dark veil clipped to the ship pixels: a silhouette with a hint of detail.
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "rgba(10,26,34,0.78)";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";

  // Faint reflection smear: flipped, drawn twice with a small x offset for a
  // cheap blur, then faded out with depth via a destination-out gradient.
  const refl = document.createElement("canvas");
  refl.width = W;
  refl.height = H;
  const rc = refl.getContext("2d");
  if (!rc) return null;
  rc.translate(0, H);
  rc.scale(1, -1);
  rc.globalAlpha = 0.55;
  rc.drawImage(ship, -3, 0);
  rc.drawImage(ship, 3, 0);
  rc.setTransform(1, 0, 0, 1, 0, 0);
  rc.globalAlpha = 1;
  rc.globalCompositeOperation = "destination-out";
  const fade = rc.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, "rgba(0,0,0,0.25)");
  fade.addColorStop(1, "rgba(0,0,0,1)");
  rc.fillStyle = fade;
  rc.fillRect(0, 0, W, H);
  return { ship, refl };
}

/** Anchored backdrop ship: behind all targets, in front of the sky and moon glow. */
function drawGalleon(ctx: CanvasRenderingContext2D, w: number, h: number, imgs: Imgs): void {
  if (galleonBroken) return;
  if (!galleonCache) {
    const hull = imgs.shipHull;
    const rig = imgs.shipRig;
    if (!hull || !hull.naturalWidth || !rig || !rig.naturalWidth) return;
    try {
      galleonCache = buildGalleonCache(hull, rig);
    } catch {
      galleonCache = null;
    }
    if (!galleonCache) {
      galleonBroken = true;
      return;
    }
  }
  const hY = horizonY(h);
  const natW = GALLEON_COLS * GALLEON_TILE;
  const natH = GALLEON_ROWS * GALLEON_TILE;
  // Roughly 38% of canvas width, capped so the masts stay inside the sky band.
  const scale = Math.min((w * 0.38) / natW, (hY * 1.04) / natH);
  const sw = natW * scale;
  const sh = natH * scale;
  const dx = w * 0.3 - sw / 2; // left-of-center
  const dy = hY + sh * 0.05 - sh; // waterline rides a touch below the horizon
  ctx.globalAlpha = 0.9;
  ctx.drawImage(galleonCache.ship, dx, dy, sw, sh);
  ctx.globalAlpha = 0.12;
  ctx.drawImage(galleonCache.refl, dx, hY + sh * 0.03, sw, sh * 0.34);
  ctx.globalAlpha = 1;
}

/** Cubic bezier component, used to place tentacle suckers along the arm. */
function bez(p0: number, p1: number, p2: number, p3: number, q: number): number {
  const r = 1 - q;
  return r * r * r * p0 + 3 * r * r * q * p1 + 3 * r * q * q * p2 + q * q * q * p3;
}

/**
 * Procedural kraken arm, anchored at (0,0) on the waterline, curling up.
 * Caller translates/scales/alphas for the surface-hold-dive timeline.
 */
function drawTentacle(ctx: CanvasRenderingContext2D, u: number, seed: number, time: number): void {
  const side = seed < 0.5 ? -1 : 1;
  const hgt = u * 1.7;
  const bw = u * 0.26; // half-width at the waterline
  const sway = Math.sin(time * 2.6 + seed * 9) * u * 0.07;

  ctx.save();
  ctx.scale(side, 1);
  ctx.rotate(Math.sin(time * 2.2 + seed * 7) * 0.05);

  // Faint standing ripple where the arm pierces the surface.
  ctx.strokeStyle = water(0.22);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, bw * 2.3, bw * 0.6, 0, 0, Math.PI * 2);
  ctx.stroke();

  const tipX = u * 0.55 + sway;
  const tipY = -hgt;
  // Inner (right) edge control points, also used to seat the suckers.
  const i0x = tipX;
  const i0y = tipY;
  const i1x = tipX - u * 0.05;
  const i1y = -hgt * 0.66;
  const i2x = bw * 1.25;
  const i2y = -hgt * 0.3;
  const i3x = bw;
  const i3y = 0;

  ctx.beginPath();
  ctx.moveTo(-bw, 0);
  ctx.bezierCurveTo(-bw * 1.3, -hgt * 0.5, tipX - u * 0.34, -hgt * 0.82, tipX, tipY);
  ctx.bezierCurveTo(i1x, i1y, i2x, i2y, i3x, i3y);
  ctx.closePath();
  ctx.fillStyle = "#1f6171";
  ctx.fill();
  ctx.strokeStyle = "rgba(159,214,223,0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Suckers along the inner curve, shrinking toward the tip.
  ctx.fillStyle = "#9fd6df";
  const stops = [0.85, 0.65, 0.45, 0.28]; // q runs tip(0) to base(1)
  for (let i = 0; i < stops.length; i++) {
    const q = stops[i];
    const sx = bez(i0x, i1x, i2x, i3x, q) - u * 0.1;
    const sy = bez(i0y, i1y, i2y, i3y, q);
    const sr = u * (0.1 - i * 0.016);
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1, sr), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * One cannon barrel pivoted at the carriage (cx, cy). The sprite's muzzle
 * points up at rot = -PI/2; extra "fanned" barrels pass a small angular
 * splay and a slight scale-down so they read as a flanking battery behind
 * the main gun. Cosmetic only: shares the tilt, fires no hit-test.
 */
function drawBarrel(
  ctx: CanvasRenderingContext2D,
  imgs: Imgs,
  cx: number,
  cy: number,
  u: number,
  rot: number,
  scale: number,
): void {
  const cimg = imgs.cannon;
  if (cimg && cimg.naturalWidth) {
    drawSprite(ctx, cimg, cx, cy, u * 1.5 * scale, rot);
  } else {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot + Math.PI / 2); // vector fallback is authored muzzle-up
    ctx.scale(scale, scale);
    ctx.fillStyle = "#15323c";
    ctx.fillRect(-u * 0.14, -u * 0.75, u * 0.28, u * 0.85);
    ctx.fillStyle = "rgba(240,180,92,0.5)";
    ctx.fillRect(-u * 0.16, -u * 0.75, u * 0.32, 3);
    ctx.fillStyle = "#3a2c1c";
    ctx.fillRect(-u * 0.3, u * 0.06, u * 0.6, u * 0.3);
    ctx.restore();
  }
}

/** Muzzle flash bloom at the barrel mouth. Cosmetic; alpha set by caller via fade. */
function drawMuzzleFlash(
  ctx: CanvasRenderingContext2D,
  mx: number,
  my: number,
  u: number,
  fade: number,
): void {
  ctx.fillStyle = `rgba(240,180,92,${(0.45 * fade).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(mx, my, u * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,207,126,${(0.8 * fade).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(mx, my, u * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawGame(
  ctx: CanvasRenderingContext2D,
  g: Game,
  w: number,
  h: number,
  aim: { x: number; y: number; show: boolean },
  aimR: number,
  imgs: Imgs,
  cannons: number,
): void {
  const u = unit(w, h);

  for (const t of g.targets) {
    const p = (g.elapsed - t.born) / t.life;
    let s = 1;
    let a = 1;
    if (p < 0.15) {
      s = p / 0.15;
    } else if (p > 0.78) {
      s = (1 - p) / 0.22;
      a = s;
    }
    if (s <= 0.03) continue;
    const bob = Math.sin(g.elapsed * 4 + t.x * 0.05) * 2;
    const yy = t.y + bob + (1 - s) * t.r * 0.8;
    const alpha = Math.max(0, Math.min(1, a));

    // Expanding surface ripple while the target breaches.
    if (p < 0.22) {
      const pr = p / 0.22;
      const rr = t.r * (0.5 + 1.3 * pr);
      ctx.strokeStyle = water(0.4 * (1 - pr));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + t.r * 0.7, rr, Math.max(2, rr * 0.32), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = alpha;
    if (t.kind === "barrel") {
      const img = imgs[`dinghy${1 + Math.floor(t.seed * 3)}`];
      const rock = Math.sin(g.elapsed * 2.1 + t.seed * 6.3) * 0.1;
      if (img && img.naturalWidth) {
        drawSprite(ctx, img, t.x, yy, u * 1.0 * s, rock);
      } else {
        ctx.save();
        ctx.translate(t.x, yy);
        ctx.rotate(rock);
        ctx.fillStyle = "#7a4a23";
        ctx.beginPath();
        ctx.ellipse(0, 0, u * 0.45 * s, u * 0.75 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#b07a3f";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    } else if (t.kind === "sloop") {
      const dir = t.vx >= 0 ? 1 : -1;
      // Wake trailing the stern.
      ctx.strokeStyle = water(0.28 * alpha);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(t.x - dir * u * 1.25, yy + 2);
      ctx.lineTo(t.x - dir * u * 2.05, yy + 2);
      ctx.moveTo(t.x - dir * u * 1.1, yy + 6);
      ctx.lineTo(t.x - dir * u * 1.7, yy + 6);
      ctx.stroke();
      const img = imgs.sloop;
      if (img && img.naturalWidth) {
        // Top-down sprite points up; quarter-turn to face the drift.
        drawSprite(ctx, img, t.x, yy, u * 1.4 * s, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      } else {
        ctx.fillStyle = "#5e3a1e";
        ctx.beginPath();
        ctx.ellipse(t.x, yy, u * 1.1 * s, u * 0.4 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#c8413f";
        ctx.beginPath();
        ctx.arc(t.x, yy - u * 0.2 * s, u * 0.3 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (t.kind === "ally") {
      // BIG MIKE waving a white flag = DO NOT SHOOT. Friendly fire on him costs you.
      const dir = t.vx >= 0 ? 1 : -1;
      const k = Math.max(0.04, s);
      // soft halo so he reads "friendly" at a glance, clearly unlike the enemies
      ctx.save();
      ctx.translate(t.x, yy);
      ctx.fillStyle = "rgba(200,240,255,0.18)";
      ctx.beginPath();
      ctx.ellipse(0, 0, u * 1.3 * k, u * 0.9 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const bm = imgs.bigmike;
      if (bm && bm.naturalWidth) {
        drawSprite(ctx, bm, t.x, yy, u * 1.8 * k);
      } else {
        // vector fallback: a pale parley boat until the sprite loads
        ctx.save();
        ctx.translate(t.x, yy);
        ctx.fillStyle = "#d7eef5";
        ctx.beginPath();
        ctx.ellipse(0, u * 0.18 * k, u * 0.92 * k, u * 0.32 * k, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // a small white flag on a pole so "hold fire" is unmistakable
      ctx.save();
      ctx.translate(t.x, yy);
      ctx.strokeStyle = "#cdbfa8";
      ctx.lineWidth = Math.max(1.5, 2.5 * k);
      ctx.beginPath();
      ctx.moveTo(dir * u * 0.58 * k, -u * 0.3 * k);
      ctx.lineTo(dir * u * 0.58 * k, -u * 1.15 * k);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(dir * u * 0.58 * k, -u * 1.15 * k);
      ctx.lineTo(dir * u * 1.08 * k, -u * 0.99 * k);
      ctx.lineTo(dir * u * 0.58 * k, -u * 0.83 * k);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(t.x, yy + t.r * 0.85);
      const sc = Math.max(0.03, s);
      ctx.scale(sc, sc);
      drawTentacle(ctx, u, t.seed, g.elapsed);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Hit explosions: 3 Kenney frames over ~250ms.
  for (const b of g.booms) {
    const q = (g.elapsed - b.born) / BOOM_S;
    const img = q < 0.34 ? imgs.boom1 : q < 0.67 ? imgs.boom2 : imgs.boom3;
    ctx.globalAlpha = Math.max(0, 1 - q * 0.7);
    drawSprite(ctx, img, b.x, b.y, u * (1.1 + 0.6 * q));
    ctx.globalAlpha = 1;
  }

  for (const r of g.rings) {
    const q = (g.elapsed - r.born) / 0.35;
    if (r.water) {
      const rr = 8 + 30 * q;
      ctx.strokeStyle = water(0.5 * (1 - q));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rr, Math.max(2, rr * 0.32), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(255,207,126,${(0.7 * (1 - q)).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 10 + 42 * q, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (const p of g.particles) {
    const q = (g.elapsed - p.born) / p.life;
    ctx.globalAlpha = Math.max(0, 1 - q);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 16px ${UI_FONT}`;
  for (const f of g.floaters) {
    const q = (g.elapsed - f.born) / 0.8;
    ctx.globalAlpha = Math.max(0, 1 - q);
    ctx.fillStyle = GOLD_BRIGHT;
    ctx.fillText(f.text, f.x, f.y - 28 * q);
  }
  ctx.globalAlpha = 1;

  // Deck cannon at bottom-center, tilted toward the last shot.
  const cx = w / 2;
  const cy = h - u * 0.5;
  const rot = -Math.PI / 2 + g.cannonAngle;

  // CANNONS fitting (0-5): extra barrels flank the main gun, one per level,
  // fanned and capped at FLANK_CAP so a maxed battery never clutters. All
  // barrels share the tilt; the centre barrel always draws last (on top).
  const flanks = Math.max(0, Math.min(FLANK_CAP, Math.floor(cannons)));
  for (let i = 1; i <= flanks; i++) {
    const splay = 0.12 + 0.05 * (i - 1); // outer barrels fan a touch wider
    const side = i % 2 === 1 ? -1 : 1; // alternate left, right, left...
    const tier = Math.ceil(i / 2);
    drawBarrel(ctx, imgs, cx, cy, u, rot + side * splay * tier, 0.86 - 0.05 * tier);
  }

  // Muzzle flash at the centre barrel mouth. At MAX cannons a cosmetic
  // two-shot burst adds a second flash ~80ms later. Burst is visual only:
  // it shares the existing single hit-test and changes nothing in scoring.
  const burst = flanks >= FLANK_CAP && cannons >= MAX_CANNONS;
  const mx = cx + Math.cos(rot) * u * 0.78;
  const myz = cy + Math.sin(rot) * u * 0.78;
  if (g.lastShot >= 0) {
    const fq = (g.elapsed - g.lastShot) / FLASH_S;
    if (fq >= 0 && fq < 1) drawMuzzleFlash(ctx, mx, myz, u, 1 - fq);
    if (burst) {
      const bq = (g.elapsed - g.lastShot - BURST_DELAY_S) / FLASH_S;
      if (bq >= 0 && bq < 1) drawMuzzleFlash(ctx, mx, myz, u, (1 - bq) * 0.85);
      // Cosmetic second tracer: a quick gold ball leaving the muzzle toward
      // wherever the captain last fired, trailing the real (instant) hit.
      const tq = (g.elapsed - g.lastShot - BURST_DELAY_S) / 0.16;
      if (tq >= 0 && tq < 1) {
        const tx = mx + (g.lastShotX - mx) * tq;
        const ty = myz + (g.lastShotY - myz) * tq;
        ctx.strokeStyle = `rgba(255,207,126,${(0.4 * (1 - tq)).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx, myz);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,207,126,${(0.9 * (1 - tq)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(tx, ty, u * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawBarrel(ctx, imgs, cx, cy, u, rot, 1);

  if (aim.show && !g.over) {
    const ready = g.lastShot < 0 || g.elapsed - g.lastShot >= COOLDOWN_S;
    const c = ready ? GOLD : "rgba(248,253,255,0.30)";
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, aimR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(aim.x - aimR - 5, aim.y);
    ctx.lineTo(aim.x - aimR + 5, aim.y);
    ctx.moveTo(aim.x + aimR - 5, aim.y);
    ctx.lineTo(aim.x + aimR + 5, aim.y);
    ctx.moveTo(aim.x, aim.y - aimR - 5);
    ctx.lineTo(aim.x, aim.y - aimR + 5);
    ctx.moveTo(aim.x, aim.y + aimR - 5);
    ctx.lineTo(aim.x, aim.y + aimR + 5);
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.fillRect(aim.x - 1, aim.y - 1, 2, 2);
  }
}

function drawHud(ctx: CanvasRenderingContext2D, g: Game, w: number): void {
  const left = Math.max(0, RUN_SECONDS - g.elapsed);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `600 22px ${UI_FONT}`;
  if (left < 10) {
    ctx.fillStyle = ROSE;
    ctx.fillText(left.toFixed(1), w / 2, 12);
  } else {
    ctx.fillStyle = FG;
    ctx.fillText(`0:${String(Math.ceil(left)).padStart(2, "0")}`, w / 2, 12);
  }
  ctx.textAlign = "right";
  ctx.fillStyle = GOLD;
  ctx.font = `700 20px ${UI_FONT}`;
  ctx.fillText(String(g.score), w - 14, 12);
  const mult = Math.round(g.mult * 10) / 10;
  ctx.font = `600 13px ${UI_FONT}`;
  ctx.fillStyle = mult > 1 ? GOLD : FG3;
  ctx.fillText(`x${mult.toFixed(1)}`, w - 14, 36);
}

/** Tiny inline tentacle mark for the DOM legend (matches the canvas kraken). */
function TentacleMark() {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M4 22 C 3 15 6 12 8 9 C 10 6 10 4 8 2 C 12 1 16 4 15 9 C 14 15 11 16 11 22 Z"
        fill="#1f6171"
        stroke="rgba(159,214,223,0.45)"
        strokeWidth="1"
      />
      <circle cx="11.2" cy="17" r="1.5" fill="#9fd6df" />
      <circle cx="11.9" cy="13" r="1.3" fill="#9fd6df" />
      <circle cx="12.5" cy="9.5" r="1.1" fill="#9fd6df" />
    </svg>
  );
}

export default function GunneryDrillPage() {
  const { captain, submitScore, submitState, lastResult } = useSeasGame("gunnery");

  const [phase, setPhase] = useState<"start" | "playing" | "over">("start");
  const [final, setFinal] = useState({ score: 0, hits: 0, misses: 0, bestStreak: 0 });
  const [artReady, setArtReady] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const gameRef = useRef<Game | null>(null);
  const phaseRef = useRef(phase);
  const captainRef = useRef<Captain | null>(captain);
  const submitRef = useRef(submitScore);
  const aimRef = useRef({ x: 0, y: 0, show: false });
  const keysRef = useRef(new Set<string>());
  const imgsRef = useRef<Imgs>({});

  phaseRef.current = phase;
  captainRef.current = captain;
  submitRef.current = submitScore;

  const scenery = useMemo(() => buildScenery(), []);
  const spyglass = captain?.fittings.spyglass ?? 0;
  const aimRadius = 18 + 4 * spyglass;
  const cannons = captain?.fittings.cannons ?? 0; // guests default to 0 (one barrel)

  /** Load sprite art once. Missing files resolve anyway and never crash a run. */
  useEffect(() => {
    let dead = false;
    void loadImages(SPRITES).then((m) => {
      if (!dead) {
        imgsRef.current = m;
        setArtReady(true);
      }
    });
    return () => {
      dead = true;
    };
  }, []);

  /** Fire one cannon shot at canvas point (x, y). Uses non-seeded Math.random effects. */
  const fire = useCallback((x: number, y: number) => {
    const g = gameRef.current;
    if (!g || g.over || phaseRef.current !== "playing") return;
    if (g.lastShot >= 0 && g.elapsed - g.lastShot < COOLDOWN_S) return;
    g.lastShot = g.elapsed;
    g.lastShotX = x;
    g.lastShotY = y;
    const aimR = 18 + 4 * (captainRef.current?.fittings.spyglass ?? 0);
    let best: Target | null = null;
    let bestD = Infinity;
    for (const t of g.targets) {
      if (t.dead) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      // Forgiving hit area: the drawn ship/dinghy/tentacle extends well past
      // t.r * 0.5, so catch the full rendered footprint plus a small margin.
      // (Was aimR + t.r * 0.5 — too tight; tapping a visible ship missed.)
      // Still picks the CLOSEST in-range target via the bestD check below.
      if (d <= aimR + t.r * 1.4 && d < bestD) {
        best = t;
        bestD = d;
      }
    }
    if (best && best.kind === "ally") {
      // FRIENDLY FIRE — lose points + reset the combo. A human reads the white flag
      // and holds; a bot that blasts everything tanks its score and can't reach the cap.
      best.dead = true;
      g.score = Math.max(0, g.score - ALLY_PENALTY);
      g.streak = 0;
      g.mult = 1;
      g.misses += 1;
      for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 50 + Math.random() * 150;
        g.particles.push({
          x: best.x,
          y: best.y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 40,
          born: g.elapsed,
          life: 0.4 + Math.random() * 0.2,
          color: "#ff6b6b",
          size: 2 + Math.random() * 2,
        });
      }
      g.rings.push({ x: best.x, y: best.y, born: g.elapsed });
      g.floaters.push({ x: best.x, y: best.y - 20, text: `-${ALLY_PENALTY} ally!`, born: g.elapsed });
    } else if (best) {
      best.dead = true;
      const gained = Math.round(best.pts * g.mult);
      g.score += gained;
      g.hits += 1;
      g.streak += 1;
      if (g.streak > g.bestStreak) g.bestStreak = g.streak;
      g.mult = Math.min(MULT_CAP, Math.round((g.mult + 0.1) * 10) / 10);
      for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 180;
        g.particles.push({
          x: best.x,
          y: best.y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 50,
          born: g.elapsed,
          life: 0.4 + Math.random() * 0.25,
          color: Math.random() < 0.65 ? GOLD_BRIGHT : FG,
          size: 2 + Math.random() * 2,
        });
      }
      g.rings.push({ x: best.x, y: best.y, born: g.elapsed });
      g.booms.push({ x: best.x, y: best.y, born: g.elapsed });
      g.floaters.push({ x: best.x, y: best.y - 20, text: `+${gained}`, born: g.elapsed });
    } else {
      g.misses += 1;
      g.streak = 0;
      g.mult = 1;
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const sp = 80 + Math.random() * 140;
        g.particles.push({
          x,
          y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          born: g.elapsed,
          life: 0.35 + Math.random() * 0.2,
          color: water(0.85),
          size: 2 + Math.random() * 2,
        });
      }
    }
  }, []);

  const startRun = useCallback(() => {
    const { w, h } = sizeRef.current;
    gameRef.current = {
      elapsed: 0,
      targets: [],
      particles: [],
      rings: [],
      booms: [],
      floaters: [],
      score: 0,
      hits: 0,
      misses: 0,
      streak: 0,
      bestStreak: 0,
      mult: 1,
      spawnAcc: 0.85,
      lastShot: -10,
      lastShotX: w / 2,
      lastShotY: 0,
      cannonAngle: 0,
      over: false,
    };
    aimRef.current = { x: w / 2, y: h * 0.6, show: aimRef.current.show };
    phaseRef.current = "playing";
    setPhase("playing");
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (phaseRef.current !== "playing") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      aimRef.current.x = x;
      aimRef.current.y = y;
      if (e.pointerType !== "touch") aimRef.current.show = true;
      fire(x, y);
    },
    [fire],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect();
    aimRef.current.x = e.clientX - rect.left;
    aimRef.current.y = e.clientY - rect.top;
    aimRef.current.show = true;
  }, []);

  /** Size the canvas to its container, DPR capped at 2. */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  /** Keyboard: arrows / WASD move the crosshair, space or enter fires. */
  useEffect(() => {
    const norm = (key: string) => (key.length === 1 ? key.toLowerCase() : key);
    const onDown = (e: KeyboardEvent) => {
      if (phaseRef.current !== "playing") return;
      const k = norm(e.key);
      if (k === " " || k === "Enter") {
        e.preventDefault();
        aimRef.current.show = true;
        fire(aimRef.current.x, aimRef.current.y);
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"].includes(k)) {
        e.preventDefault();
        keysRef.current.add(k);
        aimRef.current.show = true;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current.delete(norm(e.key));
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [fire]);

  /** Main render loop. Game time accumulates from clamped dt, so a hidden tab pauses the run. */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const finish = (g: Game) => {
      g.over = true;
      phaseRef.current = "over";
      setFinal({ score: g.score, hits: g.hits, misses: g.misses, bestStreak: g.bestStreak });
      setPhase("over");
      void submitRef.current(g.score, { hits: g.hits, misses: g.misses, bestStreak: g.bestStreak });
    };
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const canvas = canvasRef.current;
      const ctx = canvas ? canvas.getContext("2d") : null;
      const { w, h, dpr } = sizeRef.current;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!canvas || !ctx || w <= 0 || h <= 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Premium AI backdrop covers the canvas behind all gameplay. If it has
      // not loaded (or failed), fall back to the procedural night sea plus the
      // composited LPC galleon so a missing/slow image never breaks the game.
      if (!drawBackdrop(ctx, w, h, imgsRef.current)) {
        drawSea(ctx, w, h, now, scenery);
        drawGalleon(ctx, w, h, imgsRef.current);
      }
      const g = gameRef.current;
      if (g && phaseRef.current === "playing" && !g.over) {
        const keys = keysRef.current;
        if (keys.size > 0) {
          let dx = 0;
          let dy = 0;
          if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
          if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
          if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
          if (keys.has("ArrowDown") || keys.has("s")) dy += 1;
          if (dx !== 0 || dy !== 0) {
            const aim = aimRef.current;
            aim.x = Math.max(8, Math.min(w - 8, aim.x + dx * 460 * dt));
            aim.y = Math.max(8, Math.min(h - 8, aim.y + dy * 460 * dt));
          }
        }
        updateGame(g, dt, w, h);
        if (g.elapsed >= RUN_SECONDS) {
          finish(g);
        } else {
          const aimR = 18 + 4 * (captainRef.current?.fittings.spyglass ?? 0);
          const cannons = captainRef.current?.fittings.cannons ?? 0;
          drawGame(ctx, g, w, h, aimRef.current, aimR, imgsRef.current, cannons);
          drawHud(ctx, g, w);
        }
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [scenery]);

  const overlayStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    background: "rgba(0,15,22,0.78)",
    textAlign: "center",
    padding: 20,
    fontFamily: UI_FONT,
  };

  const chipStyle: CSSProperties = {
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 999,
    padding: "6px 12px",
    color: GOLD,
    fontSize: 13,
    fontWeight: 600,
  };

  const goldButtonStyle: CSSProperties = {
    background: GOLD,
    color: INK,
    border: "none",
    borderRadius: 12,
    padding: "14px 52px",
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const legendItemStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: FG3,
    fontSize: 14,
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
        fontFamily: UI_FONT,
      }}
    >
      <GameHeader title="Gunnery Drill" captain={captain} />
      <div ref={wrapRef} style={{ position: "relative", flex: "1 1 auto", minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          style={{
            display: "block",
            position: "absolute",
            top: 0,
            left: 0,
            touchAction: "none",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
            cursor: phase === "playing" ? "none" : "default",
          }}
        />
        {phase === "start" && (
          <div style={overlayStyle}>
            <div style={{ fontSize: 54, lineHeight: 1 }}>🎯</div>
            <div style={{ color: FG, fontSize: 15 }}>Tap the targets before they dive. Never shoot Big Mike. 🏳️</div>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <span style={legendItemStyle}><img src={SPRITES.dinghy1} alt="dinghy" height={24} style={{ display: "block" }} /> 10</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <span style={legendItemStyle}><img src={SPRITES.sloop} alt="sloop" height={26} style={{ display: "block" }} /> 25</span>
              <span style={legendItemStyle}><TentacleMark /> 50</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <span style={{ ...legendItemStyle, color: "#ff8f8f" }}><img src={SPRITES.bigmike} alt="Big Mike" height={28} style={{ display: "block" }} /> -{ALLY_PENALTY} hold fire</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={chipStyle}>⚓ Guns x{1 + cannons}</span>
              <span style={chipStyle}>🔭 {aimRadius}px</span>
              <span style={chipStyle}>🔥 x{MULT_CAP}.0 max</span>
            </div>
            <button
              style={{ ...goldButtonStyle, opacity: artReady ? 1 : 0.55, cursor: artReady ? "pointer" : "default" }}
              disabled={!artReady}
              onClick={startRun}
            >
              {artReady ? "START" : "…"}
            </button>
            <div style={{ color: FG3, fontSize: 11 }}>👆 / 🖱️ fire · ⌨️ ←↑↓→ + space</div>
          </div>
        )}
        {phase === "over" && (
          <div style={overlayStyle}>
            <div style={{ fontSize: 44, lineHeight: 1 }}>🎯</div>
            <div style={{ width: "min(420px, 92%)" }}>
              <ScoreBanner state={submitState} result={lastResult} score={final.score} />
            </div>
            <div style={{ color: FG3, fontSize: 14 }}>
              ✅ {final.hits} · 💦 {final.misses} · 🔥 {final.bestStreak}
            </div>
            <button style={goldButtonStyle} onClick={startRun} disabled={!artReady}>
              Play again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
