/**
 * ASSEMBLY: put five bought cards together into one robot, by anchors, at a
 * FIXED SCALE.
 *
 * This is the geometry half of the parts-library contract in families.ts. It
 * exists because the game is not six robots, it is 7,776 of them: a head from
 * one family, a body from another, arms from a third. The art director's
 * acceptance rule is the rule this file implements, verbatim: "assemble
 * fixed-scale parts by their actual anchors, without per-combination
 * resizing". Nothing here may ever scale a part to make it fit its host. If a
 * combination looks wrong, the offending part's envelope is what changes.
 *
 * EVERYTHING IS IN U until the last step. One U is a shoulder collar
 * diameter. Multiply by PX_PER_U for artwork pixels, or by whatever the camera
 * wants for the screen; the ratios never move.
 *
 * MIRRORING. Arms and legs are drawn once, as the viewer-right piece. The
 * viewer-left piece is the same artwork flipped, so its anchors flip too:
 * x' = 1 - x, y unchanged. That is the only transform, and it is applied
 * exactly once. No family needs separate left and right art.
 *
 * WHAT THIS FILE IS NOT. It is not the rig. The rig animates; this only says
 * where a part sits at rest, which is what a gate can check and what a pose
 * is measured against. And it is not proof: it consumes drawing targets for
 * parts nobody has drawn yet (see the provenance note in families.ts).
 */

import {
  FAMILIES,
  INTERFACES,
  type Anchor,
  type Family,
  type FamilyId,
  type SizeU,
} from "./families";

/** the five things a player buys; a pair card fills two sockets */
export type CardSlot = "head" | "torso" | "arms" | "legs" | "weapon";

/** the seven pieces that actually get drawn */
export type Piece = "head" | "torso" | "armL" | "armR" | "legL" | "legR" | "weapon";

/** one family per card: what the player is wearing */
export type Pick = Readonly<Record<CardSlot, FamilyId>>;

export interface Placed {
  readonly piece: Piece;
  readonly family: FamilyId;
  /** tight artwork bounds in U, before any mirroring */
  readonly size: SizeU;
  /** top-left of the part's own bounds, in assembly space, in U */
  readonly x: number;
  readonly y: number;
  /** drawn flipped horizontally (the viewer-left of a mirrored pair) */
  readonly flip: boolean;
}

export interface Assembly {
  readonly pick: Pick;
  readonly pieces: readonly Placed[];
  /** union of every piece, in U */
  readonly bounds: { x: number; y: number; w: number; h: number };
  /** where each joint landed, in U, for gates and for posing */
  readonly joints: Readonly<Record<"neck" | "shoulderL" | "shoulderR" | "hipL" | "hipR" | "grip", Pt>>;
}

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** an anchor resolved against a part's own bounds, in U */
function at(size: SizeU, a: Anchor, flip = false): Pt {
  const fx = flip ? 1 - a[0] : a[0];
  return { x: fx * size[0], y: a[1] * size[1] };
}

/** place a part so its own anchor lands on `target` */
function hang(size: SizeU, a: Anchor, target: Pt, flip: boolean) {
  const local = at(size, a, flip);
  return { x: target.x - local.x, y: target.y - local.y };
}

const fam = (id: FamilyId): Family => {
  const f = FAMILIES[id];
  if (!f) throw new Error(`assemble: no family "${id}"`);
  return f;
};

/**
 * THE ASSEMBLY. The torso is the root and sits at the origin; every other
 * piece hangs off one of its anchors. The weapon hangs off the viewer-right
 * arm's hand, which is the arm drawn unmirrored, so a weapon is never flipped.
 */
export function assemble(pick: Pick): Assembly {
  const H = fam(pick.head);
  const T = fam(pick.torso);
  const A = fam(pick.arms);
  const L = fam(pick.legs);
  const W = fam(pick.weapon);

  const t = T.torso;
  const torso: Placed = { piece: "torso", family: T.id, size: t.size, x: 0, y: 0, flip: false };

  const neck = at(t.size, t.neck);
  const shoulderL = at(t.size, t.shoulderLeft);
  const shoulderR = at(t.size, t.shoulderRight);
  const hipL = at(t.size, t.hipLeft);
  const hipR = at(t.size, t.hipRight);

  const head: Placed = {
    piece: "head",
    family: H.id,
    size: H.head.size,
    ...hang(H.head.size, H.head.neck, neck, false),
    flip: false,
  };

  // the viewer-right arm is the canonical drawing; the viewer-left is it flipped
  const armR: Placed = {
    piece: "armR",
    family: A.id,
    size: A.arm.size,
    ...hang(A.arm.size, A.arm.shoulder, shoulderR, false),
    flip: false,
  };
  const armL: Placed = {
    piece: "armL",
    family: A.id,
    size: A.arm.size,
    ...hang(A.arm.size, A.arm.shoulder, shoulderL, true),
    flip: true,
  };
  const legR: Placed = {
    piece: "legR",
    family: L.id,
    size: L.leg.size,
    ...hang(L.leg.size, L.leg.hip, hipR, false),
    flip: false,
  };
  const legL: Placed = {
    piece: "legL",
    family: L.id,
    size: L.leg.size,
    ...hang(L.leg.size, L.leg.hip, hipL, true),
    flip: true,
  };

  // the grip: the right arm's hand point, in assembly space
  const handR = at(A.arm.size, A.arm.hand, false);
  const grip: Pt = { x: armR.x + handR.x, y: armR.y + handR.y };
  const weapon: Placed = {
    piece: "weapon",
    family: W.id,
    size: W.weapon.size,
    ...hang(W.weapon.size, W.weapon.grip, grip, false),
    flip: false,
  };

  const pieces = [legL, legR, torso, armL, armR, head, weapon] as const;

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pieces) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + p.size[0]);
    y1 = Math.max(y1, p.y + p.size[1]);
  }

  return {
    pick,
    pieces: [...pieces],
    bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    joints: { neck, shoulderL, shoulderR, hipL, hipR, grip },
  };
}

/** the rectangle a placed piece occupies, in U */
export function rectOf(p: Placed) {
  return { x0: p.x, y0: p.y, x1: p.x + p.size[0], y1: p.y + p.size[1] };
}

/** overlap area of two placed pieces, in square U */
export function overlapArea(a: Placed, b: Placed): number {
  const ra = rectOf(a);
  const rb = rectOf(b);
  const w = Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0);
  const h = Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Can a part cover its own half of a joint?
 *
 * NOT a distance to the nearest edge. The handoff's ownership rule is that a
 * body owns the receiving collar and a limb owns the inset connector, and they
 * overlap at the pivot. So a leg is not required to have artwork ABOVE its hip
 * anchor: it hangs downward, the torso covers the top, and demanding a full
 * collar radius in every direction fails every leg ever drawn. What matters is
 * that the part extends a collar radius in the direction its own mass goes.
 *
 * `towards` is that direction: "up" for a head off its neck, "down" for a
 * torso off its neck and for any limb off its shoulder or hip.
 */
export function collarClearance(
  size: SizeU,
  a: Anchor,
  diameterU: number,
  towards: "up" | "down",
  flip = false,
): number {
  const p = at(size, a, flip);
  const r = diameterU / 2;
  const along = towards === "up" ? p.y : size[1] - p.y;
  // sideways still matters: the anchor cannot hang off the side of its own art
  const sideways = Math.min(p.x, size[0] - p.x);
  return Math.min(along, sideways) - r;
}

/** the shared interface sizes, re-exported so a gate never invents its own */
export const COLLAR = INTERFACES;
