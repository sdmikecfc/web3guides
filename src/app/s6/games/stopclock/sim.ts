/**
 * STOPCLOCK - the S6 SUPERHOT remake, top-down. Time moves only when you
 * move; every bullet is visible and dodgeable; the basic shot is UNLIMITED
 * and priced in TIME; rockets are the scarce heavy hit; barriers block shots
 * both ways; pistol bots lead their aim.
 *
 * PURE AND HEADLESS (kit §4): no Math.random, no Date, no in-run rng at
 * all - authored rooms (rooms.ts, design space 460x600), deterministic AI,
 * and the daily seed only selects the room set.
 *
 * THE TIME RULE, in sim terms: every wall frame steps the sim by
 * dt x timeScale. Holding to move (pointer or WASD/arrows) = 1.0. Still =
 * FREEZE_TS (0.04). Firing forces 1.0 for a surge - a shot COSTS time,
 * SUPERHOT's own law, and that surge (plus a short wall-clock cooldown) is
 * the whole price of the now-unlimited basic shot. Room transitions run on
 * the WALL clock (s.transT -= dt), never the frozen sim clock - the old
 * frozen-clock decrement made the 1s beat take ~10 real seconds of dead
 * air after the last kill. THE WARDEN'S PATIENCE closes the AFK hole:
 * after patienceF wall frames of zero input the freeze leaks toward 1.0.
 *
 * VERBS (tape carries px/py/down/space; keys ride the shell's held booleans):
 *   hold (pointer or move keys) = move (time flows)
 *   tap / Space tap             = one aimed basic shot (unlimited, costs a
 *                                 time surge + cooldown; Space with no
 *                                 pointer aims at the nearest live machine)
 *   still press held / Space held = ROCKET: double damage + a small AoE
 *                                 that can clip two machines; capacity-
 *                                 limited, rocketeers drop refills
 *   touch a shooter             = PUNCH: zero-resource scrap (rushers stay
 *                                 lethal to touch)
 *
 * THE THREE ATTACK GRAMMARS (rooms.ts): pistols snap FAST led bullets;
 * rocketeers LOB ARCING BOMBS over cover at the spot you were standing when
 * they fired, at a FIXED speed below your walk speed (they persist and crawl
 * while time is frozen - walking away from one is the dodge fantasy; laps
 * tighten their cadence, never their speed); rushers charge to melee AND KEEP
 * COMING on a timer, so no corner is ever solved.
 *
 * THE ARC (2026-08-15, Mike: "the bomb throwing ones should shoot over walls
 * making it more challenging"). An arcing bomb is the ONE projectile in the
 * game that barriers do not eat, and it pays for that three ways: it is
 * contact-only (no splash - the splash block lives inside the `if (b.mine)`
 * branch and stays there), it dies at the aim point it was fired at rather
 * than flying its whole life, and the impact point is drawn on the floor from
 * the moment it launches. Walking off the mark still beats it; standing
 * behind a wall no longer does. `arc` is its OWN flag on purpose: the
 * PLAYER's rocket is `mine && rocket` and must stay blocked by cover.
 *
 * THE WAVES (same session, Mike: "the triangle guys keep coming as time
 * passes (time moving), making it so you don't just snipe the towers from a
 * corner"). Rusher waves ride SIM time, which is exactly "time moving": a
 * camper who never moves never advances the clock, and the Warden's patience
 * closes that hole from the other side. Entry points are hand-authored per
 * room (rooms.ts waveSpawns) and the sim SELECTS among them by distance -
 * farthest from the player wins - so the law that the seed never designs
 * holds for waves too.
 *
 * FAIRNESS (same session, "just make sure the enemies don't spawn 2 pixels
 * away from you"). Two floors, both asserted by validateSets, both imported
 * from rooms.ts rather than restated here: MIN_SPAWN_DIST on every authored
 * spawn against the player's own spawn, WAVE_MIN_DIST on a wave entry against
 * where the player is standing right now. Plus ENTRY_GRACE: a room opens with
 * real iframes, so a deep-lap rusher can no longer touch you dead before the
 * first frame you could have reacted on.
 *
 * SCORES NEVER CAP (ADR-0120): rooms cycle the authored set with the lap
 * escalation tightening fire cadence, bullet speed and rusher speed AND
 * adding one authored-spawn rocketeer per lap (cap 4, equal across sets)
 * until you are shot. VALIDITY is rate-bound via rate(); the registry
 * maxScore is only a far-off sanity clamp.
 *
 * THE STRAFE (2026-08-17, Mike on the deployed build: "when you repeat the
 * maps (level 4 I think) the shooters need a bit of movement but not directly
 * at the player but making them harder to shoot"). A repeated room was a
 * memory test: every turret stood on the same pixel it stood on last lap, so
 * a pilot who had seen the room once pre-aimed at remembered coordinates and
 * the fight was over before it started. From the FIRST REPEAT LAP on, every
 * shooter slides along its hand-authored lane (rooms.ts). Three laws hold it
 * to exactly what Mike asked for and no more:
 *
 *   NOT AT THE PLAYER. The lane axis is authored, LATERAL (validateSets
 *   proves it is >= LANE_LATERAL_DEG off the post -> spawn line), and the
 *   step direction NEVER reads the player's position: delete the pilot and
 *   the machines strafe identically. The player enters the rule once, as a
 *   keep-out - a step that would CLOSE the gap while inside STRAFE_KEEP is
 *   refused and the machine turns around. Closing distance is the rusher's
 *   whole identity and it stays the rusher's.
 *
 *   ZERO ON THE FIRST PASS. strafeAmp() is 0 at lap 0, so rooms 1-3 play
 *   exactly as they shipped. Amplitude then opens from STRAFE_AMP_BASE of
 *   the authored lane toward all of it, and the pace steps up with it, on
 *   the same lap ladder the cadence/bullet/rusher schedules already ride.
 *
 *   ON THE SIM CLOCK. The step is sdt-driven like everything else, so a
 *   frozen world is a frozen machine. That is the whole promise of the game
 *   and a strafe on the wall clock would have broken it outright.
 *
 * The sidestep-after-firing beat is the same direction flip, fired by the
 * shot itself: a machine that has just shot at you is already moving off the
 * spot it shot from. All of it is pure - authored lane, fixed iteration
 * order, no rng, no Date.
 *
 * STATS (ceiling-neutral, ADR-0070) - THE MAPPING:
 *   Plating (botox 0-4):  +1 hit survivable per 2 levels (1 base, 3 maxed)
 *   Reactor (drugs 0-4):  +8% move speed per level - your time runs faster
 *                         than theirs while you move
 *   Cloak  (ozempic 0-4): +1s of the Warden's patience per level (longer
 *                         freeze grace before the idle leak)
 *   Payload (aura 0-30):  +1 rocket capacity at 15+, and a bigger rocket AoE
 *   Sensors (optics 0-4): +0.08s enemy muzzle telegraph per level (a real
 *                         dodge window before the bullet exists)
 */

import {
  ROOM_SETS,
  roomSetForSeed,
  KILL_PTS,
  CLEAR_PTS,
  DESIGN_W,
  WAVE_MIN_DIST,
  type RoomSet,
  type RoomDef,
  type EnemyKind,
} from "./rooms";

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

export interface Stats {
  botox: number;
  drugs: number;
  ozempic: number;
  aura: number;
  optics: number;
}

export function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── scoring ─────────────────────────────────────────────────────────────────
/** Anti-hang backstop only (SIM seconds): the escalation kills every real
 * run long before this. Never a score-shaving clock (ADR-0120). */
export const MISSION_T = 3600;
// ── the lap escalation (authored schedules, deterministic in room index) ────
const LAP_CD_DECAY = 0.88; // enemy fire cadence tightens hard per lap...
const LAP_CD_FLOOR = 0.25; // ...to a floor
const LAP_BULLET_STEP = 0.09; // pistol bullets fly faster per lap
const LAP_BULLET_CAP = 2.5;
const LAP_RUSHER_STEP = 0.07; // rushers close faster per lap
const LAP_RUSHER_CAP = 3.0;
/** THE STRAFE LADDER. Lap 0 (the authored three) is ZERO by construction, so
 * a first pass through a room is byte-for-byte the game that shipped; the
 * first REPEAT lap already opens most of the authored lane, because "level 4"
 * is exactly the lap Mike was calling out. */
const STRAFE_AMP_BASE = 0.7; // share of the authored lane open at lap 1
const STRAFE_AMP_STEP = 0.1; // ...growing per lap...
const STRAFE_AMP_CAP = 1.0; // ...to the whole lane at lap 4
const STRAFE_SPEED = 40; // design px/s at lap 1 (a saunter: BASE_SPEED is 150)
const LAP_STRAFE_SPEED_STEP = 0.16;
const LAP_STRAFE_SPEED_CAP = 2.0;
/** Clear bonus past the authored three: plateaus so the RATE stays bounded
 * while the total does not. */
const DEEP_CLEAR_BASE = 170;
const DEEP_CLEAR_STEP = 15;
const DEEP_CLEAR_CAP = 400;

function lap(s: StopclockState): number {
  // "lap" in the escalation sense: every room past the authored three steps
  // the schedules once more (the S6 original's semantics, kept on purpose -
  // the steeper constants above were tuned against it)
  return Math.max(0, s.room - 2);
}
function cdMul(s: StopclockState): number {
  return Math.max(LAP_CD_FLOOR, Math.pow(LAP_CD_DECAY, lap(s)));
}
function bulletMul(s: StopclockState): number {
  return Math.min(LAP_BULLET_CAP, 1 + LAP_BULLET_STEP * lap(s));
}
function rusherMul(s: StopclockState): number {
  return Math.min(LAP_RUSHER_CAP, 1 + LAP_RUSHER_STEP * lap(s));
}
/** Share of a shooter's authored lane that is open this lap. ZERO on the
 * first pass: rooms 1-3 are the game that shipped. */
function strafeAmp(s: StopclockState): number {
  const l = lap(s);
  if (l <= 0) return 0;
  return Math.min(STRAFE_AMP_CAP, STRAFE_AMP_BASE + STRAFE_AMP_STEP * (l - 1));
}
/** Sim px/s a shooter walks its lane at this lap (0 on the first pass). */
function strafeSpeed(s: StopclockState): number {
  const l = lap(s);
  if (l <= 0) return 0;
  return STRAFE_SPEED * Math.min(LAP_STRAFE_SPEED_CAP, 1 + LAP_STRAFE_SPEED_STEP * (l - 1)) * s.k;
}

// ── time constants ──────────────────────────────────────────────────────────
const FREEZE_TS = 0.04;
const SHOT_SURGE_F = 26; // wall frames of forced full time per basic shot
const ROCKET_SURGE_F = 32; // a rocket costs more time than a shot
export const PATIENCE_F = 480; // 8s wall of zero input before the freeze leaks (base; Cloak extends)
const PATIENCE_RAMP_F = 240; // leak reaches full time over 4 more seconds

// ── fight constants (design px at 460x600) ──────────────────────────────────
const BASE_SPEED = 150; // sim px/s at design scale
const PLAYER_R = 11;
const BULLET_SPEED = 380; // player basic shot
const ROCKET_SPEED = 240; // player rocket (slower, hits harder)
const ENEMY_BULLET_SPEED = 300; // pistol bots: FAST bullets
const ENEMY_ROCKET_SPEED = 120; // rocketeers: FIXED, below BASE_SPEED - always outwalkable
const SHOT_RANGE_T = 2.2; // s of player projectile life
/** Backstop only: an arc dies at its aim point long before this. Sized past
 * the room diagonal (756 design px / 120 px/s = 6.3s) so a cross-room lob
 * still lands instead of evaporating mid-air. */
const ENEMY_ROCKET_LIFE = 8.0; // bombs persist and crawl while frozen
const PISTOL_CD = 2.3; // s between pistol shots
const ROCKETEER_CD = 4.0;
const RUSHER_SPEED = 165;
const ENEMY_R = 13;
const HIT_IFRAMES = 0.5; // sim s
export const TRANSITION_T = 1.4; // WALL seconds between rooms (the clear beat)
const FIRE_CD_F = 30; // wall frames between basic shots (the other half of the price)
const ROCKET_DMG = 2; // double damage
const ROCKET_CAP_BASE = 2;
const START_ROCKETS = 1;
const ROCKET_HOLD_F = 20; // Space held this long = rocket
const POINTER_ROCKET_MIN_F = 22; // a STILL press held this long = rocket on release
/** A press this short that barely moved is a TAP: an aimed basic shot. */
const TAP_FIRE_MAX_F = 8;
const TAP_FIRE_MAX_MOVE = 14; // design px

// ── the rusher waves (SIM-time schedule, authored entry points) ─────────────
/** Sim seconds inside a room before the first wave walks in. */
const WAVE_FIRST = 9.0;
/** Sim seconds between waves after that. */
const WAVE_PERIOD = 7.5;
/** ...tightening per lap, to a floor. */
const WAVE_LAP_DECAY = 0.9;
const WAVE_FLOOR = 4.0;
/** From this lap on a wave brings two, from two different authored points. */
const WAVE_PAIR_LAP = 3;
/** A wave holds off while this many rushers are already loose: the pressure
 * is meant to be relentless, never an unclearable pile. */
const WAVE_MAX_LIVE = 4;
/** Sim seconds a wave rusher stands lit at its entry point before it charges:
 * the arrival is telegraphed, never a touch out of nowhere. */
const WAVE_WARM = 0.6;
/** Sim seconds of iframes a room opens with. With the authored MIN_SPAWN_DIST
 * floor this is the other half of the fairness answer: no lap escalation can
 * put a lethal touch on you before you have had a frame to read the room. */
const ENTRY_GRACE = 0.8;
/** THE KEEP-OUT (design px). Inside this ring a strafing shooter may keep
 * sliding but may never take the step that shortens the gap: the only line in
 * the movement rule that reads the player at all, and the reason a strafe can
 * never turn into a charge. */
const STRAFE_KEEP = 120;

interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  cd: number; // s until the next shot
  tele: number; // s of muzzle telegraph remaining (>0 = about to fire)
  /** WAVE ARRIVAL: sim s of lit wind-up left. >0 = standing, harmless. */
  warm: number;
  dead: boolean;
  /** RUSHERS ONLY - THE WEDGE BREAKER (2026-08-17): sim seconds this rusher
   * has been blocked short of the player (real movement under a quarter of
   * its step while chasing). */
  stuckT: number;
  /** Deterministic detour cursor: each stuck trip advances it one rank down
   * the scored corner list, so the going-around direction is re-picked
   * without rng and a residual pin always breaks. */
  detour: number;
  /** The COMMITTED corner waypoint (wpT <= 0 = none). Routing re-plans only
   * when a leg completes, expires, or the stuck breaker fires: a per-frame
   * argmin re-pick flip-flopped between two corners at 60Hz and travelled
   * nowhere (measured on the first cut of this fix). */
  wpX: number;
  wpY: number;
  wpT: number; // sim seconds of commitment left on the current leg
  // THE STRAFE LANE, in sim px. Everything here is 0 for a rusher and for
  // every shooter on lap 0, and `sLen > 0` is the one flag the page reads to
  // know this machine is the moving kind.
  /** The authored post: the lane's home end. */
  sx: number;
  sy: number;
  /** Unit direction along the lane, from the post toward the far anchor. */
  sux: number;
  suy: number;
  /** Live lane length this lap (authored length x strafeAmp). 0 = holds. */
  sLen: number;
  /** How far along the lane the machine currently stands, 0..sLen. */
  sOff: number;
  /** Which way it is walking: +1 toward the far anchor, -1 back to the post. */
  sdir: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  mine: boolean;
  rocket: boolean;
  /** THE ARC: lobbed OVER cover (enemy bombs only). Exempt from the barrier
   * term, contact-only, and terminated at (tx,ty) instead of by geometry.
   * NEVER set on a player rocket: `mine && rocket` stays cover-blocked. */
  arc: boolean;
  tx: number; // the aim point an arc detonates on (0 when not an arc)
  ty: number;
  arcLen: number; // launch-to-impact distance, so the page can draw altitude
  dead: boolean;
}

interface Drop {
  x: number;
  y: number;
  kind: "rocket";
  taken: boolean;
}

export interface StopclockState {
  W: number;
  H: number;
  k: number;
  demo: boolean;
  t: number; // SIM time
  wallF: number;
  phase: "room" | "transition" | "dead" | "timeout"; // endless: no "won"
  setIdx: number;
  room: number; // 0.. (endless; % 3 indexes the authored triple)
  transT: number; // WALL seconds left in the room-clear beat
  timeScale: number; // what the last step ran at (the HUD reads it)
  surgeF: number;
  idleF: number;
  roomT: number; // SIM seconds inside the current room (the wave clock)
  waveN: number; // waves already walked in this room
  lastWaveIdx: number; // the authored entry point the last wave used
  patienceF: number; // Cloak extends the base PATIENCE_F
  // player
  px: number;
  py: number;
  vx: number; // sim px/s, for enemy lead
  vy: number;
  hits: number; // hits survivable, Plating
  iframes: number;
  rockets: number;
  rocketCap: number;
  aoe: number; // rocket splash radius, already in sim px (Payload grows it)
  speed: number;
  teleT: number; // Sensors: telegraph seconds added before an enemy bullet exists
  fireCdF: number; // wall frames until the next basic shot
  prevSpace: boolean;
  spaceF: number; // wall frames space has been held
  spaceUsed: boolean; // this hold already fired its rocket
  prevDown: boolean;
  downF: number; // frames the pointer has been held
  pressX: number; // where the press started (tap-vs-hold test)
  pressY: number;
  // world
  enemies: Enemy[];
  bullets: Bullet[];
  drops: Drop[];
  barriers: { x: number; y: number; w: number; h: number }[];
  // tally
  killPts: number;
  clearPts: number;
  bonusPts: number;
  kills: number;
  shotsFired: number;
  rocketsFired: number;
  rng: () => number;
}

/** THE VALIDITY ENVELOPE (ADR-0120): the maximum sustainable scoring rate.
 * The basic shot is unlimited but PRICED: every shot forces >=0.43s of sim
 * time (surge 26 frames) under a 0.5s wall cooldown, so even point-blank
 * chain kills land no faster than ~one per 0.45 SIM seconds at 80-160
 * points (~230/s theoretical, unreachable with any travel or repositioning),
 * plus a plateaued clear chunk. 240/s bounds every legit run. Burst covers
 * a rocket AoE double kill (320) and a deep-clear bonus (400) landing on
 * the same frame plus one more kill. */
export function rate(): { perSec: number; burst: number } {
  return { perSec: 240, burst: 900 };
}

function loadRoom(s: StopclockState, set: RoomSet, room: number): void {
  // past the authored three the set CYCLES; the lap escalation carries the
  // difficulty (the seed-selects law holds: depth never changes authorship)
  const def: RoomDef = set[room % 3];
  s.room = room;
  s.px = def.player[0] * s.k;
  s.py = def.player[1] * s.k;
  s.vx = 0;
  s.vy = 0;
  s.bullets = [];
  s.drops = [];
  s.roomT = 0;
  s.waveN = 0;
  s.lastWaveIdx = -1;
  // the room opens with real grace: see ENTRY_GRACE
  s.iframes = ENTRY_GRACE;
  s.barriers = def.barriers.map(([x, y, w, h]) => ({ x: x * s.k, y: y * s.k, w: w * s.k, h: h * s.k }));
  const amp = strafeAmp(s);
  /** Every machine is BORN ON ITS AUTHORED POST (sOff 0) walking toward the
   * far anchor. The room therefore opens reading exactly as it is authored;
   * the cast only spreads out once the pilot lets time run, which is the
   * SUPERHOT beat. `lane` absent (every rusher) means sLen 0 means holds. */
  const laneState = (x: number, y: number, lane?: [number, number]) => {
    const len = lane ? Math.hypot(lane[0], lane[1]) : 0;
    return {
      sx: x * s.k,
      sy: y * s.k,
      sux: len > 0 && lane ? lane[0] / len : 0,
      suy: len > 0 && lane ? lane[1] / len : 0,
      sLen: len * amp * s.k,
      sOff: 0,
      sdir: 1,
    };
  };
  s.enemies = def.enemies.map((e) => ({
    kind: e.kind,
    x: e.x * s.k,
    y: e.y * s.k,
    hp: e.kind === "rocketeer" ? 2 : 1,
    // first shots come late enough to read the room; laps tighten it
    cd: (e.kind === "rocketeer" ? 1.8 : 1.2) * cdMul(s),
    tele: 0,
    warm: 0,
    dead: false,
    stuckT: 0,
    detour: 0,
    wpX: 0,
    wpY: 0,
    wpT: 0,
    ...laneState(e.x, e.y, e.kind === "rusher" ? undefined : e.lane),
  }));
  // THE LAP LADDER: +1 authored-spawn rocketeer per lap (equal count across
  // sets by validator), staggered so they never volley in sync. These only
  // ever exist at lap >= 1, so they are always the moving kind.
  const extra = Math.min(lap(s), def.extraSpawns.length);
  for (let i = 0; i < extra; i++) {
    const [ex, ey, lx, ly] = def.extraSpawns[i];
    s.enemies.push({
      kind: "rocketeer",
      x: ex * s.k,
      y: ey * s.k,
      hp: 2,
      cd: (2.2 + 0.5 * i) * cdMul(s),
      tele: 0,
      warm: 0,
      dead: false,
      stuckT: 0,
      detour: 0,
      wpX: 0,
      wpY: 0,
      wpT: 0,
      ...laneState(ex, ey, [lx, ly]),
    });
  }
}

// ── the rusher waves ────────────────────────────────────────────────────────
/** Sim seconds from room entry to wave n (n counted from 0). Pure in the lap. */
function waveDue(s: StopclockState, n: number): number {
  const decay = Math.pow(WAVE_LAP_DECAY, lap(s));
  const first = Math.max(WAVE_FLOOR, WAVE_FIRST * decay);
  const gap = Math.max(WAVE_FLOOR, WAVE_PERIOD * decay);
  return first + n * gap;
}

/**
 * THE ENTRY RULE, and it is a rule rather than a roll: take the authored
 * point FARTHEST from where the player is standing, preferring one the last
 * wave did not use so two waves never file in from the same doorway - but
 * only while that alternative still clears WAVE_MIN_DIST. validateSets proves
 * by sweep that the global farthest point clears the floor from EVERY
 * standing spot in the room, so the fallback is always the fair one.
 */
function pickWavePoint(s: StopclockState, pts: [number, number][]): number {
  let best = 0;
  let bestD = -1;
  let alt = -1;
  let altD = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] * s.k - s.px, pts[i][1] * s.k - s.py);
    if (d > bestD) {
      bestD = d;
      best = i;
    }
    if (i !== s.lastWaveIdx && d > altD) {
      altD = d;
      alt = i;
    }
  }
  return alt >= 0 && altD >= WAVE_MIN_DIST * s.k ? alt : best;
}

function spawnWave(s: StopclockState, def: RoomDef): void {
  const live = s.enemies.reduce((n, e) => (!e.dead && e.kind === "rusher" ? n + 1 : n), 0);
  if (live >= WAVE_MAX_LIVE) return; // relentless, never unclearable
  const count = lap(s) >= WAVE_PAIR_LAP ? 2 : 1;
  for (let i = 0; i < count && live + i < WAVE_MAX_LIVE; i++) {
    const idx = pickWavePoint(s, def.waveSpawns);
    const [wx, wy] = def.waveSpawns[idx];
    s.enemies.push({
      kind: "rusher",
      x: wx * s.k,
      y: wy * s.k,
      hp: 1,
      cd: 0,
      tele: 0,
      warm: WAVE_WARM,
      dead: false,
      stuckT: 0,
      detour: 0,
      wpX: 0,
      wpY: 0,
      wpT: 0,
      // a wave rusher charges; it never carries a lane (rooms.ts asserts the
      // same law on the authored cast)
      sx: wx * s.k,
      sy: wy * s.k,
      sux: 0,
      suy: 0,
      sLen: 0,
      sOff: 0,
      sdir: 1,
    });
    s.lastWaveIdx = idx;
  }
}

export function createStopclock(
  w: number,
  h: number,
  seed: string,
  demo: boolean,
  stats: Stats | null,
): StopclockState {
  const st: Stats = stats || { botox: 0, drugs: 0, ozempic: 0, aura: 0, optics: 0 };
  const hash = fnv1a(seed || "stopclock");
  const k = w / DESIGN_W;
  const aura = Math.max(0, Math.min(30, st.aura));
  const s: StopclockState = {
    W: w,
    H: h,
    k,
    demo,
    t: 0,
    wallF: 0,
    phase: "room",
    setIdx: ((hash % ROOM_SETS.length) + ROOM_SETS.length) % ROOM_SETS.length,
    room: 0,
    transT: 0,
    timeScale: FREEZE_TS,
    surgeF: 0,
    idleF: 0,
    roomT: 0,
    waveN: 0,
    lastWaveIdx: -1,
    patienceF: PATIENCE_F + 60 * Math.max(0, Math.min(4, st.ozempic)),
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    hits: 1 + Math.floor(Math.max(0, Math.min(4, st.botox)) / 2),
    iframes: 0,
    rockets: START_ROCKETS,
    rocketCap: ROCKET_CAP_BASE + (aura >= 15 ? 1 : 0),
    aoe: (34 + 0.5 * aura) * k,
    speed: BASE_SPEED * (1 + 0.08 * Math.max(0, Math.min(4, st.drugs))),
    teleT: 0.08 * Math.max(0, Math.min(4, st.optics)),
    fireCdF: 0,
    prevSpace: false,
    spaceF: 0,
    spaceUsed: false,
    prevDown: false,
    downF: 0,
    pressX: 0,
    pressY: 0,
    enemies: [],
    bullets: [],
    drops: [],
    barriers: [],
    killPts: 0,
    clearPts: 0,
    bonusPts: 0,
    kills: 0,
    shotsFired: 0,
    rocketsFired: 0,
    rng: mulberry32(hash),
  };
  loadRoom(s, roomSetForSeed(hash), 0);
  return s;
}

function inBarrier(s: StopclockState, x: number, y: number, pad = 0): boolean {
  for (const b of s.barriers) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  }
  return false;
}

function nearestEnemy(s: StopclockState): Enemy | null {
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of s.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - s.px, e.y - s.py);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** Space aims at the pointer when there is one, else the nearest machine. */
function aimPoint(s: StopclockState, input: SimInput): { x: number; y: number } | null {
  if (input.px != null && input.py != null) return { x: input.px, y: input.py };
  const e = nearestEnemy(s);
  return e ? { x: e.x, y: e.y } : null;
}

function scrap(s: StopclockState, e: Enemy): void {
  e.dead = true;
  s.kills += 1;
  s.killPts += KILL_PTS[e.kind];
  if (e.kind === "rocketeer") s.drops.push({ x: e.x, y: e.y, kind: "rocket", taken: false });
}

function damage(s: StopclockState, e: Enemy, dmg: number): void {
  e.hp -= dmg;
  if (e.hp <= 0) scrap(s, e);
}

/** The UNLIMITED basic shot: its whole price is time (surge) + cooldown. */
function fireShot(s: StopclockState, tx: number, ty: number): void {
  if (s.fireCdF > 0) return;
  const a = Math.atan2(ty - s.py, tx - s.px);
  s.bullets.push({
    x: s.px,
    y: s.py,
    vx: Math.cos(a) * BULLET_SPEED * s.k,
    vy: Math.sin(a) * BULLET_SPEED * s.k,
    life: SHOT_RANGE_T,
    mine: true,
    rocket: false,
    arc: false,
    tx: 0,
    ty: 0,
    arcLen: 0,
    dead: false,
  });
  s.shotsFired += 1;
  s.surgeF = SHOT_SURGE_F; // a shot costs time: their bullets creep closer
  s.fireCdF = FIRE_CD_F;
}

/** The ROCKET: double damage, small AoE, capacity-limited. Falls back to a
 * basic shot when the launcher is empty so the gesture always does something. */
function fireRocket(s: StopclockState, tx: number, ty: number): void {
  if (s.rockets <= 0) {
    fireShot(s, tx, ty);
    return;
  }
  if (s.fireCdF > 0) return;
  const a = Math.atan2(ty - s.py, tx - s.px);
  s.bullets.push({
    x: s.px,
    y: s.py,
    vx: Math.cos(a) * ROCKET_SPEED * s.k,
    vy: Math.sin(a) * ROCKET_SPEED * s.k,
    life: SHOT_RANGE_T,
    mine: true,
    rocket: true,
    // NOT an arc: your rocket is still eaten by cover, both ways stay honest
    arc: false,
    tx: 0,
    ty: 0,
    arcLen: 0,
    dead: false,
  });
  s.rockets -= 1;
  s.rocketsFired += 1;
  s.surgeF = ROCKET_SURGE_F; // heavier hit, heavier time price
  s.fireCdF = FIRE_CD_F;
}

export function stepStopclock(s: StopclockState, dt: number, input: SimInput): void {
  if (s.phase === "dead" || s.phase === "timeout") return;
  s.wallF += 1;
  if (s.fireCdF > 0) s.fireCdF -= 1;

  // ── the time rule ──────────────────────────────────────────────────────────
  const keysHeld = input.left || input.right || input.up || input.downKey;
  const anyInput = input.down || input.space || keysHeld;
  if (anyInput) s.idleF = 0;
  else s.idleF += 1;
  let ts = (input.down && input.px != null && input.py != null) || keysHeld ? 1.0 : FREEZE_TS;
  if (s.surgeF > 0) {
    s.surgeF -= 1;
    ts = 1.0;
  }
  if (s.phase === "transition") ts = 1.0; // the clear beat runs at full time
  if (s.idleF > s.patienceF) {
    // the Warden's patience: the freeze leaks back toward full time
    const leak = Math.min(1, (s.idleF - s.patienceF) / PATIENCE_RAMP_F);
    ts = Math.max(ts, FREEZE_TS + (1 - FREEZE_TS) * leak);
  }
  s.timeScale = ts;
  const sdt = dt * ts;
  s.t += sdt;
  if (s.t >= MISSION_T) {
    s.phase = "timeout"; // banked kills + clears keep
    return;
  }

  if (s.phase === "transition") {
    // WALL clock, not the frozen sim clock: the fix for the dead-air bug
    // (a released input froze sdt to 4% and a 1s beat took ~10 real seconds)
    s.transT -= dt;
    if (s.transT <= 0) {
      s.phase = "room";
      loadRoom(s, ROOM_SETS[s.setIdx] as RoomSet, s.room + 1);
    }
    s.prevSpace = input.space;
    s.prevDown = input.down;
    return;
  }

  if (s.iframes > 0) s.iframes = Math.max(0, s.iframes - sdt);

  // ── player: move (this is what makes time flow). Keys win over pointer. ────
  let mvx = 0;
  let mvy = 0;
  let dirX = 0;
  let dirY = 0;
  let maxStep = Infinity;
  if (keysHeld) {
    const kx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const ky = (input.downKey ? 1 : 0) - (input.up ? 1 : 0);
    const kd = Math.hypot(kx, ky);
    if (kd > 0) {
      dirX = kx / kd;
      dirY = ky / kd;
    }
  } else if (input.down && input.px != null && input.py != null) {
    const dx = input.px - s.px;
    const dy = input.py - s.py;
    const d = Math.hypot(dx, dy);
    if (d > 3 * s.k) {
      dirX = dx / d;
      dirY = dy / d;
      maxStep = d;
    }
  }
  if (dirX !== 0 || dirY !== 0) {
    const step = Math.min(s.speed * s.k * sdt, maxStep);
    let nx = s.px + dirX * step;
    let ny = s.py + dirY * step;
    if (inBarrier(s, nx, s.py, PLAYER_R * s.k)) nx = s.px;
    if (inBarrier(s, s.px, ny, PLAYER_R * s.k)) ny = s.py;
    if (inBarrier(s, nx, ny, PLAYER_R * s.k)) {
      nx = s.px;
      ny = s.py;
    }
    mvx = (nx - s.px) / (sdt || 1);
    mvy = (ny - s.py) / (sdt || 1);
    s.px = Math.max(PLAYER_R * s.k, Math.min(s.W - PLAYER_R * s.k, nx));
    s.py = Math.max(PLAYER_R * s.k, Math.min(s.H - PLAYER_R * s.k, ny));
  }
  s.vx = mvx;
  s.vy = mvy;

  // ── SPACE: tap = basic shot on release; held to ROCKET_HOLD_F = rocket ────
  if (input.space && !s.prevSpace) {
    s.spaceF = 0;
    s.spaceUsed = false;
  }
  if (input.space) {
    s.spaceF += 1;
    if (!s.spaceUsed && s.spaceF >= ROCKET_HOLD_F && s.rockets > 0 && s.fireCdF === 0) {
      const aim = aimPoint(s, input);
      if (aim) {
        fireRocket(s, aim.x, aim.y);
        s.spaceUsed = true;
      }
    }
  }
  if (!input.space && s.prevSpace && !s.spaceUsed) {
    const aim = aimPoint(s, input);
    if (aim) fireShot(s, aim.x, aim.y);
  }
  s.prevSpace = input.space;

  // ── POINTER: short still press = shot; long still press = rocket ──────────
  if (input.down && !s.prevDown && input.px != null && input.py != null) {
    s.downF = 0;
    s.pressX = input.px;
    s.pressY = input.py;
  }
  if (input.down) s.downF += 1;
  if (!input.down && s.prevDown && input.px != null && input.py != null) {
    const moved = Math.hypot(input.px - s.pressX, input.py - s.pressY);
    if (moved < TAP_FIRE_MAX_MOVE * s.k) {
      if (s.downF <= TAP_FIRE_MAX_F) fireShot(s, input.px, input.py);
      else if (s.downF >= POINTER_ROCKET_MIN_F) fireRocket(s, input.px, input.py);
      // the 9..21 frame gap is a deliberate dead zone: no accidental rockets
    }
  }
  s.prevDown = input.down;

  // ── drops (rocket refills; a full launcher leaves the drop on the floor) ──
  for (const d of s.drops) {
    if (d.taken) continue;
    if (s.rockets >= s.rocketCap) continue;
    if (Math.hypot(s.px - d.x, s.py - d.y) < (PLAYER_R + 11) * s.k) {
      d.taken = true;
      s.rockets += 1;
    }
  }

  // ── the rusher waves: THEY KEEP COMING ─────────────────────────────────────
  // On the SIM clock, so it is literally "as time passes (time moving)": a
  // player frozen in a corner does not advance this, and the Warden's
  // patience is what answers that player. Everything here is authored
  // (rooms.ts waveSpawns) and selected by distance - no rng, no Date.
  s.roomT += sdt;
  if (s.roomT >= waveDue(s, s.waveN)) {
    spawnWave(s, (ROOM_SETS[s.setIdx] as RoomSet)[s.room % 3]);
    s.waveN += 1;
  }

  // ── enemies ────────────────────────────────────────────────────────────────
  for (const e of s.enemies) {
    if (e.dead) continue;
    if (e.warm > 0) {
      // a wave rusher stands lit at its entry point: harmless, but already
      // shootable and already worth points if you turn and answer it
      e.warm -= sdt;
      continue;
    }
    if (e.kind === "rusher") {
      // ROUTED BY CORNERS THAT WORK (2026-08-17, Mike on the deployed build:
      // "the arrow enemy always gets stuck between those two blocks"). The
      // old rule aimed at the blocking barrier's nearest x-end on the
      // vertical side the rusher already stood on, blind to every OTHER
      // barrier: in set 0 room 2 that aimed the left rusher at a point whose
      // approach crosses the low slab, the axis-slide zeroed both axes in
      // the slab/spine concave corner, and the chase parked there forever
      // (probe: wedged at (193,387) within 2.5s from every right-side
      // standing spot; 1239 wedges across the six rooms before this fix).
      // Three changes, all deterministic:
      //   FAT LINES. The walkability test is PADDED by the body radius and
      //   finds the NEAREST blocker along the ray - the old raw test called
      //   room 2's 24px slab/spine gap "clear" and the 26px body never fit.
      //   The far end is cut short by touch range so a player hugging cover
      //   is still a chargeable player, never a routing target behind a pad.
      //   SCORED CORNERS. The route target is the best of the blocker's four
      //   padded corners - walk + remaining distance, corners standing
      //   inside another barrier's pad or off the floor discarded, blocked
      //   approaches and corners that do not open the line priced up - and
      //   the corner it is already standing on is skipped, so it rounds
      //   corners instead of parking on them. Re-scored leg by leg, this
      //   iterates multi-barrier routes one corner at a time.
      //   COMMITTED LEGS. A picked corner is walked TO (wpT), re-planned
      //   only on arrival, expiry or a stuck trip: the first cut of this fix
      //   re-picked the argmin every frame and flip-flopped between two
      //   corners at 60Hz, travelling nowhere - the exact pathology the
      //   strain oracle logged twice. Commitment is the cure both times.
      //   THE STUCK BREAKER. If real movement stays under a quarter-step
      //   for 0.45 sim-s while out of touch range, `detour` advances one
      //   rank down the scored list and forces a re-plan: any residual pin
      //   breaks toward the next-best way around, deterministically. A
      //   clear line resets both.
      const pad = ENEMY_R * s.k;
      const touchCut = (PLAYER_R + ENEMY_R) * s.k;
      const firstBlock = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        cut: number,
      ): { x: number; y: number; w: number; h: number } | null => {
        const ddx = x2 - x1;
        const ddy = y2 - y1;
        const len = Math.hypot(ddx, ddy);
        const usable = len - cut;
        if (usable <= 0) return null;
        const steps = Math.max(4, Math.ceil(usable / (8 * s.k)));
        for (let i = 1; i <= steps; i++) {
          const t = (i / steps) * (usable / len);
          const x = x1 + ddx * t;
          const y = y1 + ddy * t;
          for (const bar of s.barriers) {
            if (x > bar.x - pad && x < bar.x + bar.w + pad && y > bar.y - pad && y < bar.y + bar.h + pad) {
              return bar;
            }
          }
        }
        return null;
      };
      let tx = s.px;
      let ty = s.py;
      const blocker = firstBlock(e.x, e.y, s.px, s.py, touchCut);
      if (!blocker) {
        e.stuckT = 0;
        e.detour = 0;
        e.wpT = 0;
      } else {
        if (e.wpT > 0) {
          e.wpT -= sdt;
          if (Math.hypot(e.wpX - e.x, e.wpY - e.y) < 10 * s.k) e.wpT = 0; // leg done: plan the next
        }
        if (e.wpT <= 0) {
          const cxs = [blocker.x - (ENEMY_R + 8) * s.k, blocker.x + blocker.w + (ENEMY_R + 8) * s.k];
          const cys = [blocker.y - (ENEMY_R + 6) * s.k, blocker.y + blocker.h + (ENEMY_R + 6) * s.k];
          const scored: { x: number; y: number; cost: number }[] = [];
          for (const ccx of cxs) {
            for (const ccy of cys) {
              if (ccx < pad || ccx > s.W - pad || ccy < pad || ccy > s.H - pad) continue;
              if (inBarrier(s, ccx, ccy, pad)) continue; // inside another slab's pad: the wedge-maker
              if (Math.hypot(ccx - e.x, ccy - e.y) < 12 * s.k) continue; // already rounded: take the next
              let cost = Math.hypot(ccx - e.x, ccy - e.y) + Math.hypot(s.px - ccx, s.py - ccy);
              if (firstBlock(e.x, e.y, ccx, ccy, 0)) cost += 4000 * s.k;
              else if (firstBlock(ccx, ccy, s.px, s.py, touchCut)) cost += 700 * s.k;
              scored.push({ x: ccx, y: ccy, cost });
            }
          }
          scored.sort((a, b) => a.cost - b.cost || a.x - b.x || a.y - b.y);
          if (scored.length > 0) {
            const pick = scored[Math.min(e.detour, scored.length - 1)];
            e.wpX = pick.x;
            e.wpY = pick.y;
            e.wpT = 1.2;
          }
        }
        if (e.wpT > 0) {
          tx = e.wpX;
          ty = e.wpY;
        }
      }
      const dx = tx - e.x;
      const dy = ty - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = RUSHER_SPEED * rusherMul(s) * s.k * sdt;
      const reach = Math.min(step, d); // never orbit-overshoot a corner target
      let nx = e.x + (dx / d) * reach;
      let ny = e.y + (dy / d) * reach;
      if (inBarrier(s, nx, e.y, pad)) nx = e.x;
      if (inBarrier(s, e.x, ny, pad)) ny = e.y;
      const movedD = Math.hypot(nx - e.x, ny - e.y);
      e.x = nx;
      e.y = ny;
      const pd = Math.hypot(s.px - e.x, s.py - e.y);
      if (step > 0 && pd > (PLAYER_R + ENEMY_R + 4) * s.k) {
        if (movedD < step * 0.25) {
          e.stuckT += sdt;
          if (e.stuckT > 0.45) {
            e.stuckT = 0;
            e.detour = (e.detour + 1) % 4;
            e.wpT = 0; // force a re-plan at the shifted rank
          }
        } else {
          e.stuckT = 0;
        }
      }
      if (pd < (PLAYER_R + ENEMY_R) * s.k && s.iframes <= 0) {
        s.hits -= 1;
        s.iframes = HIT_IFRAMES;
        if (s.hits <= 0) {
          s.phase = "dead";
          return;
        }
      }
      continue;
    }
    // ── THE STRAFE: a shooter walks its authored lane ────────────────────────
    // Direction comes from the AUTHORED lane and the machine's own bounce, so
    // the walk is blind to the pilot by construction. The pilot appears once,
    // in the keep-out test: a step that shortens the gap while already inside
    // STRAFE_KEEP is refused and the machine turns instead. Both directions
    // refused (a lane end plus a keep-out) means it simply holds - the flip
    // happens twice, leaving sdir where it was, so there is no jitter.
    if (e.sLen > 0) {
      const step = strafeSpeed(s) * sdt;
      const od = Math.hypot(e.x - s.px, e.y - s.py);
      for (let attempt = 0; attempt < 2; attempt++) {
        const off = e.sOff + e.sdir * step;
        if (off < 0 || off > e.sLen) {
          e.sdir = -e.sdir;
          continue;
        }
        const nx = e.sx + e.sux * off;
        const ny = e.sy + e.suy * off;
        // belt and braces: validateSets proves the whole authored lane clears
        // cover by LANE_WALL_PAD, which is wider than this, so this can only
        // ever fire if somebody ships a lane the validator would have rejected
        if (inBarrier(s, nx, ny, ENEMY_R * s.k)) {
          e.sdir = -e.sdir;
          continue;
        }
        const nd = Math.hypot(nx - s.px, ny - s.py);
        if (nd < STRAFE_KEEP * s.k && nd < od) {
          e.sdir = -e.sdir;
          continue;
        }
        e.sOff = off;
        e.x = nx;
        e.y = ny;
        break;
      }
    }
    // THE PUNCH - SUPERHOT's answer to an empty launcher, and the un-softlock:
    // a shooter in arm's reach is scrapped on contact (normal points + drop).
    // Rushers stay lethal to touch; crossing open ground into a telegraphing
    // muzzle is the risk that prices the melee.
    if (Math.hypot(s.px - e.x, s.py - e.y) < (PLAYER_R + ENEMY_R) * s.k) {
      scrap(s, e);
      continue;
    }
    // shooters: cooldown -> telegraph -> projectile
    if (e.tele > 0) {
      e.tele -= sdt;
      if (e.tele <= 0) {
        if (e.kind === "rocketeer") {
          // THE ARCING BOMB: lobbed OVER cover onto the spot you are standing
          // on right now, aimed straight (no lead), FIXED speed. The
          // outwalk-it dodge is sacred - laps tighten cadence instead - and
          // the aim point is BOTH the detonation trigger and the floor mark
          // the page paints, so the answer is always "be somewhere else".
          const tx = s.px;
          const ty = s.py;
          const a = Math.atan2(ty - e.y, tx - e.x);
          s.bullets.push({
            x: e.x,
            y: e.y,
            vx: Math.cos(a) * ENEMY_ROCKET_SPEED * s.k,
            vy: Math.sin(a) * ENEMY_ROCKET_SPEED * s.k,
            life: ENEMY_ROCKET_LIFE,
            mine: false,
            rocket: true,
            arc: true,
            tx,
            ty,
            arcLen: Math.max(1, Math.hypot(tx - e.x, ty - e.y)),
            dead: false,
          });
        } else {
          // pistol: FAST bullet with full aim lead
          const bSpd = ENEMY_BULLET_SPEED * bulletMul(s) * s.k;
          const lead = Math.hypot(s.px - e.x, s.py - e.y) / bSpd;
          const tx = s.px + s.vx * lead;
          const ty = s.py + s.vy * lead;
          const a = Math.atan2(ty - e.y, tx - e.x);
          s.bullets.push({
            x: e.x,
            y: e.y,
            vx: Math.cos(a) * bSpd,
            vy: Math.sin(a) * bSpd,
            life: 3.0,
            mine: false,
            rocket: false,
            arc: false,
            tx: 0,
            ty: 0,
            arcLen: 0,
            dead: false,
          });
        }
        e.cd = (e.kind === "rocketeer" ? ROCKETEER_CD : PISTOL_CD) * cdMul(s);
        // THE SIDESTEP: having just shot at you, it turns around on its lane
        // and leaves the spot it shot from. Free, deterministic, and the beat
        // that makes a return shot at the muzzle flash miss.
        e.sdir = -e.sdir;
      }
    } else {
      e.cd -= sdt;
      // the muzzle glows before the projectile exists (Sensors widen it);
      // rocketeers telegraph longer: the fat rocket is meant to be seen coming
      if (e.cd <= 0) e.tele = (e.kind === "rocketeer" ? 0.35 : 0.15) + s.teleT;
    }
  }

  // ── projectiles ────────────────────────────────────────────────────────────
  for (const b of s.bullets) {
    if (b.dead) continue;
    b.x += b.vx * sdt;
    b.y += b.vy * sdt;
    b.life -= sdt;
    // THE ONE EXEMPTION: an arc is over the wall, not through it. Everything
    // else on the board - both sides, including YOUR rocket - still dies on
    // cover here, which is the single line the whole cover contract runs on.
    const stopped = b.arc ? false : inBarrier(s, b.x, b.y);
    if (b.life <= 0 || b.x < 0 || b.x > s.W || b.y < 0 || b.y > s.H || stopped) {
      b.dead = true;
      continue;
    }
    if (b.mine) {
      for (const e of s.enemies) {
        if (e.dead) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) < (ENEMY_R + (b.rocket ? 7 : 4)) * s.k) {
          b.dead = true;
          if (b.rocket) {
            // the AoE: everything inside the splash eats double damage -
            // a placed rocket clips two machines
            for (const e2 of s.enemies) {
              if (e2.dead) continue;
              if (Math.hypot(b.x - e2.x, b.y - e2.y) <= s.aoe + ENEMY_R * s.k) damage(s, e2, ROCKET_DMG);
            }
          } else {
            damage(s, e, 1);
          }
          break;
        }
      }
    } else if (
      s.iframes <= 0 &&
      Math.hypot(b.x - s.px, b.y - s.py) < (PLAYER_R + (b.rocket ? 8 : 3)) * s.k
    ) {
      b.dead = true;
      s.hits -= 1;
      s.iframes = HIT_IFRAMES;
      if (s.hits <= 0) {
        s.phase = "dead";
        return;
      }
    }
    // ARC TERMINATION, after the contact test so a bomb landing ON you still
    // lands: ignoring cover without this would fly the bomb its whole 8s life
    // across the room. It is spent the moment it passes the mark it was
    // thrown at, and it leaves nothing behind - enemy bombs have no splash
    // (the AoE block above lives inside `if (b.mine)`), so walking off the
    // mark is a clean, total dodge.
    if (b.arc && !b.dead && (b.x - b.tx) * b.vx + (b.y - b.ty) * b.vy >= 0) b.dead = true;
  }

  // ── room clear ─────────────────────────────────────────────────────────────
  if (s.enemies.every((e) => e.dead)) {
    // sweep the floor on the way out: the transition wipes drops, and the
    // LAST kill's rocket would otherwise be unclaimable in every room
    for (const d of s.drops) {
      if (d.taken) continue;
      d.taken = true;
      s.rockets = Math.min(s.rocketCap, s.rockets + 1);
    }
    // authored bonuses for the first three, then the plateau schedule: the
    // plateau bounds the RATE for validity, never the total (ADR-0120)
    s.clearPts +=
      s.room <= 2
        ? CLEAR_PTS[s.room]
        : Math.min(DEEP_CLEAR_BASE + DEEP_CLEAR_STEP * (s.room - 2), DEEP_CLEAR_CAP);
    s.phase = "transition"; // ALWAYS: the next room is already loading
    s.transT = TRANSITION_T;
  }
}

export function stopclockDone(s: StopclockState): boolean {
  return s.phase === "dead" || s.phase === "timeout";
}

export function stopclockScore(s: StopclockState): number {
  return s.killPts + s.clearPts + s.bonusPts;
}
