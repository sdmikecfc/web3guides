/**
 * HORDE DRAW - every painter the client composits. Pure presentation:
 * nothing here reads sim RNG or mutates sim state; every function takes
 * plain numbers/state and paints. The Diablo-II loot-crawl read: a painted
 * flagstone room baked once per chunk, raised wall blocks with a top/side
 * face and an AO line at floor contact, warm pulsing torch sconces, keyed
 * cutout sprites with vector fallbacks (try-image-else-vector, the S6 art
 * law), rarity-colored loot beams, and the hp/mana liquid orbs.
 *
 * COORDINATES: a fixed 960x640 design space = the sim's authored room, so
 * the camera IS the room. Sim positions arrive in FINE units; painters take
 * px (the client divides). Painters never look at DPR.
 *
 * ADDITIVE BUDGET: <= 150 "lighter" draws per frame, hard cap (the sim
 * panel's law). Every additive painter asks takeAdd() first; the client
 * calls resetAddBudget() at the top of each frame. Draw order = priority:
 * torches and beams first, dressing sparkle last.
 */

import type { ClassId } from "../_shared/rules/core";
import { KITS, WAVE_SETS, hordeBand, type RoomChunk, type Rect } from "./content";
import {
  FINE,
  HERO_R,
  POT_MAX,
  ROOM_H,
  ROOM_W,
  hordeScore,
  type HordeState,
  type Projectile,
} from "./sim";
import { RK_ARC, RK_DISC, RK_PILLAR, type RingFx } from "./fx";

export const DESIGN_W = ROOM_W; // 960
export const DESIGN_H = ROOM_H; // 640

const TAU = Math.PI * 2;
const WALL_LIFT = 10; // px the wall top face rises above its footprint

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
  // the horde room (plum-dark crypt, per the horde grade hues)
  floorBase: "#221c28",
  wallTop: "#282234",
  wallSide: "#3b3244",
  wallLip: "#bfaacb",
};

export const CLASS_ACCENT: Record<ClassId, string> = {
  barbarian: "#e07030",
  monk: "#3fae8a",
  ranger: "#3f7a3f",
  bard: "#6a5adf",
  wizard: "#3f6adf",
  cleric: "#d8b13f",
};

/** Loot-beam rarity language: potions soft red/blue, weapon upgrade amber,
 * spell upgrade arcane-blue. beam = column tint, core = bright center. */
export const RARITY: Record<string, { beam: string; core: string; label: string }> = {
  hpPot: { beam: "#e25a4c", core: "#ffb9a8", label: "+POTION" },
  mpPot: { beam: "#4f7de8", core: "#b3ccff", label: "+POTION" },
  wpnUp: { beam: "#f0a832", core: "#ffe3a0", label: "WEAPON UP" },
  splUp: { beam: "#7d8cff", core: "#d4dbff", label: "SPELL UP" },
};

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

/** Stable per-entity animation phase from the sim id (no per-frame alloc). */
export function idPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h & 1023) / 1024) * TAU;
}

// ── additive budget (the <=150 lighter-draws law) ───────────────────────────

let addBudget = 150;
export function resetAddBudget(): void {
  addBudget = 150;
}
export function takeAdd(n = 1): boolean {
  if (addBudget < n) return false;
  addBudget -= n;
  return true;
}

// ── art hooks (try-image-else-vector; never blocks) ─────────────────────────

/** Enemy sprites are keyed cutouts at /s7-art/legion/side/<id>.png facing
 * RIGHT; the client mirrors them toward the hero. Class heroes live at
 * /s7-art/class/hero/<id>.png facing right-ish. Flip the constant below if
 * an art drop lands facing the other way. */
export const ART_FACES_RIGHT = true;

const ART_BASE = "/s7-art";
const artCache: Record<string, HTMLImageElement> = {};

/** Lazily start loading /s7-art/<rel>.png; returns the image only once it is
 * genuinely drawable, else null (the vector fallback paints). */
export function art(rel: string): HTMLImageElement | null {
  let im = artCache[rel];
  if (!im) {
    if (typeof document === "undefined") return null;
    im = new Image();
    im.src = `${ART_BASE}/${rel}.png`;
    artCache[rel] = im;
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

/** On-canvas heights per bestiary id (sprites are 256px source). */
const SPRITE_H: Record<string, number> = {
  skeleton: 42,
  zombie: 44,
  ghoul: 40,
  boneArcher: 42,
  wight: 54,
  specter: 50,
  necromancer: 52,
  boneKnight: 56,
  wraith: 58,
  boneDragon: 92,
};
export function enemySpriteH(key: string): number {
  return SPRITE_H[key] ?? 44;
}
export const HERO_SPRITE_H = 48;

/** Draw a sprite anchored bottom-center at (x, y), scaled to targetH,
 * optionally mirrored around its anchor. */
export function drawSpriteFlip(
  g: CanvasRenderingContext2D,
  im: HTMLImageElement,
  x: number,
  y: number,
  targetH: number,
  flip: boolean,
): void {
  const sc = targetH / im.naturalHeight;
  const w = im.naturalWidth * sc;
  if (flip) {
    g.save();
    g.translate(x, 0);
    g.scale(-1, 1);
    g.drawImage(im, Math.round(-w / 2), Math.round(y - targetH), Math.round(w), Math.round(targetH));
    g.restore();
  } else {
    g.drawImage(im, Math.round(x - w / 2), Math.round(y - targetH), Math.round(w), Math.round(targetH));
  }
}

// one reusable tint scratch (hit-flash repaints; a couple per frame, reused)
let scratch: HTMLCanvasElement | null = null;
function scratchCtx(): CanvasRenderingContext2D | null {
  if (!scratch) {
    if (typeof document === "undefined") return null;
    scratch = document.createElement("canvas");
    scratch.width = 320;
    scratch.height = 320;
  }
  return scratch.getContext("2d");
}

/** Sprite repainted flat in one color (white hit flash) at alpha. */
export function drawSpriteTinted(
  g: CanvasRenderingContext2D,
  im: HTMLImageElement,
  x: number,
  y: number,
  targetH: number,
  flip: boolean,
  tint: string,
  alpha: number,
): void {
  const sg = scratchCtx();
  if (!sg || !scratch) return;
  const sc = targetH / im.naturalHeight;
  const w = Math.min(318, Math.ceil(im.naturalWidth * sc));
  const h = Math.min(318, Math.ceil(targetH));
  sg.clearRect(0, 0, w + 2, h + 2);
  sg.drawImage(im, 0, 0, w, h);
  sg.globalCompositeOperation = "source-in";
  sg.fillStyle = tint;
  sg.fillRect(0, 0, w + 2, h + 2);
  sg.globalCompositeOperation = "source-over";
  g.save();
  g.globalAlpha = alpha;
  if (flip) {
    g.translate(x, 0);
    g.scale(-1, 1);
    g.drawImage(scratch, 0, 0, w, h, Math.round(-w / 2), Math.round(y - h), w, h);
  } else {
    g.drawImage(scratch, 0, 0, w, h, Math.round(x - w / 2), Math.round(y - h), w, h);
  }
  g.restore();
}

// ── baked glow / beam / glint sprites (drawImage only in the frame loop) ────

function mkCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

let warmGlow: HTMLCanvasElement | null = null;
/** One warm radial glow sprite (torches, exit spill), alpha-animated live. */
export function glowSprite(): HTMLCanvasElement {
  if (warmGlow) return warmGlow;
  const { c, g } = mkCanvas(160, 160);
  const grad = g.createRadialGradient(80, 80, 4, 80, 80, 78);
  grad.addColorStop(0, "rgba(255,190,110,0.85)");
  grad.addColorStop(0.35, "rgba(230,130,60,0.34)");
  grad.addColorStop(1, "rgba(230,120,50,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 160, 160);
  warmGlow = c;
  return c;
}

const beamCache: Record<string, HTMLCanvasElement> = {};
/** THE LOOT BEAM sprite: a vertical light column, brightest at the ground,
 * fading up - baked once per rarity so the frame loop only drawImages. */
function beamSprite(kind: string): HTMLCanvasElement {
  let c = beamCache[kind];
  if (c) return c;
  const r = RARITY[kind] ?? RARITY.hpPot;
  const made = mkCanvas(56, 170);
  const g = made.g;
  const cols: readonly (readonly [number, string, number])[] = [
    [48, r.beam, 0.28],
    [26, r.beam, 0.45],
    [10, r.core, 0.95],
  ];
  for (const [w, color, a] of cols) {
    const grad = g.createLinearGradient(0, 0, 0, 170);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.55, color + "");
    grad.addColorStop(1, color + "");
    g.save();
    g.globalAlpha = a;
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(28 - w / 2 + 3, 0);
    g.lineTo(28 + w / 2 - 3, 0);
    g.lineTo(28 + w / 2, 170);
    g.lineTo(28 - w / 2, 170);
    g.closePath();
    g.fill();
    g.restore();
  }
  c = made.c;
  beamCache[kind] = c;
  return c;
}

const glintCache: Record<string, HTMLCanvasElement> = {};
/** The ground glint under a drop: a soft colored ellipse sprite. */
function glintSprite(kind: string): HTMLCanvasElement {
  let c = glintCache[kind];
  if (c) return c;
  const r = RARITY[kind] ?? RARITY.hpPot;
  const made = mkCanvas(96, 96);
  const g = made.g;
  const grad = g.createRadialGradient(48, 48, 2, 48, 48, 46);
  grad.addColorStop(0, r.core);
  grad.addColorStop(0.4, r.beam + "66");
  grad.addColorStop(1, r.beam + "00");
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  c = made.c;
  glintCache[kind] = c;
  return c;
}

let pillarWhite: HTMLCanvasElement | null = null;
function pillarSprite(): HTMLCanvasElement {
  if (pillarWhite) return pillarWhite;
  const { c, g } = mkCanvas(64, 220);
  const cols: readonly (readonly [number, number])[] = [
    [56, 0.22],
    [30, 0.4],
    [12, 0.9],
  ];
  for (const [w, a] of cols) {
    const grad = g.createLinearGradient(0, 0, 0, 220);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,1)");
    g.globalAlpha = a;
    g.fillStyle = grad;
    g.fillRect(32 - w / 2, 0, w, 220);
  }
  pillarWhite = c;
  return c;
}

// ── the room bake (flagstones + walls + AO + sconces, once per chunk) ───────

export interface RoomBake {
  chunkIdx: number;
  floor: HTMLCanvasElement;
  torches: { x: number; y: number }[]; // flame anchor points
}

/** Deterministic per-chunk stream so a revisited layout bakes identically. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const STONES = ["#2b2531", "#2e2836", "#292330", "#312a38", "#2c2733", "#272130"];

export function bakeRoom(chunkIdx: number, chunk: RoomChunk): RoomBake {
  const rnd = lcg(0x50f7a0 + chunkIdx * 7919);
  const { c: floor, g } = mkCanvas(DESIGN_W, DESIGN_H);

  // 1. base + flagstone courses: seeded rect stones with a painted read
  g.fillStyle = PAL.floorBase;
  g.fillRect(0, 0, DESIGN_W, DESIGN_H);
  let y = 0;
  let row = 0;
  while (y < DESIGN_H) {
    const rowH = 34 + Math.floor(rnd() * 16);
    let x = -Math.floor(rnd() * 40);
    while (x < DESIGN_W) {
      const w = 46 + Math.floor(rnd() * 38);
      g.fillStyle = STONES[Math.floor(rnd() * STONES.length)];
      g.fillRect(x + 1, y + 1, w - 2, rowH - 2);
      // painted bevel: one light lip top-left, one shade bottom-right
      g.fillStyle = "rgba(216,198,224,0.05)";
      g.fillRect(x + 1, y + 1, w - 2, 1);
      g.fillRect(x + 1, y + 1, 1, rowH - 2);
      g.fillStyle = "rgba(0,0,0,0.26)";
      g.fillRect(x + 1, y + rowH - 2, w - 2, 1);
      g.fillRect(x + w - 2, y + 1, 1, rowH - 2);
      // occasional worn patch
      if (rnd() < 0.18) {
        g.fillStyle = "rgba(0,0,0,0.10)";
        g.beginPath();
        g.ellipse(x + w * (0.3 + rnd() * 0.4), y + rowH * (0.3 + rnd() * 0.4), 6 + rnd() * 10, 4 + rnd() * 6, rnd() * TAU, 0, TAU);
        g.fill();
      }
      x += w;
    }
    y += rowH;
    row++;
  }
  void row;

  // 2. cracks: short dark random walks
  g.strokeStyle = "rgba(10,6,12,0.5)";
  g.lineWidth = 1;
  for (let i = 0; i < 42; i++) {
    let cx = rnd() * DESIGN_W;
    let cy = rnd() * DESIGN_H;
    g.beginPath();
    g.moveTo(cx, cy);
    const segs = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < segs; k++) {
      cx += (rnd() - 0.5) * 26;
      cy += (rnd() - 0.5) * 26;
      g.lineTo(cx, cy);
    }
    g.stroke();
  }

  // 3. moss tints: soft green blooms, heavier toward the room edges
  for (let i = 0; i < 26; i++) {
    const edge = rnd() < 0.6;
    const mx = edge ? (rnd() < 0.5 ? rnd() * 140 : DESIGN_W - rnd() * 140) : rnd() * DESIGN_W;
    const my = edge && rnd() < 0.5 ? (rnd() < 0.5 ? rnd() * 110 : DESIGN_H - rnd() * 110) : rnd() * DESIGN_H;
    const r = 16 + rnd() * 32;
    const grad = g.createRadialGradient(mx, my, 2, mx, my, r);
    const a = 0.05 + rnd() * 0.08;
    grad.addColorStop(0, `rgba(62,96,70,${a})`);
    grad.addColorStop(1, "rgba(62,96,70,0)");
    g.fillStyle = grad;
    g.fillRect(mx - r, my - r, r * 2, r * 2);
  }

  // 4. center candlelight + perimeter falloff (painted, not the grade)
  {
    const grad = g.createRadialGradient(DESIGN_W / 2, DESIGN_H / 2, 80, DESIGN_W / 2, DESIGN_H / 2, 560);
    grad.addColorStop(0, "rgba(255,238,206,0.055)");
    grad.addColorStop(0.55, "rgba(255,238,206,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.30)");
    g.fillStyle = grad;
    g.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }

  // 5. the room rim: a dark inward band so the boundary reads as wall base
  for (const [x0, y0, w0, h0, hx, hy] of [
    [0, 0, DESIGN_W, 20, 0, 1],
    [0, DESIGN_H - 20, DESIGN_W, 20, 0, -1],
    [0, 0, 20, DESIGN_H, 1, 0],
    [DESIGN_W - 20, 0, 20, DESIGN_H, -1, 0],
  ] as const) {
    const grad = g.createLinearGradient(
      x0 + (hx < 0 ? w0 : 0),
      y0 + (hy < 0 ? h0 : 0),
      x0 + (hx > 0 ? w0 : hx < 0 ? 0 : 0),
      y0 + (hy > 0 ? h0 : hy < 0 ? 0 : 0),
    );
    grad.addColorStop(0, "rgba(4,2,8,0.55)");
    grad.addColorStop(1, "rgba(4,2,8,0)");
    g.fillStyle = grad;
    g.fillRect(x0, y0, w0, h0);
  }

  // 6. walls: AO at floor contact, then side face, then the raised top face
  const torches: { x: number; y: number }[] = [];
  for (const w of chunk.walls) {
    // ambient occlusion at floor contact (two soft passes + side slivers)
    g.fillStyle = "rgba(0,0,0,0.30)";
    g.fillRect(w.x - 3, w.y + w.h, w.w + 6, 6);
    g.fillStyle = "rgba(0,0,0,0.16)";
    g.fillRect(w.x - 7, w.y + w.h + 4, w.w + 14, 8);
    g.fillRect(w.x - 5, w.y, 5, w.h);
    g.fillRect(w.x + w.w, w.y, 5, w.h);

    // side face: the south-facing strip with brick seams
    g.fillStyle = PAL.wallSide;
    g.fillRect(w.x, w.y + w.h - WALL_LIFT, w.w, WALL_LIFT);
    g.fillStyle = "rgba(0,0,0,0.30)";
    for (let bx = w.x + 14; bx < w.x + w.w - 4; bx += 22) g.fillRect(bx, w.y + w.h - WALL_LIFT, 1, WALL_LIFT);
    g.fillRect(w.x, w.y + w.h - 2, w.w, 2);

    // top face: risen by WALL_LIFT, slab seams, lip highlight on its south edge
    g.fillStyle = PAL.wallTop;
    g.fillRect(w.x, w.y - WALL_LIFT, w.w, w.h);
    g.fillStyle = "rgba(0,0,0,0.24)";
    for (let sy = w.y - WALL_LIFT + 18; sy < w.y + w.h - WALL_LIFT - 6; sy += 20) g.fillRect(w.x + 2, sy, w.w - 4, 1);
    for (let sx = w.x + 20; sx < w.x + w.w - 6; sx += 26) g.fillRect(sx, w.y - WALL_LIFT + 2, 1, w.h - 4);
    g.fillStyle = "rgba(191,170,203,0.12)";
    g.fillRect(w.x, w.y + w.h - WALL_LIFT - 2, w.w, 2);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(w.x, w.y - WALL_LIFT, w.w, 2);

    // sconces along the south face at intervals (wide walls only)
    if (w.w >= 64) {
      const step = 150;
      const n = Math.max(1, Math.floor((w.w - 40) / step));
      for (let k = 0; k < n; k++) {
        const tx = Math.round(w.x + (w.w * (k + 1)) / (n + 1));
        const ty = w.y + w.h - WALL_LIFT - 4;
        torches.push({ x: tx, y: ty });
      }
    }
  }

  // 7. room-edge sconces on the north rim (every chunk gets three)
  for (const tx of [200, 480, 760]) torches.push({ x: tx, y: 16 });

  // 8. baked sconce brackets (the flame + glow animate live)
  for (const t of torches) {
    g.fillStyle = "#1a141f";
    g.beginPath();
    g.moveTo(t.x - 5, t.y + 3);
    g.lineTo(t.x + 5, t.y + 3);
    g.lineTo(t.x + 2, t.y + 10);
    g.lineTo(t.x - 2, t.y + 10);
    g.closePath();
    g.fill();
    g.fillStyle = "#463a50";
    g.fillRect(t.x - 6, t.y + 1, 12, 3);
  }

  // 9. exit doorway framing on the east rim (door state draws live)
  const e = chunk.exit;
  g.fillStyle = "#0a070d";
  g.fillRect(e.x, e.y, e.w, e.h);
  g.fillStyle = "#3a3244";
  g.fillRect(e.x - 8, e.y - 12, e.w + 8, 12);
  g.fillRect(e.x - 8, e.y + e.h, e.w + 8, 12);
  g.fillRect(e.x - 8, e.y - 12, 8, e.h + 24);
  g.fillStyle = "rgba(191,170,203,0.12)";
  g.fillRect(e.x - 8, e.y - 2, 8, 2);
  g.fillRect(e.x - 8, e.y + e.h, 8, 2);

  return { chunkIdx, floor, torches };
}

/** Torch flames + warm pulsing additive glows over the baked sconces. */
export function drawTorches(g: CanvasRenderingContext2D, bake: RoomBake, t: number, ox: number, oy: number): void {
  const glow = glowSprite();
  for (let i = 0; i < bake.torches.length; i++) {
    const tor = bake.torches[i];
    const cx = tor.x + ox;
    const cy = tor.y + oy;
    const fl = 0.72 + 0.28 * Math.sin(t * 9 + i * 2.1) * Math.sin(t * 23 + i * 5.7);
    if (takeAdd()) {
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.4 * fl + 0.22;
      g.drawImage(glow, cx - 54, cy - 54, 108, 108);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
    }
    g.fillStyle = PAL.ember;
    g.beginPath();
    g.ellipse(cx, cy - 3, 3, 6 + fl * 3, Math.sin(t * 13 + i) * 0.2, 0, TAU);
    g.fill();
    g.fillStyle = PAL.goldHi;
    g.beginPath();
    g.ellipse(cx, cy - 1, 1.6, 3 + fl * 2, 0, 0, TAU);
    g.fill();
  }
}

/** The exit door state over the baked frame: cold bars while the legion
 * holds, warm spilling light once the room is cleared. */
export function drawExit(g: CanvasRenderingContext2D, chunk: RoomChunk, open: boolean, t: number, ox: number, oy: number): void {
  const e = chunk.exit;
  const x = e.x + ox;
  const y = e.y + oy;
  if (!open) {
    g.fillStyle = "#0a070d";
    g.fillRect(x, y, e.w, e.h);
    g.fillStyle = "#453c52";
    for (let k = 0; k < 4; k++) g.fillRect(x + 5 + k * 12, y + 3, 4, e.h - 6);
    g.fillRect(x + 2, y + Math.floor(e.h / 2) - 2, e.w - 4, 4);
    return;
  }
  // open: warm light in the doorway + a spill ellipse on the floor
  const fl = 0.8 + 0.2 * Math.sin(t * 6.2);
  g.fillStyle = "#2a1c10";
  g.fillRect(x, y, e.w, e.h);
  if (takeAdd(2)) {
    const glow = glowSprite();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.75 * fl;
    g.drawImage(glow, x - e.w / 2 - 10, y + e.h / 2 - 70, 140, 140);
    g.globalAlpha = 0.3 * fl;
    g.drawImage(glow, x - 120, y + e.h - 30, 190, 70); // floor spill
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
  }
}

/** The EXIT OPEN chevron arrow pointing into the doorway. */
export function drawExitArrow(g: CanvasRenderingContext2D, chunk: RoomChunk, t: number): void {
  const e = chunk.exit;
  const cy = e.y + e.h / 2;
  const bounce = Math.sin(t * 5) * 6;
  const bx = e.x - 46 + bounce;
  g.globalAlpha = 0.75 + 0.25 * Math.sin(t * 5);
  g.fillStyle = PAL.gold;
  for (let k = 0; k < 2; k++) {
    const x0 = bx + k * 14;
    g.beginPath();
    g.moveTo(x0, cy - 12);
    g.lineTo(x0 + 10, cy);
    g.lineTo(x0, cy + 12);
    g.lineTo(x0 - 4, cy + 12);
    g.lineTo(x0 + 5, cy);
    g.lineTo(x0 - 4, cy - 12);
    g.closePath();
    g.fill();
  }
  txt(g, "EXIT OPEN", e.x - 44, cy - 24, 12, PAL.gold);
  g.globalAlpha = 1;
}

// ── floor furniture ─────────────────────────────────────────────────────────

export function drawChest(g: CanvasRenderingContext2D, x: number, y: number, opened: boolean, t: number): void {
  g.fillStyle = "rgba(0,0,0,0.4)";
  g.beginPath();
  g.ellipse(x, y + 8, 18, 6, 0, 0, TAU);
  g.fill();
  if (opened) {
    g.fillStyle = "#2c2119";
    g.fillRect(x - 14, y - 6, 28, 13);
    g.fillStyle = "#171009";
    g.fillRect(x - 12, y - 4, 24, 8);
    g.fillStyle = "#3a2c1f";
    g.fillRect(x - 15, y - 13, 30, 5); // lid thrown back
    return;
  }
  g.fillStyle = "#3a2c22";
  g.fillRect(x - 14, y - 8, 28, 15);
  g.fillStyle = "#4a3a2b";
  g.fillRect(x - 14, y - 12, 28, 6);
  g.fillStyle = PAL.gold;
  g.fillRect(x - 2, y - 12, 4, 19);
  g.fillRect(x - 14, y - 7, 28, 2);
  const gl = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.4 + x));
  g.globalAlpha = gl * 0.8;
  g.fillStyle = PAL.goldHi;
  g.fillRect(x - 1, y - 5, 2, 3);
  g.globalAlpha = 1;
}

/** The item icon lying on the ground (the beam draws separately). */
export function drawItem(g: CanvasRenderingContext2D, kind: string, x: number, y: number, t: number): void {
  const r = RARITY[kind] ?? RARITY.hpPot;
  if (kind === "hpPot" || kind === "mpPot") {
    g.fillStyle = "#1b1520";
    g.beginPath();
    g.ellipse(x, y, 6.5, 8, 0, 0, TAU);
    g.fill();
    g.fillStyle = r.beam;
    g.beginPath();
    g.ellipse(x, y + 0.5, 5, 6.5, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#2a2233";
    g.fillRect(x - 2, y - 11, 4, 4);
    g.fillStyle = r.core;
    g.beginPath();
    g.ellipse(x - 2, y - 2, 1.6, 2.4, -0.5, 0, TAU);
    g.fill();
  } else if (kind === "wpnUp") {
    g.save();
    g.translate(x, y);
    g.rotate(-0.7 + Math.sin(t * 1.8 + x) * 0.04);
    g.fillStyle = PAL.bone;
    g.fillRect(-1.6, -12, 3.2, 17);
    g.beginPath();
    g.moveTo(-1.6, -12);
    g.lineTo(0, -16);
    g.lineTo(1.6, -12);
    g.closePath();
    g.fill();
    g.fillStyle = r.beam;
    g.fillRect(-5, 3, 10, 3);
    g.fillRect(-1.6, 6, 3.2, 5);
    g.restore();
  } else {
    // splUp: the arcane tome
    g.fillStyle = "#232041";
    g.fillRect(x - 8, y - 6, 16, 12);
    g.fillStyle = r.beam;
    g.fillRect(x - 8, y - 6, 3, 12);
    g.fillStyle = r.core;
    g.beginPath();
    g.arc(x + 1, y, 3.2, 0, TAU);
    g.fill();
  }
}

/** THE LOOT BEAM: additive column + ground glint, persisting until pickup.
 * birth ramps the column out of the floor; the pulse keeps it alive. */
export function drawBeam(g: CanvasRenderingContext2D, kind: string, x: number, y: number, t: number, birth: number): void {
  const age = t - birth;
  const k = age < 0.4 ? age / 0.4 : 1;
  const ramp = 1 - (1 - k) * (1 - k);
  const pulse = 0.82 + 0.18 * Math.sin(t * 3.1 + x * 0.05);
  const h = 150 * ramp;
  if (h < 4 || !takeAdd(2)) return;
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = (0.45 + 0.55 * ramp) * pulse;
  g.drawImage(beamSprite(kind), x - 22, y - h, 44, h);
  g.globalAlpha = (0.5 + 0.3 * ramp) * pulse;
  g.drawImage(glintSprite(kind), x - 30, y - 11, 60, 22);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
}

// ── actors ──────────────────────────────────────────────────────────────────

export function drawShadow(g: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  g.fillStyle = "rgba(0,0,0,0.42)";
  g.beginPath();
  g.ellipse(x, y + 3, w, w * 0.32, 0, 0, TAU);
  g.fill();
}

/** The elite's faint cold aura ring at its feet. */
export function drawEliteAura(g: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  if (!takeAdd()) return;
  const p = 0.55 + 0.45 * Math.sin(t * 3.4 + x * 0.1);
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.22 + 0.14 * p;
  g.strokeStyle = "#7ec8d8";
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(x, y + 3, 17 + p * 2, 7 + p, 0, 0, TAU);
  g.stroke();
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
}

/** Vector fallback silhouettes: grey-teal undead, one shape family with
 * per-key proportions so a missing sprite still reads. Origin = feet. */
const VEC: Record<string, { h: number; w: number; ghost: boolean; horn: boolean }> = {
  skeleton: { h: 40, w: 10, ghost: false, horn: false },
  zombie: { h: 42, w: 13, ghost: false, horn: false },
  ghoul: { h: 36, w: 12, ghost: false, horn: false },
  boneArcher: { h: 40, w: 10, ghost: false, horn: true },
  wight: { h: 52, w: 15, ghost: false, horn: true },
  specter: { h: 48, w: 13, ghost: true, horn: false },
  necromancer: { h: 50, w: 14, ghost: false, horn: true },
  boneKnight: { h: 54, w: 17, ghost: false, horn: true },
  wraith: { h: 56, w: 15, ghost: true, horn: true },
  boneDragon: { h: 88, w: 34, ghost: false, horn: true },
};

export function drawEnemyVector(g: CanvasRenderingContext2D, key: string, t: number, flat: string | null): void {
  const v = VEC[key] ?? VEC.skeleton;
  const body = flat ?? PAL.tealDeep;
  const lite = flat ?? PAL.teal;
  const bob = Math.sin(t * 3.1) * 1.4;
  g.save();
  g.translate(0, bob * 0.5);
  if (v.ghost) g.globalAlpha *= 0.72;
  // trunk: a hunched teardrop
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(-v.w, 0);
  g.bezierCurveTo(-v.w * 1.25, -v.h * 0.45, -v.w * 0.7, -v.h * 0.85, 0, -v.h * 0.9);
  g.bezierCurveTo(v.w * 0.8, -v.h * 0.85, v.w * 1.2, -v.h * 0.4, v.w * 0.8, 0);
  g.closePath();
  g.fill();
  // skull
  g.fillStyle = lite;
  g.beginPath();
  g.arc(v.w * 0.15, -v.h * 0.92, v.w * 0.52, 0, TAU);
  g.fill();
  if (v.horn) {
    g.beginPath();
    g.moveTo(v.w * 0.15, -v.h * 0.92 - v.w * 0.5);
    g.lineTo(v.w * 0.5, -v.h * 0.92 - v.w * 1.1);
    g.lineTo(v.w * 0.62, -v.h * 0.92 - v.w * 0.35);
    g.closePath();
    g.fill();
  }
  // eye embers
  if (!flat) {
    g.fillStyle = "#9fe8e2";
    g.fillRect(v.w * 0.28, -v.h * 0.94, 2, 2);
    g.fillRect(v.w * 0.02, -v.h * 0.94, 2, 2);
  }
  // reaching arm
  g.strokeStyle = body;
  g.lineWidth = Math.max(2, v.w * 0.3);
  g.beginPath();
  g.moveTo(v.w * 0.3, -v.h * 0.55);
  g.lineTo(v.w * 1.15, -v.h * 0.42 + Math.sin(t * 4.2) * 2);
  g.stroke();
  g.restore();
}

/** Vector fallback hero: a small accent-cloaked figure. Origin = feet. */
export function drawHeroVector(g: CanvasRenderingContext2D, cls: ClassId, t: number, flat: string | null): void {
  const acc = flat ?? CLASS_ACCENT[cls];
  const body = flat ?? "#161a26";
  const bone = flat ?? PAL.bone;
  const bob = Math.sin(t * 2.4) * 1.2;
  g.save();
  g.translate(0, bob * 0.5);
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(-9, 0);
  g.bezierCurveTo(-12, -18, -8, -32, 0, -34);
  g.bezierCurveTo(8, -32, 12, -16, 8, 0);
  g.closePath();
  g.fill();
  g.fillStyle = acc;
  g.fillRect(-8, -22, 16, 4); // the class sash
  g.fillStyle = bone;
  g.beginPath();
  g.arc(0.5, -38, 5.5, 0, TAU);
  g.fill();
  g.strokeStyle = acc;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(7, -20);
  g.lineTo(15, -30);
  g.stroke();
  g.restore();
}

/** Bone archer bolt: a pale sliver aligned to its velocity + a glow head. */
export function drawProjectile(g: CanvasRenderingContext2D, p: Projectile, ox: number, oy: number): void {
  const x = p.x / FINE + ox;
  const y = p.y / FINE + oy;
  const ang = Math.atan2(p.vy, p.vx);
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = PAL.bone;
  g.beginPath();
  g.moveTo(6, 0);
  g.lineTo(-5, -2);
  g.lineTo(-3, 0);
  g.lineTo(-5, 2);
  g.closePath();
  g.fill();
  g.restore();
  if (takeAdd()) {
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.4;
    g.fillStyle = "#cfe0d8";
    g.beginPath();
    g.arc(x, y, 4, 0, TAU);
    g.fill();
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
  }
}

// ── skill / swing fx painters ───────────────────────────────────────────────

export function drawRingFx(g: CanvasRenderingContext2D, r: RingFx): void {
  const k = Math.min(1, r.t / r.life);
  const ease = 1 - (1 - k) * (1 - k);
  const fade = 1 - k;
  if (r.kind === RK_PILLAR) {
    if (!takeAdd(1)) return;
    const h = r.r1 * ease;
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = fade * 0.9;
    const sg = scratchCtx();
    if (sg && scratch) {
      const pw = 64;
      const ph = 220;
      sg.clearRect(0, 0, pw, ph);
      sg.drawImage(pillarSprite(), 0, 0);
      sg.globalCompositeOperation = "source-in";
      sg.fillStyle = r.color;
      sg.fillRect(0, 0, pw, ph);
      sg.globalCompositeOperation = "source-over";
      g.drawImage(scratch, 0, 0, pw, ph, r.x - r.width / 2, r.y - h, r.width, h);
    }
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    return;
  }
  const rad = r.r0 + (r.r1 - r.r0) * ease;
  if (r.kind === RK_DISC) {
    if (!takeAdd()) return;
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = fade * 0.42;
    g.fillStyle = r.color;
    g.beginPath();
    g.arc(r.x, r.y, Math.max(1, rad), 0, TAU);
    g.fill();
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    return;
  }
  if (!takeAdd()) return;
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = fade * 0.85;
  g.strokeStyle = r.color;
  g.lineWidth = Math.max(1, r.width * (1 - k * 0.55));
  g.beginPath();
  if (r.kind === RK_ARC) g.arc(r.x, r.y, Math.max(1, rad), r.ang - r.spread, r.ang + r.spread);
  else g.arc(r.x, r.y, Math.max(1, rad), 0, TAU);
  g.stroke();
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
}

/** Dash streak / piercing bolt: an additive line with a bright core. */
export function drawBoltFx(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  color: string,
  fade: number,
): void {
  if (!takeAdd(2)) return;
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = color;
  g.lineCap = "round";
  g.globalAlpha = fade * 0.4;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.globalAlpha = fade * 0.9;
  g.lineWidth = Math.max(1, width * 0.3);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.lineCap = "butt";
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
}

/** CRIT mini-die: a tiny pointy-top hexagon stamped "20" - the d20 chip
 * language from gauntlet/crypt at loot-float scale (face/rim/number echo
 * their DIE_CRIT colors). Rides a "CRIT" float, so the caller owns position,
 * rise and globalAlpha; `t01` = float life fraction 0..1 (drives the pop-in).
 * Plain draws only - no additive budget spent. */
export function drawCritChip(g: CanvasRenderingContext2D, x: number, y: number, t01: number): void {
  const r = 8;
  const pop = Math.max(0, 1 - t01 * 5); // ~0.2s settle
  const base = g.globalAlpha;
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.scale(1 + pop * 0.45, 1 + pop * 0.45);
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
  g.fillStyle = "#241c0e";
  g.fill();
  g.strokeStyle = PAL.gold;
  g.lineWidth = 1.6;
  g.stroke();
  // front facet: the inscribed triangle (the d20 read)
  g.globalAlpha = base * 0.45;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, -r);
  g.lineTo(Math.cos(Math.PI / 6) * r, Math.sin(Math.PI / 6) * r);
  g.lineTo(-Math.cos(Math.PI / 6) * r, Math.sin(Math.PI / 6) * r);
  g.closePath();
  g.stroke();
  g.globalAlpha = base;
  txt(g, "20", 0, r * 0.08, 9, "#ffe2a0");
  g.restore();
}

/** Soft movement target marker under the held pointer. */
export function drawTargetMarker(g: CanvasRenderingContext2D, x: number, y: number, t: number, accent: string): void {
  const p = 0.5 + 0.5 * Math.sin(t * 6);
  g.globalAlpha = 0.4 + 0.25 * p;
  g.strokeStyle = accent;
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(x, y, 13 + p * 3, (13 + p * 3) * 0.55, 0, 0, TAU);
  g.stroke();
  g.globalAlpha = 0.7;
  g.fillStyle = accent;
  g.beginPath();
  g.ellipse(x, y, 2.5, 1.6, 0, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}

// ── HUD (the Diablo read: orbs, belt, pips, depth) ──────────────────────────

const ORB_R = 46;
let orbBack: HTMLCanvasElement | null = null;
let orbGlass: HTMLCanvasElement | null = null;

function bakeOrbs(): void {
  if (orbBack && orbGlass) return;
  {
    const { c, g } = mkCanvas(ORB_R * 2 + 12, ORB_R * 2 + 12);
    const cx = ORB_R + 6;
    const grad = g.createRadialGradient(cx, cx, ORB_R * 0.2, cx, cx, ORB_R + 4);
    grad.addColorStop(0, "#181220");
    grad.addColorStop(0.85, "#0c0812");
    grad.addColorStop(1, "#05030a");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cx, ORB_R + 4, 0, TAU);
    g.fill();
    g.strokeStyle = "#4a4056";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cx, ORB_R + 2.5, 0, TAU);
    g.stroke();
    g.strokeStyle = "#231d2e";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cx, ORB_R + 5, 0, TAU);
    g.stroke();
    orbBack = c;
  }
  {
    const { c, g } = mkCanvas(ORB_R * 2 + 12, ORB_R * 2 + 12);
    const cx = ORB_R + 6;
    const grad = g.createRadialGradient(cx - ORB_R * 0.4, cx - ORB_R * 0.55, 2, cx - ORB_R * 0.4, cx - ORB_R * 0.55, ORB_R * 0.8);
    grad.addColorStop(0, "rgba(255,255,255,0.30)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.08)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cx, ORB_R, 0, TAU);
    g.fill();
    const rim = g.createRadialGradient(cx, cx + ORB_R * 0.9, 2, cx, cx + ORB_R * 0.9, ORB_R * 0.7);
    rim.addColorStop(0, "rgba(255,255,255,0.10)");
    rim.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rim;
    g.beginPath();
    g.arc(cx, cx, ORB_R, 0, TAU);
    g.fill();
    orbGlass = c;
  }
}

function drawOrb(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  frac: number,
  deep: string,
  lite: string,
  t: number,
  pulse: number,
  pulseColor: string,
): void {
  bakeOrbs();
  if (orbBack) g.drawImage(orbBack, cx - ORB_R - 6, cy - ORB_R - 6);
  const f = Math.max(0, Math.min(1, frac));
  if (f > 0.005) {
    g.save();
    g.beginPath();
    g.arc(cx, cy, ORB_R - 3, 0, TAU);
    g.clip();
    const top = cy + (ORB_R - 3) - f * (ORB_R - 3) * 2;
    // the liquid body
    g.fillStyle = deep;
    g.fillRect(cx - ORB_R, top, ORB_R * 2, ORB_R * 2);
    // the wavy surface band
    g.fillStyle = lite;
    g.beginPath();
    g.moveTo(cx - ORB_R, top + Math.sin(t * 2.1) * 2.5);
    for (let i = 0; i <= 8; i++) {
      const wx = cx - ORB_R + (i / 8) * ORB_R * 2;
      g.lineTo(wx, top + Math.sin(t * 2.1 + i * 1.1) * 2.5 + Math.sin(t * 3.7 + i * 0.6) * 1.4);
    }
    g.lineTo(cx + ORB_R, top + 6);
    g.lineTo(cx - ORB_R, top + 6);
    g.closePath();
    g.fill();
    g.restore();
  }
  if (orbGlass) g.drawImage(orbGlass, cx - ORB_R - 6, cy - ORB_R - 6);
  if (pulse > 0.02 && takeAdd()) {
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = pulse * 0.7;
    g.strokeStyle = pulseColor;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, ORB_R + 2, 0, TAU);
    g.stroke();
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
  }
}

function drawPips(g: CanvasRenderingContext2D, x: number, y: number, label: string, tier: number, color: string): void {
  txt(g, label, x, y, 9, PAL.dim, "left", 700);
  for (let i = 0; i < 4; i++) {
    const cx = x + 26 + i * 15;
    const on = i < tier;
    g.fillStyle = on ? color : "rgba(139,133,119,0.18)";
    g.beginPath();
    g.moveTo(cx, y - 5);
    g.lineTo(cx + 4.5, y);
    g.lineTo(cx, y + 5);
    g.lineTo(cx - 4.5, y);
    g.closePath();
    g.fill();
  }
}

function drawFlaskSlot(g: CanvasRenderingContext2D, x: number, y: number, filled: boolean, color: string, core: string): void {
  g.fillStyle = "rgba(9,11,16,0.85)";
  rr(g, x, y, 26, 32, 5);
  g.fill();
  g.strokeStyle = "#3d3446";
  g.lineWidth = 1;
  rr(g, x + 0.5, y + 0.5, 25, 31, 5);
  g.stroke();
  const cx = x + 13;
  const cy = y + 19;
  g.globalAlpha = filled ? 1 : 0.2;
  g.fillStyle = "#1b1520";
  g.beginPath();
  g.ellipse(cx, cy, 7, 8.5, 0, 0, TAU);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(cx, cy + 0.5, 5.4, 7, 0, 0, TAU);
  g.fill();
  g.fillStyle = "#2a2233";
  g.fillRect(cx - 2, cy - 12, 4, 4);
  if (filled) {
    g.fillStyle = core;
    g.beginPath();
    g.ellipse(cx - 2, cy - 2, 1.6, 2.6, -0.5, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** The whole HUD: hp orb LEFT, mana orb RIGHT (skill-ready rim + cooldown
 * arc), potion belt center, tier pips, depth + score top center. Drawn
 * unshaken, before the grade. */
export function drawHud(g: CanvasRenderingContext2D, s: HordeState, t: number, orbHp: number, orbMp: number): void {
  const kit = KITS[s.classId];
  const accent = CLASS_ACCENT[s.classId];

  // top center: depth + score + the room line
  g.fillStyle = "rgba(7,8,12,0.62)";
  rr(g, DESIGN_W / 2 - 130, 8, 260, 62, 8);
  g.fill();
  txt(g, `DEPTH ${s.depth + 1}`, DESIGN_W / 2, 22, 13, PAL.dim, "center", 800);
  txt(g, String(hordeScore(s)), DESIGN_W / 2, 44, 26, PAL.gold);
  const waves = WAVE_SETS[hordeBand(s.depth)][s.setIdx];
  const waveLine =
    s.exitOpen === 1 ? `CLEARED · KILLS ${s.kills}` : `WAVE ${Math.min(s.waveIdx, waves.length)}/${waves.length} · KILLS ${s.kills}`;
  txt(g, waveLine, DESIGN_W / 2, 62, 10, PAL.dim, "center", 700);

  // hp orb LEFT
  const oy = DESIGN_H - 60;
  drawOrb(g, 62, oy, s.hp / s.hpMax, "#5c1c16", "#b23c30", t, orbHp, "#ff8a76");
  txt(g, String(s.hp), 62, oy, 15, "#ffd9d0");
  txt(g, "LIFE", 62, oy + ORB_R + 4, 9, PAL.dim, "center", 700);

  // mana orb RIGHT + skill readiness
  const mx = DESIGN_W - 62;
  drawOrb(g, mx, oy, s.mana / s.manaMax, "#16265c", "#3c58b2", t, orbMp, "#8ab0ff");
  txt(g, String(s.mana), mx, oy, 15, "#d0e0ff");
  txt(g, "MANA", mx, oy + ORB_R + 4, 9, PAL.dim, "center", 700);
  const ready = s.mana >= kit.cost && s.skillCd === 0;
  if (ready) {
    if (takeAdd()) {
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.35 + 0.3 * Math.sin(t * 4.5);
      g.strokeStyle = accent;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(mx, oy, ORB_R + 6, 0, TAU);
      g.stroke();
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
    }
  } else if (s.skillCd > 0) {
    g.globalAlpha = 0.8;
    g.strokeStyle = accent;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(mx, oy, ORB_R + 6, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - s.skillCd / kit.cdF));
    g.stroke();
    g.globalAlpha = 1;
  }
  txt(g, `${kit.skillName.toUpperCase()} · SPACE`, mx, oy - ORB_R - 10, 9, ready ? accent : PAL.dim, "center", 700);

  // the belt: 3 red + 3 blue flask slots, centered
  const beltW = 6 * 30 + 10;
  const bx = DESIGN_W / 2 - beltW / 2;
  const by = DESIGN_H - 44;
  for (let i = 0; i < POT_MAX; i++) drawFlaskSlot(g, bx + i * 30, by, i < s.hpPots, RARITY.hpPot.beam, RARITY.hpPot.core);
  for (let i = 0; i < POT_MAX; i++)
    drawFlaskSlot(g, bx + 10 + (POT_MAX + i) * 30, by, i < s.mpPots, RARITY.mpPot.beam, RARITY.mpPot.core);

  // tier pips flanking the belt
  drawPips(g, bx - 118, by + 18, "WPN", s.weaponTier, RARITY.wpnUp.beam);
  drawPips(g, bx + beltW + 22, by + 18, "SPL", s.spellTier, RARITY.splUp.beam);
}

// ── banner + death ──────────────────────────────────────────────────────────

export function drawBanner(g: CanvasRenderingContext2D, text: string, sub: string, t: number, color: string): void {
  const life = 2.2;
  if (t <= 0 || t >= life) return;
  const a = Math.min(1, t / 0.18) * Math.min(1, (life - t) / 0.4);
  g.save();
  g.globalAlpha = a * 0.75;
  g.fillStyle = "#05060a";
  const w = 480;
  rr(g, (DESIGN_W - w) / 2, 120, w, sub ? 64 : 48, 6);
  g.fill();
  g.globalAlpha = a;
  txt(g, text, DESIGN_W / 2, 146, 25, color);
  if (sub) txt(g, sub, DESIGN_W / 2, 170, 12, PAL.dim, "center", 700);
  g.restore();
}

export function drawDeadOverlay(g: CanvasRenderingContext2D, score: number, depth: number, kills: number, t: number): void {
  const a = Math.min(1, t / 0.9);
  g.fillStyle = `rgba(8,4,6,${0.84 * a})`;
  g.fillRect(0, 0, DESIGN_W, DESIGN_H);
  if (a < 0.35) return;
  const b = Math.min(1, (t - 0.25) / 0.6);
  g.globalAlpha = b;
  txt(g, "THE LEGION TAKES YOU", DESIGN_W / 2, 238, 34, PAL.blood);
  txt(g, String(score), DESIGN_W / 2, 306, 54, PAL.gold);
  txt(g, `DEPTH ${depth + 1} · KILLS ${kills}`, DESIGN_W / 2, 356, 14, PAL.dim, "center", 700);
  if (t > 1.1) {
    const blink = 0.5 + 0.5 * Math.sin(t * 4);
    g.globalAlpha = b * (0.4 + 0.6 * blink);
    txt(g, "TAP OR PRESS SPACE TO RISE AGAIN", DESIGN_W / 2, 412, 13, PAL.text, "center", 700);
  }
  g.globalAlpha = 1;
}

// re-exported for the client's wall-aware dressing needs
export type { Rect };
export const HERO_PX_R = HERO_R;
