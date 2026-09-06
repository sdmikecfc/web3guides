/**
 * CRYPT DRAW - the first-person corridor renderer plus every painter the
 * client composits. Pure presentation: nothing here reads sim RNG or mutates
 * sim state; every function takes plain numbers/state and paints.
 *
 * THE CORRIDOR CONTRACT lives in public/s7-art/crypt/walls/meta.json (baked
 * by scripts/s7-crypt-bake.py) and this file is DATA-DRIVEN from it: plane
 * rects, piece rects, fog ladder, plates, cap - all imported, never
 * hardcoded. Retuning the geometry means re-running the bake, not editing
 * this file.
 *
 * PROJECTION. Depth slice z (0..3) is the cell z+1 steps AHEAD of the hero
 * along the facing; its front face (when that cell is a wall) is the plane-z
 * rect, its side walls span plane z -> z+1, and a wall at distance 1 fills
 * the whole screen (front-z0 = the viewport). Painter's order is far to
 * near; a closing front wall at z is slice-z content drawn UNDER the plane-z
 * fog step, and nearer slices simply paint over deeper ones (the meta
 * contract, load-bearing). Right walls are the left piece mirrored at
 * x = viewport.w - (x + w), exactly per meta.
 *
 * ART: try-image-else-vector everywhere (the S6 law). Wall pieces fall back
 * to flat-shaded quads, billboards to per-id vector silhouettes, so a cold
 * cache never shows a hole.
 */

import type { ClassId } from "../_shared/rules/core";
import { CHUNKS, KITS } from "./content";
import {
  DIR_DX,
  DIR_DY,
  DP_NEXT,
  DP_TELL,
  cryptScore,
  cryptWallAt,
  fnv1a,
  type CryptState,
  type EnemyState,
} from "./sim";
import { enemyFxPeek, type Fx } from "./fx";
import metaJson from "../../../../../public/s7-art/crypt/walls/meta.json";

// ── the baked contract ──────────────────────────────────────────────────────

interface PieceRect {
  z: number;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface CryptMeta {
  viewport: { w: number; h: number };
  vanishingPoint: { x: number; y: number };
  planes: { z: number; scale: number; rect: number[] }[];
  pieces: PieceRect[];
  plates: { floor: { rect: number[] }; ceiling: { rect: number[] } };
  capRect: number[];
  fog: { color: number[]; steps: { overPlane: number; alpha: number; rect: number[] }[] };
  variants: { wall: string[]; floor: string[]; ceiling: string[] };
}

const META = metaJson as unknown as CryptMeta;

export const DESIGN_W = META.viewport.w; // 800
export const DESIGN_H = META.viewport.h; // 600
const VPX = META.vanishingPoint.x;
const VPY = META.vanishingPoint.y;
const DEPTHS = 4; // z0..z3 baked slices; beyond plane 4 = the fog cap

const SCALES: number[] = META.planes.map((p) => p.scale);
const FRONT_RECT: PieceRect[] = [];
const LEFT_RECT: PieceRect[] = [];
for (const p of META.pieces) {
  if (p.kind === "front") FRONT_RECT[p.z] = p;
  else LEFT_RECT[p.z] = p;
}
const FLOOR_RECT = META.plates.floor.rect;
const CEIL_RECT = META.plates.ceiling.rect;
const CAP_RECT = META.capRect;

const FOG_RGB = META.fog.color;
const FOG_CSS = `rgb(${FOG_RGB[0]},${FOG_RGB[1]},${FOG_RGB[2]})`;
/** fog fillStyle per plane index (sparse: planes 1..3), prebuilt strings. */
const FOG_FILL: string[] = [];
for (const st of META.fog.steps) FOG_FILL[st.overPlane] = `rgba(${FOG_RGB[0]},${FOG_RGB[1]},${FOG_RGB[2]},${st.alpha})`;
const FOG_STEP_RECT: number[][] = [];
for (const st of META.fog.steps) FOG_STEP_RECT[st.overPlane] = st.rect;

/** Side-wall quads per z (near column = plane z extent, far = plane z+1).
 * Mirrors are derived per meta's rule; used for openings + vector fallback. */
interface SideQuad {
  x0: number; // near column (plane z boundary)
  y0a: number;
  y0b: number;
  x1: number; // far column (plane z+1 boundary)
  y1a: number;
  y1b: number;
}
const LEFT_QUAD: SideQuad[] = [];
for (let z = 0; z < DEPTHS; z++) {
  const nr = META.planes[z].rect;
  const fr = META.planes[z + 1].rect;
  LEFT_QUAD[z] = { x0: nr[0], y0a: nr[1], y0b: nr[1] + nr[3], x1: fr[0], y1a: fr[1], y1b: fr[1] + fr[3] };
}

// ── palette ─────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;

export const PAL = {
  ink: "#07080c",
  text: "#e8e2d2",
  dim: "#8b8577",
  bone: "#cfc8b8",
  gold: "#f0b340",
  goldHi: "#ffd98a",
  ember: "#e07030",
  blood: "#c8443a",
  green: "#59d98c",
  steel: "#5a6a86",
  potion: "#c85a70",
};

export const CLASS_ACCENT: Record<ClassId, string> = {
  barbarian: "#e07030",
  monk: "#3fae8a",
  ranger: "#3f7a3f",
  bard: "#6a5adf",
  wizard: "#3f6adf",
  cleric: "#d8b13f",
};

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

// ── art hooks (try-image-else-vector; never blocks) ─────────────────────────

const artCache: Record<string, HTMLImageElement> = {};
function img(src: string): HTMLImageElement | null {
  let im = artCache[src];
  if (!im) {
    if (typeof document === "undefined") return null;
    im = new Image();
    im.src = src;
    artCache[src] = im;
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

// preassembled src strings so the frame loop never concatenates
const WALL_BASE = "/s7-art/crypt/walls";
const FRONT_SRC: string[][] = META.variants.wall.map((v) => {
  const per: string[] = [];
  for (let z = 0; z < DEPTHS; z++) per.push(`${WALL_BASE}/${v}-z${z}-front.webp`);
  return per;
});
const LEFT_SRC: string[][] = META.variants.wall.map((v) => {
  const per: string[] = [];
  for (let z = 0; z < DEPTHS; z++) per.push(`${WALL_BASE}/${v}-z${z}-left.webp`);
  return per;
});
const FLOOR_SRC = `${WALL_BASE}/${META.variants.floor[0]}-plate.webp`;
const CEIL_SRC = `${WALL_BASE}/${META.variants.ceiling[0]}-plate.webp`;

const LEGION_SRC: Record<string, string> = {};
function legionImg(key: string): HTMLImageElement | null {
  let src = LEGION_SRC[key];
  if (!src) {
    src = `/s7-art/legion/front/${key}.png`;
    LEGION_SRC[key] = src;
  }
  return img(src);
}

/** Warm the caches so the first corridor paints from images, not fallbacks. */
export function preloadArt(): void {
  for (let v = 0; v < FRONT_SRC.length; v++)
    for (let z = 0; z < DEPTHS; z++) {
      img(FRONT_SRC[v][z]);
      img(LEFT_SRC[v][z]);
    }
  img(FLOOR_SRC);
  img(CEIL_SRC);
  for (const k of Object.keys(HB_H)) legionImg(k);
}

/** Stable A/B wall variant per world cell (depth is the world axis). */
function variantIdx(depth: number, x: number, y: number): number {
  return fnv1a(`w${depth}:${x},${y}`) % FRONT_SRC.length;
}

// ── the tint pass (white hit flash / red telegraph silhouettes) ─────────────

let tintC: HTMLCanvasElement | null = null;
/** One reused 512-square: sprite drawn bottom-anchored at height 512, then
 * source-in filled. Draw the result as a square of side = billboard height. */
function tintedSprite(im: HTMLImageElement, color: string): HTMLCanvasElement {
  if (!tintC) {
    tintC = document.createElement("canvas");
    tintC.width = 512;
    tintC.height = 512;
  }
  const g = tintC.getContext("2d")!;
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, 512, 512);
  const w = (im.naturalWidth / im.naturalHeight) * 512;
  g.drawImage(im, 256 - w / 2, 0, w, 512);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 512);
  return tintC;
}

// ── projection (grid -> view space) ─────────────────────────────────────────

export interface ProjOut {
  vis: boolean;
  z: number; // depth slice 0..3
  lat: number; // -1 left, 0 center, 1 right
  x: number; // screen center x
  feetY: number; // screen floor line at the slice
  scale: number; // plane-ladder mid scale
}
export const mkProj = (): ProjOut => ({ vis: false, z: 0, lat: 0, x: VPX, feetY: VPY, scale: 1 });

/** Side billboards pulled toward center so ~40% shows in the opening
 * (the Grimrock alcove fudge; geometrically honest centers sit at the
 * frustum edge and would vanish). */
const SIDE_PULL = 0.82;

/** Map world cell -> corridor view. Occlusion = a closing wall in the center
 * column before the cell's slice (front pieces cover everything deeper). */
export function projectCell(s: CryptState, cx: number, cy: number, out: ProjOut): void {
  out.vis = false;
  const f = s.facing;
  const dxw = cx - s.x;
  const dyw = cy - s.y;
  const d = dxw * DIR_DX[f] + dyw * DIR_DY[f];
  const rf = (f + 1) & 3;
  const lat = dxw * DIR_DX[rf] + dyw * DIR_DY[rf];
  if (d < 1 || d > DEPTHS || lat < -1 || lat > 1) return;
  for (let k = 1; k < d; k++) if (cryptWallAt(s, s.x + DIR_DX[f] * k, s.y + DIR_DY[f] * k)) return;
  const z = d - 1;
  const sMid = (SCALES[z] + SCALES[z + 1]) / 2;
  out.vis = true;
  out.z = z;
  out.lat = lat;
  out.scale = sMid;
  out.x = VPX + lat * DESIGN_W * sMid * SIDE_PULL;
  out.feetY = VPY + (DESIGN_H / 2) * sMid;
}

// ── billboard heights (px at scale 1; images are 512 tall, keyed) ───────────

const HB_H: Record<string, number> = {
  skeleton: 400,
  zombie: 380,
  ghoul: 360,
  boneArcher: 400,
  wight: 430,
  specter: 420,
  necromancer: 420,
  boneKnight: 440,
  wraith: 460,
  boneDragon: 540,
};

// ── vector silhouette fallback (per bestiary id; never blocks on art) ───────

interface FbCfg {
  cloth: string;
  ghost: boolean;
  hunch: number; // torso forward-lean px per 100h
  head: number; // head radius / 100h
  weapon: number; // 0 none, 1 sword, 2 bow, 3 staff, 4 scythe
  shield: boolean;
  crown: boolean;
  dragon: boolean;
}
const FB: Record<string, FbCfg> = {
  skeleton: { cloth: "#5d7a78", ghost: false, hunch: 0, head: 9, weapon: 1, shield: true, crown: false, dragon: false },
  zombie: { cloth: "#6a7a5a", ghost: false, hunch: 10, head: 9, weapon: 0, shield: false, crown: false, dragon: false },
  ghoul: { cloth: "#8a947a", ghost: false, hunch: 16, head: 8, weapon: 0, shield: false, crown: false, dragon: false },
  boneArcher: { cloth: "#4a5a6a", ghost: false, hunch: 0, head: 9, weapon: 2, shield: false, crown: false, dragon: false },
  wight: { cloth: "#4a5068", ghost: false, hunch: 0, head: 9, weapon: 1, shield: false, crown: true, dragon: false },
  specter: { cloth: "#9ab0d8", ghost: true, hunch: 0, head: 9, weapon: 0, shield: false, crown: false, dragon: false },
  necromancer: { cloth: "#5a4a8f", ghost: false, hunch: 4, head: 8, weapon: 3, shield: false, crown: false, dragon: false },
  boneKnight: { cloth: "#6a7286", ghost: false, hunch: 0, head: 10, weapon: 1, shield: true, crown: false, dragon: false },
  wraith: { cloth: "#8a6aa8", ghost: true, hunch: 0, head: 9, weapon: 4, shield: false, crown: false, dragon: false },
  boneDragon: { cloth: "#a8a292", ghost: false, hunch: 0, head: 8, weapon: 0, shield: false, crown: false, dragon: true },
};
const FB_DEFAULT: FbCfg = FB.skeleton;

/** Paint a stand-in silhouette, feet at origin, given total height h.
 * flat != null paints the whole figure that color (flash/telegraph pass). */
export function paintLegionFallback(
  g: CanvasRenderingContext2D,
  key: string,
  h: number,
  flat: string | null,
): void {
  const c = FB[key] || FB_DEFAULT;
  const u = h / 100; // config units
  const bone = flat || PAL.bone;
  const cloth = flat || c.cloth;
  g.save();
  if (c.ghost && !flat) g.globalAlpha *= 0.8;
  if (c.dragon) {
    // wings
    g.fillStyle = cloth;
    g.beginPath();
    g.moveTo(0, -62 * u);
    g.lineTo(-46 * u, -86 * u);
    g.lineTo(-30 * u, -48 * u);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(0, -62 * u);
    g.lineTo(46 * u, -86 * u);
    g.lineTo(30 * u, -48 * u);
    g.closePath();
    g.fill();
    // body + neck + skull
    g.fillStyle = bone;
    g.beginPath();
    g.ellipse(0, -34 * u, 24 * u, 26 * u, 0, 0, TAU);
    g.fill();
    g.fillRect(-5 * u, -78 * u, 10 * u, 46 * u);
    g.beginPath();
    g.ellipse(6 * u, -82 * u, 13 * u, 9 * u, -0.3, 0, TAU);
    g.fill();
  } else {
    const lean = c.hunch * u * 0.4;
    // legs (ghosts taper instead)
    g.fillStyle = cloth;
    if (c.ghost) {
      g.beginPath();
      g.moveTo(-16 * u, -46 * u);
      g.quadraticCurveTo(-12 * u, -14 * u, -4 * u, 0);
      g.lineTo(4 * u, -8 * u);
      g.lineTo(10 * u, 0);
      g.quadraticCurveTo(16 * u, -18 * u, 16 * u, -46 * u);
      g.closePath();
      g.fill();
    } else {
      g.fillRect(-11 * u, -40 * u, 8 * u, 40 * u);
      g.fillRect(3 * u, -40 * u, 8 * u, 40 * u);
    }
    // torso
    g.beginPath();
    g.moveTo(-17 * u + lean, -86 * u);
    g.lineTo(17 * u + lean, -86 * u);
    g.lineTo(13 * u, -38 * u);
    g.lineTo(-13 * u, -38 * u);
    g.closePath();
    g.fill();
    // ribs hint on bone bodies
    if (!flat && (key === "skeleton" || key === "boneArcher")) {
      g.strokeStyle = PAL.bone;
      g.lineWidth = 1.5 * u;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-10 * u + lean * 0.6, (-76 + i * 9) * u);
        g.lineTo(10 * u + lean * 0.6, (-76 + i * 9) * u);
        g.stroke();
      }
    }
    // head
    g.fillStyle = bone;
    g.beginPath();
    g.arc(lean, (-86 - c.head * 0.8) * u, c.head * u, 0, TAU);
    g.fill();
    if (c.crown) {
      g.beginPath();
      for (let i = -1; i <= 1; i++) {
        g.moveTo(lean + (i * 7 - 4) * u, (-94 - c.head * 0.5) * u);
        g.lineTo(lean + i * 7 * u, (-103 - c.head * 0.5) * u);
        g.lineTo(lean + (i * 7 + 4) * u, (-94 - c.head * 0.5) * u);
      }
      g.fill();
    }
    // weapon
    g.strokeStyle = flat || "#9aa2b0";
    g.lineWidth = 3 * u;
    if (c.weapon === 1) {
      g.beginPath();
      g.moveTo(20 * u, -50 * u);
      g.lineTo(34 * u, -96 * u);
      g.stroke();
    } else if (c.weapon === 2) {
      g.beginPath();
      g.arc(24 * u, -66 * u, 20 * u, -1.2, 1.2);
      g.stroke();
    } else if (c.weapon === 3) {
      g.beginPath();
      g.moveTo(24 * u, -8 * u);
      g.lineTo(24 * u, -98 * u);
      g.stroke();
      g.fillStyle = flat || "#8a6adf";
      g.beginPath();
      g.arc(24 * u, -100 * u, 5 * u, 0, TAU);
      g.fill();
    } else if (c.weapon === 4) {
      g.beginPath();
      g.moveTo(22 * u, -4 * u);
      g.lineTo(30 * u, -100 * u);
      g.stroke();
      g.beginPath();
      g.arc(22 * u, -100 * u, 12 * u, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
    }
    if (c.shield) {
      g.fillStyle = flat || "#4a5262";
      g.beginPath();
      g.ellipse(-22 * u, -58 * u, 10 * u, 14 * u, 0, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}

// ── billboards ──────────────────────────────────────────────────────────────

function drawShadow(g: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  g.fillStyle = "rgba(0,0,0,0.4)";
  g.beginPath();
  g.ellipse(x, y, w, w * 0.26, 0, 0, TAU);
  g.fill();
}

/** One enemy billboard: keyed art (else silhouette), idle sway, the duel
 * telegraph language (see below), white flash + punch.
 *
 * THE TELEGRAPH LANGUAGE (CRYPT DUELS): the tell ramp keys off the locked
 * duelist's `windup` mirror against s.duelTellF (the CURRENT tell's total -
 * the old fixed-WINDUP_F formula broke on tells past 20f). One glow family
 * per style, all PAL colors, all pure alpha ramps under reduced motion:
 *  - light = amber edge-glow (guardable);
 *  - heavy = the blood-red rise (bottom-up reveal) PLUS req-side chevrons
 *    in screen space showing WHICH side to dodge ("any" lights both);
 *  - feint = washed slate glow that never fully lights (the fake's tell).
 * Enemies adjacent-but-not-dueling HOLD RING and never attack: they dim and
 * slow their sway so they read as WAITING, not broken. */
function drawBillboard(
  g: CanvasRenderingContext2D,
  s: CryptState,
  e: EnemyState,
  p: ProjOut,
  t: number,
  fx: Fx,
  reduced: boolean,
): void {
  const efx = enemyFxPeek(fx, e.id);
  const isDuelist = s.duelId === e.id;
  const waiting = (s.duelId !== "" && !isDuelist) || (s.duelId === "" && s.duelPhase === DP_NEXT);
  const w01 = isDuelist && e.windup > 0 && s.duelTellF > 0 ? Math.max(0, Math.min(1, 1 - e.windup / s.duelTellF)) : 0;
  const style = isDuelist && w01 > 0 ? s.duelStyle : "";
  const h = (HB_H[e.key] || 400) * p.scale;
  const phase = (fnv1a(e.id) % 1024) / 1024 * TAU;
  const swayAmp = reduced ? 0 : waiting ? 0.009 : 0.022;
  const swayS = 1 + swayAmp * Math.sin(t * (waiting ? 0.8 : 1.35) + phase);
  const skew = reduced || waiting ? 0 : 0.02 * Math.sin(t * 0.9 + phase * 1.7);
  const loom = 1 + (reduced ? 0 : 0.07 * w01) + (efx ? efx.punch * 0.1 : 0);
  const feetY = p.feetY + (reduced ? 0 : 3 * w01);

  drawShadow(g, p.x, feetY, h * 0.22);
  g.save();
  if (waiting) g.globalAlpha *= 0.74; // held by the ring: waiting its turn
  g.translate(p.x, feetY);
  g.transform(1, 0, skew, 1, 0, 0);
  g.scale(swayS * loom, (2 - swayS) * loom);

  const im = legionImg(e.key);
  if (style === "heavy" && w01 > 0.02) {
    // the blood-red rise: revealed bottom-up as the swing nears (v1 pass)
    g.save();
    g.beginPath();
    g.rect(-h, -h * 1.1 * w01, h * 2, h * 1.2 * w01);
    g.clip();
    g.globalAlpha *= 0.35 + 0.4 * w01;
    if (im) {
      const gl = tintedSprite(im, PAL.blood);
      const side = h * 1.05;
      g.drawImage(gl, -side / 2, -side, side, side);
    } else {
      paintLegionFallback(g, e.key, h * 1.05, PAL.blood);
    }
    g.restore();
  } else if (style === "light" && w01 > 0.02) {
    // amber edge-glow: the whole silhouette warms behind the body
    g.save();
    g.globalAlpha *= 0.15 + 0.5 * w01;
    const side = h * 1.08;
    if (im) g.drawImage(tintedSprite(im, PAL.gold), -side / 2, -side, side, side);
    else paintLegionFallback(g, e.key, side, PAL.gold);
    g.restore();
  } else if (style === "feint" && w01 > 0.02) {
    // washed slate glow that NEVER fully lights: the ramp caps early
    const washed = Math.min(w01, 0.55);
    g.save();
    g.globalAlpha *= 0.12 + 0.3 * washed;
    const side = h * 1.06;
    if (im) g.drawImage(tintedSprite(im, PAL.steel), -side / 2, -side, side, side);
    else paintLegionFallback(g, e.key, side, PAL.steel);
    g.restore();
  }
  if (im) {
    const w = (im.naturalWidth / im.naturalHeight) * h;
    g.drawImage(im, -w / 2, -h, w, h);
    if (efx && efx.flash > 0.02) {
      g.globalAlpha *= Math.min(1, efx.flash);
      const fl = tintedSprite(im, efx.gold > 0 ? PAL.goldHi : "#ffffff");
      g.drawImage(fl, -h / 2, -h, h, h);
    }
  } else {
    paintLegionFallback(g, e.key, h, null);
    if (efx && efx.flash > 0.02) {
      g.globalAlpha *= Math.min(1, efx.flash);
      paintLegionFallback(g, e.key, h, efx.gold > 0 ? PAL.goldHi : "#ffffff");
    }
  }
  g.restore();

  // heavy req-side chevrons, screen space (no sway/skew wobble): they point
  // the dodge that beats the strike; reduced motion keeps the alpha ramp only
  if (style === "heavy" && w01 > 0.02) {
    const showL = s.duelReq === "L" || s.duelReq === "any";
    const showR = s.duelReq === "R" || s.duelReq === "any";
    const cy = feetY - h * 0.48;
    const size = Math.max(10, 16 * p.scale);
    const a = 0.25 + 0.6 * w01 + (reduced ? 0 : 0.1 * Math.sin(t * 9));
    g.save();
    g.strokeStyle = PAL.blood;
    g.lineWidth = 4;
    g.lineCap = "round";
    g.globalAlpha = Math.max(0, Math.min(1, a));
    if (showL) {
      chevron(g, p.x - h * 0.5 - 10, cy, size, 3);
      chevron(g, p.x - h * 0.5 + 8, cy, size, 3);
    }
    if (showR) {
      chevron(g, p.x + h * 0.5 + 10, cy, size, 1);
      chevron(g, p.x + h * 0.5 - 8, cy, size, 1);
    }
    g.restore();
    g.globalAlpha = 1;
  }
}

// ── set dressing (chests, stairs) ───────────────────────────────────────────

function drawChest(g: CanvasRenderingContext2D, x: number, fy: number, sc: number, open: boolean): void {
  const w = 100 * sc;
  const h = 52 * sc;
  drawShadow(g, x, fy, w * 0.55);
  g.fillStyle = open ? "#352a1e" : "#4a3826";
  rr(g, x - w / 2, fy - h, w, h, 4 * sc);
  g.fill();
  if (open) {
    g.fillStyle = "#0b0d12";
    g.fillRect(x - w * 0.42, fy - h * 0.92, w * 0.84, h * 0.42);
    g.fillStyle = "#2e2418";
    g.fillRect(x - w / 2, fy - h - 8 * sc, w, 7 * sc);
  } else {
    g.fillStyle = "#5a4630";
    g.beginPath();
    g.moveTo(x - w / 2, fy - h);
    g.quadraticCurveTo(x, fy - h - 18 * sc, x + w / 2, fy - h);
    g.closePath();
    g.fill();
  }
  g.fillStyle = open ? "#6a5a30" : PAL.gold;
  g.fillRect(x - 3 * sc, fy - h - (open ? 8 : 6) * sc, 6 * sc, open ? 8 * sc : h + 6 * sc);
}

function drawStairs(g: CanvasRenderingContext2D, x: number, fy: number, sc: number): void {
  const wN = 150 * sc; // near edge width
  const wF = 92 * sc;
  const hh = 58 * sc;
  g.fillStyle = "#05060a";
  g.beginPath();
  g.moveTo(x - wN / 2, fy);
  g.lineTo(x + wN / 2, fy);
  g.lineTo(x + wF / 2, fy - hh);
  g.lineTo(x - wF / 2, fy - hh);
  g.closePath();
  g.fill();
  for (let i = 0; i < 3; i++) {
    const k = (i + 1) / 4;
    const w = wN + (wF - wN) * k;
    const yy = fy - hh * k;
    g.strokeStyle = `rgba(90,106,134,${0.5 - i * 0.13})`;
    g.lineWidth = Math.max(1, 2 * sc);
    g.beginPath();
    g.moveTo(x - w / 2, yy);
    g.lineTo(x + w / 2, yy);
    g.stroke();
  }
  g.strokeStyle = "rgba(240,179,64,0.5)";
  g.lineWidth = Math.max(1, 2.5 * sc);
  g.beginPath();
  g.moveTo(x - wN / 2, fy);
  g.lineTo(x + wN / 2, fy);
  g.stroke();
}

// ── the corridor scene (offscreen target; the beauty pass) ──────────────────

const P_ENEMY: ProjOut[] = [];
for (let i = 0; i < 8; i++) P_ENEMY.push(mkProj());
const P_CHEST: ProjOut[] = [mkProj(), mkProj()];
const P_STAIRS = mkProj();

function fillQuad(g: CanvasRenderingContext2D, q: SideQuad, mirror: boolean, style: string): void {
  const m = (x: number): number => (mirror ? DESIGN_W - x : x);
  g.fillStyle = style;
  g.beginPath();
  g.moveTo(m(q.x0), q.y0a);
  g.lineTo(m(q.x1), q.y1a);
  g.lineTo(m(q.x1), q.y1b);
  g.lineTo(m(q.x0), q.y0b);
  g.closePath();
  g.fill();
}

const FB_FRONT = "#4a5164";
const FB_SIDE = "#3c4252";
const FB_FLOOR = "#3f4451";
const FB_CEIL = "#2b3040";

/** Paint the whole corridor view (walls + plates + fog ladder + dressing +
 * billboards) from state into g (a DESIGN_W x DESIGN_H offscreen). Returns
 * the number of visible enemy billboards (the client's animate-dirty bit). */
export function renderScene(g: CanvasRenderingContext2D, s: CryptState, t: number, fx: Fx, reduced: boolean): number {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = FOG_CSS;
  g.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // plates first: sides/fronts (alpha-edged) always paint over them
  const fim = img(FLOOR_SRC);
  if (fim) g.drawImage(fim, FLOOR_RECT[0], FLOOR_RECT[1]);
  else {
    g.fillStyle = FB_FLOOR;
    g.fillRect(FLOOR_RECT[0], FLOOR_RECT[1], FLOOR_RECT[2], FLOOR_RECT[3]);
  }
  const cim = img(CEIL_SRC);
  if (cim) g.drawImage(cim, CEIL_RECT[0], CEIL_RECT[1]);
  else {
    g.fillStyle = FB_CEIL;
    g.fillRect(CEIL_RECT[0], CEIL_RECT[1], CEIL_RECT[2], CEIL_RECT[3]);
  }

  const f = s.facing;
  const fdx = DIR_DX[f];
  const fdy = DIR_DY[f];
  const ldx = DIR_DX[(f + 3) & 3];
  const ldy = DIR_DY[(f + 3) & 3];

  // where does the corridor close? (front wall covers everything deeper)
  let closeZ = DEPTHS; // 4 = open through; fog cap
  for (let z = 0; z < DEPTHS; z++) {
    if (cryptWallAt(s, s.x + fdx * (z + 1), s.y + fdy * (z + 1))) {
      closeZ = z;
      break;
    }
  }
  if (closeZ === DEPTHS) {
    g.fillStyle = FOG_CSS;
    g.fillRect(CAP_RECT[0], CAP_RECT[1], CAP_RECT[2], CAP_RECT[3]);
  }

  // project the dressing + the legion once
  const ch = CHUNKS[s.chunkIdx];
  projectCell(s, ch.stairs.x, ch.stairs.y, P_STAIRS);
  for (let i = 0; i < 2; i++) {
    if (i < s.chests.length) projectCell(s, s.chests[i].x, s.chests[i].y, P_CHEST[i]);
    else P_CHEST[i].vis = false;
  }
  let visEnemies = 0;
  for (let i = 0; i < 8; i++) {
    if (i < s.enemies.length && s.enemies[i].hp > 0) {
      projectCell(s, s.enemies[i].x, s.enemies[i].y, P_ENEMY[i]);
      if (P_ENEMY[i].vis) visEnemies++;
    } else P_ENEMY[i].vis = false;
  }

  // painter's order: FAR to NEAR, fog fills between slices (meta contract)
  for (let z = Math.min(closeZ, DEPTHS - 1); z >= 0; z--) {
    const cx = s.x + fdx * (z + 1);
    const cy = s.y + fdy * (z + 1);
    if (z === closeZ) {
      // the closing front wall: slice-z content, UNDER the plane-z fog step
      const r = FRONT_RECT[z];
      const im = img(FRONT_SRC[variantIdx(s.depth, cx, cy)][z]);
      if (im) g.drawImage(im, r.x, r.y);
      else {
        g.fillStyle = FB_FRONT;
        g.fillRect(r.x, r.y, r.w, r.h);
      }
      if (FOG_FILL[z]) {
        const fr = FOG_STEP_RECT[z];
        g.fillStyle = FOG_FILL[z];
        g.fillRect(fr[0], fr[1], fr[2], fr[3]);
      }
      continue; // a closed slice has no sides, dressing or bodies
    }
    // side walls (left piece; right = mirrored per meta) or dark openings
    const lq = LEFT_QUAD[z];
    const lwx = cx + ldx;
    const lwy = cy + ldy;
    if (cryptWallAt(s, lwx, lwy)) {
      const im = img(LEFT_SRC[variantIdx(s.depth, lwx, lwy)][z]);
      if (im) {
        const r = LEFT_RECT[z];
        g.drawImage(im, r.x, r.y);
      } else fillQuad(g, lq, false, FB_SIDE);
    } else fillQuad(g, lq, false, FOG_CSS);
    const rwx = cx - ldx;
    const rwy = cy - ldy;
    if (cryptWallAt(s, rwx, rwy)) {
      const im = img(LEFT_SRC[variantIdx(s.depth, rwx, rwy)][z]);
      if (im) {
        const r = LEFT_RECT[z];
        g.save();
        g.translate(DESIGN_W, 0);
        g.scale(-1, 1);
        g.drawImage(im, r.x, r.y);
        g.restore();
      } else fillQuad(g, lq, true, FB_SIDE);
    } else fillQuad(g, lq, true, FOG_CSS);
    // floor dressing lives under the slice fog (it recedes with the stone)
    if (P_STAIRS.vis && P_STAIRS.z === z) drawStairs(g, P_STAIRS.x, P_STAIRS.feetY, P_STAIRS.scale);
    for (let i = 0; i < 2; i++)
      if (P_CHEST[i].vis && P_CHEST[i].z === z) drawChest(g, P_CHEST[i].x, P_CHEST[i].feetY, P_CHEST[i].scale, s.chests[i].open === 1);
    // the slice's fog step
    if (FOG_FILL[z]) {
      const fr = FOG_STEP_RECT[z];
      g.fillStyle = FOG_FILL[z];
      g.fillRect(fr[0], fr[1], fr[2], fr[3]);
    }
    // billboards OVER their slice's fog (they are in the slice) - sides
    // first so a center body reads nearest
    for (let pass = 0; pass < 3; pass++) {
      const wantLat = pass === 0 ? -1 : pass === 1 ? 1 : 0;
      for (let i = 0; i < 8; i++) {
        const p = P_ENEMY[i];
        if (p.vis && p.z === z && p.lat === wantLat) drawBillboard(g, s, s.enemies[i], p, t, fx, reduced);
      }
    }
  }
  return visEnemies;
}

// ── baked overlays (torch vignette, hurt vignette) ──────────────────────────

let torchC: HTMLCanvasElement | null = null;
export function torchPlate(): HTMLCanvasElement {
  if (torchC) return torchC;
  const c = document.createElement("canvas");
  c.width = DESIGN_W;
  c.height = DESIGN_H;
  const g = c.getContext("2d")!;
  const r = Math.hypot(DESIGN_W, DESIGN_H) / 2;
  const grad = g.createRadialGradient(VPX, VPY + 30, r * 0.18, VPX, VPY, r * 1.02);
  grad.addColorStop(0, "rgba(255,174,102,0.10)");
  grad.addColorStop(0.42, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(4,5,9,0.62)");
  g.fillStyle = grad;
  g.fillRect(0, 0, DESIGN_W, DESIGN_H);
  torchC = c;
  return c;
}

/** The TELL vignette: a neutral ink darkening at the edges that ramps in as
 * the duelist's telegraph fills. Pure alpha ramp - reduced-motion safe. */
let tellC: HTMLCanvasElement | null = null;
export function tellPlate(): HTMLCanvasElement {
  if (tellC) return tellC;
  const c = document.createElement("canvas");
  c.width = DESIGN_W;
  c.height = DESIGN_H;
  const g = c.getContext("2d")!;
  const r = Math.hypot(DESIGN_W, DESIGN_H) / 2;
  const grad = g.createRadialGradient(VPX, VPY, r * 0.3, VPX, VPY, r);
  grad.addColorStop(0, "rgba(4,5,9,0)");
  grad.addColorStop(1, "rgba(4,5,9,0.7)");
  g.fillStyle = grad;
  g.fillRect(0, 0, DESIGN_W, DESIGN_H);
  tellC = c;
  return c;
}

let hurtC: HTMLCanvasElement | null = null;
export function hurtPlate(): HTMLCanvasElement {
  if (hurtC) return hurtC;
  const c = document.createElement("canvas");
  c.width = DESIGN_W;
  c.height = DESIGN_H;
  const g = c.getContext("2d")!;
  const r = Math.hypot(DESIGN_W, DESIGN_H) / 2;
  const grad = g.createRadialGradient(VPX, VPY, r * 0.35, VPX, VPY, r);
  grad.addColorStop(0, "rgba(200,68,58,0)");
  grad.addColorStop(1, "rgba(200,68,58,0.55)");
  g.fillStyle = grad;
  g.fillRect(0, 0, DESIGN_W, DESIGN_H);
  hurtC = c;
  return c;
}

// ── combat theater painters ─────────────────────────────────────────────────

/** The hero's weapon arc, swiped across the faced cell. t01 runs 0..1. */
export function drawSlash(g: CanvasRenderingContext2D, x: number, y: number, sc: number, t01: number, accent: string, whiff: boolean, crit: boolean): void {
  const a = Math.sin(Math.min(1, t01) * Math.PI);
  const r = 120 * sc;
  const sweep = -1.25 + 2.5 * t01; // radians, left to right
  const col = whiff ? "rgba(140,140,150," : crit ? "rgba(255,217,138," : null;
  g.save();
  g.translate(x, y);
  g.rotate(0.35);
  g.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const w = (10 - i * 3) * sc;
    const al = a * (0.55 - i * 0.14);
    g.strokeStyle = col ? `${col}${al})` : accent;
    g.globalAlpha = col ? 1 : al;
    g.lineWidth = Math.max(1, w);
    g.beginPath();
    g.arc(0, 0, r - i * 9 * sc, sweep - 0.9, sweep + 0.25);
    g.stroke();
  }
  g.restore();
  g.globalAlpha = 1;
}

/** Death theater: the billboard folds down into the floor. */
export function drawCollapse(g: CanvasRenderingContext2D, key: string, x: number, feetY: number, sc: number, t01: number): void {
  const h = (HB_H[key] || 400) * sc;
  const squash = Math.max(0.04, 1 - t01);
  const al = Math.max(0, 1 - t01 * 1.15);
  g.save();
  g.globalAlpha = al;
  g.translate(x, feetY);
  g.scale(1 + t01 * 0.35, squash);
  const im = legionImg(key);
  if (im) {
    const tc = tintedSprite(im, PAL.bone);
    g.drawImage(tc, -h / 2, -h, h, h);
  } else {
    paintLegionFallback(g, key, h, PAL.bone);
  }
  g.restore();
}

export function drawBone(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  g.globalAlpha = a;
  g.fillStyle = PAL.bone;
  g.fillRect(x - r, y - r * 0.5, r * 2, r);
  g.globalAlpha = 1;
}

// ── the d20 (gauntlet's star treatment, local copy) ─────────────────────────

export const DIE_HIT = 0;
export const DIE_CRIT = 1;
export const DIE_MISS = 2;
export const DIE_NAT1 = 3;
export const DIE_FOE_HIT = 4;
export const DIE_FOE_MISS = 5;

/** Rim hue law (dice ownership pass, lane-4 convention): every kind reads at
 * a glance and no two kinds share a family. Player nat 1 = DEEP CRIMSON
 * (#8e1f1f family); the legion hitting you = HOSTILE RUST (#c96a2e family);
 * the legion missing = light WARM BONE grey, lightened well away from the
 * player's cool mid-grey miss. */
const DIE_COL: readonly { rim: string; face: string; num: string; glow: string }[] = [
  { rim: "#59d98c", face: "#12241c", num: "#a8f2c8", glow: "rgba(89,217,140,0.35)" }, // hit
  { rim: "#f0b340", face: "#241c0e", num: "#ffe2a0", glow: "rgba(240,179,64,0.5)" }, // crit
  { rim: "#6c7484", face: "#171a20", num: "#9aa2b0", glow: "rgba(0,0,0,0)" }, // miss (cool grey)
  { rim: "#8e1f1f", face: "#1c0a0a", num: "#d98a80", glow: "rgba(142,31,31,0.45)" }, // nat 1 (deep crimson)
  { rim: "#c96a2e", face: "#201209", num: "#f2c49a", glow: "rgba(201,106,46,0.3)" }, // the legion hits you (rust)
  { rim: "#9a917c", face: "#191713", num: "#c4bba6", glow: "rgba(0,0,0,0)" }, // the legion misses (warm bone)
];

/** The star of the show. `opts.label` names the roller under the die ("YOU" /
 * the enemy's name); `opts.accent` colors that label (the class accent for
 * hero dice). Lane-4 signature, kept in lockstep with gauntlet's drawD20. */
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

const COMPASS = ["N", "E", "S", "W"];

export function drawHud(g: CanvasRenderingContext2D, s: CryptState): void {
  // hp bar, top-left
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
  // the belt: three draught flasks
  for (let i = 0; i < 3; i++) {
    const cx = 26 + i * 24;
    const cy = 52;
    const full = i < s.belt;
    g.fillStyle = full ? PAL.potion : "rgba(200,90,112,0.12)";
    g.beginPath();
    g.arc(cx, cy + 2, 7, 0, TAU);
    g.fill();
    g.fillStyle = full ? PAL.potion : "rgba(200,90,112,0.12)";
    g.fillRect(cx - 2.5, cy - 9, 5, 6);
    if (!full) {
      g.strokeStyle = "rgba(200,90,112,0.4)";
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx, cy + 2, 7, 0, TAU);
      g.stroke();
    }
  }
  // whetstone pips
  const whets = Math.min(6, s.whet);
  for (let i = 0; i < whets; i++) {
    const cx = 106 + i * 15;
    g.fillStyle = PAL.gold;
    g.beginPath();
    g.moveTo(cx, 44);
    g.lineTo(cx + 6, 58);
    g.lineTo(cx - 6, 58);
    g.closePath();
    g.fill();
  }
  if (whets > 0) txt(g, `+${s.whet}`, 106 + whets * 15 + 6, 52, 11, PAL.gold, "left", 700);
  // depth / kills / score, top-right
  txt(g, `DEPTH ${s.depth}`, DESIGN_W - 16, 24, 21, PAL.text, "right");
  txt(g, `KILLS ${s.kills}`, DESIGN_W - 16, 46, 12, PAL.dim, "right", 700);
  txt(g, `SCORE ${cryptScore(s)}`, DESIGN_W - 16, 64, 13, PAL.gold, "right", 700);
  // facing compass, top-center
  g.fillStyle = "rgba(9,11,16,0.7)";
  rr(g, DESIGN_W / 2 - 52, 10, 104, 26, 13);
  g.fill();
  txt(g, COMPASS[(s.facing + 3) & 3], DESIGN_W / 2 - 32, 23, 11, PAL.dim, "center", 700);
  txt(g, COMPASS[s.facing], DESIGN_W / 2, 23, 16, PAL.gold);
  txt(g, COMPASS[(s.facing + 1) & 3], DESIGN_W / 2 + 32, 23, 11, PAL.dim, "center", 700);
  // class identity (display only; KITS strings never enter sim state)
  const kit = KITS[s.classId];
  if (kit) {
    // the class chip: kit title in the class accent, bottom-left, permanent
    // (sits under the duel pips at DESIGN_H-64/-36, clear of the dice band)
    const chipLabel = kit.title.toUpperCase();
    g.save();
    g.font = font(9, 700);
    const chipW = g.measureText(chipLabel).width + 16;
    g.fillStyle = "rgba(9,11,16,0.7)";
    rr(g, 16, DESIGN_H - 24, chipW, 16, 8);
    g.fill();
    txt(g, chipLabel, 24, DESIGN_H - 16, 9, CLASS_ACCENT[s.classId], "left", 700);
    g.restore();
    // the intro line: title + passive under the top HUD for the first ~5s,
    // fading out over the last second (drawBanner's sub-line idiom)
    const INTRO_F = 300; // ~5s at 60fps
    if (s.frame < INTRO_F) {
      const a = Math.min(1, (INTRO_F - s.frame) / 60);
      g.save();
      g.globalAlpha = a * 0.9;
      txt(g, `${chipLabel} · ${kit.passive}`, DESIGN_W / 2, 96, 12, PAL.dim, "center", 700);
      g.restore();
    }
  }
}

// ── the duel HUD (CRYPT DUELS: nameplate, queue pips, cooldowns, tell) ──────

/** One cooldown pip: label + fill bar, lit in `readyColor` when ready. */
function drawCdPip(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  cd: number,
  cdF: number,
  readyColor: string,
): void {
  const w = 86;
  const h = 8;
  const ready = cd <= 0;
  const k = cdF > 0 ? 1 - cd / cdF : 1;
  txt(g, label, x, y - 9, 9, ready ? readyColor : PAL.dim, "left", 700);
  g.fillStyle = "rgba(9,11,16,0.8)";
  rr(g, x, y - 2, w, h, 3);
  g.fill();
  g.fillStyle = ready ? readyColor : PAL.steel;
  rr(g, x + 1, y - 1, Math.max(2, (w - 2) * Math.max(0, Math.min(1, k))), h - 2, 2);
  g.fill();
}

/** Everything the locked duel adds over the base HUD: the TELL vignette, the
 * duelist nameplate (name + damage dice + hp bar, top-centre under the
 * compass - the "why things hurt" fix), the challenger queue pips, and the
 * dodge/skill cooldown pips bottom-left. Draw AFTER drawHud. */
export function drawDuelHud(g: CanvasRenderingContext2D, s: CryptState): void {
  if (s.duelId === "") return;
  let e: EnemyState | null = null;
  for (const en of s.enemies)
    if (en.id === s.duelId && en.hp > 0) {
      e = en;
      break;
    }
  if (!e) return;
  // the TELL vignette: subtle, keyed to the telegraph ramp (alpha only)
  if (s.duelPhase === DP_TELL && s.duelTellF > 0) {
    const w01 = Math.max(0, Math.min(1, 1 - e.windup / s.duelTellF));
    g.globalAlpha = 0.1 + 0.24 * w01;
    g.drawImage(tellPlate(), 0, 0);
    g.globalAlpha = 1;
  }
  // nameplate + damage line + hp bar, top-centre under the compass
  const pw = 280;
  const px0 = (DESIGN_W - pw) / 2;
  g.fillStyle = "rgba(9,11,16,0.85)";
  rr(g, px0, 42, pw, 44, 6);
  g.fill();
  const dmgLine = `${e.dmgC}d${e.dmgS}${e.dmgB > 0 ? `+${e.dmgB}` : ""}`;
  txt(g, `${e.name.toUpperCase()} · ${dmgLine}`, DESIGN_W / 2, 56, 14, PAL.text);
  const bw = pw - 24;
  g.fillStyle = "#101319";
  rr(g, px0 + 12, 68, bw, 10, 3);
  g.fill();
  const pct = Math.max(0, e.hp / e.hpMax);
  if (pct > 0) {
    g.fillStyle = PAL.blood;
    rr(g, px0 + 13, 69, Math.max(2, (bw - 2) * pct), 8, 2);
    g.fill();
  }
  // the queue: living challengers still waiting their turn
  let queue = 0;
  for (const q of s.enemies) if (q.hp > 0 && q.id !== e.id) queue += 1;
  if (queue > 0) {
    const qx = px0 + pw + 12;
    txt(g, `NEXT x${queue}`, qx, 52, 11, PAL.dim, "left", 700);
    g.fillStyle = PAL.dim;
    const n = Math.min(5, queue);
    for (let i = 0; i < n; i++) {
      g.beginPath();
      g.arc(qx + 5 + i * 13, 68, 4, 0, TAU);
      g.fill();
    }
  }
  // dodge + class-skill cooldown pips, bottom-left (clear of the dice band)
  drawCdPip(g, 16, DESIGN_H - 64, "DODGE", s.dodgeCd, s.dodgeCdF, PAL.text);
  drawCdPip(g, 16, DESIGN_H - 36, "SKILL", s.skillCd, s.skillCdF, CLASS_ACCENT[s.classId]);
}

// ── crosshair (the faced enemy, sim's own facedEnemy result) ────────────────

export function drawTargetBrackets(g: CanvasRenderingContext2D, p: ProjOut, key: string, accent: string, t: number): void {
  const h = (HB_H[key] || 400) * p.scale;
  const w = h * 0.55;
  const x0 = p.x - w / 2;
  const y0 = p.feetY - h;
  const L = Math.max(8, w * 0.18);
  g.save();
  g.globalAlpha = 0.4 + 0.12 * Math.sin(t * 3.2);
  g.strokeStyle = accent;
  g.lineWidth = 2;
  bracket(g, x0, y0, 1, 1, L);
  bracket(g, x0 + w, y0, -1, 1, L);
  bracket(g, x0, p.feetY, 1, -1, L);
  bracket(g, x0 + w, p.feetY, -1, -1, L);
  g.restore();
}

function bracket(g: CanvasRenderingContext2D, cx: number, cy: number, sx: number, sy: number, L: number): void {
  g.beginPath();
  g.moveTo(cx + sx * L, cy);
  g.lineTo(cx, cy);
  g.lineTo(cx, cy + sy * L);
  g.stroke();
}

// ── input zone hints (display only; the sim owns the zones) ─────────────────

function chevron(g: CanvasRenderingContext2D, x: number, y: number, size: number, dir: number): void {
  // dir: 0 up, 1 right, 2 down, 3 left
  const a = dir * (Math.PI / 2);
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.beginPath();
  g.moveTo(-size, size * 0.6);
  g.lineTo(0, -size * 0.6);
  g.lineTo(size, size * 0.6);
  g.stroke();
  g.restore();
}

export function drawZoneHints(
  g: CanvasRenderingContext2D,
  px: number,
  py: number,
  fade: number,
  turnLX: number,
  turnRX: number,
  fwdSplitY: number,
): void {
  if (fade <= 0.01) return;
  const inL = px < turnLX;
  const inR = px > turnRX;
  const mid = !inL && !inR;
  const inF = mid && py < fwdSplitY;
  const inB = mid && py >= fwdSplitY;
  g.save();
  g.lineWidth = 3;
  g.lineCap = "round";
  const base = 0.16 * fade;
  const hot = 0.5 * fade;
  g.strokeStyle = PAL.text;
  g.globalAlpha = inL ? hot : base;
  chevron(g, turnLX * DESIGN_W * 0.5, DESIGN_H / 2, 16, 3);
  g.globalAlpha = inR ? hot : base;
  chevron(g, DESIGN_W - turnLX * DESIGN_W * 0.5, DESIGN_H / 2, 16, 1);
  g.globalAlpha = inF ? hot : base;
  chevron(g, DESIGN_W / 2, DESIGN_H * 0.24, 15, 0);
  g.globalAlpha = inB ? hot : base;
  chevron(g, DESIGN_W / 2, DESIGN_H * 0.86, 15, 2);
  // attack glint dead center (space swings; a hint, not a zone)
  g.globalAlpha = (mid ? 0.4 : 0.18) * fade;
  g.strokeStyle = PAL.gold;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(VPX - 9, VPY);
  g.lineTo(VPX + 9, VPY);
  g.moveTo(VPX, VPY - 9);
  g.lineTo(VPX, VPY + 9);
  g.stroke();
  g.restore();
  g.globalAlpha = 1;
}

// ── duel zone hints (same zones, re-meant during a lock) ────────────────────

function swordGlyph(g: CanvasRenderingContext2D, x: number, y: number, sz: number): void {
  g.beginPath();
  g.moveTo(x, y - sz);
  g.lineTo(x, y + sz * 0.95);
  g.moveTo(x - sz * 0.45, y + sz * 0.55);
  g.lineTo(x + sz * 0.45, y + sz * 0.55);
  g.stroke();
}

function shieldPath(g: CanvasRenderingContext2D, x: number, y: number, sz: number): void {
  g.beginPath();
  g.moveTo(x - sz * 0.7, y - sz * 0.8);
  g.lineTo(x + sz * 0.7, y - sz * 0.8);
  g.lineTo(x + sz * 0.7, y);
  g.quadraticCurveTo(x + sz * 0.7, y + sz * 0.7, x, y + sz);
  g.quadraticCurveTo(x - sz * 0.7, y + sz * 0.7, x - sz * 0.7, y);
  g.closePath();
}

function sparkGlyph(g: CanvasRenderingContext2D, x: number, y: number, sz: number): void {
  g.beginPath();
  g.moveTo(x, y - sz);
  g.quadraticCurveTo(x + sz * 0.18, y - sz * 0.18, x + sz, y);
  g.quadraticCurveTo(x + sz * 0.18, y + sz * 0.18, x, y + sz);
  g.quadraticCurveTo(x - sz * 0.18, y + sz * 0.18, x - sz, y);
  g.quadraticCurveTo(x - sz * 0.18, y - sz * 0.18, x, y - sz);
  g.closePath();
  g.fill();
}

/** The duel overlay for the SAME zones: L/R sidestep chevrons, a sword for
 * the mid-top strike, a shield for the mid-bottom guard hold, a class-accent
 * spark for the space skill. Positions keep the whole dice band (mid-screen)
 * clear on every viewport. Exploration hints stay drawZoneHints, unchanged. */
export function drawDuelZoneHints(
  g: CanvasRenderingContext2D,
  px: number,
  py: number,
  fade: number,
  turnLX: number,
  turnRX: number,
  fwdSplitY: number,
  accent: string,
): void {
  if (fade <= 0.01) return;
  const inL = px < turnLX;
  const inR = px > turnRX;
  const mid = !inL && !inR;
  const inF = mid && py < fwdSplitY;
  const inB = mid && py >= fwdSplitY;
  g.save();
  g.lineWidth = 3;
  g.lineCap = "round";
  const base = 0.18 * fade;
  const hot = 0.55 * fade;
  g.strokeStyle = PAL.text;
  // sidestep chevrons (doubled: a step, not a turn)
  g.globalAlpha = inL ? hot : base;
  chevron(g, turnLX * DESIGN_W * 0.5 - 9, DESIGN_H / 2, 13, 3);
  chevron(g, turnLX * DESIGN_W * 0.5 + 9, DESIGN_H / 2, 13, 3);
  g.globalAlpha = inR ? hot : base;
  chevron(g, DESIGN_W - turnLX * DESIGN_W * 0.5 + 9, DESIGN_H / 2, 13, 1);
  chevron(g, DESIGN_W - turnLX * DESIGN_W * 0.5 - 9, DESIGN_H / 2, 13, 1);
  // strike: the sword, mid-top
  g.globalAlpha = inF ? hot : base;
  swordGlyph(g, DESIGN_W / 2, DESIGN_H * 0.22, 18);
  txt(g, "STRIKE", DESIGN_W / 2, DESIGN_H * 0.22 + 32, 10, PAL.text, "center", 700);
  // guard: the shield, mid-bottom (a HOLD, said plainly)
  g.globalAlpha = inB ? hot : base;
  shieldPath(g, DESIGN_W / 2, DESIGN_H * 0.85, 15);
  g.stroke();
  txt(g, "HOLD TO GUARD", DESIGN_W / 2, DESIGN_H * 0.85 + 30, 10, PAL.text, "center", 700);
  // class skill: the accent spark (space / the shell's action key)
  g.globalAlpha = 0.5 * fade;
  g.fillStyle = accent;
  sparkGlyph(g, DESIGN_W / 2 - 24, DESIGN_H * 0.945, 8);
  txt(g, "SKILL", DESIGN_W / 2 - 10, DESIGN_H * 0.945, 10, accent, "left", 700);
  g.restore();
  g.globalAlpha = 1;
}

/** "GUARDED" shield flash: a steel shield pulsing at the guard line. `k`
 * runs 1 -> 0; reduced motion drops the grow and keeps the alpha fade. */
export function drawGuardFlash(g: CanvasRenderingContext2D, k: number, reduced: boolean): void {
  if (k <= 0.01) return;
  const x = DESIGN_W / 2;
  const y = 468;
  const sz = 26 * (reduced ? 1 : 1 + (1 - k) * 0.22);
  g.save();
  g.globalAlpha = Math.min(1, k) * 0.85;
  g.strokeStyle = PAL.steel;
  g.lineWidth = 4;
  shieldPath(g, x, y, sz);
  g.stroke();
  g.globalAlpha = Math.min(1, k) * 0.3;
  g.fillStyle = PAL.steel;
  shieldPath(g, x, y, sz);
  g.fill();
  g.restore();
  g.globalAlpha = 1;
}

// ── minimap (dev nicety, key M, OFF by default) ─────────────────────────────

export function drawMinimap(g: CanvasRenderingContext2D, s: CryptState): void {
  const ch = CHUNKS[s.chunkIdx];
  const cs = 9;
  const mw = ch.w * cs;
  const mh = ch.h * cs;
  const ox = DESIGN_W - mw - 14;
  const oy = 78;
  g.save();
  g.globalAlpha = 0.92;
  g.fillStyle = "rgba(7,8,12,0.85)";
  g.fillRect(ox - 4, oy - 4, mw + 8, mh + 8);
  for (let y = 0; y < ch.h; y++)
    for (let x = 0; x < ch.w; x++) {
      g.fillStyle = ch.cells[y * ch.w + x] === 1 ? "#232a38" : "#3d4454";
      g.fillRect(ox + x * cs, oy + y * cs, cs - 1, cs - 1);
    }
  g.fillStyle = PAL.gold;
  g.fillRect(ox + ch.stairs.x * cs + 1, oy + ch.stairs.y * cs + 1, cs - 3, cs - 3);
  for (const c of s.chests) {
    if (c.open === 1) continue;
    g.fillStyle = "#d8b13f";
    g.fillRect(ox + c.x * cs + 2, oy + c.y * cs + 2, cs - 5, cs - 5);
  }
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    g.fillStyle = PAL.blood;
    g.beginPath();
    g.arc(ox + e.x * cs + cs / 2 - 0.5, oy + e.y * cs + cs / 2 - 0.5, cs * 0.3, 0, TAU);
    g.fill();
  }
  // hero arrow
  g.fillStyle = "#59d98c";
  g.save();
  g.translate(ox + s.x * cs + cs / 2 - 0.5, oy + s.y * cs + cs / 2 - 0.5);
  g.rotate((s.facing * Math.PI) / 2);
  g.beginPath();
  g.moveTo(0, -cs * 0.42);
  g.lineTo(cs * 0.34, cs * 0.34);
  g.lineTo(-cs * 0.34, cs * 0.34);
  g.closePath();
  g.fill();
  g.restore();
  g.restore();
}

// ── banners + overlays ──────────────────────────────────────────────────────

export function drawBanner(g: CanvasRenderingContext2D, text: string, sub: string, t: number, color: string): void {
  const life = 2.2;
  if (t <= 0 || t >= life) return;
  const a = Math.min(1, t / 0.18) * Math.min(1, (life - t) / 0.4);
  g.save();
  g.globalAlpha = a * 0.75;
  g.fillStyle = "#05060a";
  const w = 460;
  rr(g, (DESIGN_W - w) / 2, 108, w, sub ? 64 : 48, 6);
  g.fill();
  g.globalAlpha = a;
  txt(g, text, DESIGN_W / 2, 134, 25, color);
  if (sub) txt(g, sub, DESIGN_W / 2, 158, 12, PAL.dim, "center", 700);
  g.restore();
}

export function drawDeadOverlay(g: CanvasRenderingContext2D, score: number, depth: number, kills: number, t: number): void {
  const a = Math.min(1, t / 0.9);
  g.fillStyle = `rgba(8,4,6,${0.84 * a})`;
  g.fillRect(0, 0, DESIGN_W, DESIGN_H);
  if (a < 0.35) return;
  const b = Math.min(1, (t - 0.25) / 0.6);
  g.globalAlpha = b;
  txt(g, "THE CRYPT KEEPS YOU", DESIGN_W / 2, 218, 32, PAL.blood);
  txt(g, String(score), DESIGN_W / 2, 282, 52, PAL.gold);
  txt(g, `DEPTH ${depth} · KILLS ${kills}`, DESIGN_W / 2, 330, 14, PAL.dim, "center", 700);
  if (t > 1.1) {
    const blink = 0.5 + 0.5 * Math.sin(t * 4);
    g.globalAlpha = b * (0.4 + 0.6 * blink);
    txt(g, "TAP OR PRESS SPACE TO RISE AGAIN", DESIGN_W / 2, 386, 13, PAL.text, "center", 700);
  }
  g.globalAlpha = 1;
}
