/**
 * BATTLE BOTS LOOK-ALIKE GATE. Measures whether a parts catalogue actually
 * offers different shapes, or whether it offers one shape eight times.
 *
 *   npx tsx scripts/bots-lookalike-check.mts                 # public/bots-art/parts
 *   npx tsx scripts/bots-lookalike-check.mts <catalogue dir>
 *   ... --shape-table <json>   group the files by the shape they claim to be
 *   ... --json                                               # the numbers, machine readable
 *
 * WHY THIS EXISTS. Mike, 5 September: "Not a whole lot of variation going on
 * with the models. Was hoping people could make their own cute unique
 * robots." It was not a mood, it was measurable, and nothing in the build
 * was measuring it. Every existing gate asks "is this part correct" one part
 * at a time: right canvas, on the pivots, inside the bands, paint where paint
 * is allowed. Eight identical boots pass all of it eight times. A catalogue
 * is not the sum of its parts being legal; it is the parts being DIFFERENT
 * from each other, and that is a question you can only ask pairwise.
 *
 * WHAT IT MEASURES. Outline overlap, per slot, at RING SIZE. Two parts in one
 * slot are drawn on the same canvas against the same pivots, so canvas space
 * IS registered space: no alignment step is needed or wanted, because a
 * player sees them in exactly that registration. Both silhouettes are shrunk
 * to the size a bot is on the ring, and the overlap is the intersection over
 * the union of the ink. 1.00 means "the same boot". The number reported
 * beside it is 100 x (1 - overlap): how many pixels in a hundred differ, the
 * unit Mike's complaint was measured in.
 *
 * WHY RING SIZE AND NOT FULL SIZE. Full-canvas pixels flatter a catalogue.
 * Two boots whose rims differ by three pixels of moulding look 4 percent
 * apart at 456 px and identical at the size a person actually watches a
 * fight. The bot stands FIGURE.H tall in contract pixels and RING_BOT_H tall
 * on the ring, so every canvas is shrunk by that ratio and the ink is
 * resampled by area coverage, which is what the eye does.
 *
 * THE TWO BARS, and why there are two.
 *
 *   CLOSEST PAIR under 0.90. One duplicate is a defect on its own. A player
 *   who unlocks a part and gets the part they already have has been given
 *   nothing, however varied the rest of the slot is, so the worst pair in a
 *   slot is a hard bar and not an average anyone can dilute.
 *
 *   MEDIAN under 0.80. A slot can dodge the first bar with seven near-copies
 *   and one outlier: no pair quite touches 0.90, and the slot still reads as
 *   one shape with a strange cousin. The median says what the slot is LIKE,
 *   so it is the bar that catches a family, and it sits lower because a
 *   typical pair should be visibly further apart than the worst pair.
 *
 * Both bars are stated here and asked of every slot the same way. There is no
 * per-slot relaxation, because a slot that needs one is a slot with one shape
 * in it, which is the thing being measured.
 *
 * ONE ROW PER SHAPE, NOT PER FILE (--shape-table). The shape table gets eight
 * head shapes to give eighteen head looks by swapping the mouth, and a mouth
 * swap does not move the outline: head-bear-smile and head-bear-o ARE the same
 * silhouette, on purpose. Counted per file they read as a duplicate and this
 * gate would fail a perfectly correct catalogue every time, and a gate that
 * always fails is a gate someone deletes. So when a shape table is named, the
 * files it groups under one shape id become ONE row.
 *
 * That is not a relaxation, and it is checked rather than trusted: neither bar
 * moves, two entries with DIFFERENT shape ids are compared exactly as before,
 * and every file claiming a shape must actually draw that shape's outline
 * (SAME_SHAPE_MIN or better against its siblings) or the table is lying about
 * what it holds and the gate says so. Without a table every file is its own
 * row, which is what the shipped catalogue is, and it still fails.
 *
 * WHAT IT DOES NOT DO. It says nothing about whether a part is good: that is
 * scripts/sd/rank-part.py and scripts/bots-art-check.mts, which own quality
 * and legality. This file only ever answers "are these different from each
 * other", and a catalogue needs both answers to be yes.
 *
 * The contract comes from src/app/bots/_view/rig-points.ts by import, per the
 * gates-must-import law: a gate that re-types the canvases would keep passing
 * the day the canvases move. Writes nothing.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { inflateSync } from "node:zlib";
import { RIG, FIGURE, ART_SLOTS, type ArtSlot } from "../src/app/bots/_view/rig-points";

// ── the bars ───────────────────────────────────────────────────────────────

/** How tall the whole bot is on the ring, in screen pixels. */
const RING_BOT_H = 300;
/** The closest pair in a slot may not overlap this much. */
const PAIR_BAR = 0.90;
/** The typical pair in a slot may not overlap this much. */
const MEDIAN_BAR = 0.80;
/** Ink is any pixel the part draws at all, the same definition every other gate uses. */
const INK = 0;
/**
 * Two files the shape table groups under one shape id must draw that one
 * outline. A mouth is a hole in the face, not a change of silhouette, so
 * siblings measure at or near 1.000; anything under this and the table has
 * filed two different shapes as one, which would hide a duplicate from the
 * pair bar. Deliberately far above PAIR_BAR: this is "identical", not "close".
 */
const SAME_SHAPE_MIN = 0.99;

const RING_SCALE = RING_BOT_H / FIGURE.H;

// ── PNG ────────────────────────────────────────────────────────────────────

interface Png { w: number; h: number; px: Buffer }

/**
 * A minimal PNG reader: 8-bit RGBA, non-interlaced, the five standard
 * filters, which is what resvg and Pillow both write here. Anything else is
 * refused loudly rather than guessed at. Same reader as
 * scripts/bots-art-check.mts, which is a law file this one must not edit.
 */
function readPng(path: string): Png {
  const b = readFileSync(path);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (b.length < 33 || sig.some((v, i) => b[i] !== v)) throw new Error(`${path}: not a PNG`);
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
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (depth !== 8 || ctype !== 6 || interlace !== 0) {
    throw new Error(`${path}: unsupported PNG (depth ${depth}, colour type ${ctype}, interlace ${interlace})`);
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
      } else if (filter !== 0) throw new Error(`${path}: bad filter ${filter} on row ${y}`);
      out[i] = v & 255;
    }
    out.copy(px, y * stride);
    prev = out;
  }
  return { w, h, px };
}

// ── ring size ──────────────────────────────────────────────────────────────

interface RingMask { w: number; h: number; on: Uint8Array; px: number }

/**
 * The part's ink as it lands on the ring: the canvas shrunk by RING_SCALE and
 * resampled by AREA COVERAGE. A ring pixel is ink when more than half of the
 * canvas it covers is ink, which is what a filtered downscale then an alpha
 * test would do, and which is honest about a thin moulding line: at this
 * scale a 3 px rim covers less than half of its ring pixel and correctly
 * disappears, because it disappears for the player too.
 */
function toRing(p: Png): RingMask {
  const rw = Math.max(1, Math.round(p.w * RING_SCALE));
  const rh = Math.max(1, Math.round(p.h * RING_SCALE));
  const cover = new Float64Array(rw * rh);
  const area = new Float64Array(rw * rh);
  const sx = rw / p.w, sy = rh / p.h;
  for (let y = 0; y < p.h; y++) {
    const ry = Math.min(rh - 1, Math.floor(y * sy));
    for (let x = 0; x < p.w; x++) {
      const rx = Math.min(rw - 1, Math.floor(x * sx));
      const i = ry * rw + rx;
      area[i] += 1;
      if (p.px[(y * p.w + x) * 4 + 3] > INK) cover[i] += 1;
    }
  }
  const on = new Uint8Array(rw * rh);
  let n = 0;
  for (let i = 0; i < on.length; i++) {
    if (area[i] > 0 && cover[i] / area[i] > 0.5) { on[i] = 1; n += 1; }
  }
  return { w: rw, h: rh, on, px: n };
}

/** Intersection over union of two ring masks on the same canvas. */
function overlap(a: RingMask, b: RingMask): number {
  if (a.w !== b.w || a.h !== b.h) throw new Error("two parts of one slot on different canvases");
  let inter = 0, union = 0;
  for (let i = 0; i < a.on.length; i++) {
    const x = a.on[i], y = b.on[i];
    if (x & y) inter += 1;
    if (x | y) union += 1;
  }
  return union ? inter / union : 1;
}

const median = (v: number[]): number => {
  if (!v.length) return 0;
  const s = [...v].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── the catalogue ──────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const tblIdx = argv.indexOf("--shape-table");
const TABLE = tblIdx >= 0 ? argv[tblIdx + 1] : null;
// `indexOf` returns -1 when --shape-table is absent, so `i !== tblIdx + 1` was
// `i !== 0` and silently threw away the catalogue path: every run without a
// shape table measured public/bots-art/parts and said so in a header nobody
// reads twice. Guarded, so the skip only happens when the flag is really there.
const positional = argv.filter((a, i) => !a.startsWith("--") && !(tblIdx >= 0 && i === tblIdx + 1));
const CATALOGUE = positional[0] ?? join(process.cwd(), "public", "bots-art", "parts");

if (!existsSync(CATALOGUE)) {
  console.error(`bots-lookalike-check: no catalogue at ${CATALOGUE}`);
  process.exit(2);
}

/**
 * shape id per file basename, from the table. The table's own "shape" field is
 * the claim being read; an entry without one is its own shape, so a table that
 * says nothing groups nothing.
 */
const claimed = new Map<string, string>();
if (TABLE) {
  if (!existsSync(TABLE)) {
    console.error(`bots-lookalike-check: no shape table at ${TABLE}`);
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(TABLE, "utf-8"));
  const rows: any[] = Array.isArray(raw) ? raw : raw.shapes;
  if (!Array.isArray(rows) || !rows.length) {
    console.error(`bots-lookalike-check: ${TABLE} carries no shapes list`);
    process.exit(2);
  }
  for (const r of rows) {
    if (!r?.ruler) continue;
    claimed.set(basename(String(r.ruler), ".png"), String(r.shape ?? r.id));
  }
}

/**
 * Every drawing in a slot folder, whatever it is called. The ship table names
 * its parts t<tier>-<design>.png and a shape catalogue names its parts after
 * the shape, and this gate has to hold for both: it is asking a question
 * about a folder of silhouettes, not about a naming scheme. Masks are not
 * parts and are skipped by name, the way every other reader here skips them.
 */
function partsIn(slot: ArtSlot): { name: string; path: string }[] {
  const d = join(CATALOGUE, slot);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => f.toLowerCase().endsWith(".png") && !f.toLowerCase().includes(".mask."))
    .sort()
    .map((f) => ({ name: basename(f, ".png"), path: join(d, f) }));
}

interface SlotResult {
  slot: ArtSlot;
  files: number;
  n: number;
  ringW: number;
  ringH: number;
  closest: { a: string; b: string; overlap: number } | null;
  median: number;
  furthest: { a: string; b: string; overlap: number } | null;
  distinct: number;
  fails: string[];
  tooClose?: { a: string; b: string; overlap: number }[];
}

const results: SlotResult[] = [];
const fails: string[] = [];

for (const slot of ART_SLOTS) {
  const onDisk = partsIn(slot);
  const want = RIG[slot];
  const ringOf = new Map<string, RingMask>();
  for (const f of onDisk) {
    const p = readPng(f.path);
    if (p.w !== want.w || p.h !== want.h) {
      throw new Error(
        `${f.path} is ${p.w}x${p.h}; the contract says ${want.w}x${want.h} for a ${slot}. ` +
        `Overlap between two different canvases is not a measurement.`,
      );
    }
    const m = toRing(p);
    if (!m.px) throw new Error(`${f.path} has no ink at ring size`);
    ringOf.set(f.name, m);
  }

  // ONE ROW PER SHAPE. Files the table groups under one shape id collapse to
  // one row, and the claim is verified: siblings must actually draw the same
  // outline, or the table is filing two shapes as one and hiding a duplicate.
  const groups = new Map<string, string[]>();
  for (const f of onDisk) {
    const key = claimed.get(f.name) ?? f.name;
    groups.set(key, [...(groups.get(key) ?? []), f.name]);
  }
  for (const [key, members] of groups) {
    for (let i = 1; i < members.length; i++) {
      const o = overlap(ringOf.get(members[0])!, ringOf.get(members[i])!);
      if (o < SAME_SHAPE_MIN) {
        fails.push(
          `${slot}: the shape table files ${members[0]} and ${members[i]} both as shape "${key}", but ` +
          `they overlap ${o.toFixed(3)} at ring size, under ${SAME_SHAPE_MIN.toFixed(2)}. They are ` +
          `different outlines, so grouping them would hide a duplicate from the pair bar.`,
        );
      }
    }
  }
  const files = [...groups.entries()].map(([key, members]) => ({ name: key, members }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));

  if (files.length < 2) {
    if (onDisk.length === 1 || (onDisk.length > 1 && files.length === 1)) {
      fails.push(
        `${slot}: ${onDisk.length} file${onDisk.length === 1 ? "" : "s"} in the slot and one shape ` +
        `between them. A slot with one shape in it is a slot with no choice in it.`,
      );
    }
    results.push({ slot, files: onDisk.length, n: files.length, ringW: 0, ringH: 0, closest: null,
                   median: 0, furthest: null, distinct: files.length, fails: [] });
    continue;
  }
  const masks = files.map((f) => ringOf.get(f.members[0])!);

  const pairs: { a: string; b: string; overlap: number }[] = [];
  for (let i = 0; i < masks.length; i++) {
    for (let j = i + 1; j < masks.length; j++) {
      pairs.push({ a: files[i].name, b: files[j].name, overlap: overlap(masks[i], masks[j]) });
    }
  }
  pairs.sort((p, q) => q.overlap - p.overlap);
  const closest = pairs[0];
  const furthest = pairs[pairs.length - 1];
  const med = median(pairs.map((p) => p.overlap));

  // How many shapes the slot really carries: parts joined into one group
  // whenever they overlap at or over the pair bar. Eight boots that are all
  // one boot come out as 1, and it is the sentence a person actually wants.
  const parent = files.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const p of pairs) {
    if (p.overlap < PAIR_BAR) continue;
    const i = files.findIndex((f) => f.name === p.a);
    const j = files.findIndex((f) => f.name === p.b);
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }
  const distinct = new Set(files.map((_, i) => find(i))).size;

  const sf: string[] = [];
  if (closest.overlap >= PAIR_BAR) {
    sf.push(
      `${slot}: the closest pair overlaps ${closest.overlap.toFixed(3)} at ring size, at or over the ` +
      `${PAIR_BAR.toFixed(2)} bar. ${closest.a} and ${closest.b} differ on ` +
      `${((1 - closest.overlap) * 100).toFixed(1)} pixels in 100 and are the same part twice.`,
    );
  }
  if (med >= MEDIAN_BAR) {
    sf.push(
      `${slot}: the typical pair overlaps ${med.toFixed(3)}, at or over the ${MEDIAN_BAR.toFixed(2)} ` +
      `bar. The slot reads as ${distinct === 1 ? "one shape" : `${distinct} shapes`} across ` +
      `${files.length} parts, not as ${files.length} choices.`,
    );
  }
  fails.push(...sf);
  results.push({ slot, files: onDisk.length, n: files.length, ringW: masks[0].w, ringH: masks[0].h,
                 closest, median: med, furthest, distinct, fails: sf,
                 // every pair at or over the bar, so the answer to "which one do
                 // I redraw" is in the output and not in a follow-up script
                 tooClose: pairs.filter((q) => q.overlap >= PAIR_BAR)
                   .map((q) => ({ ...q, overlap: Number(q.overlap.toFixed(4)) })) });
}

// ── report ─────────────────────────────────────────────────────────────────

if (JSON_OUT) {
  console.log(JSON.stringify({
    catalogue: CATALOGUE, ringBotH: RING_BOT_H, ringScale: RING_SCALE,
    pairBar: PAIR_BAR, medianBar: MEDIAN_BAR, sameShapeMin: SAME_SHAPE_MIN,
    shapeTable: TABLE, results, fails,
    pass: fails.length === 0,
  }, null, 1));
} else {
  console.log(`bots-lookalike-check: outline overlap per slot at ring size`);
  console.log(`  catalogue ${CATALOGUE}`);
  console.log(`  ring size: the bot stands ${RING_BOT_H} px, so a contract canvas shrinks by ` +
              `${RING_SCALE.toFixed(4)} (a head becomes ${Math.round(RIG.head.w * RING_SCALE)}x` +
              `${Math.round(RIG.head.h * RING_SCALE)})`);
  console.log(`  bars: the closest pair under ${PAIR_BAR.toFixed(2)}, the typical pair under ` +
              `${MEDIAN_BAR.toFixed(2)}\n`);
  if (TABLE) {
    console.log(`  grouped by the shape each file claims in ${TABLE}: files sharing a shape id are ` +
                `one row, and must draw one outline (${SAME_SHAPE_MIN.toFixed(2)} or better)`);
  }
  console.log();
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`  ${pad("slot", 8)}${pad("files", 7)}${pad("rows", 6)}${pad("closest pair", 40)}${pad("overlap", 9)}` +
              `${pad("differ", 9)}${pad("median", 8)}${pad("furthest", 9)}shapes`);
  for (const r of results) {
    if (!r.closest) {
      console.log(`  ${pad(r.slot, 8)}${pad(String(r.files), 7)}${pad(String(r.n), 6)}` +
                  `not measurable (needs two shapes)`);
      continue;
    }
    console.log(
      `  ${pad(r.slot, 8)}${pad(String(r.files), 7)}${pad(String(r.n), 6)}` +
      `${pad(`${r.closest.a} / ${r.closest.b}`, 40)}` +
      `${pad(r.closest.overlap.toFixed(3), 9)}` +
      `${pad(`${((1 - r.closest.overlap) * 100).toFixed(1)}/100`, 9)}` +
      `${pad(r.median.toFixed(3), 8)}` +
      `${pad(r.furthest!.overlap.toFixed(3), 9)}` +
      `${r.distinct} of ${r.n}`,
    );
  }
  console.log();
  for (const r of results) {
    if (!r.tooClose?.length) continue;
    console.log(`  ${r.slot}: ${r.tooClose.length} pair${r.tooClose.length === 1 ? "" : "s"} at or over ` +
                `the ${PAIR_BAR.toFixed(2)} bar, worst first. Redraw one of each pair:`);
    for (const q of r.tooClose) {
      console.log(`    ${q.overlap.toFixed(3)}  ${q.a} / ${q.b}  ` +
                  `(${((1 - q.overlap) * 100).toFixed(1)} pixels in 100 apart)`);
    }
  }
  if (results.some((r) => r.tooClose?.length)) console.log();
  if (fails.length) {
    for (const f of fails) console.log("FAIL " + f);
    console.log(`\nbots-lookalike-check FAIL (${fails.length})`);
  } else {
    console.log("bots-lookalike-check PASS: every slot offers shapes a player can tell apart");
  }
}

process.exit(fails.length ? 1 : 0);
