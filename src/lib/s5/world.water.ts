/**
 * WHERE THE WATER IS, read off the painting.
 *
 * GENERATED from public/s5-art/world/bg-land.webp by scratchpad/bake_water.py.
 * Re-run it if the plate changes.
 *
 * This season's river, lake and bridges are PAINTED INTO THE PLATE, which is
 * why FIT_RIVERS is deliberately empty: drawing a vector river on top would
 * put a second, disagreeing river on the map. The side effect is that no code
 * knew where the water was, and figures placed by maths cheerfully stood in
 * it. Mike, 2026-07-28: "One solid block of tanks over the river and bridges
 * really kills the vibe."
 *
 * So the mask is measured rather than authored. A pixel counts as water when
 * it is clearly blue-dominant and not a shadow; a cell counts as water when
 * more than a sixth of its pixels are. Detection runs at FULL resolution and
 * is reduced afterwards, because a river narrower than a cell vanishes if you
 * average it with its banks first. Bridges read as dry ground in the picture
 * and are closed over here on purpose: nobody should be parked on one either.
 *
 * 64x32 is coarse by design. This exists to keep figures out of the water,
 * not to describe the coastline.
 */
export const WATER_W = 64;
export const WATER_H = 32;

const WATER_ROWS: string[] = [
  "0000000000000000000000000000000000000000000000000001100000000000",
  "0000000000000000000000000000000000000000000000000011000000000000",
  "0000000000000000000000000000000000000000000000001110000000000000",
  "0000000000000000000000000000000000000000000000001110000000000000",
  "0000000000000000000000000000000000000000000000000110000000000000",
  "0000000000000000000000000000111000000000000000000010000000000000",
  "0000000000000000000000000011111100011000000000000000000000000000",
  "0000000000000000000000001111111111111100000000001100000000000000",
  "0000000000000000000000001111111111111100000000011000000000000000",
  "0000000000000000000000000011111111111111000000110000000000000000",
  "0000000000000000000000000001111111111111110001100000000000000000",
  "0000000000000000000000000001111111111111111001100000000000000000",
  "0000000000000000000000000011111111111111111000110000000000000000",
  "0000000000000000000000000111111111111111110000011100000000000000",
  "0000000000000000000000000000111111111111000000000111000000000000",
  "0000000000000000000000000000111000000110000000000001100000000000",
  "0000000000000000000000000000000000000000000000000001100000000000",
  "0000000000000000000000000000000000000000000000001110000000000000",
  "0000000000000000000000000000000000000000000000011100000000000000",
  "0000000000000000000000000000000000000000000000110000000000000000",
  "0000000000000000000000000000000000000000000000010000000000000000",
  "0000000000000000000000000000000000000000000001000000000000000000",
  "0000000000000000000000000000000000000000000011000000000000000000",
  "0000000000000000000000000000000000000000000011100000000000000000",
  "0000000000000000000000000000000000000000000000111000000000000000",
  "0000000000000000000000000000000000000000000000011100000000000000",
  "0000000000000000000000000000000000000000000000000100000000000000",
  "0000000000000000000000000000000000000000000000000110000000000000",
  "0000000000000000000000000000000000000000000000000110000000000000",
  "0000000000000000000000000000000000000000000000000111000000000000",
  "0000000000000000000000000000000000000000000000000011100000000000",
  "0000000000000000000000000000000000000000000000000001110000000000",
];

const WET: boolean[] = (() => {
  const out = new Array<boolean>(WATER_W * WATER_H);
  for (let y = 0; y < WATER_H; y++) {
    for (let x = 0; x < WATER_W; x++) out[y * WATER_W + x] = WATER_ROWS[y][x] === "1";
  }
  return out;
})();

/**
 * For every wet cell, the nearest dry one. Multi-source BFS outward from all
 * dry ground, computed once at module load: about 2,300 cells, so this is
 * cheaper than any per-figure search would be and gives an exact answer
 * instead of a hill-climb that can stall in the middle of a wide river.
 */
const ESCAPE: Int16Array = (() => {
  const n = WATER_W * WATER_H;
  const to = new Int16Array(n).fill(-1);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (!WET[i]) {
      to[i] = i;
      q[tail++] = i;
    }
  }
  while (head < tail) {
    const i = q[head++];
    const x = i % WATER_W;
    const y = (i / WATER_W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= WATER_W || ny >= WATER_H) continue;
      const j = ny * WATER_W + nx;
      if (to[j] !== -1) continue;
      to[j] = to[i];
      q[tail++] = j;
    }
  }
  return to;
})();

const clampCell = (v: number, hi: number) => (v < 0 ? 0 : v >= hi ? hi - 1 : v);

/** Is this point, in board fractions, standing in water? */
export function isWater(x: number, y: number): boolean {
  const cx = clampCell(Math.floor(x * WATER_W), WATER_W);
  const cy = clampCell(Math.floor(y * WATER_H), WATER_H);
  return WET[cy * WATER_W + cx];
}

/**
 * The nearest dry ground to a point, in board fractions, or null if it is
 * already dry. Returns the CENTRE of that cell: precise enough for a figure
 * about half a cell wide, and stable, which matters because two players must
 * see the same board.
 */
export function nearestDry(x: number, y: number): { x: number; y: number } | null {
  const cx = clampCell(Math.floor(x * WATER_W), WATER_W);
  const cy = clampCell(Math.floor(y * WATER_H), WATER_H);
  const i = cy * WATER_W + cx;
  if (!WET[i]) return null;
  const j = ESCAPE[i];
  if (j < 0) return null; // an all-water plate; nothing sensible to do
  return {
    x: ((j % WATER_W) + 0.5) / WATER_W,
    y: (((j / WATER_W) | 0) + 0.5) / WATER_H,
  };
}
