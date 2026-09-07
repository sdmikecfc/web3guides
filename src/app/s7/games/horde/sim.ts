/**
 * HORDE - the S7 Gauntlet Legends mirror with the Diablo II feel. Top-down
 * action dungeon crawl vs the undead legion: walk with the pointer, swing on
 * hold, spend MANA on the class skill, route to the potions and upgrade
 * drops on the floor, clear the waves, take the exit, go deeper. Death is
 * the only end; score measures how deep skill carries you.
 *
 * PURE AND HEADLESS (house kit): no Math.random, no Date, no canvas. Every
 * combat number comes from the S7 rules core (rollDice / rollD20 / derive /
 * scaleStatblock / rollLoot / tickConditions) - this file NEVER rolls its
 * own dice. This is a cash-adjacent score game: determinism is law.
 *
 * LAWS THIS FILE ENFORCES:
 *  - NO PER-PROJECTILE d20 TO-HIT (the design panel's HORDE contract). At
 *    horde density a to-hit roll per contact is an RNG-draw and GC bomb, so
 *    contact hits AUTO-LAND both ways: the hero's swings and skills always
 *    connect inside their shape, the legion's contact always connects on its
 *    cooldown. From derive() the offense consumes dmgDice + critRange ONLY -
 *    a hit draws one d20 as a CRIT CHECK (nat >= critRange doubles the
 *    damage dice, the core's own crit shape) plus its damage dice, nothing
 *    else. atkBonus goes deliberately unused here; hero AC becomes a flat
 *    contact SOAK (ac - 10, min 1 damage through) so armor is survival.
 *  - FORKED RNG, PLAIN STATE. One stream per entity per purpose via
 *    rngFork(seed, entityId, purpose); stream positions live in state as
 *    integer CURSORS (rngCursors) and forkAt() re-derives + fast-forwards on
 *    demand (the gauntlet idiom, carried whole). Streams in play: the hero's
 *    "melee" and "skill", each enemy's "attack" / "shoot" / "loot", each
 *    chest's "loot", and "map" for room + wave-set selection.
 *  - SEED SELECTS, NEVER DESIGNS. Room chunks, wave sets, kits and drop
 *    tables are AUTHORED in content.ts; the seed only indexes into them.
 *  - CEILING-NEUTRALITY (ADR-0070 lineage). Score = bestiary xp per kill
 *    (never scaled - scaleStatblock holds xp fixed) plus a flat +ROOM_BONUS
 *    when a room's last wave falls. Gear, level, potions and run tiers buy
 *    SURVIVAL and SPEED only; scores never cap (ADR-0120), validity is
 *    rate-bound.
 *  - THE MANAGED RESOURCE IS ROUTING. Potions drop from kills and chests,
 *    lie on the floor, AUTO-PICKUP on walk-over and AUTO-APPLY at
 *    thresholds: a health potion drinks itself at hp <= 50% (else stores,
 *    belt of 3), a mana potion at mana < skill cost (else stores, belt of
 *    3). No pause, no inventory UI - the management is walking to the drops
 *    and the discipline of when to burn mana.
 *  - INTEGER STATE. Positions are fixed-point ints (FINE = 8 sub-units per
 *    px), timers are frame counts, every stored number is an int, so
 *    fnv1a(JSON.stringify(state)) is platform-stable. Floats exist only in
 *    transit (dash/segment/aim math), always rounded before storage.
 *  - THE AFK GATE NEEDS NO MECHANIC. An idle hero stands in spawn; the gate
 *    room's first wave (>= 3 bodies, authored law) walks over and contact
 *    damage does the rest - min 1 through soak per hit guarantees it. An
 *    idle run kills nothing and clears nothing: it banks exactly 0.
 *
 * INPUT (the s7 harness tape contract): {px, py, down, space} with px/py in
 * [0,1] or null at a fixed dt (one step = one 60th-of-a-second frame; the
 * harness must NOT round px/py to ints, they are normalized). Pointer =
 * walk target (the hero walks toward it at derive().speed); DOWN held =
 * STAND YOUR GROUND and melee swing whenever its cooldown is ready (the
 * walk is suppressed while held; the swing auto-faces the nearest enemy
 * inside 1.5x reach, then the facing arc applies); SPACE edge = the class
 * skill, gated on mana and cooldown - no mana or hot cooldown is a
 * deterministic no-op. All input clamped; a garbage tape can never crash
 * or desync the sim.
 *
 * RESOLVED SPEC AMBIGUITIES (documented choices):
 *  - Crits without to-hit: one rollD20 per LANDED hit vs critRange (the
 *    trinket's keen stat stays live at horde density for one draw per hit).
 *  - Enemy AC is carried in the bestiary but unused by the auto-landing
 *    hero offense; enemy toughness is hp (and depth scaling). Hero AC =
 *    contact soak as above - armor gear reads as survival, per the law.
 *  - A potion picked up over a full belt while above its threshold stays ON
 *    THE FLOOR (walk back for it later); an upgrade picked up at tier 4 is
 *    consumed with no effect (the beam moment is capped, the floor stays
 *    clean). Both deterministic.
 *  - The skill fires on the SPACE EDGE only (discipline is a decision, not
 *    a hold); melee fires on HOLD (cadence is the kit's cooldown).
 *  - Wizard's blast aims at the pointer, clamped to cast range; with a null
 *    pointer it drops at half range along the facing. Monk's dash steps in
 *    8px increments and stops at walls; i-frames cover 30 frames.
 *  - The room-clear bonus pays when the last wave falls (the exit opening
 *    IS the clear); walking through the exit is the transition.
 *  - Necromancers raise at most 3 skeletons each (score-farm cap), under
 *    the global live cap; a raise that would land inside a wall lands on
 *    the necromancer instead (soft-lock proof).
 *  - Mana trickles back at 1 per MANA_REGEN_F frames - slow enough that
 *    the potion routing loop, not regen, funds a caster's output.
 */

import {
  fnv1a,
  rngFork,
  d,
  derive,
  rollDice,
  rollD20,
  tickConditions,
  noConds,
  statblock,
  scaleStatblock,
  rollLoot,
  type Rng,
  type ClassId,
  type Loadout,
  type CondState,
  type DiceSpec,
} from "../_shared/rules/core";
import {
  ROOM_W,
  ROOM_H,
  ENEMY_CAP,
  CHUNKS,
  KITS,
  WAVE_SETS,
  hordeBand,
  DROP_TRASH,
  DROP_ELITE,
  CHEST_TABLE,
  ELITE_IDS,
  stepWeaponDice,
  WEAPON_TIER_MAX,
  SPELL_TIER_MAX,
  MAX_WAVE_XP,
  type Rect,
  type RoomChunk,
  type WaveRow,
  type ClassKit,
} from "./content";

export { fnv1a, ROOM_W, ROOM_H };

// ── input ───────────────────────────────────────────────────────────────────

export interface SimInput {
  px: number | null; // [0,1]
  py: number | null; // [0,1]
  down: boolean; // held = swing on cooldown
  space: boolean; // edge = class skill
}

// ── constants (frames at 60fps; distances in FINE sub-units) ────────────────

export const FPS = 60;
/** Fixed-point scale: 8 sub-units per authored px. All positions/speeds are
 * ints in FINE space; content geometry (px) is scaled on the way in. */
export const FINE = 8;
const FW = ROOM_W * FINE;
const FH = ROOM_H * FINE;

export const POINTER_DEAD = 6 * FINE; // walk dead-zone around the pointer
export const HERO_R = 14; // px
export const ENEMY_R = 12;
const PROJ_R = 6;

const HERO_STEP = 24;  // FINE/frame at derive speed 100 (= 3px/frame)
const ENEMY_STEP = 16; // FINE/frame at bestiary speed 100
const DIAG_NUM = 181;  // 181/256 ~ 1/sqrt2: the integer diagonal step scale

const CONTACT2 = sq((HERO_R + ENEMY_R) * FINE);
const ENEMY_STOP2 = sq(20 * FINE); // the legion presses into overlap
// CONTACT_CD_F is the held-in-reserve difficulty knob: soften early contact
// pressure here (60 -> 75) before ever touching the wave tables again.
const CONTACT_CD_F = 60;           // one contact bite per enemy per second

const ARCHER_RANGE2 = sq(260 * FINE);
const ARCHER_CD_F = 110;
const PROJ_SPEED = 22; // FINE/frame (slower than an ungeared hero: dodgeable)
const PROJ_LIFE_F = 240;
const PROJ_CAP = 32;
const PROJ_HIT2 = sq((HERO_R + PROJ_R) * FINE);

const NECRO_HOLD2 = sq(300 * FINE); // the necromancer keeps its distance
const NECRO_CD_F = 240;
const NECRO_FIRST_F = 120;
const NECRO_RAISE_CAP = 3;

const WAVE_GAP_F = 90;  // 1.5s beat between waves
const ROOM_BEAT_F = 90; // 1.5s beat on room entry: time to read the room

const MANA_REGEN_F = 45; // +1 mana per 0.75s: potions fund casters, not regen
const HP_POT_PCT = 40;   // heal = 40% hpMax
const MP_POT_PCT = 60;   // restore = 60% manaMax
export const POT_MAX = 3;

const PICKUP2 = sq(22 * FINE);
const CHEST2 = sq(30 * FINE);
const ITEM_CAP = 24; // floor items per room; drops over the cap fizzle

export const ROOM_BONUS = 100; // flat per room cleared - NOT depth-scaled

const DASH_HALF_W = 60 * FINE; // monk dash hit corridor half-width
const DASH_IFRAMES = 30;
const DASH_STEP = 8 * FINE;
const LINE_HALF_W = 48 * FINE; // ranger volley half-width
const WIZ_CAST_RANGE = 340 * FINE;
const CLERIC_HEAL_PER = 2; // hp per undead hit by the smite nova

const DIRS8: readonly (readonly [number, number])[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

function sq(n: number): number {
  return n * n;
}

// ── state ───────────────────────────────────────────────────────────────────

export type Phase = "run" | "dead";

export interface EnemyState {
  id: string;  // "d{depth}w{wave}s{slot}" (+ "r{n}" raised) - the rng fork key
  key: string; // bestiary id
  x: number;   // FINE
  y: number;
  hp: number;
  hpMax: number;
  dmgC: number; // scaled contact dice: XdY+Z
  dmgS: number;
  dmgB: number;
  step: number; // FINE/frame
  xp: number;   // bestiary xp - NEVER scaled (core law)
  elite: number;   // 1 = rolls DROP_ELITE on death
  ghost: number;   // 1 = moves through walls (specter)
  shooter: number; // 1 = bone archer behavior
  necro: number;   // 1 = raises skeletons
  atkCd: number;
  shootCd: number;
  raiseCd: number;
  raised: number;
  conds: CondState;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number; // rolled at fire time from the archer's own stream
  lifeF: number;
}

export interface FloorItem {
  kind: string; // "hpPot" | "mpPot" | "wpnUp" | "splUp"
  x: number;
  y: number;
}

export interface HordeState {
  W: number;
  H: number;
  demo: boolean;
  seed: number;
  frame: number;
  phase: Phase;
  // the dungeon
  depth: number;
  chunkIdx: number;
  setIdx: number;
  waveIdx: number;
  wavePendingF: number;
  exitOpen: number;
  // hero (derived at create; run tiers stack on top)
  classId: ClassId;
  level: number;
  x: number; // FINE
  y: number;
  facing: number; // DIRS8 index
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
  ac: number;
  spdStep: number; // FINE/frame, from derive().speed
  critRange: number;
  wpnC: number; // derive() weapon dice - the store gear base the run tiers step
  wpnS: number;
  wpnB: number;
  weaponTier: number; // run-local 0..4
  spellTier: number;
  hpPots: number; // the belt
  mpPots: number;
  swingCd: number;
  skillCd: number;
  invulnF: number; // monk dash i-frames
  // the room
  enemies: EnemyState[];
  projs: Projectile[];
  items: FloorItem[];
  chests: number[]; // 0 closed / 1 opened, per chunk chest spot
  // input edges
  prevDown: boolean;
  prevSpace: boolean;
  /** Stream positions: draws consumed per "entity|purpose" fork. THE plain-
   * state answer to closure rngs - the gauntlet idiom carried whole. */
  rngCursors: Record<string, number>;
  // tally
  xpPts: number;
  roomPts: number;
  kills: number;
  roomsCleared: number;
  potsUsed: number;
  swings: number;
  casts: number;
  crits: number;
  dmgDealt: number;
  dmgTaken: number;
  /** Stall-breaker (balance gate f3, 2026-08-25): fingerprint of the progress
   * counters + frames since it last moved. Wall-stuck stalemates (hero seeking
   * an unreachable potion, last enemy wedged across the room) froze runs
   * forever; 45s with zero combat/loot/door progress ends the run instead. */
  progFp: number;
  stallF: number;
}

// ── validity + ceiling (ADR-0120: rate plateaus, score never caps) ──────────

/** THE VALIDITY ENVELOPE. The fastest legitimate loop is: a wave spawns
 * after the WAVE_GAP_F beat (1.5s) and an oracle wipes it instantly with a
 * full-tier nova. The richest authored wave pays MAX_WAVE_XP (3100), so
 * sustained rate is bounded by 3100 / 1.5s ~ 2067/s; 2200/s covers it with
 * margin (room bonuses are +100 per ~6s+ room, noise at this scale). Burst
 * covers one whole max wave + a room clear banking on a single cast.
 * The 2026-08-28 level-1 retune was xp-neutral and left wave density
 * unchanged, so this envelope still holds. */
export function rate(): { perSec: number; burst: number } {
  return { perSec: 2200, burst: MAX_WAVE_XP + 400 };
}

/** THE FAR-OFF SANITY CLAMP (generous by design, per the harness law that
 * maxScore >= 5x the oracle). Math: the analytic max is ~2200/s = 132k/min;
 * a marathon outlier run of ~30 minutes at that impossible pace is ~3.96M.
 * Round up: nothing legitimate ever grazes this. */
export function ceiling(): number {
  return 4_000_000;
}

// ── forked rng over plain state (the gauntlet idiom) ────────────────────────

function forkAt(s: HordeState, entityId: string, purpose: string): Rng {
  const key = entityId + "|" + purpose;
  const base = rngFork(s.seed, entityId, purpose);
  const skip = s.rngCursors[key] | 0;
  for (let i = 0; i < skip; i++) base();
  return () => {
    s.rngCursors[key] = (s.rngCursors[key] | 0) + 1;
    return base();
  };
}

function pick(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

// ── geometry helpers ────────────────────────────────────────────────────────

function chunkOf(s: HordeState): RoomChunk {
  return CHUNKS[s.chunkIdx];
}

function wavesOf(s: HordeState) {
  return WAVE_SETS[hordeBand(s.depth)][s.setIdx];
}

/** Point (FINE) inside any wall rect (px) expanded by radius rPx. */
function inWall(walls: readonly Rect[], x: number, y: number, rPx: number): boolean {
  return wallAt(walls, x, y, rPx) !== null;
}

function wallAt(walls: readonly Rect[], x: number, y: number, rPx: number): Rect | null {
  for (const w of walls) {
    if (
      x >= (w.x - rPx) * FINE &&
      x <= (w.x + w.w + rPx) * FINE &&
      y >= (w.y - rPx) * FINE &&
      y <= (w.y + w.h + rPx) * FINE
    )
      return w;
  }
  return null;
}

/** Coarse line-of-sight: 7 interior samples along the segment vs the walls.
 * Integer math throughout (>>3 is the /8); good enough for authored rects. */
function hasLoS(walls: readonly Rect[], x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (let i = 1; i < 8; i++) {
    if (inWall(walls, x0 + ((dx * i) >> 3), y0 + ((dy * i) >> 3), 0)) return false;
  }
  return true;
}

const clampI = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Axis-separated move with wall cancel: blocked on one axis still slides on
 * the other, which is what walks the legion around the authored walls. */
function slideMove(
  walls: readonly Rect[],
  x: number,
  y: number,
  sx: number,
  sy: number,
  rPx: number,
  ghost: number,
): readonly [number, number] {
  const lo = rPx * FINE;
  let nx = clampI(x + sx, lo, FW - lo);
  if (!ghost && sx !== 0 && inWall(walls, nx, y, rPx)) nx = x;
  let ny = clampI(y + sy, lo, FH - lo);
  if (!ghost && sy !== 0 && inWall(walls, nx, ny, rPx)) ny = y;
  return [nx, ny];
}

/** Pursuit move with a WALL-FOLLOW override (the no-pathing law that still
 * walks every authored chunk). When the desired x-face is blocked, the whole
 * frame becomes a slide along that wall toward its nearer open edge - the
 * y-pursuit component is IGNORED, because a target sitting inside the wall's
 * band otherwise tugs the actor back every other frame and the two stateless
 * decisions live-lock at the wall face (measured: a 12-minute frozen run,
 * not a death). Symmetric for a blocked y-face when x has no pursuit. An
 * edge flush with the room boundary is never chosen; corner traversal
 * degrades to a grinding diagonal that still makes net progress. */
function chaseMove(
  walls: readonly Rect[],
  x: number,
  y: number,
  mx: number,
  my: number,
  sx: number,
  sy: number,
  st: number,
  rPx: number,
  ghost: number,
): readonly [number, number] {
  if (ghost === 0) {
    if (mx !== 0) {
      const w = wallAt(walls, x + mx * st, y, rPx);
      if (w) {
        const topFlush = w.y <= rPx;
        const botFlush = w.y + w.h >= ROOM_H - rPx;
        const dir = topFlush ? 1 : botFlush ? -1 : 2 * y < (2 * w.y + w.h) * FINE ? -1 : 1;
        return slideMove(walls, x, y, 0, dir * st, rPx, 0);
      }
    }
    if (my !== 0 && mx === 0) {
      const w = wallAt(walls, x, y + my * st, rPx);
      if (w) {
        const leftFlush = w.x <= rPx;
        const rightFlush = w.x + w.w >= ROOM_W - rPx;
        const dir = leftFlush ? 1 : rightFlush ? -1 : 2 * x < (2 * w.x + w.w) * FINE ? -1 : 1;
        return slideMove(walls, x, y, dir * st, 0, rPx, 0);
      }
    }
  }
  return slideMove(walls, x, y, sx, sy, rPx, ghost);
}

function faceIdx(mx: number, my: number, cur: number): number {
  if (mx === 0 && my === 0) return cur;
  for (let i = 0; i < 8; i++) if (DIRS8[i][0] === mx && DIRS8[i][1] === my) return i;
  return cur;
}

/** Squared distance from point P to segment AB. Float in transit only. */
function distPointSeg2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

// ── create ──────────────────────────────────────────────────────────────────

const DEFAULT_LOADOUT: Loadout = {
  classId: "barbarian",
  level: 1,
  gear: { weapon: 0, armor: 0, trinket: 0 },
};

export function createHorde(
  w: number,
  h: number,
  seed: string,
  demo: boolean,
  loadout: Loadout | null,
): HordeState {
  const lo = loadout || DEFAULT_LOADOUT;
  const dv = derive(lo);
  const s: HordeState = {
    W: w | 0,
    H: h | 0,
    demo,
    seed: fnv1a(seed || "horde"),
    frame: 0,
    phase: "run",
    depth: 0,
    chunkIdx: 0,
    setIdx: 0,
    waveIdx: 0,
    wavePendingF: ROOM_BEAT_F,
    exitOpen: 0,
    classId: dv.classId,
    level: Math.max(1, Math.min(20, lo.level | 0)),
    x: 0,
    y: 0,
    facing: 0, // east: toward the exit
    hp: dv.hpMax,
    hpMax: dv.hpMax,
    mana: dv.manaMax,
    manaMax: dv.manaMax,
    ac: dv.ac,
    spdStep: Math.floor((HERO_STEP * dv.speed) / 100),
    critRange: dv.critRange,
    wpnC: dv.dmgDice.count,
    wpnS: dv.dmgDice.sides,
    wpnB: dv.dmgDice.bonus,
    weaponTier: 0,
    spellTier: 0,
    hpPots: 2, // two red flasks + one blue: the learnable level-1 belt
    mpPots: 1,
    swingCd: 0,
    skillCd: 0,
    invulnF: 0,
    enemies: [],
    projs: [],
    items: [],
    chests: [],
    prevDown: false,
    prevSpace: false,
    rngCursors: {},
    xpPts: 0,
    roomPts: 0,
    kills: 0,
    roomsCleared: 0,
    potsUsed: 0,
    swings: 0,
    casts: 0,
    crits: 0,
    dmgDealt: 0,
    dmgTaken: 0,
    progFp: -1, // first step always stamps a fresh fingerprint
    stallF: 0,
  };
  enterRoom(s);
  return s;
}

/** Seed-select this depth's chunk + wave set and stage the hero. The seed
 * only INDEXES the authored books (the map law). */
function enterRoom(s: HordeState): void {
  const band = hordeBand(s.depth);
  s.chunkIdx = pick(forkAt(s, "map", `room${s.depth}`), CHUNKS.length);
  s.setIdx = pick(forkAt(s, "map", `waves${s.depth}`), WAVE_SETS[band].length);
  const c = chunkOf(s);
  s.x = c.heroSpawn[0] * FINE;
  s.y = c.heroSpawn[1] * FINE;
  s.waveIdx = 0;
  s.wavePendingF = ROOM_BEAT_F;
  s.exitOpen = 0;
  s.enemies = [];
  s.projs = [];
  s.items = [];
  s.chests = c.chestSpots.map(() => 0);
}

// ── spawning ────────────────────────────────────────────────────────────────

function spawnEnemy(s: HordeState, key: string, id: string, x: number, y: number): void {
  const sc = scaleStatblock(statblock(key), s.depth);
  s.enemies.push({
    id,
    key,
    x,
    y,
    hp: sc.hp,
    hpMax: sc.hp,
    dmgC: sc.dmgDice.count,
    dmgS: sc.dmgDice.sides,
    dmgB: sc.dmgDice.bonus,
    step: Math.floor((ENEMY_STEP * sc.speed) / 100),
    xp: sc.xp, // scaleStatblock holds xp fixed - the ceiling-neutrality law
    elite: ELITE_IDS.includes(key) ? 1 : 0,
    ghost: key === "specter" ? 1 : 0,
    shooter: key === "boneArcher" ? 1 : 0,
    necro: key === "necromancer" ? 1 : 0,
    atkCd: 0,
    shootCd: 0,
    raiseCd: NECRO_FIRST_F,
    raised: 0,
    conds: noConds(),
  });
}

/** Spawn one authored wave, cycling the chunk's spawn points with a fixed
 * deterministic scatter (no rng: the offsets are a function of the slot).
 * Scatter stays inside the validated SPAWN_CLEAR margin; a scattered spot
 * that still lands in a wall falls back to the validated point itself. */
function spawnWave(s: HordeState, wave: WaveRow): void {
  const c = chunkOf(s);
  let k = 0;
  for (const [key, n] of wave) {
    for (let j = 0; j < n; j++) {
      if (s.enemies.length >= ENEMY_CAP) return;
      const pt = c.spawnPts[k % c.spawnPts.length];
      const ox = ((k * 53) % 81) - 40; // px, within the validated clearance
      const oy = ((k * 37) % 61) - 30;
      let x = clampI((pt[0] + ox) * FINE, 24 * FINE, FW - 24 * FINE);
      let y = clampI((pt[1] + oy) * FINE, 24 * FINE, FH - 24 * FINE);
      if (inWall(c.walls, x, y, ENEMY_R)) {
        x = pt[0] * FINE;
        y = pt[1] * FINE;
      }
      spawnEnemy(s, key, `d${s.depth}w${s.waveIdx}s${k}`, x, y);
      k++;
    }
  }
}

// ── the hero's side ─────────────────────────────────────────────────────────

function heal(s: HordeState, n: number): void {
  if (n <= 0) return;
  s.hp = Math.min(s.hpMax, s.hp + n);
}

function drinkHp(s: HordeState): void {
  heal(s, Math.floor((s.hpMax * HP_POT_PCT) / 100));
  s.potsUsed += 1;
}

function drinkMp(s: HordeState): void {
  s.mana = Math.min(s.manaMax, s.mana + Math.floor((s.manaMax * MP_POT_PCT) / 100));
  s.potsUsed += 1;
}

function pushItem(s: HordeState, kind: string, x: number, y: number): void {
  if (kind === "nothing") return;
  if (s.items.length >= ITEM_CAP) return; // a flooded floor fizzles the drop
  s.items.push({ kind, x: clampI(x, 16 * FINE, FW - 16 * FINE), y: clampI(y, 16 * FINE, FH - 16 * FINE) });
}

function creditKill(s: HordeState, en: EnemyState): void {
  en.hp = 0;
  s.kills += 1;
  s.xpPts += en.xp; // bestiary xp, never stat-scaled: THE score law
  const table = en.elite === 1 ? DROP_ELITE : DROP_TRASH;
  pushItem(s, rollLoot(table, forkAt(s, en.id, "loot")), en.x, en.y);
}

/** One landed hit: a d20 crit check vs critRange (doubling the damage DICE,
 * core shape), then the damage roll. No to-hit - the panel law. */
function hitEnemy(s: HordeState, en: EnemyState, dice: DiceSpec, rng: Rng): void {
  const crit = rollD20(rng) >= s.critRange;
  const spec = crit ? d(dice.count * 2, dice.sides, dice.bonus) : dice;
  const dmg = rollDice(spec, rng);
  if (crit) s.crits += 1;
  en.hp -= dmg;
  s.dmgDealt += dmg;
  if (en.hp <= 0) creditKill(s, en);
}

function doSwing(s: HordeState, kit: ClassKit): void {
  s.swingCd = kit.swingCdF;
  s.swings += 1;
  // AUTO-FACE: the swing snaps facing to the nearest living enemy inside
  // 1.5x reach (min squared distance, array order breaks ties, integer
  // math) BEFORE the arc reads - aiming must never require walking through
  // the target. The half-plane arc below STAYS: it is what keeps Whirlwind
  // (all-around) worth its mana over the free swing.
  const seek2 = sq(((kit.swingRange * 3) >> 1) * FINE);
  let tgt: EnemyState | null = null;
  let td = -1;
  for (const en of s.enemies) {
    if (en.hp <= 0) continue;
    const dx = en.x - s.x;
    const dy = en.y - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= seek2 && (td < 0 || d2 < td)) {
      td = d2;
      tgt = en;
    }
  }
  if (tgt) {
    // 8-way octant quantization consistent with faceIdx's DIRS8 vocabulary:
    // an axis contributes when its magnitude is over half the other's.
    const dx = tgt.x - s.x;
    const dy = tgt.y - s.y;
    const ax = dx < 0 ? -dx : dx;
    const ay = dy < 0 ? -dy : dy;
    const mx = 2 * ax > ay ? (dx > 0 ? 1 : -1) : 0;
    const my = 2 * ay > ax ? (dy > 0 ? 1 : -1) : 0;
    s.facing = faceIdx(mx, my, s.facing);
  }
  const [fx, fy] = DIRS8[s.facing];
  const range2 = sq(kit.swingRange * FINE);
  const dice = stepWeaponDice(d(s.wpnC, s.wpnS, s.wpnB), s.weaponTier);
  const rng = forkAt(s, "hero", "melee");
  for (const en of s.enemies) {
    if (en.hp <= 0) continue;
    const dx = en.x - s.x;
    const dy = en.y - s.y;
    if (dx * dx + dy * dy > range2) continue;
    if (dx * fx + dy * fy < 0) continue; // behind the swing arc
    hitEnemy(s, en, dice, rng);
  }
}

/** The class skill. Mana and cooldown were already checked by the caller;
 * tpx/tpy are the pointer in FINE space or -1 (wizard aiming). */
function doSkill(s: HordeState, kit: ClassKit, tpx: number, tpy: number): void {
  s.mana -= kit.cost;
  s.skillCd = kit.cdF;
  s.casts += 1;
  const tier = clampI(s.spellTier, 0, SPELL_TIER_MAX);
  const dice = kit.dice[tier];
  const area = kit.area[tier] * FINE;
  const rng = forkAt(s, "hero", "skill");
  const [fx, fy] = DIRS8[s.facing];

  if (kit.shape === "nova" || kit.shape === "wave" || kit.shape === "smite") {
    const r2 = sq(area);
    let hits = 0;
    for (const en of s.enemies) {
      if (en.hp <= 0) continue;
      const dx = en.x - s.x;
      const dy = en.y - s.y;
      if (dx * dx + dy * dy > r2) continue;
      if (kit.shape === "wave") en.conds.weaken = Math.min(9, en.conds.weaken + 3); // the core condition
      hitEnemy(s, en, dice, rng);
      hits += 1;
    }
    if (kit.shape === "smite" && hits > 0) {
      heal(s, Math.min(12 + 2 * tier, hits * CLERIC_HEAL_PER)); // a little per undead hit
    }
    return;
  }

  if (kit.shape === "dash") {
    const c = chunkOf(s);
    const diag = fx !== 0 && fy !== 0;
    const stepLen = diag ? (DASH_STEP * DIAG_NUM) >> 8 : DASH_STEP;
    const steps = Math.floor(area / DASH_STEP);
    const x0 = s.x;
    const y0 = s.y;
    for (let i = 0; i < steps; i++) {
      const [nx, ny] = slideMove(c.walls, s.x, s.y, fx * stepLen, fy * stepLen, HERO_R, 0);
      if (nx === s.x && ny === s.y) break; // wall: the dash stops
      s.x = nx;
      s.y = ny;
    }
    s.invulnF = DASH_IFRAMES; // through the horde untouchable
    const w2 = sq(DASH_HALF_W);
    for (const en of s.enemies) {
      if (en.hp <= 0) continue;
      if (distPointSeg2(en.x, en.y, x0, y0, s.x, s.y) <= w2) hitEnemy(s, en, dice, rng);
    }
    return;
  }

  if (kit.shape === "line") {
    const inv = fx !== 0 && fy !== 0 ? Math.SQRT1_2 : 1; // float in transit only
    const ux = fx * inv;
    const uy = fy * inv;
    for (const en of s.enemies) {
      if (en.hp <= 0) continue;
      const dx = en.x - s.x;
      const dy = en.y - s.y;
      const along = dx * ux + dy * uy;
      if (along < 0 || along > area) continue;
      if (Math.abs(dx * uy - dy * ux) > LINE_HALF_W) continue;
      hitEnemy(s, en, dice, rng); // piercing: every body in the corridor
    }
    return;
  }

  // blast: at the pointer, clamped to cast range; facing half-range fallback
  let bx = tpx >= 0 ? tpx : s.x + fx * ((WIZ_CAST_RANGE / 2) | 0);
  let by = tpx >= 0 ? tpy : s.y + fy * ((WIZ_CAST_RANGE / 2) | 0);
  const ddx = bx - s.x;
  const ddy = by - s.y;
  const d2 = ddx * ddx + ddy * ddy;
  if (d2 > sq(WIZ_CAST_RANGE)) {
    const scale = WIZ_CAST_RANGE / Math.sqrt(d2); // float in transit only
    bx = s.x + Math.round(ddx * scale);
    by = s.y + Math.round(ddy * scale);
  }
  const r2 = sq(area);
  for (const en of s.enemies) {
    if (en.hp <= 0) continue;
    const dx = en.x - bx;
    const dy = en.y - by;
    if (dx * dx + dy * dy <= r2) hitEnemy(s, en, dice, rng);
  }
}

// ── the legion's side ───────────────────────────────────────────────────────

const heroSoak = (s: HordeState): number => Math.max(0, s.ac - 10);

function enemyAct(s: HordeState, en: EnemyState, aliveNow: number): void {
  const c = chunkOf(s);
  const dx = s.x - en.x;
  const dy = s.y - en.y;
  const d2 = dx * dx + dy * dy;

  // movement: press the hero. Shooters hold at range and necromancers
  // farther, but ONLY with line of sight - a walled-off ranger is a frozen
  // room, so without LoS everything advances like melee.
  const ranged = en.shooter === 1 || en.necro === 1;
  const los = ranged ? hasLoS(c.walls, en.x, en.y, s.x, s.y) : true;
  const hold2 = en.shooter === 1 && los ? ARCHER_RANGE2 : en.necro === 1 && los ? NECRO_HOLD2 : ENEMY_STOP2;
  if (d2 > hold2) {
    const mx = dx > POINTER_DEAD ? 1 : dx < -POINTER_DEAD ? -1 : 0;
    const my = dy > POINTER_DEAD ? 1 : dy < -POINTER_DEAD ? -1 : 0;
    const st = mx !== 0 && my !== 0 ? (en.step * DIAG_NUM) >> 8 : en.step;
    const [nx, ny] = chaseMove(c.walls, en.x, en.y, mx, my, mx * st, my * st, en.step, ENEMY_R, en.ghost);
    en.x = nx;
    en.y = ny;
  }

  // contact bite: auto-lands on its cooldown (no to-hit - the panel law)
  if (en.atkCd > 0) en.atkCd -= 1;
  if (d2 <= CONTACT2 && en.atkCd === 0) {
    en.atkCd = CONTACT_CD_F;
    if (s.invulnF === 0) {
      let dmg = rollDice(d(en.dmgC, en.dmgS, en.dmgB), forkAt(s, en.id, "attack"));
      if (en.conds.weaken > 0) dmg = Math.max(0, dmg - 2); // the bard's mark
      dmg = Math.max(1, dmg - heroSoak(s)); // min 1 through: the AFK guarantee
      s.hp -= dmg;
      s.dmgTaken += dmg;
    }
  }

  // bone archer: slow bolts from range, damage rolled at fire time
  if (en.shooter === 1) {
    if (en.shootCd > 0) en.shootCd -= 1;
    if (en.shootCd === 0 && los && d2 <= ARCHER_RANGE2 && d2 > 0 && s.projs.length < PROJ_CAP) {
      en.shootCd = ARCHER_CD_F;
      const dmg = rollDice(d(en.dmgC, en.dmgS, en.dmgB), forkAt(s, en.id, "shoot"));
      const len = Math.sqrt(d2); // float in transit only
      s.projs.push({
        x: en.x,
        y: en.y,
        vx: Math.round((dx * PROJ_SPEED) / len),
        vy: Math.round((dy * PROJ_SPEED) / len),
        dmg,
        lifeF: PROJ_LIFE_F,
      });
    }
  }

  // necromancer: raises capped skeletons under the global live cap
  if (en.necro === 1) {
    if (en.raiseCd > 0) en.raiseCd -= 1;
    if (en.raiseCd === 0 && en.raised < NECRO_RAISE_CAP && aliveNow < ENEMY_CAP) {
      en.raiseCd = NECRO_CD_F;
      const ox = (((en.raised * 67) % 81) - 40) * FINE;
      const oy = (((en.raised * 41) % 61) - 30) * FINE;
      let x = clampI(en.x + ox, 24 * FINE, FW - 24 * FINE);
      let y = clampI(en.y + oy, 24 * FINE, FH - 24 * FINE);
      if (inWall(c.walls, x, y, ENEMY_R)) {
        x = en.x; // the necromancer's own footing is always valid
        y = en.y;
      }
      spawnEnemy(s, "skeleton", `${en.id}r${en.raised}`, x, y);
      en.raised += 1;
    }
  }
}

function stepProjectiles(s: HordeState): void {
  const c = chunkOf(s);
  let w = 0;
  for (let i = 0; i < s.projs.length; i++) {
    const p = s.projs[i];
    p.x += p.vx;
    p.y += p.vy;
    p.lifeF -= 1;
    if (p.lifeF <= 0 || p.x < 0 || p.x > FW || p.y < 0 || p.y > FH) continue;
    if (inWall(c.walls, p.x, p.y, 0)) continue; // bolts break on stone
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    if (dx * dx + dy * dy <= PROJ_HIT2) {
      if (s.invulnF === 0) {
        const dmg = Math.max(1, p.dmg - heroSoak(s));
        s.hp -= dmg;
        s.dmgTaken += dmg;
      }
      continue; // a dash-blurred hero still swats the bolt aside
    }
    s.projs[w++] = p;
  }
  s.projs.length = w;
}

// ── demo policy (scripted showcase over the same deterministic streams) ─────

/** Pure function of state: chase the nearest body and play the
 * stop-and-fight contract - stand and trade while the belt holds, and once
 * the belt is dry and hp is low press DOWN only on fire frames, stepping
 * away through the swing cooldown (the kite loop the slow legion is
 * authored to lose). Burns mana on grouped enemies, routes to a health
 * potion when the belt is dry. Holding down outside true reach would stall
 * the approach against a static shooter. */
function demoInput(s: HordeState): SimInput {
  const kit = KITS[s.classId];
  let best: EnemyState | null = null;
  let bd = -1;
  for (const en of s.enemies) {
    if (en.hp <= 0) continue;
    const dx = en.x - s.x;
    const dy = en.y - s.y;
    const d2 = dx * dx + dy * dy;
    if (bd < 0 || d2 < bd) {
      bd = d2;
      best = en;
    }
  }
  let tx = FW >> 1;
  let ty = FH >> 1;
  let routed = false;
  if (s.hp * 2 <= s.hpMax && s.hpPots === 0) {
    for (const it of s.items) {
      if (it.kind === "hpPot") {
        tx = it.x;
        ty = it.y;
        routed = true;
        break;
      }
    }
  }
  const reach2 = sq(kit.swingRange * FINE);
  const hurt = s.hpPots === 0 && s.hp * 2 <= s.hpMax;
  const down = best !== null && bd <= reach2 && (!hurt || s.swingCd <= 1);
  if (!routed) {
    if (best && hurt && !down && bd <= reach2) {
      // kite: step away from the target through the swing cooldown
      tx = clampI(s.x * 2 - best.x, 0, FW);
      ty = clampI(s.y * 2 - best.y, 0, FH);
    } else if (best) {
      tx = best.x;
      ty = best.y;
    } else if (s.exitOpen === 1) {
      const e = chunkOf(s).exit;
      tx = (e.x + (e.w >> 1)) * FINE;
      ty = (e.y + (e.h >> 1)) * FINE;
    }
  }
  const wantSkill =
    best !== null &&
    s.mana >= kit.cost &&
    s.skillCd === 0 &&
    bd <= sq((kit.area[clampI(s.spellTier, 0, SPELL_TIER_MAX)] + 40) * FINE);
  return {
    px: tx / FW,
    py: ty / FH,
    down,
    space: wantSkill && (s.frame & 1) === 0, // alternate for a clean edge
  };
}

// ── step ────────────────────────────────────────────────────────────────────

export function stepHorde(s: HordeState, dt: number, input: SimInput): void {
  void dt; // fixed-step contract: one call = one frame; the sim counts frames
  if (s.phase === "dead") return;
  s.frame += 1;

  const inp = s.demo ? demoInput(s) : input;
  const spaceEdge = inp.space && !s.prevSpace;
  s.prevDown = inp.down;
  s.prevSpace = inp.space;
  const px = inp.px == null ? -1 : Math.max(0, Math.min(1, inp.px));
  const py = inp.py == null ? -1 : Math.max(0, Math.min(1, inp.py));
  const tpx = px >= 0 ? Math.round(px * FW) : -1;
  const tpy = py >= 0 ? Math.round(py * FH) : -1;

  const kit = KITS[s.classId];
  const c = chunkOf(s);

  // timers + mana trickle
  if (s.swingCd > 0) s.swingCd -= 1;
  if (s.skillCd > 0) s.skillCd -= 1;
  if (s.invulnF > 0) s.invulnF -= 1;
  if (s.frame % MANA_REGEN_F === 0) s.mana = Math.min(s.manaMax, s.mana + 1);

  // hero walks toward the pointer at derive().speed - unless DOWN is held:
  // HOLD = STAND YOUR GROUND (attacking never requires body-rushing)
  if (tpx >= 0 && !inp.down) {
    const dx = tpx - s.x;
    const dy = tpy - s.y;
    const ax = dx < 0 ? -dx : dx;
    const ay = dy < 0 ? -dy : dy;
    if (ax > POINTER_DEAD || ay > POINTER_DEAD) {
      const mx = ax > POINTER_DEAD ? (dx > 0 ? 1 : -1) : 0;
      const my = ay > POINTER_DEAD ? (dy > 0 ? 1 : -1) : 0;
      const st = mx !== 0 && my !== 0 ? (s.spdStep * DIAG_NUM) >> 8 : s.spdStep;
      const [nx, ny] = chaseMove(
        c.walls, s.x, s.y, mx, my,
        mx * Math.min(st, ax), my * Math.min(st, ay), s.spdStep, HERO_R, 0,
      );
      s.x = nx;
      s.y = ny;
      s.facing = faceIdx(mx, my, s.facing);
    }
  }

  // floor pickups (walk-over): potions auto-apply at thresholds or store
  for (let i = s.items.length - 1; i >= 0; i--) {
    const it = s.items[i];
    const dx = it.x - s.x;
    const dy = it.y - s.y;
    if (dx * dx + dy * dy > PICKUP2) continue;
    if (it.kind === "wpnUp") {
      if (s.weaponTier < WEAPON_TIER_MAX) s.weaponTier += 1; // at cap: consumed, no effect
      s.items.splice(i, 1);
    } else if (it.kind === "splUp") {
      if (s.spellTier < SPELL_TIER_MAX) s.spellTier += 1;
      s.items.splice(i, 1);
    } else if (it.kind === "hpPot") {
      if (s.hp * 2 <= s.hpMax) {
        drinkHp(s);
        s.items.splice(i, 1);
      } else if (s.hpPots < POT_MAX) {
        s.hpPots += 1;
        s.items.splice(i, 1);
      } // else: full belt, above threshold - it stays on the floor
    } else if (it.kind === "mpPot") {
      if (s.mana < kit.cost) {
        drinkMp(s);
        s.items.splice(i, 1);
      } else if (s.mpPots < POT_MAX) {
        s.mpPots += 1;
        s.items.splice(i, 1);
      }
    }
  }

  // chests crack open on walk-over, seeded loot from the chest's own stream
  for (let i = 0; i < s.chests.length; i++) {
    if (s.chests[i] !== 0) continue;
    const spot = c.chestSpots[i];
    const dx = spot[0] * FINE - s.x;
    const dy = spot[1] * FINE - s.y;
    if (dx * dx + dy * dy > CHEST2) continue;
    s.chests[i] = 1;
    pushItem(s, rollLoot(CHEST_TABLE, forkAt(s, `d${s.depth}c${i}`, "loot")), spot[0] * FINE, spot[1] * FINE);
  }

  // melee on hold, skill on the space edge (mana-gated deterministic no-op)
  if (inp.down && s.swingCd === 0) doSwing(s, kit);
  if (spaceEdge && s.skillCd === 0 && s.mana >= kit.cost) doSkill(s, kit, tpx, tpy);

  // conditions tick once per second (the core's tick engine, real-time paced)
  if (s.frame % FPS === 0) {
    for (const en of s.enemies) {
      if (en.hp <= 0) continue;
      const cs = en.conds;
      if (cs.stun | cs.slow | cs.burn | cs.weaken | cs.fear) {
        const t = tickConditions(en.id, cs);
        en.conds = t.next;
        if (t.dmg > 0) {
          en.hp -= t.dmg;
          s.dmgDealt += t.dmg;
          if (en.hp <= 0) creditKill(s, en);
        }
      }
    }
  }

  // the legion acts (snapshot length: this frame's raises act next frame)
  const aliveNow = s.enemies.length;
  for (let i = 0; i < aliveNow; i++) {
    const en = s.enemies[i];
    if (en.hp <= 0) continue;
    enemyAct(s, en, aliveNow);
  }

  stepProjectiles(s);

  // the belt auto-applies at thresholds (post-damage, same frame)
  if (s.hp > 0 && s.hp * 2 <= s.hpMax && s.hpPots > 0) {
    s.hpPots -= 1;
    drinkHp(s);
  }
  if (s.mana < kit.cost && s.mpPots > 0) {
    s.mpPots -= 1;
    drinkMp(s);
  }

  // cull the fallen
  let anyDead = false;
  for (const en of s.enemies) {
    if (en.hp <= 0) {
      anyDead = true;
      break;
    }
  }
  if (anyDead) s.enemies = s.enemies.filter((en) => en.hp > 0);

  // waves -> exit (the clear pays the flat bonus; the walk-through advances)
  if (s.exitOpen === 0 && s.enemies.length === 0) {
    const waves = wavesOf(s);
    if (s.waveIdx >= waves.length) {
      s.exitOpen = 1;
      s.roomPts += ROOM_BONUS; // FLAT: deeper rooms take longer, rate plateaus
      s.roomsCleared += 1;
    } else if (s.wavePendingF > 0) {
      s.wavePendingF -= 1;
    } else {
      spawnWave(s, waves[s.waveIdx]);
      s.waveIdx += 1;
      s.wavePendingF = WAVE_GAP_F;
    }
  }
  if (s.exitOpen === 1) {
    const e = c.exit;
    if (
      s.x >= e.x * FINE &&
      s.x <= (e.x + e.w) * FINE &&
      s.y >= e.y * FINE &&
      s.y <= (e.y + e.h) * FINE
    ) {
      s.depth += 1;
      enterRoom(s);
    }
  }

  if (s.hp <= 0) {
    s.hp = 0;
    s.phase = "dead";
  }

  // THE STALL-BREAKER (balance gate f3, 2026-08-25): distinct-prime weighted
  // sum so opposing moves can never cancel (a pickup is items -29, belt +31).
  // Movement and whiffed swings deliberately do NOT count: 45s without any
  // combat, loot, wave, door or depth progress means the run is over anyway,
  // and the score it banks stopped moving long before.
  const fp =
    s.dmgDealt * 3 + s.dmgTaken * 5 + s.kills * 7 + s.potsUsed * 11 +
    s.roomsCleared * 13 + s.depth * 17 + s.waveIdx * 19 + s.exitOpen * 23 +
    s.items.length * 29 + s.hpPots * 31 + s.mpPots * 37;
  if (fp !== s.progFp) {
    s.progFp = fp;
    s.stallF = 0;
  } else if ((s.stallF += 1) >= STALL_LIMIT_F) {
    s.phase = "dead";
  }
}

/** 45s of frozen progress ends the run (stall-breaker). */
const STALL_LIMIT_F = 45 * 60;

// ── harness surface ─────────────────────────────────────────────────────────

export function hordeDone(s: HordeState): boolean {
  return s.phase === "dead";
}

export function hordeScore(s: HordeState): number {
  return s.xpPts + s.roomPts;
}

export function hordeDied(s: HordeState): boolean {
  return s.phase === "dead"; // endless: death is the only exit
}

export function hordeSimSecs(s: HordeState): number {
  return s.frame / FPS;
}

export function hordeDetail(s: HordeState): string {
  return (
    `depth ${s.depth} wave ${s.waveIdx} hp ${s.hp}/${s.hpMax} mp ${s.mana}/${s.manaMax} ` +
    `kills ${s.kills} xp ${s.xpPts} rooms ${s.roomsCleared} pots ${s.hpPots}h/${s.mpPots}m ` +
    `tiers w${s.weaponTier}s${s.spellTier}`
  );
}
