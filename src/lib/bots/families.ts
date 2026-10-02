/**
 * THE SIX FAMILIES: bounds and anchors, the parts-library contract.
 *
 * PROVENANCE. Generated from the art director's `parts-library-pivots-v1.json`
 * (Astra, 2026-09-06). Its own status field reads
 * "proposed_drawing_targets_not_measured_or_runtime_validated", and that is
 * the honest state: these are DRAWING TARGETS for parts that do not exist yet,
 * not measurements of shipped art. When a real part is drawn and its tight
 * bounds differ, this file changes to match the drawing, not the other way
 * round. Do not treat a number here as proof of anything.
 *
 * THE UNIT. Every size below is in U, where U is one shoulder or hip collar
 * outer diameter. This is the whole reason parts from different families can
 * be worn together: they share the CONNECTOR size, never the silhouette. A
 * Clamp arm is 2.65 U square and a Peek arm is 1.15 by 2.65, and both bolt
 * onto any torso because both collars are 1 U.
 *
 * THE ANCHORS are fractions of that part's own tight artwork bounds, origin
 * top left, x right, y down, transparent padding excluded. Left and right mean
 * VIEWER left and right. Arms and legs are drawn once, as the viewer-right
 * piece, and mirrored with x' = 1 - x; no family needs separate left and right
 * art. `hand` is the weapon grip centre and `foot` is the ground contact
 * reference: neither is an extra joint.
 *
 * This file is data only. The geometry that consumes it lives in assemble.ts,
 * and the gate that checks every combination is scripts/bots-assembly-check.ts.
 */

/** one shoulder or hip collar outer diameter, the shared interface size */
export const U = 1;

/** the fixed interface sizes every family must honour, in U */
export const INTERFACES = {
  shoulderAndHipCollarDiameter: 1,
  neckCollarDiameter: 0.8,
  weaponHandleDiameter: 0.4,
} as const;

/**
 * Authoring scale, chosen ONCE and never per part. A part is drawn at this
 * many pixels per U and keeps that scale on every host it is worn by; the
 * camera scales the assembled robot, never the pieces. Astra's handoff uses
 * 100 as its illustrative value, which puts Clamp's arm at 265 px square and
 * Pip's torso at 400 by 420.
 */
export const PX_PER_U = 100;

export type FamilyId = "brick" | "ding" | "scoot" | "peek" | "clamp" | "pip";

/** a point on a part, as fractions of that part's own bounds */
export type Anchor = readonly [number, number];
/** a part's tight artwork bounds, in U */
export type SizeU = readonly [number, number];

export interface HeadSpec { readonly size: SizeU; readonly neck: Anchor }
export interface TorsoSpec {
  readonly size: SizeU;
  readonly neck: Anchor;
  readonly shoulderLeft: Anchor;
  readonly shoulderRight: Anchor;
  readonly hipLeft: Anchor;
  readonly hipRight: Anchor;
  readonly chestDecal: Anchor;
}
export interface ArmSpec { readonly size: SizeU; readonly shoulder: Anchor; readonly hand: Anchor }
export interface LegSpec { readonly size: SizeU; readonly hip: Anchor; readonly foot: Anchor }
export interface WeaponSpec { readonly size: SizeU; readonly grip: Anchor }

export interface Family {
  readonly id: FamilyId;
  readonly name: string;
  readonly head: HeadSpec;
  readonly torso: TorsoSpec;
  readonly arm: ArmSpec;
  readonly leg: LegSpec;
  readonly weapon: WeaponSpec;
}

export const FAMILIES: Record<FamilyId, Family> = {
  brick: {
    id: "brick",
    name: "Brick",
    head: { size: [3.3, 1.95], neck: [0.5, 0.94] },
    torso: {
      size: [3.4, 2.3], neck: [0.5, 0.05],
      shoulderLeft: [0.08, 0.2], shoulderRight: [0.92, 0.2],
      hipLeft: [0.3, 0.93], hipRight: [0.7, 0.93],
      chestDecal: [0.5, 0.52],
    },
    arm: { size: [1.45, 2.55], shoulder: [0.16, 0.12], hand: [0.58, 0.79] },
    leg: { size: [1.3, 1.7], hip: [0.43, 0.08], foot: [0.52, 0.98] },
    weapon: { size: [2, 3], grip: [0.5, 0.79] },
  },
  ding: {
    id: "ding",
    name: "Ding",
    head: { size: [2.25, 2.75], neck: [0.5, 0.95] },
    torso: {
      size: [2.6, 2.7], neck: [0.5, 0.05],
      shoulderLeft: [0.1, 0.2], shoulderRight: [0.9, 0.2],
      hipLeft: [0.3, 0.93], hipRight: [0.7, 0.93],
      chestDecal: [0.5, 0.52],
    },
    arm: { size: [1.15, 2.5], shoulder: [0.18, 0.1], hand: [0.57, 0.82] },
    leg: { size: [1.15, 1.75], hip: [0.43, 0.08], foot: [0.52, 0.98] },
    weapon: { size: [1.25, 2.7], grip: [0.5, 0.82] },
  },
  scoot: {
    id: "scoot",
    name: "Scoot",
    head: { size: [2.8, 1.45], neck: [0.5, 0.93] },
    torso: {
      size: [3, 2.15], neck: [0.5, 0.05],
      shoulderLeft: [0.09, 0.22], shoulderRight: [0.91, 0.22],
      hipLeft: [0.3, 0.92], hipRight: [0.7, 0.92],
      chestDecal: [0.5, 0.49],
    },
    arm: { size: [1.3, 2.2], shoulder: [0.16, 0.12], hand: [0.58, 0.79] },
    leg: { size: [1.35, 1.7], hip: [0.5, 0.08], foot: [0.5, 0.99] },
    weapon: { size: [1.5, 2.8], grip: [0.5, 0.8] },
  },
  peek: {
    id: "peek",
    name: "Peek",
    head: { size: [1.5, 1.85], neck: [0.5, 0.94] },
    torso: {
      size: [2, 3.4], neck: [0.5, 0.05],
      shoulderLeft: [0.13, 0.18], shoulderRight: [0.87, 0.18],
      hipLeft: [0.3, 0.94], hipRight: [0.7, 0.94],
      chestDecal: [0.5, 0.57],
    },
    arm: { size: [1.15, 2.65], shoulder: [0.17, 0.1], hand: [0.58, 0.82] },
    leg: { size: [1.2, 2.65], hip: [0.45, 0.06], foot: [0.52, 0.99] },
    weapon: { size: [1.5, 3.7], grip: [0.5, 0.77] },
  },
  clamp: {
    id: "clamp",
    name: "Clamp",
    head: { size: [1.5, 1.3], neck: [0.5, 0.94] },
    torso: {
      size: [3.6, 2.3], neck: [0.5, 0.05],
      shoulderLeft: [0.07, 0.2], shoulderRight: [0.93, 0.2],
      hipLeft: [0.3, 0.93], hipRight: [0.7, 0.93],
      chestDecal: [0.5, 0.54],
    },
    arm: { size: [2.65, 2.65], shoulder: [0.1, 0.14], hand: [0.66, 0.58] },
    leg: { size: [1.4, 1.55], hip: [0.43, 0.08], foot: [0.52, 0.98] },
    weapon: { size: [1.85, 2.9], grip: [0.5, 0.81] },
  },
  pip: {
    id: "pip",
    name: "Pip",
    head: { size: [1.55, 1.35], neck: [0.5, 0.94] },
    torso: {
      size: [4, 4.2], neck: [0.5, 0.04],
      shoulderLeft: [0.23, 0.16], shoulderRight: [0.77, 0.16],
      hipLeft: [0.3, 0.93], hipRight: [0.7, 0.93],
      chestDecal: [0.5, 0.48],
    },
    arm: { size: [1.3, 2.55], shoulder: [0.16, 0.1], hand: [0.58, 0.82] },
    leg: { size: [1.35, 1.55], hip: [0.43, 0.08], foot: [0.52, 0.98] },
    weapon: { size: [2.05, 2.95], grip: [0.5, 0.81] },
  },
};

export const FAMILY_IDS = Object.keys(FAMILIES) as FamilyId[];
