/**
 * dk-atlas.mjs (ADR-0101): packs per-animation horizontal strip PNGs into
 * Pixi spritesheet atlases (PNG + JSON). GENERIC over its input — it only
 * assumes uniform square cells — so the future AI-generated strips flow
 * through the exact same step as today's code-baked ones.
 *
 * In:  public/chef-art/_raw/strips/<variant>/<anim>.png  (cells CELLxCELL)
 * Out: public/chef-art/chars/<variant>.png + <variant>.json
 *      frames named "<anim>_<i>"; an "animations" map per anim; meta.image
 *      relative, so Assets.load("<variant>.json") wires itself up.
 *
 * Compositing uses SVG <image> with data URIs + clipPath crops rendered by
 * @resvg/resvg-js — no native image library needed on this box.
 *
 * Run: node scripts/dk-atlas.mjs
 */

import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CELL = 128;
const COLS = 5;
const IN = join(process.cwd(), "public", "chef-art", "_raw", "strips");
const OUT = join(process.cwd(), "public", "chef-art", "chars");
mkdirSync(OUT, { recursive: true });

/** PNG dimensions straight from the IHDR chunk. */
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const variants = readdirSync(IN, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const variant of variants) {
  const dir = join(IN, variant);
  const strips = readdirSync(dir)
    .filter((n) => n.endsWith(".png"))
    .sort();

  // collect every cell across strips, keeping animation grouping
  const cells = []; // {anim, idx, dataUri, srcX}
  for (const file of strips) {
    const anim = file.replace(/\.png$/, "");
    const buf = readFileSync(join(dir, file));
    const { w, h } = pngSize(buf);
    if (h !== CELL || w % CELL !== 0) {
      throw new Error(`${variant}/${file}: expected ${CELL}px cells, got ${w}x${h}`);
    }
    const dataUri = `data:image/png;base64,${buf.toString("base64")}`;
    for (let i = 0; i < w / CELL; i++) {
      cells.push({ anim, idx: i, dataUri, srcX: i * CELL });
    }
  }

  const rows = Math.ceil(cells.length / COLS);
  const W = COLS * CELL;
  const H = rows * CELL;

  const frames = {};
  const animations = {};
  let defs = "";
  let body = "";
  cells.forEach((c, n) => {
    const ax = (n % COLS) * CELL;
    const ay = Math.floor(n / COLS) * CELL;
    const clipId = `c${n}`;
    defs += `<clipPath id="${clipId}"><rect x="${ax}" y="${ay}" width="${CELL}" height="${CELL}"/></clipPath>`;
    body += `<g clip-path="url(#${clipId})"><image x="${ax - c.srcX}" y="${ay}" href="${c.dataUri}"/></g>`;
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

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>`;
  // no <text> in any strip: skipping the system font database is byte-identical
  // and ~150x faster (see RESVG_OPTS in dk-bake-room.mjs).
  const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  writeFileSync(join(OUT, `${variant}.png`), png);

  const sheet = {
    frames,
    animations,
    meta: { app: "dk-atlas", image: `${variant}.png`, format: "RGBA8888", size: { w: W, h: H }, scale: "1" },
  };
  writeFileSync(join(OUT, `${variant}.json`), JSON.stringify(sheet));
  console.log(`packed ${variant}: ${cells.length} cells -> ${W}x${H} (${Math.round(png.length / 1024)}KB)`);
}
console.log(`done -> ${OUT}`);
