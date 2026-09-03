/**
 * Battle Bots: generate garage/shop PROPS, house-bot HEADS, CREW figure stills
 * and the CROWD sheet with gpt-image-2, on a flat magenta chroma plate, then
 * key them locally (key-magenta.js). Standalone, like gen-seas-ships.js in
 * doma-reporter: it does not touch lib/openai-image.js because that helper
 * only calls the generations endpoint, and the figures and heads here need
 * the EDITS endpoint so the picked style anchor (art-src/bots/anchors/B1.png)
 * rides along as a reference image. Parts are NOT made here: they go through
 * the Higgsfield img2img pipeline against the grey-clay placeholders.
 *
 *   node scripts/bots-gen-props.mjs --list              # print the job table, spend nothing
 *   node scripts/bots-gen-props.mjs --only lift-raised  # one job (the smoke test)
 *   node scripts/bots-gen-props.mjs                     # every job that has no raw yet, 3 at a time
 *
 * Raws land in public/bots-art/_raw/props/<id>.png (kept so keying can be
 * re-tuned without paying again). Key with:
 *   node key-magenta.js public/bots-art/_raw/props public/bots-art/props
 *
 * gpt-image-2 is slow (about 220 to 230 s per image, see lib/openai-image.js
 * in doma-reporter), so the timeout is 300 s and jobs run three at a time.
 * The model has no real alpha output, hence the magenta plate (the seas
 * lesson: #FF00FF collides with none of our colours; the B register is mint,
 * coral, butter, sky, lilac, cream, brass, rubber black).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const KEY = (ENV.match(/^OPENAI_API_KEY=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (!KEY) { console.error("OPENAI_API_KEY missing from .env.local"); process.exit(1); }

const MODEL = "gpt-image-2"; // WITH the hyphen; the no-hyphen alias 404s (doma-reporter lib note)
const ANCHOR = path.join(ROOT, "art-src", "bots", "anchors", "B1.png");
const RAW_DIR = path.join(ROOT, "public", "bots-art", "_raw", "props");
fs.mkdirSync(RAW_DIR, { recursive: true });

const CHROMA =
  " The ENTIRE background behind the subject must be one perfectly flat, solid, uniform bright magenta color (hex #FF00FF), filling the whole frame edge to edge, with absolutely no gradient, texture, scenery, ground, shadow, glow or any other color in the background. A clean chroma-key plate. No transparency checkerboard. No text, no logos, no letters, no digits.";
const B =
  " Designer vinyl-clay toy finish: slightly glossy clay, candy colors (mint, coral, butter yellow, sky blue, lilac, cream), crisp clean seams, brass as the only metal accent, matte black rubber where rubber is needed. Lit from directly above with a warm studio key light and soft cool shadows, highlights centered and symmetric. Cute, rounded, chunky, easy to read at small sizes.";
const FIG =
  " The same robot toy family as the reference image: round head, two big round lamp eyes, a friendly grille smile, a brass wind-up key, stubby limbs, big feet, 2.5 heads tall.";

/** kind: prop (generations) | figure (edits with the anchor) | head (edits) | crowd (edits) */
const JOBS = [
  // Garage set pieces (screens design doc 6.3)
  { id: "lift-down", kind: "prop", size: "1536x1024", quality: "medium", prompt: "A small toy garage scissor lift, folded flat and lowered, red painted platform on grey steel crossed scissor arms with four small black rubber wheels, seen straight from the side at eye level, centered, whole object visible." },
  { id: "lift-raised", kind: "prop", size: "1536x1024", quality: "medium", prompt: "A small toy garage scissor lift, fully raised, red painted platform on grey steel crossed scissor arms extended tall, four small black rubber wheels, seen straight from the side at eye level, centered, whole object visible." },
  { id: "tool-board", kind: "prop", size: "1024x1024", quality: "medium", prompt: "A toy pegboard tool board, a cream board with a grid of small holes, hung with tiny clay tools: wrenches, a hammer, pliers, a screwdriver, a small oil can, seen straight on, centered, whole board visible." },
  { id: "corkboard", kind: "prop", size: "1024x1024", quality: "medium", prompt: "A toy corkboard in a thin wooden frame with a blank folded newspaper pinned to it by two round red pushpins and one blank cream note card, seen straight on, centered, whole board visible." },
  { id: "workbench", kind: "prop", size: "1536x1024", quality: "medium", prompt: "A small toy wooden workbench with a thick top and two drawers, a tiny clay vise on one end and a small brass lamp on the other, seen straight from the side at eye level, centered, whole bench visible." },
  { id: "stand", kind: "prop", size: "1024x1024", quality: "medium", prompt: "A small toy robot display stand: a round grey steel base plate with four tiny black rubber wheels and a short vertical post with a padded cream cradle on top, empty, seen straight from the side at eye level, centered, whole object visible." },
  { id: "toolbox", kind: "prop", size: "1024x1024", quality: "medium", prompt: "A small toy red steel toolbox with a brass latch and a black rubber handle, closed, seen from a three quarter front angle, centered, whole object visible." },
  { id: "ceiling-fan", kind: "prop", size: "1024x1024", quality: "medium", prompt: "A small toy ceiling fan with four cream blades and a brass hub, seen from directly below, centered, whole fan visible." },
  { id: "shop-shelf", kind: "prop", size: "1536x1024", quality: "medium", prompt: "An empty small toy wooden shop shelf unit with four shelves and a cream backboard, seen straight on, centered, whole shelf visible, nothing on the shelves." },
  { id: "shop-crate", kind: "prop", size: "1024x1024", quality: "medium", prompt: "A small toy wooden shipping crate with a slightly open lid and straw peeking out, a blank cream label on the front, seen from a three quarter front angle, centered, whole crate visible." },
  // House-bot signature heads (engine design doc section 4): bodies reuse launch parts
  { id: "head-scrapper", kind: "head", size: "1024x1024", quality: "high", prompt: "Only the HEAD of a small robot toy, no body: a dented tin-can shaped head in dull grey clay with one big lamp eye and one small lamp eye, a lopsided grille smile, a bent antenna, a few brass rivets. Easy-tier house bot named Scrapper, scruffy but lovable. Seen straight on, centered, whole head visible." },
  { id: "head-foreman", kind: "head", size: "1024x1024", quality: "high", prompt: "Only the HEAD of a small robot toy, no body: a square butter-yellow hard-hat shaped head with two even round lamp eyes, a straight confident grille smile, a small brass badge on the brow. Medium-tier house bot named Foreman, steady and stern. Seen straight on, centered, whole head visible." },
  { id: "head-bigrig", kind: "head", size: "1024x1024", quality: "high", prompt: "Only the HEAD of a small robot toy, no body: a wide heavy sky-blue truck-cab shaped head with two big round lamp eyes under a brass brow bar, a wide grille smile with a small brass grille, two short chrome exhaust stacks. Hard-tier house bot named Big Rig, big and cheerful. Seen straight on, centered, whole head visible." },
  // Crew figures (one still each; motion is transforms in the renderer)
  { id: "crew-hammer", kind: "figure", size: "1024x1024", quality: "high", prompt: "A tiny clay mechanic figure (a small round person in mint overalls with a cream cap, not a robot) standing and holding a small brass piston hammer with both hands, ready to strike a plate on the floor. This figure works for the Buy Low Sell High crew. Seen from the side, centered, whole figure visible, feet flat on the ground." },
  { id: "crew-flywheel", kind: "figure", size: "1024x1024", quality: "high", prompt: "A tiny clay mechanic figure (a small round person in coral overalls with a cream cap, not a robot) hugging a large brass flywheel that is taller than its chest, leaning into it. This figure works for the Build a Position crew. Seen from the side, centered, whole figure visible, feet flat on the ground." },
  { id: "crew-tripwire", kind: "figure", size: "1024x1024", quality: "high", prompt: "A tiny clay mechanic figure (a small round person in butter-yellow overalls with a cream cap, not a robot) crouched low and perfectly still, staring at a thin brass wire stretched across the floor in front of it. This figure works for the limit order crew. Seen from the side, centered, whole figure visible, feet flat on the ground." },
  { id: "crew-wrencher", kind: "figure", size: "1024x1024", quality: "high", prompt: "A tiny clay mechanic figure (a small round person in sky-blue overalls with a cream cap, not a robot) kneeling on one knee with a big brass wrench raised in both hands, mid-turn. This is the garage wrencher. Seen from the side, centered, whole figure visible, knee and foot flat on the ground." },
  // Crowd looks (one sheet, six figures in a row)
  { id: "crowd-sheet", kind: "crowd", size: "1536x1024", quality: "medium", prompt: "Six tiny clay spectator figures standing in a single evenly spaced row, each a small round person in a different candy-colored outfit (mint, coral, butter, sky blue, lilac, cream), some with a cap or a scarf, all with both arms raised in a cheer, all the same height, seen straight on, whole figures visible, feet on the same ground line, clear gaps between them." },
];

function fullPrompt(j) {
  const base = j.kind === "prop" ? j.prompt + B + CHROMA : j.prompt + FIG + B + CHROMA;
  return base;
}

async function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label + " timed out after " + ms + "ms")), ms); });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(t); }
}

async function callGenerations(j) {
  const res = await withTimeout(fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt: fullPrompt(j), size: j.size, quality: j.quality, n: 1 }),
  }), 300_000, j.id);
  return res;
}

async function callEdits(j) {
  // The edits endpoint takes the anchor as an image input so the figures and
  // heads inherit the picked style. Multipart per the OpenAI images API.
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", "Use the attached image ONLY as the style and character-family reference. Draw a NEW subject: " + fullPrompt(j));
  form.append("size", j.size);
  form.append("quality", j.quality);
  form.append("n", "1");
  const bytes = fs.readFileSync(ANCHOR);
  form.append("image[]", new Blob([bytes], { type: "image/png" }), "B1.png");
  const res = await withTimeout(fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: "Bearer " + KEY },
    body: form,
  }), 300_000, j.id);
  return res;
}

async function runJob(j) {
  const out = path.join(RAW_DIR, j.id + ".png");
  if (fs.existsSync(out)) { console.log("skip (raw exists):", j.id); return "skipped"; }
  const t0 = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = j.kind === "prop" ? await callGenerations(j) : await callEdits(j);
      const text = await res.text();
      if (!res.ok) throw new Error("HTTP " + res.status + " " + text.slice(0, 300));
      const data = JSON.parse(text);
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error("no b64_json in response: " + text.slice(0, 200));
      fs.writeFileSync(out, Buffer.from(b64, "base64"));
      const usage = data.usage ? " usage=" + JSON.stringify(data.usage) : "";
      console.log("ok:", j.id, Math.round((Date.now() - t0) / 1000) + "s", (fs.statSync(out).size / 1024 | 0) + "KB" + usage);
      return "ok";
    } catch (e) {
      console.warn("attempt " + attempt + " failed:", j.id, String(e.message).slice(0, 200));
      if (attempt === 2) return "failed";
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    for (const j of JOBS) console.log(j.id.padEnd(16), j.kind.padEnd(7), j.size.padEnd(10), j.quality.padEnd(7), fs.existsSync(path.join(RAW_DIR, j.id + ".png")) ? "raw exists" : "");
    console.log(JOBS.length + " jobs; anchor:", ANCHOR, fs.existsSync(ANCHOR) ? "(present)" : "(MISSING)");
    return;
  }
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const jobs = only ? JOBS.filter((j) => j.id === only) : JOBS;
  if (!jobs.length) { console.error("no such job:", only); process.exit(1); }
  const results = {};
  const queue = [...jobs];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) { const j = queue.shift(); results[j.id] = await runJob(j); }
  });
  await Promise.all(workers);
  const counts = Object.values(results).reduce((a, r) => ((a[r] = (a[r] || 0) + 1), a), {});
  console.log("done:", JSON.stringify(counts));
  if (counts.failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
