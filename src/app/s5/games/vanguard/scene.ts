/**
 * VANGUARD: the town's LOOK, in one importable module.
 *
 * Split out of Client.tsx for a reason that is not tidiness: an arena that only
 * exists inside a React component can only be judged by playing it, and a
 * canvas game cannot be played in a headless check. Everything here is pure
 * (a context, some numbers, no React, no DOM lookups), so
 * scripts/vanguard-shot.mts can render the same town to a PNG and someone can
 * LOOK at it before it ships. That is how "ugly" gets caught by a machine.
 *
 * Determinism: none of this is stored in the sim or rolled from its streams.
 * The scatter is hashed off WORLD POSITION, so the same corner of the same town
 * carries the same crater on every frame, every replay and every machine, while
 * the sim stays unaware that any of it exists. No state, no tape, no ceiling.
 */
import { VIEW_H, VIEW_W, TANK_R, TRUCK_R } from "./sim";

/** The tank, drawn: hull, tracks, and a gun that always points where the next
 * shell will go. The barrel IS the aim, so it has to be unmistakable. */
export function drawTank(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, hurt: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = "rgba(20,16,10,0.35)";
  ctx.fillRect(-TANK_R - 1, -TANK_R + 2, TANK_R * 2 + 2, TANK_R * 2 - 2);
  // tracks
  ctx.fillStyle = "#2f3128";
  ctx.fillRect(-TANK_R, -TANK_R, TANK_R * 2, 5);
  ctx.fillRect(-TANK_R, TANK_R - 5, TANK_R * 2, 5);
  // hull. Brighter and outlined: a dull olive box on a tan street is the one
  // thing a player must never have to hunt for, and it was losing to the road.
  ctx.fillStyle = hurt ? "#ffffff" : "#93a061";
  ctx.fillRect(-TANK_R + 1, -TANK_R + 4, TANK_R * 2 - 2, TANK_R * 2 - 8);
  ctx.fillStyle = hurt ? "#ffffff" : "#b3c078";
  ctx.fillRect(-TANK_R + 3, -TANK_R + 6, TANK_R * 2 - 8, TANK_R * 2 - 12);
  ctx.strokeStyle = "rgba(18,20,12,0.85)";
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-TANK_R + 1, -TANK_R + 4, TANK_R * 2 - 2, TANK_R * 2 - 8);
  // turret + barrel, pointing +x = the heading
  ctx.fillStyle = "#59613f";
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#59613f";
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(TANK_R + 9, 0);
  ctx.stroke();
  ctx.restore();
}

export function drawTruck(ctx: CanvasRenderingContext2D, x: number, y: number, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = "rgba(20,16,10,0.35)";
  ctx.fillRect(-TRUCK_R - 1, -8, TRUCK_R * 2 + 2, 16);
  // bed + cab
  ctx.fillStyle = "#6a5f3f";
  ctx.fillRect(-TRUCK_R, -7, TRUCK_R * 1.4, 14);
  ctx.fillStyle = "#7a6d47";
  ctx.fillRect(TRUCK_R * 0.4 - 2, -6, TRUCK_R * 0.6 + 2, 12);
  // the gun on the back: the reason it is dangerous, so it reads
  ctx.strokeStyle = HOSTILE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-TRUCK_R * 0.2, 0);
  ctx.lineTo(TRUCK_R * 0.9, 0);
  ctx.stroke();
  ctx.restore();
}




/** THE STREET IS THE LIGHT PART. This is the whole readability rule of a
 * top-down town: the ground you may drive on is pale dust, and everything you
 * may not drive on is a dark mass sitting on it. The first pass had asphalt at
 * #33362e against buildings at #5a5348 -- two dark tones a few percent apart --
 * and the result was a muddy field where you could not see where the roads
 * were, which is worse than ugly. Value first, colour second. */
export const ROAD = "#8a8471";
export const ROAD_EDGE = "#736d5c";
// EVERY ROOF IS DARKER THAN THE ROAD. Adding "materials" quietly undid the one
// rule that makes a top-down town readable: a pale concrete and a pale stucco
// sat within a few percent of the street, so in play the blocks and the road
// merged into one tan field again. Hue can vary all it likes; VALUE may not.
export const BUILDING = ["#4b4a44", "#5a3b2d", "#414736", "#544c3c"];
/** The parapet running round a roof: the single strongest "this is the top of a
 * building" cue from directly above, and free contrast against the street. */
export const PARAPET = ["#767569", "#84573f", "#68704f", "#7d735a"];
/** The SOUTH WALL of each block, per tone. Darker than its own roof (the wall
 * faces away from the top-left key light) and still darker than the road, so
 * the value law that makes this town readable survives the extrusion. */
export const WALL = ["#2e2d2a", "#36211a", "#282b1e", "#302c23"];
/** The lit sliver along the top of a wall where it meets the roof edge. */
export const WALL_LIP = ["#5e5d54", "#6b4534", "#525839", "#645b48"];
/** A window: dark glass, or warm if a fire is still burning behind it. */
export const WINDOW_DK = "rgba(14,16,18,0.72)";

/** How tall a block stands, in screen px. Deliberately modest: height projects
 * UP the screen, so a tall block would cover street the tank can legally drive
 * on. 18% of the short side, clamped, reads as three or four storeys without
 * ever hiding a lane. Pure function of the rect: no state, no rng. */
export function blockHeight(w: number, h: number, hash: number): number {
  // 0.18 -> 0.27 and the clamp 26 -> 38 after the first look: at the old
  // height the wall read as a skirting board under a flat roof rather than as
  // the side of a building. Still bounded, because height projects UP the
  // screen and a tower would hide the lane above its own plot.
  const base = Math.min(w, h) * 0.27;
  return Math.max(14, Math.min(38, base * (0.75 + hash * 0.7)));
}
export const ROOF_LINE = "rgba(14,12,8,0.62)";
export const HOSTILE = "#ff5cf0"; // the season's colourblind law: hostiles carry magenta
export const RUBBLE = "#a39a83";
export const RUBBLE_DK = "#5c5648";
export const SCORCH = "rgba(28,22,14,0.34)";
/** A fire still burning behind a window: the only warm colour in the town. */
export const LIT_WINDOW = "rgba(255,157,60,0.5)";

/** Deterministic value noise off a WORLD CELL. The scenery below is scattered
 * with this rather than stored in the sim: the same corner of the same town
 * carries the same crater on every frame, every replay and every machine, and
 * the sim never has to know any of it is there. No state, no tape, no ceiling.
 * (Math.random would shimmer as the camera moved, which is how you can tell a
 * scatter is being re-rolled per frame.) */
export function h2(ix: number, iy: number, salt: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** THE GROUND ITSELF: dust, grain and cracks, hashed off world position.
 *
 * This used to be a tiled canvas texture baked in the browser, which meant the
 * offline renderer could not show it and the picture being reviewed was not the
 * picture being shipped. Hashed noise draws identically in both, so what gets
 * looked at is what gets played. */
export function drawGround(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  viewW: number = VIEW_W,
  viewH: number = VIEW_H,
) {
  ctx.fillStyle = ROAD;
  ctx.fillRect(0, 0, viewW, viewH);
  const G = 26;
  const i0 = Math.floor(camX / G) - 1;
  const j0 = Math.floor(camY / G) - 1;
  const i1 = Math.floor((camX + viewW) / G) + 1;
  const j1 = Math.floor((camY + viewH) / G) + 1;
  for (let ix = i0; ix <= i1; ix++) {
    for (let jy = j0; jy <= j1; jy++) {
      const x = ix * G - camX;
      const y = jy * G - camY;
      const a = h2(ix, jy, 101);
      // Broad dust, as SOFT BLOBS rather than filled cells. Tinting the cell
      // itself painted a visible checkerboard across the whole town, which is
      // the classic tell of a per-cell scatter and reads as tiling, not dirt.
      const rr = 14 + h2(ix, jy, 102) * 26;
      ctx.fillStyle = a < 0.5 ? "rgba(116,108,88,0.085)" : "rgba(186,178,150,0.075)";
      ctx.beginPath();
      ctx.ellipse(x + G * 0.5, y + G * 0.5, rr, rr * (0.6 + h2(ix, jy, 103) * 0.5), 0, 0, Math.PI * 2);
      ctx.fill();
      // Grit.
      for (let k = 0; k < 3; k++) {
        const gx = x + h2(ix, jy, 110 + k) * G;
        const gy = y + h2(ix, jy, 120 + k) * G;
        ctx.fillStyle = k % 2 ? "rgba(60,54,42,0.20)" : "rgba(200,192,166,0.16)";
        ctx.fillRect(gx, gy, 1.6, 1.6);
      }
      // A crack every so often: shelled tarmac splits.
      if (a > 0.93) {
        ctx.strokeStyle = "rgba(52,46,34,0.34)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + h2(ix, jy, 131) * G);
        ctx.lineTo(x + G - 2, y + h2(ix, jy, 132) * G);
        ctx.stroke();
      }
    }
  }
}

/** ROAD MARKINGS down the middle of every street, worn and broken. The single
 * cheapest cue that a tan corridor is a ROAD: without them the town read as a
 * field with blocks standing in it. Drawn from the sim's own node lines, so a
 * marking can never run down something that is not a street. */
export function drawMarkings(
  ctx: CanvasRenderingContext2D,
  nodeX: number[],
  nodeY: number[],
  ox: number,
  oy: number,
  viewW: number = VIEW_W,
  viewH: number = VIEW_H,
) {
  ctx.strokeStyle = "rgba(232,222,190,0.5)";
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 22]);
  ctx.beginPath();
  for (const nx of nodeX) {
    const x = nx + ox;
    if (x < -20 || x > viewW + 20) continue;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, viewH);
  }
  for (const ny of nodeY) {
    const y = ny + oy;
    if (y < -20 || y > viewH + 20) continue;
    ctx.moveTo(0, y);
    ctx.lineTo(viewW, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/** THE GROUND OF A FOUGHT-OVER TOWN. Craters, spilled rubble, burnt-out
 * wrecks, abandoned sandbag lines. Drawn BEFORE the buildings, so a block
 * covers whatever the scatter put under it and the debris only shows where
 * there is open street to show it on. Culled to the view, one cell at a time,
 * so the cost is a constant few dozen cells however big the town is. */
export const CELL = 76;
export function drawScenery(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  viewW: number = VIEW_W,
  viewH: number = VIEW_H,
) {
  const i0 = Math.floor(camX / CELL) - 1;
  const j0 = Math.floor(camY / CELL) - 1;
  const i1 = Math.floor((camX + viewW) / CELL) + 1;
  const j1 = Math.floor((camY + viewH) / CELL) + 1;
  for (let ix = i0; ix <= i1; ix++) {
    for (let jy = j0; jy <= j1; jy++) {
      const r = h2(ix, jy, 7);
      const x = ix * CELL + h2(ix, jy, 11) * CELL - camX;
      const y = jy * CELL + h2(ix, jy, 13) * CELL - camY;
      if (r < 0.085) {
        // SHELL CRATER. Rare on purpose: the first pass put one on a fifth of
        // all cells and the street turned into black polka dots. A THROWN RING
        // of pale spoil with a scorched middle, not a hole -- from straight
        // above, a crater is mostly the ring.
        const rr = 9 + h2(ix, jy, 17) * 9;
        ctx.fillStyle = "rgba(168,158,133,0.55)";
        ctx.beginPath();
        ctx.ellipse(x, y, rr * 1.42, rr * 1.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = SCORCH;
        ctx.beginPath();
        ctx.ellipse(x, y, rr, rr * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(46,38,26,0.5)";
        ctx.beginPath();
        ctx.ellipse(x, y, rr * 0.5, rr * 0.44, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (r < 0.24) {
        // RUBBLE SPILL: chips of the building that used to be nearby.
        for (let k = 0; k < 6; k++) {
          const a = h2(ix, jy, 20 + k) * Math.PI * 2;
          const d = 3 + h2(ix, jy, 30 + k) * 20;
          const w = 2.5 + h2(ix, jy, 40 + k) * 4.5;
          ctx.fillStyle = k % 2 ? RUBBLE : RUBBLE_DK;
          ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, w, w * 0.8);
        }
      } else if (r < 0.30) {
        // BURNT-OUT WRECK: charred, wheelless, never magenta. Hostiles are the
        // only magenta on this board and a dead hulk must not read as one.
        const a = h2(ix, jy, 51) * Math.PI;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillStyle = SCORCH;
        ctx.fillRect(-18, -11, 36, 22);
        ctx.fillStyle = "#2b2721";
        ctx.fillRect(-14, -7, 28, 14);
        ctx.fillStyle = "#4a4136";
        ctx.fillRect(-14, -7, 11, 14);
        ctx.fillStyle = "rgba(120,110,92,0.5)";
        ctx.fillRect(-6, -2, 12, 4);
        ctx.restore();
      } else if (r < 0.36) {
        // SANDBAGS: someone held this corner once.
        const vert = h2(ix, jy, 61) < 0.5;
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = k % 2 ? "#7c7358" : "#6b6350";
          const bx = vert ? x : x + k * 9;
          const by = vert ? y + k * 9 : y;
          ctx.beginPath();
          ctx.ellipse(bx, by, vert ? 6 : 5, vert ? 5 : 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

/** THE BLOCKS. A dark mass on a pale street, lifted off it by a hard shadow,
 * with a kerb around its foot and enough on the roof to read as a building
 * rather than a hole. Roughly a third have been SHELLED: corner blown in,
 * roof scorched, rubble spilled onto the pavement, smoke going up.
 *
 * Returns the smoke plumes for the caller to draw after everything else, since
 * smoke rises over the whole scene and not just over its own roof. */
/** THE BUILDING CATALOGUE, generated by /dev/bake (v20) and pasted here so
 * the geometry can never drift from the art. Per model:
 *   fw/fh = the ground footprint's size, as a fraction of the sprite cell
 *   fb    = sprite bottom -> footprint bottom, same units
 *   ar    = fw/fh, the footprint's aspect, which is what a lot is matched on
 * A block is TILED with several of these rather than stretching one over the
 * whole rect, so every building keeps its own proportions. */
const BLD: { k: string; fw: number; fh: number; fb: number; ar: number }[] = [
  { k: "ca", fw: 0.5479, fh: 0.4730, fb: 0.0292, ar: 1.158 },
  { k: "cb", fw: 0.5745, fh: 0.4518, fb: 0.0504, ar: 1.272 },
  { k: "cc", fw: 0.5038, fh: 0.5043, fb: 0.0991, ar: 0.999 },
  { k: "cd", fw: 0.5459, fh: 0.4746, fb: 0.0172, ar: 1.150 },
  { k: "ce", fw: 0.6816, fh: 0.3399, fb: 0.2216, ar: 2.005 },
  { k: "cf", fw: 0.5056, fh: 0.5031, fb: -0.0493, ar: 1.005 },
  { k: "cg", fw: 0.5799, fh: 0.4473, fb: -0.0193, ar: 1.296 },
  { k: "ch", fw: 0.5274, fh: 0.4882, fb: 0.0304, ar: 1.080 },
  { k: "ci", fw: 0.5517, fh: 0.4701, fb: 0.0466, ar: 1.174 },
  { k: "cj", fw: 0.6729, fh: 0.3512, fb: 0.1647, ar: 1.916 },
  { k: "ck", fw: 0.7290, fh: 0.2675, fb: 0.2160, ar: 2.726 },
  { k: "cl", fw: 0.5591, fh: 0.4643, fb: -0.0028, ar: 1.204 },
  { k: "cm", fw: 0.5652, fh: 0.4594, fb: -0.1492, ar: 1.230 },
  { k: "cn", fw: 0.6294, fh: 0.4007, fb: 0.1031, ar: 1.571 },
  { k: "ia", fw: 0.6872, fh: 0.3324, fb: 0.1922, ar: 2.067 },
  { k: "ib", fw: 0.6843, fh: 0.3363, fb: 0.1908, ar: 2.034 },
  { k: "ic", fw: 0.5318, fh: 0.4850, fb: 0.1540, ar: 1.097 },
  { k: "id", fw: 0.4227, fh: 0.5512, fb: 0.0267, ar: 0.767 },
  { k: "ie", fw: 0.6350, fh: 0.3949, fb: 0.1207, ar: 1.608 },
  { k: "if", fw: 0.6507, fh: 0.3776, fb: 0.1067, ar: 1.723 },
  { k: "ig", fw: 0.6354, fh: 0.3944, fb: 0.1612, ar: 1.611 },
  { k: "ih", fw: 0.5682, fh: 0.4570, fb: 0.1794, ar: 1.243 },
  { k: "ii", fw: 0.4963, fh: 0.5092, fb: 0.1419, ar: 0.975 },
  { k: "ij", fw: 0.4958, fh: 0.5095, fb: 0.1237, ar: 0.973 },
  { k: "ik", fw: 0.6550, fh: 0.3727, fb: 0.2001, ar: 1.757 },
  { k: "il", fw: 0.5954, fh: 0.4336, fb: 0.1225, ar: 1.373 },
  { k: "im", fw: 0.4898, fh: 0.5133, fb: 0.0782, ar: 0.954 },
  { k: "in", fw: 0.4533, fh: 0.5349, fb: -0.0257, ar: 0.847 },
  { k: "sa", fw: 0.6275, fh: 0.4027, fb: 0.1811, ar: 1.558 },
  { k: "sb", fw: 0.6788, fh: 0.3435, fb: 0.2048, ar: 1.976 },
  { k: "sc", fw: 0.6249, fh: 0.4053, fb: 0.1506, ar: 1.542 },
  { k: "sd", fw: 0.6904, fh: 0.3279, fb: 0.1939, ar: 2.105 },
  { k: "se", fw: 0.6275, fh: 0.4027, fb: 0.1382, ar: 1.558 },
  { k: "sf", fw: 0.5701, fh: 0.4555, fb: 0.1396, ar: 1.252 },
  { k: "sg", fw: 0.6209, fh: 0.4094, fb: 0.1992, ar: 1.517 },
  { k: "sh", fw: 0.6540, fh: 0.3739, fb: 0.2046, ar: 1.749 },
  { k: "si", fw: 0.6250, fh: 0.4053, fb: 0.1927, ar: 1.542 },
  { k: "sj", fw: 0.6650, fh: 0.3609, fb: 0.1724, ar: 1.843 },
  { k: "sk", fw: 0.5361, fh: 0.4819, fb: 0.0635, ar: 1.113 },
  { k: "sl", fw: 0.5694, fh: 0.4560, fb: 0.1031, ar: 1.249 },
  { k: "sm", fw: 0.5657, fh: 0.4591, fb: 0.1851, ar: 1.232 },
  { k: "sn", fw: 0.6332, fh: 0.3968, fb: 0.1837, ar: 1.596 },
];

/** Draw one catalogue building into a destination rect. Returns false if the
 * sprite is not available, so the caller falls back to the drawn mass. The
 * SCENE owns the geometry (which model, where, how big); the caller owns the
 * pixels, which is what keeps this module import-free. */
export type BuildingDraw = (
  ctx: CanvasRenderingContext2D,
  key: string,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) => boolean;

/** Pick a model for one lot: nearest footprint aspect, then a hashed choice
 * among the closest few so a street is not the same building eight times. */
function pickBuilding(lotAr: number, hash: number): (typeof BLD)[number] {
  const ranked = BLD.map((b, i) => ({ i, d: Math.abs(Math.log(b.ar / lotAr)) })).sort((a, b) => a.d - b.d);
  const pool = ranked.slice(0, 10);
  return BLD[pool[Math.floor(hash * pool.length) % pool.length].i];
}

/** What the catalogue's footprints mostly look like, so lots are cut to suit
 * the art rather than the art stretched to suit the lots. */
const LOT_AR = 1.37;
/** Target lot WIDTH in px. A block is divided into whole lots nearest this. */
const LOT_W = 104;

/** What the caller can stamp on a roof or a pavement. The town itself stays
 * vector; these are the Kenney tilt-bakes, passed IN so this module keeps zero
 * imports and the offline shot script renders the identical scene. `size` is
 * the sprite's width in px and the sprite's FOOT sits on (x, y). */
export type PropDraw = (
  ctx: CanvasRenderingContext2D,
  kind: "chimney-s" | "chimney-m" | "tank" | "tree-l" | "tree-s",
  x: number,
  y: number,
  size: number,
) => void;

export function drawBuildings(
  ctx: CanvasRenderingContext2D,
  list: { x: number; y: number; w: number; h: number; tone: number }[],
  ox: number,
  oy: number,
  viewW: number,
  viewH: number,
  prop?: PropDraw,
  bld?: BuildingDraw,
): { x: number; y: number; seed: number }[] {
  const smoking: { x: number; y: number; seed: number }[] = [];
  for (const b of list) {
    const x = b.x + ox;
    const y = b.y + oy;
    if (x + b.w < -12 || y + b.h < -12 || x > viewW + 12 || y > viewH + 12) continue;
    const key = Math.round(b.x);
    const key2 = Math.round(b.y);
    const wrecked = h2(key, key2, 3) < 0.34;

    // PAVEMENT, then KERB, drawn at the TRUE FOOTPRINT: the block is about to
    // stand up out of it, and these two rings are what keep the collision edge
    // legible once the mass is leaning up the screen.
    ctx.fillStyle = "rgba(196,187,160,0.42)";
    ctx.fillRect(x - 9, y - 9, b.w + 18, b.h + 18);
    ctx.fillStyle = "rgba(122,113,92,0.55)";
    ctx.fillRect(x - 3, y - 3, b.w + 6, b.h + 6);

    // ── A STREET OF BUILDINGS ──────────────────────────────────────────────
    // Tiled with catalogue models at their own proportions. The union of the
    // lots is the block, so what the tank collides with is exactly what it can
    // see. Intact blocks only: a wrecked one is drawn rubble below, because
    // there is no bombed-out model and a pristine town has no war in it.
    if (bld) {
      const nx = Math.max(1, Math.round(b.w / LOT_W));
      const ny = Math.max(1, Math.round(b.h / (LOT_W / LOT_AR)));
      const lw = b.w / nx;
      const lh = b.h / ny;
      let laid = 0;
      // back row first: a nearer building must overlap the one behind it
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const lx = x + i * lw;
          const ly = y + j * lh;
          const hh = h2(key + i * 131, key2 + j * 71, 80);
          // A BOMBED BLOCK IS STILL A STREET OF BUILDINGS, just a broken one.
          // Roughly two lots in five are levelled to a rubble pad and the rest
          // still stand (scorched below), which reads as a shelled terrace
          // rather than as the flat brown rectangle a wrecked block used to be.
          if (wrecked && h2(key + i * 17, key2 + j * 23, 81) < 0.42) {
            // A LEVELLED LOT: scorched ground, the stub of the outer wall
            // still standing, one interior wall, a crater and the debris field.
            // A flat brown pad was what made a bombed block read as a hole in
            // the map rather than as a building that used to be here.
            ctx.fillStyle = "rgba(26,21,14,0.55)";
            ctx.fillRect(lx, ly, lw, lh);
            ctx.fillStyle = RUBBLE_DK;
            ctx.fillRect(lx + 4, ly + 4, lw - 8, lh - 8);
            // surviving foundation: the outer wall, broken on one side
            ctx.strokeStyle = "rgba(158,148,126,0.75)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            const gapSide = Math.floor(h2(key + i, key2 + j, 84) * 4);
            if (gapSide !== 0) { ctx.moveTo(lx + 4, ly + 4); ctx.lineTo(lx + lw - 4, ly + 4); }
            if (gapSide !== 1) { ctx.moveTo(lx + lw - 4, ly + 4); ctx.lineTo(lx + lw - 4, ly + lh - 4); }
            if (gapSide !== 2) { ctx.moveTo(lx + lw - 4, ly + lh - 4); ctx.lineTo(lx + 4, ly + lh - 4); }
            if (gapSide !== 3) { ctx.moveTo(lx + 4, ly + lh - 4); ctx.lineTo(lx + 4, ly + 4); }
            ctx.stroke();
            // one interior wall stub, so the pad reads as rooms not a yard
            ctx.strokeStyle = "rgba(140,131,110,0.6)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            if (h2(key + i, key2 + j, 85) < 0.5) {
              const mx = lx + lw * (0.35 + h2(key, key2 + j, 86) * 0.3);
              ctx.moveTo(mx, ly + 6);
              ctx.lineTo(mx, ly + lh * (0.4 + h2(key + i, key2, 87) * 0.4));
            } else {
              const my = ly + lh * (0.35 + h2(key, key2 + j, 86) * 0.3);
              ctx.moveTo(lx + 6, my);
              ctx.lineTo(lx + lw * (0.4 + h2(key + i, key2, 87) * 0.4), my);
            }
            ctx.stroke();
            // the crater that did it
            {
              const cx2 = lx + lw * (0.3 + h2(key + i, key2, 88) * 0.4);
              const cy2 = ly + lh * (0.3 + h2(key, key2 + j, 89) * 0.4);
              const cr2 = Math.min(lw, lh) * 0.22;
              ctx.fillStyle = "rgba(18,14,9,0.55)";
              ctx.beginPath();
              ctx.ellipse(cx2, cy2, cr2, cr2 * 0.78, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = "rgba(150,140,118,0.35)";
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.ellipse(cx2, cy2, cr2 * 1.15, cr2 * 0.9, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
            for (let r2 = 0; r2 < 16; r2++) {
              const rr = h2(key + i * 7 + r2, key2 + j * 11, 82);
              ctx.fillStyle = r2 % 3 ? RUBBLE : "rgba(120,112,94,0.9)";
              ctx.fillRect(
                lx + 5 + rr * (lw - 14),
                ly + 5 + h2(key + r2, key2 + j, 83) * (lh - 14),
                2.5 + rr * 6,
                2.5 + rr * 5,
              );
            }
            laid++;
            continue;
          }
          const m = pickBuilding(lw / lh, hh);
          const dw = lw / m.fw;
          const dh = lh / m.fh;
          const dx2 = lx + lw / 2 - dw / 2;
          const dy2 = ly + lh - dh * (1 - m.fb);
          if (bld(ctx, m.k, dx2, dy2, dw, dh)) laid++;
        }
      }
      if (laid > 0) {
        if (wrecked) {
          // SCORCH over the whole plot, and the plume the sim's smoke hangs on
          ctx.fillStyle = "rgba(24,18,10,0.34)";
          ctx.fillRect(x, y - 30, b.w, b.h + 30);
          smoking.push({ x: x + b.w * 0.5, y: y + b.h * 0.45, seed: key });
        }
        // the block's own contact shadow on the street, at the true footprint
        ctx.fillStyle = "rgba(24,20,13,0.30)";
        ctx.fillRect(x + 3, y + b.h, b.w, 5);
        // rooftop furniture rides the tallest lot; trees stand at the front
        if (prop && !wrecked && b.w > 70) {
          const n = h2(key, key2, 68) < 0.42 ? 2 : h2(key, key2, 68) < 0.72 ? 1 : 0;
          for (let t = 0; t < n; t++) {
            const tx = x + 12 + h2(key + t * 31, key2, 69) * Math.max(1, b.w - 24);
            prop(ctx, h2(key, key2 + t * 17, 70) < 0.5 ? "tree-l" : "tree-s", tx, y + b.h - 1, 22);
          }
        }
        continue;
      }
    }

    // ── THE BLOCK STANDS UP (fallback) ─────────────────────────────────────
    // Height projects straight UP the screen (S5's tilt convention, ADR-0092),
    // so: the roof is the footprint shifted up by H, and the wall is the band
    // between the roof's bottom edge and the ground line. Every pixel of this
    // is derived from the collision rect, at any aspect ratio.
    const H = wrecked
      ? blockHeight(b.w, b.h, h2(key, key2, 61)) * 0.55
      : blockHeight(b.w, b.h, h2(key, key2, 61));
    const ry = y - H; // roof top
    const wallTop = y + b.h - H; // where the wall meets the roof's bottom edge

    // ground shadow, thrown down-right from the FOOT of the mass
    ctx.fillStyle = "rgba(26,21,14,0.34)";
    ctx.fillRect(x + 4, y + 5, b.w, b.h);

    // THE SOUTH WALL. One visible face, because the season's tilt camera is
    // tilted about X only -- the same reason every baked structure carries its
    // height directly above its anchor.
    ctx.fillStyle = WALL[b.tone % WALL.length];
    ctx.fillRect(x, wallTop, b.w, H);
    // LIGHT FALLOFF down the face, as three bands rather than a gradient
    // object: a lit wall is brighter where it catches the sky at the roof line
    // and darkest where it meets the street, and this is what stops the band
    // reading as a dark stripe under a flat roof. Bands, not createLinearGradient,
    // because this runs per visible block per frame.
    ctx.fillStyle = "rgba(255,246,224,0.07)";
    ctx.fillRect(x, wallTop, b.w, H * 0.24);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(x, wallTop + H * 0.72, b.w, H * 0.28);
    // the wall's own contact shadow, thrown onto the street at its foot
    ctx.fillStyle = "rgba(24,20,13,0.30)";
    ctx.fillRect(x + 3, y + b.h, b.w, 5);
    // WINDOWS: two rows of dark glass, with the occasional fire still burning.
    // Spaced off the wall's own width so a 40px shed and a 300px block both
    // read, and hashed so the same block lights the same windows forever.
    if (H >= 12) {
      const cols = Math.max(1, Math.floor(b.w / 22));
      const ww = Math.min(9, (b.w / cols) * 0.42);
      const rows = H >= 19 ? 2 : 1;
      for (let r = 0; r < rows; r++) {
        const wy2 = wallTop + 4 + r * (H / rows);
        const wh2 = Math.max(3, H / rows - 7);
        for (let c2 = 0; c2 < cols; c2++) {
          const wx2 = x + (b.w / cols) * (c2 + 0.5) - ww / 2;
          const lit = h2(key + c2 * 7, key2 + r * 13, 62) < 0.14;
          ctx.fillStyle = lit ? LIT_WINDOW : WINDOW_DK;
          ctx.fillRect(wx2, wy2, ww, wh2);
        }
      }
    }
    // PILASTERS at both ends of the face: two vertical shadows are all it
    // takes for a flat band to read as a wall with corners.
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(x, wallTop, 3, H);
    ctx.fillRect(x + b.w - 3, wallTop, 3, H);
    // the lit lip where wall meets roof: the edge that sells the height
    ctx.fillStyle = WALL_LIP[b.tone % WALL_LIP.length];
    ctx.fillRect(x, wallTop - 2, b.w, 2);

    // THE ROOF, shifted up by H.
    ctx.fillStyle = BUILDING[b.tone % BUILDING.length];
    ctx.fillRect(x, ry, b.w, b.h);
    // PARAPET: a lighter band inside the edge, all the way round.
    ctx.strokeStyle = PARAPET[b.tone % PARAPET.length];
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2.5, ry + 2.5, b.w - 5, b.h - 5);

    // ROOFTOP FURNITURE, from the Kenney city kit (the caller supplies the
    // sprites; no art here). Chimneys and water tanks, deterministic off the
    // block's own hash, sized against the roof so a shed never wears a stack
    // bigger than itself.
    if (prop && !wrecked && b.w > 54 && b.h > 54) {
      const r0 = h2(key, key2, 63);
      const px2 = x + 14 + h2(key, key2, 64) * (b.w - 28);
      const py2 = ry + 16 + h2(key, key2, 65) * (b.h - 30);
      const cap = Math.min(b.w, b.h) * 0.34;
      if (r0 < 0.34) prop(ctx, "tank", px2, py2, Math.min(42, cap));
      else if (r0 < 0.62) prop(ctx, r0 < 0.48 ? "chimney-m" : "chimney-s", px2, py2, Math.min(28, cap));
      if (h2(key, key2, 66) < 0.3) {
        prop(ctx, "chimney-s", x + b.w - 18 - h2(key, key2, 67) * 12, ry + b.h - 12, Math.min(22, cap));
      }
    }

    // TREES, standing on the block's SOUTH FACE — inside the footprint, so a
    // tree is always on ground the tank genuinely cannot drive through. On the
    // pavement they would look solid and not be, which is the one lie this
    // game's art is not allowed to tell.
    if (prop && b.w > 70) {
      const n = h2(key, key2, 68) < 0.42 ? 2 : h2(key, key2, 68) < 0.72 ? 1 : 0;
      for (let t = 0; t < n; t++) {
        const tx = x + 12 + h2(key + t * 31, key2, 69) * Math.max(1, b.w - 24);
        prop(ctx, h2(key, key2 + t * 17, 70) < 0.5 ? "tree-l" : "tree-s", tx, y + b.h - 1, 22);
      }
    }

    if (wrecked) {
      ctx.fillStyle = "rgba(16,13,9,0.26)";
      ctx.fillRect(x, ry, b.w, b.h);
      // THE ROOF HAS FALLEN IN. One big collapse, not five little boxes: a
      // ruin reads as a hole with a rubble floor and the stubs of interior
      // walls showing, and scattering small dark rectangles instead just made
      // the block look like it had crates on it.
      const half = h2(key, key2, 40) < 0.5;
      const hx = x + 5;
      const hy = half ? ry + 5 : ry + b.h * 0.45;
      const hw2 = Math.max(10, b.w - 10);
      const hh2 = Math.max(10, (half ? b.h * 0.52 : b.h * 0.5) - 8);
      ctx.fillStyle = "rgba(20,16,11,0.62)";
      ctx.fillRect(hx, hy, hw2, hh2);
      ctx.fillStyle = RUBBLE_DK;
      ctx.fillRect(hx + 3, hy + 3, hw2 - 6, hh2 - 6);
      // interior wall stubs, still standing
      for (let k = 0; k < 4; k++) {
        const wx2 = hx + 6 + h2(key + k, key2, 45) * (hw2 - 14);
        const wy2 = hy + 5 + h2(key, key2 + k, 46) * (hh2 - 12);
        ctx.fillStyle = "rgba(150,142,120,0.55)";
        if (k % 2) ctx.fillRect(wx2, wy2, 3, Math.min(22, hh2 * 0.4));
        else ctx.fillRect(wx2, wy2, Math.min(26, hw2 * 0.4), 3);
      }
      // rubble spilling out of it
      for (let k = 0; k < 8; k++) {
        const rr2 = h2(key + k, key2 + k, 47);
        ctx.fillStyle = k % 3 ? RUBBLE : "rgba(120,112,94,0.9)";
        ctx.fillRect(hx + rr2 * hw2, hy + h2(key - k, key2, 48) * hh2, 3 + rr2 * 5, 3 + rr2 * 4);
      }
      const cw = Math.min(b.w * 0.46, 46);
      const ch = Math.min(b.h * 0.46, 46);
      const corner = Math.floor(h2(key, key2, 5) * 4);
      const cx0 = corner === 1 || corner === 2 ? x + b.w - cw : x;
      const cy0 = corner >= 2 ? ry + b.h - ch : ry;
      // The hole is painted in RUBBLE, not in the road colour: a collapsed
      // corner is a heap you can see into, not a clean bite out of the block.
      ctx.fillStyle = RUBBLE_DK;
      ctx.beginPath();
      ctx.moveTo(cx0, cy0);
      ctx.lineTo(cx0 + cw, cy0 + (corner % 2 ? 0 : ch * 0.35));
      ctx.lineTo(cx0 + cw * 0.55, cy0 + ch);
      ctx.lineTo(cx0, cy0 + ch * 0.8);
      ctx.closePath();
      ctx.fill();
      for (let k = 0; k < 9; k++) {
        const rr = h2(key + k, key2, 9);
        ctx.fillStyle = k % 3 ? RUBBLE : RUBBLE_DK;
        const px = cx0 + rr * cw * 1.15 - cw * 0.07;
        const py = cy0 + h2(key, key2 + k, 10) * ch * 1.15 - ch * 0.07;
        ctx.fillRect(px, py, 3 + rr * 5, 3 + rr * 4);
      }
      smoking.push({ x: cx0 + cw * 0.5, y: cy0 + ch * 0.5, seed: key });
    } else {
      // THE ROOF, because that is what you can see from here. The old pass
      // scattered "windows" across the top of every block, which at play size
      // read as confetti rather than as a building: from directly above you
      // see panels, a stairwell head, vent runs and the odd skylight.
      // THE ROOF CATCHES THE LIGHT unevenly: brighter at the top-left corner
      // where the key light hits, falling off across the slab. Two stepped
      // rects rather than a gradient object (per block, per frame).
      ctx.fillStyle = "rgba(255,246,214,0.075)";
      ctx.fillRect(x + 3, ry + 3, b.w - 6, b.h - 6);
      ctx.fillStyle = "rgba(255,248,220,0.05)";
      ctx.fillRect(x + 3, ry + 3, b.w * 0.55, b.h * 0.5);
      ctx.fillStyle = "rgba(12,10,7,0.07)";
      ctx.fillRect(x + b.w * 0.55, ry + b.h * 0.5, b.w * 0.45 - 3, b.h * 0.5 - 3);
      // panel seams, in the long direction only
      ctx.strokeStyle = "rgba(16,13,9,0.34)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (b.w > b.h) {
        for (let px = x + 26; px < x + b.w - 12; px += 26) {
          ctx.moveTo(px, ry + 6);
          ctx.lineTo(px, ry + b.h - 6);
        }
      } else {
        for (let py = ry + 26; py < ry + b.h - 12; py += 26) {
          ctx.moveTo(x + 6, py);
          ctx.lineTo(x + b.w - 6, py);
        }
      }
      ctx.stroke();
      // stairwell head, with a lit edge so it has height
      const sw = Math.min(20, b.w * 0.32);
      const sh = Math.min(16, b.h * 0.32);
      const stx = x + 8 + h2(key, key2, 51) * Math.max(1, b.w - sw - 16);
      const sty = ry + 8 + h2(key, key2, 52) * Math.max(1, b.h - sh - 16);
      ctx.fillStyle = "rgba(10,9,6,0.42)";
      ctx.fillRect(stx + 2, sty + 3, sw, sh);
      ctx.fillStyle = PARAPET[b.tone % PARAPET.length];
      ctx.fillRect(stx, sty, sw, sh);
      ctx.fillStyle = "rgba(238,230,204,0.14)";
      ctx.fillRect(stx, sty, sw, 2.5);
      // vent run
      if (Math.min(b.w, b.h) > 46) {
        for (let k = 0; k < 3; k++) {
          const vx = x + b.w * 0.6 + k * 11;
          const vy = ry + b.h * 0.66;
          if (vx > x + b.w - 10) break;
          ctx.fillStyle = "rgba(12,10,7,0.30)";
          ctx.fillRect(vx, vy, 7, 7);
          ctx.fillStyle = "rgba(210,202,176,0.16)";
          ctx.fillRect(vx, vy, 7, 1.5);
        }
      }
      // a skylight or two, lit from inside
      for (let k = 0; k < 2; k++) {
        const gx = x + 10 + h2(key + k, key2, 71) * Math.max(1, b.w - 24);
        const gy = ry + 10 + h2(key, key2 + k, 72) * Math.max(1, b.h - 24);
        ctx.fillStyle = h2(key + k, key2 + k, 73) < 0.34 ? LIT_WINDOW : "rgba(196,206,214,0.20)";
        ctx.fillRect(gx, gy, 9, 6);
      }
    }
    ctx.strokeStyle = ROOF_LINE;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, b.w - 1.5, b.h - 1.5);
  }
  return smoking;
}

/** Smoke off a shelled block. Drawn over the buildings because it rises, and
 * with the drift frozen under reduced motion. */
export function drawSmoke(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number, calm: boolean) {
  for (let k = 0; k < 3; k++) {
    const ph = calm ? 0.35 + k * 0.22 : ((t * 0.19 + h2(seed, k, 71)) % 1);
    const rr = 7 + ph * 17;
    ctx.fillStyle = `rgba(58,50,40,${0.17 * (1 - ph)})`;
    ctx.beginPath();
    ctx.arc(x + (h2(seed, k, 73) - 0.5) * 16 * ph, y - ph * 26, rr, 0, Math.PI * 2);
    ctx.fill();
  }
}
