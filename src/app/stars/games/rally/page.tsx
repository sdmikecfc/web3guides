/**
 * STARFALL · Rover Rally — a Micro Machines-style top-down racer, themed per world.
 * CORNER-based tracks (real straights + hairpins + chicanes, F1 not NASCAR). Jumps
 * live on the STRAIGHTS and launch you OVER a hazard (lava river / pit / crevasse /
 * void), with a fixed arc that always lands back on the road (jump height is decoupled
 * from world gravity, so Luna no longer flies to orbit). Painted terrain under the
 * track; per-world mechanics (Magma tunnels, Cryo snowballs).
 *
 * Auto-throttle; hold + slide (or arrow keys) to steer the drift. 3 laps, 3 AI rivals,
 * a pace ghost. Checkpoint-gated laps; sliding road walls. Canvas/rAF behind the wallet
 * gate can't be verified headless (track geometry + jump arcs ARE sim-verified). Tuning
 * is up top.
 */
"use client";

import { useEffect, useRef } from "react";
import { GameShell, type GameHandle } from "../engine";
import { MAGMA_PATH, LUNA_PATH, CRYO_PATH, ASTEROID_PATH } from "./tracks";

// ---- tuning ---------------------------------------------------------------
const LAPS = 3;
const N = 240; // centerline samples
const NCP = 12;
const ZOOM = 1.15;
const CAM_LERP = 5.0;
const LEAD = 95;
const BASE_MAX = 360;
const BOOST_MULT = 1.8;
const BOOST_TIME = 1.2;
const ACCEL = 560;
const TURN = 3.0;
const GRIP_ROAD = 7.4;
const GRIP_OFF = 5.2;
const GRIP_ICE = 2.3;
const GRIP_SHIP = 5.6;
// Jumps use a CONSTANT z-gravity (not the world's), so the arc is the same on every
// world: ~0.72s airtime, ~122px apex lift, ~250-300px of forward travel — enough to clear
// the hazard and land on the straight. The ramp LAUNCHES at a clamped horizontal speed
// (LAUNCH_LO..HI) so a slow entry still clears the gap and a boosted entry doesn't overshoot
// the straight. (Whole sweep verified headless: clears at every entry speed, lands <=9 samples.)
const RAMP_V = 678;
const BUMP_V = 360;
const JUMP_G = 1885;
const LAUNCH_LO = BASE_MAX * 0.96;
const LAUNCH_HI = BASE_MAX * 1.15;
const RAMP_GATE = 0.35; // ramp fires if eng > BASE_MAX*RAMP_GATE (lowered 0.55->0.35: threshold 126 < off-road cap 180, so a slightly-wide approach still launches — hittable at normal speed)
const LIFT_K = 0.5;
const AIR_K = 0.005;
const AIR_MAX = 2.2;
const CAR_R = 22;
const PORTAL_R = 30; // DRAW radius — half size so players must remember where they are
const PORTAL_HIT = 48; // trigger radius (a bit forgiving so it's catchable while aiming for it)
const PORTAL_CD = 1.6;
const AI_COUNT = 3;
const AI_LOOK = 11;
const COUNTDOWN = 2.7;
const TARGET_TOTAL = 110;
const GHOST_LAP = 36;
const RACE_CAP = 185;
const FINISH_HOLD = 2.1;
const CP_R = 175;
const GATE = 2;

const GOLD = "#f0b340";
const AI_COLORS = ["#5eead4", "#7c6aff", "#ff8a8a"];
const GHOST_COL = "#cdd4e4";

// ---- art ------------------------------------------------------------------
function img(src: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const i = new Image();
  i.src = src;
  return i;
}
const ART = {
  rover: img("/stars-art/rover.png"),
  ship: img("/stars-art/ship.png"),
  ramp: img("/stars-art/rally-ramp.png"), // premium top-down kicker sprite
  pit: img("/stars-art/rally-pit.png"),   // premium crater/chasm sprite
  lava: img("/stars-art/rally-lava.png"), // premium molten-lava sprite
  boost: img("/stars-art/boostpad.png"),
  rock: img("/stars-art/boulder.png"),
  crystal: img("/stars-art/crystal.png"),
};
const BG: Record<string, HTMLImageElement | null> = {
  magma: img("/stars-art/bg-rally-magma.png"),
  luna: img("/stars-art/bg-rally-luna.png"),
  cryo: img("/stars-art/bg-rally-cryo.png"),
  asteroid: img("/stars-art/bg-rally-asteroid.png"),
};
function ready(i: HTMLImageElement | null): i is HTMLImageElement {
  return !!i && i.complete && i.naturalWidth > 0;
}

// ---- worlds ---------------------------------------------------------------
type Vehicle = "rover" | "ship";
type Surface = "stars" | "dirt" | "rock" | "ice";
type HazardKind = "lava" | "pit" | "crevasse" | "void";
type PatchKind = "gas" | "oil" | "slush";
type ObstacleKind = "rock" | "crystal";
type FeatKind = ObstacleKind | "boost" | "bump" | "ramp" | PatchKind;
interface Corner { x: number; y: number; w: number; t?: number } // t = optional tightness 0..1 (sharper approach = hairpin); omit for the default gentle fillet
interface World {
  name: string; vehicle: Vehicle; surface: Surface; slick: boolean; bg: string; hazard: HazardKind;
  ground: string; ground2: string; dot: string; road: string; road2: string; rail: string; accent: string; seam: string;
  corners?: Corner[]; path?: { x: number; y: number }[]; baseW: number;
  // feature KIT — positions are auto-placed onto the track geometry in init (boosts on
  // straights, obstacles on corner apexes), so nothing lands on a corner and flings you off.
  obstacle: ObstacleKind; patch: PatchKind; boosts: number; obstacles: number; patches: number;
  tunnels?: [number, number][]; snow?: boolean; portals?: boolean;
  // world-placed rolling hazard (the signature dynamic hazard): fixed lanes, rolls across the
  // road, fair to every car. "snowball" = Cryo, "lavabomb" = Magma (glowing molten bombs).
  roller?: "snowball" | "lavabomb";
}
const CENTERED = new Set<FeatKind>(["ramp", "bump"]);
const PATCH = new Set<FeatKind>(["gas", "oil", "slush"]);
const WORLDS: World[] = [
  {
    // "Inferno GP" — a TALL portrait winding loop (matches the Magma Rim mockup): a long LEFT
    // jump straight, twin top lobes with a concave center DIP, a right WAIST pinch + bulge, a
    // lower-right lobe, and a wide bottom return. Hand-authored, clean closed non-self-crossing
    // ring (sim-verified: 0 self-cross, ~200px min strand clearance at baseW 95). Thin road so
    // it can wind tightly. `t` marks the three tight bends (dip / waist / lower hairpin).
    name: "Magma Rim", vehicle: "rover", surface: "rock", slick: false, bg: "magma", hazard: "lava",
    ground: "#241210", ground2: "#311713", dot: "#160a08", road: "#2a2320", road2: "#161010", rail: "#ff8c4a", accent: "#ff8c4a", seam: "#ff7a2a",
    baseW: 124, obstacle: "rock", patch: "oil", boosts: 3, obstacles: 4, patches: 2,
    // Centerline derived directly from the approved Magma Rim mockup's OWN vector path (no
    // hand-typed corners, no corner-rounding -> the rendered road matches the mockup). A tall
    // winding loop: long left jump straight, twin top lobes + center chicane, flowing right
    // S-curves, bottom boost run. Sim-verified: 0 self-cross, ~164u min strand clearance.
    // Tool: scratchpad/rally_convert.mjs + memory project_rally_rebuild.
    path: MAGMA_PATH,
    // drive-under tunnel on the right-side descent (terrain roof closes over the road)
    tunnels: [[0.62, 0.70]],
    roller: "lavabomb",
  },
  {
    // "Crater 8" — a figure-8 hourglass: two crater lobes joined by a pinched waist (non-crossing).
    name: "Luna 7", vehicle: "rover", surface: "dirt", slick: false, bg: "luna", hazard: "pit",
    ground: "#4f4a42", ground2: "#5d574d", dot: "#36322c", road: "#9a8262", road2: "#7e6a50", rail: "#d8c198", accent: "#f0d8a4", seam: "#5f5038",
    baseW: 124, obstacle: "rock", patch: "oil", boosts: 3, obstacles: 4, patches: 2,
    path: LUNA_PATH, tunnels: [[0.70, 0.77]],
  },
  {
    // "Glacier Esses" — flowing technical esses down the right, a hairpin bay bottom-left,
    // and a glacier tunnel through the back section.
    name: "Cryo Drift", vehicle: "rover", surface: "ice", slick: true, bg: "cryo", hazard: "crevasse",
    ground: "#141f2c", ground2: "#1b2a3c", dot: "#0e1722", road: "#9fc4dc", road2: "#bcdcef", rail: "#8fd3ff", accent: "#8fd3ff", seam: "#ffffff",
    baseW: 124, obstacle: "crystal", patch: "slush", boosts: 3, obstacles: 4, patches: 2,
    path: CRYO_PATH,
    tunnels: [[0.42, 0.49]], snow: true, roller: "snowball",
  },
  {
    // "The Belt" — a tall winding circuit with a central debris scroll; warp portals across the field.
    name: "Asteroid Run", vehicle: "ship", surface: "stars", slick: false, bg: "asteroid", hazard: "void",
    ground: "#070b16", ground2: "#0c1224", dot: "#1a2238", road: "#10162b", road2: "#1b2440", rail: "#5eead4", accent: "#5eead4", seam: "#5eead4",
    baseW: 124, obstacle: "rock", patch: "gas", boosts: 3, obstacles: 3, patches: 2,
    path: ASTEROID_PATH, tunnels: [[0.30, 0.37]],
    portals: true,
  },
];

function featR(k: FeatKind): number {
  if (k === "gas" || k === "oil" || k === "slush") return 46;
  if (k === "ramp") return 56;
  if (k === "bump") return 46;
  if (k === "boost") return 52;
  return 19; // rock / crystal — shrunk ~40% (was 32) so obstacles are smaller, easier to thread
}
// build a feature at centerline index i with a lateral offset (fraction of half-width)
function mkFeat(kind: FeatKind, i: number, offFrac: number, cl: V[], nrm: V[], tan: V[], width: number[]): Feat {
  const centered = CENTERED.has(kind);
  const offPx = centered ? 0 : offFrac * width[i] * 0.5;
  const x = cl[i].x + (centered ? 0 : nrm[i].x * offPx), y = cl[i].y + (centered ? 0 : nrm[i].y * offPx);
  return { x, y, ang: tangAngle(tan[i]) + Math.PI / 2, kind, r: featR(kind), i, off: centered ? 0 : offPx };
}

// ---- math -----------------------------------------------------------------
interface V { x: number; y: number }
function cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function wrap(a: number): number { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function idxGap(a: number, b: number): number { let d = a - b; while (d > N / 2) d -= N; while (d < -N / 2) d += N; return d; }
function inSpan(i: number, i0: number, i1: number): boolean { const d = ((i - i0) % N + N) % N, span = ((i1 - i0) % N + N) % N; return d <= span; }
function hash2(a: number, b: number): number { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return (h ^ (h >> 16)) >>> 0; }

// corner points -> dense waypoints (collinear along each edge = straights, single
// point at each corner = a rounded turn) -> Catmull-Rom centerline.
function expandCorners(corners: Corner[]): Corner[] {
  const wp: Corner[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    // optional per-corner tightness: t=0 keeps the legacy 0.34/0.67 gentle fillet (all
    // existing worlds), t->1 pulls the interior waypoints in toward the corner so the
    // Catmull-Rom turn is much sharper (a hairpin). Backward-compatible: t undefined => 0.
    const t = a.t ?? 0;
    const f0 = 0.34 * (1 - t) + 0.04 * t, f1 = 0.67 * (1 - t) + 0.10 * t;
    wp.push({ x: a.x, y: a.y, w: a.w });
    for (const f of [f0, f1]) wp.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f });
  }
  return wp;
}

// ---- state ----------------------------------------------------------------
interface Feat { x: number; y: number; ang: number; kind: FeatKind; r: number; i: number; off: number }
interface Hazard { kind: HazardKind; i0: number; i1: number; cx: number; cy: number }
interface Portal { ax: number; ay: number; ai: number; bx: number; by: number; bi: number } // enter A -> exit B
interface Ball { x: number; y: number; vx: number; vy: number; r: number; spin: number; life: number; kind: "snowball" | "lavabomb" }
interface Car {
  x: number; y: number; heading: number; vx: number; vy: number; eng: number;
  idx: number; lap: number; nextCp: number; z: number; zv: number; rampCd: number; portalCd: number;
  boostT: number; spinT: number; sinkT: number; obsCd: number; isPlayer: boolean; color: string; skill: number;
  finished: boolean; finishT: number;
}
interface Particle { x: number; y: number; vx: number; vy: number; life: number; c: string; r: number }
interface S {
  w: World; cl: V[]; width: number[]; tan: V[]; nrm: V[]; cps: number[]; feats: Feat[]; hazards: Hazard[]; portals: Portal[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
  cars: Car[]; player: Car; ghost: { idx: number; lap: number }; cam: V; parts: Particle[]; balls: Ball[];
  ballZones: number[]; ballZ: number;
  t: number; phase: "countdown" | "race" | "over"; raceT: number; ballCd: number;
  msg: string; msgT: number; result: number; place: number; over: boolean;
}

function buildTrack(wd: World) {
  // RESAMPLE the centerline to uniform arc-length spacing (so the sample-based jump/hazard
  // placement stays physically correct). Two sources for the pre-resample dense line:
  //  A) wd.path  — a dense pre-wound centerline taken straight from the approved mockup's own
  //     vector path (no corner-rounding, so the rendered road matches the mockup). Uniform width.
  //  B) wd.corners — the legacy corner ring -> expandCorners -> Catmull-Rom (Luna/Cryo/Asteroid).
  let dense: V[], dw: number[], D: number;
  if (wd.path) {
    dense = wd.path.map((p) => ({ x: p.x, y: p.y })); D = dense.length;
    dw = dense.map(() => wd.baseW);
  } else {
    const wp = expandCorners(wd.corners!), M = wp.length; D = N * 6;
    dense = []; dw = [];
    for (let i = 0; i < D; i++) {
      const u = (i / D) * M, k = Math.floor(u), f = u - k;
      dense.push({ x: cr(wp[(k - 1 + M) % M].x, wp[k % M].x, wp[(k + 1) % M].x, wp[(k + 2) % M].x, f), y: cr(wp[(k - 1 + M) % M].y, wp[k % M].y, wp[(k + 1) % M].y, wp[(k + 2) % M].y, f) });
      dw.push(wd.baseW * cr(wp[(k - 1 + M) % M].w, wp[k % M].w, wp[(k + 1) % M].w, wp[(k + 2) % M].w, f));
    }
  }
  const cum = [0]; for (let i = 1; i <= D; i++) cum.push(cum[i - 1] + Math.hypot(dense[i % D].x - dense[i - 1].x, dense[i % D].y - dense[i - 1].y));
  const L = cum[D];
  const cl: V[] = [], width: number[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, di = 0;
  for (let i = 0; i < N; i++) {
    const target = i * L / N; while (di < D - 1 && cum[di + 1] < target) di++;
    const f = (target - cum[di]) / ((cum[di + 1] - cum[di]) || 1);
    const x = dense[di].x + (dense[(di + 1) % D].x - dense[di].x) * f, y = dense[di].y + (dense[(di + 1) % D].y - dense[di].y) * f;
    cl.push({ x, y }); width.push(dw[di] + (dw[(di + 1) % D] - dw[di]) * f);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const tan: V[] = [], nrm: V[] = [];
  for (let i = 0; i < N; i++) {
    const a = cl[i], b = cl[(i + 1) % N];
    let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    tan.push({ x: dx, y: dy }); nrm.push({ x: -dy, y: dx });
  }
  const head: number[] = []; for (let i = 0; i < N; i++) head.push(Math.atan2(tan[i].y, tan[i].x));
  const curv: number[] = []; for (let i = 0; i < N; i++) curv.push(Math.abs(wrap(head[(i + 3) % N] - head[i])));
  const turn: number[] = []; for (let i = 0; i < N; i++) turn.push(wrap(head[(i + 3) % N] - head[(i - 3 + N) % N])); // signed: which way it curves
  const cps: number[] = []; for (let j = 0; j < NCP; j++) cps.push(Math.round((j / NCP) * N) % N);
  return { cl, width, tan, nrm, curv, turn, cps, bbox: { x0, y0, x1, y1 } };
}

// runs of low curvature = straights (or gentle sweeps); returned longest-first as {start,len}.
// thr is the curvature ceiling: 0.05 = dead straight, ~0.09 = a gentle flowing sweep (used so the
// smooth peanut/oval tracks still expose a jump section).
function findStraights(curv: number[], minLen: number, thr = 0.05): { start: number; len: number }[] {
  const runs: { start: number; len: number }[] = []; let run = 0, start = 0;
  for (let i = 0; i < N * 2; i++) { const c = curv[i % N]; if (c < thr) { if (run === 0) start = i; run++; } else { if (run >= minLen && start < N) runs.push({ start: start % N, len: run }); run = 0; } }
  return runs.sort((a, b) => b.len - a.len);
}
// local maxima of curvature (corner apexes), sharpest-first, spaced >= minGap apart
function cornerApexes(curv: number[], count: number, minGap: number): number[] {
  const cand: { i: number; c: number }[] = [];
  for (let i = 0; i < N; i++) { const c = curv[i]; if (c > 0.12 && c >= curv[(i + 1) % N] && c > curv[(i - 1 + N) % N]) cand.push({ i, c }); }
  cand.sort((a, b) => b.c - a.c);
  const out: number[] = [];
  for (const k of cand) { if (out.every((o) => Math.min((k.i - o + N) % N, (o - k.i + N) % N) >= minGap)) out.push(k.i); if (out.length >= count) break; }
  return out;
}

function tangAngle(t: V) { return Math.atan2(t.y, t.x); }

function makeCar(isPlayer: boolean, color: string, lane: number, cl: V[], nrm: V[], tan: V[], width: number[], skill: number): Car {
  const idx = 6;
  const off = (lane - AI_COUNT / 2) * 0.3 * width[idx];
  const b = cl[idx], p = nrm[idx];
  return {
    x: b.x + p.x * off, y: b.y + p.y * off, heading: tangAngle(tan[idx]),
    vx: 0, vy: 0, eng: 0, idx, lap: 0, nextCp: 1, z: 0, zv: 0, rampCd: 0, portalCd: 0, boostT: 0, spinT: 0, sinkT: 0, obsCd: 0,
    isPlayer, color, skill, finished: false, finishT: 0,
  };
}

function nearestIdx(car: Car, cl: V[]): number {
  let best = car.idx, bestD = Infinity;
  for (let o = -4; o <= 14; o++) {
    const i = ((car.idx + o) % N + N) % N;
    const dx = cl[i].x - car.x, dy = cl[i].y - car.y, d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  car.idx = best;
  return Math.sqrt(bestD);
}
const progress = (c: Car) => c.lap * N + c.idx;

// TEMP DEBUG OVERVIEW — remove after proof. When set (by the ?overview= debug mode), init
// forces this world instead of a random pick so the overview always renders the chosen track.
let FORCE_WORLD: number | null = null;

const handle: GameHandle<S> = {
  init: (w, h) => {
    const wd = FORCE_WORLD != null ? WORLDS[FORCE_WORLD] : WORLDS[Math.floor(Math.random() * WORLDS.length)];
    const { cl, width, tan, nrm, curv, turn, cps, bbox } = buildTrack(wd);
    const START = 6;
    const feats: Feat[] = [];
    const hazards: Hazard[] = [];

    // THE JUMP: ramp ~38% into the straight whose ramp-point sits FARTHEST from the start
    // grid (so you never launch off the line), launching OVER a road-wide hazard strip.
    // Landing ~7-8 samples on. Every entry speed clears it (sim-verified).
    const straightsList = findStraights(curv, 13, 0.085);
    const js = straightsList[0] || null; // the LONGEST straight = most room for a safe jump
    let jumpI = -1;
    if (js) {
      // within that straight, put the ramp at the point FARTHEST from the start grid (so even a
      // long straight that contains the start hosts the jump in its far half), leaving landing room.
      const lo = 4, hi = Math.max(lo, js.len - 9);
      let bestOff = Math.min(hi, Math.round(js.len * 0.4)), bestD = -1;
      for (let off = lo; off <= hi; off++) {
        const ri = (js.start + off) % N, d = Math.min((ri - START + N) % N, (START - ri + N) % N);
        if (d > bestD) { bestD = d; bestOff = off; }
      }
      jumpI = (js.start + bestOff) % N;
      feats.push(mkFeat("ramp", jumpI, 0, cl, nrm, tan, width));
      const hi0 = (jumpI + 2) % N, hi1 = (jumpI + 5) % N, hm = (jumpI + 3) % N;
      hazards.push({ kind: wd.hazard, i0: hi0, i1: hi1, cx: cl[hm].x, cy: cl[hm].y });
    }

    // boosts/patches go on OTHER flat-ish stretches (threshold 9 so a single-long-straight
    // track like the horseshoe still has the short side-walls to use) — never on the jump
    // straight (would drop a pad on the hazard) and never on a corner (fly-off-the-map).
    const flat = findStraights(curv, 9, 0.085).filter((st) => !js || st.start !== js.start);
    for (let b = 0; b < wd.boosts; b++) {
      const st = flat.length ? flat[b % flat.length] : null;
      if (!st) break;
      // if there are fewer straights than boosts, spread them ALONG the straight (no stacking)
      const frac = flat.length >= wd.boosts ? 0.5 : 0.32 + 0.36 * Math.floor(b / flat.length);
      const i = (st.start + Math.floor(st.len * frac)) % N;
      feats.push(mkFeat("boost", i, b % 2 ? 0.34 : -0.34, cl, nrm, tan, width));
    }
    // obstacles at the sharpest corner apexes, set toward the INSIDE (an apex to steer around)
    const apex = cornerApexes(curv, wd.obstacles + 3, 16).filter((i) => Math.min((i - jumpI + N) % N, (jumpI - i + N) % N) > 8).slice(0, wd.obstacles);
    for (const i of apex) feats.push(mkFeat(wd.obstacle, i, (turn[i] > 0 ? -1 : 1) * 0.45, cl, nrm, tan, width));
    // surface patches (oil/slush/gas) on straights, off to one side so they're avoidable
    for (let p = 0; p < wd.patches; p++) {
      const st = flat.length ? flat[(p + 1) % flat.length] : null;
      if (!st) break;
      const i = (st.start + Math.floor(st.len * (0.28 + 0.42 * (p % 2)))) % N;
      feats.push(mkFeat(wd.patch, i, p % 2 ? -0.42 : 0.42, cl, nrm, tan, width));
    }

    // world-placed roller lanes (Cryo snowballs / Magma lava bombs) — fixed track positions,
    // fair to every car (the AI gets hit on the same lanes you do).
    const ballZones: number[] = [];
    if (wd.roller) for (let z = 0; z < 6; z++) ballZones.push((Math.round((z / 6) * N) + 14) % N);

    // portals (Asteroid) — warp across the horseshoe gap; everyone takes it, so it's fair
    const portals: Portal[] = [];
    if (wd.portals) {
      const ai = Math.round(0.45 * N) % N, bi = Math.round(0.63 * N) % N;
      portals.push({ ai, bi, ax: cl[ai].x, ay: cl[ai].y, bx: cl[bi].x, by: cl[bi].y });
    }

    const cars: Car[] = [makeCar(true, GOLD, 0, cl, nrm, tan, width, 1)];
    for (let a = 0; a < AI_COUNT; a++) cars.push(makeCar(false, AI_COLORS[a % AI_COLORS.length], a + 1, cl, nrm, tan, width, 0.94 + ((a * 41) % 9) / 100));
    return {
      w: wd, cl, width, tan, nrm, cps, feats, hazards, portals, bbox, cars, player: cars[0],
      ghost: { idx: 6, lap: 0 }, cam: { x: cars[0].x, y: cars[0].y }, parts: [], balls: [], ballZones, ballZ: 0,
      t: 0, phase: "countdown", raceT: 0, ballCd: 3, msg: "", msgT: 0, result: 0, place: 1, over: false,
    };
  },

  step: (s, dt, input, w) => {
    s.t += dt;
    if (s.msgT > 0) s.msgT = Math.max(0, s.msgT - dt);
    if (s.phase === "countdown" && s.t >= COUNTDOWN) { s.phase = "race"; s.msg = "GO!"; s.msgT = 1; }
    const racing = s.phase === "race";
    if (racing) s.raceT += dt;

    if (racing) {
      s.ghost.idx += (N / GHOST_LAP) * dt;
      if (s.ghost.idx >= N) { s.ghost.idx -= N; s.ghost.lap++; }
    }

    // ROLLERS (Cryo snowballs / Magma lava bombs): roll across FIXED track lanes (world-placed,
    // not player-targeted), so they're fair to every car — the AI gets hit on the same lanes you do.
    if (racing && s.w.roller && s.ballZones.length) {
      s.ballCd -= dt;
      if (s.ballCd <= 0 && s.balls.length < 3) {
        s.ballCd = 1.6 + Math.random() * 1.4;
        const i = s.ballZones[s.ballZ % s.ballZones.length]; s.ballZ++;
        const c = s.cl[i], n = s.nrm[i], tg = s.tan[i], hw = s.width[i] * 0.5;
        const side = (s.ballZ % 2) ? 1 : -1;
        const sp = 120 + Math.random() * 50;
        s.balls.push({ x: c.x + n.x * (hw + 34) * side, y: c.y + n.y * (hw + 34) * side, vx: -n.x * sp * side + tg.x * 20, vy: -n.y * sp * side + tg.y * 20, r: 24 + Math.random() * 12, spin: 0, life: 7, kind: s.w.roller });
      }
    }
    for (const b of s.balls) { b.x += b.vx * dt; b.y += b.vy * dt; b.spin += dt * 5; b.life -= dt; }
    s.balls = s.balls.filter((b) => b.life > 0);

    for (const car of s.cars) {
      if (!racing) { nearestIdx(car, s.cl); continue; }
      if (car.finished) { car.x += car.vx * dt; car.y += car.vy * dt; car.vx *= 1 - 1.7 * dt; car.vy *= 1 - 1.7 * dt; car.eng *= 1 - 1.5 * dt; nearestIdx(car, s.cl); continue; }

      let steer = 0;
      if (car.isPlayer) {
        if (input.left && !input.right) steer = -1;
        else if (input.right && !input.left) steer = 1;
        else if (input.down && input.px != null) steer = Math.max(-1, Math.min(1, (input.px - w / 2) / (w * 0.26)));
      } else {
        const tgt = s.cl[(car.idx + AI_LOOK) % N];
        steer = Math.max(-1, Math.min(1, wrap(Math.atan2(tgt.y - car.y, tgt.x - car.x) - car.heading) * 2.3));
      }

      const distC = nearestIdx(car, s.cl);
      const halfW = s.width[car.idx] * 0.5;
      const onRoad = distC < halfW;
      let surface: "road" | "off" | "gas" | "oil" | "slush" = onRoad ? "road" : "off";
      for (const f of s.feats) { if (PATCH.has(f.kind) && Math.hypot(f.x - car.x, f.y - car.y) < f.r) surface = f.kind as "gas" | "oil" | "slush"; }

      let airborne = car.z > 0.5;
      if (car.rampCd > 0) car.rampCd -= dt;
      if (car.portalCd > 0) car.portalCd -= dt;
      if (car.boostT > 0) car.boostT -= dt;
      if (car.spinT > 0) car.spinT -= dt;
      if (car.sinkT > 0) car.sinkT -= dt;
      if (car.obsCd > 0) car.obsCd -= dt;

      if (!airborne) {
        for (const f of s.feats) {
          if (f.kind === "ramp" || f.kind === "bump") {
            const gate = f.kind === "ramp" ? RAMP_GATE : 0.3;
            if (Math.abs(idxGap(car.idx, f.i)) <= GATE && distC < halfW + 18 && car.rampCd <= 0 && car.eng > BASE_MAX * gate) {
              if (f.kind === "ramp") {
                car.zv = RAMP_V; car.z = 0.01; car.rampCd = 1.0;
                // LAUNCH at a clamped horizontal speed along heading: slow entries still clear
                // the hazard, a boosted entry won't overshoot the straight (sim-verified).
                const lv = Math.max(LAUNCH_LO, Math.min(LAUNCH_HI, Math.max(car.eng, Math.hypot(car.vx, car.vy))));
                car.eng = lv; car.vx = Math.cos(car.heading) * lv; car.vy = Math.sin(car.heading) * lv;
                if (car.isPlayer && s.msgT <= 0) { s.msg = "JUMP!"; s.msgT = 0.5; }
              } else { car.zv = BUMP_V; car.z = 0.01; car.rampCd = 1.0; }
            }
          } else if (f.kind === "boost") {
            if (Math.hypot(f.x - car.x, f.y - car.y) < f.r && car.boostT < BOOST_TIME * 0.5) {
              car.boostT = BOOST_TIME;
              if (car.isPlayer && s.parts.length < 150) for (let p = 0; p < 12; p++) s.parts.push({ x: car.x, y: car.y, vx: Math.cos(car.heading) * 220 + (Math.random() - 0.5) * 70, vy: Math.sin(car.heading) * 220 + (Math.random() - 0.5) * 70, life: 0.4, c: s.w.accent, r: 3 });
            }
          } else if (f.kind === "rock" || f.kind === "crystal") {
            // BRIEF speed-scrub on hit: lose ~30% once, short cooldown so you can't get
            // pinned re-applying the penalty every frame (no long spin/stop — just a tap).
            if (car.obsCd <= 0 && Math.hypot(f.x - car.x, f.y - car.y) < f.r + CAR_R) {
              car.eng *= 0.7; car.obsCd = 0.45;
              if (car.isPlayer && s.msgT <= 0) { s.msg = "Scrape!"; s.msgT = 0.4; }
            }
          }
        }
        if (surface === "oil" && car.spinT <= 0) car.spinT = 0.45;
        // hazard: grounded INSIDE a hazard span = you fell in (jump over it instead)
        for (const hz of s.hazards) {
          if (inSpan(car.idx, hz.i0, hz.i1) && distC < halfW + 8 && car.sinkT <= 0) {
            car.eng *= 0.3; car.vx *= 0.4; car.vy *= 0.4; car.sinkT = 0.7;
            if (car.isPlayer && s.msgT <= 0) { s.msg = hz.kind === "lava" ? "Sizzle!" : "Fell in!"; s.msgT = 0.7; }
          }
        }
        for (const b of s.balls) {
          if (Math.hypot(b.x - car.x, b.y - car.y) < b.r + CAR_R * 0.85) {
            const n = s.nrm[car.idx], push = (b.x - car.x) * n.x + (b.y - car.y) * n.y > 0 ? -1 : 1;
            if (b.kind === "lavabomb") {
              // molten heat: a sharper speed scrub + a brief sink (like grazing lava), plus a
              // small shove so it reads as a hit. No spin.
              car.eng *= 0.6; if (car.sinkT <= 0) car.sinkT = 0.35;
              car.vx += n.x * push * 90; car.vy += n.y * push * 90; b.vx *= 0.3; b.vy *= 0.3;
              if (car.isPlayer && s.msgT <= 0) { s.msg = "Lava bomb!"; s.msgT = 0.55; }
            } else {
              car.eng *= 0.78; // knock SIDEWAYS, don't spin you around
              car.vx += n.x * push * 130; car.vy += n.y * push * 130; b.vx *= 0.3; b.vy *= 0.3;
              if (car.isPlayer && s.msgT <= 0) { s.msg = "Snowball!"; s.msgT = 0.55; }
            }
          }
        }
        // PORTAL: enter A -> warp to B (across the horseshoe), keep speed, catch up checkpoints
        for (const pt of s.portals) {
          if (car.portalCd <= 0 && Math.hypot(pt.ax - car.x, pt.ay - car.y) < PORTAL_HIT) {
            car.idx = pt.bi; car.x = pt.bx; car.y = pt.by; car.heading = tangAngle(s.tan[pt.bi]);
            const sp = Math.max(car.eng, Math.hypot(car.vx, car.vy));
            car.vx = Math.cos(car.heading) * sp; car.vy = Math.sin(car.heading) * sp; car.portalCd = PORTAL_CD;
            for (let g = 0; g < NCP; g++) { const ci = s.cps[car.nextCp]; if (inSpan(ci, pt.ai, pt.bi)) { if (car.nextCp === 0) car.lap++; car.nextCp = (car.nextCp + 1) % NCP; } else break; }
            if (car.isPlayer) {
              if (s.msgT <= 0) { s.msg = "WARP!"; s.msgT = 0.6; }
              if (s.parts.length < 150) for (let p = 0; p < 16; p++) s.parts.push({ x: car.x, y: car.y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, life: 0.5, c: s.w.accent, r: 3 });
            }
          }
        }
      }
      if (car.z > 0 || car.zv !== 0) airborne = true;

      let maxSpd = BASE_MAX;
      if (surface === "off") maxSpd *= 0.5;
      else if (surface === "gas") maxSpd *= 0.52;
      else if (surface === "slush") maxSpd *= 0.55;
      if (car.sinkT > 0) maxSpd *= 0.35;
      if (car.boostT > 0) maxSpd *= BOOST_MULT;
      if (!car.isPlayer) {
        maxSpd *= car.skill;
        const lead = progress(car) - progress(s.player);
        maxSpd *= lead < -8 ? 1.07 : lead > 10 ? 0.93 : 1;
      }

      if (!airborne) {
        car.heading += TURN * steer * dt * (0.55 + 0.45 * Math.min(1, car.eng / BASE_MAX));
        if (car.spinT > 0) car.heading += 3.5 * dt;
      }
      car.eng += ACCEL * dt;
      if (car.eng > maxSpd) car.eng -= (car.eng - maxSpd) * Math.min(1, 4 * dt);
      if (car.eng < 0) car.eng = 0;

      if (airborne) {
        car.zv -= JUMP_G * dt; car.z += car.zv * dt;
        car.x += car.vx * dt; car.y += car.vy * dt;
        if (car.z <= 0) {
          car.z = 0; car.zv = 0;
          if (s.parts.length < 170) for (let p = 0; p < 7; p++) s.parts.push({ x: car.x + (Math.random() - 0.5) * 20, y: car.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90, life: 0.45, c: s.w.dot, r: 3 });
        }
      } else {
        const grip = s.w.slick ? GRIP_ICE : s.w.vehicle === "ship" ? GRIP_SHIP : surface === "road" ? GRIP_ROAD : GRIP_OFF;
        const dvx = Math.cos(car.heading) * car.eng, dvy = Math.sin(car.heading) * car.eng, k = Math.min(1, grip * dt);
        car.vx += (dvx - car.vx) * k; car.vy += (dvy - car.vy) * k;
        car.x += car.vx * dt; car.y += car.vy * dt;
        const slip = Math.hypot(dvx - car.vx, dvy - car.vy);
        if ((surface !== "road" || slip > 150 || car.boostT > 0) && s.parts.length < 160) {
          s.parts.push({ x: car.x - Math.cos(car.heading) * 14, y: car.y - Math.sin(car.heading) * 14, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.5, c: car.boostT > 0 ? car.color : s.w.dot, r: 3 });
        }
      }

      // road WALLS (slide along the edge) — skipped while airborne so jumps clear the gap
      if (!airborne) {
        const c = s.cl[car.idx], n = s.nrm[car.idx], tg = s.tan[car.idx];
        const ddx = car.x - c.x, ddy = car.y - c.y;
        const sc = ddx * n.x + ddy * n.y, tc = ddx * tg.x + ddy * tg.y;
        const limit = halfW - CAR_R * 0.3;
        if (Math.abs(sc) > limit) {
          const cl2 = Math.sign(sc) * limit;
          car.x = c.x + n.x * cl2 + tg.x * tc; car.y = c.y + n.y * cl2 + tg.y * tc;
          const vN = car.vx * n.x + car.vy * n.y;
          if (Math.sign(vN) === Math.sign(sc)) { car.vx -= vN * n.x; car.vy -= vN * n.y; }
          car.eng *= 0.96;
        }
      }

      const cpIdx = s.cps[car.nextCp];
      if (Math.hypot(s.cl[cpIdx].x - car.x, s.cl[cpIdx].y - car.y) < CP_R) {
        if (car.nextCp === 0) { car.lap++; car.nextCp = 1; }
        else car.nextCp = (car.nextCp + 1) % NCP;
      }
      if (car.lap >= LAPS && !car.finished) {
        car.finished = true; car.finishT = s.raceT;
        if (car.isPlayer) {
          s.place = 1 + s.cars.filter((c) => c !== car && c.finished && c.finishT < car.finishT).length;
          const speed = Math.max(0, Math.round((TARGET_TOTAL - s.raceT) * 360));
          s.result = LAPS * 1600 + speed + ([4200, 2600, 1500, 800][s.place - 1] || 0);
          s.msg = `FINISH  P${s.place}`; s.msgT = FINISH_HOLD + 0.6;
        }
      }
    }

    for (const p of s.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    s.parts = s.parts.filter((p) => p.life > 0);

    const tx = s.player.x + Math.cos(s.player.heading) * LEAD, ty = s.player.y + Math.sin(s.player.heading) * LEAD;
    const k = Math.min(1, CAM_LERP * dt);
    s.cam.x += (tx - s.cam.x) * k; s.cam.y += (ty - s.cam.y) * k;

    if (!s.over) {
      if (s.player.finished && s.raceT - s.player.finishT > FINISH_HOLD) s.over = true;
      else if (s.raceT > RACE_CAP) { s.result = s.player.lap * 1600 + 400; s.place = 4; s.over = true; }
    }
  },

  draw: (ctx, s, w, h) => {
    const wd = s.w;
    const SX = (x: number) => (x - s.cam.x) * ZOOM + w / 2;
    const SY = (y: number) => (y - s.cam.y) * ZOOM + h / 2;

    const bgIm = BG[wd.bg];
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, wd.ground2); g.addColorStop(1, wd.ground); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const M = 600, bx0 = s.bbox.x0 - M, by0 = s.bbox.y0 - M, bw = s.bbox.x1 - s.bbox.x0 + 2 * M, bh = s.bbox.y1 - s.bbox.y0 + 2 * M;
    // Magma uses a PROCEDURAL world-space lava field (crisp at the close zoom); the other worlds
    // keep their painted bitmap. Drawn over the bbox+margin, BEHIND the road, so the road pops.
    if (wd.bg === "magma") drawMagmaBg(ctx, s, bx0, by0, bw, bh, SX, SY);
    else if (ready(bgIm)) ctx.drawImage(bgIm, SX(bx0), SY(by0), bw * ZOOM, bh * ZOOM);

    const left: V[] = [], right: V[] = [];
    for (let i = 0; i < N; i++) { const c = s.cl[i], n = s.nrm[i], hw = s.width[i] * 0.5; left.push({ x: c.x + n.x * hw, y: c.y + n.y * hw }); right.push({ x: c.x - n.x * hw, y: c.y - n.y * hw }); }
    const railW: V[] = [], railIn: V[] = [];
    for (let i = 0; i < N; i++) { const c = s.cl[i], n = s.nrm[i], hw = s.width[i] * 0.5 + 10; railW.push({ x: c.x + n.x * hw, y: c.y + n.y * hw }); railIn.push({ x: c.x - n.x * hw, y: c.y - n.y * hw }); }
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); poly(ctx, railW, SX, SY); poly(ctx, railIn, SX, SY); ctx.fill("evenodd");
    // road — slightly translucent so the terrain reads under it (less "paved strip")
    ctx.globalAlpha = 0.86; ctx.fillStyle = wd.road; ctx.beginPath(); poly(ctx, left, SX, SY); poly(ctx, right, SX, SY); ctx.fill("evenodd"); ctx.globalAlpha = 1;
    ctx.save(); ctx.beginPath(); poly(ctx, left, SX, SY); poly(ctx, right, SX, SY); ctx.clip("evenodd");
    drawRoadSurface(ctx, s, SX, SY);
    ctx.restore();
    drawCenter(ctx, s, SX, SY);
    drawEdges(ctx, s, SX, SY);
    for (const hz of s.hazards) drawHazard(ctx, s, hz, SX, SY);
    drawChecker(ctx, s, SX, SY);

    for (const f of s.feats) { if (PATCH.has(f.kind)) drawPatch(ctx, f, SX, SY); }
    for (const pt of s.portals) drawPortal(ctx, s, pt, SX, SY);
    for (const f of s.feats) {
      if (f.kind === "ramp") drawRamp(ctx, s, f, SX, SY);
      else if (f.kind === "bump") drawBump(ctx, f, SX, SY);
      else if (f.kind === "boost") sprite(ctx, ART.boost, f, 104, SX, SY, () => { ctx.strokeStyle = wd.accent; ctx.lineWidth = 3; for (let c = 0; c < 3; c++) { ctx.beginPath(); ctx.moveTo(-12 * ZOOM, (c * 9 - 14) * ZOOM); ctx.lineTo(0, (c * 9 - 21) * ZOOM); ctx.lineTo(12 * ZOOM, (c * 9 - 14) * ZOOM); ctx.stroke(); } });
      else if (f.kind === "rock") sprite(ctx, ART.rock, f, 78, SX, SY, () => { ctx.fillStyle = "#6b6b73"; ctx.beginPath(); ctx.arc(0, 0, f.r * ZOOM, 0, Math.PI * 2); ctx.fill(); });
      else if (f.kind === "crystal") sprite(ctx, ART.crystal, f, 74, SX, SY, () => { ctx.fillStyle = "#9b7bd8"; ctx.beginPath(); ctx.arc(0, 0, f.r * ZOOM, 0, Math.PI * 2); ctx.fill(); });
    }

    for (const b of s.balls) drawBall(ctx, b, SX, SY);
    for (const p of s.parts) { ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * 0.6; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(SX(p.x), SY(p.y), p.r * ZOOM + 0.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;

    const gi = Math.floor(s.ghost.idx) % N, gf = s.ghost.idx - Math.floor(s.ghost.idx);
    const gx = s.cl[gi].x + (s.cl[(gi + 1) % N].x - s.cl[gi].x) * gf, gy = s.cl[gi].y + (s.cl[(gi + 1) % N].y - s.cl[gi].y) * gf;
    drawVehicle(ctx, { x: gx, y: gy, heading: tangAngle(s.tan[gi]) }, wd.vehicle, GHOST_COL, SX, SY, 0.42, true);
    for (const car of [...s.cars].sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer))) {
      drawVehicle(ctx, car, wd.vehicle, car.color, SX, SY, 1, false, car.z, car.isPlayer);
    }

    // tunnel: the terrain roof drawn OVER the road + cars so you barely see yourself
    if (wd.tunnels && ready(bgIm)) drawTunnelRoof(ctx, s, bgIm, bx0, by0, bw, bh, SX, SY);

    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    drawHUD(ctx, s, w, h);
  },
  done: (s) => s.over,
  score: (s) => s.result,
};

// ---- draw helpers ---------------------------------------------------------
function poly(ctx: CanvasRenderingContext2D, pts: V[], SX: (x: number) => number, SY: (y: number) => number) {
  ctx.moveTo(SX(pts[0].x), SY(pts[0].y));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(SX(pts[i].x), SY(pts[i].y));
  ctx.closePath();
}
function strokeOffset(ctx: CanvasRenderingContext2D, s: S, frac: number, SX: (x: number) => number, SY: (y: number) => number) {
  ctx.beginPath();
  for (let i = 0; i <= N; i++) { const j = i % N, c = s.cl[j], n = s.nrm[j], o = frac * s.width[j]; (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, SX(c.x + n.x * o), SY(c.y + n.y * o)); }
  ctx.stroke();
}
// PROCEDURAL Magma background — drawn in WORLD space (pans/zooms with the camera, so it's
// crisp at the close race zoom). Dark warm basalt plates + glowing molten lava veins/cracks
// + embers, on a warm radial tint. Deterministic via hash2 so nothing flickers frame-to-frame.
function drawMagmaBg(ctx: CanvasRenderingContext2D, s: S, bx0: number, by0: number, bw: number, bh: number, SX: (x: number) => number, SY: (y: number) => number) {
  const x0 = SX(bx0), y0 = SY(by0), W = bw * ZOOM, H = bh * ZOOM, cx = x0 + W / 2, cy = y0 + H * 0.4;
  // 1) warm radial base over the whole field
  ctx.save();
  const base = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.62);
  base.addColorStop(0, "#3a1c17"); base.addColorStop(0.52, "#281310"); base.addColorStop(1, "#130908");
  ctx.fillStyle = base; ctx.fillRect(x0, y0, W, H);
  ctx.restore();

  // 2) basalt rock PLATES — coarse hash-jittered grid of dark rounded quads with thin warm seams
  const PLATE = 360;
  const wx0 = bx0, wy0 = by0, wx1 = bx0 + bw, wy1 = by0 + bh;
  for (let gx = Math.floor(wx0 / PLATE) * PLATE; gx < wx1; gx += PLATE) {
    for (let gy = Math.floor(wy0 / PLATE) * PLATE; gy < wy1; gy += PLATE) {
      const hsh = hash2(gx * 5 + 11, gy * 5 + 3);
      const ox = (hsh % 120) - 60, oy = ((hsh >> 7) % 120) - 60;
      const X = SX(gx + ox), Y = SY(gy + oy), rad = (118 + (hsh % 90)) * ZOOM;
      const pg = ctx.createRadialGradient(X - rad * 0.3, Y - rad * 0.34, rad * 0.1, X, Y, rad);
      const lit = (hsh & 1) ? "#301913" : "#3a241b";
      pg.addColorStop(0, lit); pg.addColorStop(1, "#160b08");
      ctx.fillStyle = pg; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.ellipse(X, Y, rad, rad * (0.78 + (hsh % 30) / 100), (hsh % 31) / 31 * Math.PI, 0, Math.PI * 2); ctx.fill();
      // a faint warm seam crack across the plate
      ctx.globalAlpha = 0.4; ctx.strokeStyle = "#7a4326"; ctx.lineWidth = Math.max(0.8, 1.1 * ZOOM);
      ctx.beginPath(); ctx.moveTo(X - rad * 0.5, Y - rad * 0.2); ctx.lineTo(X + rad * 0.1, Y + rad * 0.1); ctx.lineTo(X + rad * 0.5, Y - rad * 0.05); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // 3) glowing molten LAVA VEINS — long hot cracks snaking across the field (hash-seeded
  // polylines), drawn with a hot glow then a bright core, so the basalt looks cracked open.
  const VEINS = 9;
  for (let v = 0; v < VEINS; v++) {
    const h0 = hash2(v * 97 + 5, v * 13 + 41);
    let px = bx0 + (h0 % 1000) / 1000 * bw, py = by0 + ((h0 >> 9) % 1000) / 1000 * bh;
    const segs = 5 + (h0 % 4), pts: V[] = [{ x: px, y: py }];
    let ang = (h0 % 628) / 100;
    for (let k = 0; k < segs; k++) {
      const hk = hash2(v * 31 + k * 7, k * 19 + 2);
      ang += ((hk % 120) - 60) / 100; // wander
      const step = 240 + (hk % 220);
      px += Math.cos(ang) * step; py += Math.sin(ang) * step; pts.push({ x: px, y: py });
    }
    // outer glow pass
    ctx.save(); ctx.shadowColor = "rgba(231,70,26,0.9)"; ctx.shadowBlur = 16 * ZOOM;
    ctx.strokeStyle = "rgba(231,70,26,0.55)"; ctx.lineWidth = Math.max(3, 7 * ZOOM); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(SX(pts[0].x), SY(pts[0].y)); for (let k = 1; k < pts.length; k++) ctx.lineTo(SX(pts[k].x), SY(pts[k].y)); ctx.stroke();
    ctx.restore();
    // bright molten core
    const cg = ctx.createLinearGradient(SX(pts[0].x), SY(pts[0].y), SX(pts[pts.length - 1].x), SY(pts[pts.length - 1].y));
    cg.addColorStop(0, "#ff8a26"); cg.addColorStop(0.5, "#ffe6a0"); cg.addColorStop(1, "#ff7a26");
    ctx.strokeStyle = cg; ctx.lineWidth = Math.max(1.4, 2.6 * ZOOM); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(SX(pts[0].x), SY(pts[0].y)); for (let k = 1; k < pts.length; k++) ctx.lineTo(SX(pts[k].x), SY(pts[k].y)); ctx.stroke();
  }

  // 4) embers — scattered hot flecks, gently pulsing
  const ESTEP = 300;
  for (let gx = Math.floor(wx0 / ESTEP) * ESTEP; gx < wx1; gx += ESTEP) {
    for (let gy = Math.floor(wy0 / ESTEP) * ESTEP; gy < wy1; gy += ESTEP) {
      const hsh = hash2(gx * 7 + 19, gy * 7 + 23);
      if (hsh % 3 !== 0) continue;
      const X = SX(gx + (hsh % 200) - 100), Y = SY(gy + ((hsh >> 8) % 200) - 100);
      const tw = 0.5 + 0.5 * Math.sin(s.t * 2 + (hsh % 100) / 16);
      ctx.globalAlpha = 0.35 + 0.4 * tw; ctx.fillStyle = (hsh & 1) ? "#ff7a2a" : "#ffd680";
      ctx.beginPath(); ctx.arc(X, Y, (0.8 + (hsh % 2)) * ZOOM + 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function drawRoadSurface(ctx: CanvasRenderingContext2D, s: S, SX: (x: number) => number, SY: (y: number) => number) {
  const wd = s.w, STEP = 92;
  const wx0 = s.cam.x - (s.bbox.x1 - s.bbox.x0), wy0 = s.cam.y - (s.bbox.y1 - s.bbox.y0);
  const wx1 = s.cam.x + (s.bbox.x1 - s.bbox.x0), wy1 = s.cam.y + (s.bbox.y1 - s.bbox.y0);
  for (let gx = Math.floor(wx0 / STEP) * STEP; gx < wx1; gx += STEP) for (let gy = Math.floor(wy0 / STEP) * STEP; gy < wy1; gy += STEP) {
    const hsh = hash2(gx * 3 + 1, gy * 3 + 7), ox = (hsh % 80) - 40, oy = ((hsh >> 7) % 80) - 40, X = SX(gx + ox), Y = SY(gy + oy);
    if (wd.surface === "stars") { if (hsh % 5 < 2) { ctx.globalAlpha = 0.85; ctx.fillStyle = (hsh & 1) ? "#bcd0ff" : "#7fe9d8"; const r = (0.6 + (hsh % 3) * 0.5) * ZOOM + 0.4; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill(); } }
    else if (wd.surface === "dirt") { ctx.globalAlpha = 0.4; ctx.fillStyle = (hsh & 1) ? wd.road2 : wd.dot; const r = (5 + (hsh % 9)) * ZOOM; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill(); }
    else if (wd.surface === "rock") { if (hsh % 4 === 0) { ctx.globalAlpha = 0.6; ctx.fillStyle = wd.seam; const r = (1 + (hsh % 2)) * ZOOM + 0.5; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill(); } else { ctx.globalAlpha = 0.45; ctx.fillStyle = "#0c0807"; const r = (4 + (hsh % 7)) * ZOOM; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill(); } }
    else { if (hsh % 5 === 0) { ctx.globalAlpha = 0.4; ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + ((hsh % 20) - 10) * ZOOM, Y + (((hsh >> 5) % 20) - 10) * ZOOM); ctx.stroke(); } else if (hsh % 3 === 0) { ctx.globalAlpha = 0.22; ctx.fillStyle = "#eaf5ff"; const r = (3 + (hsh % 6)) * ZOOM; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill(); } }
  }
  ctx.globalAlpha = 1;
}
function drawCenter(ctx: CanvasRenderingContext2D, s: S, SX: (x: number) => number, SY: (y: number) => number) {
  const wd = s.w;
  ctx.save();
  if (wd.surface === "dirt") { ctx.strokeStyle = "rgba(70,58,42,0.6)"; ctx.lineWidth = Math.max(2, 7 * ZOOM); strokeOffset(ctx, s, 0.26, SX, SY); strokeOffset(ctx, s, -0.26, SX, SY); }
  else if (wd.surface === "stars") { ctx.shadowColor = wd.seam; ctx.shadowBlur = 8; ctx.strokeStyle = wd.seam; ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(1.5, 3 * ZOOM); ctx.setLineDash([10, 16]); strokeOffset(ctx, s, 0, SX, SY); ctx.setLineDash([]); }
  else if (wd.surface === "rock") { ctx.shadowColor = wd.seam; ctx.shadowBlur = 10; ctx.strokeStyle = wd.seam; ctx.globalAlpha = 0.5 + 0.28 * Math.sin(s.t * 3); ctx.lineWidth = Math.max(2, 4 * ZOOM); strokeOffset(ctx, s, 0, SX, SY); }
  else { ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = Math.max(3, 12 * ZOOM); strokeOffset(ctx, s, 0.05, SX, SY); }
  ctx.restore();
}
function drawEdges(ctx: CanvasRenderingContext2D, s: S, SX: (x: number) => number, SY: (y: number) => number) {
  ctx.save(); ctx.strokeStyle = s.w.rail; ctx.lineWidth = Math.max(2, 4 * ZOOM); ctx.shadowColor = s.w.rail; ctx.shadowBlur = 6; ctx.globalAlpha = 0.85;
  for (const sgn of [0.5, -0.5]) { ctx.beginPath(); for (let i = 0; i <= N; i++) { const j = i % N, c = s.cl[j], n = s.nrm[j], hw = s.width[j] * sgn; (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, SX(c.x + n.x * hw), SY(c.y + n.y * hw)); } ctx.stroke(); }
  ctx.restore();
}
function hazardPoly(ctx: CanvasRenderingContext2D, s: S, hz: Hazard, SX: (x: number) => number, SY: (y: number) => number, grow: number) {
  ctx.beginPath();
  const span = ((hz.i1 - hz.i0) % N + N) % N;
  for (let k = 0; k <= span; k++) { const j = (hz.i0 + k) % N, c = s.cl[j], n = s.nrm[j], hw = s.width[j] * 0.5 + grow; (k === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, SX(c.x + n.x * hw), SY(c.y + n.y * hw)); }
  for (let k = span; k >= 0; k--) { const j = (hz.i0 + k) % N, c = s.cl[j], n = s.nrm[j], hw = s.width[j] * 0.5 + grow; ctx.lineTo(SX(c.x - n.x * hw), SY(c.y - n.y * hw)); }
  ctx.closePath();
}
// a ROAD-SPANNING launch KICKER (top-down) — shading fakes a rising ramp: dark at the base,
// bright metal toward the lit takeoff LIP, slats + accent rails + a glowing edge you kick off.
function drawRamp(ctx: CanvasRenderingContext2D, s: S, f: Feat, SX: (x: number) => number, SY: (y: number) => number) {
  const i = f.i, span = 3, c0 = s.cl[i], tg = s.tan[i];
  const a = s.cl[(i - span + N) % N], b = s.cl[(i + span) % N];
  const len = Math.max(46, Math.hypot(b.x - a.x, b.y - a.y) * ZOOM), hw = s.width[i] * 0.5 * ZOOM;
  // premium sprite: a top-down kicker, road-spanning, the lit lip pointing in the travel direction
  if (ready(ART.ramp)) {
    ctx.save(); ctx.translate(SX(c0.x), SY(c0.y)); ctx.rotate(Math.atan2(tg.y, tg.x) + Math.PI / 2);
    const W = hw * 2.05, H = hw * 1.7;
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 9;
    ctx.drawImage(ART.ramp, -W / 2, -H / 2, W, H);
    ctx.restore(); return;
  }
  const r4 = Math.max(3, 4 * ZOOM), lip = Math.max(3, 5 * ZOOM);
  ctx.save();
  ctx.translate(SX(c0.x), SY(c0.y)); ctx.rotate(Math.atan2(tg.y, tg.x)); // +x = travel = up the ramp toward the lip
  ctx.globalAlpha = 0.4; ctx.fillStyle = "#000"; ctx.fillRect(-len / 2 - 7, -hw, 11, hw * 2); ctx.globalAlpha = 1; // shadow at the foot
  const gr = ctx.createLinearGradient(-len / 2, 0, len / 2, 0); // dark base -> bright lit lip = "rising"
  gr.addColorStop(0, "#13161f"); gr.addColorStop(0.5, "#343b4a"); gr.addColorStop(0.84, "#7e8799"); gr.addColorStop(1, "#d4dcec");
  ctx.fillStyle = gr; ctx.fillRect(-len / 2, -hw, len, hw * 2);
  const slats = 5; // ramp boards, fading darker toward the base
  for (let k = 1; k <= slats; k++) { const x = -len / 2 + (k / (slats + 1)) * len; ctx.strokeStyle = `rgba(8,10,16,${0.5 - k * 0.06})`; ctx.lineWidth = Math.max(1.5, 2.5 * ZOOM); ctx.beginPath(); ctx.moveTo(x, -hw * 0.92); ctx.lineTo(x, hw * 0.92); ctx.stroke(); }
  ctx.fillStyle = s.w.accent; ctx.globalAlpha = 0.9; ctx.fillRect(-len / 2, -hw, len, r4); ctx.fillRect(-len / 2, hw - r4, len, r4); ctx.globalAlpha = 1; // side rails
  ctx.fillStyle = "#eef3ff"; ctx.fillRect(len / 2 - lip, -hw, lip, hw * 2); // bright takeoff lip
  ctx.shadowColor = s.w.accent; ctx.shadowBlur = 16; ctx.strokeStyle = s.w.accent; ctx.lineWidth = Math.max(2, 3 * ZOOM);
  ctx.beginPath(); ctx.moveTo(len / 2, -hw); ctx.lineTo(len / 2, hw); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = Math.max(2, 3.5 * ZOOM); ctx.lineJoin = "round"; // forward motion chevrons near the lip
  for (let k = 0; k < 2; k++) { const x = len * 0.16 + k * len * 0.18; ctx.beginPath(); ctx.moveTo(x - len * 0.06, -hw * 0.5); ctx.lineTo(x + len * 0.06, 0); ctx.lineTo(x - len * 0.06, hw * 0.5); ctx.stroke(); }
  ctx.restore();
}
function drawHazard(ctx: CanvasRenderingContext2D, s: S, hz: Hazard, SX: (x: number) => number, SY: (y: number) => number) {
  const span = ((hz.i1 - hz.i0) % N + N) % N;
  const mid = (hz.i0 + Math.floor(span / 2)) % N;
  // premium sprite for the lava pool / crater pit, road-spanning, aligned to the track
  const spriteIm = hz.kind === "lava" ? ART.lava : hz.kind === "pit" ? ART.pit : null;
  if (spriteIm && ready(spriteIm)) {
    const tg = s.tan[mid], hw = s.width[mid] * 0.5 * ZOOM;
    const c0 = s.cl[hz.i0], c1 = s.cl[hz.i1], stripLen = Math.hypot(c1.x - c0.x, c1.y - c0.y) * ZOOM;
    ctx.save(); ctx.translate(SX(s.cl[mid].x), SY(s.cl[mid].y)); ctx.rotate(Math.atan2(tg.y, tg.x) + Math.PI / 2);
    const W = hw * 2.2, H = Math.max(stripLen * 1.3, hw * 1.5);
    ctx.drawImage(spriteIm, -W / 2, -H / 2, W, H);
    ctx.restore();
    const rim = hz.kind === "lava" ? "rgba(255,180,90,0.85)" : "rgba(150,140,120,0.65)";
    ctx.save(); ctx.shadowColor = rim; ctx.shadowBlur = 10; ctx.strokeStyle = rim; ctx.lineWidth = Math.max(2, 3 * ZOOM);
    hazardPoly(ctx, s, hz, SX, SY, 6); ctx.stroke(); ctx.restore();
    return;
  }
  ctx.save();
  hazardPoly(ctx, s, hz, SX, SY, 6); ctx.clip();
  if (hz.kind === "lava") {
    ctx.fillStyle = "#180a06"; ctx.fillRect(-3000, -3000, 9000, 9000);
    for (let k = 0; k <= span; k++) {
      const j = (hz.i0 + k) % N, c = s.cl[j], px = SX(c.x), py = SY(c.y);
      const ph = s.t * 2.2 + k * 1.3, r = (s.width[j] * 0.55 + 14) * ZOOM * (0.78 + 0.14 * Math.sin(ph));
      const g = ctx.createRadialGradient(px, py, r * 0.1, px, py, r); g.addColorStop(0, "#fff0b0"); g.addColorStop(0.32, "#ff9a24"); g.addColorStop(0.68, "#df3f0c"); g.addColorStop(1, "rgba(110,18,4,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = "#1c0c07"; ctx.beginPath(); ctx.arc(px + Math.sin(ph) * 8, py + Math.cos(ph) * 6, r * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
  } else if (hz.kind === "pit") {
    ctx.fillStyle = "#08070a"; ctx.fillRect(-3000, -3000, 9000, 9000);
    for (let k = 0; k <= span; k++) {
      const j = (hz.i0 + k) % N, c = s.cl[j], hwp = s.width[j] * 0.5, X = SX(c.x), Y = SY(c.y), R = hwp * ZOOM;
      // crater bowl: a sunlit rim on the upper-left fading to a black bottomless centre
      const g = ctx.createRadialGradient(X - R * 0.25, Y - R * 0.3, R * 0.12, X, Y, R * 1.05);
      g.addColorStop(0, "#000000"); g.addColorStop(0.55, "#0b0a0d"); g.addColorStop(0.82, "#2a2620"); g.addColorStop(0.95, "#5e5547"); g.addColorStop(1, "rgba(120,110,92,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
      for (let r = 0; r < 5; r++) { const hh = hash2(j * 7 + r, r * 13), a = (hh % 360) * Math.PI / 180, rr = R * (0.78 + (hh % 18) / 100); ctx.fillStyle = "rgba(120,112,96,0.5)"; ctx.beginPath(); ctx.arc(X + Math.cos(a) * rr, Y + Math.sin(a) * rr, (1.4 + (hh % 3)) * ZOOM, 0, Math.PI * 2); ctx.fill(); }
    }
  } else if (hz.kind === "void") {
    ctx.fillStyle = "#01030a"; ctx.fillRect(-3000, -3000, 9000, 9000);
    const X = SX(hz.cx), Y = SY(hz.cy), R = (s.width[hz.i0] * 0.7 + 60) * ZOOM;
    const neb = ctx.createRadialGradient(X, Y, 0, X, Y, R); neb.addColorStop(0, "rgba(86,42,128,0.42)"); neb.addColorStop(0.6, "rgba(20,30,70,0.24)"); neb.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = neb; ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k <= span; k++) { const j = (hz.i0 + k) % N, c = s.cl[j], n = s.nrm[j], hwp = s.width[j] * 0.5;
      for (let st = 0; st < 9; st++) { const h = hash2(j * 13 + st, st * 7), o = ((h % 200) / 100 - 1) * hwp, px = SX(c.x + n.x * o), py = SY(c.y + n.y * o);
        ctx.globalAlpha = 0.5 + (h % 50) / 100; ctx.fillStyle = (h & 1) ? "#bcd0ff" : "#9fe9d8"; ctx.fillRect(px, py, ZOOM + 0.4, ZOOM + 0.4); } }
    ctx.globalAlpha = 1;
  } else { // crevasse — deep ice chasm, glowing cracked edges
    ctx.fillStyle = "#0a1622"; ctx.fillRect(-3000, -3000, 9000, 9000);
    for (let k = 0; k <= span; k++) { const j = (hz.i0 + k) % N, c = s.cl[j], n = s.nrm[j], hwp = s.width[j] * 0.5, c2 = s.cl[(j + 1) % N];
      const e1x = SX(c.x + n.x * hwp), e1y = SY(c.y + n.y * hwp), e2x = SX(c.x - n.x * hwp), e2y = SY(c.y - n.y * hwp);
      const g = ctx.createLinearGradient(e1x, e1y, e2x, e2y); g.addColorStop(0, "rgba(150,210,245,0.6)"); g.addColorStop(0.5, "rgba(8,16,30,0)"); g.addColorStop(1, "rgba(150,210,245,0.6)");
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(26, s.width[j] * ZOOM * 0.95); ctx.beginPath(); ctx.moveTo(SX(c.x), SY(c.y)); ctx.lineTo(SX(c2.x), SY(c2.y)); ctx.stroke(); }
  }
  ctx.restore();
  const rim = hz.kind === "lava" ? "rgba(255,180,90,0.9)" : hz.kind === "crevasse" ? "rgba(180,225,255,0.85)" : hz.kind === "void" ? "rgba(94,234,212,0.8)" : "rgba(150,140,120,0.7)";
  ctx.save(); ctx.shadowColor = rim; ctx.shadowBlur = 12; ctx.strokeStyle = rim; ctx.lineWidth = Math.max(2, 3 * ZOOM);
  hazardPoly(ctx, s, hz, SX, SY, 6); ctx.stroke(); ctx.restore();
}
function drawPortal(ctx: CanvasRenderingContext2D, s: S, pt: Portal, SX: (x: number) => number, SY: (y: number) => number) {
  const ring = (x: number, y: number, color: string) => {
    const px = SX(x), py = SY(y), R = PORTAL_R * ZOOM, rot = s.t * 2;
    ctx.save(); ctx.translate(px, py);
    const g = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R); g.addColorStop(0, "rgba(255,255,255,0.85)"); g.addColorStop(0.4, color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.82; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, 3 * ZOOM); ctx.shadowColor = color; ctx.shadowBlur = 14;
    for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.arc(0, 0, R * (0.4 + r * 0.22), rot + r, rot + r + 4.2); ctx.stroke(); }
    ctx.restore();
  };
  ring(pt.ax, pt.ay, "#7c6aff"); // entry — violet
  ring(pt.bx, pt.by, "#5eead4"); // exit — teal
}
function drawTunnelRoof(ctx: CanvasRenderingContext2D, s: S, bg: HTMLImageElement, bx0: number, by0: number, bw: number, bh: number, SX: (x: number) => number, SY: (y: number) => number) {
  if (!s.w.tunnels) return;
  for (const [a, b] of s.w.tunnels) {
    const i0 = Math.round(a * N) % N, i1 = Math.round(b * N) % N, span = ((i1 - i0) % N + N) % N;
    ctx.save();
    ctx.beginPath();
    for (let k = 0; k <= span; k++) { const j = (i0 + k) % N, c = s.cl[j], n = s.nrm[j], hw = s.width[j] * 0.5 + 26; (k === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, SX(c.x + n.x * hw), SY(c.y + n.y * hw)); }
    for (let k = span; k >= 0; k--) { const j = (i0 + k) % N, c = s.cl[j], n = s.nrm[j], hw = s.width[j] * 0.5 + 26; ctx.lineTo(SX(c.x - n.x * hw), SY(c.y - n.y * hw)); }
    ctx.closePath(); ctx.clip();
    ctx.globalAlpha = 0.9; ctx.drawImage(bg, SX(bx0), SY(by0), bw * ZOOM, bh * ZOOM);
    ctx.globalAlpha = 0.35; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 4000, 4000);
    ctx.restore();
    // lit mouth arches
    for (const i of [i0, i1]) { const c = s.cl[i], n = s.nrm[i], hw = s.width[i] * 0.5 + 26; ctx.save(); ctx.strokeStyle = s.w.accent; ctx.lineWidth = Math.max(3, 5 * ZOOM); ctx.shadowColor = s.w.accent; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(SX(c.x + n.x * hw), SY(c.y + n.y * hw)); ctx.lineTo(SX(c.x - n.x * hw), SY(c.y - n.y * hw)); ctx.stroke(); ctx.restore(); }
  }
}
function drawBump(ctx: CanvasRenderingContext2D, f: Feat, SX: (x: number) => number, SY: (y: number) => number) {
  ctx.save(); ctx.translate(SX(f.x), SY(f.y)); ctx.rotate(f.ang);
  const halfW = f.r * ZOOM * 1.5, halfH = f.r * ZOOM * 0.5, stripes = 6;
  for (let i = 0; i < stripes; i++) { ctx.fillStyle = i % 2 === 0 ? "#f5c33a" : "#15100a"; ctx.fillRect(-halfW + (i / stripes) * halfW * 2, -halfH, (halfW * 2) / stripes + 0.5, halfH * 2); }
  ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(-halfW, -halfH, halfW * 2, halfH * 0.45);
  ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5; ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
  ctx.restore();
}
function drawBall(ctx: CanvasRenderingContext2D, b: Ball, SX: (x: number) => number, SY: (y: number) => number) {
  const x = SX(b.x), y = SY(b.y), r = b.r * ZOOM;
  ctx.globalAlpha = 0.35; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(x, y + r * 0.4, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  if (b.kind === "lavabomb") {
    // glowing molten lava bomb: hot outer halo, white-hot core, dark crust flecks
    ctx.save(); ctx.shadowColor = "rgba(255,140,40,0.9)"; ctx.shadowBlur = 14 * ZOOM;
    const g = ctx.createRadialGradient(x - r * 0.28, y - r * 0.28, r * 0.15, x, y, r);
    g.addColorStop(0, "#fff3c8"); g.addColorStop(0.4, "#ff9a2a"); g.addColorStop(0.78, "#e7461a"); g.addColorStop(1, "#6a1808");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // dark crust patches that rotate with the roll
    ctx.fillStyle = "rgba(26,12,8,0.55)";
    for (let k = 0; k < 3; k++) { const a = b.spin + k * 2.1, rr = r * 0.5; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * 0.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#fff6d6"; ctx.beginPath(); ctx.arc(x - r * 0.22, y - r * 0.22, r * 0.22, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#bcd6e8"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(120,150,180,0.6)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r * 0.6, b.spin, b.spin + 2.2); ctx.stroke();
}
function sprite(ctx: CanvasRenderingContext2D, im: HTMLImageElement | null, f: Feat, size: number, SX: (x: number) => number, SY: (y: number) => number, fb: () => void) {
  ctx.save(); ctx.translate(SX(f.x), SY(f.y)); ctx.rotate(f.ang);
  if (ready(im)) { const wd = size * ZOOM, hd = wd * (im.naturalHeight / im.naturalWidth); ctx.drawImage(im, -wd / 2, -hd / 2, wd, hd); } else fb();
  ctx.restore();
}
function drawVehicle(ctx: CanvasRenderingContext2D, car: { x: number; y: number; heading: number }, veh: Vehicle, color: string, SX: (x: number) => number, SY: (y: number) => number, alpha: number, ghost: boolean, z = 0, isPlayer = false) {
  const cx = SX(car.x), cy = SY(car.y), lift = z * LIFT_K * ZOOM, air = Math.min(AIR_MAX, 1 + z * AIR_K), by = cy - lift;
  const sh = Math.max(0.4, 1 - z * 0.004);
  ctx.globalAlpha = ghost ? 0.32 : Math.max(0.12, 0.42 - z * 0.0018);
  ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(cx, cy + 2, CAR_R * ZOOM * 0.95 * sh, CAR_R * ZOOM * 0.55 * sh, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineWidth = ghost ? 1.5 : 2.5; ctx.shadowColor = color; ctx.shadowBlur = ghost ? 4 : isPlayer ? 14 : 7;
  ctx.beginPath(); ctx.arc(cx, by, (CAR_R + 4) * ZOOM * air, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
  const im = veh === "ship" ? ART.ship : ART.rover;
  ctx.save(); ctx.translate(cx, by); ctx.rotate(car.heading + Math.PI / 2); ctx.scale(air, air);
  if (ready(im)) { const wdr = CAR_R * 2.9 * ZOOM, hdr = wdr * (im.naturalHeight / im.naturalWidth); ctx.drawImage(im, -wdr / 2, -hdr / 2, wdr, hdr); }
  else { ctx.fillStyle = ghost ? color : "#dfe5ee"; ctx.fillRect(-9 * ZOOM, -13 * ZOOM, 18 * ZOOM, 26 * ZOOM); ctx.fillStyle = color; ctx.fillRect(-9 * ZOOM, -13 * ZOOM, 18 * ZOOM, 6 * ZOOM); }
  ctx.restore(); ctx.globalAlpha = 1;
}
function drawPatch(ctx: CanvasRenderingContext2D, f: Feat, SX: (x: number) => number, SY: (y: number) => number) {
  const X = SX(f.x), Y = SY(f.y), R = f.r * ZOOM;
  if (f.kind === "gas") {
    for (let b = 0; b < 5; b++) { ctx.globalAlpha = 0.12; ctx.fillStyle = "#6ee6a0"; const a = b * 1.4 + f.ang; ctx.beginPath(); ctx.arc(X + Math.cos(a) * R * 0.34, Y + Math.sin(a) * R * 0.34, R * 0.72, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  } else if (f.kind === "oil") {
    const gr = ctx.createRadialGradient(X - R * 0.3, Y - R * 0.3, R * 0.1, X, Y, R); gr.addColorStop(0, "rgba(90,70,120,0.6)"); gr.addColorStop(0.5, "rgba(20,16,28,0.85)"); gr.addColorStop(1, "rgba(8,6,12,0.7)");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(X, Y, R, R * 0.82, f.ang, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.4; ctx.strokeStyle = "#a98fd8"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(X, Y, R * 0.6, R * 0.5, f.ang, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  } else { // slush
    ctx.globalAlpha = 0.5; ctx.fillStyle = "rgba(180,215,235,0.7)"; ctx.beginPath(); ctx.ellipse(X, Y, R, R * 0.85, f.ang, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.6; ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = "rgba(255,235,160,0.45)"; ctx.lineWidth = 2; ctx.setLineDash([7, 7]); ctx.beginPath(); ctx.arc(X, Y, R + 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
}
function drawChecker(ctx: CanvasRenderingContext2D, s: S, SX: (x: number) => number, SY: (y: number) => number) {
  const i = s.cps[0], c = s.cl[i], n = s.nrm[i], hw = s.width[i] * 0.5;
  ctx.save(); ctx.translate(SX(c.x), SY(c.y)); ctx.rotate(Math.atan2(n.y, n.x));
  const cw = (hw * 2 * ZOOM) / 8;
  for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? "#0c0e14" : "#e8ecf5"; ctx.fillRect(-hw * ZOOM + k * cw, -7, cw, 14); }
  ctx.restore();
}

function fmt(t: number): string { const m = Math.floor(t / 60); return `${m}:${(t % 60).toFixed(1).padStart(4, "0")}`; }

function drawHUD(ctx: CanvasRenderingContext2D, s: S, w: number, h: number) {
  const wd = s.w;
  ctx.fillStyle = "#e8ecf5"; ctx.textAlign = "left"; ctx.font = "800 20px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`LAP ${Math.min(LAPS, s.player.lap + 1)}/${LAPS}`, 14, 28);
  const place = 1 + s.cars.filter((c) => c !== s.player && progress(c) > progress(s.player)).length;
  ctx.textAlign = "right"; ctx.fillStyle = wd.accent; ctx.fillText(`P${place}/${s.cars.length}`, w - 14, 28);
  ctx.fillStyle = "#aeb6c8"; ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif"; ctx.fillText(fmt(s.raceT), w - 14, 48);
  ctx.textAlign = "left"; ctx.fillText(wd.name, 14, 48);
  const spd = Math.hypot(s.player.vx, s.player.vy) / (BASE_MAX * BOOST_MULT);
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(14, h - 22, 120, 6);
  ctx.fillStyle = s.player.boostT > 0 ? wd.accent : "#86f0c4"; ctx.fillRect(14, h - 22, Math.min(1, spd) * 120, 6);
  const mm = 116, pad = 12, mx = w - mm - pad, my = h - mm - pad, bb = s.bbox, bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0, sc = (mm - 14) / Math.max(bw, bh);
  const MX = (x: number) => mx + 6 + (x - bb.x0) * sc + (mm - 12 - bw * sc) / 2, MY = (y: number) => my + 6 + (y - bb.y0) * sc + (mm - 12 - bh * sc) / 2;
  ctx.fillStyle = "rgba(8,11,20,0.6)"; ctx.fillRect(mx, my, mm, mm);
  ctx.strokeStyle = "rgba(255,255,255,0.24)"; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= N; i += 2) { const p = s.cl[i % N]; (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, MX(p.x), MY(p.y)); }
  ctx.closePath(); ctx.stroke();
  for (const c of s.cars) { ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(MX(c.x), MY(c.y), c.isPlayer ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill(); }

  if (s.phase === "countdown") {
    ctx.textAlign = "center"; ctx.fillStyle = wd.accent; ctx.font = "800 72px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(String(Math.max(1, Math.ceil(COUNTDOWN - s.t))), w / 2, h / 2 + 8);
    ctx.fillStyle = "#aeb6c8"; ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("hold + slide to steer · ramp over the hazard · grab the boost pads", w / 2, h / 2 + 42); ctx.textAlign = "left";
  }
  if (s.msgT > 0) {
    ctx.globalAlpha = Math.min(1, s.msgT); ctx.textAlign = "center";
    ctx.fillStyle = s.msg.startsWith("FINISH") ? "#86f0c4" : s.msg === "GO!" ? wd.accent : s.msg === "JUMP!" ? "#f5c33a" : "#ff8a8a";
    ctx.font = "800 30px ui-sans-serif, system-ui, sans-serif"; ctx.fillText(s.msg, w / 2, h / 2 - 18);
    if (s.msg.startsWith("FINISH")) { ctx.fillStyle = "#e8ecf5"; ctx.font = "700 18px ui-sans-serif, system-ui, sans-serif"; ctx.fillText(fmt(s.player.finishT), w / 2, h / 2 + 10); }
    ctx.globalAlpha = 1; ctx.textAlign = "left";
  }
}

// TEMP DEBUG OVERVIEW — remove after proof.
// Standalone, session-gate-bypassing render of a whole track fitted to its bbox, for
// screenshotting the Magma redesign. Forces the world, builds the track via handle.init,
// parks the camera at the bbox centre, drops a few car markers along the centerline, and
// draws ONE static frame (no rAF, no camera-follow, no run/score). URL: ?overview=magma.
function OverviewDebug({ worldIndex }: { worldIndex: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    FORCE_WORLD = worldIndex;
    // build a temp state at a throwaway size, then fit the canvas to the track bbox.
    const tmp = handle.init(1000, 1000);
    FORCE_WORLD = null;
    const bb = tmp.bbox, bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
    const MARGIN = 360; // world units of breathing room around the track
    // logical canvas size so (track + margin) * ZOOM fits exactly; cam at bbox centre.
    const W = Math.round((bw + 2 * MARGIN) * ZOOM), H = Math.round((bh + 2 * MARGIN) * ZOOM);
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    cv.style.width = `${Math.min(W, 760)}px`; cv.style.height = `${Math.round(Math.min(W, 760) * (H / W))}px`;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // rebuild state with the now-known logical size so the screen-space gradient/vignette fill it
    FORCE_WORLD = worldIndex;
    const s = handle.init(W, H);
    FORCE_WORLD = null;
    s.cam = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
    s.phase = "race"; s.t = 0.4; // race phase = no countdown overlay; small t so embers/seam have a value
    // park a few car markers spread around the loop so the overview shows cars on track
    const N0 = s.cl.length;
    s.cars.forEach((c, i) => {
      const idx = Math.round((i / s.cars.length) * N0) % N0;
      const p = s.cl[idx], tg = s.tan[idx];
      c.idx = idx; c.x = p.x; c.y = p.y; c.heading = Math.atan2(tg.y, tg.x); c.z = 0;
    });
    // seed a couple of static rollers on the placed lanes so the signature hazard is visible
    if (s.w.roller && s.ballZones.length) {
      for (const li of [1, 3, 5]) {
        const i = s.ballZones[li % s.ballZones.length], c = s.cl[i], n = s.nrm[i], hw = s.width[i] * 0.5;
        s.balls.push({ x: c.x + n.x * (hw - 6), y: c.y + n.y * (hw - 6), vx: 0, vy: 0, r: 30, spin: 0.6, life: 9, kind: s.w.roller });
      }
    }
    // ONE static frame (no requestAnimationFrame, no step) — just render and stop.
    ctx.clearRect(0, 0, W, H);
    handle.draw(ctx, s, W, H);
  }, [worldIndex]);
  return (
    <main style={{ minHeight: "100dvh", background: "#05070f", color: "#e8ecf5", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 20, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ fontSize: 13, letterSpacing: 2, color: "#f0b340", textTransform: "uppercase", fontWeight: 700 }}>
        TEMP DEBUG OVERVIEW · {WORLDS[worldIndex]?.name ?? "?"}
      </div>
      <canvas ref={canvasRef} style={{ border: "1px solid #1c2236", borderRadius: 12, background: "#05070f" }} />
      <div style={{ fontSize: 12, color: "#5b6478" }}>Static fit-to-bbox render. Remove after proof.</div>
    </main>
  );
}

export default function RallyGame() {
  // TEMP DEBUG OVERVIEW — remove after proof. ?overview=magma renders a standalone, session-
  // gate-bypassing static overview of the Magma track (or any world name) for screenshotting.
  if (typeof window !== "undefined") {
    const ov = new URLSearchParams(window.location.search).get("overview");
    if (ov) {
      const idx = WORLDS.findIndex((w) => w.name.toLowerCase().replace(/[^a-z]/g, "").startsWith(ov.toLowerCase().replace(/[^a-z]/g, "")));
      return <OverviewDebug worldIndex={idx >= 0 ? idx : 0} />;
    }
  }
  return (
    <GameShell
      game="rally"
      title="Rover Rally"
      floorMs={20000}
      instructions="Auto-throttle. Hold and slide left/right (or arrow keys) to steer the drift. Hit the ramp on the straight to JUMP the lava/pit/crevasse, grab the boost pads, and watch the oil, gas and rolling snowballs. 3 laps, 3 rivals, a pace ghost, four alien worlds. Finish fast + high to bank Salvage."
      handle={handle}
    />
  );
}
