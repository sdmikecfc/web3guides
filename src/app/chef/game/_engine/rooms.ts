/**
 * Room SHELLS + the starter layout (ADR-0104, expanded M8b).
 *
 * The shell is everything the player cannot move: grid size, window segments,
 * and the door. Furniture no longer lives here — it is player-authored state
 * (`WorldState.layout`), and this file only supplies what a brand-new
 * restaurant starts with.
 *
 * THE ROOM CAN NOW GROW. Coins used to stop mattering about twenty minutes in:
 * the whole shop cost roughly 3,840 coins and the floor was a fixed 10x8, so
 * SPACE ran out long before money did and everything after that piled up
 * unspent. A bigger room is the sink that survives week two, and it is the only
 * kind of purchase that can be: it buys CAPACITY and nothing else, which keeps
 * it on the right side of the firewall (money may never buy quality).
 *
 * The engine was already room-size-agnostic — validateLayout, rebuildDerived,
 * buildGrid and the camera all take a RoomDef — so the only things that were
 * genuinely hard-coded were this file, the wall art, and the save clamp.
 */

import type { PlacedSpec, RoomDef } from "./world";

/**
 * The shells, in the order they unlock. Index 0 is where everyone starts.
 *
 * `dk-bake-room.mjs` bakes one wall per distinct tile count found here, so
 * adding a size means adding a row and re-running the baker. LEFT_WALL_TILES
 * and RIGHT_WALL_TILES in that script must cover every `h` and `w` below;
 * `dk-art-check.mts` fails the build if a wall is missing.
 */
export interface ShellDef extends RoomDef {
  /** what the player sees in the shop */
  label: string;
  /** coins to move UP to this shell; 0 for the one you start in */
  cost: number;
  blurb: string;
}

export const SHELL_SIZES: ShellDef[] = [
  {
    // NOT "Corner Spot": that is already a rung on the TIERS ladder, and the
    // dials card shows both, so the same words in two places would read as
    // one thing saying itself twice.
    label: "First Room",
    cost: 0,
    blurb: "Where you started.",
    w: 10,
    h: 8,
    windowsLeft: [2, 4, 6],
    windowsRight: [8],
    door: { x: 4, y: 7 },
  },
  {
    // no leading article: the shop renders "Take the <label>"
    label: "Long Room",
    cost: 5_000,
    blurb: "Knock through to the next unit. Four more tiles across, one more deep.",
    w: 14,
    h: 9,
    windowsLeft: [2, 4, 6, 8],
    windowsRight: [8, 10, 12],
    door: { x: 4, y: 8 },
  },
  {
    label: "Big Room",
    cost: 14_000,
    blurb: "The whole floor. Room for a proper dining room and a real kitchen.",
    w: 18,
    h: 12,
    windowsLeft: [2, 4, 6, 8, 10],
    windowsRight: [8, 10, 12, 14, 16],
    door: { x: 4, y: 11 },
  },
];

/** The shell a brand-new restaurant opens in. */
export const SHELL: RoomDef = SHELL_SIZES[0];

/** Clamp any saved shell index to one that exists. */
export function shellAt(idx: number): ShellDef {
  return SHELL_SIZES[Math.max(0, Math.min(SHELL_SIZES.length - 1, Math.floor(idx) || 0))];
}

/**
 * A brand-new restaurant: one stove, the pass counter, two tables with a
 * chair each side, a rug, a plant, and a doormat. Everything else is bought
 * in the shop and placed by hand (ADR-0103 + 0104).
 *
 * Facing note: "sw" renders the mirrored sprite, so chairs on the +gy side of
 * a table face back toward it.
 */
export const STARTER_LAYOUT: PlacedSpec[] = [
  { itemId: "stove_basic", gx: 2, gy: 0 },
  { itemId: "counter_basic", gx: 5, gy: 0 }, // 2 cells: (5,0) and (6,0)
  { itemId: "table_basic", gx: 2, gy: 3 },
  { itemId: "chair_basic", gx: 2, gy: 2, facing: "sw" },
  { itemId: "chair_basic", gx: 1, gy: 3, facing: "se" },
  { itemId: "table_basic", gx: 5, gy: 3 },
  { itemId: "chair_basic", gx: 5, gy: 2, facing: "sw" },
  { itemId: "chair_basic", gx: 4, gy: 3, facing: "se" },
  { itemId: "rug_basic", gx: 5, gy: 4 },
  { itemId: "plant_basic", gx: 0, gy: 1 },
  { itemId: "doormat_basic", gx: 4, gy: 7 },
];

/** Extra pieces an M3 save's counts convert into, in the order they fill. */
export const GROWTH_SLOTS: { itemId: string; gx: number; gy: number; facing?: "se" | "sw" }[] = [
  { itemId: "table_basic", gx: 8, gy: 4 },
  { itemId: "chair_basic", gx: 8, gy: 3, facing: "sw" },
  { itemId: "chair_basic", gx: 7, gy: 4, facing: "se" },
  { itemId: "table_basic", gx: 3, gy: 6 },
  { itemId: "chair_basic", gx: 3, gy: 5, facing: "sw" },
  { itemId: "chair_basic", gx: 2, gy: 6, facing: "se" },
  { itemId: "table_basic", gx: 6, gy: 6 },
  { itemId: "chair_basic", gx: 6, gy: 5, facing: "sw" },
  { itemId: "chair_basic", gx: 5, gy: 6, facing: "se" },
];

/** Where a second stove goes when an M3 save had two. */
export const SECOND_STOVE = { itemId: "stove_basic", gx: 3, gy: 0 };

/** @deprecated kept so older imports keep compiling; use SHELL. */
export const TRATTORIA = SHELL;
