/**
 * CRYPT - the S7 Legend of Grimrock / Eye of the Beholder mirror, rebuilt
 * around ONE-ON-ONE DUELS (2026-08-28, Mike: "like Iron Jaw but with weapons
 * where you block and do spells"). Grid-based first-person dungeon crawl:
 * stepped movement on authored floor tiles, an endless descent through the
 * undead legion - but the first body to reach you LOCKS a duel, and every
 * point of damage in the game now flows through duel resolutions. Death is
 * the only exit.
 *
 * PURE AND HEADLESS (house kit): no Math.random, no Date, no canvas. Every
 * combat number comes from the S7 rules core (resolveAttack / derive /
 * scaleStatblock / tickConditions / rollLoot) - this file NEVER rolls its
 * own dice. Cash-adjacent score game: determinism is law.
 *
 * LAWS THIS FILE ENFORCES:
 *  - FORKED RNG, PLAIN STATE. One stream per entity per purpose via
 *    rngFork(seed, entityId, purpose); a hero stat change must never move an
 *    enemy's dice. Stream positions live in state as integer cursors
 *    (rngCursors) and forkAt() re-derives + fast-forwards on demand (the
 *    gauntlet idiom; draw counts are combat-scale, replay cost is noise).
 *  - SEED SELECTS, NEVER GENERATES. Floors are authored CHUNKS in
 *    content.ts; the seed picks a chunk and an encounter row per floor and
 *    nothing else. Duels are authored strike tables (DUEL_BOOK) - the seed
 *    designs nothing there either.
 *  - CEILING-NEUTRALITY (ADR-0070 lineage). Score = BESTIARY xp per kill
 *    (scaleStatblock holds xp fixed at every depth) + flat FLOOR_BONUS per
 *    descent. Gear/level buy SURVIVAL and SPEED only; a kill never pays more
 *    because you are stronger or deeper. Scores never cap (ADR-0120).
 *  - THE DUEL IS THE SKILL. Exploration is v1 navigation; enemies chase
 *    map-wide from frame 0. The first living enemy at Manhattan distance 1
 *    locks a duel: nav verbs die, the pair squares up (ENTER), then the
 *    enemy cycles its authored strike table - GAP, TELL (telegraph, floored
 *    at DUEL_TELL_FLOOR_F), resolve. Sidestep the authored side to open a
 *    VULN punish window; guard absorbs LIGHTS only (heavies pierce); feints
 *    never land and exist to buy your dodge. Strikes outside VULN are
 *    DEFLECTED (zero damage, no rng) and three in a row eat a floor-speed
 *    counter - the mash tax. Kill the duelist and NEXT (60f) frees nav while
 *    every survivor holds; the next arrival locks the next duel. Non-duelists
 *    HOLD RING at distance HOLD_DIST and never wind up.
 *  - INTEGER STATE. Every number stored on state is an int (cooldowns are
 *    frame counts, heals are floored), so fnv1a(JSON.stringify(state)) is
 *    platform-stable. Floats exist only in transit inside the rules core.
 *
 * INPUT (the s7 harness tape contract): {px, py, down, space} with px/py
 * NORMALIZED [0,1] or null, at fixed dt (one step = one 60th-second frame).
 * The ZONES never change meaning-shape (a recorded tape stays structurally
 * valid); the VERB a zone taps depends on whether a duel is locked:
 *
 *   EXPLORATION (duelPhase NONE or NEXT):
 *    px < TURN_L_X             -> turn left        (down-edge)
 *    px > TURN_R_X             -> turn right       (down-edge)
 *    middle, py < FWD_SPLIT_Y  -> step forward     (down-edge)
 *    middle, py >= FWD_SPLIT_Y -> step back        (down-edge)
 *    space edge                -> ALWAYS whiffs air (all damage flows
 *                                 through duels; the space-spam kill path
 *                                 is dead by construction)
 *
 *   DUEL (duelId locked; ENTER keeps inputs dead):
 *    px < TURN_L_X             -> sidestep L       (down-edge, dodgeCd gate)
 *    px > TURN_R_X             -> sidestep R       (down-edge, dodgeCd gate)
 *    middle, py < FWD_SPLIT_Y  -> STRIKE           (down-edge, atkCd gate)
 *    middle, py >= FWD_SPLIT_Y -> GUARD            (HOLD, via a 3f latch)
 *    space edge                -> CLASS SKILL      (skillCd gate, advantage)
 *
 * RESOLVED SPEC AMBIGUITIES (documented choices):
 *  - A deflected SPACE pays the FULL skill cooldown: a thrown skill is a
 *    spent skill (the ironjaw stamina ethos). Bots must only skill in VULN.
 *  - recoverF/punishF ride authored-raw; only gapF/tellF compress with the
 *    scaled statblock speed. Depth quickens the threat, never the reward.
 *  - A feint ALWAYS counts an enemyWhiff (a swing sold, never thrown - and
 *    the stall fingerprint must move); it banks `baited` only when it
 *    actually bought a live dodge.
 *  - Dodge outranks guard at resolution (a player doing both earned the
 *    richer window).
 *  - A VULN strike that MISSES is dice, not mash: no deflect, no mashN.
 *  - Non-duelists already adjacent when a lock lands simply stand (the ring
 *    cannot push a body out); the ring rejection applies to NEW steps only.
 *    They never wind up, so they cannot attack.
 *  - NEXT survives a descent: land the stairs during the breather and the
 *    remaining frames still hold the new floor's legion (stacks with the
 *    landing heal - survival, never score).
 *  - The locked duelist re-closes via the ordinary greedy chase if somehow
 *    knocked apart (cannot happen from the verbs; pure un-wedge insurance).
 *  - Air whiffs draw NO rng (cleaner streams; still deterministic). Blocked
 *    moves are no-ops that still consume the move cooldown.
 *  - Wizard's echo (skill) deals the SAME rolled damage to the nearest
 *    living queued body - one roll, echoed, deterministic tie-break (array
 *    order). Bard's skill weakens duelist AND nearest queued.
 *  - Chests auto-open on step-in; stairs descend on step-in; a body standing
 *    on the stairs blocks descent bodily (kill it first).
 *  - Draughts auto-drink at hp <= 50%, healing floor(hpMax/2); a killing
 *    blow kills - the belt never fires at 0 hp.
 *  - Taking the stairs heals floor(hpMax/4) (the breather on the landing).
 *    Survival only, never score; an idle hero never descends.
 *  - Derived.speed is intentionally unused (a stepped grid has no px/s);
 *    the monk's speed identity ships as authored kit cooldowns, which also
 *    scale the dodge cooldown (dodgeCdF = DODGE_CD_F * moveCdF / 12).
 *  - demo=true ignores the tape and drives a scripted duel-literate brain.
 */

import {
  fnv1a,
  rngFork,
  d,
  derive,
  resolveAttack,
  tickConditions,
  noConds,
  statblock,
  scaleStatblock,
  rollLoot,
  type Rng,
  type ClassId,
  type Loadout,
  type CondState,
} from "../_shared/rules/core";
import {
  CHUNKS,
  KITS,
  DIE_STEP,
  CHEST_TABLE,
  KILL_TABLE,
  DUEL_BOOK,
  DUEL_TELL_FLOOR_F,
  bandFor,
  MAX_TABLE_XP,
  type Chunk,
  type DuelStrike,
  type DuelStyle,
} from "./content";

export { fnv1a, DUEL_TELL_FLOOR_F };

// ── input ───────────────────────────────────────────────────────────────────

export interface SimInput {
  px: number | null; // [0,1]
  py: number | null; // [0,1]
  down: boolean;
  space: boolean;
}

// ── constants (frames at 60fps) ─────────────────────────────────────────────

export const FPS = 60;

// input geometry (the tape contract - a recorded tape stays valid forever
// because a zone always means "this verb" within its mode)
export const TURN_L_X = 0.25;
export const TURN_R_X = 0.75;
export const FWD_SPLIT_Y = 0.5;

/** @deprecated CRYPT DUELS replaced the fixed wind-up with per-strike tells
 * (DUEL_BOOK tellF, floored at DUEL_TELL_FLOOR_F). This alias keeps draw.ts
 * compiling until the presentation lane lands; renderers should read
 * s.duelTellF for the CURRENT tell's total instead. */
export const WINDUP_F = DUEL_TELL_FLOOR_F;

export const ENEMY_MOVE_CD_F = 30; // base frames per chase step, /speed scaled
export const COND_TICK_F = 60;     // condition tick cadence per enemy
export const FLOOR_BONUS = 150;    // flat per descent - NOT depth-scaled (law)
export const DESCEND_HEAL_DIV = 4; // stairs heal hpMax/DIV (see header; never score)
export const BELT_MAX = 3;         // draughts carried
export const DEMO_EVADE_F = 20;    // demo/bot: dodge when the tell dips below

// duel machine
export const DUEL_ENTER_F = 30;    // the square-up beat: inputs dead
export const DODGE_F = 22;         // sidestep i-frames (covers a floor tell whole)
export const DODGE_CD_F = 34;      // base frames between sidesteps (monk-scaled)
export const PUNISH_REACH_F = 18;  // ranger: +frames of VULN per reach beyond 1
export const MASH_COUNTER_N = 3;   // deflects in a row that eat a counter
export const NEXT_UP_F = 60;       // post-kill breather: nav LIVE, legion held
export const HOLD_DIST = 2;        // ring distance non-duelists hold at
export const GUARD_PIERCE_PUNISH_PCT = 55; // guarded light pays this % punish
export const GUARD_LATCH_F = 3;    // guard hold latch (see duelVerbs comment)

// duelPhase values (ints on state; exported for renderers/bots)
export const DP_NONE = 0;
export const DP_ENTER = 1;
export const DP_GAP = 2;
export const DP_TELL = 3;
export const DP_RECOVER = 4;
export const DP_VULN = 5;
export const DP_NEXT = 6;

export const DIR_DX = [0, 1, 0, -1] as const; // N E S W
export const DIR_DY = [-1, 0, 1, 0] as const;

// ── state ───────────────────────────────────────────────────────────────────

export interface ChestState {
  x: number;
  y: number;
  open: number; // 0|1
}

export interface EnemyState {
  id: string;   // "f{depth}s{slot}" - stable per spawn, the rng fork key
  key: string;  // bestiary id
  name: string;
  x: number;
  y: number;
  facing: number; // 0=N 1=E 2=S 3=W
  hp: number;
  hpMax: number;
  ac: number;
  atk: number;
  dmgC: number; // scaled damage dice XdY+Z
  dmgS: number;
  dmgB: number;
  xp: number;    // bestiary xp - NEVER scaled (core law)
  speed: number; // x100 int from the (scaled) statblock
  /** REUSED as the duel tell counter (CRYPT DUELS): mirrors duelF while the
   * locked enemy is in TELL (set to the compressed tellF at entry, counted
   * down), 0 otherwise. Renderers key telegraphs off it exactly as v1. */
  windup: number;
  moveCd: number;
  condF: number; // frames until next condition tick
  conds: CondState;
}

export interface CryptState {
  W: number;
  H: number;
  demo: boolean;
  seed: number; // fnv1a of the seed string; every fork derives from it
  frame: number;
  dead: number; // 0|1
  // floor
  depth: number;
  chunkIdx: number;
  chests: ChestState[];
  enemies: EnemyState[];
  // hero
  x: number;
  y: number;
  facing: number;
  classId: ClassId;
  level: number;
  hp: number;
  hpMax: number;
  ac: number;
  atk: number;
  dmgC: number;
  dmgS: number;
  dmgB: number;
  critRange: number;
  // kit (resolved ints so the renderer/bot never re-derives)
  reach: number;
  moveCdF: number;
  atkCdF: number;
  weakenTicks: number;
  cleaveEvery: number;
  healKill: number;
  // run counters
  moveCd: number;
  atkCd: number;
  belt: number;
  whet: number;    // +flat dmg, this floor only
  // ── the duel machine (CRYPT DUELS, 2026-08-28) ───────────────────────────
  duelId: string;    // locked enemy id; "" = exploration
  duelPhase: number; // DP_NONE..DP_NEXT
  duelF: number;     // frames left in the current phase
  duelPatIdx: number;// index into the duelist's DUEL_BOOK pattern
  duelStyle: "" | DuelStyle;       // published at TELL entry, "" otherwise
  duelReq: "" | "any" | "L" | "R"; // published at TELL entry
  duelTellF: number; // the CURRENT tell's compressed total (renderer truth)
  dodgeF: number;    // sidestep i-frames remaining
  dodgeSide: "" | "L" | "R";
  dodgeCd: number;
  dodgeCdF: number;  // resolved at create: DODGE_CD_F * kit.moveCdF / 12
  guardLatchF: number; // guard hold latch frames (see duelVerbs)
  mashN: number;     // consecutive deflects toward the counter
  skillCd: number;
  skillCdF: number;  // resolved at create: kit.atkCdF * 3
  punishBonusF: number; // resolved at create: (kit.reach - 1) * PUNISH_REACH_F
  // input edges
  prevDown: boolean;
  prevSpace: boolean;
  /** Stream positions: draws consumed per "entity|purpose" fork - the plain-
   * state answer to closure rngs (see header law). */
  rngCursors: Record<string, number>;
  // tally
  xpPts: number;
  floorPts: number;
  kills: number;
  floorsDescended: number;
  steps: number;
  swings: number;
  whiffs: number;      // hero swings at empty air (outside duels)
  enemyWhiffs: number; // dodged/feinted duel swings (kept name + progFp slot)
  crits: number;
  dmgDealt: number;
  dmgTaken: number;
  drinks: number;
  chestsOpened: number;
  duels: number;         // duels locked
  guards: number;        // lights absorbed by guard
  deflects: number;      // strikes thrown outside VULN
  countersEaten: number; // mash counters triggered
  baited: number;        // feints that bought a live dodge
  /** Stall-breaker (balance gate f3, 2026-08-25): fingerprint of the progress
   * counters + frames since it last moved. Corridor stalemates froze runs
   * forever; 45s with zero progress ends the run and banks the score. */
  progFp: number;
  stallF: number;
}

// ── validity + ceiling (ADR-0120: rate plateaus, score never caps) ──────────

/** THE VALIDITY ENVELOPE - honest punish-window arithmetic (re-derived for
 * duels from the authored DUEL_BOOK). The loudest body is the boneDragon
 * (MAX_TABLE_XP = 2900), fielded only in band 4 (depth 8+), where
 * scaleStatblock has it at 127 + floor(127*8/4) = 381 hp. Damage lands only
 * inside VULN windows (74/52/76/80f authored); the fastest swing hand is the
 * monk at ATK 22f but the LOUDEST is the maxed barbarian (~90 on a crit
 * 4d20+2 + whetstones), fitting 3/2/3/3 strikes per window at ATK 30f - so
 * even a consecutive-crit oracle needs >= 5 swings = 2 windows per dragon.
 * The densest window pair at depth-8 speed (134) spans ENTER 30 + gap 47 +
 * tell 34 + vuln 80 + gap 47 + tell 34 + part-vuln ~30f: >= ~270f (~4.5s)
 * per dragon = ~640 xp/s MOMENTARY, absorbed whole by burst (2900 < 3200).
 * SUSTAINED is far lower: one dragon per encounter row, ghoul escorts,
 * NEXT_UP_F between kills and MIN_STAIR_PATH walking cap an oracle floor at
 * ~13s for ~3250 pts (~250/s). perSec 650 covers the momentary math with
 * margin; burst covers one dragon kill + a descent landing on the same tick
 * (2900 + 150, rounded up). */
export function rate(): { perSec: number; burst: number } {
  return { perSec: 650, burst: MAX_TABLE_XP + FLOOR_BONUS + 150 };
}

/** THE FAR-OFF SANITY CLAMP (generous by design, per the harness law that
 * maxScore >= 5x the oracle). Math: the impossible sustained 650/s for a
 * 20-minute marathon outlier is ~780k; nothing legitimate ever grazes it.
 * The clamp stays at 2.5M (unchanged from v1 - lowering it mid-season is a
 * live-boards question, not a sim question). */
export function ceiling(): number {
  return 2_500_000;
}

// ── forked rng over plain state (the gauntlet idiom) ────────────────────────

/** Materialize the (entityId, purpose) stream at its stored cursor. Every
 * draw advances the cursor, so a later forkAt of the same pair resumes
 * exactly where this one stopped. Never hold two live forks of one pair. */
function forkAt(s: CryptState, entityId: string, purpose: string): Rng {
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

// ── create ──────────────────────────────────────────────────────────────────

const DEFAULT_LOADOUT: Loadout = {
  classId: "barbarian",
  level: 1,
  gear: { weapon: 0, armor: 0, trinket: 0 },
};

export function createCrypt(
  w: number,
  h: number,
  seed: string,
  demo: boolean,
  loadout: Loadout | null,
): CryptState {
  const lo = loadout || DEFAULT_LOADOUT;
  const dv = derive(lo);
  const kit = KITS[dv.classId];
  let sides = dv.dmgDice.sides;
  for (let i = 0; i < kit.dieStep; i++) sides = DIE_STEP[sides] || sides;
  const s: CryptState = {
    W: w | 0,
    H: h | 0,
    demo,
    seed: fnv1a(seed || "crypt"),
    frame: 0,
    dead: 0,
    depth: 0,
    chunkIdx: 0,
    chests: [],
    enemies: [],
    x: 0,
    y: 0,
    facing: 0,
    classId: dv.classId,
    level: Math.max(1, Math.min(20, lo.level | 0)),
    hp: dv.hpMax,
    hpMax: dv.hpMax,
    ac: dv.ac,
    atk: dv.atkBonus,
    dmgC: dv.dmgDice.count,
    dmgS: sides,
    dmgB: dv.dmgDice.bonus,
    critRange: dv.critRange,
    reach: kit.reach,
    moveCdF: kit.moveCdF,
    atkCdF: kit.atkCdF,
    weakenTicks: kit.weakenTicks,
    cleaveEvery: kit.cleaveEvery,
    healKill: kit.healKill,
    moveCd: 0,
    atkCd: 0,
    belt: 0,
    whet: 0,
    duelId: "",
    duelPhase: DP_NONE,
    duelF: 0,
    duelPatIdx: 0,
    duelStyle: "",
    duelReq: "",
    duelTellF: 0,
    dodgeF: 0,
    dodgeSide: "",
    dodgeCd: 0,
    dodgeCdF: Math.floor((DODGE_CD_F * kit.moveCdF) / 12), // monk dodges faster
    guardLatchF: 0,
    mashN: 0,
    skillCd: 0,
    skillCdF: kit.atkCdF * 3,
    punishBonusF: (kit.reach - 1) * PUNISH_REACH_F, // ranger reads pay longer
    prevDown: false,
    prevSpace: false,
    rngCursors: {},
    xpPts: 0,
    floorPts: 0,
    kills: 0,
    floorsDescended: 0,
    steps: 0,
    swings: 0,
    whiffs: 0,
    enemyWhiffs: 0,
    crits: 0,
    dmgDealt: 0,
    dmgTaken: 0,
    drinks: 0,
    chestsOpened: 0,
    duels: 0,
    guards: 0,
    deflects: 0,
    countersEaten: 0,
    baited: 0,
    progFp: -1, // first step always stamps a fresh fingerprint
    stallF: 0,
  };
  buildFloor(s);
  return s;
}

/** Assemble the floor at s.depth: the seed SELECTS a chunk and an encounter
 * row (one draw each, per-floor entities); bodies fill spawn cells in order
 * and harden via scaleStatblock. Whetstones do not survive the stairs. */
function buildFloor(s: CryptState): void {
  const fid = `f${s.depth}`;
  s.chunkIdx = pick(forkAt(s, fid, "layout"), CHUNKS.length);
  const ch = CHUNKS[s.chunkIdx];
  s.x = ch.entry.x;
  s.y = ch.entry.y;
  s.facing = ch.facing;
  s.chests = ch.chests.map((c) => ({ x: c.x, y: c.y, open: 0 }));
  const rows = bandFor(s.depth);
  const row = rows[pick(forkAt(s, fid, "spawn"), rows.length)];
  s.enemies = [];
  const n = Math.min(row.length, ch.spawns.length);
  for (let i = 0; i < n; i++) {
    const sb = scaleStatblock(statblock(row[i]), s.depth);
    s.enemies.push({
      id: `f${s.depth}s${i}`,
      key: sb.id,
      name: sb.name,
      x: ch.spawns[i].x,
      y: ch.spawns[i].y,
      facing: 2,
      hp: sb.hp,
      hpMax: sb.hp,
      ac: sb.ac,
      atk: sb.atkBonus,
      dmgC: sb.dmgDice.count,
      dmgS: sb.dmgDice.sides,
      dmgB: sb.dmgDice.bonus,
      xp: sb.xp,
      speed: sb.speed,
      windup: 0,
      moveCd: Math.floor((ENEMY_MOVE_CD_F * 100) / sb.speed),
      condF: COND_TICK_F,
      conds: noConds(),
    });
  }
  s.whet = 0;
}

// ── grid helpers (exported for renderers and the selfcheck bot) ─────────────

export function cryptWallAt(s: CryptState, x: number, y: number): boolean {
  const ch = CHUNKS[s.chunkIdx];
  if (x < 0 || y < 0 || x >= ch.w || y >= ch.h) return true;
  return ch.cells[y * ch.w + x] === 1;
}

export function cryptEnemyAt(s: CryptState, x: number, y: number): EnemyState | null {
  for (const e of s.enemies) if (e.hp > 0 && e.x === x && e.y === y) return e;
  return null;
}

/** First living body along the hero's facing within kit reach; walls block.
 * Renderers use it for the crosshair, bots for the approach decision. */
export function facedEnemy(s: CryptState): EnemyState | null {
  for (let r = 1; r <= s.reach; r++) {
    const cx = s.x + DIR_DX[s.facing] * r;
    const cy = s.y + DIR_DY[s.facing] * r;
    if (cryptWallAt(s, cx, cy)) return null;
    const e = cryptEnemyAt(s, cx, cy);
    if (e) return e;
  }
  return null;
}

/** BFS next-step direction from (sx,sy) toward (tx,ty) on a chunk, treating
 * `blocked` cells as walls (the target cell itself is always enterable so a
 * body can be pathed AT). Returns 0-3 or -1 when no path. Pure function -
 * the demo brain and the selfcheck bot share it; live enemies deliberately
 * do NOT (they stay greedy, per the spec). */
export function bfsNextDir(
  ch: Chunk,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  blocked: (x: number, y: number) => boolean,
): number {
  if (sx === tx && sy === ty) return -1;
  const prev = new Array(ch.w * ch.h).fill(-2); // -2 unseen, else arrival dir
  prev[sy * ch.w + sx] = -1;
  const qx = [sx];
  const qy = [sy];
  for (let head = 0; head < qx.length; head++) {
    const x = qx[head];
    const y = qy[head];
    for (let k = 0; k < 4; k++) {
      const nx = x + DIR_DX[k];
      const ny = y + DIR_DY[k];
      if (nx < 0 || ny < 0 || nx >= ch.w || ny >= ch.h) continue;
      const i = ny * ch.w + nx;
      if (prev[i] !== -2 || ch.cells[i] === 1) continue;
      if (blocked(nx, ny) && !(nx === tx && ny === ty)) continue;
      prev[i] = k;
      if (nx === tx && ny === ty) {
        // walk back to the first step out of (sx,sy)
        let cx = nx;
        let cy = ny;
        let dir = k;
        while (!(cx - DIR_DX[dir] === sx && cy - DIR_DY[dir] === sy)) {
          cx -= DIR_DX[dir];
          cy -= DIR_DY[dir];
          dir = prev[cy * ch.w + cx];
        }
        return dir;
      }
      qx.push(nx);
      qy.push(ny);
    }
  }
  return -1;
}

// ── hero actions ────────────────────────────────────────────────────────────

function tryStep(s: CryptState, dir: number): void {
  const nx = s.x + DIR_DX[dir];
  const ny = s.y + DIR_DY[dir];
  if (cryptWallAt(s, nx, ny) || cryptEnemyAt(s, nx, ny)) return; // no-op (law)
  s.x = nx;
  s.y = ny;
  s.steps += 1;
  // chest under boot: auto-open
  for (let i = 0; i < s.chests.length; i++) {
    const c = s.chests[i];
    if (c.open === 0 && c.x === s.x && c.y === s.y) {
      c.open = 1;
      s.chestsOpened += 1;
      applyItem(s, rollLoot(CHEST_TABLE, forkAt(s, `f${s.depth}c${i}`, "loot")));
    }
  }
  // the stairs: descend
  const ch = CHUNKS[s.chunkIdx];
  if (s.x === ch.stairs.x && s.y === ch.stairs.y) {
    s.floorPts += FLOOR_BONUS;
    s.floorsDescended += 1;
    s.depth += 1;
    s.hp = Math.min(s.hpMax, s.hp + Math.floor(s.hpMax / DESCEND_HEAL_DIV));
    buildFloor(s);
  }
}

function applyItem(s: CryptState, item: string): void {
  if (item === "draught") s.belt = Math.min(BELT_MAX, s.belt + 1);
  else if (item === "whetstone") s.whet += 1;
  // "nothing" falls through
}

function killEnemy(s: CryptState, e: EnemyState): void {
  const idx = s.enemies.indexOf(e);
  if (idx < 0) return;
  s.enemies.splice(idx, 1);
  s.xpPts += e.xp; // bestiary xp, NEVER scaled (law)
  s.kills += 1;
  if (s.healKill > 0) s.hp = Math.min(s.hpMax, s.hp + s.healKill);
  applyItem(s, rollLoot(KILL_TABLE, forkAt(s, e.id, "loot")));
  // the duelist falls: NEXT frees nav while the survivors hold - the
  // repositioning / stairs sprint is the strategic out
  if (s.duelId === e.id) {
    s.duelId = "";
    s.duelPhase = DP_NEXT;
    s.duelF = NEXT_UP_F;
    s.duelStyle = "";
    s.duelReq = "";
    s.duelTellF = 0;
    s.mashN = 0;
  }
}

function hitEnemy(s: CryptState, e: EnemyState, dmg: number): void {
  e.hp -= dmg;
  s.dmgDealt += dmg;
  if (e.hp <= 0) killEnemy(s, e);
}

// ── the duel machine ────────────────────────────────────────────────────────

function dirToward(fx: number, fy: number, tx: number, ty: number): number {
  if (tx > fx) return 1;
  if (tx < fx) return 3;
  if (ty > fy) return 2;
  return 0;
}

function duelist(s: CryptState): EnemyState | null {
  if (s.duelId === "") return null;
  for (const e of s.enemies) if (e.id === s.duelId && e.hp > 0) return e;
  return null;
}

function curStrike(s: CryptState, e: EnemyState): DuelStrike {
  const pat = DUEL_BOOK[e.key];
  return pat[s.duelPatIdx % pat.length];
}

/** GAP entry: the beat before the tell. Style/req unpublish. */
function enterGap(s: CryptState, e: EnemyState): void {
  const st = curStrike(s, e);
  s.duelPhase = DP_GAP;
  s.duelF = Math.max(1, Math.floor((st.gapF * 100) / e.speed));
  s.duelStyle = "";
  s.duelReq = "";
  s.duelTellF = 0;
  e.windup = 0;
}

/** TELL entry: publish style/req/total; the enemy's `windup` mirrors duelF
 * so the v1 telegraph render + foe-die triggers survive structurally. */
function enterTell(s: CryptState, e: EnemyState, frames: number): void {
  const st = curStrike(s, e);
  s.duelPhase = DP_TELL;
  s.duelF = frames;
  s.duelTellF = frames;
  s.duelStyle = st.style;
  s.duelReq = st.req;
  e.windup = frames;
  e.facing = dirToward(e.x, e.y, s.x, s.y);
}

function enterVuln(s: CryptState, frames: number): void {
  s.duelPhase = DP_VULN;
  s.duelF = Math.max(1, frames);
  s.mashN = 0; // a fresh window owes no old mash debt
}

/** The strike resolves this frame. What it resolves INTO is the style + the
 * hero's answer (dodge > guard > dice), mirroring the ironjaw machine. */
function resolveStrike(s: CryptState, e: EnemyState, st: DuelStrike): void {
  s.duelStyle = "";
  s.duelReq = "";
  s.duelTellF = 0;
  e.windup = 0;
  if (st.style === "feint") {
    // A FEINT NEVER LANDS. Its payload is the dodge it bought - and the
    // whiff still moves the stall fingerprint (law).
    s.enemyWhiffs += 1;
    if (s.dodgeF > 0) s.baited += 1;
    s.duelPhase = DP_RECOVER;
    s.duelF = st.recoverF;
    return;
  }
  const dodged = s.dodgeF > 0 && (st.req === "any" || s.dodgeSide === st.req);
  if (dodged) {
    s.enemyWhiffs += 1; // NO rng draw - a won read is a certainty
    enterVuln(s, st.punishF + s.punishBonusF);
    return;
  }
  if (st.style === "light" && s.guardLatchF > 0) {
    s.guards += 1; // zero damage, no rng; a guarded light opens the short window
    enterVuln(s, Math.floor((st.punishF * GUARD_PIERCE_PUNISH_PCT) / 100));
    return;
  }
  // the strike lands on dice (HEAVIES PIERCE guard entirely - feet or nothing)
  const out = resolveAttack({
    attackerId: e.id,
    targetId: "hero",
    atkBonus: e.atk - (e.conds.weaken > 0 ? 2 : 0),
    dmgDice: d(e.dmgC, e.dmgS, e.dmgB),
    critRange: 20,
    defAc: s.ac,
    adv: 0,
    rng: forkAt(s, e.id, "attack"),
  });
  if (out.hit) {
    const dmg = Math.floor((out.dmg * st.dmgMulPct) / 100);
    s.hp -= dmg;
    s.dmgTaken += dmg;
  }
  s.duelPhase = DP_RECOVER;
  s.duelF = st.recoverF;
}

/** One frame of the duel machine, called from stepCrypt BEFORE the enemy
 * loop. Owns duelF, the phase graph and the duelist's `windup` mirror. */
function duelStep(s: CryptState): void {
  if (s.duelPhase === DP_NONE) {
    // the first living body at Manhattan 1 locks the duel
    for (const e of s.enemies) {
      if (e.hp <= 0) continue;
      if (Math.abs(e.x - s.x) + Math.abs(e.y - s.y) !== 1) continue;
      s.duelId = e.id;
      s.duels += 1;
      s.duelPhase = DP_ENTER;
      s.duelF = DUEL_ENTER_F;
      s.duelPatIdx = 0;
      s.duelStyle = "";
      s.duelReq = "";
      s.duelTellF = 0;
      s.mashN = 0;
      s.facing = dirToward(s.x, s.y, e.x, e.y); // hero squares up
      e.facing = dirToward(e.x, e.y, s.x, s.y); // so does the challenger
      e.windup = 0;
      return;
    }
    return;
  }
  if (s.duelPhase === DP_NEXT) {
    s.duelF -= 1;
    if (s.duelF <= 0) {
      s.duelPhase = DP_NONE;
      s.duelF = 0;
    }
    return;
  }
  const e = duelist(s);
  if (!e) {
    // defensive: a duelist can only vanish through killEnemy (which routes
    // to NEXT); this path exists so a broken state can never wedge the run
    s.duelId = "";
    s.duelPhase = DP_NEXT;
    s.duelF = NEXT_UP_F;
    return;
  }
  s.duelF -= 1;
  if (s.duelPhase === DP_TELL) e.windup = s.duelF > 0 ? s.duelF : 0;
  if (s.duelF > 0) return;
  const st = curStrike(s, e);
  if (s.duelPhase === DP_ENTER) {
    enterGap(s, e);
  } else if (s.duelPhase === DP_GAP) {
    enterTell(s, e, Math.max(DUEL_TELL_FLOOR_F, Math.floor((st.tellF * 100) / e.speed)));
  } else if (s.duelPhase === DP_TELL) {
    resolveStrike(s, e, st);
  } else {
    // RECOVER or VULN expired: next strike of the pattern
    s.duelPatIdx = (s.duelPatIdx + 1) % DUEL_BOOK[e.key].length;
    enterGap(s, e);
  }
}

// ── duel verbs ──────────────────────────────────────────────────────────────

/** A strike thrown outside VULN: zero damage, NO rng, the cooldown is still
 * paid - and three in a row eat a counter at the floor tell. The mash tax. */
function deflect(s: CryptState): void {
  s.swings += 1;
  s.deflects += 1;
  s.mashN += 1;
  if (s.mashN >= MASH_COUNTER_N) {
    s.mashN = 0;
    s.countersEaten += 1;
    const e = duelist(s);
    if (e) enterTell(s, e, DUEL_TELL_FLOOR_F); // readable, punishing
  }
}

/** The real dice, VULN only. A miss here is dice, not mash. */
function duelStrike(s: CryptState, e: EnemyState): void {
  s.swings += 1;
  const out = resolveAttack({
    attackerId: "hero",
    targetId: e.id,
    atkBonus: s.atk,
    dmgDice: d(s.dmgC, s.dmgS, s.dmgB),
    critRange: s.critRange,
    defAc: e.ac,
    adv: 0,
    rng: forkAt(s, "hero", "attack"),
  });
  if (!out.hit) return;
  if (out.crit) s.crits += 1;
  hitEnemy(s, e, out.dmg + s.whet);
}

/** CLASS SKILL: the heroAttack dice core at advantage, plus each class's
 * duel identity - wizard echoes the full rolled damage to the nearest
 * living queued body (deterministic tie-break: array order), bard weakens
 * duelist AND nearest queued. Barbarian's die step is baked into dmgS,
 * ranger's reach into punishBonusF, monk's speed into the cooldowns,
 * cleric's rites into killEnemy - kit ints ride through as authored. */
function duelSkill(s: CryptState, e: EnemyState): void {
  s.swings += 1;
  const out = resolveAttack({
    attackerId: "hero",
    targetId: e.id,
    atkBonus: s.atk,
    dmgDice: d(s.dmgC, s.dmgS, s.dmgB),
    critRange: s.critRange,
    defAc: e.ac,
    adv: 1,
    rng: forkAt(s, "hero", "attack"),
  });
  if (!out.hit) return;
  if (out.crit) s.crits += 1;
  const dmg = out.dmg + s.whet;
  // nearest living queued body, chosen BEFORE the main hit can splice the
  // array (Manhattan distance; ties break by array order - deterministic)
  let near: EnemyState | null = null;
  let nearD = 0;
  for (const q of s.enemies) {
    if (q.hp <= 0 || q.id === e.id) continue;
    const dd = Math.abs(q.x - s.x) + Math.abs(q.y - s.y);
    if (near === null || dd < nearD) {
      near = q;
      nearD = dd;
    }
  }
  if (s.weakenTicks > 0) {
    e.conds.weaken = Math.min(9, e.conds.weaken + s.weakenTicks);
    if (near) near.conds.weaken = Math.min(9, near.conds.weaken + s.weakenTicks);
  }
  hitEnemy(s, e, dmg);
  if (s.cleaveEvery > 0 && near) hitEnemy(s, near, dmg); // the echo, one roll
}

function tryDodge(s: CryptState, side: "L" | "R"): void {
  if (s.dodgeCd > 0) return;
  s.dodgeF = DODGE_F;
  s.dodgeSide = side;
  s.dodgeCd = s.dodgeCdF;
}

function duelVerbs(s: CryptState, inp: SimInput, downEdge: boolean, spaceEdge: boolean): void {
  // GUARD IS A HOLD, read through a 3-frame latch: every frame the low-centre
  // zone is down re-arms guardLatchF = 3, and "guarding" means latch > 0.
  // LOAD-BEARING: the keyboard synthesizer (bots, key-verb shims) presses on
  // alternating frames, so a raw `inp.down` guard would flicker off exactly
  // on resolution frames - the latch absorbs that parity flicker.
  if (
    inp.down &&
    inp.px !== null &&
    inp.py !== null &&
    inp.px >= TURN_L_X &&
    inp.px <= TURN_R_X &&
    inp.py >= FWD_SPLIT_Y
  )
    s.guardLatchF = GUARD_LATCH_F;
  if (downEdge && inp.px !== null && inp.py !== null) {
    if (inp.px < TURN_L_X) tryDodge(s, "L");
    else if (inp.px > TURN_R_X) tryDodge(s, "R");
    else if (inp.py < FWD_SPLIT_Y && s.atkCd === 0) {
      s.atkCd = s.atkCdF;
      const e = duelist(s);
      if (s.duelPhase === DP_VULN && e) duelStrike(s, e);
      else deflect(s);
    }
  }
  if (spaceEdge && s.skillCd === 0) {
    // a deflected skill pays the FULL skill cooldown (header choice)
    s.skillCd = s.skillCdF;
    const e = duelist(s);
    if (s.duelPhase === DP_VULN && e) duelSkill(s, e);
    else deflect(s);
  }
}

function explorationVerbs(s: CryptState, inp: SimInput, downEdge: boolean, spaceEdge: boolean): void {
  // movement verbs: down-edge + zone, gated by the move cooldown (v1)
  if (downEdge && inp.px !== null && inp.py !== null && s.moveCd === 0) {
    s.moveCd = s.moveCdF; // paid for blocked no-ops too (header choice)
    if (inp.px < TURN_L_X) s.facing = (s.facing + 3) & 3;
    else if (inp.px > TURN_R_X) s.facing = (s.facing + 1) & 3;
    else if (inp.py < FWD_SPLIT_Y) tryStep(s, s.facing);
    else tryStep(s, (s.facing + 2) & 3);
  }
  // space outside a duel ALWAYS whiffs air: no rng, no damage, ever - all
  // damage flows through duels now (the space-spam kill path is dead)
  if (spaceEdge && s.atkCd === 0) {
    s.atkCd = s.atkCdF;
    s.swings += 1;
    s.whiffs += 1;
  }
}

// ── enemy phase ─────────────────────────────────────────────────────────────

function enemyStep(s: CryptState, e: EnemyState): void {
  // conditions tick on the enemy's own clock, through the core
  e.condF -= 1;
  if (e.condF <= 0) {
    e.condF = COND_TICK_F;
    const tc = tickConditions(e.id, e.conds);
    e.conds = tc.next;
    if (tc.dmg > 0) {
      e.hp -= tc.dmg; // burn credit lands via the post-loop sweep
      if (e.hp <= 0) return;
    }
  }
  if (e.conds.stun > 0) return;
  const dist = Math.abs(e.x - s.x) + Math.abs(e.y - s.y);
  const duelUp = s.duelId !== "" || s.duelPhase === DP_NEXT;
  let ringHold = false;
  if (s.duelId === e.id) {
    // THE LOCKED DUELIST: held by the machine (duelStep owns its windup and
    // its swings). If somehow knocked apart it re-closes via the ordinary
    // greedy chase below - pure un-wedge insurance, unreachable from verbs.
    e.facing = dirToward(e.x, e.y, s.x, s.y);
    if (dist <= 1) return;
  } else if (duelUp) {
    // THE HOLD RING: while a duel or the NEXT breather is up, non-duelists
    // never wind up and never crowd the arena - they chase only while
    // outside the ring and never step adjacent to the hero.
    if (dist <= HOLD_DIST) return;
    ringHold = true;
  } else if (dist === 1) {
    // exploration adjacency: square up and wait - next frame's duelStep
    // locks the duel (no wind-up ever starts outside the machine)
    e.facing = dirToward(e.x, e.y, s.x, s.y);
    return;
  }
  // chase, greedy: long axis first, blocked -> other axis, stand otherwise
  if (e.moveCd > 0) {
    e.moveCd -= 1;
    return;
  }
  const dx = s.x - e.x;
  const dy = s.y - e.y;
  const stepX = dx > 0 ? 1 : dx < 0 ? 3 : -1;
  const stepY = dy > 0 ? 2 : dy < 0 ? 0 : -1;
  let first = stepX;
  let second = stepY;
  if (Math.abs(dy) > Math.abs(dx)) {
    first = stepY;
    second = stepX;
  } else if (Math.abs(dy) === Math.abs(dx) && stepX >= 0 && stepY >= 0) {
    // exact diagonal: the enemy's OWN move stream breaks the tie
    if (pick(forkAt(s, e.id, "move"), 2) === 1) {
      first = stepY;
      second = stepX;
    }
  }
  for (const dir of [first, second]) {
    if (dir < 0) continue;
    const nx = e.x + DIR_DX[dir];
    const ny = e.y + DIR_DY[dir];
    if (cryptWallAt(s, nx, ny)) continue;
    if (nx === s.x && ny === s.y) continue;
    if (ringHold && Math.abs(nx - s.x) + Math.abs(ny - s.y) <= 1) continue; // ring law
    if (cryptEnemyAt(s, nx, ny)) continue;
    e.x = nx;
    e.y = ny;
    e.facing = dir;
    break;
  }
  e.moveCd = Math.floor((ENEMY_MOVE_CD_F * 100) / e.speed); // paid even when boxed in
}

// ── the demo brain (scripted showcase; deterministic pure fn of state) ──────

/** Drives the crypt when demo=true: hunt the nearest body via BFS until a
 * duel locks, then fight it properly - dodge late on the published side,
 * read and ignore feints (the brain reads duelStyle, which the renderer
 * also publishes - fair for a showcase), spend the skill then strikes in
 * VULN, reposition during NEXT. Presses alternate on frame parity so every
 * verb is a clean edge. */
function demoBrain(s: CryptState): SimInput {
  const press = (s.frame & 1) === 0;
  if (s.duelId !== "") {
    if (s.duelPhase === DP_VULN) {
      if (s.skillCd === 0) return { px: null, py: null, down: false, space: press };
      if (s.atkCd === 0) return { px: 0.5, py: 0.25, down: press, space: false };
      return { px: null, py: null, down: false, space: false };
    }
    if (
      s.duelPhase === DP_TELL &&
      s.duelStyle !== "feint" &&
      s.dodgeCd === 0 &&
      s.duelF <= DEMO_EVADE_F
    ) {
      return s.duelReq === "R"
        ? { px: 0.9, py: 0.5, down: press, space: false }
        : { px: 0.1, py: 0.5, down: press, space: false };
    }
    return { px: null, py: null, down: false, space: false };
  }
  // exploration (NONE or NEXT): hunt the nearest body, else the stairs
  const ch = CHUNKS[s.chunkIdx];
  let tx = ch.stairs.x;
  let ty = ch.stairs.y;
  let bd = -1;
  for (const e of s.enemies) {
    const dd = Math.abs(e.x - s.x) + Math.abs(e.y - s.y);
    if (bd < 0 || dd < bd) {
      bd = dd;
      tx = e.x;
      ty = e.y;
    }
  }
  const dir = bfsNextDir(ch, s.x, s.y, tx, ty, (x, y) => cryptEnemyAt(s, x, y) !== null && !(x === tx && y === ty));
  if (dir < 0) return { px: null, py: null, down: false, space: false };
  if (dir === s.facing) return { px: 0.5, py: 0.25, down: press, space: false };
  const delta = (dir - s.facing + 4) & 3;
  return delta === 3
    ? { px: 0.1, py: 0.5, down: press, space: false }
    : { px: 0.9, py: 0.5, down: press, space: false };
}

// ── step ────────────────────────────────────────────────────────────────────

export function stepCrypt(s: CryptState, dt: number, input: SimInput): void {
  void dt; // the contract: one call = one 60th-second frame; s counts frames
  if (s.dead === 1) return;
  s.frame += 1;
  const inp = s.demo ? demoBrain(s) : input;
  // global timers (dodge/guard decay BEFORE verbs, so a fresh press this
  // frame stands at full value through this frame's resolution)
  if (s.moveCd > 0) s.moveCd -= 1;
  if (s.atkCd > 0) s.atkCd -= 1;
  if (s.skillCd > 0) s.skillCd -= 1;
  if (s.dodgeCd > 0) s.dodgeCd -= 1;
  if (s.dodgeF > 0) {
    s.dodgeF -= 1;
    if (s.dodgeF === 0) s.dodgeSide = "";
  }
  if (s.guardLatchF > 0) s.guardLatchF -= 1;
  const downEdge = inp.down && !s.prevDown;
  const spaceEdge = inp.space && !s.prevSpace;
  s.prevDown = inp.down;
  s.prevSpace = inp.space;
  if (s.duelPhase === DP_ENTER) {
    // the square-up beat: inputs dead. Edges above still tracked, so a press
    // held across the lock can never fire stale on GAP's first frame.
  } else if (s.duelId !== "") {
    duelVerbs(s, inp, downEdge, spaceEdge);
  } else {
    explorationVerbs(s, inp, downEdge, spaceEdge);
  }
  // the duel machine, then the legion
  duelStep(s);
  for (let i = 0; i < s.enemies.length; i++) enemyStep(s, s.enemies[i]);
  // burn-death sweep (kill credit to the hero; splice-safe backwards walk)
  for (let i = s.enemies.length - 1; i >= 0; i--)
    if (s.enemies[i].hp <= 0) killEnemy(s, s.enemies[i]);
  // the belt: auto-drink at half hp - a killing blow still kills
  if (s.hp > 0 && s.hp * 2 <= s.hpMax && s.belt > 0) {
    s.belt -= 1;
    s.drinks += 1;
    s.hp = Math.min(s.hpMax, s.hp + Math.floor(s.hpMax / 2));
  }
  if (s.hp <= 0) {
    s.hp = 0;
    s.dead = 1;
  }

  // THE STALL-BREAKER (balance gate f3, 2026-08-25; duel-audited 2026-08-28):
  // distinct-prime weighted sum so opposing moves can never cancel. The
  // >= 1-light book law keeps it moving through any legal duel: EVERY strike
  // resolution lands in dmgTaken (hit), guards (guarded light), or
  // enemyWhiffs (dodge/feint) except a raw dice miss, and the slowest
  // authored loop (necromancer heavy, ~190f compressed) fits 14+ strikes in
  // the 45s window - an all-miss streak that long is < 1e-5 and the breaker
  // banking a wedged run is exactly its job. Steps, duels and guards count
  // as progress; deflects deliberately do NOT (mash is not progress).
  const fp =
    s.kills * 3 + s.dmgDealt * 5 + s.dmgTaken * 7 + s.floorsDescended * 11 +
    s.chestsOpened * 13 + s.drinks * 17 + s.belt * 19 + s.steps * 23 +
    s.enemyWhiffs * 29 + s.guards * 31 + s.duels * 37;
  if (fp !== s.progFp) {
    s.progFp = fp;
    s.stallF = 0;
  } else if ((s.stallF += 1) >= STALL_LIMIT_F) {
    s.dead = 1;
  }
}

/** 45s of frozen progress ends the run (stall-breaker). */
const STALL_LIMIT_F = 45 * 60;

// ── score + status ──────────────────────────────────────────────────────────

export function cryptDone(s: CryptState): boolean {
  return s.dead === 1;
}

/** Score = bestiary xp banked + flat descent bonuses. Nothing else, ever. */
export function cryptScore(s: CryptState): number {
  return s.xpPts + s.floorPts;
}

/** Death is the only exit, so done and died coincide (harness adapter shape). */
export function cryptDied(s: CryptState): boolean {
  return s.dead === 1;
}

export function cryptSimSecs(s: CryptState): number {
  return s.frame / FPS;
}

export function cryptDetail(s: CryptState): string {
  return (
    `depth ${s.depth} kills ${s.kills} xp ${s.xpPts} floors ${s.floorPts} ` +
    `hp ${s.hp}/${s.hpMax} belt ${s.belt} whet ${s.whet} ` +
    `duels ${s.duels} guards ${s.guards} dodges ${s.enemyWhiffs} ` +
    `deflects ${s.deflects} counters ${s.countersEaten} baited ${s.baited} ` +
    `crits ${s.crits} dealt ${s.dmgDealt} taken ${s.dmgTaken}`
  );
}
