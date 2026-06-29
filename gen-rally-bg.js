/**
 * One-off generator: full-scene TOP-DOWN terrain backgrounds for Rover Rally, one
 * per world. These are OPAQUE backdrops (no magenta key) drawn under the track and
 * panned over by the camera, so each map reads as a real place instead of a solid
 * color. Saved straight to public/stars-art/bg-rally-<world>.png (no keying step).
 * Reads OPENAI_API_KEY from .env.local. Parallel (gpt-image-2, ~230s each).
 *
 *   node gen-rally-bg.js              # all 4
 *   node gen-rally-bg.js magma cryo   # subset
 */
const fs = require("fs");
const path = require("path");
const OUT = path.resolve(__dirname, "public", "stars-art");

function apiKey() {
  const env = fs.readFileSync(path.resolve(__dirname, ".env.local"), "utf8");
  const m = env.match(/^OPENAI_API_KEY\s*=\s*(.*)$/m);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const TOPDOWN =
  "Strict orthographic TOP-DOWN aerial view, camera straight overhead, no horizon, no perspective, no tilt. " +
  "Fill the entire square frame edge to edge with terrain. NO vehicles, NO road, NO track, NO path, NO text, NO UI, NO characters. " +
  "Tileable-feeling, evenly detailed across the whole frame. Keep it MUTED and fairly DARK so bright game objects pop on top of it. Premium mobile-game art, crisp, high detail.";

const PROMPTS = {
  magma:
    `A volcanic wasteland seen from directly above: cracked charcoal-black basalt and dark volcanic rock veined with glowing molten ` +
    `orange-and-red lava rivers and fissures, scattered smoking vents, ember sparks, scorched ash. Moody, dangerous, dark. ${TOPDOWN}`,
  luna:
    `A grey lunar surface seen from directly above: cratered moon regolith with impact craters of many sizes, scattered rocks and ` +
    `boulders, fine dusty grey-tan dust with soft shadows in the crater rims. Desolate, realistic moon ground. NO Earth, NO planet, NO sky. ${TOPDOWN}`,
  cryo:
    `A frozen glacial icefield seen from directly above: cracked blue-white ice sheets, packed snow drifts, frosted crevasses and ` +
    `pressure ridges, scattered ice chunks, a faint cold aurora sheen on the ice. Cold, crystalline, wintry. ${TOPDOWN}`,
  asteroid:
    `Deep space seen as a flat field: a dense starfield over a soft purple-and-teal nebula with drifting cosmic dust and a few small ` +
    `distant dark asteroids. Dark, atmospheric sci-fi. NO large planet, NO sun, NO horizon. ${TOPDOWN}`,
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
    fs.writeFileSync(path.join(OUT, `bg-rally-${name}.png`), Buffer.from(b64, "base64"));
    console.log(`ok bg-rally-${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
    return true;
  } catch (e) { clearTimeout(timer); console.error(`x ${name}: ${e.message}`); return false; }
}

(async () => {
  const key = apiKey();
  const want = process.argv.slice(2).filter((a) => PROMPTS[a]);
  const names = want.length ? want : Object.keys(PROMPTS);
  console.log(`generating ${names.length} backgrounds: ${names.join(", ")} (gpt-image-2, ~230s each, parallel)`);
  const res = await Promise.all(names.map((n) => gen(n, key)));
  console.log(`done: ${res.filter(Boolean).length}/${names.length} ok -> public/stars-art/bg-rally-*.png`);
})();
