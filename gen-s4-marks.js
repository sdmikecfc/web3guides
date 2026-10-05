/**
 * One-off generator: S4 Hit List CONTRACT MARK portraits (wave 2) via gpt-image-2,
 * saved to public/s4-art/map/_raw/ at 1024, then downscale to 512 to match
 * mark-1..5 (use doma-reporter's sharp: see the resize one-liner in the session
 * notes, or any 1024->512 step). Local utility (NOT part of the Next build).
 * Reads OPENAI_API_KEY from .env.local. Fires all prompts in PARALLEL (each
 * render ~220-230s on gpt-image-2, wall-clock ~= one render).
 *
 *   node gen-s4-marks.js                 # all five
 *   node gen-s4-marks.js mark-9          # subset (basenames)
 *
 * STYLE CONTRACT (matches mark-1..5): premium modern anime, ONE character
 * personifying the domain, waist-up, looking at the viewer, night-time bokeh
 * backdrop, soft cinematic light, elegant, fully clothed, modest, no text.
 */
const fs = require("fs");
const path = require("path");

const RAW = path.resolve(__dirname, "public", "s4-art", "map", "_raw");

function apiKey() {
  const env = fs.readFileSync(path.resolve(__dirname, ".env.local"), "utf8");
  const m = env.match(/^OPENAI_API_KEY\s*=\s*(.*)$/m);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const STYLE =
  "Premium modern anime illustration, a SINGLE character portrait from the waist up, looking directly at the " +
  "viewer, night-time city bokeh lights softly blurred behind them, soft cinematic key light, rich clean colors, " +
  "crisp linework, high detail. Elegant and fully clothed, modest styling, all-ages. NO text, NO logos, NO " +
  "watermarks, NO frames. Square composition with the head in the upper third.";

const PROMPTS = {
  // sort_order 6 — Bballz.com
  "mark-6":
    `An effortlessly confident young streetball star: athletic build, a varsity jacket open over a sleeveless ` +
    `basketball jersey, a basketball held casually under one arm, a thin gold chain, fresh fade haircut, playful ` +
    `competitive grin. Behind him: a chain-link night court glowing under floodlights. ${STYLE}`,
  // sort_order 7 — DubaiBanx.com
  "mark-7":
    `A suave international private banker: an immaculate cream suit with a silk pocket square and subtle gold ` +
    `accents, a heavy gold watch, dark slicked hair, a calm knowing quiet-money smile. Behind him: a glittering ` +
    `futuristic marina skyline of gold-lit towers at night. ${STYLE}`,
  // sort_order 8 — kissme.ai
  "mark-8":
    `An elegant AI pop idol woman: sleek futuristic evening wear with a high neckline, glossy signature lipstick, ` +
    `small holographic heart-shaped earrings, long flowing hair with a soft pink sheen, a warm charismatic smile. ` +
    `Behind her: soft neon-pink and violet night bokeh like a concert skyline. ${STYLE}`,
  // sort_order 9 — chainify.ai (the biggest job on the board: boss energy)
  "mark-9":
    `An imposing young tech magnate: a long black tailored coat over dark clothing, layered silver chain ` +
    `jewelry, faint glowing circuit-line accents on the coat, sharp eyes, composed and quietly dangerous ` +
    `expression. Behind him: deep blue server-room lights and city night bokeh. ${STYLE}`,
  // sort_order 10 — Earmarkings.com
  "mark-10":
    `A sharp, sly government fixer-accountant: round spectacles catching the light, a pinstripe vest with rolled ` +
    `sleeves, a leather ledger tucked under one arm and a fountain pen in hand, a knowing half-smile. Behind ` +
    `them: warm lamplit office windows blurred into night bokeh. ${STYLE}`,
};

async function genOne(name, prompt, key) {
  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-2", prompt, size: "1024x1024", n: 1 }),
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const b64 = json.data && json.data[0] && json.data[0].b64_json;
  if (!b64) throw new Error(`${name}: no image in response`);
  fs.writeFileSync(path.join(RAW, `${name}.png`), Buffer.from(b64, "base64"));
  console.log(`${name} done in ${Math.round((Date.now() - t0) / 1000)}s`);
}

(async () => {
  fs.mkdirSync(RAW, { recursive: true });
  const key = apiKey();
  const pick = process.argv.slice(2);
  const names = Object.keys(PROMPTS).filter((n) => !pick.length || pick.includes(n));
  console.log(`generating ${names.length} mark(s) in parallel on gpt-image-2 (~4 min)...`);
  const results = await Promise.allSettled(names.map((n) => genOne(n, PROMPTS[n], key)));
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === "rejected") { failed++; console.error(`FAILED ${names[i]}: ${r.reason.message}`); }
  });
  console.log(failed ? `${failed} failed — re-run with just those basenames` : "all done -> " + RAW);
})();
