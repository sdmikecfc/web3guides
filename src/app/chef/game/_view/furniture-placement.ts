import { footprintCells, itemDef } from "../_engine/items";
import { isoX, isoY, TILE_H } from "../_engine/iso";
import type { Facing } from "../_engine/world";

/** Shared registration for both the held preview and the placed sprite. */
export function furnitureAnchor(itemId: string, gx: number, gy: number, facing: Facing = "se") {
  // A doormat image is centered on a single diamond. Standing furniture is
  // registered on its bottom corner; using that pivot moves a mat onto the
  // junction between four tiles. The larger rug art keeps its 2x2 visual span.
  if (itemDef(itemId)?.kind === "doormat") return { x: isoX(gx, gy), y: isoY(gx, gy) + TILE_H / 2 };
  const cells = footprintCells(itemId, gx, gy, facing);
  const ax = Math.max(...cells.map(c => c.x)), ay = Math.max(...cells.map(c => c.y));
  return { x: isoX(ax, ay), y: isoY(ax, ay) + TILE_H };
}
