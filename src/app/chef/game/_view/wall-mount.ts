import { WALL_H } from "../_engine/iso";
import type { ItemFacing } from "../_engine/items";

type RoomSize = { w: number; h: number };
// Artwork is authored at 2×, centered on (96,104) in its existing 192×224 cell.
export const WALL_ART_ANCHOR = { x: 96 / 192, y: 104 / 224 };
export const WALL_ART_HEIGHT = 58;
export const WALL_ART_HALF_WIDTH = 13;
export const WALL_ART_HALF_HEIGHT = 17;

/** Attach to the room boundary, independently of floor-furniture rotation.
 * At the shared corner, facing records which wall the player pointed at.
 * A legacy interior placement gets a visual fallback without changing its save.
 */
export function wallArtMount(room: RoomSize, gx: number, gy: number, facing: string) {
  const left = gx === 0 && gy === 0 ? facing === "se" || facing === "nw"
    : gx === 0 ? true : gy === 0 ? false : gx <= gy;
  const index = Math.max(0, Math.min((left ? room.h : room.w) - 1, left ? gy : gx));
  const u = (index + .5) * 32;
  return { x: (left ? -1 : 1) * u, y: u * .5 - WALL_ART_HEIGHT, mirror: left, side: left ? "left" as const : "right" as const, index };
}

/** Inverse of the actual cutaway wall plane, in camera-independent world pixels. */
export function pickWallMount(room: RoomSize, x: number, y: number): { x: number; y: number; facing: ItemFacing } | null {
  const left = x <= 0, u = Math.abs(x), height = u * .5 - y;
  const count = left ? room.h : room.w;
  if (u >= count * 32 || height < 0 || height > WALL_H) return null;
  const index = Math.floor(u / 32);
  return left ? { x: 0, y: index, facing: "se" } : { x: index, y: 0, facing: "sw" };
}

/** Hit the projected frame, excluding the transparent furniture-canvas margins. */
export function hitsWallArt(mount: ReturnType<typeof wallArtMount>, x: number, y: number): boolean {
  const u = (x - mount.x) * (mount.mirror ? -1 : 1);
  const v = y - mount.y - u * .5;
  return Math.abs(u) <= WALL_ART_HALF_WIDTH + 1 && Math.abs(v) <= WALL_ART_HALF_HEIGHT + 1;
}
