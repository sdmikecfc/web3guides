#!/usr/bin/env node
/**
 * S6 WORLD MAP GENERATOR - gpt-image-2 (THE GRID, "the beautiful season").
 *
 * v2 AFTER MIKE'S REJECTION of the first pair: "the icons should not be in
 * a grid. That's ridiculous and ugly af." The rows-of-plots layout is dead;
 * plots are now ORGANIC build-sites the terrain makes room for, in the
 * battle-tested S5 anti-uniformity language (varied shape, natural anchors,
 * never aligned). The rest of Mike's canonical brief (2026-08-13) is
 * untouched: bright daytime dieselpunk battlefront, human brass west,
 * machine chrome east, contested middle, HOMM5/Civ7 painted register,
 * sun locked UPPER LEFT.
 *
 *   node gen-s6-world.js            # both variants
 *   node gen-s6-world.js organic    # one
 *
 * Writes public/s6-art/world/_raw/variants/<name>.png
 * OPERATIONS NOTE, learned expensively: NEVER chain this after a file edit
 * with `;` - verify the prompt in the file FIRST, then fire. Two paid
 * generations went out on stale prompts because of a `;`.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "public", "s6-art", "world", "_raw", "variants");

function apiKey() {
  const env = path.join(ROOT, ".env.local");
  const txt = fs.readFileSync(env, "utf8");
  const m = txt.match(/OPENAI_API_KEY\s*=\s*(.+)/);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

// ── Mike's brief, verbatim core ─────────────────────────────────────────────
const MIKE_CORE = `A vibrant daytime strategy game world map, viewed from a high three-quarter isometric angle like Heroes of Might and Magic and Civilization VII - a fully illustrated playable overworld, NOT a parchment menu map, no paper texture, no compass rose, no map legend.

Setting: a bright dieselpunk-futuristic warzone where human mech pilots fight a machine AI empire. Daylight, clear blue sky lighting, saturated colors, crisp shadows - the look of a neon futuristic city rendered in full sunshine, not at night.

Terrain reads left to right as a battlefront: on the left, the human side - warm brass-and-copper industrial cities, riveted steel hangars, smokestacks with white steam, hand-built barricades, green fields and dirt roads reclaimed by people. On the right, the AI side - cold chrome-and-glass server spires, glowing cyan circuit-line roads etched into dark alloy ground, hexagonal machine structures, drone towers. In the middle, a scarred contested zone with trenches, wreckage of giant mechs, and cracked ground where the two aesthetics collide. Rivers with bridges, elevated railways, and canyons divide the regions.`;

// ── THE ANTI-GRID LAYOUT (v2): organic build-sites, never rows ──────────────
const ORGANIC_PLOTS = `Layout requirement, the most important structural property - and the arrangement is ORGANIC, never mechanical: ABOUT 18 vacant building plots are scattered naturally across the whole map the way real strategy-game build sites are. NEVER arranged in rows. NEVER in a grid. NEVER evenly spaced. NEVER aligned with one another - if three plots form a straight line, it is WRONG. Each plot sits at a natural anchor in the terrain: tucked into a river bend, at the foot of a canyon wall, on a hilltop shelf, inside a factory yard, in a clearing between server spires, beside a bridgehead, on a rocky terrace. Roughly six lie in the human west, six in the contested middle, six in the machine east, at different heights and depths across the image with irregular, varied gaps between them. Each plot is a flat, level, completely VACANT clearing roughly one-eleventh of the image wide, with a subtle glowing rim in its region's color - warm amber in the west, pale white in the middle, cyan in the east. Their outlines vary: round, oval, gently irregular. Nothing stands on any plot, and every plot keeps open ground around it so a structure can be composited on later.`;

const NESTLED_PLOTS = `Layout requirement, the most important structural property: ABOUT 18 vacant building sites, each one HALF-EMBRACED by its surroundings so it feels like a place the world made room for - a horseshoe of sandbag barricades opening onto a flat yard, a ring of brass pylons around bare packed earth, a cut-stone terrace at a cliff base, a cooling-fan ring set into the alloy ground, a cleared orchard plot fenced by hedges. The sites are scattered ORGANICALLY: never in rows, never in a grid, never evenly spaced, never aligned; irregular gaps; different heights and depths across the picture - if the sites form any regular pattern, it is WRONG. Roughly six in the human west, six in the contested middle, six in the machine east. Each site's floor is flat, level and completely VACANT, roughly one-eleventh of the image wide, with a faint glowing rim in its region's color (amber west, white middle, cyan east). Nothing stands on any site.`;

const MIKE_STYLE = `Style: hand-painted stylized game art, rich detail, clean readable shapes, painterly textures like Heroes of Might and Magic V terrain with Civilization VII's tilt-shift clarity. No text, no UI elements, no icons, no borders, no characters. Even, consistent lighting across the whole map so overlaid game assets blend anywhere.

Sunlight comes from the UPPER LEFT; every structure casts its crisp shadow down and to the right, uniformly across the entire map. The composition is a living painted landscape FIRST; the build plots must feel DISCOVERED in the terrain, never stamped onto it.`;

const PROMPTS = {
  organic: `${MIKE_CORE}\n\n${ORGANIC_PLOTS}\n\n${MIKE_STYLE}`,
  nestled: `${MIKE_CORE}\n\n${NESTLED_PLOTS}\n\n${MIKE_STYLE}`,
};

async function one(name, key) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 300000);
  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: PROMPTS[name],
        size: "1536x1024",
        quality: "high",
        n: 1,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.error(`x ${name}: HTTP ${resp.status} ${(await resp.text().catch(() => "")).slice(0, 300)}`);
      return false;
    }
    const j = await resp.json();
    const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) {
      console.error(`x ${name}: response missing b64_json`);
      return false;
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(b64, "base64"));
    console.log(`ok ${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
    return true;
  } catch (e) {
    clearTimeout(timer);
    console.error(`x ${name}: ${e && e.message}`);
    return false;
  }
}

// require.main guard: a bare require() must never fire a billable batch
if (require.main === module) {
  const names = process.argv.slice(2).filter((a) => PROMPTS[a]);
  const todo = names.length ? names : Object.keys(PROMPTS);
  const key = apiKey();
  console.log(`gpt-image-2, ${todo.length} variant(s): ${todo.join(", ")}`);
  Promise.all(todo.map((n) => one(n, key))).then((r) => {
    console.log(`${r.filter(Boolean).length}/${todo.length} generated -> ${OUT}`);
  });
}
