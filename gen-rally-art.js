/**
 * One-off generator: Rover Rally sprites via gpt-image-2 on flat magenta, saved to
 * public/stars-art/_raw/. Then run `node key-stars-art.js` to chroma-key them
 * transparent into public/stars-art/. Local utility (NOT part of the Next build).
 * Reads OPENAI_API_KEY from .env.local. Fires all prompts in PARALLEL (each render
 * ~220-230s on gpt-image-2, so wall-clock ~= one render, not the sum).
 *
 *   node gen-rally-art.js              # all
 *   node gen-rally-art.js rover ramp   # subset (basenames)
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
  "Render the subject CENTERED on a completely solid flat magenta background of pure #FF00FF (255,0,255), " +
  "filling the entire frame edge to edge, with NO other background, NO scenery, NO ground, NO cast shadow, " +
  "NO vignette — just the subject floating on flat magenta, for chroma-keying.";
const TOPDOWN =
  "Strict orthographic TOP-DOWN view: the camera is directly overhead looking straight down, no perspective, no horizon, no tilt.";

const PROMPTS = {
  rover:
    `A single futuristic all-terrain RACING ROVER / dune buggy for an alien-world rally game — a cross between a ` +
    `Mars rover and an off-road dune buggy: an open exposed tubular roll-cage chassis, four chunky deep-tread ` +
    `off-road tires, a small cockpit, heavy-duty suspension, a roof light bar and antennae. Brushed gunmetal and ` +
    `steel bodywork with subtle warm-gold trim accents (kept neutral so it can be tinted a team color later). ` +
    `Clean, bold, premium mobile-game art, slightly stylized, crisp readable silhouette. ${TOPDOWN} The rover ` +
    `points toward the TOP of the image (nose up). ${MAGENTA}`,
  ramp:
    `A single off-road JUMP RAMP / launch ramp for a top-down racing game: a sturdy wedge ramp with a textured ` +
    `metal-grate and packed-dirt surface and bright hazard chevron arrows running up its face. Industrial sci-fi, ` +
    `gunmetal with hazard-yellow chevrons. ${TOPDOWN} The ramp launches toward the TOP of the image. ${MAGENTA}`,
  boulder:
    `A single large alien BOULDER / rock obstacle for a top-down racing game: a chunky rugged rock with cracked ` +
    `facets and faint glowing amber mineral veins, rough weathered grey stone. Bold readable shape, premium ` +
    `mobile-game art, slightly stylized. ${TOPDOWN} ${MAGENTA}`,
  crystal:
    `A small CLUSTER of alien CRYSTALS for a top-down racing-game obstacle: a group of sharp angular gemstone ` +
    `shards jutting up from a small rocky base, glowing softly from within. Translucent teal and violet crystal. ` +
    `Bold, premium, slightly stylized. ${TOPDOWN} ${MAGENTA}`,
  boostpad:
    `A single BOOST PAD / speed-strip for a top-down racing game: a dark tech panel set into the ground with a ` +
    `row of bright forward-pointing chevron arrows lit up with energy. Dark panel, brilliant glowing gold-and-cyan ` +
    `arrows pointing toward the TOP of the image. ${TOPDOWN} ${MAGENTA}`,
  ship:
    `A single sleek TOP-DOWN RACING STARSHIP / space fighter for an asteroid-field racing game: a compact agile ` +
    `racer with swept delta wings, twin glowing cyan engine thrusters at the rear, a bubble cockpit canopy near ` +
    `the nose, gunmetal-and-white hull with cyan energy accents (neutral enough to tint a team color later). Clean, ` +
    `bold, premium mobile-game art, crisp readable silhouette. ${TOPDOWN} The ship points toward the TOP of the ` +
    `image (nose up). ${MAGENTA}`,
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
    if (!resp.ok) {
      console.error(`x ${name}: HTTP ${resp.status} ${(await resp.text().catch(() => "")).slice(0, 200)}`);
      return false;
    }
    const j = await resp.json();
    const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) {
      console.error(`x ${name}: response missing b64_json`);
      return false;
    }
    fs.writeFileSync(path.join(RAW, `${name}.png`), Buffer.from(b64, "base64"));
    console.log(`ok ${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
    return true;
  } catch (e) {
    clearTimeout(timer);
    console.error(`x ${name}: ${e.message}`);
    return false;
  }
}

(async () => {
  if (!fs.existsSync(RAW)) fs.mkdirSync(RAW, { recursive: true });
  const key = apiKey();
  const want = process.argv.slice(2).filter((a) => PROMPTS[a]);
  const names = want.length ? want : Object.keys(PROMPTS);
  console.log(`generating ${names.length}: ${names.join(", ")} (gpt-image-2, ~230s each, in parallel)`);
  const res = await Promise.all(names.map((n) => gen(n, key)));
  console.log(`done: ${res.filter(Boolean).length}/${names.length} ok. Next: node key-stars-art.js`);
})();
