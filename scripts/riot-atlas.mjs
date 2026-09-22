/**
 * riot-atlas.mjs (ADR-0124): packs riot-ingest.mjs's per-animation strips
 * into Pixi spritesheet atlases. Derived from dk-atlas.mjs (which stays
 * untouched - chef depends on it); differences: CELL is INFERRED from each
 * variant's strip height (96 hero/thugs, 128 bosses - asserted consistent
 * within a variant), and meta.riot carries cell + hitFrame[anim] so the
 * Client can align the visible contact frame with the sim's active window.
 * hitFrame defaults to round(0.6 * frames) (Capcom-style late contact),
 * clamped to the last frame; the ingest PACKS table overrides per anim via
 * the strips' meta.json.
 *
 * In:  art-src/riot/strips/<char>/<anim>.png  (+ meta.json from ingest)
 * Out: public/s6-art/games/riot/chars/<char>.png + <char>.json
 *
 * ONLY transformed atlases cross this line - the licensing wall between
 * gitignored art-src/riot and the deployed public tree lives right here.
 *
 * Run: node scripts/riot-atlas.mjs [char ...]   (default: every strip dir)
 */

import { Resvg } from "@resvg/resvg-js";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const IN = join(process.cwd(), "art-src", "riot", "strips");
const OUT = join(process.cwd(), "public", "s6-art", "games", "riot", "chars");
mkdirSync(OUT, { recursive: true });

/** PNG dimensions straight from the IHDR chunk. */
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const only = process.argv.slice(2);
const variants = readdirSync(IN, { withFileTypes: true })
  .filter((d) => d.isDirectory() && (!only.length || only.includes(d.name)))
  .map((d) => d.name)
  .sort();
if (!variants.length) {
  console.error(`nothing to pack in ${IN}${only.length ? ` matching [${only}]` : ""} - run riot-ingest.mjs first`);
  process.exit(1);
}

for (const variant of variants) {
  const dir = join(IN, variant);
  const metaPath = join(dir, "meta.json");
  const ingestMeta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
  const strips = readdirSync(dir).filter((n) => n.endsWith(".png")).sort();
  if (!strips.length) continue;

  // CELL is inferred from the first strip and ASSERTED on every other one:
  // mixed cells inside a variant means the ingest table routed a source to
  // the wrong kind, and that is a stop-the-line error, not a guess.
  let CELL = 0;
  const cells = []; // {anim, idx, dataUri, srcX}
  for (const file of strips) {
    const anim = file.replace(/\.png$/, "");
    const buf = readFileSync(join(dir, file));
    const { w, h } = pngSize(buf);
    if (!CELL) CELL = h;
    if (h !== CELL || w % CELL !== 0) {
      throw new Error(`${variant}/${file}: expected uniform ${CELL}px cells, got ${w}x${h}`);
    }
    const dataUri = `data:image/png;base64,${buf.toString("base64")}`;
    for (let i = 0; i < w / CELL; i++) cells.push({ anim, idx: i, dataUri, srcX: i * CELL });
  }
  if (ingestMeta.cell && ingestMeta.cell !== CELL) {
    throw new Error(`${variant}: strips are ${CELL}px but ingest meta says ${ingestMeta.cell}px`);
  }

  const COLS = Math.max(4, Math.floor(1024 / CELL)); // 96->10, 128->8 per row
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
      app: "riot-atlas",
      image: `${variant}.png`,
      format: "RGBA8888",
      size: { w: W, h: H },
      scale: "1",
      riot: { cell: CELL, kind: ingestMeta.kind ?? "unknown", hitFrame },
    },
  };
  writeFileSync(join(OUT, `${variant}.json`), JSON.stringify(sheet));
  console.log(`packed ${variant}: ${cells.length} cells @${CELL}px -> ${W}x${H} (${Math.round(png.length / 1024)}KB) hitFrame ${JSON.stringify(hitFrame)}`);
}
console.log(`done -> ${OUT}`);
