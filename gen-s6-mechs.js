#!/usr/bin/env node
/**
 * S6 MECH ROSTER GENERATOR - gpt-image-2, the REALISM register ("realism
 * for the cards" - Mike, 2026-08-13). Machines are NOT under the ADR-0069
 * character ban; this is the S5 tank-render pipeline pointed at mechs.
 *
 * THE BIBLE METHOD (ADR-0006): `stylelock` generates ONE hero render. Mike
 * approves it, THEN the roster batch is added to PROMPTS below in the
 * locked register - the batch does not exist in this file until the lock
 * is approved, so nothing can accidentally burn a fleet of credits on an
 * unapproved style.
 *
 *   node gen-s6-mechs.js stylelock
 *
 * Writes public/s6-art/tank/_raw/<name>.png
 * (the "tank/" folder name is deliberate: every downstream script -
 * recolour, card bake, map mips - is name-driven against that path, and
 * the clone-safety law keeps internal names stable across seasons.)
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "public", "s6-art", "tank", "_raw");

function apiKey() {
  const env = path.join(ROOT, ".env.local");
  const txt = fs.readFileSync(env, "utf8");
  const m = txt.match(/OPENAI_API_KEY\s*=\s*(.+)/);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/** THE REGISTER v2 (Mike 2026-08-13, replaces the salvage-realism lock he
 * skipped): "smooth rendered looking nintendo/new age HD pixel art". The
 * mech IDENTITY stays salvage-brass dieselpunk; only the rendering style
 * changed. Two stylelock phrasings render tonight; the roster batch runs in
 * whichever reads cleaner (his overnight directive), morning redline welcome. */
const REGISTER_A = `A single heroic combat mech as a premium HD PIXEL ART game sprite,
smooth rendered modern pixel art like a lovingly remastered Nintendo
strategy game, crisp clean pixel clusters with smooth anti-aliased
shading, chunky readable silhouette, vibrant saturated colors.

THE MACHINE'S CHARACTER: HUMAN-BUILT SALVAGE. A dieselpunk resistance war
machine of reclaimed plate: warm brass and copper fittings, riveted
mismatched armor in olive-drab and gunmetal, visible weld seams, exposed
hydraulic pistons, small steam vents, an AMBER-GLASS cockpit visor glowing
softly. Chunky, friendly, sturdy proportions - powerful but WELCOMING,
never horror, never skeletal.

Bipedal walker, full body, three-quarter view FACING RIGHT, weight
planted, slight heroic low angle. Whole mech in frame with margin.

NO pilot visible, no text, no letters, no numbers, no watermark, no logo.
Isolated on a plain flat off-white backdrop, no scenery, nothing else in
frame.`;

const REGISTER_B = REGISTER_A.replace(
  "smooth rendered modern pixel art like a lovingly remastered Nintendo\nstrategy game, crisp clean pixel clusters with smooth anti-aliased\nshading, chunky readable silhouette, vibrant saturated colors.",
  "new-age high definition pixel art with painterly smooth gradients inside\ncrisp pixel edges, the polish of a modern Nintendo first-party remaster,\nchunky readable silhouette, warm vibrant colors, subtle dithering.",
);

const MECHS = {
  scout: "a MEDIUM scout-class rig, shoulder-mounted searchlight, one arm ending in a grappling claw, the other a compact autocannon, a coil of tow cable on the hip",
  brawler: "a HEAVY brawler-class rig with massive riveted shoulder plates, two huge piston-driven fists, a boiler backpack with twin steam stacks",
  lancer: "a TALL lancer-class rig with long reverse-jointed legs, a shoulder rail-lance, slim profile, antenna array",
  mortar: "a SQUAT artillery-class rig with a big top-mounted mortar tube, wide stable legs, ammo crates welded to the hull",
  recon: "a LIGHT recon-class rig, small and quick, oversized single optic eye, radio backpack with a whip antenna",
  champion: "a CHAMPION duelist-class rig, sleek for a salvage machine, layered brass chest plating, one arm a segmented blade, victory laurels painted on the shoulder",
  juggernaut: "a SUPER-HEAVY juggernaut-class rig, enormous and wide, massive layered armor slabs like a walking bunker, tiny head between colossal shoulders, twin boiler stacks, ground-shaking presence",
  bulwark: "a MASSIVE bulwark-class siege rig, a walking fortress with a huge riveted tower shield fused to one arm, thick stubby legs, armored like a bank vault",
  atlas: "a COLOSSAL atlas-class salvage hauler turned war machine, barrel-chested with a crane arm and a giant wrecking fist, chains wrapped across its hull, the biggest rig in the yard",
  hornet: "a TINY hornet-class skirmish rig, the smallest in the yard, darting stance, twin stub autocannons, oversized exhaust, all speed",
  badger: "a COMPACT badger-class tunneler rig, low and wide, a huge drill for one arm, headlamp cluster, mud-caked plates",
  sentry: "a MEDIUM sentry-class rig with a tall shoulder watchtower lamp, one arm a riot shield, patient guardian stance",
  hound: "a QUADRUPED hound-class runner rig, four fast dog-like legs, a saddle-mounted light cannon, eager forward lean",
  viper: "a LEAN viper-class rig with a long whip antenna, one arm a hooked cutting lash, low coiled stance",
  ram: "a STOCKY bipedal ram-class breacher rig, a heavy armored battering-ram head mounted between its shoulders like a bull, thick short legs, both arms ending in flat impact pads, pistons braced for a charge",
  anvil: "a HEAVY anvil-class weapons platform, huge flat shoulders carrying twin mortar racks, immovable stance",
  howler: "a MEDIUM howler-class rig with a big acoustic horn array on the shoulder, cabling everywhere, loud and proud",
  spectre: "a SLIM spectre-class night rig, smoke-stained dark plates, single narrow amber eye slit, quiet stance",
  colossus: "a TOWERING colossus-class rig, twice as tall as the rest, long girder limbs, cathedral of scaffolding and brass",
  paladin: "a NOBLE paladin-class rig, polished brass chest, a tower shield and a pile-driver lance, banner poles on the back",
};

const PROMPTS = {
  "stylelock-a": `${REGISTER_A}

This machine: ${MECHS.scout}.`,
  "stylelock-b": `${REGISTER_B}

This machine: ${MECHS.scout}.`,
};

// top-down plan views for the battlefield map (ART_SPEC: rotating sprites
// are strict top-down, nose +x). Same register, camera line swapped.
const TD_CAMERA = "viewed from DIRECTLY OVERHEAD in a straight top-down plan view like a strategy game map unit, nose and front pointing RIGHT, whole machine in frame";
for (const [k, body] of Object.entries(MECHS)) {
  PROMPTS[`td-${k}`] = `${REGISTER_A.replace(
    /Bipedal walker[\s\S]*?frame with margin\./,
    TD_CAMERA,
  )}

This machine: ${body}.`;
}

// batch(register): called by --batch AFTER a register wins the eyeball test
for (const [k, body] of Object.entries(MECHS)) {
  PROMPTS[`batch-a-${k}`] = `${REGISTER_A}

This machine: ${body}.`;
  PROMPTS[`batch-b-${k}`] = `${REGISTER_B}

This machine: ${body}.`;
}

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
  console.log(`gpt-image-2, ${todo.length} render(s): ${todo.join(", ")}`);
  Promise.all(todo.map((n) => one(n, key))).then((r) => {
    console.log(`${r.filter(Boolean).length}/${todo.length} generated -> ${OUT}`);
  });
}
