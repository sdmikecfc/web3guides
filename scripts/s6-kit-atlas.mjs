/**
 * s6-kit-atlas.mjs: packs s6-kit-ingest.mjs's per-game strips into Pixi
 * spritesheet atlases for the existing arenas. A CLONE of riot-atlas.mjs
 * (which the RIOT session is mid-build on - see s6-kit-ingest.mjs's header
 * for why clone-not-edit), with one delta: the input tree is per-game
 * (art-src/kits/strips/<game>/<char>) and each game's atlases land in its
 * own public/s6-art/games/<game>/chars/.
 *
 * ONLY transformed atlases cross this line - the licensing wall between
 * gitignored art-src/kits and the deployed public tree lives right here.
 * Run AFTER s6-kit-recolour.py so the machines ship recolored.
 *
 * In:  art-src/kits/strips/<game>/<char>/<anim>.png  (+ meta.json)
 * Out: public/s6-art/games/<game>/chars/<char>.png + <char>.json
 *
 * Run: node scripts/s6-kit-atlas.mjs [game ...]   (default: every game dir;
 *      the "_proof" game is always skipped unless named explicitly)
 */

import { Resvg } from "@resvg/resvg-js";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const IN = join(process.cwd(), "art-src", "kits", "strips");

/** PNG dimensions straight from the IHDR chunk. */
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const only = process.argv.slice(2);
if (!existsSync(IN)) {
  console.error(`nothing to pack: ${IN} does not exist - run s6-kit-ingest.mjs first`);
  process.exit(1);
}
const games = readdirSync(IN, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((g) => (only.length ? only.includes(g) : g !== "_proof"))
  .sort();
if (!games.length) {
  console.error(`nothing to pack in ${IN}${only.length ? ` matching [${only}]` : ""} - run s6-kit-ingest.mjs first`);
  process.exit(1);
}

for (const game of games) {
  const gameIn = join(IN, game);
  const OUT = join(process.cwd(), "public", "s6-art", "games", game, "chars");
  const variants = readdirSync(gameIn, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (!variants.length) continue;
  mkdirSync(OUT, { recursive: true });

  for (const variant of variants) {
    const dir = join(gameIn, variant);
    const metaPath = join(dir, "meta.json");
    const ingestMeta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
    const strips = readdirSync(dir).filter((n) => n.endsWith(".png")).sort();
    if (!strips.length) continue;

    // CELL is inferred from the first strip and ASSERTED on every other one:
    // mixed cells inside a variant means the ingest table routed a source to
    // the wrong cell, and that is a stop-the-line error, not a guess.
    let CELL = 0;
    const cells = []; // {anim, idx, dataUri, srcX}
    for (const file of strips) {
      const anim = file.replace(/\.png$/, "");
      const buf = readFileSync(join(dir, file));
      const { w, h } = pngSize(buf);
      if (!CELL) CELL = h;
      if (h !== CELL || w % CELL !== 0) {
        throw new Error(`${game}/${variant}/${file}: expected uniform ${CELL}px cells, got ${w}x${h}`);
      }
      const dataUri = `data:image/png;base64,${buf.toString("base64")}`;
      for (let i = 0; i < w / CELL; i++) cells.push({ anim, idx: i, dataUri, srcX: i * CELL });
    }
    if (ingestMeta.cell && ingestMeta.cell !== CELL) {
      throw new Error(`${game}/${variant}: strips are ${CELL}px but ingest meta says ${ingestMeta.cell}px`);
    }

    const COLS = Math.max(4, Math.floor(1024 / CELL));
    const W = COLS * CELL;
    const H = Math.ceil(cells.length / COLS) * CELL;

    const frames = {};
    const animations = {};
    let defs = "";
    let body = "";
    cells.forEach((c, n) => {
      const ax = (n % COLS) * CELL;
      const ay = Math.floor(n / COLS) * CELL;
      defs += `<clipPath id="c${n}"><rect x="${ax}" y="${ay}" width="${CELL}" height="${CELL}"/></clipPath>`;
      body += `<g clip-path="url(#c${n})"><image x="${ax - c.srcX}" y="${ay}" href="${c.dataUri}"/></g>`;
      const name = `${c.anim}_${c.idx}`;
      frames[name] = {
        frame: { x: ax, y: ay, w: CELL, h: CELL },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: CELL, h: CELL },
        sourceSize: { w: CELL, h: CELL },
      };
      (animations[c.anim] = animations[c.anim] || []).push(name);
    });

    // visible contact frame per anim: ingest override wins, else 0.6*n rounded
    const hitFrame = {};
    for (const [anim, list] of Object.entries(animations)) {
      const o = ingestMeta.hitFrame?.[anim];
      hitFrame[anim] = Math.min(list.length - 1, o ?? Math.round(0.6 * list.length));
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>`;
    // no <text> in any strip: skipping the font database is byte-identical and fast
    const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
    writeFileSync(join(OUT, `${variant}.png`), png);

    const sheet = {
      frames,
      animations,
      meta: {
        app: "s6-kit-atlas",
        image: `${variant}.png`,
        format: "RGBA8888",
        size: { w: W, h: H },
        scale: "1",
        // same meta key riot's Client reads, so one consumption pattern serves
        // every s6 game (cell for sizing, hitFrame for contact alignment)
        riot: { cell: CELL, kind: ingestMeta.kind ?? "unknown", hitFrame },
      },
    };
    writeFileSync(join(OUT, `${variant}.json`), JSON.stringify(sheet));
    console.log(`packed ${game}/${variant}: ${cells.length} cells @${CELL}px -> ${W}x${H} (${Math.round(png.length / 1024)}KB) hitFrame ${JSON.stringify(hitFrame)}`);
  }
  console.log(`done ${game} -> ${OUT}`);
}
