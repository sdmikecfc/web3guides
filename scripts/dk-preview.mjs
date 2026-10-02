/**
 * Domain Kitchen art preview (M7): a contact sheet for judging baked room art.
 *
 * Baking a lone sprite onto transparency tells you nothing useful. Three things
 * only show up in context, and each one has already cost us:
 *
 *  1. MIRRORING. scene.ts flips any 1x1 piece whose facing is "sw", and the
 *     starter layout ships four chairs facing sw. Shading that reads well
 *     unflipped can fight the room's light the moment it flips, so every piece
 *     is drawn here BOTH ways, side by side.
 *  2. SCALE. Sprites render at 0.5 in game. A contact shadow tuned at 2x can
 *     vanish at 0.5, so both scales are on the sheet.
 *  3. GROUND. Art judged on white lies about its contrast. Pieces sit on the
 *     theme's real floor tiles against the theme's real wall colour.
 *
 * It doubles as a REGISTRATION regression test: placement here reproduces
 * _engine/iso.ts and scene.ts anchorFor() exactly, so a piece that drifts off
 * its tile is visible immediately.
 *
 * Run: node scripts/dk-preview.mjs <theme> [piece ...]
 *   node scripts/dk-preview.mjs trattoria              # every piece
 *   node scripts/dk-preview.mjs izakaya table chair    # just these
 * Writes .dk-preview/<theme>.png (gitignored).
 */

import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { THEMES, RESVG_OPTS } from "./dk-bake-room.mjs";

// DK_ART_ROOT lets the harness render an OLD art tree (e.g. one extracted from
// git) so a change can be judged as a before/after rather than from memory.
const ART = process.env.DK_ART_ROOT || join(process.cwd(), "public", "chef-art");
const ROOT = join(ART, "room");
const OUT_DIR = join(process.cwd(), ".dk-preview");

// ── registration, mirrored from src/app/chef/game/_engine/iso.ts ────────────
const TILE_W = 64, TILE_H = 32, ART_SCALE = 2;
const FURN_W = 96, FURN_H = 112, FURN_BX = 48, FURN_BY = 104;
const FURN2_W = 160, FURN2_H = 120, FURN2_BX = 104, FURN2_BY = 108;
const isoX = (gx, gy) => (gx - gy) * (TILE_W / 2);
const isoY = (gx, gy) => (gx + gy) * (TILE_H / 2);

/** Pieces worth judging, with their footprint. Order = reading order. */
const PIECES = [
  { name: "table", cells: 1 },
  { name: "chair", cells: 1 },
  { name: "stove", cells: 1 },
  { name: "bench", cells: 1 },
  { name: "plant", cells: 1 },
  { name: "toilet", cells: 1 },
  { name: "toilet-broken", cells: 1 },
  { name: "counter", cells: 2 },
  // Flat decor registers DIFFERENTLY: scene.ts anchors these at their CENTRE
  // (0.5, 0.5) and drops them at the tile centre rather than its bottom corner.
  // Getting this wrong floats them above the tile, which is exactly what the
  // first pass did and why nobody had ever really looked at them.
  { name: "rug", cells: 1, decor: 32 },      // isoY + TILE_H
  { name: "doormat", cells: 1, decor: 16 },  // isoY + TILE_H/2
  { name: "trash", cells: 1, decor: 20 },    // isoY + TILE_H/2 + 4
];

const zi = process.argv.indexOf("--zoom");
const ZOOM = zi >= 0 && process.argv[zi + 1] ? Number(process.argv[zi + 1]) : 1;

const png64 = (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;

/** PNG dimensions straight out of the IHDR chunk (same trick as dk-atlas.mjs). */
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/**
 * One stage: a 3x3 floor patch with the piece standing on the middle tile,
 * placed exactly the way scene.ts anchorFor() places it.
 */
function stage(theme, piece, { mirror }) {
  const dir = join(ROOT, theme);
  const OX = 104, OY = 56; // grid origin inside the stage box
  let out = "";

  // floor: alternates floor/floor-alt on (gx+gy) parity, anchor (0.5, 0) at the
  // tile's TOP corner.
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const f = join(dir, (gx + gy) % 2 === 0 ? "floor.png" : "floor-alt.png");
      if (!existsSync(f)) continue;
      const { w, h } = pngSize(f);
      const lw = w / ART_SCALE, lh = h / ART_SCALE;
      out += `<image href="${png64(f)}" x="${OX + isoX(gx, gy) - lw / 2}" y="${OY + isoY(gx, gy)}" width="${lw}" height="${lh}"/>`;
    }
  }

  // the piece on tile (1,1). Multi-cell art registers on its FAR (+gx) tile.
  const file = join(dir, `${piece.name}.png`);
  if (existsSync(file)) {
    const { w, h } = pngSize(file);
    const lw = w / ART_SCALE, lh = h / ART_SCALE;
    const gx = 1, gy = 1;
    const ax = gx + piece.cells - 1;
    const px = OX + isoX(ax, gy);
    const py = OY + isoY(ax, gy) + (piece.decor ?? TILE_H);
    const [bx, by] = piece.decor
      ? [lw / 2, lh / 2] // centre-anchored
      : piece.cells > 1
        ? [FURN2_BX, FURN2_BY]
        : [FURN_BX, FURN_BY];
    const imgX = px - bx, imgY = py - by;
    // Pixi mirrors about the ANCHOR, i.e. the vertical line x = px.
    const flip = mirror ? `transform="translate(${2 * px} 0) scale(-1 1)"` : "";
    out += `<g ${flip}><image href="${png64(file)}" x="${imgX}" y="${imgY}" width="${lw}" height="${lh}"/></g>`;
  }
  return out;
}

function sheet(theme, pieces, maxCols = 3) {
  const P = THEMES[theme];
  const cols = Math.min(maxCols, pieces.length);
  const SW = 208, SH = 168, GAP = 10;
  // One CELL per piece: unflipped | mirrored at 1.0, and the same pair at 0.5
  // underneath. Both scales matter and the mirror pair has to be adjacent, or
  // you cannot actually see the thing you are checking for.
  const CW = SW * 2, CH = SH + GAP + SH / 2;
  const rows = Math.ceil(pieces.length / cols);
  const W = cols * (CW + GAP) + GAP;
  const H = rows * (CH + GAP) + GAP;

  let body = `<rect width="${W}" height="${H}" fill="${P.plasterR ?? "#e4d5b2"}"/>`;
  const pair = (piece, scale) =>
    `<g transform="scale(${scale})">` +
    stage(theme, piece, { mirror: false }) +
    `<g transform="translate(${SW} 0)">${stage(theme, piece, { mirror: true })}</g>` +
    `<line x1="${SW}" y1="0" x2="${SW}" y2="${SH}" stroke="${P.outline ?? "#0006"}" stroke-width="1" opacity="0.3"/>` +
    `</g>`;

  pieces.forEach((piece, i) => {
    const x = GAP + (i % cols) * (CW + GAP);
    const y = GAP + Math.floor(i / cols) * (CH + GAP);
    body += `<g transform="translate(${x} ${y})">`;
    body += pair(piece, 1);
    body += `<g transform="translate(0 ${SH + GAP})">${pair(piece, 0.5)}</g>`;
    body += `</g>`;
  });

  // --zoom scales the whole sheet up for close judging. Art decisions get made
  // at 3x and sanity-checked in the 0.5 row, which is what ships.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W * ZOOM}" height="${H * ZOOM}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  return new Resvg(svg, RESVG_OPTS).render().asPng();
}

/**
 * ROOM MODE: composite a whole restaurant out of the SHIPPED art, at the exact
 * registration scene.ts uses. Not a substitute for looking at the running game,
 * but the browser pane cannot always composite frames for a screenshot, and
 * "does the finished room read well together" is a question a single-sprite
 * contact sheet cannot answer.
 *
 * Uses the same starter layout the game ships, plus characters and a lit stove.
 */
function room(theme, { crew = 0, guests = [0, 5, 9, 14] } = {}) {
  const dir = join(ROOT, theme);
  const CHARS = join(ART, "chars");
  const W = 900, H = 620;
  const OX = 470, OY = 150; // where tile (0,0)'s top corner lands
  const P = THEMES[theme];
  let out = `<rect width="${W}" height="${H}" fill="${P.plasterR}"/>`;

  const place = (file, px, py, bx, by, flip = false) => {
    if (!existsSync(file)) return "";
    const { w, h } = pngSize(file);
    const lw = w / ART_SCALE, lh = h / ART_SCALE;
    const g = flip ? `transform="translate(${2 * px} 0) scale(-1 1)"` : "";
    return `<g ${g}><image href="${png64(file)}" x="${px - bx}" y="${py - by}" width="${lw}" height="${lh}"/></g>`;
  };

  // walls: left anchored (1,0), right anchored (0,0), both at y = -WALL_H
  const wl = join(dir, "wall-left.png"), wr = join(dir, "wall-right.png");
  if (existsSync(wl)) {
    const { w, h } = pngSize(wl);
    out += `<image href="${png64(wl)}" x="${OX - w / ART_SCALE}" y="${OY - 96}" width="${w / ART_SCALE}" height="${h / ART_SCALE}"/>`;
  }
  if (existsSync(wr)) {
    const { w, h } = pngSize(wr);
    out += `<image href="${png64(wr)}" x="${OX}" y="${OY - 96}" width="${w / ART_SCALE}" height="${h / ART_SCALE}"/>`;
  }

  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 10; gx++) {
      const f2 = join(dir, (gx + gy) % 2 === 0 ? "floor.png" : "floor-alt.png");
      if (!existsSync(f2)) continue;
      const { w, h } = pngSize(f2);
      out += `<image href="${png64(f2)}" x="${OX + isoX(gx, gy) - w / ART_SCALE / 2}" y="${OY + isoY(gx, gy)}" width="${w / ART_SCALE}" height="${h / ART_SCALE}"/>`;
    }
  }

  // the shipped STARTER_LAYOUT, plus a few bought pieces
  const items = [
    ["stove", 2, 0, 1, false], ["counter", 5, 0, 2, false],
    ["table", 2, 3, 1, false], ["chair", 2, 2, 1, true], ["chair", 2, 4, 1, false],
    ["table", 6, 3, 1, false], ["chair", 6, 2, 1, true], ["chair", 6, 4, 1, false],
    ["table", 4, 5, 1, false], ["chair", 4, 4, 1, true],
    ["plant", 0, 0, 1, false], ["plant", 9, 0, 1, false],
    ["bench", 8, 6, 1, false], ["toilet", 0, 6, 1, false],
  ];
  // depth sort, exactly like objC's zIndex
  const drawn = items
    .map(([art, gx, gy, cells, flip]) => ({ art, gx, gy, cells, flip, z: gx + cells - 1 + gy }))
    .sort((a, b) => a.z - b.z);

  const chars = [
    { sheet: `chef${crew}`, frame: 6, gx: 2, gy: 1 },   // at the stove, cooking
    { sheet: `waiter${crew}`, frame: 10, gx: 5, gy: 2 },
    ...guests.map((g, i) => ({ sheet: `guest${g}`, frame: [10, 5, 0, 11][i % 4], gx: [2, 6, 4, 8][i % 4], gy: [3, 3, 5, 5][i % 4] })),
  ].map((c) => ({ ...c, z: c.gx + c.gy }));

  for (const d of [...drawn, ...chars].sort((a, b) => a.z - b.z)) {
    if (d.art) {
      const ax = d.gx + d.cells - 1;
      const px = OX + isoX(ax, d.gy);
      const py = OY + isoY(ax, d.gy) + TILE_H;
      const [bx, by] = d.cells > 1 ? [FURN2_BX, FURN2_BY] : [FURN_BX, FURN_BY];
      out += place(join(dir, `${d.art}.png`), px, py, bx, by, d.flip);
      // the lit burner, drawn straight after its stove
      if (d.art === "stove") {
        const fx = join(CHARS, "fx.png");
        if (existsSync(fx)) {
          // ONE cell of the fx atlas (flame_0 = col 0, row 0), clipped to the
          // 64x64 logical box scene.ts centres on the burner at (x-11, y-62).
          const cx0 = px - 11 - 32, cy0 = py - 62 - 32;
          out += `<clipPath id="fl${d.gx}${d.gy}"><rect x="${cx0}" y="${cy0}" width="64" height="64"/></clipPath>`;
          out += `<g clip-path="url(#fl${d.gx}${d.gy})"><image href="${png64(fx)}" x="${cx0}" y="${cy0}" width="320" height="192"/></g>`;
        }
      }
    } else {
      // a character: cell `frame` of the 5-column atlas, cropped by a clipPath
      const sheetFile = join(CHARS, `${d.sheet}.png`);
      if (!existsSync(sheetFile)) continue;
      const col = d.frame % 5, rowN = Math.floor(d.frame / 5);
      const px = OX + isoX(d.gx, d.gy);
      const py = OY + isoY(d.gx, d.gy) + TILE_H / 2;
      const x0 = px - 32, y0 = py - 58;
      const id = `c${d.sheet}${d.frame}`.replace(/[^a-z0-9]/gi, "");
      out += `<clipPath id="${id}"><rect x="${x0}" y="${y0}" width="64" height="64"/></clipPath>`;
      out += `<g clip-path="url(#${id})"><image href="${png64(sheetFile)}" x="${x0 - col * 64}" y="${y0 - rowN * 64}" width="320" height="${(rowN + 3) * 64}"/></g>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W * ZOOM}" height="${H * ZOOM}" viewBox="0 0 ${W} ${H}">${out}</svg>`;
  return new Resvg(svg, RESVG_OPTS).render().asPng();
}

// ── driver ─────────────────────────────────────────────────────────────────
// drop flags AND their values, so "--zoom 3" does not read as a piece named "3"
const positional = [];
const rawArgs = process.argv.slice(2);
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i].startsWith("--")) { i++; continue; }
  positional.push(rawArgs[i]);
}
const [theme, ...want] = positional;
if (!theme || !THEMES[theme]) {
  console.error(`usage: node scripts/dk-preview.mjs <theme> [piece ...]`);
  console.error(`themes: ${Object.keys(THEMES).join(", ")}`);
  process.exit(1);
}
const pieces = want.length
  ? want.map((n) => PIECES.find((p) => p.name === n.replace(/\.png$/, "")) ?? { name: n, cells: 1 })
  : PIECES.filter((p) => existsSync(join(ROOT, theme, `${p.name}.png`)));

mkdirSync(OUT_DIR, { recursive: true });
if (process.argv.includes("--room")) {
  const out = join(OUT_DIR, `room-${theme}.png`);
  writeFileSync(out, room(theme));
  console.log(`${theme}: whole room, shipped art at real registration -> ${out}`);
} else {
  const out = join(OUT_DIR, `${theme}.png`);
  writeFileSync(out, sheet(theme, pieces));
  console.log(`${theme}: ${pieces.length} pieces (unflipped | mirrored, 1.0 and 0.5) -> ${out}`);
}
