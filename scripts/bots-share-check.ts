/**
 * BATTLE BOTS SHARE GATE: the three surfaces that show a robot they do not
 * own, and the one sheet that proves it.
 *
 *   npx tsx --tsconfig scripts/tsconfig.gate.json scripts/bots-share-check.ts
 *
 * THE LANE. The fights list, the board and the knockout card each used to
 * draw their own idea of a robot: six rounded rectangles in one paint, a
 * coloured dot, and unpainted clay. A robot is FOUR colours at once with a
 * face, a sticker, the marks it has earned and whatever it has won on its
 * head (ADR-0141 and the look lane), so all three were showing a robot that
 * does not exist. They now all ask /api/bots/portrait, and none of them
 * assembles a robot itself.
 *
 * WHAT THIS PROVES, and why each one is here.
 *
 *  1. NO SURFACE DRAWS ITS OWN ROBOT. The regression this lane exists to
 *     stop is somebody adding a quick silhouette back "just for this row".
 *     The scan looks for the shape of one: a run of <rect>s inside an <svg>,
 *     the retired THUMB_PIECES table, and any <img> whose src is not built
 *     by portraitUrl.
 *
 *  2. A PICTURE IS ASKED FOR BY ID, NEVER BY LOOK. portraitUrl is fed an
 *     object carrying every look word there is and none of them may reach
 *     the url. This is the server-is-the-truth law as an assertion: a caller
 *     that could put a crown in a query string could wear one it never won.
 *
 *  3. SHARP, AND NOT HEAVY. Every drawn size in PORTRAIT_ON is checked
 *     against the file the route would serve, and the weight of a screenful
 *     of each list is printed in kilobytes. "Keep the load fast" is not a
 *     feeling.
 *
 *  4. THE BOARD ROW DOES NOT CAP. Five robots are drawn and the rest are
 *     counted in words, past the last drawn one, for ever.
 *
 *  5. THE CRACK LANDS ON THE ROBOT. A robot is not centred in its own
 *     square, because a weapon hangs off one side; anything laid over a
 *     portrait from outside has to know that.
 *
 *  6. THE CARD IS 1200x630 AND EDGE SAFE, measured on a real captured card
 *     when one is on disk (see the shot commands printed at the end).
 *
 * IT IMPORTS THE SHIPPED MODULES (the gates-must-import law): a gate that
 * restates the rule it is checking reproduces the author's assumptions and
 * passes. Every number below comes from the files the game runs.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { PORTRAIT_ON, PORTRAIT_ROW_SHOWN, SOURCE_FACTOR, sourceSizeFor } from "@/app/bots/_components/BotPortrait";
import { PORTRAIT_SIZES, bodyCentreInSquare, fitInSquare, FIGURE_INK, portraitUrl } from "@/app/bots/_view/pieces";
import { decodePng, encodePng, renderPortrait, type ArtCache, type Bitmap, type LoadArt } from "@/app/api/bots/portrait/render";
import { CATALOG_PARTS } from "@/lib/bots/fixtures";
import type { Build, PaintId, Part, Slot } from "@/app/bots/_engine/parts";
import { STICKER_IDS, earnedMarks, markWords, type BotLook } from "@/lib/bots/look";

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".bots-preview", "look");
const SHARE = path.join(OUT_DIR, "SHARE.png");

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  FAIL  ${msg}`);
};
const ok = (msg: string) => console.log(`  ok    ${msg}`);

const read = async (rel: string): Promise<string> => fs.readFile(path.join(ROOT, rel), "utf8");

/** the three surfaces of this lane, plus the one component they all go through */
const SURFACES: readonly { rel: string; name: string }[] = [
  { rel: "src/app/bots/battles/BattlesClient.tsx", name: "the fights page" },
  { rel: "src/app/bots/board/BoardTable.tsx", name: "the board" },
  { rel: "src/app/api/bots/card/ko/route.tsx", name: "the knockout card" },
];
const COMPONENT = "src/app/bots/_components/BotPortrait.tsx";

// ── 1. nobody draws their own robot ────────────────────────────────────────

/**
 * The shape of a hand-drawn robot: several <rect>s in one <svg>. One or two
 * is a chip or an icon; the silhouette this lane deleted had six, and every
 * other one anybody writes will have about that many. Four is the line.
 */
const RECTS_THAT_MEAN_A_ROBOT = 4;

async function noHomeMadeRobots(): Promise<void> {
  for (const { rel, name } of [...SURFACES, { rel: COMPONENT, name: "the portrait component" }]) {
    const src = await read(rel);

    if (/THUMB_PIECES|STANDIN/.test(src)) fail(`${name} (${rel}) still has a drawn robot table`);

    for (const svg of src.match(/<svg[\s\S]*?<\/svg>/g) ?? []) {
      const rects = (svg.match(/<rect\b/g) ?? []).length;
      if (rects >= RECTS_THAT_MEAN_A_ROBOT) {
        fail(`${name} (${rel}) has an <svg> with ${rects} rectangles in it, which is a robot drawn by hand`);
      }
    }

    // every <img> on these surfaces is a portrait, and its src is built by
    // the one function that knows the route's address
    for (const tag of src.match(/<img[\s\S]{0,320}?\/>/g) ?? []) {
      const m = /src=\{([^}]*)\}/.exec(tag);
      if (!m) {
        fail(`${name} (${rel}) has an <img> with no computed src`);
        continue;
      }
      if (!/portraitUrl\(|\bsrc\b/.test(m[1])) {
        fail(`${name} (${rel}) has an <img> whose src is not a portrait: ${m[1].slice(0, 60)}`);
      }
    }
  }
  // and each surface actually reaches the one compositor
  const battles = await read(SURFACES[0].rel);
  const board = await read(SURFACES[1].rel);
  const card = await read(SURFACES[2].rel);
  if (!/_components\/BotPortrait/.test(battles)) fail("the fights page does not use BotPortrait");
  if (!/_components\/BotPortrait/.test(board)) fail("the board does not use BotPortrait");
  if (!/portraitUrl/.test(card)) fail("the knockout card does not ask the portrait route for its robots");
  if (failures === 0) ok("no surface draws its own robot, and all three reach the one compositor");
}

// ── 2. by id, never by look ────────────────────────────────────────────────

/** every word for something a robot wears or has earned */
const LOOK_WORDS = [
  "face", "sticker", "spot", "hat", "crown", "star", "stars", "plate", "plateNumber",
  "paint", "paints", "colour", "color", "mark", "marks", "patch", "cuff", "sparkle", "wink",
];

function byIdNeverByLook(): void {
  const loaded: Record<string, unknown> = { bot: 12, size: 120 };
  for (const w of LOOK_WORDS) loaded[w] = "gold";
  const url = portraitUrl(loaded as Parameters<typeof portraitUrl>[0]);
  const q = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  const keys = Array.from(q.keys()).sort();
  const allowed = ["b", "f", "h", "s", "t", "v", "w"];
  const stray = keys.filter((k) => !allowed.includes(k));
  if (stray.length) fail(`a portrait url carried ${stray.join(", ")}, which is not an id`);
  const text = url.toLowerCase();
  const leaked = LOOK_WORDS.filter((w) => text.includes(w.toLowerCase()) || text.includes("gold"));
  if (leaked.length) fail(`a look reached the url: ${url}`);

  // and the three ways to name a robot are exactly three
  const kinds = [
    portraitUrl({ bot: 7, size: 64 }),
    portraitUrl({ fight: "169", side: 1, size: 64 }),
    portraitUrl({ house: "kettle", total: 22, size: 64 }),
  ];
  if (!kinds[0].includes("b=7")) fail("a bay robot is not named by its id");
  if (!(kinds[1].includes("f=169") && kinds[1].includes("w=1"))) fail("a side of a fight is not named by the fight");
  if (!(kinds[2].includes("h=kettle") && kinds[2].includes("t=22"))) fail("a game robot is not named by its shape and size");
  // a house shape is a name from the catalogue, never free text
  const dirty = portraitUrl({ house: "kettle&b=1", size: 64 });
  if (/b=1/.test(dirty.replace(/h=[^&]*/, ""))) fail("a shape id could smuggle another parameter in");
  ok("a picture is asked for by id and never by look, and there are exactly three kinds of id");
}

// ── 3. sharp, and not heavy ────────────────────────────────────────────────

/**
 * What the route's four files weigh, measured against the real route on the
 * dev server (2026-09-05, a robot wearing four colours with real art). They
 * are here so a screenful can be added up without a server running; the gate
 * prints them and the numbers are checked into the comment above
 * sourceSizeFor, so a change to the encoder that doubles them will show up
 * as a disagreement the next time anybody measures.
 */
const KB: Readonly<Record<number, number>> = { 64: 5.4, 120: 14.1, 300: 60.0, 432: 108.7 };

/**
 * How many of each are above the fold, counted on the captured pages at
 * 1440, and which page they are on. Nothing below the fold is fetched at
 * all: every portrait is loading="lazy".
 */
const ON_SCREEN: Readonly<Record<keyof typeof PORTRAIT_ON, { n: number; page: string }>> = {
  boardRow: { n: 40, page: "the board" }, // eight players, five robots each
  fightsList: { n: 14, page: "the fights page" },
  featured: { n: 3, page: "the fights page" },
  live: { n: 4, page: "the fights page" }, // two fights, two robots each
  botCard: { n: 10, page: "the fights page" },
  ladder: { n: 3, page: "the fights page" },
};

function sharpAndLight(): void {
  const perPage = new Map<string, number>();
  const lines: string[] = [];
  const before = failures;
  for (const key of Object.keys(PORTRAIT_ON) as (keyof typeof PORTRAIT_ON)[]) {
    const drawn = PORTRAIT_ON[key];
    const src = sourceSizeFor(drawn);
    const factor = src / drawn;
    if (factor < SOURCE_FACTOR) fail(`${key} draws at ${drawn} from a ${src} px file, only ${factor.toFixed(2)} times: it will look soft`);
    // and it must be the SMALLEST file that clears the bar, or we are paying
    // for pixels nobody sees
    const smaller = PORTRAIT_SIZES.filter((s) => s < src && s >= drawn * SOURCE_FACTOR);
    if (smaller.length) fail(`${key} takes the ${src} px file when the ${smaller[0]} would do`);
    const { n, page } = ON_SCREEN[key];
    const weight = KB[src] * n;
    perPage.set(page, (perPage.get(page) ?? 0) + weight);
    lines.push(`    ${key.padEnd(11)} drawn ${String(drawn).padStart(3)} px  ->  ${String(src).padStart(3)} px file (${factor.toFixed(2)}x, ${String(KB[src]).padStart(5)} KB)   x${String(n).padStart(3)} above the fold = ${weight.toFixed(0).padStart(4)} KB`);
  }
  console.log(lines.join("\n"));
  perPage.forEach((kb, page) => {
    console.log(`    ${page} at 1440, above the fold: ${kb.toFixed(0)} KB of robots. Nothing below it is fetched (loading="lazy").`);
  });
  if (failures === before) ok(`every drawn size takes the smallest file that is at least ${SOURCE_FACTOR} times it`);
}

// ── 4. the board row does not cap ──────────────────────────────────────────

/** the shipped sentence, read out of the board so the gate cannot drift */
async function boardRowNeverCaps(): Promise<void> {
  const src = await read(SURFACES[1].rel);
  const m = /andMore:\s*"([^"]+)"/.exec(src);
  if (!m) {
    fail("the board has no sentence for the robots past the fifth");
    return;
  }
  const template = m[1];
  if (!template.includes("{n}")) fail(`the board's "more" line prints no number: ${template}`);
  if (/[–—]/.test(template)) fail("the board's more line has a dash in it");
  for (const n of [6, 9, 40, 137]) {
    const beyond = n - PORTRAIT_ROW_SHOWN;
    const words = template.replace("{n}", String(beyond));
    if (!words.includes(String(beyond))) fail(`a garage of ${n} robots does not say how many are not drawn`);
  }
  ok(`the board draws ${PORTRAIT_ROW_SHOWN} robots and counts the rest in words: "${template.replace("{n}", "132")}" for a garage of 137`);
}

// ── 5. the crack lands on the robot ────────────────────────────────────────

function crackLandsOnTheRobot(): void {
  const size = 260;
  const a = bodyCentreInSquare(size, false);
  const b = bodyCentreInSquare(size, true);
  if (Math.abs(a.x + b.x - size) > 0.01) fail("a mirrored robot's body is not the mirror of an unmirrored one");
  if (Math.abs(a.x - size / 2) < size * 0.05) {
    fail("the body is being treated as the middle of the square, which is what put the crack in the gap");
  }
  // the point has to be INSIDE the drawn figure, not merely off centre
  const fit = fitInSquare(FIGURE_INK, size);
  const left = (FIGURE_INK.minX - fit.originX) * fit.scale;
  const right = (FIGURE_INK.maxX - fit.originX) * fit.scale;
  if (a.x <= left || a.x >= right) fail(`the body centre ${a.x.toFixed(1)} is outside the figure (${left.toFixed(1)}..${right.toFixed(1)})`);
  ok(`the body sits ${((a.x / size) * 100).toFixed(1)} percent across a portrait, not 50, and the mirror puts it at ${((b.x / size) * 100).toFixed(1)}`);
}

// ── 6. the captured card, and the sheet ────────────────────────────────────

const CARD_W = 1200;
const CARD_H = 630;
/** the margin an og image must keep clear: the card's own 44 px padding */
const EDGE_SAFE = 44;

interface Shot {
  file: string;
  title: string;
  need: boolean;
}

const SHOTS: readonly Shot[] = [
  { file: "s4-ko-169.png", title: "The knockout card, 1200 x 630", need: true },
  { file: "s4-battles-1440.png", title: "The fights page at 1440", need: true },
  { file: "s4-battles-390.png", title: "The fights page at 390, fight", need: true },
  { file: "s4-battles-390-watch.png", title: "The fights page at 390, watch", need: true },
  { file: "s4-board-1440.png", title: "The board at 1440", need: true },
  { file: "s4-board-390.png", title: "The board at 390", need: true },
];

async function loadShot(f: string): Promise<Bitmap | null> {
  try {
    return decodePng(new Uint8Array(await fs.readFile(path.join(OUT_DIR, f))));
  } catch {
    return null;
  }
}

/**
 * IS ANYTHING DRAWN IN THIS BAND? Measured as local contrast, not as a
 * difference from a sampled corner, and that is the whole trick. The card's
 * background is a gradient with a lit pool of floor along the bottom, so
 * every band differs from every corner and a "same colour as the corner"
 * test calls the deliberate lighting an intrusion. It did, on the first run
 * of this gate: 6.3 percent of the bottom band, and there is nothing down
 * there but light. A gradient has almost no step between one pixel and the
 * one four along; a letter or a robot's edge has a great deal. So the
 * measure is that step, which the lighting cannot trip and text cannot hide
 * from.
 */
const STEP = 4;
const EDGE = 40;

function inkInBand(bm: Bitmap, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(bm.h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(bm.w, x1) - STEP; x++) {
      const a = (y * bm.w + x) * 4;
      const b = a + STEP * 4;
      const d = Math.abs(bm.px[a] - bm.px[b]) + Math.abs(bm.px[a + 1] - bm.px[b + 1]) + Math.abs(bm.px[a + 2] - bm.px[b + 2]);
      if (d > EDGE) n++;
    }
  }
  return n;
}

async function cardIsEdgeSafe(bm: Bitmap): Promise<void> {
  if (bm.w !== CARD_W || bm.h !== CARD_H) {
    fail(`the knockout card is ${bm.w}x${bm.h}, not ${CARD_W}x${CARD_H}`);
    return;
  }
  const bands: [string, number, number, number, number][] = [
    ["top", 0, 0, CARD_W, EDGE_SAFE],
    ["bottom", 0, CARD_H - EDGE_SAFE, CARD_W, CARD_H],
    ["left", 0, 0, EDGE_SAFE, CARD_H],
    ["right", CARD_W - EDGE_SAFE, 0, CARD_W, CARD_H],
  ];
  const inner = (CARD_W - 2 * EDGE_SAFE) * (CARD_H - 2 * EDGE_SAFE);
  const middle = (inkInBand(bm, EDGE_SAFE, EDGE_SAFE, CARD_W - EDGE_SAFE, CARD_H - EDGE_SAFE) / inner) * 100;
  let worst = 0;
  const before = failures;
  for (const [name, x0, y0, x1, y1] of bands) {
    const area = (x1 - x0) * (y1 - y0);
    const pct = (inkInBand(bm, x0, y0, x1, y1) / area) * 100;
    worst = Math.max(worst, pct);
    // half a per cent of a band is a stray antialiased pixel; the card's own
    // middle runs far higher, which is what a band with words in it would
    // look like
    if (pct > 0.5) {
      fail(`the knockout card has something drawn in its ${name} ${EDGE_SAFE} px: ${pct.toFixed(2)} percent of that band has edges in it, against ${middle.toFixed(2)} in the middle`);
    }
  }
  if (failures === before) {
    ok(`the knockout card is ${CARD_W}x${CARD_H} and keeps its ${EDGE_SAFE} px edges clear (busiest band ${worst.toFixed(2)} percent, the middle ${middle.toFixed(2)})`);
  }
}

// ── the robot this lane exists for ─────────────────────────────────────────
/**
 * A FOUR COLOUR ROBOT WITH THREE STARS AND A HAT, at every size this lane
 * serves, rendered by the shipped compositor.
 *
 * WHY IT IS RENDERED AND NOT SCREENSHOTTED. The development database has no
 * robot that has ever won a hat, and it cannot have one until Mike runs
 * doma-reporter/sql/battle_bots_008_look.sql: battle_bots_hats does not
 * exist yet, so loadHats answers "none" and the read path quietly drops a
 * hat nobody owns. That is the correct behaviour and this lane must not
 * write rows to a live database to get around it. So the captured pages
 * beside this strip show real robots in their real four colours, and this
 * strip shows what the same slots hold on the day somebody has won
 * something.
 *
 * It goes through renderPortrait, which IS the route (the route is that
 * function plus a database read), so nothing about the picture is mocked.
 */
const EARNED_WINS = 12; // past the 1, 5 and 10 win steps: three stars
const EARNED_LEVEL = 6; // past level 5: one cuff band
const EARNED_LOSSES = 2; // two stitched patches

function earnedRobot(): { build: Build; look: BotLook; marks: ReturnType<typeof earnedMarks>; paints: PaintId[] } {
  const card = (slot: Slot, tier: number): Part => {
    const c = CATALOG_PARTS.filter((x) => x.slot === slot && x.tier === tier)[0] ?? CATALOG_PARTS.filter((x) => x.slot === slot)[0];
    return { id: c.id, s: [c.s[0], c.s[1], c.s[2]] };
  };
  const paints: PaintId[] = ["mint", "coral", "sky", "butter"];
  const build: Build = {
    head: { ...card("head", 3), paint: paints[0] },
    torso: { ...card("torso", 3), paint: paints[1] },
    arms: { ...card("arms", 2), paint: paints[2] },
    legs: { ...card("legs", 2), paint: paints[3] },
    weapon: card("weapon", 3),
  };
  const look: BotLook = {
    face: "happy",
    sticker: STICKER_IDS[0],
    spot: "cheek",
    stickerPaint: paints[1],
    hat: { kind: "bow", color: "sky" },
    plateNumber: 41,
  };
  const marks = earnedMarks({
    wins: EARNED_WINS,
    level: EARNED_LEVEL,
    repairs: EARNED_LOSSES,
    champion: false,
    colourMatch: false,
    fourStar: false,
    hats: [{ kind: "bow", color: "sky" }],
    paints: [],
    plateNumber: 41,
  });
  return { build, look, marks, paints };
}

async function earnedStrip(): Promise<Bitmap | null> {
  const PUBLIC = path.join(ROOT, "public");
  const load: LoadArt = async (f) => {
    try {
      return new Uint8Array(await fs.readFile(path.join(PUBLIC, f.replace(/^\//, ""))));
    } catch {
      return null;
    }
  };
  const { build, look, marks } = earnedRobot();
  const hat = look.hat;
  if (marks.stars !== 3) fail(`${EARNED_WINS} wins should draw three stars, it drew ${marks.stars}`);
  if (!look.hat) fail("the earned robot is not wearing the hat it won");
  const cache: ArtCache = new Map();
  const shots: Bitmap[] = [];
  // the two the knockout card uses, then the two every list uses
  for (const size of [432, 300, 120, 64]) {
    const out = await renderPortrait({ build, look, marks }, size, load, cache);
    shots.push(decodePng(out.png));
  }
  const w = shots.reduce((n, b) => n + b.w + GAP, GAP);
  const h = Math.max(...shots.map((b) => b.h)) + GAP * 2;
  const strip = blank(w, h, SHEET_BG);
  let x = GAP;
  for (const b of shots) {
    blit(strip, b, x, h - GAP - b.h);
    x += b.w + GAP;
  }
  console.log(`  ok    a four colour robot with ${marks.stars} stars and a ${hat?.color} ${hat?.kind} renders at 432, 300, 120 and 64: ${markWords(marks, EARNED_WINS).join(" / ")}`);
  return strip;
}

// ── the sheet ───────────────────────────────────────────────────────────────

const SHEET_BG = 0x0b0e18;
const GAP = 18;

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
      const d = (dy * dst.w + dx) * 4;
      const a = src.px[s + 3] / 255;
      for (let k = 0; k < 3; k++) dst.px[d + k] = Math.round(src.px[s + k] * a + dst.px[d + k] * (1 - a));
      dst.px[d + 3] = 255;
    }
  }
}

/** a hairline around a panel, so two dark screenshots do not run together */
function frame(dst: Bitmap, x0: number, y0: number, w: number, h: number, rgb: number): void {
  const put = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= dst.w || y >= dst.h) return;
    const d = (y * dst.w + x) * 4;
    dst.px[d] = (rgb >> 16) & 255;
    dst.px[d + 1] = (rgb >> 8) & 255;
    dst.px[d + 2] = rgb & 255;
  };
  for (let x = x0 - 1; x <= x0 + w; x++) {
    put(x, y0 - 1);
    put(x, y0 + h);
  }
  for (let y = y0 - 1; y <= y0 + h; y++) {
    put(x0 - 1, y);
    put(x0 + w, y);
  }
}

async function buildSheet(shots: { shot: Shot; bm: Bitmap }[], extra: Bitmap | null): Promise<void> {
  // one column of wide captures, with the phone captures side by side
  const wide = shots.filter((s) => s.bm.w > 700);
  const narrow = shots.filter((s) => s.bm.w <= 700);
  const wideW = Math.max(0, ...wide.map((s) => s.bm.w), extra ? extra.w : 0);
  const narrowW = narrow.reduce((n, s) => n + s.bm.w + GAP, 0) - (narrow.length ? GAP : 0);
  const W = Math.max(wideW, narrowW) + GAP * 2;
  const H =
    GAP +
    (extra ? extra.h + GAP : 0) +
    wide.reduce((n, s) => n + s.bm.h + GAP, 0) +
    (narrow.length ? Math.max(...narrow.map((s) => s.bm.h)) + GAP : 0);
  const sheet = blank(W, H, SHEET_BG);
  let y = GAP;
  // the specimen first: what a robot that has won something looks like at
  // the two sizes the card uses and the two every list uses
  if (extra) {
    const x = Math.round((W - extra.w) / 2);
    blit(sheet, extra, x, y);
    frame(sheet, x, y, extra.w, extra.h, 0x2a3350);
    y += extra.h + GAP;
  }
  for (const s of wide) {
    const x = Math.round((W - s.bm.w) / 2);
    blit(sheet, s.bm, x, y);
    frame(sheet, x, y, s.bm.w, s.bm.h, 0x2a3350);
    y += s.bm.h + GAP;
  }
  let x = Math.round((W - narrowW) / 2);
  for (const s of narrow) {
    blit(sheet, s.bm, x, y);
    frame(sheet, x, y, s.bm.w, s.bm.h, 0x2a3350);
    x += s.bm.w + GAP;
  }
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(SHARE, encodePng(sheet));
  console.log(`\n  sheet  ${SHARE}  ${sheet.w}x${sheet.h}`);
  for (const s of shots) console.log(`         ${s.shot.title}  (${s.bm.w}x${s.bm.h})`);
}

// ── run ─────────────────────────────────────────────────────────────────────

const SHOT = (url: string, out: string, size: string, extra = "") =>
  `  node scripts/bots-shot.mjs --url "<origin>${url}" --out ".bots-preview/look/${out}" --size ${size}${extra}`;

async function main(): Promise<void> {
  console.log("BATTLE BOTS SHARE GATE\n");
  console.log("-- nobody draws their own robot --");
  await noHomeMadeRobots();
  console.log("\n-- by id, never by look --");
  byIdNeverByLook();
  console.log("\n-- sharp, and not heavy --");
  sharpAndLight();
  console.log("\n-- the board row does not cap --");
  await boardRowNeverCaps();
  console.log("\n-- the crack lands on the robot --");
  crackLandsOnTheRobot();

  console.log("\n-- a robot that has won something --");
  const strip = await earnedStrip();

  console.log("\n-- the captured pages --");
  const loaded: { shot: Shot; bm: Bitmap }[] = [];
  const missing: Shot[] = [];
  for (const shot of SHOTS) {
    const bm = await loadShot(shot.file);
    if (bm) loaded.push({ shot, bm });
    else if (shot.need) missing.push(shot);
  }
  const card = loaded.find((s) => s.shot.file.startsWith("s4-ko"));
  if (card) await cardIsEdgeSafe(card.bm);
  else console.log("  note  no captured knockout card on disk, so its edges were not measured");

  if (missing.length) {
    fail(`${missing.length} capture${missing.length === 1 ? " is" : "s are"} missing, so SHARE.png would be a half sheet`);
    console.log("\n  Take them against a running dev server (npx next dev), then run this again:");
    console.log(SHOT("/api/bots/card/ko?f=<a resolved fight>", "s4-ko-169.png", "1200x630", "   (or curl it straight to the file)"));
    console.log(SHOT("/bots/battles", "s4-battles-1440.png", "1440x1400"));
    console.log(SHOT("/bots/battles", "s4-battles-390.png", "390x844", " --mobile"));
    console.log(SHOT("/bots/battles", "s4-battles-390-watch.png", "390x844", " --mobile   (click Watch first)"));
    console.log(SHOT("/bots/board/preview", "s4-board-1440.png", "1440x900"));
    console.log(SHOT("/bots/board/preview", "s4-board-390.png", "390x844", " --mobile"));
  } else {
    ok(`all ${loaded.length} captures are on disk`);
    await buildSheet(loaded, strip);
  }

  console.log("");
  if (failures) {
    console.error(`SHARE GATE FAILED: ${failures} problem${failures === 1 ? "" : "s"}`);
    process.exit(1);
  }
  console.log("SHARE GATE PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
