import { isoX, isoY } from "../_engine/iso";
import { AWNINGS } from "../_engine/building";
import type { RoomDef } from "../_engine/world";

export type FacadePoint = [number, number];
export type FacadeShape =
  | { kind: "polygon"; points: FacadePoint[]; fill: number; stroke?: number }
  | { kind: "line"; points: FacadePoint[]; stroke: number; width: number }
  | { kind: "ellipse"; center: FacadePoint; rx: number; ry: number; fill: number };

/** All structure and lettering share the room's actual 2:1 projection.
 * This renderer-free description is also used by the art review exporter.
 */
export function storefrontGeometry(room: Pick<RoomDef, "w" | "h" | "door">, awningId: string) {
  const shapes: FacadeShape[] = [];
  const cx = room.door.x + 0.5, wallY = room.h + 0.04;
  const point = (x: number, y: number, z: number): FacadePoint => [isoX(x, y), isoY(x, y) + 5 - z];
  const P = (x: number, z: number) => point(cx + x, wallY, z);
  const polygon = (points: FacadePoint[], fill: number, stroke?: number) => shapes.push({ kind: "polygon", points, fill, stroke });
  const line = (points: FacadePoint[], stroke: number, width = 1) => shapes.push({ kind: "line", points, stroke, width });
  const panel = (left: number, right: number, low: number, high: number, color: number, stroke?: number) => polygon([P(left, high), P(right, high), P(right, low), P(left, low)], color, stroke);
  const ink = 0x786957, cream = 0xf5e8ca, trim = 0xfff6df, sage = 0x67836b, darkSage = 0x456550;
  const palette = AWNINGS.find((a) => a.id === awningId) ?? AWNINGS[0];
  const color = parseInt(palette.color.slice(1), 16), fabric = parseInt(palette.accent.slice(1), 16);

  // A permanent threshold and two substantial wall piers frame an open door.
  // The central opening stays transparent: guests still cross the real entrance.
  polygon([point(cx - .7, wallY - .12, 1), point(cx + .7, wallY - .12, 1), point(cx + .7, wallY + .65, 1), point(cx - .7, wallY + .65, 1)], 0xd4bb97, ink);
  polygon([point(cx - .58, wallY, 2), point(cx + .58, wallY, 2), point(cx + .58, wallY + .5, 2), point(cx - .58, wallY + .5, 2)], 0xf3e4c7);
  for (const [left, right] of [[-1.66, -.67], [.67, 1.66]]) {
    // Return face makes the pier a wall with thickness rather than a signpost.
    polygon([point(cx + left, wallY - .24, 0), point(cx + left, wallY, 0), point(cx + left, wallY, 102), point(cx + left, wallY - .24, 102)], 0xd0bc97, ink);
    panel(left, right, 0, 102, cream, ink);
    panel(left + .06, right - .06, 5, 39, sage);
    panel(left + .15, right - .15, 11, 32, 0x7c967d, 0xaec0a0);
    panel(left, right, 39, 43, trim);
    panel(left, right, 0, 5, 0xb4946b);
    panel(left, left + .07, 43, 99, trim);
  }
  // Door jambs, lintel and cap are attached to those piers.
  panel(-.77, -.61, 0, 72, darkSage, ink);
  panel(.61, .77, 0, 72, darkSage, ink);
  panel(-.77, .77, 68, 74, darkSage, ink);
  panel(-1.66, 1.66, 74, 102, cream, ink);
  panel(-1.76, 1.76, 100, 105, 0xc4a77d, ink);
  polygon([point(cx - 1.76, wallY - .22, 105), point(cx + 1.76, wallY - .22, 105), P(1.76, 105), P(-1.76, 105)], trim, ink);

  // A framed green nameboard is mounted on the fascia ABOVE the fabric awning.
  panel(-1.52, 1.52, 80, 98, 0xb69767, ink);
  panel(-1.46, 1.46, 82, 96, darkSage);
  line([P(-1.38, 94), P(1.38, 94)], 0x91aa86, .6);

  // Attached brass sconces, rather than floating light spots.
  const lights: FacadePoint[] = [];
  for (const x of [-1.21, 1.21]) {
    panel(x - .08, x + .08, 33, 45, 0x9e845e, ink);
    const center = P(x, 39);
    shapes.push({ kind: "ellipse", center, rx: 3, ry: 4.4, fill: 0xfff2be });
    lights.push(center);
  }

  // Six broad cloth bands, a sloping canopy and a soft scalloped valance.
  const left = -1.78, width = 3.56, frontY = wallY + .55;
  const canopy = (x: number, front: boolean, zOffset = 0) => point(cx + x, front ? frontY : wallY, (front ? 66 : 74) + zOffset);
  for (let n = 0; n < 6; n++) {
    const a = left + n * width / 6, b = left + (n + 1) * width / 6, fill = n % 2 ? fabric : color;
    polygon([canopy(a, false), canopy(b, false), canopy(b, true), canopy(a, true)], fill);
    const hem: FacadePoint[] = [canopy(a, true), canopy(b, true)];
    for (let k = 6; k >= 0; k--) {
      const t = k / 6;
      hem.push(canopy(a + (b - a) * t, true, -4.5 - 2 * Math.sin(Math.PI * t)));
    }
    polygon(hem, fill);
  }
  line([canopy(left, false), canopy(left + width, false)], 0x927a5c, 1.2);
  line([canopy(left, false), canopy(left, true)], 0xb5986f, .8);
  line([canopy(left + width, false), canopy(left + width, true)], 0xb5986f, .8);

  // A small chalk menu, set to one side of the actual doorway.
  const mx = cx + 2.06, my = wallY + .6;
  const M = (x: number, z: number, depth = 0) => point(mx + x, my + depth, z);
  line([M(-.27, 0, .35), M(-.18, 30), M(.36, 0, .35)], 0x927858, 2.4);
  polygon([M(-.35, 31), M(.34, 31), M(.41, 4), M(-.42, 4)], 0xc4a577, ink);
  polygon([M(-.29, 28), M(.28, 28), M(.33, 8), M(-.34, 8)], darkSage);
  for (const z of [23, 17, 12]) line([M(-.2, z), M(.2, z)], 0xf0e4c4, .9);

  // A parcel stays on the pavement and does not obstruct the door.
  const px = cx - 2.2, py = wallY + .6;
  const box = (x: number, y: number, z: number) => point(px + x, py + y, z);
  polygon([box(-.22, -.22, 14), box(.22, -.22, 14), box(.22, .22, 14), box(-.22, .22, 14)], 0xf2d19d, ink);
  polygon([box(-.22, .22, 14), box(.22, .22, 14), box(.22, .22, 0), box(-.22, .22, 0)], 0xdca76d, ink);
  polygon([box(.22, -.22, 14), box(.22, .22, 14), box(.22, .22, 0), box(.22, -.22, 0)], 0xbe8e63, ink);
  line([box(0, -.22, 14.2), box(0, .22, 14.2), box(0, .22, 0)], 0xffeed1, 2.5);

  return { shapes, label: P(0, 89), labelWidth: 87, lights, parcel: point(px, py, 21) };
}
