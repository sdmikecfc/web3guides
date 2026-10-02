/**
 * Domain Kitchen room bake (ADR-0101, themed in M3c): authors the room art as
 * code-generated SVG and rasterizes it to public/chef-art/room/<theme>/*.png
 * via @resvg/resvg-js. No <text> anywhere (no font dependency). Shapes only.
 *
 * FIVE THEMES (the country styles Mike locked in the demo round): trattoria,
 * izakaya, taqueria, diner, bistro. Every theme emits the SAME 12 files at the
 * SAME sizes with the SAME registration, so the engine swaps textures and
 * nothing else moves.
 *
 * REGISTRATION CONTRACT — must match src/app/chef/game/_engine/iso.ts:
 *   TILE 64x32 logical, art authored at 2x (tile 128x64 in these canvases).
 *   floor:    128x64, diamond exactly fills the canvas, anchor (0.5, 0).
 *   1x1 furn: 192x224, tile bottom corner at (96, 208), anchor via FURN_*.
 *   counter:  320x240 (2x1 gx span), far tile bottom corner at (208, 216).
 *   walls:    left 512x460 (room top corner at canvas (512, 192), wall top
 *             y=0), right 640x524 (room top corner at (0, 192)).
 *   doormat:  128x64 centered; rug: 256x128 centered; dishes: 96x64 centered.
 *
 * Run: node scripts/dk-bake-room.mjs
 */

import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(process.cwd(), "public", "chef-art", "room");

/**
 * There is no <text> in any of this art, so loading the system font database is
 * pure waste — and it is not cheap: measured 120.5ms per render with the
 * default vs 0.8ms with it off, byte-identical output. Across a full bake that
 * is ~18 seconds of nothing. Art quality is a function of how many iterations
 * you can afford, so this flag is load-bearing.
 */
export const RESVG_OPTS = { font: { loadSystemFonts: false } };

/**
 * --only <name[,name]> restricts which files get written (".png" optional), so
 * tuning one piece does not rewrite 92 files. Null means "write everything".
 */
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  const raw = i >= 0 ? process.argv[i + 1] : null;
  if (!raw) return null;
  return new Set(raw.split(",").map((s) => s.trim().replace(/\.png$/, "")));
})();

const f = (n) => (Math.round(n * 100) / 100).toString();
const pts = (arr) => arr.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");
const poly = (arr, fill, extra = "") =>
  `<polygon points="${pts(arr)}" fill="${fill}" ${extra}/>`;
const ell = (cx, cy, rx, ry, fill, extra = "") =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, w, extra = "") =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

// ── THE THEMES ─────────────────────────────────────────────────────────────
// floor: plank | tatami | tile | checker | parquet
// cloth: gingham | solid | stripe | paper
// wallArt: pans | lanterns | neon | strings
export const THEMES = {
  trattoria: {
    floorA: "#c07a48", floorB: "#b77242", floorSeam: "#9c5c34", floorLight: "#d99a66",
    floor: "plank",
    /**
     * CHIBI RETUNE (CUTE+VIRAL push): the walls follow the chibi storybook
     * anchor the AI pieces are painted against. Cream plaster with a blush of
     * pink, rose wainscot, candy trim. Only the wall family moved; furniture
     * colors stay because the shipped furniture is AI art now and these
     * palette keys only drive the OTHER bake outputs.
     */
    /**
     * ANCHOR B RETUNE (Mike: "omg B is so good"): the clay-toy diorama.
     * Soft cream plaster, warm cream wainscot a shade deeper, honey trim.
     * The pink storybook palette this replaces is snapshotted in the session
     * scratchpad if it ever becomes a second theme.
     */
    plasterL: "#faf3e6", plasterR: "#f3e9d6", trim: "#e3cfae",
    wainscot: "#e8d9bf", wainscotDark: "#cdb894", skirt: "#b39a74",
    frame: "#c9a06a", curtain: "#d96a55",
    wood: "#8a5a33", woodDark: "#6f4526", woodLight: "#9a6a3f",
    cloth: "#eee8d8", clothShade: "#ddd5c2", accent: "#c94f43", cloth2: "#c94f43",
    clothStyle: "gingham",
    seat: "#9a6a3f", cushion: "#c94f43",
    counterTop: "#e9e2d4", counterTopEdge: "#d5cbb8", counterBody: "#8a5a33",
    pot: "#b9683a", potRim: "#c97a48", leaf: "#6a8f4e", leafDark: "#5d7f44", leafLight: "#7fa35c",
    rugA: "#b5493a", rugB: "#d9a05b", rugC: "#e8e2d2", mat: "#a97b48",
    wallArt: "pans", outline: "rgba(64,36,18,0.5)", shadowHueDeg: 285,
  },
  izakaya: {
    floorA: "#7a6647", floorB: "#736044", floorSeam: "#5b4a34", floorLight: "#94805e",
    floor: "tatami",
    plasterL: "#e8e0cd", plasterR: "#ddd4bf", trim: "#3b332c",
    wainscot: "#4a3a2c", wainscotDark: "#33271d", skirt: "#241b14",
    frame: "#3b2f24", curtain: "#2f4a6b",
    wood: "#5b4632", woodDark: "#3d3023", woodLight: "#6d573e",
    cloth: "#33414f", clothShade: "#2b3742", accent: "#c1543f", cloth2: "#c1543f",
    clothStyle: "solid",
    seat: "#5b4632", cushion: "#2f4a6b",
    counterTop: "#6d573e", counterTopEdge: "#5b4632", counterBody: "#3d3023",
    pot: "#4d5a4a", potRim: "#5d6b58", leaf: "#4e7a52", leafDark: "#3f6644", leafLight: "#63915f",
    rugA: "#2f4a6b", rugB: "#8d9bab", rugC: "#e8e0cd", mat: "#5b4632",
    wallArt: "lanterns", outline: "rgba(28,22,16,0.55)", shadowHueDeg: 215,
  },
  taqueria: {
    floorA: "#d9a05b", floorB: "#cf9250", floorSeam: "#a9713a", floorLight: "#eec283",
    floor: "tile",
    plasterL: "#f3ddb4", plasterR: "#eed0a0", trim: "#e0713f",
    wainscot: "#2e9b96", wainscotDark: "#1f7570", skirt: "#175a56",
    frame: "#e0713f", curtain: "#d94f5c",
    wood: "#a9713a", woodDark: "#7f5228", woodLight: "#c08c4c",
    cloth: "#f6efdc", clothShade: "#e6dcc4", accent: "#2e9b96", cloth2: "#e0713f",
    clothStyle: "stripe",
    seat: "#c08c4c", cushion: "#d94f5c",
    counterTop: "#2e9b96", counterTopEdge: "#1f7570", counterBody: "#a9713a",
    pot: "#d94f5c", potRim: "#e56b74", leaf: "#4e9b4a", leafDark: "#3d7f3c", leafLight: "#6fb45f",
    rugA: "#e0713f", rugB: "#2e9b96", rugC: "#f6efdc", mat: "#c08c4c",
    wallArt: "strings", outline: "rgba(70,40,18,0.5)", shadowHueDeg: 300,
  },
  diner: {
    floorA: "#e8e4dc", floorB: "#2c2f36", floorSeam: "#b9b5ad", floorLight: "#ffffff",
    floor: "checker",
    plasterL: "#cfe6dd", plasterR: "#bfdcd2", trim: "#c9ced6",
    wainscot: "#c9ced6", wainscotDark: "#9aa2ad", skirt: "#6f7681",
    frame: "#b9b5ad", curtain: "#c93f45",
    wood: "#9aa2ad", woodDark: "#6f7681", woodLight: "#c9ced6",
    cloth: "#f4f2ee", clothShade: "#e2dfd8", accent: "#c93f45", cloth2: "#c93f45",
    clothStyle: "solid",
    seat: "#c93f45", cushion: "#f4f2ee",
    counterTop: "#e8e4dc", counterTopEdge: "#c9ced6", counterBody: "#c93f45",
    pot: "#c9ced6", potRim: "#e8e4dc", leaf: "#5f9e63", leafDark: "#4d8551", leafLight: "#7cb87d",
    rugA: "#c93f45", rugB: "#c9ced6", rugC: "#f4f2ee", mat: "#9aa2ad",
    wallArt: "neon", outline: "rgba(44,47,54,0.45)", shadowHueDeg: 220,
  },
  // ── DOMAIN COLLECTIONS (ADR-0105): furniture-only sets whose art does NOT
  // follow the player's country style. `itemsOnly` skips floors/walls/decor.
  neonlab: {
    itemsOnly: true, furnStyle: "neon",
    floorA: "#2a3038", floorB: "#252b32", floorSeam: "#1a1f24", floorLight: "#3d4650",
    floor: "tile",
    plasterL: "#2a3038", plasterR: "#252b32", trim: "#4de3f0",
    wainscot: "#333b45", wainscotDark: "#1f252b", skirt: "#161a1f",
    frame: "#4a5560", curtain: "#1f6f7a",
    wood: "#4a5560", woodDark: "#2c343d", woodLight: "#6a7885",
    cloth: "#1e2c34", clothShade: "#18242b", accent: "#4de3f0", cloth2: "#4de3f0",
    clothStyle: "solid",
    seat: "#3a4650", cushion: "#1f6f7a",
    counterTop: "#243038", counterTopEdge: "#1a2228", counterBody: "#333b45",
    pot: "#3d4650", potRim: "#6a7885", leaf: "#4de3f0", leafDark: "#2f9fb0", leafLight: "#9df4fb",
    rugA: "#1f6f7a", rugB: "#2a3038", rugC: "#4de3f0", mat: "#333b45",
    wallArt: "neon", outline: "rgba(10,16,20,0.6)", shadowHueDeg: 190,
  },
  bonebronze: {
    itemsOnly: true, furnStyle: "stone",
    floorA: "#8b7d68", floorB: "#82745f", floorSeam: "#5f5443", floorLight: "#a89a84",
    floor: "tile",
    plasterL: "#d8cbb0", plasterR: "#cbbfa4", trim: "#b98a3f",
    wainscot: "#6b5c46", wainscotDark: "#4a3f30", skirt: "#3a3126",
    frame: "#6b5c46", curtain: "#8a4a32",
    wood: "#6b5c46", woodDark: "#463a2c", woodLight: "#8a7860",
    cloth: "#e8dcc0", clothShade: "#d6c9ab", accent: "#b98a3f", cloth2: "#8a4a32",
    clothStyle: "solid",
    seat: "#6b5c46", cushion: "#8a4a32",
    counterTop: "#9a8b74", counterTopEdge: "#7a6d59", counterBody: "#6b5c46",
    pot: "#b98a3f", potRim: "#d4a85c", leaf: "#6f8a4e", leafDark: "#587340", leafLight: "#8fa964",
    rugA: "#8a4a32", rugB: "#b98a3f", rugC: "#e8dcc0", mat: "#6b5c46",
    wallArt: "pans", outline: "rgba(48,38,26,0.55)", shadowHueDeg: 30,
  },
  bistro: {
    floorA: "#b98b52", floorB: "#ad7f49", floorSeam: "#8a6335", floorLight: "#d3a66c",
    floor: "parquet",
    plasterL: "#eee7d6", plasterR: "#e3dac6", trim: "#c8a15a",
    wainscot: "#2f4a3c", wainscotDark: "#22372c", skirt: "#1a2a22",
    frame: "#2f4a3c", curtain: "#8a2f3a",
    wood: "#3f3227", woodDark: "#2b2119", woodLight: "#57452f",
    cloth: "#f2ede1", clothShade: "#e0dacd", accent: "#8a2f3a", cloth2: "#c8a15a",
    clothStyle: "paper",
    seat: "#2f4a3c", cushion: "#c8a15a",
    counterTop: "#3a3f45", counterTopEdge: "#2b2f34", counterBody: "#2f4a3c",
    pot: "#4f5a4a", potRim: "#c8a15a", leaf: "#5f8a55", leafDark: "#4d7346", leafLight: "#7ba36b",
    rugA: "#8a2f3a", rugB: "#c8a15a", rugC: "#eee7d6", mat: "#57452f",
    wallArt: "pans", outline: "rgba(40,30,20,0.5)", shadowHueDeg: 150,
  },
};

const TW = 128;
const TH = 64;
const WALLH = 96;

/**
 * Every wall size the game can ask for (M8b).
 *
 * These MUST cover every `h` (left) and `w` (right) in SHELL_SIZES over in
 * _engine/rooms.ts. They are duplicated rather than imported because this is a
 * plain node script and that file is TypeScript; dk-art-check.mts is what
 * stops the two drifting, by asserting every wall the shells need is on disk.
 */
const LEFT_WALL_TILES = [8, 9, 12];
const RIGHT_WALL_TILES = [10, 14, 18];

// ── THE COLOUR LAW (M7) ────────────────────────────────────────────────────
// Every shading stop in this file is DERIVED from the flat palette above, not
// hand-picked. Seven palettes x ~20 stops would be ~140 hand-chosen colours,
// and the lighting law would then live in 140 places instead of one — retuning
// it would be a rewrite, and the themes would drift apart the first time
// anyone touched them.
//
// This is also the s5-camo-recolour.py lesson: ADR-0099 shipped 100 recoloured
// renders with no committed generator, and the parameters had to be recovered
// by measuring the shipped art. Encode the transform, not the outputs.
//
// The transform is warm-light / cool-shadow, which is what reads as "painted"
// rather than "black at 20% opacity on top". Lightness uses an AFFINE
// gain+offset rather than a multiply, because a pure multiply crushes the
// already-dark palettes (izakaya woodDark #3d3023, bistro #2b2119) to black.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(hex) {
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

export function hslToHex(h, s, l) {
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

/** Rotate hue `a` toward `b` by fraction k, taking the shorter way round. */
function rotToward(a, b, k) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * k;
}

const WARM_HUE = 45; // the key light's own colour, a warm yellow

/**
 * amt > 0 lifts a colour toward the key light (warmer, less saturated);
 * amt < 0 sinks it into shadow (toward the theme's ambient hue, MORE saturated,
 * which is what stops shadows reading as grey sludge).
 */
export function shift(hex, amt, shadowHue) {
  const { h, s, l } = rgbToHsl(hex);
  if (amt === 0) return hex;
  if (amt > 0) {
    return hslToHex(
      rotToward(h, WARM_HUE, amt * 0.35),
      clamp01(s * (1 - amt * 0.3)),
      clamp01(l * (1 + amt * 0.22) + amt * 0.3)
    );
  }
  const a = -amt;
  return hslToHex(
    rotToward(h, shadowHue, a * 0.45),
    clamp01(s * (1 + a * 0.25)),
    clamp01(l * (1 - a * 0.55))
  );
}

/**
 * Material identity. The old bake stroked wood, chrome, cloth and stone with
 * the same 2.2px line, so every surface read as the same substance.
 *   w    edge width
 *   a    edge opacity
 *   rim  strength of the lit top edge (metal catches light, cloth does not)
 *   face how much vertical gradient runs down a side face
 */
const MAT = {
  wood:    { w: 2.2, a: 0.5,  rim: 0.1,  face: 0.24 },
  cloth:   { w: 1.6, a: 0.32, rim: 0.04, face: 0.24 },
  metal:   { w: 2.4, a: 0.6,  rim: 0.3,  face: 0.3 },
  ceramic: { w: 1.8, a: 0.4,  rim: 0.2,  face: 0.2 },
  stone:   { w: 3.0, a: 0.55, rim: 0.05, face: 0.2 },
  leaf:    { w: 1.4, a: 0.28, rim: 0.08, face: 0.18 },
};

function bakeTheme(theme, P) {
  const OUT = join(ROOT, theme);
  mkdirSync(OUT, { recursive: true });
  let total = 0;
  let files = 0;
  // ── per-file <defs> collector ────────────────────────────────────────────
  // Gradients have to be declared before use, and bake() only ever saw a
  // finished body string. This threads a collector through so a helper deep in
  // a shape can register a gradient and get an id back. Content-hashed, so
  // identical gradients dedupe and two calls with different colours cannot
  // collide (usvg silently takes the first definition and mis-colours the rest).
  let DEFS = [];
  let DSEEN = new Map();
  const def = (tpl) => {
    const hit = DSEEN.get(tpl);
    if (hit) return hit;
    let h = 2166136261;
    for (let i = 0; i < tpl.length; i++) h = Math.imul(h ^ tpl.charCodeAt(i), 16777619);
    const id = `g${DEFS.length.toString(36)}${(h >>> 0).toString(36)}`;
    DSEEN.set(tpl, id);
    DEFS.push(tpl.replace('id="@"', `id="${id}"`));
    return id;
  };
  const bake = (name, w, h, body) => {
    if (ONLY && !ONLY.has(name.replace(/\.png$/, ""))) {
      DEFS = []; DSEEN = new Map();
      return;
    }
    const head = DEFS.length ? `<defs>${DEFS.join("")}</defs>` : "";
    const png = new Resvg(svg(w, h, head + body), RESVG_OPTS).render().asPng();
    writeFileSync(join(OUT, name), png);
    DEFS = []; DSEEN = new Map();
    total += png.length;
    files += 1;
  };

  // ── THE SHADING LAW ──────────────────────────────────────────────────────
  // Built once here; the pieces below supply geometry only. Retuning the whole
  // game's lighting is then an edit inside isoBox/slab, not 16 pieces x 7
  // palettes by hand.
  const HUE = P.shadowHueDeg ?? 260;
  const lift = (hex, a) => shift(hex, a, HUE);
  const sink = (hex, a) => shift(hex, -a, HUE);
  /** the four corners of an iso tile diamond whose BOTTOM corner is (cx,cy) */
  const foot = (cx, cy, s = 1) => [
    [cx, cy - 64 * s],
    [cx + 64 * s, cy - 32 * s],
    [cx, cy],
    [cx - 64 * s, cy - 32 * s],
  ];
  /** the ambient shadow colour: dark, and tinted by the theme rather than grey */
  const SHC = hslToHex(HUE, 0.34, 0.12);

  /**
   * Vertical gradient. objectBoundingBox, so it must NOT land on an
   * axis-aligned <line> — such an element has a zero-extent bbox and per spec
   * renders NOTHING AT ALL, silently. Use vgradUS for anything that might.
   */
  const vgrad = (top, bot) =>
    def(`<linearGradient id="@" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`);
  /** userSpaceOnUse variant: safe on lines, needed wherever y extent is known. */
  const vgradUS = (y0, y1, top, bot) =>
    def(`<linearGradient id="@" gradientUnits="userSpaceOnUse" x1="0" y1="${f(y0)}" x2="0" y2="${f(y1)}"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`);

  /**
   * A contact shadow that is soft by CONSTRUCTION rather than by filter.
   *
   * feGaussianBlur would be the obvious tool and it is the wrong one here:
   * resvg's default filter region is -10%/120% of the bbox, which razor-cuts
   * the falloff, and the 1x1 furniture canvas has only ~26px below the shadow
   * (character cells have 3px). A radial gradient cannot bleed past its own
   * ellipse, so it needs no region math and can never clip or ghost.
   */
  const softShadow = (cx, cy, rx, ry, a = 0.34) =>
    ell(cx, cy, rx, ry, `url(#${def(
      `<radialGradient id="@"><stop offset="0" stop-color="${SHC}" stop-opacity="${a}"/><stop offset="0.45" stop-color="${SHC}" stop-opacity="${f(a * 0.82)}"/><stop offset="0.78" stop-color="${SHC}" stop-opacity="${f(a * 0.3)}"/><stop offset="1" stop-color="${SHC}" stop-opacity="0"/></radialGradient>`
    )})`);

  /** the tight dark core where a leg or base meets the floor: sells the contact */
  const ao = (cx, cy, r, a = 0.3) =>
    ell(cx, cy, r, r * 0.42, `url(#${def(
      `<radialGradient id="@"><stop offset="0" stop-color="${SHC}" stop-opacity="${f(a)}"/><stop offset="1" stop-color="${SHC}" stop-opacity="0"/></radialGradient>`
    )})`);

  /** material-aware silhouette edge, replacing the one-stroke-fits-all outline */
  const edgeOf = (mat) => {
    const m = MAT[mat] ?? MAT.wood;
    return `stroke="${P.outline}" stroke-width="${m.w}" stroke-linejoin="round" stroke-opacity="${m.a / 0.5}"`;
  };

  /**
   * A shaded 3-face isometric box: stove, counter body, toilet tank.
   *
   * MIRROR SAFETY. scene.ts flips any 1x1 piece facing "sw", and the starter
   * layout ships four of them, so a strong left/right light flips with it. The
   * contrast therefore lives in the VERTICAL gradient inside each face (which
   * is mirror-invariant and reads as form); the left-to-right base difference
   * stays small, about where the old flat art already had it.
   */
  const isoBox = ({ cx, cy, s = 1, h, base, mat = "wood", topLift = 0.2 }) => {
    const m = MAT[mat] ?? MAT.wood;
    const b = foot(cx, cy, s);
    const t = foot(cx, cy - h, s);
    const L = lift(base, 0.045), R = sink(base, 0.045);
    const yTop = t[0][1], yBot = b[2][1];
    const faceL = poly([t[3], t[2], b[2], b[3]], `url(#${vgradUS(yTop, yBot, lift(L, m.face * 0.45), sink(L, m.face))})`);
    const faceR = poly([t[1], t[2], b[2], b[1]], `url(#${vgradUS(yTop, yBot, lift(R, m.face * 0.35), sink(R, m.face * 1.1))})`);
    const top = poly(t, `url(#${vgradUS(t[0][1], t[2][1], lift(base, topLift), lift(base, topLift * 0.3))})`);
    // symmetric top rim: only the two UPPER edges, so it mirrors cleanly
    const rim = `<polyline points="${pts([t[3], t[0], t[1]])}" fill="none" stroke="${lift(base, 0.34)}" stroke-width="${m.w + 0.4}" stroke-linejoin="round" opacity="${f(0.3 + m.rim)}"/>`;
    return faceL + faceR + top + rim + poly(t, "none", edgeOf(mat));
  };

  /**
   * Diamond top + a short drop skirt: table tops, chair and bench seats.
   *
   * The drops start a step DARKER than the top rather than at the same value.
   * Without that step the seam between an up-facing surface and a hanging one
   * disappears and the piece reads as a flat decal, which is most of what was
   * wrong with the old art.
   */
  const slab = ({ cx, cy, rx, ry, drop, base, mat = "wood", topLift = 0.16, dropSink = 0.12 }) => {
    const m = MAT[mat] ?? MAT.wood;
    const d = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
    const L = sink(lift(base, 0.04), dropSink);
    const R = sink(sink(base, 0.04), dropSink);
    const dropR = poly([d[1], d[2], [d[2][0], d[2][1] + drop], [d[1][0], d[1][1] + drop]],
      `url(#${vgradUS(cy, cy + ry + drop, R, sink(R, m.face * 1.1))})`);
    const dropL = poly([d[3], d[2], [d[2][0], d[2][1] + drop], [d[3][0], d[3][1] + drop]],
      `url(#${vgradUS(cy, cy + ry + drop, L, sink(L, m.face * 0.8))})`);
    const top = poly(d, `url(#${vgradUS(cy - ry, cy + ry, lift(base, topLift), lift(base, topLift * 0.15))})`);
    return { d, dropL, dropR, top, edge: poly(d, "none", edgeOf(mat)) };
  };

  // ── floor tiles ──────────────────────────────────────────────────────────
  const D = [
    [TW / 2, 0],
    [TW, TH / 2],
    [TW / 2, TH],
    [0, TH / 2],
  ];
  function floorTile(name, base, isAlt) {
    let inner = "";
    if (P.floor === "plank") {
      for (const k of [0.25, 0.5, 0.75]) {
        const sx = TW / 2 - (TW / 2) * k;
        const sy = (TH / 2) * k;
        inner += line(sx, sy, sx + TW / 2, sy + TH / 2, P.floorSeam, 2.5, 'opacity="0.55"');
        inner += line(sx + 3, sy - 1.5, sx + TW / 2 + 3, sy + TH / 2 - 1.5, P.floorLight, 1.6, 'opacity="0.35"');
      }
    } else if (P.floor === "tatami") {
      // a bordered mat with fine weave lines
      inner += poly(
        [[TW / 2, 5], [TW - 10, TH / 2], [TW / 2, TH - 5], [10, TH / 2]],
        base,
        `stroke="${P.floorSeam}" stroke-width="3.5"`
      );
      for (let i = 1; i < 6; i++) {
        const k = i / 6;
        inner += line(
          10 + (TW / 2 - 10) * k, TH / 2 - (TH / 2 - 5) * k,
          TW / 2 + (TW / 2 - 10) * k, TH - 5 - (TH / 2 - 5) * k,
          P.floorLight, 1.2, 'opacity="0.3"'
        );
      }
    } else if (P.floor === "tile") {
      // grout lines + a smaller inset diamond, alt tiles get a motif dot
      inner += poly(
        [[TW / 2, 7], [TW - 14, TH / 2], [TW / 2, TH - 7], [14, TH / 2]],
        P.floorLight,
        'opacity="0.28"'
      );
      inner += poly(D, "none", `stroke="${P.floorSeam}" stroke-width="3"`);
      if (isAlt) {
        inner += ell(TW / 2, TH / 2, 9, 4.5, P.floorSeam, 'opacity="0.5"');
        inner += ell(TW / 2, TH / 2, 4, 2, P.floorLight, 'opacity="0.7"');
      }
    } else if (P.floor === "checker") {
      inner += poly(D, "none", `stroke="${P.floorSeam}" stroke-width="1.6" opacity="0.5"`);
      if (!isAlt) {
        inner += `<polyline points="${pts([[0, TH / 2], [TW / 2, 0], [TW, TH / 2]])}" fill="none" stroke="${P.floorLight}" stroke-width="2" opacity="0.5"/>`;
      }
    } else if (P.floor === "parquet") {
      // chevron: short strokes in both iso directions
      for (const k of [0.3, 0.62]) {
        const sx = TW / 2 - (TW / 2) * k;
        const sy = (TH / 2) * k;
        inner += line(sx, sy, sx + TW / 2 * 0.55, sy + TH / 2 * 0.55, P.floorSeam, 2.2, 'opacity="0.5"');
      }
      for (const k of [0.35, 0.68]) {
        const sx = TW / 2 + (TW / 2) * k;
        const sy = (TH / 2) * k;
        inner += line(sx, sy, sx - TW / 2 * 0.55, sy + TH / 2 * 0.55, P.floorSeam, 2.2, 'opacity="0.5"');
      }
      inner += line(TW / 2, 4, TW / 2, TH - 4, P.floorLight, 1.4, 'opacity="0.25"');
    }
    // A seam groove just inside the diamond, on ALL FOUR edges equally.
    // Floors tile, so anything asymmetric (a gradient across the tile, a
    // one-sided shadow) turns into visible repeating banding across the room.
    // Four matched edges are seamless by construction: neighbouring tiles meet
    // groove-to-groove and it reads as a gap between boards.
    const groove = poly(D, "none", `stroke="${SHC}" stroke-width="3" stroke-linejoin="round" opacity="0.16"`);
    const body = `
    <defs><clipPath id="d"><polygon points="${pts(D)}"/></clipPath></defs>
    ${poly(D, base)}
    <g clip-path="url(#d)">${inner}${groove}</g>
    ${poly(D, "none", `stroke="${P.outline}" stroke-width="2" stroke-linejoin="round"`)}
    ${P.floor === "checker" ? "" : `<polyline points="${pts([[0, TH / 2], [TW / 2, 0], [TW, TH / 2]])}" fill="none" stroke="${P.floorLight}" stroke-width="2" opacity="0.4"/>`}`;
    bake(name, TW, TH, body);
  }
  // domain collections (ADR-0105) ship FURNITURE ONLY: their art must not
  // change with the player's chosen country style, and they never own a room
  if (!P.itemsOnly) {
    floorTile("floor.png", P.floorA, false);
    floorTile("floor-alt.png", P.floorB, true);
  }

  // ── walls ────────────────────────────────────────────────────────────────
  function windowIn(u0, u1) {
    const fr = 2.2;
    const w = u1 - u0;
    // NOTE: this draws in TILE space (x in tile units, y 0..96) and is then
    // squashed by the wall matrix. Gradients survive that transform; FILTERS do
    // not, because resvg shades in local space and these matrices are ~32:1
    // anisotropic. So: gradients only in here, never feGaussianBlur.
    const glass = def(`<linearGradient id="@" gradientUnits="userSpaceOnUse" x1="0" y1="19" x2="0" y2="53"><stop offset="0" stop-color="#243349"/><stop offset="0.52" stop-color="#3d5a72"/><stop offset="1" stop-color="#7d6a55"/></linearGradient>`);
    return `
    <rect x="${f(u0 - 0.03)}" y="15" width="${f(w + 0.06)}" height="42" fill="${sink(P.frame, 0.22)}"/>
    <rect x="${f(u0)}" y="16" width="${f(w)}" height="40" fill="url(#${vgradUS(16, 56, lift(P.frame, 0.16), sink(P.frame, 0.12))})"/>
    <rect x="${f(u0 + 0.06)}" y="19" width="${f(w - 0.12)}" height="34" fill="url(#${glass})"/>
    <rect x="${f(u0 + 0.06)}" y="36" width="${f(w - 0.12)}" height="17" fill="url(#${vgradUS(36, 53, "#e0a866", "#b6733d")})" opacity="0.6"/>
    <rect x="${f(u0 + w / 2 - 0.02)}" y="19" width="0.04" height="34" fill="${P.frame}"/>
    <rect x="${f(u0)}" y="35" width="${f(w)}" height="${f(fr)}" fill="${P.frame}"/>
    <rect x="${f(u0 - 0.05)}" y="14" width="${f(w + 0.1)}" height="2.4" fill="${P.woodDark}"/>
    <rect x="${f(u0 - 0.04)}" y="16" width="0.09" height="42" fill="url(#${vgradUS(16, 58, lift(P.curtain, 0.16), sink(P.curtain, 0.2))})"/>
    <rect x="${f(u1 - 0.05)}" y="16" width="0.09" height="42" fill="url(#${vgradUS(16, 58, lift(P.curtain, 0.16), sink(P.curtain, 0.2))})"/>
    <rect x="${f(u0 - 0.06)}" y="56" width="${f(w + 0.12)}" height="3" fill="url(#${vgradUS(56, 59, lift(P.woodLight, 0.24), P.woodLight)})"/>
    <rect x="${f(u0 - 0.14)}" y="59" width="${f(w + 0.28)}" height="9" fill="url(#${vgradUS(59, 68, "#f7c873", "#f7c873")})" opacity="0.12"/>`;
  }

  /**
   * A wall is lighter where it meets the ceiling and sinks toward the floor.
   * STEPPED, not a smooth gradient, for two reasons: measured, one smooth
   * gradient takes the 640x524 wall from 5.2KB to 25.9KB (two take it to
   * 57.4KB) while six bands cost 8.8KB; and a filter or gradient placed across
   * the whole wall group would be wrecked anyway, because resvg shades in local
   * space and the wall matrices are 32:1 anisotropic. Banding also reads as
   * deliberate against this flat-ish style.
   */
  const bands = (x, y0, y1, w, base, from, to, n = 6) => {
    let o = "";
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const yy = y0 + ((y1 - y0) * i) / n;
      o += `<rect x="${f(x)}" y="${f(yy)}" width="${f(w)}" height="${f((y1 - y0) / n + 0.02)}" fill="${shift(base, from + (to - from) * k, HUE)}"/>`;
    }
    return o;
  };

  function wallBody(tiles, plaster, windows, dressing) {
    let b = `
    ${bands(0, 0, WALLH, tiles, plaster, 0.1, -0.1, 10)}
    <rect x="0" y="0" width="${tiles}" height="3" fill="${lift(P.trim, 0.14)}"/>
    ${bands(0, 62, 96, tiles, P.wainscot, 0.06, -0.14, 4)}
    <rect x="0" y="62" width="${tiles}" height="2" fill="${P.wainscotDark}"/>`;
    for (let i = 0; i < tiles * 2; i++) {
      b += `<rect x="${f(i * 0.5 + 0.24)}" y="66" width="0.02" height="26" fill="${P.wainscotDark}" opacity="0.5"/>`;
    }
    b += `<rect x="0" y="${WALLH}" width="${tiles}" height="3" fill="${P.skirt}"/>`;
    for (const gy of windows) b += windowIn(gy + 0.18, gy + 0.82);
    b += dressing;
    return b;
  }

  /**
   * WALL GEOMETRY, now a function of tile count (M8b room expansion).
   *
   * A wall runs along an iso diagonal, so one tile costs 64 art px across and
   * 32 down; the extra 204 is the wall height above the floor plus the skirt.
   * Verified against the two sizes that shipped before this: 8 tiles gave
   * 512x460 and 10 tiles gave 640x524, which is exactly what this returns.
   */
  const wallCanvas = (tiles) => ({ w: tiles * 64, h: tiles * 32 + 204 });

  if (!P.itemsOnly) {
    const dressing = `
    <rect x="3.14" y="20" width="0.6" height="18" fill="url(#${vgradUS(20, 38, lift(P.wood, 0.2), sink(P.wood, 0.18))})"/>
    <rect x="3.17" y="21" width="0.54" height="16" fill="${sink(P.wood, 0.3)}" opacity="0.5"/>
    <rect x="3.2" y="22" width="0.48" height="14" fill="url(#${vgradUS(22, 36, lift(P.trim, 0.14), sink(P.trim, 0.1))})"/>
    <ellipse cx="3.44" cy="29" rx="0.14" ry="4.5" fill="${P.leaf}"/>`;
    for (const tiles of LEFT_WALL_TILES) {
      const c = wallCanvas(tiles);
      // a window every other tile from 2, so a deeper room gains windows
      // rather than gaining blank plaster
      const windows = [];
      for (let gy = 2; gy < tiles; gy += 2) windows.push(gy);
      const body = `<g transform="matrix(-64 32 0 2 ${c.w} 0)">${wallBody(tiles, P.plasterL, windows, dressing)}</g>`;
      bake(`wall-left-${tiles}.png`, c.w, c.h, body);
    }
  }

  if (!P.itemsOnly) {
    let art = "";
    if (P.wallArt === "pans") {
      art += `<rect x="1.9" y="10" width="2.4" height="1.6" fill="${P.woodDark}"/>`;
      for (const [u, r] of [[2.25, 7], [2.95, 9], [3.65, 6]]) {
        art += `
        <rect x="${f(u - 0.012)}" y="11.6" width="0.024" height="6" fill="#262321"/>
        ${ell(u, 18 + r, 0.16 + r / 90, r, `url(#${vgradUS(18, 18 + 2 * r, "#4a4643", "#221f1d")})`)}
        ${ell(u, 18 + r * 0.32, 0.1 + r / 130, r * 0.3, "#6f6a63", 'opacity="0.45"')}
        ${ell(u - 0.045, 18 + r * 0.7, 0.045, r * 0.5, "#b9b5ad", 'opacity="0.5"')}`;
      }
    } else if (P.wallArt === "lanterns") {
      art += `<rect x="1.8" y="9" width="2.6" height="1.2" fill="${P.woodDark}"/>`;
      for (const [u, len] of [[2.2, 5], [2.95, 7], [3.7, 5]]) {
        art += `
        <rect x="${f(u - 0.008)}" y="10.2" width="0.016" height="${f(len)}" fill="#262321"/>
        <rect x="${f(u - 0.13)}" y="${f(10.2 + len)}" width="0.26" height="16" rx="0.09" fill="#d8543f"/>
        <rect x="${f(u - 0.13)}" y="${f(14 + len)}" width="0.26" height="1.6" fill="#f2e2c0" opacity="0.65"/>
        <rect x="${f(u - 0.06)}" y="${f(9.6 + len)}" width="0.12" height="1.4" fill="#2b2119"/>`;
      }
    } else if (P.wallArt === "strings") {
      // papel picado bunting on a swag line
      const cols = ["#d94f5c", "#2e9b96", "#e8c04a", "#e0713f", "#8f68b5"];
      art += `<path d="M1.8 12 Q 3 20 4.3 12" fill="none" stroke="${P.woodDark}" stroke-width="0.9"/>`;
      for (let i = 0; i < 7; i++) {
        const u = 1.9 + i * 0.4;
        const sag = 12 + 8 * Math.sin((i / 6) * Math.PI);
        art += `<rect x="${f(u - 0.13)}" y="${f(sag)}" width="0.26" height="9" fill="${cols[i % cols.length]}" opacity="0.92"/>`;
        art += `<circle cx="${f(u)}" cy="${f(sag + 4.5)}" r="0.06" fill="${P.plasterR}" opacity="0.85"/>`;
      }
    } else if (P.wallArt === "neon") {
      art += `
      <rect x="1.9" y="12" width="2.5" height="26" rx="1" fill="#1f2a33"/>
      <rect x="2.0" y="14" width="2.3" height="22" rx="0.8" fill="none" stroke="#e8556d" stroke-width="1.6"/>
      <rect x="2.3" y="19" width="1.7" height="2" fill="#5fd7e8"/>
      <rect x="2.3" y="24" width="1.2" height="2" fill="#5fd7e8"/>
      <rect x="2.3" y="29" width="1.5" height="2" fill="#5fd7e8"/>`;
    }
    const chalk =
      P.wallArt === "neon"
        ? `
      <rect x="5.5" y="15" width="1.6" height="26" rx="0.6" fill="#e8e4dc"/>
      <rect x="5.62" y="18" width="1.36" height="2" fill="#c93f45"/>
      <rect x="5.62" y="23" width="1.0" height="1.6" fill="#6f7681"/>
      <rect x="5.62" y="27" width="1.2" height="1.6" fill="#6f7681"/>
      <rect x="5.62" y="31" width="0.8" height="1.6" fill="#6f7681"/>`
        : `
      <rect x="5.45" y="13" width="1.7" height="34" fill="${P.wood}"/>
      <rect x="5.55" y="15" width="1.5" height="30" fill="#2f3a33"/>
      <rect x="5.68" y="19" width="1.0" height="1.6" fill="#dfe6da" opacity="0.75"/>
      <rect x="5.68" y="24" width="1.24" height="1.2" fill="#dfe6da" opacity="0.55"/>
      <rect x="5.68" y="28.6" width="0.9" height="1.2" fill="#dfe6da" opacity="0.55"/>
      <rect x="5.68" y="33.2" width="1.1" height="1.2" fill="#dfe6da" opacity="0.55"/>
      <rect x="5.68" y="37.8" width="0.8" height="1.2" fill="#dfe6da" opacity="0.55"/>`;
    const corner = `<rect x="0" y="0" width="0.12" height="${WALLH + 3}" fill="${P.wainscotDark}"/>`;
    for (const tiles of RIGHT_WALL_TILES) {
      const c = wallCanvas(tiles);
      // the pans/lanterns/bunting and the chalkboard live in the first ~7
      // tiles; a wider wall gets windows in the space beyond them
      const windows = [];
      for (let gx = 8; gx < tiles; gx += 2) windows.push(gx);
      const body = `<g transform="matrix(64 32 0 2 0 0)">${wallBody(tiles, P.plasterR, windows, art + chalk + corner)}</g>`;
      bake(`wall-right-${tiles}.png`, c.w, c.h, body);
    }
  }

  // ── 1x1 furniture ────────────────────────────────────────────────────────
  const FW = 192, FH = 224, RX = 96, RY = 208;
  const furn = (name, body) => bake(name, FW, FH, `<g>${body}</g>`);

  /**
   * A tapered leg as a POLYGON, not a <line>.
   *
   * Two reasons. A line cannot carry an objectBoundingBox gradient (zero-extent
   * bbox renders nothing at all, silently), and a leg that is fractionally
   * narrower at the foot than at the top is most of what separates "furniture"
   * from "rectangle". Each one gets an ambient-occlusion dot where it lands.
   */
  const leg = (x, yTop, yBot, w, base = P.wood) => {
    const wb = w * 0.76;
    return poly(
      [[x - w / 2, yTop], [x + w / 2, yTop], [x + wb / 2, yBot], [x - wb / 2, yBot]],
      `url(#${vgradUS(yTop, yBot, lift(base, 0.18), sink(base, 0.32))})`
    );
  };

  // TABLE
  {
    const shadow = softShadow(RX, RY - 32, 66, 27);
    const topC = [RX, RY - 100];
    const cloth = slab({
      cx: topC[0], cy: topC[1], rx: 62, ry: 30, drop: 22,
      base: P.cloth, mat: "cloth", topLift: 0.2, dropSink: 0.14,
    });
    const topD = cloth.d;
    const dropR = cloth.dropR;
    const dropL = cloth.dropL;
    let pattern = "";
    if (P.clothStyle === "gingham") {
      for (let i = -2; i <= 2; i++) {
        const o = i * 24;
        pattern += line(topD[3][0] + o, topD[3][1] + o / 2, topD[0][0] + o, topD[0][1] + o / 2, P.cloth2, 9, 'opacity="0.5"');
        pattern += line(topD[0][0] - o, topD[0][1] + o / 2, topD[1][0] - o, topD[1][1] + o / 2, P.cloth2, 9, 'opacity="0.5"');
      }
    } else if (P.clothStyle === "stripe") {
      for (let i = -2; i <= 2; i++) {
        const o = i * 22;
        pattern += line(topD[3][0] + o, topD[3][1] + o / 2, topD[0][0] + o, topD[0][1] + o / 2, i % 2 === 0 ? P.cloth2 : P.accent, 7, 'opacity="0.6"');
      }
    } else if (P.clothStyle === "paper") {
      pattern += poly(
        [[topC[0], topC[1] - 18], [topC[0] + 38, topC[1]], [topC[0], topC[1] + 18], [topC[0] - 38, topC[1]]],
        P.cloth2,
        'opacity="0.35"'
      );
    }
    // legs read the collection: slim chrome for neon, chunky stone for bone
    const legW = P.furnStyle === "neon" ? 5 : P.furnStyle === "stone" ? 13 : 8;
    // A domain collection is a REWARD (ADR-0105, unlocked by three days of LP),
    // so it has to read as different from across the room. Recolouring the same
    // geometry does not do that at 48px. The SILHOUETTE does, so each
    // collection gets its own base rather than three wooden legs.
    const glowDisc = (cx, cy, rx) =>
      ell(cx, cy, rx, rx * 0.41, `url(#${def(
        `<radialGradient id="@"><stop offset="0" stop-color="${P.accent}" stop-opacity="0.5"/><stop offset="1" stop-color="${P.accent}" stop-opacity="0"/></radialGradient>`
      )})`);
    const legs =
      P.furnStyle === "neon"
        ? // one lit pedestal: nothing else in the game floats
          ao(RX, RY - 34, 38, 0.28) +
          glowDisc(RX, RY - 34, 34) +
          poly(
            [[RX - 17, RY - 38], [RX + 17, RY - 38], [RX + 12, RY - 30], [RX - 12, RY - 30]],
            `url(#${vgradUS(RY - 38, RY - 30, lift(P.wood, 0.22), sink(P.wood, 0.26))})`
          ) +
          leg(RX, RY - 82, RY - 36, 11, P.wood) +
          ell(RX, RY - 80, 9, 3.5, P.accent, 'opacity="0.5"')
        : P.furnStyle === "stone"
          ? // a carved plinth: heavy, and no daylight under the table at all
            ao(RX, RY - 28, 44, 0.26) +
            isoBox({ cx: RX, cy: RY - 8, s: 0.4, h: 50, base: P.wood, mat: "stone", topLift: 0.14 })
          : ao(RX - 40, RY - 52, legW * 1.9) + leg(RX - 40, RY - 86, RY - 52, legW) +
            ao(RX + 40, RY - 52, legW * 1.9) + leg(RX + 40, RY - 86, RY - 52, legW) +
            ao(RX, RY - 34, legW * 2.1) + leg(RX, RY - 78, RY - 34, legW + 1, P.woodDark);
    const edge =
      P.furnStyle === "neon"
        ? poly(topD, "none", `stroke="${P.accent}" stroke-width="3" stroke-linejoin="round" opacity="0.85"`)
        : P.furnStyle === "stone"
          ? poly(topD, "none", `stroke="${P.woodDark}" stroke-width="5" stroke-linejoin="round" opacity="0.7"`)
          : "";
    const clothTop = `
    <clipPath id="tc"><polygon points="${pts(topD)}"/></clipPath>
    ${cloth.top}
    <g clip-path="url(#tc)">${pattern}</g>
    ${edge}
    ${cloth.edge}`;
    // plates: a rim, a well, and a soft inner shadow so they read as dishes
    const plate = (cx, cy) =>
      ell(cx, cy + 1.5, 14, 7, `url(#${def(`<radialGradient id="@"><stop offset="0.55" stop-color="${SHC}" stop-opacity="0.22"/><stop offset="1" stop-color="${SHC}" stop-opacity="0"/></radialGradient>`)})`) +
      ell(cx, cy, 13, 6.5, `url(#${vgradUS(cy - 6.5, cy + 6.5, "#fbf8f0", "#ded6c6")})`, `stroke="${P.outline}" stroke-width="1.2" stroke-opacity="0.7"`) +
      ell(cx, cy - 0.6, 8, 3.6, "#efe9dc", 'opacity="0.85"');
    const dishes = plate(RX - 26, RY - 104) + plate(RX + 28, RY - 96);
    const candle = `
    ${ell(RX + 4, RY - 118, 13, 7, `url(#${def(`<radialGradient id="@"><stop offset="0" stop-color="#ffd489" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd489" stop-opacity="0"/></radialGradient>`)})`)}
    <rect x="${RX + 1}" y="${RY - 116}" width="6" height="12" rx="2" fill="url(#${vgradUS(RY - 116, RY - 104, "#f7f2e2", "#ddd3bd")})" stroke="${P.outline}" stroke-width="1" stroke-opacity="0.7"/>
    ${ell(RX + 4, RY - 119, 2.6, 4, `url(#${vgradUS(RY - 123, RY - 115, "#fff0c0", "#f0a83c")})`)}`;
    furn("table.png", shadow + legs + dropR + dropL + clothTop + dishes + candle);
  }

  // CHAIR
  {
    const shadow = softShadow(RX, RY - 32, 45.6, 18.3);
    const seatC = [RX, RY - 66];
    const seat = [
      [seatC[0], seatC[1] - 20],
      [seatC[0] + 40, seatC[1]],
      [seatC[0], seatC[1] + 20],
      [seatC[0] - 40, seatC[1]],
    ];
    // same reasoning as the table: the collection has to be recognisable by
    // outline alone, because that is all you get at a distance.
    const legs =
      P.furnStyle === "neon"
        ? ell(RX, RY - 26, 26, 11, `url(#${def(
            `<radialGradient id="@"><stop offset="0" stop-color="${P.accent}" stop-opacity="0.45"/><stop offset="1" stop-color="${P.accent}" stop-opacity="0"/></radialGradient>`
          )})`) +
          poly(
            [[RX - 13, RY - 30], [RX + 13, RY - 30], [RX + 9, RY - 23], [RX - 9, RY - 23]],
            `url(#${vgradUS(RY - 30, RY - 23, lift(P.wood, 0.22), sink(P.wood, 0.26))})`
          ) +
          leg(RX, RY - 62, RY - 28, 8, P.wood)
        : P.furnStyle === "stone"
          ? ao(RX, RY - 24, 32, 0.24) +
            isoBox({ cx: RX, cy: RY - 12, s: 0.29, h: 42, base: P.wood, mat: "stone", topLift: 0.12 })
          : ao(RX, RY - 12, 15) + leg(RX, RY - 46, RY - 12, 7, P.woodDark) +
            ao(RX + 40, RY - 32, 14) + leg(RX + 40, RY - 66, RY - 32, 7) +
            ao(RX - 40, RY - 32, 14) + leg(RX - 40, RY - 66, RY - 32, 7) +
            leg(RX, RY - 86, RY - 62, 6);
    // the upright back is a plane: vertical gradient only, so it mirrors clean
    const back = poly(
      [
        [seat[3][0], seat[3][1]],
        [seat[0][0], seat[0][1]],
        [seat[0][0], seat[0][1] - 64],
        [seat[3][0], seat[3][1] - 64],
      ],
      `url(#${vgradUS(seat[0][1] - 64, seat[3][1], lift(P.seat, 0.16), sink(P.seat, 0.18))})`,
      edgeOf("wood")
    );
    const slat = line(seat[3][0] + 8, seat[3][1] - 34, seat[0][0] - 6, seat[0][1] - 37, sink(P.woodDark, 0.1), 4, 'opacity="0.6"');
    const s = slab({ cx: seatC[0], cy: seatC[1], rx: 40, ry: 20, drop: 7, base: P.woodLight, mat: "wood", topLift: 0.14 });
    const seatFill = s.dropR + s.dropL + s.top + s.edge;
    const cushion = poly(
      [
        [seatC[0], seatC[1] - 13],
        [seatC[0] + 27, seatC[1]],
        [seatC[0], seatC[1] + 13],
        [seatC[0] - 27, seatC[1]],
      ],
      `url(#${vgradUS(seatC[1] - 13, seatC[1] + 13, lift(P.cushion, 0.18), sink(P.cushion, 0.12))})`,
      'opacity="0.95"'
    );
    furn("chair.png", shadow + back + slat + legs + seatFill + cushion);
  }

  // STOVE (iron everywhere; the trim picks up the theme)
  {
    const shadow = softShadow(RX, RY - 32, 63.8, 24.4);
    const h = 78;
    const IRON = "#454443";
    // the whole cabinet in one call: two graded faces, a graded top and a
    // symmetric lit rim. Metal gets the strongest rim in the MAT table, which
    // is what stops it reading as the same substance as the wooden furniture.
    const box = isoBox({ cx: RX, cy: RY, s: 0.92, h, base: IRON, mat: "metal", topLift: 0.26 });
    const grounding = ao(RX, RY - 28, 38, 0.24);
    const door = poly(
      [[RX + 10, RY - 60], [RX + 46, RY - 78], [RX + 46, RY - 46], [RX + 10, RY - 28]],
      `url(#${vgradUS(RY - 78, RY - 28, lift(IRON, 0.08), sink(IRON, 0.26))})`,
      `stroke="#1d1b19" stroke-width="2"`
    );
    // a window with the oven's warmth behind it: the cabinet stops being solid
    const window = poly(
      [[RX + 17, RY - 60], [RX + 40, RY - 71.5], [RX + 40, RY - 53], [RX + 17, RY - 41.5]],
      `url(#${def(`<radialGradient id="@"><stop offset="0" stop-color="#ffb457" stop-opacity="0.5"/><stop offset="1" stop-color="#7a3a10" stop-opacity="0.32"/></radialGradient>`)})`,
      `stroke="#22201e" stroke-width="1.6"`
    );
    const handle =
      line(RX + 15, RY - 58, RX + 41, RY - 71, sink(P.counterTop, 0.25), 4.5) +
      line(RX + 15, RY - 59.4, RX + 41, RY - 72.4, lift(P.counterTop, 0.2), 2.2);
    const burner = (cx, cy) =>
      ell(cx, cy, 15, 7.5, `url(#${def(`<radialGradient id="@"><stop offset="0" stop-color="#1b1917"/><stop offset="1" stop-color="#33302c"/></radialGradient>`)})`, `stroke="#55504a" stroke-width="2"`) +
      ell(cx, cy - 0.8, 9, 4.4, "none", `stroke="#6b655d" stroke-width="1.2" opacity="0.55"`);
    const pan =
      ell(RX - 22, RY - h - 11.5, 17.5, 8.8, sink("#b9b5ad", 0.3)) +
      ell(RX - 22, RY - h - 13, 17, 8.5, `url(#${vgradUS(RY - h - 21, RY - h - 5, "#d6d2ca", "#8e8a82")})`) +
      ell(RX - 22, RY - h - 14.5, 13, 6, `url(#${vgradUS(RY - h - 20, RY - h - 9, "#9a968e", "#6f6b64")})`) +
      line(RX - 36, RY - h - 20, RX - 50, RY - h - 28, "#3a3a3c", 4.5);
    const knobs = [0, 1, 2]
      .map((i) =>
        ell(RX + 14 + i * 11, RY - 46 + i * 5.5, 3, 3, `url(#${def(`<radialGradient id="@" fx="0.35" fy="0.3"><stop offset="0" stop-color="#e8e4dc"/><stop offset="1" stop-color="#8a867e"/></radialGradient>`)})`)
      )
      .join("");
    const glow = ell(RX - 22, RY - h - 13, 11, 5.5, `url(#${def(`<radialGradient id="@"><stop offset="0" stop-color="#ffcf7d" stop-opacity="0.5"/><stop offset="1" stop-color="#ffcf7d" stop-opacity="0"/></radialGradient>`)})`);
    furn("stove.png", shadow + grounding + box + door + window + handle + burner(RX - 22, RY - h - 11) + burner(RX + 16, RY - h - 3) + pan + glow + knobs);
  }

  // BENCH (ADR-0107): a two-seat waiting bench, one tile, back along the NW
  // edge like a chair so it reads as seating rather than a table.
  {
    const shadow = softShadow(RX, RY - 30, 59.3, 23.2);
    const seatC = [RX, RY - 62];
    const seat = [
      [seatC[0], seatC[1] - 27],
      [seatC[0] + 54, seatC[1]],
      [seatC[0], seatC[1] + 27],
      [seatC[0] - 54, seatC[1]],
    ];
    const legs =
      ao(RX + 49, RY - 30, 14) + leg(RX + 50, RY - 62, RY - 30, 7, P.woodDark) +
      ao(RX - 49, RY - 30, 14) + leg(RX - 50, RY - 62, RY - 30, 7, P.woodDark) +
      ao(RX, RY - 12, 14) + leg(RX, RY - 36, RY - 12, 7, P.woodDark);
    const back = poly(
      [
        [seat[3][0], seat[3][1]],
        [seat[0][0], seat[0][1]],
        [seat[0][0], seat[0][1] - 52],
        [seat[3][0], seat[3][1] - 52],
      ],
      `url(#${vgradUS(seat[0][1] - 52, seat[3][1], lift(P.seat, 0.16), sink(P.seat, 0.18))})`,
      edgeOf("wood")
    );
    const slats =
      line(seat[3][0] + 7, seat[3][1] - 20, seat[0][0] - 5, seat[0][1] - 23, sink(P.woodDark, 0.08), 4, 'opacity="0.55"') +
      line(seat[3][0] + 7, seat[3][1] - 36, seat[0][0] - 5, seat[0][1] - 39, sink(P.woodDark, 0.08), 4, 'opacity="0.55"');
    const sb = slab({ cx: seatC[0], cy: seatC[1], rx: 54, ry: 27, drop: 8, base: P.woodLight, mat: "wood", topLift: 0.14 });
    const seatFill = sb.dropR + sb.dropL + sb.top + sb.edge;
    // two cushions = two waiting spots, readable at a glance
    const cush = (ox) =>
      poly(
        [[seatC[0] + ox, seatC[1] - 11], [seatC[0] + ox + 24, seatC[1] + 1], [seatC[0] + ox, seatC[1] + 13], [seatC[0] + ox - 24, seatC[1] + 1]],
        `url(#${vgradUS(seatC[1] - 11, seatC[1] + 13, lift(P.cushion, 0.18), sink(P.cushion, 0.12))})`,
        'opacity="0.94"'
      );
    const cushions = cush(-20) + cush(20);
    furn("bench.png", shadow + back + slats + legs + seatFill + cushions);
  }

  // PLANT
  {
    const shadow = softShadow(RX, RY - 32, 45.6, 18.3);
    // the pot is a frustum: a vertical gradient plus a darker inset at the base
    // is enough to turn a flat trapezoid into a round vessel.
    const pot = `
    ${ao(RX, RY - 34, 26)}
    ${poly(
      [[RX - 24, RY - 66], [RX + 24, RY - 66], [RX + 17, RY - 34], [RX - 17, RY - 34]],
      `url(#${vgradUS(RY - 66, RY - 34, lift(P.pot, 0.16), sink(P.pot, 0.26))})`,
      edgeOf("ceramic")
    )}
    ${ell(RX, RY - 35, 17, 5, SHC, 'opacity="0.18"')}
    <rect x="${RX - 27}" y="${RY - 72}" width="54" height="10" rx="4" fill="url(#${vgradUS(RY - 72, RY - 62, lift(P.potRim, 0.22), sink(P.potRim, 0.14))})" stroke="${P.outline}" stroke-width="2" stroke-opacity="0.8"/>`;
    // foliage: each ball gets a top-focal radial so it reads as a sphere, and
    // the focal point sits ABOVE centre (light from overhead) which survives
    // the sw/nw mirror unchanged.
    const ball = (cx, cy, rx, ry, base) =>
      ell(cx, cy, rx, ry, `url(#${def(
        `<radialGradient id="@" fx="0.5" fy="0.24"><stop offset="0" stop-color="${lift(base, 0.3)}"/><stop offset="0.62" stop-color="${base}"/><stop offset="1" stop-color="${sink(base, 0.24)}"/></radialGradient>`
      )})`);
    const bush =
      P.furnStyle === "neon"
        ? ell(RX, RY - 104, 26, 24, P.leaf, 'opacity="0.18"') +
          poly([[RX, RY - 132], [RX + 14, RY - 92], [RX, RY - 74], [RX - 14, RY - 92]], `url(#${vgradUS(RY - 132, RY - 74, lift(P.leafDark, 0.2), sink(P.leafDark, 0.2))})`) +
          poly([[RX, RY - 132], [RX + 14, RY - 92], [RX, RY - 92]], `url(#${vgradUS(RY - 132, RY - 92, lift(P.leaf, 0.28), P.leaf)})`) +
          poly([[RX - 4, RY - 124], [RX + 4, RY - 100], [RX - 4, RY - 96]], P.leafLight, 'opacity="0.9"')
        : ball(RX - 14, RY - 96, 22, 20, P.leafDark) +
          ball(RX + 14, RY - 100, 22, 20, P.leaf) +
          ball(RX, RY - 116, 24, 21, P.leaf) +
          ell(RX - 6, RY - 122, 14, 12, P.leafLight, 'opacity="0.55"');
    furn("plant.png", shadow + bush + pot);
  }

  // COUNTER (2x1)
  {
    const W2 = 320, H2 = 240, cx = 208, cy = 216, h = 88;
    const T = [cx - 64, cy - 96];
    const R = [cx + 64, cy - 32];
    const B = [cx, cy];
    const L = [cx - 128, cy - 64];
    const up = (p) => [p[0], p[1] - h];
    const shadow = softShadow(cx - 32, cy - 48, 104, 42, 0.26);
    // Same law as isoBox, applied by hand because the counter's footprint spans
    // two tiles and has its own T/R/B/L geometry. Contrast lives in the
    // vertical gradient down each face; the left/right base delta stays small
    // because scene.ts mirrors this piece on facing "sw" too.
    const cBodyR = sink(P.counterBody, 0.045);
    const cBodyL = lift(P.woodLight, 0.04);
    const faceR = poly([up(R), up(B), B, R], `url(#${vgradUS(up(R)[1], B[1], lift(cBodyR, 0.1), sink(cBodyR, 0.3))})`);
    const faceL = poly([up(L), up(B), B, L], `url(#${vgradUS(up(L)[1], B[1], lift(cBodyL, 0.12), sink(cBodyL, 0.24))})`);
    const grounding = ao(cx - 32, cy - 44, 62, 0.2);
    const panels =
      line(cx + 32, cy - 104, cx + 32, cy - 40, sink(P.woodDark, 0.1), 3, 'opacity="0.5"') +
      line(cx - 44, cy - 110, cx - 44, cy - 46, sink(P.woodDark, 0.1), 3, 'opacity="0.5"') +
      line(cx - 96, cy - 136, cx - 96, cy - 72, sink(P.woodDark, 0.1), 3, 'opacity="0.5"');
    const top = poly(
      [up(T), up(R), up(B), up(L)],
      `url(#${vgradUS(up(T)[1], up(B)[1], lift(P.counterTop, 0.2), lift(P.counterTop, 0.03))})`,
      edgeOf("stone")
    );
    const topEdge = poly(
      [up(L), up(B), [B[0], B[1] - h + 7], [L[0], L[1] - h + 7]],
      `url(#${vgradUS(up(L)[1], up(L)[1] + 7, lift(P.counterTopEdge, 0.1), sink(P.counterTopEdge, 0.18))})`
    );
    // the lit top rim, only the two UPPER edges so it survives mirroring
    const topRim = `<polyline points="${pts([up(L), up(T), up(R)])}" fill="none" stroke="${lift(P.counterTop, 0.3)}" stroke-width="3" stroke-linejoin="round" opacity="0.5"/>`;
    const fruit = (fx, fy, base) =>
      ell(fx, fy, 6.5, 5.5, `url(#${def(`<radialGradient id="@" fx="0.38" fy="0.28"><stop offset="0" stop-color="${lift(base, 0.34)}"/><stop offset="1" stop-color="${sink(base, 0.2)}"/></radialGradient>`)})`);
    const lemons =
      ell(cx - 58, cy - 156, 18, 9, `url(#${vgradUS(cy - 165, cy - 147, "#f2ecdc", "#ddd5c0")})`, `stroke="${P.outline}" stroke-width="1.6" stroke-opacity="0.7"`) +
      fruit(cx - 64, cy - 160, "#e8c04a") + fruit(cx - 52, cy - 158, "#e3b93f") + fruit(cx - 58, cy - 164, "#edc757");
    const cplate = (py) =>
      ell(cx + 22, py, 15, 7, `url(#${vgradUS(py - 7, py + 7, "#fbf8f0", "#ddd5c5")})`, `stroke="${P.outline}" stroke-width="1.2" stroke-opacity="0.65"`);
    const plates = cplate(cy - 146) + cplate(cy - 149) + cplate(cy - 152);
    bake("counter.png", W2, H2, shadow + grounding + faceL + faceR + panels + topEdge + top + topRim + lemons + plates);
  }

  // RESTROOM (ADR-0106): a working fixture, and the same one out of order.
  if (!P.itemsOnly) {
    const restroom = (broken) => {
      const shadow = softShadow(RX, RY - 32, 43.3, 18.3);
      // a proper iso box, not a flat panel: left face, right face, lid
      const tank = `
      ${poly([[RX - 26, RY - 128], [RX + 10, RY - 146], [RX + 10, RY - 92], [RX - 26, RY - 74]], `url(#${vgradUS(RY - 146, RY - 74, "#f4f2ec", "#cfcabd")})`, edgeOf("ceramic"))}
      ${poly([[RX + 10, RY - 146], [RX + 32, RY - 135], [RX + 32, RY - 81], [RX + 10, RY - 92]], `url(#${vgradUS(RY - 146, RY - 81, "#e6e2d8", "#c2bcae")})`, edgeOf("ceramic"))}
      ${poly([[RX - 26, RY - 128], [RX + 10, RY - 146], [RX + 32, RY - 135], [RX - 4, RY - 117]], `url(#${vgradUS(RY - 146, RY - 117, "#fdfcf9", "#e8e5dd")})`, edgeOf("ceramic"))}
      ${ell(RX + 3, RY - 131, 5, 3, "#b9b5ad")}`;
      const lidTilt = broken ? -10 : 0;
      const bowl = `
      ${poly([[RX - 18, RY - 74], [RX + 20, RY - 94], [RX + 26, RY - 60], [RX - 12, RY - 40]], `url(#${vgradUS(RY - 94, RY - 40, "#f4f2ec", "#cbc6b9")})`, edgeOf("ceramic"))}
      ${ell(RX + 4, RY - 76 + lidTilt, 22, 11, broken ? "#d9d4c8" : "#f7f5f0", `stroke="${P.outline}" stroke-width="2" transform="rotate(${broken ? -12 : 0} ${RX + 4} ${RY - 76})"`)}
      ${ell(RX + 4, RY - 78 + lidTilt, 14, 7, "#cfd6da", `transform="rotate(${broken ? -12 : 0} ${RX + 4} ${RY - 78})"`)}`;
      const base = poly(
        [[RX - 12, RY - 44], [RX + 24, RY - 62], [RX + 26, RY - 52], [RX - 10, RY - 34]],
        `url(#${vgradUS(RY - 62, RY - 34, "#e4e0d6", "#bdb7a9")})`
      );
      const pipe = line(RX - 22, RY - 78, RX - 22, RY - 58, "#a9a59d", 5) + line(RX - 23.4, RY - 78, RX - 23.4, RY - 58, "#d2cec6", 1.8);
      const mess = broken
        ? ell(RX + 2, RY - 34, 30, 13, "#6f8fae", 'opacity="0.5"') +
          ell(RX - 14, RY - 30, 12, 5, "#6f8fae", 'opacity="0.4"') +
          // a small wrench-shaped nudge, no text needed
          line(RX + 34, RY - 96, RX + 46, RY - 108, "#c94f43", 5) +
          ell(RX + 47, RY - 110, 5, 5, "#c94f43")
        : "";
      return shadow + ao(RX + 6, RY - 40, 30) + tank + bowl + base + pipe + (broken ? mess : "");
    };
    furn("toilet.png", restroom(false));
    furn("toilet-broken.png", restroom(true));
  }

  // TRASH (ADR-0106): a small, charming mess. Never filth.
  if (!P.itemsOnly) {
    const wad = (cx, cy, r, fill) =>
      poly(
        [[cx, cy - r], [cx + r * 0.9, cy - r * 0.2], [cx + r * 0.5, cy + r * 0.7], [cx - r * 0.5, cy + r * 0.7], [cx - r * 0.9, cy - r * 0.2]],
        fill,
        `stroke="${P.outline}" stroke-width="1.4" stroke-linejoin="round"`
      );
    const body = `
    ${softShadow(64, 40, 29.6, 12.2)}
    ${wad(52, 32, 9, `url(#${vgradUS(23, 39, "#fbf7ea", "#ddd5c0")})`)}
    ${wad(72, 36, 7, `url(#${vgradUS(29, 41, "#efe9d8", "#cfc6ad")})`)}
    ${poly([[62, 24], [80, 20], [76, 30], [60, 32]], "#dcd3bb", `stroke="${P.outline}" stroke-width="1.4" stroke-linejoin="round"`)}
    ${ell(46, 40, 4, 2, "#c98850")}`;
    bake("trash.png", 128, 64, body);
  }

  // DOORMAT
  if (!P.itemsOnly) {
    const M = [[64, 6], [118, 32], [64, 58], [10, 32]];
    let weave = "";
    for (let i = 1; i < 4; i++) {
      const o = i * 13;
      weave += line(10 + o, 32 - o / 2, 64 + o, 58 - o / 2, P.wood, 2, 'opacity="0.4"');
      weave += line(118 - o, 32 - o / 2, 64 - o, 58 - o / 2, P.wood, 2, 'opacity="0.4"');
    }
    // a mat is thin and lies flat, so the only cues available are a contact
    // shadow under its near edge and a pile that catches light along the top
    const matBody =
      softShadow(64, 36, 58, 26, 0.2) +
      poly(M, `url(#${vgradUS(6, 58, lift(P.mat, 0.14), sink(P.mat, 0.2))})`, `stroke="${sink(P.woodDark, 0.08)}" stroke-width="4" stroke-linejoin="round"`) +
      weave +
      `<polyline points="${pts([M[3], M[0], M[1]])}" fill="none" stroke="${lift(P.mat, 0.3)}" stroke-width="2.2" opacity="0.45"/>`;
    bake("doormat.png", 128, 64, matBody);
  }

  // RUG
  if (!P.itemsOnly) {
    // Redesigned in M7. The old geometry was three high-contrast concentric
    // ellipses, which reads as a DARTBOARD however well it is shaded: better
    // shading only made the bullseye glossier. A rug is a FIELD with a BORDER,
    // so that is what this is now: one large field, an inset border band, a
    // pinstripe, and a faint centre medallion.
    const field = (rx, ry, base, hi = 0.05, lo = 0.13) =>
      ell(128, 64, rx, ry, `url(#${def(
        `<radialGradient id="@" fx="0.5" fy="0.36"><stop offset="0" stop-color="${lift(base, hi)}"/><stop offset="0.72" stop-color="${base}"/><stop offset="1" stop-color="${sink(base, lo)}"/></radialGradient>`
      )})`);
    let weaveR = "";
    for (const k of [0.3, 0.46, 0.62]) {
      weaveR += ell(128, 64, 118 * k, 54 * k, "none", `stroke="${sink(P.rugC, 0.14)}" stroke-width="1.2" opacity="0.22"`);
    }
    const body =
      softShadow(128, 70, 126, 58, 0.18) +
      field(118, 54, P.rugA) +                       // border band
      field(104, 47, P.rugC, 0.04, 0.1) +            // the field, most of the rug
      ell(128, 64, 96, 43, "none", `stroke="${P.rugB}" stroke-width="2.4" opacity="0.85"`) + // pinstripe
      weaveR +
      poly([[128, 46], [156, 64], [128, 82], [100, 64]], P.rugB, 'opacity="0.28"') + // medallion
      poly([[128, 53], [147, 64], [128, 75], [109, 64]], P.rugA, 'opacity="0.22"') +
      ell(128, 64, 118, 54, "none", `stroke="${P.outline}" stroke-width="2.4" stroke-opacity="0.75"`);
    bake("rug.png", 256, 128, body);
  }

  // DISHES (dirty-table overlay)
  if (!P.itemsOnly) {
    // Lit from directly above and from nowhere else: scene.ts never flips this
    // sprite, but it DOES flip the table underneath it, so any side lighting
    // here would disagree with the table half the time (ADR-0112).
    const plate = (cx, cy, tilt) => `
    ${ell(cx + tilt, cy + 1.5, 17, 7.5, SHC, 'opacity="0.16"')}
    ${ell(cx + tilt, cy, 17, 7.5, `url(#${vgradUS(cy - 7.5, cy + 7.5, "#fbf7ec", "#ddd5c4")})`, `stroke="${P.outline}" stroke-width="1.6" stroke-opacity="0.7"`)}
    ${ell(cx + tilt, cy - 1, 11, 4.5, `url(#${vgradUS(cy - 5.5, cy + 3.5, "#e8e0d0", "#cfc6b2")})`)}
    ${ell(cx + tilt + 3, cy - 1, 3.5, 1.8, "#c98850")}`;
    const body = `
    ${plate(44, 44, 0)}
    ${plate(44, 38, 3)}
    ${plate(44, 32, -2)}
    <rect x="62" y="26" width="14" height="16" rx="4" fill="${P.accent}" stroke="${P.outline}" stroke-width="1.6"/>
    ${ell(69, 26, 7, 3, P.accent, 'opacity="0.7"')}
    <path d="M76 30 q7 3 0 9" fill="none" stroke="${P.accent}" stroke-width="3"/>
    ${ell(30, 52, 2.2, 1.2, "#c98850")}
    ${ell(70, 50, 1.8, 1, "#c98850")}
    ${ell(56, 55, 2, 1.1, "#a3552e")}`;
    bake("dishes.png", 96, 64, body);
  }

  console.log(`baked ${theme}: ${files} files${P.itemsOnly ? " (furniture only)" : ""}, ${Math.round(total / 1024)}KB`);
  return total;
}

// ── driver ─────────────────────────────────────────────────────────────────
// --theme <id[,id]>  bake only these themes
// --only  <name[,name]>  bake only these files (with or without .png)
// Iterating on one piece must not rewrite 92 files: a tight loop is the whole
// point of the M7 pass.
//
// Guarded so dk-preview.mjs can import THEMES without triggering a bake.
if (import.meta.url !== pathToFileURL(process.argv[1]).href) {
  // imported as a module: export only, do not bake
} else {
const argv = process.argv.slice(2);
const argVal = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const themeFilter = argVal("--theme");
const names = Object.keys(THEMES).filter(
  (t) => !themeFilter || themeFilter.split(",").includes(t)
);
if (names.length === 0) {
  console.error(`no theme matched "${themeFilter}". known: ${Object.keys(THEMES).join(", ")}`);
  process.exit(1);
}

let grand = 0;
for (const theme of names) {
  grand += bakeTheme(theme, THEMES[theme]);
}
const scope = ONLY ? ` [only ${[...ONLY].join(", ")}]` : "";
console.log(`done -> ${ROOT} (${names.length} theme${names.length === 1 ? "" : "s"}${scope}, ${Math.round(grand / 1024)}KB total)`);
}
