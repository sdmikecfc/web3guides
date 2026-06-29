/**
 * One-off generator: premium TOP-DOWN sprites for Rover Rally features (ramp + hazards),
 * gpt-image-2 on flat magenta -> public/stars-art/_raw/. Then `node key-stars-art.js <name>`.
 * These replace the "shitty" procedural ramp/pit. Reads OPENAI_API_KEY from .env.local.
 *   node gen-rally-feats.js
 */
const fs = require("fs");
const path = require("path");
const RAW = path.resolve(__dirname, "public", "stars-art", "_raw");
function apiKey() {
  const env = fs.readFileSync(path.resolve(__dirname, ".env.local"), "utf8");
  const m = env.match(/^OPENAI_API_KEY\s*=\s*(.*)$/m);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}
const MAGENTA =
  "Render the subject CENTERED and LARGE on a completely solid flat magenta background of pure #FF00FF (255,0,255), " +
  "filling most of the frame edge to edge, with NO other background, NO scenery, NO cast shadow, NO vignette — just the " +
  "subject on flat magenta, for chroma-keying.";
const TOPDOWN = "Strict orthographic TOP-DOWN view, camera directly overhead looking straight down, no perspective, no horizon, no tilt.";
const PROMPTS = {
  "rally-ramp":
    `A single wide TOP-DOWN launch RAMP / stunt kicker for a top-down arcade racer: a chunky metal ramp that RISES toward ` +
    `the TOP of the frame, with a bright raised takeoff LIP along the top edge catching light, bold black-and-yellow hazard ` +
    `chevron arrows pointing up, riveted metal side guard-rails, gentle shading from a dark base to a bright top so it clearly ` +
    `reads as a ramp you kick off. Premium, crisp, bold. ${TOPDOWN} ${MAGENTA}`,
  "rally-pit":
    `A single TOP-DOWN bottomless PIT / deep rocky CHASM for a top-down arcade racer, seen from directly above: a wide dark ` +
    `chasm with a sunlit rocky rim on the upper-left, steep shadowed walls plunging into pure black depth, scattered rubble ` +
    `and cracks around the edge. Strong sense of DEPTH, dramatic, dangerous. Reads instantly as 'a hole you must jump over'. ` +
    `Premium, crisp. ${TOPDOWN} ${MAGENTA}`,
  "rally-lava":
    `A single TOP-DOWN molten LAVA pool for a top-down arcade racer, seen from directly above: glowing molten orange-yellow ` +
    `magma with dark cracked black basalt crust islands, bright hot glowing cracks, a few bubbles, a fiery emissive glow. ` +
    `Reads instantly as 'dangerous lava you must jump over'. Premium, crisp, vivid. ${TOPDOWN} ${MAGENTA}`,
};
async function gen(name, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 300000);
  const t0 = Date.now();
  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-2", prompt: PROMPTS[name], size: "1024x1024", quality: "high", n: 1 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) { console.error(`x ${name}: HTTP ${resp.status} ${(await resp.text().catch(() => "")).slice(0, 200)}`); return false; }
    const j = await resp.json();
    const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) { console.error(`x ${name}: no b64`); return false; }
    fs.writeFileSync(path.join(RAW, `${name}.png`), Buffer.from(b64, "base64"));
    console.log(`ok ${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
    return true;
  } catch (e) { clearTimeout(timer); console.error(`x ${name}: ${e.message}`); return false; }
}
(async () => {
  if (!fs.existsSync(RAW)) fs.mkdirSync(RAW, { recursive: true });
  const key = apiKey();
  const names = Object.keys(PROMPTS);
  console.log(`generating ${names.length}: ${names.join(", ")} (gpt-image-2, ~230s each, parallel)`);
  const res = await Promise.all(names.map((n) => gen(n, key)));
  console.log(`done: ${res.filter(Boolean).length}/${names.length} ok. Next: node key-stars-art.js ${names.join(" ")}`);
})();
