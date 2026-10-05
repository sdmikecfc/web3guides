/**
 * S5 ROUND-3 ART — the full re-shoot Mike asked for (2026-07-30).
 *
 * "All games new graphics, backgrounds, all assets need to be made."
 *
 * Same transport and house style as gen-warbirds-art.js (curl, gpt-image-2,
 * magenta plate for sprites, bg-* written straight to finals unkeyed). This is
 * deliberately a sibling of that file rather than a new pipeline: the season's
 * art already has a look, a keyer and a downscale step, and a second pipeline
 * would produce assets that do not match anything else on screen.
 *
 *   node gen-s5-round3-art.js                  # everything
 *   node gen-s5-round3-art.js --missing        # only items whose raw is absent
 *   node gen-s5-round3-art.js warpath          # one game
 *   node gen-s5-round3-art.js warpath/foe-heavy  # one item
 *
 * After a sprite batch:  node key-s5-games.js <game>
 * After a bg-* batch:    python downscale-s5-bg.py && python webp-s5-bg.py
 *
 * ── THE CAMERA CONTRACT, which is the whole point of this batch ──────────
 *
 * Mike: "make it so when things turn around they don't look dumb (ambush
 * game)". Warpath's hulls rotate to arbitrary headings every frame, and so do
 * Armor Clash's units. A sprite drawn at a three-quarter view is correct at
 * exactly ONE rotation and wrong at every other, which is what produced this
 * season's upside-down tanks and upside-down houses.
 *
 * So every rotating asset is TOP-DOWN, NOSE-UP, and carries NO BAKED SHADOW.
 * A painted shadow rotates with the hull and points at a different sun every
 * frame; the renderers already call longShadow() themselves.
 *
 * MACHINES ONLY, ZERO MARKINGS. Stated twice per item: earlier batches came
 * back with roundels and stencilled numbers.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const ROOT = "C:/Users/Mike/Desktop/web3guides";
const GAMES = path.join(ROOT, "public", "s5-art", "games");
const RAW = path.join(GAMES, "_raw");

function apiKey() {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^OPENAI_API_KEY\s*=\s*(.*)$/m);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const STYLE =
  "Painted military video game key art, gritty hand-painted concept art, richly detailed digital painting " +
  "(NOT a photograph, NOT photorealistic, NOT flat cartoon), muted olive-drab, rust and gunmetal palette, " +
  "weathered scratched metal, mud and grime, moody dramatic light, WW2-inspired fictional war machines.";

const UNMARKED =
  " Completely UNMARKED: NO roundels, NO national insignia, NO stars, NO crosses, NO flags, NO squadron " +
  "codes, NO unit numbers, NO stencilled letters, NO nose art, NO logos, NO watermarks, NO text of ANY " +
  "kind anywhere in the image. Bare weathered paint only.";

const PLATE =
  " The single subject is fully inside the frame with clear margin on every side, centered, on a completely " +
  "SOLID FLAT pure magenta background (hex #FF00FF). The entire background is one uniform flat magenta color: " +
  "no gradient, no texture, no cast shadow on the background, no ground plane, no vignette.";

const BG = " Full-frame edge-to-edge painting, no border, no frame, painterly and atmospheric.";

/**
 * TERRAIN STYLE: the house style with its SUBJECT CLAUSE REMOVED.
 *
 * STYLE ends "WW2-inspired fictional war machines", which is a subject rather
 * than a style. In every previous batch that was harmlessly redundant because
 * every item was a vehicle. In this batch it is not: the first generated item,
 * "a single large weathered GREY BOULDER", came back as a TANK with a white
 * star on it. The style string argues with the prompt and the style string
 * wins. Anything that is not a machine gets this instead.
 */
const TERRAIN_STYLE =
  "Painted video game environment art, gritty hand-painted concept art, richly detailed digital painting " +
  "(NOT a photograph, NOT photorealistic, NOT flat cartoon), muted olive-drab, rust and gunmetal palette, " +
  "weathered natural surfaces, mud and grime, moody dramatic light. NO vehicles, NO tanks, NO aircraft, " +
  "NO machinery, NO buildings, NO people of any kind in the image.";

/** The rotation contract. Every hull that turns in-game gets this verbatim. */
const TOPDOWN =
  "Strict orthographic TOP-DOWN PLAN VIEW: the camera is directly overhead looking straight down from above. " +
  "You see only upper surfaces: the engine deck, the hatches, the turret roof. NO side view, NO three-quarter " +
  "view, NO horizon, NO perspective, NO tilt, NO vanishing point. The subject is perfectly symmetrical left " +
  "to right and points STRAIGHT UP toward the TOP EDGE of the image. NO cast shadow of any kind: the light " +
  "is directly overhead and the ground is not visible. ";

/** A tileable ground plate. Seams matter more than beauty here. */
const TILE =
  "Seamless TILEABLE texture that repeats edge to edge with no visible seam, photographed straight down, " +
  "completely flat and even lighting, no vignette, no shadow, no single focal point, no objects, no vehicles, " +
  "no people. Fills the entire frame as one continuous surface. ";

const ITEMS = [
  // ── WARPATH: the ambush. Everything here rotates. ────────────────────
  {
    f: "warpath/foe-drone",
    p:
      TOPDOWN +
      "A small tracked DEMOLITION ROBOT seen from directly above: a squat boxy chassis between two short " +
      "track runs, a single armoured sensor housing on top, a satchel charge strapped to the deck. Rust-" +
      "streaked field grey, crude welds, improvised and expendable-looking. Small and low." +
      UNMARKED,
  },
  {
    f: "warpath/foe-car",
    p:
      TOPDOWN +
      "An armoured SCOUT CAR seen from directly above: four fat off-road wheels visible either side of a " +
      "faceted hull, a small open-topped turret with a short autocannon pointing straight up the frame, " +
      "spare fuel cans on the rear deck. Dusty ochre and grey-green, sand-scoured paint." +
      UNMARKED,
  },
  {
    f: "warpath/foe-halftrack",
    p:
      TOPDOWN +
      // RE-ROLLED. The first pass said "open troop bay, bench seats", which
      // produced a TRUCK -- and the convoy the player defends is also trucks.
      // Two different things wearing one silhouette, one of them shooting at
      // you. Mike: "warpath has trucks attacking tanks? really weird." It is
      // now armoured, closed-topped and turreted: unmistakably a fighting
      // vehicle at a glance, at any rotation.
      "An armoured ASSAULT HALFTRACK seen from directly above: two steered road wheels at the front and " +
      "heavy track runs at the rear, a fully ENCLOSED armoured fighting compartment with NO open bed and " +
      "NO cargo, sloped faceted plating, and a small rotating gun turret on the roof with a short cannon " +
      "pointing straight up the frame. Dark iron-grey with oxide-red primer through chipped paint and soot " +
      "streaks. Reads instantly as a HOSTILE FIGHTING VEHICLE, never as a supply truck." +
      UNMARKED,
  },
  {
    f: "warpath/foe-heavy",
    p:
      TOPDOWN +
      "A HEAVY ENEMY TANK seen from directly above: wide ribbed track runs down both sides, a broad flat " +
      "engine deck with louvred grilles at the rear, a large turret roof with a commander cupola, and a long " +
      "gun barrel projecting straight up the frame past the glacis. Dark iron-grey with oxide-red primer " +
      "showing through chipped paint. Reads as SLOW and heavily armoured." +
      UNMARKED,
  },
  {
    f: "warpath/foe-bruiser",
    p:
      TOPDOWN +
      "A MASSIVE SIEGE TANK seen from directly above: extra-wide track runs, a hull deck covered in bolted-on " +
      "spaced armour plates with visible bolt heads, a squat heavy mortar barrel projecting up the frame, " +
      "sandbags lashed to the deck. Scorched gunmetal, heavy rust bloom, brutally thick. Visibly the biggest " +
      "and toughest machine on the field." +
      UNMARKED,
  },
  {
    f: "warpath/player-hull",
    p:
      TOPDOWN +
      "An allied MEDIUM TANK HULL seen from directly above WITH NO TURRET FITTED: an open circular turret " +
      "ring in the centre of the deck showing the bare mounting race, track runs down both sides, engine " +
      "deck grilles at the rear, driver hatches at the front. Well-kept olive drab, clean strong silhouette, " +
      "slightly brighter and better maintained than the enemy machines. NO turret, NO gun." +
      UNMARKED,
  },
  {
    f: "warpath/player-turret",
    p:
      TOPDOWN +
      "A single allied TANK TURRET seen from directly above and completely detached, with NO hull beneath it: " +
      "a rounded cast turret roof with a commander hatch and a periscope, and a long gun barrel projecting " +
      "straight up the frame. Olive drab, well kept. Just the turret, isolated." +
      UNMARKED,
  },
  {
    f: "warpath/truck",
    p:
      TOPDOWN +
      "A military SUPPLY TRUCK seen from directly above: a cab roof at the front, a long canvas-tilt cargo " +
      "bed behind it with visible rib hoops under the canvas, six wheels showing at the edges. Faded olive " +
      "canvas, muddy chassis." +
      UNMARKED,
  },
  {
    f: "warpath/wreck",
    p:
      TOPDOWN +
      "A BURNT-OUT DESTROYED TANK seen from directly above: the hull blackened and split open, the turret " +
      "blown clean off leaving an empty ring, one track run unspooled and trailing, charred metal and ash. " +
      "Dead and cold, no fire, no smoke." +
      UNMARKED,
  },
  {
    f: "warpath/rock-a",
    terrain: true,
    p:
      TOPDOWN +
      "A single large weathered GREY BOULDER seen from directly above: a natural rock, rounded, chipped, " +
      "lichen-streaked. It is a ROCK and nothing else: not a vehicle, not a machine, no wheels, no tracks, " +
      "no gun, no hatches. No vegetation around it, no ground beneath it." +
      UNMARKED,
  },
  {
    f: "warpath/rock-b",
    terrain: true,
    p:
      TOPDOWN +
      "A tight CLUSTER OF JAGGED GREY ROCKS seen from directly above: three or four natural angular stone " +
      "slabs leaning together with sharp broken edges. They are ROCKS and nothing else: not vehicles, not " +
      "machines, no wheels, no tracks, no guns. No ground beneath them." +
      UNMARKED,
  },
  {
    f: "warpath/bg-valley",
    bg: true,
    terrain: true,
    p:
      TILE +
      "A dry summer grass valley floor seen from directly overhead: sun-bleached grass, worn dirt patches, " +
      "faint tyre ruts crossing it, scattered small stones. Muted olive and straw.",
  },

  // ── WARHAWKS: a strafing run. Planes rotate to their heading. ─────────
  {
    f: "warhawks/plane-player",
    p:
      TOPDOWN +
      "A WW2-style single-engine FIGHTER-BOMBER seen from directly above with the NOSE POINTING STRAIGHT UP " +
      "the frame: a broad low elliptical wing spread horizontally, a radial-engine cowling at the nose with " +
      "the propeller as a faint motion-blurred translucent disc, a bubble canopy on the spine, a cruciform " +
      "tailplane at the rear. BARE POLISHED ALUMINIUM upper surfaces, bright silver metal catching the light, " +
      "with one broad BRIGHT SKY-BLUE band painted across both wings and around the rear fuselage. Light oil " +
      "streaks and exhaust staining only. " +
      // GAMEPLAY OUTRANKS PERIOD ACCURACY HERE. The vector plane this replaces
      // is deliberately sky blue, and the code comment says why: "it was olive
      // green over farmland, which is the one colour scheme guaranteed to lose."
      // An olive hero plane over an olive battlefield is unfindable, and being
      // unable to find your own aircraft was a real complaint. Bare metal plus
      // a blue band keeps it period-plausible AND high contrast.
      "Reads as the HERO plane and must be findable INSTANTLY against dark olive and brown ground: far " +
      "lighter and higher in contrast than the terrain beneath it." +
      UNMARKED,
  },
  {
    f: "warhawks/plane-fighter",
    p:
      TOPDOWN +
      "A hostile PROPELLER INTERCEPTOR seen from directly above, NOSE POINTING STRAIGHT UP the frame: a lean " +
      "sharp-nosed inline piston-engine fighter, a single three-blade propeller at the nose as a translucent " +
      "blurred disc, straight tapered wings with square-cut tips, a flush greenhouse canopy, a single-fin " +
      "cruciform tail. Dark charcoal and bruised iron-grey with rust bloom and soot. ABSOLUTELY NOT A JET: " +
      "no jet intakes, no delta wing, no swept wings, no afterburner. A 1943 piston fighter." +
      UNMARKED,
  },
  {
    f: "warhawks/plane-ace",
    p:
      TOPDOWN +
      "An ELITE hostile piston fighter seen from directly above, NOSE POINTING STRAIGHT UP the frame: same " +
      "class as a standard interceptor but visibly finer, with a blood-red painted engine cowling, polished " +
      "dark upper surfaces and crisp panel lines. Menacing and well kept. NOT A JET, visible propeller disc. " +
      "The red cowling is bare paint, NOT a marking or insignia." +
      UNMARKED,
  },
  {
    f: "warhawks/pickup",
    p:
      TOPDOWN +
      "A SUPPLY CANISTER falling under a small parachute, seen from directly above: the canopy of the chute " +
      "fills most of the frame with the canister slung beneath it, rigging lines visible. Faded olive canvas " +
      "chute, ribbed metal canister." +
      UNMARKED,
  },
  {
    f: "warhawks/bg-front",
    bg: true,
    terrain: true,
    p:
      TILE +
      "A WW2 battlefield seen from high overhead: cratered fields, zigzag trench lines, burnt black patches, " +
      "hedgerows and dirt tracks between them. Muted olive, brown and ash grey. Aerial reconnaissance feel.",
  },

  // ── ARMOR CLASH: a lane battler. Units rotate; card faces do not. ─────
  {
    f: "armorclash/unit-mortar",
    p:
      TOPDOWN +
      "A static MORTAR PIT seen from directly above: a ring of sandbags around a dug-in emplacement with a " +
      "short fat mortar tube pointing straight up out of the centre, ammunition crates stacked at the rim. " +
      "Clearly a fixed position, not a vehicle." +
      UNMARKED,
  },
  {
    f: "armorclash/tower",
    p:
      TOPDOWN +
      "A fortified STONE GUN TOWER seen from directly above: a square crenellated parapet with a gun " +
      "emplacement in the centre of the roof, weathered grey stone, sandbags at the corners." +
      UNMARKED,
  },
  {
    f: "armorclash/tower-hq",
    p:
      TOPDOWN +
      "A large fortified STONE KEEP seen from directly above: a broad crenellated roof with a central " +
      "courtyard, corner bastions, a flagpole with a plain unmarked banner. Weathered grey stone, " +
      "battle-scarred. Visibly the biggest structure on the board." +
      UNMARKED,
  },
  {
    f: "armorclash/bridge",
    terrain: true,
    p:
      TOPDOWN +
      "A WOODEN PLANK BRIDGE DECK seen from directly above: heavy timber planks laid crosswise with visible " +
      "grain and bolt heads, low log kerbs down both long edges. Just the deck, no water, no banks.",
  },
  {
    f: "armorclash/bg-field",
    bg: true,
    terrain: true,
    p:
      TILE +
      "A grass battlefield pitch seen from directly overhead: mown grass with faint alternating stripes, " +
      "worn bare dirt patches where fighting has churned it, scattered stones. Muted green.",
  },

  // ── BREAKTHROUGH: the crowd runner. Nothing rotates. ──────────────────
  {
    f: "breakthrough/tank-lead",
    p:
      TOPDOWN +
      "An allied LIGHT TANK seen from directly above, pointing straight up the frame: compact hull, narrow " +
      "track runs, a small turret with a short gun. Well-kept olive drab, clean silhouette, reads as the " +
      "one the player controls." +
      UNMARKED,
  },
  {
    f: "breakthrough/barricade",
    p:
      TOPDOWN +
      "A section of SANDBAGGED TIMBER BARRICADE seen from directly above: a course of sandbags laid along " +
      "the top of a timber wall, upright posts visible at intervals. The section runs LEFT TO RIGHT across " +
      "the frame and is designed to tile end to end with an identical copy of itself." +
      UNMARKED,
  },
  {
    f: "breakthrough/redoubt",
    p:
      TOPDOWN +
      "A fortified GUN POSITION seen from directly above: a horseshoe of sandbags around a dug-in pit with " +
      "a heavy gun barrel pointing down the frame toward the viewer, log roofing over the rear half, " +
      "ammunition boxes stacked inside. Reads as the thing at the end of the road." +
      UNMARKED,
  },
  {
    // The BOARD only. The operator painted on it (x2, +40) is the whole
    // decision the game asks you to make, so it stays drawn in code -- a
    // generated number would be unreadable at size, wrong for the level, and
    // impossible to localise. Art supplies the sign; code supplies the rule.
    f: "breakthrough/gate-sign",
    terrain: true,
    p:
      TOPDOWN +
      "A blank wooden ROAD SIGN BOARD on two posts, seen from directly above: a plain rectangular timber " +
      "board with visible grain, iron bracket fixings at the corners, mounted across two upright posts. " +
      "The board face is COMPLETELY BLANK: no writing, no numbers, no symbols, no arrows, nothing painted " +
      "on it at all. Weathered bare timber." +
      UNMARKED,
  },
  {
    f: "breakthrough/bg-road",
    bg: true,
    terrain: true,
    p:
      TILE +
      "A packed dirt road surface seen from directly overhead: compacted earth, transverse wash-boarding " +
      "ruts running across it, loose gravel and small stones, tyre and track marks. Warm brown, NOT sandy, " +
      "NOT pale. No markings, no lines, no verge, no grass.",
  },
  {
    f: "breakthrough/bg-verge",
    bg: true,
    terrain: true,
    p:
      TILE +
      "Rough uncut grass verge seen from directly overhead: tussocky dark green grass with weeds, thistles " +
      "and patches of bare earth showing through. No road, no path.",
  },
];

// ────────────────────────────────────────────────────────────────────────

function fullPrompt(it) {
  // `terrain: true` swaps the subject-bearing house style for the neutral one.
  // See TERRAIN_STYLE: without it, asking this pipeline for a rock returns a
  // tank, because STYLE names war machines and the model believes it.
  const style = it.terrain ? TERRAIN_STYLE : STYLE;
  if (it.bg) return it.p + " " + style + BG;
  return it.p + " " + style + PLATE;
}

function genOne(it, key) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const [game, name] = it.f.split("/");
    const safe = it.f.replace(/\//g, "_");
    const bodyFile = path.join(os.tmpdir(), `r3_${safe}.json`);
    const outFile = path.join(os.tmpdir(), `r3_${safe}_out.json`);
    fs.writeFileSync(
      bodyFile,
      JSON.stringify({ model: "gpt-image-2", prompt: fullPrompt(it), size: "1024x1024", n: 1 }),
    );
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
          // Masters always land in _raw. Only bg-* are ALSO written straight to
          // finals, because they are full-frame paintings with nothing to key.
          const rawDir = path.join(RAW, game);
          fs.mkdirSync(rawDir, { recursive: true });
          fs.writeFileSync(path.join(rawDir, `${name}.png`), buf);
          if (it.bg) {
            const finDir = path.join(GAMES, game);
            fs.mkdirSync(finDir, { recursive: true });
            fs.writeFileSync(path.join(finDir, `${name}.png`), buf);
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
  const filter = args.find((a) => !a.startsWith("--"));

  let items = ITEMS;
  if (filter) items = items.filter((it) => it.f === filter || it.f.startsWith(`${filter}/`));
  if (missingOnly) {
    items = items.filter((it) => {
      const [game, name] = it.f.split("/");
      return !fs.existsSync(path.join(RAW, game, `${name}.png`));
    });
  }
  if (!items.length) {
    console.log("nothing to do");
    return;
  }

  const key = apiKey();
  console.log(`${items.length} items\n`);
  let ok = 0;
  // Serial on purpose: the image endpoint rate-limits hard, and a failed batch
  // that burned every item's credits is worse than a slow one.
  for (const it of items) {
    if (await genOne(it, key)) ok++;
  }
  console.log(`\n${ok}/${items.length} landed.`);
  console.log("NEXT: node key-s5-games.js       (keys every non-bg raw)");
  console.log("      python downscale-s5-bg.py; python webp-s5-bg.py");
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
