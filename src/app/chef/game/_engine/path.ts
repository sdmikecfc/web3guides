/**
 * Grid occupancy + A* for the Domain Kitchen room (ADR-0101/0104).
 * Deterministic by construction: fixed neighbor order, stable tie-breaks
 * (lowest f, then first-inserted), zero rng. The grid is tiny (10x8), so the
 * simple array-scan open list is plenty.
 *
 * Walkability: floor is walkable; tables/stoves/counters/plants/toilets block;
 * rug and doormat are flat decor (walkable); CHAIRS and BENCHES block transit
 * but are legal as a path START or GOAL (people sit on them and stand up off
 * them).
 *
 * ADR-0104: the grid is now built from the PLAYER'S LAYOUT, once per layout
 * change (`rebuildDerived` in world.ts caches it on the world), never from a
 * static room definition and never per pathfind.
 */

import { itemDef } from "./items";
import type { PlacedItem } from "./world";

export interface Grid {
  w: number;
  h: number;
  /** 0 = open, 1 = solid, 2 = seat (legal only as a path start/goal) */
  cells: Uint8Array;
}

/** Build the occupancy grid from a room shell size + the placed layout. */
export function buildGrid(w: number, h: number, layout: PlacedItem[]): Grid {
  const cells = new Uint8Array(w * h);
  const put = (gx: number, gy: number, v: number) => {
    if (gx >= 0 && gy >= 0 && gx < w && gy < h) cells[gy * w + gx] = v;
  };
  for (const p of layout) {
    const def = itemDef(p.itemId);
    if (!def || !def.solid) continue; // rug, doormat: walkable
    const seat = def.kind === "chair" || def.kind === "bench";
    for (let i = 0; i < def.cells; i++) {
      put(p.gx + i, p.gy, seat ? 2 : 1);
    }
  }
  return { w, h, cells };
}

const NEI = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

/**
 * A* from (sx,sy) to (gx,gy) in tile coords. Returns the waypoint list
 * INCLUDING the goal, EXCLUDING the start — or null if unreachable.
 */
export function findPath(
  grid: Grid,
  sx: number,
  sy: number,
  gx: number,
  gy: number
): { x: number; y: number }[] | null {
  const { w, h, cells } = grid;
  const idx = (x: number, y: number) => y * w + x;
  if (gx < 0 || gy < 0 || gx >= w || gy >= h) return null;
  if (cells[idx(gx, gy)] === 1) return null;

  const g = new Float32Array(w * h).fill(Infinity);
  const from = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  interface Node { x: number; y: number; f: number; seq: number }
  const open: Node[] = [];
  let seq = 0;
  const hCost = (x: number, y: number) => Math.abs(x - gx) + Math.abs(y - gy);

  g[idx(sx, sy)] = 0;
  open.push({ x: sx, y: sy, f: hCost(sx, sy), seq: seq++ });

  while (open.length > 0) {
    // stable extract-min: lowest f, ties to the earliest insertion
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i];
      const b = open[bi];
      if (a.f < b.f || (a.f === b.f && a.seq < b.seq)) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    const ci = idx(cur.x, cur.y);
    if (closed[ci]) continue;
    closed[ci] = 1;

    if (cur.x === gx && cur.y === gy) {
      const path: { x: number; y: number }[] = [];
      let p = ci;
      while (p !== idx(sx, sy)) {
        path.push({ x: p % w, y: Math.floor(p / w) });
        p = from[p];
        if (p < 0) return null;
      }
      path.reverse();
      return path;
    }

    for (const [dx, dy] of NEI) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = idx(nx, ny);
      if (closed[ni]) continue;
      const cell = cells[ni];
      if (cell === 1) continue;
      if (cell === 2 && !(nx === gx && ny === gy)) continue; // chairs: goal only
      const ng = g[ci] + 1;
      if (ng < g[ni]) {
        g[ni] = ng;
        from[ni] = ci;
        open.push({ x: nx, y: ny, f: ng + hCost(nx, ny), seq: seq++ });
      }
    }
  }
  return null;
}
