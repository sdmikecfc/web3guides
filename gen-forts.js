#!/usr/bin/env node
/**
 * FORT SPRITES — regenerate the strongholds in the world's painted language.
 *
 * WHY. The existing forts were rendered under the previous art direction:
 * pale, cold, softly shaded. Against the new plate - thick ink outlines, flat
 * saturated colour, warm 10 o'clock sun - they read as pasted on. Placement is
 * no longer what holds the board back; this is.
 *
 * The style block is deliberately near-identical to gen-world-map.js. A sprite
 * and the ground it stands on have to be painted by the same hand, and the
 * cheapest way to guarantee that is to send the same words.
 *
 *   node gen-forts.js              # all three archetypes
 *   node gen-forts.js keep         # one
 *
 * Writes public/s5-art/world/_raw/forts/<name>.png. Damage states are derived
 * from these afterwards as identity-preserving edits, so a wall always falls
 * apart into ITSELF rather than into a different building.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "public", "s5-art", "world", "_raw", "forts");

function apiKey() {
  const txt = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = txt.match(/OPENAI_API_KEY\s*=\s*(.+)/);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  // Strip quotes - the value is quoted and OpenAI rejects them as a bad key.
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const LOOK = `
STYLE, THE MOST IMPORTANT INSTRUCTION: a BOLD GRAPHIC HAND-ILLUSTRATED
adventure-game building. Every shape drawn with a CONFIDENT THICK INK OUTLINE
of varying weight, filled with FLAT BLOCKS OF VIVID COLOUR, then textured with
visible dry brush and paper grain. Chunky simplified silhouette. Deliberately
WONKY HAND-DRAWN GEOMETRY - no perfectly straight lines, everything leans and
wobbles with charm. Layered CUT-PAPER COLLAGE feel. Warm saturated storybook
palette: sun-bleached bone and sandstone walls, rust orange, deep teal shadow,
weathered timber brown. Rich colour in the shadows, never grey, never muddy.

NOT photorealistic. NOT a 3D render. NOT CGI. NOT soft airbrushed digital
painting. NOT pale or washed out. If it has no visible ink outlines, it is
WRONG.

CAMERA: a LOW OBLIQUE three-quarter view, about 35 DEGREES above the ground
plane. You see the FRONT FACES of the walls and the SIDE of the towers. The
building has real HEIGHT and stands up off the ground.

LIGHT: bright sun from the UPPER LEFT at ten o'clock. Lit faces warm and pale,
shadowed faces deep teal, one simple graphic shadow falling down and to the
right.

WAR-WORN but INTACT and PROUD: rust streaks, patched timber, a few sandbags at
the base, scorch marks, a coil of barbed wire, a torn banner on a leaning pole.
Weathered and characterful, never ruined - this one is still standing.

COMPOSITION: ONE SINGLE BUILDING, centred, complete, seen whole. PLAIN FLAT
WHITE BACKGROUND, nothing behind it, no landscape, no ground plane, no
horizon, no other buildings. No text, letters, numbers, logos, icons, UI,
border or frame.
`;

// gpt-image-2 REJECTS background:"transparent" outright (HTTP 400). The prompt
// asks for a plain flat white field instead and key-nano.py cuts it, which is
// the same route every other sprite in this season already took.
const PROMPTS = {
  keep: `A single squat blocky fortified KEEP: a heavy rectangular stone
blockhouse with thick battered walls, a flat crenellated roof, narrow slit
windows, an iron-banded timber door, and one stubby corner turret.
${LOOK}`,
  bastion: `A single low angular STAR BASTION: a wide squat earthwork fort with
sharply angled arrowhead walls, a sloped earth rampart, a gun embrasure on the
front face, and a low timber watch platform on top. Wide and flat rather than
tall.
${LOOK}`,
  tower: `A single tall round WATCHTOWER: a narrow cylindrical stone tower with
a wide overhanging crenellated top, a conical tiled cap, a spiral outer stair
hugging the shaft, and a small walled yard at its foot. Clearly TALL and
slender.
${LOOK}`,
};

async function one(name, key) {
  const t0 = Date.now();
  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: PROMPTS[name],
        size: "1024x1024",
        quality: "high",
        n: 1,
      }),
    });
    if (!resp.ok) {
      console.error(`x ${name}: HTTP ${resp.status} ${(await resp.text().catch(() => "")).slice(0, 240)}`);
      return false;
    }
    const j = await resp.json();
    const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) return console.error(`x ${name}: no b64_json`), false;
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(b64, "base64"));
    console.log(`ok ${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
    return true;
  } catch (e) {
    console.error(`x ${name}: ${e && e.message}`);
    return false;
  }
}

// Guard is mandatory: a bare require() of this file would fire a billable batch.
if (require.main === module) {
  const named = process.argv.slice(2).filter((a) => PROMPTS[a]);
  const todo = named.length ? named : Object.keys(PROMPTS);
  const key = apiKey();
  console.log(`gpt-image-2, ${todo.length} fort(s): ${todo.join(", ")}`);
  Promise.all(todo.map((n) => one(n, key))).then((r) =>
    console.log(`${r.filter(Boolean).length}/${todo.length} -> ${OUT}`));
}
