// GUNNER'S RUN round-2 sprite batch (tankbuster only): 6 building facades,
// 3 street props, and the 3 new content sprites (convoy truck, gunship, fuel
// dump). Same transport + house style as gen_s5_games.js (curl, gpt-image-2,
// magenta plate for sprites, bg-* written straight to finals unkeyed).
//   node gen_tb_round2.js              # everything
//   node gen_tb_round2.js --missing    # only items whose raw is absent
//   node gen_tb_round2.js foe-gunship  # one item
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const ROOT = "C:/Users/Mike/Desktop/web3guides";
const GAMES = path.join(ROOT, "public", "s5-art", "games");
const RAW = path.join(GAMES, "_raw");
const GAME = "tankbuster";

function apiKey() {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^OPENAI_API_KEY\s*=\s*(.*)$/m);
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const STYLE =
  "Painted military video game key art, gritty hand-painted concept art, richly detailed digital painting " +
  "(NOT a photograph, NOT photorealistic, NOT flat cartoon), muted olive-drab, rust and gunmetal palette, " +
  "weathered scratched metal, mud and grime, moody dramatic light, WW2-inspired fictional war machines. " +
  "NO text, NO letters, NO numbers, NO logos, NO insignia, NO stars, NO crosses, NO flags, NO watermarks.";

const PLATE =
  " The single subject is fully inside the frame with clear margin on every side, centered, on a completely " +
  "SOLID FLAT pure magenta background (hex #FF00FF). The entire background is one uniform flat magenta color: " +
  "no gradient, no texture, no cast shadow on the background, no ground plane, no vignette.";

const BG = " Full-frame edge-to-edge painting, no border, no frame, painterly and atmospheric.";

// Facades are texture plates mapped onto a projected building face: they must
// fill the frame corner to corner, be shot dead flat (no perspective of their
// own, or it fights the engine's projection), and carry their own windows.
const FACADE =
  "Painted texture plate of the FLAT FRONT WALL of a war-damaged city building, photographed dead straight on " +
  "(orthographic, zero perspective, no corners visible, no sky, no ground, no street, no pavement): the wall " +
  "fills the entire frame edge to edge, corner to corner. Dusk light. ";

const ITEMS = [
  // ── 6 building faces (full-frame plates; bg- prefix skips the chroma key) ──
  {
    f: "bg-facade-1",
    w: 1536,
    bg: true,
    p:
      FACADE +
      "A grimy grey stone tenement wall: four rows of tall rectangular windows, most dark and empty with " +
      "shattered glass, two glowing faint amber from inside, cracked stucco patches, shrapnel pockmarks, " +
      "rusted iron balcony railings, a drainpipe running down one side.",
  },
  {
    f: "bg-facade-2",
    w: 1536,
    bg: true,
    p:
      FACADE +
      "A dark red brick factory wall: three rows of wide industrial multi-pane steel windows with many panes " +
      "broken out, soot staining above each opening, crumbling mortar, a boarded-up doorway, heavy weathering.",
  },
  {
    f: "bg-facade-3",
    w: 1536,
    bg: true,
    p:
      FACADE +
      "A bomb-damaged pale plaster apartment wall: a large ragged shell hole punched through the middle " +
      "showing dark broken rooms and hanging floor timbers inside, surviving windows to either side, deep " +
      "cracks radiating from the hole, spilled rubble dust streaking the plaster.",
  },
  {
    f: "bg-facade-4",
    w: 1536,
    bg: true,
    p:
      FACADE +
      "An ornate stone civic building wall: tall arched windows between fluted pilasters, carved cornice " +
      "bands, chipped and blackened stonework, sandbags stacked across the base of the wall, one window " +
      "crudely bricked up.",
  },
  {
    f: "bg-facade-5",
    w: 1536,
    bg: true,
    p:
      FACADE +
      "A shuttered shopfront wall: a wide ground-floor storefront with a buckled rolling steel shutter and a " +
      "torn canvas awning frame, a faded blank painted sign panel with no lettering, two rows of small " +
      "apartment windows above, chipped green paint over grey render.",
  },
  {
    f: "bg-facade-6",
    w: 1536,
    bg: true,
    p:
      FACADE +
      "A burnt-out gutted building wall: window openings completely empty and black, heavy soot fans licking " +
      "upward above every opening, scorched blistered render, exposed charred timber lintels, a collapsed " +
      "section of wall at one edge.",
  },

  // ── 3 street props (magenta plate, keyed) ──
  {
    f: "prop-rubble",
    w: 1024,
    p:
      "A heaped pile of city rubble seen from the front at street level: broken concrete chunks, snapped " +
      "timber beams, twisted rebar, shattered roof tiles and grey dust, one bent street sign post with a " +
      "blank plate leaning out of the heap, low mound silhouette.",
  },
  {
    f: "prop-wreck",
    w: 1024,
    p:
      "A burnt-out wrecked civilian car at street level, side view: a small 1940s sedan, blackened and " +
      "gutted, no glass in the windows, doors sprung open, tyres burnt away leaving bare rims, hood " +
      "crumpled, thin cold grey smoke stains, no fire. A destroyed machine only, no human figures.",
  },
  {
    f: "prop-sandbags",
    w: 1024,
    p:
      "A small abandoned sandbag firing position at street level, front view: two low stacked courses of " +
      "weathered hessian sandbags forming a curved parapet, a wooden ammunition crate and a coil of " +
      "telephone wire beside it, an empty helmet resting on the bags, no people.",
  },

  // ── 3 new content sprites (magenta plate, keyed) ──
  {
    f: "foe-truck",
    w: 1536,
    p:
      "Side view at street level of an enemy military supply truck driving to the RIGHT of the frame: a " +
      "1940s six-wheel cargo lorry with an armored radiator grille, a canvas-tilt covered cargo bed with " +
      "roped-down tarpaulin, mud-caked fenders and running boards, spare wheel on the side, dark hostile " +
      "grey-green steel with rust streaks, no crew visible.",
  },
  {
    f: "foe-gunship",
    w: 1536,
    p:
      "Front three-quarter view of a menacing hostile WW2 GROUND-ATTACK AIRCRAFT in a low strafing pass, " +
      "banking toward the viewer and slightly to the left: a single-engine propeller dive bomber with " +
      "inverted gull wings, a long greenhouse canopy, fixed spatted landing gear, underwing cannon pods " +
      "and a bomb rack, propeller rendered as a faint motion-blurred disc, dark iron-grey and olive paint " +
      "with rust, oil streaks and exhaust staining, seen against nothing, no ground below. Completely " +
      "UNMARKED: NO crosses, NO roundels, NO national insignia, NO flags, NO unit numbers, NO stencilled " +
      "letters, NO text of ANY kind.",
  },
  {
    f: "ob-fueldump",
    w: 1024,
    p:
      "A roadside fuel dump seen from the front at street level: five rusted 200 litre steel fuel drums, " +
      "three standing and two stacked on their sides on a low timber pallet, a jerry can and a hand pump " +
      "beside them, oil-stained ground rag, weathered olive and rust paint, no markings.",
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
    const bodyFile = path.join(os.tmpdir(), `tb2_${safe}.json`);
    const outFile = path.join(os.tmpdir(), `tb2_${safe}_out.json`);
    fs.writeFileSync(bodyFile, JSON.stringify({ model: "gpt-image-2", prompt: fullPrompt(it), size, n: 1 }));
    execFile(
      "curl",
      [
        "-sS", "-m", "360", "https://api.openai.com/v1/images/generations",
        "-H", `Authorization: Bearer ${key}`,
        "-H", "Content-Type: application/json",
        "--data-binary", `@${bodyFile}`,
        "-o", outFile,
      ],
      { windowsHide: true },
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
  const filters = args.filter((a) => a !== "--missing");
  let todo = ITEMS.filter((it) => !filters.length || filters.includes(it.f));
  if (missingOnly) todo = todo.filter((it) => !fs.existsSync(path.join(RAW, GAME, `${it.f}.png`)));
  if (!todo.length) {
    console.log("nothing to generate");
    return;
  }
  const key = apiKey();
  console.log(`generating ${todo.length} renders on gpt-image-2 (curl transport, pool of 3)...`);
  const failedOnce = [];
  const failedTwice = [];
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const it = todo[i++];
      if (!(await genOne(it, key))) failedOnce.push(it);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  for (const it of failedOnce) {
    console.log(`  retry ${it.f}`);
    if (!(await genOne(it, key))) failedTwice.push(it.f);
  }
  console.log(`\nDONE: ${todo.length - failedTwice.length}/${todo.length} ok`);
  if (failedTwice.length) console.log("GAVE UP (primitives fallback): " + failedTwice.join(", "));
}

module.exports = { ITEMS, GAMES, RAW, GAME };

// guard (matches gen_s5_games.js): requiring this file must never start a
// billable render batch, only running it directly may
if (require.main === module) main();
