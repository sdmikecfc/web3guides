/**
 * THE PORTRAIT COMPOSITOR: one robot, one square picture, four colours.
 *
 * WHAT IT IS FOR. Every small picture of a robot in the game was flat. The
 * fights list drew a grey clay dummy, the board drew the same dummy, and the
 * knockout card composed the real part art with no paint on it at all. A
 * robot is normally FOUR colours at once, so all three were showing a
 * different robot from the one in the garage. This module paints the parts
 * the way the ring paints them, adds what the robot chose and earned, and
 * hands back a PNG.
 *
 * WHY IT IS RAW PIXELS AND NOT next/og. The paint is a MULTIPLY of a part's
 * baked art by its own mask, tinted (rig.ts: `mask.blendMode = "multiply";
 * mask.tint = paint`). Satori has no blend modes, so a card built out of
 * <img> tags can only ever show the unpainted clay, which is exactly what the
 * knockout card was showing. The multiply has to happen over real pixels, so
 * this file owns a small PNG codec and a small rasterizer and nothing else.
 * No external service, no native module, no new dependency.
 *
 * WHERE THE NUMBERS COME FROM. Not from here. The assembly is
 * _view/pieces.ts (which piece, where, mirrored or not, and where a mark
 * goes) and the drawing of every mark is lib/bots/look.ts (one star, one
 * patch, one crown). This file knows how to put a colour on a pixel and
 * nothing about how a robot is shaped.
 *
 * NOTHING HERE REACHES THE SIM.
 */
import { deflateSync, inflateSync } from "node:zlib";
import type { Build } from "@/app/bots/_engine/parts";
import {
  BOUNDS,
  FIGURE_INK,
  PIECES,
  artFor,
  bodyTint,
  buildPaints,
  cuffAnchors,
  fitInSquare,
  findEyes,
  pieceTint,
  starRow,
  stickerAnchor,
  CROWN_ANCHOR,
  EYES_FALLBACK,
  HAT_ANCHOR,
  PATCH_ANCHORS,
  PLATE_ANCHOR,
  sparkleAnchors,
  type Box,
  type EyePoint,
  type Piece,
} from "@/app/bots/_view/pieces";
import {
  CROWN_MARK,
  CUFF_MARK,
  FACE_DIALS,
  GOLD_STAR_MARK,
  HAT_SHAPES,
  LID,
  PATCH_MARK,
  PLATE_MARK,
  SPARKLE_MARK,
  STAR_MARK,
  STICKER_SHAPES,
  contrastOn,
  digitShapes,
  inkColor,
  lidShapes,
  paintHex,
  scaleRgb,
  shapesBox,
  starPoly,
  type BotLook,
  type LookInk,
  type LookMarks,
  type LookShape,
} from "@/lib/bots/look";
import { FIGURE, RIG } from "@/app/bots/_view/rig-points";
import { K } from "@/app/bots/_ui/tokens";

// ── a very small PNG codec ──────────────────────────────────────────────────
/**
 * Enough PNG for our own art and no more: 8 bits a channel, no interlace,
 * grey / rgb / grey+alpha / palette / rgba. Everything the bake emits is
 * 8-bit RGBA non-interlaced (measured on all 80 shipped part files), so the
 * rest is only here so a hand-made file cannot crash a picture. Anything
 * this cannot read THROWS, and the caller treats a throw as a missing file
 * and draws the stand-in, which is the house law: every canvas keeps working
 * with public/bots-art removed.
 */
export interface Bitmap {
  w: number;
  h: number;
  /** straight (not premultiplied) RGBA, row major */
  px: Uint8Array;
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(buf: Uint8Array): Bitmap {
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIG[i]) throw new Error("not a png");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 8;
  let w = 0, h = 0, depth = 0, color = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (off + 8 <= buf.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = dv.getUint32(off + 8);
      h = dv.getUint32(off + 12);
      depth = buf[off + 16];
      color = buf[off + 17];
      interlace = buf[off + 20];
    } else if (type === "PLTE") palette = body.slice();
    else if (type === "tRNS") trns = body.slice();
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error(`png depth ${depth} unsupported`);
  if (interlace !== 0) throw new Error("interlaced png unsupported");
  const chan = color === 0 ? 1 : color === 2 ? 3 : color === 3 ? 1 : color === 4 ? 2 : color === 6 ? 4 : 0;
  if (!chan) throw new Error(`png colour type ${color} unsupported`);
  const raw = inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))));
  const stride = w * chan;
  const lines = new Uint8Array(stride * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[p + x];
      const a = x >= chan ? lines[row + x - chan] : 0;
      const b = y > 0 ? lines[prev + x] : 0;
      const c = y > 0 && x >= chan ? lines[prev + x - chan] : 0;
      lines[row + x] =
        filter === 0 ? v
        : filter === 1 ? (v + a) & 255
        : filter === 2 ? (v + b) & 255
        : filter === 3 ? (v + ((a + b) >> 1)) & 255
        : (v + paeth(a, b, c)) & 255;
    }
    p += stride;
  }
  const px = new Uint8Array(w * h * 4);
  for (let i = 0, n = w * h; i < n; i++) {
    const s = i * chan;
    const d = i * 4;
    if (color === 6) {
      px[d] = lines[s]; px[d + 1] = lines[s + 1]; px[d + 2] = lines[s + 2]; px[d + 3] = lines[s + 3];
    } else if (color === 2) {
      px[d] = lines[s]; px[d + 1] = lines[s + 1]; px[d + 2] = lines[s + 2]; px[d + 3] = 255;
    } else if (color === 0) {
      px[d] = px[d + 1] = px[d + 2] = lines[s]; px[d + 3] = 255;
    } else if (color === 4) {
      px[d] = px[d + 1] = px[d + 2] = lines[s]; px[d + 3] = lines[s + 1];
    } else {
      const k = lines[s] * 3;
      px[d] = palette ? palette[k] : 0;
      px[d + 1] = palette ? palette[k + 1] : 0;
      px[d + 2] = palette ? palette[k + 2] : 0;
      px[d + 3] = trns && lines[s] < trns.length ? trns[lines[s]] : 255;
    }
  }
  return { w, h, px };
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, body: Uint8Array): Buffer {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(body).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/** RGBA out, filtered per row by the cheapest of none / sub / up. */
export function encodePng(bm: Bitmap): Uint8Array {
  const stride = bm.w * 4;
  const raw = Buffer.alloc((stride + 1) * bm.h);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let y = 0; y < bm.h; y++) {
    const row = y * stride;
    const score = [0, 0, 0];
    for (let x = 0; x < stride; x++) {
      const v = bm.px[row + x];
      const a = x >= 4 ? bm.px[row + x - 4] : 0;
      const b = y > 0 ? bm.px[row - stride + x] : 0;
      cand[0][x] = v;
      cand[1][x] = (v - a) & 255;
      cand[2][x] = (v - b) & 255;
      for (let k = 0; k < 3; k++) score[k] += cand[k][x] < 128 ? cand[k][x] : 256 - cand[k][x];
    }
    let best = 0;
    for (let k = 1; k < 3; k++) if (score[k] < score[best]) best = k;
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(bm.w, 0);
  ihdr.writeUInt32BE(bm.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from(PNG_SIG),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 8 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── the canvas ──────────────────────────────────────────────────────────────

function blank(size: number): Bitmap {
  return { w: size, h: size, px: new Uint8Array(size * size * 4) };
}

/** straight-alpha source over straight-alpha destination */
function over(dst: Uint8Array, d: number, r: number, g: number, b: number, a: number): void {
  if (a <= 0) return;
  const da = dst[d + 3] / 255;
  const sa = a;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  dst[d] = Math.round((r * sa + dst[d] * da * (1 - sa)) / oa);
  dst[d + 1] = Math.round((g * sa + dst[d + 1] * da * (1 - sa)) / oa);
  dst[d + 2] = Math.round((b * sa + dst[d + 2] * da * (1 - sa)) / oa);
  dst[d + 3] = Math.round(oa * 255);
}

// ── drawing one part ────────────────────────────────────────────────────────

export interface PartArt {
  base: Bitmap;
  mask: Bitmap | null;
  /** the drawn extent inside the canvas, in canvas pixels */
  ink: { x0: number; y0: number; x1: number; y1: number } | null;
}

/** the alpha bounding box: what the canvas margin is hiding */
function inkBoxOf(bm: Bitmap): PartArt["ink"] {
  let x0 = bm.w, y0 = bm.h, x1 = -1, y1 = -1;
  for (let y = 0; y < bm.h; y++) {
    const row = y * bm.w * 4;
    for (let x = 0; x < bm.w; x++) {
      if (bm.px[row + x * 4 + 3] <= 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

export function partArtOf(base: Bitmap, mask: Bitmap | null): PartArt {
  return { base, mask, ink: inkBoxOf(base) };
}

interface Fit {
  scale: number;
  originX: number;
  originY: number;
}

/** where a unit-box mark actually lands, in figure space */
function markBox(shapes: readonly LookShape[], a: { x: number; y: number; s: number }): Box {
  const b = shapesBox(shapes);
  const minX = a.x + b.x0 * a.s;
  const minY = a.y + b.y0 * a.s;
  const maxX = a.x + b.x1 * a.s;
  const maxY = a.y + b.y1 * a.s;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function grow(box: Box, add: Box): Box {
  const minX = Math.min(box.minX, add.minX);
  const minY = Math.min(box.minY, add.minY);
  const maxX = Math.max(box.maxX, add.maxX);
  const maxY = Math.max(box.maxY, add.maxY);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * Draw one part into the square, painted.
 *
 * THE PAINT IS THE RIG'S PAINT: the base art, then the mask on top at
 * MULTIPLY tinted with the part's own colour. Where the mask is white and
 * opaque that is base x colour; where it is transparent the base is left
 * alone, which is how the sole's coral and the wind-up key's brass survive
 * every paint.
 *
 * The resampling is an AREA average, not a bilinear tap, because every size
 * this route serves is a reduction (a 560 unit figure into 64 to 432 px) and
 * a bilinear tap at 0.1 scale samples one pixel in a hundred: at 64 px the
 * eyes flickered in and out depending on the robot. Colour is averaged
 * PREMULTIPLIED so a transparent pixel's colour cannot leak into the edge.
 */
function drawPart(dst: Bitmap, art: PartArt, piece: Piece, tint: number, fit: Fit): void {
  const { base, mask } = art;
  const kx = base.w / piece.w;
  const ky = base.h / piece.h;
  const tr = ((tint >> 16) & 255) / 255;
  const tg = ((tint >> 8) & 255) / 255;
  const tb = (tint & 255) / 255;
  // the piece's destination rect
  const dx0 = (piece.x - fit.originX) * fit.scale;
  const dy0 = (piece.y - fit.originY) * fit.scale;
  const dw = piece.w * fit.scale;
  const dh = piece.h * fit.scale;
  const px0 = Math.max(0, Math.floor(dx0));
  const py0 = Math.max(0, Math.floor(dy0));
  const px1 = Math.min(dst.w, Math.ceil(dx0 + dw));
  const py1 = Math.min(dst.h, Math.ceil(dy0 + dh));
  const sPerPx = base.w / dw; // source pixels per destination pixel
  const sPerPy = base.h / dh;
  for (let py = py0; py < py1; py++) {
    const sy0 = Math.max(0, Math.floor((py - dy0) * sPerPy));
    const sy1 = Math.min(base.h, Math.max(sy0 + 1, Math.ceil((py + 1 - dy0) * sPerPy)));
    for (let px = px0; px < px1; px++) {
      let sx0 = Math.max(0, Math.floor((px - dx0) * sPerPx));
      let sx1 = Math.min(base.w, Math.max(sx0 + 1, Math.ceil((px + 1 - dx0) * sPerPx)));
      if (piece.mirror) {
        const f0 = base.w - sx1;
        const f1 = base.w - sx0;
        sx0 = f0;
        sx1 = f1;
      }
      let ar = 0, ag = 0, ab = 0, aa = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const srow = sy * base.w * 4;
        for (let sx = sx0; sx < sx1; sx++) {
          const s = srow + sx * 4;
          const a = base.px[s + 3] / 255;
          n++;
          if (a <= 0) continue;
          let r = base.px[s];
          let g = base.px[s + 1];
          let b = base.px[s + 2];
          if (mask) {
            // the mask lives on its own canvas; ours are the same size, but
            // never assume it and read it at the same fraction of the part
            const mx = mask.w === base.w ? sx : Math.min(mask.w - 1, Math.floor((sx / kx) * (mask.w / piece.w)));
            const my = mask.h === base.h ? sy : Math.min(mask.h - 1, Math.floor((sy / ky) * (mask.h / piece.h)));
            const m = (my * mask.w + mx) * 4;
            const ma = (mask.px[m + 3] / 255) * (mask.px[m] / 255);
            if (ma > 0) {
              r = r * (1 - ma) + r * tr * ma;
              g = g * (1 - ma) + g * tg * ma;
              b = b * (1 - ma) + b * tb * ma;
            }
          }
          ar += r * a;
          ag += g * a;
          ab += b * a;
          aa += a;
        }
      }
      if (n === 0 || aa <= 0) continue;
      const a = aa / n;
      over(dst.px, (py * dst.w + px) * 4, ar / aa, ag / aa, ab / aa, a);
    }
  }
}

// ── drawing a mark ──────────────────────────────────────────────────────────
/**
 * The shapes from look.ts, rasterized. Four primitives and a 4x4 coverage
 * sample per pixel, which is what makes a 15 unit star readable when the
 * whole robot is 64 px across: a hard-edged star at that size is four dark
 * pixels and a guess.
 */
const SS = 4;
const SS_STEP = 1 / SS;
const SS_HALF = SS_STEP / 2;

interface ShapeCtx {
  ground: number;
  own: number;
}

function insideRect(ux: number, uy: number, s: LookShape & { k: "rect" }): boolean {
  const x0 = s.x, y0 = s.y, x1 = s.x + s.w, y1 = s.y + s.h;
  if (ux < x0 || ux > x1 || uy < y0 || uy > y1) return false;
  const r = Math.min(s.r ?? 0, Math.abs(s.w) / 2, Math.abs(s.h) / 2);
  if (r <= 0) return true;
  const cx = ux < x0 + r ? x0 + r : ux > x1 - r ? x1 - r : ux;
  const cy = uy < y0 + r ? y0 + r : uy > y1 - r ? y1 - r : uy;
  const dx = ux - cx, dy = uy - cy;
  return dx * dx + dy * dy <= r * r;
}

function insidePoly(ux: number, uy: number, pts: readonly number[]): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1];
    const xj = pts[j * 2], yj = pts[j * 2 + 1];
    if (yi > uy !== yj > uy && ux < ((xj - xi) * (uy - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function nearLine(ux: number, uy: number, pts: readonly number[], hw: number): boolean {
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
    const dx = x1 - x0, dy = y1 - y0;
    const len = dx * dx + dy * dy;
    const t = len <= 0 ? 0 : Math.max(0, Math.min(1, ((ux - x0) * dx + (uy - y0) * dy) / len));
    const px = ux - (x0 + dx * t), py = uy - (y0 + dy * t);
    if (px * px + py * py <= hw * hw) return true;
  }
  return false;
}

function shapeBox(s: LookShape): { x0: number; y0: number; x1: number; y1: number } {
  if (s.k === "ellipse") return { x0: s.x - s.rx, y0: s.y - s.ry, x1: s.x + s.rx, y1: s.y + s.ry };
  if (s.k === "rect") return { x0: Math.min(s.x, s.x + s.w), y0: Math.min(s.y, s.y + s.h), x1: Math.max(s.x, s.x + s.w), y1: Math.max(s.y, s.y + s.h) };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < s.pts.length; i += 2) {
    x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]);
    y0 = Math.min(y0, s.pts[i + 1]); y1 = Math.max(y1, s.pts[i + 1]);
  }
  const pad = s.k === "line" ? s.w / 2 : 0;
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

function inside(s: LookShape, ux: number, uy: number): boolean {
  if (s.k === "ellipse") {
    const dx = (ux - s.x) / (s.rx || 1e-6);
    const dy = (uy - s.y) / (s.ry || 1e-6);
    return dx * dx + dy * dy <= 1;
  }
  if (s.k === "rect") return insideRect(ux, uy, s);
  if (s.k === "poly") return insidePoly(ux, uy, s.pts);
  return nearLine(ux, uy, s.pts, s.w / 2);
}

/**
 * Draw a list of unit-box shapes centred at (cx, cy) canvas pixels, `s`
 * canvas pixels to one unit. `ctx` resolves an ink role, which is how the
 * same star is cream on a dark robot and ink on a light one.
 */
function drawShapes(dst: Bitmap, shapes: readonly LookShape[], cx: number, cy: number, s: number, ctx: ShapeCtx, sx = s): void {
  if (s <= 0 || sx <= 0) return;
  for (const shape of shapes) {
    const a0 = shape.a ?? 1;
    if (a0 <= 0) continue;
    const col = inkColor(shape.ink as LookInk, ctx.ground, ctx.own);
    const cr = (col >> 16) & 255, cg = (col >> 8) & 255, cb = col & 255;
    const bb = shapeBox(shape);
    const px0 = Math.max(0, Math.floor(cx + bb.x0 * sx));
    const px1 = Math.min(dst.w, Math.ceil(cx + bb.x1 * sx) + 1);
    const py0 = Math.max(0, Math.floor(cy + bb.y0 * s));
    const py1 = Math.min(dst.h, Math.ceil(cy + bb.y1 * s) + 1);
    for (let py = py0; py < py1; py++) {
      for (let px = px0; px < px1; px++) {
        let hits = 0;
        for (let j = 0; j < SS; j++) {
          const uy = (py + SS_HALF + j * SS_STEP - cy) / s;
          for (let i = 0; i < SS; i++) {
            const ux = (px + SS_HALF + i * SS_STEP - cx) / sx;
            if (inside(shape, ux, uy)) hits++;
          }
        }
        if (!hits) continue;
        over(dst.px, (py * dst.w + px) * 4, cr, cg, cb, (hits / (SS * SS)) * a0);
      }
    }
  }
}

// ── the stand-in, for a canvas with the art folder gone ─────────────────────
/**
 * THE HOUSE LAW: every canvas keeps working with public/bots-art removed. The
 * browser has _view/part-art.ts for this; a server route cannot use it,
 * because that file draws with Pixi. So the same figure is drawn again here
 * out of the SAME contract numbers (FIGURE and RIG), which is the only copy
 * this lane could not avoid. It is deliberately the plain silhouette: it
 * exists so a robot is never missing, not so it can pass for the art.
 *
 * It keeps the robot's four colours, because a stand-in that flattened them
 * would be the bug this whole lane is fixing.
 */
const H = FIGURE.H;
const T = (k: keyof typeof FIGURE.ratio): number => FIGURE.ratio[k].target * H;

function standInShapes(piece: Piece): LookShape[] {
  const r = RIG[piece.slot];
  const u = (v: number) => v; // figure units; the caller scales
  if (piece.slot === "head") {
    const [sx, sy] = RIG.head.neck;
    const core = T("headCoreW"), full = T("headFullW"), hh = T("headH");
    const top = sy - hh;
    const er = (full - core) / 2;
    const eR = core * 0.145;
    const ey = top + hh * 0.46;
    return [
      { k: "ellipse", x: sx - core / 2, y: sy - er * 0.55, rx: er, ry: er, ink: "own" },
      { k: "ellipse", x: sx + core / 2, y: sy - er * 0.55, rx: er, ry: er, ink: "own" },
      { k: "ellipse", x: sx, y: (top + sy + FIGURE.skirt) / 2, rx: core / 2, ry: (hh + FIGURE.skirt) / 2, ink: "own" },
      { k: "ellipse", x: sx - core * 0.215, y: ey, rx: eR, ry: eR, ink: "ground", a: 0.9 },
      { k: "ellipse", x: sx + core * 0.215, y: ey, rx: eR, ry: eR, ink: "ground", a: 0.9 },
      { k: "rect", x: sx - core * 0.185, y: top + hh * 0.7, w: core * 0.37, h: hh * 0.115, r: hh * 0.05, ink: "ink", a: 0.8 },
    ];
  }
  if (piece.slot === "torso") {
    const [nx, ny] = RIG.torso.neck;
    const bw = T("bodyW"), bh = T("bodyH");
    return [{ k: "rect", x: nx - bw / 2, y: ny - FIGURE.skirt, w: bw, h: bh + FIGURE.skirt, r: bw * 0.28, ink: "own" }];
  }
  if (piece.slot === "arm") {
    const [sx, sy] = RIG.arm.shoulder;
    const aw = T("armW"), al = T("armL");
    const top = sy - aw / 2;
    return [
      { k: "rect", x: sx - aw / 2, y: top, w: aw, h: aw / 2 + al, r: aw / 2, ink: "own" },
      { k: "ellipse", x: sx, y: top + aw / 2 + al - aw * 0.25, rx: aw * 0.56, ry: aw * 0.56, ink: "own" },
    ];
  }
  if (piece.slot === "leg") {
    const [hx, hy] = RIG.leg.hip;
    const lw = T("armW") * 1.02, lh = T("legH"), fw = T("footW"), fh = T("footH");
    const floor = hy + lh;
    const off = ((T("stanceW") / 2 - (RIG.torso.hipR[0] - RIG.torso.hipL[0]) / 2 - fw / 2) / fw) * fw;
    const fx0 = hx + off - fw / 2;
    return [
      { k: "rect", x: hx - lw / 2, y: hy - lw / 2, w: lw, h: lw / 2 + lh - fh * 0.55, r: lw / 2, ink: "own" },
      { k: "rect", x: fx0, y: floor - fh, w: fw, h: fh, r: fh * 0.46, ink: "own" },
      { k: "rect", x: fx0 + fw * 0.06, y: floor - fh * 0.34, w: fw * 0.88, h: fh * 0.22, r: fh * 0.11, ink: "ink", a: 0.45 },
    ];
  }
  const [gx, gy] = RIG.weapon.grip;
  return [
    { k: "rect", x: gx + 26, y: gy - 8, w: 100, h: 16, r: 8, ink: "own" },
    { k: "rect", x: gx + 120, y: gy - 34, w: 62, h: 68, r: 14, ink: "own" },
    { k: "rect", x: u(gx) - 24, y: gy - 12, w: 56, h: 24, r: 12, ink: "ink", a: 0.7 },
  ];
}

const CLAY = parseInt(K.clay.slice(1), 16);

/** the stand-in, placed and painted like a real part */
function drawStandIn(dst: Bitmap, piece: Piece, tint: number, fit: Fit): void {
  const own = tint === 0xffffff ? CLAY : tint;
  // shapes are in the part's OWN canvas units: shift them onto the piece
  const ox = piece.x, oy = piece.y;
  for (const s of standInShapes(piece)) {
    const moved = moveShape(s, ox, oy, piece.mirror ? piece.w : 0);
    drawShapes(dst, [moved], -fit.originX * fit.scale, -fit.originY * fit.scale, fit.scale, { ground: own, own });
  }
}

/** a shape in part-canvas units moved into figure space (mirrored if asked) */
function moveShape(s: LookShape, ox: number, oy: number, mirrorW: number): LookShape {
  const fx = (x: number) => ox + (mirrorW ? mirrorW - x : x);
  if (s.k === "ellipse") return { ...s, x: fx(s.x), y: oy + s.y };
  if (s.k === "rect") return { ...s, x: mirrorW ? fx(s.x + s.w) : ox + s.x, y: oy + s.y };
  const pts: number[] = [];
  for (let i = 0; i < s.pts.length; i += 2) pts.push(fx(s.pts[i]), oy + s.pts[i + 1]);
  return { ...s, pts };
}

// ── the whole picture ───────────────────────────────────────────────────────

export interface PortraitInput {
  build: Build;
  look: BotLook;
  marks: LookMarks;
}

export type LoadArt = (path: string) => Promise<Uint8Array | null>;

/**
 * Decoded art, kept between pictures. There are eighty part files in the
 * whole game and decoding ten of them is most of what a portrait costs, so a
 * route that draws two robots a second should decode each file once and not
 * once a request. A null entry is a file that is not there, cached too, so a
 * missing folder does not mean a fetch per piece per request.
 *
 * The caller owns it, and the caller owns its size: this module never evicts
 * anything, because a compositor guessing at a memory budget is how a route
 * ends up with a leak nobody can find.
 */
export type ArtCache = Map<string, PartArt | null>;

export interface PortraitResult {
  png: Uint8Array;
  /** how many of the five parts drew real art rather than the stand-in */
  artParts: number;
  /** the colours actually present, so a gate can assert every one of them */
  tints: number[];
  ms: number;
}

/**
 * Render one robot at one size.
 *
 * THE ORDER, and every step of it matters at 64 px: crop to the INK (a part
 * canvas is mostly margin, and cropping to the canvases makes the robot half
 * the size it should be), draw the seven pieces back to front in their own
 * colours, then the earned marks under the chosen ones, then the sticker,
 * then the plate, then the face, and the hat last because it is the only
 * thing allowed to break the head's outline.
 */
export async function renderPortrait(input: PortraitInput, size: number, load: LoadArt, cache?: ArtCache): Promise<PortraitResult> {
  const t0 = Date.now();
  const paints = buildPaints(input.build);
  const arts: ArtCache = cache ?? new Map<string, PartArt | null>();
  // one decode per distinct file, so a robot in a matched set pays once
  const wanted = new Map<string, { base: string; mask: string }>();
  for (const piece of PIECES) {
    const a = artFor(input.build[piece.part], piece.slot);
    const key = `${piece.slot}:${a.tier}:${a.design}`;
    if (!arts.has(key)) wanted.set(key, { base: a.base, mask: a.mask });
  }
  await Promise.all(
    Array.from(wanted.entries()).map(async ([key, files]) => {
      try {
        const raw = await load(files.base);
        if (!raw) {
          arts.set(key, null);
          return;
        }
        const base = decodePng(raw);
        let mask: Bitmap | null = null;
        try {
          const m = await load(files.mask);
          // unpainted is better than unbuilt (the BuildClient law)
          if (m) mask = decodePng(m);
        } catch {
          mask = null;
        }
        arts.set(key, partArtOf(base, mask));
      } catch {
        arts.set(key, null);
      }
    }),
  );

  // WHERE THE ROBOT ACTUALLY IS. Every part canvas carries an eight unit
  // margin and the head's canvas carries 27 units of headroom, so fitting the
  // CANVASES into the square draws a robot two thirds the size it could be
  // with a band of nothing over its head. Measure the alpha instead.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let artParts = 0;
  const seen = new Set<string>();
  for (const piece of PIECES) {
    const a = artFor(input.build[piece.part], piece.slot);
    const key = `${piece.slot}:${a.tier}:${a.design}`;
    const art = arts.get(key) ?? null;
    if (art && !seen.has(key)) {
      seen.add(key);
      artParts++;
    }
    const ink = art?.ink;
    if (!ink) continue;
    const kx = piece.w / art!.base.w;
    const ky = piece.h / art!.base.h;
    const x0 = piece.mirror ? piece.x + (art!.base.w - ink.x1) * kx : piece.x + ink.x0 * kx;
    const x1 = piece.mirror ? piece.x + (art!.base.w - ink.x0) * kx : piece.x + ink.x1 * kx;
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x1);
    minY = Math.min(minY, piece.y + ink.y0 * ky);
    maxY = Math.max(maxY, piece.y + ink.y1 * ky);
  }
  let ink: Box;
  if (maxX > minX && maxY > minY) {
    ink = { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  } else {
    ink = FIGURE_INK; // no art at all: the contract's own figure
  }
  // A hat and a crown live ABOVE the head, so make room for them or the
  // ladder's own prize is the thing that gets cropped. The room is the mark's
  // OWN extent, measured off its shapes: reserving a fixed lift instead drew
  // every hatted robot two thirds the size of every bare one, with a band of
  // nothing over its head (measured on the first sheet, 2026-09-05).
  const stacked = input.look.hat && input.marks.crown ? HAT_ANCHOR.s * 1.5 : 0;
  if (input.look.hat) ink = grow(ink, markBox(HAT_SHAPES[input.look.hat.kind], HAT_ANCHOR));
  if (input.marks.crown) ink = grow(ink, markBox(CROWN_MARK, { ...CROWN_ANCHOR, y: CROWN_ANCHOR.y - stacked }));

  const dst = blank(size);
  const fit = fitInSquare(ink, size);
  const tints: number[] = [];

  for (const piece of PIECES) {
    const a = artFor(input.build[piece.part], piece.slot);
    const art = arts.get(`${piece.slot}:${a.tier}:${a.design}`) ?? null;
    const tint = pieceTint(paints, piece);
    if (piece.name !== "weapon" && !tints.includes(tint)) tints.push(tint);
    if (art) drawPart(dst, art, piece, tint, fit);
    else drawStandIn(dst, piece, tint, fit);
  }

  // the face's own lenses, measured off the head art the way the rig does
  const headPiece = PIECES.find((p) => p.name === "head")!;
  const headArt = arts.get(`head:${artFor(input.build.head, "head").tier}:${artFor(input.build.head, "head").design}`) ?? null;
  const eyes: readonly EyePoint[] = headArt ? findEyes(headArt.base.px, headArt.base.w, headArt.base.h) : EYES_FALLBACK;

  const ground = bodyTint(paints);
  const headGround = paints.head ? paintHex(paints.head) : CLAY;
  const stickerOwn = input.look.stickerPaint ? paintHex(input.look.stickerPaint) : ground;
  const at = (x: number, y: number) => ({ px: (x - fit.originX) * fit.scale, py: (y - fit.originY) * fit.scale });

  // ── EARNED, under CHOSEN: a mark is a history and a sticker is a choice,
  //    and a choice sits on top of a history.
  for (const a of PATCH_ANCHORS.slice(0, input.marks.patches)) {
    const p = at(a.x, a.y);
    drawShapes(dst, PATCH_MARK, p.px, p.py, a.s * fit.scale, { ground, own: ground });
  }
  for (const a of cuffAnchors(input.marks.cuffs)) {
    const p = at(a.x, a.y);
    drawShapes(dst, CUFF_MARK, p.px, p.py, a.s * 0.55 * fit.scale, { ground, own: ground }, a.s * fit.scale);
  }
  const stars = starRow(input.marks.stars + (input.marks.goldStar ? 1 : 0));
  stars.forEach((a, i) => {
    const p = at(a.x, a.y);
    const gold = input.marks.goldStar && i === stars.length - 1;
    drawShapes(dst, gold ? GOLD_STAR_MARK : STAR_MARK, p.px, p.py, a.s * fit.scale, { ground, own: ground });
  });

  // ── CHOSEN: one sticker, in one of the robot's own colours ──────────────
  if (input.look.sticker) {
    const a = stickerAnchor(input.look.spot, eyes);
    const p = at(a.x, a.y);
    const under = input.look.spot === "cheek" ? headGround : ground;
    drawShapes(dst, STICKER_SHAPES[input.look.sticker], p.px, p.py, a.s * fit.scale, { ground: under, own: stickerOwn });
  }

  // ── the plate, and the number that means no ladder ever stops ───────────
  //
  // THE COUNT WINS OVER THE NAME NUMBER, which is the same order rig.ts uses
  // (`marks.count ?? look?.plate`). Once the star row is full the plate stops
  // being decoration and becomes the score, and a robot past the gold star
  // must read the same here as it does in the ring. Reading plateNumber alone
  // printed a 103 win robot's NAME on its plate, or 0 when it had no name
  // number, which quietly capped the ladder on every flat surface.
  const plateNumber = input.marks.count ?? input.look.plateNumber;
  if (plateNumber != null) {
    const p = at(PLATE_ANCHOR.x, PLATE_ANCHOR.y);
    const s = PLATE_ANCHOR.s * fit.scale;
    drawShapes(dst, PLATE_MARK, p.px, p.py, s, { ground, own: ground });
    const digits = String(Math.max(0, Math.floor(plateNumber))).slice(0, 4).split("");
    const dw = s * 0.34;
    const x0 = p.px - ((digits.length - 1) * dw) / 2;
    digits.forEach((d, i) => {
      drawShapes(dst, digitShapes(Number(d)), x0 + i * dw, p.py, s * 0.22, { ground: contrastOn(ground), own: ground });
    });
  }

  // ── the face, over the art's own lenses ─────────────────────────────────
  drawFace(dst, input.look, eyes, headGround, at, fit.scale);
  if (input.marks.sparkle) {
    for (const a of sparkleAnchors(eyes)) {
      const p = at(a.x, a.y);
      drawShapes(dst, SPARKLE_MARK, p.px, p.py, a.s * fit.scale, { ground: headGround, own: headGround });
    }
  }

  // ── last, the only two things allowed to break the head's outline ───────
  if (input.look.hat) {
    const p = at(HAT_ANCHOR.x, HAT_ANCHOR.y);
    // the colour the hat turned up in. A hat with none of its own is a row
    // from before colours were recorded, and the head's is its true answer
    const own = input.look.hat.color ? paintHex(input.look.hat.color) : paints.head ? paintHex(paints.head) : ground;
    drawShapes(dst, HAT_SHAPES[input.look.hat.kind], p.px, p.py, HAT_ANCHOR.s * fit.scale, { ground: headGround, own });
  }
  if (input.marks.crown) {
    const p = at(CROWN_ANCHOR.x, CROWN_ANCHOR.y - stacked);
    drawShapes(dst, CROWN_MARK, p.px, p.py, CROWN_ANCHOR.s * fit.scale, { ground: headGround, own: headGround });
  }
  void headPiece;
  void BOUNDS;

  return { png: encodePng(dst), artParts, tints, ms: Date.now() - t0 };
}

/**
 * THE FACE. The art already drew a lens and a mouth; a face is what the robot
 * DOES with them, so this draws a lid over each lens and a smile under them
 * and never a second pair of eyes. The lid's colour is the head at that row,
 * the same derivation rig.ts uses (clay x the bake's vertical ramp x the
 * head's own paint), so a closed eye reads as a closed eye and not a hole.
 */
function drawFace(
  dst: Bitmap,
  look: BotLook,
  eyes: readonly EyePoint[],
  headGround: number,
  at: (x: number, y: number) => { px: number; py: number },
  scale: number,
): void {
  const dials = FACE_DIALS[look.face] ?? FACE_DIALS.calm;
  // the head at the eye's row: clay x the bake's vertical ramp x the paint
  const lid = scaleRgb(headGround, LID.value);
  eyes.forEach((e, i) => {
    const closure = dials.lid[Math.min(i, 1)] ?? 0;
    const p = at(e.x, e.y);
    const r = e.r * scale;
    if (dials.starEyes) {
      drawShapes(dst, [{ k: "poly", pts: starPoly(1), ink: "cream" }], p.px, p.py, r * 0.95, { ground: headGround, own: headGround });
      return;
    }
    // A LID IS A PIECE OF THE LENS. lidShapes() is the rig's own segment,
    // generated as a polygon because a picture composed over raw pixels has
    // no arc; a disc slid over the eye instead reads as a bruise.
    drawShapes(dst, lidShapes(closure), p.px, p.py, r, { ground: lid, own: lid });
  });
  if (dials.smile > 0 && eyes.length) {
    const cx = eyes.reduce((s, e) => s + e.x, 0) / eyes.length;
    const cy = eyes.reduce((s, e) => s + e.y, 0) / eyes.length;
    const r = eyes.reduce((s, e) => s + e.r, 0) / eyes.length;
    // UNDER the art's own mouth, never across it: the grille sits about two
    // lens radii below the eye row, so a smile drawn any higher reads as a
    // moustache (measured on the first sheet, 2026-09-05)
    const p = at(cx, cy + r * 2.75);
    const w = r * 1.25 * scale;
    const lift = 0.55 * dials.smile;
    drawShapes(
      dst,
      [{ k: "line", pts: [-1, -lift, -0.45, 0.35, 0.45, 0.35, 1, -lift], w: 0.3, ink: "ink", a: 0.55 }],
      p.px,
      p.py,
      w * 0.6,
      { ground: headGround, own: headGround },
      w,
    );
  }
}
