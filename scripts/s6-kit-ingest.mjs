/**
 * s6-kit-ingest.mjs: normalizes CraftPix kit packs into uniform-cell strips
 * for the EXISTING three arenas (strain/stopclock) - the beef-up Mike ordered
 * 2026-08-15 ("use these assets to really beef up our games").
 *
 * A CLONE of riot-ingest.mjs, deliberately not an edit: the RIOT session is
 * mid-build on that file and its PACKS table, and two sessions editing one
 * mapping table is how partial-workflow corruption happens. Same laws, three
 * deltas:
 *   1. per-char `game` routes output to art-src/kits/strips/<game>/<char>/
 *      (riot's is single-game);
 *   2. per-char `cell` override - CraftPix kit cell sizes are unknown until
 *      a zip is opened, and re-routing kinds to change cell (riot's answer)
 *      does not scale to many packs;
 *   3. a TILES table - tilesheets are cut to art-src/kits/tiles/<game>/,
 *      which s6-kit-recolour.py recolors and publishes as webp (PIL owns
 *      pixels + webp; node owns cutting + atlas packing, the riot division).
 *
 * THE LICENSING WALL (identical to riot's): everything read and written here
 * lives in gitignored art-src/ - CraftPix material never reaches git or
 * public/. Only s6-kit-atlas.mjs's transformed output crosses into
 * public/s6-art/games/<game>/chars/. And NOTHING CraftPix ever feeds an AI
 * tool - their license forbids it; the recolour stage is scripted HSV remap.
 *
 * In:  art-src/kits/packs/<pack>/...          (per the PACKS table below)
 * Out: art-src/kits/strips/<game>/<char>/<anim>.png + meta.json
 *      art-src/kits/tiles/<game>/<name>.png   (per the TILES table)
 *
 * Source forms (NEVER guess a grid - multi-row needs an explicit entry):
 *   A { src: "dir/glob*.png", anim }            per-frame PNGs, sorted
 *   B { src: "strip.png", anim }                single row: width%height===0
 *                                               else alpha-gap column scan
 *   C { src, sidecar?, animMap:{anim:[a,b]} }   strip sliced by frame ranges;
 *                                               sidecar JSON = exact rects
 *   D { src, cols, rows, animMap:{anim:row} }   multi-row, explicit only
 *
 * Laws (riot's, verbatim): cells are square; source pixels are NEVER
 * upscaled; baseline is normalized per-CHARACTER from idle frame 0's bbox
 * (bottom -> CELL-FOOT, center-x -> CELL/2) and the same canvas anchor is
 * applied to every frame - never per-frame (the moonwalk bug); flipSource
 * mirrors left-facing packs before anything else looks at pixels; content
 * that cannot fit its cell is a HARD ERROR (exit 1), not a resize.
 *
 * Run: node scripts/s6-kit-ingest.mjs [pack ...]   (default: every PACKS key)
 */

import { PNG } from "pngjs";
import { globSync } from "glob";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PACKS_DIR = join(ROOT, "art-src", "kits", "packs");
const STRIPS_DIR = join(ROOT, "art-src", "kits", "strips");
const TILES_DIR = join(ROOT, "art-src", "kits", "tiles");

/** Anim vocabulary per kind. Missing anims only WARN - the Clients carry the
 * chef textureFor fallback chain, so a kit with no death anim still ships. */
const VOCAB = {
  enemy: ["idle", "walk", "attack", "hurt", "death"],
  props: [],
};
const CELL_DEFAULT = { enemy: 64, props: 96 };
const FOOT = 4; // baseline sits at CELL - FOOT (kit sprites are smaller than riot's)

/**
 * THE MAPPING TABLE. One entry per pack; chars carry `game` (strain|stopclock)
 * routing their strips, `kind` picks vocab + default cell, `cell` overrides it,
 * `srcRoot` (proof only) reads a pack from outside kits/packs.
 *
 * CraftPix rows land here when Mike's zips are unpacked - open the zip, LOOK
 * at the sheet layout, then author the row. Grids are never guessed.
 */
const PACKS = {
  // ── PROOF ROW: the CC0 pack the riot pipeline was proven on, routed through
  // THIS script to prove the clone end-to-end before any CraftPix zip lands.
  // Reads riot's pack dir (CC0, so the wall does not apply); outputs to game
  // "_proof", which never ships and is deleted after the check.
  "cc0-proof": {
    srcRoot: join(ROOT, "art-src", "riot", "packs", "cc0-chewbatrij"),
    chars: [
      {
        char: "proof-bot", game: "_proof", kind: "enemy", cell: 96, flipSource: true,
        sources: [{
          src: "ingame_spritesheets/fistbot.png",
          sidecar: "ingame_spritesheets/fistbot.json",
          animMap: { idle: [0, 0], walk: [1, 1], attack: [2, 2], hurt: [3, 3] },
        }],
      },
    ],
  },

  // ── STRAIN: the Free Top-Down Roguelike Game Kit (Mike's own pick,
  // 2026-08-15: "perfect for the Carion style Strain game"). Its four dungeon
  // enemies become the prey tiers + the hunter; s6-kit-recolour.py turns the
  // creatures into MACHINES before the atlas packs (Mike: "Recolor creatures
  // to machines"). Layout measured off the zip: per-facing single-row strips
  // at 32px cells (S_ = side view - the one facing our Clients flip; enemy 1
  // is the rat, 4 the leader). Content is 32px, cell 48: baseline headroom,
  // and draw-time scales to sim radius anyway.
  "roguelike-kit": {
    chars: [1, 2, 3, 4].map((n) => ({
      // cell 36, not 48: both Clients scale frames by TEXTURE dimensions, so
      // every pixel of cell padding shrinks the drawn sprite. 32px content +
      // the 4px FOOT = 36 is the tightest cell that cannot clip.
      char: n === 4 ? "hunter" : `prey${n}`, game: "strain", kind: "enemy", centered: true,
      sources: ["Idle", "Walk", "Attack", "Hurt", "Death"].map((a) => ({
        src: `3 Dungeon Enemies/${n}/S_${a}.png`, anim: a.toLowerCase(),
      })),
    })),
  },

  // ── STOPCLOCK: the Free Roguelike Shoot 'em up kit. Its creatures (small
  // biped / armed biped / big heavy, eyeballed off the contact sheet) become
  // the three enemy kinds, recolored HOSTILE RED - red is the only enemy
  // color the near-white void reads by. Run/Death only in the kit; the
  // Client's fallback chain covers idle/windup. RunSD = down-facing, which
  // is ATLAS_FACE's PI/2 default. 48px content, cell 64.
  "shootemup-kit": {
    chars: [["rusher", 1], ["pistol", 2], ["rocketeer", 3]].map(([char, n]) => ({
      char, game: "stopclock", kind: "enemy", centered: true,
      // walk only: the kit's death frames sprawl past the walk baseline's
      // cell (measured overflow), and stopclock kills resolve as the shatter
      // shards anyway - a death strip would never be drawn.
      sources: [{ src: `3 Enemies/${n}/RunSD.png`, anim: "walk" }],
    })),
  },
};

/**
 * TILESHEET CUTS. {pack, src, tile, game, name, pick} - cuts `tile`-px squares
 * from the sheet left-to-right top-to-bottom and writes the `pick`ed indices
 * as art-src/kits/tiles/<game>/<name><n>.png (n omitted when one pick).
 * s6-kit-recolour.py publishes them to public as webp. Authored per zip, like
 * PACKS - a tilesheet's layout is looked at, never guessed.
 */
const TILES = [
  // Strain chamber dressing from the roguelike kit's dungeon tileset. These
  // are INDIVIDUAL 16px tile files, so each is a 1-tile sheet with pick [0].
  // Picked off the labeled contact sheet: 34 = the plain gridded stone floor
  // (uniform, tiles clean under alpha 0.55); 16 = the dark brick wall face.
  { pack: "roguelike-kit", src: "2 Dungeon Tileset/1 Tiles/Tile_34.png", tile: 16, game: "strain", name: "floor", pick: [0] },
  { pack: "roguelike-kit", src: "2 Dungeon Tileset/1 Tiles/Tile_16.png", tile: 16, game: "strain", name: "wall", pick: [0] },
];

const errors = [];
const readPng = (p) => PNG.sync.read(readFileSync(p));

/** frame = own little canvas: {w, h, data} RGBA. */
function crop(png, x, y, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let r = 0; r < h; r++)
    png.data.copy(out, r * w * 4, ((y + r) * png.width + x) * 4, ((y + r) * png.width + x + w) * 4);
  return { w, h, data: out };
}

function mirror(f) {
  const out = Buffer.alloc(f.data.length);
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++)
      f.data.copy(out, (y * f.w + (f.w - 1 - x)) * 4, (y * f.w + x) * 4, (y * f.w + x) * 4 + 4);
  return { w: f.w, h: f.h, data: out };
}

function bbox(f) {
  let x0 = f.w, y0 = f.h, x1 = -1, y1 = -1;
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++)
      if (f.data[(y * f.w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** single-row split: exact division if width%height===0, else alpha-gap scan. */
function splitRow(png, label) {
  if (png.width % png.height === 0) {
    const c = png.height;
    return Array.from({ length: png.width / c }, (_, i) => crop(png, i * c, 0, c, png.height));
  }
  const empty = [];
  for (let x = 0; x < png.width; x++) {
    let has = false;
    for (let y = 0; y < png.height && !has; y++) has = png.data[(y * png.width + x) * 4 + 3] > 0;
    empty.push(!has);
  }
  const frames = [];
  let start = -1;
  for (let x = 0; x <= png.width; x++) {
    const e = x === png.width ? true : empty[x];
    if (!e && start < 0) start = x;
    if (e && start >= 0) { frames.push(crop(png, start, 0, x - start, png.height)); start = -1; }
  }
  if (!frames.length) errors.push(`${label}: alpha-gap scan found no frames`);
  return frames;
}

/** expand one source entry -> [{anim, frames:[...]}] */
function loadSource(packDir, srcDef, label) {
  const files = globSync(srcDef.src, { cwd: packDir, posix: true }).sort();
  if (!files.length) { errors.push(`${label}: no files match ${srcDef.src}`); return []; }

  if (srcDef.anim) {
    const frames = files.length > 1
      ? files.map((f) => { const p = readPng(join(packDir, f)); return crop(p, 0, 0, p.width, p.height); }) // form A
      : splitRow(readPng(join(packDir, files[0])), label); // form B
    return [{ anim: srcDef.anim, frames }];
  }

  const png = readPng(join(packDir, files[0]));
  let all;
  if (srcDef.cols && srcDef.rows) { // form D: explicit grid only, never guessed
    const cw = png.width / srcDef.cols, ch = png.height / srcDef.rows;
    if (cw % 1 || ch % 1) { errors.push(`${label}: ${png.width}x${png.height} not divisible by ${srcDef.cols}x${srcDef.rows}`); return []; }
    return Object.entries(srcDef.animMap).map(([anim, row]) => {
      const [r, c0, c1] = Array.isArray(row) ? row : [row, 0, srcDef.cols - 1];
      return { anim, frames: Array.from({ length: c1 - c0 + 1 }, (_, i) => crop(png, (c0 + i) * cw, r * ch, cw, ch)) };
    });
  }
  if (srcDef.sidecar) { // form C with exact rects
    const j = JSON.parse(readFileSync(join(packDir, srcDef.sidecar), "utf8"));
    const list = Array.isArray(j.frames) ? j.frames : Object.values(j.frames);
    all = list.map((f) => crop(png, f.frame.x, f.frame.y, f.frame.w, f.frame.h));
  } else all = splitRow(png, label); // form C over a plain strip
  return Object.entries(srcDef.animMap).map(([anim, [a, b]]) => {
    if (b >= all.length) { errors.push(`${label}/${anim}: range ${a}-${b} exceeds ${all.length} frames`); return { anim, frames: [] }; }
    return { anim, frames: all.slice(a, b + 1) };
  });
}

function ingestChar(pack, packDef, def) {
  const packDir = packDef.srcRoot || join(PACKS_DIR, pack);
  let CELL = def.cell || CELL_DEFAULT[def.kind];
  const anims = def.sources.flatMap((s) => loadSource(packDir, s, `${pack}/${def.char}`));
  const byName = Object.fromEntries(anims.map((a) => [a.anim, a.frames.map((f) => (def.flipSource ? mirror(f) : f))]));

  // ── CENTERED MODE (top-down chars) ────────────────────────────────────────
  // Mike, round 5: "too tiny". CraftPix frames carry huge padding (a 20px body
  // in a 48px frame), and both top-down Clients scale by TEXTURE size and
  // rotate/flip around anchor 0.5 - so padding shrinks the body AND a foot
  // baseline is the WRONG pivot. Centered chars crop every frame by the ONE
  // union content bbox across the whole character (a fixed rect, so
  // inter-frame alignment survives - the moonwalk law by other means), then
  // the cell hugs that union. Body ends up ~= texture, and heights in the
  // Clients read literally.
  if (def.centered) {
    let u = null;
    for (const frames of Object.values(byName))
      for (const f of frames) {
        const b = bbox(f);
        if (!b) continue;
        u = u ? { x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) } : { ...b };
      }
    if (!u) { errors.push(`${pack}/${def.char}: no visible content in any frame`); return; }
    const uw = u.x1 - u.x0 + 1, uh = u.y1 - u.y0 + 1;
    for (const [anim, frames] of Object.entries(byName))
      byName[anim] = frames.map((f) => crop({ width: f.w, height: f.h, data: f.data }, u.x0, u.y0, uw, uh));
    CELL = Math.max(uw, uh) + 2;
  }

  // per-CHARACTER anchor from idle frame 0 (falls back to first anim, warned)
  const baseAnim = byName.idle?.length ? "idle" : Object.keys(byName)[0];
  const f0 = byName[baseAnim][0];
  const bb = bbox(f0);
  if (!bb) { errors.push(`${pack}/${def.char}: ${baseAnim}[0] is fully transparent`); return; }
  // canvas bottom-center of every frame lands on this fixed cell point:
  const anchor = def.kind === "props" || def.centered
    ? { x: CELL / 2, y: CELL / 2, center: true }
    : { x: CELL / 2 - ((bb.x0 + bb.x1 + 1) / 2 - f0.w / 2), y: CELL - FOOT - (bb.y1 + 1 - f0.h), center: false };

  const outDir = join(STRIPS_DIR, def.game, def.char);
  mkdirSync(outDir, { recursive: true });
  const report = [];
  for (const [anim, frames] of Object.entries(byName)) {
    if (!frames.length) continue;
    const [offX, offY] = def.off?.[anim] || [0, 0]; // authored per-ANIM nudge, never per-frame
    const strip = new PNG({ width: frames.length * CELL, height: CELL });
    frames.forEach((f, i) => {
      if (f.w > CELL || f.h > CELL) { errors.push(`${def.char}/${anim}[${i}]: frame ${f.w}x${f.h} exceeds ${CELL}px cell (no-upscale law: shrink is banned too - use the cell override)`); return; }
      const dx = Math.round(anchor.x - f.w / 2) + offX;
      const dy = Math.round(anchor.center ? anchor.y - f.h / 2 : anchor.y - f.h) + offY;
      const b = bbox(f);
      if (b && (b.x0 + dx < 0 || b.x1 + dx >= CELL || b.y0 + dy < 0 || b.y1 + dy >= CELL))
        errors.push(`${def.char}/${anim}[${i}]: content overflows cell after baseline (bbox ${b.x0},${b.y0}-${b.x1},${b.y1} shifted ${dx},${dy})`);
      for (let y = 0; y < f.h; y++) {
        const ty = y + dy;
        if (ty < 0 || ty >= CELL) continue;
        for (let x = 0; x < f.w; x++) {
          const tx = x + dx;
          if (tx < 0 || tx >= CELL) continue;
          f.data.copy(strip.data, ((ty) * strip.width + i * CELL + tx) * 4, (y * f.w + x) * 4, (y * f.w + x) * 4 + 4);
        }
      }
    });
    writeFileSync(join(outDir, `${anim}.png`), PNG.sync.write(strip));
    report.push(`    ${anim.padEnd(9)} ${String(frames.length).padStart(2)}f  src ${frames[0].w}x${frames[0].h}`);
  }
  writeFileSync(join(outDir, "meta.json"), JSON.stringify({ char: def.char, game: def.game, kind: def.kind, cell: CELL, hitFrame: def.hitFrame || {}, flipSource: !!def.flipSource, anchor: { x: anchor.x, y: anchor.y } }));

  const missing = (VOCAB[def.kind] || []).filter((v) => !byName[v]?.length);
  console.log(`  ${def.game}/${def.char} (${def.kind}, cell ${CELL}${def.flipSource ? ", flipped" : ""}) anchor ${anchor.x.toFixed(1)},${anchor.y.toFixed(1)}${baseAnim !== "idle" && def.kind !== "props" ? ` [WARN: baseline from ${baseAnim}, no idle]` : ""}`);
  report.forEach((l) => console.log(l));
  if (missing.length) console.log(`    MISSING vocab: ${missing.join(", ")} (Client falls back per the chain)`);
}

function cutTiles(t) {
  const packDef = PACKS[t.pack];
  const packDir = packDef?.srcRoot || join(PACKS_DIR, t.pack);
  const files = globSync(t.src, { cwd: packDir, posix: true }).sort();
  if (!files.length) { errors.push(`tiles ${t.game}/${t.name}: no files match ${t.src}`); return; }
  const png = readPng(join(packDir, files[0]));
  if (png.width % t.tile || png.height % t.tile) {
    errors.push(`tiles ${t.game}/${t.name}: ${png.width}x${png.height} not divisible by tile ${t.tile}`);
    return;
  }
  const cols = png.width / t.tile;
  const outDir = join(TILES_DIR, t.game);
  mkdirSync(outDir, { recursive: true });
  t.pick.forEach((idx, n) => {
    const out = new PNG({ width: t.tile, height: t.tile });
    const f = crop(png, (idx % cols) * t.tile, Math.floor(idx / cols) * t.tile, t.tile, t.tile);
    f.data.copy(out.data);
    const name = t.pick.length === 1 ? t.name : `${t.name}${n}`;
    writeFileSync(join(outDir, `${name}.png`), PNG.sync.write(out));
  });
  console.log(`  tiles ${t.game}/${t.name}: ${t.pick.length} of ${cols * (png.height / t.tile)} @${t.tile}px`);
}

const packs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PACKS);
for (const pack of packs) {
  if (!PACKS[pack]) { errors.push(`no PACKS entry for "${pack}" - multi-row grids are never guessed, add the mapping`); continue; }
  const dir = PACKS[pack].srcRoot || join(PACKS_DIR, pack);
  if (!existsSync(dir)) { errors.push(`pack folder missing: ${dir}`); continue; }
  console.log(`pack ${pack}:`);
  PACKS[pack].chars.forEach((c) => ingestChar(pack, PACKS[pack], c));
}
for (const t of TILES) if (packs.includes(t.pack)) cutTiles(t);

if (errors.length) {
  console.error(`\nHARD ERRORS (${errors.length}):`);
  errors.forEach((e) => console.error(`  ! ${e}`));
  process.exit(1);
}
console.log(`\nclean -> ${STRIPS_DIR}`);
