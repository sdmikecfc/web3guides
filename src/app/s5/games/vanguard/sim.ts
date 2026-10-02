/**
 * SEASON 5 · IRON SIEGE — VANGUARD (game key "vanguard").
 *
 * Mike, 2026-08-01, naming the reference himself: "We take The Getaway from
 * Season 4. We reskin it to make you drive a tank that can shoot only forward.
 * Enemies are trucks with mounted machine guns that shoot at you. Barricades
 * are randomly added on the streets. Still have the goal to get to the check
 * points."
 *
 * THE SHAPE. You drive the lead tank through an occupied town, hitting rally
 * points in order while machine-gun trucks converge on you. Three verbs:
 *
 *   DRIVE. Hold anywhere and the hull turns toward your finger. The throttle
 *     is automatic (a tank that can stall is a tank that dies to the UI), so
 *     steering is the whole of the driving.
 *   SHOOT. A quick tap fires the main gun STRAIGHT AHEAD. There is no turret
 *     and no aiming: to hit a thing you point the tank at it, which means
 *     every shot is a driving decision.
 *   THREAD. Alleys cut through most blocks. A truck in a straight chase will
 *     out-corner you on the main streets; the alleys are where you lose them.
 *
 * ── WHY THIS IS NOT THE S4 GAME ─────────────────────────────────────────────
 * The donor was a 70-second car chase with no death, no bounded score and rng
 * called all over its step(). Four things had to be rebuilt rather than ported:
 *
 *   1. EVERY ROLL HAPPENS AT CONSTRUCTION. The town, the rally route, the
 *      barricade roster and the entire truck schedule are decided in
 *      `createVanguard`. `stepVanguard` calls no rng at all -- same law as
 *      Breakthrough and Armor Clash. Two streams: `rng` for anything that
 *      touches the level, `rngFx` for cosmetics only.
 *   2. EVERY SCORING BODY IS BOUNDED. The donor paid for dropped patrols,
 *      near misses and shaking pursuit, all of which respawn -- an unbounded
 *      score has no legal ceiling. Here the roster is fixed: six rally points
 *      plus a final, ten trucks, eight barricades, and a time bonus with a hard
 *      cap. `ceiling()` reads those same tables.
 *   3. THE RUN CAN END. The donor had no hit points, so an idle run drove into
 *      a wall and banked. Trucks shoot, the tank has hull, and hull runs out --
 *      which is also the AFK gate: an untouched tank is a stationary target and
 *      the convoy converges on it.
 *   4. THE CAMERA IS THE SIM'S. RunShell hands the pointer through
 *      `pointerTransform`, so step() receives WORLD coordinates and never needs
 *      to know the screen.
 *
 * ── WHY THE TRUCKS TELEGRAPH ────────────────────────────────────────────────
 * A machine gun that fires the instant it sees you is not a fight, it is a
 * dice roll on where you happened to be. Each truck locks for MG_LOCK_T with a
 * visible aim line, then fires a fixed fan at where you WERE. The lock is long
 * enough to break contact and short enough to punish sitting still, and Optics
 * lengthens the warning rather than shortening the burst.
 */

// ── the shell's input, redeclared locally (sims stay import-free) ───────────
export interface SimInput {
  px: number | null;
  py: number | null;
  down: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  downKey: boolean;
  space: boolean;
}

export function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── the board ──────────────────────────────────────────────────────────────
/** The sim's logical viewport. Pinned via RunShell's worldSize: the town is far
 * bigger than the screen, so the camera follows and the view must not depend on
 * the CSS box. */
export const VIEW_W = 360;
export const VIEW_H = 480;

/** Town blocks. 5x5 rather than the donor's 7x7: a tank crosses ground more
 * slowly than a car, so the same number of blocks would make the run a commute. */
export const GW = 5;
export const GH = 5;
export const STREET_W = 88;
export const MAJOR_W = 108; // every third street is wide
export const SIDEWALK = 12;
export const ALLEY_W = 40; // the escape verb: a tank fits with ~8px a side
export const BLOCK_MIN = 210;
export const BLOCK_MAX = 330;
/** How many blocks carry an alley. High on purpose -- the alleys ARE the
 * counterplay to a truck that out-corners you. */
export const ALLEY_CHANCE = 0.55;

// ── the tank ───────────────────────────────────────────────────────────────
export const TANK_R = 12;
export const BASE_TOP = 158; // px/s
export const ACCEL = 220;
export const TURN = 1.9; // rad/s at speed
/** Velocity chases heading at this rate. Higher than the donor's car (7.0):
 * a tank is planted, and drifting a 30-tonne hull reads as ice. */
export const GRIP = 9.0;
export const PLAYER_HP = 100;
export const HIT_IFRAMES = 0.35;

// ── the gun ────────────────────────────────────────────────────────────────
export const FIRE_CD = 1.0;
export const SHELL_SPEED = 430;
export const SHELL_LIFE = 0.85; // ~365px of reach
export const SHELL_R = 4;
export const BLAST_R = 26; // against barricade segments

// ── the trucks ─────────────────────────────────────────────────────────────
export const TRUCK_COUNT = 10;
export const TRUCK_R = 15;
/** SLOWER THAN THE TANK (BASE_TOP 158). It shipped at 175, which meant a
 * truck could sit on your bumper for the whole run and no amount of driving
 * would shake it: "they get behind you and you cannot lose them" (Mike,
 * 2026-08-02). A chase you cannot break is not a chase, it is a timer. Under
 * the tank's top speed, a straight run down a long street loses them, and the
 * alleys stop being decoration. */
export const TRUCK_SPEED = 130;
/** THEY PLANT TO SHOOT. A gunner firing from a moving truck is why they were
 * unkillable with a forward-only cannon: nothing ever held still long enough to
 * be aimed at. Now the lock and the burst are a HALT, about a second of
 * stationary truck, which is the window the whole weapon design assumed
 * existed. It also makes the telegraph mean something physical. */
export const FIRE_HALT = 0.12; // fraction of top speed while locking or firing
/** They fight at a distance instead of tailgating: closer than NEAR they back
 * off, further than FAR they close, in between they hold and shoot. */
export const STANDOFF_NEAR = 120;
export const STANDOFF_FAR = 210;
export const TRUCK_TURN = 2.4;
/** One shell kills. They are a threat because there are many and they shoot,
 * never because they soak. */
export const TRUCK_HP = 1;
export const RAM_DMG = 6;
export const RAM_CD = 1.2;
/** Spawn times, fixed. The escalation dial that replaces the donor's heat: the
 * cap below only DELAYS a scheduled truck, it can never add one, so the roster
 * (and therefore the ceiling) is the same in every run. */
export const TRUCK_SCHEDULE = [5, 14, 23, 32, 41, 50, 58, 66, 74, 82] as const;
export const ACTIVE_CAP = 3;
export const ACTIVE_CAP_LATE = 4; // after rally point 3
export const CAP_STEP_CP = 3;

// ── the machine guns ───────────────────────────────────────────────────────
export const MG_RANGE = 260;
export const MG_LOCK_T = 0.55; // the visible warning
export const MG_CYCLE = 2.2;
export const MG_SHOTS = 6;
export const MG_SHOT_GAP = 0.075; // 6 rounds over ~0.45s
export const MG_SPREAD = 0.16; // radians, full width of the fixed fan
export const BULLET_SPEED = 330;
export const BULLET_LIFE = 1.6;
export const BULLET_DMG = 8;
export const BULLET_R = 3;

// ── the barricades ─────────────────────────────────────────────────────────
export const BARRICADE_COUNT = 8;
/** The first three have a gap you can thread; the rest have to be shot. */
export const BARRICADE_GAPPED = 3;
export const SEG_R = 11;
export const SEG_GAP = 20; // spacing along the line
export const BARRICADE_RAM_DMG = 5;

// ── the route ──────────────────────────────────────────────────────────────
export const CHECKPOINTS = 7; // six rally points + the final
export const CP_R = 55;

// ── scoring (every body bounded; ceiling() reads these) ────────────────────
export const CP_SCORE = 150;
export const FINAL_SCORE = 400;
export const TRUCK_SCORE = 60;
export const BREACH_SCORE = 40;
export const TIME_PER_SEC = 4;
export const TIME_BONUS_CAP = 200;
export const RUN_SECONDS = 90;

// ── stats (all ceiling-neutral: reach, survival, reaction; never a count) ──
export interface PlayerStats {
  botox: number;
  drugs: number;
  ozempic: number;
  aura: number;
  optics: number;
}
export interface VgMods {
  hp: number;
  top: number;
  turn: number;
  iframes: number;
  blast: number;
  fireCd: number;
  ramSoak: number;
  /** Extra warning before a burst. Optics buys READING TIME, never damage. */
  lockBonus: number;
}
export function vanguardMods(st: PlayerStats | null): VgMods {
  const s = st ?? { botox: 0, drugs: 0, ozempic: 0, aura: 0, optics: 0 };
  const lv = (n: number) => Math.max(0, Math.min(4, n || 0));
  const aura = Math.max(0, Math.min(30, s.aura || 0));
  return {
    hp: PLAYER_HP * (1 + 0.1 * lv(s.botox)),
    top: BASE_TOP * (1 + 0.04 * lv(s.drugs)),
    turn: TURN * (1 + 0.05 * lv(s.drugs)),
    iframes: HIT_IFRAMES * (1 + 0.12 * lv(s.ozempic)),
    blast: BLAST_R * (1 + 0.35 * (aura / 30)),
    fireCd: FIRE_CD * (1 - 0.15 * (aura / 30)),
    ramSoak: 1 - 0.08 * lv(s.botox),
    lockBonus: 0.08 * lv(s.optics),
  };
}

// ── geometry ───────────────────────────────────────────────────────────────
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Building extends Rect {
  /** Drawn tint index, cosmetic only. */
  tone: number;
}
export interface Barricade {
  segs: { x: number; y: number; dead: boolean }[];
  breached: boolean;
  /** true = built with a threadable gap. */
  gapped: boolean;
}
export interface Truck {
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  alive: boolean;
  /** -1 until it has spawned. */
  spawnT: number;
  spawned: boolean;
  /** MG state: counts up to MG_LOCK_T, then fires MG_SHOTS. */
  lockT: number;
  locked: boolean;
  aimX: number;
  aimY: number;
  shotsLeft: number;
  shotT: number;
  cycleT: number;
  /** Lattice waypoint it is currently driving to. */
  wpx: number;
  wpy: number;
  ko: number;
}
export interface Shell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  mine: boolean;
}
export interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  kind: "spark" | "smoke" | "dust";
}
export interface Float {
  x: number;
  y: number;
  t: number;
  txt: string;
  good: boolean;
}

export interface VgState {
  // world
  W: number;
  H: number;
  k: number;
  rng: () => number;
  rngFx: () => number;
  mods: VgMods;
  buildings: Building[];
  /** Street centre lines, for nav and for drawing. */
  nodeX: number[];
  nodeY: number[];
  barricades: Barricade[];
  // player
  px: number;
  py: number;
  pa: number;
  pvx: number;
  pvy: number;
  eng: number;
  hp: number;
  maxHp: number;
  iframes: number;
  fireCd: number;
  ramCd: number;
  // enemies
  trucks: Truck[];
  shells: Shell[];
  // route
  route: { x: number; y: number }[];
  cpIdx: number;
  // run
  t: number;
  raceT: number;
  score: number;
  kills: number;
  breaches: number;
  over: boolean;
  win: boolean;
  died: boolean;
  touched: boolean;
  // presentation (cosmetic only)
  camX: number;
  camY: number;
  shake: number;
  parts: Part[];
  floats: Float[];
  banner: { txt: string; sub?: string; t: number } | null;
  // input edges
  downT: number;
  downMoved: number;
  lastDown: boolean;
  wasSpace: boolean;
  dx0: number;
  dy0: number;
}

// ── helpers ────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function rectHit(x: number, y: number, r: number, b: Rect): boolean {
  const cx = clamp(x, b.x, b.x + b.w);
  const cy = clamp(y, b.y, b.y + b.h);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}
/** Does the segment a->b cross this rect? Used for line of sight. */
function segHitsRect(x0: number, y0: number, x1: number, y1: number, b: Rect): boolean {
  // Cheap and sufficient: sample the segment. The buildings are large relative
  // to the step, and a false negative only means a truck shoots when it could
  // not quite see -- never that a shot passes through a wall visibly.
  const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 14));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}
function hasLOS(s: VgState, x0: number, y0: number, x1: number, y1: number): boolean {
  for (const b of s.buildings) {
    if (segHitsRect(x0, y0, x1, y1, b)) return false;
  }
  return true;
}
function burst(s: VgState, x: number, y: number, n: number, sp: number, kind: Part["kind"], r: number) {
  for (let i = 0; i < n; i++) {
    // rngFx: cosmetics only, never the gameplay stream.
    const a = s.rngFx() * Math.PI * 2;
    const v = sp * (0.35 + s.rngFx() * 0.8);
    s.parts.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.3 + s.rngFx() * 0.5,
      r: r * (0.6 + s.rngFx() * 0.7),
      kind,
    });
  }
}
function float(s: VgState, x: number, y: number, txt: string, good = false) {
  s.floats.push({ x, y, t: 0.9, txt, good });
}

// ── construction ───────────────────────────────────────────────────────────
export function createVanguard(
  _w: number,
  _h: number,
  seed: string,
  _reduced: boolean,
  stats: PlayerStats | null,
): VgState {
  const rng = mulberry32(fnv1a("vg-" + seed));
  const rngFx = mulberry32(fnv1a("vgfx-" + seed));
  const mods = vanguardMods(stats);

  // ── ROLL 1: the town. Alternating street/block spans in both axes. ───────
  const colX: number[] = [];
  const nodeX: number[] = [];
  let x = 0;
  for (let i = 0; i < GW; i++) {
    const sw = i % 3 === 1 ? MAJOR_W : STREET_W;
    nodeX.push(x + sw / 2);
    x += sw;
    colX.push(x); // block starts here
    x += BLOCK_MIN + rng() * (BLOCK_MAX - BLOCK_MIN);
    colX.push(x); // block ends here
  }
  const swLast = MAJOR_W;
  nodeX.push(x + swLast / 2);
  x += swLast;
  const W = x;

  const rowY: number[] = [];
  const nodeY: number[] = [];
  let y = 0;
  for (let i = 0; i < GH; i++) {
    const sh = i % 3 === 1 ? MAJOR_W : STREET_W;
    nodeY.push(y + sh / 2);
    y += sh;
    rowY.push(y);
    y += BLOCK_MIN + rng() * (BLOCK_MAX - BLOCK_MIN);
    rowY.push(y);
  }
  nodeY.push(y + swLast / 2);
  y += swLast;
  const H = y;

  // Buildings, one per block, inset by the pavement, with an alley cut in
  // most of them (the alley is what makes a chase loseable).
  const buildings: Building[] = [];
  for (let i = 0; i < GW; i++) {
    for (let j = 0; j < GH; j++) {
      const bx = colX[i * 2] + SIDEWALK;
      const bx2 = colX[i * 2 + 1] - SIDEWALK;
      const by = rowY[j * 2] + SIDEWALK;
      const by2 = rowY[j * 2 + 1] - SIDEWALK;
      const bw = bx2 - bx;
      const bh = by2 - by;
      if (bw < 40 || bh < 40) continue;
      const tone = Math.floor(rng() * 4);
      if (rng() < ALLEY_CHANCE && bw > ALLEY_W * 3) {
        // vertical alley: two halves with a gap between them
        const cut = bx + ALLEY_W + rng() * (bw - ALLEY_W * 3);
        buildings.push({ x: bx, y: by, w: cut - bx, h: bh, tone });
        buildings.push({ x: cut + ALLEY_W, y: by, w: bx2 - (cut + ALLEY_W), h: bh, tone });
      } else if (rng() < ALLEY_CHANCE && bh > ALLEY_W * 3) {
        const cut = by + ALLEY_W + rng() * (bh - ALLEY_W * 3);
        buildings.push({ x: bx, y: by, w: bw, h: cut - by, tone });
        buildings.push({ x: bx, y: cut + ALLEY_W, w: bw, h: by2 - (cut + ALLEY_W), tone });
      } else {
        buildings.push({ x: bx, y: by, w: bw, h: bh, tone });
      }
    }
  }

  // ── ROLL 2: the rally route. Lattice hops, each 2-3 nodes from the last,
  // no repeats, so the run crosses the town rather than circling one block.
  const NX = nodeX.length;
  const NY = nodeY.length;
  let ci = Math.floor(rng() * NX);
  let cj = NY - 1; // start at the near edge
  const startI = ci;
  const startJ = cj;
  const used = new Set<string>([`${ci},${cj}`]);
  const route: { x: number; y: number }[] = [];
  // The route in NODE INDICES as well as pixels: the barricades below need to
  // know which streets the run actually drives down, and a pixel pair cannot
  // tell them that.
  const routeIdx: { i: number; j: number }[] = [];
  for (let n = 0; n < CHECKPOINTS; n++) {
    // PICK FROM WHAT EXISTS, do not offset and clamp. The first version rolled
    // a random offset from the current node and clamped it onto the board,
    // which on a six-node grid means most rolls land on an edge and STAY
    // there: the rendered overview showed all seven rally points in a single
    // column down the right-hand street, with four fifths of the town never
    // driven. Enumerating the legal nodes and taking one uniformly has no edge
    // bias at all, and the distance window keeps consecutive points a real
    // drive apart without letting them sit at opposite corners every time.
    const cands: { i: number; j: number }[] = [];
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NY; j++) {
        if (used.has(`${i},${j}`)) continue;
        const md = Math.abs(i - ci) + Math.abs(j - cj);
        if (md >= 2 && md <= 4) cands.push({ i, j });
      }
    }
    if (cands.length === 0) {
      for (let i = 0; i < NX; i++) {
        for (let j = 0; j < NY; j++) {
          if (!used.has(`${i},${j}`)) cands.push({ i, j });
        }
      }
    }
    if (cands.length === 0) break;
    const pick = cands[Math.floor(rng() * cands.length)];
    const bi = pick.i;
    const bj = pick.j;
    used.add(`${bi},${bj}`);
    ci = bi;
    cj = bj;
    route.push({ x: nodeX[ci], y: nodeY[cj] });
    routeIdx.push({ i: ci, j: cj });
  }

  // ── ROLL 3: the barricades. One per STREET SEGMENT of the route, laid
  // across the street, never on a crossroads and never two on one segment.
  //
  // The path first: a route leg hops two or three nodes diagonally, and the
  // straight line between its ends is not a street. Walking it one node at a
  // time (i first, then j, the way a truck drives it) turns the route into a
  // list of unit EDGES, each of which is exactly one block of one street.
  const edges: { ai: number; aj: number; bi: number; bj: number }[] = [];
  {
    // UNIQUE BY SEGMENT, not by step. A route that doubles back drives the same
    // block of street twice, and taking the list by index let two barricades
    // land on the same segment three pixels apart: distinct entries, identical
    // ground. The key is the unordered node pair, so a street walked north and
    // then south is one segment either way.
    const seenEdge = new Set<string>();
    let pi = startI;
    let pj = startJ;
    const add = (ai: number, aj: number, bi: number, bj: number) => {
      const k =
        ai < bi || aj < bj ? `${ai},${aj}|${bi},${bj}` : `${bi},${bj}|${ai},${aj}`;
      if (seenEdge.has(k)) return;
      seenEdge.add(k);
      edges.push({ ai, aj, bi, bj });
    };
    for (const nd of routeIdx) {
      while (pi !== nd.i) {
        const ni = pi + Math.sign(nd.i - pi);
        add(pi, pj, ni, pj);
        pi = ni;
      }
      while (pj !== nd.j) {
        const nj = pj + Math.sign(nd.j - pj);
        add(pi, pj, pi, nj);
        pj = nj;
      }
    }
  }
  const barricades: Barricade[] = [];
  const takenEdge = new Set<number>();
  for (let n = 0; n < BARRICADE_COUNT && edges.length > 0; n++) {
    // Spread along the whole drive, then a small rolled jitter so two seeds do
    // not put their walls in the same places. Distinct edges, always: that is
    // what makes double-layering impossible rather than unlikely.
    const want = Math.floor(((n + 0.5) * edges.length) / BARRICADE_COUNT);
    const jitter = Math.floor(rng() * 3) - 1;
    let idx = clamp(want + jitter, 0, edges.length - 1);
    for (let probe = 0; probe < edges.length && takenEdge.has(idx); probe++) {
      idx = (idx + 1) % edges.length;
    }
    if (takenEdge.has(idx)) break;
    takenEdge.add(idx);

    const e = edges[idx];
    // The MIDPOINT of the segment. A node is a junction; halfway between two
    // nodes is the middle of a block of street, which is where a roadblock
    // belongs and where it cannot swallow a turn.
    const ax = nodeX[e.ai];
    const ay = nodeY[e.aj];
    const bx = nodeX[e.bi];
    const by = nodeY[e.bj];
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    // Runs ACROSS the street it is on: a wall on a north-south street lies
    // east-west. The old code guessed this from a diagonal and got it wrong
    // half the time.
    const alongX = e.ai !== e.bi;
    // Wide enough to close the street it crosses, plus a segment of overlap
    // into the pavement so there is never a sliver to squeeze through.
    const streetW = (alongX ? e.aj : e.ai) % 3 === 1 ? MAJOR_W : STREET_W;
    const half = Math.floor(streetW / SEG_GAP / 2) + 1;
    const gapped = n < BARRICADE_GAPPED;
    const gapAt = gapped ? (rng() < 0.5 ? -1 : 1) * Math.max(1, Math.floor(rng() * half)) : 999;
    const segs: { x: number; y: number; dead: boolean }[] = [];
    for (let i = -half; i <= half; i++) {
      if (i === gapAt) continue;
      const sx2 = alongX ? cx : cx + i * SEG_GAP;
      const sy2 = alongX ? cy + i * SEG_GAP : cy;
      // The wall is deliberately built a segment wider than the street so
      // there can never be a sliver to squeeze through at its ends -- but a
      // segment that lands INSIDE a building is a concrete block embedded in a
      // wall, which looks like a bug and is redundant anyway, because the
      // building is already solid. Drop those; the street stays closed.
      if (buildings.some((bd) => sx2 > bd.x && sx2 < bd.x + bd.w && sy2 > bd.y && sy2 < bd.y + bd.h)) {
        continue;
      }
      segs.push({ x: sx2, y: sy2, dead: false });
    }
    if (segs.length === 0) continue;
    barricades.push({ segs, breached: false, gapped });
  }

  // ── ROLL 4: the truck roster. Times are FIXED (the schedule constant);
  // only their entry corners are rolled, and only at construction.
  const trucks: Truck[] = [];
  for (let i = 0; i < TRUCK_COUNT; i++) {
    const edge = Math.floor(rng() * 4);
    const nx = nodeX[Math.floor(rng() * NX)];
    const ny = nodeY[Math.floor(rng() * NY)];
    const sx = edge === 0 ? nodeX[0] : edge === 1 ? nodeX[NX - 1] : nx;
    const sy = edge === 2 ? nodeY[0] : edge === 3 ? nodeY[NY - 1] : ny;
    trucks.push({
      x: sx,
      y: sy,
      a: 0,
      vx: 0,
      vy: 0,
      alive: true,
      spawnT: TRUCK_SCHEDULE[i],
      spawned: false,
      lockT: 0,
      locked: false,
      aimX: 0,
      aimY: 0,
      shotsLeft: 0,
      shotT: 0,
      cycleT: 0,
      wpx: sx,
      wpy: sy,
      ko: 0,
    });
  }

  const startX = nodeX[Math.floor(NX / 2)];
  const startY = nodeY[NY - 1];

  const s: VgState = {
    W,
    H,
    k: 1,
    rng,
    rngFx,
    mods,
    buildings,
    nodeX,
    nodeY,
    barricades,
    px: startX,
    py: startY,
    pa: -Math.PI / 2, // pointing up the board, into the town
    pvx: 0,
    pvy: 0,
    eng: 0,
    hp: mods.hp,
    maxHp: mods.hp,
    iframes: 0,
    fireCd: 0,
    ramCd: 0,
    trucks,
    shells: [],
    route,
    cpIdx: 0,
    t: 0,
    raceT: 0,
    score: 0,
    kills: 0,
    breaches: 0,
    over: false,
    win: false,
    died: false,
    touched: false,
    camX: 0,
    camY: 0,
    shake: 0,
    parts: [],
    floats: [],
    banner: { txt: "MOVE OUT", sub: "Rally point one", t: 1.6 },
    downT: 0,
    downMoved: 0,
    lastDown: false,
    wasSpace: false,
    dx0: 0,
    dy0: 0,
  };
  return s;
}

// ── collision ──────────────────────────────────────────────────────────────
/** Move a circle, sliding along whatever it hits rather than stopping dead.
 * A tank that halts on contact reads as broken; one that scrapes along a wall
 * reads as heavy. */
function moveSliding(s: VgState, x: number, y: number, r: number, nx: number, ny: number): { x: number; y: number } {
  let outX = nx;
  let outY = ny;
  for (const b of s.buildings) {
    if (rectHit(outX, outY, r, b)) {
      // try each axis alone: whichever is legal is the slide
      if (!rectHit(outX, y, r, b)) outY = y;
      else if (!rectHit(x, outY, r, b)) outX = x;
      else {
        outX = x;
        outY = y;
      }
    }
  }
  return { x: clamp(outX, r, s.W - r), y: clamp(outY, r, s.H - r) };
}

function damagePlayer(s: VgState, dmg: number) {
  if (s.iframes > 0 || s.over) return;
  s.hp -= dmg;
  s.iframes = s.mods.iframes;
  s.shake = Math.max(s.shake, 7);
  if (s.hp <= 0) {
    s.hp = 0;
    s.over = true;
    s.died = true;
    s.win = false;
    s.banner = { txt: "HULL BREACHED", sub: "The column stalls.", t: 2.2 };
    burst(s, s.px, s.py, 26, 240, "spark", 3);
  }
}

function killTruck(s: VgState, tk: Truck) {
  if (!tk.alive) return;
  tk.alive = false;
  tk.ko = 0.5;
  s.kills++;
  s.score += TRUCK_SCORE;
  float(s, tk.x, tk.y, `+${TRUCK_SCORE}`, true);
  burst(s, tk.x, tk.y, 18, 220, "spark", 2.6);
  burst(s, tk.x, tk.y, 8, 60, "smoke", 6);
  s.shake = Math.max(s.shake, 6);
}

// ── the step ───────────────────────────────────────────────────────────────
export function stepVanguard(s: VgState, dt: number, input: SimInput): void {
  // cosmetics run even when the run is over, so the death frame has weight
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 24);
  for (const p of s.parts) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 2.4;
    p.vy *= 1 - dt * 2.4;
  }
  s.parts = s.parts.filter((p) => p.life > 0);
  for (const f of s.floats) {
    f.t -= dt;
    f.y -= dt * 26;
  }
  s.floats = s.floats.filter((f) => f.t > 0);
  if (s.banner) {
    s.banner.t -= dt;
    if (s.banner.t <= 0) s.banner = null;
  }
  if (s.over) return;

  s.t += dt;
  s.raceT += dt;
  if (s.iframes > 0) s.iframes = Math.max(0, s.iframes - dt);
  if (s.fireCd > 0) s.fireCd = Math.max(0, s.fireCd - dt);
  if (s.ramCd > 0) s.ramCd = Math.max(0, s.ramCd - dt);

  // ── the clock ────────────────────────────────────────────────────────────
  if (s.raceT >= RUN_SECONDS) {
    s.over = true;
    s.win = false;
    s.banner = { txt: "OUT OF TIME", sub: "The advance stalls short.", t: 2.2 };
    return;
  }

  // ── input ────────────────────────────────────────────────────────────────
  const down = input.down;
  const px = input.px;
  const py = input.py;
  if (down && !s.lastDown) {
    s.downT = 0;
    s.downMoved = 0;
    s.dx0 = px ?? 0;
    s.dy0 = py ?? 0;
  }
  if (down) {
    s.downT += dt;
    if (px != null && py != null) {
      s.downMoved = Math.max(s.downMoved, Math.hypot(px - s.dx0, py - s.dy0));
    }
    s.touched = true;
  }
  const released = !down && s.lastDown;
  const spaceEdge = input.space && !s.wasSpace;
  if (input.left || input.right || input.space) s.touched = true;
  s.lastDown = down;
  s.wasSpace = input.space;

  // A QUICK TAP IS THE TRIGGER, a hold is the wheel. Same gesture split the
  // donor used, and the reason there is no separate fire button to miss.
  const tapFire = released && s.downT < 0.28 && s.downMoved < 14;
  if ((tapFire || spaceEdge) && s.fireCd <= 0) {
    s.fireCd = s.mods.fireCd;
    const mx = Math.cos(s.pa);
    const my = Math.sin(s.pa);
    s.shells.push({
      x: s.px + mx * (TANK_R + 6),
      y: s.py + my * (TANK_R + 6),
      vx: mx * SHELL_SPEED,
      vy: my * SHELL_SPEED,
      life: SHELL_LIFE,
      mine: true,
    });
    burst(s, s.px + mx * TANK_R, s.py + my * TANK_R, 5, 120, "spark", 2);
    s.shake = Math.max(s.shake, 3);
  }

  // ── driving ──────────────────────────────────────────────────────────────
  // Throttle is automatic; steering is everything.
  let steer = 0;
  if (input.left) steer -= 1;
  if (input.right) steer += 1;
  if (down && px != null && py != null && !tapFire) {
    const want = Math.atan2(py - s.py, px - s.px);
    steer = clamp(wrapPi(want - s.pa) / 0.5, -1, 1);
  }
  s.eng = Math.min(s.mods.top, s.eng + ACCEL * dt);
  const turnRate = s.mods.turn * (0.6 + 0.4 * Math.min(1, s.eng / s.mods.top));
  s.pa = wrapPi(s.pa + steer * turnRate * dt);
  // velocity lags heading: the hull has mass
  const wantVx = Math.cos(s.pa) * s.eng;
  const wantVy = Math.sin(s.pa) * s.eng;
  const g = Math.min(1, GRIP * dt);
  s.pvx += (wantVx - s.pvx) * g;
  s.pvy += (wantVy - s.pvy) * g;
  {
    const np = moveSliding(s, s.px, s.py, TANK_R, s.px + s.pvx * dt, s.py + s.pvy * dt);
    if (np.x === s.px && np.y === s.py) s.eng *= 0.7; // ploughed a wall
    s.px = np.x;
    s.py = np.y;
  }

  // ── the camera (sim-owned so pointerTransform is an exact translation) ───
  {
    const leadX = s.px + s.pvx * 0.35 - VIEW_W / 2;
    const leadY = s.py + s.pvy * 0.35 - VIEW_H / 2;
    s.camX += (clamp(leadX, 0, Math.max(0, s.W - VIEW_W)) - s.camX) * Math.min(1, dt * 4.5);
    s.camY += (clamp(leadY, 0, Math.max(0, s.H - VIEW_H)) - s.camY) * Math.min(1, dt * 4.5);
  }

  // ── barricades: ram cost, and the shell breach ───────────────────────────
  for (const bar of s.barricades) {
    for (const sg of bar.segs) {
      if (sg.dead) continue;
      if (Math.hypot(sg.x - s.px, sg.y - s.py) < SEG_R + TANK_R) {
        // shoving concrete costs speed and paint
        s.eng *= 0.55;
        if (s.ramCd <= 0) {
          s.ramCd = RAM_CD;
          damagePlayer(s, BARRICADE_RAM_DMG);
        }
        const a = Math.atan2(s.py - sg.y, s.px - sg.x);
        s.px += Math.cos(a) * 2.2;
        s.py += Math.sin(a) * 2.2;
      }
    }
  }

  // ── shells ───────────────────────────────────────────────────────────────
  for (const sh of s.shells) {
    if (sh.life <= 0) continue;
    sh.life -= dt;
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    if (sh.x < 0 || sh.y < 0 || sh.x > s.W || sh.y > s.H) {
      sh.life = 0;
      continue;
    }
    for (const b of s.buildings) {
      if (rectHit(sh.x, sh.y, SHELL_R, b)) {
        sh.life = 0;
        burst(s, sh.x, sh.y, 6, 90, "dust", 2.4);
        break;
      }
    }
    if (sh.life <= 0) continue;
    // trucks
    for (const tk of s.trucks) {
      if (!tk.alive || !tk.spawned) continue;
      if (Math.hypot(tk.x - sh.x, tk.y - sh.y) < TRUCK_R + SHELL_R) {
        sh.life = 0;
        killTruck(s, tk);
        break;
      }
    }
    if (sh.life <= 0) continue;
    // barricade segments, with blast
    for (const bar of s.barricades) {
      let hitAny = false;
      for (const sg of bar.segs) {
        if (sg.dead) continue;
        if (Math.hypot(sg.x - sh.x, sg.y - sh.y) < SEG_R + SHELL_R) {
          hitAny = true;
          break;
        }
      }
      if (!hitAny) continue;
      sh.life = 0;
      for (const sg of bar.segs) {
        if (sg.dead) continue;
        if (Math.hypot(sg.x - sh.x, sg.y - sh.y) < s.mods.blast) sg.dead = true;
      }
      burst(s, sh.x, sh.y, 14, 180, "dust", 3);
      s.shake = Math.max(s.shake, 5);
      if (!bar.breached) {
        bar.breached = true;
        s.breaches++;
        s.score += BREACH_SCORE;
        float(s, sh.x, sh.y, `BREACH +${BREACH_SCORE}`, true);
      }
      break;
    }
  }
  s.shells = s.shells.filter((sh) => sh.life > 0);

  // ── trucks ───────────────────────────────────────────────────────────────
  let active = 0;
  for (const tk of s.trucks) if (tk.spawned && tk.alive) active++;
  const cap = s.cpIdx >= CAP_STEP_CP ? ACTIVE_CAP_LATE : ACTIVE_CAP;
  for (const tk of s.trucks) {
    if (tk.ko > 0) tk.ko = Math.max(0, tk.ko - dt);
    if (!tk.alive) continue;
    if (!tk.spawned) {
      // The cap DELAYS, never cancels: the roster is fixed, so the ceiling is.
      if (s.raceT >= tk.spawnT && active < cap) {
        tk.spawned = true;
        active++;
      }
      continue;
    }

    // ── NAVIGATION: one lattice step at a time, along the streets ──────────
    // The first version picked the best node anywhere within 320px, which let
    // a truck aim diagonally THROUGH a block, jam against the wall and sit
    // there for the whole run -- which in turn meant nothing ever shot an idle
    // tank and the AFK gate did not bite. Streets are a grid, so movement is a
    // grid walk: from the node it is standing on, step to the neighbour (up,
    // down, left or right) that gets closest to the player. That path always
    // exists and never crosses a building.
    const dxp = s.px - tk.x;
    const dyp = s.py - tk.y;
    const dist = Math.hypot(dxp, dyp) || 1;
    if (Math.hypot(tk.wpx - tk.x, tk.wpy - tk.y) < 30) {
      let ni = 0;
      let nj = 0;
      let bdi = Infinity;
      let bdj = Infinity;
      for (let i = 0; i < s.nodeX.length; i++) {
        const d = Math.abs(s.nodeX[i] - tk.x);
        if (d < bdi) {
          bdi = d;
          ni = i;
        }
      }
      for (let j = 0; j < s.nodeY.length; j++) {
        const d = Math.abs(s.nodeY[j] - tk.y);
        if (d < bdj) {
          bdj = d;
          nj = j;
        }
      }
      const cands: { x: number; y: number }[] = [];
      if (ni > 0) cands.push({ x: s.nodeX[ni - 1], y: s.nodeY[nj] });
      if (ni < s.nodeX.length - 1) cands.push({ x: s.nodeX[ni + 1], y: s.nodeY[nj] });
      if (nj > 0) cands.push({ x: s.nodeX[ni], y: s.nodeY[nj - 1] });
      if (nj < s.nodeY.length - 1) cands.push({ x: s.nodeX[ni], y: s.nodeY[nj + 1] });
      // standing on the node itself is also legal when it is already the best
      cands.push({ x: s.nodeX[ni], y: s.nodeY[nj] });
      let best = cands[0];
      let bd = Infinity;
      for (const c of cands) {
        const d = Math.hypot(c.x - s.px, c.y - s.py);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      tk.wpx = best.x;
      tk.wpy = best.y;
    }
    // if the player is close and visible, just charge them
    const seen = dist < MG_RANGE * 1.4 && hasLOS(s, tk.x, tk.y, s.px, s.py);
    const tgx = seen ? s.px : tk.wpx;
    const tgy = seen ? s.py : tk.wpy;
    const wantA = Math.atan2(tgy - tk.y, tgx - tk.x);
    tk.a = wrapPi(tk.a + clamp(wrapPi(wantA - tk.a), -TRUCK_TURN * dt, TRUCK_TURN * dt));
    // SPEED IS THE WHOLE FIGHT. Planted while the gun is working, closing
    // when too far, backing off when you are on top of them, holding the band
    // otherwise. The old rule (always full speed, 60% when very close) is what
    // glued them to the back of the hull.
    const working = tk.locked || tk.shotsLeft > 0;
    const spd = working
      ? TRUCK_SPEED * FIRE_HALT
      : !seen
        ? TRUCK_SPEED
        : dist > STANDOFF_FAR
          ? TRUCK_SPEED
          : dist < STANDOFF_NEAR
            ? -TRUCK_SPEED * 0.5
            : TRUCK_SPEED * 0.25;
    tk.vx = Math.cos(tk.a) * spd;
    tk.vy = Math.sin(tk.a) * spd;
    {
      const np = moveSliding(s, tk.x, tk.y, TRUCK_R, tk.x + tk.vx * dt, tk.y + tk.vy * dt);
      tk.x = np.x;
      tk.y = np.y;
    }

    // ram
    if (dist < TRUCK_R + TANK_R && s.ramCd <= 0) {
      s.ramCd = RAM_CD;
      damagePlayer(s, Math.round(RAM_DMG * s.mods.ramSoak));
      const a = Math.atan2(s.py - tk.y, s.px - tk.x);
      s.pvx += Math.cos(a) * 90;
      s.pvy += Math.sin(a) * 90;
    }

    // ── the machine gun ────────────────────────────────────────────────────
    if (tk.shotsLeft > 0) {
      tk.shotT -= dt;
      if (tk.shotT <= 0) {
        tk.shotT = MG_SHOT_GAP;
        const i = MG_SHOTS - tk.shotsLeft;
        // A FIXED FAN at the aim point frozen when the lock completed. No rng:
        // the spread is a function of the shot index, so the same burst is the
        // same burst on every replay, and it is dodgeable by moving off the
        // line rather than by luck.
        const spread = (i / (MG_SHOTS - 1) - 0.5) * MG_SPREAD;
        const a = Math.atan2(tk.aimY - tk.y, tk.aimX - tk.x) + spread;
        s.shells.push({
          x: tk.x + Math.cos(a) * TRUCK_R,
          y: tk.y + Math.sin(a) * TRUCK_R,
          vx: Math.cos(a) * BULLET_SPEED,
          vy: Math.sin(a) * BULLET_SPEED,
          life: BULLET_LIFE,
          mine: false,
        });
        tk.shotsLeft--;
      }
    } else if (tk.locked) {
      tk.lockT += dt;
      if (tk.lockT >= MG_LOCK_T + s.mods.lockBonus) {
        tk.locked = false;
        tk.lockT = 0;
        tk.shotsLeft = MG_SHOTS;
        tk.shotT = 0;
        tk.aimX = s.px;
        tk.aimY = s.py;
      }
    } else {
      tk.cycleT -= dt;
      if (tk.cycleT <= 0 && dist < MG_RANGE && hasLOS(s, tk.x, tk.y, s.px, s.py)) {
        tk.locked = true;
        tk.lockT = 0;
        tk.cycleT = MG_CYCLE;
      }
    }
  }

  // ── enemy bullets against the player ─────────────────────────────────────
  for (const sh of s.shells) {
    if (sh.mine || sh.life <= 0) continue;
    if (Math.hypot(sh.x - s.px, sh.y - s.py) < BULLET_R + TANK_R) {
      sh.life = 0;
      damagePlayer(s, BULLET_DMG);
      burst(s, sh.x, sh.y, 6, 120, "spark", 2);
    }
  }
  s.shells = s.shells.filter((sh) => sh.life > 0);

  // ── the rally points ─────────────────────────────────────────────────────
  const cp = s.route[s.cpIdx];
  if (cp && Math.hypot(cp.x - s.px, cp.y - s.py) < CP_R) {
    const last = s.cpIdx >= s.route.length - 1;
    s.cpIdx++;
    if (last) {
      // THE RUN'S ONLY WIN. Time left pays, hard-capped so a fast route can
      // never unbound the ceiling.
      const bonus = Math.min(TIME_BONUS_CAP, Math.ceil(Math.max(0, RUN_SECONDS - s.raceT)) * TIME_PER_SEC);
      s.score += FINAL_SCORE + bonus;
      s.over = true;
      s.win = true;
      float(s, s.px, s.py, `LINKED UP +${FINAL_SCORE}`, true);
      s.banner = { txt: "THE COLUMN IS THROUGH", sub: `+${bonus} time`, t: 2.4 };
      burst(s, s.px, s.py, 30, 260, "spark", 3);
    } else {
      s.score += CP_SCORE;
      float(s, s.px, s.py, `RALLY +${CP_SCORE}`, true);
      s.banner = { txt: `RALLY ${s.cpIdx} OF ${s.route.length - 1}`, t: 1.1 };
      s.shake = Math.max(s.shake, 4);
    }
  }
}

// ── the shell's contract ───────────────────────────────────────────────────
export function vanguardDone(s: VgState): boolean {
  return s.over;
}
export function vanguardScore(s: VgState): number {
  return Math.round(s.score);
}

/**
 * THE CEILING. Every term is a fixed count times a fixed value, read from the
 * same constants the run is built from -- which is the whole reason the donor's
 * scoring had to be rebuilt (patrols, near misses and shaking pursuit all
 * respawned, so no upper bound existed).
 */
export function ceiling(): {
  rallies: number;
  final: number;
  trucks: number;
  breaches: number;
  time: number;
  total: number;
} {
  const rallies = (CHECKPOINTS - 1) * CP_SCORE;
  const final = FINAL_SCORE;
  const trucks = TRUCK_COUNT * TRUCK_SCORE;
  const breaches = BARRICADE_COUNT * BREACH_SCORE;
  const time = TIME_BONUS_CAP;
  return { rallies, final, trucks, breaches, time, total: rallies + final + trucks + breaches + time };
}

// ── share ──────────────────────────────────────────────────────────────────
export function gridEmoji(s: VgState): string {
  const out: string[] = [];
  for (let i = 0; i < CHECKPOINTS; i++) {
    if (i < s.cpIdx) out.push("🟩");
    else if (i === s.cpIdx && s.over && !s.win) out.push("🟥");
    else out.push("⬜");
  }
  return out.join("");
}
export function sharePayload(dayKey: string, score: number, grid: string): string {
  return `VANGUARD ${dayKey.slice(5)} · ${score.toLocaleString("en-US")}\n${grid}\ntanks.web3guides.com`;
}
