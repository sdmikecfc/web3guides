/**
 * Chroma-key the magenta plate out of the raw STARFALL (stars-art) renders.
 * Sibling of key-magenta.js (which targets seas-art); identical logic, additive.
 *
 *   node key-stars-art.js              # key every public/stars-art/_raw/*.png
 *   node key-stars-art.js hull-07      # key one (basename, no .png)
 *
 * Reads public/stars-art/_raw/<name>.png (gpt-image-2 render on flat #FF00FF),
 * writes a transparent public/stars-art/<name>.png. Full-frame backdrops (no
 * magenta) pass through unchanged. Distance-based key + edge feather; despill
 * runs ONLY on feathered edge pixels so saturated hull colors are never touched.
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const ART = path.resolve(__dirname, "public", "stars-art");
const RAW = path.join(ART, "_raw");

// Squared-distance thresholds to pure magenta (255,0,255). Tunable.
const T_IN = 62 * 62;    // <= this → background (alpha 0)
const T_OUT = 150 * 150; // >= this → subject (alpha 255); between → feather

function keyOne(name) {
  const src = path.join(RAW, `${name}.png`);
  if (!fs.existsSync(src)) { console.warn(`  skip ${name}: no raw`); return false; }
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
  fs.writeFileSync(path.join(ART, `${name}.png`), PNG.sync.write(png));
  console.log(`  ✓ ${name}: cleared ${(100 * cleared / (d.length / 4)).toFixed(0)}% bg, ${feathered} feather px`);
  return true;
}

const arg = process.argv[2];
if (!fs.existsSync(RAW)) { console.error("no _raw dir: " + RAW); process.exit(1); }
const names = arg
  ? [arg.replace(/\.png$/, "")]
  : fs.readdirSync(RAW).filter((f) => f.endsWith(".png")).map((f) => f.replace(/\.png$/, ""));
let ok = 0;
for (const n of names) if (keyOne(n)) ok++;
console.log(`keyed ${ok}/${names.length}`);
