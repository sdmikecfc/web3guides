/**
 * Cut a tall proof sheet into readable bands, with the repo's own PNG codec
 * (src/app/api/bots/portrait/render.ts), so a reviewer and a model can both
 * actually look at it. Dev-only.
 *
 *   npx tsx --tsconfig scripts/tsconfig.gate.json scripts/bots-slice.ts <png> <bands>
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { decodePng, encodePng, type Bitmap } from "@/app/api/bots/portrait/render";

async function main(): Promise<void> {
  const file = process.argv[2];
  const bands = Number(process.argv[3] || 6);
  if (!file) throw new Error("usage: bots-slice.ts <png> [bands]");
  const src = decodePng(new Uint8Array(await fs.readFile(file)));
  const h = Math.ceil(src.h / bands);
  const dir = path.dirname(file);
  const stem = path.basename(file).replace(/\.png$/i, "");
  for (let b = 0; b < bands; b++) {
    const y0 = b * h;
    const bh = Math.min(h, src.h - y0);
    if (bh <= 0) break;
    const out: Bitmap = { w: src.w, h: bh, px: new Uint8Array(src.w * bh * 4) };
    for (let y = 0; y < bh; y++) {
      const s = (y0 + y) * src.w * 4;
      out.px.set(src.px.subarray(s, s + src.w * 4), y * src.w * 4);
    }
    const p = path.join(dir, `${stem}_band-${b + 1}.png`);
    await fs.writeFile(p, encodePng(out));
    console.log(`  ${p}  ${out.w}x${out.h}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
