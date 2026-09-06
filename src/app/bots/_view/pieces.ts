/**
 * HOW A ROBOT IS PUT TOGETHER. The one place.
 *
 * This is the assembly the KNOCKOUT CARD used to keep privately: which PNG
 * draws which part, where each piece sits relative to the others, and how big
 * the whole figure is. Every small picture of a robot now reads it, so the
 * portrait route, the knockout card and anything that comes after cannot
 * disagree about where a leg goes.
 *
 * IT IS PURE, AND THAT IS THE POINT. No pixi, no node, no react, no server
 * import. The rig (src/app/bots/_view/rig.ts) runs in a browser on a GPU, the
 * knockout card runs on the edge inside Satori, and the portrait route runs
 * on node over a raw pixel buffer. All three need the same numbers, so the
 * numbers live somewhere all three can reach.
 *
 * NOTHING HERE REACHES THE SIM. Not one number below is read by the engine,
 * so no replay hash can move. (Rollup unchanged: T1vT1 fa0df511, T2vT2
 * 98c10093, T3vT3 e750eafb, T4vT4 9e5392ed, all 9fd36ca7.)
 *
 * THE FRAME. Everything is in FIGURE SPACE: @2x canvas units with the origin
 * at the TORSO canvas's top-left corner, exactly as rig-points.ts lays the
 * pivots out. Negative x and negative y are legal and normal (the head's
 * canvas starts well above and to the left of the torso's). BOUNDS is the
 * union of every piece's canvas; INK_ORIGIN and the crop the portrait uses
 * are computed from real pixels at render time, because a canvas carries
 * margin and a margin at 64 px is most of the picture.
 *
 * WHAT CHANGED FROM THE CARD'S PRIVATE COPY: the left arm and the left leg
 * are MIRRORED, as they are on the rig (rig.ts MIRRORED). The card drew both
 * shoes splaying the same way, which is a robot standing pigeon-toed on one
 * foot and toeing out on the other. Mirroring the leg also moves it, because
 * the leg's hip pivot is not the middle of its canvas.
 */
import { CARD_BY_ID, type CardSlot, type Socket } from "@/lib/bots/fixtures";
import { partTier, partTotal, type Build, type PaintId, type Part, type Slot } from "@/app/bots/_engine/parts";
import { FIGURE, RIG, maskFile, partFile, type ArtSlot } from "./rig-points";
import { bodyPaints, paintHex, socketPaints, type SocketPaints } from "@/lib/bots/look";

// ── the pieces ──────────────────────────────────────────────────────────────

/** A piece IS a socket: the same seven names the rig and SocketPaints use. */
export type PieceName = Socket;

export interface Piece {
  name: PieceName;
  /** which art canvas draws it */
  slot: ArtSlot;
  /** which build slot owns it, and therefore whose colour it wears */
  part: Slot;
  /** the canvas's top-left corner in figure space */
  x: number;
  y: number;
  w: number;
  h: number;
  /** drawn flipped in x about its own canvas, as the rig flips it */
  mirror: boolean;
}

/**
 * Lay the seven pieces out. rig.ts DRAW_ORDER (JOIN.drawOrder) is legs, arms,
 * torso, head, weapon, and the card's own order interleaved the right leg
 * after the torso so it reads in front of the skirt; both are kept here in
 * the one order the rig actually draws.
 */
/**
 * THE ONE PLACE THE CONTRACT IS OVERRULED, and rig.ts overrules it the same
 * way for the same reason (rig.ts SHOULDER_X): the contract's shoulders are
 * 0.594 H apart, which leaves a four pixel hairline of BACKGROUND running
 * down both sides of the chest, and a hairline between an arm and a body is
 * the exact thing Mike called cheap. The shoulder is pulled in to whatever
 * guarantees an overlap of an eighth of a limb width against the target
 * torso, and not one unit further.
 *
 * It is derived here rather than imported because rig.ts is a "use client"
 * module that pulls in Pixi types; the derivation is three lines of FIGURE.
 * FOLLOW UP: when the rig lane is next in rig.ts, export SHOULDER_X from
 * there or move it here, so the two cannot drift.
 */
const SHOULDER_IN = (() => {
  const limbW = FIGURE.ratio.armW.target * FIGURE.H; // 84
  const contract = RIG.torso.shoulderR[0] - RIG.torso.neck[0]; // 167
  const pulled = (FIGURE.ratio.bodyW.target * FIGURE.H) / 2 + limbW / 2 - limbW / 8; // 151.6
  return Math.min(contract, pulled);
})();

/** the shoulder the rig actually hangs an arm from, in figure space */
export const SHOULDER = {
  L: [RIG.torso.neck[0] - SHOULDER_IN, RIG.torso.shoulderL[1]] as const,
  R: [RIG.torso.neck[0] + SHOULDER_IN, RIG.torso.shoulderR[1]] as const,
};

function layout(): Piece[] {
  const T = { ...RIG.torso, shoulderL: SHOULDER.L, shoulderR: SHOULDER.R };
  /** a piece placed with its own pivot on a figure-space point */
  const at = (px: number, py: number, pivot: readonly [number, number], w: number, h: number, mirror: boolean) => ({
    x: mirror ? px - (w - pivot[0]) : px - pivot[0],
    y: py - pivot[1],
    w,
    h,
    mirror,
  });
  const head = at(T.neck[0], T.neck[1], RIG.head.neck, RIG.head.w, RIG.head.h, false);
  const armL = at(T.shoulderL[0], T.shoulderL[1], RIG.arm.shoulder, RIG.arm.w, RIG.arm.h, true);
  const armR = at(T.shoulderR[0], T.shoulderR[1], RIG.arm.shoulder, RIG.arm.w, RIG.arm.h, false);
  const legL = at(T.hipL[0], T.hipL[1], RIG.leg.hip, RIG.leg.w, RIG.leg.h, true);
  const legR = at(T.hipR[0], T.hipR[1], RIG.leg.hip, RIG.leg.w, RIG.leg.h, false);
  // the weapon rides the RIGHT hand, and the hand is a point inside the arm
  const hand = { x: T.shoulderR[0] + (RIG.arm.hand[0] - RIG.arm.shoulder[0]), y: T.shoulderR[1] + (RIG.arm.hand[1] - RIG.arm.shoulder[1]) };
  const weapon = at(hand.x, hand.y, RIG.weapon.grip, RIG.weapon.w, RIG.weapon.h, false);
  return [
    { name: "legL", slot: "leg", part: "legs", ...legL },
    { name: "armL", slot: "arm", part: "arms", ...armL },
    { name: "torso", slot: "torso", part: "torso", ...at(T.neck[0], T.neck[1], T.neck, T.w, T.h, false) },
    { name: "legR", slot: "leg", part: "legs", ...legR },
    { name: "head", slot: "head", part: "head", ...head },
    { name: "armR", slot: "arm", part: "arms", ...armR },
    { name: "weapon", slot: "weapon", part: "weapon", ...weapon },
  ];
}

/** the seven pieces, in draw order, back to front */
export const PIECES: readonly Piece[] = layout();

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
}

const boxOf = (parts: readonly { x: number; y: number; w: number; h: number }[]): Box => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of parts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
};

/** every canvas, margins and all: what a compositor must allocate */
export const BOUNDS: Box = boxOf(PIECES);

/**
 * Where the INK is, near enough, with no pixels read: the contract's own
 * figure, from the head's apex to the floor and across the stance, plus the
 * weapon's canvas. A compositor that has decoded the art should measure the
 * real alpha instead (inkBox below); this is the fallback for one that has
 * not, and the frame the drawn stand-in is drawn into.
 */
export const FIGURE_INK: Box = (() => {
  const head = PIECES.find((p) => p.name === "head")!;
  const weapon = PIECES.find((p) => p.name === "weapon")!;
  const crownY = head.y + FIGURE.headApexY;
  const floorY = RIG.torso.hipL[1] + (RIG.leg.foot[1] - RIG.leg.hip[1]);
  const halfW = (FIGURE.ratio.headFullW.target * FIGURE.H) / 2;
  const minX = Math.min(RIG.torso.neck[0] - halfW, PIECES.find((p) => p.name === "legL")!.x + 20);
  const maxX = Math.max(RIG.torso.neck[0] + halfW, weapon.x + weapon.w - 24);
  return { minX, minY: crownY, maxX, maxY: floorY, w: maxX - minX, h: floorY - crownY };
})();

// ── which PNG draws a part ──────────────────────────────────────────────────

export interface ArtChoice {
  tier: number;
  design: 1 | 2;
  base: string;
  mask: string;
}

/**
 * The catalog card's tier and design, or the tier by total with design 1 for
 * a house part or an id the catalog has never heard of. Lifted verbatim out
 * of the knockout card, where it was the only copy.
 */
export function artFor(p: Part | null | undefined, slot: ArtSlot): ArtChoice {
  const card = p ? CARD_BY_ID[p.id] : undefined;
  const tier = card?.tier ?? (p ? partTier(partTotal(p)) : 1);
  const design = card?.design ?? 1;
  return { tier, design, base: partFile(slot, tier, design), mask: maskFile(slot, tier, design) };
}

/**
 * THE COLOUR A PIECE WEARS, and the whole reason this lane exists. Every part
 * keeps the colour it arrived in, for life (ADR-0141), so a robot is normally
 * FOUR colours at once and a picture that paints it one colour is wrong.
 *
 * A colour comes off the OWNED card (Part.paint), and the catalogue's factory
 * colour stands in only for a house part that has no owner row. Which socket
 * gets which colour is look.ts's socketPaints(), including its rule that the
 * weapon rides the arm, so there is one answer to that question and not two.
 *
 * NO_TINT is what an EMPTY socket draws: the garage's own words are that an
 * unpainted part keeps its clay, and a white multiply is no tint at all.
 */
export const NO_TINT = 0xffffff;

/** the colour of the card in one build slot, owned first, catalogue second */
export function slotPaint(build: Build, slot: CardSlot): PaintId | null {
  const p = build[slot as Slot];
  if (!p) return null;
  return p.paint ?? CARD_BY_ID[p.id]?.color ?? null;
}

/** the seven sockets' colours for one engine Build */
export function buildPaints(build: Build): SocketPaints {
  return socketPaints((slot) => slotPaint(build, slot));
}

export function pieceTint(paints: SocketPaints, piece: Piece): number {
  const p = paints[piece.name];
  return p ? paintHex(p) : NO_TINT;
}

/** the torso's colour: what a sticker and the marks stand on */
export function bodyTint(paints: SocketPaints): number {
  return paints.torso ? paintHex(paints.torso) : NO_TINT;
}

/** the four body colours a robot owns, head first, for the sticker's palette */
export function ownPaints(build: Build): PaintId[] {
  return bodyPaints((slot) => slotPaint(build, slot));
}

// ── where a mark goes ───────────────────────────────────────────────────────
/**
 * Every anchor below is DERIVED from FIGURE and RIG, never typed in, so a
 * bake that moves a pivot moves the marks with it. The comment on each line
 * is what it evaluates to today, the same convention rig.ts uses, so a stale
 * comment is the signal that a canvas moved.
 */
const H = FIGURE.H; // 560
const HEAD = PIECES.find((p) => p.name === "head")!;
const LEG_R = PIECES.find((p) => p.name === "legR")!;

/** the head's own apex row, in figure space */
export const CROWN_Y = HEAD.y + FIGURE.headApexY; // -224
export const HEAD_X = RIG.torso.neck[0]; // 144
const HEAD_CORE_W = FIGURE.ratio.headCoreW.target * H; // 328.2
const HEAD_ART_H = FIGURE.ratio.headH.target * H; // 288.4
const BODY_HALF = (FIGURE.ratio.bodyW.target * H) / 2; // 120.1
const LIMB_W = FIGURE.ratio.armW.target * H; // 84
const FOOT_W = FIGURE.ratio.footW.target * H; // 151.8
const FOOT_H = FIGURE.ratio.footH.target * H; // 97.4

/**
 * The eye pair the rig falls back to when it cannot read the art (rig.ts
 * EYES_FALLBACK), moved into figure space. A compositor that HAS decoded the
 * head should measure instead: findEyes() below is the same rule.
 */
export interface EyePoint {
  x: number;
  y: number;
  r: number;
}
export const EYES_FALLBACK: readonly EyePoint[] = [-1, 1].map((s) => ({
  x: HEAD_X + s * HEAD_CORE_W * 0.215, // 144 +/- 70.6
  y: CROWN_Y + HEAD_ART_H * 0.46, // -91.7
  r: HEAD_CORE_W * 0.145, // 47.6
}));

/**
 * A LENS PIXEL, the rig's own predicate (rig.ts isLensPixel). The lens is the
 * one warm thing on a head: the clay is neutral grey and the grille is a near
 * black hole, so "clearly warmer than it is grey" separates the bulb without
 * this file knowing the art's palette.
 */
export const isLensPixel = (r: number, g: number, b: number, a: number): boolean =>
  a > 200 && r > g + 22 && g > b + 18;
const LENS_MIN_PX = 200;
const LENS_R_MIN = HEAD_CORE_W * 0.05;
const LENS_R_MAX = HEAD_CORE_W * 0.24;

/**
 * Find a head's lenses in a decoded RGBA buffer, in FIGURE space. Same
 * thresholds, same centre-line merge and same fallback as rig.ts measureEyes;
 * that function reads its pixels back off the GPU and this one is handed
 * them, which is the only difference.
 *
 * FOLLOW UP (not this lane's file): rig.ts should call this instead of
 * keeping its own copy of the rule, once the look lane has stopped editing it.
 */
export function findEyes(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): readonly EyePoint[] {
  if (!width || !height) return EYES_FALLBACK;
  const kx = width / RIG.head.w;
  const ky = height / RIG.head.h;
  const mid = RIG.head.neck[0];
  const box = [
    { n: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 },
    { n: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 },
  ];
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      if (!isLensPixel(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) continue;
      const cx = px / kx;
      const cy = py / ky;
      const b = box[cx < mid ? 0 : 1];
      b.n++;
      if (cx < b.x0) b.x0 = cx;
      if (cx > b.x1) b.x1 = cx;
      if (cy < b.y0) b.y0 = cy;
      if (cy > b.y1) b.y1 = cy;
    }
  }
  const eyes: EyePoint[] = [];
  for (const b of box) {
    if (b.n < LENS_MIN_PX) continue;
    const r = (b.x1 - b.x0 + (b.y1 - b.y0)) / 4;
    if (r < LENS_R_MIN || r > LENS_R_MAX) continue;
    // head-canvas units -> figure space
    eyes.push({ x: HEAD.x + (b.x0 + b.x1) / 2, y: HEAD.y + (b.y0 + b.y1) / 2, r });
  }
  if (eyes.length === 2 && Math.abs(eyes[0].x - eyes[1].x) < eyes[0].r + eyes[1].r) {
    return [{ x: (eyes[0].x + eyes[1].x) / 2, y: (eyes[0].y + eyes[1].y) / 2, r: Math.max(eyes[0].r, eyes[1].r) }];
  }
  return eyes.length ? eyes : EYES_FALLBACK;
}

export interface Anchor {
  x: number;
  y: number;
  /** the mark's own half-size at this anchor, in figure units */
  s: number;
}

/** the sticker's three spots. `eyes` lets the cheek follow a measured face. */
export function stickerAnchor(spot: "chest" | "cheek" | "boot", eyes: readonly EyePoint[] = EYES_FALLBACK): Anchor {
  if (spot === "chest") return { x: RIG.torso.decal[0], y: RIG.torso.decal[1], s: 28 };
  if (spot === "cheek") {
    // BELOW the eye row and OUTBOARD of the mouth: the mouth's own half width
    // is 0.185 of the head core, and the cheek has to clear it or it reads as
    // a second mouth. Still inside the core, so it never hangs off the head.
    const eye = eyes.reduce((a, b) => (b.x > a.x ? b : a), eyes[0] ?? EYES_FALLBACK[1]);
    const mouthHalf = HEAD_CORE_W * 0.185; // 60.7
    const s = 20;
    const x = Math.min(HEAD_X + HEAD_CORE_W * 0.32, Math.max(HEAD_X + mouthHalf + 34, eye.x + eye.r * 0.6));
    // clear of the lens by the sticker's own half size, or it reads as a
    // second eye and the lid lands on top of it
    return { x, y: eye.y + eye.r + s * 0.9, s };
  }
  // the boot band, above the sole. The shoe splays outboard of its own shaft
  // by the contract's stance minus the hip separation, halved: the bake's own
  // FOOT_OFF_F, so the band lands on the shoe and not beside it.
  const footX = LEG_R.x + RIG.leg.foot[0];
  const footY = LEG_R.y + RIG.leg.foot[1];
  const off = (FIGURE.ratio.stanceW.target * H) / 2 - (RIG.torso.hipR[0] - RIG.torso.hipL[0]) / 2 - FOOT_W / 2;
  return { x: footX + off, y: footY - FOOT_H * 0.62, s: 17 };
}

/** the row of earned chest stars, above the sticker and inside the body */
export function starRow(n: number): Anchor[] {
  const out: Anchor[] = [];
  if (n <= 0) return out;
  const s = 15;
  const gap = s * 2.3; // 34.5
  const y = RIG.torso.neck[1] + 40; // 104, high on the chest, clear of the sticker
  const x0 = RIG.torso.neck[0] - ((n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) out.push({ x: Math.max(RIG.torso.neck[0] - BODY_HALF + s, Math.min(RIG.torso.neck[0] + BODY_HALF - s, x0 + i * gap)), y, s });
  return out;
}

/** the name plate, low on the chest under the sticker */
export const PLATE_ANCHOR: Anchor = { x: RIG.torso.neck[0], y: RIG.torso.neck[1] + 132, s: 46 };

/** the three drawn patch spots: body, weapon arm, off leg */
export const PATCH_ANCHORS: readonly Anchor[] = [
  { x: RIG.torso.neck[0] - BODY_HALF * 0.55, y: RIG.torso.neck[1] + 118, s: 16 },
  { x: SHOULDER.R[0], y: SHOULDER.R[1] + 74, s: 14 },
  { x: RIG.torso.hipL[0] - 6, y: RIG.torso.hipL[1] + 58, s: 14 },
];

/** one cuff band per arm, near the wrist; the second sits above the first.
 *  The band is a little under the shaft's own width, because the arm art
 *  tapers and a band the exact width of the contract hangs off the sides. */
export function cuffAnchors(bands: number): Anchor[] {
  const out: Anchor[] = [];
  const handY = SHOULDER.R[1] + (RIG.arm.hand[1] - RIG.arm.shoulder[1]); // 202
  for (let i = 0; i < bands; i++) {
    const y = handY - 42 - i * 26;
    out.push({ x: SHOULDER.L[0], y, s: LIMB_W * 0.44 });
    out.push({ x: SHOULDER.R[0], y, s: LIMB_W * 0.44 });
  }
  return out;
}

/** the hat, and the crown, both sitting on the head's apex row */
export const HAT_ANCHOR: Anchor = { x: HEAD_X, y: CROWN_Y + 6, s: HEAD_CORE_W * 0.34 };
export const CROWN_ANCHOR: Anchor = { x: HEAD_X, y: CROWN_Y + 10, s: HEAD_CORE_W * 0.26 };

/** a sparkle outboard of each lens, from level 10 */
export function sparkleAnchors(eyes: readonly EyePoint[]): Anchor[] {
  return eyes.map((e, i) => ({
    x: e.x + (i === 0 ? -1 : 1) * e.r * 1.05,
    y: e.y - e.r * 0.75,
    s: e.r * 0.42,
  }));
}

// ── the portrait's own frame ────────────────────────────────────────────────

/** the four sizes every small picture is served at */
export const PORTRAIT_SIZES: readonly number[] = [64, 120, 300, 432];
/** A portrait is SQUARE, and it is square on purpose: a robot with a hat on
 *  and a robot with none are different heights, and a square frame is the
 *  only one that lets both sit in the same row of a list without one of them
 *  being cropped or floating. Callers lay out against this, never against a
 *  guess. */
export const PORTRAIT_ASPECT = 1;
export const DEFAULT_PORTRAIT_SIZE = 300;

export function nearestPortraitSize(n: number): number {
  let best = DEFAULT_PORTRAIT_SIZE;
  let d = Infinity;
  for (const s of PORTRAIT_SIZES) {
    const k = Math.abs(s - n);
    if (k < d) {
      d = k;
      best = s;
    }
  }
  return best;
}

/**
 * How much of the square the figure fills. A robot that touches the frame
 * reads as cropped at 64 px, and a hat and a crown both live ABOVE the head's
 * apex row, so the headroom is wider than the footroom.
 */
export const PORTRAIT_PAD = { top: 0.1, bottom: 0.045, side: 0.05 } as const;

/**
 * Fit a figure-space box into a square, keeping the aspect. Returns the scale
 * and the figure-space point that lands at the square's top-left corner, so a
 * caller maps a point with (p - origin) * scale.
 */
export function fitInSquare(ink: Box, size: number): { scale: number; originX: number; originY: number } {
  const availW = size * (1 - PORTRAIT_PAD.side * 2);
  const availH = size * (1 - PORTRAIT_PAD.top - PORTRAIT_PAD.bottom);
  const scale = Math.min(availW / Math.max(1, ink.w), availH / Math.max(1, ink.h));
  const drawnW = ink.w * scale;
  const drawnH = ink.h * scale;
  return {
    scale,
    originX: ink.minX - (size - drawnW) / 2 / scale,
    originY: ink.minY - (size * PORTRAIT_PAD.top + (availH - drawnH) / 2) / scale,
  };
}

/**
 * WHERE THE BODY IS INSIDE A SQUARE PORTRAIT, as a fraction across it.
 *
 * A robot is NOT centred on its own chest. The weapon hangs off one side and
 * the figure's ink box is drawn around everything, so the torso sits at 0.38
 * across, not 0.50. Anything laid ON TOP of a portrait from outside (the
 * knockout card's crack was the first) has to know that, or it lands beside
 * the robot and reads as a mistake. A portrait drawn mirrored puts the body
 * the same distance the other side of the middle.
 *
 * Derived from FIGURE_INK and fitInSquare, so a re-bake moves it too.
 */
export function bodyCentreInSquare(size: number, mirrored = false): { x: number; y: number } {
  const fit = fitInSquare(FIGURE_INK, size);
  const x = (RIG.torso.neck[0] - fit.originX) * fit.scale;
  const y = (RIG.torso.neck[1] - fit.originY) * fit.scale;
  return { x: mirrored ? size - x : x, y };
}

/**
 * THE ADDRESS OF A PICTURE. One route, four sizes, two ways to name a robot:
 * a bay robot by its id, or one side of a finished fight. Nothing about the
 * LOOK travels in the query, because the server is the truth about what a
 * robot has earned and a picture that took a look from its caller would let
 * anyone wear a crown.
 */
export interface PortraitRef {
  bot?: number | string;
  fight?: number | string;
  side?: 0 | 1;
  /**
   * A GAME ROBOT, by the shape it is built from and the size it is built to.
   * The house's robots are made by the engine for one fight and are in no
   * table, so there is no id to name one by. Both values are already public
   * on the battles page (PveLadderRow shapeId and houseTotal) and neither is
   * a look: a game robot wears unpainted clay, no face, no marks and no hat,
   * so nothing here can be used to claim something a player has to earn.
   */
  house?: string;
  total?: number;
  size?: number;
  /** the row's updated_at, so a changed robot gets a new url */
  v?: string | number;
}

export const PORTRAIT_PATH = "/api/bots/portrait";

export function portraitUrl(ref: PortraitRef, origin = ""): string {
  const q = new URLSearchParams();
  if (ref.bot !== undefined) q.set("b", String(ref.bot));
  if (ref.fight !== undefined) {
    q.set("f", String(ref.fight));
    q.set("w", String(ref.side ?? 0));
  }
  if (ref.house !== undefined) {
    q.set("h", String(ref.house).slice(0, 24));
    if (ref.total !== undefined) q.set("t", String(Math.round(ref.total)));
  }
  q.set("s", String(nearestPortraitSize(ref.size ?? DEFAULT_PORTRAIT_SIZE)));
  if (ref.v !== undefined) q.set("v", String(ref.v).slice(0, 32));
  return `${origin}${PORTRAIT_PATH}?${q.toString()}`;
}
