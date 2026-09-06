/**
 * One-off generator: DESCENT (S5 round-3 bunker raid) sprites via gpt-image-2
 * on flat magenta, saved to public/s5-art/games/_raw/descent/. Then run
 * `node key-s5-games.js descent` to chroma-key the cutouts transparent into
 * public/s5-art/games/descent/ (which also DOWNSCALES on write).
 *
 * TWO CLASSES OF PLATE HERE (both intentional):
 *  - BILLBOARDS (turret, drone-a, drone-b, heavy, reactor, key-breaker,
 *    door-blast, fx-*): rendered HEAD-ON on flat #FF00FF, keyed to cutouts.
 *    The renderer bills them at a screen size of 1/z, so a head-on plate is
 *    the only view that reads at every distance.
 *  - WALL TEXTURES (wall-concrete, wall-rail): full-frame seamless tiles with
 *    NO magenta anywhere. key-s5-games.js still processes them (a no-op key:
 *    concrete is nowhere near magenta, so every pixel stays opaque and the
 *    bbox is the whole frame) purely for the downscale-on-write. They feed the
 *    perspective-correct column slicer in Client.tsx.
 *  - bg-* files are UNKEYED full-frame paintings and this script writes their
 *    finals directly (the key-s5-games.js contract). A bg-* regeneration is
 *    NOT shippable on its own: it lands a full-size PNG while art.ts asks for
 *    .webp capped at 1280px wide. Follow it with
 *    `python downscale-s5-bg.py descent` then `python webp-s5-bg.py descent`.
 *
 * HARD ART RULE (violated twice on 2026-07-25, so it is in EVERY prompt):
 * completely UNMARKED. No insignia, no national markings, no stars/crosses/
 * roundels, no text or lettering of any kind. Machines only, no people, no gore.
 *
 * Local utility (NOT part of the Next build). Reads OPENAI_API_KEY from
 * .env.local. Fires all prompts in PARALLEL (each render ~220-230s, so
 * wall-clock ~= one render, not the sum).
 *
 *   node gen-descent-art.js                 # everything
 *   node gen-descent-art.js turret heavy    # subset (basenames)
 */
const fs = require("fs");
const path = require("path");

const RAW = path.resolve(__dirname, "public", "s5-art", "games", "_raw", "descent");
const FINAL = path.resolve(__dirname, "public", "s5-art", "games", "descent");

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
const HEADON =
  "Strict head-on FRONT view: the camera is directly in front of the subject at its own height, looking " +
  "straight at it, no perspective tilt, no three-quarter angle, no horizon.";
const UNMARKED =
  "Completely UNMARKED: NO insignia, NO national markings, NO stars, NO crosses, NO roundels, NO flags, " +
  "NO unit numbers, NO stencilled letters, NO signage, NO warning labels, NO text or lettering of ANY kind " +
  "anywhere in the image.";
const NOPEOPLE = "NO people, NO crew, NO figures, NO hands, NO blood — machinery only.";
const STYLE =
  "Gritty WW2-era military industrial art, weathered painted steel and raw poured concrete, oil stains and " +
  "rust, bold readable silhouette, premium mobile-game quality, slightly stylized but not cartoonish. " +
  "Lit by harsh cold underground work-lamps from the front.";

const PROMPTS = {
  // ── wall textures: full frame, seamless, NO magenta ──────────────────────
  "wall-concrete":
    `A seamless square TEXTURE TILE of a deep WW2 BUNKER wall: raw poured reinforced concrete with visible ` +
    `board-form plank imprints, cold pour lines, chipped edges, damp streaks, patches of efflorescence and ` +
    `soot, a few rusted steel tie-rod stubs and a heavy riveted steel band running across it. Muted cold grey ` +
    `and green-grey, dim underground lighting, even overall brightness so it tiles edge to edge with no strong ` +
    `shadow and no vignette. Flat-on wall elevation, no perspective, no floor, no ceiling. ` +
    `${UNMARKED} ${NOPEOPLE} ${STYLE}`,
  "wall-rail":
    `A seamless square TEXTURE TILE of a WW2 underground RAIL TUNNEL wall: curved riveted steel lining plates ` +
    `bolted in rows over brick, thick armoured cable conduits and pipe runs strapped along it, a dead ` +
    `caged work-lamp, rust bleeding from every rivet, coal dust and grime. Muted rust-brown, iron grey and ` +
    `oily black, dim underground lighting, even overall brightness so it tiles edge to edge with no strong ` +
    `shadow and no vignette. Flat-on wall elevation, no perspective, no floor, no ceiling. ` +
    `${UNMARKED} ${NOPEOPLE} ${STYLE}`,

  // ── billboards ────────────────────────────────────────────────────────────
  "door-blast":
    `A single enormous WW2 BUNKER BLAST DOOR seen head-on: a slab of riveted armour steel set in a raw ` +
    `concrete frame, split down the middle into two sliding leaves with a heavy interlocking centre seam, ` +
    `massive hinge bosses, a ring of bolt heads, hydraulic rams either side, and a thick amber-glass ` +
    `indicator lamp set into the concrete above. Sealed shut, immovable, obviously the way forward. ` +
    `${UNMARKED} ${NOPEOPLE} ${STYLE} ${HEADON} ${MAGENTA}`,
  turret:
    `A single automated WW2 BUNKER WALL TURRET seen head-on: a squat armoured steel ball-mount cupola on a ` +
    `short concrete pedestal collar, with twin stubby autocannon barrels pointing straight at the viewer, ` +
    `a slotted armour visor above the barrels with a glowing amber optic behind the slot, exposed ammunition ` +
    `feed chutes and a servo traverse ring. Menacing, mechanical, clearly a remote-operated emplacement with ` +
    `nobody inside. ${UNMARKED} ${NOPEOPLE} ${STYLE} ${HEADON} ${MAGENTA}`,
  "drone-a":
    `A single small WW2-era REMOTE-CONTROLLED TRACKED DEMOLITION MACHINE seen head-on: a low wedge-shaped ` +
    `armoured steel box the size of a sled riding on two stubby tracks, a blunt sloped nose plate, a single ` +
    `glowing amber lens on the nose, a coiled control cable spool on its back, weathered field-grey paint ` +
    `over rust. Small, fast, obviously unmanned. ${UNMARKED} ${NOPEOPLE} ${STYLE} ${HEADON} ${MAGENTA}`,
  "drone-b":
    `A single WW2-era ARMOURED RAIL TROLLEY GUN seen head-on: a small armoured steel trolley riding a narrow ` +
    `mine rail, with a sloped front plate, a single short automatic cannon barrel jutting from a slot in the ` +
    `centre pointing at the viewer, two glowing amber lamps like eyes above the slot, and a heavy buffer beam ` +
    `across the bottom. Boxy, riveted, unmanned. ${UNMARKED} ${NOPEOPLE} ${STYLE} ${HEADON} ${MAGENTA}`,
  heavy:
    `A single ENORMOUS fortified WW2 CASEMATE GUN EMPLACEMENT seen head-on: a wide bunkered steel turret ` +
    `mass set into a thick concrete casemate, three heavy gun barrels of different calibres fanned across ` +
    `the front all aimed at the viewer, layered spaced armour plates, huge bolt rows, thick pipework and ` +
    `cooling fins down the flanks, and a wide horizontal vision slit glowing hot amber. It should read as a ` +
    `boss: bigger and meaner than anything else underground. ${UNMARKED} ${NOPEOPLE} ${STYLE} ${HEADON} ${MAGENTA}`,
  reactor:
    `A single colossal WW2 BUNKER MAIN GENERATOR seen head-on: a vertical industrial dynamo and turbine ` +
    `stack of riveted steel drums, huge copper windings and bus bars, thick armoured cable trunks running ` +
    `off both sides, a bank of brass pressure gauges with blank unlabelled dials, exhaust ducting, and a hot ` +
    `orange glow bleeding out of the grilles and inspection ports at its core. The beating heart of the ` +
    `complex, obviously the thing worth destroying. ${UNMARKED} ${NOPEOPLE} ${STYLE} ${HEADON} ${MAGENTA}`,
  "key-breaker":
    `A single wall-mounted WW2 HIGH-VOLTAGE BREAKER LEVER seen head-on: a heavy cast-iron switchgear housing ` +
    `with a big red-painted knife-switch lever standing upright in the OFF position, thick ceramic insulators, ` +
    `exposed copper contacts, an armoured cable running away below, and a caged indicator lamp glowing a cold ` +
    `cyan-white beside it. Small, obviously interactive, obviously the thing that opens something. ` +
    `${UNMARKED} ${NOPEOPLE} ${STYLE} ${HEADON} ${MAGENTA}`,
  "fx-muzzle":
    `A single MUZZLE FLASH burst seen head-on: a bright white-hot four-pointed star of flame with a hot ` +
    `orange corona and a ring of sparks, no gun, no barrel, no smoke trail, just the flash itself. ` +
    `${UNMARKED} ${NOPEOPLE} ${MAGENTA}`,
  "fx-boom":
    `A single EXPLOSION burst seen head-on: a compact ball of orange and white fire with dark oily smoke ` +
    `curling at its edges and flying steel debris fragments and sparks thrown outward. No ground, no ` +
    `vehicle, no scenery, just the blast. ${UNMARKED} ${NOPEOPLE} ${MAGENTA}`,

  // ── full-frame plate: the far darkness at the end of every tunnel ─────────
  "bg-tunnel":
    `A full-frame background plate looking straight down an ENDLESS DARK WW2 BUNKER TUNNEL: raw concrete and ` +
    `riveted steel walls receding to a black vanishing point in the centre, a dwindling row of dim caged ` +
    `work-lamps down each side fading into darkness, faint haze and dust in the air, a wet concrete floor ` +
    `with narrow mine rails, cable runs along the walls. Very dark overall, almost black at the centre, with ` +
    `only cold dim lamp glow. NO vehicles, NO machinery, NO doors. ${UNMARKED} ${NOPEOPLE} ${STYLE}`,
};

/** bg-* are full-frame paintings: their finals are written directly (never keyed). */
const IS_BG = (n) => n.startsWith("bg-");

async function gen(name, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 300000);
  const t0 = Date.now();
  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: PROMPTS[name],
        size: IS_BG(name) ? "1536x1024" : "1024x1024",
        quality: "high",
        n: 1,
      }),
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
    const buf = Buffer.from(b64, "base64");
    fs.writeFileSync(path.join(RAW, `${name}.png`), buf);
    if (IS_BG(name)) fs.writeFileSync(path.join(FINAL, `${name}.png`), buf);
    console.log(`ok ${name} (${Math.round((Date.now() - t0) / 1000)}s)${IS_BG(name) ? " [final written directly]" : ""}`);
    return true;
  } catch (e) {
    clearTimeout(timer);
    console.error(`x ${name}: ${e.message}`);
    return false;
  }
}

// require.main guard: without it a bare `require()` of this file fires a
// BILLABLE batch (a lesson learned the hard way in the same session).
if (require.main === module) (async () => {
  for (const d of [RAW, FINAL]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  const key = apiKey();
  const want = process.argv.slice(2).filter((a) => PROMPTS[a]);
  const names = want.length ? want : Object.keys(PROMPTS);
  console.log(`generating ${names.length}: ${names.join(", ")} (gpt-image-2, ~230s each, in parallel)`);
  const res = await Promise.all(names.map((n) => gen(n, key)));
  console.log(`done: ${res.filter(Boolean).length}/${names.length} ok. Next: node key-s5-games.js descent`);
})();
