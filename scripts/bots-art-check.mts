/**
 * BATTLE BOTS ART CONTRACT gate (week 1). The dk-art-check.mts pattern.
 *
 * Imports the SHIPPED contract (src/app/bots/_view/rig-points.ts, emitted by
 * the bake) rather than re-listing it, per the gates-must-import law, and
 * asserts against the PNGs on disk:
 *
 *   1. every launch part (5 slots x 4 tiers x 2 designs) exists, is a real
 *      PNG, and is exactly the contract's canvas size;
 *   2. every part has a paint MASK of the same size, the mask is not empty,
 *      and the mask never paints where the base is transparent;
 *   3. at EVERY rig point the base alpha is non-zero within a 6px radius (a
 *      socket that lands on air is a rig bug, not a taste issue);
 *   4. the lift's two states exist at the contract size and their platform
 *      tops are where the contract says (the bay positions the bot's feet
 *      on those numbers).
 *
 * Run: npx tsx scripts/bots-art-check.mts
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import {
  ART_SLOTS,
  DESIGNS,
  LIFT,
  RIG,
  TIERS,
  liftFile,
  maskFile,
  partFile,
  rigPoints,
} from "../src/app/bots/_view/rig-points";

const PUB = join(process.cwd(), "public");
const fails: string[] = [];
const RADIUS = 6;

interface Png {
  w: number;
  h: number;
  /** RGBA8, row-major */
  px: Buffer;
}

/**
 * A minimal PNG reader: 8-bit RGBA, non-interlaced, the five standard
 * filters. That is exactly what resvg writes; anything else is refused
 * loudly rather than guessed at.
 */
function readPng(path: string): Png {
  const b = readFileSync(path);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (b.length < 33 || sig.some((v, i) => b[i] !== v)) throw new Error("not a PNG");
  let off = 8;
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat: Buffer[] = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString("ascii", off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (depth !== 8 || ctype !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${depth}, colour type ${ctype}, interlace ${interlace})`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  const px = Buffer.alloc(w * h * bpp);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const up = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (a + up) >> 1;
      else if (filter === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      } else if (filter !== 0) throw new Error(`bad filter ${filter} on row ${y}`);
      out[i] = v & 255;
    }
    out.copy(px, y * stride);
    prev = out;
  }
  return { w, h, px };
}

const alphaAt = (p: Png, x: number, y: number): number =>
  x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.px[(y * p.w + x) * 4 + 3];

function opaqueNear(p: Png, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      if (alphaAt(p, x + dx, y + dy) > 0) return true;
    }
  }
  return false;
}

function load(rel: string, w: number, h: number): Png | null {
  const p = join(PUB, rel);
  if (!existsSync(p)) {
    fails.push(`MISSING ${rel}`);
    return null;
  }
  if (statSync(p).size === 0) {
    fails.push(`EMPTY ${rel}`);
    return null;
  }
  let png: Png;
  try {
    png = readPng(p);
  } catch (e) {
    fails.push(`BAD PNG ${rel}: ${(e as Error).message}`);
    return null;
  }
  if (png.w !== w || png.h !== h) {
    fails.push(`SIZE ${rel} is ${png.w}x${png.h}, contract says ${w}x${h}`);
    return null;
  }
  return png;
}

// ── 1 to 3: every part, its mask, its rig points ───────────────────────────
let parts = 0;
for (const slot of ART_SLOTS) {
  const { w, h } = RIG[slot];
  const points = rigPoints(slot);
  for (const tier of TIERS) {
    for (const design of DESIGNS) {
      parts += 1;
      const baseRel = partFile(slot, tier, design);
      const maskRel = maskFile(slot, tier, design);
      const base = load(baseRel, w, h);
      const mask = load(maskRel, w, h);
      if (!base) continue;
      for (const [x, y] of points) {
        if (!opaqueNear(base, x, y, RADIUS)) {
          fails.push(`AIR ${baseRel}: rig point (${x},${y}) has no opaque pixel within ${RADIUS}px`);
        }
      }
      if (!mask) continue;
      let painted = 0;
      let leak = 0;
      for (let i = 0; i < w * h; i++) {
        const ma = mask.px[i * 4 + 3];
        if (ma > 0) {
          painted += 1;
          if (base.px[i * 4 + 3] === 0) leak += 1;
        }
      }
      if (painted === 0) fails.push(`MASK EMPTY ${maskRel}`);
      if (leak > 0) fails.push(`MASK LEAK ${maskRel}: ${leak} painted pixels sit on transparent base`);
    }
  }
}

// ── 4: the lift ────────────────────────────────────────────────────────────
for (const [state, top] of [["down", LIFT.topDown], ["raised", LIFT.topRaised]] as const) {
  const rel = liftFile(state);
  const png = load(rel, LIFT.w, LIFT.h);
  if (!png) continue;
  const cx = LIFT.w >> 1;
  if (alphaAt(png, cx, top + 6) === 0) fails.push(`LIFT ${rel}: nothing under the platform top at y ${top}`);
  if (alphaAt(png, cx, top - 12) !== 0) fails.push(`LIFT ${rel}: something above the platform top at y ${top}`);
  const edge = (LIFT.w - LIFT.platformW) / 2;
  if (alphaAt(png, edge + 4, top + 8) === 0 || alphaAt(png, LIFT.w - edge - 4, top + 8) === 0) {
    fails.push(`LIFT ${rel}: platform is not ${LIFT.platformW} wide at y ${top}`);
  }
}

// ── report ─────────────────────────────────────────────────────────────────
console.log(`checked ${parts} parts (+ masks) across ${ART_SLOTS.length} slots and the lift`);
if (fails.length) {
  for (const f of fails) console.error(`FAIL ${f}`);
  console.error(`bots-art-check FAIL (${fails.length})`);
  process.exit(1);
}
console.log("bots-art-check PASS");
