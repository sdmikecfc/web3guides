/**
 * Domain Kitchen M1 character bake (ADR-0101): code-generated character
 * animation STRIPS in the ref_B cozy style — chunky 2.5-head little people,
 * frame-by-frame poses authored in SVG, rasterized via @resvg/resvg-js.
 *
 * Output: public/chef-art/_raw/strips/<variant>/<anim>.png — one horizontal
 * strip per animation, 128x128 cells (the ADR's cell size). These are BUILD
 * INTERMEDIATES (vercelignored); scripts/dk-atlas.mjs packs them into the
 * shipped Pixi spritesheets. The future AI art pass replaces these strips
 * with generated ones and reruns the atlas step — the pipeline is identical.
 *
 * Views: front = character walking toward screen-down-right (se); the engine
 * mirrors it for sw. back = walking up-right (ne); mirrored for nw.
 * Registration: feet baseline at y=116 in every 128x128 cell; the shadow is
 * baked (safe here: iso characters swap facings, they never rotate).
 *
 * Animation sets:
 *   guest0..7: idle_f(2) walk_f(4) walk_b(4) sit(1) eat(2)
 *   waiter:    idle_f(2) walk_f(4) walk_b(4) carry_f(4) carry_b(4)
 *   chef:      idle_b(2) walk_f(4) walk_b(4) cook(2)
 *
 * Run: node scripts/dk-bake-chars.mjs
 */

import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shift, hslToHex } from "./dk-bake-room.mjs";

const OUT = join(process.cwd(), "public", "chef-art", "_raw", "strips");
const CELL = 128;
const BASE = 116; // feet baseline
const CX = 64;

// ── THE SHADING LAW, character edition (M7) ────────────────────────────────
// Same derive-don't-hand-pick transform as the room bake, with one constraint
// the room does not have:
//
//   CHARACTERS ARE LIT FROM DIRECTLY ABOVE, NEVER FROM A SIDE.
//
// scene.ts produces the sw and nw facings by MIRRORING these very textures
// (scale.set(-0.5, 0.5)). A left-hand key light would therefore become a
// right-hand key light every time a guest turns a corner, fighting the room's
// fixed lighting. A vertical gradient, or a radial whose focal point sits at
// top-CENTRE, is exactly symmetric under an x-mirror and survives untouched.
// Every highlight below is either centred or a symmetric pair for that reason.
const HUE_C = 250; // cool ambient in the shadows, warm key light from above
const up = (hex, a) => shift(hex, a, HUE_C);
const dn = (hex, a) => shift(hex, -a, HUE_C);
const SHC = hslToHex(HUE_C, 0.3, 0.13);

// per-strip <defs>, content-hashed so identical gradients dedupe across cells
let DEFS = [];
let DSEEN = new Map();
const def = (tpl) => {
  const hit = DSEEN.get(tpl);
  if (hit) return hit;
  let h = 2166136261;
  for (let i = 0; i < tpl.length; i++) h = Math.imul(h ^ tpl.charCodeAt(i), 16777619);
  const id = `c${DEFS.length.toString(36)}${(h >>> 0).toString(36)}`;
  DSEEN.set(tpl, id);
  DEFS.push(tpl.replace('id="@"', `id="${id}"`));
  return id;
};

/** top-focal radial: reads as a sphere, symmetric under mirroring */
const domeFill = (base, hi = 0.2, lo = 0.2) =>
  `url(#${def(`<radialGradient id="@" fx="0.5" fy="0.22" r="0.66"><stop offset="0" stop-color="${up(base, hi)}"/><stop offset="0.58" stop-color="${base}"/><stop offset="1" stop-color="${dn(base, lo)}"/></radialGradient>`)})`;

/** vertical gradient in user space: safe on any shape, mirror-invariant */
const vFill = (y0, y1, top, bot) =>
  `url(#${def(`<linearGradient id="@" gradientUnits="userSpaceOnUse" x1="0" y1="${f(y0)}" x2="0" y2="${f(y1)}"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`)})`;

/**
 * Ground contact. Soft by construction, NOT by feGaussianBlur: a cell has only
 * ~3px below the shadow, and dk-atlas.mjs slices at exact 128px boundaries, so
 * any blur bleed would ghost into the neighbouring frame of the packed sheet.
 */
const softShadowC = (cx, cy, rx, ry, a = 0.3) =>
  ell(cx, cy, rx, ry, `url(#${def(`<radialGradient id="@"><stop offset="0" stop-color="${SHC}" stop-opacity="${a}"/><stop offset="0.5" stop-color="${SHC}" stop-opacity="${f(a * 0.72)}"/><stop offset="0.8" stop-color="${SHC}" stop-opacity="${f(a * 0.26)}"/><stop offset="1" stop-color="${SHC}" stop-opacity="0"/></radialGradient>`)})`);

const f = (n) => (Math.round(n * 100) / 100).toString();
const ell = (cx, cy, rx, ry, fill, extra = "") =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" ${extra}/>`;
const circ = (cx, cy, r, fill, extra = "") =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" ${extra}/>`;
const rrect = (x, y, w, h, rx, fill, extra = "") =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, w) =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${f(w)}" stroke-linecap="round"/>`;

const SKINS = ["#f2cfa6", "#e0b184", "#b97e50", "#8a5a38"];
const HAIRC = ["#3a2a1e", "#6b4a2a", "#23252c", "#a86232", "#c9a15a"];
const SHIRTS = ["#c94f43", "#4a7fb5", "#6a8f4e", "#d9a05b", "#7a5aa0", "#c96a8e", "#3f9a8f", "#b5763f"];
const PANTS = ["#3a3f4a", "#5a4632"];
const SHOE = "#2b2320";
const SHADOW = "rgba(20,10,5,0.18)";

/**
 * Arm: a thick rounded line from the shoulder plus a hand dot. The sleeve sits
 * a tone below the torso so the limb separates from the body instead of
 * melting into it, and the hand gets its own little dome.
 */
function arm(sx, sy, ex, ey, sleeve, skin) {
  return (
    line(sx, sy, ex, ey, dn(sleeve, 0.12), 9) +
    line(sx, sy - 1, ex, ey - 1, up(sleeve, 0.06), 4.5) +
    circ(ex, ey, 4.5, domeFill(skin, 0.14, 0.16))
  );
}

/** the four hair styles, shared by the standing and seated draws */
function hairFront(p, v, headY) {
  const hc = v.hairColor;
  const hf = domeFill(hc, 0.2, 0.22);
  if (v.hairStyle === 0) {
    p.push(ell(CX, headY - 12, 26, 16, hf)); // bob cap
    p.push(rrect(38, headY - 6, 10, 22, 5, vFill(headY - 6, headY + 16, hc, dn(hc, 0.22))));
    p.push(rrect(80, headY - 6, 10, 22, 5, vFill(headY - 6, headY + 16, hc, dn(hc, 0.22))));
  } else if (v.hairStyle === 1) {
    p.push(ell(CX, headY - 14, 25, 13, hf)); // short crop
  } else if (v.hairStyle === 2) {
    p.push(ell(CX, headY - 14, 25, 13, hf)); // bun
    p.push(circ(CX, headY - 29, 8, domeFill(hc, 0.28, 0.18)));
  } else {
    const cc = v.capColor || "#4a7fb5";
    p.push(ell(CX, headY - 15, 25, 12, domeFill(cc, 0.24, 0.18))); // cap
    p.push(ell(CX + 13, headY - 7, 15, 5, dn(cc, 0.1)));
  }
  // a centred sheen: the single thing that turns a flat helmet into hair, and
  // it sits on the axis so it survives the sw/nw mirror unchanged.
  if (v.hairStyle !== 3) {
    p.push(ell(CX, headY - 19, 16, 3.4, up(hc, 0.26), 'opacity="0.32"'));
  }
}

/** glasses and scarves are symmetric pairs, so they mirror without breaking */
function accessories(p, v, headY, torsoY) {
  if (v.glasses) {
    p.push(circ(56, headY, 7, "none", `stroke="${dn("#3a3a40", 0.05)}" stroke-width="2"`));
    p.push(circ(72, headY, 7, "none", `stroke="${dn("#3a3a40", 0.05)}" stroke-width="2"`));
    p.push(line(63, headY, 65, headY, "#3a3a40", 2));
  }
  if (v.scarf) {
    p.push(rrect(46, torsoY - 3, 36, 9, 4.5, vFill(torsoY - 3, torsoY + 6, up(v.scarf, 0.16), dn(v.scarf, 0.12))));
  }
}

/**
 * One pose. view: "f"|"b". pose:
 *  bob (y lift), legMode: "apart"|"passL"|"passR"|"none",
 *  armL/armR: [ex,ey] endpoints (null = hang), carry/eat/cook extras.
 */
function draw(v, view, pose) {
  const bob = pose.bob || 0;
  const headY = 46 - bob;
  const torsoY = 66 - bob;
  const p = [];
  p.push(softShadowC(CX, BASE + 1, 25, 8.5)); // baked ground contact

  // ── legs ────────────────────────────────────────────────────────────────
  if (pose.legMode !== "none") {
    const leg = (x, lift) =>
      rrect(x, 100 - bob + lift, 10, 16 - lift, 4, vFill(100 - bob + lift, 116 - bob, v.pants, dn(v.pants, 0.22))) +
      rrect(x - 1, 110 - bob + lift, 12, 6, 3, vFill(110 - bob + lift, 116 - bob + lift, up(SHOE, 0.22), SHOE));
    if (pose.legMode === "apart") {
      p.push(leg(50, 0), leg(68, 0));
    } else if (pose.legMode === "passL") {
      p.push(leg(66, 0), leg(54, -5)); // planted right, lifted left
    } else if (pose.legMode === "passR") {
      p.push(leg(52, 0), leg(64, -5));
    } else {
      p.push(leg(52, 0), leg(66, 0)); // stand
    }
  }

  // right arm behind torso for slight depth
  if (pose.armR) p.push(arm(82, torsoY + 8, pose.armR[0], pose.armR[1] - bob, v.shirt, v.skin));

  // ── torso ───────────────────────────────────────────────────────────────
  p.push(rrect(44, torsoY, 40, 36, 11, vFill(torsoY, torsoY + 36, up(v.shirt, 0.16), dn(v.shirt, 0.2))));
  // a centred collar shadow under the chin: cheap, and it stops the head from
  // looking pasted onto a rectangle
  p.push(ell(CX, torsoY + 3, 13, 5, dn(v.shirt, 0.26), 'opacity="0.55"'));
  p.push(rrect(46, torsoY + 30, 36, 8, 4, vFill(torsoY + 30, torsoY + 38, v.pants, dn(v.pants, 0.18)))); // hip band
  if (v.buttons && view === "f") {
    for (let i = 0; i < 3; i++) {
      p.push(circ(57, torsoY + 8 + i * 9, 1.8, "#b9b0a0"));
      p.push(circ(71, torsoY + 8 + i * 9, 1.8, "#b9b0a0"));
    }
  }
  if (v.apron && view === "f") {
    p.push(rrect(48, torsoY + 18, 32, 40, 6, v.apron)); // waist apron over legs
    p.push(line(48, torsoY + 20, 80, torsoY + 20, "rgba(0,0,0,0.18)", 2));
  }
  if (v.apron && view === "b") {
    // apron bow at the small of the back
    p.push(ell(58, torsoY + 22, 6, 4, v.apron));
    p.push(ell(70, torsoY + 22, 6, 4, v.apron));
    p.push(circ(64, torsoY + 22, 3, v.apron));
  }

  // carried plate (back view: peeks above the shoulders, before the head)
  if (pose.carry && view === "b") {
    p.push(ell(CX, torsoY + 2, 15, 5, "#f6f2e7", `stroke="rgba(64,36,18,0.5)" stroke-width="1.4"`));
  }

  // left arm in front
  if (pose.armL) p.push(arm(46, torsoY + 8, pose.armL[0], pose.armL[1] - bob, v.shirt, v.skin));

  // carried plate (front view: on the hands)
  if (pose.carry && view === "f") {
    p.push(ell(CX, 84 - bob, 17, 6.5, "#f6f2e7", `stroke="rgba(64,36,18,0.5)" stroke-width="1.6"`));
    p.push(ell(CX, 82 - bob, 8, 3.5, "#c94f43"));
  }
  // fork to mouth while eating
  if (pose.fork) {
    p.push(line(pose.armR[0], pose.armR[1] - bob, pose.armR[0] - 2, pose.armR[1] - 10 - bob, "#8e8a82", 2.5));
  }

  // ── head ────────────────────────────────────────────────────────────────
  p.push(circ(CX, headY, 24, domeFill(v.skin, 0.16, 0.18)));
  if (v.toque) {
    p.push(ell(CX, headY - 36, 15, 8, domeFill("#f6f2e7", 0.1, 0.14)));
    p.push(rrect(52, headY - 38, 24, 22, 5, vFill(headY - 38, headY - 16, "#fdfbf5", "#e2dccb")));
    p.push(line(52, headY - 17, 76, headY - 17, "#cec8b6", 2.5));
  } else if (view === "f") {
    hairFront(p, v, headY);
  } else {
    // back of head: hair wraps fully, no face
    const hc = v.toque ? "#f6f2e7" : v.hairColor;
    p.push(ell(CX, headY - 6, 25, 21, domeFill(hc, 0.24, 0.2)));
    p.push(ell(CX, headY - 17, 15, 3.6, up(hc, 0.24), 'opacity="0.28"'));
    if (v.hairStyle === 2 && !v.toque) p.push(circ(CX, headY - 26, 8, domeFill(hc, 0.28, 0.18)));
    if (v.hairStyle === 3 && !v.toque) p.push(ell(CX, headY - 14, 25, 12, domeFill(v.capColor || "#4a7fb5", 0.24, 0.18)));
  }

  // ── face (front only) ───────────────────────────────────────────────────
  if (view === "f") {
    // blush first, so the eyes sit on top of it
    p.push(ell(52, headY + 6, 5.5, 3.2, "#e88b7d", 'opacity="0.34"'));
    p.push(ell(76, headY + 6, 5.5, 3.2, "#e88b7d", 'opacity="0.34"'));
    if (pose.blink) {
      p.push(line(53, headY, 59, headY, "#2b2320", 2.2));
      p.push(line(69, headY, 75, headY, "#2b2320", 2.2));
    } else {
      p.push(circ(56, headY, 2.9, "#2b2320"));
      p.push(circ(72, headY, 2.9, "#2b2320"));
      // catchlights at the TOP of each eye. Offset to one side they would
      // swap sides on the mirrored facings; centred on each pupil they do not.
      p.push(circ(56, headY - 1.1, 1.05, "#ffffff", 'opacity="0.9"'));
      p.push(circ(72, headY - 1.1, 1.05, "#ffffff", 'opacity="0.9"'));
    }
    p.push(line(61, headY + 10, 67, headY + 10, "#a06a4a", 2.4)); // little mouth
    accessories(p, v, headY, torsoY);
  }
  return p.join("");
}

/** Seated pose: shorter body, no legs (the table hides them), hands on lap. */
function drawSit(v, pose) {
  const p = [];
  p.push(softShadowC(CX, BASE - 3, 23, 7.5, 0.26));
  const torsoY = 78;
  const headY = 58;
  p.push(rrect(44, torsoY, 40, 32, 11, vFill(torsoY, torsoY + 32, up(v.shirt, 0.16), dn(v.shirt, 0.2))));
  p.push(ell(CX, torsoY + 3, 13, 5, dn(v.shirt, 0.26), 'opacity="0.55"'));
  if (pose.armR) p.push(arm(80, torsoY + 6, pose.armR[0], pose.armR[1], v.shirt, v.skin));
  else p.push(circ(74, 104, 5, domeFill(v.skin, 0.14, 0.16)));
  p.push(circ(54, 104, 5, domeFill(v.skin, 0.14, 0.16)));
  if (pose.fork && pose.armR) {
    p.push(line(pose.armR[0] + 1, pose.armR[1] - 2, pose.armR[0] + 3, pose.armR[1] - 12, "#8e8a82", 2.5));
  }
  p.push(circ(CX, headY, 24, domeFill(v.skin, 0.16, 0.18)));
  hairFront(p, v, headY);
  p.push(ell(52, headY + 6, 5.5, 3.2, "#e88b7d", 'opacity="0.34"'));
  p.push(ell(76, headY + 6, 5.5, 3.2, "#e88b7d", 'opacity="0.34"'));
  p.push(circ(56, headY, 2.9, "#2b2320"));
  p.push(circ(72, headY, 2.9, "#2b2320"));
  p.push(circ(56, headY - 1.1, 1.05, "#ffffff", 'opacity="0.9"'));
  p.push(circ(72, headY - 1.1, 1.05, "#ffffff", 'opacity="0.9"'));
  p.push(line(61, headY + 10, 67, headY + 10, "#a06a4a", 2.4));
  accessories(p, v, headY, torsoY);
  return p.join("");
}

// ── pose tables ────────────────────────────────────────────────────────────
const WALK = [
  { legMode: "apart", bob: 0, armL: [40, 92], armR: [90, 96] },
  { legMode: "passL", bob: 2, armL: [42, 96], armR: [88, 92] },
  { legMode: "apart", bob: 0, armL: [44, 98], armR: [86, 90] },
  { legMode: "passR", bob: 2, armL: [42, 96], armR: [88, 92] },
];
const CARRYP = WALK.map((w) => ({ ...w, armL: [50, 86], armR: [78, 86], carry: true }));
const IDLE = [
  { legMode: "stand", bob: 0, armL: [44, 100], armR: [84, 100] },
  { legMode: "stand", bob: 1, armL: [44, 101], armR: [84, 101], blink: true },
];
const COOK = [
  { legMode: "stand", bob: 0, armL: [46, 98], armR: [100, 64] },
  { legMode: "stand", bob: 1, armL: [46, 98], armR: [96, 72] },
];
const EAT = [
  { armR: [72, 66], fork: true },
  { armR: [76, 96], fork: true },
];

function frames(v, anim) {
  switch (anim) {
    case "idle_f": return IDLE.map((p) => draw(v, "f", p));
    case "idle_b": return IDLE.map((p) => draw(v, "b", p));
    case "walk_f": return WALK.map((p) => draw(v, "f", p));
    case "walk_b": return WALK.map((p) => draw(v, "b", p));
    case "carry_f": return CARRYP.map((p) => draw(v, "f", p));
    case "carry_b": return CARRYP.map((p) => draw(v, "b", p));
    case "cook": return COOK.map((p) => draw(v, "b", p));
    case "sit": return [drawSit(v, {})];
    case "eat": return EAT.map((p) => drawSit(v, p));
    case "flame": return [0, 1, 2, 3].map(flame);
    case "sizzle": return [0, 1, 2, 3].map(sizzle);
    case "sparkle": return [0, 1, 2, 3].map(sparkle);
    default: throw new Error(`unknown anim ${anim}`);
  }
}

function bakeStrip(variantName, v, anim) {
  DEFS = [];
  DSEEN = new Map();
  const cells = frames(v, anim); // populates DEFS as it draws
  const w = cells.length * CELL;
  const body = cells
    .map((c, i) => `<g transform="translate(${i * CELL} 0)">${c}</g>`)
    .join("");
  const head = DEFS.length ? `<defs>${DEFS.join("")}</defs>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${CELL}" viewBox="0 0 ${w} ${CELL}">${head}${body}</svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  const dir = join(OUT, variantName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${anim}.png`), png);
  return png.length;
}

// ── FX (M7c): the stove has never actually lit ─────────────────────────────
// Until now a "cooking" stove was a static amber ellipse baked into the
// texture plus an additive glow at alpha 0.05, i.e. invisible. The chef bobbed
// an arm at an inert appliance.
//
// These ride the SAME strip -> atlas pipeline as the characters (dk-atlas.mjs
// is generic over its input and only assumes uniform square cells), so the fx
// sheet costs no new machinery. One sheet holds every effect.
//
// Registration differs from a character: an effect is centred in its cell
// rather than standing on the baseline, and scene.ts positions it by the
// stove's own anchor.
const FXC = 64; // cell centre, both axes

/** one flame tongue; k varies the flicker per frame */
function flame(k) {
  const sway = [0, 1.6, -1.2, 0.8][k];
  const tall = [0, 3, -2, 1.5][k];
  const tip = (dx, h, w, fill, o = 1) =>
    `<path d="M${f(FXC + dx)} ${f(FXC + 16)} C ${f(FXC + dx - w)} ${f(FXC + 4)}, ${f(FXC + dx - w * 0.4)} ${f(FXC - h * 0.5)}, ${f(FXC + dx + sway * 0.5)} ${f(FXC - h)} C ${f(FXC + dx + w * 0.4)} ${f(FXC - h * 0.5)}, ${f(FXC + dx + w)} ${f(FXC + 4)}, ${f(FXC + dx)} ${f(FXC + 16)} Z" fill="${fill}" opacity="${o}"/>`;
  const halo = ell(FXC, FXC + 10, 26, 12, `url(#${def(
    `<radialGradient id="@"><stop offset="0" stop-color="#ffb04a" stop-opacity="0.55"/><stop offset="1" stop-color="#ff8c42" stop-opacity="0"/></radialGradient>`
  )})`);
  const outer = tip(0, 26 + tall, 15, `url(#${def(
    `<linearGradient id="@" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff7a2f"/><stop offset="0.55" stop-color="#ffa93d"/><stop offset="1" stop-color="#ffd977"/></linearGradient>`
  )})`);
  const inner = tip(0, 15 + tall * 0.6, 7.5, `url(#${def(
    `<linearGradient id="@" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#8fd8ff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff4cf"/></linearGradient>`
  )})`, 0.95);
  // a couple of embers, offset per frame so it never reads as a loop
  const ember = [0, 1].map((i) => {
    const ex = FXC + (i ? 9 : -8) + sway * 2;
    const ey = FXC - 22 - k * 5 - i * 7;
    return circ(ex, ey, 1.6 - i * 0.4, "#ffcf7d", `opacity="${f(0.55 - k * 0.1)}"`);
  }).join("");
  return halo + outer + inner + ember;
}

/** a small heat shimmer for the pan, and a generic sparkle for taps */
function sizzle(k) {
  const o = [0.5, 0.34, 0.2, 0.34][k];
  let s = "";
  for (let i = 0; i < 3; i++) {
    const x = FXC - 12 + i * 12;
    const y = FXC + 6 - k * 4 - i * 2;
    s += `<path d="M${f(x)} ${f(y)} q 4 -6 0 -12" fill="none" stroke="#fff1d6" stroke-width="2.4" stroke-linecap="round" opacity="${f(o)}"/>`;
  }
  return s;
}

function sparkle(k) {
  const r = 4 + k * 3;
  const o = 0.9 - k * 0.22;
  return [0, 1, 2, 3]
    .map((i) => {
      const ang = (i * Math.PI) / 2 + k * 0.3;
      const x = FXC + Math.cos(ang) * r * 2;
      const y = FXC + Math.sin(ang) * r * 2;
      return circ(x, y, 2.6 - k * 0.4, "#ffe9a8", `opacity="${f(o)}"`);
    })
    .join("");
}

// ── the cast ───────────────────────────────────────────────────────────────
const GUEST_ANIMS = ["idle_f", "walk_f", "walk_b", "sit", "eat"];

/**
 * SIXTEEN guest looks, not eight.
 *
 * The sim still rolls a variant in 0..7 and that roll is part of the
 * determinism contract, so widening it would be a SIM change and would move
 * hashWorld. Instead scene.ts maps (variant, entity id) onto 0..15 at draw
 * time: same rolls, same hash, twice the faces in the room.
 *
 * Strides are coprime with the pool sizes so no two indices collide on every
 * trait at once, and each look owns a distinct silhouette cue.
 */
const GUEST_COUNT = 16;
const cast = [];
for (let i = 0; i < GUEST_COUNT; i++) {
  cast.push({
    name: `guest${i}`,
    anims: GUEST_ANIMS,
    v: {
      skin: SKINS[i % 4],
      hairStyle: (i * 3 + 1) % 4,
      hairColor: HAIRC[(i * 2 + 1) % 5],
      shirt: SHIRTS[i % SHIRTS.length],
      pants: PANTS[i % 2],
      capColor: SHIRTS[(i + 3) % SHIRTS.length],
      glasses: i % 5 === 2,
      scarf: i % 7 === 3 ? SHIRTS[(i + 4) % SHIRTS.length] : null,
    },
  });
}
// effects share the strip pipeline; the "variant" is just a sheet name
cast.push({ name: "fx", anims: ["flame", "sizzle", "sparkle"], v: {} });

/**
 * YOUR CREW (M7d). Six chef looks and six waiter looks, because those are the
 * two characters a player actually watches all day. Purely cosmetic: the pick
 * lives in the save next to `theme`, never in WorldState, so it cannot touch
 * a single sim number (ADR-0067/0090/0103/0105 cosmetics firewall).
 *
 * The uniform stays constant within a role — whites and a toque for the chef,
 * an apron for the waiter — so the ROLE is still readable at a glance from
 * across the room. Only the person inside it changes.
 */
export const CREW_LOOKS = 6;
const CHEF_ANIMS = ["idle_b", "walk_f", "walk_b", "cook"];
const WAITER_ANIMS = ["idle_f", "walk_f", "walk_b", "carry_f", "carry_b"];
const APRONS = ["#2f3a33", "#3a3550", "#5a3a32", "#2f4a52", "#4a3f2a", "#523040"];

for (let i = 0; i < CREW_LOOKS; i++) {
  cast.push({
    name: `chef${i}`,
    anims: CHEF_ANIMS,
    v: {
      skin: SKINS[(i * 3 + 2) % 4],
      hairStyle: 1,
      hairColor: HAIRC[(i * 2) % 5],
      shirt: "#f2ede2",
      pants: ["#4a4f5a", "#3a3f4a", "#4f4a42"][i % 3],
      toque: true,
      buttons: true,
    },
  });
  cast.push({
    name: `waiter${i}`,
    anims: WAITER_ANIMS,
    v: {
      skin: SKINS[(i * 3 + 1) % 4],
      hairStyle: [1, 2, 0, 1, 2, 3][i],
      hairColor: HAIRC[(i * 3 + 2) % 5],
      shirt: "#f2ede2",
      pants: "#23252c",
      apron: APRONS[i % APRONS.length],
      capColor: APRONS[i % APRONS.length],
    },
  });
}

let total = 0;
for (const c of cast) {
  for (const anim of c.anims) {
    total += bakeStrip(c.name, c.v, anim);
  }
  console.log(`baked strips for ${c.name} (${c.anims.join(", ")})`);
}
console.log(`done -> ${OUT} (${Math.round(total / 1024)}KB of strips)`);
