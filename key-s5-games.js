/**
 * Chroma-key the magenta plate out of the raw Season 5 GAME sprites.
 * Sibling of key-s4-art.js (same key + feather + edge-despill math), plus:
 *   - subdir support: raws live in public/s5-art/games/_raw/<game>/<name>.png
 *     and finals land in public/s5-art/games/<game>/<name>.png
 *   - bbox crop: after keying, transparent margins are trimmed (8px pad)
 *   - bg-* files are UNKEYED full-frame paintings -> skipped here (the
 *     generator writes their finals directly)
 *   - --copies: duplicate shared finals across games (EMPTY since the
 *     round-2 cutover, see COPIES below)
 *   - finals are DOWNSCALED on write (MAX_DIM), so re-keying can never
 *     re-inflate the shipped payload; _raw/ keeps the masters
 *
 *   node key-s5-games.js                     # key every non-bg raw
 *   node key-s5-games.js warbirds            # one game
 *   node key-s5-games.js warbirds/aa-gun     # one sprite
 *   node key-s5-games.js --copies            # apply cross-game duplicates
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const ART = path.resolve(__dirname, "public", "s5-art", "games");
const RAW = path.join(ART, "_raw");

// Squared-distance thresholds to pure magenta (255,0,255). Tunable.
const T_IN = 62 * 62;    // <= this -> background (alpha 0)
const T_OUT = 150 * 150; // >= this -> subject (alpha 255); between -> feather
const PAD = 8;           // bbox crop padding, px
const A_MIN = 8;         // alpha counted as "content" for the bbox

// Shared finals: [dest, source] under public/s5-art/games/.
// EMPTY SINCE THE ROUND-2 CUTOVER (2026-07-25, ADR-0078): every entry sourced
// from spearhead/ or ironaces/, both retired and deleted. Their finals had
// already been copied into the surviving games, so tankbuster/fx-* and
// holdline/foe-*|fx-* are real self-contained files now and `--copies` is a
// deliberate no-op. Re-populate only if a future game shares a sprite again.
const COPIES = [];

// SHIP SIZE CAP (2026-07-25, ADR-0078). The raws are ~1000px but sprites draw
// at 30-130 CSS px (arena maxWidth 640 at 3:4, DPR capped 2), so the arcade was
// shipping ~57MB of oversized PNGs. Finals are downscaled ON WRITE here, which
// keeps this tool idempotent with the cutover pass: re-keying can never
// re-inflate the payload. _raw/ keeps the full-size masters.
const MAX_DIM = 512;
// Exception: a projected full-street billboard drawn up to ~1850 CSS px when
// you are stalled point-blank against it; 512 visibly blurs during the stall.
const MAX_DIM_OVERRIDE = { "tankbuster/ob-roadblock": 1280 };

/** Box-average downscale (alpha-premultiplied so edges never halo). */
function downscale(src, maxDim) {
  const longest = Math.max(src.width, src.height);
  if (longest <= maxDim) return src;
  const scale = maxDim / longest;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = new PNG({ width: w, height: h });
  const sd = src.data, od = out.data;
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * src.height) / h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * src.height) / h));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * src.width) / w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * src.width) / w));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const al = sd[i + 3] / 255;
          r += sd[i] * al; g += sd[i + 1] * al; b += sd[i + 2] * al;
          a += sd[i + 3]; n++;
        }
      }
      const o = (y * w + x) * 4;
      const aAvg = a / n;
      // un-premultiply: r/g/b are alpha-weighted SUMS over the box, so they
      // divide by the box's TOTAL alpha (a/255), not its average. Dividing by
      // the average scaled every output pixel by n, which blew bright subjects
      // out to white in an n=1-vs-n>1 grid pattern.
      const un = a > 0 ? 255 / a : 0;
      od[o] = Math.min(255, Math.round(r * un));
      od[o + 1] = Math.min(255, Math.round(g * un));
      od[o + 2] = Math.min(255, Math.round(b * un));
      od[o + 3] = Math.round(aAvg);
    }
  }
  return out;
}

function keyOne(rel) { // rel = "<game>/<name>" (no .png)
  const src = path.join(RAW, `${rel}.png`);
  if (!fs.existsSync(src)) { console.warn(`  skip ${rel}: no raw`); return false; }
  const png = PNG.sync.read(fs.readFileSync(src));
  const d = png.data;
  let cleared = 0, feathered = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const dr = r - 255, dg = g, db = b - 255;
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 <= T_IN) {
      d[i + 3] = 0; cleared++;
    } else if (dist2 < T_OUT) {
      const t = (dist2 - T_IN) / (T_OUT - T_IN);
      d[i + 3] = Math.round(255 * t);
      const m = (r + b) / 2;
      if (m > g) { const k = (m - g) * 0.8; d[i] = Math.max(0, r - k); d[i + 2] = Math.max(0, b - k); }
      feathered++;
    } // else: fully opaque subject — leave untouched
  }
  // interior magenta suppression: gpt-image-2 tints translucent smoke/flame
  // bodies with the plate color; the feather-band despill can't reach those.
  // Magenta signature = BOTH r and b above g (orange/rust/olive never match).
  let despilled = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const ex = Math.min(d[i], d[i + 2]) - d[i + 1] - 16;
    if (ex > 0) {
      d[i] = Math.max(0, d[i] - ex * 0.9);
      d[i + 2] = Math.max(0, d[i + 2] - ex * 0.9);
      despilled++;
    }
  }
  // bbox crop (trim transparent margins, PAD px of breathing room)
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (d[(y * png.width + x) * 4 + 3] > A_MIN) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  let out = png;
  if (x1 >= x0 && (x0 > 0 || y0 > 0 || x1 < png.width - 1 || y1 < png.height - 1)) {
    x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD);
    x1 = Math.min(png.width - 1, x1 + PAD); y1 = Math.min(png.height - 1, y1 + PAD);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    out = new PNG({ width: w, height: h });
    PNG.bitblt(png, out, x0, y0, w, h, 0, 0);
  }
  const destDir = path.join(ART, path.dirname(rel));
  fs.mkdirSync(destDir, { recursive: true });
  const preW = out.width, preH = out.height;
  out = downscale(out, MAX_DIM_OVERRIDE[rel] || MAX_DIM);
  const scaled = out.width !== preW ? ` (from ${preW}x${preH})` : "";
  fs.writeFileSync(path.join(ART, `${rel}.png`), PNG.sync.write(out));
  console.log(`  ok ${rel}: cleared ${(100 * cleared / (d.length / 4)).toFixed(0)}% bg, ${feathered} feather px, ${despilled} despilled, ${out.width}x${out.height}${scaled}`);
  return true;
}

function applyCopies() {
  let n = 0;
  for (const [dest, srcRel] of COPIES) {
    const src = path.join(ART, `${srcRel}.png`);
    if (!fs.existsSync(src)) { console.warn(`  copy skip ${dest}: source ${srcRel} missing`); continue; }
    fs.mkdirSync(path.join(ART, path.dirname(dest)), { recursive: true });
    fs.copyFileSync(src, path.join(ART, `${dest}.png`));
    console.log(`  copy ${srcRel} -> ${dest}`); n++;
  }
  console.log(`copied ${n}/${COPIES.length}`);
}

const arg = process.argv[2];
if (arg === "--copies") { applyCopies(); process.exit(0); }
if (!fs.existsSync(RAW)) { console.error("no _raw dir: " + RAW); process.exit(1); }

let rels = [];
if (arg && arg.includes("/")) {
  rels = [arg.replace(/\.png$/, "")];
} else {
  const games = arg ? [arg] : fs.readdirSync(RAW).filter((f) => fs.statSync(path.join(RAW, f)).isDirectory());
  for (const g of games) {
    if (!fs.existsSync(path.join(RAW, g))) { console.warn(`no raw dir for ${g}`); continue; }
    for (const f of fs.readdirSync(path.join(RAW, g))) {
      if (!f.endsWith(".png")) continue;
      const name = f.replace(/\.png$/, "");
      if (name.startsWith("bg-")) continue; // full-frame painting, never keyed
      rels.push(`${g}/${name}`);
    }
  }
}
let ok = 0;
for (const r of rels) if (keyOne(r)) ok++;
console.log(`keyed ${ok}/${rels.length}`);
