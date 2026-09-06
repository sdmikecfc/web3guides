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
// --dir parts keys the parts wave instead: _raw/parts/<slot>-t<tier>-<design>.png
// -> public/bots-art/parts/<slot>/t<tier>-<design>.png (the bake's file names,
// so the rig and the art check keep working unchanged).
const argv = process.argv.slice(2);
const DIR = argv.includes("--dir") ? argv[argv.indexOf("--dir") + 1] : "props";
const RAW = path.join(ROOT, "public", "bots-art", "_raw", DIR);
const OUT = path.join(ROOT, "public", "bots-art", DIR);
fs.mkdirSync(OUT, { recursive: true });
// Parts are NOT written to public/bots-art/parts here: a keyed part is a tight
// crop at generation resolution, while the rig expects the placeholder's
// contract canvas and pivots. scripts/bots-import-parts.py registers the
// keyed crop into that canvas. So parts mode writes to _raw/parts/keyed/.
const KEYED = path.join(RAW, "keyed");
// "bots" is the WHOLE-BOT wave: one finished toy per family on the magenta
// plate, which scripts/bots-import-parts.py then cuts into head, torso, arm and
// leg along the toy's own seams. Like "parts", a keyed bot is an intermediate
// at generation resolution and never a shipped file, so it stays under _raw.
function outPathFor(name) {
  if (DIR !== "parts" && DIR !== "bots") return path.join(OUT, `${name}.png`);
  fs.mkdirSync(KEYED, { recursive: true });
  return path.join(KEYED, `${name}.png`);
}

// Squared-distance thresholds to pure magenta (255,0,255). Same as key-magenta.js.
const T_IN = 62 * 62;    // <= this: background (alpha 0)
const T_OUT = 150 * 150; // >= this: subject (alpha 255); between: feather
const PAD = 8;           // transparent margin kept around the trimmed subject

/**
 * SELF-CALIBRATION, and why a fixed 62 is not good enough for the whole-bot
 * wave. Those two constants were calibrated against a generator that returned a
 * mathematically flat #FF00FF plate. seedream_v5_pro does not: it renders the
 * plate as a real surface, with texture and a slight desaturation, and the
 * background lands 51 to 134 away from pure magenta instead of under 62. Run
 * with the shipped constants, seven of the eight bots cleared under 13 percent
 * of their background and produced two and a half million half-transparent
 * "feather" pixels each, which is not a key at all.
 *
 * MEASURED on this wave, per bot, over the whole set: the frame border (always
 * background, since the toy never reaches an edge) runs to a maximum of 134,
 * and the subject's nearest pixel sits at 208. Nothing whatever lives in
 * between. So the threshold does not need to be guessed or hand-tuned: read the
 * border, put the hard cut just above it, and land the feather band inside that
 * empty gap where it can only ever catch the one or two pixels of antialias on
 * the silhouette.
 *
 * This is opt-in, and DIR "bots" opts in. The props and parts already keyed
 * with the constants keep keying with the constants, so nothing shipped moves.
 */
const AUTO = argv.includes("--auto") || DIR === "bots";
const BORDER = 6;        // rows and columns of frame read as known background

/**
 * NORMALISED MAGENTA-NESS, and why the distance key alone cannot see a cast
 * shadow (2026-09-04).
 *
 * The prompt forbids a cast shadow and two of the eight bots in the second
 * wave drew one anyway: a soft dark smear on the plate, touching the feet. A
 * squared distance to pure magenta cannot refuse it, because that distance
 * conflates "not magenta" with "dark". Measured on sprocket: the plate sits
 * 134 from pure magenta and a 60 percent shadow of the same plate sits 172,
 * past a hard cut of 154, so the shadow keys in as subject. It then arrives
 * CONNECTED to the feet, so largest_component keeps it, and the damage is not
 * cosmetic: the left leg's mask ran from column 36 of a 2048 frame against
 * column 307 on a clean bot, the whole ink box widened, and the measured
 * centre line moved 109 px off the toy. Three families were refused for "not
 * fitting a canvas" that was never the problem.
 *
 * A shadow on the plate is the PLATE, multiplied down. So divide the magenta
 * signal by the pixel's own brightness and the multiplier cancels:
 *
 *     mag = (min(r, b) - g) / max(r, g, b)
 *
 * min(r, b) - g is the same quantity the despill below already trusts, for the
 * same reason: magenta is the one colour that is high in RED and high in BLUE
 * at once. Measured: the plate scores 0.755 and a shadow of it 0.75 at any
 * depth, while bone-cream clay scores -0.04, coral -0.15, glass -0.16 and
 * lilac, the only paint that scores at all, 0.07. So the whole key runs on
 * this one number in AUTO mode, feather included: the distance test could not
 * separate the two populations either, and on three of the eight bots its
 * feather band swallowed the toy's own clay, leaving 0.5 to 1 million
 * part-transparent subject pixels per bot.
 */
function magOf(r, g, b) {
  const m = Math.min(r, b) - g;
  return m / Math.max(1, Math.max(r, Math.max(g, b)));
}

function calibrate(png) {
  const d = png.data, W = png.width, H = png.height;
  let hi = 0;
  const mags = [];
  const at = (x, y) => {
    const i = (y * W + x) * 4;
    const dr = d[i] - 255, dg = d[i + 1], db = d[i + 2] - 255;
    const v = dr * dr + dg * dg + db * db;
    if (v > hi) hi = v;
    mags.push(magOf(d[i], d[i + 1], d[i + 2]));
  };
  for (let y = 0; y < H; y++) for (let b = 0; b < BORDER; b++) { at(b, y); at(W - 1 - b, y); }
  for (let x = 0; x < W; x++) for (let b = 0; b < BORDER; b++) { at(x, b); at(x, H - 1 - b); }
  const border = Math.sqrt(hi);
  // 1.15 of the worst background pixel, and the feather band 1.35 of that. On
  // this wave that is about 155 and 209, i.e. the whole band sits in the empty
  // gap between 134 and 208.
  const tin = border * 1.15, tout = tin * 1.35;
  mags.sort((a, b2) => a - b2);
  const magBg = mags[Math.floor(mags.length / 2)];
  // The feather band sits BETWEEN the two populations, not inside either:
  // background reads magBg, every subject colour reads under 0.1, so 0.55 and
  // 0.25 of magBg leave a factor of about four of clearance on each side and
  // catch only the one or two pixels of antialias on the silhouette.
  return {
    tin: tin * tin, tout: tout * tout, border: Math.round(border),
    magHi: magBg * 0.55, magLo: magBg * 0.25, magBg,
  };
}

/**
 * MAGENTA SPILL, measured on the pixel and not on where it sits in the ramp
 * (verifier defect 9: "a pink outline runs down the shipped plates").
 *
 * What was here before despilled ONLY inside the feather band and weighted
 * the correction by (1 - t), so it faded to nothing exactly at the band's
 * outer edge, and every pixel past T_OUT got no correction at all. A pixel
 * like (250,150,235) is 3 percent past T_OUT: it stayed fully opaque and
 * fully pink, and a line of them runs round every silhouette.
 *
 * SPILL = min(r, b) - g. Magenta is the one colour that is high in RED and
 * high in BLUE at once, so taking the MINIMUM of the two is what separates it
 * from every colour in the B palette. Measured on the eight paints and the
 * three accents: coral #ff8a7a scores -16 (blue is low), brass #d9a441 -99,
 * glass #bfe9ff -42, mint and moss far below zero; lilac #b9a7ff is the only
 * paint that scores at all, at +18. So TOL = 24 leaves every legitimate
 * colour untouched and a contaminated fringe pixel (spill 85 to 255) loses
 * exactly its excess: the pink goes neutral instead of going away.
 */
const SPILL_TOL = 24;
function despill(d, i) {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  const over = Math.min(r, b) - g - SPILL_TOL;
  if (over <= 0) return false;
  d[i] = r - over;
  d[i + 2] = b - over;
  return true;
}

function keyOne(name) {
  const src = path.join(RAW, `${name}.png`);
  if (!fs.existsSync(src)) { console.warn(`  skip ${name}: no raw`); return false; }
  const png = PNG.sync.read(fs.readFileSync(src));
  const d = png.data;
  const cal = AUTO
    ? calibrate(png)
    : { tin: T_IN, tout: T_OUT, border: null, magHi: null, magLo: null };
  const tIn = cal.tin, tOut = cal.tout, magHi = cal.magHi, magLo = cal.magLo;
  let cleared = 0, feathered = 0, despilled = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (magHi !== null) {
      // AUTO: the key IS the magenta-ness. See magOf() above. A shadow cast on
      // the plate is the plate multiplied down, so it clears with it, and the
      // toy's own clay never enters the band however dark the render puts it.
      const m = magOf(r, g, b);
      if (m >= magHi) { d[i + 3] = 0; cleared++; }
      else if (m > magLo) {
        d[i + 3] = Math.round(255 * (1 - (m - magLo) / (magHi - magLo)));
        feathered++;
      } else {
        d[i + 3] = 255;
      }
      if (despill(d, i)) despilled++;
      continue;
    }
    const dr = r - 255, dg = g, db = b - 255;
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 <= tIn) {
      d[i + 3] = 0; cleared++;
    } else if (dist2 < tOut) {
      d[i + 3] = Math.round(255 * ((dist2 - tIn) / (tOut - tIn)));
      feathered++;
    }
    // Despill EVERY pixel, cleared ones included. The alpha decision is left
    // exactly as it was, so the silhouette that the import registers against
    // does not move; only the colour changes. Clearing a background pixel's
    // magenta as well matters because the next stage resamples, and a
    // transparent pixel that still carries (255,0,255) bleeds pink into its
    // opaque neighbours (see _resample_rgba in bots-import-parts.py).
    if (despill(d, i)) despilled++;
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
  fs.writeFileSync(outPathFor(name), PNG.sync.write(out));
  const note = cal.border === null
    ? ""
    : `, plate magenta ${cal.magBg.toFixed(2)} -> cut ${cal.magHi.toFixed(2)}`;
  console.log(`  ok ${name}: ${w}x${h}, cleared ${(100 * cleared / (d.length / 4)).toFixed(0)}% bg, ${feathered} feather px, ${despilled} despilled${note}`);
  return true;
}

// positional name (basename, no .png) after the optional --dir pair
const positional = argv.filter((a, i) => a !== "--dir" && argv[i - 1] !== "--dir");
const arg = positional[0];
const names = arg
  ? [arg]
  : fs.readdirSync(RAW)
      .filter((f) => f.endsWith(".png") && !f.startsWith("_") && !f.includes(".keyed") && !f.includes("-masked"))
      .map((f) => f.slice(0, -4));
let ok = 0;
for (const n of names) if (keyOne(n)) ok++;
console.log(`keyed ${ok} of ${names.length}`);
