/**
 * The Domain Kitchen isometric grid (ADR-0101): classic 2:1 diamond per the
 * approved ref_B. Logical units are "screen px at zoom 1"; art is authored at
 * 2x (ART_SCALE) and rendered at sprite scale 0.5 so DPR-2 phones stay crisp.
 *
 * Conventions (shared by sim, view, and scripts/dk-bake-room.mjs — the bake
 * script mirrors these constants, keep them in sync):
 *   +gx runs screen down-RIGHT, +gy runs screen down-LEFT.
 *   isoX/isoY give a tile's TOP diamond corner.
 *   Tile (0,0) is the back corner of the room; walls stand along gx=0 (the
 *   screen-left face) and gy=0 (the screen-right face).
 */

export const TILE_W = 64; // logical px: diamond width
export const TILE_H = 32; // logical px: diamond height
export const WALL_H = 96; // logical px: wall face height above the floor line
export const ART_SCALE = 2; // art files are authored at 2x logical size

/** Screen x of tile (gx,gy)'s top corner, in logical px. */
export function isoX(gx: number, gy: number): number {
  return (gx - gy) * (TILE_W / 2);
}

/** Screen y of tile (gx,gy)'s top corner, in logical px. */
export function isoY(gx: number, gy: number): number {
  return (gx + gy) * (TILE_H / 2);
}

/** Painter's depth for z-sorting objects standing on tile (gx,gy). */
export function isoDepth(gx: number, gy: number): number {
  return gx + gy;
}

/**
 * Registration for 1x1 furniture sprites baked by dk-bake-room.mjs:
 * canvas is FURN_W x FURN_H logical, and the tile's BOTTOM diamond corner
 * sits at (FURN_BX, FURN_BY) inside it. The scene anchors sprites so that
 * point lands on the tile's bottom corner.
 */
export const FURN_W = 96;
export const FURN_H = 112;
export const FURN_BX = 48;
export const FURN_BY = 104;

/** Same registration idea for the 2x1 counter (footprint spans two gx tiles;
 * registered on the FAR (+gx) tile's bottom corner). */
export const FURN2_W = 160;
export const FURN2_H = 120;
export const FURN2_BX = 104;
export const FURN2_BY = 108;
