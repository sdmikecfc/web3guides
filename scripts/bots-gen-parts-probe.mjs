/**
 * Battle Bots: PROBE whether gpt-image-2 can repaint a grey-clay part
 * placeholder into the picked style while keeping its silhouette and socket
 * points. If it can, the 40-part wave costs a few dollars here instead of
 * 120 Higgsfield credits. Two inputs ride the edits endpoint: the placeholder
 * (structure) and art-src/bots/anchors/B1.png (style). Output on a flat
 * magenta plate, keyed by scripts/bots-key-magenta.mjs afterwards.
 *
 *   node scripts/bots-gen-parts-probe.mjs head 2 1      # slot tier design
 *   node scripts/bots-gen-parts-probe.mjs torso 2 1
 *
 * Reads  public/bots-art/parts/<slot>/t<tier>-<design>.png   (the bake)
 * Writes public/bots-art/_raw/parts/<slot>-t<tier>-<design>.png (raw plate)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const KEY = (ENV.match(/^OPENAI_API_KEY=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (!KEY) { console.error("OPENAI_API_KEY missing"); process.exit(1); }

const [slot, tier, design] = process.argv.slice(2);
if (!slot || !tier || !design) { console.error("usage: node scripts/bots-gen-parts-probe.mjs <slot> <tier> <design>"); process.exit(1); }
const placeholder = path.join(ROOT, "public", "bots-art", "parts", slot, `t${tier}-${design}.png`);
const anchor = path.join(ROOT, "art-src", "bots", "anchors", "B1.png");
for (const f of [placeholder, anchor]) if (!fs.existsSync(f)) { console.error("missing", f); process.exit(1); }
const RAW = path.join(ROOT, "public", "bots-art", "_raw", "parts");
fs.mkdirSync(RAW, { recursive: true });
const out = path.join(RAW, `${slot}-t${tier}-${design}.png`);

const SLOT_WORDS = {
  head: "a robot HEAD only (no body): the round head with two big round lamp eyes and a friendly grille smile",
  torso: "a robot TORSO only (no head, no limbs): the chunky body with a brass wind-up key on the back and a small chest plate",
  arms: "a single robot ARM only, hanging straight down: shoulder joint at the top, a mitt hand at the bottom",
  legs: "a single robot LEG only, standing: hip joint at the top, a big rounded foot at the bottom",
  weapon: "a small hand weapon only (a hammer, wrench, spring claw or bolt thrower), grip at the left",
};
const TIER_WORDS = { 1: "plain, a little dented, few rivets", 2: "clean, a few brass rivets", 3: "polished, more brass fittings, a small light", 4: "premium, brass trim everywhere, a glowing gem" };

const prompt =
  `Repaint the FIRST attached image (a flat grey clay placeholder) as a finished toy part in the style of the SECOND attached image. Keep the EXACT silhouette, proportions, pose, and position of the placeholder; do not move, resize, rotate or crop it; every edge of the new part must sit where the placeholder's edge is. The part is ${SLOT_WORDS[slot]}, tier ${tier}: ${TIER_WORDS[tier]}. Surfaces: unpainted matte grey clay where the placeholder is grey (this area will be painted by the game later), brass for bolts and fittings, matte black rubber where rubber is needed, glass for lamp eyes. Designer vinyl-clay toy finish, slightly glossy, crisp seams, lit from directly above with a warm key light and soft cool shadows, highlights centered and symmetric. The ENTIRE background must be one perfectly flat, solid, uniform bright magenta (#FF00FF) filling the whole frame, no gradient, no shadow on the background, no text, no logos.`;

const form = new FormData();
form.append("model", "gpt-image-2");
form.append("prompt", prompt);
form.append("size", "1024x1024");
form.append("quality", "medium");
form.append("n", "1");
form.append("image[]", new Blob([fs.readFileSync(placeholder)], { type: "image/png" }), "placeholder.png");
form.append("image[]", new Blob([fs.readFileSync(anchor)], { type: "image/png" }), "style.png");
const t0 = Date.now();
const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + KEY }, body: form });
const text = await res.text();
if (!res.ok) { console.error("HTTP", res.status, text.slice(0, 300)); process.exit(1); }
const data = JSON.parse(text);
fs.writeFileSync(out, Buffer.from(data.data[0].b64_json, "base64"));
console.log("ok:", path.relative(ROOT, out), Math.round((Date.now() - t0) / 1000) + "s", data.usage ? JSON.stringify(data.usage.output_tokens_details || data.usage) : "");
