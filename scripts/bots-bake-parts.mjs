/**
 * BATTLE BOTS part bake (week 1, grey clay): authors every launch part as
 * code-generated SVG and rasterizes it to public/bots-art/parts/<slot>/
 * t<tier>-<design>.png via @resvg/resvg-js, with a paint MASK beside each one
 * (t<tier>-<design>.mask.png: white where paint applies, transparent over
 * brass, rubber and glass). Pattern: scripts/dk-bake-room.mjs (the Domain
 * Kitchen room bake). No <text> anywhere (no font dependency). Shapes only.
 *
 * These are the STRUCTURE placeholders the art pipeline paints over
 * (screens doc 6.5 step 1): the game runs on them from day one, the img2img
 * pass uses them as its structure reference, and the page must look right
 * with the art folder deleted. Silhouettes differ per tier (bigger, more
 * rivets at higher tiers) and per design (round vs boxy, drum vs boiler).
 *
 * REGISTRATION CONTRACT (screens doc 2.4), authored HERE and emitted to
 * src/app/bots/_view/rig-points.ts so the rig and the art gate read the same
 * numbers this file drew against. All sizes @2x:
 *   head   160x160  neck (80,150)
 *   torso  200x240  neck (100,10) shoulderL (22,60) shoulderR (178,60)
 *                   hipL (62,228) hipR (138,228) decal (100,120)
 *   arm     90x200  shoulder (45,20) hand (45,180)   one sprite, mirrored
 *   leg     90x200  hip (45,20) foot (45,195)        one sprite, mirrored
 *   weapon 220x120  grip (30,60)
 *   lift   640x420  platform top at y 380 down and y 300 raised, 600 wide
 *
 * Mirroring is legal only because the light is from directly above and every
 * highlight is centred or a symmetric pair (ADR-0112 rule 3).
 *
 * Run: node scripts/bots-bake-parts.mjs [--only head,arm,lift]
 */

import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "public", "bots-art");
const RIG_TS = join(process.cwd(), "src", "app", "bots", "_view", "rig-points.ts");

/**
 * No <text> in any of this art, so the system font database is pure waste
 * (measured in the DK bake: 120ms per render with it vs 0.8ms without).
 */
const RESVG_OPTS = { font: { loadSystemFonts: false } };

/** --only <slot[,slot]> restricts which slots get written. */
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  const raw = i >= 0 ? process.argv[i + 1] : null;
  if (!raw) return null;
  return new Set(raw.split(",").map((s) => s.trim()));
})();

// ── THE CONTRACT ───────────────────────────────────────────────────────────
// Emitted verbatim to rig-points.ts below. The shapes in this file are drawn
// so that every point lands on opaque pixels; bots-art-check.mts proves it.
const RIG = {
  head: { w: 160, h: 160, neck: [80, 150] },
  torso: {
    w: 200, h: 240,
    neck: [100, 10], shoulderL: [22, 60], shoulderR: [178, 60],
    hipL: [62, 228], hipR: [138, 228], decal: [100, 120],
  },
  arm: { w: 90, h: 200, shoulder: [45, 20], hand: [45, 180] },
  leg: { w: 90, h: 200, hip: [45, 20], foot: [45, 195] },
  weapon: { w: 220, h: 120, grip: [30, 60] },
};
const LIFT = { w: 640, h: 420, topDown: 380, topRaised: 300, platformW: 600 };
const TIERS = [1, 2, 3, 4];
const DESIGNS = [1, 2];

// ── palette (mirrors K in src/app/bots/_ui/tokens.ts; plain node cannot import it)
const CLAY = "#c7cdd6";
const BRASS = "#d9a441";
const RUBBER = "#3a3a3f";
const GLASS = "#bfe9ff";
const HUE = 220; // the clay layer's shadow hue

const f = (n) => (Math.round(n * 100) / 100).toString();
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

// ── THE COLOUR LAW (copied from dk-bake-room.mjs) ─────────────────────────
// Every shading stop is DERIVED from the flat palette, never hand-picked.
// Warm light, cool shadow, an affine lightness ramp so dark rubber does not
// crush to black.
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return s === 0
    ? `#${to(l)}${to(l)}${to(l)}`
    : `#${to(hue(h + 1 / 3))}${to(hue(h))}${to(hue(h - 1 / 3))}`;
}
function rotToward(a, b, k) {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * k;
}
const WARM_HUE = 45;
function shift(hex, amt, shadowHue) {
  const { h, s, l } = rgbToHsl(hex);
  if (amt === 0) return hex;
  if (amt > 0) {
    return hslToHex(
      rotToward(h, WARM_HUE, amt * 0.35),
      clamp01(s * (1 - amt * 0.3)),
      clamp01(l * (1 + amt * 0.22) + amt * 0.3),
    );
  }
  const a = -amt;
  return hslToHex(
    rotToward(h, shadowHue, a * 0.45),
    clamp01(s * (1 + a * 0.25)),
    clamp01(l * (1 - a * 0.55)),
  );
}
const lift = (hex, a) => shift(hex, a, HUE);
const sink = (hex, a) => shift(hex, -a, HUE);

// ── shapes ─────────────────────────────────────────────────────────────────
// Each shape carries its bbox so the shading bands can be clipped to it.
const rr = (x, y, w, h, r) => ({ k: "rect", x, y, w, h, r, bbox: [x, y, w, h] });
const circ = (cx, cy, r) => ({ k: "circle", cx, cy, r, bbox: [cx - r, cy - r, 2 * r, 2 * r] });
/** a thick bar from (x1,y1) to (x2,y2) as a polygon: scissor arms, struts */
const bar = (x1, y1, x2, y2, w) => {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
  const pts = [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs), by = Math.min(...ys);
  return { k: "poly", pts, bbox: [bx, by, Math.max(...xs) - bx, Math.max(...ys) - by] };
};
function shapeSvg(s, attrs) {
  if (s.k === "rect") {
    return `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}" rx="${f(s.r)}" ${attrs}/>`;
  }
  if (s.k === "circle") return `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}" ${attrs}/>`;
  return `<polygon points="${s.pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" ${attrs}/>`;
}

/**
 * Material identity. Clay is matte and takes the deepest light-to-shadow
 * ramp in six STEPPED bands (ADR-0112 rule 4, never a smooth gradient).
 * Brass catches light (a glint); rubber barely ramps; glass is bright with
 * a hard white glint. Outlines are soft and cool, never hard black.
 */
const MAT = {
  clay: { fill: CLAY, from: 0.16, to: -0.18, n: 6, outline: "rgba(52,58,78,0.4)", ow: 2.2 },
  brass: { fill: BRASS, from: 0.22, to: -0.2, n: 3, outline: "rgba(90,60,20,0.55)", ow: 1.8, glint: true },
  rubber: { fill: RUBBER, from: 0.08, to: -0.12, n: 3, outline: "rgba(255,255,255,0.14)", ow: 1.6 },
  glass: { fill: GLASS, from: 0.18, to: -0.1, n: 3, outline: "rgba(40,70,110,0.5)", ow: 1.8, glint: true },
};

const el = (mat, shape) => ({ mat, shape });

/** stepped bands across a bbox, top lit, bottom sunk */
function bands(bx, by, bw, bh, base, from, to, n) {
  let o = "";
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const yy = by + (bh * i) / n;
    o += `<rect x="${f(bx - 1)}" y="${f(yy)}" width="${f(bw + 2)}" height="${f(bh / n + 0.5)}" fill="${shift(base, from + (to - from) * k, HUE)}"/>`;
  }
  return o;
}

/**
 * The BASE render: every element in order (clay first, then accents, which
 * is what lets the mask below subtract accents without knowing draw order),
 * shaded inside its own clip, outlined, glinted.
 */
function renderBase(w, h, elements) {
  let defs = "";
  let body = "";
  elements.forEach((e, i) => {
    const m = MAT[e.mat];
    const id = `c${i}`;
    const [bx, by, bw, bh] = e.shape.bbox;
    defs += `<clipPath id="${id}">${shapeSvg(e.shape, "")}</clipPath>`;
    body += `<g clip-path="url(#${id})">${shapeSvg(e.shape, `fill="${m.fill}"`)}${bands(bx, by, bw, bh, m.fill, m.from, m.to, m.n)}`;
    if (e.mat === "clay") {
      // one thumbprint per clay piece: a soft oval a shade darker, low right
      body += `<ellipse cx="${f(bx + bw * 0.62)}" cy="${f(by + bh * 0.66)}" rx="${f(bw * 0.14)}" ry="${f(bh * 0.08)}" fill="${sink(CLAY, 0.1)}" opacity="0.35"/>`;
    }
    body += `</g>`;
    body += shapeSvg(e.shape, `fill="none" stroke="${m.outline}" stroke-width="${m.ow}" stroke-linejoin="round"`);
    if (m.glint) {
      body += `<ellipse cx="${f(bx + bw * 0.38)}" cy="${f(by + bh * 0.26)}" rx="${f(bw * 0.14)}" ry="${f(bh * 0.09)}" fill="#ffffff" opacity="0.55"/>`;
    }
  });
  return svg(w, h, `<defs>${defs}</defs>${body}`);
}

/**
 * The paint MASK: clay shapes in white, with every accent shape cut out
 * through a luminance mask (black = hidden), so the renderer's tinted
 * multiply never darkens brass, rubber or glass.
 */
function renderMask(w, h, elements) {
  const clay = elements.filter((e) => e.mat === "clay");
  const acc = elements.filter((e) => e.mat !== "clay");
  const mask = `<mask id="acc" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#ffffff"/>${acc.map((e) => shapeSvg(e.shape, 'fill="#000000"')).join("")}</mask>`;
  return svg(w, h, `<defs>${mask}</defs><g mask="url(#acc)">${clay.map((e) => shapeSvg(e.shape, 'fill="#ffffff"')).join("")}</g>`);
}

const rivets = (list, count, r) => list.slice(0, count).map(([x, y]) => el("brass", circ(x, y, r)));

// ── THE PARTS ──────────────────────────────────────────────────────────────
// tk runs 0 (T1) to 1 (T4): bigger pieces, more rivets, one more accent.

function headParts(tier, design) {
  const tk = (tier - 1) / 3;
  const out = [];
  if (design === 1) {
    out.push(el("clay", rr(64, 126, 32, 30, 8))); // the neck stub, holds (80,150)
    const r = 56 + tk * 6;
    out.push(el("clay", circ(80, 76, r)));
    out.push(...rivets([[30, 84], [130, 84], [44, 36], [116, 36], [80, 22], [80, 128]], [0, 2, 4, 6][tier - 1], 5 + tk * 2));
    if (tier === 4) out.push(el("brass", rr(70, 8, 20, 14, 5)));
    const er = 11 + tk * 2;
    out.push(el("glass", circ(58, 70, er)), el("glass", circ(102, 70, er)));
    out.push(el("rubber", circ(60, 72, 4)), el("rubber", circ(104, 72, 4)));
    out.push(el("rubber", rr(58, 98, 44, 10, 5))); // the grille smile
  } else {
    out.push(el("clay", rr(64, 128, 32, 28, 8)));
    out.push(el("clay", rr(24 - tk * 6, 18 - tk * 4, 112 + tk * 12, 116 + tk * 8, 24)));
    out.push(...rivets([[34, 34], [126, 34], [34, 118], [126, 118]], [0, 2, 4, 4][tier - 1], 5 + tk * 2));
    if (tier >= 3) out.push(el("brass", rr(76, 2, 8, 22, 4)));
    if (tier === 4) out.push(el("brass", circ(80, 4, 5)));
    out.push(el("glass", circ(80, 70, 20 + tk * 4)));
    out.push(el("rubber", circ(82, 72, 7)));
    out.push(el("rubber", rr(52, 108, 56, 8, 4)));
    out.push(el("rubber", circ(62, 112, 3)), el("rubber", circ(98, 112, 3)));
  }
  return out;
}

function torsoParts(tier, design) {
  const tk = (tier - 1) / 3;
  const out = [];
  out.push(el("clay", rr(76, 0, 48, 24, 10))); // collar, holds (100,10)
  out.push(el("clay", rr(16 - tk * 4, 22, 168 + tk * 8, 178, 36))); // chest, holds the shoulders
  out.push(el("clay", rr(48, 188, 104, 48, 22))); // pelvis, holds the hips
  if (design === 1) {
    out.push(el("rubber", rr(20, 90, 160, 12, 4)));
    if (tier >= 2) out.push(el("rubber", rr(20, 150, 160, 12, 4)));
    out.push(...rivets([[40, 44], [160, 44], [40, 176], [160, 176], [100, 44], [100, 176], [30, 118], [170, 118]], [0, 4, 6, 8][tier - 1], 6 + tk * 2));
    if (tier === 4) out.push(el("brass", rr(70, 20, 60, 10, 5)));
  } else {
    out.push(...rivets([[36, 40], [164, 40], [36, 180], [164, 180], [100, 36], [60, 206], [140, 206], [100, 206]], [0, 4, 6, 8][tier - 1], 6 + tk * 2));
    out.push(el("brass", circ(100, 162, 22 + tk * 4)));
    out.push(el("glass", circ(100, 162, 17 + tk * 4)));
    out.push(el("rubber", rr(56, 228, 88, 10, 5)));
  }
  return out;
}

function armParts(tier, design) {
  const tk = (tier - 1) / 3;
  const out = [];
  out.push(el("clay", circ(45, 24, 20 + tk * 5))); // shoulder ball, holds (45,20)
  out.push(el("clay", rr(45 - (11 + tk * 3), 30, 22 + tk * 6, 72, 11)));
  out.push(el("clay", rr(45 - (12 + tk * 3), 112, 24 + tk * 6, 58, 12)));
  out.push(el("clay", circ(45, 178, 15 + tk * 3))); // the hand, holds (45,180)
  out.push(el("rubber", circ(45, 106, 12 + tk * 2))); // elbow
  if (design === 1) {
    out.push(el("brass", rr(41, 40, 8, 56, 4)));
    out.push(...rivets([[45, 14], [34, 26], [56, 26]], [1, 2, 3, 3][tier - 1], 4 + tk * 1.5));
    out.push(el("rubber", rr(33, 184, 8, 12, 4)), el("rubber", rr(49, 184, 8, 12, 4)));
  } else {
    out.push(...rivets([[45, 14], [34, 26], [56, 26]], [0, 2, 2, 3][tier - 1], 4 + tk * 1.5));
    if (tier >= 2) out.push(el("brass", rr(30, 130, 30, 8, 3)));
    out.push(el("brass", rr(27, 174, 12, 24, 5)), el("brass", rr(51, 174, 12, 24, 5)));
  }
  return out;
}

function legParts(tier, design) {
  const tk = (tier - 1) / 3;
  const out = [];
  out.push(el("clay", circ(45, 24, 19 + tk * 5))); // hip ball, holds (45,20)
  out.push(el("clay", rr(45 - (12 + tk * 3), 30, 24 + tk * 6, 72, 12)));
  out.push(el("clay", rr(45 - (11 + tk * 3), 112, 22 + tk * 6, 60, 11)));
  if (design === 1) {
    out.push(el("brass", circ(45, 106, 12 + tk * 2)));
    out.push(el("rubber", rr(45 - (26 + tk * 5), 172, 52 + tk * 10, 26, 10))); // foot, holds (45,195)
    for (let i = 0; i < [2, 3, 4, 4][tier - 1]; i++) out.push(el("brass", rr(31, 118 + i * 12, 28, 6, 3)));
    out.push(...rivets([[45, 14], [35, 24], [55, 24]], [0, 1, 2, 3][tier - 1], 4 + tk * 1.5));
  } else {
    out.push(el("rubber", circ(45, 106, 12 + tk * 2)));
    out.push(el("rubber", rr(45 - (30 + tk * 5), 168, 60 + tk * 10, 30, 10)));
    if (tier >= 2) out.push(el("brass", rr(36, 120, 18, 40, 6)));
    out.push(...rivets([[45, 14], [35, 24], [55, 24]], [0, 1, 2, 3][tier - 1], 4 + tk * 1.5));
    out.push(el("brass", rr(55, 178, 18, 10, 4)));
  }
  return out;
}

function weaponParts(tier, design) {
  const tk = (tier - 1) / 3;
  const out = [];
  if (design === 1) {
    out.push(el("clay", rr(56, 52, 100, 16, 8))); // shaft
    const hh = 64 + tk * 16;
    out.push(el("clay", rr(152, 60 - hh / 2, 62, hh, 14))); // the head
    out.push(el("rubber", rr(6, 48, 56, 24, 12))); // grip, holds (30,60)
    out.push(el("brass", rr(146, 46, 12, 28, 4)));
    out.push(...rivets([[170, 44], [200, 44], [170, 76], [200, 76]], [0, 2, 4, 4][tier - 1], 5 + tk * 2));
    if (tier === 4) out.push(el("brass", rr(178, 60 - hh / 2 + 4, 10, hh - 8, 3)));
  } else {
    out.push(el("clay", rr(56, 52, 96, 16, 8)));
    const dr = 34 + tk * 8;
    out.push(el("clay", circ(170, 60, dr)));
    out.push(el("rubber", rr(6, 48, 56, 24, 12)));
    const teeth = [0, 4, 6, 8][tier - 1];
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      out.push(el("rubber", circ(170 + Math.cos(a) * (dr - 6), 60 + Math.sin(a) * (dr - 6), 4)));
    }
    out.push(el("brass", circ(170, 60, 8 + tk * 3)));
  }
  return out;
}

const PARTS = { head: headParts, torso: torsoParts, arm: armParts, leg: legParts, weapon: weaponParts };

/** The scissor lift, two states, same canvas, same floor line. */
function liftParts(raised) {
  const out = [];
  const top = raised ? LIFT.topRaised : LIFT.topDown;
  const x0 = (LIFT.w - LIFT.platformW) / 2;
  out.push(el("rubber", rr(120, 400, 400, 16, 6))); // base plate on the floor
  if (raised) {
    out.push(el("rubber", bar(180, 398, 460, top + 22, 14)));
    out.push(el("rubber", bar(460, 398, 180, top + 22, 14)));
    out.push(el("brass", circ(320, (398 + top + 22) / 2, 9)));
    out.push(el("brass", circ(180, 398, 7)), el("brass", circ(460, 398, 7)));
    out.push(el("brass", circ(180, top + 22, 7)), el("brass", circ(460, top + 22, 7)));
  } else {
    out.push(el("rubber", rr(170, top + 20, 300, 8, 4)));
  }
  out.push(el("rubber", rr(x0, top, LIFT.platformW, 22, 8))); // the platform
  out.push(el("brass", rr(x0, top - 4, LIFT.platformW, 8, 4))); // the rail
  out.push(el("brass", rr(x0 + 8, top + 26, 40, 6, 3)), el("brass", rr(x0 + LIFT.platformW - 48, top + 26, 40, 6, 3)));
  return out;
}

// ── bake ───────────────────────────────────────────────────────────────────
let files = 0;
let bytes = 0;
function write(rel, svgText) {
  const png = new Resvg(svgText, RESVG_OPTS).render().asPng();
  const p = join(ROOT, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, png);
  files += 1;
  bytes += png.length;
}

for (const slot of Object.keys(PARTS)) {
  if (ONLY && !ONLY.has(slot)) continue;
  const { w, h } = RIG[slot];
  for (const tier of TIERS) {
    for (const design of DESIGNS) {
      const elements = PARTS[slot](tier, design);
      write(`parts/${slot}/t${tier}-${design}.png`, renderBase(w, h, elements));
      write(`parts/${slot}/t${tier}-${design}.mask.png`, renderMask(w, h, elements));
    }
  }
}
if (!ONLY || ONLY.has("lift")) {
  write("lift/down.png", renderBase(LIFT.w, LIFT.h, liftParts(false)));
  write("lift/raised.png", renderBase(LIFT.w, LIFT.h, liftParts(true)));
}

// ── emit the contract ──────────────────────────────────────────────────────
const pt = (p) => `[${p[0]}, ${p[1]}]`;
const rigLines = Object.entries(RIG).map(([slot, r]) => {
  const pts = Object.entries(r)
    .filter(([k]) => k !== "w" && k !== "h")
    .map(([k, v]) => `${k}: ${pt(v)}`)
    .join(", ");
  return `  ${slot}: { w: ${r.w}, h: ${r.h}, ${pts} },`;
});
const ts = `/**
 * BATTLE BOTS RIG POINTS. GENERATED by scripts/bots-bake-parts.mjs; do not
 * edit by hand. Re-run the bake to change a point, because the placeholder
 * art, the rig (rig.ts) and the art gate (scripts/bots-art-check.mts) must
 * all read the same numbers. All coordinates are @2x canvas pixels
 * (screens doc 2.4).
 */

export type Pt = readonly [number, number];

export const RIG = {
${rigLines.join("\n")}
} as const;

export type ArtSlot = keyof typeof RIG;
export const ART_SLOTS: readonly ArtSlot[] = ["head", "torso", "arm", "leg", "weapon"];

/** The scissor lift: two states on one canvas, bottom-aligned on the floor. */
export const LIFT = { w: ${LIFT.w}, h: ${LIFT.h}, topDown: ${LIFT.topDown}, topRaised: ${LIFT.topRaised}, platformW: ${LIFT.platformW} } as const;

export const TIERS = [1, 2, 3, 4] as const;
export const DESIGNS = [1, 2] as const;

export const partFile = (slot: ArtSlot, tier: number, design: number): string =>
  \`/bots-art/parts/\${slot}/t\${tier}-\${design}.png\`;
export const maskFile = (slot: ArtSlot, tier: number, design: number): string =>
  \`/bots-art/parts/\${slot}/t\${tier}-\${design}.mask.png\`;
export const liftFile = (state: "down" | "raised"): string => \`/bots-art/lift/\${state}.png\`;

/** Every rig point of a slot, for the gate: each must land on opaque pixels. */
export function rigPoints(slot: ArtSlot): Pt[] {
  const r = RIG[slot] as Record<string, unknown>;
  return Object.entries(r)
    .filter(([k]) => k !== "w" && k !== "h")
    .map(([, v]) => v as Pt);
}
`;
if (!ONLY) {
  mkdirSync(join(RIG_TS, ".."), { recursive: true });
  writeFileSync(RIG_TS, ts);
}

console.log(`bots-bake-parts: ${files} files, ${(bytes / 1024).toFixed(0)}KB -> ${ROOT}${ONLY ? "" : `; wrote ${RIG_TS}`}`);
