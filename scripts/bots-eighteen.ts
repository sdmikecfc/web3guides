/**
 * THE DECISION SHEET (lane P): eighteen robots as they are TODAY, and the
 * same eighteen with the look layer on, side by side, for Mike to judge.
 *
 *   npx tsx --tsconfig scripts/tsconfig.gate.json scripts/bots-eighteen.ts
 *   node scripts/bots-shot.mjs --url file:///<repo>/.bots-preview/look/_eighteen/sheet.html \
 *        --out .bots-preview/look/LOOK-EIGHTEEN.png --size <w>x<h>
 *
 * (this script prints the exact second command, sized to the sheet it wrote)
 *
 * WHY THE PICTURES ARE COMPOSITED AND THE PAGE IS HTML. The portrait route
 * takes an ID and never a look, on purpose, so eighteen made-up robots cannot
 * be driven through it. They are rendered here by the SHIPPED compositor
 * (src/app/api/bots/portrait/render.ts), written out as real PNGs, and then
 * laid out in HTML so the sheet can carry words. A sheet with no labels is a
 * sheet nobody can judge.
 *
 * TODAY means what every flat surface draws now: ONE colour for the whole
 * robot, a calm face, no sticker, no plate, no marks, no hat. That is not a
 * strawman, it is what fight/FightClient.tsx did with PAINTS[ids[i].paint]
 * before this work.
 *
 * Dev-only: nothing imports it and it never runs in a build.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { CATALOG_PARTS } from "@/lib/bots/fixtures";
import type { Build, PaintId, Part, Slot } from "@/app/bots/_engine/parts";
import { PAINT_IDS } from "@/app/bots/_engine/parts";
import {
  FACE_IDS, HAT_IDS, NO_LOOK, NO_MARKS, STICKER_IDS, STICKER_SPOTS,
  earnedMarks, markWords,
  type BotLook, type FaceId, type HatWon, type LookMarks, type StickerId, type StickerSpot,
} from "@/lib/bots/look";
import { decodePng, renderPortrait, type ArtCache, type LoadArt } from "@/app/api/bots/portrait/render";

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".bots-preview", "look", "_eighteen");
const PUBLIC = path.join(ROOT, "public");

const diskLoad: LoadArt = async (p) => {
  try {
    return new Uint8Array(await fs.readFile(path.join(PUBLIC, p.replace(/^\//, ""))));
  } catch {
    return null;
  }
};

// ── the eighteen ────────────────────────────────────────────────────────────

const bySlot = (slot: Slot, tier: number, n = 0): Part => {
  const cards = CATALOG_PARTS.filter((c) => c.slot === slot && c.tier === tier);
  const c = cards[n % Math.max(1, cards.length)] ?? CATALOG_PARTS.find((x) => x.slot === slot)!;
  return { id: c.id, s: [c.s[0], c.s[1], c.s[2]] };
};

function buildOf(tiers: readonly number[], paints: readonly PaintId[], n: number): Build {
  const paint = (p: PaintId, part: Part): Part => ({ ...part, paint: p });
  return {
    head: paint(paints[0], bySlot("head", tiers[0], n)),
    torso: paint(paints[1], bySlot("torso", tiers[1], n)),
    arms: paint(paints[2], bySlot("arms", tiers[2], n)),
    legs: paint(paints[3], bySlot("legs", tiers[3], n)),
    weapon: bySlot("weapon", tiers[4], n),
  };
}

/** TODAY: the whole robot in ONE colour, which is what a flat surface drew. */
function flatten(b: Build, one: PaintId): Build {
  const p = (part: Part): Part => ({ ...part, paint: one });
  return { head: p(b.head), torso: p(b.torso), arms: p(b.arms), legs: p(b.legs), weapon: p(b.weapon) };
}

const P = PAINT_IDS;

interface Row {
  n: number;
  build: Build;
  flat: Build;
  look: BotLook;
  marks: LookMarks;
  wins: number;
  /** the words the bay sheet would say about what it has won */
  earnedWords: string;
  colours: PaintId[];
  note: string;
}

/** wins, repairs, level, champion -> the ladder, walked by the shipped module */
const ladder = (wins: number, repairs: number, level: number, champion = false): LookMarks =>
  earnedMarks({ wins, level, repairs, champion, colourMatch: false, fourStar: false, hats: [], paints: [], plateNumber: null });

function rows(): Row[] {
  // four found colours each: a part keeps the colour it arrived in, so a
  // robot is normally four colours at once
  const sets: PaintId[][] = [
    [P[0], P[1], P[2], P[3]], [P[4], P[5], P[6], P[7]], [P[3], P[6], P[1], P[5]],
    [P[7], P[2], P[4], P[0]], [P[2], P[3], P[7], P[6]], [P[5], P[0], P[3], P[1]],
    [P[1], P[4], P[0], P[2]], [P[6], P[7], P[5], P[4]], [P[0], P[0], P[0], P[0]],
    [P[3], P[1], P[6], P[2]], [P[4], P[2], P[7], P[5]], [P[1], P[5], P[3], P[6]],
    [P[2], P[6], P[0], P[7]], [P[5], P[3], P[4], P[1]], [P[7], P[0], P[2], P[4]],
    [P[6], P[1], P[5], P[3]], [P[4], P[4], P[4], P[4]], [P[0], P[7], P[3], P[2]],
  ];
  const tiers: number[][] = [
    [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [4, 4, 4, 4, 4],
    [4, 1, 3, 2, 1], [1, 4, 2, 3, 4], [3, 2, 4, 1, 2], [2, 3, 1, 4, 3],
    [4, 4, 3, 3, 4], [1, 2, 1, 2, 1], [3, 1, 4, 2, 3], [2, 2, 2, 2, 2],
    [1, 3, 2, 4, 2], [4, 2, 1, 3, 4], [2, 4, 4, 1, 3], [3, 3, 2, 2, 1],
    [1, 1, 2, 2, 3], [4, 3, 4, 3, 4],
  ];
  // the ladder across its whole range, including past its last drawn step
  /** [wins, repairs, level, champion] - the marks are WALKED from these by
   *  the shipped ladder, never typed in, and the win count is kept so the
   *  sentence under the robot can name it. */
  const won: [number, number, number, boolean][] = [
    [0, 0, 1, false], [1, 0, 1, false], [5, 1, 3, false], [10, 2, 5, false],
    [15, 3, 7, false], [20, 4, 10, false], [25, 5, 10, true], [103, 9, 12, true],
    [7, 1, 5, false], [0, 2, 2, false], [26, 6, 10, false], [40, 3, 10, false],
    [2, 0, 4, false], [12, 7, 9, false], [30, 2, 5, false], [18, 1, 10, true],
    [3, 3, 6, false], [60, 4, 11, false],
  ];
  const marks: LookMarks[] = won.map(([w, r, l, c]) => ladder(w, r, l, c));
  const plates: (number | null)[] = [
    null, 7, 12, 40, 3, 88, 1, 205, 61, 9, 14, 41, 5, 27, 33, 76, 2, 99,
  ];
  const notes = [
    "brand new, nothing won yet", "first win, one star", "five wins, a lost fight",
    "ten wins, two patches, cuff bands", "fifteen wins", "twenty wins, sparkle eyes",
    "twenty five wins: the gold star, and a crown", "past the end of the ladder: the plate counts",
    "a matched set, all four the same colour", "no wins, two patches", "past the gold star",
    "forty wins", "a young robot", "seven patches, three drawn", "thirty wins",
    "week champion", "three patches", "sixty wins",
  ];
  // a hat on exactly three
  const hatOn = new Set([3, 7, 15]);
  const hatOf = (i: number): HatWon => ({ kind: HAT_IDS[i % HAT_IDS.length], color: P[(i * 3) % P.length] });

  const out: Row[] = [];
  for (let i = 0; i < 18; i++) {
    const cols = sets[i];
    const build = buildOf(tiers[i], cols, i);
    out.push({
      n: i + 1,
      build,
      flat: flatten(build, cols[1]),
      look: {
        face: FACE_IDS[i % FACE_IDS.length] as FaceId,
        sticker: STICKER_IDS[i % STICKER_IDS.length] as StickerId,
        spot: STICKER_SPOTS[i % STICKER_SPOTS.length] as StickerSpot,
        stickerPaint: cols[(i + 1) % 4],
        hat: hatOn.has(i) ? hatOf(i) : null,
        plateNumber: plates[i],
      },
      marks: marks[i],
      wins: won[i][0],
      earnedWords: markWords(marks[i], won[i][0]).join(" ") || "Nothing won yet.",
      colours: Array.from(new Set(cols)),
      note: notes[i],
    });
  }
  return out;
}

// ── run ─────────────────────────────────────────────────────────────────────

const SIZE = 300;

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const list = rows();
  const cache: ArtCache = new Map();
  let bytesToday = 0;
  let bytesLook = 0;

  for (const r of list) {
    const today = await renderPortrait({ build: r.flat, look: NO_LOOK, marks: NO_MARKS }, SIZE, diskLoad, cache);
    const look = await renderPortrait({ build: r.build, look: r.look, marks: r.marks }, SIZE, diskLoad, cache);
    await fs.writeFile(path.join(OUT_DIR, `today-${r.n}.png`), today.png);
    await fs.writeFile(path.join(OUT_DIR, `look-${r.n}.png`), look.png);
    bytesToday += today.png.length;
    bytesLook += look.png.length;
    // read back through our own decoder, so a sheet can never show a file the
    // game could not itself open
    decodePng(today.png);
    decodePng(look.png);
    const tints = new Set(look.tints);
    console.log(
      `  ${String(r.n).padStart(2)}  ${r.colours.join("/").padEnd(24)} ${r.look.face.padEnd(6)} ` +
        `${String(r.look.sticker).padEnd(8)} on ${r.look.spot.padEnd(6)} ` +
        `${r.look.hat ? `${r.look.hat.color} ${r.look.hat.kind}`.padEnd(16) : "".padEnd(16)} ` +
        `${tints.size} colours drawn   ${r.earnedWords}`,
    );
  }

  const css = `
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #0b0e17; color: #e8ecf6;
           font: 15px/1.45 "Segoe UI", system-ui, sans-serif; padding: 34px 30px 40px; }
    h1 { font-size: 30px; margin: 0 0 4px; letter-spacing: .3px; }
    .sub { color: #8e9bb5; margin: 0 0 26px; font-size: 15px; }
    .head { display: grid; grid-template-columns: 62px 1fr 1fr; gap: 18px;
            align-items: end; margin-bottom: 10px; position: sticky; top: 0;
            background: #0b0e17; padding: 10px 0 8px; z-index: 2; }
    .head div { font-weight: 700; letter-spacing: 1.4px; font-size: 13px; text-transform: uppercase; }
    .row { display: grid; grid-template-columns: 62px 1fr 1fr; gap: 18px;
           align-items: start; padding: 14px 0; border-top: 1px solid #1b2233; }
    .n { font-size: 26px; font-weight: 700; color: #55617d; text-align: right; padding-top: 84px; }
    .cell { display: flex; gap: 16px; align-items: flex-start; }
    .cell img { width: ${SIZE}px; height: ${SIZE}px; display: block;
                background: #121726; border-radius: 16px; flex: 0 0 auto; }
    .meta { padding-top: 6px; font-size: 14px; color: #9aa7c2; max-width: 300px; }
    .meta b { color: #e8ecf6; font-weight: 600; }
    .pips { display: flex; gap: 6px; margin: 8px 0 10px; }
    .pip { width: 18px; height: 18px; border-radius: 5px; border: 1px solid #2a3348; }
    .note { color: #6f7c98; font-style: normal; margin-top: 8px; }
    .flat { color: #6f7c98; padding-top: 6px; font-size: 14px; max-width: 220px; }
  `;
  const PAINT_CSS: Record<string, string> = {
    mint: "#9fe3c0", coral: "#f2938a", butter: "#f2d98a", sky: "#8fc4f2",
    lilac: "#c3aef2", moss: "#7fa87a", cream: "#f0e6cf", ink: "#3c4356",
  };

  const body = list.map((r) => `
    <div class="row">
      <div class="n">${r.n}</div>
      <div class="cell">
        <img src="today-${r.n}.png" alt="">
        <div class="flat">One colour for the whole robot. Calm face. No sticker, no number, nothing it has won.</div>
      </div>
      <div class="cell">
        <img src="look-${r.n}.png" alt="">
        <div class="meta">
          <div class="pips">${r.colours.map((c) => `<span class="pip" style="background:${PAINT_CSS[c]}"></span>`).join("")}</div>
          <b>${r.colours.length} colours</b>, ${r.look.face} face<br>
          ${r.look.sticker ? `${r.look.sticker} sticker on the ${r.look.spot}` : "no sticker"}<br>
          ${r.marks.count != null
            ? `<b>${r.marks.count} on its plate</b>, which is its wins: the row of stars is full and the number carries on`
            : r.look.plateNumber === null ? "no number yet" : `number ${r.look.plateNumber} on its plate`}<br>
          ${r.look.hat ? `<b>a ${r.look.hat.color} ${r.look.hat.kind}</b>, won from a big robot<br>` : ""}
          <b>${r.earnedWords}</b>
          <div class="note">${r.note}</div>
        </div>
      </div>
    </div>`).join("");

  const html = `<!doctype html><meta charset="utf-8"><title>Battle Bots: the look</title>
<style>${css}</style>
<h1>Eighteen robots, today and with the look</h1>
<p class="sub">Left is what every flat screen draws now. Right is the same robot with the colours it found, the face and sticker its owner picked, and the marks it has won. Nothing on the right changes a fight.</p>
<div class="head"><div></div><div>Today</div><div>With the look</div></div>
${body}`;

  await fs.writeFile(path.join(OUT_DIR, "sheet.html"), html, "utf8");

  const height = 210 + list.length * (SIZE + 30);
  const width = 62 + 18 + (SIZE + 16 + 300) + 18 + (SIZE + 16 + 220) + 60;
  console.log(`\n  wrote ${list.length * 2} pictures at ${SIZE} px (today ${(bytesToday / 1024).toFixed(0)} KB, look ${(bytesLook / 1024).toFixed(0)} KB)`);
  console.log(`  sheet ${path.join(OUT_DIR, "sheet.html")}`);
  console.log(`\n  now capture it:\n`);
  console.log(`    node scripts/bots-shot.mjs --url "file:///${path.join(OUT_DIR, "sheet.html").replace(/\\/g, "/")}" --out .bots-preview/look/LOOK-EIGHTEEN.png --size ${width}x${height}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
