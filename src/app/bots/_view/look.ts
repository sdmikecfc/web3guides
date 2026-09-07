/**
 * THE LOOK: everything a bot wears that is not a part.
 *
 * WHY THIS FILE EXISTS, AND WHAT IT IS NOT. The rig (rig.ts) owns the body:
 * seven sprites on pivots, the breath, the blink, the gaze. This file owns the
 * flat drawings that ride on top of that body, and NOTHING ELSE: the six
 * stickers, the mark ladder, the small clay name plate, the six hats. Every
 * one of them is a pure function of (a Graphics, a colour, a number), so they
 * can be measured, re-drawn at any size, and read by a gate without a stage.
 *
 * IT NEVER REACHES THE FIGHT. Not one number here is read by
 * src/app/bots/_engine, and an art change that moves a replay hash is a
 * defect (verified with scripts/bots-harness.ts: the rollup did not move).
 *
 * ── FOUND, NOT BOUGHT (ADR-0141, and the look decision on top of it) ──────
 *
 * There is no paint for sale and no shop for looks. A part arrives from the
 * junkyard in the colour it was made in and keeps it for life, so a bot is
 * normally FOUR colours at once (head, body, arms, legs; the weapon rides the
 * arm). That is already true in the data and this file never argues with it:
 * a sticker and a boot band take one of the robot's OWN colours, and the
 * marks take cream and, twice, gold.
 *
 * CHOSEN   a face, one sticker in one of three spots, and the name's number
 *          on a small plate. Free, changeable, never sold.
 * EARNED   chest stars, a stitched patch per repair, cuff bands, sparkle eyes
 *          and the champion's crown. Counted on the server, never chosen.
 * DROPPED  a hat, from a Big Bot win only. Never on a shelf.
 *
 * ── NOTHING CAPS (the fourth law) ────────────────────────────────────────
 *
 * The chest row draws five cream stars and then one gold one, and that is the
 * last DRAWN step, not the last step: past it the plate prints the number, so
 * a bot with forty wins wears a gold star and a plate that says 40, and a bot
 * with four hundred wears the same star and a plate that says 400. Same rule
 * on the patches: three are drawn and the count carries on in words on the bay
 * sheet. A drawn ladder that stops is a score cap wearing a costume.
 *
 * ── WHAT WAS MEASURED BEFORE ANY OF IT WAS PLACED ────────────────────────
 *
 * Every number below sits on the shipped art, not on the contract's targets,
 * because the two are not the same picture (measured on t2-1, 2026-09-05):
 *
 *   THE HEAD'S SKIRT reaches torso-local -103 at the centre line and -114 out
 *   at the flanks. So the visible chest is -103 to +22, about 125 units, and
 *   NOT the 136 the contract's skirt figure implies.
 *   THE TORSO IS ±103 across the upper chest, narrowing to ±81 at the waist,
 *   which is under the ±106 rig.ts clamps a scar chip to. Everything here is
 *   clamped to ±96 or tighter, so a mark lands on body for every legal torso.
 *   THE LENS on a shipped head measures r 25.6 at (±64, -146) in head-node
 *   units, against the formula's r 47.6 at (±70.6, -155.7). So the cheek spot
 *   is derived from the MEASURED eye the rig hands over, never from a number
 *   typed in here, and it lands right on a cyclops too.
 *   THE SOLE starts at leg-local y 76. The boot band sits above it, at 53..67,
 *   which is boot and never sole.
 *   THE ARM's shaft ends and its mitt begins about y 60. The cuffs sit at 34
 *   and 50, which is sleeve and never hand.
 */
"use client";

import type { Graphics } from "pixi.js";
import type { DecalId, Socket } from "@/lib/bots/fixtures";
import { FIGURE, RIG } from "./rig-points";
import { K } from "../_ui/tokens";

/* ── what a look is ──────────────────────────────────────────────────────── */

/**
 * The five faces. Three are free from the first day; `wink` arrives with the
 * first colour match and `stars` with the first four star part, and this file
 * does not know or care which of them a wallet has earned. The SERVER decides
 * that and the save route refuses a face a wallet has not earned (the ninth
 * law); the rig draws whatever it is handed.
 */
export type FaceId = "calm" | "happy" | "sleepy" | "wink" | "stars";
export const FACE_IDS: readonly FaceId[] = ["calm", "happy", "sleepy", "wink", "stars"];

/** the six drawn stickers, shared with the build screen's decal list */
export type StickerId = DecalId;

/**
 * The three spots. CHEST is the contract's own decal point. CHEEK is below the
 * eye row and outboard of the mouth, so a sticker there can never be read as a
 * third eye or as a tooth. BOOT is a band above the sole, wide enough to read
 * when the whole bot is 120 px tall, which a sticker-sized mark down there is
 * not.
 */
export type StickerSpot = "chest" | "cheek" | "boot";
export const STICKER_SPOTS: readonly StickerSpot[] = ["chest", "cheek", "boot"];

/** the six hats. Kinds chosen because each is a different SILHOUETTE at 120 px. */
export type HatKind = "bow" | "propeller" | "ears" | "flag" | "bell" | "spring";
export const HAT_KINDS: readonly HatKind[] = ["bow", "propeller", "ears", "flag", "bell", "spring"];

export interface LookSticker {
  id: StickerId;
  spot: StickerSpot;
  /** one of the robot's own colours, as a hex number */
  color: number;
}

export interface LookHat {
  kind: HatKind;
  color: number;
}

/**
 * What the SERVER says this bot has done. Never a claim from the client, never
 * a localStorage read: rig.ts takes these numbers and draws them, and the
 * route that saves a look validates them against the wallet's own rows.
 */
export interface LookEarned {
  wins?: number;
  repairs?: number;
  level?: number;
  /** this week's champion */
  crown?: boolean;
}

/**
 * The whole look, in one object. setLook takes the WHOLE thing every time: a
 * field left out is a field turned OFF, so two calls with the same look draw
 * the same bot and there is no way to leave half a look behind.
 */
export interface BotLook {
  /** the colour each socket arrived in; a socket left out keeps what it has */
  paint?: Partial<Record<Socket, number>>;
  face?: FaceId;
  sticker?: LookSticker | null;
  /** the name's own number, 1 to 99, on a small clay tag */
  plate?: number | null;
  hat?: LookHat | null;
  earned?: LookEarned;
}

/* ── the ladders ─────────────────────────────────────────────────────────── */

/** a cream chest star at each of these, in order */
export const WIN_STARS: readonly number[] = [1, 5, 10, 15, 20];
/** and one gold star here, after which the plate carries the count */
export const GOLD_STAR_AT = 25;
/** three patches are drawn; the bay sheet says the rest in words */
export const PATCH_MAX = 3;
/** one cuff band at the first, two at the second */
export const CUFF_LEVELS: readonly number[] = [5, 10];
/** sparkle in the eye from here */
export const SPARKLE_LEVEL = 10;

/** What is actually drawn, derived once so the rig and any gate agree. */
export interface Marks {
  /** cream stars in the chest row, 0 to WIN_STARS.length */
  stars: number;
  /** the gold star at the end of the row */
  gold: boolean;
  /** the number the plate prints instead of the name's, once the row is full */
  count: number | null;
  /** stitched patches drawn, 0 to PATCH_MAX */
  patches: number;
  /** how many repairs there really were, so a caller can say the rest in words */
  repairs: number;
  cuffs: number;
  sparkle: boolean;
  crown: boolean;
}

/**
 * The ladder, in one place. Note what `count` is for: it is how the row keeps
 * going after its last drawn step. The row itself stops at six marks because
 * a chest is 125 units tall and 206 across, and a seventh star would be a
 * smaller star; the NUMBER does not stop, and that is the difference between
 * a drawn ceiling and a score cap.
 */
export function marksOf(e: LookEarned | undefined): Marks {
  const wins = Math.max(0, Math.floor(e?.wins ?? 0));
  const repairs = Math.max(0, Math.floor(e?.repairs ?? 0));
  const level = Math.max(0, Math.floor(e?.level ?? 0));
  return {
    stars: WIN_STARS.filter((n) => wins >= n).length,
    gold: wins >= GOLD_STAR_AT,
    count: wins >= GOLD_STAR_AT ? wins : null,
    patches: Math.min(PATCH_MAX, repairs),
    repairs,
    cuffs: CUFF_LEVELS.filter((n) => level >= n).length,
    sparkle: level >= SPARKLE_LEVEL,
    crown: !!e?.crown,
  };
}

/* ── colour ──────────────────────────────────────────────────────────────── */

const hexOf = (s: string): number => parseInt(s.slice(1), 16);
export const INK = hexOf(K.ink);
export const PAPER = hexOf(K.paper);
export const GOLD = hexOf(K.brass);

const lum = (c: number): number =>
  (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114);

/**
 * Ink on a light paint, cream on a dark one. The one rule that keeps a drawn
 * mark readable on all eight paints, and it is the rule drawDecal has always
 * used, moved here so the sticker, the plate and the marks cannot drift apart.
 */
export const isLightPaint = (paint: number): boolean => lum(paint) > 120;
export const contrastInk = (paint: number): number => (isLightPaint(paint) ? 0x2b2f3a : 0xf3e9d2);

/** toward black (k < 0) or white (k > 0), for a rim under a same-colour mark */
export function shade(c: number, k: number): number {
  const f = (v: number) => {
    const t = k < 0 ? v * (1 + k) : v + (255 - v) * k;
    return Math.max(0, Math.min(255, Math.round(t)));
  };
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
}

/**
 * NOTHING WHITE AND BOXY MAY SIT ON A ROBOT (2026-09-06, Mike, on the build
 * screen: "three white squares with dots are stuck on the robot's chest and
 * arms, they read as missing textures").
 *
 * They were patches, and the reason they read as holes is worth keeping: the
 * old patchColor drained a paint toward its own luminance and then lightened
 * it a third of the way to white, on the assumption that the body under it
 * was that flat paint. It is not. A part is a SHADED sprite multiplied by the
 * tint, so a mint torso renders around #3f8b85 while its flat paint is
 * #8fd9c4 - the patch was computed off a colour the player never sees and
 * landed three steps lighter than the clay it was sewn onto.
 *
 * So no colour is invented here at all any more. A mend is drawn as a press
 * INTO whatever the body actually renders as: soft rings of the contrast tone
 * at low alpha and no outline at all (see drawPatch, which also says why the
 * corner and the dash had to go). Alpha over the sprite cannot disagree with
 * the sprite, on any of the eight paints or any shading the art factory ships
 * next.
 *
 * This number is the STRENGTH of the deepest ring; the ones outside it are
 * fractions of it, so one edit here fades or deepens the whole mend.
 */
export const PATCH_PRESS = 0.16;

/* ── where everything sits, all of it measured ───────────────────────────── */

const H = FIGURE.H; // 560
const HIP_X = (RIG.torso.hipL[0] + RIG.torso.hipR[0]) / 2; // 144
const HIP_Y = RIG.torso.hipL[1]; // 218

/**
 * THE CHEST, in torso-local units (the torso node's origin is the hip centre).
 *
 * Measured, not assumed: the head's own skirt bottoms out at -103 on the
 * centre line, so nothing may sit above about -98, and a sticker drawn at the
 * contract's decal point (-70) at its shipped 56 unit size already reaches
 * -94. THERE IS NO CHEST ABOVE THE DECAL POINT. So the mark row sits BELOW
 * the sticker and the plate below that, which is also the order a jacket puts
 * them in. See the report note: this is the one place the plan's own wording
 * ("stars in a row above the chest decal point") lost to the measurement.
 */
export const CHEST = {
  /** the contract's decal point, torso-local */
  sticker: { x: RIG.torso.decal[0] - HIP_X, y: RIG.torso.decal[1] - HIP_Y }, // (0, -70)
  /**
   * THE MARK ROW, and THE PLATE, and the 34 units of chest they have to share.
   *
   * The chest between them is fixed at both ends and it is small. A sticker at
   * the contract's decal point reaches -44, and the torso's hem is NOTCHED
   * between the legs, so its CENTRE column runs out at about +10 while its
   * flanks carry on to +20 (measured on the shipped torso; the contract's own
   * body height stops four units short of either). That is 54 units, and a
   * six mark row is 20 of them and a legible plate 18, which is why the row is
   * at r 10 and not the r 14 it wants to be.
   *
   * Both orders were drawn and looked at. Plate low and row high puts the row
   * fine and hangs the plate's bottom over the notch; row low and plate high
   * puts the plate fine and drops the two middle stars into the notch, where
   * cream on the background reads as an empty outline. So: row under the
   * plate, both above the notch, and the row's outermost star at ±67 against
   * a torso that is ±79 at that row.
   */
  starsY: -26,
  /** one star's outer radius, and the pitch between two of them */
  starR: 10,
  starPitch: 23,
  /** the plate, on the belly, the last thing above the notch */
  plate: { x: 0, y: -2 },
  /**
   * three patch spots, none of them under the sticker, the row or the plate,
   * and every corner inside the torso's own measured half width at its own row
   * (103 up at the chest, 83 at the waist), not inside a single number for the
   * whole body. The first version put one at (64, 4), whose bottom corner hung
   * off the belly by two units.
   */
  patches: [
    { x: -74, y: -84 },
    { x: 76, y: -62 },
    { x: -70, y: -52 },
  ] as const,
} as const;

/** the plate's own box, drawn at this size and never scaled by the caller */
export const PLATE = { w: 60, h: 18, r: 5 } as const;

/**
 * THE ARM CUFF, in arm-local units (the arm node's origin is the shoulder).
 * The shaft runs to about y 60 and the mitt begins there, so a band at 50 is
 * the last row that is still sleeve. Two bands, the second up the sleeve.
 */
export const ARM_CUFF = { at: [50, 34] as const, halfW: 33, h: 11 } as const;

/**
 * THE BOOT BAND, in leg-local units (the leg node's origin is the hip). The
 * sole starts at 76, the shoe is widest around 60, and the leg node is
 * MIRRORED for the left leg, so an outboard x lands outboard on both feet.
 */
export const BOOT_BAND = { x: 27, y: 60, halfW: 55, h: 15 } as const;
/** the sticker that sits on the band, x its native 56 unit width */
export const BOOT_MARK_K = 0.42;

/**
 * THE CHEEK, as fractions the rig applies to the lenses it MEASURED. Nothing
 * here is a pixel: the drop is a fraction of the HEAD (a big lens and a small
 * one sit at the same height on the same face) and the outboard push is a
 * multiple of the LENS (so it clears a 48 unit eye as surely as a 26 unit one).
 */
export const CHEEK_K = 0.62;
export const CHEEK_DROP = 0.28;

/**
 * HOW WIDE THE HEAD IS AT ONE ROW, as the contract's core box inscribed with
 * an ellipse. Not a measurement of any one head: an UNDER-estimate of all of
 * them, because a dome is wider than the ellipse inside it at every row, so a
 * mark clamped to this lands on ink on the shipped heads AND on the drawn
 * fallback. Clamping to the widest row instead (the first cut did) put the
 * cheek sticker beside the head on the fallback, whose lenses are twice the
 * size and push the sticker twice as far out.
 *
 * `y` is head-node local (the origin is the neck pivot), so the head's own
 * ink runs from HEAD_TOP to about 0.
 */
export function headHalfAt(y: number): number {
  const h = FIGURE.ratio.headH.target * H;
  const b = h / 2;
  const t = Math.min(1, Math.abs((y + b) / b));
  return ((FIGURE.ratio.headCoreW.target * H) / 2) * Math.sqrt(Math.max(0, 1 - t * t));
}

/**
 * THE CROWN OF THE HEAD, in head-local units (the head node's origin is the
 * neck pivot). The head's own ink tops out at -283 on the shipped art and the
 * contract's apex row is -288, so a topper is seated at -278 and grows UP.
 */
export const HEAD_TOP = -FIGURE.ratio.headH.target * H; // -288.4, the head's apex in head-node units
/**
 * A hat is seated INTO the dome and not balanced on its point. At the apex the
 * head is only about 14 units across (measured), so a bow seated there has
 * both its loops in the air and reads as floating; 24 units down the dome is
 * 80 units across, which is wider than every hat's own base, so each one rests
 * on head. It costs nothing in height: the ceiling is measured from the seat.
 */
export const HAT_SEAT = { x: 0, y: HEAD_TOP + 24 };

/**
 * HOW TALL A HAT MAY BE, and why there is a ceiling at all.
 *
 * Every screen sizes a bot by `frameHeight / RIG_HEIGHT`, and RIG_HEIGHT is
 * the foot line to the DRAWN crown. A hat is drawn above that crown, so it
 * eats into whatever headroom the screen happens to have and is clipped by the
 * frame when there is none. RIG_HEIGHT is deliberately NOT moved for a hat:
 * moving it would shrink every bot on every screen, hatted or not, and a
 * cosmetic that resizes the whole game is not a cosmetic.
 *
 * 0.10 H is what fits: the bay leaves about 290 rig units over the crown at
 * 830 px and the garage more, so 56 clears both, and it is still a real hat
 * (12 px on a 120 px bot). Exported so an owner that wants to be sure can add
 * exactly this much headroom.
 */
export const TOPPER_H = 0.1 * H; // 56
/** and no wider than the head's own core, so a hat never breaks the silhouette */
export const TOPPER_HALF = (FIGURE.ratio.headCoreW.target * H) / 2; // 164.1
/**
 * The crown is drawn SHORT and sunk into the dome on purpose: a champion who
 * has also won a hat should not have to choose between them, so the crown
 * gives up height to leave the hat somewhere to sit. CROWN_LIFT is how far a
 * hat is raised when both are worn, and the hat is then scaled so the pair
 * still fits inside TOPPER_H.
 */
export const CROWN_H = 22;
export const CROWN_SINK = 8;
export const CROWN_LIFT = CROWN_H - CROWN_SINK; // 14

/* ── the drawings ────────────────────────────────────────────────────────── */

/** a five point star, outer radius r, drawn at (x, y) */
export function starPath(g: Graphics, x: number, y: number, r: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : (r * 13) / 30;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts);
}

/**
 * ONE STICKER, at its native 56 unit width, centred on (0, 0). The caller
 * scales the container: a sticker on a boot is the same drawing as a sticker
 * on a chest, and there is exactly one copy of each shape in the repo.
 *
 * `color` is one of the robot's own colours, so it can land on a part of that
 * same colour. A 3 unit rim in the contrast tone underneath is what makes a
 * coral heart read on a coral chest, and it costs nothing on the other seven.
 */
export function drawSticker(
  g: Graphics,
  id: StickerId,
  color: number,
  rim: number | null,
  hi: number,
): void {
  const S = 56;
  const shape = (c: number, dy: number, gleam: number) => {
    if (id === "plate") {
      g.roundRect(-S / 2, -16 + dy, S, 32, 6).stroke({ width: 4, color: c });
      g.circle(-14, dy, 4).fill(c);
      g.circle(14, dy, 4).fill(c);
    } else if (id === "bolt") {
      g.poly([-6, -30 + dy, 12, -30 + dy, 2, -6 + dy, 16, -6 + dy, -10, 30 + dy, -2, 4 + dy, -16, 4 + dy]).fill(c);
    } else if (id === "star") {
      starPath(g, 0, dy, 30);
      g.fill(c);
    } else if (id === "stripes") {
      for (let i = -1; i <= 1; i++) g.roundRect(-S / 2, i * 14 - 4 + dy, S, 8, 4).fill(c);
    } else if (id === "wrenches") {
      for (const dir of [1, -1]) {
        const x0 = -22 * dir, y0 = 22 + dy, x1 = 22 * dir, y1 = -22 + dy;
        const nx = 3.5, ny = 3.5 * dir;
        g.poly([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny]).fill(c);
        g.circle(x1, y1, 9).fill(c);
        g.circle(x1 + 4 * dir, y1 - 4, 4).fill(gleam);
      }
    } else if (id === "heart") {
      g.circle(-11, -8 + dy, 13).fill(c);
      g.circle(11, -8 + dy, 13).fill(c);
      g.poly([-23, -2 + dy, 23, -2 + dy, 0, 26 + dy]).fill(c);
    }
  };
  // `rim` null is the BUILD SCREEN's decal, drawn exactly as it always was:
  // one pass, in the contrast tone, no rim under it. A look's sticker takes a
  // rim, because it wears one of the robot's OWN colours and may land on a
  // part of that same colour.
  if (rim !== null) shape(rim, 3, rim);
  shape(color, 0, hi);
}

/**
 * THE MARK ROW. Cream stars, then the one gold one, centred on the chest. The
 * row is laid out from its own width so one star and six stars are both
 * centred, which is what stops a growing row from crawling sideways over a
 * season.
 */
export function drawStarRow(g: Graphics, stars: number, gold: boolean): void {
  const n = stars + (gold ? 1 : 0);
  if (n <= 0) return;
  const x0 = -((n - 1) * CHEST.starPitch) / 2;
  for (let i = 0; i < n; i++) {
    const isGold = gold && i === n - 1;
    const x = x0 + i * CHEST.starPitch;
    starPath(g, x, CHEST.starsY, CHEST.starR + 1.5);
    g.fill({ color: INK, alpha: 0.5 });
    starPath(g, x, CHEST.starsY, CHEST.starR);
    g.fill(isGold ? GOLD : PAPER);
  }
}

/**
 * ONE MENDED SPOT: A SOFT SCUFF IN THE CLAY, AND NOTHING WITH A CORNER.
 *
 * THE LAW THIS KEEPS (2026-09-06, Mike, twice): nothing white, nothing boxy
 * and nothing dashed may sit on a robot unless the player is actively
 * choosing a spot for a sticker. Anything with four corners and a broken
 * outline on top of a sprite reads as a MISSING TEXTURE, and a demo robot
 * wearing three of them looks like a bug, not like a robot that has been
 * through some fights.
 *
 * Three tries got here, and all three are worth keeping:
 *   1. a pale rectangle with hairline dashes: read as a sticky note.
 *   2. a lightened cloth fill: the three white squares. A fill mixed from the
 *      FLAT paint can never match the shaded sprite it lands on, because a
 *      part is a shaded sprite multiplied by its tint, so a mint torso
 *      renders near #3f8b85 while its flat paint is #8fd9c4.
 *   3. the same square with the fill dropped to alpha and a dashed stitch
 *      outline kept: no longer white, still three dashed boxes on the chest.
 *
 * So the corner and the dash are both gone. What is drawn now is a shallow
 * ROUND press: three nested ovals of the contrast tone at low alpha, each one
 * a little stronger than the last, which is a soft-edged dent with no outline
 * to read as a border. It invents no colour at all, so it can never disagree
 * with the sprite under it, on any of the eight paints or any shading the art
 * factory ships next; it is dark on a light paint and light on a dark one, so
 * a mend on an ink robot is a soft lift and not a black hole.
 *
 * `tilt` still rides the shape, so the three mends on one chest are not the
 * same stamp three times.
 */
export function drawPatch(g: Graphics, x: number, y: number, body: number, tilt: number): void {
  const ink = contrastInk(body);
  const rx = 16, ry = 12;
  const co = Math.cos(tilt), si = Math.sin(tilt);
  // an oval built from its own points so the tilt rides it: Graphics has no
  // per-shape transform, and a rotated ellipse is the only way three mends on
  // one chest stop looking like one stamp repeated
  const oval = (k: number): number[] => {
    const p: number[] = [];
    const steps = 28;
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const dx = Math.cos(a) * rx * k;
      const dy = Math.sin(a) * ry * k;
      p.push(x + dx * co - dy * si, y + dx * si + dy * co);
    }
    return p;
  };
  // three rings, softest first: the stack is what makes the edge fade instead
  // of stopping, and a dent with no hard edge cannot read as a pasted-on box
  g.poly(oval(1)).fill({ color: ink, alpha: PATCH_PRESS * 0.42 });
  g.poly(oval(0.74)).fill({ color: ink, alpha: PATCH_PRESS * 0.52 });
  g.poly(oval(0.44)).fill({ color: ink, alpha: PATCH_PRESS * 0.62 });
}

/** a moulded cuff band, in cream so it reads on all eight paints */
export function drawCuff(g: Graphics, y: number, halfW: number, h: number): void {
  g.roundRect(-halfW, y - h / 2, halfW * 2, h, h / 2).fill(PAPER);
  g.roundRect(-halfW, y - h / 2, halfW * 2, h, h / 2).stroke({ width: 2, color: INK, alpha: 0.45 });
}

/** the boot band, and the sticker that may sit on it */
export function drawBootBand(g: Graphics, color: number): void {
  const b = BOOT_BAND;
  const box = (): Graphics => g.roundRect(b.x - b.halfW, b.y - b.h / 2, b.halfW * 2, b.h, b.h / 2);
  // The rim carries this at ring size. A moss band on a moss boot is the whole
  // point of "one of the robot's own colours", and at 120 px the band itself
  // is the same three pixels of moss the boot already was: what separates them
  // is a dark edge thick enough to survive the shrink.
  box().fill(shade(color, -0.5));
  g.roundRect(b.x - b.halfW + 2.5, b.y - b.h / 2 + 2.5, b.halfW * 2 - 5, b.h - 5, (b.h - 5) / 2).fill(color);
  box().stroke({ width: 3, color: INK, alpha: 0.55 });
}

/* ── the number on the plate ─────────────────────────────────────────────── */

/**
 * Digits as polylines on a 6 x 10 box, stroked with a round cap. Not a font:
 * a Text would pull a font load onto a canvas that has none and would break
 * its own batch, and a seven segment display would read as machinery on a toy.
 * These are the shapes a number gets stamped into clay as.
 */
const DIGIT: readonly (readonly (readonly number[])[])[] = [
  [[1, 2, 1, 8, 3, 9.5, 5, 8, 5, 2, 3, 0.5, 1, 2]],
  [[1.4, 2, 3, 0.5, 3, 9.5]],
  [[1, 2, 3, 0.5, 5, 2, 5, 4, 1, 9.5, 5, 9.5]],
  [[1, 1, 5, 1, 3, 4.4, 5, 5.6, 5, 8, 3, 9.5, 1, 8.4]],
  [[4, 9.5, 4, 0.5, 1, 6.4, 5.4, 6.4]],
  [[5, 0.6, 1, 0.6, 1, 4, 3.4, 4, 5, 5.6, 5, 8, 3, 9.5, 1, 8.4]],
  [[5, 1, 3, 0.5, 1, 3, 1, 8, 3, 9.5, 5, 8, 5, 6.2, 3, 4.9, 1, 6]],
  [[1, 0.6, 5, 0.6, 2.4, 9.5]],
  [[3, 4.9, 1, 3.3, 1.6, 1, 3, 0.5, 4.4, 1, 5, 3.3, 3, 4.9, 1, 6.6, 1, 8.4, 3, 9.5, 5, 8.4, 5, 6.6, 3, 4.9]],
  [[1, 9, 3, 9.5, 5, 7, 5, 2, 3, 0.5, 1, 2, 1, 4.2, 3, 5.4, 5, 4.2]],
];

/** one digit, its box scaled to `h` tall, its left edge at x */
function digit(g: Graphics, d: number, x: number, y: number, h: number, color: number): void {
  const k = h / 10;
  for (const path of DIGIT[d]) {
    g.moveTo(x + path[0] * k, y + path[1] * k);
    for (let i = 2; i < path.length; i += 2) g.lineTo(x + path[i] * k, y + path[i + 1] * k);
    g.stroke({ width: Math.max(2, h * 0.16), color, cap: "round", join: "round" });
  }
}

/** how wide a number will be at this digit height */
export function numberWidth(n: number, h: number): number {
  const s = String(Math.max(0, Math.floor(n)));
  return s.length * h * 0.62 - h * 0.02;
}

/** the digits of `n`, centred on (x, y) */
export function drawNumber(g: Graphics, n: number, x: number, y: number, h: number, color: number): void {
  const s = String(Math.max(0, Math.floor(n)));
  const pitch = h * 0.62;
  let px = x - (s.length * pitch) / 2;
  for (const ch of s) {
    digit(g, Number(ch), px, y - h / 2, h, color);
    px += pitch;
  }
}

/**
 * THE PLATE. A small clay tag with the name's own number stamped in it, and
 * the one place the ladder carries on past its last drawn star: when `star` is
 * on, the number IS the win count and a small gold star sits beside it, so a
 * bot on 40 wins wears a plate that says 40 and a bot on 400 wears one that
 * says 400.
 */
export function drawPlate(g: Graphics, n: number, star: boolean, x: number, y: number): void {
  const h = 11;
  const sw = star ? 15 : 0;
  const w = Math.max(PLATE.w, numberWidth(n, h) + sw + 18);
  g.roundRect(x - w / 2, y - PLATE.h / 2 + 2, w, PLATE.h, PLATE.r).fill({ color: INK, alpha: 0.35 });
  g.roundRect(x - w / 2, y - PLATE.h / 2, w, PLATE.h, PLATE.r).fill(PAPER);
  g.roundRect(x - w / 2, y - PLATE.h / 2, w, PLATE.h, PLATE.r).stroke({ width: 2, color: INK, alpha: 0.4 });
  const cx = x + sw / 2;
  drawNumber(g, n, cx, y, h, INK);
  if (star) {
    starPath(g, cx - numberWidth(n, h) / 2 - 7, y, 6.5);
    g.fill(GOLD);
    starPath(g, cx - numberWidth(n, h) / 2 - 7, y, 6.5);
    g.stroke({ width: 1.5, color: INK, alpha: 0.4 });
  }
}

/* ── the hat, and the crown ──────────────────────────────────────────────── */

/**
 * ONE HAT, seated at (0, 0) and growing UP, clamped into TOPPER_H x
 * TOPPER_HALF so no kind can out-grow or out-span the head it sits on.
 *
 * All six are drawn for the 120 px read first and the 600 px read second: one
 * bold shape, a rim in ink so it separates from a head of the same colour, and
 * no detail under about 8 units, because 8 units is under two pixels at ring
 * size and a detail that cannot be seen is a detail that muddies.
 */
export function drawTopper(g: Graphics, kind: HatKind, color: number): void {
  const rim = { width: 3, color: INK, alpha: 0.55 } as const;
  const dark = shade(color, -0.25);
  const light = shade(color, 0.25);
  const y0 = 0;
  if (kind === "bow") {
    for (const s of [-1, 1] as const) {
      g.ellipse(s * 31, y0 - 20, 27, 17).fill(color);
      g.ellipse(s * 31, y0 - 20, 27, 17).stroke(rim);
      g.ellipse(s * 34, y0 - 22, 11, 7).fill(light);
    }
    g.roundRect(-10, y0 - 30, 20, 22, 7).fill(dark);
    g.roundRect(-10, y0 - 30, 20, 22, 7).stroke(rim);
  } else if (kind === "propeller") {
    g.roundRect(-5, y0 - 22, 10, 24, 5).fill(dark);
    g.roundRect(-5, y0 - 22, 10, 24, 5).stroke(rim);
    for (const s of [-1, 1] as const) {
      const cx = s * 42, cy = y0 - 24 - s * 6;
      g.ellipse(cx, cy, 40, 9).fill(color);
      g.ellipse(cx, cy, 40, 9).stroke(rim);
    }
    g.circle(0, y0 - 24, 9).fill(light);
    g.circle(0, y0 - 24, 9).stroke(rim);
  } else if (kind === "ears") {
    for (const s of [-1, 1] as const) {
      g.ellipse(s * 33, y0 - 24, 21, 27).fill(color);
      g.ellipse(s * 33, y0 - 24, 21, 27).stroke(rim);
      g.ellipse(s * 33, y0 - 24, 10, 15).fill(light);
    }
  } else if (kind === "flag") {
    g.roundRect(-4, y0 - 52, 8, 54, 4).fill(dark);
    g.roundRect(-4, y0 - 52, 8, 54, 4).stroke(rim);
    g.poly([3, y0 - 50, 50, y0 - 40, 3, y0 - 26]).fill(color);
    g.poly([3, y0 - 50, 50, y0 - 40, 3, y0 - 26]).stroke(rim);
  } else if (kind === "bell") {
    g.moveTo(-24, y0 - 4);
    g.quadraticCurveTo(-22, y0 - 44, 0, y0 - 46);
    g.quadraticCurveTo(22, y0 - 44, 24, y0 - 4);
    g.closePath();
    g.fill(color);
    g.moveTo(-24, y0 - 4);
    g.quadraticCurveTo(-22, y0 - 44, 0, y0 - 46);
    g.quadraticCurveTo(22, y0 - 44, 24, y0 - 4);
    g.closePath();
    g.stroke(rim);
    g.roundRect(-26, y0 - 8, 52, 9, 4).fill(dark);
    g.roundRect(-26, y0 - 8, 52, 9, 4).stroke(rim);
    g.circle(0, y0 + 3, 7).fill(dark);
    g.circle(0, y0 + 3, 7).stroke(rim);
  } else {
    // spring: three coils and a ball, drawn as stroked rings so it stays open
    for (let i = 0; i < 3; i++) {
      const cy = y0 - 9 - i * 11;
      g.ellipse(0, cy, 15 - i, 7.5).stroke({ width: 11, color: INK, alpha: 0.35 });
      g.ellipse(0, cy, 15 - i, 7.5).stroke({ width: 8, color, alpha: 1 });
    }
    g.circle(0, y0 - 47, 15).fill(light);
    g.circle(0, y0 - 47, 15).stroke(rim);
  }
}

/**
 * How tall each kind actually draws, rim included. Measured off the drawings
 * above rather than guessed, because this is what the clamp divides by: a kind
 * whose rise is understated punches through the frame on the one screen with
 * the least headroom, and a kind whose rise is overstated shrinks for nothing.
 */
export const TOPPER_RISE: Record<HatKind, number> = {
  bow: 40, propeller: 42, ears: 54, flag: 56, bell: 50, spring: 64,
};

/**
 * The scale a hat is drawn at: as big as it can be without the hat (plus the
 * crown, when there is one) leaving TOPPER_H. Only the spring is clamped on a
 * bare head, and only a champion's hat is clamped hard.
 */
export function topperScale(kind: HatKind, crowned: boolean): number {
  const lift = crowned ? CROWN_LIFT : 0;
  return Math.min(1, (TOPPER_H - lift) / TOPPER_RISE[kind]);
}

/**
 * THE CHAMPION'S CROWN. Three points on a low band, gold, and the only gold on
 * the bot apart from the 25 win star. It is drawn SHORT on purpose: it has to
 * leave room for a hat above it, because a champion who won a hat should not
 * have to choose.
 */
export function drawCrown(g: Graphics): void {
  const rim = { width: 3, color: INK, alpha: 0.5 } as const;
  const w = 92, h = CROWN_H, b = CROWN_SINK;
  const pts = [
    -w / 2, b, -w / 2, -h * 0.5, -w * 0.26, -h, -w * 0.07, -h * 0.42,
    w * 0.07, -h * 0.42, w * 0.26, -h, w / 2, -h * 0.5, w / 2, b,
  ];
  g.poly(pts).fill(GOLD);
  g.poly(pts).stroke(rim);
  g.roundRect(-w / 2 - 2, -h * 0.26, w + 4, 11, 5).fill(shade(GOLD, 0.24));
  g.roundRect(-w / 2 - 2, -h * 0.26, w + 4, 11, 5).stroke(rim);
}

/**
 * THE SPARKLE. A four point twinkle inside the lens, high and to one side, at
 * the eye's own radius so it lands on a 25 unit lens and on a 48 unit one.
 * Additive, so it is light and never hardware.
 */
export function drawSparkle(g: Graphics, x: number, y: number, r: number): void {
  const s = r * 0.62;
  g.poly([x, y - s, x + s * 0.26, y - s * 0.26, x + s, y, x + s * 0.26, y + s * 0.26,
    x, y + s, x - s * 0.26, y + s * 0.26, x - s, y, x - s * 0.26, y - s * 0.26])
    .fill({ color: 0xffffff, alpha: 0.95 });
}

/**
 * STAR EYES. The `stars` face: a star sitting in the lens, drawn at the lens's
 * own size so it works on every head the art lane ships and on a cyclops.
 */
export function drawStarEye(g: Graphics, x: number, y: number, r: number): void {
  starPath(g, x, y, r * 0.86);
  g.fill({ color: 0xfff1c9, alpha: 0.96 });
  starPath(g, x, y, r * 0.86);
  g.stroke({ width: 2.5, color: 0x8a6a34, alpha: 0.5 });
}
