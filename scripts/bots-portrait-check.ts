/**
 * BATTLE BOTS PORTRAIT GATE. Twelve robots, four sizes, one sheet.
 *
 *   npx tsx --tsconfig scripts/tsconfig.gate.json scripts/bots-portrait-check.ts
 *
 * WHAT IT PROVES, and why each one is here.
 *
 *  1. EVERY PART'S COLOUR IS IN THE PICTURE. This is the whole lane. A robot
 *     wears four colours and every small picture of it was showing one colour
 *     or grey clay. The check does not look for the paint's own hex, because
 *     the paint is a MULTIPLY: what lands on screen is the clay times the
 *     colour, which is darker. It normalises each opaque output pixel by its
 *     own brightest channel, which cancels the multiply's scaling exactly,
 *     and classifies it against the eight paints put through the same clay.
 *     Every colour the robot is wearing has to WIN pixels, at all four sizes.
 *
 *  2. A ROBOT WITH NO LOOK STILL RENDERS. No face, no sticker, no hat, no
 *     marks, no plate number. That is a legal robot on day one and the most
 *     common one in the game.
 *
 *  3. THE PNG IS A PNG. Every picture is decoded again with our own decoder
 *     before it goes on the sheet, so the codec is proved round trip rather
 *     than assumed.
 *
 *  4. THE ART FOLDER CAN GO. The last robot is rendered with the loader
 *     refusing every file, which is the house law: every canvas keeps
 *     working with public/bots-art removed.
 *
 * IT IMPORTS THE SHIPPED COMPOSITOR (the gates-must-import law): a gate that
 * reimplements what it checks reproduces the author's assumptions and passes.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { CATALOG_PARTS } from "@/lib/bots/fixtures";
import type { Build, PaintId, Part, Slot } from "@/app/bots/_engine/parts";
import { PAINT_IDS } from "@/app/bots/_engine/parts";
import { PORTRAIT_SIZES } from "@/app/bots/_view/pieces";
import {
  FACE_IDS,
  HAT_IDS,
  NO_LOOK,
  NO_MARKS,
  PAINT_HEX,
  STICKER_IDS,
  STICKER_SPOTS,
  digitShapes,
  earnedMarks,
  markWords,
  twinWords,
  type BotLook,
  type FaceId,
  type HatWon,
  type LookMarks,
  type StickerId,
  type StickerSpot,
} from "@/lib/bots/look";
import { K } from "@/app/bots/_ui/tokens";
import { decodePng, encodePng, renderPortrait, type ArtCache, type Bitmap, type LoadArt } from "@/app/api/bots/portrait/render";

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".bots-preview", "look");
const OUT = path.join(OUT_DIR, "PORTRAITS.png");
const PUBLIC = path.join(ROOT, "public");

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  FAIL  ${msg}`);
};
const ok = (msg: string) => console.log(`  ok    ${msg}`);

// ── the loader: files off disk, exactly what the route fetches over http ────

const diskLoad: LoadArt = async (p) => {
  try {
    return new Uint8Array(await fs.readFile(path.join(PUBLIC, p.replace(/^\//, ""))));
  } catch {
    return null;
  }
};
const noArtLoad: LoadArt = async () => null;

// ── twelve robots ───────────────────────────────────────────────────────────

const bySlot = (slot: Slot, tier: number, n = 0): Part => {
  const cards = CATALOG_PARTS.filter((c) => c.slot === slot && c.tier === tier);
  const c = cards[n % Math.max(1, cards.length)] ?? CATALOG_PARTS.find((x) => x.slot === slot)!;
  return { id: c.id, s: [c.s[0], c.s[1], c.s[2]] };
};

function buildOf(tiers: [number, number, number, number, number], paints: [PaintId, PaintId, PaintId, PaintId], n: number): Build {
  const paint = (p: PaintId, part: Part): Part => ({ ...part, paint: p });
  return {
    head: paint(paints[0], bySlot("head", tiers[0], n)),
    torso: paint(paints[1], bySlot("torso", tiers[1], n)),
    arms: paint(paints[2], bySlot("arms", tiers[2], n)),
    legs: paint(paints[3], bySlot("legs", tiers[3], n)),
    weapon: bySlot("weapon", tiers[4], n),
  };
}

interface Robot {
  label: string;
  build: Build;
  look: BotLook;
  marks: LookMarks;
  /** what the picture must contain */
  paints: PaintId[];
  load: LoadArt;
}

const P = PAINT_IDS;
const face = (i: number): FaceId => FACE_IDS[i % FACE_IDS.length];
const sticker = (i: number): StickerId => STICKER_IDS[i % STICKER_IDS.length];
const spot = (i: number): StickerSpot => STICKER_SPOTS[i % STICKER_SPOTS.length];
/** a hat, kind and colour, the way the drop hands one out. The colour is
 *  the palette walked at a different stride from the kind, so no robot on the
 *  sheet wears a hat the same colour as the one before it. */
const hat = (i: number): HatWon => ({ kind: HAT_IDS[i % HAT_IDS.length], color: PAINT_IDS[(i * 3) % PAINT_IDS.length] });

/** wins, losses, level, champion -> the earned half, walked by the shipped ladder */
const earned = (wins: number, losses: number, level: number, champion = false): LookMarks =>
  earnedMarks({
    wins, level, repairs: losses, champion,
    colourMatch: false, fourStar: false, hats: [], paints: [], plateNumber: null,
  });

function robots(): Robot[] {
  const out: Robot[] = [];
  const sets: [PaintId, PaintId, PaintId, PaintId][] = [
    [P[0], P[1], P[2], P[3]], // mint coral butter sky
    [P[4], P[5], P[6], P[7]], // lilac moss cream ink
    [P[3], P[6], P[1], P[5]],
    [P[7], P[2], P[4], P[0]],
    [P[2], P[3], P[7], P[6]],
    [P[5], P[0], P[3], P[1]],
    [P[1], P[4], P[0], P[2]],
    [P[6], P[7], P[5], P[4]],
    [P[0], P[0], P[0], P[0]], // a matched set: one colour on all four
    [P[3], P[1], P[6], P[2]],
    [P[4], P[2], P[7], P[5]],
    [P[1], P[5], P[3], P[6]],
  ];
  const tiers: [number, number, number, number, number][] = [
    [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [4, 4, 4, 4, 4],
    [4, 1, 3, 2, 1], [1, 4, 2, 3, 4], [3, 2, 4, 1, 2], [2, 3, 1, 4, 3],
    [4, 4, 3, 3, 4], [1, 2, 1, 2, 1], [3, 1, 4, 2, 3], [2, 2, 2, 2, 2],
  ];
  const marks: LookMarks[] = [
    earned(0, 0, 1), earned(1, 0, 1), earned(5, 1, 3), earned(10, 2, 5),
    earned(15, 3, 7), earned(20, 4, 10), earned(25, 5, 10, true), earned(103, 9, 12, true),
    earned(7, 1, 5), earned(0, 2, 2), earned(26, 6, 10), NO_MARKS,
  ];
  for (let i = 0; i < 12; i++) {
    const paints = sets[i];
    const last = i === 11;
    out.push({
      label: last ? "no look at all, and the art folder gone" : `four colours, ${face(i)}, ${sticker(i)} on the ${spot(i)}`,
      build: buildOf(tiers[i], paints, i),
      look: last
        ? NO_LOOK
        : {
            face: face(i),
            sticker: sticker(i),
            spot: spot(i),
            stickerPaint: paints[(i + 1) % 4],
            hat: i % 3 === 0 ? hat(i) : null,
            plateNumber: [null, 7, 12, 40, 3, 88, 1, 205, 61, 9, 14, null][i] as number | null,
          },
      marks: marks[i],
      paints: Array.from(new Set(paints)),
      load: last ? noArtLoad : diskLoad,
    });
  }
  return out;
}

// ── is every colour in the picture? ────────────────────────────────────────
/**
 * THE MEASUREMENT. A painted pixel is base x paint, and the base is the
 * bake's neutral clay under a vertical ramp. Divide a pixel by its own
 * brightest channel and both the ramp and the clay's brightness cancel, so
 * what is left is the paint's own chromaticity through the clay. Every paint
 * is put through the same clay to build the eight targets, and a pixel is
 * counted for whichever target it is nearest, or for none when it is nearer
 * to nothing (the sole's coral, the key's brass, the grille, the lens).
 */
const CLAY = parseInt(K.clay.slice(1), 16);

function chroma(r: number, g: number, b: number): [number, number, number] {
  const m = Math.max(r, g, b, 1);
  return [r / m, g / m, b / m];
}

const TARGETS = PAINT_IDS.map((id) => {
  const p = PAINT_HEX[id];
  return {
    id,
    c: chroma(
      (((CLAY >> 16) & 255) * ((p >> 16) & 255)) / 255,
      (((CLAY >> 8) & 255) * ((p >> 8) & 255)) / 255,
      ((CLAY & 255) * (p & 255)) / 255,
    ),
  };
});

/** how far a pixel may sit from a paint's chromaticity and still be it. The
 *  closest two paints (ink and sky) are 0.26 apart through the clay, so half
 *  of that can never claim a pixel for the wrong colour. */
const NEAR = 0.13;

function countPaints(bm: Bitmap): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < bm.w * bm.h; i++) {
    const d = i * 4;
    if (bm.px[d + 3] < 200) continue;
    const c = chroma(bm.px[d], bm.px[d + 1], bm.px[d + 2]);
    let best = "";
    let bd = NEAR;
    for (const t of TARGETS) {
      const dx = c[0] - t.c[0], dy = c[1] - t.c[1], dz = c[2] - t.c[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < bd) {
        bd = dist;
        best = t.id;
      }
    }
    if (best) out.set(best, (out.get(best) ?? 0) + 1);
  }
  return out;
}

// ── the sheet ───────────────────────────────────────────────────────────────

function blank(w: number, h: number, rgb: number): Bitmap {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = (rgb >> 16) & 255;
    px[i * 4 + 1] = (rgb >> 8) & 255;
    px[i * 4 + 2] = rgb & 255;
    px[i * 4 + 3] = 255;
  }
  return { w, h, px };
}

function blit(dst: Bitmap, src: Bitmap, x0: number, y0: number): void {
  for (let y = 0; y < src.h; y++) {
    const dy = y0 + y;
    if (dy < 0 || dy >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const dx = x0 + x;
      if (dx < 0 || dx >= dst.w) continue;
      const s = (y * src.w + x) * 4;
      const a = src.px[s + 3] / 255;
      if (a <= 0) continue;
      const d = (dy * dst.w + dx) * 4;
      for (let k = 0; k < 3; k++) dst.px[d + k] = Math.round(src.px[s + k] * a + dst.px[d + k] * (1 - a));
      dst.px[d + 3] = 255;
    }
  }
}

function box(dst: Bitmap, x0: number, y0: number, w: number, h: number, rgb: number): void {
  for (let y = y0; y < y0 + h; y++) {
    if (y < 0 || y >= dst.h) continue;
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || x >= dst.w) continue;
      const d = (y * dst.w + x) * 4;
      dst.px[d] = (rgb >> 16) & 255;
      dst.px[d + 1] = (rgb >> 8) & 255;
      dst.px[d + 2] = rgb & 255;
      dst.px[d + 3] = 255;
    }
  }
}

/** the robot's number, drawn with the plate's own seven segment digits */
function digits(dst: Bitmap, n: number, x: number, y: number, s: number, rgb: number): void {
  const ds = String(n).split("");
  ds.forEach((d, i) => {
    for (const shape of digitShapes(Number(d))) {
      if (shape.k !== "rect") continue;
      box(dst, Math.round(x + i * s * 1.7 + shape.x * s), Math.round(y + shape.y * s), Math.max(1, Math.round(shape.w * s)), Math.max(1, Math.round(shape.h * s)), rgb);
    }
  });
}

// ── run ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const list = robots();
  const gap = 14;
  const rowH = 432 + gap;
  const colX: number[] = [];
  let x = 120;
  for (const s of [...PORTRAIT_SIZES].sort((a, b) => b - a)) {
    colX.push(x);
    x += s + gap;
  }
  const sheet = blank(x + gap, rowH * list.length + gap, 0x141824);

  const timing = new Map<number, number[]>();
  for (const s of PORTRAIT_SIZES) timing.set(s, []);

  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const y0 = gap + i * rowH;
    // the four paints as a strip, so the sheet says what to look for
    r.paints.forEach((p, k) => box(sheet, 24, y0 + 8 + k * 30, 60, 24, PAINT_HEX[p]));
    digits(sheet, i + 1, 26, y0 + 8 + r.paints.length * 30 + 16, 9, 0x8fa0c8);

    const sizes = [...PORTRAIT_SIZES].sort((a, b) => b - a);
    for (let c = 0; c < sizes.length; c++) {
      const size = sizes[c];
      const t0 = process.hrtime.bigint();
      const res = await renderPortrait({ build: r.build, look: r.look, marks: r.marks }, size, r.load);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      timing.get(size)!.push(ms);

      // 3. the png is a png: decode our own output before it goes on the sheet
      let bm: Bitmap;
      try {
        bm = decodePng(res.png);
      } catch (e) {
        fail(`robot ${i + 1} at ${size}: our own png did not decode (${String(e)})`);
        continue;
      }
      if (bm.w !== size || bm.h !== size) fail(`robot ${i + 1} at ${size}: png is ${bm.w}x${bm.h}`);
      let opaque = 0;
      for (let k = 0; k < bm.w * bm.h; k++) if (bm.px[k * 4 + 3] > 200) opaque++;
      if (opaque < size * size * 0.03) fail(`robot ${i + 1} at ${size}: only ${opaque} solid pixels, the robot is missing`);

      // 1. every part's colour is present
      const found = countPaints(bm);
      const floor = Math.max(2, Math.round(size * size * 0.0008));
      for (const p of r.paints) {
        const n = found.get(p) ?? 0;
        if (n < floor) {
          fail(`robot ${i + 1} at ${size}: wearing ${p} but only ${n} pixels of it (needs ${floor})`);
        }
      }
      blit(sheet, bm, colX[c], y0 + Math.round((432 - size) / 2));
      if (size === 432 && i === 0) {
        console.log(`  note  robot 1 drew ${res.artParts} of 5 parts from real art`);
      }
    }
    ok(`robot ${String(i + 1).padStart(2)}  ${r.paints.join(" ")}  ${r.label}`);
  }

  // 2 and 4: the plainest robot there is, with no art on disk
  const bare = await renderPortrait({ build: buildOf([1, 1, 1, 1, 1], [P[0], P[1], P[2], P[3]], 0), look: NO_LOOK, marks: NO_MARKS }, 300, noArtLoad);
  const bareBm = decodePng(bare.png);
  let bareOpaque = 0;
  for (let k = 0; k < bareBm.w * bareBm.h; k++) if (bareBm.px[k * 4 + 3] > 200) bareOpaque++;
  if (bareOpaque < 300 * 300 * 0.03) fail(`a robot with no look and no art drew only ${bareOpaque} solid pixels`);
  else ok(`a robot with no look and no art still renders (${bareOpaque} solid pixels, ${bare.artParts} real parts)`);

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT, encodePng(sheet));

  console.log("");
  console.log(`  sheet  ${OUT}  ${sheet.w}x${sheet.h}`);
  // the same twelve again through ONE shared art cache, which is what the
  // route actually does: eighty part files exist in the whole game and
  // decoding ten of them is most of what a cold picture costs
  const warmCache: ArtCache = new Map();
  const warm = new Map<number, number[]>();
  for (const s of PORTRAIT_SIZES) warm.set(s, []);
  for (const s of PORTRAIT_SIZES) {
    for (const r of list) {
      const t0 = process.hrtime.bigint();
      await renderPortrait({ build: r.build, look: r.look, marks: r.marks }, s, r.load, warmCache);
      warm.get(s)!.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
  }

  const line = (label: string, t: number[]) => {
    const sorted = [...t].sort((a, b) => a - b);
    const mean = t.reduce((a, b) => a + b, 0) / t.length;
    console.log(
      `    ${label}   mean ${mean.toFixed(1).padStart(6)} ms   median ${sorted[Math.floor(sorted.length / 2)].toFixed(1).padStart(6)} ms   worst ${sorted[sorted.length - 1].toFixed(1).padStart(6)} ms`,
    );
  };
  console.log("");
  console.log("  TIMINGS, twelve robots each, COLD (every part decoded again)");
  for (const s of PORTRAIT_SIZES) line(`${String(s).padStart(3)} px`, timing.get(s)!);
  console.log("");
  console.log("  TIMINGS, twelve robots each, WARM (one shared art cache, as the route runs)");
  for (const s of PORTRAIT_SIZES) line(`${String(s).padStart(3)} px`, warm.get(s)!);
  // ── the plate carries the COUNT, not the robot's name number ─────────────
  //
  // Past the gold star the plate stops being decoration and becomes the score,
  // so two robots with the same wins and DIFFERENT name numbers have to draw
  // the same plate. Comparing the two renders pixel for pixel needs no digit
  // reading: if the name number reached the plate at all, they differ.
  {
    const base = buildOf([2, 2, 2, 2, 2], [P[0], P[1], P[2], P[3]], 0);
    const past = earned(103, 0, 1);
    const withName = (n: number) => ({ build: base, look: { ...NO_LOOK, plateNumber: n }, marks: past });
    const a = decodePng((await renderPortrait(withName(205), 300, diskLoad)).png);
    const b = decodePng((await renderPortrait(withName(7), 300, diskLoad)).png);
    let differ = 0;
    for (let k = 0; k < a.px.length; k++) if (a.px[k] !== b.px[k]) differ++;
    if (differ !== 0) fail(`103 wins: the plate changed with the robot's NAME number (${differ} bytes differ), so the ladder reads as capped on every list`);
    else ok("past the gold star two robots with different names draw the same plate: it prints the win count");

    // and it is really the count, not a blank plate: a 24 win robot (one step
    // short) must still print its name number, and the two must differ
    const short = { build: base, look: { ...NO_LOOK, plateNumber: 205 }, marks: earned(24, 0, 1) };
    const c = decodePng((await renderPortrait(short, 300, diskLoad)).png);
    let d2 = 0;
    for (let k = 0; k < a.px.length; k++) if (a.px[k] !== c.px[k]) d2++;
    if (d2 === 0) fail("a 24 win robot and a 103 win robot drew the identical picture: the plate is printing nothing");
    else ok(`one step short of the gold star the plate still shows the name number (${d2} bytes differ from the 103 win robot)`);
  }

  console.log("");
  console.log(`  words  ${markWords(earned(103, 9, 12, true), 103).join(" / ")}`);
  console.log(`  words  ${twinWords(0)}  |  ${twinWords(3)}`);
  console.log("");
  if (failures) {
    console.error(`PORTRAIT GATE FAILED: ${failures} problem${failures === 1 ? "" : "s"}`);
    process.exit(1);
  }
  console.log("PORTRAIT GATE PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
