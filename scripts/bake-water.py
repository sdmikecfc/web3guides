"""Write src/lib/s5/world.water.ts from the plate."""
from PIL import Image
import numpy as np
import io

SRC = r"C:\Users\Mike\Desktop\web3guides\public\s5-art\world\bg-land.webp"
DST = r"C:\Users\Mike\Desktop\web3guides\src\lib\s5\world.water.ts"
GW, GH = 64, 32  # grid matches the plate's aspect: 2:1 since 2026-08-01 (was 64x36 for 16:9)

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.int16)
r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
wetpx = (b - r > 24) & (b > 85) & (b + 14 >= g)
H, W = wetpx.shape
cy, cx = H / GH, W / GW
frac = np.zeros((GH, GW))
for y in range(GH):
    for x in range(GW):
        frac[y, x] = wetpx[int(y * cy):int((y + 1) * cy), int(x * cx):int((x + 1) * cx)].mean()
cell = frac > 0.16
closed = cell.copy()
for y in range(1, GH - 1):
    for x in range(GW):
        if not cell[y, x] and cell[y - 1, x] and cell[y + 1, x]:
            closed[y, x] = True
for y in range(GH):
    for x in range(1, GW - 1):
        if not closed[y, x] and closed[y, x - 1] and closed[y, x + 1]:
            closed[y, x] = True

rows = ["".join("1" if closed[y, x] else "0" for x in range(GW)) for y in range(GH)]

body = "\n".join(f'  "{r}",' for r in rows)

TS = f'''/**
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
 * {GW}x{GH} is coarse by design. This exists to keep figures out of the water,
 * not to describe the coastline.
 */
export const WATER_W = {GW};
export const WATER_H = {GH};

const WATER_ROWS: string[] = [
{body}
];

const WET: boolean[] = (() => {{
  const out = new Array<boolean>(WATER_W * WATER_H);
  for (let y = 0; y < WATER_H; y++) {{
    for (let x = 0; x < WATER_W; x++) out[y * WATER_W + x] = WATER_ROWS[y][x] === "1";
  }}
  return out;
}})();

/**
 * For every wet cell, the nearest dry one. Multi-source BFS outward from all
 * dry ground, computed once at module load: about 2,300 cells, so this is
 * cheaper than any per-figure search would be and gives an exact answer
 * instead of a hill-climb that can stall in the middle of a wide river.
 */
const ESCAPE: Int16Array = (() => {{
  const n = WATER_W * WATER_H;
  const to = new Int16Array(n).fill(-1);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {{
    if (!WET[i]) {{
      to[i] = i;
      q[tail++] = i;
    }}
  }}
  while (head < tail) {{
    const i = q[head++];
    const x = i % WATER_W;
    const y = (i / WATER_W) | 0;
    for (let k = 0; k < 4; k++) {{
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= WATER_W || ny >= WATER_H) continue;
      const j = ny * WATER_W + nx;
      if (to[j] !== -1) continue;
      to[j] = to[i];
      q[tail++] = j;
    }}
  }}
  return to;
}})();

const clampCell = (v: number, hi: number) => (v < 0 ? 0 : v >= hi ? hi - 1 : v);

/** Is this point, in board fractions, standing in water? */
export function isWater(x: number, y: number): boolean {{
  const cx = clampCell(Math.floor(x * WATER_W), WATER_W);
  const cy = clampCell(Math.floor(y * WATER_H), WATER_H);
  return WET[cy * WATER_W + cx];
}}

/**
 * The nearest dry ground to a point, in board fractions, or null if it is
 * already dry. Returns the CENTRE of that cell: precise enough for a figure
 * about half a cell wide, and stable, which matters because two players must
 * see the same board.
 */
export function nearestDry(x: number, y: number): {{ x: number; y: number }} | null {{
  const cx = clampCell(Math.floor(x * WATER_W), WATER_W);
  const cy = clampCell(Math.floor(y * WATER_H), WATER_H);
  const i = cy * WATER_W + cx;
  if (!WET[i]) return null;
  const j = ESCAPE[i];
  if (j < 0) return null; // an all-water plate; nothing sensible to do
  return {{
    x: ((j % WATER_W) + 0.5) / WATER_W,
    y: (((j / WATER_W) | 0) + 0.5) / WATER_H,
  }};
}}
'''

io.open(DST, "w", encoding="utf-8").write(TS)
print("wrote", DST, "wet cells", int(closed.sum()))
