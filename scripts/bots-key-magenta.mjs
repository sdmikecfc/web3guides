/**
 * Battle Bots: chroma-key the magenta plate out of the gpt-image-2 prop, head,
 * crew and crowd renders. A copy of key-magenta.js (the Conquer the Seas
 * cutter) pointed at the Battle Bots folders; the algorithm is unchanged:
 * squared-distance key to pure magenta, an edge feather across the boundary,
 * and despill ONLY on feathered edge pixels so saturated subject colours are
 * never touched. Checked against the B palette: coral #ff8a7a and lilac
 * #b9a7ff both sit far outside T_OUT, so no subject pixel keys out.
 *
 *   node scripts/bots-key-magenta.mjs            # key every public/bots-art/_raw/props/*.png
 *   node scripts/bots-key-magenta.mjs toolbox    # key one (basename, no .png)
 *
 * Reads  public/bots-art/_raw/props/<name>.png   (raw magenta plate render)
 * Writes public/bots-art/props/<name>.png        (transparent), plus a
 * bounding-box trim so each cutout is tight, and prints the trimmed size so
 * the rig and set-dressing tables can be filled in from the log.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "public", "bots-art", "_raw", "props");
const OUT = path.join(ROOT, "public", "bots-art", "props");
fs.mkdirSync(OUT, { recursive: true });

// Squared-distance thresholds to pure magenta (255,0,255). Same as key-magenta.js.
const T_IN = 62 * 62;    // <= this: background (alpha 0)
const T_OUT = 150 * 150; // >= this: subject (alpha 255); between: feather
const PAD = 8;           // transparent margin kept around the trimmed subject

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
      // despill only on the fringe: pull the magenta tint toward the green channel
      const m = (r + b) / 2;
      if (m > g) { d[i] = Math.round(r - (m - g) * (1 - t)); d[i + 2] = Math.round(b - (m - g) * (1 - t)); }
      feathered++;
    }
  }
  // trim to the alpha bounding box (plus PAD)
  let minX = png.width, minY = png.height, maxX = -1, maxY = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (d[(y * png.width + x) * 4 + 3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) { console.warn(`  ${name}: nothing left after keying, not written`); return false; }
  minX = Math.max(0, minX - PAD); minY = Math.max(0, minY - PAD);
  maxX = Math.min(png.width - 1, maxX + PAD); maxY = Math.min(png.height - 1, maxY + PAD);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, minX, minY, w, h, 0, 0);
  fs.writeFileSync(path.join(OUT, `${name}.png`), PNG.sync.write(out));
  console.log(`  ok ${name}: ${w}x${h}, cleared ${(100 * cleared / (d.length / 4)).toFixed(0)}% bg, ${feathered} feather px`);
  return true;
}

const arg = process.argv[2];
const names = arg ? [arg] : fs.readdirSync(RAW).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4));
let ok = 0;
for (const n of names) if (keyOne(n)) ok++;
console.log(`keyed ${ok} of ${names.length}`);
