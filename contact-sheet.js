/**
 * Tile keyed seas-art PNGs over the map navy into one contact sheet for review.
 *   node contact-sheet.js ship-sovereign ship-gildedlion ...   -> /tmp/sheet.png
 *   node contact-sheet.js ships    (all ship-*.png)
 *   node contact-sheet.js emblems  (all emblem-*.png)
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const ART = path.resolve(__dirname, "public", "seas-art");
const BG = [14, 44, 68];
const CELL_W = 360, PAD = 14, COLS = 3;

function load(name) {
  const p = path.join(ART, `${name}.png`);
  if (!fs.existsSync(p)) return null;
  const src = PNG.sync.read(fs.readFileSync(p));
  const s = CELL_W / src.width, h = Math.round(src.height * s);
  const out = new PNG({ width: CELL_W, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < CELL_W; x++) {
    const sx = Math.min(src.width - 1, Math.floor(x / s)), sy = Math.min(src.height - 1, Math.floor(y / s));
    const si = (sy * src.width + sx) * 4, di = (y * CELL_W + x) * 4;
    const a = src.data[si + 3] / 255;
    for (let c = 0; c < 3; c++) out.data[di + c] = Math.round(src.data[si + c] * a + BG[c] * (1 - a));
    out.data[di + 3] = 255;
  }
  return out;
}

let names = process.argv.slice(2);
if (names[0] === "ships") names = fs.readdirSync(ART).filter((f) => /^ship-.*\.png$/.test(f)).map((f) => f.replace(/\.png$/, ""));
if (names[0] === "emblems") names = fs.readdirSync(ART).filter((f) => /^emblem-.*\.png$/.test(f)).map((f) => f.replace(/\.png$/, ""));
const imgs = names.map((n) => ({ n, img: load(n) })).filter((x) => x.img);
const cellH = Math.max(...imgs.map((x) => x.img.height)) + 26;
const rows = Math.ceil(imgs.length / COLS);
const W = COLS * CELL_W + (COLS + 1) * PAD, H = rows * cellH + (rows + 1) * PAD;
const sheet = new PNG({ width: W, height: H });
for (let i = 0; i < sheet.data.length; i += 4) { sheet.data[i] = 8; sheet.data[i + 1] = 26; sheet.data[i + 2] = 40; sheet.data[i + 3] = 255; }
imgs.forEach((x, i) => {
  const cx = PAD + (i % COLS) * (CELL_W + PAD), cy = PAD + Math.floor(i / COLS) * (cellH + PAD);
  for (let y = 0; y < x.img.height; y++) for (let xx = 0; xx < CELL_W; xx++) {
    const si = (y * CELL_W + xx) * 4, di = ((cy + y) * W + (cx + xx)) * 4;
    for (let c = 0; c < 4; c++) sheet.data[di + c] = x.img.data[si + c];
  }
});
fs.writeFileSync("/tmp/sheet.png", PNG.sync.write(sheet));
console.log(`sheet: ${imgs.length} tiles -> /tmp/sheet.png  (${imgs.map((x) => x.n).join(", ")})`);
