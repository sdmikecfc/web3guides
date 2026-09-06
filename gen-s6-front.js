#!/usr/bin/env node
/**
 * S6 FRONT ART - gpt-image-2: the battlefield's three generated pieces
 * (ADR-0122; everything else on the board is procedural or reused).
 *
 *   node gen-s6-front.js               # all three
 *   node gen-s6-front.js wash          # one
 *
 * wash    -> public/s6-art/front/_raw/wash.png     (ground strip underlay)
 * citadel -> public/s6-art/front/_raw/citadel.png  (THE WARDEN, far east)
 * walker  -> public/s6-art/front/_raw/walker.png   (giant machine unit)
 *
 * OPERATIONS LAW (paid for twice): NEVER chain this after a file edit with
 * `;` - verify the prompt in the file FIRST, then fire with `&&`.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "public", "s6-art", "front", "_raw");

function apiKey() {
  const env = path.join(ROOT, ".env.local");
  const txt = fs.readFileSync(env, "utf8");
  const m = txt.match(/OPENAI_API_KEY\s*=\s*(.+)/);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const PROMPTS = {
  wash: `A wide aerial view of a dieselpunk battlefront landscape, hand-painted strategy game style, seen from high above at a gentle three-quarter tilt, BRIGHT clear DAYLIGHT, warm saturated colors, crisp light. Along the far LEFT EDGE: the outskirts of a warm brass-and-copper human city, riveted rooftops, smokestacks with white steam, water towers, green fields, hedgerows and clustered trees. Along the far RIGHT EDGE: the outskirts of a cold chrome machine city, hexagonal server structures, dark alloy plates, thin glowing cyan seams, drone masts. The wide MIDDLE: open war-torn ground with scattered burned-out ruined buildings, collapsed farmhouses, bomb craters, trench scars, wrecked vehicles, broken bridges over a river, dead trees, debris fields - detailed but with plenty of OPEN GROUND between features so game pieces composited on top stay readable. NO units, NO people, NO text, NO icons, NO borders. Even daylight, soft shadows, painterly texture.`,
  citadel: `A single colossal chrome-and-black AI citadel fortress, dieselpunk-futuristic, seen from a high three-quarter overhead strategy-game angle so the roof and two walls are visible. Hexagonal layered architecture, glowing cyan circuit seams, a tall central spire projecting a thin cyan energy beam straight up, drone gantries, cold and imposing but painted in a rich hand-painted game art style with confident brushwork. Bright even daylight, sunlight from the upper left, crisp shadow falling down-right. Isolated on a plain flat off-white studio backdrop, no terrain, no other structures, no text, no watermark, nothing else in frame.`,
  walker: `One single giant quadruped war machine of a rogue AI army, a colossal chrome-and-gunmetal walker with a hexagonal armored body, four heavy piston legs, one large glowing cyan eye lens on the front, small antenna array on top. Dieselpunk-futuristic, hand-painted game art style with visible brushwork, believable worn metal. Viewed from a high three-quarter overhead strategy-game angle looking down, roof plates and two sides visible, facing right. Bright even daylight, sunlight from the upper left, crisp shadow down-right. Isolated on a plain flat off-white studio backdrop, no terrain, no scenery, no text, no watermark, nothing else in frame.`,
  fortress1: `A single machine-empire fortress stronghold as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette. A squat hexagonal chrome-and-black server citadel with layered alloy walls, glowing cyan circuit seams, a short central data spire with a cyan beam, drone perches, cold and imposing. Three-quarter overhead strategy-map view, roof and two walls visible. Isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame.`,
  fortress2: `A single machine-empire fortress stronghold as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette. A tall narrow chrome watchtower complex on a black alloy plinth, stacked hexagonal tiers, glowing cyan antenna crown, cable trusses to small outbuildings. Three-quarter overhead strategy-map view. Isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame.`,
  fortress3: `A single machine-empire fortress stronghold as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette. A wide low chrome bunker ring around a glowing cyan core pit, blast doors, radiator fins, perimeter pylons. Three-quarter overhead strategy-map view. Isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame.`,
  "bld-base": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a friendly resistance headquarters: a big riveted hangar with open doors, a mech silhouette inside, sandbag ring, radio mast, banner poles.`,
  "bld-board": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a command post hut with a huge wooden notice board covered in pinned papers and red string, floodlight.`,
  "bld-ironjaw": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a boxing arena tent: a circular fighting pit with rope ring, corner posts, spotlight rig, punching bag outside.`,
  "bld-strain": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a quarantined laboratory dome with glass panels, warning stripes, specimen tanks, vent stacks.`,
  "bld-stopclock": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a shooting range building with target silhouettes, a big stopwatch sign shape (no numbers), timing tower.`,
  "bld-arcade": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a cheerful arcade hall built from salvage: marquee lights, ticket booth, striped awning.`,
  "bld-challenges": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a muster field pavilion with flag poles, a podium, obstacle course elements beside it.`,
  "bld-kitchen": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a boarded-up diner building with a chef hat sign shape, padlocked door, friendly but closed.`,
  "prop-tree-oak": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a single leafy oak tree, warm green.`,
  "prop-tree-pine": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a single tall pine tree.`,
  "prop-tree-dead": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a single dead burned tree, bare branches.`,
  "prop-ruin-house": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a small ruined farmhouse, collapsed roof, scorched walls.`,
  "prop-ruin-tower": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a crumbled stone watchtower stump with rubble.`,
  "prop-statue-hero": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a heroic bronze statue of a standing mech on a stone plinth, laurel wreath.`,
  "prop-statue-fallen": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a toppled broken statue of a robot lying beside its cracked plinth.`,
  "prop-wreck-mech": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a burned-out wrecked mech carcass, rusted, vines growing on it.`,
  "prop-sandbags": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a crescent of stacked sandbags with a supply crate.`,
  "prop-watertower": `A single building-or-prop as a premium HD PIXEL ART game sprite, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, chunky readable silhouette, warm dieselpunk resistance style, brass and copper fittings, riveted steel, olive canvas awnings, amber windows, three-quarter overhead strategy-map view, roof and two walls visible, isolated on a plain flat off-white backdrop, no terrain, no text, no watermark, nothing else in frame. This one: a riveted water tower on stilts with a small ladder.`,
  "card-ironjaw": `A wide landscape key art scene as premium HD PIXEL ART game art, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, vibrant warm dieselpunk palette: inside a dieselpunk boxing pit, a battered olive-and-brass mech in a fighting stance faces a hulking chrome machine boxer under swinging spotlights, ropes in the foreground, sparks flying, crowd of silhouetted workers cheering. No text, no watermark.`,
  "card-strain": `A wide landscape key art scene as premium HD PIXEL ART game art, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, vibrant warm dieselpunk palette: seen from above, a glowing amber blob creature with pseudopods slips between chrome server corridors, chasing small scurrying robots, cyan circuit walls, one massive hunter robot looming with a searchlight. No text, no watermark.`,
  "card-stopclock": `A wide landscape key art scene as premium HD PIXEL ART game art, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, vibrant warm dieselpunk palette: a frozen moment in a white void room, a lone olive mech mid-dodge between hanging frozen red crystal bullets with visible trajectories, red crystalline enemies shattering, one clock motif glowing amber. No text, no watermark.`,
  "citadel2": `A single colossal machine-empire capital citadel as premium HD PIXEL ART game art, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, vibrant warm dieselpunk palette: an enormous layered hexagonal chrome-and-black fortress city with a towering central data spire projecting a bright cyan beam into the sky, concentric walls, drone swarms as tiny dots, glowing cyan seams, cold and imposing, chunky readable silhouette. Three-quarter overhead strategy-map view. Isolated on a plain flat off-white backdrop, no terrain, no text, no watermark.`,
  "td-drone": `A single small hovering combat drone of a machine army as premium HD PIXEL ART game art, smooth rendered modern pixel art like a remastered Nintendo strategy game, crisp pixel clusters, vibrant warm dieselpunk palette: viewed from DIRECTLY OVERHEAD in a straight top-down plan view, nose pointing RIGHT, chrome hexagonal body, four rotor pods, single cyan eye lens, small and menacing. Isolated on a plain flat off-white backdrop, no terrain, no text, no watermark.`,
  favicon: `A single small game icon as premium HD PIXEL ART, smooth rendered modern pixel art: a raised armored mech fist in warm brass and olive, clenched, facing forward, centered, bold chunky silhouette readable at 32 pixels, subtle amber glow rim. Isolated on a plain flat off-white backdrop, no text, no watermark, nothing else in frame.`,
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
  console.log(`gpt-image-2, ${todo.length} piece(s): ${todo.join(", ")}`);
  Promise.all(todo.map((n) => one(n, key))).then((r) => {
    console.log(`${r.filter(Boolean).length}/${todo.length} generated -> ${OUT}`);
  });
}
