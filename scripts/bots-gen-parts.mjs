/**
 * Battle Bots: THE PARTS WAVE. Repaint every grey-clay placeholder into a
 * finished toy part with gpt-image-2 (edits endpoint), riding two images:
 * the placeholder as structure and the picked style anchor (B1) as style.
 * Proven by scripts/bots-gen-parts-probe.mjs (head silhouette overlap 0.977;
 * torso features faithful). About five cents per part at medium quality.
 *
 *   node scripts/bots-gen-parts.mjs --list                 # print the manifest, spend nothing
 *   node scripts/bots-gen-parts.mjs --only head-t2-1       # one part
 *   node scripts/bots-gen-parts.mjs --masked --only torso-t2-1   # exact-outline mode (inpaint mask from the placeholder alpha)
 *   node scripts/bots-gen-parts.mjs                        # every part without a raw yet, 3 at a time
 *
 * Manifest: scripts/bots-parts-manifest.json, one entry per part
 *   { "id": "head-t2-1", "slot": "head", "tier": 2, "design": 1,
 *     "family": "Kettle", "motif": "a kettle-shaped dome with a spout-like brow ridge",
 *     "color": "mint" }
 * Generate it from the engine catalog (families and factory colors) with:
 *   npx tsx scripts/bots-parts-manifest.ts
 * Raws land in public/bots-art/_raw/parts/<id>.png; key them with
 *   node scripts/bots-key-magenta.mjs --dir parts
 * (the keyer reads _raw/parts when --dir parts is passed) and derive each
 * paint mask from the grey clay locally (scripts/bots-paint-masks.py).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const KEY = (ENV.match(/^OPENAI_API_KEY=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (!KEY) { console.error("OPENAI_API_KEY missing from .env.local"); process.exit(1); }

const MODEL = "gpt-image-2";
const ANCHOR = path.join(ROOT, "art-src", "bots", "anchors", "B1.png");
const MANIFEST = path.join(__dirname, "bots-parts-manifest.json");
const RAW = path.join(ROOT, "public", "bots-art", "_raw", "parts");
fs.mkdirSync(RAW, { recursive: true });

const SLOT_WORDS = {
  head: "a robot HEAD only (no body): two big round lamp eyes and a friendly grille smile",
  torso: "a robot TORSO only (no head, no limbs): a chunky body with a brass wind-up key on the back and a small chest plate",
  arms: "a single robot ARM only, hanging straight down: a shoulder joint at the top and a mitt hand at the bottom",
  legs: "a single robot LEG only, standing: a hip joint at the top and a big rounded foot at the bottom",
  weapon: "a small hand weapon only, grip at the left",
};
const TIER_WORDS = {
  1: "plain, a little dented, few rivets",
  2: "clean, a few brass rivets",
  3: "polished, more brass fittings, one small light",
  4: "premium, brass trim everywhere, one glowing gem",
};
const CHROMA = " The ENTIRE background must be one perfectly flat, solid, uniform bright magenta (#FF00FF) filling the whole frame, no gradient, no shadow on the background, no text, no logos, no letters.";
const STYLE = " Designer vinyl-clay toy finish, slightly glossy, crisp seams, lit from directly above with a warm key light and soft cool shadows, highlights centered and symmetric. Unpainted matte grey clay wherever the placeholder is grey (the game paints that area later), brass for bolts and fittings, matte black rubber where rubber is needed, glass for lamp eyes.";

function promptFor(p, masked) {
  const family = p.family ? ` It belongs to the ${p.family} family: ${p.motif || "share the family's shapes"}.` : "";
  if (masked) {
    return `Paint ONLY the editable region as a finished toy part in the style of the second attached image. Keep the region's exact outline; do not extend past it. The part is ${SLOT_WORDS[p.slot]}, tier ${p.tier}: ${TIER_WORDS[p.tier]}.${family}${STYLE}${CHROMA}`;
  }
  return `Repaint the FIRST attached image (a flat grey clay placeholder) as a finished toy part in the style of the SECOND attached image. Keep the EXACT silhouette, proportions, pose and position of the placeholder; do not move, resize, rotate or crop it; every edge of the new part must sit where the placeholder's edge is. The part is ${SLOT_WORDS[p.slot]}, tier ${p.tier}: ${TIER_WORDS[p.tier]}.${family}${STYLE}${CHROMA}`;
}

// The bake stores pair slots under the rig's singular folder (arms -> arm, legs -> leg);
// the manifest carries the resolved folder, with the slot name as the fallback.
function placeholderPath(p) { return path.join(ROOT, "public", "bots-art", "parts", p.folder || p.slot, `t${p.tier}-${p.design}.png`); }

async function withTimeout(promise, ms, label) {
  let t; const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label + " timed out")), ms); });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(t); }
}

/** Masked mode needs a base (placeholder over magenta) and a mask (transparent inside the part). Built in Node with pngjs. */
async function buildMaskedInputs(p) {
  const { PNG } = await import("pngjs");
  const src = PNG.sync.read(fs.readFileSync(placeholderPath(p)));
  const S = 1024; const scale = Math.min((0.8 * S) / src.width, (0.8 * S) / src.height);
  const w = Math.round(src.width * scale), h = Math.round(src.height * scale);
  const ox = Math.floor((S - w) / 2), oy = Math.floor((S - h) / 2);
  const base = new PNG({ width: S, height: S }); const mask = new PNG({ width: S, height: S });
  for (let i = 0; i < S * S; i++) { base.data.set([255, 0, 255, 255], i * 4); mask.data.set([0, 0, 0, 255], i * 4); }
  // nearest-neighbour resample of the placeholder into the base, and its alpha (dilated 6px) into the mask
  const inside = new Uint8Array(S * S);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(src.width - 1, Math.floor(x / scale)), sy = Math.min(src.height - 1, Math.floor(y / scale));
    const si = (sy * src.width + sx) * 4; const a = src.data[si + 3];
    if (a > 8) { const di = ((oy + y) * S + (ox + x)) * 4; base.data.set([src.data[si], src.data[si + 1], src.data[si + 2], 255], di); inside[(oy + y) * S + (ox + x)] = 1; }
  }
  const R = 6;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let hit = false;
    for (let dy = -R; dy <= R && !hit; dy++) for (let dx = -R; dx <= R; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < S && xx >= 0 && xx < S && inside[yy * S + xx]) { hit = true; break; } }
    if (hit) mask.data[(y * S + x) * 4 + 3] = 0; // transparent = editable
  }
  return { base: PNG.sync.write(base), mask: PNG.sync.write(mask) };
}

async function runJob(p, masked) {
  const out = path.join(RAW, `${p.id}.png`);
  if (fs.existsSync(out)) { console.log("skip (raw exists):", p.id); return "skipped"; }
  if (!fs.existsSync(placeholderPath(p))) { console.warn("no placeholder for", p.id); return "failed"; }
  const t0 = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const form = new FormData();
      form.append("model", MODEL); form.append("prompt", promptFor(p, masked));
      form.append("size", "1024x1024"); form.append("quality", p.quality || "medium"); form.append("n", "1");
      if (masked) {
        const { base, mask } = await buildMaskedInputs(p);
        form.append("image[]", new Blob([base], { type: "image/png" }), "base.png");
        form.append("image[]", new Blob([fs.readFileSync(ANCHOR)], { type: "image/png" }), "style.png");
        form.append("mask", new Blob([mask], { type: "image/png" }), "mask.png");
      } else {
        form.append("image[]", new Blob([fs.readFileSync(placeholderPath(p))], { type: "image/png" }), "placeholder.png");
        form.append("image[]", new Blob([fs.readFileSync(ANCHOR)], { type: "image/png" }), "style.png");
      }
      const res = await withTimeout(fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + KEY }, body: form }), 300_000, p.id);
      const text = await res.text();
      if (!res.ok) throw new Error("HTTP " + res.status + " " + text.slice(0, 200));
      const data = JSON.parse(text); const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error("no image in response");
      fs.writeFileSync(out, Buffer.from(b64, "base64"));
      console.log("ok:", p.id, Math.round((Date.now() - t0) / 1000) + "s", data.usage ? "out_tokens=" + data.usage.output_tokens : "");
      return "ok";
    } catch (e) {
      console.warn("attempt " + attempt + " failed:", p.id, String(e.message).slice(0, 160));
      if (attempt === 2) return "failed";
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!fs.existsSync(MANIFEST)) { console.error("manifest missing:", MANIFEST, "(run npx tsx scripts/bots-parts-manifest.ts)"); process.exit(1); }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  // Masked inpaint is the DEFAULT (probe 2026-09-03: silhouette overlap 0.979
  // and the aspect ratio held to the hundredth, versus 0.687 for free repaint
  // on the torso). Pass --repaint to let the model redraw the whole plate.
  const masked = !args.includes("--repaint");
  if (args.includes("--list")) {
    for (const p of manifest) console.log(p.id.padEnd(14), (p.family || "-").padEnd(10), (p.color || "-").padEnd(8), fs.existsSync(path.join(RAW, p.id + ".png")) ? "raw exists" : "");
    console.log(manifest.length + " parts; anchor", fs.existsSync(ANCHOR) ? "present" : "MISSING", "; mode", masked ? "masked" : "repaint");
    return;
  }
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const jobs = only ? manifest.filter((p) => p.id === only) : manifest;
  if (!jobs.length) { console.error("no such part:", only); process.exit(1); }
  const results = {}; const queue = [...jobs];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) { const p = queue.shift(); results[p.id] = await runJob(p, masked); } }));
  const counts = Object.values(results).reduce((a, r) => ((a[r] = (a[r] || 0) + 1), a), {});
  console.log("done:", JSON.stringify(counts));
  if (counts.failed) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
