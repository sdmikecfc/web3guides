/**
 * GAUNTLET DRAW - every painter the client composits. Pure presentation:
 * nothing in here reads sim RNG or mutates sim state; every function takes
 * plain numbers/state and paints. All vector today (the Darkest-Dungeon-grade
 * look built from gradients + silhouettes + chiaroscuro foreground shapes);
 * every structural layer checks art() first (try-image-else-vector, the S6
 * art law) so the drop-in art pass later needs zero code changes here.
 *
 * COORDINATES: a fixed 800x600 design space (the tape viewport). The client
 * scales the canvas backing store; painters never look at DPR.
 */

import type { ClassId } from "../_shared/rules/core";
import { BOONS, CARD_INDEX, RELICS, bossFor, isBossFloor, type Card, type Perk } from "./content";
import {
  CARD_BAND_Y,
  CARD_SLOTS,
  CHOICE_GRACE,
  DRAFT_GRACE,
  END_X,
  TURN_GRACE,
  gauntletScore,
  type EnemyState,
  type GauntletState,
} from "./sim";

export const DESIGN_W = 800;
export const DESIGN_H = 600;
export const BAND_Y = Math.round(CARD_BAND_Y * DESIGN_H); // 468: the hand band top
export const END_PX = Math.round(END_X * DESIGN_W); // 680: end-turn zone left edge
export const FLOOR_Y = 424; // the stage floor line
export const HERO_X = 176;

const TAU = Math.PI * 2;

// ── palette ─────────────────────────────────────────────────────────────────

export const PAL = {
  ink: "#07080c",
  text: "#e8e2d2",
  dim: "#8b8577",
  bone: "#cfc8b8",
  boneDim: "#8f8a7c",
  gold: "#f0b340",
  goldHi: "#ffd98a",
  ember: "#e07030",
  blood: "#c8443a",
  bloodDeep: "#7e2c22",
  green: "#59d98c",
  teal: "#5d7a78",
  tealDeep: "#39504f",
  steel: "#5a6a86",
  cardBg: "#141924",
  cardEdge: "#3d4454",
  attackTint: "#2c1a15",
  skillTint: "#15202e",
  bandBg: "#0b0e14",
  // card family hues (identity pass): attack = ember-red, "power" skills
  // (energy/draw) = violet, other skills = steel-blue
  attackEdge: "#8a4632",
  attackGlyph: "#e08a62",
  powerTint: "#1d1830",
  powerEdge: "#584a8e",
  powerGlyph: "#a88ae8",
  skillEdge: "#3d5474",
  skillGlyph: "#7ea6d8",
};

export const CLASS_ACCENT: Record<ClassId, string> = {
  barbarian: "#e07030",
  monk: "#3fae8a",
  ranger: "#3f7a3f",
  bard: "#6a5adf",
  wizard: "#3f6adf",
  cleric: "#d8b13f",
};

/** Depth-band stage tints (floor 0 / early / mid / deep / abyss): the wall
 * cools and darkens as the run sinks. Index = bandFor(floor). */
const BAND_TINT: readonly { top: string; bot: string; mid: string; light: string }[] = [
  { top: "#161c2c", bot: "#242e46", mid: "#0e1220", light: "#8fa8d8" },
  { top: "#141a29", bot: "#212a40", mid: "#0d111e", light: "#88a0cc" },
  { top: "#121724", bot: "#1d2538", mid: "#0c101a", light: "#7e94bd" },
  { top: "#100f1e", bot: "#1a1930", mid: "#0a0914", light: "#8a7eb8" },
  { top: "#140d16", bot: "#1f1424", mid: "#0c0810", light: "#b07898" },
];

// ── text + shape helpers ────────────────────────────────────────────────────

const FONT_STACK = `"Arial Narrow","Roboto Condensed","Segoe UI",system-ui,sans-serif`;
export function font(px: number, wt = 800): string {
  return `${wt} ${px}px ${FONT_STACK}`;
}

export function txt(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  px: number,
  color: string,
  align: CanvasTextAlign = "center",
  wt = 800,
): void {
  g.font = font(px, wt);
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillText(s, Math.round(x), Math.round(y));
}

export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Deterministic hash jitter for static dressing (never Math.random: baked
 * dressing must not shimmer between bakes). */
function h01(i: number): number {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// ── art hooks (try-image-else-vector; never blocks) ─────────────────────────

const ART_BASE = "/s7-art/games/gauntlet";
const artCache: Record<string, HTMLImageElement> = {};

/** Lazily start loading /s7-art/games/gauntlet/<name>.png; returns the image
 * only once it is genuinely drawable, else null (the vector fallback paints). */
export function art(name: string): HTMLImageElement | null {
  let im = artCache[name];
  if (!im) {
    if (typeof document === "undefined") return null;
    im = new Image();
    im.src = `${ART_BASE}/${name}.png`;
    artCache[name] = im;
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

/** Draw an art image anchored bottom-center at (x, y) scaled to targetH. */
export function drawArt(g: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, targetH: number): void {
  const sc = targetH / im.naturalHeight;
  const w = im.naturalWidth * sc;
  g.drawImage(im, Math.round(x - w / 2), Math.round(y - targetH), Math.round(w), Math.round(targetH));
}

// ── the stage bake (three parallax layers + floor, per depth band) ──────────

export interface StageBake {
  band: number;
  far: HTMLCanvasElement; // cold wall + arches + the lancet light
  mid: HTMLCanvasElement; // dressing silhouettes: columns, chains, stones
  floor: HTMLCanvasElement;
  fg: HTMLCanvasElement; // near-black chiaroscuro shapes overlapping the frame
  glow: HTMLCanvasElement; // one warm torch glow sprite, alpha-animated live
}

function mkCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

export function bakeStage(band: number): StageBake {
  const b = Math.max(0, Math.min(BAND_TINT.length - 1, band));
  const tint = BAND_TINT[b];

  // FAR: the cold wall
  const far = mkCanvas(DESIGN_W, DESIGN_H);
  {
    const g = far.g;
    const grad = g.createLinearGradient(0, 0, 0, DESIGN_H);
    grad.addColorStop(0, tint.top);
    grad.addColorStop(1, tint.bot);
    g.fillStyle = grad;
    g.fillRect(0, 0, DESIGN_W, DESIGN_H);
    // masonry courses: faint horizontal seams with hash-jittered breaks
    g.strokeStyle = "rgba(0,0,0,0.22)";
    g.lineWidth = 1;
    for (let y = 60; y < FLOOR_Y; y += 34) {
      g.beginPath();
      g.moveTo(0, y + h01(y) * 6);
      g.lineTo(DESIGN_W, y + h01(y + 1) * 6);
      g.stroke();
      for (let k = 0; k < 5; k++) {
        const x = h01(y * 7 + k) * DESIGN_W;
        g.beginPath();
        g.moveTo(x, y + h01(y + 1) * 6);
        g.lineTo(x + h01(k + y) * 4 - 2, y + 34);
        g.stroke();
      }
    }
    // three faint recessed arches
    for (let i = 0; i < 3; i++) {
      const cx = 150 + i * 250;
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(cx - 70, 400);
      g.lineTo(cx - 70, 170);
      g.arc(cx, 170, 70, Math.PI, 0);
      g.lineTo(cx + 70, 400);
      g.stroke();
      g.fillStyle = "rgba(0,0,0,0.2)";
      g.fill();
    }
    // one lancet window of cold light behind mid stage: the DD light source
    const lg = g.createLinearGradient(0, 60, 0, 380);
    lg.addColorStop(0, tint.light + "44");
    lg.addColorStop(1, tint.light + "00");
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(376, 190);
    g.arc(400, 190, 24, Math.PI, 0);
    g.lineTo(424, 330);
    g.lineTo(376, 330);
    g.closePath();
    g.fill();
  }

  // MID: dressing silhouettes
  const mid = mkCanvas(DESIGN_W, DESIGN_H);
  {
    const g = mid.g;
    g.fillStyle = tint.mid;
    // flanking columns
    for (const cx of [64, 716]) {
      g.fillRect(cx - 26, 96, 52, FLOOR_Y - 96);
      g.fillRect(cx - 34, 84, 68, 18); // capital
      g.fillRect(cx - 34, FLOOR_Y - 16, 68, 16); // base
    }
    // top lintel with a shallow arch dip
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(DESIGN_W, 0);
    g.lineTo(DESIGN_W, 96);
    g.quadraticCurveTo(DESIGN_W / 2, 34, 0, 96);
    g.closePath();
    g.fill();
    // hanging chains
    g.strokeStyle = tint.mid;
    g.lineWidth = 3;
    for (const cx of [268, 556]) {
      g.beginPath();
      g.moveTo(cx, 60);
      for (let y = 60; y <= 190; y += 12) g.lineTo(cx + Math.sin(y * 0.4 + cx) * 3, y);
      g.stroke();
      g.beginPath();
      g.arc(cx + Math.sin(190 * 0.4 + cx) * 3, 198, 7, 0, TAU);
      g.stroke();
    }
    // grave slabs + rubble near the floor
    for (let i = 0; i < 6; i++) {
      const x = 90 + h01(i * 3 + b) * 620;
      const w = 24 + h01(i * 5) * 26;
      const hgt = 26 + h01(i * 7) * 30;
      g.save();
      g.translate(x, FLOOR_Y);
      g.rotate((h01(i * 11) - 0.5) * 0.16);
      g.beginPath();
      g.moveTo(-w / 2, 0);
      g.lineTo(-w / 2, -hgt + w / 2);
      g.arc(0, -hgt + w / 2, w / 2, Math.PI, 0);
      g.lineTo(w / 2, 0);
      g.closePath();
      g.fill();
      g.restore();
    }
    // torch brackets (the live glow draws over these)
    for (const cx of [210, 590]) {
      g.fillRect(cx - 4, 168, 8, 26);
    }
  }

  // FLOOR
  const floor = mkCanvas(DESIGN_W, DESIGN_H);
  {
    const g = floor.g;
    const grad = g.createLinearGradient(0, FLOOR_Y - 8, 0, DESIGN_H);
    grad.addColorStop(0, "#12151f");
    grad.addColorStop(1, "#07080c");
    g.fillStyle = grad;
    g.fillRect(0, FLOOR_Y - 6, DESIGN_W, DESIGN_H - FLOOR_Y + 6);
    // the floor line
    g.strokeStyle = "#2a3145";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, FLOOR_Y);
    g.lineTo(DESIGN_W, FLOOR_Y);
    g.stroke();
    // flagstone seams fanning toward the viewer
    g.strokeStyle = "rgba(42,49,69,0.5)";
    g.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const x = i * 100 + 20;
      g.beginPath();
      g.moveTo(x, FLOOR_Y + 2);
      g.lineTo(x + (x - DESIGN_W / 2) * 0.22, BAND_Y + 30);
      g.stroke();
    }
    // a cold pool of light center stage
    const rg = g.createRadialGradient(430, FLOOR_Y + 14, 20, 430, FLOOR_Y + 14, 260);
    rg.addColorStop(0, tint.light + "22");
    rg.addColorStop(1, tint.light + "00");
    g.fillStyle = rg;
    g.fillRect(0, FLOOR_Y - 4, DESIGN_W, 120);
  }

  // FG: the chiaroscuro frame (drawn OVER actors, under HUD)
  const fg = mkCanvas(DESIGN_W, DESIGN_H);
  {
    const g = fg.g;
    g.fillStyle = "rgba(4,5,9,0.88)";
    // top-left broken arch mass
    g.beginPath();
    g.moveTo(-10, -10);
    g.lineTo(240, -10);
    g.bezierCurveTo(150, 40, 90, 44, 52, 118);
    g.bezierCurveTo(30, 160, 24, 150, -10, 170);
    g.closePath();
    g.fill();
    // top-right mass
    g.beginPath();
    g.moveTo(DESIGN_W + 10, -10);
    g.lineTo(DESIGN_W - 220, -10);
    g.bezierCurveTo(DESIGN_W - 140, 34, DESIGN_W - 80, 40, DESIGN_W - 48, 104);
    g.bezierCurveTo(DESIGN_W - 28, 146, DESIGN_W - 20, 140, DESIGN_W + 10, 156);
    g.closePath();
    g.fill();
    // left edge sliver: a near pillar clipped by the frame
    g.beginPath();
    g.moveTo(-10, 120);
    g.bezierCurveTo(26, 180, 14, 300, 30, 400);
    g.lineTo(-10, 430);
    g.closePath();
    g.fill();
    // right edge sliver
    g.beginPath();
    g.moveTo(DESIGN_W + 10, 140);
    g.bezierCurveTo(DESIGN_W - 22, 210, DESIGN_W - 12, 320, DESIGN_W - 26, 410);
    g.lineTo(DESIGN_W + 10, 430);
    g.closePath();
    g.fill();
  }

  // GLOW: warm torch sprite
  const glow = mkCanvas(96, 96);
  {
    const g = glow.g;
    const rg = g.createRadialGradient(48, 48, 4, 48, 48, 46);
    rg.addColorStop(0, "rgba(255,180,92,0.55)");
    rg.addColorStop(0.5, "rgba(255,150,70,0.18)");
    rg.addColorStop(1, "rgba(255,140,60,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 96, 96);
  }

  return { band: b, far: far.c, mid: mid.c, floor: floor.c, fg: fg.c, glow: glow.c };
}

/** Live warm bits over the far layer: two torch glows with flame ticks. */
export function drawTorches(g: CanvasRenderingContext2D, bake: StageBake, t: number, ox: number, oy: number): void {
  for (let i = 0; i < 2; i++) {
    const cx = (i === 0 ? 210 : 590) + ox;
    const cy = 162 + oy;
    const fl = 0.72 + 0.28 * Math.sin(t * 9 + i * 2.1) * Math.sin(t * 23 + i * 5.7);
    g.globalAlpha = 0.55 * fl + 0.3;
    g.drawImage(bake.glow, cx - 68, cy - 68, 136, 136);
    g.globalAlpha = 1;
    g.fillStyle = PAL.ember;
    g.beginPath();
    g.ellipse(cx, cy, 4, 8 + fl * 3, Math.sin(t * 13 + i) * 0.2, 0, TAU);
    g.fill();
    g.fillStyle = PAL.goldHi;
    g.beginPath();
    g.ellipse(cx, cy + 2, 2, 4 + fl * 2, 0, 0, TAU);
    g.fill();
  }
}

/** Slow fog drift across the stage between mid and floor. */
export function drawFog(g: CanvasRenderingContext2D, t: number): void {
  g.fillStyle = "rgba(70,84,120,0.055)";
  for (let i = 0; i < 2; i++) {
    const x = ((t * (10 + i * 6) + i * 420) % (DESIGN_W + 480)) - 240;
    g.beginPath();
    g.ellipse(x, 400 - i * 36, 220, 34, 0, 0, TAU);
    g.fill();
  }
}

// ── actors ──────────────────────────────────────────────────────────────────

export function drawShadow(g: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.beginPath();
  g.ellipse(x, y + 4, w, w * 0.22, 0, 0, TAU);
  g.fill();
}

/** Paint the hero at local origin = feet. `flat` forces every fill to one
 * color (the flash pass repaints the silhouette white/gold over itself). */
export function paintHero(g: CanvasRenderingContext2D, cls: ClassId, t: number, flat: string | null): void {
  const acc = flat ?? CLASS_ACCENT[cls];
  const body = flat ?? "#161a26";
  const dark = flat ?? "#0e111b";
  const bone = flat ?? PAL.bone;
  const wide = cls === "barbarian" ? 1.22 : cls === "wizard" ? 0.88 : 1;
  const robed = cls === "wizard" || cls === "cleric" || cls === "bard";
  const bob = Math.sin(t * 2.1) * 1.6;
  g.save();
  g.translate(0, bob * 0.4);
  if (robed) {
    // robe: one sweep from shoulders to a wide hem on the floor
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-13 * wide, -86);
    g.bezierCurveTo(-20 * wide, -50, -24 * wide, -18, -20 * wide, 0);
    g.lineTo(20 * wide, 0);
    g.bezierCurveTo(22 * wide, -30, 16 * wide, -60, 12 * wide, -86);
    g.closePath();
    g.fill();
  } else {
    // legs
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(-12 * wide, -40);
    g.lineTo(-14 * wide, 0);
    g.lineTo(-5 * wide, 0);
    g.lineTo(-3 * wide, -38);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(4 * wide, -38);
    g.lineTo(6 * wide, 0);
    g.lineTo(15 * wide, 0);
    g.lineTo(13 * wide, -40);
    g.closePath();
    g.fill();
    // torso
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-15 * wide, -86);
    g.bezierCurveTo(-20 * wide, -66, -16 * wide, -46, -13 * wide, -36);
    g.lineTo(14 * wide, -36);
    g.bezierCurveTo(18 * wide, -52, 18 * wide, -72, 13 * wide, -86);
    g.closePath();
    g.fill();
  }
  // accent sash across the chest
  g.strokeStyle = acc;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-13 * wide, -80);
  g.lineTo(13 * wide, -56);
  g.stroke();
  // head + hood
  g.fillStyle = bone;
  g.beginPath();
  g.arc(0, -95 + bob * 0.3, 9, 0, TAU);
  g.fill();
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, -97 + bob * 0.3, 12, Math.PI * 0.85, Math.PI * 2.2);
  g.lineTo(6, -88 + bob * 0.3);
  g.closePath();
  g.fill();
  // forward arm
  g.strokeStyle = body;
  g.lineWidth = 7;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(6 * wide, -70);
  g.lineTo(23, -56 + bob * 0.6);
  g.stroke();
  // class weapon glyph
  g.lineCap = "round";
  switch (cls) {
    case "barbarian": {
      g.strokeStyle = flat ?? "#6b5540";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(12, -40);
      g.lineTo(38, -96);
      g.stroke();
      g.fillStyle = acc;
      g.beginPath();
      g.moveTo(38, -96);
      g.quadraticCurveTo(58, -88, 52, -66);
      g.quadraticCurveTo(44, -80, 32, -84);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(38, -96);
      g.quadraticCurveTo(18, -106, 12, -122);
      g.quadraticCurveTo(30, -112, 42, -106);
      g.closePath();
      g.fill();
      break;
    }
    case "monk": {
      g.fillStyle = acc;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 0.15 + (i / 5) * Math.PI * 0.5;
        g.beginPath();
        g.arc(-14 + Math.cos(a) * 26, -84 + Math.sin(a) * 26, 3, 0, TAU);
        g.fill();
      }
      g.beginPath();
      g.arc(25, -56 + bob * 0.6, 6, 0, TAU); // leading fist
      g.fill();
      break;
    }
    case "ranger": {
      g.strokeStyle = acc;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(24, -96);
      g.quadraticCurveTo(46, -60, 24, -24);
      g.stroke();
      g.strokeStyle = flat ?? PAL.boneDim;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(24, -96);
      g.lineTo(24, -24);
      g.stroke();
      g.beginPath();
      g.moveTo(14, -60);
      g.lineTo(40, -60);
      g.stroke();
      break;
    }
    case "bard": {
      g.save();
      g.translate(18, -44);
      g.rotate(-0.7);
      g.fillStyle = acc;
      g.beginPath();
      g.ellipse(0, 0, 9, 13, 0, 0, TAU);
      g.fill();
      g.strokeStyle = acc;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, -12);
      g.lineTo(0, -34);
      g.stroke();
      g.strokeStyle = flat ?? PAL.bone;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-3, -6);
      g.lineTo(-1, -30);
      g.moveTo(3, -6);
      g.lineTo(1, -30);
      g.stroke();
      g.restore();
      break;
    }
    case "wizard": {
      g.strokeStyle = flat ?? "#5a4a3a";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(22, -16);
      g.lineTo(27, -104);
      g.stroke();
      g.fillStyle = acc;
      g.beginPath();
      g.arc(27, -110, 6, 0, TAU);
      g.fill();
      g.fillStyle = flat ?? "rgba(120,150,255,0.28)";
      g.beginPath();
      g.arc(27, -110, 11 + Math.sin(t * 4) * 1.5, 0, TAU);
      g.fill();
      break;
    }
    case "cleric": {
      g.strokeStyle = flat ?? "#5a4a3a";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(16, -34);
      g.lineTo(32, -84);
      g.stroke();
      g.fillStyle = acc;
      g.beginPath();
      g.arc(34, -90, 8, 0, TAU);
      g.fill();
      g.strokeStyle = acc;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, -100, 16, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
      break;
    }
  }
  g.restore();
}

const FOE_SCALE: Record<string, number> = {
  boneDragon: 1.55,
  wraith: 1.2,
  wight: 1.12,
  boneKnight: 1.15,
  necromancer: 1.05,
  specter: 1.05,
};
const FOE_FLOATS: Record<string, boolean> = { specter: true, wraith: true };
const FOE_EYE: Record<string, string> = {
  specter: "#58d6f2",
  wraith: "#58d6f2",
  necromancer: "#b07cff",
  boneDragon: "#ffd98a",
};

function skullAt(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, eye: string): void {
  g.fillStyle = col;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.fillRect(x - r * 0.5, y + r * 0.4, r, r * 0.55);
  g.fillStyle = eye;
  g.beginPath();
  g.arc(x - r * 0.38, y - r * 0.05, r * 0.2, 0, TAU);
  g.arc(x + r * 0.38, y - r * 0.05, r * 0.2, 0, TAU);
  g.fill();
}

/** Paint one legion body at local origin = feet, facing left (toward the
 * hero). Grey-teal silhouettes, one signature shape per bestiary id. */
export function paintEnemy(g: CanvasRenderingContext2D, key: string, t: number, flat: string | null): void {
  const main = flat ?? PAL.teal;
  const deep = flat ?? PAL.tealDeep;
  const eye = flat ?? (FOE_EYE[key] || "#ff5340");
  const sc = FOE_SCALE[key] ?? 1;
  const floats = FOE_FLOATS[key] === true;
  const bob = Math.sin(t * (floats ? 1.6 : 2.4)) * (floats ? 5 : 1.5);
  g.save();
  g.scale(sc, sc);
  g.translate(0, floats ? -14 + bob : bob * 0.4);
  switch (key) {
    case "skeleton":
    case "boneArcher": {
      g.strokeStyle = main;
      g.lineWidth = 5;
      g.lineCap = "round";
      g.beginPath(); // spine + legs
      g.moveTo(0, -84);
      g.lineTo(0, -38);
      g.moveTo(0, -38);
      g.lineTo(-8, 0);
      g.moveTo(0, -38);
      g.lineTo(8, 0);
      g.stroke();
      g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        g.beginPath(); // ribs
        g.moveTo(-9, -74 + i * 9);
        g.lineTo(9, -74 + i * 9);
        g.stroke();
      }
      g.beginPath(); // arms
      g.moveTo(0, -76);
      g.lineTo(-16, -54);
      g.moveTo(0, -76);
      g.lineTo(15, -58);
      g.stroke();
      skullAt(g, 0, -94, 8, main, eye);
      if (key === "boneArcher") {
        g.strokeStyle = deep;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(-20, -78);
        g.quadraticCurveTo(-34, -54, -20, -30);
        g.stroke();
        g.strokeStyle = flat ?? PAL.boneDim;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(-20, -78);
        g.lineTo(-20, -30);
        g.stroke();
      } else {
        g.strokeStyle = deep;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(-16, -54);
        g.lineTo(-30, -78);
        g.stroke();
      }
      break;
    }
    case "zombie": {
      g.fillStyle = main;
      g.beginPath(); // hunched mass
      g.moveTo(-18, 0);
      g.bezierCurveTo(-26, -40, -14, -74, 6, -78);
      g.bezierCurveTo(24, -80, 26, -48, 20, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = main;
      g.lineWidth = 7;
      g.lineCap = "round";
      g.beginPath(); // reaching arms
      g.moveTo(-6, -62);
      g.lineTo(-30, -52 + Math.sin(t * 2.4) * 3);
      g.moveTo(-2, -52);
      g.lineTo(-27, -38);
      g.stroke();
      skullAt(g, -2, -84, 8, deep, eye);
      break;
    }
    case "ghoul": {
      g.fillStyle = main;
      g.beginPath(); // low crouch
      g.moveTo(-14, 0);
      g.bezierCurveTo(-24, -26, -10, -52, 8, -50);
      g.bezierCurveTo(26, -48, 24, -18, 16, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = main;
      g.lineWidth = 4;
      g.lineCap = "round";
      g.beginPath(); // long claw arms
      g.moveTo(-8, -40);
      g.lineTo(-30, -12);
      g.moveTo(0, -36);
      g.lineTo(-24, -4);
      g.stroke();
      g.strokeStyle = deep;
      g.lineWidth = 2;
      for (const [cx, cy] of [
        [-30, -12],
        [-24, -4],
      ] as const) {
        for (let k = -1; k <= 1; k++) {
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx - 6, cy + k * 4 + 2);
          g.stroke();
        }
      }
      skullAt(g, -2, -58, 7, main, eye);
      break;
    }
    case "wight": {
      g.fillStyle = main;
      g.beginPath(); // tall cloaked frame
      g.moveTo(-16, 0);
      g.lineTo(-12, -92);
      g.lineTo(12, -92);
      g.lineTo(18, 0);
      g.closePath();
      g.fill();
      g.fillStyle = deep;
      g.beginPath(); // crown spikes
      for (let i = -2; i <= 2; i++) {
        g.moveTo(i * 5 - 2, -104);
        g.lineTo(i * 5, -116);
        g.lineTo(i * 5 + 2, -104);
      }
      g.fill();
      skullAt(g, 0, -100, 9, deep, eye);
      g.strokeStyle = flat ?? PAL.boneDim; // long blade
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-18, -8);
      g.lineTo(-34, -70);
      g.stroke();
      break;
    }
    case "specter": {
      g.globalAlpha *= 0.78;
      g.fillStyle = main;
      g.beginPath(); // tapering shroud with a tattered hem
      g.moveTo(0, -96);
      g.bezierCurveTo(-22, -84, -20, -40, -16, -12);
      g.lineTo(-9, -24);
      g.lineTo(-3, -8);
      g.lineTo(4, -22);
      g.lineTo(10, -6);
      g.bezierCurveTo(18, -44, 18, -84, 0, -96);
      g.closePath();
      g.fill();
      skullAt(g, 0, -86, 8, deep, eye);
      break;
    }
    case "necromancer": {
      g.fillStyle = main;
      g.beginPath(); // robe cone
      g.moveTo(-20, 0);
      g.bezierCurveTo(-14, -50, -10, -78, 0, -88);
      g.bezierCurveTo(10, -78, 14, -50, 20, 0);
      g.closePath();
      g.fill();
      g.fillStyle = deep; // deep hood
      g.beginPath();
      g.arc(0, -90, 11, Math.PI * 0.8, Math.PI * 2.25);
      g.closePath();
      g.fill();
      g.fillStyle = eye;
      g.beginPath();
      g.arc(-3, -90, 2, 0, TAU);
      g.arc(4, -90, 2, 0, TAU);
      g.fill();
      g.strokeStyle = deep; // staff with a skull head
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-22, -4);
      g.lineTo(-26, -100);
      g.stroke();
      skullAt(g, -26, -106, 6, flat ?? PAL.boneDim, eye);
      break;
    }
    case "boneKnight": {
      g.fillStyle = main;
      g.beginPath(); // armored bulk
      g.moveTo(-20, 0);
      g.lineTo(-22, -70);
      g.lineTo(-10, -84);
      g.lineTo(12, -84);
      g.lineTo(22, -68);
      g.lineTo(20, 0);
      g.closePath();
      g.fill();
      g.fillStyle = deep; // helm
      g.fillRect(-9, -100, 20, 18);
      g.fillStyle = eye;
      g.fillRect(-6, -94, 12, 3);
      g.fillStyle = deep; // tower shield toward the hero
      rr(g, -40, -74, 16, 52, 5);
      g.fill();
      g.strokeStyle = flat ?? PAL.boneDim;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(24, -60);
      g.lineTo(38, -100);
      g.stroke();
      break;
    }
    case "wraith": {
      g.fillStyle = main;
      g.beginPath(); // towering shroud
      g.moveTo(0, -108);
      g.bezierCurveTo(-26, -92, -22, -40, -18, -6);
      g.lineTo(-10, -20);
      g.lineTo(-2, -4);
      g.lineTo(6, -18);
      g.lineTo(12, -2);
      g.bezierCurveTo(22, -46, 24, -92, 0, -108);
      g.closePath();
      g.fill();
      g.fillStyle = deep;
      g.beginPath();
      g.arc(0, -96, 10, Math.PI * 0.8, Math.PI * 2.25);
      g.closePath();
      g.fill();
      g.fillStyle = eye;
      g.beginPath();
      g.arc(-3, -96, 2.2, 0, TAU);
      g.arc(4, -96, 2.2, 0, TAU);
      g.fill();
      g.strokeStyle = deep; // scythe
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-16, -6);
      g.lineTo(-30, -104);
      g.stroke();
      g.beginPath();
      g.moveTo(-30, -104);
      g.quadraticCurveTo(-52, -100, -58, -84);
      g.quadraticCurveTo(-48, -94, -30, -96);
      g.closePath();
      g.fillStyle = flat ?? PAL.boneDim;
      g.fill();
      break;
    }
    case "boneDragon": {
      g.fillStyle = main;
      g.beginPath(); // body mass
      g.ellipse(14, -34, 34, 26, -0.15, 0, TAU);
      g.fill();
      g.strokeStyle = main; // neck
      g.lineWidth = 11;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(-6, -48);
      g.quadraticCurveTo(-30, -78, -34, -96);
      g.stroke();
      skullAt(g, -38, -102, 10, flat ?? PAL.bone, eye);
      g.fillStyle = flat ?? PAL.bone; // snout
      g.beginPath();
      g.moveTo(-44, -104);
      g.lineTo(-58, -100);
      g.lineTo(-44, -96);
      g.closePath();
      g.fill();
      g.fillStyle = deep; // wing arc
      g.beginPath();
      g.moveTo(18, -56);
      g.quadraticCurveTo(52, -110, 74, -96);
      g.quadraticCurveTo(58, -84, 48, -56);
      g.closePath();
      g.fill();
      g.strokeStyle = deep; // tail
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(44, -28);
      g.quadraticCurveTo(66, -22, 76, -6);
      g.stroke();
      g.strokeStyle = flat ?? PAL.boneDim; // rib hints
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(12 + i * 8, -34, 16, Math.PI * 0.3, Math.PI * 0.9);
        g.stroke();
      }
      break;
    }
    default: {
      g.fillStyle = main;
      g.beginPath();
      g.ellipse(0, -36, 16, 36, 0, 0, TAU);
      g.fill();
      skullAt(g, 0, -78, 8, deep, eye);
    }
  }
  g.restore();
}

/** Boss gate keepers paint bigger than their bestiary body (theater only;
 * stats are the creature's own). Call sites scale by this and pass boss=true
 * to drawEnemyOverlays so the chrome rides up with the body. */
export const BOSS_SCALE = 1.35;

/** Name, hp bar, block chip, condition pips and the telegraphed intent.
 * `boss` lifts everything to the scaled silhouette and mounts a name plate. */
export function drawEnemyOverlays(g: CanvasRenderingContext2D, en: EnemyState, x: number, y: number, t: number, boss = false): void {
  const sc = (FOE_SCALE[en.key] ?? 1) * (boss ? BOSS_SCALE : 1);
  const top = y - 118 * sc - 16;
  // intent icon, pulsing while telegraphed
  const pulse = 0.68 + 0.32 * Math.sin(t * 4);
  g.globalAlpha = pulse;
  const iy = top - 22;
  if (en.intent === "guard") {
    g.strokeStyle = PAL.teal;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x - 8, iy - 8);
    g.lineTo(x + 8, iy - 8);
    g.lineTo(x + 8, iy + 2);
    g.quadraticCurveTo(x + 8, iy + 10, x, iy + 12);
    g.quadraticCurveTo(x - 8, iy + 10, x - 8, iy + 2);
    g.closePath();
    g.stroke();
  } else {
    const heavy = en.intent === "heavy";
    g.strokeStyle = heavy ? PAL.blood : PAL.bone;
    g.lineWidth = heavy ? 3.5 : 2.5;
    const n = heavy ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const off = heavy ? (k === 0 ? -6 : 6) : 0;
      g.beginPath();
      g.moveTo(x + off - 6, iy - 9);
      g.lineTo(x + off + 6, iy + 9);
      g.stroke();
      g.beginPath();
      g.moveTo(x + off + 1, iy + 2);
      g.lineTo(x + off - 5, iy + 8);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  // name + hp (a boss gets a mounted blood name plate)
  if (boss) {
    const nm = en.name.toUpperCase();
    g.font = font(13, 800);
    const nw = g.measureText(nm).width;
    g.fillStyle = "rgba(10,5,7,0.9)";
    rr(g, x - nw / 2 - 10, top - 18, nw + 20, 20, 4);
    g.fill();
    g.strokeStyle = PAL.bloodDeep;
    g.lineWidth = 1;
    rr(g, x - nw / 2 - 9.5, top - 17.5, nw + 19, 19, 4);
    g.stroke();
    txt(g, nm, x, top - 7, 13, PAL.blood);
  } else {
    txt(g, en.name.toUpperCase(), x, top - 6, 10, PAL.dim, "center", 700);
  }
  const bw = boss ? 96 : 64;
  const pct = Math.max(0, en.hp / en.hpMax);
  g.fillStyle = "#101319";
  rr(g, x - bw / 2, top + 2, bw, 7, 3);
  g.fill();
  g.fillStyle = pct > 0.4 ? "#9c3c34" : PAL.blood;
  if (pct > 0) {
    rr(g, x - bw / 2 + 1, top + 3, Math.max(2, (bw - 2) * pct), 5, 2);
    g.fill();
  }
  if (en.block > 0) {
    g.fillStyle = PAL.steel;
    g.beginPath();
    g.arc(x + bw / 2 + 10, top + 5, 8, 0, TAU);
    g.fill();
    txt(g, String(en.block), x + bw / 2 + 10, top + 6, 10, "#e9edf1");
  }
  // condition pips
  const conds: [string, number, string][] = [
    ["ST", en.conds.stun, PAL.gold],
    ["SL", en.conds.slow, "#6ab6df"],
    ["BR", en.conds.burn, PAL.ember],
    ["WK", en.conds.weaken, "#b07cff"],
    ["FR", en.conds.fear, PAL.blood],
  ];
  let cx = x - bw / 2;
  for (const [label, n, col] of conds) {
    if (n <= 0) continue;
    g.fillStyle = "rgba(10,13,17,0.85)";
    rr(g, cx, top + 12, 22, 11, 3);
    g.fill();
    txt(g, `${label}${n}`, cx + 11, top + 18, 8, col, "center", 700);
    cx += 25;
  }
}

/** Enemy line x-positions by body count (all left of the end-turn band). */
export function enemyX(i: number, n: number): number {
  if (n <= 1) return 520;
  if (n === 2) return i === 0 ? 464 : 592;
  return 432 + i * 104;
}

// ── cards ───────────────────────────────────────────────────────────────────

/** Presentation family: attack = ember-red, skills that generate energy or
 * draw cards = violet "power", everything else = steel-blue. Derived from the
 * card's closed effect union, never hand-listed per card. */
export type CardFamily = "attack" | "power" | "skill";

export function cardFamily(card: Card): CardFamily {
  if (card.kind === "attack") return "attack";
  return card.effects.some((e) => e.k === "energy" || e.k === "draw") ? "power" : "skill";
}

const FAM_STYLE: Record<CardFamily, { edge: string; tint: string; glyph: string }> = {
  attack: { edge: PAL.attackEdge, tint: PAL.attackTint, glyph: PAL.attackGlyph },
  power: { edge: PAL.powerEdge, tint: PAL.powerTint, glyph: PAL.powerGlyph },
  skill: { edge: PAL.skillEdge, tint: PAL.skillTint, glyph: PAL.skillGlyph },
};

/** The authored glyph vocabulary: 12 vector marks, one color, feet-agnostic
 * (centered on cx/cy, half-extent ~s). Painted for cards, relic chips, the
 * boss door and the pickup panel. */
export type GlyphName =
  | "sword"
  | "axe"
  | "arrow"
  | "fist"
  | "shield"
  | "cross"
  | "flame"
  | "bolt"
  | "note"
  | "eye"
  | "swirl"
  | "skull";

export function drawGlyph(g: CanvasRenderingContext2D, name: GlyphName, cx: number, cy: number, s: number, col: string): void {
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = Math.max(2, s * 0.14);
  g.lineCap = "round";
  g.lineJoin = "round";
  switch (name) {
    case "sword": {
      // upright blade, crossguard, grip
      g.beginPath();
      g.moveTo(cx, cy - s * 1.05);
      g.lineTo(cx, cy + s * 0.55);
      g.moveTo(cx - s * 0.6, cy + s * 0.35);
      g.lineTo(cx + s * 0.6, cy + s * 0.35);
      g.moveTo(cx, cy + s * 0.55);
      g.lineTo(cx, cy + s * 0.95);
      g.stroke();
      g.beginPath(); // tip
      g.moveTo(cx - s * 0.16, cy - s * 0.85);
      g.lineTo(cx, cy - s * 1.15);
      g.lineTo(cx + s * 0.16, cy - s * 0.85);
      g.closePath();
      g.fill();
      break;
    }
    case "axe": {
      g.beginPath(); // haft
      g.moveTo(cx - s * 0.65, cy + s);
      g.lineTo(cx + s * 0.45, cy - s * 0.85);
      g.stroke();
      g.beginPath(); // crescent blade
      g.moveTo(cx + s * 0.45, cy - s * 0.85);
      g.quadraticCurveTo(cx + s * 1.05, cy - s * 0.45, cx + s * 0.75, cy + s * 0.15);
      g.quadraticCurveTo(cx + s * 0.55, cy - s * 0.35, cx + s * 0.1, cy - s * 0.55);
      g.closePath();
      g.fill();
      break;
    }
    case "arrow": {
      g.beginPath(); // shaft
      g.moveTo(cx - s * 0.8, cy + s * 0.8);
      g.lineTo(cx + s * 0.7, cy - s * 0.7);
      g.stroke();
      g.beginPath(); // head
      g.moveTo(cx + s * 0.7, cy - s * 0.7);
      g.lineTo(cx + s * 0.25, cy - s * 0.75);
      g.lineTo(cx + s * 0.75, cy - s * 0.25);
      g.closePath();
      g.fill();
      g.beginPath(); // fletching
      g.moveTo(cx - s * 0.55, cy + s * 0.55);
      g.lineTo(cx - s * 0.95, cy + s * 0.45);
      g.moveTo(cx - s * 0.45, cy + s * 0.45);
      g.lineTo(cx - s * 0.55, cy + s * 0.05);
      g.stroke();
      break;
    }
    case "fist": {
      rr(g, cx - s * 0.65, cy - s * 0.55, s * 1.3, s * 1.05, s * 0.3);
      g.fill();
      g.strokeStyle = col;
      g.lineWidth = Math.max(1.5, s * 0.1);
      g.beginPath(); // knuckle notches
      for (let i = -1; i <= 1; i++) {
        g.moveTo(cx + i * s * 0.33, cy - s * 0.55);
        g.lineTo(cx + i * s * 0.33, cy - s * 0.25);
      }
      g.stroke();
      g.beginPath(); // speed ticks
      g.moveTo(cx - s * 1.05, cy - s * 0.15);
      g.lineTo(cx - s * 0.8, cy - s * 0.15);
      g.moveTo(cx - s * 1.05, cy + s * 0.25);
      g.lineTo(cx - s * 0.8, cy + s * 0.25);
      g.stroke();
      break;
    }
    case "shield": {
      g.beginPath();
      g.moveTo(cx - s, cy - s * 0.8);
      g.lineTo(cx + s, cy - s * 0.8);
      g.lineTo(cx + s, cy + s * 0.2);
      g.quadraticCurveTo(cx + s, cy + s, cx, cy + s * 1.15);
      g.quadraticCurveTo(cx - s, cy + s, cx - s, cy + s * 0.2);
      g.closePath();
      g.stroke();
      break;
    }
    case "cross": {
      g.fillRect(cx - s * 0.3, cy - s, s * 0.6, s * 2);
      g.fillRect(cx - s, cy - s * 0.3, s * 2, s * 0.6);
      break;
    }
    case "flame": {
      g.beginPath();
      g.moveTo(cx, cy - s * 1.05);
      g.quadraticCurveTo(cx + s * 0.85, cy - s * 0.15, cx + s * 0.45, cy + s * 0.55);
      g.quadraticCurveTo(cx + s * 0.2, cy + s, cx, cy + s);
      g.quadraticCurveTo(cx - s * 0.2, cy + s, cx - s * 0.45, cy + s * 0.55);
      g.quadraticCurveTo(cx - s * 0.85, cy - s * 0.15, cx, cy - s * 1.05);
      g.fill();
      break;
    }
    case "bolt": {
      g.beginPath();
      g.moveTo(cx + s * 0.35, cy - s);
      g.lineTo(cx - s * 0.45, cy + s * 0.15);
      g.lineTo(cx + s * 0.05, cy + s * 0.15);
      g.lineTo(cx - s * 0.35, cy + s);
      g.lineTo(cx + s * 0.55, cy - s * 0.15);
      g.lineTo(cx + s * 0.05, cy - s * 0.15);
      g.closePath();
      g.fill();
      break;
    }
    case "note": {
      g.beginPath(); // head
      g.ellipse(cx - s * 0.3, cy + s * 0.6, s * 0.42, s * 0.3, -0.35, 0, TAU);
      g.fill();
      g.beginPath(); // stem
      g.moveTo(cx + s * 0.08, cy + s * 0.5);
      g.lineTo(cx + s * 0.08, cy - s * 0.9);
      g.stroke();
      g.beginPath(); // flag
      g.moveTo(cx + s * 0.08, cy - s * 0.9);
      g.quadraticCurveTo(cx + s * 0.75, cy - s * 0.6, cx + s * 0.45, cy - s * 0.05);
      g.quadraticCurveTo(cx + s * 0.5, cy - s * 0.5, cx + s * 0.08, cy - s * 0.55);
      g.closePath();
      g.fill();
      break;
    }
    case "eye": {
      g.beginPath(); // almond
      g.moveTo(cx - s, cy);
      g.quadraticCurveTo(cx, cy - s * 0.85, cx + s, cy);
      g.quadraticCurveTo(cx, cy + s * 0.85, cx - s, cy);
      g.closePath();
      g.stroke();
      g.beginPath(); // pupil
      g.arc(cx, cy, s * 0.28, 0, TAU);
      g.fill();
      break;
    }
    case "swirl": {
      g.beginPath();
      g.arc(cx, cy, s * 0.85, 0.4, TAU - 0.8);
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, s * 0.4, Math.PI, TAU + 1.4);
      g.stroke();
      break;
    }
    case "skull": {
      g.beginPath(); // cranium
      g.arc(cx, cy - s * 0.2, s * 0.72, 0, TAU);
      g.stroke();
      g.beginPath(); // jaw
      g.moveTo(cx - s * 0.38, cy + s * 0.42);
      g.lineTo(cx - s * 0.38, cy + s * 0.85);
      g.lineTo(cx + s * 0.38, cy + s * 0.85);
      g.lineTo(cx + s * 0.38, cy + s * 0.42);
      g.stroke();
      g.beginPath(); // eye pits
      g.arc(cx - s * 0.28, cy - s * 0.22, s * 0.16, 0, TAU);
      g.arc(cx + s * 0.28, cy - s * 0.22, s * 0.16, 0, TAU);
      g.fill();
      break;
    }
  }
}

/** The AUTHORED per-card glyph map. Presentation data only (content.ts stays
 * untouched); every id in content.ts CARDS appears exactly once. Unmapped ids
 * (future cards) fall back by kind in drawCardFrame. */
export const CARD_GLYPH: Record<string, GlyphName> = {
  // barbarian
  bbStrike: "axe",
  bbGuard: "shield",
  bbCleave: "axe",
  bbSmash: "skull",
  bbRage: "flame",
  bbFrenzy: "axe",
  bbQuake: "fist",
  bbHide: "shield",
  bbLust: "bolt",
  // monk
  mkPalm: "fist",
  mkDodge: "swirl",
  mkFlurry: "fist",
  mkTempest: "swirl",
  mkChi: "bolt",
  mkMantis: "eye",
  mkWhirl: "swirl",
  mkSerenity: "cross",
  mkHundred: "fist",
  // ranger
  rgShot: "arrow",
  rgBrace: "shield",
  rgPin: "arrow",
  rgSnare: "swirl",
  rgTwin: "arrow",
  rgHead: "eye",
  rgCamo: "eye",
  rgPoison: "skull",
  rgBarrage: "arrow",
  // bard
  bdJab: "sword",
  bdDirge: "note",
  bdInspire: "note",
  bdCadence: "note",
  bdLull: "skull",
  bdMock: "note",
  bdFinale: "sword",
  bdEncore: "note",
  bdShanty: "shield",
  // wizard
  wzBolt: "flame",
  wzWard: "shield",
  wzNova: "swirl",
  wzIgnite: "flame",
  wzStorm: "bolt",
  wzRay: "bolt",
  wzMirror: "shield",
  wzSiphon: "swirl",
  wzMeteor: "flame",
  // cleric
  clMace: "sword",
  clShield: "shield",
  clWord: "cross",
  clSmite: "bolt",
  clTurn: "cross",
  clJudge: "eye",
  clPrayer: "cross",
  clBulwark: "shield",
  clBanish: "swirl",
  // neutral
  ntSplit: "axe",
  ntTower: "shield",
  ntAdren: "bolt",
  ntBandage: "cross",
  ntSweep: "sword",
  ntFocus: "eye",
  ntOil: "flame",
  ntBash: "shield",
};

const COND_WORD: Record<string, string> = {
  slow: "SLOW",
  stun: "STUN",
  burn: "BURN",
  weaken: "WEAKEN",
  fear: "FEAR",
};

/** The derived rules line: ONE function walking the closed Effect union, zero
 * hand-written per-card strings. "WPN" = the hero's weapon dice. */
export function effectSummary(card: Card): string {
  const parts: string[] = [];
  for (const e of card.effects) {
    if (e.k === "dmg") {
      let seg = e.dice ? `${e.dice.count}d${e.dice.sides}${e.dice.bonus > 0 ? `+${e.dice.bonus}` : ""}` : "WPN";
      if (e.addDice > 0) seg += `+${e.addDice}d`;
      if (e.addBonus > 0) seg += `+${e.addBonus}`;
      if (e.hits > 1) seg += ` x${e.hits}`;
      if (e.all) seg += " ALL";
      if (e.adv === 1) seg += " ADV";
      else if (e.adv === -1) seg += " DIS";
      parts.push(seg);
    } else if (e.k === "block") parts.push(`BLOCK ${e.n}`);
    else if (e.k === "draw") parts.push(`DRAW ${e.n}`);
    else if (e.k === "heal") parts.push(`HEAL ${e.n}`);
    else if (e.k === "energy") parts.push(`+${e.n} ENERGY`);
    else parts.push(`${COND_WORD[e.cond] ?? String(e.cond).toUpperCase()} ${e.ticks}${e.all ? " ALL" : ""}`);
  }
  let line = parts.join(" · ");
  if (card.hpCost > 0) line += ` · ${card.hpCost} HP`;
  return line;
}

// ── perks (relics + boons) made visible ─────────────────────────────────────

/** Derived perk line from the flat integer counters - ONE function, zero
 * hand-written per-perk strings (same law as effectSummary). */
export function perkSummary(perk: Perk): string {
  const parts: string[] = [];
  if (perk.bonusDmg > 0) parts.push(`+${perk.bonusDmg} DMG`);
  if (perk.bonusAtk > 0) parts.push(`+${perk.bonusAtk} HIT`);
  if (perk.turnBlock > 0) parts.push(`+${perk.turnBlock} BLOCK/TURN`);
  if (perk.turnHeal > 0) parts.push(`+${perk.turnHeal} HP/TURN`);
  if (perk.victoryHeal > 0) parts.push(`+${perk.victoryHeal} HP ON WIN`);
  if (perk.hpMaxUp > 0) parts.push(`+${perk.hpMaxUp} MAX HP`);
  if (perk.healNow > 0) parts.push(`HEAL ${perk.healNow} NOW`);
  if (perk.keen > 0) parts.push(`CRIT ${20 - perk.keen}+`);
  return parts.join(" · ");
}

/** Authored glyph per perk id (presentation data; content.ts untouched). */
export const PERK_GLYPH: Record<string, GlyphName> = {
  rlEmber: "flame",
  rlFang: "sword",
  rlAegis: "shield",
  rlTome: "cross",
  rlBoots: "cross",
  rlSkull: "skull",
  boonSharp: "sword",
  boonStone: "skull",
  boonWard: "shield",
  boonKeen: "eye",
};

/** Resolve a pickup id (relic or boon) to its Perk row, or null. */
export function perkById(id: string): Perk | null {
  return BOONS[id] ?? RELICS.find((r) => r.id === id) ?? null;
}

export interface CardOpt {
  lit: boolean;
  hover: boolean;
  enter: number; // 0..1 slide-in
  alpha: number;
}

export function drawCardFrame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, card: Card, o: CardOpt): void {
  const rise = o.hover ? 8 : 0;
  const slide = (1 - o.enter) * 26;
  const yy = y - rise + slide;
  const fam = FAM_STYLE[cardFamily(card)];
  g.save();
  g.globalAlpha = o.alpha * (o.lit ? 1 : 0.45) * o.enter;
  if (o.lit && o.hover) {
    g.shadowColor = "rgba(240,179,64,0.55)";
    g.shadowBlur = 14;
  }
  g.fillStyle = PAL.cardBg;
  rr(g, x, yy, w, h, 7);
  g.fill();
  g.shadowBlur = 0;
  // family tint panel
  g.fillStyle = fam.tint;
  rr(g, x + 4, yy + 4, w - 8, h - 26, 5);
  g.fill();
  // frame edge (family hue; gold only on the hot hover)
  g.strokeStyle = o.lit ? (o.hover ? PAL.gold : fam.edge) : "#252a36";
  g.lineWidth = o.hover ? 2 : 1.5;
  rr(g, x + 0.5, yy + 0.5, w - 1, h - 1, 7);
  g.stroke();
  // glyph (authored per-card identity; unmapped ids fall back by kind),
  // lifted slightly to clear the derived rules line beneath it
  const glyph = CARD_GLYPH[card.id] ?? (card.kind === "attack" ? "sword" : "swirl");
  drawGlyph(g, glyph, x + w / 2, yy + (h - 26) / 2 - 4, Math.min(w, h) * 0.145, fam.glyph);
  // derived rules line between glyph and name, auto-shrunk to fit
  const summary = effectSummary(card);
  let spx = w > 150 ? 10 : 8;
  g.font = font(spx, 700);
  const sw = g.measureText(summary).width;
  if (sw > w - 14) spx = Math.max(6, Math.floor((spx * (w - 14)) / sw));
  txt(g, summary, x + w / 2, yy + h - 30, spx, o.lit ? fam.glyph : PAL.dim, "center", 700);
  // cost pip
  g.fillStyle = "#0d1017";
  g.beginPath();
  g.arc(x + 13, yy + 13, 10, 0, TAU);
  g.fill();
  g.strokeStyle = PAL.gold;
  g.lineWidth = 1.5;
  g.stroke();
  txt(g, String(card.cost), x + 13, yy + 14, 12, PAL.gold);
  // hp tax droplet
  if (card.hpCost > 0) {
    g.fillStyle = PAL.blood;
    g.beginPath();
    g.moveTo(x + w - 13, yy + 5);
    g.quadraticCurveTo(x + w - 5, yy + 15, x + w - 13, yy + 20);
    g.quadraticCurveTo(x + w - 21, yy + 15, x + w - 13, yy + 5);
    g.fill();
    txt(g, String(card.hpCost), x + w - 13, yy + 14, 9, "#fff");
  }
  // name strip
  txt(g, card.name.toUpperCase(), x + w / 2, yy + h - 12, w > 150 ? 13 : 11, o.lit ? PAL.text : PAL.dim, "center", 700);
  g.restore();
}

export function drawEmptySlot(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.strokeStyle = "rgba(61,68,84,0.3)";
  g.lineWidth = 1;
  rr(g, x + 0.5, y + 0.5, w - 1, h - 1, 7);
  g.stroke();
}

/** The five fixed hand slots + band furniture. hoverSlot -1 = none. */
export function drawCardBand(g: CanvasRenderingContext2D, s: GauntletState, hoverSlot: number, enterT: number, myTurn: boolean): void {
  g.fillStyle = PAL.bandBg;
  g.fillRect(0, BAND_Y, DESIGN_W, DESIGN_H - BAND_Y);
  g.strokeStyle = "#1e2534";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, BAND_Y);
  g.lineTo(DESIGN_W, BAND_Y);
  g.stroke();
  const sw = DESIGN_W / CARD_SLOTS;
  const inCombat = s.phase === "combat";
  for (let i = 0; i < CARD_SLOTS; i++) {
    const x = i * sw + 10;
    const y = BAND_Y + 12;
    const w = sw - 20;
    const h = DESIGN_H - BAND_Y - 22;
    const id = inCombat && i < s.hand.length ? s.hand[i] : "";
    const card = id ? CARD_INDEX[id] : undefined;
    if (!card) {
      drawEmptySlot(g, x, y, w, h);
      continue;
    }
    const afford = card.cost <= s.energy && (card.hpCost === 0 || s.hp > card.hpCost);
    const enter = Math.max(0, Math.min(1, (enterT - i * 0.06) / 0.22));
    drawCardFrame(g, x, y, w, h, card, {
      lit: afford && myTurn,
      hover: myTurn && hoverSlot === i && afford,
      enter,
      alpha: myTurn ? 1 : 0.55,
    });
  }
}

/** The end-turn zone: the whole right band above the card band belongs to
 * the sim; this paints the banner that names it. urgency = graceF/TURN_GRACE. */
export function drawEndTurn(g: CanvasRenderingContext2D, active: boolean, hover: boolean, urgency: number, t: number): void {
  if (hover && active) {
    g.fillStyle = "rgba(240,179,64,0.05)";
    g.fillRect(END_PX, 0, DESIGN_W - END_PX, BAND_Y);
  }
  const x = END_PX + 10;
  const y = 196;
  const w = DESIGN_W - END_PX - 20;
  const h = 58;
  g.save();
  g.globalAlpha = active ? 1 : 0.35;
  g.fillStyle = "rgba(11,14,20,0.9)";
  rr(g, x, y, w, h, 8);
  g.fill();
  const hot = active && (hover || urgency > 0.6);
  g.strokeStyle = hot ? PAL.gold : PAL.cardEdge;
  g.lineWidth = hover && active ? 2.5 : 1.5;
  rr(g, x + 0.5, y + 0.5, w - 1, h - 1, 8);
  g.stroke();
  txt(g, "END", x + w / 2, y + 20, 17, hot ? PAL.gold : PAL.text);
  txt(g, "TURN", x + w / 2, y + 40, 17, hot ? PAL.gold : PAL.text);
  g.restore();
  // hesitation warning: the AFK clock made visible in its last stretch
  if (active && urgency > 0.55) {
    const left = Math.max(0, 1 - urgency);
    g.fillStyle = "rgba(11,14,20,0.85)";
    rr(g, x - 2, y + h + 8, w + 4, 26, 6);
    g.fill();
    g.fillStyle = PAL.bloodDeep;
    rr(g, x + 2, y + h + 12, (w - 4) * left, 5, 2);
    g.fill();
    const blink = 0.6 + 0.4 * Math.sin(t * 8);
    g.globalAlpha = blink;
    txt(g, "THE LEGION STIRS", x + w / 2, y + h + 26, 9, PAL.blood, "center", 700);
    g.globalAlpha = 1;
  }
}

// ── choice furniture (node doors + draft offers + events) ───────────────────

const NODE_LABEL: Record<string, string> = {
  fight: "FIGHT",
  elite: "ELITE",
  treasure: "TREASURE",
  shrine: "SHRINE",
  rest: "REST",
  boss: "BOSS",
};

function nodeIcon(g: CanvasRenderingContext2D, node: string, cx: number, cy: number): void {
  g.lineCap = "round";
  if (node === "fight" || node === "elite") {
    g.strokeStyle = node === "elite" ? PAL.blood : PAL.bone;
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(cx - 16, cy + 16);
    g.lineTo(cx + 16, cy - 16);
    g.moveTo(cx + 16, cy + 16);
    g.lineTo(cx - 16, cy - 16);
    g.stroke();
    if (node === "elite") {
      skullAt(g, cx, cy - 26, 8, PAL.bone, PAL.blood);
    }
  } else if (node === "treasure") {
    g.fillStyle = "#6b5540";
    rr(g, cx - 18, cy - 6, 36, 20, 3);
    g.fill();
    g.fillStyle = "#7e6650";
    g.beginPath();
    g.moveTo(cx - 18, cy - 6);
    g.quadraticCurveTo(cx, cy - 22, cx + 18, cy - 6);
    g.closePath();
    g.fill();
    g.fillStyle = PAL.gold;
    g.fillRect(cx - 3, cy - 8, 6, 8);
  } else if (node === "shrine") {
    g.fillStyle = "#3a3550";
    g.beginPath();
    g.moveTo(cx - 10, cy + 18);
    g.lineTo(cx - 5, cy - 20);
    g.lineTo(cx + 5, cy - 20);
    g.lineTo(cx + 10, cy + 18);
    g.closePath();
    g.fill();
    g.fillStyle = "#b07cff";
    g.beginPath();
    g.moveTo(cx, cy - 24);
    g.lineTo(cx + 5, cy - 17);
    g.lineTo(cx, cy - 10);
    g.lineTo(cx - 5, cy - 17);
    g.closePath();
    g.fill();
  } else if (node === "rest") {
    g.strokeStyle = "#6b5540";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx - 14, cy + 14);
    g.lineTo(cx + 14, cy + 6);
    g.moveTo(cx + 14, cy + 14);
    g.lineTo(cx - 14, cy + 6);
    g.stroke();
    g.fillStyle = PAL.ember;
    g.beginPath();
    g.moveTo(cx, cy - 22);
    g.quadraticCurveTo(cx + 12, cy - 6, cx, cy + 6);
    g.quadraticCurveTo(cx - 12, cy - 6, cx, cy - 22);
    g.fill();
    g.fillStyle = PAL.goldHi;
    g.beginPath();
    g.moveTo(cx, cy - 10);
    g.quadraticCurveTo(cx + 5, cy - 2, cx, cy + 4);
    g.quadraticCurveTo(cx - 5, cy - 2, cx, cy - 10);
    g.fill();
  }
}

/** One node door in a fixed mid third. `node` is the sim's NodeSlot string
 * ("" = collapsed). hover in [0,1]. */
export function drawDoorPanel(g: CanvasRenderingContext2D, slot: number, node: string, hover: number): void {
  const cx = Math.round(((slot + 0.5) / 3) * DESIGN_W);
  const cy = 258;
  const w = 186;
  const h = 232;
  const lift = hover * 6;
  const x = cx - w / 2;
  const y = cy - h / 2 - lift;
  g.save();
  if (node === "") {
    // collapsed arch: rubble, no door
    g.globalAlpha = 0.4;
    g.strokeStyle = "#2a3145";
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(x + 16, y + h);
    g.lineTo(x + 16, y + 70);
    g.arc(cx, y + 70, w / 2 - 16, Math.PI, Math.PI * 1.4);
    g.stroke();
    g.fillStyle = "#1a1f2c";
    for (let i = 0; i < 5; i++) {
      const rx = x + 20 + h01(slot * 9 + i) * (w - 60);
      const rs = 12 + h01(i * 3 + slot) * 18;
      g.beginPath();
      g.ellipse(rx, y + h - 12 - h01(i) * 14, rs, rs * 0.6, h01(i * 7) * 0.8, 0, TAU);
      g.fill();
    }
    txt(g, "COLLAPSED", cx, y + h - 26, 11, "#454b58", "center", 700);
    g.restore();
    return;
  }
  const elite = node === "elite";
  const boss = node === "boss";
  // stone arch frame (the boss gate runs blood through the stone)
  g.fillStyle = boss ? (hover > 0 ? "#33161c" : "#261016") : hover > 0 ? "#232b3c" : "#1c2230";
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y + 64);
  g.arc(cx, y + 64, w / 2, Math.PI, 0);
  g.lineTo(x + w, y + h);
  g.closePath();
  g.fill();
  g.strokeStyle = boss ? (hover > 0 ? PAL.blood : PAL.bloodDeep) : elite ? PAL.bloodDeep : hover > 0 ? PAL.gold : "#333c50";
  g.lineWidth = boss ? 3 : hover > 0 ? 2.5 : 2;
  g.stroke();
  // dark doorway
  g.fillStyle = boss ? "#120609" : "#0a0c12";
  g.beginPath();
  g.moveTo(x + 14, y + h - 10);
  g.lineTo(x + 14, y + 70);
  g.arc(cx, y + 70, w / 2 - 14, Math.PI, 0);
  g.lineTo(x + w - 14, y + h - 10);
  g.closePath();
  g.fill();
  if (boss) {
    // the skull watches from the dark
    drawGlyph(g, "skull", cx, y + 106, 26, PAL.blood);
    // dripping seams down the arch face
    g.strokeStyle = PAL.bloodDeep;
    g.lineWidth = 2;
    for (const dx of [-52, 0, 52]) {
      g.beginPath();
      g.moveTo(cx + dx, y + 22 + Math.abs(dx) * 0.3);
      g.lineTo(cx + dx, y + 44 + Math.abs(dx) * 0.3 + h01(dx + 5) * 10);
      g.stroke();
    }
  } else {
    nodeIcon(g, node, cx, y + 108);
  }
  // label banner
  g.fillStyle = "rgba(11,14,20,0.92)";
  rr(g, cx - 62, y + h - 46, 124, 28, 5);
  g.fill();
  g.strokeStyle = boss || elite ? PAL.blood : "#333c50";
  g.lineWidth = 1;
  rr(g, cx - 61.5, y + h - 45.5, 123, 27, 5);
  g.stroke();
  txt(g, NODE_LABEL[node] ?? "", cx, y + h - 31, 15, boss || elite ? PAL.blood : node === "treasure" ? PAL.gold : PAL.text);
  g.restore();
}

/** Centered header + auto-pick grace bar for choice phases. */
export function drawChoiceHeader(g: CanvasRenderingContext2D, title: string, sub: string, grace01: number): void {
  txt(g, title, DESIGN_W / 2, 84, 26, PAL.text);
  if (sub) txt(g, sub, DESIGN_W / 2, 108, 12, PAL.dim, "center", 700);
  const w = 200;
  g.fillStyle = "rgba(139,133,119,0.25)";
  rr(g, DESIGN_W / 2 - w / 2, 122, w, 3, 1.5);
  g.fill();
  g.fillStyle = PAL.gold;
  rr(g, DESIGN_W / 2 - w / 2, 122, Math.max(0, w * grace01), 3, 1.5);
  g.fill();
}

export function draftGrace(s: GauntletState): number {
  return Math.max(0, 1 - s.graceF / DRAFT_GRACE);
}
export function choiceGrace(s: GauntletState): number {
  return Math.max(0, 1 - s.graceF / CHOICE_GRACE);
}

/** The rest/treasure/shrine banner panel (event phase). */
export function drawEventPanel(g: CanvasRenderingContext2D, tag: string, t: number): void {
  const w = 380;
  const h = 200;
  const x = (DESIGN_W - w) / 2;
  const y = 190;
  g.fillStyle = "rgba(9,11,16,0.94)";
  rr(g, x, y, w, h, 10);
  g.fill();
  g.strokeStyle = PAL.cardEdge;
  g.lineWidth = 1.5;
  rr(g, x + 0.5, y + 0.5, w - 1, h - 1, 10);
  g.stroke();
  const isRest = tag === "rest";
  const boon = BOONS[tag];
  const relic = !isRest && !boon ? RELICS.find((r) => r.id === tag) : undefined;
  const title = isRest ? "A MOMENT'S REST" : relic ? "SHRINE RELIC" : "TREASURE";
  const name = isRest ? "You bind your wounds by the fire" : (boon?.name ?? relic?.name ?? "").toUpperCase();
  nodeIcon(g, isRest ? "rest" : relic ? "shrine" : "treasure", DESIGN_W / 2, y + 66);
  txt(g, title, DESIGN_W / 2, y + 112, 20, isRest ? PAL.ember : PAL.gold);
  const nameY = isRest ? 140 : 136;
  txt(g, name, DESIGN_W / 2, y + nameY, isRest ? 12 : 16, PAL.text, "center", 700);
  // the perk's own glyph + derived counter line (what this pickup actually does)
  const perk = boon ?? relic;
  if (perk) {
    g.font = font(16, 700);
    const nw = g.measureText(name).width;
    drawGlyph(g, PERK_GLYPH[perk.id] ?? "swirl", DESIGN_W / 2 - nw / 2 - 18, y + nameY, 8, PAL.gold);
    txt(g, perkSummary(perk), DESIGN_W / 2, y + 158, 11, PAL.dim, "center", 700);
  }
  const blink = 0.5 + 0.5 * Math.sin(t * 5);
  g.globalAlpha = 0.4 + 0.6 * blink;
  txt(g, "PRESS SPACE", DESIGN_W / 2, y + 176, 11, PAL.dim, "center", 700);
  g.globalAlpha = 1;
}

// ── the d20 ─────────────────────────────────────────────────────────────────

export const DIE_HIT = 0;
export const DIE_CRIT = 1;
export const DIE_MISS = 2;
export const DIE_NAT1 = 3;
export const DIE_FOE_HIT = 4;
export const DIE_FOE_MISS = 5;

/** Rim hue law (dice ownership pass): every kind reads at a glance and no two
 * kinds share a family. Player nat 1 = DEEP CRIMSON (#8e1f1f family); the
 * legion hitting you = HOSTILE RUST (#c96a2e family; the #ff5c48 family stays
 * reserved hostile-red and is deliberately NOT used here); the legion missing
 * = light WARM BONE grey, lightened well away from the player's cool
 * mid-grey miss. */
const DIE_COL: readonly { rim: string; face: string; num: string; glow: string }[] = [
  { rim: "#59d98c", face: "#12241c", num: "#a8f2c8", glow: "rgba(89,217,140,0.35)" }, // hit
  { rim: "#f0b340", face: "#241c0e", num: "#ffe2a0", glow: "rgba(240,179,64,0.5)" }, // crit
  { rim: "#6c7484", face: "#171a20", num: "#9aa2b0", glow: "rgba(0,0,0,0)" }, // miss (cool grey)
  { rim: "#8e1f1f", face: "#1c0a0a", num: "#d98a80", glow: "rgba(142,31,31,0.45)" }, // nat 1 (deep crimson)
  { rim: "#c96a2e", face: "#201209", num: "#f2c49a", glow: "rgba(201,106,46,0.3)" }, // the legion hits you (rust)
  { rim: "#9a917c", face: "#191713", num: "#c4bba6", glow: "rgba(0,0,0,0)" }, // the legion misses (warm bone)
];

/** The star of the show. `settle01` < 1 = still flickering (caller feeds a
 * random face); at 1 the die has landed on `face` with a pop + glow.
 * `opts.label` names the roller under the die ("YOU" / the enemy's name);
 * `opts.accent` colors that label (the class accent for hero dice). */
export function drawD20(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  face: number,
  kind: number,
  settle01: number,
  alpha: number,
  pop: number,
  opts?: { accent?: string; label?: string },
): void {
  const col = DIE_COL[kind] ?? DIE_COL[DIE_MISS];
  const settled = settle01 >= 1;
  const scale = 1 + (settled ? pop * 0.32 : 0);
  const wob = settled ? 0 : Math.sin(settle01 * 40) * 0.12;
  g.save();
  g.globalAlpha = alpha;
  g.translate(Math.round(x), Math.round(y));
  g.rotate(wob);
  g.scale(scale, scale);
  if (settled && col.glow !== "rgba(0,0,0,0)") {
    g.fillStyle = col.glow;
    for (let i = 3; i >= 1; i--) {
      g.globalAlpha = alpha * 0.16 * i * (0.5 + pop * 0.5);
      g.beginPath();
      g.arc(0, 0, r * (1.1 + i * 0.28), 0, TAU);
      g.fill();
    }
    g.globalAlpha = alpha;
  }
  // hexagon body (pointy top)
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * TAU;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = col.face;
  g.fill();
  g.strokeStyle = col.rim;
  g.lineWidth = Math.max(2, r * 0.09);
  g.stroke();
  // front facet: the inscribed triangle
  g.strokeStyle = col.rim;
  g.globalAlpha = alpha * 0.45;
  g.lineWidth = Math.max(1, r * 0.05);
  g.beginPath();
  g.moveTo(0, -r);
  g.lineTo(Math.cos(Math.PI / 6) * r, Math.sin(Math.PI / 6) * r);
  g.lineTo(-Math.cos(Math.PI / 6) * r, Math.sin(Math.PI / 6) * r);
  g.closePath();
  g.stroke();
  g.globalAlpha = alpha;
  txt(g, String(face), 0, r * 0.08, r * 0.95, col.num);
  g.restore();
  // roller label under the die (steady: outside the wobble/pop transform)
  if (opts?.label) {
    const px = Math.max(8, Math.round(r * 0.36));
    const ly = y + r * 1.3 + px * 0.7;
    g.save();
    g.globalAlpha = alpha * 0.92;
    g.font = font(px, 700);
    const lw = g.measureText(opts.label).width;
    g.fillStyle = "rgba(5,6,10,0.72)";
    rr(g, x - lw / 2 - 4, ly - px * 0.7, lw + 8, px * 1.4, 3);
    g.fill();
    txt(g, opts.label, x, ly, px, opts.accent ?? PAL.dim, "center", 700);
    g.restore();
  }
}

// ── HUD ─────────────────────────────────────────────────────────────────────

export function drawHud(g: CanvasRenderingContext2D, s: GauntletState, t: number): void {
  // hp bar
  const bw = 208;
  g.fillStyle = "rgba(9,11,16,0.85)";
  rr(g, 14, 12, bw + 4, 22, 5);
  g.fill();
  const pct = Math.max(0, s.hp / s.hpMax);
  g.fillStyle = "#101319";
  rr(g, 16, 14, bw, 18, 4);
  g.fill();
  if (pct > 0) {
    g.fillStyle = pct > 0.35 ? "#9c3c34" : PAL.blood;
    rr(g, 17, 15, Math.max(2, (bw - 2) * pct), 16, 3);
    g.fill();
  }
  txt(g, `HP ${s.hp}/${s.hpMax}`, 24, 24, 12, PAL.text, "left", 700);
  // block chip
  if (s.block > 0) {
    g.fillStyle = PAL.steel;
    g.beginPath();
    g.moveTo(240, 12);
    g.lineTo(258, 12);
    g.lineTo(258, 24);
    g.quadraticCurveTo(258, 32, 249, 35);
    g.quadraticCurveTo(240, 32, 240, 24);
    g.closePath();
    g.fill();
    txt(g, String(s.block), 249, 23, 12, "#0d1017");
  }
  // energy pips
  const pips = Math.max(3, Math.min(6, s.energy));
  for (let i = 0; i < pips; i++) {
    const cx = 24 + i * 22;
    const cy = 48;
    const on = i < s.energy;
    g.fillStyle = on ? PAL.gold : "rgba(240,179,64,0.12)";
    g.beginPath();
    g.moveTo(cx, cy - 8);
    g.lineTo(cx + 7, cy);
    g.lineTo(cx, cy + 8);
    g.lineTo(cx - 7, cy);
    g.closePath();
    g.fill();
    if (!on) {
      g.strokeStyle = "rgba(240,179,64,0.35)";
      g.lineWidth = 1;
      g.stroke();
    }
  }
  // relic belt: the run's pickups as glyph chips under the energy pips
  // (relics gold, boons bone; duplicates collapse to xN; empty draws nothing)
  const beltIds: string[] = [];
  const beltN: number[] = [];
  const pushBelt = (id: string): void => {
    const i = beltIds.indexOf(id);
    if (i >= 0) beltN[i] += 1;
    else {
      beltIds.push(id);
      beltN.push(1);
    }
  };
  for (const id of s.relics) pushBelt(id);
  for (const id of s.boons) pushBelt(id);
  let bx = 16;
  for (let i = 0; i < beltIds.length && bx <= 320; i++) {
    const id = beltIds[i];
    const isRelic = !BOONS[id];
    g.fillStyle = "rgba(9,11,16,0.8)";
    rr(g, bx, 62, 20, 20, 4);
    g.fill();
    g.strokeStyle = isRelic ? "rgba(240,179,64,0.5)" : "rgba(139,133,119,0.4)";
    g.lineWidth = 1;
    rr(g, bx + 0.5, 62.5, 19, 19, 4);
    g.stroke();
    drawGlyph(g, PERK_GLYPH[id] ?? "swirl", bx + 10, 72, 6, isRelic ? PAL.gold : PAL.bone);
    if (beltN[i] > 1) txt(g, `x${beltN[i]}`, bx + 22, 62, 8, PAL.gold, "right", 700);
    bx += 24;
  }
  // floor + score, top right
  txt(g, `FLOOR ${s.floor + 1}`, DESIGN_W - 16, 24, 21, PAL.text, "right");
  txt(g, `SCORE ${gauntletScore(s)}`, DESIGN_W - 16, 46, 13, PAL.gold, "right", 700);
  // the next gate, always on and dim: which named horror waits, and where.
  // The floor NUMBER shown matches the FLOOR counter above (internal index
  // + 1), so the promise lands exactly when the counter says it will.
  // gate math in DISPLAYED floors (the gate fires on internal index 9/19/29)
  const gateDisp = Math.ceil((s.floor + 1) / 10) * 10;
  txt(g, `${bossFor(gateDisp - 1).name} AWAITS AT FLOOR ${gateDisp}`, DESIGN_W - 16, 62, 9, "rgba(139,133,119,0.75)", "right", 700);
  // deck counts above the band (combat only)
  if (s.phase === "combat") {
    txt(g, `DECK ${s.drawPile.length} · DISCARD ${s.discard.length}`, 16, BAND_Y - 12, 11, PAL.dim, "left", 700);
    // turn state
    if (s.sub === "hero" && s.busyF === 0) {
      txt(g, "YOUR TURN", DESIGN_W / 2, 24, 13, PAL.gold, "center", 800);
    } else if (s.sub === "units") {
      const blink = 0.55 + 0.45 * Math.sin(t * 6);
      g.globalAlpha = blink;
      txt(g, "THE LEGION MOVES", DESIGN_W / 2, 24, 13, PAL.blood, "center", 800);
      g.globalAlpha = 1;
    }
  }
}

export function heroGraceUrgency(s: GauntletState): number {
  if (s.phase !== "combat" || s.sub !== "hero") return 0;
  return s.graceF / TURN_GRACE;
}

/** One-time first-run hint line, dim, parked just above the card band. The
 * pages own WHEN (localStorage-gated, see fx.ts); this only paints. */
export function drawHintLine(g: CanvasRenderingContext2D, text: string): void {
  g.font = font(11, 700);
  const w = g.measureText(text).width;
  g.fillStyle = "rgba(9,11,16,0.78)";
  rr(g, DESIGN_W / 2 - w / 2 - 10, 442, w + 20, 20, 5);
  g.fill();
  txt(g, text, DESIGN_W / 2, 452, 11, PAL.dim, "center", 700);
}

// ── banners + overlays ──────────────────────────────────────────────────────

/** Fade-in/out center banner; t runs 0..life (2.2s). */
export function drawBanner(g: CanvasRenderingContext2D, text: string, sub: string, t: number, color: string): void {
  const life = 2.2;
  if (t <= 0 || t >= life) return;
  const a = Math.min(1, t / 0.18) * Math.min(1, (life - t) / 0.4);
  g.save();
  g.globalAlpha = a * 0.75;
  g.fillStyle = "#05060a";
  const w = 460;
  rr(g, (DESIGN_W - w) / 2, 128, w, sub ? 64 : 48, 6);
  g.fill();
  g.globalAlpha = a;
  txt(g, text, DESIGN_W / 2, 154, 25, color);
  if (sub) txt(g, sub, DESIGN_W / 2, 178, 12, PAL.dim, "center", 700);
  g.restore();
}

export function drawDeadOverlay(g: CanvasRenderingContext2D, score: number, floors: number, kills: number, t: number): void {
  const a = Math.min(1, t / 0.9);
  g.fillStyle = `rgba(8,4,6,${0.84 * a})`;
  g.fillRect(0, 0, DESIGN_W, DESIGN_H);
  if (a < 0.35) return;
  const b = Math.min(1, (t - 0.25) / 0.6);
  g.globalAlpha = b;
  txt(g, "THE GAUNTLET CLAIMS YOU", DESIGN_W / 2, 218, 32, PAL.blood);
  txt(g, String(score), DESIGN_W / 2, 282, 52, PAL.gold);
  txt(g, `FLOORS ${floors} · KILLS ${kills}`, DESIGN_W / 2, 330, 14, PAL.dim, "center", 700);
  if (t > 1.1) {
    const blink = 0.5 + 0.5 * Math.sin(t * 4);
    g.globalAlpha = b * (0.4 + 0.6 * blink);
    txt(g, "TAP OR PRESS SPACE TO RISE AGAIN", DESIGN_W / 2, 386, 13, PAL.text, "center", 700);
  }
  g.globalAlpha = 1;
}
