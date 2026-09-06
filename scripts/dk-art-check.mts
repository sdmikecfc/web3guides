/**
 * Domain Kitchen ART CONTRACT gate (M7).
 *
 * This is the gate that did not exist and should have. Two silent failure
 * modes have been sitting under this game:
 *
 *  1. _view/preload.ts states outright that "a missing file is a load error,
 *     never a silent vector fallback" — the S5 try-image-else-vector law is
 *     retired here. So a manifest entry with no file behind it does not
 *     degrade, it BREAKS THE BOOT SCREEN. Nothing checked that until now.
 *
 *  2. scene.ts's textureFor() falls back through idle -> walk -> first frame
 *     when a name is missing. That is deliberate and good at runtime, but it
 *     means a mis-named or un-baked animation renders SOMETHING and nobody
 *     notices. A frozen sprite is easy to miss; a red gate is not.
 *
 * So this checks both directions: every file the preloader will request
 * exists, and every frame the renderer will ask for is actually in the atlas.
 *
 * Run: npx tsx scripts/dk-art-check.mts
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The pixi-free manifest: importing preload.ts here would drag in pixi.js and
// die on "navigator is not defined". This is the same list the game loads.
import {
  CREW_LOOKS,
  FILE_OF,
  GUEST_LOOKS,
  ITEM_SET_ARTS,
  ITEM_SET_IDS,
  ROOM_ASSETS,
  THEME_IDS,
  WALL_LEFT_TILES,
  WALL_RIGHT_TILES,
  wallFile,
} from "../src/app/chef/game/_view/art-manifest";
import { SHELL_SIZES } from "../src/app/chef/game/_engine/rooms";

const PUB = join(process.cwd(), "public", "chef-art");
const fails: string[] = [];
const warn: string[] = [];

// Derived from the manifest itself, so a new asset key is covered the moment
// it is added rather than the next time someone remembers to update a gate.
const ROOM_FILES = [
  ...ROOM_ASSETS.map((k) => FILE_OF[k]),
  ...WALL_LEFT_TILES.map((t) => wallFile("left", t)),
  ...WALL_RIGHT_TILES.map((t) => wallFile("right", t)),
];
const ITEM_SET_FILES = ITEM_SET_ARTS.map((k) => FILE_OF[k]);

/**
 * THE THREE LISTS THAT MUST AGREE (M8b): the shells the game can grow into,
 * the wall sizes the manifest loads, and the wall sizes the baker emits. The
 * baker is a plain node script and cannot import the shells, so this is what
 * stops them drifting: every shell's `h` needs a left wall and every shell's
 * `w` needs a right wall, or the room paints with a hole in it.
 */
for (const shell of SHELL_SIZES) {
  if (!(WALL_LEFT_TILES as readonly number[]).includes(shell.h)) {
    fails.push(`shell "${shell.label}" is ${shell.h} deep but no left wall of ${shell.h} is loaded`);
  }
  if (!(WALL_RIGHT_TILES as readonly number[]).includes(shell.w)) {
    fails.push(`shell "${shell.label}" is ${shell.w} wide but no right wall of ${shell.w} is loaded`);
  }
}

/** the frames scene.ts's animFor() can ask for, per sheet family */
const FRAMES: Record<string, string[]> = {
  guest: ["idle_f_0", "idle_f_1", "walk_f_0", "walk_f_1", "walk_f_2", "walk_f_3",
    "walk_b_0", "walk_b_1", "walk_b_2", "walk_b_3", "sit_0", "eat_0", "eat_1"],
  chef: ["idle_b_0", "idle_b_1", "walk_f_0", "walk_f_1", "walk_f_2", "walk_f_3",
    "walk_b_0", "walk_b_1", "walk_b_2", "walk_b_3", "cook_0", "cook_1"],
  waiter: ["idle_f_0", "idle_f_1", "walk_f_0", "walk_f_1", "walk_f_2", "walk_f_3",
    "walk_b_0", "walk_b_1", "walk_b_2", "walk_b_3",
    "carry_f_0", "carry_f_1", "carry_f_2", "carry_f_3",
    "carry_b_0", "carry_b_1", "carry_b_2", "carry_b_3"],
  fx: ["flame_0", "flame_1", "flame_2", "flame_3",
    "sizzle_0", "sizzle_1", "sizzle_2", "sizzle_3",
    "sparkle_0", "sparkle_1", "sparkle_2", "sparkle_3"],
};

let bytes = 0;
function need(rel: string): boolean {
  const p = join(PUB, rel);
  if (!existsSync(p)) {
    fails.push(`MISSING ${rel}`);
    return false;
  }
  const st = statSync(p);
  if (st.size === 0) {
    fails.push(`EMPTY ${rel}`);
    return false;
  }
  // A non-empty file is not the same as a loadable one. Pixi will reject a
  // truncated or mis-written PNG at boot, and preload.ts has no fallback, so
  // check the signature and that the IHDR reports real dimensions.
  if (rel.endsWith(".png")) {
    const b = readFileSync(p);
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (b.length < 33 || sig.some((v, i) => b[i] !== v)) {
      fails.push(`NOT A PNG ${rel}`);
      return false;
    }
    const w = b.readUInt32BE(16);
    const h = b.readUInt32BE(20);
    if (w === 0 || h === 0 || w > 8192 || h > 8192) {
      fails.push(`BAD PNG DIMENSIONS ${rel} (${w}x${h})`);
      return false;
    }
  }
  bytes += st.size;
  return true;
}

// ── 1. room art: every theme x every asset ─────────────────────────────────
for (const theme of THEME_IDS) {
  for (const file of ROOM_FILES) need(`room/${theme}/${file}`);
}
for (const set of ITEM_SET_IDS) {
  for (const file of ITEM_SET_FILES) need(`room/${set}/${file}`);
}

// ── 2. character + fx atlases, and the frames inside them ──────────────────
const sheets = [
  ...Array.from({ length: GUEST_LOOKS }, (_, i) => [`guest${i}`, "guest"] as const),
  ...Array.from({ length: CREW_LOOKS }, (_, i) => [`chef${i}`, "chef"] as const),
  ...Array.from({ length: CREW_LOOKS }, (_, i) => [`waiter${i}`, "waiter"] as const),
  ["fx", "fx"] as const,
];
for (const [name, family] of sheets) {
  const okPng = need(`chars/${name}.png`);
  const okJson = need(`chars/${name}.json`);
  if (!okPng || !okJson) continue;
  const sheet = JSON.parse(readFileSync(join(PUB, `chars/${name}.json`), "utf8")) as {
    frames: Record<string, { frame: { w: number; h: number } }>;
    meta: { image: string };
  };
  for (const frame of FRAMES[family]) {
    if (!sheet.frames[frame]) fails.push(`${name}.json has no frame "${frame}"`);
  }
  // the atlas contract: uniform 128px cells, and a self-wiring relative image
  for (const [fname, f] of Object.entries(sheet.frames)) {
    if (f.frame.w !== 128 || f.frame.h !== 128) {
      fails.push(`${name}.json frame ${fname} is ${f.frame.w}x${f.frame.h}, expected 128x128`);
      break;
    }
  }
  if (sheet.meta.image !== `${name}.png`) {
    fails.push(`${name}.json meta.image is "${sheet.meta.image}", expected "${name}.png"`);
  }
}

// ── 3. the crew picker's hard-coded atlas cell ─────────────────────────────
// Chrome.tsx's CrewFace crops one cell out of the sheet with CSS rather than
// going through Pixi, so it hard-codes a column and row. Nothing else would
// catch it drifting: the picker would just quietly show the back of six heads.
const PICKER_COL = 3;
const PICKER_ROW = 1;
for (const [name, frame] of [["chef0", "walk_f_0"], ["waiter0", "idle_f_0"]] as const) {
  const f = join(PUB, `chars/${name}.json`);
  if (!existsSync(f)) continue;
  const sheet = JSON.parse(readFileSync(f, "utf8")) as {
    frames: Record<string, { frame: { x: number; y: number } }>;
  };
  const fr = sheet.frames[frame];
  if (!fr) { fails.push(`${name}.json has no ${frame} for the crew picker`); continue; }
  const col = fr.frame.x / 128;
  const row = fr.frame.y / 128;
  if (col !== PICKER_COL || row !== PICKER_ROW) {
    fails.push(
      `crew picker expects ${frame} at col ${PICKER_COL} row ${PICKER_ROW}, ` +
      `but ${name}.json has it at col ${col} row ${row} (fix CrewFace in Chrome.tsx)`
    );
  }
}

// ── 3. weight, against the preloader's stated budget ───────────────────────
const mb = bytes / 1024 / 1024;
if (mb > 6) fails.push(`art total ${mb.toFixed(2)}MB exceeds the 6MB boot budget`);
else if (mb > 4) warn.push(`art total ${mb.toFixed(2)}MB is inside but near the 6MB budget`);

// ── report ─────────────────────────────────────────────────────────────────
console.log(
  `checked ${THEME_IDS.length} themes + ${ITEM_SET_IDS.length} item sets + ${sheets.length} atlases`
);
console.log(`boot weight: ${mb.toFixed(2)}MB`);
for (const w of warn) console.log(`warn: ${w}`);
if (fails.length) {
  for (const f of fails) console.error(`FAIL ${f}`);
  console.error(`art-check FAIL (${fails.length})`);
  process.exit(1);
}
console.log("art-check PASS");
