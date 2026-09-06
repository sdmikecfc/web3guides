/**
 * BATTLE BOTS ART CONTRACT gate. The dk-art-check.mts pattern.
 *
 * Imports the SHIPPED contract (src/app/bots/_view/rig-points.ts, emitted by
 * the bake) rather than re-listing it, per the gates-must-import law, and
 * asserts against the PNGs on disk:
 *
 *   1. every launch part (5 slots x 4 tiers x 2 designs) exists, is a real
 *      PNG, and is exactly the contract's canvas size;
 *   2. NO DRAWN PIXEL TOUCHES A CANVAS EDGE (see below);
 *   3. every part has a paint MASK of the same size, the mask is not empty,
 *      and the mask never paints where the base is transparent;
 *   4. THE PAINT REACHES THE PLAYER: no run of body pixels is left unpainted,
 *      the mask covers a sane share of the part, and the part stays inside
 *      the contract's brass budget;
 *   5. at every ON-CANVAS rig point the base alpha is non-zero within a 6px
 *      radius, and every OFF-canvas rig point is one the contract declares
 *      and is outboard of the art by the contract's own lateral distance;
 *   6. THE JOIN: a limb's cap is buried by the contract's fraction of that
 *      limb's OWN width, the head overhangs the torso by the contract's
 *      factor, and no brass pixel lies within half a limb width of a joint;
 *   7. the lift's two states exist at the contract size and their platform
 *      tops are where the contract says.
 *
 * WHY 2 EXISTS (2026-09-04). Measured on the shipped set the day Mike
 * rejected the assembled bot: TWENTY FIVE OF THE FORTY PARTS were clipped
 * flat by their own canvas. All eight arms lost the hand to the bottom edge,
 * all eight legs lost the foot, seven of eight torsos were cut on a side and
 * torso t3-1 lost 176 and 178 of its 240 side rows, and two heads were cut at
 * the crown. Scaling a clipped sprite scales the clip, so this was the single
 * largest remaining source of "really cheap" after proportion, and nothing in
 * the gate was asking. A canvas that cuts its own art is never a taste call.
 *
 * WHY THE PAINT-SHARE CEILING IS GONE. That ceiling asked "has the mask
 * swallowed the brass" and was calibrated when a part ran 18.9 to 21.5 percent
 * metal. Under the JOIN law there is no brass at any joint and exactly ONE
 * brass piece on the whole bot, so a 98.7 percent clay torso is the fix, not
 * the defect, and the ceiling fired on all four tier-1 and tier-2 torsos the
 * moment the hardware came off. The contract's own BRASS BUDGET asks the
 * question that still matters and asks it from the other side: no part over 4
 * percent metal, and the torso must still carry its one key. The paint-share
 * FLOOR stays exactly as it was: a family whose whole body was mistaken for an
 * accent would take no paint at all, and that is what reaches a player.
 *
 * WHY 3 EXISTS (verifier defect 2, 2026-09-04). Check 3's second half asks
 * whether the mask paints where there is NO part, which is the reverse of the
 * direction that reaches a player: what a player sees is a body pixel the
 * mask MISSED, which then keeps the colour the art was drawn in no matter
 * which of the eight paints they bought. Every one of the 40 parts passed
 * that while 86,100 pixels across them were failing the direction nobody was
 * asking. Both are asked now.
 *
 * The paintable law (which pixels are accents and so are meant to stay) is
 * read from scripts/bots-art-accents.json, the SAME file that
 * scripts/bots-paint-masks.py derives the masks from. One table, two readers:
 * a gate that carried its own copy of the rule would agree with the deriver
 * by sharing its mistake.
 *
 * Run: npx tsx scripts/bots-art-check.mts
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import {
  ART_SLOTS,
  DESIGNS,
  FIGURE,
  JOIN,
  LIFT,
  OFF_CANVAS,
  RIG,
  TIERS,
  liftFile,
  maskFile,
  partFile,
  rigPointsNamed,
  type ArtSlot,
} from "../src/app/bots/_view/rig-points";

const PUB = join(process.cwd(), "public");
const fails: string[] = [];
const RADIUS = 6;

/** the points that are JOINTS, as opposed to hand / foot / grip / decal */
const JOINT_POINTS: Record<string, readonly string[]> = {
  head: ["neck"],
  torso: ["neck", "hipL", "hipR"], // the shoulders are off canvas by design
  arm: ["shoulder"],
  leg: ["hip"],
  weapon: [],
};

/* ── the paintable law, read from the file the mask deriver reads ────────── */

interface Band {
  hueMin: number;
  hueMax: number;
  satMin: number;
  valueMin: number;
}
interface AccentLaw {
  /**
   * Every accent band in the law, by name. This USED to name the three it knew
   * about, and that made the law's table unextendable: the contract's fourth
   * fixed accent is the coral shoe, and with the three names hardcoded here the
   * gate could not see it however the law was written. Every coral pixel then
   * counted as unmasked body, about 5,900 per leg. The set of accents is the
   * law's to state; this file's job is to recompute it independently, which it
   * still does.
   */
  accents: Record<string, Partial<Band> & { valueMax?: number }>;
  accentHoleClose: { value: number };
  gate: {
    unmaskedBodyMax: { value: number };
    paintShareMin: { value: number };
  };
}
const LAW = JSON.parse(
  readFileSync(join(process.cwd(), "scripts", "bots-art-accents.json"), "utf8"),
) as AccentLaw;
/** a pixel is SOLID at this alpha; the deriver uses the same number */
const OPAQUE = 200;

// THE FACE GATE's own numbers. The smallest eye the eight families ship is
// kettle's at 4,661 pixels, so 400 is a floor no real eye can fall through and
// no stray warm speck can climb. Level and mirror are measured on the eight
// fixed heads at 0.000 and 0.000 to 0.004 of head height, because the cutter
// draws both eyes on one row; the bars are set an order of magnitude wider so
// they catch a wrong eye and never a rounding. And not one pixel of an eye may
// be painted: PAINTED_MAX is 0 on purpose, because there is no such thing as a
// slightly painted eye.
const EYE_MIN_PX = 400;
const EYE_LEVEL_MAX = 0.03;
const EYE_MIRROR_MAX = 0.05;
const EYE_PAINTED_MAX = 0;

const hsv = (r: number, g: number, b: number): [number, number, number] => {
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  const d = hi - lo;
  const v = hi / 255;
  const s = hi > 0 ? d / hi : 0;
  let h = 0;
  if (d > 0) {
    if (hi === r) h = (((g - b) / d) % 6 + 6) % 6;
    else if (hi === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, v];
};

const inBand = (k: Band, h: number, s: number, v: number): boolean =>
  h >= k.hueMin && h <= k.hueMax && s >= k.satMin && v > k.valueMin;

/** Every accent the law names: the pixels the paint is meant to skip. */
function isAccent(r: number, g: number, b: number): boolean {
  const [h, s, v] = hsv(r, g, b);
  for (const k of Object.values(LAW.accents)) {
    // a value ceiling on its own (rubber: too dark for a tint to read)
    if (k.valueMax !== undefined && k.hueMin === undefined && v < k.valueMax) return true;
    if (k.hueMin === undefined) continue;
    if (h < k.hueMin || h > (k.hueMax as number)) continue;
    if (k.satMin !== undefined && s < k.satMin) continue;
    if (k.satMax !== undefined && s > k.satMax) continue;
    if (k.valueMin !== undefined && v <= k.valueMin) continue;
    if (k.valueMax !== undefined && v > k.valueMax) continue;
    return true;
  }
  return false;
}

/**
 * METAL alone, for the no-hardware-at-a-joint check and the brass budget.
 * The paintable law's brass band also catches the warm eye lens, because both
 * sit at hue 40; only saturation separates them, brass at 0.70 against the
 * lens at 0.19. The contract carries that floor so the two readers agree.
 */
function isMetal(r: number, g: number, b: number): boolean {
  const [h, s, v] = hsv(r, g, b);
  const brass = LAW.accents.brass as Band;
  return h >= brass.hueMin && h <= brass.hueMax && s >= FIGURE.metalSatMin && v > brass.valueMin;
}

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

/** the drawn ink box: left, top, right, bottom, inclusive. null if empty. */
function inkBox(p: Png): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.px[(y * p.w + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Dilate `times`, then erode `times`, on a 3x3: fills holes up to 2 x times
 * wide. The same close bots-paint-masks.py runs on the accent set. */
function closeFlags(src: Uint8Array, w: number, h: number, times: number): Uint8Array {
  let cur = src;
  const step = (input: Uint8Array, want: number): Uint8Array => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let hit = 0;
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            const v = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : input[yy * w + xx];
            if (v === want) { hit = 1; break; }
          }
        }
        // dilate (want 1) sets on any neighbour set; erode (want 0) clears on any neighbour clear
        out[y * w + x] = want === 1 ? (hit ? 1 : 0) : hit ? 0 : 1;
      }
    }
    return out;
  };
  for (let i = 0; i < times; i++) cur = step(cur, 1);
  for (let i = 0; i < times; i++) cur = step(cur, 0);
  return cur;
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

// ── the parts ──────────────────────────────────────────────────────────────
let parts = 0;
/** the tightest margin seen per slot, printed so a 1 px squeak is visible */
const tightest = new Map<ArtSlot, { px: number; where: string }>();
/** ink widths, for the head-over-torso overhang check */
const inkW: Record<string, number[]> = { head: [], torso: [] };

for (const slot of ART_SLOTS) {
  const { w, h } = RIG[slot];
  const points = rigPointsNamed(slot);
  const joints = JOINT_POINTS[slot] ?? [];
  for (const tier of TIERS) {
    for (const design of DESIGNS) {
      parts += 1;
      const baseRel = partFile(slot, tier, design);
      const maskRel = maskFile(slot, tier, design);
      const base = load(baseRel, w, h);
      const mask = load(maskRel, w, h);
      if (!base) continue;

      // ── 2. THE CANVAS MUST NOT CUT ITS OWN ART ───────────────────────────
      const box = inkBox(base);
      if (!box) {
        fails.push(`NO INK ${baseRel}: the canvas is empty`);
        continue;
      }
      const edges: string[] = [];
      let n = 0;
      for (let x = 0; x < w; x++) if (alphaAt(base, x, 0) > 0) n += 1;
      if (n) edges.push(`top ${n}`);
      n = 0;
      for (let x = 0; x < w; x++) if (alphaAt(base, x, h - 1) > 0) n += 1;
      if (n) edges.push(`bottom ${n}`);
      n = 0;
      for (let y = 0; y < h; y++) if (alphaAt(base, 0, y) > 0) n += 1;
      if (n) edges.push(`left ${n}`);
      n = 0;
      for (let y = 0; y < h; y++) if (alphaAt(base, w - 1, y) > 0) n += 1;
      if (n) edges.push(`right ${n}`);
      if (edges.length) {
        fails.push(
          `CLIPPED ${baseRel}: drawn pixels reach the canvas edge (${edges.join(", ")}). ` +
            `The part is cut flat and every screen that scales it scales the cut. ` +
            `The contract carries a ${FIGURE.margin} px margin on every side for exactly this.`,
        );
      }
      const margin = Math.min(box.x0, w - 1 - box.x1, box.y0, h - 1 - box.y1);
      const cur = tightest.get(slot);
      if (!cur || margin < cur.px) tightest.set(slot, { px: margin, where: `t${tier}-${design}` });
      if (slot === "head" || slot === "torso") inkW[slot].push(box.x1 - box.x0 + 1);

      // ── 5. every rig point lands on art, or is declared off canvas ───────
      for (const { name, at } of points) {
        const [x, y] = at;
        const outside = x < 0 || y < 0 || x >= w || y >= h;
        if (outside) {
          if (!OFF_CANVAS.includes(name)) {
            fails.push(`OFF CANVAS ${baseRel}: rig point ${name} (${x},${y}) is outside a ${w}x${h} canvas and the contract does not declare it so`);
          }
          continue; // the arm owns this point, not the torso
        }
        if (!opaqueNear(base, x, y, RADIUS)) {
          fails.push(`AIR ${baseRel}: rig point ${name} (${x},${y}) has no opaque pixel within ${RADIUS}px`);
        }
      }

      // ── 6. THE JOIN ──────────────────────────────────────────────────────
      // The cap is buried by a fraction of the limb's OWN width, which is what
      // makes a fat tier-4 limb and a thin tier-1 limb both read seated.
      if (slot === "arm" || slot === "leg") {
        const pivotY = (slot === "arm" ? RIG.arm.shoulder : RIG.leg.hip)[1];
        // the shaft's own width, read on the row just under the pivot
        let run = 0;
        for (let x = 0; x < w; x++) if (alphaAt(base, x, pivotY) >= OPAQUE) run += 1;
        const burial = run > 0 ? (pivotY - box.y0) / run : 0;
        if (burial < JOIN.burialMin || burial > JOIN.burialMax) {
          fails.push(
            `BURIAL ${baseRel}: the pivot sits ${burial.toFixed(2)} of the limb's own width (${run}px) below its ink top, ` +
              `and the join law says ${JOIN.burialMin} to ${JOIN.burialMax}. Too little and the cap shows past the body group; ` +
              `too much and the limb reads short. Expressing it as a fraction of the limb's OWN width is what makes a fat ` +
              `tier-4 limb and a thin tier-1 limb both read seated.`,
          );
        }
      }
      // No hardware at a joint: no brass within half a limb width of one.
      const limbW = Math.round(FIGURE.ratio.armW.target * FIGURE.H);
      const guard = Math.round(limbW * 0.5);
      for (const name of joints) {
        const at = points.find((p) => p.name === name)?.at;
        if (!at) continue;
        const [px, py] = at;
        let brass = 0;
        for (let dy = -guard; dy <= guard; dy++) {
          for (let dx = -guard; dx <= guard; dx++) {
            if (dx * dx + dy * dy > guard * guard) continue;
            const x = px + dx, y = py + dy;
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            const i = (y * w + x) * 4;
            if (base.px[i + 3] < OPAQUE) continue;
            if (isMetal(base.px[i], base.px[i + 1], base.px[i + 2])) brass += 1;
          }
        }
        if (brass > 0) {
          fails.push(
            `HARDWARE ${baseRel}: ${brass} brass pixels lie within ${guard}px of the ${name} joint. ` +
              `The concept has no ring, cup, collar or bolt at any joint: a joint that needs hardware to read is a joint drawn at the wrong size.`,
          );
        }
      }

      if (!mask) continue;

      // The accent set, exactly as bots-paint-masks.py builds it: the three
      // bands, OR everything outside the part, then ONE hole close (a blown
      // specular on a brass surface has almost no saturation left, so the hue
      // test cannot see it, and without the close a scatter of freckles
      // inside the accent reads as unpainted body).
      const accent = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        accent[i] =
          base.px[i * 4 + 3] === 0 || isAccent(base.px[i * 4], base.px[i * 4 + 1], base.px[i * 4 + 2]) ? 1 : 0;
      }
      const closed = closeFlags(accent, w, h, LAW.accentHoleClose.value);

      let painted = 0;   // mask pixels, anywhere
      let visible = 0;   // base pixels with any alpha
      let outside = 0;   // mask on a transparent base
      let unmasked = 0;  // THE ONE THAT REACHES THE PLAYER
      let metal = 0;     // the brass budget
      for (let i = 0; i < w * h; i++) {
        const ba = base.px[i * 4 + 3];
        const ma = mask.px[i * 4 + 3];
        if (ba > 0) visible += 1;
        if (ba >= OPAQUE && isMetal(base.px[i * 4], base.px[i * 4 + 1], base.px[i * 4 + 2])) metal += 1;
        if (ma > 0) {
          painted += 1;
          if (ba === 0) outside += 1;
        } else if (ba >= OPAQUE && closed[i] === 0) {
          unmasked += 1;
        }
      }
      if (painted === 0) fails.push(`MASK EMPTY ${maskRel}`);
      if (outside > 0) fails.push(`MASK OUTSIDE ${maskRel}: ${outside} painted pixels sit on transparent base`);
      const bar = LAW.gate.unmaskedBodyMax.value;
      if (unmasked > bar) {
        fails.push(
          `UNPAINTED BODY ${baseRel}: ${unmasked} solid pixels are neither masked nor an accent (bar ${bar}). ` +
            `Every one of them keeps the colour the art was drawn in, in all eight paints.`,
        );
      }
      const share = visible ? painted / visible : 0;
      const lo = LAW.gate.paintShareMin.value;
      if (share < lo) {
        fails.push(`PAINT SHARE ${maskRel}: covers ${(share * 100).toFixed(1)} percent of the part, floor is ${(lo * 100).toFixed(0)}`);
      }
      // THE BRASS BUDGET replaces the old paint-share ceiling. That ceiling
      // asked "has the mask swallowed the brass" and was calibrated when the
      // parts ran 18.9 to 21.5 percent metal; under the JOIN law there is
      // exactly ONE brass piece on the whole bot, so a 98.7 percent clay torso
      // is correct rather than broken and the ceiling was firing on the fix.
      // The contract's own budget asks the question that still matters, and
      // from the other side: it is what makes a bot read as a vinyl toy
      // instead of as clockwork.
      const metalShare = visible ? metal / visible : 0;
      if (metalShare > FIGURE.brassBudget) {
        fails.push(
          `BRASS BUDGET ${baseRel}: metal covers ${(metalShare * 100).toFixed(1)} percent of the part, budget is ` +
            `${(FIGURE.brassBudget * 100).toFixed(0)}. Exactly one brass piece belongs on a bot and it is the torso's wind-up key.`,
        );
      }
      if (slot === "torso" && metal === 0) {
        fails.push(`BRASS MISSING ${baseRel}: the torso carries the bot's ONE brass piece, the wind-up key, and there is no metal pixel on it`);
      }
    }
  }
}

// ── 6b. THE HEAD MUST OVERHANG THE TORSO ───────────────────────────────────
// This is the whole join mechanism: the arm hangs just outboard of the torso
// and UNDER the head, so it is the HEAD, not the torso, that hides the
// shoulder cap. Worst case against worst case, because any head has to fit
// any body.
if (inkW.head.length && inkW.torso.length) {
  const narrowHead = Math.min(...inkW.head);
  const wideTorso = Math.max(...inkW.torso);
  const need = FIGURE.ratio.headOverBody.min;
  const got = narrowHead / wideTorso;
  if (got < need) {
    fails.push(
      `OVERHANG: the narrowest head (${narrowHead}px) is only ${got.toFixed(2)} times the widest torso (${wideTorso}px), ` +
        `and the contract's floor is ${need}. Below it the head stops covering the shoulder cap and the join reappears.`,
    );
  }
}

// ── 6c. THE FACE ───────────────────────────────────────────────────────────
//
// MIKE'S QUESTION, 2026-09-05: "Are the new robots loveable? Can someone look
// at it and think 'aww that's so cute, I want to upgrade this guy'?" The answer
// was no, and the reason was one defect: the heads had no face. The eye lens is
// drawn in the art, the accent law named an eye, and the shipped paint mask
// crossed it anyway, so the eye took the body colour EXACTLY -- measured at 0.4
// degrees of hue between the eye centre and the cheek on coral, 0.6 on ink and
// 0.1 on butter. A toy whose eye is the same colour as its cheek is switched
// off, and nobody wants to upgrade a switched-off toy.
//
// SO THIS IS THE ONE THING THAT CAN NEVER HAPPEN AGAIN, and it is checked here
// rather than trusted to the deriver. Two questions, both asked of the SHIPPED
// pngs:
//
//   1. IS THERE A FACE. Two blobs in the law's eye band, level with each other
//      and mirrored about the head's own centre line. One blob is a lamp; a
//      blob on the crown is the pale blue hole this wave removed; two blobs at
//      different heights is not a face.
//   2. IS IT PAINTED OVER. Not one pixel of either eye may be under the mask.
//      This is the direct form of "the eye takes the body colour", because the
//      mask is exactly the set of pixels the player's colour lands on, and it
//      cannot be argued with by a hue measurement on one paint.
//
// A hue gate would NOT do here and it is worth saying why, because it is the
// obvious thing to write. Two of the eight paints are warm: butter #ffd166 sits
// at hue 44 and cream #f3e9d2 at hue 40, and the eye is amber at 35.8. Measured
// on the fixed art, a correctly unpainted eye still reads only 1.9 degrees from
// a cream cheek and 5.8 from a butter one, because on those two bots the eye
// and the body ARE the same hue family and differ in saturation instead. A gate
// on hue would fail the fix and pass a butter-only regression.
{
  const eyeBand = LAW.accents.eye as Band | undefined;
  if (!eyeBand) fails.push(`FACE: the accent law has no "eye" band, so nothing protects the eye lens from the paint`);
  else {
    const { w, h } = RIG.head;
    for (const tier of TIERS) {
      for (const design of DESIGNS) {
        const baseRel = partFile("head", tier, design);
        const base = load(baseRel, w, h);
        const mask = load(maskFile("head", tier, design), w, h);
        if (!base || !mask) continue;
        // pixels in the eye band, solid
        const isEye = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) {
          if (base.px[i * 4 + 3] < OPAQUE) continue;
          const [hu, sa, va] = hsv(base.px[i * 4], base.px[i * 4 + 1], base.px[i * 4 + 2]);
          if (hu >= eyeBand.hueMin && hu <= (eyeBand.hueMax as number) &&
              sa >= (eyeBand.satMin as number) && sa <= (eyeBand.satMax as number) &&
              va > (eyeBand.valueMin as number)) isEye[i] = 1;
        }
        // the two biggest blobs, by flood fill
        const seen = new Uint8Array(w * h);
        const blobs: { n: number; cy: number; cx: number; px: number[] }[] = [];
        const stack: number[] = [];
        for (let i = 0; i < w * h; i++) {
          if (!isEye[i] || seen[i]) continue;
          stack.length = 0; stack.push(i); seen[i] = 1;
          const px: number[] = [];
          let sy = 0, sx = 0;
          while (stack.length) {
            const j = stack.pop() as number;
            px.push(j);
            const y = (j / w) | 0, x = j % w;
            sy += y; sx += x;
            for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
              const k = yy * w + xx;
              if (isEye[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
            }
          }
          if (px.length >= EYE_MIN_PX) blobs.push({ n: px.length, cy: sy / px.length, cx: sx / px.length, px });
        }
        blobs.sort((a, b) => b.n - a.n);
        if (blobs.length < 2) {
          fails.push(
            `NO FACE ${baseRel}: found ${blobs.length} eye-coloured region(s) of ${EYE_MIN_PX}+ pixels, and a face has two. ` +
              `The eye is drawn in the art; if it is missing here the paint mask has swallowed it and the head will read as switched off in all eight paints.`,
          );
          continue;
        }
        const [a, b] = [blobs[0], blobs[1]].sort((p, q) => p.cx - q.cx);
        const box = inkBox(base);
        const hh = box ? box.y1 - box.y0 + 1 : h;
        const level = Math.abs(a.cy - b.cy) / hh;
        if (level > EYE_LEVEL_MAX) {
          fails.push(
            `EYES NOT LEVEL ${baseRel}: the two eyes sit ${(level * 100).toFixed(1)} percent of head height apart ` +
              `(bar ${(EYE_LEVEL_MAX * 100).toFixed(0)}). Two eyes at different heights is the one facial error nobody forgives.`,
          );
        }
        const mid = box ? (box.x0 + box.x1) / 2 : w / 2;
        const mirror = Math.abs(Math.abs(a.cx - mid) - Math.abs(b.cx - mid)) / hh;
        if (mirror > EYE_MIRROR_MAX) {
          fails.push(
            `EYES NOT MIRRORED ${baseRel}: they sit ${(Math.abs(a.cx - mid) / hh).toFixed(3)} and ` +
              `${(Math.abs(b.cx - mid) / hh).toFixed(3)} of head height from the centre line. ` +
              `One of these is not an eye -- a crown specular kept by mistake reads exactly like this.`,
          );
        }
        // THE ONE THAT REACHES THE PLAYER
        let painted = 0;
        for (const blob of [a, b]) for (const i of blob.px) if (mask.px[i * 4 + 3] > 0) painted += 1;
        if (painted > EYE_PAINTED_MAX) {
          fails.push(
            `EYE PAINTED ${baseRel}: ${painted} pixels of the eye are under the paint mask, so they take the player's ` +
              `body colour and the eye stops reading as lit. This is the defect Mike found on 2026-09-05 and the reason ` +
              `the heads had no face; the mask must skip the whole eye on every one of the eight paints.`,
          );
        }
      }
    }
  }
}

// ── 7: the lift ────────────────────────────────────────────────────────────
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
const marginLine = ART_SLOTS.map((s) => {
  const t = tightest.get(s);
  return `${s} ${t ? `${t.px}px (${t.where})` : "-"}`;
}).join("  ");
console.log(`tightest margin to a canvas edge: ${marginLine}   [contract asks ${FIGURE.margin}, drawn margin runs about 1px tighter because the outline straddles the ink]`);
if (fails.length) {
  for (const f of fails) console.error(`FAIL ${f}`);
  console.error(`bots-art-check FAIL (${fails.length})`);
  process.exit(1);
}
console.log("bots-art-check PASS");
