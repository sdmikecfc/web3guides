/**
 * Room SHELL + the starter layout (ADR-0104).
 *
 * The shell is everything the player cannot move: grid size, window segments,
 * and the door. Furniture no longer lives here — it is player-authored state
 * (`WorldState.layout`), and this file only supplies what a brand-new
 * restaurant starts with.
 */

import type { PlacedSpec, RoomDef } from "./world";

export const SHELL: RoomDef = {
  w: 10,
  h: 8,
  windowsLeft: [2, 4, 6],
  windowsRight: [8],
  door: { x: 4, y: 7 },
};

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
