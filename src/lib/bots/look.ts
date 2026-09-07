/**
 * BATTLE BOTS LOOK: what a robot chose, what it earned, and the ONE table of
 * shapes every surface draws those from.
 *
 * WHY THIS FILE EXISTS. A robot is normally four colours at once, and on top
 * of that it wears a face, one sticker in one of three spots, a plate with
 * its number, and the marks it earned by fighting. Before this file the ring
 * knew how to draw a face and nothing else did, so the fights list, the
 * knockout card and the board all flattened the robot to grey clay or to one
 * colour. Every drawn mark now lives here once, in a unit box, as a list of
 * plain shapes, so the ring's canvas and the server's portrait draw the SAME
 * star rather than two stars that drift apart.
 *
 * THREE LAWS THIS FILE CARRIES.
 *
 *  1. NOTHING HERE REACHES THE FIGHT. No engine file may import this module,
 *     and this module reaches into the engine for two things only: the eight
 *     paint ids with their type, and the seeded number generator the hat drop
 *     shares with every other drop. A look is a picture; the sim never reads
 *     a picture. scripts/bots-look-check.ts gate (a) reads both directions of
 *     that line off the source, and the replay rollup in bots-harness.ts is
 *     what proves the fight itself did not move.
 *
 *  2. NOTHING HERE IS FOR SALE (ADR-0141). Colour and shape arrive with the
 *     part from the junkyard. A face is chosen or earned. A sticker is chosen
 *     and wears one of the robot's OWN colours, so it can never be a colour
 *     the robot did not find. Marks and hats are earned only.
 *
 *  3. A LADDER NEVER STOPS. The chest stars are drawn to the sixth step and
 *     the plate then prints the number, so a robot on its hundredth win has
 *     somewhere to put it. `starsBeyond` and `patchesBeyond` exist for the
 *     same reason: what is not drawn is still counted, in words or in a
 *     number, and never capped.
 *
 * THE SERVER IS THE TRUTH. normalizeLook() takes what a robot CHOSE and what
 * the wallet actually EARNED and returns only what both agree on, so a save
 * route can hand it a request body and keep nothing the player has not won.
 */
import type { PaintId } from "@/app/bots/_engine/parts";
import { PAINT_IDS, isPaintId } from "@/app/bots/_engine/parts";
import { fnv1a, mulberry32 } from "@/app/bots/_engine/rng";
import type { CardSlot, DecalId, Socket } from "./fixtures";
import { CARD_OF_SOCKET, DECAL_IDS, SOCKETS } from "./fixtures";

// ── what a robot can wear ───────────────────────────────────────────────────

/**
 * calm and happy are free; wink and stars are earned.
 *
 * SLEEPY WAS CUT, and the measurement is why. Rendered at 120 px, which is the
 * size a robot is drawn at in the ring, in the fights list and on the board,
 * the Sleepy face differs from the Happy one over 113 pixels of a 6230 pixel
 * head, and the strongest of those differences is 69 of 255. Every other pair
 * of free faces is roughly twice that on both counts (calm against happy: 166
 * pixels, peak 129). The two faces are drawn by two different lids, one
 * closing from the top and one opening from the bottom, and at ring size both
 * collapse to the same thing: an eye that has stopped glowing. Side by side a
 * player can just about tell them apart; alone, which is how anybody ever sees
 * their own robot, they cannot, and a choice you cannot see you made is not a
 * choice. Two free faces that read as one is worse than one free face.
 *
 * The rig still knows how to draw a sleepy face (_view/rig.ts FACE), and
 * SLEEPY IS ALSO A MOOD, which is a different thing entirely and is untouched:
 * a robot with most of its sockets empty looks sleepy in the bay because the
 * bay says so, not because anybody chose it.
 */
export type FaceId = "calm" | "happy" | "wink" | "stars";
export const FACE_IDS: readonly FaceId[] = ["calm", "happy", "wink", "stars"];
export const FREE_FACES: readonly FaceId[] = ["calm", "happy"];

/** chest at the decal point, cheek below the eyes, boot band above the sole. */
export type StickerSpot = "chest" | "cheek" | "boot";
export const STICKER_SPOTS: readonly StickerSpot[] = ["chest", "cheek", "boot"];

/** A hat drops from a Big Bot win. It is never on the shelf and never bought,
 *  and recycle refuses it. Six kinds, all of them chosen to read at ring size:
 *  a shape on the skyline beats a detail on the chest every time. */
export type HatId = "bow" | "propeller" | "ears" | "flag" | "bell" | "spring";
export const HAT_IDS: readonly HatId[] = ["bow", "propeller", "ears", "flag", "bell", "spring"];

/**
 * ONE HAT: the kind it is and the colour it turned up in.
 *
 * A HAT ARRIVES IN A COLOUR, THE WAY A PART DOES. ADR-0141's rule is that a
 * thing keeps the colour it arrived in, for life, and that there is no paint
 * to buy. A hat is the only other thing a robot ever finds, so it follows the
 * same rule: the fight that dropped it decided both the kind and the colour,
 * and neither ever changes again. Six kinds in seven colours (HAT_PAINTS) is
 * 42 hats, so a second bow is still worth winning; six kinds alone would be a
 * set a player finishes and never thinks about again.
 *
 * `color` MAY BE NULL, and null is not "no colour": it is a hat row written
 * before the colour was recorded, and the honest picture for it is the one
 * every surface drew before this lane, the head's own colour. Every drawing
 * falls back that way, so an old row and a new row both render.
 */
export interface HatWon {
  kind: HatId;
  color: PaintId | null;
}

/**
 * EVERY HAT THERE IS: six kinds in all eight colours, plus the six colourless
 * ones a row written before the colour was recorded produces. 54 rows.
 *
 * IT IS DELIBERATELY WIDER THAN THE DROP. hatDropColor never rolls black
 * (HAT_PAINTS says why), but this list keeps it, because the list is not a
 * table of what can be won: it is what the look census hands the read path
 * when it asks "does this stored hat still draw". That question has to be
 * answered yes for anything a row could hold, a hand grant included, or a
 * robot would silently lose its hat off the census and be counted as a twin
 * of a bare one.
 */
export const EVERY_HAT: readonly HatWon[] = HAT_IDS.flatMap((kind) => [
  { kind, color: null } as HatWon,
  ...PAINT_IDS.map((color) => ({ kind, color }) as HatWon),
]);

/** Two hats are the same hat when the kind AND the colour match. A coral bow
 *  is not a moss bow, which is the whole point of the colour. */
export function sameHat(a: HatWon | null | undefined, b: HatWon | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.kind === b.kind && (a.color ?? null) === (b.color ?? null);
}

/** A hat off a row or a request, or null. Accepts a bare kind, because a row
 *  written before hats had colours stored the kind on its own. */
export function toHatWon(v: unknown): HatWon | null {
  if (isHatId(v)) return { kind: v, color: null };
  if (!v || typeof v !== "object") return null;
  const o = v as { kind?: unknown; color?: unknown };
  if (!isHatId(o.kind)) return null;
  return { kind: o.kind, color: isPaintId(o.color) ? o.color : null };
}

/** The sticker shares the rig's six decals: one drawing, two surfaces. */
export type StickerId = DecalId;
export const STICKER_IDS: readonly StickerId[] = DECAL_IDS;

/** THE LADDER OF CHEST STARS. Six drawn steps, the last one gold. Past the
 *  last step the plate prints the number, so nothing caps. */
export const STAR_STEPS: readonly number[] = [1, 5, 10, 15, 20, 25];
/** every this many wins past the last drawn step is one more counted step */
export const STAR_STEP_ON = 5;
/** patches drawn on the body; past this they are counted in words */
export const PATCHES_DRAWN = 3;
/** a cuff band on each arm at these levels */
export const CUFF_LEVELS: readonly number[] = [5, 10];
/** sparkle eyes from this level */
export const SPARKLE_LEVEL = 10;

/** What a robot CHOSE. Every field is optional: a robot with no look at all
 *  is a legal robot and every surface must still draw it. */
export interface BotLook {
  face: FaceId;
  sticker: StickerId | null;
  spot: StickerSpot;
  /** one of the robot's OWN colours; null falls back to the robot's plate colour */
  stickerPaint: PaintId | null;
  /** the hat it is wearing, kind and colour, out of the hats it has won */
  hat: HatWon | null;
  /** the number off the robot's name, printed on its plate */
  plateNumber: number | null;
}

export const NO_LOOK: BotLook = {
  face: "calm",
  sticker: null,
  spot: "chest",
  stickerPaint: null,
  hat: null,
  plateNumber: null,
};

/** The loose shape a stored build JSON or a save request may carry. Nothing
 *  is trusted: normalizeLook checks every field against what was earned. */
export interface BotLookRaw {
  face?: unknown;
  sticker?: unknown;
  /** the field the rig has always called `decal`, kept so an old row reads */
  decal?: unknown;
  spot?: unknown;
  stickerPaint?: unknown;
  hat?: unknown;
}

/** What the SERVER says the wallet has actually done with this robot. Every
 *  number here comes from rows (wins, level, part instances, drops), never
 *  from a client's claim. */
export interface LookEarned {
  wins: number;
  level: number;
  /** how many times the shop has put it back together */
  repairs: number;
  /** the week champion wears a crown */
  champion: boolean;
  /** all four body parts one colour: unlocks the wink */
  colourMatch: boolean;
  /** at least one four star part: unlocks the star eyes */
  fourStar: boolean;
  /** every hat this wallet has actually won, kind and colour */
  hats: readonly HatWon[];
  /** the robot's own colours, in head, torso, arms, legs order */
  paints: readonly PaintId[];
  plateNumber: number | null;
}

export const NOTHING_EARNED: LookEarned = {
  wins: 0, level: 1, repairs: 0, champion: false, colourMatch: false,
  fourStar: false, hats: [], paints: [], plateNumber: null,
};

/** What is DRAWN, once the ladder has been walked. Nothing here is capped:
 *  the two `Beyond` counts are what the drawn steps could not hold. */
export interface LookMarks {
  /** chest stars drawn in clay-light cream, 0 to five */
  stars: number;
  /** the sixth step, at 25 wins, and the only gold on the body */
  goldStar: boolean;
  /** steps past the gold one; the plate prints the win count instead */
  starsBeyond: number;
  /**
   * THE NUMBER THAT MEANS NO LADDER EVER STOPS. The star row stops at six
   * marks because a chest has room for six; the COUNT does not stop, and
   * that difference is the whole of "scores never cap". Null until the gold
   * star, then the win count itself, which is what the plate prints.
   *
   * This mirrors `count` in src/app/bots/_view/look.ts, which the rig has
   * always had. Without it here, every surface drawn by the portrait
   * compositor instead of the rig (the fights list, the board, the knockout
   * card, the share card, every garage thumbnail) had nothing to print and
   * fell back to the robot's NAME number, or to 0 for a robot with no name
   * number: a 103 win robot wore a plate reading 0.
   */
  count: number | null;
  patches: number;
  patchesBeyond: number;
  /** a band on each arm: one at level 5, two at level 10 */
  cuffs: 0 | 1 | 2;
  sparkle: boolean;
  crown: boolean;
}

export const NO_MARKS: LookMarks = {
  stars: 0, goldStar: false, starsBeyond: 0, count: null, patches: 0, patchesBeyond: 0,
  cuffs: 0, sparkle: false, crown: false,
};

/**
 * Walk the ladder. A step is reached, never bought, and the two counts that
 * fall off the end of the drawing are returned rather than dropped.
 */
export function earnedMarks(e: LookEarned): LookMarks {
  const wins = Math.max(0, Math.floor(e.wins || 0));
  const level = Math.max(1, Math.floor(e.level || 1));
  const rep = Math.max(0, Math.floor(e.repairs || 0));
  let steps = 0;
  for (const at of STAR_STEPS) if (wins >= at) steps++;
  const last = STAR_STEPS[STAR_STEPS.length - 1];
  const beyond = wins > last ? Math.floor((wins - last) / STAR_STEP_ON) : 0;
  const goldStar = steps >= STAR_STEPS.length;
  let cuffs = 0;
  for (const at of CUFF_LEVELS) if (level >= at) cuffs++;
  return {
    stars: goldStar ? STAR_STEPS.length - 1 : steps,
    goldStar,
    starsBeyond: beyond,
    // once the row is full the number carries on alone, exactly as the rig's
    // own ladder does (_view/look.ts marksOf: wins >= GOLD_STAR_AT ? wins : null)
    count: goldStar ? wins : null,
    patches: Math.min(PATCHES_DRAWN, rep),
    patchesBeyond: Math.max(0, rep - PATCHES_DRAWN),
    cuffs: cuffs as 0 | 1 | 2,
    sparkle: level >= SPARKLE_LEVEL,
    crown: !!e.champion,
  };
}

/** A face is free, or it is earned. Nothing here can be bought. */
export function faceAllowed(face: FaceId, e: LookEarned): boolean {
  if (FREE_FACES.includes(face)) return true;
  if (face === "wink") return !!e.colourMatch;
  if (face === "stars") return !!e.fourStar;
  return false;
}

/**
 * THE GATE. What the robot chose, kept only where the server agrees it was
 * earned, and every unknown value dropped rather than guessed. A save route
 * calls this with the request body and stores what comes back.
 */
export function normalizeLook(raw: BotLookRaw | null | undefined, e: LookEarned): BotLook {
  const r = raw || {};
  const face = FACE_IDS.includes(r.face as FaceId) && faceAllowed(r.face as FaceId, e)
    ? (r.face as FaceId)
    : "calm";
  const rawSticker = r.sticker !== undefined ? r.sticker : r.decal;
  const sticker = STICKER_IDS.includes(rawSticker as StickerId) ? (rawSticker as StickerId) : null;
  const spot = STICKER_SPOTS.includes(r.spot as StickerSpot) ? (r.spot as StickerSpot) : "chest";
  // a sticker wears one of the robot's OWN colours, so it can never be a
  // colour the robot did not find (ADR-0141: no paint for sale)
  const own = e.paints.filter(isPaintId);
  const stickerPaint = isPaintId(r.stickerPaint) && own.includes(r.stickerPaint)
    ? r.stickerPaint
    : own[0] ?? null;
  // a hat is worn only while the wallet still has that exact hat. A row that
  // stored the kind alone (before colours were recorded) matches the first
  // won hat of that kind, so an old row keeps its hat rather than losing it.
  const want = toHatWon(r.hat);
  const hat = want ? e.hats.find((h) => sameHat(h, want)) ?? (want.color === null ? e.hats.find((h) => h.kind === want.kind) ?? null : null) : null;
  return { face, sticker, spot, stickerPaint, hat: hat ?? null, plateNumber: e.plateNumber ?? null };
}

/** "Pick for me": the first face and sticker a robot's own colours suggest,
 *  chosen from a number the caller already has (a bot id), never rolled, so
 *  the same robot suggests the same look twice. */
export function suggestLook(seed: number, e: LookEarned): BotLook {
  const n = Math.abs(Math.floor(seed)) || 1;
  const faces = FACE_IDS.filter((f) => faceAllowed(f, e));
  const own = e.paints.filter(isPaintId);
  return {
    face: faces[n % faces.length] ?? "calm",
    sticker: STICKER_IDS[(n >> 3) % STICKER_IDS.length] ?? null,
    spot: STICKER_SPOTS[(n >> 6) % STICKER_SPOTS.length] ?? "chest",
    stickerPaint: own.length ? own[(n >> 9) % own.length] : null,
    hat: e.hats.length ? e.hats[(n >> 11) % e.hats.length] ?? null : null,
    plateNumber: e.plateNumber ?? null,
  };
}

// ── THE ONE TABLE OF SHAPES ─────────────────────────────────────────────────
/**
 * Every mark is a short list of plain shapes in a UNIT BOX: the drawing spans
 * about -1 to 1 on both axes, so a caller places it with one centre and one
 * size and nothing else. The vocabulary is deliberately the four things a
 * Pixi Graphics and a scanline rasterizer can both do exactly, so the ring
 * and the server portrait draw one star and not two.
 *
 * `ink` is a ROLE, not a colour. The caller resolves it, because the same
 * star is cream on a dark robot and ink on a light one, and only the caller
 * knows what it is standing on.
 */
export type LookInk =
  /** the robot's own colour for this spot */
  | "own"
  /** ink on a light ground, cream on a dark one: the caller decides */
  | "contrast"
  /** the reverse of contrast, for a highlight inside a contrast shape */
  | "ground"
  /** the ONLY two gold things on a robot: the crown and the 25 win star */
  | "gold"
  | "cream"
  | "ink";

export type LookShape =
  | { k: "ellipse"; x: number; y: number; rx: number; ry: number; ink: LookInk; a?: number }
  | { k: "rect"; x: number; y: number; w: number; h: number; r?: number; ink: LookInk; a?: number }
  | { k: "poly"; pts: readonly number[]; ink: LookInk; a?: number }
  | { k: "line"; pts: readonly number[]; w: number; ink: LookInk; a?: number };

/** A five pointed star as one polygon. ONE definition, used by the chest
 *  mark, the star sticker and the star face, so there is exactly one star in
 *  the repo (the rig's decal star is the same construction at 30 / 13). */
export function starPoly(outer = 1, inner = 0.433, turn = -Math.PI / 2): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = turn + (i * Math.PI) / 5;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

const STAR = starPoly();

/** The earned chest star, and its gold twin at the sixth step. */
export const STAR_MARK: readonly LookShape[] = [{ k: "poly", pts: STAR, ink: "contrast" }];
export const GOLD_STAR_MARK: readonly LookShape[] = [
  { k: "poly", pts: starPoly(1.1), ink: "gold" },
  { k: "poly", pts: starPoly(0.62), ink: "gold", a: 0.55 },
];

/** A stitched patch: a soft square of the robot's own colour, a darker rim,
 *  and four stitches across it. Never gold, because a repair is not a prize. */
export const PATCH_MARK: readonly LookShape[] = [
  { k: "rect", x: -1, y: -0.9, w: 2, h: 1.8, r: 0.35, ink: "own", a: 0.95 },
  { k: "line", pts: [-1, -0.9, 1, -0.9, 1, 0.9, -1, 0.9, -1, -0.9], w: 0.16, ink: "contrast", a: 0.5 },
  { k: "line", pts: [-0.62, -1.1, -0.62, -0.55], w: 0.16, ink: "contrast", a: 0.75 },
  { k: "line", pts: [0.0, -1.1, 0.0, -0.55], w: 0.16, ink: "contrast", a: 0.75 },
  { k: "line", pts: [-0.62, 0.55, -0.62, 1.1], w: 0.16, ink: "contrast", a: 0.75 },
  { k: "line", pts: [0.0, 0.55, 0.0, 1.1], w: 0.16, ink: "contrast", a: 0.75 },
];

/** One cuff band around a limb. The caller stretches it to the limb's width. */
export const CUFF_MARK: readonly LookShape[] = [
  { k: "rect", x: -1, y: -0.32, w: 2, h: 0.64, r: 0.2, ink: "contrast", a: 0.55 },
  { k: "rect", x: -1, y: -0.32, w: 2, h: 0.22, r: 0.1, ink: "ground", a: 0.35 },
];

/** A four point sparkle at the outer corner of a lens, from level 10. */
export const SPARKLE_MARK: readonly LookShape[] = [
  { k: "poly", pts: [0, -1, 0.26, -0.26, 1, 0, 0.26, 0.26, 0, 1, -0.26, 0.26, -1, 0, -0.26, -0.26], ink: "cream" },
];

/** The week champion's crown. Gold, and the only other gold on the robot. */
export const CROWN_MARK: readonly LookShape[] = [
  { k: "poly", pts: [-1, 0.55, -1, -0.5, -0.5, 0.05, 0, -0.85, 0.5, 0.05, 1, -0.5, 1, 0.55], ink: "gold" },
  { k: "rect", x: -1, y: 0.4, w: 2, h: 0.42, r: 0.16, ink: "gold" },
  { k: "ellipse", x: 0, y: -0.85, rx: 0.2, ry: 0.2, ink: "cream" },
];

/** The name's number rides a small plate. The digits are drawn as seven
 *  segments, so no font has to travel with a picture. */
export const PLATE_MARK: readonly LookShape[] = [
  { k: "rect", x: -1, y: -0.42, w: 2, h: 0.84, r: 0.3, ink: "contrast", a: 0.9 },
  { k: "rect", x: -0.93, y: -0.32, w: 1.86, h: 0.64, r: 0.24, ink: "ground", a: 0.85 },
];

/**
 * Seven segment digits, so a plate can print a number with no font. Each
 * segment is a horizontal or vertical bar in a unit box two tall and one and
 * a bit wide: top, top left, top right, middle, bottom left, bottom right,
 * bottom.
 */
const SEG: readonly (readonly [number, number, number, number])[] = [
  [-0.5, -1.0, 1.0, 0.22], [-0.61, -0.89, 0.22, 0.89], [0.39, -0.89, 0.22, 0.89],
  [-0.5, -0.11, 1.0, 0.22], [-0.61, 0.0, 0.22, 0.89], [0.39, 0.0, 0.22, 0.89],
  [-0.5, 0.78, 1.0, 0.22],
];
const DIGIT_SEGS: readonly number[] = [
  0b1110111, 0b0100100, 0b1011101, 0b1101101, 0b0101110,
  0b1101011, 0b1111011, 0b0100101, 0b1111111, 0b1101111,
];

/** The shapes for one digit, in a unit box. `ink` is left to the caller. */
export function digitShapes(d: number, ink: LookInk = "contrast"): LookShape[] {
  const bits = DIGIT_SEGS[Math.max(0, Math.min(9, d))] ?? 0;
  const out: LookShape[] = [];
  for (let i = 0; i < 7; i++) {
    if (!(bits & (1 << i))) continue;
    const [x, y, w, h] = SEG[i];
    out.push({ k: "rect", x, y, w, h, r: 0.09, ink });
  }
  return out;
}

/** The six stickers, the same six the rig draws as decals, in a unit box.
 *  The rig's numbers are at a 56 unit sticker width, so every number below is
 *  that number over 28. */
export const STICKER_SHAPES: Readonly<Record<StickerId, readonly LookShape[]>> = {
  plate: [
    { k: "rect", x: -1, y: -0.57, w: 2, h: 1.14, r: 0.21, ink: "contrast", a: 0.0 },
    { k: "line", pts: [-1, -0.57, 1, -0.57, 1, 0.57, -1, 0.57, -1, -0.57], w: 0.14, ink: "contrast" },
    { k: "ellipse", x: -0.5, y: 0, rx: 0.14, ry: 0.14, ink: "contrast" },
    { k: "ellipse", x: 0.5, y: 0, rx: 0.14, ry: 0.14, ink: "contrast" },
  ],
  bolt: [
    { k: "poly", pts: [-0.21, -1.07, 0.43, -1.07, 0.07, -0.21, 0.57, -0.21, -0.36, 1.07, -0.07, 0.14, -0.57, 0.14], ink: "contrast" },
  ],
  star: [{ k: "poly", pts: starPoly(1.07, 0.464), ink: "contrast" }],
  stripes: [
    { k: "rect", x: -1, y: -0.64, w: 2, h: 0.29, r: 0.14, ink: "contrast" },
    { k: "rect", x: -1, y: -0.14, w: 2, h: 0.29, r: 0.14, ink: "contrast" },
    { k: "rect", x: -1, y: 0.36, w: 2, h: 0.29, r: 0.14, ink: "contrast" },
  ],
  wrenches: [
    { k: "line", pts: [-0.79, 0.79, 0.79, -0.79], w: 0.25, ink: "contrast" },
    { k: "line", pts: [0.79, 0.79, -0.79, -0.79], w: 0.25, ink: "contrast" },
    { k: "ellipse", x: 0.79, y: -0.79, rx: 0.32, ry: 0.32, ink: "contrast" },
    { k: "ellipse", x: -0.79, y: -0.79, rx: 0.32, ry: 0.32, ink: "contrast" },
    { k: "ellipse", x: 0.93, y: -0.93, rx: 0.14, ry: 0.14, ink: "ground" },
    { k: "ellipse", x: -0.93, y: -0.93, rx: 0.14, ry: 0.14, ink: "ground" },
  ],
  heart: [
    { k: "ellipse", x: -0.39, y: -0.29, rx: 0.46, ry: 0.46, ink: "contrast" },
    { k: "ellipse", x: 0.39, y: -0.29, rx: 0.46, ry: 0.46, ink: "contrast" },
    { k: "poly", pts: [-0.82, -0.07, 0.82, -0.07, 0, 0.93], ink: "contrast" },
  ],
};

/**
 * The six hats. Every one of them changes the SKYLINE, because a hat that
 * only adds detail is invisible at ring size. The unit box sits on the head's
 * crown: y = 0 is the crown line and everything above it is negative.
 */
export const HAT_SHAPES: Readonly<Record<HatId, readonly LookShape[]>> = {
  bow: [
    { k: "poly", pts: [-1, -0.95, -0.18, -0.3, -1, 0.35], ink: "own" },
    { k: "poly", pts: [1, -0.95, 0.18, -0.3, 1, 0.35], ink: "own" },
    { k: "ellipse", x: 0, y: -0.3, rx: 0.3, ry: 0.3, ink: "own" },
    { k: "ellipse", x: 0, y: -0.36, rx: 0.13, ry: 0.13, ink: "cream", a: 0.55 },
  ],
  propeller: [
    { k: "rect", x: -1, y: -0.72, w: 2, h: 0.22, r: 0.11, ink: "own" },
    { k: "rect", x: -0.16, y: -0.72, w: 0.32, h: 0.72, r: 0.14, ink: "own" },
    { k: "ellipse", x: 0, y: -0.72, rx: 0.2, ry: 0.2, ink: "cream" },
  ],
  ears: [
    { k: "ellipse", x: -0.66, y: -0.5, rx: 0.46, ry: 0.56, ink: "own" },
    { k: "ellipse", x: 0.66, y: -0.5, rx: 0.46, ry: 0.56, ink: "own" },
    { k: "ellipse", x: -0.66, y: -0.44, rx: 0.22, ry: 0.3, ink: "cream", a: 0.5 },
    { k: "ellipse", x: 0.66, y: -0.44, rx: 0.22, ry: 0.3, ink: "cream", a: 0.5 },
  ],
  flag: [
    { k: "rect", x: -0.1, y: -1.3, w: 0.2, h: 1.4, r: 0.1, ink: "cream" },
    { k: "poly", pts: [0.06, -1.3, 1.0, -0.98, 0.06, -0.62], ink: "own" },
  ],
  bell: [
    { k: "rect", x: -0.12, y: -0.62, w: 0.24, h: 0.62, r: 0.12, ink: "cream" },
    { k: "ellipse", x: 0, y: -0.86, rx: 0.4, ry: 0.4, ink: "own" },
    { k: "ellipse", x: -0.12, y: -0.96, rx: 0.12, ry: 0.12, ink: "cream", a: 0.6 },
  ],
  spring: [
    { k: "line", pts: [0, 0, -0.36, -0.3, 0.36, -0.6, -0.36, -0.9, 0.2, -1.15], w: 0.2, ink: "own" },
    { k: "ellipse", x: 0.34, y: -1.28, rx: 0.34, ry: 0.34, ink: "own" },
    { k: "ellipse", x: 0.28, y: -1.36, rx: 0.12, ry: 0.12, ink: "cream", a: 0.6 },
  ],
};

/**
 * THE FACE, over the art's own lenses. `lid` is how far the eyelid has come
 * down, 0 to 1, per eye (left then right), and `mouth` is the curve drawn
 * under them: 1 is a smile, 0 is the art's own mouth left alone.
 */
export interface FaceDials {
  lid: readonly [number, number];
  smile: number;
  /** a star drawn over each lens instead of a lid */
  starEyes: boolean;
}

export const FACE_DIALS: Readonly<Record<FaceId, FaceDials>> = {
  calm: { lid: [0.08, 0.08], smile: 0, starEyes: false },
  happy: { lid: [0.22, 0.22], smile: 1, starEyes: false },
  wink: { lid: [0.92, 0.1], smile: 0.8, starEyes: false },
  stars: { lid: [0, 0], smile: 0.9, starEyes: true },
};

/** ink on a light ground, cream on a dark one. The one rule that decides
 *  whether a mark reads, copied from the rig's own decal rule so a sticker
 *  never changes colour between the ring and the card. */
export const CONTRAST_INK = 0x2b2f3a;
export const CONTRAST_CREAM = 0xf3e9d2;
export const GOLD = 0xf0b340;

export function luminance(rgb: number): number {
  return ((rgb >> 16) & 255) * 0.299 + ((rgb >> 8) & 255) * 0.587 + (rgb & 255) * 0.114;
}

/** the rig's own threshold: over 120 is a light paint */
export function contrastOn(ground: number): number {
  return luminance(ground) > 120 ? CONTRAST_INK : CONTRAST_CREAM;
}
export function groundOn(ground: number): number {
  return luminance(ground) > 120 ? CONTRAST_CREAM : CONTRAST_INK;
}

/** Resolve one ink role against the surface the mark is standing on. */
export function inkColor(ink: LookInk, ground: number, own: number): number {
  if (ink === "gold") return GOLD;
  if (ink === "cream") return CONTRAST_CREAM;
  if (ink === "ink") return CONTRAST_INK;
  if (ink === "own") return own;
  if (ink === "ground") return groundOn(ground);
  return contrastOn(ground);
}

/** The eight paints as numbers, so a drawing surface never parses a string.
 *  Mirrored from _ui/tokens.ts PAINTS the way the engine mirrors PAINT_IDS. */
export const PAINT_HEX: Readonly<Record<PaintId, number>> = {
  mint: 0x8fd9c4,
  coral: 0xff8a7a,
  butter: 0xffd166,
  sky: 0x7fb8ff,
  lilac: 0xb9a7ff,
  moss: 0x8fbf6a,
  // kept in step with PAINTS in _ui/tokens.ts, and warmed for the same
  // reason: a paint is applied by MULTIPLY, so the old near-white cream moved
  // the clay by 43 against 90 to 287 for every other paint, and a cream robot
  // read as an unpainted one everywhere it was drawn
  cream: 0xecd9a8,
  ink: 0x2b2f3a,
};

/** BARE CLAY, which is not a paint. It is what a part with no colour of its
 *  own wears: a weapon (ADR-0141), and any row that never recorded one. It
 *  used to be spelled PAINT_HEX.cream, which is why cream could never be
 *  warmed without turning every uncoloured part warm with it. */
export const NO_PAINT_HEX = 0xf3e9d2;

export const paintHex = (p: PaintId | null | undefined): number =>
  (p && PAINT_HEX[p]) || NO_PAINT_HEX;

/** every paint id, for a gate that wants to walk them */
export const LOOK_PAINT_IDS: readonly PaintId[] = PAINT_IDS;

// ── THE SERVER TRUTH ────────────────────────────────────────────────────────
/**
 * Everything above says what a look IS and how it is drawn. Everything below
 * says where a look COMES FROM, which is server rows and nothing else.
 *
 * THE ONE RULE THIS HALF EXISTS TO KEEP: what a robot has earned is derived
 * from rows (wins, losses, level, part instances, hat rows, cards), never
 * from localStorage and never from what a request says about itself. The
 * routes read the rows, hand them here as plain values, and take back a
 * LookEarned; a claimed look is then checked against that LookEarned and
 * nothing else. This file never opens a database and never sees a request.
 */

/* -- found colour: the part's colour on every socket it fills ------------- */

/** One colour per socket, or null where a socket is empty. */
export type SocketPaints = Record<Socket, PaintId | null>;

export function emptyPaints(): SocketPaints {
  return { head: null, torso: null, armL: null, armR: null, legL: null, legR: null, weapon: null };
}

/**
 * The colour on each of the seven sockets, from the colour of the card in
 * each of the five slots.
 *
 * A pair card colours both of its sockets, and THE WEAPON RIDES THE ARM: a
 * weapon never carries a colour of its own (ADR-0141, and the shelf keeps
 * the same rule), so it takes the arm's, which is what a player sees when a
 * robot holds a spanner in a mint fist. This is why a normal robot reads as
 * four colours and not five.
 */
export function socketPaints(colourOfSlot: (slot: CardSlot) => PaintId | null | undefined): SocketPaints {
  const out = emptyPaints();
  for (const socket of SOCKETS) {
    if (socket === "weapon") continue;
    const c = colourOfSlot(CARD_OF_SOCKET[socket]);
    out[socket] = isPaintId(c) ? c : null;
  }
  out.weapon = out.armR ?? out.armL;
  return out;
}

/** The four body slots in the order LookEarned.paints is documented in. */
export const BODY_CARD_ORDER: readonly CardSlot[] = ["head", "torso", "arms", "legs"];

/** LookEarned.paints: the robot's own colours, head, torso, arms, legs, with
 * empty slots left out. A weapon is never one of them. */
export function bodyPaints(colourOfSlot: (slot: CardSlot) => PaintId | null | undefined): PaintId[] {
  const out: PaintId[] = [];
  for (const slot of BODY_CARD_ORDER) {
    const c = colourOfSlot(slot);
    if (isPaintId(c)) out.push(c);
  }
  return out;
}

/** The different colours a robot is wearing, first seen first. */
export function ownColours(paints: readonly (PaintId | null | undefined)[]): PaintId[] {
  const out: PaintId[] = [];
  for (const c of paints) if (isPaintId(c) && !out.includes(c)) out.push(c);
  return out;
}

/** How many colours it wears at once. Four is the normal one. */
export function colourCount(paints: readonly (PaintId | null | undefined)[]): number {
  return ownColours(paints).length;
}

/**
 * THE COLOUR MATCH that unlocks the wink: all four body parts in one colour.
 * The same thing the game already calls a matched set on the shelf and in
 * the pit, so a player meets one idea and not two.
 */
export function colourMatched(bodyColours: readonly PaintId[], bodyCount: 4 | 6 = 4): boolean {
  return bodyColours.length === bodyCount && ownColours(bodyColours).length === 1;
}

/** The star count that counts as a four star part. */
export const FOUR_STAR = 4;

/**
 * The hats a wallet has, each one once. A wallet that wins two coral bows
 * has one coral bow to wear, and a moss bow beside it is a different hat.
 * Order is kept, so the row a player sees first is the one they won first.
 */
export function dedupeHats(rows: readonly unknown[]): HatWon[] {
  const out: HatWon[] = [];
  for (const r of rows) {
    const h = toHatWon(r);
    if (h && !out.some((x) => sameHat(x, h))) out.push(h);
  }
  return out;
}

/* -- what this wallet has unlocked ---------------------------------------- */

/** The server rows findsOf reads. Plain values, never a database handle, so
 * a route does the reading and a check script can hand it a table. */
export interface LookRows {
  wins: number;
  losses: number;
  level: number;
  /** a week champion card exists for this robot */
  champion: boolean;
  /** the colour of each BODY part on this robot, head, torso, arms, legs */
  bodyPaints: readonly PaintId[];
  /** Legacy pair builds require four cards; independent limbs require six pieces. */
  bodyCount?: 4 | 6;
  /** the star count of every part this robot is wearing */
  partStars: readonly number[];
  /** every hat this wallet has won, kind and colour */
  hats: readonly HatWon[];
  /** the number off the robot's name, or null */
  plateNumber: number | null;
}

/**
 * WHAT THIS WALLET HAS UNLOCKED, from server rows. This is the one function
 * that turns rows into a LookEarned, and every route uses it, so there is a
 * single answer to "may this robot wear this" on every screen.
 *
 * WHY `repairs` COUNTS LOST FIGHTS. The patch ladder is drawn once per trip
 * to the workshop, and the game's own published rule is that a robot which
 * loses a real fight is being fixed for a day (strings.ts beingFixed), so a
 * lost fight and a patch are the same event to a player and the mark's line
 * says exactly that. Counting rows in the battles table instead would be one
 * count query per robot per screen, and a separate stored counter would read
 * zero for every robot that already has a history.
 */
export function findsOf(rows: LookRows): LookEarned {
  return {
    wins: Math.max(0, Math.floor(Number(rows.wins) || 0)),
    level: Math.max(1, Math.floor(Number(rows.level) || 1)),
    repairs: Math.max(0, Math.floor(Number(rows.losses) || 0)),
    champion: !!rows.champion,
    colourMatch: colourMatched(rows.bodyPaints.filter(isPaintId), rows.bodyCount ?? 4),
    fourStar: rows.partStars.some((t) => Number(t) >= FOUR_STAR),
    hats: dedupeHats(rows.hats),
    paints: rows.bodyPaints.filter(isPaintId),
    plateNumber: rows.plateNumber,
  };
}

/** The marks a robot has earned, straight off the four numbers a bot row
 * carries. A thin name over earnedMarks for callers that hold rows. */
export function marksOf(wins: number, losses: number, level: number, isWeekChampion: boolean): LookMarks {
  return earnedMarks({ ...NOTHING_EARNED, wins, repairs: losses, level, champion: isWeekChampion });
}

/* -- the authored tables, each row with its own earn line ----------------- */

export interface FaceRow {
  id: FaceId;
  name: string;
  /** how you get it, one line, and the only explanation the game gives */
  earn: string;
}

export const FACES: readonly FaceRow[] = [
  { id: "calm", name: "Calm", earn: "Any robot can wear this one." },
  { id: "happy", name: "Happy", earn: "Any robot can wear this one." },
  { id: "wink", name: "Wink", earn: "Wear every body part in the same colour." },
  { id: "stars", name: "Stars", earn: "Wear a four star part." },
];

export const FACE_INDEX: Readonly<Record<FaceId, FaceRow>> = Object.fromEntries(
  FACES.map((f) => [f.id, f]),
) as Record<FaceId, FaceRow>;

export interface StickerRow {
  id: StickerId;
  name: string;
  earn: string;
}

const ANY_ROBOT = "Any robot can wear this one.";

export const STICKERS: readonly StickerRow[] = [
  { id: "plate", name: "Plate", earn: ANY_ROBOT },
  { id: "bolt", name: "Bolt", earn: ANY_ROBOT },
  { id: "star", name: "Star", earn: ANY_ROBOT },
  { id: "stripes", name: "Stripes", earn: ANY_ROBOT },
  { id: "wrenches", name: "Spanners", earn: ANY_ROBOT },
  { id: "heart", name: "Heart", earn: ANY_ROBOT },
];

export const STICKER_INDEX: Readonly<Record<StickerId, StickerRow>> = Object.fromEntries(
  STICKERS.map((s) => [s.id, s]),
) as Record<StickerId, StickerRow>;

export interface SpotRow {
  id: StickerSpot;
  name: string;
  /** where it sits, one line */
  earn: string;
}

export const SPOTS: readonly SpotRow[] = [
  { id: "chest", name: "Chest", earn: "On the front of its body." },
  { id: "cheek", name: "Cheek", earn: "Under one eye." },
  { id: "boot", name: "Boot", earn: "Around one boot." },
];

export const SPOT_INDEX: Readonly<Record<StickerSpot, SpotRow>> = Object.fromEntries(
  SPOTS.map((s) => [s.id, s]),
) as Record<StickerSpot, SpotRow>;

export interface HatRow {
  id: HatId;
  name: string;
  earn: string;
}

/** Hats have ONE way in, and every row says so. Never on the shelf, never
 * bought, and recycle refuses them. */
export const HAT_EARN = "Earned through fights and small milestones.";

export const HATS: readonly HatRow[] = [
  { id: "bow", name: "Bow", earn: HAT_EARN },
  { id: "propeller", name: "Propeller", earn: HAT_EARN },
  { id: "ears", name: "Ears", earn: HAT_EARN },
  { id: "flag", name: "Flag", earn: HAT_EARN },
  { id: "bell", name: "Bell", earn: HAT_EARN },
  { id: "spring", name: "Spring", earn: HAT_EARN },
];

export const HAT_INDEX: Readonly<Record<HatId, HatRow>> = Object.fromEntries(
  HATS.map((h) => [h.id, h]),
) as Record<HatId, HatRow>;

/** The earned marks, each with the one line that says how it is earned. */
export const MARK_EARN = {
  star: "A star on the chest at 1, 5, 10, 15, 20 and 25 wins. The 25th one is gold, and after that the plate prints the number.",
  patch: "A stitched patch for every fight it lost. Three are sewn on and the rest are counted.",
  cuff: "A band on each cuff. One at level 5, two at level 10.",
  sparkle: "Eyes that sparkle at level 10.",
  crown: "A gold crown for the robot that wins the week.",
} as const;

/**
 * The card row a crown reads. A crown is a row in battle_bots_cards, the
 * same table the first win collectible uses (_server/cards.ts), so a robot
 * wears a crown because a card says so. Nothing writes this kind yet; the
 * weekly job does, and the crown appears the day it does.
 */
export const CROWN_CARD_KIND = "champion-week";

/**
 * The marks as plain sentences, in the order they are drawn. Empty rows are
 * left out, so a brand new robot returns nothing and a screen prints nothing
 * rather than "0 stars". NOTHING HERE STOPS: past the last drawn star the
 * win count itself is printed, and past the third patch the rest are said in
 * words.
 */
export function markWords(m: LookMarks, wins = 0): string[] {
  const out: string[] = [];
  const w = Math.max(0, Math.floor(Number(wins) || 0));
  if (m.goldStar) out.push(`A gold star and ${w} ${w === 1 ? "win" : "wins"}.`);
  else if (m.stars > 0) out.push(`${m.stars} ${m.stars === 1 ? "star" : "stars"} for ${w} ${w === 1 ? "win" : "wins"}.`);
  if (m.patchesBeyond > 0) out.push(`${PATCHES_DRAWN} patches and ${m.patchesBeyond} more.`);
  else if (m.patches > 0) out.push(`${m.patches} ${m.patches === 1 ? "patch" : "patches"}.`);
  if (m.cuffs === 2) out.push("Two cuff bands.");
  else if (m.cuffs === 1) out.push("One cuff band.");
  if (m.sparkle) out.push("Eyes that sparkle.");
  if (m.crown) out.push("A crown for the week.");
  return out;
}

/* -- checking a claim ----------------------------------------------------- */

export function isFaceId(v: unknown): v is FaceId {
  return typeof v === "string" && (FACE_IDS as readonly string[]).includes(v);
}
export function isStickerId(v: unknown): v is StickerId {
  return typeof v === "string" && (STICKER_IDS as readonly string[]).includes(v);
}
export function isStickerSpot(v: unknown): v is StickerSpot {
  return typeof v === "string" && (STICKER_SPOTS as readonly string[]).includes(v);
}
export function isHatId(v: unknown): v is HatId {
  return typeof v === "string" && (HAT_IDS as readonly string[]).includes(v);
}

/**
 * A refused look. The message is the sentence the player reads, so a route
 * passes it straight to refuse(400, e.message) with nothing in between.
 */
export class LookRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookRefused";
  }
}

/**
 * CHECK A CLAIMED LOOK AGAINST WHAT THE WALLET ACTUALLY OWNS AND EARNED,
 * AND THROW ON ANYTHING ELSE. This is the SAVE path.
 *
 * normalizeLook() above is the READ path: it takes a look the server itself
 * wrote and quietly drops whatever has gone stale, because a robot must
 * still draw after its owner takes a part off from under its sticker. That
 * is the wrong answer for a save. A request asking for a face nobody earned
 * is either a cheat or a screen that has drifted, and quietly storing a
 * different look than the one that was asked for hides both. So the two
 * paths share every rule and differ only in what they do when a rule is
 * broken: the read path forgets it, the save path says so out loud.
 *
 * Only the four chosen things are read out of the request. The plate number
 * is the robot's name and is taken from `earned`, so a request cannot print
 * a number the robot is not called.
 */
export function parseLook(raw: BotLookRaw | null | undefined, earned: LookEarned): BotLook {
  const r = raw || {};

  let face: FaceId = "calm";
  if (r.face != null) {
    if (!isFaceId(r.face)) throw new LookRefused("Pick one of the faces.");
    if (!faceAllowed(r.face, earned)) {
      throw new LookRefused(`${FACE_INDEX[r.face].name} is not ready yet. ${FACE_INDEX[r.face].earn}`);
    }
    face = r.face;
  }

  const rawSticker = r.sticker !== undefined ? r.sticker : r.decal;
  let sticker: StickerId | null = null;
  if (rawSticker != null) {
    if (!isStickerId(rawSticker)) throw new LookRefused("Pick one of the stickers.");
    sticker = rawSticker;
  }

  let spot: StickerSpot = "chest";
  if (r.spot != null) {
    if (!isStickerSpot(r.spot)) throw new LookRefused("Pick a place for the sticker.");
    spot = r.spot;
  }

  // a sticker wears one of the robot's OWN colours. There is no paint for
  // sale, so a colour that is not on the robot is not a colour it has.
  const own = earned.paints.filter(isPaintId);
  let stickerPaint: PaintId | null = own[0] ?? null;
  if (r.stickerPaint != null) {
    if (!isPaintId(r.stickerPaint) || !own.includes(r.stickerPaint)) {
      throw new LookRefused("Pick a colour your robot is wearing.");
    }
    stickerPaint = r.stickerPaint;
  }

  // A HAT IS NEVER BOUGHT, so the only hat a save may name is one this wallet
  // already has a row for, in the colour that row records. There is no field
  // here in which to ask for a colour a hat did not arrive in.
  let hat: HatWon | null = null;
  if (r.hat != null) {
    const want = toHatWon(r.hat);
    if (!want) throw new LookRefused("Pick one of the hats you have won.");
    const owned = earned.hats.find((h) => sameHat(h, want))
      ?? (want.color === null ? earned.hats.find((h) => h.kind === want.kind) : undefined);
    if (!owned) throw new LookRefused(`You have not won that hat yet. ${HAT_EARN}`);
    hat = owned;
  }

  return { face, sticker, spot, stickerPaint, hat, plateNumber: earned.plateNumber ?? null };
}

/* -- the hat drop --------------------------------------------------------- */

/**
 * The hat a fight hands out, from the fight id alone.
 *
 * Pure and deterministic, for the same reason shipment.ts dropColor() is:
 * the row is written once but the write is retried and replayed, and a hat
 * that changed between two attempts would be a different hat each time.
 *
 * THE ONE ENTRY POINT. Anything that gives out a hat calls this. It decides
 * only WHICH hat. Whether a hat is won at all is the fight's existing drop
 * roll, and that lives beside the part drop in _server/fights.ts, because a
 * second roll would be a second rule.
 */
export function hatDrop(fightId: string): HatId {
  const rng = mulberry32(fnv1a(`bb:hat:${fightId}`));
  return HAT_IDS[Math.floor(rng() * HAT_IDS.length)];
}

/**
 * The colour that hat turned up in, from the fight id alone.
 *
 * A SEPARATE FORK, not a second draw off the kind's stream, which is the
 * shipment's own habit (dropColor keys its stream on the fight AND the part,
 * so a fight that drops two things gives them independent colours). Keeping
 * the two streams apart means the kind table and the palette can each grow
 * without the other one's answers all shifting along, and a stored hat and a
 * replayed one can never come out different colours.
 *
 * IT SELECTS, IT NEVER DESIGNS. The colours are the game's own paints, the
 * ones a part arrives in, so a hat never puts a ninth colour into the game
 * and there is still nothing to buy.
 */
export function hatDropColor(fightId: string): PaintId {
  const rng = mulberry32(fnv1a(`bb:hatcolor:${fightId}`));
  return HAT_PAINTS[Math.floor(rng() * HAT_PAINTS.length)];
}

/** THE ONE ENTRY POINT for "what did this fight's hat turn out to be". The
 *  resolver and the insert both call it, so they cannot disagree. */
export function hatWonOf(fightId: string): HatWon {
  return { kind: hatDrop(fightId), color: hatDropColor(fightId) };
}

/**
 * THE COLOURS A HAT CAN TURN UP IN: the game's paints, minus black.
 *
 * A HAT IS THE ONE THING DRAWN OUTSIDE THE ROBOT. Every other mark sits on
 * clay: a star is on a chest, a sticker is on a boot, a patch is on a body,
 * and each of them is read against the part under it. A hat breaks the
 * head's outline on purpose, which is what makes it read at ring size, and
 * that means the thing behind it is the PAGE.
 *
 * Every ground this game has is dark: the page is #080b14, a panel is
 * #0d1120, and the knockout share card is a gradient between #131826 and
 * #080b14. Measured against the two ends of that range, seven of the eight
 * paints give a contrast of 7.7 to 1 or better and black gives 1.32 to 1. It
 * is a cliff, not a slope, so no threshold has to be argued: black is the one
 * colour in which a won hat would be an empty space over a robot's head.
 * (Rendered both ways before this was written: an ink bell on an ink robot
 * and again on a cream one, on a dark ground and a light one.)
 *
 * A ROBOT MAY STILL BE BLACK. This is not a rule about paint, it is a rule
 * about the one mark with nothing behind it. If a light surface is ever
 * added, this table is where to look: on a light ground the three that fall
 * over are white, yellow and light green, and the answer then is an outline
 * on the shape rather than a shorter table.
 */
export const HAT_PAINTS: readonly PaintId[] = PAINT_IDS.filter((p) => p !== "ink");

/** The only fight that ever hands out a hat: the hardest house robot. */
export const HAT_FROM_MODE = "pve";
export const HAT_FROM_DIFFICULTY = "hard";

/** What the fight resolver knows at the moment it decides. Plain values, so a
 *  check script can walk a thousand of them without a database. */
export interface HatDropInput {
  mode: string;
  difficulty: string | null | undefined;
  attackerWon: boolean;
  /** did the fight's OWN drop roll give a part */
  droppedPart: boolean;
}

/**
 * DOES THIS FIGHT HAND OUT A HAT, AND WHICH ONE. Null for every other fight.
 *
 * THERE IS NO SECOND ROLL. A hat rides the drop roll the fight already made
 * (_engine/rewards.ts pveDrops), because a second roll would be a second rule
 * and the two would drift apart the first time either one moved. So the hat's
 * odds ARE the part's odds on the hardest fight, and nothing here can change
 * that without changing what a part costs to win.
 *
 * IT LIVES HERE, NOT IN THE ROUTE, so the check script can import the very
 * line the resolver runs. A gate that restated this condition would reproduce
 * the route's assumptions and pass while the route drifted.
 */
export function hatWonFor(fightId: string, o: HatDropInput): HatWon | null {
  if (o.mode !== HAT_FROM_MODE) return null;
  if (o.difficulty !== HAT_FROM_DIFFICULTY) return null;
  if (!o.attackerWon) return null;
  if (!o.droppedPart) return null;
  return hatWonOf(fightId);
}

/**
 * THE ONE ANSWER TO "WHICH COLOUR IS THAT HAT", for every surface: the ring,
 * the garage lift, the portrait and the card.
 *
 * A hat wears the colour it turned up in. A hat with no colour of its own is
 * a row written before the colour was recorded, and its honest answer is the
 * head's, which is exactly the picture every surface drew before hats had
 * colours. This lives here rather than three times over because three
 * fallbacks are three chances for the same robot to wear two different hats
 * on two screens.
 */
export function hatPaint(hat: HatWon | null | undefined, paints: SocketPaints): PaintId | null {
  if (!hat) return null;
  return hat.color ?? paints.head ?? null;
}

/* -- how many robots look like this one ----------------------------------- */

/**
 * The fingerprint two robots share when they LOOK the same: the seven
 * colours, the face, the sticker and its place, and the hat.
 *
 * Marks and the plate number are left out on purpose. Marks are a history,
 * not a look, and two robots with the same parts and the same face do look
 * the same even when one of them has won more fights.
 */
export function lookKey(look: BotLook, paints: SocketPaints): string {
  const colours = SOCKETS.map((s) => paints[s] ?? "-").join(",");
  const sticker = look.sticker ? `${look.sticker}:${look.spot}:${look.stickerPaint ?? "-"}` : "-";
  const hat = look.hat ? `${look.hat.kind}:${look.hat.color ?? "-"}` : "-";
  return `${colours}|${look.face}|${sticker}|${hat}`;
}

/**
 * The line under the bay sheet. `others` is how many OTHER robots share this
 * look, counted on the server. A count of robots, never a score, never
 * capped.
 */
export function twinWords(others: number): string {
  const n = Math.max(0, Math.floor(Number(others) || 0));
  if (n === 0) return "Only yours looks like this.";
  if (n === 1) return "1 other robot looks like this one.";
  return `${n} other robots look like this one.`;
}

/* -- the eyelid, in the shape vocabulary ---------------------------------- */
/**
 * A LID IS A PIECE OF THE LENS, NOT A DISC ON THE FACE.
 *
 * The rig has drawn it correctly since the mood dials landed (rig.ts
 * paintLidOne): the lid is the part of the LENS above a horizontal chord, so
 * it is a circular segment that can never spill onto the forehead, and the
 * chord carries one darker crease, which is what stops a closed eye reading
 * as a hole. A lid drawn as a whole disc slid down over the eye looks like a
 * bruise at any closure short of shut, which is exactly what the first
 * portrait draft looked like.
 *
 * The rig draws that segment with an arc, because it has a Graphics. A
 * picture composed over raw pixels has polygons and ellipses, so the same
 * segment is generated here as a polygon in a UNIT LENS (centre 0, radius 1)
 * and every constant below is the rig's own.
 *
 * FOLLOW UP, and it is the last copy in this lane: rig.ts still holds these
 * five constants privately. When the rig lane is next in that file, import
 * them from here so a lid that changes changes in both pictures at once.
 */
export const LID = {
  /** drawn a hair proud of the lens, or a rim of bulb shows all round it */
  over: 1.06,
  /** the closure at which the seam settles and starts to bow */
  seamC: 0.66,
  /** update() clamps the closure here, so this is where the bow is full */
  seamFull: 0.98,
  /** how far the shut seam's ends lift above its middle, x the lens radius */
  seamBow: 0.3,
  /** how much narrower the shut seam is than the lens */
  seamNarrow: 0.14,
  /** below this closure there is no lid at all */
  none: 0.02,
  /** the head's own value at the eye's row: clay x the bake's vertical ramp */
  value: 0.73,
} as const;

/** how many points the arc is sampled at: 14 is under a tenth of a pixel of
 *  chord error on a 432 px picture, and invisible on a 64 px one */
const LID_ARC = 14;

/**
 * One eyelid at a closure, in a unit lens. `own` is the lid's fill (the
 * caller passes the head's colour at the eye's row, scaleRgb(head, LID.value))
 * and `ink` is the crease.
 */
export function lidShapes(closure: number): LookShape[] {
  const c = Math.min(1, closure);
  if (c <= LID.none) return [];
  const r = LID.over;
  const out: LookShape[] = [];
  const chord = (k: number) => -r + 2 * r * k;
  const yL = chord(c);
  const yS = Math.min(yL, chord(LID.seamC));
  const bow = Math.max(0, Math.min(1, (c - LID.seamC) / (LID.seamFull - LID.seamC)));
  if (c >= 0.97) {
    out.push({ k: "ellipse", x: 0, y: 0, rx: r, ry: r, ink: "own" });
  } else {
    const half = Math.sqrt(Math.max(0, r * r - yL * yL));
    const pts: number[] = [-half, yL];
    for (let i = 0; i <= LID_ARC; i++) {
      const x = -half + (2 * half * i) / LID_ARC;
      pts.push(x, -Math.sqrt(Math.max(0, r * r - x * x)));
    }
    pts.push(half, yL);
    out.push({ k: "poly", pts, ink: "own" });
    if (bow > 0.02) {
      // the lower lid: the disc BELOW the seam, arriving with the bow
      const hs = Math.sqrt(Math.max(0, r * r - yS * yS));
      const low: number[] = [hs, yS];
      for (let i = 0; i <= LID_ARC; i++) {
        const x = hs - (2 * hs * i) / LID_ARC;
        low.push(x, Math.sqrt(Math.max(0, r * r - x * x)));
      }
      low.push(-hs, yS);
      out.push({ k: "poly", pts: low, ink: "own", a: bow });
    }
  }
  // the seam: straight on the chord while the eye is open, a shallow smile
  // sitting on the lower lid line once it is shut
  const hs = Math.sqrt(Math.max(0, r * r - yS * yS)) * (1 - LID.seamNarrow * bow);
  const lift = LID.seamBow * r * bow;
  const seam: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    // the rig's quadratic, sampled: (-hs, yS-lift) -> (0, yS+lift) -> (hs, yS-lift)
    const x = (1 - t) * (1 - t) * -hs + 2 * (1 - t) * t * 0 + t * t * hs;
    const y = (1 - t) * (1 - t) * (yS - lift) + 2 * (1 - t) * t * (yS + lift) + t * t * (yS - lift);
    seam.push(x, y);
  }
  out.push({ k: "line", pts: seam, w: 0.09, ink: "contrast", a: 0.75 });
  return out;
}

/** one channel-wise scale of a colour, the rig's scaleRgb */
export function scaleRgb(rgb: number, k: number): number {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f((rgb >> 16) & 255) << 16) | (f((rgb >> 8) & 255) << 8) | f(rgb & 255);
}

/** the bounding box of a list of unit-box shapes, for a caller that has to
 *  make room for one (a hat and a crown both stand above the head) */
export function shapesBox(shapes: readonly LookShape[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const put = (ax: number, ay: number, bx: number, by: number) => {
    x0 = Math.min(x0, ax); y0 = Math.min(y0, ay);
    x1 = Math.max(x1, bx); y1 = Math.max(y1, by);
  };
  for (const s of shapes) {
    if (s.k === "ellipse") put(s.x - s.rx, s.y - s.ry, s.x + s.rx, s.y + s.ry);
    else if (s.k === "rect") put(Math.min(s.x, s.x + s.w), Math.min(s.y, s.y + s.h), Math.max(s.x, s.x + s.w), Math.max(s.y, s.y + s.h));
    else {
      const pad = s.k === "line" ? s.w / 2 : 0;
      for (let i = 0; i < s.pts.length; i += 2) put(s.pts[i] - pad, s.pts[i + 1] - pad, s.pts[i] + pad, s.pts[i + 1] + pad);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
}
