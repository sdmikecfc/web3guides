/**
 * WARBIRDS art batch — the VERTICAL-SCROLLER cutover (2026-07-25).
 *
 * The original 12 warbirds sprites were drawn for a SIDE-ON horizontal sortie.
 * The rebuilt game is a TOP-DOWN vertical scroller (the S3 "Asteroid Raid"
 * camera, slower, WW2), so the airframes and the terrain plate had to be
 * re-shot from directly overhead. Everything else survives the rotation and is
 * NOT regenerated here (aa-gun / ground-base read as 3/4 ground structures the
 * way Raiden-era ground art always has; balloon, bomb, fx-flak, fx-boom and
 * bg-sky are orientation-free).
 *
 * Same transport + house style as gen-tb-round2.js (curl, gpt-image-2, magenta
 * plate for sprites, bg-* written straight to finals unkeyed).
 *
 *   node gen-warbirds-art.js                 # everything below
 *   node gen-warbirds-art.js --missing       # only items whose raw is absent
 *   node gen-warbirds-art.js player-plane    # one item
 *
 * After a sprite batch:  node key-s5-games.js warbirds
 * After a bg-* batch:    python downscale-s5-bg.py && python webp-s5-bg.py
 *
 * ALL PLANES ARE DRAWN NOSE-UP. The renderer rotates them (divers fly at PI,
 * climbers at 0), so one nose-up cutout serves every heading.
 *
 * MACHINES ONLY, ZERO MARKINGS. Every prompt says so twice, explicitly: the
 * previous two batches came back with roundels and stencilled numbers.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const ROOT = "C:/Users/Mike/Desktop/web3guides";
const GAMES = path.join(ROOT, "public", "s5-art", "games");
const RAW = path.join(GAMES, "_raw");
const GAME = "warbirds";

function apiKey() {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^OPENAI_API_KEY\s*=\s*(.*)$/m);
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const STYLE =
  "Painted military video game key art, gritty hand-painted concept art, richly detailed digital painting " +
  "(NOT a photograph, NOT photorealistic, NOT flat cartoon), muted olive-drab, rust and gunmetal palette, " +
  "weathered scratched metal, mud and grime, moody dramatic light, WW2-inspired fictional war machines.";

/** Said on EVERY item. The house rule, stated in the strongest form. */
const UNMARKED =
  " Completely UNMARKED: NO roundels, NO national insignia, NO stars, NO crosses, NO flags, NO squadron " +
  "codes, NO unit numbers, NO stencilled letters, NO nose art, NO logos, NO watermarks, NO text of ANY " +
  "kind anywhere in the image. Bare weathered paint only.";

const PLATE =
  " The single subject is fully inside the frame with clear margin on every side, centered, on a completely " +
  "SOLID FLAT pure magenta background (hex #FF00FF). The entire background is one uniform flat magenta color: " +
  "no gradient, no texture, no cast shadow on the background, no ground plane, no vignette.";

const BG = " Full-frame edge-to-edge painting, no border, no frame, painterly and atmospheric.";

/** The camera contract for every airframe in this batch. */
const TOPDOWN =
  "Strict orthographic TOP-DOWN PLAN VIEW: the camera is directly overhead looking straight down at the " +
  "aircraft from above. You see the upper surfaces of both wings, the spine of the fuselage and the top of " +
  "the canopy. NO side view, NO three-quarter view, NO horizon, NO perspective, NO tilt. The aircraft is " +
  "perfectly symmetrical left to right, wings spread horizontally across the frame, and the NOSE POINTS " +
  "STRAIGHT UP toward the TOP EDGE of the image. ";

const ITEMS = [
  {
    f: "player-plane",
    w: 1024,
    p:
      TOPDOWN +
      "A single WW2-style single-engine fighter-bomber seen from directly above: a broad low elliptical wing " +
      "with a bomb shackle under each root, a stubby radial-engine cowling at the nose with the propeller " +
      "rendered as a faint motion-blurred translucent disc, a bubble canopy set midway back on the spine, a " +
      "cruciform tailplane at the rear. Olive-drab and sun-bleached green upper surfaces with oil streaks, " +
      "exhaust staining behind the cowling, chipped paint along the wing roots and panel lines picked out in " +
      "grime. Reads instantly as the HERO plane: clean strong silhouette, well kept, slightly brighter than " +
      "the enemy machines." +
      UNMARKED,
  },
  {
    f: "foe-fighter-a",
    w: 1024,
    p:
      TOPDOWN +
      "A single light hostile PROPELLER INTERCEPTOR of the 1940s seen from directly above: a lean sharp-nosed " +
      "liquid-cooled INLINE piston-engine fighter, a single big three-blade PROPELLER at the very nose " +
      "rendered as a translucent motion-blurred disc, straight tapered wings set square across the fuselage " +
      "with square-cut tips and slight rounding, a long thin spine, a small flush greenhouse canopy, and a " +
      "single-fin cruciform tailplane at the rear. Dark charcoal and bruised iron-grey upper surfaces with " +
      "heavy rust bloom, soot and exhaust scorching along the nose. Menacing, fast and fragile-looking. " +
      "ABSOLUTELY NOT A JET: no jet, no jet intakes, no delta wing, no triangular wing, no swept-back " +
      "wings, no afterburner, no exhaust nozzle, nothing modern. A WW2 piston fighter with a visible " +
      "propeller, period-correct 1943." +
      UNMARKED,
  },
  {
    f: "foe-fighter-b",
    w: 1024,
    p:
      TOPDOWN +
      "A single heavy hostile TWIN-ENGINE destroyer aircraft seen from directly above: a long armoured " +
      "fuselage with a wide straight wing carrying a bulky engine nacelle on each side (each with a blurred " +
      "propeller disc), a long glazed cockpit, cannon fairings under the nose and a twin-fin tail. Dark " +
      "gunmetal and oxide-red armoured upper surfaces, riveted plating, thick weathering. Reads as SLOW, " +
      "ARMOURED and dangerous: visibly tougher and heavier than a light interceptor." +
      UNMARKED,
  },
  {
    f: "ground-tank",
    w: 1024,
    p:
      "Strict orthographic TOP-DOWN PLAN VIEW, camera directly overhead looking straight down: a single " +
      "WW2-style medium TANK seen from above. You see the flat engine deck with its louvred grilles, the " +
      "hatches, the turret roof with its cupola, and the long gun barrel projecting forward past the glacis. " +
      "Both track runs are visible as dark ribbed bands down the left and right sides. Stowage boxes, a " +
      "folded tarpaulin, spare track links and a coil of cable strapped to the deck. Rust-streaked olive and " +
      "grey armour, mud caked along the track guards, scorch marks. The tank points STRAIGHT UP toward the " +
      "top of the image. Sits on nothing, no ground, no shadow." +
      UNMARKED,
  },
  {
    // The leg-3 climax target, added with the C to B+ pass. Without this the
    // biggest single scoring body in the game draws as a vector silhouette.
    f: "ground-flagship",
    w: 1024,
    p:
      "Strict orthographic TOP-DOWN PLAN VIEW, camera directly overhead looking straight down: a single " +
      "large WW2-style FORTIFIED COMMAND BASE seen from above. A heavy poured-concrete bunker block at the " +
      "centre with a stepped flat roof and armoured roof hatches, ringed by sandbagged emplacements, two " +
      "squat flak turrets on opposite corners, radio masts guyed with cables, fuel drums stacked under " +
      "camouflage netting, and a rail spur carrying a flatbed wagon along one edge. Weathered grey concrete " +
      "streaked with rain and soot, olive camouflage netting, rust on every steel fitting. Reads instantly " +
      "as a fortress and a BOSS: dense, layered, visibly heavier and more elaborate than an ordinary " +
      "structure. The complex is oriented with its long axis pointing STRAIGHT UP toward the top of the " +
      "image. Sits on nothing, no ground, no shadow." +
      UNMARKED,
  },
  {
    f: "bg-ground",
    w: 1536,
    bg: true,
    p:
      "A high-altitude AERIAL PLAN VIEW of a WW2 battlefield seen from directly overhead from an aircraft: " +
      "churned brown-and-ochre mud, a lattice of zig-zag trench lines and communication saps, shell craters " +
      "ringed with pale spoil, the pale scar of a supply road running across the frame, hedgerow remnants " +
      "and a few flooded crater pools catching dull light, patches of surviving scrub and stubble field. " +
      "Camera is straight down: NO horizon, NO sky, NO skyline, NO vanishing point, nothing standing " +
      "upright, no trees seen from the side, no buildings seen from the side. Even overcast light so the " +
      "whole frame is uniformly lit with no bright corner and no vignette, and the terrain reads the same " +
      "at every edge so it can tile." +
      UNMARKED,
  },
];

function fullPrompt(it) {
  if (it.bg) return it.p + " " + STYLE + BG;
  return it.p + " " + STYLE + PLATE;
}

function genOne(it, key) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const size = it.w === 1536 ? "1536x1024" : "1024x1024";
    const safe = it.f.replace(/\//g, "_");
    const bodyFile = path.join(os.tmpdir(), `wb_${safe}.json`);
    const outFile = path.join(os.tmpdir(), `wb_${safe}_out.json`);
    fs.writeFileSync(bodyFile, JSON.stringify({ model: "gpt-image-2", prompt: fullPrompt(it), size, n: 1 }));
    execFile(
      "curl",
      [
        "-sS", "-m", "420", "https://api.openai.com/v1/images/generations",
        "-H", `Authorization: Bearer ${key}`,
        "-H", "Content-Type: application/json",
        "--data-binary", `@${bodyFile}`,
        "-o", outFile,
      ],
      { windowsHide: true, maxBuffer: 1 << 26 },
      (err) => {
        try {
          if (err) throw new Error(`curl: ${err.message.slice(0, 120)}`);
          const json = JSON.parse(fs.readFileSync(outFile, "utf8"));
          if (json.error) throw new Error(json.error.message);
          const b64 = json.data && json.data[0] && json.data[0].b64_json;
          if (!b64) throw new Error("no image in response");
          const buf = Buffer.from(b64, "base64");
          const rawDir = path.join(RAW, GAME);
          fs.mkdirSync(rawDir, { recursive: true });
          fs.writeFileSync(path.join(rawDir, `${it.f}.png`), buf);
          if (it.bg) {
            const finDir = path.join(GAMES, GAME);
            fs.mkdirSync(finDir, { recursive: true });
            fs.writeFileSync(path.join(finDir, `${it.f}.png`), buf);
          }
          console.log(`  ok ${it.f} (${Math.round((Date.now() - t0) / 1000)}s)`);
          resolve(true);
        } catch (e) {
          console.error(`  FAIL ${it.f}: ${String(e.message).slice(0, 200)}`);
          resolve(false);
        } finally {
          fs.rmSync(bodyFile, { force: true });
          fs.rmSync(outFile, { force: true });
        }
      },
    );
  });
}

async function main() {
  const args = process.argv.slice(2);
  const missingOnly = args.includes("--missing");
  const filters = args.filter((a) => !a.startsWith("--"));
  let todo = ITEMS.filter((it) => !filters.length || filters.includes(it.f));
  if (missingOnly) todo = todo.filter((it) => !fs.existsSync(path.join(RAW, GAME, `${it.f}.png`)));
  if (!todo.length) {
    console.log("nothing to generate");
    return;
  }
  const key = apiKey();
  console.log(`generating ${todo.length} renders on gpt-image-2 (curl transport, pool of 5)...`);
  const failedOnce = [];
  const failedTwice = [];
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const it = todo[i++];
      if (!(await genOne(it, key))) failedOnce.push(it);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker()]);
  for (const it of failedOnce) {
    console.log(`  retry ${it.f}`);
    if (!(await genOne(it, key))) failedTwice.push(it.f);
  }
  console.log(`\nDONE: ${todo.length - failedTwice.length}/${todo.length} ok`);
  if (failedTwice.length) console.log("GAVE UP (keeps the old cutout / primitives fallback): " + failedTwice.join(", "));
}

module.exports = { ITEMS, GAMES, RAW, GAME };

// guard (matches gen-tb-round2.js): requiring this file must never start a
// billable render batch, only running it directly may
if (require.main === module) main();
