/**
 * riot-ingest.mjs (ADR-0124): normalizes third-party sprite packs into the
 * uniform-cell strips riot-atlas.mjs packs. THE LICENSING WALL: everything
 * this script reads and writes lives in gitignored art-src/riot/ - CraftPix
 * material never reaches git or public/. Only riot-atlas.mjs's transformed
 * output enters public/s6-art/games/riot/.
 *
 * In:  art-src/riot/packs/<pack>/...        (per the PACKS table below)
 * Out: art-src/riot/strips/<char>/<anim>.png  (square CELL cells, one row)
 *      art-src/riot/strips/<char>/meta.json   (cell/kind/hitFrame overrides)
 *
 * Source forms (NEVER guess a grid - multi-row needs an explicit entry):
 *   A { src: "dir/glob*.png", anim }            per-frame PNGs, sorted
 *   B { src: "strip.png", anim }                single row: width%height===0
 *                                               else alpha-gap column scan
 *   C { src, sidecar?, animMap:{anim:[a,b]} }   strip sliced by frame ranges;
 *                                               sidecar JSON = exact rects
 *   D { src, cols, rows, animMap:{anim:row} }   multi-row, explicit only
 *
 * Laws: cells are square, 96 (hero/thugs) / 128 (bosses); source pixels are
 * NEVER upscaled; baseline is normalized per-CHARACTER from idle frame 0's
 * bbox (bottom -> CELL-6, center-x -> CELL/2) and the same canvas anchor is
 * applied to every frame - never per-frame (the moonwalk bug); flipSource
 * mirrors left-facing packs before anything else looks at pixels; content
 * that cannot fit its cell is a HARD ERROR (exit 1), not a resize.
 *
 * Run: node scripts/riot-ingest.mjs [pack ...]   (default: every PACKS key)
 */

import { PNG } from "pngjs";
import { globSync } from "glob";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PACKS_DIR = join(ROOT, "art-src", "riot", "packs");
const OUT_DIR = join(ROOT, "art-src", "riot", "strips");

const VOCAB = {
  hero: ["idle", "walk", "jab1", "jab2", "jab3", "finisher", "jump", "jumpkick", "dash", "swing", "hurt", "down", "rise", "death"],
  enemy: ["idle", "walk", "attack", "hurt", "death"],
  props: [],
};
const CELL_FOR = { hero: 96, thug: 96, boss: 128, props: 96 };
const FOOT = 6; // baseline sits at CELL - FOOT

/**
 * THE MAPPING TABLE. One entry per pack; chars name their output folder,
 * kind picks cell+vocab (hero|thug|boss|props), flipSource mirrors a
 * left-facing pack, hitFrame overrides riot-atlas's 0.6*n default.
 * CraftPix entries land here when Mike's zips do - same shapes, new rows.
 */
const PACKS = {
  "cc0-chewbatrij": {
    chars: [
      {
        char: "hero-cc0", kind: "hero",
        sources: [{
          src: "ingame_spritesheets/queen.png",
          sidecar: "ingame_spritesheets/queen.json",
          animMap: {
            idle: [0, 2], hurt: [3, 3], down: [4, 8], rise: [9, 9],
            jab1: [10, 11], jab2: [12, 13], jab3: [14, 16],
            swing: [17, 19], finisher: [20, 24], dash: [25, 25],
          },
        }],
        hitFrame: { finisher: 3 },
        // authored corrections, found on the contact report ONCE and recorded
        // here (ART_SPEC's yawOffset pattern): the pack draws the lying body
        // 8px below the standing feet line; our cell has 6px under baseline.
        off: { down: [0, -2] },
      },
      {
        char: "thug-fistbot", kind: "thug", flipSource: true,
        sources: [{
          src: "ingame_spritesheets/fistbot.png",
          sidecar: "ingame_spritesheets/fistbot.json",
          animMap: { idle: [0, 0], walk: [1, 1], attack: [2, 2], hurt: [3, 3] },
        }],
      },
    ],
  },
  // ── CraftPix rows (Mike's zips, unzipped into art-src/riot/packs/) ───────
  // All strips are single-row squares (48px chars, 96px bosses) = form B,
  // except hero down (a range carved out of the death strip = form C).
  // FACING (measured empirically 2026-08-15, Mike's "wrong way" redline):
  // EVERY pack in this CraftPix cyberpunk series is authored RIGHT-facing
  // (thug-a raw knife thrust, thug-c raw pistol, boss truck headlights,
  // shark nose - all point right). The Client mirrors at scale.x=-1 and
  // assumes +1 = right, so NO flipSource on any of these rows. The first
  // ingest assumed "enemies face left" by convention and shipped every
  // machine facing away from the hero.
  "cp-cyberpunk": { // 856554 "3 cyberpunk characters" + 796772 extra anims (extra/)
    chars: [
      {
        // Punk: the Resistance-fighter of the three (Biker=greaser, Cyborg
        // reads machine-side). extra/2 extends the SAME character.
        char: "hero", kind: "hero",
        sources: [
          { src: "2 Punk/Punk_idle.png", anim: "idle" },
          { src: "extra/2/Walk.png", anim: "walk" },
          { src: "2 Punk/Punk_run.png", anim: "run" }, // Client asks "run" (falls back walk)
          { src: "extra/2/Dash.png", anim: "dash" },
          { src: "2 Punk/Punk_punch.png", anim: "jab1" },
          { src: "2 Punk/Punk_attack1.png", anim: "jab2" }, // the kick
          { src: "2 Punk/Punk_attack2.png", anim: "jab3" }, // heavy straight
          { src: "2 Punk/Punk_attack3.png", anim: "finisher" }, // crescent-arc swing
          { src: "2 Punk/Punk_run_attack.png", anim: "swing" }, // pipe swipe
          { src: "2 Punk/Punk_jump.png", anim: "jump" },
          { src: "2 Punk/Punk_doublejump.png", anim: "jumpkick" }, // the air flip
          { src: "2 Punk/Punk_hurt.png", anim: "hurt" },
          // death ends lying flat; the last two frames ARE the knockdown pose
          { src: "2 Punk/Punk_death.png", animMap: { death: [0, 5], down: [4, 5] } },
          // no rise in the pack: Client falls back rise->hurt (warned below)
        ],
      },
    ],
  },
  "cp-bar-street": { // 386974 bar-street enemies (6 chars; 2/4/5/6 unused)
    chars: [
      { // 1: trench-coat knifeman - the basic melee grunt silhouette
        char: "thug-a", kind: "thug",
        sources: [
          { src: "1/Idle.png", anim: "idle" }, { src: "1/Walk.png", anim: "walk" },
          { src: "1/Attack.png", anim: "attack" }, { src: "1/Hurt.png", anim: "hurt" },
          { src: "1/Death.png", anim: "death" },
        ],
      },
      { // 3: red-mohawk with the glowing stun baton - fast harasser read
        char: "thug-b", kind: "thug",
        sources: [
          { src: "3/Idle.png", anim: "idle" }, { src: "3/Walk.png", anim: "walk" },
          { src: "3/Attack.png", anim: "attack" }, { src: "3/Hurt.png", anim: "hurt" },
          { src: "3/Death.png", anim: "death" },
        ],
      },
    ],
  },
  "cp-residential": { // 823313 residential-area enemies (6 chars; only Shooter used)
    chars: [
      { // 2 Shooter: green-cap pistol raise = the thrower/ranged read
        char: "thug-c", kind: "thug",
        sources: [
          { src: "2 Shooter/Idle.png", anim: "idle" }, { src: "2 Shooter/Walk.png", anim: "walk" },
          { src: "2 Shooter/Attack1.png", anim: "attack" },
          { src: "2 Shooter/Attack2.png", anim: "attack2" }, // extra fire variants,
          { src: "2 Shooter/Attack3.png", anim: "attack3" }, // harmless spares
          { src: "2 Shooter/Hurt.png", anim: "hurt" }, { src: "2 Shooter/Death.png", anim: "death" },
        ],
      },
    ],
  },
  "cp-chinese-street": { // 255422 chinese-street enemies (6 chars; only 3 used)
    chars: [
      { // 3: the oversized bruiser - blocker/charger heavy silhouette
        char: "thug-d", kind: "thug",
        sources: [
          { src: "3/Idle.png", anim: "idle" }, { src: "3/Walk.png", anim: "walk" },
          { src: "3/Attack.png", anim: "attack" }, { src: "3/Hurt.png", anim: "hurt" },
          { src: "3/Death.png", anim: "death" },
        ],
      },
    ],
  },
  "cp-beach-bosses": { // 899060 cyberpunk bosses (beach location; 3 unused)
    chars: [
      { // 2: armored gun-truck - BULLRIG (charge, level 1 streets): Drive IS the charge
        char: "boss-1", kind: "boss",
        sources: [
          { src: "2/Idle.png", anim: "idle" }, { src: "2/Drive.png", anim: "walk" },
          { src: "2/Attack.png", anim: "attack" }, // MG burst
          { src: "2/Attack4.png", anim: "attack2" }, // rocket volley
          { src: "2/Attack3.png", anim: "attack3" }, // sustained MG
          { src: "2/Special.png", anim: "special" }, // spare
          { src: "2/Hurt.png", anim: "hurt" }, { src: "2/Death.png", anim: "death" },
        ],
      },
      { // 1: cyber-shark - FLICKER (warp, level 3 facility): floats, blinks in/out
        char: "boss-3", kind: "boss",
        sources: [
          { src: "1/Idle.png", anim: "idle" }, { src: "1/Swim.png", anim: "walk" },
          { src: "1/Attack.png", anim: "attack" }, // the bite
          { src: "1/Attack3.png", anim: "attack2" }, // speed-trail lunge
          { src: "1/Attack2.png", anim: "attack3" }, // diagonal bite
          { src: "1/Swim2.png", anim: "swim2" }, { src: "1/Attack4.png", anim: "attack4" }, // spares
          { src: "1/Hurt.png", anim: "hurt" }, { src: "1/Hurt2.png", anim: "hurt2" },
          { src: "1/Death.png", anim: "death" },
        ],
        // the shark FLOATS: idle[0] hovers 24px off the source frame bottom,
        // so the bbox baseline shoves every frame +24 and the diagonal anims
        // overflow the 128 cell. Uniform -24 on EVERY anim restores the
        // pack's own hover height (canvas bottom = baseline) and keeps all
        // anims mutually aligned - the sim's ground shadow sells the float.
        off: {
          idle: [0, -24], walk: [0, -24], attack: [0, -24], attack2: [0, -24],
          attack3: [0, -24], swim2: [0, -24], attack4: [0, -24],
          hurt: [0, -24], hurt2: [0, -24], death: [0, -24],
        },
      },
    ],
  },
  "cp-factory-bosses": { // 412866 factory bosses (1 thug-sized + 2 unused, 3 used)
    chars: [
      { // 3: crab walker with paddle arms - LONGARM (limbs, level 2 forest)
        char: "boss-2", kind: "boss",
        sources: [
          { src: "3/Idle.png", anim: "idle" }, { src: "3/Walk.png", anim: "walk" },
          { src: "3/Attack.png", anim: "attack" }, // overhead scythe-paddle
          { src: "3/Attack2.png", anim: "attack2" }, // arm raised = laser channel (attackId 1)
          { src: "3/Attack3.png", anim: "attack3" }, // double-paddle flail
          { src: "3/WalkAttack.png", anim: "walkattack" }, { src: "3/WalkAttack2.png", anim: "walkattack2" }, // spares
          { src: "3/Hurt.png", anim: "hurt" }, { src: "3/Death.png", anim: "death" },
        ],
      },
    ],
  },
  // 318273 Doors and Portals: "1 Doors" strips are 192x64 = SIX 32x64 frames
  // (closed -> fully open), NOT 3 square cells - naive width%height slicing
  // would pair doors up, hence explicit form D. door1/2/3 keep the anim names
  // the props sheet already carries (they replace gen_props.py's procedural
  // flipbooks): door1 = orange hazard door (L1 OLD TOWN market street),
  // door2 = blue panel door (L2 THE PINES green zone), door3 = numbered
  // blast door (L3 THE FOUNDRY facility). Same char "props": this row runs
  // BEFORE procedural so procedural's meta.json (hitFrame hitspark:0) wins.
  "cp-doors": {
    chars: [
      {
        char: "props", kind: "props",
        sources: [
          { src: "1 Doors/3.png", cols: 6, rows: 1, animMap: { door1: [0, 0, 5] } },
          { src: "1 Doors/4.png", cols: 6, rows: 1, animMap: { door2: [0, 0, 5] } },
          { src: "1 Doors/7.png", cols: 6, rows: 1, animMap: { door3: [0, 0, 5] } },
        ],
      },
    ],
  },
  "procedural": {
    chars: [
      {
        char: "props", kind: "props",
        sources: [
          { src: "hitspark/*.png", anim: "hitspark" },
          { src: "pipe/*.png", anim: "pipe" },
          { src: "blaster/*.png", anim: "blaster" },
          // door1/2/3 procedural flipbooks REPLACED by the cp-doors row above
          // (gen_props.py still generates them; they are no longer ingested)
        ],
        hitFrame: { hitspark: 0 },
      },
    ],
  },
};

const errors = [];
const readPng = (p) => PNG.sync.read(readFileSync(p));

/** frame = own little canvas: {w, h, data} RGBA. */
function crop(png, x, y, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let r = 0; r < h; r++)
    png.data.copy(out, r * w * 4, ((y + r) * png.width + x) * 4, ((y + r) * png.width + x + w) * 4);
  return { w, h, data: out };
}

function mirror(f) {
  const out = Buffer.alloc(f.data.length);
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++)
      f.data.copy(out, (y * f.w + (f.w - 1 - x)) * 4, (y * f.w + x) * 4, (y * f.w + x) * 4 + 4);
  return { w: f.w, h: f.h, data: out };
}

function bbox(f) {
  let x0 = f.w, y0 = f.h, x1 = -1, y1 = -1;
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++)
      if (f.data[(y * f.w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** single-row split: exact division if width%height===0, else alpha-gap scan. */
function splitRow(png, label) {
  if (png.width % png.height === 0) {
    const c = png.height;
    return Array.from({ length: png.width / c }, (_, i) => crop(png, i * c, 0, c, png.height));
  }
  const empty = [];
  for (let x = 0; x < png.width; x++) {
    let has = false;
    for (let y = 0; y < png.height && !has; y++) has = png.data[(y * png.width + x) * 4 + 3] > 0;
    empty.push(!has);
  }
  const frames = [];
  let start = -1;
  for (let x = 0; x <= png.width; x++) {
    const e = x === png.width ? true : empty[x];
    if (!e && start < 0) start = x;
    if (e && start >= 0) { frames.push(crop(png, start, 0, x - start, png.height)); start = -1; }
  }
  if (!frames.length) errors.push(`${label}: alpha-gap scan found no frames`);
  return frames;
}

/** expand one source entry -> [{anim, frames:[...]}] */
function loadSource(packDir, srcDef, label) {
  const files = globSync(srcDef.src, { cwd: packDir, posix: true }).sort();
  if (!files.length) { errors.push(`${label}: no files match ${srcDef.src}`); return []; }

  if (srcDef.anim) {
    const frames = files.length > 1
      ? files.map((f) => { const p = readPng(join(packDir, f)); return crop(p, 0, 0, p.width, p.height); }) // form A
      : splitRow(readPng(join(packDir, files[0])), label); // form B
    return [{ anim: srcDef.anim, frames }];
  }

  const png = readPng(join(packDir, files[0]));
  let all;
  if (srcDef.cols && srcDef.rows) { // form D: explicit grid only, never guessed
    const cw = png.width / srcDef.cols, ch = png.height / srcDef.rows;
    if (cw % 1 || ch % 1) { errors.push(`${label}: ${png.width}x${png.height} not divisible by ${srcDef.cols}x${srcDef.rows}`); return []; }
    return Object.entries(srcDef.animMap).map(([anim, row]) => {
      const [r, c0, c1] = Array.isArray(row) ? row : [row, 0, srcDef.cols - 1];
      return { anim, frames: Array.from({ length: c1 - c0 + 1 }, (_, i) => crop(png, (c0 + i) * cw, r * ch, cw, ch)) };
    });
  }
  if (srcDef.sidecar) { // form C with exact rects
    const j = JSON.parse(readFileSync(join(packDir, srcDef.sidecar), "utf8"));
    const list = Array.isArray(j.frames) ? j.frames : Object.values(j.frames);
    all = list.map((f) => crop(png, f.frame.x, f.frame.y, f.frame.w, f.frame.h));
  } else all = splitRow(png, label); // form C over a plain strip
  return Object.entries(srcDef.animMap).map(([anim, [a, b]]) => {
    if (b >= all.length) { errors.push(`${label}/${anim}: range ${a}-${b} exceeds ${all.length} frames`); return { anim, frames: [] }; }
    return { anim, frames: all.slice(a, b + 1) };
  });
}

function ingestChar(pack, def) {
  const packDir = join(PACKS_DIR, pack);
  const CELL = CELL_FOR[def.kind];
  const anims = def.sources.flatMap((s) => loadSource(packDir, s, `${pack}/${def.char}`));
  const byName = Object.fromEntries(anims.map((a) => [a.anim, a.frames.map((f) => (def.flipSource ? mirror(f) : f))]));

  // per-CHARACTER anchor from idle frame 0 (falls back to first anim, warned)
  const baseAnim = byName.idle?.length ? "idle" : Object.keys(byName)[0];
  const f0 = byName[baseAnim][0];
  const bb = bbox(f0);
  if (!bb) { errors.push(`${pack}/${def.char}: ${baseAnim}[0] is fully transparent`); return; }
  // canvas bottom-center of every frame lands on this fixed cell point:
  const anchor = def.kind === "props"
    ? { x: CELL / 2, y: CELL / 2, center: true }
    : { x: CELL / 2 - ((bb.x0 + bb.x1 + 1) / 2 - f0.w / 2), y: CELL - FOOT - (bb.y1 + 1 - f0.h), center: false };

  const outDir = join(OUT_DIR, def.char);
  mkdirSync(outDir, { recursive: true });
  const report = [];
  for (const [anim, frames] of Object.entries(byName)) {
    if (!frames.length) continue;
    const [offX, offY] = def.off?.[anim] || [0, 0]; // authored per-ANIM nudge, never per-frame
    const strip = new PNG({ width: frames.length * CELL, height: CELL });
    frames.forEach((f, i) => {
      if (f.w > CELL || f.h > CELL) { errors.push(`${def.char}/${anim}[${i}]: frame ${f.w}x${f.h} exceeds ${CELL}px cell (no-upscale law: shrink is banned too - route to a bigger cell kind)`); return; }
      const dx = Math.round(anchor.x - f.w / 2) + offX;
      const dy = Math.round(anchor.center ? anchor.y - f.h / 2 : anchor.y - f.h) + offY;
      const b = bbox(f);
      if (b && (b.x0 + dx < 0 || b.x1 + dx >= CELL || b.y0 + dy < 0 || b.y1 + dy >= CELL))
        errors.push(`${def.char}/${anim}[${i}]: content overflows cell after baseline (bbox ${b.x0},${b.y0}-${b.x1},${b.y1} shifted ${dx},${dy})`);
      for (let y = 0; y < f.h; y++) {
        const ty = y + dy;
        if (ty < 0 || ty >= CELL) continue;
        for (let x = 0; x < f.w; x++) {
          const tx = x + dx;
          if (tx < 0 || tx >= CELL) continue;
          f.data.copy(strip.data, ((ty) * strip.width + i * CELL + tx) * 4, (y * f.w + x) * 4, (y * f.w + x) * 4 + 4);
        }
      }
    });
    writeFileSync(join(outDir, `${anim}.png`), PNG.sync.write(strip));
    report.push(`    ${anim.padEnd(9)} ${String(frames.length).padStart(2)}f  src ${frames[0].w}x${frames[0].h}`);
  }
  writeFileSync(join(outDir, "meta.json"), JSON.stringify({ char: def.char, kind: def.kind, cell: CELL, hitFrame: def.hitFrame || {}, flipSource: !!def.flipSource, anchor: { x: anchor.x, y: anchor.y } }));

  const missing = (VOCAB[def.kind === "hero" ? "hero" : def.kind === "props" ? "props" : "enemy"]).filter((v) => !byName[v]?.length);
  console.log(`  ${def.char} (${def.kind}, cell ${CELL}${def.flipSource ? ", flipped" : ""}) anchor ${anchor.x.toFixed(1)},${anchor.y.toFixed(1)}${baseAnim !== "idle" && def.kind !== "props" ? ` [WARN: baseline from ${baseAnim}, no idle]` : ""}`);
  report.forEach((l) => console.log(l));
  if (missing.length) console.log(`    MISSING vocab: ${missing.join(", ")} (Client falls back per the chain)`);
}

const packs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PACKS);
for (const pack of packs) {
  if (!PACKS[pack]) { errors.push(`no PACKS entry for "${pack}" - multi-row grids are never guessed, add the mapping`); continue; }
  if (!existsSync(join(PACKS_DIR, pack))) { errors.push(`pack folder missing: art-src/riot/packs/${pack}`); continue; }
  console.log(`pack ${pack}:`);
  PACKS[pack].chars.forEach((c) => ingestChar(pack, c));
}
if (errors.length) {
  console.error(`\nHARD ERRORS (${errors.length}):`);
  errors.forEach((e) => console.error(`  ! ${e}`));
  process.exit(1);
}
console.log(`\nclean -> ${OUT_DIR}`);
