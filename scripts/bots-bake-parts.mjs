/**
 * BATTLE BOTS part bake (the CONCEPT CONTRACT re-bake, 2026-09-04). Authors
 * every launch part as code-generated SVG and rasterizes it to
 * public/bots-art/parts/<slot>/t<tier>-<design>.png via @resvg/resvg-js, with
 * a paint MASK beside each one (t<tier>-<design>.mask.png: white where paint
 * applies, transparent over the fixed accents). Pattern: scripts/dk-bake-room.mjs.
 * No <text> anywhere (no font dependency). Shapes only.
 *
 * ── WHY THIS FILE WAS REWRITTEN ───────────────────────────────────────────
 * Mike, 2026-09-04, on the assembled bot: "This looked so good but put
 * together they look so bad. Disproportionate, really cheap ... I am
 * wondering if there is a better way to connect joins (like a magnet effect
 * or some energy glow)". Then he sent back the six concept scenes: "I wanted
 * this concept art style!".
 *
 * Two independent studies measured the gap and agreed on three things.
 *
 *   1. PROPORTION IS THE FAILURE, AND THE CANVASES DECIDED IT. The concept
 *      bot is 1.94 heads tall; what shipped is 3.6 to 4.7. The concept head
 *      is 1.81 times the body width; ours is 0.88. A 90x200 limb against a
 *      200x240 torso CANNOT be stubby and a 160 head against a 200 torso
 *      CANNOT be big, so the proportions were fixed before a pixel was drawn.
 *      This file owns those numbers, so this file is where the fix lives.
 *
 *   2. THERE IS NO JOINT TO SOLVE. Eight shoulders and hips cropped out of
 *      the concept scenes carry a plain rounded cap in the limb's own colour,
 *      overlapped by the body, one soft occlusion wash, and NO hardware of
 *      any kind. It works because the head is wider than the body, so the
 *      HEAD hides the shoulder. So the answer to "a magnet effect or some
 *      energy glow" is neither: fix the proportions and the join stops being
 *      a question. Every ball, cup, collar, ring and bolt this file used to
 *      draw is gone.
 *
 *   3. TWENTY FIVE OF THE FORTY SHIPPED PARTS WERE CLIPPED FLAT BY THEIR OWN
 *      CANVAS (measured 2026-09-04: all 8 arms lose the hand, 8 of 8 legs
 *      lose the foot, 7 of 8 torsos are cut on a side, torso t3-1 losing 176
 *      and 178 of its 240 side rows, 2 heads cut at the crown). Scaling a
 *      clipped sprite scales the clip. Every canvas below now carries a
 *      MARGIN so no drawn pixel can reach an edge, and
 *      scripts/bots-art-check.mts fails a part that touches one.
 *
 * ── THE CONTRACT, AND HOW EVERY NUMBER BELOW IS DERIVED ───────────────────
 * The figure contract v1.0 (measured off art-src/bots/concept/ scenes 1, 3, 4
 * and 5; six bots; landmarks read on 2x to 4x gridded crops, about +/-1.3
 * percent of height) is transcribed into FIG below: one nominal height H and
 * one min/target/max band per ratio. NOTHING in this file is a taste number.
 * Two rules turn those bands into canvases and pivots:
 *
 *   PIVOTS COME FROM THE TARGETS. Where two parts meet is fixed for every
 *   family and every tier, which is what makes any head fit any body.
 *
 *   CANVASES COME FROM THE BAND MAXIMA, PLUS A MARGIN. The band is the
 *   measured spread across six different bots, so a canvas that holds the
 *   band max can hold any design the contract permits. The contract's own
 *   published canvases used target x 1.12 instead, which leaves the arm ink
 *   flush against BOTH the top and the bottom edge, i.e. exactly the defect
 *   in finding 3. Band max is the honest envelope.
 *
 * THE MARGIN IS 8 PX ON EVERY SIDE, at @2x. Two derivations agree on it:
 *   - it is 1.43 percent of H, i.e. the contract's own stated landmark
 *     uncertainty (+/-1.3 percent of height) rounded up to the 8 px canvas
 *     grid the contract rounds every canvas to;
 *   - the drawn pixel set exceeds the ink extent by half an outline stroke
 *     (1.1 px at the widest) plus one pixel of antialias, about 2.1 px, so 8
 *     is a little under four times the physical overshoot.
 * It is the ONE authored constant in this file. Everything else is FIG.
 *
 * ── THE PLATE IS NOT THE PLACEHOLDER ──────────────────────────────────────
 * The model does not repaint a silhouette, it RE-DRAWS it, and it re-draws
 * with a bias that was measured on the kettle probe: arm 16 percent narrower
 * and 18 percent longer, leg 27 percent longer, foot 21 percent smaller. So
 * the generation plate asks for target/bias and the render lands on target.
 *
 * But the shipped placeholder is what the game draws when the art folder is
 * empty, and its `hand` and `foot` pivots have to land on ink. A single
 * pre-compensated sprite cannot be both. So the bake now writes TWO renders
 * of every part on the SAME canvas at the SAME pivots:
 *
 *   public/bots-art/parts/<slot>/...              ON TARGET   the placeholder
 *   public/bots-art/_raw/parts/placeholders/...   PRE-COMPENSATED  the ruler
 *
 * The ruler folder is what scripts/bots-gen-kit.mjs shows the model, so the
 * bias correction reaches the generator and never reaches the player.
 * Head, body and stance came back inside the band untouched and are NOT
 * pre-compensated: correcting a number that is already right introduces a
 * second bias.
 *
 * ── THE LIGHT ─────────────────────────────────────────────────────────────
 * One soft key from directly above. The ramp runs 1.00 at the top quarter to
 * 0.48 at the bottom, and it is applied ONCE ACROSS THE WHOLE PART rather
 * than per shape, because a per-shape ramp is what makes a collage of parts
 * read as a bag of separate objects. Top-to-bottom falloff is 2.1:1 and
 * side-to-side only 1.3:1, so the ramp is purely vertical: a vertical ramp is
 * identical whatever family a part came from, which is exactly what a
 * parts-mixing game needs, and limb art stays laterally symmetric in its
 * SHADING because the rig mirrors it with scale.x = -1.
 *
 * Parts are rendered NEUTRAL. The same mint clay reads across a 4:1 luminance
 * range in three concept scenes because the scene grade is warm (R:G:B about
 * 1.51:1.27:1.00). Bake that warmth in and the eight runtime paints become
 * eight muds, so the ramp here is a pure multiply with no hue rotation.
 *
 * ── REGISTRATION CONTRACT ─────────────────────────────────────────────────
 * Authored HERE and emitted to src/app/bots/_view/rig-points.ts so the rig
 * and the art gate read the same numbers this file drew against. Printed by
 * the bake on every run; see the table it writes to stdout.
 *
 * ── THE V2 RULERS (2026-09-05): LIMBS AND WEAPONS WITH FEATURES ───────────
 * The art factory (Stable Diffusion, ControlNet from these placeholders,
 * IP-Adapter from concept crops) makes HEADS that match the concept and FAILS
 * on limbs and weapons, for a measured reason: the arm placeholder is a
 * featureless capsule, so the control map hands the model nothing to hold
 * and it invents a whole robot inside the silhouette. The concept parts
 * shelf (art-src/bots/concept/6-shop.png) shows what a limb IS: a jointed
 * tube with an elbow ball and a band, a cuff, a mitt or a claw; a boot with
 * a thick sole and an ankle cuff; a hammer head with bands and a bolt; a
 * wrench with jaws; a torso with a panel line, rivets and a key seat.
 *
 *   node scripts/bots-bake-parts.mjs --out v2 [--only arm,leg]
 *
 * writes those features into a SEPARATE ruler tree and nothing else:
 *
 *   public/bots-art/_raw/parts/placeholders-v2/target/<n>-t<t>-<d>.png   ON TARGET
 *   public/bots-art/_raw/parts/placeholders-v2/plate/<n>-t<t>-<d>.png    PRE-COMPENSATED
 *   public/bots-art/_raw/parts/placeholders-v2/{target,plate}/*.svg      the source, for
 *                                                                        any working res
 *   public/bots-art/_raw/parts/placeholders-v2/_compare.png              old vs v2 sheet
 *   public/bots-art/_raw/parts/placeholders-v2/manifest.json
 *
 * In --out v2 the bake writes NO shipped part, NO mask, NO lift and does NOT
 * touch src/app/bots/_view/rig-points.ts: forty registered painted parts and
 * the live game read those, and the canvases and pivots are frozen. Every v2
 * feature lives INSIDE the frozen silhouette envelope and keeps every pivot
 * on ink. Design-1 heads are headParts as they were; the design-2 heads are
 * redrawn two-eyed in headPartsV2 (2026-09-05, see it).
 *
 * WHAT COUNTS AS A FEATURE FOR THE CONTROL MAPS. scripts/sd/bots-sd-controls.py
 * derives depth from the alpha silhouette and lines from (a) material
 * boundaries and (b) the bake's own clay outline stroke; a flat `forceFill`
 * wash has no stroke and is divided out with the light ramp, so it is
 * invisible to the controls. That is why the old "moulded elbow ring" never
 * reached the model. So every v2 feature is a real clay SHAPE (it gets a
 * stroke, so a line) and where it can it changes the SILHOUETTE (a ball
 * wider than its tube, a cuff wider than the forearm, a sole wider than the
 * boot, an open jaw), so it reaches the depth map too. The only accents
 * added are one small brass bolt on the mallet head and the dark socket the
 * torso key stem enters: a grille is a hole and brass stands proud in the
 * depth map, and both are inside the paintable law's existing classes.
 *
 * Run: node scripts/bots-bake-parts.mjs [--only head,arm,lift] [--out ship|v2]
 */

import { Resvg } from "@resvg/resvg-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "public", "bots-art");
const RIG_TS = join(process.cwd(), "src", "app", "bots", "_view", "rig-points.ts");

/**
 * --out ship (default) is the bake as it always was: shipped parts, masks,
 * lift, the v1 rulers and rig-points.ts. --out v2 writes ONLY the v2 ruler
 * tree below. Nothing else in this file reads OUT_MODE, so the default path
 * cannot change by accident.
 */
const OUT_MODE = (() => {
  const i = process.argv.indexOf("--out");
  const raw = i >= 0 ? process.argv[i + 1] : "ship";
  if (raw !== "ship" && raw !== "v2" && raw !== "v3") {
    console.error(`bots-bake-parts: --out must be ship, v2 or v3, got ${JSON.stringify(raw)}`);
    process.exit(2);
  }
  return raw;
})();
const V2 = OUT_MODE === "v2";
const V3 = OUT_MODE === "v3";
const V2_ROOT = join(ROOT, "_raw", "parts", "placeholders-v2");
const V3_ROOT = join(ROOT, "_raw", "parts", "placeholders-v3");
/** the authored shape table --out v3 draws from. Resolved off cwd like ROOT,
 *  so a redirected cwd (the judge's ruler cache) reads its own copy. */
const SHAPES_JSON = join(process.cwd(), "scripts", "bots-shapes.json");
const V1_RULERS = join(ROOT, "_raw", "parts", "placeholders");

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

// ── THE FIGURE CONTRACT ────────────────────────────────────────────────────
// Transcribed from the concept measurement, v1.0. Every ratio is a fraction
// of H, the assembled height from the head dome apex to the lowest foot
// pixel. Change H and every canvas and every pivot below scales with it.
// H = 560 sits beside the shipped 574 so no screen layout has to move.
const H = 560;

/** min / target / max, as fractions of H. */
const FIG = {
  headsTall:      [1.828, 1.944, 2.212],
  headH:          [0.452, 0.515, 0.547],
  headCoreW:      [0.529, 0.586, 0.694],
  headFullW:      [0.529, 0.725, 0.780],
  headCoreOverH:  [1.030, 1.185, 1.310],  // core width over head height
  headOverBody:   [1.267, 1.389, 1.583],  // core width over body width
  bodyH:          [0.242, 0.278, 0.333],
  bodyW:          [0.379, 0.429, 0.474],
  bodyWOverH:     [1.137, 1.565, 1.703],
  legH:           [0.185, 0.210, 0.243],  // hip to floor
  footH:          [0.100, 0.174, 0.230],
  footW:          [0.192, 0.271, 0.309],
  stanceW:        [0.469, 0.530, 0.662],
  armW:           [0.129, 0.150, 0.189],
  armL:           [0.203, 0.216, 0.263],
  armLOverW:      [1.071, 1.333, 1.818],
  shoulderW:      [0.375, 0.594, 0.649],  // centre to centre
  shoulderY:      [0.379, 0.545, 0.576],  // from the head apex
  hipY:           [0.757, 0.790, 0.815],
};

/** the contract's buried skirt: head art continues this far below its seat,
 *  torso art this far above its neck, so no pairing can open a gap. */
const SKIRT = Math.round(0.10 * H); // 56

/** the torso's hip half-spacing, straight off the contract's own torso
 *  canvas (hipR 186 against neck 136). */
const HIP_DX = 50;

/** THE ONE AUTHORED NUMBER. See the header for its two derivations. */
const MARGIN = 8;

const tgt = (k) => Math.round(FIG[k][1] * H);
const cap = (k) => Math.ceil(FIG[k][2] * H);
const ceil8 = (n) => Math.ceil(n / 8) * 8;

// ── THE MODEL BIAS, AND THE PRE-COMPENSATION ───────────────────────────────
// Measured on the kettle probe: what the plate asked for against what came
// back. The arm is corrected in FULL because its aspect was the one number
// outside the band and it is the number Mike's eye caught. The leg and the
// foot are corrected at HALF strength: a full correction made the foot taller
// than the leg, a shape the model has never been shown. foot height rides the
// leg's factor so the shin does not vanish behind the shoe.
//   arm width   0.150 asked -> 0.126 drawn   (-16%)
//   arm length  0.216 asked -> 0.255 drawn   (+18%)
//   leg height  0.210 asked -> 0.266 drawn   (+27%)
//   foot width  0.271 asked -> 0.214 drawn   (-21%)
const PRE = {
  armW: 0.150 / 0.126,
  armL: 0.216 / 0.255,
  legH: 0.89,
  footH: 0.89,
  footW: 1.10,
};

/** a dimension as drawn: on target for the placeholder, biased for the plate */
const dim = (k, plate) => Math.round(tgt(k) * (plate ? PRE[k] ?? 1 : 1));
/** the canvas envelope for a dimension: it must hold the band max AND the plate */
const env = (k) => Math.max(cap(k), Math.round(tgt(k) * (PRE[k] ?? 1)));

// ── CANVASES AND PIVOTS, DERIVED ───────────────────────────────────────────
// The figure, in H units, from the apex down:
//   apex 0 | crease headH | shoulder shoulderY | hip hipY | floor H
const CREASE = tgt("headH");                    // 288
const SHOULDER_DY = tgt("shoulderY") - CREASE;  // 17, shoulder below the crease
const HIP_DY = tgt("hipY") - CREASE;            // 154, hip below the crease

// HEAD. Widest thing on the bot: the full width, ear lugs included. The seat
// (the crease line, the point that lands on the torso's neck) sits one band
// max head-height below the top margin, so the tallest legal head still
// clears the top edge; the canvas then carries the buried skirt below it.
const HEAD_W = ceil8(cap("headFullW") + 2 * MARGIN);
const HEAD_SEAT_Y = MARGIN + cap("headH");
const HEAD_H = ceil8(HEAD_SEAT_Y + SKIRT + MARGIN);

// TORSO. The top SKIRT rows sit under the head. The shoulder points fall
// OUTSIDE this canvas, because the arm centre is 0.08 H outboard of the torso
// edge: they are stored as canvas coordinates that go negative and past the
// width on purpose, and the rig only ever uses them as offsets from the hips.
const TORSO_W = ceil8(cap("bodyW") + 2 * MARGIN);
const TORSO_NECK_Y = MARGIN + SKIRT;
const TORSO_H = ceil8(TORSO_NECK_Y + cap("bodyH") + MARGIN);
const SHOULDER_DX = Math.round(tgt("shoulderW") / 2); // 167

// LIMBS. One shared canvas height, as the contract has it, so the arm and the
// leg are the same box. The pivot sits 0.5 x the WIDEST legal limb below the
// top margin; each design then puts its own ink top 0.5 x ITS OWN width above
// the pivot, which is the own-width burial law expressed on a fixed canvas.
const LIMB_W_CAP = Math.ceil(env("armW") * 1.02); // the leg shaft is 1.02 the arm
const LIMB_PIVOT_Y = MARGIN + Math.ceil(LIMB_W_CAP / 2);
const LIMB_H = ceil8(LIMB_PIVOT_Y + Math.max(env("armL"), env("legH")) + Math.ceil(LIMB_W_CAP / 2) + MARGIN);

const ARM_W = ceil8(env("armW") + 2 * MARGIN);

// The foot's centre sits forward of the shaft so the toe points outboard. The
// offset is not free: it is solved so the assembled stance lands on target.
//   hipDx + footOffset + footW/2 = stanceW/2
const FOOT_OFF_F = (tgt("stanceW") / 2 - HIP_DX - tgt("footW") / 2) / tgt("footW"); // 0.148
const FOOT_BACK = Math.ceil(env("footW") * (0.5 - FOOT_OFF_F));
const FOOT_FRONT = Math.ceil(env("footW") * (0.5 + FOOT_OFF_F));
const LEG_LEFT = Math.max(Math.ceil(LIMB_W_CAP / 2), FOOT_BACK);
const LEG_RIGHT = Math.max(Math.ceil(LIMB_W_CAP / 2), FOOT_FRONT);
const LEG_W = ceil8(LEG_LEFT + LEG_RIGHT + 2 * MARGIN);
const LEG_HIP_X = MARGIN + LEG_LEFT;

// WEAPON. The contract leaves it at 220 x 120 with the grip at (30,60); the
// only change is the same margin every other canvas now carries.
const WEAPON_INK_W = 220;
const WEAPON_INK_H = 120;
const WEAPON_W = ceil8(WEAPON_INK_W + 2 * MARGIN);
const WEAPON_H = ceil8(WEAPON_INK_H + 2 * MARGIN);

const RIG = {
  head: { w: HEAD_W, h: HEAD_H, neck: [HEAD_W / 2, HEAD_SEAT_Y] },
  torso: {
    w: TORSO_W, h: TORSO_H,
    neck: [TORSO_W / 2, TORSO_NECK_Y],
    shoulderL: [TORSO_W / 2 - SHOULDER_DX, TORSO_NECK_Y + SHOULDER_DY],
    shoulderR: [TORSO_W / 2 + SHOULDER_DX, TORSO_NECK_Y + SHOULDER_DY],
    hipL: [TORSO_W / 2 - HIP_DX, TORSO_NECK_Y + HIP_DY],
    hipR: [TORSO_W / 2 + HIP_DX, TORSO_NECK_Y + HIP_DY],
    decal: [TORSO_W / 2, TORSO_NECK_Y + Math.round(tgt("bodyH") * 0.538)],
  },
  arm: { w: ARM_W, h: LIMB_H, shoulder: [ARM_W / 2, LIMB_PIVOT_Y], hand: [ARM_W / 2, LIMB_PIVOT_Y + tgt("armL")] },
  leg: { w: LEG_W, h: LIMB_H, hip: [LEG_HIP_X, LIMB_PIVOT_Y], foot: [LEG_HIP_X, LIMB_PIVOT_Y + tgt("legH")] },
  weapon: { w: WEAPON_W, h: WEAPON_H, grip: [MARGIN + 30, MARGIN + 60] },
};
const LIFT = { w: 640, h: 420, topDown: 380, topRaised: 300, platformW: 600 };
const TIERS = [1, 2, 3, 4];
const DESIGNS = [1, 2];

// ── THE JOIN. THERE IS NO JOINT ────────────────────────────────────────────
// Replaces the old JOINT LAW's ball, cup, collar, ring and bolt, every one of
// which is now deleted from the art. What the concept actually does:
//   cap        every limb ends in a plain rounded cap in the limb's own
//              colour, radius 0.5 x that limb's own width
//   burial     the cap is buried 0.35 to 0.60 of the limb's own width by the
//              BODY GROUP's silhouette, never by a drawn socket
//   occlusion  a soft dark wash on the limb inside the burial: 0.55 of its
//              base value at the seam, back to 1.00 one limb width away
//   cuff       the only decoration allowed at a joint is a shallow moulded
//              cuff in the limb's own colour, at most 0.12 of the limb length
//   lugs       the head MUST carry a low wide side lug on each side, its
//              lower edge on the crease and its outer edge at the full head
//              width. It is not decoration: it is the thing that covers the
//              shoulder cap, and every concept bot has one.
//   broken     no socket exists, so removal leaves nothing to fill. A SCAR
//              CHIP, 0.6 x limb_w wide and 0.25 x limb_w tall, body colour
//              lightened 15 percent and desaturated 30 percent, clamped to
//              the body silhouette. Never a black disc, never brass.
const JOIN = {
  capR: 0.5,          // x the limb's own width
  burialMin: 0.35,
  burial: 0.5,
  burialMax: 0.60,
  occlusion: 0.55,    // the wash value at the seam
  cuffMax: 0.12,      // x the limb's length
  scarW: 0.6,         // x limb_w
  scarH: 0.25,        // x limb_w
  scarLighten: 0.15,
  scarDesat: 0.30,
  ghostAlpha: 0.40,   // an unfitted slot on the build screen
};

// ── palette ────────────────────────────────────────────────────────────────
// Grey clay: these are STRUCTURE placeholders and the eight runtime paints
// come through the mask. The three fixed accents are the contract's, and they
// never vary by family, which is what makes eight families read as one shelf.
const CLAY = "#c7cdd6";
const LENS = "#f4e5c5";   // eye lens: always the brightest thing on the bot
const GRILLE = "#4e3c27"; // the darkest thing on the bot
const BRASS = "#d9a441";  // exactly ONE piece per bot: the torso's wind-up key
// The weapon grip. Not a joint, a handle. DARKER than the #3a3a3f the old
// bake used, and that is a correctness requirement: the paintable law calls
// rubber "value under 0.22", but #3a3a3f is value 0.247, so its own example
// colour fails its own test and every grip pixel was landing in the dead zone
// between rubber and brass, unclassified and unmasked (181 pixels a weapon,
// measured). At value 0.18 the grip stays rubber at every point of the ramp.
const RUBBER = "#2c2c2e";

const f = (n) => (Math.round(n * 100) / 100).toString();
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

// ── THE LIGHT, DRAWN ───────────────────────────────────────────────────────
// A pure multiply, no hue rotation, so the part stays neutral and the eight
// paints stay eight colours. Quantized into stepped bands, never a smooth
// gradient (the clay law).
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mulHex = (hex, g) =>
  "#" + hexToRgb(hex).map((v) => Math.round(clamp01((v / 255) * g) * 255).toString(16).padStart(2, "0")).join("");

/** the contract's measured vertical ramp: flat over the top quarter, then a
 *  straight fall to `bot` at the form's base. */
const rampAt = (t, top, bot) => (t < 0.25 ? top : top + (bot - top) * ((t - 0.25) / 0.75));

/**
 * Per-slot ramp ends. The head is the top form and takes the contract's full
 * 1.00 to 0.48. The torso's top sits at 0.48 of the head's base value because
 * THE HEAD SHADES IT, measured 0.39 to 0.54 on four bots, and that single
 * baked-in shadow is the strongest one-body cue available and costs nothing.
 * The limbs hang half under the head and start a little down the ramp.
 */
const RAMP = {
  head: [1.0, 0.48],
  torso: [0.48, 0.62],
  arm: [0.92, 0.55],
  leg: [0.9, 0.55],
  weapon: [1.0, 0.48],
};
/**
 * Band count. The clay law says stepped, never a smooth gradient, but a step
 * is only clay if it is small: six bands over a 344 px head is a 9 percent
 * value jump every 57 px, which reads as a barcode rather than as a moulded
 * form. One band per 20 px of part height keeps the step under a pixel of
 * perceived edge at fight size while staying quantized.
 */
const bandCount = (span) => Math.max(6, Math.min(24, Math.round(span / 20)));

// ── shapes ─────────────────────────────────────────────────────────────────
const rr = (x, y, w, h, r) => ({ k: "rect", x, y, w, h, r, bbox: [x, y, w, h] });
const circ = (cx, cy, r) => ({ k: "circle", cx, cy, r, bbox: [cx - r, cy - r, 2 * r, 2 * r] });
const ell = (cx, cy, rx, ry) => ({ k: "ellipse", cx, cy, rx, ry, bbox: [cx - rx, cy - ry, 2 * rx, 2 * ry] });
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
/**
 * An annular sector as a polygon: the C of an open-end wrench. Angles in
 * degrees, SVG sense (y down, so -90 is up), from a0 clockwise to a1. The
 * hole and the gap are left UNPAINTED, so they are transparent, so they
 * reach the alpha silhouette and the depth map as real geometry. v2 only.
 */
const cband = (cx, cy, R, r, a0, a1, n = 40) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs), by = Math.min(...ys);
  return { k: "poly", pts, bbox: [bx, by, Math.max(...xs) - bx, Math.max(...ys) - by] };
};
function shapeSvg(s, attrs) {
  if (s.k === "rect") {
    return `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}" rx="${f(s.r)}" ${attrs}/>`;
  }
  if (s.k === "circle") return `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}" ${attrs}/>`;
  if (s.k === "ellipse") return `<ellipse cx="${f(s.cx)}" cy="${f(s.cy)}" rx="${f(s.rx)}" ry="${f(s.ry)}" ${attrs}/>`;
  return `<polygon points="${s.pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" ${attrs}/>`;
}

/** Material identity. Outlines are soft and cool, never hard black. */
const MAT = {
  clay: { fill: CLAY, outline: "rgba(52,58,78,0.34)", ow: 2.2 },
  lens: { fill: LENS, outline: "rgba(90,72,44,0.45)", ow: 2.6, flat: true },
  // FLAT, and that is a correctness requirement, not a look. The grille is
  // the darkest thing on the bot at value 0.31, and the paintable law splits
  // accents into rubber (value under 0.22) and brass (value over 0.30) with
  // NOTHING in between. Run the part ramp over 0.31 and the grille lands in
  // that gap at 0.22 to 0.28, is classified as body, is not masked, and every
  // one of its pixels then keeps the colour it was drawn in whatever the
  // player painted: 3,622 of them on one head, measured. Drawn flat it stays
  // at 0.31 and is an accent at every tier. It reads correct anyway, because
  // it is a hole, and a hole does not catch the key light.
  grille: { fill: GRILLE, outline: "rgba(255,255,255,0.10)", ow: 1.4, flat: true },
  brass: { fill: BRASS, outline: "rgba(90,60,20,0.55)", ow: 1.8 },
  rubber: { fill: RUBBER, outline: "rgba(255,255,255,0.14)", ow: 1.6 },
};

const el = (mat, shape) => ({ mat, shape });

/**
 * The stepped ramp across ONE shape, driven by the PART's extent rather than
 * the shape's own. This is the change that makes a bot read as one object:
 * with a per-shape ramp every piece restarts at full light at its own top,
 * which is precisely the "assembled out of scraps" look.
 */
function bands(shape, base, top, bot, y0, y1) {
  const [bx, by, bw, bh] = shape.bbox;
  const n = bandCount(y1 - y0);
  let o = "";
  for (let i = 0; i < n; i++) {
    const yy = by + (bh * i) / n;
    const mid = yy + bh / (2 * n);
    const t = clamp01((mid - y0) / Math.max(1, y1 - y0));
    o += `<rect x="${f(bx - 1)}" y="${f(yy)}" width="${f(bw + 2)}" height="${f(bh / n + 0.6)}" fill="${mulHex(base, rampAt(t, top, bot))}"/>`;
  }
  return o;
}

/**
 * The specular: 0.15 to 0.20 down from the form's top, ON ITS CENTRE LINE,
 * 1.4 to 1.7 x base, blur about 0.08 of the width. Three nested ellipses
 * rather than a filter: resvg filters are slow, and the clay law wants steps.
 * Centred, so it survives the rig's mirror on a limb.
 */
function spec(cx, top, w, span) {
  const y = top + span * 0.175;
  const rx = w * 0.17, ry = span * 0.055;
  let o = "";
  for (let i = 3; i >= 1; i--) {
    const k = i / 3;
    o += `<ellipse cx="${f(cx)}" cy="${f(y)}" rx="${f(rx * (0.4 + 0.6 * k))}" ry="${f(ry * (0.4 + 0.6 * k))}" fill="#f5f2e4" opacity="${f(0.13 * (1.05 - k))}"/>`;
  }
  return o;
}

/**
 * The BASE render. Clay first, then accents, which is what lets the mask
 * below subtract accents without knowing draw order. Every clay and metal
 * shape is shaded from the PART-level ramp; the eye lens is flat because the
 * contract says it is always the brightest thing on the bot and always lit.
 */
function render(w, h, all, slot, specCx = null) {
  const [top, bot] = RAMP[slot] ?? [1.0, 0.48];
  // The part's ink extent comes from the SILHOUETTE shapes only: a flat-filled
  // wash lies inside a shape that is already there, so letting it widen the
  // extent would tilt the whole ramp.
  let y0 = Infinity, y1 = -Infinity;
  for (const e of all) {
    if (e.flatFill) continue;
    y0 = Math.min(y0, e.shape.bbox[1]);
    y1 = Math.max(y1, e.shape.bbox[1] + e.shape.bbox[3]);
  }
  if (!Number.isFinite(y0)) { y0 = 0; y1 = h; }

  // BODY FIRST, THEN THE SPECULAR, THEN THE ACCENTS. The specular is a
  // property of the moulded FORM, and letting it fall on an accent is not a
  // taste error but a classification one: a 13 percent warm wash over the eye
  // lens drops its saturation from 0.19 to 0.17, under the paintable law's
  // 0.18 floor, so the lens stops reading as an accent, is not masked, and
  // takes the player's paint (310 pixels on one head, measured).
  const bodyEls = all.filter((e) => e.mat === "clay");
  const accEls = all.filter((e) => e.mat !== "clay");

  let defs = "";
  let body = "";
  const emit = (e, i) => {
    const m = MAT[e.mat];
    const id = `c${i}`;
    if (e.flatFill) {
      if (e.clipTo) {
        defs += `<clipPath id="${id}">${shapeSvg(e.clipTo, "")}</clipPath>`;
        body += `<g clip-path="url(#${id})">${shapeSvg(e.shape, `fill="${e.flatFill}"`)}</g>`;
      } else {
        body += shapeSvg(e.shape, `fill="${e.flatFill}"`);
      }
      return;
    }
    defs += `<clipPath id="${id}">${shapeSvg(e.shape, "")}</clipPath>`;
    body += `<g clip-path="url(#${id})">${shapeSvg(e.shape, `fill="${m.fill}"`)}`;
    if (!m.flat) body += bands(e.shape, m.fill, top, bot, y0, y1);
    body += `</g>`;
    body += shapeSvg(e.shape, `fill="none" stroke="${m.outline}" stroke-width="${m.ow}" stroke-linejoin="round"`);
  };
  bodyEls.forEach((e, i) => emit(e, i));
  if (specCx !== null) body += spec(specCx, y0, w, y1 - y0);
  accEls.forEach((e, i) => emit(e, bodyEls.length + i));
  return svg(w, h, `<defs>${defs}</defs>${body}`);
}

/**
 * The paint MASK: clay shapes in white, with every accent shape cut out
 * through a luminance mask (black = hidden), so the renderer's tinted
 * multiply never darkens a lens, the grille, the key or the grip.
 */
function renderMask(w, h, all) {
  // washes and cuffs lie INSIDE a silhouette shape, so they add nothing to
  // the mask and would spill past their clip if they were included
  const elements = all.filter((e) => !e.flatFill && !e.forceFill);
  const clay = elements.filter((e) => e.mat === "clay");
  const acc = elements.filter((e) => e.mat !== "clay");
  // THE MASK MUST COVER THE OUTLINE TOO. Every shape is drawn with a soft
  // stroke straddling its edge, so the base is opaque about one pixel further
  // out than the shape is. A mask that only fills the shape leaves that one
  // pixel ring keeping the colour the art was drawn in, in all eight paints:
  // measured 3,584 such pixels on one head before this line existed. Only the
  // CLAY strokes: an accent's own outline straddles its edge, so its outer
  // half lies on clay and must stay paintable. Growing the cut-out to match
  // strands that half instead, which measured 933 pixels worse.
  const stroked = (e, colour) =>
    shapeSvg(e.shape, `fill="${colour}" stroke="${colour}" stroke-width="${MAT[e.mat].ow}" stroke-linejoin="round"`);
  const mask = `<mask id="acc" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#ffffff"/>${acc.map((e) => shapeSvg(e.shape, 'fill="#000000"')).join("")}</mask>`;
  return svg(w, h, `<defs>${mask}</defs><g mask="url(#acc)">${clay.map((e) => stroked(e, "#ffffff")).join("")}</g>`);
}

// ── THE PARTS ──────────────────────────────────────────────────────────────
// tk runs 0 (T1) to 1 (T4). Tier is RICHNESS, never size: a tier 4 head is
// not a bigger head, it is a better appointed one at the same size, because a
// tier that changes the silhouette breaks every mixed bot.

/**
 * THE HEAD. Half the figure, wider than it is tall, and its underside is a
 * DOME: every collage failure in the whole-bot study had a head cut at its
 * widest row, which left a straight bar lying across the chest. The dome is
 * bought by drawing the head ellipse from the apex all the way to seat+SKIRT
 * and letting the torso cover the bottom SKIRT rows.
 *
 * The EAR LUGS are structural, not decoration. Each is a disc centred on the
 * head's core edge with radius (fullW - coreW)/2, so its outer edge lands
 * exactly on the full width and its lower edge on the crease. That is what
 * covers the shoulder cap, and removing it is what exposes it.
 */
function headParts(tier, design) {
  const tk = (tier - 1) / 3;
  const [sx, sy] = RIG.head.neck;
  const coreW = tgt("headCoreW");
  const fullW = tgt("headFullW");
  const hh = tgt("headH");
  const top = sy - hh;
  const er = (fullW - coreW) / 2;
  const out = [];

  // the low side lugs, first, so the dome overlaps their inner edge
  for (const s of [-1, 1]) out.push(el("clay", circ(sx + s * (coreW / 2), sy - er * 0.55, er)));
  // the dome: apex to seat + skirt, so the underside curves in under the body
  out.push(el("clay", ell(sx, (top + sy + SKIRT) / 2, coreW / 2, (hh + SKIRT) / 2)));

  if (design === 1) {
    // Round ear caps on the upper sides, as the concept has them. They are
    // placed so their own top never rises above the dome apex and their outer
    // edge never passes the full width: the apex IS the top of H, and a cap
    // that broke either line would silently retune the whole figure.
    const cr = coreW * (0.13 + tk * 0.015);
    for (const s of [-1, 1]) out.push(el("clay", circ(sx + s * coreW * 0.40, top + hh * 0.13 + cr, cr)));
    const eR = coreW * (0.145 + tk * 0.012);
    const ey = top + hh * 0.46;
    for (const s of [-1, 1]) out.push(el("lens", circ(sx + s * coreW * 0.215, ey, eR)));
    for (const s of [-1, 1]) out.push(el("grille", circ(sx + s * coreW * 0.215, ey + eR * 0.06, eR * 0.30)));
    out.push(el("clay", circ(sx, ey + eR * 1.15, coreW * 0.035))); // the nose nub
    out.push(el("grille", rr(sx - coreW * 0.185, top + hh * 0.70, coreW * 0.37, hh * 0.115, hh * 0.05)));
    if (tier >= 3) out.push(el("clay", rr(sx - coreW * 0.13, top + hh * 0.045, coreW * 0.26, hh * 0.075, hh * 0.035)));
  } else {
    // a softened box head: still wider than tall, still domed underneath
    const bw = coreW * 0.96;
    out.push(el("clay", rr(sx - bw / 2, top, bw, hh + SKIRT, bw * 0.30)));
    const eR = coreW * (0.19 + tk * 0.015);
    const ey = top + hh * 0.45;
    out.push(el("lens", circ(sx, ey, eR)));
    out.push(el("grille", circ(sx + eR * 0.12, ey + eR * 0.06, eR * 0.30)));
    out.push(el("grille", rr(sx - coreW * 0.21, top + hh * 0.71, coreW * 0.42, hh * 0.10, hh * 0.045)));
    // the aerial nub stays below the dome apex, for the reason above
    if (tier >= 2) out.push(el("clay", rr(sx - coreW * 0.05, top + hh * 0.07, coreW * 0.10, hh * 0.10, coreW * 0.04)));
    if (tier === 4) out.push(el("clay", circ(sx, top + hh * 0.09, coreW * 0.05)));
  }
  return out;
}

/**
 * THE TORSO. A small wide barrel, not a slab: body width over body height is
 * 1.57, which is the number that reads as a wind-up toy rather than a figure.
 * It carries the buried skirt above its neck so no head can open a gap, and
 * the ONE brass piece the whole bot is allowed: the wind-up key.
 *
 * There is no neck cup, no shoulder cup and no hip cup, because the concept
 * has none. The limbs go BEHIND this shape and the head covers what is left.
 */
function torsoParts(tier, design) {
  const tk = (tier - 1) / 3;
  const [nx, ny] = RIG.torso.neck;
  const bw = tgt("bodyW");
  const bh = tgt("bodyH");
  const out = [];
  // the body: SKIRT rows above the neck are buried under the head
  out.push(el("clay", rr(nx - bw / 2, ny - SKIRT, bw, bh + SKIRT, bw * 0.28)));

  if (design === 1) {
    // a soft chest panel and a seam, in clay: shape, not hardware
    out.push(el("clay", rr(nx - bw * 0.30, ny + bh * 0.16, bw * 0.34, bh * 0.44, bw * 0.06)));
    if (tier >= 3) out.push(el("clay", rr(nx - bw * 0.40, ny + bh * 0.74, bw * 0.80, bh * 0.10, bh * 0.05)));
  } else {
    out.push(el("clay", rr(nx - bw * 0.36, ny + bh * 0.20, bw * 0.72, bh * 0.34, bw * 0.10)));
    if (tier >= 2) out.push(el("lens", circ(nx - bw * 0.20, ny + bh * 0.37, bw * 0.075 + tk * 6)));
  }
  // THE WIND-UP KEY. The only metal on the figure. Brass budget: under 4
  // percent of visible surface, against 18.9 to 21.5 percent before this bake.
  const kx = nx + bw * 0.24;
  const ky = ny + bh * 0.42;
  const kr = bw * 0.052 + tk * 3;
  out.push(el("brass", rr(kx - kr * 0.28, ky - kr * 0.2, kr * 0.56, kr * 2.3, kr * 0.28)));
  out.push(el("brass", circ(kx - kr * 0.85, ky - kr * 0.55, kr * 0.72)));
  out.push(el("brass", circ(kx + kr * 0.85, ky - kr * 0.55, kr * 0.72)));
  return out;
}

/**
 * THE LIMB CAP AND ITS OCCLUSION. A plain rounded cap in the limb's own
 * colour and a soft dark wash inside the burial, fading out over one limb
 * width. No ball, no bolt, no collar. The wash is drawn as four stacked clay
 * bars stepping back to full value, which is the same stepped-band language
 * the rest of the part uses.
 */
function occlusion(cx, top, w, len, limb) {
  const out = [];
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const k = (i + 1) / steps; // 1 at the seam, 0 one width down
    const yy = top + (w * i) / steps;
    const g = JOIN.occlusion + (1 - JOIN.occlusion) * (1 - k) * (1 - k);
    out.push({
      mat: "clay",
      shape: rr(cx - w, yy, w * 2, w / steps + 0.6, 0),
      forceFill: mulHex(CLAY, g),
      clipTo: limb,
    });
  }
  // the shallow moulded cuff, in the limb's own colour, just below the seam
  out.push({
    mat: "clay",
    shape: rr(cx - w, top + w * 1.0, w * 2, Math.min(w * 0.13, len * JOIN.cuffMax), 0),
    forceFill: mulHex(CLAY, 0.9),
    clipTo: limb,
  });
  return out;
}

/**
 * THE ARM. Short and thick: length over width is 1.33, against the 3.05 that
 * shipped. It is one capsule plus a mitt, its cap half buried, and it is
 * laterally symmetric so the rig's mirror does not flip its light.
 */
function armParts(tier, design, plate) {
  const tk = (tier - 1) / 3;
  const [sx, sy] = RIG.arm.shoulder;
  const aw = dim("armW", plate);
  const al = dim("armL", plate);
  const top = sy - aw / 2; // the own-width pivot: 0.5 x this arm's own width
  const out = [];
  const shaft = rr(sx - aw / 2, top, aw, aw / 2 + al, aw / 2);
  out.push(el("clay", shaft));
  // the mitt: a little fatter than the shaft, centred on the hand pivot
  const mr = aw * (0.56 + tk * 0.02);
  out.push(el("clay", circ(sx, top + aw / 2 + al - mr * 0.45, mr)));
  out.push(...occlusion(sx, top, aw, al, shaft));
  if (design === 1) {
    // a moulded elbow ring, clay, symmetric
    out.push({ mat: "clay", shape: rr(sx - aw / 2, top + aw / 2 + al * 0.42, aw, al * 0.10, aw * 0.1), forceFill: mulHex(CLAY, 0.80) });
  } else if (tier >= 2) {
    out.push({ mat: "clay", shape: circ(sx, top + aw / 2 + al * 0.46, aw * 0.42), forceFill: mulHex(CLAY, 0.84) });
  }
  return out;
}

/**
 * THE LEG. Mostly foot: 0.210 H of leg against 0.174 H of foot leaves a
 * 0.036 H shin, which is why the concept bot reads as a toy standing on two
 * shoes. The shaft is symmetric; the FOOT is deliberately not, because the
 * toe points outboard and the rig mirrors the sprite for the other side. The
 * light stays symmetric either way, because the ramp is purely vertical.
 */
function legParts(tier, design, plate) {
  const tk = (tier - 1) / 3;
  const [hx, hy] = RIG.leg.hip;
  const lw = Math.round(dim("armW", plate) * 1.02);
  const lh = dim("legH", plate);
  const fw = dim("footW", plate);
  const fh = dim("footH", plate);
  const top = hy - lw / 2;
  const floor = hy + lh;
  const out = [];
  const shaft = rr(hx - lw / 2, top, lw, lw / 2 + lh - fh * 0.55, lw / 2);
  out.push(el("clay", shaft));
  // the shoe: wide, rounded, the toe forward of the shaft by the solved offset
  const fx0 = hx + fw * FOOT_OFF_F - fw / 2;
  out.push(el("clay", rr(fx0, floor - fh, fw, fh, fh * 0.46)));
  if (design === 1) {
    out.push({ mat: "clay", shape: rr(fx0 + fw * 0.06, floor - fh * 0.34, fw * 0.88, fh * 0.22, fh * 0.11), forceFill: mulHex(CLAY, 0.82) });
  } else {
    out.push({ mat: "clay", shape: circ(fx0 + fw * 0.72, floor - fh * 0.58, fh * (0.20 + tk * 0.02)), forceFill: mulHex(CLAY, 0.86) });
  }
  out.push(...occlusion(hx, top, lw, lh, shaft));
  return out;
}

/**
 * THE WEAPON. Clay and one rubber grip: a mallet is a tool, not a fitting,
 * and the brass budget is spent on the torso's key. Inset by MARGIN like
 * every other canvas.
 */
function weaponParts(tier, design) {
  const tk = (tier - 1) / 3;
  const M = MARGIN;
  const out = [];
  if (design === 1) {
    out.push(el("clay", rr(M + 56, M + 52, 100, 16, 8)));
    const hh = 64 + tk * 16;
    out.push(el("clay", rr(M + 150, M + 60 - hh / 2, 62, hh, 14)));
    out.push(el("rubber", rr(M + 6, M + 48, 56, 24, 12)));
    out.push(el("clay", rr(M + 144, M + 46, 12, 28, 4)));
  } else {
    out.push(el("clay", rr(M + 56, M + 52, 96, 16, 8)));
    const dr = 34 + tk * 8;
    out.push(el("clay", circ(M + 170, M + 60, dr)));
    out.push(el("rubber", rr(M + 6, M + 48, 56, 24, 12)));
    const teeth = [0, 4, 6, 8][tier - 1];
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      out.push(el("clay", circ(M + 170 + Math.cos(a) * (dr - 6), M + 60 + Math.sin(a) * (dr - 6), 5)));
    }
  }
  return out;
}

// ── V2 RULERS: THE FEATURED LIMBS, WEAPONS AND TORSO ───────────────────────
// Used ONLY under --out v2. Same canvases, same pivots, same materials, same
// light. Every dimension is a fraction of the limb's own aw / al / lw / fh so
// the on-target render and the pre-compensated plate both land inside the
// canvas, and every hand, foot and grip pivot stays on ink. Nothing here is a
// forceFill wash except the join-law occlusion, because a wash has no stroke
// and never reaches a control map (see the header).

/** the occlusion wash again, clipped to EACH of several shapes: a v2 limb is
 *  a cap plus a tube rather than one capsule, and a wash clipped to a shape
 *  wider than the ink would paint the background. The wash is a flat opaque
 *  fill, so a pixel inside two clips gets the same colour twice. */
function occlusionV2(cx, top, w, len, clips) {
  const out = [];
  for (const limb of clips) out.push(...occlusion(cx, top, w, len, limb));
  return out;
}

/**
 * THE ARM, V2. Cap, upper tube, ELBOW BALL wider than the tube with a BAND
 * across it, forearm tube, WRIST CUFF wider than the forearm, then a MITT
 * with a thumb (design 1) or a two-finger CLAW (design 2). The shelf crops
 * arm-shelf01..07 are exactly this. Widest ink stays under the band max
 * (0.189 H) and under the canvas margin, whichever bites first.
 */
function armPartsV2(tier, design, plate) {
  const tk = (tier - 1) / 3;
  const [sx, sy] = RIG.arm.shoulder;
  const aw = dim("armW", plate);
  const al = dim("armL", plate);
  const top = sy - aw / 2;
  const handY = sy + al;
  // the widest half-extent the canvas can hold once the margin and the
  // stroke's own overshoot are paid for
  const halfMax = ARM_W / 2 - MARGIN - 2;
  const out = [];

  const cap = circ(sx, sy, aw / 2);
  const elbowY = sy + al * 0.44;
  const upW = aw * 0.84;
  const upper = rr(sx - upW / 2, sy, upW, elbowY - sy, upW * 0.18);
  const foreW = aw * 0.80;
  const wristY = sy + al * 0.80;

  out.push(el("clay", cap));
  out.push(el("clay", upper));
  out.push(...occlusionV2(sx, top, aw, al, [cap, upper]));
  out.push(el("clay", rr(sx - foreW / 2, elbowY, foreW, wristY - elbowY + aw * 0.12, foreW * 0.18)));
  // the elbow ball, a little wider than either tube, and its band
  const er = Math.min(aw * (0.50 + tk * 0.03), halfMax);
  out.push(el("clay", circ(sx, elbowY, er)));
  const bandW = Math.min(er * 2.06, halfMax * 2);
  out.push(el("clay", rr(sx - bandW / 2, elbowY - aw * 0.07, bandW, aw * 0.14, aw * 0.05)));
  if (tier >= 3) out.push(el("clay", rr(sx - Math.min(upW * 0.55, halfMax), sy + al * 0.16, Math.min(upW * 1.10, halfMax * 2), aw * 0.11, aw * 0.04)));
  // the wrist cuff
  const cuffW = Math.min(aw * 0.98, halfMax * 2);
  out.push(el("clay", rr(sx - cuffW / 2, wristY - aw * 0.08, cuffW, aw * 0.19, aw * 0.06)));

  if (design === 1) {
    // the mitt: a fist with a thumb on the inboard side and a knuckle ridge.
    // The thumb pokes 0.04 mr past the fist, so the fist is sized so that
    // fist + thumb + stroke stays under the band max (0.189 H) on target and
    // inside the margin on the wider plate.
    const mr = Math.min(aw * (0.52 + tk * 0.015), halfMax / 1.04);
    const cy = handY - mr * 0.35;
    out.push(el("clay", circ(sx, cy, mr)));
    out.push(el("clay", circ(sx - mr * 0.70, cy - mr * 0.35, mr * 0.34)));
    if (tier >= 2) out.push(el("clay", rr(sx - mr * 0.52, cy - mr * 0.08, mr * 1.04, mr * 0.30, mr * 0.15)));
    // T4: ONE wide ridge above the knuckles, never a pair of studs. Two studs
    // over a knuckle ridge read as two eyes over a mouth in the control map
    // (verifier, 2026-09-05), which is the exact failure this contract exists to kill.
    if (tier >= 4) out.push(el("clay", rr(sx - mr * 0.44, cy - mr * 0.56, mr * 0.88, mr * 0.16, mr * 0.08)));
  } else {
    // the claw: a palm and two fingers that curl in under it. Sized off a
    // capped hand scale so the wider plate does not push a tip off canvas.
    const hs = Math.min(aw, 88);
    const pr = hs * 0.40;
    const py = handY - pr * 0.25;
    const fw = hs * 0.20;
    out.push(el("clay", circ(sx, py, pr)));
    for (const s of [-1, 1]) {
      const x0 = sx + s * pr * 0.55, y0 = py + pr * 0.30;
      const x1 = sx + s * pr * 0.92, y1 = py + pr * 1.45;
      const x2 = sx + s * pr * 0.40, y2 = py + pr * 1.95;
      out.push(el("clay", bar(x0, y0, x1, y1, fw)));
      out.push(el("clay", bar(x1, y1, x2, y2, fw * 0.9)));
      out.push(el("clay", circ(x1, y1, fw * 0.62)));
      out.push(el("clay", circ(x2, y2, fw * 0.50)));
    }
    if (tier >= 2) out.push(el("clay", circ(sx, py, pr * 0.32)));
  }
  return out;
}

/**
 * THE CORAL SOLE MATERIAL, v2 only. The contract's fixed accent, the shoe
 * coral the importer pins every leg to (#B46D52, hue 16.5, saturation 0.54,
 * inside the paintable law's coral band). Registered only under --out v2, so
 * the ship bake's table is untouched and no shipped part can pick it up.
 *
 * WHY THE SOLE IS A MATERIAL AND NOT CLAY (2026-09-05). The production sweep
 * rendered 192 legs against the v2 rulers and the judge rejected all 192 for
 * NO SOLE or CORAL SPILL: the model painted the boot grey with coral rims
 * along the panel lines and coral fills in the heel counter and the side
 * port, and drew the sole plate as a grey base. Measured cause: the sole was
 * clay like every other shape, so the control maps carried it as one more
 * outline and nothing marked it as a different thing. As its own material it
 * reaches bots-sd-controls.py as a coral class: a label boundary in the
 * lineart map and a relief step in the depth map (ACCENT_DZ.coral), which is
 * what the eye lens and the grille already get. The ramp is a plain multiply,
 * so the coral stays inside the law's narrow band at every band step.
 */
if (V2 || V3) MAT.coral = { fill: "#b46d52", outline: "rgba(52,58,78,0.34)", ow: 2.2 };
/** the sole's height as a share of the foot height. 0.22 read as a plinth
 *  under the boot in every production render (the prompt forbids a plinth and
 *  the model obliged by painting it grey); 0.30 read as one more slab under a
 *  stack of slabs (2026-09-05: the three factory boots that passed the judge
 *  were the ruler's own shape, flat slabs on a plate, not the live boot). The
 *  LIVE boot (public/bots-art/parts/leg) measures its coral block at 48 of the
 *  85 shoe rows on every family, about 0.5 of the shoe; the concept shelf's
 *  boots run about 0.2. 0.42 sits on the live side of that gap: one thick
 *  block the eye cannot read as a plate, with 0.58 of the foot left above it
 *  for the dome to be a dome in. */
const SOLE_H_V2 = 0.42;
/** the boot's width as a share of the contract's foot width. The live boots
 *  measure 132 to 138 px against the 152 target (0.236 to 0.246 H, inside the
 *  0.192 to 0.309 band), and at the full 152 the dome reads as a loaf. The
 *  toe edge stays where the stance solve puts it; the heel edge moves in
 *  toward the hip axis, which is where the live boot's heel is (its heel 36
 *  to 44 px left of the axis, its toe 90 to 94 right). */
const BOOT_W_V2 = 0.90;

/**
 * A boot body as ONE polygon: a dome standing on short straight sides. The
 * dome is a HEEL arc and a TOE arc, each a quarter ellipse of the same
 * height and its own width, with a flat run between them: the live boot's
 * top edge is nearly flat from the ankle to the toe, its toe a wide round
 * curve and its heel a steep one (measured on public/bots-art/parts/leg,
 * 2026-09-05: toe corner about 29 wide by 40 tall, heel corner about 7 by
 * 35, on a 132 px boot). One shape means one outline stroke, so the lineart
 * map carries the dome's silhouette and no seam across the boot (an ellipse
 * on a rect would stroke the rect's top edge straight across the dome).
 * Points run from the bottom-left corner up the heel, over the top, down
 * the toe. v2 only.
 */
const domePoly = (x0, yBottom, w, sideH, domeH, rxHeel, rxToe, n = 32) => {
  const yEq = yBottom - sideH;
  const yTop = yEq - domeH;
  const pts = [[x0, yBottom], [x0, yEq]];
  for (let i = 1; i <= n; i++) {
    const a = Math.PI - (Math.PI / 2) * (i / n);              // 180 -> 90 deg: up the heel
    pts.push([x0 + rxHeel + rxHeel * Math.cos(a), yTop + domeH - domeH * Math.sin(a)]);
  }
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI / 2) * (1 - i / n);                     // 90 -> 0 deg: down the toe
    pts.push([x0 + w - rxToe + rxToe * Math.cos(a), yTop + domeH - domeH * Math.sin(a)]);
  }
  pts.push([x0 + w, yBottom]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs), by = Math.min(...ys);
  return { k: "poly", pts, bbox: [bx, by, Math.max(...xs) - bx, Math.max(...ys) - by] };
};

/**
 * A sole block as ONE polygon: a STRAIGHT top edge and two rounded bottom
 * corners, exactly the live boot's coral block. A rounded rect would round
 * the top corners too and leave two clay notches where the dome meets the
 * sole. v2 only.
 */
const soleBlock = (x0, y0, w, h, r, n = 12) => {
  const pts = [[x0, y0], [x0 + w, y0]];
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI / 2) * (i / n);
    pts.push([x0 + w - r + r * Math.cos(a), y0 + h - r + r * Math.sin(a)]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + (Math.PI / 2) * (i / n);
    pts.push([x0 + r + r * Math.cos(a), y0 + h - r + r * Math.sin(a)]);
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs), by = Math.min(...ys);
  return { k: "poly", pts, bbox: [bx, by, Math.max(...xs) - bx, Math.max(...ys) - by] };
};

/**
 * THE LEG, V2: THE DOME BOOT (2026-09-05, second cut). The first v2 leg was a
 * stack of slabs (knee band, ankle cuff with rivets, a boot box, a toe cap, a
 * strap or a heel counter and a side port) on a coral plate wider than the
 * boot. The production sweep proved two things about it: the three factory
 * boots that passed the judge were that stack, pixel for pixel, and sprocket
 * and kettle rendered identical because tier 1 and tier 2 shared one ruler
 * picture; and the five legs that failed all failed CORAL SPILL because the
 * render painted the side port, the heel counter and the bands coral. The
 * LIVE boot (public/bots-art/parts/leg/t*.png) and the concept shelf's boots
 * (art-src/sd/style/clean/leg-boot-*.png) agree on a different shape, and
 * this is that shape, measured off the live files:
 *
 *   cap        a plain rounded top a little wider than the shaft, half
 *              buried (the live shaft is 47 to 54 px wide with a rounded
 *              top; the first cut's 86 px ball on a 74 px tube read as a
 *              snowman). Burial is 0.5 of its own width whatever its radius.
 *   tube       a shaft 0.6 of the contract's limb width, as the live one is
 *   ankle      ONE short cylinder, wider than the tube, that the dome
 *              swallows: the live ankle ring is 16 rows at 0.85 of the width
 *   dome       the boot body as one polygon, a steep heel arc and a wide toe
 *              arc on short straight sides, its toe edge where the stance
 *              solve puts it and its heel edge in toward the axis
 *   sole       ONE coral block moulded under the dome, the same width as the
 *              dome and never wider, a straight top edge, rounded bottom
 *              corners: the one coral material on the ruler, so the control
 *              maps carry it as its own block (a label line in lineart, a
 *              relief step in depth). The floor and the foot pivot do not move.
 *
 * ONE DISTINCT RULER PER FAMILY. Every family is one (tier, design) and gets
 * its own picture: tier widens the ankle and rounds the toe; the design adds
 * its own feature. Design 1 is the PLAIN dome (sprocket, kettle, hornet).
 * Design 2 (peeper, lantern, piston, anvil) carries TWO SMALL SIDE PODS, clay
 * like the rest and drawn recessed (a ring with a darker dimple), low on the
 * boot's sides and inside the silhouette, so the depth map keeps the dome
 * whole and the lineart map carries two small rings far apart (never a pair
 * of eyes on the dome). Bulldozer (t4-1) is a dome with ONE BAND around its
 * middle, a little wider than the dome so it reaches the depth map. No knee
 * band, no cuff, no rivets, no strap, no port: every one of those was a coral
 * trap or a joint the negative forbids.
 */
function legPartsV2(tier, design, plate) {
  const tk = (tier - 1) / 3;
  const [hx, hy] = RIG.leg.hip;
  const lw = Math.round(dim("armW", plate) * 1.02);
  const lh = dim("legH", plate);
  const fw = dim("footW", plate);
  const fh = dim("footH", plate);
  const floor = hy + lh;
  const out = [];

  // the boot box: its toe edge where the stance solve puts it, its heel
  // edge in toward the axis, the sole's top a straight line, the dome's
  // curve a share of what is left above the sole. The heel arc is steep and
  // the toe arc wide, as the live boot has them; the toe rounds a little
  // more with each tier.
  const bw = fw * BOOT_W_V2;
  const fx0 = hx + fw * FOOT_OFF_F + fw / 2 - bw;
  const soleH = fh * SOLE_H_V2;
  const soleTop = floor - soleH;
  const domeH = fh - soleH;
  const domeRy = domeH * (design === 1 ? 0.75 : 0.68);
  const sideH = domeH - domeRy;
  const yEq = soleTop - sideH;
  const rxHeel = bw * 0.30;
  const rxToe = bw * (0.50 + tk * 0.15);

  // the cap and the shaft: a rounded top a little wider than the tube
  const capR = lw * 0.36;
  const top = hy - capR;
  const cap = circ(hx, hy, capR);
  const tubeW = lw * 0.60;

  // the ankle: a short cylinder on the tube's axis, wider than the tube and
  // wider and taller with each tier, never past the boot's heel edge, its
  // lower part inside the dome (the dome is drawn after it and covers it).
  // The dome's top under the ankle is the heel arc, which drops toward the
  // heel, so the ankle's bottom sits under the arc's drop at the ankle's
  // own left edge.
  const ankW = Math.min(lw * (0.78 + tk * 0.10), 2 * (hx - fx0 - 2));
  const ankH = fh * (0.17 + tk * 0.07);
  const ankX0 = hx - ankW / 2;
  const heelDx = Math.max(0, Math.min(1, (rxHeel - (ankX0 - fx0)) / rxHeel));
  const arcDrop = domeRy * (1 - Math.sqrt(Math.max(0, 1 - heelDx * heelDx)));
  const ankTop = yEq - domeRy - ankH * 0.55;
  const ankBottom = yEq - domeRy + arcDrop + domeRy * 0.20;

  const tube = rr(hx - tubeW / 2, hy, tubeW, ankTop + ankH * 0.5 - hy, tubeW * 0.15);
  out.push(el("clay", cap));
  out.push(el("clay", tube));
  out.push(...occlusionV2(hx, top, lw, lh, [cap, tube]));
  out.push(el("clay", rr(ankX0, ankTop, ankW, ankBottom - ankTop, ankH * 0.25)));

  // the dome, one polygon, its bottom 2 px inside the sole
  out.push(el("clay", domePoly(fx0, soleTop + 2, bw, sideH + 2, domeRy, rxHeel, rxToe)));

  if (design === 2) {
    // two small side pods, CLAY, recessed: a ring with a darker dimple inside
    // it, low on the boot's sides where the sides are all but straight,
    // inside the silhouette, far apart and clear of the sole
    const pr = fh * (0.07 + tk * 0.02);
    const py = yEq - domeRy * 0.12;
    for (const px of [fx0 + pr + fh * 0.06, fx0 + bw - pr - fh * 0.06]) {
      out.push(el("clay", circ(px, py, pr)));
      out.push({ mat: "clay", shape: circ(px, py, pr - 1.6), forceFill: mulHex(CLAY, 0.80) });
    }
  } else if (tier === 4) {
    // bulldozer: one band around the dome at its mid height, as wide as the
    // dome is there plus a little each side so it reaches the depth map,
    // never past the margin on the wider plate
    const bandH = fh * 0.13;
    const dy = domeRy * 0.5;
    const k = 1 - Math.sqrt(1 - Math.pow(1 - dy / domeRy, 2));
    const ext = fh * 0.03;
    const bx0 = Math.max(fx0 + rxHeel * k - ext, MARGIN + 2);
    const bx1 = Math.min(fx0 + bw - rxToe * k + ext, LEG_W - MARGIN - 2);
    out.push(el("clay", rr(bx0, yEq - domeRy + dy - bandH / 2, bx1 - bx0, bandH, bandH * 0.35)));
  }

  // the coral sole, last and as an accent: one block under the dome
  out.push(el("coral", soleBlock(fx0, soleTop, bw, soleH, soleH * 0.30)));
  return out;
}

/**
 * ── THE V3 LEG SHAPES (lane B, 2026-09-05) ────────────────────────────────
 * Mike, 5 September: "Not a whole lot of variation going on with the models.
 * Was hoping people could make their own cute unique robots." Measured: all
 * eight shipped boots are ONE boot (the closest pair differs on 2 pixels in
 * 100 at ring size), because tier and design only ever changed appointments
 * and never the silhouette. Two earlier runs proved the rule that governs
 * this file: PROMPT CHANGES CANNOT BEAT WHAT THE RULER DRAWS. So the leg
 * buys its variation the only way it can be bought, by AUTHORING RULERS.
 *
 * FIVE SHAPES, ONE OF THEM THE ONE WE HAVE. `boot` is legPartsV2 at its
 * plain-dome setting, carried into the v3 tree on purpose: it is the
 * comparison ruler every new shape is read against, and a shape table with
 * the live shape missing is a table that cannot say what changed.
 *
 *   boot      the dome boot on its coral sole, the live shape
 *   wheels    one wheel a side, a WHOLE clay disc with its hub clear in the
 *             middle, standing in a CORAL TYRE block wider than it
 *   springs   a clay coil of four turns of ONE width, on a CORAL PAD
 *   sneakers  a shoe with a heel counter, a THROAT, a TONGUE and a long low
 *             toe, on a CORAL SOLE that stands out past it on both sides
 *   pegs      a thin peg off a shallow step, on a round CORAL PAD
 *
 * ── WAVE TWO (lane L, 2026-09-05): WHAT THE FIRST 96 RENDERS MEASURED ─────
 * Wave one rendered 24 candidates of each of these four and the judge kept 16
 * of 96. CORAL SPILL was the first rule to fire on 68 of them, and the spill
 * was not drips: the median candidate carried its coral 16 rows ABOVE the
 * block, in ONE blob, running straight on up the body. Sorted per shape, the
 * spill lines up exactly with how much narrower the body is than the block at
 * the line where they meet, and nothing else in the run does:
 *
 *   shape     body width / block width at the coral top   median CORAL SPILL
 *   pegs                 0.22                                    0.015
 *   springs              0.72                                    0.047
 *   wheels               1.00 (the tyre followed the disc)       0.075
 *   sneakers             1.00 (the sole was the shoe's width)    0.122
 *
 * So the block stops the colour when it is a STEP IN THE SILHOUETTE and not
 * when it is only a change of paint: a line the alpha map, the lineart map
 * and the depth map all carry is an edge the render will not walk over, and a
 * line only the label image carries is a panel line it happily paints across.
 * Every shape below therefore stands its body ON its block rather than
 * flush with it, which is also what a tyre, a spring pad and a sneaker's
 * midsole actually look like. The block is still ONE block with a straight
 * top edge and it is still the widest thing on every row it covers, so no
 * judge rule moves and none had to.
 *
 * WHY EVERY CORAL PART IS A BOTTOM BLOCK, AND WHY THAT IS NOT A COMPROMISE.
 * scripts/sd/rank-part.py measures the coral the importer's own pin_coral
 * will ship: the SOLE BAND is the run of rows at the BOTTOM of the leg whose
 * coral covers at least half that row's ink, and CORAL SPILL is the share of
 * the coral outside it (bar 1.3 percent, calibrated on the live legs at
 * 0.0 to 0.34 percent and the cleanest production leg at 5.3). A tyre drawn
 * as a RING round a hub puts coral on rows where it covers a third of the
 * ink and reads, to that measure, as exactly the rim-and-drips defect that
 * rejected 192 of 192 production legs. So every shape here puts its coral
 * where a shoe actually meets the floor: ONE block, a straight top edge, and
 * at every row it covers, it is the widest thing on that row. Nothing above
 * it is coral. That is why no judge rule has to move for any of these four.
 *
 * WHAT IS FROZEN AND STAYS FROZEN. Each shape hangs on the SAME pivots: the
 * hip cap is the same circle of radius 0.36 x the limb width centred on the
 * hip point, so the ink top sits exactly half the cap's own width above the
 * pivot and BURIAL reads 0.50 for all five (the join law's band is 0.35 to
 * 0.60). Each shape's floor is the contract's floor and its foot box is the
 * stance solve's own box, so the foot pivot lands on ink on every one and the
 * assembled stance does not move. No shape reaches a canvas edge.
 */
const LEG_SHAPES_V3 = ["boot", "wheels", "springs", "sneakers", "pegs"];

/** the coral block's height as a share of the foot height, per shape. The
 *  boot's 0.42 is SOLE_H_V2's measured number (the live boot's block is about
 *  half its shoe, the concept shelf's about a fifth, and 0.42 sits on the
 *  live side of that gap). The other four sit just under it: the block still
 *  lands at 0.20 to 0.25 of the leg's own height, well clear of the 0.08 NO
 *  SOLE floor and inside the range the live legs read at 0.33 to 0.36, with
 *  room for the model to draw it thinner than asked, which it always does. */
const CORAL_H_V3 = { boot: SOLE_H_V2, wheels: 0.30, springs: 0.34, sneakers: 0.34, pegs: 0.36 };
/** the wheel's radius as a share of the foot height. WAVE TWO: 0.60 drew a
 *  disc taller than the space above the block, so the block had to be cut
 *  across the disc as a chord and the hub sat ON that cut. 0.42 makes the
 *  disc a WHOLE circle that stands IN the block instead: its bottom is buried
 *  16 px inside the tyre, its hub clears the tyre's top edge by 11 px, and
 *  the disc is 0.47 of the block's width where the two meet. The foot pivot
 *  lands on the tyre, which runs the full foot box, so nothing about the
 *  stance moves. */
const WHEEL_R_V3 = 0.42;
/** the hub's radius as a share of the wheel's. Big enough to read at ring
 *  size (13.9 px on a 40.7 px wheel, 7.5 px on the ring) and small enough
 *  that the whole hub sits above the tyre. */
const WHEEL_HUB_V3 = 0.34;
/** the tyre block's width as a share of the boot box, centred UNDER THE WHEEL
 *  rather than on the foot box. The ruler gate measured wheels against the
 *  redrawn sneaker at 0.898 with both blocks running the full box, which is
 *  0.002 off the 0.90 bar: two shapes are not different because their tops
 *  are, if they share the widest, heaviest part of the silhouette. A tyre is
 *  the wheel's own contact block, so it belongs under the wheel and it is
 *  the wheel's own width plus a shoulder. The foot pivot still lands on it
 *  with 38 px to spare, so nothing about the stance moves. */
const WHEEL_TYRE_W_V3 = 0.78;
/** every turn of the coil, as a share of the boot box width. WAVE TWO: the
 *  turns used to widen from the shaft to the pad and walk sideways as they
 *  went, and at ring size four widening steps read as a STAIRCASE, not a
 *  coil: the eye follows the corner. One width for every turn, a gentle lean
 *  and a small alternating offset read as one coil, and 0.50 of the box puts
 *  the bottom turn at 0.58 of the pad. */
const SPRING_W_V3 = 0.50;
/** the sneaker's upper, inset from its sole block on each side as a share of
 *  the block's width. 0.14 leaves the sole standing 19 px proud at the toe and
 *  19 at the heel, which is a midsole a chunky trainer actually has, and puts
 *  the upper at 0.72 of the block: measured on the drawing, the step at the
 *  coral line reads 0.72, down from wave one's 1.00 on the shape that spilled
 *  the most of the four. */
const SHOE_INSET_V3 = 0.14;

/** the shared frame every v3 leg hangs on: the contract's own numbers. */
function legFrameV3(plate) {
  const [hx, hy] = RIG.leg.hip;
  const lw = Math.round(dim("armW", plate) * 1.02);
  const lh = dim("legH", plate);
  const fw = dim("footW", plate);
  const fh = dim("footH", plate);
  const bw = fw * BOOT_W_V2;
  return {
    hx, hy, lw, lh, fw, fh, bw,
    floor: hy + lh,
    fx0: hx + fw * FOOT_OFF_F + fw / 2 - bw,
    fcx: hx + fw * FOOT_OFF_F + fw / 2 - bw / 2,
    capR: lw * 0.36,
    tubeW: lw * 0.60,
  };
}

/** a polygon from a point list, in the bake's shape shape. v3 legs only; the
 *  head table's polyOf is the same three lines further down the file and this
 *  block is drawn before it. */
const legPolyV3 = (pts) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs), by = Math.min(...ys);
  return { k: "poly", pts, bbox: [bx, by, Math.max(...xs) - bx, Math.max(...ys) - by] };
};

/**
 * THE SNEAKER'S UPPER, AS ONE POLYGON. Wave one drew the shoe as the boot's
 * own dome at half height and hung a tongue off the shaft; at 120 px it read
 * as a lump on a red sole, which is the one thing a new shape may not do.
 *
 * What tells a shoe from a boot in a SILHOUETTE is not the toe and it is not
 * the sole. It is the THROAT: a boot's top edge runs flat from the ankle to
 * the toe, and a shoe's falls away in the middle and comes back up over the
 * instep. So this walks that profile, back to front, as one shape and one
 * outline stroke:
 *
 *   the heel counter   up the back to `heelH`, its top-back corner rounded
 *   the throat         a drop to `throatH` at 0.44 across, the shoe's waist
 *   the vamp           back up to `vampH` over the instep
 *   the toe            a quarter ellipse from the vamp down to the sole, so
 *                      the toe is long, low and round, and the sole under it
 *                      stands proud of the tip
 *
 * The collar and the tongue are drawn separately on top, because they are the
 * two things that must stand ABOVE this line to be seen at all.
 */
const shoeUpperV3 = (x0, yB, w, heelH, throatH, vampH, n = 16) => {
  const hr = Math.min(w * 0.12, heelH * 0.45);
  const pts = [[x0, yB], [x0, yB - heelH + hr]];
  for (let i = 1; i <= n; i++) {
    const a = Math.PI - (Math.PI / 2) * (i / n);            // 180 -> 90 deg: the counter's corner
    pts.push([x0 + hr + hr * Math.cos(a), yB - heelH + hr - hr * Math.sin(a)]);
  }
  pts.push([x0 + w * 0.26, yB - heelH]);
  pts.push([x0 + w * 0.38, yB - throatH - (heelH - throatH) * 0.35]);
  pts.push([x0 + w * 0.48, yB - throatH]);                   // the waist of the shoe
  pts.push([x0 + w * 0.54, yB - throatH - (vampH - throatH) * 0.45]);
  const trx = w * 0.40;
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI / 2) * (1 - i / n);                   // 90 -> 0 deg: over the toe
    pts.push([x0 + w - trx + trx * Math.cos(a), yB - vampH * Math.sin(a)]);
  }
  pts.push([x0 + w, yB]);
  return legPolyV3(pts);
};

/**
 * ONE PICTURE PER SHAPE. `boot` delegates to legPartsV2 at tier 2 design 1,
 * the plain dome: the v3 tree carries the live shape as its own row so the
 * contact sheet, the control maps and the judge's comparison ruler all read
 * the five shapes out of one table.
 */
function legPartsV3(shape, plate) {
  if (shape === "boot") return legPartsV2(2, 1, plate);
  const F = legFrameV3(plate);
  const { hx, hy, lw, lh, fh, bw, floor, fx0, fcx, capR, tubeW } = F;
  const out = [];
  const coralH = fh * CORAL_H_V3[shape];
  const coralTop = floor - coralH;
  const footTop = floor - fh;
  const cap = circ(hx, hy, capR);

  if (shape === "wheels") {
    // A WHOLE WHEEL STANDING IN ITS TYRE. The disc is a full circle: it sits
    // under the foot box's top line and its bottom is buried in the tyre
    // block, so the block is 2.1x the disc's width where they meet and the
    // hub reads as a hub instead of as an arch over a red line. Wave one cut
    // the disc off at the floor and ran the tyre across it as a chord, which
    // read as a ball dipped in paint and spilled coral 16 rows up the disc.
    const wr = fh * WHEEL_R_V3;
    const wcx = hx + (fcx - hx) * 0.5;           // between the shaft and the foot centre
    const wcy = footTop + wr + 2;
    const ankH = fh * 0.16;
    const ankW = lw * 0.66;
    const ankTop = footTop - ankH * 0.28;
    // the shaft stops at the disc's CENTRE, where the disc hides it. With the
    // disc centred between the hip axis and the foot's, the shaft's whole
    // width (44.2 to 95.8) sits inside the disc's (44.3 to 125.8), so nothing
    // of it shows and nothing of it widens the leg above the tyre: run on down
    // to the tyre it added 6 px to the body at the step line for no picture.
    const tube = rr(hx - tubeW / 2, hy, tubeW, wcy - hy, tubeW * 0.15);
    out.push(el("clay", cap));
    out.push(el("clay", tube));
    out.push(...occlusionV2(hx, hy - capR, lw, lh, [cap, tube]));
    out.push(el("clay", rr(hx - ankW / 2, ankTop, ankW, ankH, ankH * 0.30)));
    out.push(el("clay", circ(wcx, wcy, wr)));
    // the hub, recessed the way the v2 boot's side pods are: a ring with a
    // darker dimple inside it, so the depth map keeps the disc whole and the
    // lineart map carries one hub circle. Wholly above the tyre's top edge.
    const hr = wr * WHEEL_HUB_V3;
    out.push(el("clay", circ(wcx, wcy, hr)));
    out.push({ mat: "clay", shape: circ(wcx, wcy, hr - 2.6), forceFill: mulHex(CLAY, 0.80) });
    const tyreW = bw * WHEEL_TYRE_W_V3;
    out.push(el("coral", soleBlock(wcx - tyreW / 2, coralTop, tyreW, coralH, coralH * 0.30)));
    return out;
  }

  if (shape === "springs") {
    // FOUR TURNS OF ONE WIDTH. Every turn is the same rounded bar and they
    // overlap by enough that the coil is ONE blob with no enclosed hole (SEE
    // THROUGH is a hard rule and a drawn helix has gaps). Wave one widened
    // every turn AND walked the stack sideways, and at 120 px four widening
    // steps read as a STAIRCASE: the eye follows the corner, not the ring.
    // One width for all four turns makes the same lean read as a coil
    // leaning out over its pad, which is where it has to lean, because the
    // shaft is on the hip axis and the pad is on the foot's. The pad is 1.7x
    // the coil's width, which is the step at the coral line the render needs.
    const turns = 4;
    const span = coralTop - footTop;
    const step = span / turns;
    const th = step * 1.45;
    const cw = bw * SPRING_W_V3;
    const tube = rr(hx - tubeW / 2, hy, tubeW, footTop + step * 0.6 - hy, tubeW * 0.15);
    out.push(el("clay", cap));
    out.push(el("clay", tube));
    out.push(...occlusionV2(hx, hy - capR, lw, lh, [cap, tube]));
    for (let i = 0; i < turns; i++) {
      const k = i / (turns - 1);
      const cy = footTop + step * (i + 0.5);
      const tx = hx + (fcx - hx) * (0.30 + 0.70 * k);
      out.push(el("clay", rr(tx - cw / 2, cy - th / 2, cw, th, th * 0.42)));
    }
    const padW = bw * 0.86;
    out.push(el("coral", soleBlock(fcx - padW / 2, coralTop, padW, coralH, coralH * 0.30)));
    return out;
  }

  if (shape === "sneakers") {
    // A REAL SHOE: A TOE, A TONGUE AND A HEEL, ON A MIDSOLE.
    //
    // Wave one gave the shoe the boot's own dome at half height with a tongue
    // hung off the shaft, and the sole ran the shoe's full width. Two things
    // came out of that. It read as a lump on a red sole, because with a flat
    // top edge there is nothing a shoe has that a boot has not; and it spilled
    // the most coral of the four (0.122 at the median, 17 of 24 rejected),
    // because with no step at the sole line the render had no edge to stop at.
    //
    // So: the UPPER is one polygon carrying the whole shoe profile - a heel
    // counter at the back, a throat that drops in the middle, a vamp and a
    // long low toe (shoeUpperV3 above) - and it is inset from the sole on both
    // sides, so the sole is a MIDSOLE the toe and the heel overhang. The
    // COLLAR sits at the top of the counter, on the shaft's own axis, where an
    // ankle is. The TONGUE stands FORWARD of it in the throat with a real
    // notch of daylight between the two, which is the whole reason to draw a
    // tongue: on wave one the collar swallowed it and it read as a bolt.
    const sx0 = fx0 + bw * SHOE_INSET_V3;
    const sw = bw * (1 - 2 * SHOE_INSET_V3);
    const yB = coralTop + 3;                     // the upper's foot, inside the sole: no seam
    const heelH = fh * 0.27;                     // LOW and LONG: the boot's dome is 0.58
    const throatH = fh * 0.21;
    const vampH = fh * 0.33;
    const collarH = fh * 0.19;
    const collarW = lw * 0.72;                   // wider than the shaft, both sides: a ring
    const collarCx = hx - lw * 0.04;             // over the heel, where an ankle is
    const collarTop = yB - fh * 0.40;
    const tongueW = lw * 0.28;                   // TALLER THAN WIDE, or it reads as a bolt
    const tongueX = hx + lw * 0.17;              // forward of the collar, out in the throat
    const tongueTop = yB - fh * 0.56;            // 15 px clear above the collar: a flap
    const tube = rr(hx - tubeW / 2, hy, tubeW, collarTop + collarH * 0.6 - hy, tubeW * 0.15);
    out.push(el("clay", cap));
    out.push(el("clay", tube));
    out.push(...occlusionV2(hx, hy - capR, lw, lh, [cap, tube]));
    out.push(el("clay", shoeUpperV3(sx0, yB, sw, heelH, throatH, vampH)));
    out.push(el("clay", rr(collarCx - collarW / 2, collarTop, collarW, collarH, collarH * 0.42)));
    out.push(el("clay", rr(tongueX, tongueTop, tongueW, yB - fh * 0.15 - tongueTop, tongueW * 0.42)));
    out.push(el("coral", soleBlock(fx0, coralTop, bw, coralH, coralH * 0.28)));
    return out;
  }

  if (shape === "pegs") {
    // a shallow step off the shaft, a thin peg, and a round pad: the pad is a
    // stadium rather than the boot's block, because a pad seen dead-on is a
    // disc and a disc's ends are round. Its top edge is still a straight run,
    // so the coral still reads as one clean block to the control maps.
    const stepH = fh * 0.14;
    const stepW = lw * 0.78;
    const pegW = lw * 0.30;
    const pegTop = footTop + stepH * 0.5;
    const tube = rr(hx - tubeW / 2, hy, tubeW, pegTop - hy, tubeW * 0.15);
    out.push(el("clay", cap));
    out.push(el("clay", tube));
    out.push(...occlusionV2(hx, hy - capR, lw, lh, [cap, tube]));
    out.push(el("clay", rr(hx - stepW / 2, footTop, stepW, stepH, stepH * 0.30)));
    out.push(el("clay", rr(hx - pegW / 2, pegTop, pegW, coralTop + 3 - pegTop, pegW * 0.25)));
    const padW = bw * 0.86;
    out.push(el("coral", rr(fcx - padW / 2, coralTop, padW, coralH, coralH * 0.5)));
    return out;
  }

  throw new Error(`bots-bake-parts: unknown v3 leg shape ${shape}`);
}

/**
 * THE WEAPON, V2. Design 1 is the MALLET: grip, handle, a collar where the
 * handle enters the head, a head with a BAND at each end standing a little
 * proud of it, and ONE small brass BOLT at its centre (under 2 percent of
 * the part, inside the brass budget). Design 2 is the WRENCH the concept
 * shelf shows: grip, handle, a round boss and an open C JAW whose hole and
 * gap are real transparent geometry. The grip pivot is inside the rubber
 * grip exactly as before.
 */
function weaponPartsV2(tier, design) {
  const tk = (tier - 1) / 3;
  const M = MARGIN;
  const out = [];
  out.push(el("rubber", rr(M + 6, M + 48, 56, 24, 12)));
  if (design === 1) {
    out.push(el("clay", rr(M + 56, M + 52, 100, 16, 8)));
    const hh = 64 + tk * 16;
    const hx0 = M + 150, hy0 = M + 60 - hh / 2;
    out.push(el("clay", rr(hx0, hy0, 62, hh, 14)));
    out.push(el("clay", rr(M + 142, M + 44, 14, 32, 5)));
    for (const bx of [hx0 + 5, hx0 + 62 - 5 - 12]) out.push(el("clay", rr(bx, hy0 - 3, 12, hh + 6, 4)));
    if (tier >= 3) out.push(el("clay", rr(hx0 + 62 - 9, hy0 + 6, 7, hh - 12, 3)));
    if (tier >= 4) out.push(el("clay", circ(M + 149, M + 60, 3.5)));
    out.push(el("brass", circ(hx0 + 31, M + 60, 5 + tk * 1.5)));
  } else {
    out.push(el("clay", rr(M + 56, M + 52, 96, 16, 8)));
    const R = 32 + tk * 6;
    // the gap is 76 degrees wide and faces up and to the right
    out.push(el("clay", cband(M + 184, M + 60, R, R * 0.42, -7, 277)));
    out.push(el("clay", circ(M + 150, M + 60, 11 + tk * 2)));
    if (tier >= 2) out.push(el("clay", circ(M + 150, M + 60, 4)));
    if (tier >= 3) out.push(el("clay", rr(M + 96, M + 49, 12, 22, 4)));
  }
  return out;
}

/**
 * THE TORSO, V2. The same barrel and the same key, plus what the concept
 * torsos carry: a PANEL LINE drawn as a groove (two nested outlines),
 * RIVETS at the panel corners (two at T1, four from T2, six from T3), and a
 * KEY SEAT, a clay bezel with a dark socket the stem enters. Design 2's
 * panel is taller than the shipped one so the seat sits inside it rather
 * than across its bottom edge. Nothing new is brass.
 */
function torsoPartsV2(tier, design) {
  const tk = (tier - 1) / 3;
  const [nx, ny] = RIG.torso.neck;
  const bw = tgt("bodyW");
  const bh = tgt("bodyH");
  const out = [];
  out.push(el("clay", rr(nx - bw / 2, ny - SKIRT, bw, bh + SKIRT, bw * 0.28)));

  let px, py, pw, ph;
  if (design === 1) {
    px = nx - bw * 0.30; py = ny + bh * 0.16; pw = bw * 0.34; ph = bh * 0.44;
    out.push(el("clay", rr(px, py, pw, ph, bw * 0.06)));
    out.push(el("clay", rr(px + 6, py + 6, pw - 12, ph - 12, bw * 0.045)));
    if (tier >= 3) out.push(el("clay", rr(nx - bw * 0.40, ny + bh * 0.74, bw * 0.80, bh * 0.10, bh * 0.05)));
  } else {
    px = nx - bw * 0.36; py = ny + bh * 0.20; pw = bw * 0.72; ph = bh * 0.50;
    out.push(el("clay", rr(px, py, pw, ph, bw * 0.10)));
    out.push(el("clay", rr(px + 6, py + 6, pw - 12, ph - 12, bw * 0.08)));
    if (tier >= 2) out.push(el("lens", circ(nx - bw * 0.20, ny + bh * 0.37, bw * 0.075 + tk * 6)));
  }
  const rivetR = bw * 0.018 + tk * 0.8;
  const inset = bw * 0.035;
  const rivet = (x, y) => out.push(el("clay", circ(x, y, rivetR)));
  rivet(px + inset, py + inset); rivet(px + pw - inset, py + inset);
  if (tier >= 2) { rivet(px + inset, py + ph - inset); rivet(px + pw - inset, py + ph - inset); }
  if (tier >= 3) { rivet(px + inset, py + ph / 2); rivet(px + pw - inset, py + ph / 2); }

  // the key and its seat
  const kx = nx + bw * 0.24;
  const ky = ny + bh * 0.42;
  const kr = bw * 0.052 + tk * 3;
  const seatY = ky + kr * 1.75;
  out.push(el("clay", circ(kx, seatY, kr * 0.85)));
  out.push(el("grille", circ(kx, seatY, kr * 0.58)));
  out.push(el("brass", rr(kx - kr * 0.28, ky - kr * 0.2, kr * 0.56, kr * 2.0, kr * 0.28)));
  out.push(el("brass", circ(kx - kr * 0.85, ky - kr * 0.55, kr * 0.72)));
  out.push(el("brass", circ(kx + kr * 0.85, ky - kr * 0.55, kr * 0.72)));
  return out;
}

/**
 * THE V2 HEAD (2026-09-05). Design 1 is headParts as it was, byte for byte.
 * Design 2 is redrawn. The design-2 placeholder was a CYCLOPS: one central
 * lens on the forehead and a nub on the crown. Both control roots traced it,
 * so all 108 renders of lantern, piston and anvil came back one-eyed whatever
 * the prompt said: the ruler is the thing the model copies, not the words.
 * So the ruler now draws what the live design-2 heads have and what the
 * concept shelf has: exactly two big round lamp eyes, level, wide apart,
 * mirrored, in the design-1 size band (the same eR formula); a smooth blank
 * forehead with nothing drawn on it; the family character in the CROWN
 * SILHOUETTE and the EAR CUPS only; a mouth grille low on the face on the
 * centre line. Every crown piece and every ear is drawn BEFORE the box, so
 * the box covers its inner part and the lineart carries the silhouette step
 * and never a line across the brow. Same canvas, same apex row (`top`, so
 * the figure's H does not move), same seat, same lugs, ink never past the
 * full width, no accent above the eye row.
 *   t1 peeper   a small round bump on the crown, round cup ears
 *   t2 lantern  a flat cap rim: a flat top a little wider than the box
 *   t3 piston   a squared crown; cylinder ears with a band on each EAR
 *   t4 anvil    a wide flat anvil top out to the full width
 */
/** a rounded rect with one radius on the top corners and another on the
 *  bottom, as ONE polygon: a crown can be squared while the underside stays
 *  a dome, with one outline and no inner arc. v2 head only. */
const rrTB = (x, y, w, h, rt, rb, n = 14) => {
  const pts = [];
  const arc = (cx, cy, r, a0, a1) => {
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  arc(x + w - rt, y + rt, rt, -90, 0);      // top right
  arc(x + w - rb, y + h - rb, rb, 0, 90);   // bottom right
  arc(x + rb, y + h - rb, rb, 90, 180);     // bottom left
  arc(x + rt, y + rt, rt, 180, 270);        // top left
  return { k: "poly", pts, bbox: [x, y, w, h] };
};

function headPartsV2(tier, design) {
  if (design === 1) return headParts(tier, design);
  const tk = (tier - 1) / 3;
  const [sx, sy] = RIG.head.neck;
  const coreW = tgt("headCoreW");
  const fullW = tgt("headFullW");
  const hh = tgt("headH");
  const top = sy - hh;
  const er = (fullW - coreW) / 2;
  const out = [];

  // the low side lugs and the dome, as every head has them
  for (const s of [-1, 1]) out.push(el("clay", circ(sx + s * (coreW / 2), sy - er * 0.55, er)));
  out.push(el("clay", ell(sx, (top + sy + SKIRT) / 2, coreW / 2, (hh + SKIRT) / 2)));

  const bw = coreW * 0.96;
  const ey = top + hh * 0.46;                 // the eye row, as design 1
  const eR = coreW * (0.145 + tk * 0.012);    // the design-1 eye band
  const cupR = coreW * 0.105;                 // ear cup, outer edge on the full width

  // THE EARS, on the eye row, before the box
  if (tier === 3) {
    // piston: a cylinder ear with a band round it. The band is on the EAR.
    const cw = cupR * 1.8, ch = cupR * 2.5;
    const bandW = cw + cupR * 0.4, bandH = cupR * 0.32;
    const cx = fullW / 2 - bandW / 2;
    for (const s of [-1, 1]) out.push(el("clay", rr(sx + s * cx - cw / 2, ey - ch / 2, cw, ch, cw * 0.45)));
    for (const s of [-1, 1]) out.push(el("clay", rr(sx + s * cx - bandW / 2, ey - bandH / 2, bandW, bandH, bandH / 2)));
  } else {
    for (const s of [-1, 1]) out.push(el("clay", circ(sx + s * (fullW / 2 - cupR), ey, cupR)));
  }

  // THE CROWN, before the box, so the box covers its inner part and only the
  // silhouette step reaches the lineart. The apex of every tier is `top`.
  // The box's top corners are squared where the crown is flat (a tiny arc
  // hides inside the rim) and round on the peeper; its bottom corners are
  // always the dome's, because a head cut flat across its underside is the
  // bar-across-the-chest failure of the whole-bot study.
  const rBot = bw * 0.30;
  let boxTop = top;
  let rTop = rBot;
  if (tier === 1) {
    // peeper: a small round bump; the box sits a little lower so the bump's top is the apex
    const bumpR = coreW * 0.075;
    out.push(el("clay", circ(sx, top + bumpR, bumpR)));
    boxTop = top + bumpR * 0.85;
  } else if (tier === 2) {
    // lantern: a flat cap rim, a little wider than the box, pill ends
    const ov = coreW * 0.05, capH = hh * 0.08;
    out.push(el("clay", rr(sx - bw / 2 - ov, top, bw + 2 * ov, capH, capH / 2)));
    rTop = bw * 0.06;
  } else if (tier === 3) {
    // piston: the squared crown, softened as the clay law wants
    rTop = bw * 0.10;
  } else {
    // anvil: a wide flat top out to the full width, crisp corners
    const slabW = fullW * 0.98, slabH = hh * 0.10;
    out.push(el("clay", rr(sx - slabW / 2, top, slabW, slabH, slabH * 0.3)));
    rTop = bw * 0.06;
  }

  // the softened box: still wider than tall, still domed underneath
  out.push(el("clay", rrTB(sx - bw / 2, boxTop, bw, top + hh + SKIRT - boxTop, rTop, rBot)));

  // THE FACE: two eyes, then the pupils, then the mouth. Nothing else.
  const ex = coreW * 0.225;
  for (const s of [-1, 1]) out.push(el("lens", circ(sx + s * ex, ey, eR)));
  for (const s of [-1, 1]) out.push(el("grille", circ(sx + s * ex, ey + eR * 0.06, eR * 0.30)));
  out.push(el("grille", rr(sx - coreW * 0.20, top + hh * 0.70, coreW * 0.40, hh * 0.11, hh * 0.045)));
  return out;
}

const PARTS_V2 = { head: headPartsV2, torso: torsoPartsV2, arm: armPartsV2, leg: legPartsV2, weapon: weaponPartsV2 };

const PARTS = { head: headParts, torso: torsoParts, arm: armParts, leg: legParts, weapon: weaponParts };
/** the ruler file prefix per slot: pair slots kept their plural names */
const RAW_NAME = { head: "head", torso: "torso", arm: "arms", leg: "legs", weapon: "weapon" };
/** only the limbs carry a model bias worth correcting */
const PRE_SLOTS = new Set(["arm", "leg"]);

// ── V3 RULERS: THE HEAD SHAPE TABLE ───────────────────────────────────────
// --out v3 only. Nothing above this line reads any of it.
//
// WHY. Mike, 2026-09-05: "Not a whole lot of variation going on with the
// models. Was hoping people could make their own cute unique robots." It was
// measured, not felt: six of the eight shipped heads are one dome, all eight
// boots are one boot, and the eight torsos share one outline exactly. Two
// earlier runs proved the rule that governs the fix: PROMPT CHANGES CANNOT
// BEAT WHAT THE RULER DRAWS. So variation is bought by AUTHORING RULERS, and
// it is bought on the head first, because the head is 57 of every 100 pixels
// of a robot at ring size.
//
// WHAT IS FIXED FOR ALL SIXTEEN, so no judge rule has to move:
//   * the canvas, the seat and the apex row (`top`), so the figure's H and
//     every other part's pivot are untouched;
//   * exactly two lamp eyes on the DESIGN-ONE eye row at the DESIGN-ONE
//     radius band, level, mirrored, wide apart, with a pupil in each;
//   * a blank forehead: no lens, no grille and no accent of any kind above
//     the eye row, which is rank-part's THIRD EYE rule;
//   * the crease lugs, unchanged, because they are what covers the shoulder;
//   * THE UNDERSIDE, drawn from the contract's own dome ellipse below the
//     waist row and identical on every shape, so no head is cut flat across
//     its widest row;
//   * ink inside the full head width.
//
// WHAT CHANGES, and it is the whole design: the CROWN PROFILE above the waist
// row, and the EARS. That is it. The mouth is the second axis and it is the
// cheapest variation in the table: one dark hole in a different shape.
//
// HOW A CROWN IS DRAWN. One polygon per head, sampled from a half-width
// function hw(y). Below the waist row hw is the contract's dome, byte for
// byte the same call on all sixteen. Above it each shape either IS that dome
// (round, bear, cat, whose character is in their ears) or is a flat-topped
// flare: a crown half-width, a corner radius that rounds the top, and one
// exponent that says how it opens out (1.0 straight for the cone and the
// boxes, 2.2 late-flaring for the bell). A shape whose ears make the apex
// starts its dome LOWER, which is the only way ears can be the top of a head
// without moving the figure's apex row.
const HEAD_WAIST_Y = () => (RIG.head.neck[1] - tgt("headH") + RIG.head.neck[1] + SKIRT) / 2;

/** a polygon from a point list, with its bbox, in the bake's shape shape */
const polyOf = (pts) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs), by = Math.min(...ys);
  return { k: "poly", pts, bbox: [bx, by, Math.max(...xs) - bx, Math.max(...ys) - by] };
};

/** a convex polygon with a radius on each corner: the cat's ear. Standard
 *  corner rounding, so the tip is blunt by construction and its bluntness is
 *  a number in the table rather than a hope. */
const roundPoly = (pts, radii, n = 8) => {
  const out = [];
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const p = pts[i], a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    const ua = [a[0] - p[0], a[1] - p[1]], ub = [b[0] - p[0], b[1] - p[1]];
    const la = Math.hypot(...ua) || 1, lb = Math.hypot(...ub) || 1;
    const va = [ua[0] / la, ua[1] / la], vb = [ub[0] / lb, ub[1] / lb];
    const half = Math.acos(Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1]))) / 2;
    const r = Math.min(radii[i], la / 2 * Math.tan(half), lb / 2 * Math.tan(half));
    const d = r / Math.tan(half);
    const ta = [p[0] + va[0] * d, p[1] + va[1] * d];
    const tb = [p[0] + vb[0] * d, p[1] + vb[1] * d];
    // the arc centre sits along the angle bisector
    const bis = [va[0] + vb[0], va[1] + vb[1]];
    const lb2 = Math.hypot(...bis) || 1;
    const c = [p[0] + (bis[0] / lb2) * (r / Math.sin(half)), p[1] + (bis[1] / lb2) * (r / Math.sin(half))];
    const a0 = Math.atan2(ta[1] - c[1], ta[0] - c[0]);
    let a1 = Math.atan2(tb[1] - c[1], tb[0] - c[0]);
    while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
    for (let k = 0; k <= n; k++) {
      const t = a0 + ((a1 - a0) * k) / n;
      out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
    }
  }
  return polyOf(out);
};

/** a saw-tooth slot: the cone's mouth. w wide, amp tall, `teeth` peaks, t thick. */
const zigzag = (cx, cy, w, amp, teeth, t) => {
  const x0 = cx - w / 2, step = w / (2 * teeth);
  const top = [], bot = [];
  for (let i = 0; i <= 2 * teeth; i++) {
    const x = x0 + i * step;
    const y = cy + (i % 2 === 0 ? -amp / 2 : amp / 2);
    top.push([x, y]);
    bot.push([x, y + t]);
  }
  return polyOf(top.concat(bot.reverse()));
};

/**
 * THE CROWN TABLE. `dome` means the shape's crown IS the contract's dome,
 * started at its own topY; everything else is a flat-topped flare. `drop` is
 * how far below the apex the body starts, and it is non-zero exactly when
 * something else (an ear, an aerial, a rim) is the top of the head.
 * `wFlat` and `rTop` are fractions of the core width, `expo` the flare.
 */
const HEAD_SHAPES = {
  round:  { drop: 0.000, dome: true },
  box:    { drop: 0.000, wFlat: 0.480, rTop: 0.288, expo: 1.0 },
  bear:   { drop: 0.160, dome: true },
  tv:     { drop: 0.076, wFlat: 0.457, rTop: 0.070, expo: 1.0 },
  bell:   { drop: 0.000, wFlat: 0.340, rTop: 0.190, expo: 1.5 },
  bucket: { drop: 0.105, wFlat: 0.530, rTop: 0.050, expo: 1.0 },
  cone:   { drop: 0.000, wFlat: 0.205, rTop: 0.075, expo: 1.0 },
  cat:    { drop: 0.139, dome: true },
};

/**
 * THE CLAY FLOOR UNDER AN EYE, and it is why the bell and the cone are not
 * narrower than they are. The eye's outer edge sits 0.370 of the core width
 * off the centre line, so a crown that measures less than that plus a bezel's
 * worth of clay at the eye row hands the model an eye hanging off the side of
 * the head. Read on the first cut: the bell measured 124 px of half-width
 * against 121 of eye, i.e. 3 px of clay, and the render would have put the
 * lamp through the outline. Every crown in the table now clears 140.
 */
const EYE_CLAY_MIN = 140;

/** the shape's body, as ONE polygon: its own crown above the waist row and
 *  the contract's own dome underside below it. */
function headBodyV3(shape) {
  const [sx, sy] = RIG.head.neck;
  const coreW = tgt("headCoreW");
  const hh = tgt("headH");
  const top = sy - hh;
  const RX = coreW / 2;
  const cy = (top + sy + SKIRT) / 2;      // the contract dome's centre row
  const ry = (hh + SKIRT) / 2;            // and its vertical radius
  const bottom = sy + SKIRT;
  const s = HEAD_SHAPES[shape];
  const topY = top + s.drop * hh;

  const hw = (y) => {
    if (y >= cy) {
      // THE UNDERSIDE. The same call on all sixteen heads.
      const k = (y - cy) / ry;
      return RX * Math.sqrt(Math.max(0, 1 - k * k));
    }
    if (s.dome) {
      const k = (cy - y) / (cy - topY);
      return RX * Math.sqrt(Math.max(0, 1 - k * k));
    }
    const wFlat = s.wFlat * coreW;
    const rTop = s.rTop * coreW;
    const t = (y - topY) / (cy - topY);
    let w = wFlat + (RX - wFlat) * Math.pow(t, s.expo);
    if (y < topY + rTop) {
      const k = (topY + rTop - y) / rTop;   // 1 at the crown, 0 one radius down
      w -= rTop * (1 - Math.sqrt(Math.max(0, 1 - k * k)));
    }
    return Math.max(0, w);
  };

  const N = 96;
  const right = [], left = [];
  for (let i = 0; i <= N; i++) {
    const y = topY + ((bottom - topY) * i) / N;
    const w = hw(y);
    right.push([sx + w, y]);
    left.push([sx - w, y]);
  }
  return polyOf(right.concat(left.reverse()));
}

/** the clay pieces that sit outside the body: the ears, the rim, the aerial. */
function headCrownV3(shape) {
  const [sx, sy] = RIG.head.neck;
  const coreW = tgt("headCoreW");
  const fullW = tgt("headFullW");
  const hh = tgt("headH");
  const top = sy - hh;
  const ey = top + hh * 0.46;
  const out = [];
  if (shape === "round") {
    // the design-one cup ears, at the design-one place
    const cr = coreW * 0.13;
    for (const s of [-1, 1]) out.push(el("clay", circ(sx + s * coreW * 0.40, top + hh * 0.13 + cr, cr)));
  } else if (shape === "box") {
    // the design-two cup ears: on the eye row, outer edge on the full width
    const cupR = coreW * 0.105;
    for (const s of [-1, 1]) out.push(el("clay", circ(sx + s * (fullW / 2 - cupR), ey, cupR)));
  } else if (shape === "bear") {
    // THE EARS ARE THE CROWN: their tops are the apex of the whole figure.
    //
    // AND EACH EAR IS SEATED, which is the whole of the 2026-09-05 redraw.
    // The first cut put the ear circle where it only grazed the dome, and 48
    // renders came back with two loose balls floating over the head: 20 of 24
    // NO FACE FOUND and 5 STRAY INK, no survivor in either bear pool, while
    // the cat's ears, which are seated in the dome, rendered clean. A ruler
    // that hands the model two detached circles teaches it to draw two
    // detached circles, and no prompt argues with that. So a ROOT disc joins
    // each ear to the crown: the ear's own position, size and apex row are
    // untouched, so the silhouette departure that makes a bear a bear is
    // unchanged, and the union is now one continuous form with two bumps.
    const r = coreW * 0.140;
    const ex = fullW / 2 - r - coreW * 0.030;
    for (const s of [-1, 1]) {
      out.push(el("clay", circ(sx + s * ex, top + r, r)));
      out.push(el("clay", circ(sx + s * ex * 0.78, top + r * 1.90, r * 0.80)));
    }
  } else if (shape === "tv") {
    // the aerial, INSIDE the head room: its ball's top is the apex
    const br = coreW * 0.034;
    out.push(el("clay", rr(sx - br * 0.65, top + br, br * 1.3, hh * 0.10, br * 0.65)));
    out.push(el("clay", circ(sx, top + br, br)));
  } else if (shape === "bucket") {
    // THE RIM IS THE TOP: the only crown in the table that is wider than the core
    const rimW = fullW * 0.94, rimH = hh * 0.105;
    out.push(el("clay", rr(sx - rimW / 2, top, rimW, rimH, rimH * 0.34)));
  } else if (shape === "cat") {
    // soft pointed ears, tips rounded off at about a bolt head across, so no
    // point on this head is longer than a bolt head and it stays cuddly
    const exx = coreW * 0.265, halfW = coreW * 0.190, baseY = top + hh * 0.32, tipR = coreW * 0.030;
    for (const s of [-1, 1]) {
      const cx = sx + s * exx;
      // Rounding a corner pulls it INSIDE the triangle, so a raw rounded ear
      // sits 11 rows under the apex and the head loses 11 rows of height.
      // Draw it, measure it, and lift it until its blunt tip is the apex: the
      // tip stays a bolt head across and the figure's H does not move.
      const ear = roundPoly([[cx, top], [cx + halfW, baseY], [cx - halfW, baseY]],
                            [tipR, tipR * 1.6, tipR * 1.6]);
      const lift = ear.bbox[1] - top;
      out.push(el("clay", polyOf(ear.pts.map(([x, y]) => [x, y - lift]))));
    }
  }
  return out;
}

/** the mouth, always in the grille material, always low on the face, always
 *  on the centre line, and never above the eyes. */
function headMouthV3(mouth) {
  const [sx, sy] = RIG.head.neck;
  const coreW = tgt("headCoreW");
  const hh = tgt("headH");
  const top = sy - hh;
  const my = top + hh * 0.70;        // the design-two mouth band, unchanged
  const mh = hh * 0.11;
  if (mouth === "grille") return el("grille", rr(sx - coreW * 0.20, my, coreW * 0.40, mh, hh * 0.045));
  if (mouth === "widegrille") return el("grille", rr(sx - coreW * 0.28, my + mh * 0.12, coreW * 0.56, mh * 0.76, hh * 0.038));
  if (mouth === "o") return el("grille", circ(sx, my + mh * 0.50, coreW * 0.068));
  if (mouth === "zigzag") return el("grille", zigzag(sx, my + mh * 0.45, coreW * 0.44, hh * 0.076, 3, hh * 0.042));
  if (mouth === "smile") {
    // a crescent slot, tips curling up: an annular sector of the lower arc
    const R = coreW * 0.366, t = hh * 0.045;
    const cyS = my + mh * 0.95 - R;
    return el("grille", cband(sx, cyS, R, R - t, 55, 125));
  }
  throw new Error(`bots-bake-parts --out v3: unknown mouth ${mouth}`);
}

/** ONE head ruler: the lugs, the body, the crown pieces, then the face. */
function headPartsV3(shape, mouth) {
  const [sx, sy] = RIG.head.neck;
  const coreW = tgt("headCoreW");
  const fullW = tgt("headFullW");
  const hh = tgt("headH");
  const top = sy - hh;
  const er = (fullW - coreW) / 2;
  const out = [];
  // the crease lugs first, so the body overlaps their inner edge, as every
  // head has had them since the concept contract
  for (const s of [-1, 1]) out.push(el("clay", circ(sx + s * (coreW / 2), sy - er * 0.55, er)));
  out.push(el("clay", headBodyV3(shape)));
  out.push(...headCrownV3(shape));
  // THE FACE. Two eyes on the design-one row at the design-one radius, their
  // pupils, and the mouth. Nothing else, and nothing above the eye row.
  const ey = top + hh * 0.46;
  const eR = coreW * 0.145;
  const ex = coreW * 0.225;
  for (const s of [-1, 1]) out.push(el("lens", circ(sx + s * ex, ey, eR)));
  for (const s of [-1, 1]) out.push(el("grille", circ(sx + s * ex, ey + eR * 0.06, eR * 0.30)));
  out.push(headMouthV3(mouth));
  return out;
}

/** the sixteen looks the table asks the bake to draw, in table order. */
function shapeTable() {
  const t = JSON.parse(readFileSync(SHAPES_JSON, "utf8"));
  const rows = [];
  for (const s of t.shapes) {
    if (!HEAD_SHAPES[s.shape]) {
      console.error(`bots-bake-parts --out v3: bots-shapes.json names shape ${s.shape}, which this bake cannot draw`);
      process.exit(2);
    }
    for (const look of s.looks) {
      if (look.draw === false) continue;
      if (!t.mouths[look.mouth]) {
        console.error(`bots-bake-parts --out v3: ${s.shape} asks for mouth ${look.mouth}, which is not in the table`);
        process.exit(2);
      }
      rows.push({ key: `head-${s.shape}-${look.mouth}`, shape: s.shape, mouth: look.mouth,
                  name: s.name, prompt: s.prompt, mouthPrompt: t.mouths[look.mouth].prompt, notes: s.notes });
    }
  }
  return { table: t, rows };
}

/** The scissor lift, two states, same canvas, same floor line. Unchanged. */
function liftParts(raised) {
  const out = [];
  const top = raised ? LIFT.topRaised : LIFT.topDown;
  const x0 = (LIFT.w - LIFT.platformW) / 2;
  out.push(el("rubber", rr(120, 400, 400, 16, 6)));
  if (raised) {
    out.push(el("rubber", bar(180, 398, 460, top + 22, 14)));
    out.push(el("rubber", bar(460, 398, 180, top + 22, 14)));
    out.push(el("brass", circ(320, (398 + top + 22) / 2, 9)));
    out.push(el("brass", circ(180, 398, 7)), el("brass", circ(460, 398, 7)));
    out.push(el("brass", circ(180, top + 22, 7)), el("brass", circ(460, top + 22, 7)));
  } else {
    out.push(el("rubber", rr(170, top + 20, 300, 8, 4)));
  }
  out.push(el("rubber", rr(x0, top, LIFT.platformW, 22, 8)));
  out.push(el("brass", rr(x0, top - 4, LIFT.platformW, 8, 4)));
  out.push(el("brass", rr(x0 + 8, top + 26, 40, 6, 3)), el("brass", rr(x0 + LIFT.platformW - 48, top + 26, 40, 6, 3)));
  return out;
}

// ── bake ───────────────────────────────────────────────────────────────────
/** shapes carrying `forceFill` are pre-shaded (the occlusion wash, the moulded
 *  cuffs): they paint flat at the value the join law asked for. */
function split(elements) {
  return elements.map((e) =>
    e.forceFill ? { mat: e.mat, shape: e.shape, flatFill: e.forceFill, clipTo: e.clipTo } : e,
  );
}
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

/** the specular sits on the part's own centre line: the pivot column, which
 *  is what keeps it symmetric under the rig's mirror. */
const SPEC_CX = {
  head: () => RIG.head.neck[0],
  torso: () => RIG.torso.neck[0],
  arm: () => RIG.arm.shoulder[0],
  leg: () => RIG.leg.hip[0],
};

for (const slot of Object.keys(PARTS)) {
  if (V2 || V3) break; // --out v2 and --out v3 write only their own ruler tree, below
  if (ONLY && !ONLY.has(slot)) continue;
  const { w, h } = RIG[slot];
  for (const tier of TIERS) {
    for (const design of DESIGNS) {
      // 1. the SHIPPED PLACEHOLDER, drawn ON TARGET
      const shipped = split(PARTS[slot](tier, design, false));
      const cx = SPEC_CX[slot] ? SPEC_CX[slot]() : null;
      const base = render(w, h, shipped, slot, cx);
      write(`parts/${slot}/t${tier}-${design}.png`, base);
      write(`parts/${slot}/t${tier}-${design}.mask.png`, renderMask(w, h, shipped));
      // 2. the RULER / GENERATION PLATE, PRE-COMPENSATED for the model bias.
      //    scripts/bots-gen-kit.mjs reads this folder, so the correction
      //    reaches the generator and never reaches the player. Slots with no
      //    measured bias write the same render twice, on purpose: leaving a
      //    stale ruler behind is how a joint moves without anyone touching
      //    the contract.
      const plate = PRE_SLOTS.has(slot) ? split(PARTS[slot](tier, design, true)) : shipped;
      const ruler = plate === shipped ? base : render(w, h, plate, slot, cx);
      write(`_raw/parts/placeholders/${RAW_NAME[slot]}-t${tier}-${design}.png`, ruler);
    }
  }
}
if (!V2 && !V3 && (!ONLY || ONLY.has("lift"))) {
  write("lift/down.png", render(LIFT.w, LIFT.h, liftParts(false), "weapon"));
  write("lift/raised.png", render(LIFT.w, LIFT.h, liftParts(true), "weapon"));
}

// ── the v2 ruler tree ──────────────────────────────────────────────────────
// --out v2 only. Two flavours of every part on the SAME canvas at the SAME
// pivots, the SVG source beside each PNG, a manifest, and a contact sheet
// that puts the v1 ruler on disk above the v2 target and the v2 plate.
const V2_FILES = [];
function writeV2(rel, svgText) {
  const p = join(V2_ROOT, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  const png = new Resvg(svgText, RESVG_OPTS).render().asPng();
  writeFileSync(p, png);
  writeFileSync(p.replace(/\.png$/, ".svg"), svgText);
  files += 1;
  bytes += png.length;
  V2_FILES.push(rel.replace(/\\/g, "/"));
  return png;
}

/** rows of the compare sheet: label, and a function from (slot, t, d) to a PNG buffer or null */
function compareSheet(rows, slots) {
  const SCALE = { head: 0.32, torso: 0.5, arm: 0.5, leg: 0.5, weapon: 0.5 };
  const LABEL_W = 170, GUT = 16, HEAD_H = 30;
  const cellW = Math.max(...slots.map((s) => Math.ceil(RIG[s].w * SCALE[s]))) + GUT;
  const W = LABEL_W + cellW * TIERS.length * DESIGNS.length;
  let y = 0;
  let body = "";
  const text = (x, yy, s, size = 14, fill = "#e8e9ee") =>
    `<text x="${x}" y="${yy}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="${fill}">${s}</text>`;
  for (const slot of slots) {
    const k = SCALE[slot];
    const cw = Math.ceil(RIG[slot].w * k), ch = Math.ceil(RIG[slot].h * k);
    body += `<rect x="0" y="${y}" width="${W}" height="${HEAD_H}" fill="#1b1c20"/>`;
    body += text(12, y + 20, `${slot}  (${RIG[slot].w}x${RIG[slot].h} at ${k}x)`, 15, "#ffffff");
    let x = LABEL_W;
    for (const t of TIERS) for (const d of DESIGNS) { body += text(x + 4, y + 20, `t${t}-${d}`, 13, "#9aa0ad"); x += cellW; }
    y += HEAD_H;
    for (const row of rows) {
      body += text(12, y + ch / 2 + 5, row.label, 14, row.colour);
      let x = LABEL_W;
      for (const t of TIERS) for (const d of DESIGNS) {
        const png = row.get(slot, t, d);
        body += `<rect x="${x}" y="${y + 6}" width="${cw}" height="${ch}" fill="#3a3b42"/>`;
        if (png) body += `<image x="${x}" y="${y + 6}" width="${cw}" height="${ch}" href="data:image/png;base64,${png.toString("base64")}"/>`;
        x += cellW;
      }
      y += ch + 12;
    }
  }
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="${W}" height="${y}" fill="#26272c"/>${body}</svg>`;
  // the one render in this file that uses a font: the labels. No font on the
  // machine only loses the labels, never a cell.
  return new Resvg(svgText, { font: { loadSystemFonts: true, defaultFontFamily: "Arial" } }).render().asPng();
}

if (V2) {
  const slots = Object.keys(PARTS_V2).filter((s) => !ONLY || ONLY.has(s));
  const target = new Map(), plate = new Map();
  const features = {
    head: "design 1 unchanged (headParts as is); design 2 redrawn TWO-EYED (headPartsV2): two lamp eyes in the design-1 size band, level, wide apart, mirrored, pupils, smooth blank forehead, mouth grille low on the centre line, ear cups on the eye row at the full width, character in the crown silhouette only: t1 peeper crown bump + round cup ears, t2 lantern flat cap rim, t3 piston squared crown + banded cylinder ears, t4 anvil wide flat top to the full width",
    torso: "panel groove (two nested outlines), corner rivets (2 at T1, 4 from T2, 6 from T3), key seat (clay bezel + dark socket under the stem); design 2 panel taller so the seat sits inside it",
    arm: "shoulder cap, upper tube, elbow ball wider than the tube with a band (T3+ adds an upper band), forearm tube, wrist cuff; design 1 = mitt with thumb (T2+ knuckle ridge, T4 studs), design 2 = two-finger claw (T2+ palm boss)",
    leg: "THE DOME BOOT (lane B, 2026-09-05): a rounded cap a little wider than a 0.6-width shaft, ONE short cylinder ankle (wider and taller with each tier), the boot body as one polygon (a steep heel arc, a wide toe arc that rounds more with each tier, short straight sides, 0.90 of the contract's foot width with the toe edge where the stance solve puts it), and ONE CORAL SOLE block moulded under it (the one coral material on the ruler, 0.42 of the foot height, the same width as the boot and never wider, a straight top edge, rounded bottom corners, so the control maps carry it as its own block); design 1 = plain dome, design 2 = two small recessed CLAY side pods low on the boot's sides, bulldozer (t4-1) = one band around the dome's middle; one distinct picture per family",
    weapon: "design 1 = mallet: grip, handle, collar, head with a band at each end, one small brass bolt (T3+ strike face cap, T4 collar stud); design 2 = wrench: grip, handle, boss (T2+ stud, T3+ handle band), open C jaw with a real transparent gap and hole",
  };
  for (const slot of slots) {
    const { w, h } = RIG[slot];
    const cx = SPEC_CX[slot] ? SPEC_CX[slot]() : null;
    for (const tier of TIERS) {
      for (const design of DESIGNS) {
        const key = `${RAW_NAME[slot]}-t${tier}-${design}`;
        const onTarget = split(PARTS_V2[slot](tier, design, false));
        const base = render(w, h, onTarget, slot, cx);
        target.set(key, writeV2(join("target", `${key}.png`), base));
        const biased = PRE_SLOTS.has(slot) ? split(PARTS_V2[slot](tier, design, true)) : onTarget;
        const ruler = biased === onTarget ? base : render(w, h, biased, slot, cx);
        plate.set(key, writeV2(join("plate", `${key}.png`), ruler));
      }
    }
  }
  const v1 = (slot, t, d) => {
    const p = join(V1_RULERS, `${RAW_NAME[slot]}-t${t}-${d}.png`);
    return existsSync(p) ? readFileSync(p) : null;
  };
  const sheet = compareSheet(
    [
      { label: "v1 ruler on disk (plate)", colour: "#9aa0ad", get: v1 },
      { label: "v2 target", colour: "#8fd6b4", get: (s, t, d) => target.get(`${RAW_NAME[s]}-t${t}-${d}`) },
      { label: "v2 plate (pre-compensated)", colour: "#f0a58f", get: (s, t, d) => plate.get(`${RAW_NAME[s]}-t${t}-${d}`) },
    ],
    // limbs and weapons first, the unchanged head last
    ["arm", "leg", "weapon", "torso", "head"].filter((s) => slots.includes(s)),
  );
  writeFileSync(join(V2_ROOT, "_compare.png"), sheet);
  const manifest = {
    mode: "v2",
    note: "Ruler tree for the ControlNet lane. target/ is ON TARGET (condition on this: a ControlNet does not carry the unconditioned generator's bias); every pivot lands on ink, every ratio sits inside the contract band, no ink reaches a canvas edge. plate/ is PRE-COMPENSATED with the bake's PRE table, for the img2img lane that reads _raw/parts/placeholders; like the v1 rulers its arm is wider than the band and its foot pivot sits below the shortened leg, by design. Neither is shipped; the game never reads this folder. Canvases and pivots are the frozen contract in src/app/bots/_view/rig-points.ts, unchanged.",
    canvases: Object.fromEntries(Object.entries(RIG).map(([s, r]) => [s, { w: r.w, h: r.h }])),
    pivots: Object.fromEntries(Object.entries(RIG).map(([s, r]) => [s, Object.fromEntries(Object.entries(r).filter(([k]) => k !== "w" && k !== "h"))])),
    pre: PRE,
    preSlots: [...PRE_SLOTS],
    features,
    files: V2_FILES,
  };
  writeFileSync(join(V2_ROOT, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
}


// ── the v3 ruler tree ──────────────────────────────────────────────────────
// --out v3 only. The head shape table, one ruler per look, on the SAME canvas
// at the SAME pivots as everything else. It writes NO shipped part, NO mask,
// NO lift, no v1 or v2 ruler, and does not touch rig-points.ts.
//
// ONE FLAVOUR, NOT TWO. The v2 tree writes a `target` and a pre-compensated
// `plate` because the arm and the leg carry a measured generator bias. The
// head does not: PRE_SLOTS is arms and legs, so a v3 plate would be a second
// name for the same bytes, and a second name for one drawing is how a ruler
// silently goes stale. So there is one folder, `target`, and it says on the
// tin that it is on target.
const V3_FILES = [];
function writeV3(rel, svgText) {
  const p = join(V3_ROOT, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  const png = new Resvg(svgText, RESVG_OPTS).render().asPng();
  writeFileSync(p, png);
  writeFileSync(p.replace(/\.png$/, ".svg"), svgText);
  files += 1;
  bytes += png.length;
  V3_FILES.push(rel.replace(/\\/g, "/"));
  return png;
}

if (V3 && (!ONLY || ONLY.has("head"))) {
  const { table, rows } = shapeTable();
  const { w, h } = RIG.head;
  const specCx = RIG.head.neck[0];
  const looks = [];
  for (const r of rows) {
    const els = split(headPartsV3(r.shape, r.mouth));
    writeV3(join("target", `${r.key}.png`), render(w, h, els, "head", specCx));
    looks.push({ key: r.key, shape: r.shape, mouth: r.mouth, name: r.name,
                 prompt: r.prompt, mouthPrompt: r.mouthPrompt, notes: r.notes });
  }
  const manifest = {
    mode: "v3",
    note:
      "The HEAD SHAPE TABLE, drawn. One ruler per look, ON TARGET (a ControlNet does not carry the "
      + "unconditioned generator's bias, and the head carries no measured bias anyway). Every ruler is on "
      + "the contract's head canvas at the contract's seat, keeps the apex row so the figure's H does not "
      + "move, carries exactly two lamp eyes on the design-one eye row at the design-one radius band, a "
      + "blank forehead, the crease lugs and the contract's own dome underside, and keeps its ink inside "
      + "the full head width. Nothing here is shipped and the game never reads this folder. The canvases "
      + "and pivots are the frozen contract in src/app/bots/_view/rig-points.ts, unchanged. The table is "
      + "scripts/bots-shapes.json; the drawing is headPartsV3 in this file.",
    slot: "head",
    tier: table.tier,
    canvas: { w, h },
    pivots: { neck: RIG.head.neck },
    apexY: RIG.head.neck[1] - tgt("headH"),
    eyeRow: Math.round(RIG.head.neck[1] - tgt("headH") + tgt("headH") * 0.46),
    coreW: tgt("headCoreW"),
    fullW: tgt("headFullW"),
    crowns: HEAD_SHAPES,
    looks,
    files: V3_FILES,
  };
  writeFileSync(join(V3_ROOT, "manifest-head.json"), JSON.stringify(manifest, null, 1) + "\n");
}

// ── the v3 ruler tree: THE LEG SHAPES (lane B, 2026-09-05) ────────────────
// --out v3, leg only. Lane A's head shapes carry their own guarded block, so
// the two lanes never touch the same lines and never share a symbol beyond
// V3 and V3_ROOT. Writes the same two flavours the v2 tree writes, on the
// SAME canvas at the SAME pivots, keyed by SHAPE rather than by tier and
// design, with the SVG source beside each PNG, its own manifest and a strip
// that puts the live boot beside the four new shapes. Writes nothing under
// parts/, nothing under _raw/parts/placeholders/ and does not touch
// rig-points.ts: the canvases and pivots are the frozen contract.
//
//   _raw/parts/placeholders-v3/target/legs-<shape>.png   ON TARGET
//   _raw/parts/placeholders-v3/plate/legs-<shape>.png    PRE-COMPENSATED
//   _raw/parts/placeholders-v3/manifest-leg.json
//   _raw/parts/placeholders-v3/_shapes-leg.png
if (V3 && (!ONLY || ONLY.has("leg"))) {
  const legFiles = [];
  const writeLegV3 = (rel, svgText) => {
    const p = join(V3_ROOT, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    const png = new Resvg(svgText, RESVG_OPTS).render().asPng();
    writeFileSync(p, png);
    writeFileSync(p.replace(/\.png$/, ".svg"), svgText);
    files += 1;
    bytes += png.length;
    legFiles.push(rel.replace(/\\/g, "/"));
    return png;
  };

  const { w, h } = RIG.leg;
  const cx = SPEC_CX.leg();
  const targets = new Map(), plates = new Map();
  for (const shape of LEG_SHAPES_V3) {
    const onTarget = split(legPartsV3(shape, false));
    const base = render(w, h, onTarget, "leg", cx);
    targets.set(shape, writeLegV3(join("target", `legs-${shape}.png`), base));
    const biased = split(legPartsV3(shape, true));
    plates.set(shape, writeLegV3(join("plate", `legs-${shape}.png`), render(w, h, biased, "leg", cx)));
  }

  // the strip: the live shipped boot, then every ruler, target over plate, at
  // one scale under one light, so a person can read the five silhouettes side
  // by side the way the shop shelf shows them.
  {
    const K = 0.85, GUT = 14, HEAD_H = 28, LABEL_W = 150;
    const cw = Math.ceil(w * K), ch = Math.ceil(h * K);
    const cols = LEG_SHAPES_V3.length + 1;
    const W = LABEL_W + (cw + GUT) * cols;
    const rows = [
      { label: "v3 target", colour: "#8fd6b4", get: (s) => targets.get(s) },
      { label: "v3 plate", colour: "#f0a58f", get: (s) => plates.get(s) },
    ];
    const live = (() => {
      const p = join(ROOT, "parts", "leg", "t2-1.png");
      return existsSync(p) ? readFileSync(p) : null;
    })();
    const text = (x, y, s, size = 14, fill = "#e8e9ee") =>
      `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="${fill}">${s}</text>`;
    let body = `<rect x="0" y="0" width="${W}" height="${HEAD_H}" fill="#1b1c20"/>`;
    body += text(12, 19, `leg shapes v3  (${w}x${h} at ${K}x)  hip ${RIG.leg.hip.join(",")}  foot ${RIG.leg.foot.join(",")}`, 15, "#ffffff");
    let x = LABEL_W;
    for (const name of ["LIVE boot t2-1"].concat(LEG_SHAPES_V3)) {
      body += text(x + 4, 19, name, 13, "#9aa0ad");
      x += cw + GUT;
    }
    let y = HEAD_H;
    for (const row of rows) {
      body += text(12, y + ch / 2 + 5, row.label, 14, row.colour);
      x = LABEL_W;
      for (const name of [null].concat(LEG_SHAPES_V3)) {
        const png = name === null ? (row === rows[0] ? live : null) : row.get(name);
        body += `<rect x="${x}" y="${y + 6}" width="${cw}" height="${ch}" fill="#3a3b42"/>`;
        if (png) body += `<image x="${x}" y="${y + 6}" width="${cw}" height="${ch}" href="data:image/png;base64,${png.toString("base64")}"/>`;
        x += cw + GUT;
      }
      y += ch + 12;
    }
    const strip = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="${W}" height="${y}" fill="#26272c"/>${body}</svg>`;
    writeFileSync(join(V3_ROOT, "_shapes-leg.png"),
      new Resvg(strip, { font: { loadSystemFonts: true, defaultFontFamily: "Arial" } }).render().asPng());
  }

  writeFileSync(join(V3_ROOT, "manifest-leg.json"), JSON.stringify({
    mode: "v3",
    slot: "leg",
    shapes: LEG_SHAPES_V3,
    note: "The leg shape table drawn. target/ is ON TARGET (condition a ControlNet on this: it does not "
        + "carry the unconditioned generator's bias); plate/ is PRE-COMPENSATED with the bake's PRE table, "
        + "for the img2img lane. Neither is shipped and the game never reads this folder. Every shape hangs "
        + "on the frozen pivots in src/app/bots/_view/rig-points.ts: the hip cap is the same circle on every "
        + "one, so BURIAL reads 0.50 for all five, and every shape's floor and foot box are the stance "
        + "solve's own, so the foot pivot lands on ink and the assembled stance does not move.",
    coral: "ONE block at the bottom on every shape, the widest thing on every row it covers, nothing above "
         + "it coral: the tyre on wheels, the pad on springs, the sole on sneakers, the round pad on pegs. "
         + "rank-part.py's sole band is the run of bottom rows whose coral covers half the row's ink, and "
         + "CORAL SPILL is what sits outside it, so a ring, a rim or a drip is the defect and a block is not.",
    coralStep: "WAVE TWO. Every shape now stands its body ON its block instead of flush with it. "
             + "Measured over wave one's 96 renders, the median CORAL SPILL tracks one number and "
             + "nothing else: the body's width over the block's width at the line where they meet "
             + "(pegs 0.22 spilled 0.015, springs 0.72 spilled 0.047, wheels 1.00 spilled 0.075, "
             + "sneakers 1.00 spilled 0.122). A line the alpha, lineart and depth maps all carry is "
             + "an edge the render stops at; a line only the label image carries is a panel line it "
             + "paints across. The block is still ONE block with a straight top edge and still the "
             + "widest thing on every row it covers, so no judge rule moved.",
    coralHeightOverFootHeight: CORAL_H_V3,
    wheelRadiusOverFootHeight: WHEEL_R_V3,
    wheelHubOverWheelRadius: WHEEL_HUB_V3,
    wheelTyreWidthOverBootBox: WHEEL_TYRE_W_V3,
    springTurnWidthOverBootBox: SPRING_W_V3,
    shoeInsetOverSoleWidth: SHOE_INSET_V3,
    canvas: { w: RIG.leg.w, h: RIG.leg.h },
    pivots: { hip: RIG.leg.hip, foot: RIG.leg.foot },
    pre: PRE,
    files: legFiles,
  }, null, 1) + "\n");
}

// ── V3 RULERS: THE BODY AND THE ARMS (lane T, 2026-09-05) ─────────────────
// --out v3, torso and arm only. Lane A's head shapes and lane B's leg shapes
// carry their own guarded blocks above; this one shares no symbol with either
// beyond V3, V3_ROOT and the drawing helpers every part in the file uses.
//
// WHY. The look-alike gate reads the factory rulers and says, of the torso:
// eight files, ONE shape, all 28 pairs at 1.000. Not "close": the SAME
// outline, eight times. Tier and design only ever changed what was drawn ON
// the barrel (a panel, rivets, a lens), never the barrel itself. The arm is
// two shapes across eight files, a mitt and a claw, and its typical pair
// overlaps 0.830. Two earlier runs proved the rule that governs the fix:
// PROMPT CHANGES CANNOT BEAT WHAT THE RULER DRAWS. So the body buys its
// variation the only way it can be bought, by AUTHORING RULERS.
//
// WHAT IS FROZEN AND STAYS FROZEN, so no judge rule has to move for any of
// the eight shapes below:
//
//   THE PIVOTS. Every torso carries clay under the neck, both hips and the
//   decal anchor; every arm's cap is a circle centred exactly on the shoulder
//   pivot, so BURIAL reads 0.50 on all four by construction, and every arm
//   carries ink under the hand pivot.
//   THE SKIRT. Every torso's ink starts at the neck row less FIGURE.skirt, so
//   the head's own overlap covers it and no pairing can open a gap.
//   THE WIND-UP KEY, AND IT IS THE TIGHTEST CONSTRAINT HERE. The key is a
//   FIXED accent, not a family trait: scripts/bots-import-parts.py draw_key
//   puts it on every cut torso from the CONTRACT's own bodyW and bodyH, at
//   (neck + 0.24 bodyW, neck + 0.42 bodyH), whatever shape the torso is. So
//   the key does not move with the shape and cannot: a shape that put it
//   somewhere else would ship a ruler and an importer that disagree, and the
//   key would hang off the silhouette. Every torso here draws it at that one
//   anchor with the tier-one radius, the same numbers the importer uses, and
//   every torso is CHECKED below to carry clay under the whole key box.
//   THE BANDS. bodyW, bodyH and bodyWOverH on a torso, armW, armL and
//   armLOverW on an arm, asserted against FIG at bake time on the INK box.
//   The stroke straddles the geometry and adds about a pixel a side, which is
//   what puts the live v2 arm rulers at armL 0.268 against a 0.263 ceiling. A
//   shape that misses a band throws here rather than reaching the judge and
//   asking for the band to be moved.
//
// WHAT CHANGES, and it is the whole design: THE OUTLINE. Not a panel line,
// not a rivet count, not a lens. A body that differs from another body only
// by what is drawn on its front is the same body, and the gate measures
// silhouettes at ring size for exactly that reason.
//
//   barrel    the live shape: straight sides, big round corners, the shortest
//             of the four. Delegated to torsoPartsV2 so the table carries
//             today's outline as its own comparison ruler.
//   toolbox   a wide flat LID over a much narrower case, squared corners: the
//             only shape in the table that steps IN as it goes down, and the
//             lid seam is a real outline step and not a groove.
//   teapot    an egg: narrow at the shoulders, swelling to a low belly, then
//             tucked to a flat base, with a small SPOUT STUB off the left.
//             The only shape with no straight side anywhere.
//   engine    a squared casting at the full band width and most of the band
//             height, corner radius 14: the biggest, flattest-sided thing in
//             the table and the only one whose width never changes.
//
//   mitts     the live arm's family, tube, elbow ball, wrist cuff and a round
//             mitt with a thumb, redrawn to sit INSIDE the armL band.
//   claws     no ball and no cuff: one smooth taper to a wide flat palm and
//             two thick fingers that spread and curl.
//   pincers   the thin one: a slim shaft, a small collar and two straight
//             prongs on a narrow stem, with far less ink than any other arm.
//   tube      a chunky BELLOWS of alternating rings, no elbow, no wrist and
//             no hand at all, ending in a plain rounded stub.
//
// WHY THE LIVE ARM IS NOT IN THE TABLE. The v2 arm rulers measure armL 0.268
// (design 1) and 0.334 (design 2) against a band that stops at 0.263, so
// carrying either as a comparison ruler would put an out-of-band shape in a
// table whose whole claim is that no rule moves for it. The live arm goes on
// the contact sheet as its own column instead, which is where a comparison
// belongs.
const TORSO_SHAPES_V3 = ["barrel", "toolbox", "teapot", "engine"];
const ARM_SHAPES_V3 = ["mitts", "claws", "pincers", "tube"];

/** a polygon from a point list, with its bbox. Lane T's own three lines: two
 *  other lanes are editing this file at the same time and a shared private
 *  helper is a shared edge. */
const polyT = (pts) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs), by = Math.min(...ys);
  return { k: "poly", pts, bbox: [bx, by, Math.max(...xs) - bx, Math.max(...ys) - by] };
};

/**
 * THE KEY, at the CONTRACT anchor, identical on all four torsos. These are
 * bots-import-parts.py draw_key's numbers at tier one, which are also
 * torsoPartsV2's numbers at tier one: one anchor, three readers.
 */
const KEY_V3 = (() => {
  const [nx, ny] = RIG.torso.neck;
  const bw = tgt("bodyW"), bh = tgt("bodyH");
  const kr = bw * 0.052;                       // tier one: tk = 0
  const kx = nx + bw * 0.24, ky = ny + bh * 0.42;
  const seatY = ky + kr * 1.75;
  return {
    kx, ky, kr, seatY,
    // the box the key's own ink fills, its seat included: every torso must
    // carry clay under all of it
    x0: kx - kr * 1.57, x1: kx + kr * 1.57,
    y0: ky - kr * 1.27, y1: seatY + kr * 0.85,
  };
})();

function torsoKeyV3() {
  const { kx, ky, kr, seatY } = KEY_V3;
  return [
    el("clay", circ(kx, seatY, kr * 0.85)),
    el("grille", circ(kx, seatY, kr * 0.58)),
    el("brass", rr(kx - kr * 0.28, ky - kr * 0.2, kr * 0.56, kr * 2.0, kr * 0.28)),
    el("brass", circ(kx - kr * 0.85, ky - kr * 0.55, kr * 0.72)),
    el("brass", circ(kx + kr * 0.85, ky - kr * 0.55, kr * 0.72)),
  ];
}

/**
 * THE TORSO OUTLINES. Every number is a canvas coordinate on the contract's
 * own 288x264 torso canvas, because a torso is one drawing on one canvas and
 * a fraction of a fraction is how a shape stops being reproducible. The
 * barrel is not in this table: it is torsoPartsV2 at tier one, design one.
 */
const TORSO_TOP_V3 = RIG.torso.neck[1] - SKIRT;
const TORSO_V3 = {
  // the lid wide and shallow, the case narrow and SHORT: the step IS the
  // shape, and the case stops well above the engine's floor so the toolbox is
  // not simply the engine with a bite out of it (measured: as a subset it
  // overlapped the engine 0.773, and the two read as one squared family).
  toolbox: { lid: [20, TORSO_TOP_V3, 248, 90, 8], case: [64, 82, 160, 158, 12] },
  // one casting at the band's own ceiling on both axes, corner radius 14:
  // squared, not sharp. It is the biggest thing in the table on purpose,
  // because every other pair's distance from it is area over area.
  engine: { block: [13, TORSO_TOP_V3, 262, 240, 14] },
  // an egg. hw(y) swells from topHw to maxHw as a sine raised to `swell`,
  // then tucks in to botHw as a power curve, and the base closes flat. The
  // shoulders are the narrowest in the table and the belly the lowest, which
  // is the whole of its distance from the barrel's straight sides.
  teapot: { botY: 240, topHw: 46, maxHw: 108, maxY: 196, botHw: 84, swell: 0.85, tuck: 1.6 },
};

/** the teapot's half-width at a row: the profile the belly is sampled from
 *  AND the profile the key-box check is asked of, so the check cannot drift
 *  from the drawing it is checking. */
function teapotHwV3(y) {
  const T = TORSO_V3.teapot;
  if (y <= TORSO_TOP_V3) return T.topHw;
  if (y >= T.botY) return T.botHw;
  if (y <= T.maxY) {
    const k = (y - TORSO_TOP_V3) / (T.maxY - TORSO_TOP_V3);
    return T.topHw + (T.maxHw - T.topHw) * Math.pow(Math.sin((Math.PI / 2) * k), T.swell);
  }
  const k = (y - T.maxY) / (T.botY - T.maxY);
  return T.maxHw - (T.maxHw - T.botHw) * Math.pow(k, T.tuck);
}

/** the belly as ONE polygon: down the right side, flat across the base with a
 *  small round at each corner, back up the left. One shape means one outline
 *  stroke, so the lineart map carries an egg and never a seam across it. */
function teapotBellyV3(n = 96) {
  const T = TORSO_V3.teapot;
  const cx = RIG.torso.neck[0];
  const r = 16;
  const right = [], left = [];
  for (let i = 0; i <= n; i++) {
    const y = TORSO_TOP_V3 + (T.botY - r - TORSO_TOP_V3) * (i / n);
    const hw = teapotHwV3(y);
    right.push([cx + hw, y]);
    left.push([cx - hw, y]);
  }
  const hwB = teapotHwV3(T.botY - r);
  for (let i = 1; i <= 10; i++) {
    const a = (Math.PI / 2) * (i / 10);
    right.push([cx + hwB - r + r * Math.cos(a), T.botY - r + r * Math.sin(a)]);
    left.push([cx - hwB + r - r * Math.cos(a), T.botY - r + r * Math.sin(a)]);
  }
  return polyT(right.concat(left.reverse()));
}

function torsoPartsV3(shape) {
  if (shape === "barrel") return torsoPartsV2(1, 1);
  const [nx] = RIG.torso.neck;
  const out = [];

  if (shape === "toolbox") {
    const [lx, ly, lw, lh, lr] = TORSO_V3.toolbox.lid;
    const [cx0, cy0, cw, ch, cr] = TORSO_V3.toolbox.case;
    out.push(el("clay", rr(cx0, cy0, cw, ch, cr)));
    out.push(el("clay", rr(lx, ly, lw, lh, lr)));
    // the panel on the case, a groove drawn as two nested outlines the way the
    // v2 torso draws its own, sitting under the decal anchor's room
    const px = cx0 + cw * 0.13, py = cy0 + ch * 0.50, pw = cw * 0.74, ph = ch * 0.34;
    out.push(el("clay", rr(px, py, pw, ph, 10)));
    out.push(el("clay", rr(px + 6, py + 6, pw - 12, ph - 12, 7)));
    // two latch nubs on the case's shoulders, clay like the v2 rivets
    for (const s of [-1, 1]) out.push(el("clay", rr(nx + s * (cw / 2 - 24) - 13, cy0 + 18, 26, 13, 4)));
  } else if (shape === "engine") {
    const [bx, by, bwid, bhgt, br] = TORSO_V3.engine.block;
    out.push(el("clay", rr(bx, by, bwid, bhgt, br)));
    // the cam cover, a shallow raised panel across the chest, then three ribs
    // down the block: all clay, all inside the silhouette
    out.push(el("clay", rr(bx + 18, by + 74, bwid - 36, 40, 8)));
    for (let i = 0; i < 3; i++) {
      out.push(el("clay", rr(bx + 26, by + 134 + i * 30, bwid - 52, 15, 6)));
    }
  } else if (shape === "teapot") {
    out.push(el("clay", teapotBellyV3()));
    // the spout stub, off the left and pointing up and out: its own form, so
    // its own outline, which is what makes it read as a spout and not a bulge
    out.push(el("clay", bar(50, 190, 26, 158, 30)));
    out.push(el("clay", circ(26, 158, 14)));
    // one band round the belly, a groove in the same two-outline style
    const T = TORSO_V3.teapot;
    // ONE narrow seam, and narrow is the point: the first cut ran a groove
    // 1.56 half-widths across the belly and it read, under the key, as a
    // mouth under an eye. The torso's own negative carries `face` for exactly
    // that failure, so the seam is kept to under half the belly.
    const hwB = teapotHwV3(T.maxY - 34);
    out.push(el("clay", rr(nx - hwB * 0.42, T.maxY - 46, hwB * 0.84, 16, 7)));
    out.push(el("clay", rr(nx - hwB * 0.42 + 5, T.maxY - 41, hwB * 0.84 - 10, 6, 3)));
  } else {
    throw new Error(`bots-bake-parts --out v3: unknown torso shape ${shape}`);
  }

  out.push(...torsoKeyV3());
  return out;
}

/**
 * THE ARM OUTLINES. Everything scales off the arm's own width and length, so
 * the pre-compensated plate follows the target without a second table, and
 * every half-extent is CLAMPED to what the canvas can hold once the margin is
 * paid for: the plate arm is 19 percent wider and an unclamped claw would put
 * a finger tip off the edge.
 */
function armPartsV3(shape, plate) {
  const [sx, sy] = RIG.arm.shoulder;
  const aw = dim("armW", plate);
  const al = dim("armL", plate);
  const halfMax = ARM_W / 2 - MARGIN - 2;
  const H2 = (v) => Math.min(v, halfMax);
  const out = [];

  if (shape === "mitts") {
    const capR = aw * 0.50;
    const top = sy - capR;
    const elbowY = sy + al * 0.44;
    const upW = aw * 0.84;
    const foreW = aw * 0.80;
    const wristY = sy + al * 0.80;
    const cap = circ(sx, sy, capR);
    const upper = rr(sx - upW / 2, sy, upW, elbowY - sy, upW * 0.18);
    out.push(el("clay", cap));
    out.push(el("clay", upper));
    out.push(...occlusionV2(sx, top, aw, al, [cap, upper]));
    out.push(el("clay", rr(sx - foreW / 2, elbowY, foreW, wristY - elbowY + aw * 0.12, foreW * 0.18)));
    // the elbow ball is the shaft's own swell, not a bearing dropped on it.
    // The first cut slimmed the shaft to 0.72 and left the cap, the ball and
    // the fist all near 80 px wide, and the render came back as three stacked
    // circles: the snowman the v2 leg's own note warns about. A limb reads as
    // a limb when the shaft is most of the cap's width and the HAND is the
    // widest thing on it, which is what these three numbers say.
    const er = H2(aw * 0.50);
    const bandHw = H2(er * 1.03);
    out.push(el("clay", circ(sx, elbowY, er)));
    out.push(el("clay", rr(sx - bandHw, elbowY - aw * 0.07, bandHw * 2, aw * 0.14, aw * 0.05)));
    const cuffHw = H2(aw * 0.49);
    out.push(el("clay", rr(sx - cuffHw, wristY - aw * 0.08, cuffHw * 2, aw * 0.19, aw * 0.06)));
    // the mitt: a fist with a thumb inboard and a knuckle ridge. Its centre is
    // pulled UP the shaft against the v2 arm's, which is what brings armL back
    // inside the band the v2 ruler misses at 0.268 and makes this the SHORTEST
    // arm in the table against the claw's reach.
    const mr = H2(aw * 0.52);
    const cy = sy + al * 0.82;
    out.push(el("clay", circ(sx, cy, mr)));
    out.push(el("clay", circ(sx - mr * 0.70, cy - mr * 0.35, mr * 0.34)));
    out.push(el("clay", rr(sx - mr * 0.52, cy - mr * 0.08, mr * 1.04, mr * 0.30, mr * 0.15)));
    return out;
  }

  if (shape === "claws") {
    // ONE SMOOTH TAPER, no elbow ball and no cuff: the mitt arm's character is
    // its stack of mouldings, so the claw's is the absence of them.
    // A STRAIGHT LIMB AND A GRIPPER, and both halves of that were learned on
    // the contact sheet. The first cut tapered the arm from 0.84 to 0.56 and
    // it read as a light bulb on a stalk; the second gave the hand a wide
    // flat palm bar with two feet under it and it read as a trolley. So the
    // arm is a plain tube, the palm is a round BOSS the pivot sits inside,
    // and the fingers spread and then CLOSE: two fingers that only spread
    // are a trolley, two that come back toward each other are a claw.
    const capR = aw * 0.36;
    const top = sy - capR;
    const tubeW = aw * 0.72;
    const wristY = sy + al * 0.74;
    const cap = circ(sx, sy, capR);
    const tube = rr(sx - tubeW / 2, sy, tubeW, wristY - sy, tubeW * 0.18);
    out.push(el("clay", cap));
    out.push(el("clay", tube));
    out.push(...occlusionV2(sx, top, aw, al, [cap, tube]));
    const collarHw = H2(aw * 0.42);
    out.push(el("clay", rr(sx - collarHw, wristY - aw * 0.06, collarHw * 2, aw * 0.15, aw * 0.05)));
    // the palm boss: the hand pivot sits INSIDE it, so the fingers can open
    // below the pivot row without ever putting it in air
    const bossR = H2(aw * 0.34);
    const bossY = sy + al * 0.92;
    out.push(el("clay", circ(sx, bossY, bossR)));
    const fw = aw * 0.21;
    for (const s of [-1, 1]) {
      const x0 = sx + s * aw * 0.20, y0 = sy + al * 0.86;
      const x1 = sx + s * (H2(aw * 0.48 + fw / 2) - fw / 2), y1 = sy + al * 1.00;
      const x2 = sx + s * (H2(aw * 0.26 + fw / 2) - fw / 2), y2 = sy + al * 1.10;
      out.push(el("clay", bar(x0, y0, x1, y1, fw)));
      out.push(el("clay", bar(x1, y1, x2, y2, fw * 0.90)));
      out.push(el("clay", circ(x1, y1, fw * 0.50)));
      out.push(el("clay", circ(x2, y2, fw * 0.42)));
    }
    return out;
  }

  if (shape === "pincers") {
    // THE THIN ONE, and its point is how little ink it has: a slim shaft, a
    // small collar and a narrow stem, so it reads at ring size as a stick with
    // a fork on the end and never as a limb with a hand.
    // the cap is half the SHAFT's own width, which is the join law read
    // literally: on a thin limb a cap sized off the contract's armW is a
    // lollipop, and the first cut drew exactly that.
    const capR = aw * 0.26;
    const top = sy - capR;
    const shaftW = aw * 0.52;
    const elbowY = sy + al * 0.40;
    const foreW = aw * 0.42;
    const wristY = sy + al * 0.72;
    const cap = circ(sx, sy, capR);
    const shaft = rr(sx - shaftW / 2, sy, shaftW, elbowY - sy, shaftW * 0.20);
    out.push(el("clay", cap));
    out.push(el("clay", shaft));
    out.push(...occlusionV2(sx, top, aw, al, [cap, shaft]));
    out.push(el("clay", rr(sx - foreW / 2, elbowY, foreW, wristY - elbowY, foreW * 0.20)));
    const bandHw = H2(aw * 0.34), collarHw = H2(aw * 0.31);
    // armW's own floor is 0.129 H, which is 72 pixels of ink: SOMETHING on a
    // thin arm has to be that wide or the part is out of band. It is the open
    // fork, not the shoulder cap, because a 72 px cap on a 44 px shaft is the
    // lollipop this shape was redrawn to stop being.
    out.push(el("clay", rr(sx - bandHw, elbowY - aw * 0.06, bandHw * 2, aw * 0.13, aw * 0.05)));
    out.push(el("clay", rr(sx - collarHw, wristY - aw * 0.07, collarHw * 2, aw * 0.16, aw * 0.06)));
    // the stem carries the centre line PAST the hand pivot, so the fork can
    // open below it without ever putting the pivot in air
    const stemW = aw * 0.30;
    const stemBot = sy + al * 1.02;
    out.push(el("clay", rr(sx - stemW / 2, wristY, stemW, stemBot - wristY, stemW * 0.25)));
    const pw = aw * 0.15;
    for (const s of [-1, 1]) {
      const x0 = sx + s * aw * 0.15, y0 = sy + al * 0.90;
      const x1 = sx + s * (H2(aw * 0.40 + pw / 2) - pw / 2), y1 = sy + al * 1.12;
      out.push(el("clay", bar(x0, y0, x1, y1, pw)));
      out.push(el("clay", circ(x1, y1, pw * 0.48)));
    }
    return out;
  }

  if (shape === "tube") {
    // A BELLOWS, and no hand. Rings of two widths, each overlapping the next,
    // so the part is ONE blob with a scalloped edge and no enclosed hole.
    const capR = aw * 0.595;
    const top = sy - capR;
    const rings = 7;
    const ringH = al * 0.124;
    const wideHw = H2(capR), narrowHw = H2(capR * 0.86);
    const cap = circ(sx, sy, capR);
    const spine = rr(sx - narrowHw, sy, narrowHw * 2, rings * ringH, narrowHw * 0.20);
    out.push(el("clay", cap));
    out.push(el("clay", spine));
    out.push(...occlusionV2(sx, top, aw, al, [cap, spine]));
    for (let i = 0; i < rings; i++) {
      const hw = i % 2 === 0 ? wideHw : narrowHw;
      out.push(el("clay", rr(sx - hw, sy + i * ringH, hw * 2, ringH * 1.28, ringH * 0.42)));
    }
    // the stub: a plain rounded end, no fingers and no cuff. It STOPS early,
    // which with the ring width makes the bellows the widest and shortest arm
    // in the table against the mitt's narrow shaft.
    const stubHw = H2(capR * 0.92);
    const stubTop = sy + al * 0.78;
    const stubBot = sy + al * 1.02;
    out.push(el("clay", rr(sx - stubHw, stubTop, stubHw * 2, stubBot - stubTop, stubHw * 0.84)));
    return out;
  }

  throw new Error(`bots-bake-parts --out v3: unknown arm shape ${shape}`);
}

// ── the v3 ruler tree: THE BODY AND THE ARMS (lane T, 2026-09-05) ────────
// --out v3, torso and arm only. Lane A's head block and lane B's leg block
// are guarded the same way above and this one touches neither. Writes nothing
// under parts/, nothing under _raw/parts/placeholders/ or placeholders-v2/,
// and does not touch rig-points.ts: the canvases and pivots are the frozen
// contract.
//
//   _raw/parts/placeholders-v3/target/torso-<shape>.png   ON TARGET
//   _raw/parts/placeholders-v3/target/arms-<shape>.png    ON TARGET
//   _raw/parts/placeholders-v3/plate/arms-<shape>.png     PRE-COMPENSATED
//   _raw/parts/placeholders-v3/manifest-torso.json
//   _raw/parts/placeholders-v3/manifest-arm.json
//   _raw/parts/placeholders-v3/_shapes-body.png
//
// The torso writes ONE flavour because PRE_SLOTS is arms and legs: the torso
// carries no measured generator bias, so a plate would be a second name for
// the same bytes and a second name for one drawing is how a ruler goes stale.
//
// EVERY RULER IS CHECKED ON ITS OWN RENDERED PIXELS BEFORE IT IS KEPT, and
// the checks THROW. A ruler that misses a proportion band, loses a pivot,
// leaves the key hanging off the silhouette, breaks into two blobs or runs
// out of margin is a ruler that would ask the judge to move a rule, and this
// lane's whole claim is that no rule moves. Checking the RENDER and not the
// geometry is deliberate: the outline stroke straddles the shape and adds
// about a pixel a side, which is the difference between the live v2 arm's
// intended armL and the 0.268 it actually measures.
if (V3 && (!ONLY || ONLY.has("torso") || ONLY.has("arm"))) {
  /**
   * THE TABLE AND THE DRAWING, CHECKED AGAINST EACH OTHER. The words live in
   * scripts/bots-shapes.json under `bodies` and the geometry lives here, and
   * the one failure that split arrangement invites is the two drifting: a row
   * renamed in the table, a shape added to one and not the other, and a job
   * file that asks the model for a teapot while the ControlNet holds a
   * barrel. So the ids must match EXACTLY, in order, and a mismatch throws.
   */
  const bodyTable = (() => {
    const t = JSON.parse(readFileSync(SHAPES_JSON, "utf8"));
    if (!t.bodies?.torso?.shapes || !t.bodies?.arm?.shapes) {
      console.error("bots-bake-parts --out v3: scripts/bots-shapes.json carries no bodies.torso.shapes "
                    + "and bodies.arm.shapes. The torso and arm rulers are drawn from that table's rows.");
      process.exit(2);
    }
    for (const [slot, want] of [["torso", TORSO_SHAPES_V3], ["arm", ARM_SHAPES_V3]]) {
      const got = t.bodies[slot].shapes.map((r) => r.shape);
      if (got.join(",") !== want.join(",")) {
        console.error(`bots-bake-parts --out v3: bots-shapes.json bodies.${slot} lists [${got}], this bake `
                      + `draws [${want}]. The table and the drawing have drifted.`);
        process.exit(2);
      }
    }
    return t.bodies;
  })();
  const rowOf = (slot, shape) => bodyTable[slot].shapes.find((r) => r.shape === shape);
  const bodyFiles = [];
  const writeBodyV3 = (rel, svgText) => {
    const p = join(V3_ROOT, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    const img = new Resvg(svgText, RESVG_OPTS).render();
    const png = img.asPng();
    writeFileSync(p, png);
    writeFileSync(p.replace(/\.png$/, ".svg"), svgText);
    files += 1;
    bytes += png.length;
    bodyFiles.push(rel.replace(/\\/g, "/"));
    return { png, img };
  };

  /** the rendered part's ink, as the gates read it: any alpha at all. */
  const inkOf = (img) => {
    const { width: w, height: h, pixels } = img;
    const on = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) on[i] = pixels[i * 4 + 3] > 0 ? 1 : 0;
    return { w, h, on };
  };
  const boxOf = (m) => {
    let x0 = m.w, x1 = -1, y0 = m.h, y1 = -1;
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!m.on[y * m.w + x]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  /** how many separate blobs the part is. SEE THROUGH and a floating ear are
   *  the same defect and this is the measure that catches both. */
  const blobsOf = (m) => {
    const seen = new Uint8Array(m.w * m.h);
    let n = 0;
    const stack = [];
    for (let s = 0; s < m.w * m.h; s++) {
      if (!m.on[s] || seen[s]) continue;
      n += 1;
      stack.push(s);
      seen[s] = 1;
      while (stack.length) {
        const i = stack.pop();
        const x = i % m.w, y = (i - x) / m.w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
          const j = ny * m.w + nx;
          if (m.on[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
    }
    return n;
  };
  const bandCheck = (what, key, got, fails) => {
    const [lo, , hi] = FIG[key];
    if (got < lo || got > hi) {
      fails.push(`${what}: ${key} = ${got.toFixed(4)}, outside the contract band ${lo}..${hi}`);
    }
    return Number(got.toFixed(4));
  };

  const torsoStats = [], armStats = [];

  // ── the torsos ───────────────────────────────────────────────────────
  const torsoPngs = new Map();
  if (!ONLY || ONLY.has("torso")) {
    const { w, h } = RIG.torso;
    const cx = SPEC_CX.torso();
    const [nx, ny] = RIG.torso.neck;
    for (const shape of TORSO_SHAPES_V3) {
      const parts = torsoPartsV3(shape);
      const els = split(parts);
      const { png, img } = writeBodyV3(join("target", `torso-${shape}.png`), render(w, h, els, "torso", cx));
      torsoPngs.set(shape, png);
      const m = inkOf(img);
      const b = boxOf(m);
      const fails = [];

      // the BODY on its own, so the key is checked against what carries it
      // and never against itself. The rule, not a count of elements: the key
      // is the brass, the socket in its seat and the seat disc under it.
      const isKeyEl = (e) =>
        e.mat === "brass" || e.mat === "grille" ||
        (e.shape.k === "circle" &&
         Math.hypot(e.shape.cx - KEY_V3.kx, e.shape.cy - KEY_V3.seatY) < 1.0);
      const bodyImg = new Resvg(render(w, h, split(parts.filter((e) => !isKeyEl(e))), "torso", cx),
                                RESVG_OPTS).render();
      const bm = inkOf(bodyImg);
      let keyGap = 0;
      for (let y = Math.floor(KEY_V3.y0); y <= Math.ceil(KEY_V3.y1); y++) {
        for (let x = Math.floor(KEY_V3.x0); x <= Math.ceil(KEY_V3.x1); x++) {
          if (!bm.on[y * bm.w + x]) keyGap += 1;
        }
      }
      if (keyGap) {
        fails.push(`torso ${shape}: the wind-up key's box has ${keyGap} pixels with no clay under them. ` +
                   `The importer draws the key at the contract anchor whatever shape the torso is, so a ` +
                   `torso that does not reach it ships a key hanging off the silhouette.`);
      }

      const ratios = {
        bodyW: bandCheck(`torso ${shape}`, "bodyW", b.w / H, fails),
        bodyH: bandCheck(`torso ${shape}`, "bodyH", (b.y1 - (b.y0 + SKIRT)) / H, fails),
      };
      ratios.bodyWOverH = bandCheck(`torso ${shape}`, "bodyWOverH", ratios.bodyW / ratios.bodyH, fails);
      const pivots = {};
      for (const [name, pt] of Object.entries(RIG.torso)) {
        if (!Array.isArray(pt)) continue;
        const [px, py] = pt;
        if (px < 0 || py < 0 || px >= w || py >= h) { pivots[name] = "offCanvas"; continue; }
        const on = !!m.on[py * m.w + px];
        pivots[name] = on ? "ink" : "AIR";
        if (!on) fails.push(`torso ${shape}: rig point ${name} (${px},${py}) has no ink under it`);
      }
      const margin = Math.min(b.x0, w - 1 - b.x1, b.y0, h - 1 - b.y1);
      if (margin < MARGIN - 2) {
        fails.push(`torso ${shape}: ink comes within ${margin}px of a canvas edge, the contract asks ${MARGIN}`);
      }
      const blobs = blobsOf(m);
      if (blobs !== 1) fails.push(`torso ${shape}: the part is ${blobs} separate blobs, not one`);
      if (fails.length) {
        for (const f of fails) console.error(`bots-bake-parts --out v3: ${f}`);
        process.exit(2);
      }
      const row = rowOf("torso", shape);
      torsoStats.push({ shape, name: row.name, prompt: row.prompt, notes: row.notes, live: !!row.live,
                        box: [b.x0, b.y0, b.x1, b.y1], ratios, pivots, margin, blobs,
                        keyBox: [Math.round(KEY_V3.x0), Math.round(KEY_V3.y0),
                                 Math.round(KEY_V3.x1), Math.round(KEY_V3.y1)] });
      console.log(`  torso ${shape.padEnd(8)} box ${b.x0},${b.y0}..${b.x1},${b.y1}  ` +
                  `bodyW ${ratios.bodyW}  bodyH ${ratios.bodyH}  w/h ${ratios.bodyWOverH}  margin ${margin}`);
    }
    writeFileSync(join(V3_ROOT, "manifest-torso.json"), JSON.stringify({
      mode: "v3",
      slot: "torso",
      shapes: TORSO_SHAPES_V3,
      note: "The TORSO shape table drawn. ON TARGET only: PRE_SLOTS is arms and legs, so the torso carries "
          + "no measured generator bias and a plate would be a second name for the same bytes. Nothing here "
          + "is shipped and the game never reads this folder. Every shape hangs on the frozen pivots in "
          + "src/app/bots/_view/rig-points.ts, starts its ink at the neck row less FIGURE.skirt so the head's "
          + "own overlap covers it, and carries clay under the neck, both hips and the decal anchor.",
      key: "THE ONE BRASS PIECE, at the CONTRACT anchor on all four, because scripts/bots-import-parts.py "
         + "draw_key puts it there on every cut torso from the contract's own bodyW and bodyH whatever shape "
         + "the torso is. Each ruler is checked on its rendered pixels to carry clay under the whole key box; "
         + "a shape that did not reach it would ship a ruler and an importer that disagree.",
      keyAnchor: { x: Number(KEY_V3.kx.toFixed(2)), y: Number(KEY_V3.ky.toFixed(2)),
                   r: Number(KEY_V3.kr.toFixed(2)) },
      canvas: { w: RIG.torso.w, h: RIG.torso.h },
      pivots: { neck: RIG.torso.neck, hipL: RIG.torso.hipL, hipR: RIG.torso.hipR, decal: RIG.torso.decal },
      geometry: TORSO_V3,
      formPhrase: bodyTable.torso.formPhrase,
      shapeRows: torsoStats,
      files: bodyFiles.filter((f) => f.includes("torso-")),
    }, null, 1) + "\n");
  }

  // ── the arms ─────────────────────────────────────────────────────────
  const armPngs = new Map(), armPlatePngs = new Map();
  if (!ONLY || ONLY.has("arm")) {
    const { w, h } = RIG.arm;
    const cx = SPEC_CX.arm();
    const [shx, shy] = RIG.arm.shoulder;
    for (const shape of ARM_SHAPES_V3) {
      const els = split(armPartsV3(shape, false));
      const { png, img } = writeBodyV3(join("target", `arms-${shape}.png`), render(w, h, els, "arm", cx));
      armPngs.set(shape, png);
      const biased = split(armPartsV3(shape, true));
      armPlatePngs.set(shape,
        writeBodyV3(join("plate", `arms-${shape}.png`), render(w, h, biased, "arm", cx)).png);

      const m = inkOf(img);
      const b = boxOf(m);
      const fails = [];
      const ratios = {
        armW: bandCheck(`arm ${shape}`, "armW", b.w / H, fails),
        armL: bandCheck(`arm ${shape}`, "armL", (b.y1 - shy) / H, fails),
      };
      ratios.armLOverW = bandCheck(`arm ${shape}`, "armLOverW", ratios.armL / ratios.armW, fails);
      // BURIAL, the join law's own number, measured the way rank-part.py
      // measures it: the pivot's depth below the ink top over the ink's own
      // width at the pivot row. Every shape's cap is a circle centred on the
      // pivot, so this reads 0.50 by construction and the check proves it.
      let run = 0;
      for (let x = 0; x < m.w; x++) if (m.on[shy * m.w + x]) run += 1;
      const burial = run ? (shy - b.y0) / run : 0;
      if (burial < JOIN.burialMin || burial > JOIN.burialMax) {
        fails.push(`arm ${shape}: burial ${burial.toFixed(3)} of the limb's own width (${run}px), ` +
                   `the join law says ${JOIN.burialMin} to ${JOIN.burialMax}`);
      }
      const pivots = {};
      for (const [name, pt] of Object.entries(RIG.arm)) {
        if (!Array.isArray(pt)) continue;
        const [px, py] = pt;
        const on = !!m.on[py * m.w + px];
        pivots[name] = on ? "ink" : "AIR";
        if (!on) fails.push(`arm ${shape}: rig point ${name} (${px},${py}) has no ink under it`);
      }
      const margin = Math.min(b.x0, w - 1 - b.x1, b.y0, h - 1 - b.y1);
      if (margin < MARGIN - 2) {
        fails.push(`arm ${shape}: ink comes within ${margin}px of a canvas edge, the contract asks ${MARGIN}`);
      }
      const blobs = blobsOf(m);
      if (blobs !== 1) fails.push(`arm ${shape}: the part is ${blobs} separate blobs, not one`);
      // the PLATE has to fit the same canvas: it is 19 percent wider and its
      // clamps are what stop a finger tip leaving the sheet
      const pm = inkOf(new Resvg(render(w, h, biased, "arm", cx), RESVG_OPTS).render());
      const pb = boxOf(pm);
      const pMargin = Math.min(pb.x0, w - 1 - pb.x1, pb.y0, h - 1 - pb.y1);
      if (pMargin < 1) fails.push(`arm ${shape}: the pre-compensated plate touches a canvas edge`);
      if (fails.length) {
        for (const f of fails) console.error(`bots-bake-parts --out v3: ${f}`);
        process.exit(2);
      }
      const row = rowOf("arm", shape);
      armStats.push({ shape, name: row.name, prompt: row.prompt, notes: row.notes,
                      box: [b.x0, b.y0, b.x1, b.y1], ratios, pivots, margin, plateMargin: pMargin,
                      burial: Number(burial.toFixed(3)), pivotRow: run, blobs });
      console.log(`  arm   ${shape.padEnd(8)} box ${b.x0},${b.y0}..${b.x1},${b.y1}  ` +
                  `armW ${ratios.armW}  armL ${ratios.armL}  l/w ${ratios.armLOverW}  ` +
                  `burial ${burial.toFixed(2)}  margin ${margin}/${pMargin}`);
    }
    writeFileSync(join(V3_ROOT, "manifest-arm.json"), JSON.stringify({
      mode: "v3",
      slot: "arm",
      shapes: ARM_SHAPES_V3,
      note: "The ARM shape table drawn. target/ is ON TARGET (condition a ControlNet on this: it does not "
          + "carry the unconditioned generator's bias); plate/ is PRE-COMPENSATED with the bake's PRE table "
          + "for the img2img lane. Neither is shipped and the game never reads this folder. Every shape's "
          + "cap is the same circle centred on the shoulder pivot, so BURIAL reads 0.50 on all four, and "
          + "every shape carries ink under the hand pivot: on the claw and the pincer the palm and the stem "
          + "reach past that row on purpose, so the fork can open below it without putting the pivot in air.",
      canvas: { w: RIG.arm.w, h: RIG.arm.h },
      pivots: { shoulder: RIG.arm.shoulder, hand: RIG.arm.hand },
      pre: PRE,
      formPhrase: bodyTable.arm.formPhrase,
      shapeRows: armStats,
      files: bodyFiles.filter((f) => f.includes("arms-")),
    }, null, 1) + "\n");
  }

  // ── the strip ────────────────────────────────────────────────────────
  // the live shipped part, then every ruler, at one scale under one light, so
  // a person can read the silhouettes side by side the way the shop shows
  // them. The live ARM is here and NOT in the table: it measures armL 0.268
  // against a band that stops at 0.263, so it is a comparison and not a row.
  if (torsoStats.length && armStats.length) {
    const K = 0.62, GUT = 14, HEAD_H = 30, LABEL_W = 150;
    const tw = Math.ceil(RIG.torso.w * K), th = Math.ceil(RIG.torso.h * K);
    const aw2 = Math.ceil(RIG.arm.w * K), ah = Math.ceil(RIG.arm.h * K);
    const cols = 5;
    const W = LABEL_W + (Math.max(tw, aw2) + GUT) * cols;
    const live = (rel) => {
      const p = join(ROOT, "parts", rel);
      return existsSync(p) ? readFileSync(p) : null;
    };
    const text = (x, y, s, size = 14, fill = "#e8e9ee") =>
      `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="${fill}">${s}</text>`;
    let body = `<rect x="0" y="0" width="${W}" height="${HEAD_H}" fill="#1b1c20"/>`;
    body += text(12, 20, `body shapes v3  torso ${RIG.torso.w}x${RIG.torso.h} neck ${RIG.torso.neck.join(",")}  `
                 + `arm ${RIG.arm.w}x${RIG.arm.h} shoulder ${RIG.arm.shoulder.join(",")}  (at ${K}x)`, 15, "#ffffff");
    let y = HEAD_H + 4;
    const strip = (label, colour, cw, ch, cells) => {
      body += text(12, y + ch / 2 + 5, label, 14, colour);
      let x = LABEL_W;
      for (const [name, png] of cells) {
        body += `<rect x="${x}" y="${y + 18}" width="${cw}" height="${ch}" fill="#3a3b42"/>`;
        if (png) body += `<image x="${x}" y="${y + 18}" width="${cw}" height="${ch}" href="data:image/png;base64,${png.toString("base64")}"/>`;
        body += text(x + 2, y + 13, name, 12, "#9aa0ad");
        x += cw + GUT;
      }
      y += ch + 34;
    };
    strip("v3 torso", "#8fd6b4", tw, th,
      [["LIVE torso t1-1", live("torso/t1-1.png")]].concat(
        TORSO_SHAPES_V3.map((s) => [s, torsoPngs.get(s)])));
    strip("v3 arm target", "#8fd6b4", aw2, ah,
      [["LIVE arm t1-1", live("arm/t1-1.png")]].concat(
        ARM_SHAPES_V3.map((s) => [s, armPngs.get(s)])));
    strip("v3 arm plate", "#f0a58f", aw2, ah,
      [["(no plate)", null]].concat(ARM_SHAPES_V3.map((s) => [s, armPlatePngs.get(s)])));
    const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="${W}" height="${y}" fill="#26272c"/>${body}</svg>`;
    writeFileSync(join(V3_ROOT, "_shapes-body.png"),
      new Resvg(svgText, { font: { loadSystemFonts: true, defaultFontFamily: "Arial" } }).render().asPng());
  }
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
const figLines = Object.entries(FIG)
  .map(([k, [lo, t, hi]]) => `  ${k}: { min: ${lo}, target: ${t}, max: ${hi} },`)
  .join("\n");

const ts = `/**
 * BATTLE BOTS RIG POINTS. GENERATED by scripts/bots-bake-parts.mjs; do not
 * edit by hand. Re-run the bake to change a point, because the placeholder
 * art, the rig (rig.ts) and the art gate (scripts/bots-art-check.mts) must
 * all read the same numbers. All coordinates are @2x canvas pixels.
 *
 * THE CONCEPT CONTRACT (2026-09-04). Every canvas and every pivot below is
 * derived from FIGURE, the ratios measured off art-src/bots/concept/ scenes
 * 1, 3, 4 and 5. Pivots come from the band TARGETS, because where two parts
 * meet must be identical for every family and every tier. Canvases come from
 * the band MAXIMA plus a ${MARGIN} px margin on every side, because a canvas
 * that holds the band max can hold any design the contract permits, and
 * because 25 of the 40 parts on the previous contract were clipped flat by
 * their own canvas.
 */

export type Pt = readonly [number, number];

/**
 * The figure contract: min / target / max as fractions of H, the assembled
 * height from the head dome apex to the lowest foot pixel. Measured on six
 * bots, about +/-1.3 percent of height. The art gate reads these, rather
 * than carrying its own copy, per the gates-must-import law.
 */
export const FIGURE = {
  H: ${H},
  /** head art continues this far below its seat, torso art this far above its neck */
  skirt: ${SKIRT},
  /**
   * The head's TARGET apex row inside its own canvas. The canvas carries the
   * margin plus the room a band-max head needs, so the drawn crown of an
   * on-target head starts here and not at row 0. Anything measuring the
   * figure's height has to subtract it, or it reads the empty headroom as
   * bot: rig.ts's RIG_HEIGHT measures to the head canvas's TOP, which is
   * ${HEAD_SEAT_Y - tgt("headH")} units of nothing.
   */
  headApexY: ${HEAD_SEAT_Y - tgt("headH")},
  /** the margin every canvas carries so no drawn pixel can reach an edge */
  margin: ${MARGIN},
  /**
   * THE BRASS BUDGET. Exactly one brass piece per bot and it belongs to the
   * torso: the wind-up key. Nothing else on the figure is metal. Target under
   * 4 percent of a part's visible surface; for scale, the style anchor B1
   * measures 5.3 percent and the bots shipped before this bake measured 18.9
   * to 21.5. Seven gold rings on one bot is why it read as clockwork rather
   * than as a vinyl toy.
   */
  brassBudget: 0.04,
  /**
   * Saturation floor that separates METAL from the other two warm accents.
   * All three sit inside the paintable law's brass hue band, so hue cannot
   * tell them apart, and value cannot either once the ramp has run over them.
   * Saturation can, and it is the one channel a pure multiply leaves alone:
   * brass measures 0.70, the grille 0.50 and the eye lens 0.19, so a floor at
   * 0.60 has 0.10 of clearance on both sides and holds at every depth.
   */
  metalSatMin: 0.6,
  ratio: {
${figLines}
  },
} as const;

export const RIG = {
${rigLines.join("\n")}
} as const;

/**
 * THE JOIN. THERE IS NO JOINT.
 *
 * Eight shoulders and hips cropped and enlarged from the concept scenes carry
 * the same thing every time: a plain rounded cap in the limb's own colour,
 * overlapped by the body group, one soft occlusion wash, and no hardware
 * anywhere. It works because the head is wider than the body, so the HEAD
 * hides the shoulder. Every ring, cup, collar, socket and bolt the previous
 * law drew is deleted from the art. A joint that needs hardware to read is a
 * joint drawn at the wrong size.
 *
 * Rendering only: the fight sim never reads any of it, and an art change that
 * moves a replay hash is a defect.
 */
export const JOIN = {
  /** the limb's end cap radius, x that limb's own width */
  capR: ${JOIN.capR},
  /** the body silhouette buries the cap by this fraction of the limb's width */
  burialMin: ${JOIN.burialMin},
  burial: ${JOIN.burial},
  burialMax: ${JOIN.burialMax},
  /** the wash value at the seam, back to 1.00 one limb width away */
  occlusion: ${JOIN.occlusion},
  /** a shallow moulded cuff is the only decoration allowed at a joint */
  cuffMax: ${JOIN.cuffMax},
  /** a broken limb leaves a SCAR CHIP clamped to the body silhouette, never
   *  a black socket disc: body colour lightened and desaturated, with a one
   *  unit darker rim on its lower edge. */
  scarW: ${JOIN.scarW},
  scarH: ${JOIN.scarH},
  scarLighten: ${JOIN.scarLighten},
  scarDesat: ${JOIN.scarDesat},
  /** an unfitted slot on the build screen: the same chip, no rim */
  ghostAlpha: ${JOIN.ghostAlpha},
  /** limbs go BEHIND the body group and the head draws last, covering the caps */
  drawOrder: ["legL", "legR", "armL", "armR", "torso", "head", "weapon"],
} as const;

/**
 * THE LIGHT. One soft key from directly above. The ramp is applied once
 * across a whole part, never per shape, and it is purely vertical so it is
 * identical whatever family a part came from. Parts are rendered NEUTRAL: the
 * scene applies the warm grade, because baking it in turns eight paints into
 * eight muds.
 */
export const LIGHT = {
  /** 1.00 over the top quarter, falling to 0.48 at the form's base */
  rampTop: 1.0,
  rampBottom: 0.48,
  /** the torso's top band sits at this fraction of the head's base value,
   *  because the head shades it. The strongest one-body cue available. */
  headShadowOnTorso: 0.48,
  /** side to side, at most: the ramp must stay vertical or a mirrored limb
   *  flips its light */
  lateralMax: 1.25,
} as const;

/**
 * DEPRECATED, and kept only so src/app/bots/_view/rig.ts,
 * scripts/bots-gen-kit.mjs and scripts/bots-import-parts.py keep resolving
 * while the rig and generation lanes move to JOIN above. NOTHING IN THE ART
 * DRAWS ANY OF IT ANY MORE: the bake stopped drawing balls, cups, collars,
 * rings and bolts on 2026-09-04. Values are frozen at their last drawn
 * numbers so no consumer changes behaviour by accident; delete this block
 * once rig.ts stops drawing socket fittings.
 */
export const JOINT = {
  ballR: 25,
  ballDrop: 5,
  socketCoreR: 16,
  socketRingR: 31,
  neckCoreR: 12,
  neckRingR: 31,
  boltR: 9,
  pegW: 44,
  pegH: 32,
  armShaft: [34, 37, 40, 43],
  legShaft: [36, 39, 42, 45],
  footW: [58, 62, 67, 72],
} as const;

/** DEPRECATED with JOINT above: the torso draws no socket fittings any more. */
export const LIMB_SOCKETS = [
  { socket: "armL", at: RIG.torso.shoulderL },
  { socket: "armR", at: RIG.torso.shoulderR },
  { socket: "legL", at: RIG.torso.hipL },
  { socket: "legR", at: RIG.torso.hipR },
] as const;

export type ArtSlot = keyof typeof RIG;
export const ART_SLOTS: readonly ArtSlot[] = ["head", "torso", "arm", "leg", "weapon"];

/**
 * The torso's shoulder points fall OUTSIDE its canvas, because the arm centre
 * sits 0.08 H outboard of the torso edge and 0.065 H inboard of the head edge,
 * and that sandwich is what hides the cap. They are offsets, not pixels: the
 * art gate must not ask the torso PNG for ink at either of them.
 */
export const OFF_CANVAS: readonly string[] = ["shoulderL", "shoulderR"];

/** The scissor lift: two states on one canvas, bottom-aligned on the floor. */
export const LIFT = { w: ${LIFT.w}, h: ${LIFT.h}, topDown: ${LIFT.topDown}, topRaised: ${LIFT.topRaised}, platformW: ${LIFT.platformW} } as const;

export const TIERS = [1, 2, 3, 4] as const;
export const DESIGNS = [1, 2] as const;

export const partFile = (slot: ArtSlot, tier: number, design: number): string =>
  \`/bots-art/parts/\${slot}/t\${tier}-\${design}.png\`;
export const maskFile = (slot: ArtSlot, tier: number, design: number): string =>
  \`/bots-art/parts/\${slot}/t\${tier}-\${design}.mask.png\`;
export const liftFile = (state: "down" | "raised"): string => \`/bots-art/lift/\${state}.png\`;

/** Every rig point of a slot, named, for the gate. */
export function rigPointsNamed(slot: ArtSlot): { name: string; at: Pt }[] {
  const r = RIG[slot] as Record<string, unknown>;
  return Object.entries(r)
    .filter(([k]) => k !== "w" && k !== "h")
    .map(([name, v]) => ({ name, at: v as Pt }));
}

/** Every rig point of a slot, for the gate: each must land on opaque pixels. */
export function rigPoints(slot: ArtSlot): Pt[] {
  return rigPointsNamed(slot).map((p) => p.at);
}
`;
if (!ONLY && !V2 && !V3) {
  mkdirSync(join(RIG_TS, ".."), { recursive: true });
  writeFileSync(RIG_TS, ts);
}

// ── the table, printed every run ───────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nBATTLE BOTS canvas contract  H=${H}  margin=${MARGIN}  skirt=${SKIRT}`);
console.log(`${pad("slot", 8)}${pad("canvas", 12)}${pad("was", 10)}pivots`);
const WAS = { head: "160x160", torso: "200x240", arm: "90x200", leg: "90x200", weapon: "220x120" };
for (const [slot, r] of Object.entries(RIG)) {
  const pts = Object.entries(r)
    .filter(([k]) => k !== "w" && k !== "h")
    .map(([k, v]) => `${k} ${pt(v)}`)
    .join("  ");
  console.log(`${pad(slot, 8)}${pad(`${r.w}x${r.h}`, 12)}${pad(WAS[slot], 10)}${pts}`);
}
const setPx = Object.values(RIG).reduce((a, r) => a + r.w * r.h, 0);
console.log(`texture per design set: ${setPx.toLocaleString()} px (was 136,000, ${(setPx / 136000).toFixed(2)}x)`);
if (V3) {
  if (V3_FILES.length) console.log(`bots-bake-parts --out v3: ${V3_FILES.length} HEAD shape rulers + svg and manifest-head.json -> ${V3_ROOT}`);
  console.log(`  --out v3 wrote nothing under parts/, lift/, _raw/parts/placeholders/ or placeholders-v2/, and did not touch ${RIG_TS}`);
} else if (V2) {
  console.log(`bots-bake-parts --out v2: ${files} rulers (${(bytes / 1024).toFixed(0)}KB) + svg, manifest.json and _compare.png -> ${V2_ROOT}`);
  console.log(`  wrote nothing under parts/, lift/ or _raw/parts/placeholders/, and did not touch ${RIG_TS}`);
} else {
  console.log(`bots-bake-parts: ${files} files, ${(bytes / 1024).toFixed(0)}KB -> ${ROOT}${ONLY ? "" : `; wrote ${RIG_TS}`}`);
}
