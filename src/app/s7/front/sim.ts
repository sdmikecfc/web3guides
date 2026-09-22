/**
 * THE FRONT ambient skirmish sim (ADR-0121). Decoration, not a scored game:
 * exempt from the five harness gates, but still seeded + fixed-dt so two
 * frames never disagree about who is where. No RunShell, no session, no
 * score route. The scene consumes `events` each frame and MUST clear them.
 *
 * Coordinates are sim px in a fixed 2600x1080 space (letterboxed by the
 * stage). The long axis is the LIBERATION LADDER: the front's x position is
 * set from season data (bonded count + current target peak), never from
 * combat. Combat here is theater; the database is the general.
 *
 * MOVEMENT MODEL (2026-08-17, "it looks like it's glitching"): velocity is a
 * STATE eased toward a desired velocity, never recomputed raw from forces.
 * The old model set vx from seek+separation each frame with zero inertia, so
 * at the standoff line (seek ~0, separation full) the net force flipped sign
 * every frame and units vibrated. Measured before the fix: 0.30 sprite-mirror
 * flips/unit/sec, worst unit 1.8/s; 93% of direction flips within 40px of the
 * standoff goal, 85% with a same-side neighbor under 30px. Now: per-role
 * acceleration easing, an arrival deadband with a move/park hysteresis latch,
 * committed targets (seconds, not frames), and a hysteretic `face` sign the
 * scene mirrors with - the sim owns facing so the mirror can never flicker.
 *
 * COMBAT ROLES (Mike: "certain models should stay further back and shoot
 * rockets while the smaller ones or the shield ones get up close"): every
 * unit carries a role derived from its tank key's class in lib/s7/tanks.
 *   arty      mortar/anvil/atlas/juggernaut/colossus - park FAR behind the
 *             line, lob rockets at long range, reposition rarely
 *   skirmish  tier-1 hulls + viper/spectre - dart close and strafe
 *   line      badger/sentry/bulwark/brawler/ram/... - advance to the front
 *             band and hold it
 * The Lich mirrors the grammar: walkers lob from deep, drones swarm close,
 * its infantry holds the line.
 */

import { tankByKey } from "../../../lib/s7/tanks";

export const FRONT_W = 2600;
export const FRONT_H = 1080;
export const BAND_Y0 = 170; // battle band (clear of HUD)
export const BAND_Y1 = 1000;
export const HUMAN_EDGE = 430; // west staging line (buttons zone is west of it)
export const WARDEN_EDGE = 2440; // east staging line (citadel behind it)

export type Side = 0 | 1; // 0 = REALMFALL (west), 1 = WARDEN (east)
export type UnitKind = "inf" | "tank" | "drone" | "walker" | "named";
export type Role = "arty" | "line" | "skirmish";

export interface FrontUnit {
  id: number;
  side: Side;
  kind: UnitKind;
  x: number;
  y: number;
  /** velocity in px/s (STATE, eased - not a per-frame force readout) */
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  lane: number; // home y, drifts slightly
  fireCd: number;
  flashT: number; // >0 right after firing (scene brightens the dot)
  deadT: number; // >0 while waiting to respawn
  speed: number;
  /** engagement band, derived from the hull class (tanks.ts) */
  role: Role;
  /** px behind the front line this unit tries to hold */
  standoff: number;
  /** weapon reach in px (arty far outranges its standoff) */
  range: number;
  /** committed enemy id (0 = none); kept for seconds, not frames */
  targetId: number;
  /** time left on the current commitment / until the next scan */
  retargetT: number;
  /** move/park hysteresis latch (enter beyond deadOut, park inside deadIn) */
  moving: boolean;
  /** stable render facing: 1 = east, -1 = west. Scene mirrors with THIS. */
  face: 1 | -1;
  /** seconds the opposite facing has been requested (hysteresis clock) */
  faceT: number;
  /** named units only */
  name?: string;
  tankKey?: string;
  camo?: string;
  /** chosen class id ("barbarian".."cleric"); the scene validates it and
   * draws the class figure. null/absent = guild hull art, exactly as before */
  cls?: string | null;
}

export type FrontEvent =
  | { type: "shot"; x: number; y: number; tx: number; ty: number; side: Side }
  | { type: "rocket"; x: number; y: number; tx: number; ty: number; side: Side }
  | { type: "boom"; x: number; y: number; big: boolean }
  | { type: "beam"; x: number; y: number; tx: number; ty: number }
  | { type: "spawn"; x: number; y: number; side: Side }
  | { type: "liberate"; x: number };

export interface FrontSim {
  units: FrontUnit[];
  events: FrontEvent[];
  /** static no-go discs (fortresses, placed buildings): fights happen AROUND
   * the architecture, never on top of it (Mike 2026-08-14) */
  obstacles: Array<{ x: number; y: number; r: number }>;
  /** current (tweened) front x */
  frontX: number;
  /** where data says the front should be */
  frontTargetX: number;
  t: number;
  surgeT: number; // event bursts push both armies harder for a while
  rng: () => number;
  wobblePhase: number[];
  wobbleJitter: number[];
  scale: number; // population multiplier (0.5 mobile)
  nextId: number;
}

const STATS: Record<
  Exclude<UnitKind, "named">,
  { r: number; hp: number; speed: [number, number]; cd: [number, number] }
> = {
  inf: { r: 3, hp: 1, speed: [26, 42], cd: [0.55, 1.3] },
  tank: { r: 9, hp: 4, speed: [18, 28], cd: [1.2, 2.1] },
  drone: { r: 8, hp: 2, speed: [32, 46], cd: [0.8, 1.4] },
  walker: { r: 24, hp: 40, speed: [6, 8], cd: [2.6, 3.4] },
};
const NAMED = { r: 9, hp: 6, speed: [20, 30] as [number, number], cd: [1.1, 1.9] as [number, number] };

/** stat-speed -> px/s (kept from the old sim so the on-screen pace is equal) */
const MOVE = 3.4;

/** Per-role movement + engagement grammar. accel is the easing rate (1/s):
 * direction changes take ~1/accel seconds, so nothing can flip frame-to-frame.
 * deadIn/deadOut are the park/move hysteresis radii around the goal. */
const ROLE_TUNE: Record<
  Role,
  {
    accel: number;
    deadIn: number;
    deadOut: number;
    fireDamp: number; // seek scale while engaging (arty lumbers, line plants)
    commit: [number, number]; // target commitment seconds
    surgeMin: number; // standoff multiplier under surge (arty barely creeps)
    speedMul: number;
  }
> = {
  skirmish: { accel: 5.0, deadIn: 8, deadOut: 18, fireDamp: 0.35, commit: [2.2, 3.6], surgeMin: 0.55, speedMul: 1.15 },
  line: { accel: 3.2, deadIn: 12, deadOut: 30, fireDamp: 0.12, commit: [2.6, 4.2], surgeMin: 0.6, speedMul: 1 },
  arty: { accel: 2.0, deadIn: 14, deadOut: 90, fireDamp: 0.6, commit: [4.0, 6.5], surgeMin: 0.85, speedMul: 0.7 },
};

/** Hull-class -> role. Mortar-type keys + the huge slow tier-4/5 hulls lob
 * from deep; tier-1 + the fast thin hulls skirmish; everything else (shield
 * and bruiser classes included) is the line. */
const ARTY_KEYS = new Set(["mortar", "anvil", "atlas", "juggernaut", "colossus"]);
const SKIRMISH_KEYS = new Set(["viper", "spectre"]);
export function roleOfTankKey(key: string): Role {
  if (ARTY_KEYS.has(key)) return "arty";
  if (SKIRMISH_KEYS.has(key)) return "skirmish";
  const t = tankByKey(key);
  if (t && t.tier <= 1) return "skirmish";
  return "line";
}

/** Sprite pools for the unnamed REALMFALL armor (scene draws u.tankKey). */
const POOL_ARTY = ["mortar", "anvil", "atlas", "juggernaut"];
const POOL_LINE = ["badger", "sentry", "ram", "brawler", "bulwark"];
const POOL_SKIRM = ["scout", "hound"];

/** Desktop budgets; multiplied by sim.scale. */
const BUDGET: Array<{ side: Side; kind: Exclude<UnitKind, "named">; n: number }> = [
  // ~35% fewer, larger sprites: readable armies, not a mesh (Mike 2026-08-14)
  { side: 0, kind: "inf", n: 56 },
  { side: 0, kind: "tank", n: 26 },
  { side: 1, kind: "inf", n: 52 },
  { side: 1, kind: "drone", n: 28 },
  { side: 1, kind: "walker", n: 2 },
];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WOBBLE_N = 22;

export interface NamedSpawn {
  name: string;
  tankKey: string;
  camo?: string;
  /** chosen class id ("barbarian".."cleric"); optional, render-only. The sim
   * never reads it - bands/roles still come from the REAL hull (tankKey) */
  cls?: string | null;
}

export function createFrontSim(opts: {
  seed?: number;
  frontX: number;
  scale?: number;
  named?: NamedSpawn[];
}): FrontSim {
  const rng = mulberry32(opts.seed ?? 20260817);
  const sim: FrontSim = {
    units: [],
    events: [],
    obstacles: [],
    frontX: opts.frontX,
    frontTargetX: opts.frontX,
    t: 0,
    surgeT: 0,
    rng,
    wobblePhase: Array.from({ length: WOBBLE_N }, () => rng() * Math.PI * 2),
    wobbleJitter: Array.from({ length: WOBBLE_N }, () => (rng() - 0.5) * 46),
    scale: opts.scale ?? 1,
    nextId: 1,
  };
  for (const b of BUDGET) {
    const n = Math.round(b.n * sim.scale);
    for (let i = 0; i < n; i++) spawnUnit(sim, b.side, b.kind, true);
  }
  for (const nm of (opts.named ?? []).slice(0, 40)) {
    const u = spawnUnit(sim, 0, "tank", true);
    u.kind = "named";
    u.hp = u.maxHp = NAMED.hp;
    u.speed = NAMED.speed[0] + sim.rng() * (NAMED.speed[1] - NAMED.speed[0]);
    u.name = nm.name;
    u.tankKey = nm.tankKey;
    u.camo = nm.camo;
    u.cls = nm.cls;
    // the adventurer's REAL hull decides the band: a mortar main lobs from deep
    assignBand(sim, u, roleOfTankKey(nm.tankKey));
    u.x = seededX(sim, u);
  }
  // settle: let the armies march to the line before first paint
  for (let i = 0; i < 240; i++) stepFront(sim, 1 / 60);
  sim.events.length = 0;
  return sim;
}

function statsOf(u: FrontUnit) {
  return u.kind === "named" ? NAMED : STATS[u.kind];
}

/** Roll the role's standoff band + reach onto a unit. */
function assignBand(sim: FrontSim, u: FrontUnit, role: Role) {
  u.role = role;
  if (role === "arty") {
    u.standoff = (u.kind === "walker" ? 225 : 185) + sim.rng() * 55;
    u.range = u.kind === "walker" ? 390 : 350;
  } else if (role === "skirmish") {
    u.standoff = 22 + sim.rng() * 10;
    u.range = u.kind === "inf" ? 60 : 66;
  } else {
    u.standoff = 40 + sim.rng() * 12;
    // reach tuned to the cross-line gap (own 40-52 + enemy 22-52 + clamp):
    // engagements ride the front's wobble overlap instead of perma-farming
    // the hp-1 skirmishers parked across the line
    u.range = u.kind === "inf" ? 80 : 88;
  }
}

/** Seeded units start spread toward their band so boot doesn't look like a
 * footrace (and the artillery is already dug in on first paint). */
function seededX(sim: FrontSim, u: FrontUnit): number {
  const edgeX = u.side === 0 ? HUMAN_EDGE - 40 + sim.rng() * 120 : WARDEN_EDGE - 80 + sim.rng() * 120;
  const bandX = frontXAt(sim, u.y) + (u.side === 0 ? -u.standoff : u.standoff);
  return lerp(edgeX, bandX, sim.rng() * 0.85);
}

function spawnUnit(sim: FrontSim, side: Side, kind: Exclude<UnitKind, "named">, seeded: boolean): FrontUnit {
  const st = STATS[kind];
  const y = BAND_Y0 + sim.rng() * (BAND_Y1 - BAND_Y0);
  const u: FrontUnit = {
    id: sim.nextId++,
    side,
    kind,
    x: 0,
    y,
    vx: 0,
    vy: 0,
    hp: st.hp,
    maxHp: st.hp,
    lane: y,
    fireCd: st.cd[0] + sim.rng() * (st.cd[1] - st.cd[0]),
    flashT: 0,
    deadT: 0,
    speed: st.speed[0] + sim.rng() * (st.speed[1] - st.speed[0]),
    role: "line",
    standoff: 40,
    range: 90,
    targetId: 0,
    retargetT: 0,
    moving: true,
    face: side === 0 ? 1 : -1,
    faceT: 0,
  };
  // role by kind; armor rolls a hull from the class pools (scene draws it)
  if (kind === "tank") {
    const r = sim.rng();
    const pool = r < 0.27 ? POOL_ARTY : r < 0.47 ? POOL_SKIRM : POOL_LINE;
    u.tankKey = pool[Math.floor(sim.rng() * pool.length)];
    assignBand(sim, u, roleOfTankKey(u.tankKey));
  } else if (kind === "walker") assignBand(sim, u, "arty");
  else if (kind === "drone") assignBand(sim, u, "skirmish");
  else assignBand(sim, u, side === 0 ? "skirmish" : "line");
  const edgeX = side === 0 ? HUMAN_EDGE - 40 + sim.rng() * 120 : WARDEN_EDGE - 80 + sim.rng() * 120;
  u.x = seeded ? seededX(sim, u) : edgeX;
  sim.units.push(u);
  return u;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Ragged front: the data front x plus a slow-breathing wobble field. */
export function frontXAt(sim: FrontSim, y: number): number {
  const fy = (y - BAND_Y0) / (BAND_Y1 - BAND_Y0);
  const i = Math.max(0, Math.min(WOBBLE_N - 1.001, fy * (WOBBLE_N - 1)));
  const i0 = Math.floor(i);
  const ft = i - i0;
  const w0 = Math.sin(sim.t * 0.13 + sim.wobblePhase[i0]) * 26 + sim.wobbleJitter[i0];
  const w1 = Math.sin(sim.t * 0.13 + sim.wobblePhase[i0 + 1]) * 26 + sim.wobbleJitter[i0 + 1];
  return sim.frontX + lerp(w0, w1, ft);
}

/** Data pushes the front; combat never does. Crossing is announced by the caller. */
export function setFrontTarget(sim: FrontSim, x: number, announceLiberation = false) {
  sim.frontTargetX = Math.max(HUMAN_EDGE + 120, Math.min(WARDEN_EDGE - 120, x));
  if (announceLiberation) {
    sim.events.push({ type: "liberate", x: sim.frontTargetX });
    sim.surgeT = Math.max(sim.surgeT, 6);
  }
}

/** Replace the static no-go set (fort/building discs). */
export function setObstacles(sim: FrontSim, obs: Array<{ x: number; y: number; r: number }>) {
  sim.obstacles = obs;
}

/** Feed events call this: n units burst from their edge and the line heats up. */
export function burstFront(sim: FrontSim, side: Side, kind: Exclude<UnitKind, "named">, n: number) {
  // HARD CAP (leak audit 2026-08-17, Mike: "the map uses a ton of memory if
  // left open"): units are NEVER removed - stepFront respawns the dead in
  // place - so unchecked bursts ratcheted the army, its sprites, and the
  // O(n^2) targeting scan up forever. Past the cap a burst still heats the
  // line; it just adds no bodies to an already-crowded field.
  const MAX_UNITS = 240;
  const count = Math.max(1, Math.round(n * sim.scale));
  for (let i = 0; i < count; i++) {
    if (sim.units.length >= MAX_UNITS) break;
    const u = spawnUnit(sim, side, kind, false);
    sim.events.push({ type: "spawn", x: u.x, y: u.y, side });
  }
  sim.surgeT = Math.max(sim.surgeT, 2.5);
}

function rollCd(sim: FrontSim, u: FrontUnit): number {
  // artillery reloads slow (the lob is the show); skirmishers sting, not spray
  if (u.role === "arty") return (u.kind === "walker" ? 3.6 : 3.0) + sim.rng() * 1.6;
  const cds = statsOf(u).cd;
  const base = cds[0] + sim.rng() * (cds[1] - cds[0]);
  return u.role === "skirmish" ? base * 1.5 : base;
}

const CELL = 56;
/** facing must hold its sign this long before the sprite mirrors (no flicker) */
const FACE_HOLD = 0.25;
// Horizontal deadzone for the ENGAGED facing test (Mike, 2026-08-19: the
// drones "are just constantly turning back and forth"). Skirmishers close
// right on top of their target, so target.x - u.x oscillates around zero and
// the bare `>=` test demanded a new sign every frame; FACE_HOLD then let one
// through every 0.25s, which is the flicker. Inside this band the unit simply
// keeps the facing it has. Wider than any unit radius so an overlapping
// dogfight cannot chatter.
const FACE_DEADZONE = 22;

export function stepFront(sim: FrontSim, dt: number) {
  sim.t += dt;
  if (sim.surgeT > 0) sim.surgeT -= dt;
  // wobble jitter re-rolls one point every ~1.6s so the line never repeats
  if (Math.floor(sim.t / 1.6) !== Math.floor((sim.t - dt) / 1.6)) {
    const i = Math.floor(sim.rng() * WOBBLE_N);
    sim.wobbleJitter[i] = (sim.rng() - 0.5) * 46;
  }
  // front tween: slow enough to watch, fast enough to feel the push
  sim.frontX += (sim.frontTargetX - sim.frontX) * Math.min(1, dt * 0.9);

  // spatial hash for separation; target lookups go through byId
  const grid = new Map<number, FrontUnit[]>();
  const byId = new Map<number, FrontUnit>();
  const keyOf = (x: number, y: number) => Math.floor(x / CELL) * 4096 + Math.floor(y / CELL);
  for (const u of sim.units) {
    byId.set(u.id, u);
    if (u.deadT > 0) continue;
    const k = keyOf(u.x, u.y);
    const arr = grid.get(k);
    if (arr) arr.push(u);
    else grid.set(k, [u]);
  }
  const near = (x: number, y: number, out: FrontUnit[]) => {
    out.length = 0;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    for (let ix = cx - 1; ix <= cx + 1; ix++)
      for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const arr = grid.get(ix * 4096 + iy);
        if (arr) for (const u of arr) out.push(u);
      }
    return out;
  };
  const scratch: FrontUnit[] = [];
  const surging = sim.surgeT > 0;

  for (const u of sim.units) {
    const M = ROLE_TUNE[u.role];
    if (u.deadT > 0) {
      u.deadT -= dt;
      if (u.deadT <= 0) {
        // respawn at own edge; named fall back instead of dying (handled below)
        u.hp = u.maxHp;
        u.x = u.side === 0 ? HUMAN_EDGE - 40 + sim.rng() * 100 : WARDEN_EDGE - 40 + sim.rng() * 100;
        u.y = u.lane = BAND_Y0 + sim.rng() * (BAND_Y1 - BAND_Y0);
        u.vx = 0;
        u.vy = 0;
        u.targetId = 0;
        u.retargetT = 0;
        u.moving = true;
        u.face = u.side === 0 ? 1 : -1;
        u.faceT = 0;
      }
      continue;
    }
    if (u.flashT > 0) u.flashT -= dt;
    if (u.fireCd > 0) u.fireCd -= dt;
    u.retargetT -= dt;

    // ---- target commitment: hold for seconds or until it dies/escapes ----
    let target: FrontUnit | null = null;
    if (u.targetId) {
      const t0 = byId.get(u.targetId);
      if (t0 && t0.deadT <= 0 && Math.hypot(t0.x - u.x, t0.y - u.y) < u.range * 1.2 && u.retargetT > 0) {
        target = t0;
      } else {
        // commitment ends WITH the target (death/escape/expiry): scan again
        // now, not when the old commitment clock would have run out
        u.targetId = 0;
        u.retargetT = 0;
      }
    }
    if (!target && u.retargetT <= 0) {
      // acquire: nearest enemy in reach; artillery prefers armor over specks
      let best: FrontUnit | null = null;
      let bs = Infinity;
      for (const o of sim.units) {
        if (o.side === u.side || o.deadT > 0) continue;
        const dd = Math.hypot(o.x - u.x, o.y - u.y);
        if (dd > u.range) continue;
        const score = dd - (u.role === "arty" && o.kind !== "inf" ? 140 : 0);
        if (score < bs) {
          bs = score;
          best = o;
        }
      }
      if (best) {
        target = best;
        u.targetId = best.id;
        u.retargetT = M.commit[0] + sim.rng() * (M.commit[1] - M.commit[0]);
      } else {
        u.retargetT = 0.25 + sim.rng() * 0.2; // quiet sector: scan again soon
      }
    }

    // ---- goal: hold the role band off the ragged line ----
    const standoff = u.standoff * (surging ? M.surgeMin : 1);
    const fx = frontXAt(sim, u.y);
    const gx = u.side === 0 ? fx - standoff : fx + standoff;
    // skirmishers STRAFE along the line; everyone else drifts gently
    const gy =
      u.lane +
      (u.role === "skirmish"
        ? Math.sin(sim.t * 0.8 + u.id * 1.7) * 46
        : Math.sin(sim.t * 0.4 + u.id) * (u.role === "arty" ? 6 : 14));
    const dxg = gx - u.x;
    const dyg = gy - u.y;
    const d = Math.hypot(dxg, dyg) || 1;
    // park/move hysteresis: arty repositions RARELY (deadOut 90), the rest
    // hold a tight band; inside deadIn the seek is zero (no boundary hunting)
    if (!u.moving && d > M.deadOut) u.moving = true;
    else if (u.moving && d < M.deadIn) u.moving = false;
    let ax = 0;
    let ay = 0;
    if (u.moving) {
      const arrive = Math.min(1, (d - M.deadIn) / 70);
      const sp = u.speed * MOVE * M.speedMul * (target ? M.fireDamp : 1);
      ax = (dxg / d) * sp * arrive;
      ay = (dyg / d) * sp * arrive;
    }

    // ---- separation (a desired-velocity nudge, eased like everything else) ----
    let sx = 0;
    let sy = 0;
    const st = statsOf(u);
    for (const ob of sim.obstacles) {
      const dx = u.x - ob.x;
      const dy = u.y - ob.y;
      const dd = Math.hypot(dx, dy);
      const min = ob.r + st.r + 6;
      if (dd > 0.001 && dd < min) {
        const push = (min - dd) / min;
        sx += (dx / dd) * push * 300;
        sy += (dy / dd) * push * 300;
      }
    }
    for (const o of near(u.x, u.y, scratch)) {
      if (o === u || o.side !== u.side) continue;
      const dx = u.x - o.x;
      const dy = u.y - o.y;
      const dd = Math.hypot(dx, dy);
      const min = st.r + statsOf(o).r + 9;
      if (dd > 0.001 && dd < min) {
        const push = (min - dd) / min;
        sx += (dx / dd) * push * 90;
        sy += (dy / dd) * push * 90;
      }
    }
    const sl = Math.hypot(sx, sy);
    if (sl > 320) {
      sx = (sx / sl) * 320;
      sy = (sy / sl) * 320;
    }

    // ---- fire ----
    if (target && u.fireCd <= 0) {
      u.fireCd = rollCd(sim, u);
      u.flashT = 0.14;
      const scatter = u.role === "arty" ? 14 : 0;
      const tx = target.x + (scatter ? (sim.rng() - 0.5) * 2 * scatter : 0);
      const ty = target.y + (scatter ? (sim.rng() - 0.5) * 2 * scatter : 0);
      const dd = Math.hypot(target.x - u.x, target.y - u.y);
      if (u.kind === "walker" && dd < 150) {
        sim.events.push({ type: "beam", x: u.x, y: u.y - 30, tx, ty });
      } else if (u.role === "arty") {
        // the artillery SHOW: a long parabolic lob from deep standoff
        sim.events.push({ type: "rocket", x: u.x, y: u.y, tx, ty, side: u.side });
      } else if ((u.kind === "tank" || u.kind === "named") && sim.rng() < 0.3) {
        // every ~3rd line-armor shot is a ROCKET volley (attack variety)
        sim.events.push({ type: "rocket", x: u.x, y: u.y, tx, ty, side: u.side });
      } else {
        sim.events.push({ type: "shot", x: u.x, y: u.y, tx, ty, side: u.side });
      }
      const hit = sim.rng() < (u.kind === "inf" ? 0.62 : u.role === "arty" ? 0.75 : 0.85);
      if (hit) {
        target.hp -= u.kind === "walker" ? 3 : u.kind === "tank" || u.kind === "named" ? 2 : 1;
        if (target.hp <= 0) {
          if (target.kind === "named") {
            // named adventurers never die on camera: fast fallback + heal
            target.hp = target.maxHp;
            target.x = HUMAN_EDGE - 20 + sim.rng() * 60;
            target.vx = 0;
            target.vy = 0;
            target.targetId = 0;
            sim.events.push({ type: "spawn", x: target.x, y: target.y, side: 0 });
          } else {
            target.deadT = 2.4 + sim.rng() * 3.2;
            sim.events.push({ type: "boom", x: target.x, y: target.y, big: target.kind !== "inf" });
          }
        }
      }
    }

    // ---- integrate: eased velocity, so direction changes glide ----
    const k = Math.min(1, dt * M.accel);
    u.vx += (ax + sx - u.vx) * k;
    u.vy += (ay + sy - u.vy) * k;
    u.x += u.vx * dt;
    u.y += u.vy * dt;
    if (u.y < BAND_Y0) u.y = BAND_Y0;
    if (u.y > BAND_Y1) u.y = BAND_Y1;
    if (u.x < 60) u.x = 60;
    if (u.x > FRONT_W - 60) u.x = FRONT_W - 60;
    // the DATA owns the front: nobody crosses it, combat is theater
    if (u.side === 0 && u.x > fx - 6) {
      u.x = fx - 6;
      if (u.vx > 0) u.vx = 0;
    } else if (u.side === 1 && u.x < fx + 6) {
      u.x = fx + 6;
      if (u.vx < 0) u.vx = 0;
    }

    // ---- facing: engaged units face the enemy; travellers face travel;
    // idlers face the front. The sign must HOLD for FACE_HOLD seconds before
    // the mirror moves, so residual wiggle can never flicker the sprite. ----
    const dxT = target ? target.x - u.x : 0;
    const want: 1 | -1 = target
      ? Math.abs(dxT) > FACE_DEADZONE
        ? dxT > 0
          ? 1
          : -1
        : u.face // sitting on the target: hold the sign, never chatter
      : Math.abs(u.vx) > 30
        ? u.vx > 0
          ? 1
          : -1
        : u.side === 0
          ? 1
          : -1;
    if (want !== u.face) {
      u.faceT += dt;
      if (u.faceT >= FACE_HOLD) {
        u.face = want;
        u.faceT = 0;
      }
    } else u.faceT = 0;
  }
}
