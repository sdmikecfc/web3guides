/**
 * LOOK AT VANGUARD WITHOUT PLAYING IT.
 *
 * Mike's verdict on the shipped arena was "ugly", and there was no way to check
 * that before he played it: a canvas game cannot be judged by tsc, the harness
 * only asks whether the numbers are legal, and a headless browser will not
 * composite frames. So this renders the real sim through the real scene module
 * (src/app/s5/games/vanguard/scene.ts) into PNGs on disk, and someone can look.
 *
 *   npx tsx scripts/vanguard-shot.mts [outDir] [seed]
 *
 * Two images:
 *   vanguard-play.png      what the player sees, ~20s into a run
 *   vanguard-overview.png  the whole town from above, with the route drawn and
 *                          every barricade ringed - which is how you check the
 *                          complaint "double layered or in the middle of an
 *                          intersection" without driving to each one.
 *
 * Nothing here is shipped to the browser and nothing here may be imported by
 * the game: it reads the same modules the game does, on purpose, so it cannot
 * drift into showing a town nobody plays.
 */
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createVanguard,
  stepVanguard,
  type SimInput,
  VIEW_W,
  VIEW_H,
  SEG_R,
  CP_R,
  TANK_R,
  TRUCK_R,
  type VgState,
} from "../src/app/s5/games/vanguard/sim";
import {
  drawBuildings,
  drawGround,
  drawMarkings,
  drawScenery,
  drawSmoke,
  drawTank,
  drawTruck,
  h2,
  LIT_WINDOW,
  ROAD,
  ROOF_LINE,
  RUBBLE,
  RUBBLE_DK,
} from "../src/app/s5/games/vanguard/scene";

const outDir = process.argv[2] ?? ".";

/** The two baked sprites the CLIENT layers over the vector town (2026-08-02
 * pass). Loaded best-effort so the script still renders the pure-vector town
 * if they are missing — the same try-image-else-vector law the game obeys.
 * Numbers (scales, shadow, gun overlay) mirror Client.tsx exactly. */
const PUB = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "public", "s5-art", "games", "vanguard", "units");
let TANK_STRIP: Image | null = null;
let TRUCK_SPR: Image | null = null;
const PROPS = new Map<string, Image>();
const BLDS = new Map<string, Image>();
const BLD_KEYS = ["ca", "cb", "cc", "cd", "ce", "cf", "cg", "ch", "ci", "cj", "ck", "cl", "cm", "cn", "ia", "ib", "ic", "id", "ie", "if", "ig", "ih", "ii", "ij", "ik", "il", "im", "in", "sa", "sb", "sc", "sd", "se", "sf", "sg", "sh", "si", "sj", "sk", "sl", "sm", "sn"];
try {
  TANK_STRIP = await loadImage(path.join(PUB, "tank-mine.webp"));
  TRUCK_SPR = await loadImage(path.join(PUB, "truck-theirs.webp"));
  for (const k of ["chimney-s", "chimney-m", "tank", "tree-l", "tree-s"]) {
    PROPS.set(k, await loadImage(path.join(PUB, `${k}.webp`)));
  }
  for (const k of BLD_KEYS) {
    BLDS.set(k, await loadImage(path.join(PUB, "..", "bld", `${k}.webp`)));
  }
} catch (e) {
  console.log("[shot] asset load stopped:", (e as Error).message);
}
console.log(`[shot] assets: tank ${TANK_STRIP ? "ok" : "MISSING"}, truck ${TRUCK_SPR ? "ok" : "MISSING"}, props ${PROPS.size}/5`);

/** The same building stamp the client uses, so this script renders the town
 * the game renders (scene.ts computes the rect; this just blits). */
const shotBld = (ctx: any, key: string, dx: number, dy: number, dw: number, dh: number) => {
  const im = BLDS.get(key);
  if (!im) return false;
  ctx.drawImage(im, dx, dy, dw, dh);
  return true;
};

/** The same prop stamp the client passes into drawBuildings, so this script
 * renders the identical town (foot on the anchor, tilt bakes rise above it). */
const shotProp = (ctx: any, kind: string, x: number, y: number, size: number) => {
  const im = PROPS.get(kind);
  if (!im) return;
  const h = size * (im.height / im.width);
  ctx.save();
  ctx.fillStyle = "rgba(18,15,10,0.34)";
  ctx.beginPath();
  ctx.ellipse(x + size * 0.08, y, size * 0.46, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(im, x - size / 2, y - h, size, h);
  ctx.restore();
};

function shotDrawTank(ctx: any, s: VgState, x: number, y: number) {
  if (!TANK_STRIP) {
    drawTank(ctx, x, y, s.pa, false);
    return;
  }
  ctx.save();
  ctx.fillStyle = "rgba(20,16,10,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + 1.5, y + 2.5, TANK_R * 1.25, TANK_R * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  const frames = 4;
  const cell = TANK_STRIP.height;
  const frame = Math.floor((Math.abs(s.px) + Math.abs(s.py)) / 6) % frames;
  const size = TANK_R * 3.4;
  ctx.translate(x, y);
  ctx.rotate(s.pa);
  ctx.drawImage(TANK_STRIP, frame * cell, 0, cell, cell, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function shotDrawTruck(ctx: any, x: number, y: number, a: number) {
  if (!TRUCK_SPR) {
    drawTruck(ctx, x, y, a);
    return;
  }
  ctx.save();
  ctx.fillStyle = "rgba(20,16,10,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + 1.5, y + 2, TRUCK_R * 1.15, TRUCK_R * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  const size = TRUCK_R * 2.4;
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.drawImage(TRUCK_SPR, -size / 2, -size / 2, size, size);
  ctx.strokeStyle = "#ff5cf0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-TRUCK_R * 0.2, 0);
  ctx.lineTo(TRUCK_R * 0.9, 0);
  ctx.stroke();
  ctx.restore();
}
const seed = Number(process.argv[3] ?? 20260802);

/** Run the sim forward with no input, which is enough to place the trucks and
 * let the town settle. The player is driven a little so the camera is not
 * sitting on the spawn. */
function run(secs: number): VgState {
  const s = createVanguard(VIEW_W, VIEW_H, seed, false) as VgState;
  const dt = 1 / 60;
  for (let i = 0; i * dt < secs; i++) {
    // DRIVE THE ROUTE, do not wander. The old lazy stick-sweep left the tank
    // pressed against the world edge with the nearest barricade 1000+ units
    // away, which is a true picture of a boring second and a bad one to shoot.
    // Steering at the live checkpoint puts it where the game's own action is.
    const cp = s.route[s.cpIdx];
    // THE FIELD NAMES ARE px/py, NOT x/y. The original passed {x, y} behind an
    // `as never` cast, so the steer target was silently undefined and every
    // shot this script ever took was of a tank driving blind (found 2026-08-02
    // when route-steering changed nothing). Typed properly now, no cast.
    const inp: SimInput = {
      px: cp ? cp.x : s.px + 200,
      py: cp ? cp.y : s.py,
      down: true,
      left: false,
      right: false,
      up: false,
      downKey: false,
      space: false,
    };
    stepVanguard(s, dt, inp);
  }
  return s;
}

async function shotPlay(s: VgState) {
  const cv = createCanvas(VIEW_W, VIEW_H);
  const ctx = cv.getContext("2d") as any;
  const ox = -s.camX;
  const oy = -s.camY;
  drawGround(ctx, -ox, -oy);
  drawMarkings(ctx, s.nodeX, s.nodeY, ox, oy);
  drawScenery(ctx, -ox, -oy);
  const smoking = drawBuildings(ctx, s.buildings, ox, oy, VIEW_W, VIEW_H, shotProp, shotBld);
  for (const sm of smoking) drawSmoke(ctx, sm.x, sm.y, s.t, sm.seed, false);
  const cp = s.route[s.cpIdx];
  if (cp) {
    ctx.strokeStyle = "rgba(240,179,64,0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cp.x + ox, cp.y + oy, CP_R, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const bar of s.barricades) {
    for (const sg of bar.segs) {
      if (sg.dead) continue;
      ctx.fillStyle = "#8d8778";
      ctx.beginPath();
      ctx.arc(sg.x + ox, sg.y + oy, SEG_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const tk of s.trucks) if (tk.alive && tk.spawnT <= s.t) shotDrawTruck(ctx, tk.x + ox, tk.y + oy, tk.a);
  shotDrawTank(ctx, s, s.px + ox, s.py + oy);
  await writeFile(path.join(outDir, "vanguard-play.png"), cv.toBuffer("image/png"));
}

/** THE ARCADE TILE, rendered from the game itself.
 *
 * The other three tiles are bright illustrations and Vanguard's was a
 * hand-composed placeholder that matched neither them nor the game. This one
 * is the actual town, framed tight so the shapes read at thumbnail size, with
 * the things that make the game legible turned up: the rally ring, a truck's
 * aim line, the tank. It cannot lie about what the game looks like, because it
 * IS what the game looks like. */
async function shotCard(s: VgState, dest: string) {
  // 960x540, the same as the other three arcade tiles. A card at a different
  // resolution to its neighbours reads as the odd one out even before anyone
  // looks at what is in it.
  const W = 960;
  const H = 540;
  const cv = createCanvas(W, H);
  const ctx = cv.getContext("2d") as any;
  // FRAME ON THE FIGHT, not on the tank. Centring the hull put it in the
  // middle of an empty street, which is an honest picture of a boring second.
  // The midpoint of the tank and its nearest barricade always has a wall, a
  // block and usually a truck in shot.
  const near = s.barricades
    .map((b) => ({
      x: b.segs.reduce((q, g) => q + g.x, 0) / b.segs.length,
      y: b.segs.reduce((q, g) => q + g.y, 0) / b.segs.length,
    }))
    .sort((p, q) => Math.hypot(p.x - s.px, p.y - s.py) - Math.hypot(q.x - s.px, q.y - s.py))[0];
  // CENTRE ON THE TANK, then lean toward the nearest barricade by a CLAMPED
  // amount. The old midpoint framing assumed the two were close; measured, the
  // tank can be 1000+ units from the nearest wall (it was at the world's top
  // edge with the barricade at 1937,1006), and the midpoint then framed an
  // empty street with the hero completely off the tile. Clamping the lean to
  // 30% of a half-tile means the tank is always inside the middle third.
  const K0 = 1.9;
  const leanX = Math.max(-(960 / (2 * K0)) * 0.3, Math.min((960 / (2 * K0)) * 0.3, near ? near.x - s.px : 0));
  const leanY = Math.max(-(540 / (2 * K0)) * 0.3, Math.min((540 / (2 * K0)) * 0.3, near ? near.y - s.py : 0));
  const fx = s.px + leanX;
  const fy = s.py + leanY;
  const k = K0;
  ctx.save();
  ctx.scale(k, k);
  const ox = -(fx - W / (2 * k));
  const oy = -(fy - H / (2 * k));
  drawGround(ctx, -ox, -oy, W / k, H / k);
  drawMarkings(ctx, s.nodeX, s.nodeY, ox, oy, W / k, H / k);
  drawScenery(ctx, -ox, -oy, W / k, H / k);
  const smoking = drawBuildings(ctx, s.buildings, ox, oy, W / k, H / k, shotProp, shotBld);
  for (const sm of smoking) drawSmoke(ctx, sm.x, sm.y, s.t, sm.seed, false);
  for (const bar of s.barricades) {
    for (const sg of bar.segs) {
      if (sg.dead) continue;
      ctx.fillStyle = "#b3ab97";
      ctx.beginPath();
      ctx.arc(sg.x + ox, sg.y + oy, SEG_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(30,25,18,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  const cp = s.route[s.cpIdx];
  if (cp) {
    ctx.strokeStyle = "rgba(240,179,64,0.85)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cp.x + ox, cp.y + oy, CP_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(240,179,64,0.13)";
    ctx.fill();
  }
  for (const tk of s.trucks) {
    if (!tk.alive || tk.spawnT > s.t) continue;
    // the aim line, always drawn on the card: it is the game's one rule
    ctx.strokeStyle = "rgba(255,92,240,0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(tk.x + ox, tk.y + oy);
    ctx.lineTo(s.px + ox, s.py + oy);
    ctx.stroke();
    ctx.setLineDash([]);
    shotDrawTruck(ctx, tk.x + ox, tk.y + oy, tk.a);
  }
  shotDrawTank(ctx, s, s.px + ox, s.py + oy);
  ctx.restore();
  // A warm vignette so the tile has a focal point at thumbnail size.
  if (!process.env.NO_VIGNETTE) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.86);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(16,12,8,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  await writeFile(dest, cv.toBuffer("image/png"));
}

async function shotOverview(s: VgState) {
  // The whole town, scaled to fit. Barricades get a ring and a number so a
  // doubled pair or one sitting on a junction is obvious at a glance.
  const W = 1100;
  const k = W / s.W;
  const H = Math.round(s.H * k);
  const cv = createCanvas(W, H);
  const ctx = cv.getContext("2d") as any;
  ctx.fillStyle = ROAD;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.scale(k, k);
  drawBuildings(ctx, s.buildings, 0, 0, s.W, s.H, shotProp, shotBld);
  // the route, in order
  ctx.strokeStyle = "rgba(240,179,64,0.8)";
  ctx.lineWidth = 3 / k;
  ctx.beginPath();
  ctx.moveTo(s.px, s.py);
  for (const r of s.route) ctx.lineTo(r.x, r.y);
  ctx.stroke();
  s.route.forEach((r, i) => {
    ctx.fillStyle = "rgba(240,179,64,0.22)";
    ctx.beginPath();
    ctx.arc(r.x, r.y, CP_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0b340";
    ctx.font = `${28 / k}px sans-serif`;
    ctx.fillText(String(i + 1), r.x - 8 / k, r.y + 10 / k);
  });
  s.barricades.forEach((bar, i) => {
    let cx = 0;
    let cy = 0;
    for (const sg of bar.segs) {
      ctx.fillStyle = bar.gapped ? "#c9b26a" : "#8d8778";
      ctx.beginPath();
      ctx.arc(sg.x, sg.y, SEG_R, 0, Math.PI * 2);
      ctx.fill();
      cx += sg.x;
      cy += sg.y;
    }
    cx /= bar.segs.length;
    cy /= bar.segs.length;
    ctx.strokeStyle = "#ff5cf0";
    ctx.lineWidth = 2 / k;
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ff5cf0";
    ctx.font = `${24 / k}px sans-serif`;
    ctx.fillText(`${i + 1}${bar.gapped ? "g" : ""}`, cx + 38, cy + 6);
  });
  drawTank(ctx, s.px, s.py, s.pa, false);
  ctx.restore();
  await writeFile(path.join(outDir, "vanguard-overview.png"), cv.toBuffer("image/png"));
}

await mkdir(outDir, { recursive: true });
const s = run(34);
await shotPlay(s);
await shotOverview(s);
await shotCard(s, path.join(outDir, "vanguard-card.png"));

// The numbers behind the pictures, so a regression is greppable and not just
// something that "looks off".
const spacing: number[] = [];
const mids = s.barricades.map((b) => ({
  x: b.segs.reduce((a, g) => a + g.x, 0) / b.segs.length,
  y: b.segs.reduce((a, g) => a + g.y, 0) / b.segs.length,
}));
for (let i = 0; i < mids.length; i++) {
  for (let j = i + 1; j < mids.length; j++) {
    spacing.push(Math.round(Math.hypot(mids[i].x - mids[j].x, mids[i].y - mids[j].y)));
  }
}
// THE VISUAL CHECK, AS NUMBERS. "In the middle of an intersection" and "double
// layered" were both spotted by eye, which means the next one will be too
// unless the eye is replaced by an assertion. These three counts are what the
// picture was being used to check.
let segsInBuildings = 0;
for (const bar of s.barricades) {
  for (const g of bar.segs) {
    if (s.buildings.some((b) => g.x > b.x && g.x < b.x + b.w && g.y > b.y && g.y < b.y + b.h)) {
      segsInBuildings++;
    }
  }
}
let onJunction = 0;
for (const m of mids) {
  const nearX = Math.min(...s.nodeX.map((n) => Math.abs(n - m.x)));
  const nearY = Math.min(...s.nodeY.map((n) => Math.abs(n - m.y)));
  // A junction is where a node column meets a node row. A barricade laid at a
  // midpoint is close to ONE of them and far from the other; close to both
  // means it is sitting on the crossroads.
  if (nearX < 34 && nearY < 34) onJunction++;
}
const routeSpread = {
  x: Math.round((Math.max(...s.route.map((r) => r.x)) - Math.min(...s.route.map((r) => r.x))) / s.W * 100),
  y: Math.round((Math.max(...s.route.map((r) => r.y)) - Math.min(...s.route.map((r) => r.y))) / s.H * 100),
};

console.log(
  JSON.stringify(
    {
      seed,
      segsInBuildings,
      barricadesOnJunction: onJunction,
      routeSpreadPctOfTown: routeSpread,
      town: [Math.round(s.W), Math.round(s.H)],
      barricades: s.barricades.length,
      gapped: s.barricades.filter((b) => b.gapped).length,
      closestTwoBarricades: Math.min(...spacing),
      trucksOut: s.trucks.filter((t) => t.alive && t.spawnT <= s.t).length,
      wrote: ["vanguard-play.png", "vanguard-overview.png", "vanguard-card.png"],
    },
    null,
    1,
  ),
);
