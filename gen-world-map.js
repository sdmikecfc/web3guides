#!/usr/bin/env node
/**
 * WORLD MAP GENERATOR — gpt-image-2.
 *
 * WHY THIS MODEL FOR THIS JOB. Five renders on the other model produced
 * gorgeous jungle and ignored the one instruction that actually matters:
 * "include ~30 evenly distributed clearings". It treated the count as flavour,
 * yielding 12 usable clearings on one attempt and 7 on the next, against a
 * requirement of 21+ (16 domains, base, four games). gpt-image-2's edge is
 * COMPOSITIONAL PROMPT ADHERENCE — following multi-part structural
 * instructions — which is precisely the failure mode here.
 *
 *   node gen-world-map.js            # all variants
 *   node gen-world-map.js grid       # one named variant
 *
 * Writes public/s5-art/world/_raw/variants/<name>.png
 *
 * Cost note: gpt-image-2 at 1536x1024 quality:high. The budget is small, so
 * this runs two variants by default, not six.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "public", "s5-art", "world", "_raw", "variants");

function apiKey() {
  const env = path.join(ROOT, ".env.local");
  const txt = fs.readFileSync(env, "utf8");
  const m = txt.match(/OPENAI_API_KEY\s*=\s*(.+)/);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  // STRIP QUOTES. The value in .env.local is quoted, and a naive \S+ capture
  // takes the quote characters with it — which OpenAI rejects as 401
  // "Incorrect API key provided", looking exactly like an expired key.
  return m[1].trim().replace(/^["']|["']$/g, "");
}

// ── The shared brief. Style is settled; the VARIANTS differ only in how the
//    clearing structure is described, because that is the part that keeps
//    failing and the part worth A/B testing.
const LOOK = `
STYLE, AND THIS IS THE MOST IMPORTANT INSTRUCTION IN THE PROMPT:
A BOLD GRAPHIC HAND-ILLUSTRATED ADVENTURE-GAME WORLD. Modern point-and-click
adventure art direction: every shape drawn with a CONFIDENT THICK INK OUTLINE
of varying weight, filled with FLAT BLOCKS OF VIVID COLOUR, then textured on
top with visible dry brush, ink wash and paper grain. Chunky simplified
silhouettes. Deliberately WONKY HAND-DRAWN GEOMETRY — nothing is perfectly
straight, nothing is perfectly round, everything leans and wobbles with charm.
A layered CUT-PAPER COLLAGE quality, like coloured shapes stacked in front of
one another. Limited harmonious palette, strong value contrast, bold readable
shapes even at a glance. Playful, characterful, storybook.

It is NOT a photograph. NOT aerial photography. NOT a drone shot. NOT a
satellite image. NOT photorealistic. NOT a 3D render. NOT rendered CGI. NOT a
real-time-strategy minimap. NOT a uniform carpet of jungle seen from a plane.
NOT soft airbrushed digital painting. If it looks like a real photograph of
real terrain, it is WRONG. If it has no visible ink outlines, it is WRONG.

WAR-THEMED, in that same bold illustrated language, never realistic: rusted
armour plate, stacked sandbags, coils of barbed wire, splintered timber
barricades, shell craters, deep tank-track ruts scarring the grass, camouflage
netting, ammo crates, a torn banner on a leaning pole. All of it drawn as
chunky outlined graphic shapes, weathered and characterful, half reclaimed by
grass and vine. The war passed through; the world is winning it back.

CAMERA, THE SECOND MOST IMPORTANT INSTRUCTION:
A LOW OBLIQUE three-quarter view, roughly 35 DEGREES above the ground plane.
HERE IS THE TEST: EVERY TREE IS DRAWN FROM THE SIDE. You see its TRUNK and the
FRONT of its canopy, the way a tree is drawn in a storybook — never a green
circle seen from above. You see the FRONT FACES of the cliffs and mountains,
the SIDE of every boulder, the BANK of the river, the far SHORE of the lake.
Everything has visible HEIGHT and stands UP off the ground, casting a shadow
ACROSS the ground toward the lower right.
If you are looking down at the TOPS of the trees, it is WRONG.

THE GROUND IS OPEN BY DEFAULT — READ THIS CAREFULLY, IT IS THE WHOLE PICTURE:
This is NOT solid forest with holes cut in it. It is OPEN COUNTRY WITH THINGS
STANDING ON IT. The default surface of the world is open walkable ground —
sunlit grass meadow, packed dirt, pale sand, mossy stone. Trees stand ON that
ground as SEPARATE PAINTED OBJECTS and small groves, with open ground visible
BETWEEN them. Never a continuous canopy. ABOUT HALF THE IMAGE IS OPEN GROUND.

LANDMARKS — the world must have BIG DISTINCT FEATURES, not one uniform texture.
Spread these around, each clearly different from the others:
  - a range of grey rocky MOUNTAINS with visible front cliff faces and pale
    stone peaks, with a pass winding through them
  - a calm blue LAKE with a painted shoreline, reeds and rocks breaking the
    surface
  - a winding turquoise RIVER with a small WATERFALL where it drops
  - LONE TREES standing by themselves out on open grass, casting long shadows
  - small GROVES of three to six trees
  - rocky outcrops and standing boulders
  - clearly different-coloured GROUND ZONES: pale dry sand, dark ploughed
    earth, a mossy green hollow, a small reed marsh
  - flowering meadows in orange, magenta and yellow

VEGETATION VARIETY: tall palms with visible trunks, spreading broadleaf trees,
tree ferns, banana clumps, bamboo stands, hanging vines, undergrowth, moss,
flowering shrubs. Many distinct greens from lime through emerald to deep
blue-green shade. Scatter small painted details generously — mushrooms, fallen
logs, reeds, rock piles, tufts of grass, little pools — so there is something
to find everywhere when you zoom in.

LIGHT: brilliant late-morning tropical sun from HIGH ON THE UPPER LEFT at ten
o'clock. Every object casts a simple graphic shadow down and to the right
across the ground.

COLOUR: gorgeous, vivid, saturated, warm and inviting. Sunlit greens, warm
ochre earth, pale sand, brilliant turquoise water, rust orange and bone white
as accents. Rich colour in the shadows, never grey, never black, never muddy,
never washed out.

NO CAVES, no tunnels. ABSOLUTELY NO BUILDINGS: no castles, villages, houses,
huts, towers, tents, standing walls, statues, vehicles, people, flags or
banners. No text, letters, numbers, icons, UI, compass rose, grid, border,
frame or vignette. Full-frame edge to edge.
`;

const PROMPTS = {
  // The count stated as a hard, checkable specification rather than a mood.
  grid: `A hand-illustrated fantasy adventure-game WORLD, an explorable
overworld. It is OPEN COUNTRY — grass, dirt, sand and stone — with trees,
rocks, mountains and water standing ON it as separate drawn objects.

Its most important structural property: the world contains 24 distinct STAGING
AREAS spread evenly across the whole image, IN THREE DIFFERENT SIZES. Count
them as you draw:
  - 4 LARGE, each about ONE SIXTH of the image wide, one in each quadrant, well
    away from the edges
  - 8 MEDIUM, each about one tenth of the image wide, spread between the large
    ones
  - 12 SMALL, each about one sixteenth of the image wide, filling the gaps so
    that every part of the world has one nearby

A STAGING AREA is an open, flat, unobstructed piece of ground with NOTHING
STANDING ON IT — no trees, no rocks, no water — clearly framed by whatever
surrounds it: a ring of trees, a bend in the road, the foot of a cliff, a
riverbank, a low stone kerb, a run of sandbags. NO TWO ARE ALIKE. Vary their
SHAPE — oval, kidney, wedge, long, lopsided, irregular — and vary their
SURFACE — short green grass, packed brown dirt, pale sand, cracked stone
paving, mossy flagstones, bare scorched earth. They must never look like
identical yellow circles and must never merge into one another.

A branching pale dirt road links them, running the full width and height of the
world and crossing the river at three separate plank-and-stone bridges in
different places.
${LOOK}`,

  clusters: `A hand-illustrated fantasy adventure-game WORLD, an explorable
overworld built as a PLAYABLE BOARD. It is OPEN COUNTRY — grass, dirt, sand and
stone — with trees, rocks, mountains and water standing ON it as separate drawn
objects.

Its most important structural property: 24 distinct STAGING AREAS in THREE
SIZES, arranged as SIX GROUPS OF FOUR — one group in each corner and two across
the middle. Each group has ONE LARGE staging area about one sixth of the image
wide and THREE SMALLER ones around it, close together but clearly separate.

A STAGING AREA is an open, flat, unobstructed piece of ground with NOTHING
STANDING ON IT — no trees, no rocks, no water — clearly framed by whatever
surrounds it: a ring of trees, a bend in the road, the foot of a cliff, a
riverbank, a low stone kerb, a run of sandbags. NO TWO ARE ALIKE. Vary their
SHAPE — oval, kidney, wedge, long, lopsided, irregular — and vary their
SURFACE — short green grass, packed brown dirt, pale sand, cracked stone
paving, mossy flagstones, bare scorched earth. No staging area may touch
another.

Between the groups stand the mountains, the lake, the groves and the scattered
lone trees. A branching pale dirt road links every group, crossing the river at
three plank-and-stone bridges in different places.
${LOOK}`,
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

// The require.main guard is mandatory here: a bare require() of this file would
// otherwise fire a billable batch. That has happened before in this repo.
if (require.main === module) {
  const names = process.argv.slice(2).filter((a) => PROMPTS[a]);
  const todo = names.length ? names : Object.keys(PROMPTS);
  const key = apiKey();
  console.log(`gpt-image-2, ${todo.length} variant(s): ${todo.join(", ")}`);
  Promise.all(todo.map((n) => one(n, key))).then((r) => {
    console.log(`${r.filter(Boolean).length}/${todo.length} generated -> ${OUT}`);
  });
}
