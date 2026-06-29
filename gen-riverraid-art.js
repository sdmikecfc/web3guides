/**
 * One-off generator: River Raid (STARFALL "Salvage Run") sprites via gpt-image-2 on
 * flat magenta, saved to public/stars-art/_raw/. Then run `node key-stars-art.js <name>`
 * to chroma-key them transparent into public/stars-art/. Local utility (NOT part of the
 * Next build). Reads OPENAI_API_KEY from .env.local. Fires all prompts in PARALLEL (each
 * render ~220-230s on gpt-image-2, so wall-clock ~= one render, not the sum).
 *
 *   node gen-riverraid-art.js                    # all
 *   node gen-riverraid-art.js raider fuel        # subset (basenames)
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
  raider:
    `A single sleek TOP-DOWN player GUNSHIP / strike fighter for a vertical-scrolling space shooter: a compact ` +
    `agile fighter with swept wings, twin forward-firing cannon barrels at the nose, twin glowing cyan engine ` +
    `thrusters at the rear, a bubble cockpit canopy, gunmetal-and-white hull with cyan energy accents (neutral ` +
    `enough to tint a team color later). Heroic, clean, bold, premium mobile-game art, crisp readable silhouette. ` +
    `${TOPDOWN} The gunship points toward the TOP of the image (nose up). ${MAGENTA}`,
  "enemy-drone":
    `A single small hostile ENEMY DRONE FIGHTER for a top-down space shooter: a compact menacing wedge-shaped ` +
    `attack drone with angular armor, a single glowing red sensor eye, short stubby wings and a dark crimson-and-` +
    `charcoal hull with hot red accents. Clearly an enemy. Bold, premium, slightly stylized, crisp silhouette. ` +
    `${TOPDOWN} The drone points toward the TOP of the image (nose up). ${MAGENTA}`,
  "enemy-gunship":
    `A single large heavy hostile ENEMY GUNSHIP / warship for a top-down space shooter: a bulky armored capital ` +
    `gunship bristling with cannon turrets and armor plating, glowing red engine ports and red running lights, a ` +
    `dark crimson-and-gunmetal hull. Intimidating, clearly an enemy boss-ship. Bold, premium, slightly stylized. ` +
    `${TOPDOWN} The gunship points toward the TOP of the image (nose up). ${MAGENTA}`,
  fuel:
    `A single glowing FUEL CELL / plasma fuel canister pickup for a space shooter: an upright rounded tank of ` +
    `bright luminous green-cyan plasma in a metal cradle, with a clear white fuel-droplet symbol on the front and ` +
    `a soft energy glow. Reads instantly as "fuel / refuel / good to grab". Bold, premium, slightly stylized, ` +
    `crisp readable shape. ${TOPDOWN} ${MAGENTA}`,
  powerup:
    `A single WEAPON-UPGRADE POWERUP pickup for a space shooter: a floating faceted golden energy crystal / tech ` +
    `module with a bright glowing upward chevron or lightning-bolt emblem on its face, radiating gold-and-white ` +
    `light. Reads instantly as "power up your guns". Bold, premium, slightly stylized, crisp readable shape. ` +
    `${TOPDOWN} ${MAGENTA}`,
  "enemy-cruiser":
    `A single HUGE hostile ENEMY CRUISER / dreadnought battleship for a top-down space shooter: a massive long armored ` +
    `capital warship completely covered in cannon turrets, missile pods, heavy armor plating and segmented hull panels, ` +
    `with many glowing red weapon ports and engine exhausts, a dark crimson-black-and-gunmetal hull. Looks slow, ` +
    `near-indestructible and terrifying — a ship you avoid unless fully armed. Bold, premium, intimidating, crisp ` +
    `silhouette. ${TOPDOWN} The cruiser points toward the TOP of the image (nose up). ${MAGENTA}`,
  "raid-building":
    `A single TOP-DOWN hostile MOON-BASE BUNKER / armored gun-turret structure for a space shooter, seen from directly ` +
    `above: a squat hexagonal fortified bunker with thick armor plating, a central rotating gun turret with twin ` +
    `barrels, glowing red defense lights, antennae and vents, dark metal-and-charcoal with red accents, sitting on a ` +
    `circular concrete pad. Reads instantly as a ground target to bomb. Bold, premium, crisp readable shape. ` +
    `${TOPDOWN} ${MAGENTA}`,
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
  console.log(`done: ${res.filter(Boolean).length}/${names.length} ok. Next: node key-stars-art.js <name>`);
})();
