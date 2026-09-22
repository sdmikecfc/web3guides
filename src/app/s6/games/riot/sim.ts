/**
 * RIOT - the S6 belt-scrolling brawler (the Battletoads/arcade-brawler
 * class, ADR-0124). Three authored levels - streets, forest, facility -
 * each ending in a boss, then the ENDLESS ARENA where waves keep coming
 * harder until the pace kills you. Enemies are the Warden's machines.
 *
 * PURE AND HEADLESS (kit §4): no Math.random, no Date, no in-run rng
 * beyond s.rng (mulberry32 of the seed) - authored levels (levels.ts,
 * design space 640x400), deterministic AI, and the daily seed only
 * selects the level set.
 *
 * THE BELT: every actor is (x, y, z) - x world, y depth inside the
 * 252..388 band, z height. A hit connects iff the facing-side x-reach
 * passes AND |dy| <= Y_TOL AND z-windows overlap. The shadow at (x, y)
 * is ground truth; painter's sort by y is render-only.
 *
 * THE CAMERA IS SIM STATE: camera lock is a game rule (it gates spawns
 * and clamps the player), so s.camX/s.camLock live here, move by exact
 * linear arithmetic (no easing drift), and the Client's pointerTransform
 * adds camX so tapes carry WORLD coordinates and replay camera-free.
 *
 * VERBS (tape carries px/py/down/space; WASD rides the shell's booleans):
 *   DRAG the pointer (>= DRAG_PX from the press origin) / move keys = walk
 *     toward the pointer (committed x-walk >= 20f = run). An undragged
 *     press NEVER moves the fighter, no matter how long it is held.
 *   release an UNDRAGGED press (any duration, anywhere) = ATTACK, fired
 *     along current facing (autoFace flips only when a machine is in reach
 *     behind and none in front - the belt-scroller convention):
 *     grounded  jab-jab-SMASH chain (26f chain window; smash knocks down)
 *     running   dash attack (guard-breaking, knockdown)
 *     airborne  jump attack (guard-breaking)
 *     armed     weapon swing replaces the jab (pipe kd / blaster bolt)
 *   Space press edge = jump; knockdown drops your weapon at your feet
 *   weapon pickup is AUTOMATIC on ground overlap while unarmed; authored
 *   health packs (levels.ts) heal HEAL_PACK_HP on overlap while hurt
 *
 * THE BATTLE CIRCLE: only s.atkTokens machines may attack at once (2 in
 * level fights, escalating in the arena); denied machines strafe to a
 * seeded y-target and re-request. Every attack telegraphs: TELL_FLOOR_F
 * is a validator-asserted floor and NO escalation term ever compresses a
 * tell - the pace beats you, never the read (the ironjaw kill-screen
 * model).
 *
 * WAVES: walk right -> triggerX -> camera LOCKS at the authored lockCamX
 * -> authored spawns walk in from the locked screen's edges and DOORS
 * (ENTRY_WARM_F frames: visible, shootable, harmless) -> next wave when
 * live <= 1 -> last kill unlocks + GO arrow + FIGHT_CLEAR_PTS.
 *
 * SCORES NEVER CAP (ADR-0120): after boss 3 the arena cycles authored
 * waves with gap/cooldown decay to floors, capped speed, escalating
 * tokens, and ONE unbounded term - ARENA_DMG_STEP per lap - so death is
 * mathematical for any player somewhere in laps 5-9 and the oracle dies
 * well inside the harness frame cap. Wave VALUE plateaus; wave COUNT
 * does not.
 *
 * STATS (ceiling-neutral, ADR-0070) - THE MAPPING:
 *   Plating (botox 0-4):  +6 max HP per level (40 -> 64)
 *   Reactor (drugs 0-4):  +6% move speed per level
 *   Cloak  (ozempic 0-4): +8f wakeup i-frames per level (40 -> 72)
 *   Payload (aura 0-30):  +1% attack damage per point (faster kills,
 *                         same points; run length is death-bound)
 *   Sensors (optics 0-4): the tell becomes VISIBLE 3f per level earlier
 *                         inside the constant windup (tellVisibleF only;
 *                         the resolve frame never moves)
 *
 * CONTRACT STATUS: hour-0 freeze 2026-08-15. Types, constants and
 * function signatures are FROZEN - the Client and the harness build
 * against exactly this shape, and the tape hash is fnv1a(JSON) of the
 * WHOLE state, so any field added after the freeze costs a re-record.
 * create/step bodies are the sim track's to fill.
 */

import {
  LEVEL_SETS,
  ARENA_WAVES,
  levelSetForSeed,
  KILL_PTS,
  FIGHT_CLEAR_PTS,
  BOSS_PTS,
  ARENA_WAVE_PTS,
  EN_STATS,
  HEAL_PACK_HP,
  type LevelSet,
  type LevelDef,
  type FightDef,
  type BossDef,
  type EnemyKind,
} from "./levels";

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

// ── space ──────────────────────────────────────────────────────────────────
export const DESIGN_W = 640;
export const DESIGN_H = 400;
export const FLOOR_TOP = 252;
export const FLOOR_BOT = 388;
export const Y_TOL = 12;
const CAM_SPEED = 340;
const CAM_LEAD = 280;

// ── player ─────────────────────────────────────────────────────────────────
const PLAYER_SPEED = 170; // x px/s; y moves at Y_SPEED_MUL
const Y_SPEED_MUL = 0.7;
const RUN_RAMP_F = 20; // committed x-walk frames before run
const RUN_MUL = 1.45;
const JUMP_VZ = 340;
const GRAV = 1200; // apex ~48px, airtime ~0.57s
const PLAYER_HP_BASE = 40;

// ── attacks (startup/active/recover frames, dmg) ───────────────────────────
const JAB = { su: 5, act: 3, rec: 8, dmg: 4 }; // chain stages 1+2
const SMASH = { su: 7, act: 3, rec: 16, dmg: 10 }; // stage 3: knockdown
const CHAIN_GAP_F = 26; // window to continue the chain
const JAB_REACH = 48;
const DASH_ATK = { su: 4, act: 6, rec: 14, dmg: 8 }; // guard-breaking, kd
const JUMP_ATK_DMG = 8; // active while airborne + descending; guard-breaking
/** THE CLICK LAW v3 (Mike 2026-08-17, deployed round 4: "clicking doesn't
 * punch. It makes him run. It's very inconsistent"). Attempts one (8f
 * duration window) and two (16f window + 64px near radius) both failed the
 * same way: any rule keyed on press DURATION or press DISTANCE misreads
 * real clicks - a relaxed 300ms click far from the fighter is still a
 * click, and under v2 it walked. The grammar is now Mike's sentence
 * verbatim, keyed on the ONE thing that separates the two intents:
 *
 *   CLICK = PUNCH.  A press whose pointer never travels DRAG_PX from where
 *     it landed is a punch on RELEASE - at ANY duration, ANYWHERE on
 *     screen. It never moves the fighter, not even one frame.
 *   DRAG = MOVE.    Movement exists ONLY while a press is classified as a
 *     drag (pointer moved >= DRAG_PX from its press origin; sticky until
 *     release). Keep the drag held and the walk ramps into a run. A
 *     dragged release is spent movement and never punches.
 *
 * MEASURED, not tasted (1800 synthetic traces through the real stepRiot of
 * both trees; punches 60-400ms with 0-6px jitter at 20/100/300px, drags
 * 30-200px, steered holds 40-120px/s): the old rule classified 33.3% of
 * intended punches as clean punches (far presses always walked first and
 * flipped facing 15-36% of the time - Mike's two defects exactly); this
 * rule scores 100.0% punches / 99.2% walks. The only walk "misses" were
 * steers that never left a 14px disc in 1-2s, which ARE clicks under the
 * law. DRAG_PX 14 sits between measured click jitter (<= 6px) and the
 * smallest deliberate drag (30px).
 *
 * THE PUNCH NEVER TURNS TOWARD THE CLICK (the round-4 "turns around and
 * punches when I didn't move" defect): it fires along current facing, and
 * auto-flips only per the belt-scroller convention in autoFace(). */
const DRAG_PX = 14; // pointer travel from press origin that makes a press movement
const BLASTER_AIM_R = 260; // autoFace target scan reach when armed with the blaster

// ── hitstop (deterministic freeze counters, on the tape) ───────────────────
const HITSTOP_LIGHT = 5;
const HITSTOP_HEAVY = 9;
const HITSTOP_VICTIM_EXTRA = 2;

// ── knockback ballistics + knockdown ───────────────────────────────────────
const KB_VX = 260;
const KB_VZ = 300; // vx/vz + GRAV in-sim; down = invulnerable, no juggling
const DOWN_F = 50;
const GETUP_F = 18;
const WAKEUP_IF_BASE = 40; // +8 per Cloak level

// ── entries + grace ────────────────────────────────────────────────────────
export const ENTRY_WARM_F = 40; // walk-in frames: shootable, harmless
const ENTRY_GRACE = 48; // player iframes on level/arena entry

// ── weapons ────────────────────────────────────────────────────────────────
const PIPE = { dmg: 12, uses: 8, reach: 56 }; // knockdown on hit
const BLASTER = { dmg: 8, uses: 6, speed: 420, life: 1.2 };

// ── arena escalation (lap = floor(arenaWave / 4)) ──────────────────────────
const ARENA_GAP0_F = 300;
const ARENA_GAP_DECAY = 0.9; // gap decays to a floor
const ARENA_GAP_FLOOR_F = 60;
const ARENA_SPEED_STEP = 0.08; // capped: uncatchable is broken, not hard
const ARENA_SPEED_CAP = 1.8;
const ARENA_CD_DECAY = 0.9; // attack cooldown decays to a floor
const ARENA_CD_FLOOR = 0.22;
/** THE KILL SCREEN (ADR-0120): the per-lap damage bonus is deliberately
 * UNCAPPED. Once a leak costs half a health bar the arena ends every run,
 * including the frame-perfect oracle's - which is what keeps the record
 * run inside the harness frame cap. Tells stay readable (TELL_FLOOR_F);
 * the PACE is what finally beats you. */
const ARENA_DMG_STEP = 3;
const ARENA_TOKENS = (lap: number) => Math.min(4, 2 + Math.floor(lap / 2));
const ARENA_LIVE_CAP = 7; // relentless, never a pile

/** Anti-hang backstop only (SIM seconds = wall seconds here; RIOT never
 * scales time). The escalation kills every real run long before this.
 * Never a score-shaving clock (ADR-0120). */
export const MISSION_T = 3600;

// ── state ──────────────────────────────────────────────────────────────────
export type PFsm =
  | "idle"
  | "walk"
  | "run"
  | "attack"
  | "jump"
  | "jumpatk"
  | "hit"
  | "down"
  | "getup";
export type EFsm =
  | "enter"
  | "approach"
  | "strafe"
  | "windup"
  | "attack"
  | "recover"
  | "stun"
  | "down"
  | "getup"
  | "dead";
/** Which attack animation the player is in - the Client's animFor reads
 * this plus fsmF/fsmDur so the picture and the hitbox share one clock. */
export type AttackId = "" | "jab1" | "jab2" | "finisher" | "swing" | "dash" | "jumpkick";

export interface Fighter {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  face: 1 | -1;
  fsm: PFsm;
  fsmF: number; // frames left in the current state
  fsmDur: number; // authored total frames of the current state (render clock)
  attackId: AttackId;
  comboStage: 0 | 1 | 2 | 3;
  chainF: number; // frames left to continue the chain
  runF: number; // consecutive committed x-walk frames
  hp: number;
  hpMax: number;
  iframes: number; // wakeup + entry grace
  freeze: number; // hitstop frames
  weapon: "" | "pipe" | "blaster";
  weaponUses: number;
}

export interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  face: 1 | -1;
  hp: number;
  fsm: EFsm;
  fsmF: number;
  fsmDur: number;
  atkToken: boolean; // holds one of s.atkTokens
  strafeY: number; // seeded strafe target while denied
  cdF: number; // frames until the next token request
  tellF: number; // windup frames remaining (>0 = telegraphing)
  lane: number; // charger: the y locked at tell start
  freeze: number;
  warmF: number; // door/edge walk-in: shootable, harmless
}

export interface Boss {
  kind: "charge" | "limbs" | "warp";
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  hp: number;
  hpMax: number;
  fsm: "gap" | "tell" | "attack" | "recover" | "vuln" | "dead";
  fsmF: number;
  fsmDur: number;
  patIdx: number; // index into the authored attack pattern
  attackId: number; // which of the 3 attacks is telling/active
  cycleN: number; // attacks since the last vuln window
  lane: number; // charge lane lock / limb lane
  anchor: number; // warp boss: current authored anchor index
  freeze: number;
}

export interface Bolt {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
  mine: boolean; // player blaster vs machine bolt
  dead: boolean;
}

/** Bomber lob - the stopclock arc contract verbatim: detonates at the
 * authored mark, the mark is drawn on the floor from launch, z is
 * render-derived from arc progress. */
export interface Bomb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  arcLen: number;
  dead: boolean;
}

/** Ground pickups. Weapons (pipe/blaster) drop from carriers and knockdowns;
 * "health" is AUTHORED ONLY (levels.ts packs - Mike's "odd health pack",
 * 2026-08-17): heals HEAL_PACK_HP, grabbed only when hurt so a full bar
 * never wastes it, and never blocked by a carried weapon. */
export interface Pickup {
  x: number;
  y: number;
  kind: "pipe" | "blaster" | "health";
  uses: number;
  taken: boolean;
}

export interface RiotState {
  W: number;
  H: number;
  k: number;
  demo: boolean;
  t: number; // SIM seconds (= wall seconds; no time scaling)
  wallF: number;
  phase: "level" | "transition" | "arena" | "dead" | "timeout"; // no "won"
  setIdx: number;
  level: number; // 0..2, then arena
  levelW: number;
  camX: number;
  camLock: boolean; // THE FLAG THE VIEW READS
  fight: number; // -1 = roaming, else index into level.fights
  /** The next untriggered fight in this level (fight progress survives the
   * -1 roaming sentinel). ADDED AT BUILD, pre-tape - noted in the track
   * report: without it a cleared fight would re-trigger on re-entry. */
  nextFight: number;
  wave: number;
  goF: number; // GO-arrow frames after an unlock (render reads)
  transF: number; // WALL-frame transition countdown (the dead-air law)
  pendingSpawns: {
    kind: EnemyKind;
    x: number;
    y: number;
    delayF: number;
    face: 1 | -1;
  }[];
  // arena
  arenaWave: number; // waves entered; lap = floor(arenaWave / 4)
  arenaGapF: number; // frames until the next arena wave
  // actors
  p: Fighter;
  enemies: Enemy[];
  boss: Boss | null;
  bolts: Bolt[];
  bombs: Bomb[];
  pickups: Pickup[];
  atkTokens: number;
  // input bookkeeping (sim-side so replays are pure)
  prevDown: boolean;
  pressX: number;
  pressY: number;
  pressDragged: boolean; // pointer moved >= DRAG_PX from the press origin (sticky per press)
  prevSpace: boolean;
  // stat effects (resolved once in create)
  speed: number;
  dmgMul: number;
  wakeupF: number;
  tellLeadF: number; // Sensors: extra frames of tell VISIBILITY
  // presentation events (monotonic counters + last-coords; the view diffs)
  hitCount: number;
  lastHitX: number;
  lastHitY: number;
  lastHitHeavy: boolean;
  hurtCount: number;
  koCount: number;
  lastKoX: number;
  lastKoY: number;
  pickupCount: number;
  lastPickupKind: "" | "pipe" | "blaster" | "health";
  /** Guarded hits eaten by a blocker's frontal shell (spark, no damage).
   * ADDED AT BUILD, pre-tape - the view owes a clank distinct from a hit. */
  blockCount: number;
  comboCount: number;
  comboT: number;
  // tally
  killPts: number;
  clearPts: number;
  bonusPts: number;
  kills: number;
  fightsCleared: number;
  bossesDown: number;
  rng: () => number; // mulberry32(fnv1a(seed)) - the ONLY rng
}

// ── rate (the validity envelope, gate (c)/(e)) ─────────────────────────────
/** Derivation: the fastest sustainable kill is a pipe cycle (~20f + 5f
 * hitstop ~ 0.42s) one-shotting a grunt at point-blank ~ 240/s - never
 * sustained, because approach, y-alignment, tells and wave gaps price
 * every kill; honest strong cadence measures ~1 kill / 1.1s at 100-180
 * pts ~ 130/s, plus a fight/wave chunk every >= 15s (~10/s). perSec 160
 * bounds every legit run with margin. burst 1500 covers the largest
 * single-frame bank: the L3 boss KO 800 + a pipe double-kill + an arena
 * wave bonus 250 CANNOT coincide (bosses and the arena never coexist),
 * so 800 + 360 + margin is the true worst frame. Mirrored EXACTLY by the
 * registry row (gate e). */
export function rate(): { perSec: number; burst: number } {
  return { perSec: 160, burst: 1500 };
}

// ── implementation constants (bodies only; the contract above is frozen) ───
const PIPE_SWING = { su: 6, act: 3, rec: 14 };
const BLAST_FIRE = { su: 4, act: 2, rec: 10 };
const HIT_STUN_F = 14; // light hitstun (both sides)
const BLOCK_STUN_F = 60; // a broken guard
const WALL_STUN_F = 45; // a charger eating the wall
const CHARGE_SPD = 380; // enemy charger
const BOSS_CHARGE_SPD = 420;
const DIVE_SPD = 460; // warp boss dive slash
const ENEMY_BOLT_SPD = 300;
const LASER_DMG = 10; // the limb boss ground sweep (z=0 bolt)
const LASER_SPD = 240;
const BOMB_SPD = 200;
const BOMB_R = 42; // the AoE at the mark
const TRANSITION_F = 90; // WALL frames between levels (the dead-air law)
const GO_F = 90;
const COMBO_WINDOW_F = 90;
const JUMP_ATK_REACH = 44;

const ZEROS: Stats = { botox: 0, drugs: 0, ozempic: 0, aura: 0, optics: 0 };

function clampStat(v: number, hi: number): number {
  return Math.max(0, Math.min(hi, v));
}

function curLevel(s: RiotState): LevelDef {
  return LEVEL_SETS[s.setIdx][Math.min(2, s.level)];
}

function arenaLap(s: RiotState): number {
  return Math.floor(s.arenaWave / ARENA_WAVES.length);
}
function spdMul(s: RiotState): number {
  return s.phase === "arena" ? Math.min(ARENA_SPEED_CAP, 1 + ARENA_SPEED_STEP * arenaLap(s)) : 1;
}
function cdMulA(s: RiotState): number {
  return s.phase === "arena" ? Math.max(ARENA_CD_FLOOR, Math.pow(ARENA_CD_DECAY, arenaLap(s))) : 1;
}
/** THE ONE UNBOUNDED TERM (ADR-0120): enemy damage grows 3/lap forever. */
function dmgBonus(s: RiotState): number {
  return s.phase === "arena" ? ARENA_DMG_STEP * arenaLap(s) : 0;
}

function mkEnemy(kind: EnemyKind, x: number, y: number, face: 1 | -1, warmF: number): Enemy {
  return {
    kind,
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    face,
    hp: EN_STATS[kind].hp,
    fsm: warmF > 0 ? "enter" : "approach",
    fsmF: 0,
    fsmDur: 0,
    atkToken: false,
    strafeY: y,
    cdF: 30,
    tellF: 0,
    lane: y,
    freeze: 0,
    warmF,
  };
}

function resetPlayerAt(s: RiotState, x: number, y: number): void {
  const p = s.p;
  p.x = x;
  p.y = y;
  p.z = 0;
  p.vx = 0;
  p.vy = 0;
  p.vz = 0;
  p.face = 1;
  p.fsm = "idle";
  p.fsmF = 0;
  p.fsmDur = 0;
  p.attackId = "";
  p.comboStage = 0;
  p.chainF = 0;
  p.runF = 0;
  p.iframes = ENTRY_GRACE;
  p.freeze = 0;
}

function loadLevel(s: RiotState, idx: number): void {
  const def = LEVEL_SETS[s.setIdx][idx];
  s.phase = "level";
  s.level = idx;
  s.levelW = def.w;
  s.camX = 0;
  s.camLock = false;
  s.fight = -1;
  s.nextFight = 0;
  s.wave = 0;
  s.goF = 0;
  s.pendingSpawns = [];
  s.bolts = [];
  s.bombs = [];
  // authored health packs live on the belt from frame 0 (weapon drops join
  // this list at kill/knockdown time)
  s.pickups = def.packs.map((hk) => ({ x: hk.x, y: hk.y, kind: "health" as const, uses: 0, taken: false }));
  s.boss = null;
  s.atkTokens = 2;
  s.enemies = def.roamers.map((r) => mkEnemy(r.kind, r.x, r.y, r.x >= 90 ? -1 : 1, 0));
  resetPlayerAt(s, 90, 320);
}

function enterArena(s: RiotState): void {
  s.phase = "arena";
  s.level = 3; // the arena marker (levels are 0..2)
  s.levelW = DESIGN_W;
  s.camX = 0;
  s.camLock = true;
  s.fight = -1;
  s.nextFight = 0;
  s.wave = 0;
  s.goF = 0;
  s.pendingSpawns = [];
  s.bolts = [];
  s.bombs = [];
  s.pickups = [];
  s.boss = null;
  s.enemies = [];
  s.arenaWave = 0;
  s.arenaGapF = 40;
  s.atkTokens = 2;
  resetPlayerAt(s, 320, 320);
}

function queueWave(s: RiotState, f: FightDef, wi: number): void {
  for (const sp of f.waves[wi].spawns) {
    let x: number;
    let y = sp.y;
    if (sp.entry === "L") x = f.lockCamX - 24;
    else if (sp.entry === "R") x = f.lockCamX + DESIGN_W + 24;
    else {
      // DOOR EMERGENCE (Mike's redline 2026-08-15): a door spawn starts IN
      // the doorway - the fixture's own x AND y (doors sit on the band's
      // back line) - and the existing ENTRY_WARM_F walk-in phase is the
      // "stepping out" beat: visible, shootable, harmless, then approach.
      const d = f.doors[sp.door ?? 0];
      x = d[0];
      y = d[1];
    }
    s.pendingSpawns.push({ kind: sp.kind, x, y, delayF: sp.delayF, face: x >= s.p.x ? -1 : 1 });
  }
}

function queueArenaWave(s: RiotState, wi: number): void {
  for (const sp of ARENA_WAVES[wi].spawns) {
    const x = sp.entry === "L" ? -24 : DESIGN_W + 24;
    s.pendingSpawns.push({ kind: sp.kind, x, y: sp.y, delayF: sp.delayF, face: x >= s.p.x ? -1 : 1 });
  }
}

// ── events + damage ────────────────────────────────────────────────────────

function hitEvent(s: RiotState, x: number, y: number, heavy: boolean): void {
  s.hitCount += 1;
  s.lastHitX = x;
  s.lastHitY = y;
  s.lastHitHeavy = heavy;
  s.comboCount = s.comboT > 0 ? s.comboCount + 1 : 1;
  s.comboT = COMBO_WINDOW_F;
}

function playerInvuln(s: RiotState): boolean {
  const p = s.p;
  return p.iframes > 0 || p.fsm === "down" || p.fsm === "getup";
}

function damagePlayer(s: RiotState, dmg: number, kd: boolean, srcX: number): void {
  const p = s.p;
  if (playerInvuln(s)) return;
  if (s.phase !== "level" && s.phase !== "arena") return;
  p.hp -= dmg;
  s.hurtCount += 1;
  p.attackId = "";
  p.comboStage = 0;
  p.chainF = 0;
  p.runF = 0;
  p.freeze = (kd ? HITSTOP_HEAVY : HITSTOP_LIGHT) + HITSTOP_VICTIM_EXTRA;
  const dir = p.x >= srcX ? 1 : -1;
  if (p.hp <= 0) {
    p.hp = 0;
    p.fsm = "down";
    p.fsmF = DOWN_F;
    p.fsmDur = DOWN_F;
    p.vx = dir * KB_VX;
    p.vz = KB_VZ;
    s.phase = "dead";
    return;
  }
  if (kd) {
    // knockdown drops your weapon at your feet
    if (p.weapon !== "" && p.weaponUses > 0)
      s.pickups.push({ x: p.x, y: p.y, kind: p.weapon, uses: p.weaponUses, taken: false });
    p.weapon = "";
    p.weaponUses = 0;
    p.fsm = "down";
    p.fsmF = DOWN_F;
    p.fsmDur = DOWN_F;
    p.vx = dir * KB_VX;
    p.vz = KB_VZ;
  } else {
    p.fsm = "hit";
    p.fsmF = HIT_STUN_F;
    p.fsmDur = HIT_STUN_F;
    p.vx = dir * 120;
  }
}

function damageEnemy(
  s: RiotState,
  e: Enemy,
  dmg: number,
  kd: boolean,
  heavy: boolean,
  freezeAttacker: boolean,
): void {
  e.hp -= dmg;
  e.atkToken = false;
  e.tellF = 0;
  e.freeze = (heavy ? HITSTOP_HEAVY : HITSTOP_LIGHT) + HITSTOP_VICTIM_EXTRA;
  if (freezeAttacker) s.p.freeze = heavy ? HITSTOP_HEAVY : HITSTOP_LIGHT;
  hitEvent(s, e.x, e.y - 34, heavy);
  if (e.hp <= 0) {
    e.fsm = "dead";
    s.koCount += 1;
    s.lastKoX = e.x;
    s.lastKoY = e.y;
    s.kills += 1;
    s.killPts += KILL_PTS[e.kind];
    if (e.kind === "pgrunt") s.pickups.push({ x: e.x, y: e.y, kind: "pipe", uses: PIPE.uses, taken: false });
    if (e.kind === "bthrower")
      s.pickups.push({ x: e.x, y: e.y, kind: "blaster", uses: BLASTER.uses, taken: false });
  } else if (kd) {
    e.fsm = "down";
    e.fsmF = DOWN_F;
    e.fsmDur = DOWN_F;
    e.vx = s.p.face * KB_VX;
    e.vz = KB_VZ;
  } else {
    e.fsm = "stun";
    e.fsmF = HIT_STUN_F;
    e.fsmDur = HIT_STUN_F;
    e.vx = s.p.face * 90;
  }
}

function damageBoss(s: RiotState, dmg: number, heavy: boolean): void {
  const b = s.boss;
  if (!b) return;
  b.hp -= dmg;
  b.freeze = (heavy ? HITSTOP_HEAVY : HITSTOP_LIGHT) + HITSTOP_VICTIM_EXTRA;
  s.p.freeze = heavy ? HITSTOP_HEAVY : HITSTOP_LIGHT;
  hitEvent(s, b.x, b.y - 44, heavy);
  if (b.hp <= 0) {
    b.hp = 0;
    b.fsm = "dead";
    s.koCount += 1;
    s.lastKoX = b.x;
    s.lastKoY = b.y;
    s.bossesDown += 1;
    s.clearPts += BOSS_PTS[Math.min(2, s.level)];
    s.boss = null;
    s.bolts = [];
    s.bombs = [];
    s.camLock = false;
    s.phase = "transition";
    s.transF = TRANSITION_F;
  }
}

// ── the player ─────────────────────────────────────────────────────────────

function clampPlayer(s: RiotState): void {
  const p = s.p;
  const left = s.camX + 14;
  const right = Math.min(s.camLock ? s.camX + DESIGN_W - 14 : s.levelW - 14, s.camX + DESIGN_W - 14);
  p.x = Math.max(left, Math.min(right, p.x));
  p.y = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, p.y));
}

function blockerGuardUp(e: Enemy): boolean {
  return e.kind === "blocker" && (e.fsm === "approach" || e.fsm === "strafe" || e.fsm === "enter");
}

/** One melee swing: hits EVERYTHING in the window on its single active
 * frame (the pipe double-kill the burst term prices). */
function meleeHit(s: RiotState, dmg: number, reach: number, kd: boolean, gb: boolean): boolean {
  const p = s.p;
  let connected = false;
  for (const e of s.enemies) {
    if (e.fsm === "dead" || e.fsm === "down" || e.fsm === "getup") continue;
    const rel = (e.x - p.x) * p.face;
    if (rel < -10 || rel > reach + 12) continue;
    if (Math.abs(e.y - p.y) > Y_TOL) continue;
    if (Math.abs(e.z - p.z) > 44) continue;
    if (blockerGuardUp(e) && (p.x - e.x) * e.face > 0 && !gb) {
      // the frontal shell: spark, no damage
      s.blockCount += 1;
      s.p.freeze = HITSTOP_LIGHT;
      connected = true;
      continue;
    }
    const wasGuarding = blockerGuardUp(e) && (p.x - e.x) * e.face > 0;
    damageEnemy(s, e, dmg, kd, kd || gb, true);
    // (widened read: damageEnemy may have scrapped it, TS keeps the old narrowing)
    if (wasGuarding && gb && (e.fsm as EFsm) !== "dead") {
      // the guard BREAK: 60 frames of open machine
      e.fsm = "stun";
      e.fsmF = BLOCK_STUN_F;
      e.fsmDur = BLOCK_STUN_F;
      e.vx = 0;
    }
    connected = true;
  }
  const b = s.boss;
  if (b && b.fsm !== "dead") {
    const rel = (b.x - p.x) * p.face;
    if (rel >= -12 && rel <= reach + 26 && Math.abs(b.y - p.y) <= Y_TOL + 8 && b.z < 60) {
      damageBoss(s, dmg, kd || gb);
      connected = true;
    }
  }
  return connected;
}

function frameSpec(p: Fighter): { su: number; act: number; rec: number } {
  switch (p.attackId) {
    case "finisher":
      return SMASH;
    case "dash":
      return DASH_ATK;
    case "swing":
      return p.weapon === "pipe" ? PIPE_SWING : BLAST_FIRE;
    default:
      return JAB;
  }
}

function resolvePlayerAttack(s: RiotState): void {
  const p = s.p;
  if (p.attackId === "swing" && p.weapon === "blaster") {
    s.bolts.push({
      x: p.x + p.face * 22,
      y: p.y,
      z: 20,
      vx: p.face * BLASTER.speed,
      vy: 0,
      life: BLASTER.life,
      mine: true,
      dead: false,
    });
    return;
  }
  switch (p.attackId) {
    case "jab1":
    case "jab2":
      meleeHit(s, JAB.dmg * s.dmgMul, JAB_REACH, false, false);
      break;
    case "finisher":
      meleeHit(s, SMASH.dmg * s.dmgMul, JAB_REACH, true, false);
      break;
    case "dash":
      meleeHit(s, DASH_ATK.dmg * s.dmgMul, 52, true, true);
      break;
    case "swing":
      meleeHit(s, PIPE.dmg * s.dmgMul, PIPE.reach, true, false);
      break;
    default:
      break;
  }
}

function begin(p: Fighter, id: AttackId, spec: { su: number; act: number; rec: number }): void {
  p.fsm = "attack";
  p.attackId = id;
  p.fsmDur = spec.su + spec.act + spec.rec;
  p.fsmF = p.fsmDur;
  p.runF = 0;
  p.chainF = 0;
}

/** THE BELT-SCROLLER PUNCH CONVENTION (CLICK LAW v3): a punch NEVER turns
 * toward the click point - a click landing slightly behind the fighter must
 * jab forward, not spin him. Facing flips ONLY when a live machine is in
 * reach on the other side and none is in reach in front. The reach windows
 * are the meleeHit windows themselves (enemies rel -10..reach+12, |dy| <=
 * Y_TOL, z overlap; boss rel -12..reach+26, |dy| <= Y_TOL+8), so the flip
 * answers exactly one question: "would this very swing land the other way
 * and whiff this way". */
function autoFace(s: RiotState, reach: number): void {
  const p = s.p;
  const inReach = (dir: 1 | -1): boolean => {
    for (const e of s.enemies) {
      if (e.fsm === "dead" || e.fsm === "down" || e.fsm === "getup") continue;
      const rel = (e.x - p.x) * dir;
      if (rel >= -10 && rel <= reach + 12 && Math.abs(e.y - p.y) <= Y_TOL && Math.abs(e.z - p.z) <= 44)
        return true;
    }
    const b = s.boss;
    if (b && b.fsm !== "dead") {
      const rel = (b.x - p.x) * dir;
      if (rel >= -12 && rel <= reach + 26 && Math.abs(b.y - p.y) <= Y_TOL + 8 && b.z < 60) return true;
    }
    return false;
  };
  const behind: 1 | -1 = p.face === 1 ? -1 : 1;
  if (!inReach(p.face) && inReach(behind)) p.face = behind;
}

function startGroundAttack(s: RiotState): void {
  const p = s.p;
  if (p.fsm === "run") {
    // a dash rides the run's own momentum: never auto-flipped
    begin(p, "dash", DASH_ATK);
    return;
  }
  autoFace(s, p.weapon === "pipe" ? PIPE.reach : p.weapon === "blaster" ? BLASTER_AIM_R : JAB_REACH);
  if (p.weapon === "pipe") {
    p.weaponUses -= 1;
    begin(p, "swing", PIPE_SWING);
    return;
  }
  if (p.weapon === "blaster") {
    p.weaponUses -= 1;
    begin(p, "swing", BLAST_FIRE);
    return;
  }
  const stage = p.chainF > 0 ? p.comboStage : 0;
  if (stage <= 0) {
    p.comboStage = 1;
    begin(p, "jab1", JAB);
  } else if (stage === 1) {
    p.comboStage = 2;
    begin(p, "jab2", JAB);
  } else {
    p.comboStage = 3;
    begin(p, "finisher", SMASH);
  }
}

interface MoveDir {
  has: boolean;
  dx: number;
  dy: number;
  maxX: number;
  maxY: number;
}

function moveDir(s: RiotState, input: SimInput): MoveDir {
  const p = s.p;
  const keys = input.left || input.right || input.up || input.downKey;
  if (keys) {
    const kx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const ky = (input.downKey ? 1 : 0) - (input.up ? 1 : 0);
    const d = Math.hypot(kx, ky) || 1;
    return { has: kx !== 0 || ky !== 0, dx: kx / d, dy: ky / d, maxX: Infinity, maxY: Infinity };
  }
  if (input.down && input.px != null && input.py != null) {
    // THE CLICK LAW v3: ONLY a dragged press is movement. An undragged press
    // is a pending punch and never moves the fighter - not for one frame -
    // no matter how long it is held or where it landed.
    if (!s.pressDragged) return { has: false, dx: 0, dy: 0, maxX: 0, maxY: 0 };
    const dx = input.px - p.x;
    const dy = input.py - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) return { has: true, dx: dx / d, dy: dy / d, maxX: Math.abs(dx), maxY: Math.abs(dy) };
  }
  return { has: false, dx: 0, dy: 0, maxX: 0, maxY: 0 };
}

function clampMag(v: number, max: number): number {
  return Math.sign(v) * Math.min(Math.abs(v), max);
}

function stepPlayer(s: RiotState, dt: number, input: SimInput, tap: boolean, jumpEdge: boolean): void {
  const p = s.p;
  if (p.freeze > 0) {
    p.freeze -= 1;
    return;
  }
  if (p.iframes > 0) p.iframes -= 1;
  if (p.chainF > 0) p.chainF -= 1;

  if (p.fsm === "hit") {
    p.x += p.vx * dt;
    p.vx *= 0.86;
    clampPlayer(s);
    p.fsmF -= 1;
    if (p.fsmF <= 0) {
      p.fsm = "idle";
      p.vx = 0;
    }
    return;
  }
  if (p.fsm === "down") {
    p.x += p.vx * dt;
    if (p.z > 0 || p.vz > 0) {
      p.z += p.vz * dt;
      p.vz -= GRAV * dt;
      if (p.z <= 0) {
        p.z = 0;
        p.vz = 0;
        p.vx = 0;
      }
    }
    clampPlayer(s);
    p.fsmF -= 1;
    if (p.fsmF <= 0) {
      p.fsm = "getup";
      p.fsmF = GETUP_F;
      p.fsmDur = GETUP_F;
    }
    return;
  }
  if (p.fsm === "getup") {
    p.fsmF -= 1;
    if (p.fsmF <= 0) {
      p.fsm = "idle";
      p.iframes = s.wakeupF;
    }
    return;
  }
  if (p.fsm === "attack") {
    const spec = frameSpec(p);
    p.fsmF -= 1;
    if (p.attackId === "dash" && p.fsmF > spec.rec) {
      p.x += p.face * 240 * dt;
      clampPlayer(s);
    }
    if (p.fsmF === spec.act + spec.rec) resolvePlayerAttack(s);
    if (p.fsmF <= 0) {
      const wasJab = p.attackId === "jab1" || p.attackId === "jab2";
      if (wasJab) p.chainF = CHAIN_GAP_F;
      else p.comboStage = 0;
      if (p.attackId === "swing" && p.weaponUses <= 0) {
        p.weapon = "";
        p.weaponUses = 0;
      }
      p.fsm = "idle";
      p.attackId = "";
    }
    return;
  }
  if (p.fsm === "jump" || p.fsm === "jumpatk") {
    const dir = moveDir(s, input);
    if (dir.has) {
      p.x += clampMag(dir.dx * s.speed * 0.6 * dt, dir.maxX);
      p.y += clampMag(dir.dy * s.speed * 0.6 * Y_SPEED_MUL * dt, dir.maxY);
      if (dir.dx !== 0) p.face = dir.dx > 0 ? 1 : -1;
      clampPlayer(s);
    }
    p.z += p.vz * dt;
    p.vz -= GRAV * dt;
    if (tap && p.fsm === "jump") {
      autoFace(s, JUMP_ATK_REACH); // same convention airborne: never spin to the click
      p.fsm = "jumpatk";
      p.attackId = "jumpkick";
    }
    if (p.fsm === "jumpatk" && p.vz < 0) {
      // the guard-breaking descent: tests every falling frame until it lands one
      if (meleeHit(s, JUMP_ATK_DMG * s.dmgMul, JUMP_ATK_REACH, false, true)) p.fsm = "jump";
    }
    if (p.z <= 0 && p.vz <= 0) {
      p.z = 0;
      p.vz = 0;
      p.fsm = "idle";
      p.attackId = "";
    }
    return;
  }

  // grounded control: idle / walk / run
  if (p.chainF <= 0) p.comboStage = 0;
  const dir = moveDir(s, input);
  let moving = false;
  if (dir.has) {
    const running = p.runF >= RUN_RAMP_F;
    const spd = s.speed * (running ? RUN_MUL : 1);
    const stepX = clampMag(dir.dx * spd * dt, dir.maxX);
    const stepY = clampMag(dir.dy * spd * Y_SPEED_MUL * dt, dir.maxY);
    p.x += stepX;
    p.y += stepY;
    if (dir.dx !== 0) p.face = dir.dx > 0 ? 1 : -1;
    moving = Math.abs(stepX) + Math.abs(stepY) > 0.01;
    if (Math.abs(dir.dx) > 0.55 && moving) p.runF += 1;
    else p.runF = 0;
    clampPlayer(s);
  } else {
    p.runF = 0;
  }
  p.fsm = p.runF >= RUN_RAMP_F && moving ? "run" : moving ? "walk" : "idle";

  if (jumpEdge) {
    p.vz = JUMP_VZ;
    p.fsm = "jump";
    return;
  }
  if (tap) startGroundAttack(s);
}

// ── enemies ────────────────────────────────────────────────────────────────

function liveTokens(s: RiotState): number {
  let n = 0;
  for (const e of s.enemies) if (e.atkToken && e.fsm !== "dead") n += 1;
  return n;
}

function bandRand(s: RiotState): number {
  return FLOOR_TOP + 16 + s.rng() * (FLOOR_BOT - FLOOR_TOP - 32);
}

function moveToward(e: Enemy, tx: number, ty: number, spd: number, dt: number): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  e.x += clampMag(dx, spd * dt);
  e.y += clampMag(dy, spd * 0.7 * dt);
  e.y = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, e.y));
}

function beginEnemyAttack(s: RiotState, e: Enemy): void {
  const st = EN_STATS[e.kind];
  const p = s.p;
  e.fsm = "attack";
  e.fsmF = st.activeF;
  e.fsmDur = st.activeF;
  if (e.kind === "thrower" || e.kind === "bthrower") {
    const dir: 1 | -1 = p.x >= e.x ? 1 : -1;
    e.face = dir;
    s.bolts.push({ x: e.x + dir * 18, y: e.y, z: 20, vx: dir * ENEMY_BOLT_SPD, vy: 0, life: 2.4, mine: false, dead: false });
  } else if (e.kind === "bomber") {
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    s.bombs.push({
      x: e.x,
      y: e.y,
      vx: Math.cos(a) * BOMB_SPD,
      vy: Math.sin(a) * BOMB_SPD,
      tx: p.x,
      ty: p.y,
      arcLen: Math.max(1, Math.hypot(p.x - e.x, p.y - e.y)),
      dead: false,
    });
  } else if (e.kind === "charger") {
    e.vx = e.face * CHARGE_SPD * spdMul(s);
    e.y = e.lane;
  } else {
    // melee: one contact test on the first active frame
    const rel = (p.x - e.x) * e.face;
    if (rel > -8 && rel < st.reach + 12 && Math.abs(p.y - e.y) <= Y_TOL && p.z < 36) {
      damagePlayer(s, st.dmg + dmgBonus(s), false, e.x);
      e.freeze = HITSTOP_LIGHT;
    }
  }
}

function endEnemyAttack(s: RiotState, e: Enemy): void {
  const st = EN_STATS[e.kind];
  e.vx = 0;
  e.atkToken = false;
  e.cdF = Math.max(8, Math.round(st.cdF * cdMulA(s)));
  e.fsm = "recover";
  e.fsmF = st.recoverF;
  e.fsmDur = st.recoverF;
}

function stepEnemies(s: RiotState, dt: number): void {
  const p = s.p;
  const sm = spdMul(s);
  for (const e of s.enemies) {
    if (e.fsm === "dead") continue;
    if (e.freeze > 0) {
      e.freeze -= 1;
      continue;
    }
    const st = EN_STATS[e.kind];
    const spd = st.spd * sm;
    if (e.cdF > 0) e.cdF -= 1;
    switch (e.fsm) {
      case "enter": {
        e.face = p.x >= e.x ? 1 : -1;
        if (e.x < s.camX + 30) e.x += spd * dt;
        else if (e.x > s.camX + DESIGN_W - 30) e.x -= spd * dt;
        e.warmF -= 1;
        if (e.warmF <= 0) {
          e.warmF = 0;
          e.fsm = "approach";
        }
        break;
      }
      case "stun": {
        e.x += e.vx * dt;
        e.vx *= 0.8;
        e.fsmF -= 1;
        if (e.fsmF <= 0) {
          e.fsm = "approach";
          e.vx = 0;
          e.cdF = Math.max(e.cdF, 20);
        }
        break;
      }
      case "down": {
        e.x += e.vx * dt;
        if (e.z > 0 || e.vz > 0) {
          e.z += e.vz * dt;
          e.vz -= GRAV * dt;
          if (e.z <= 0) {
            e.z = 0;
            e.vz = 0;
            e.vx = 0;
          }
        }
        e.fsmF -= 1;
        if (e.fsmF <= 0) {
          e.fsm = "getup";
          e.fsmF = GETUP_F;
          e.fsmDur = GETUP_F;
        }
        break;
      }
      case "getup": {
        e.fsmF -= 1;
        if (e.fsmF <= 0) {
          e.fsm = "approach";
          e.cdF = Math.max(e.cdF, 30);
        }
        break;
      }
      case "windup": {
        e.tellF -= 1;
        e.fsmF -= 1;
        if (e.tellF <= 0) beginEnemyAttack(s, e);
        break;
      }
      case "attack": {
        e.fsmF -= 1;
        if (e.kind === "charger") {
          e.x += e.vx * dt;
          const hit =
            Math.abs(e.x - p.x) < 26 &&
            Math.abs(p.y - e.lane) <= Y_TOL + 4 &&
            p.z < 26 &&
            !playerInvuln(s);
          if (hit) {
            damagePlayer(s, st.dmg + dmgBonus(s), true, e.x);
            e.freeze = HITSTOP_HEAVY;
            endEnemyAttack(s, e);
            break;
          }
          const wallL = s.camX + 24;
          const wallR = s.camX + DESIGN_W - 24;
          if (e.x <= wallL || e.x >= wallR) {
            // THE WALL STAGGER: an unblockable priced with a long open window
            e.x = Math.max(wallL, Math.min(wallR, e.x));
            e.vx = 0;
            e.atkToken = false;
            e.cdF = Math.max(8, Math.round(st.cdF * cdMulA(s)));
            e.fsm = "stun";
            e.fsmF = WALL_STUN_F;
            e.fsmDur = WALL_STUN_F;
            break;
          }
          if (e.fsmF <= 0) endEnemyAttack(s, e);
        } else if (e.fsmF <= 0) {
          endEnemyAttack(s, e);
        }
        break;
      }
      case "recover": {
        e.fsmF -= 1;
        if (e.fsmF <= 0) {
          if (e.kind === "harass") {
            // dart back out after the poke
            e.fsm = "strafe";
            e.fsmF = 50;
            e.fsmDur = 50;
            e.strafeY = bandRand(s);
          } else {
            e.fsm = "approach";
          }
        }
        break;
      }
      case "strafe": {
        const away = e.x >= p.x ? 1 : -1;
        moveToward(e, p.x + away * 120, e.strafeY, spd * 0.8, dt);
        e.face = p.x >= e.x ? 1 : -1;
        e.fsmF -= 1;
        if (e.fsmF <= 0) e.fsm = "approach";
        break;
      }
      case "approach": {
        e.face = p.x >= e.x ? 1 : -1;
        const side = e.x >= p.x ? 1 : -1;
        const ranged = e.kind === "thrower" || e.kind === "bthrower" || e.kind === "bomber" || e.kind === "charger";
        const off = ranged ? st.reach * 0.9 : st.reach * 0.7;
        let standX = p.x + side * off;
        // NEVER stand beyond the fight's walls (measured wedge: a bomber's
        // standoff walked it out the locked screen's left edge, unreachable
        // and unkillable - the fight could never clear)
        const lo = s.camLock ? s.camX + 26 : 20;
        const hi = s.camLock ? s.camX + DESIGN_W - 26 : s.levelW - 20;
        if (standX < lo) standX = p.x + off;
        else if (standX > hi) standX = p.x - off;
        moveToward(e, standX, p.y, spd, dt);
        const alignedY = Math.abs(e.y - p.y) <= (ranged ? Y_TOL : Y_TOL - 2);
        const alignedX = Math.abs(e.x - standX) < (ranged ? 40 : 12);
        if (alignedX && alignedY && e.cdF <= 0) {
          if (liveTokens(s) < s.atkTokens) {
            // the battle circle grants a token: telegraph, then swing
            e.atkToken = true;
            e.fsm = "windup";
            e.tellF = st.windupF;
            e.fsmF = st.windupF;
            e.fsmDur = st.windupF;
            e.lane = e.kind === "charger" ? e.y : p.y;
          } else {
            // denied: strafe to a seeded lane and re-request
            e.fsm = "strafe";
            e.strafeY = bandRand(s);
            e.fsmF = 60 + Math.floor(s.rng() * 60);
            e.fsmDur = e.fsmF;
          }
        }
        break;
      }
      default:
        break;
    }
    // the walls hold for machines too (enter walks IN from outside; the
    // charger's own wall-stagger check runs first and still fires)
    if (e.fsm !== "enter") {
      if (s.camLock) e.x = Math.max(s.camX + 20, Math.min(s.camX + DESIGN_W - 20, e.x));
      else e.x = Math.max(16, Math.min(s.levelW - 16, e.x));
    }
    if (s.phase === "dead") return;
  }
  if (s.enemies.some((e) => e.fsm === "dead")) s.enemies = s.enemies.filter((e) => e.fsm !== "dead");
}

// ── the bosses ─────────────────────────────────────────────────────────────

function spawnBoss(s: RiotState, def: LevelDef): void {
  const bd = def.boss;
  const bx = bd.kind === "warp" && bd.anchors ? bd.anchors[0][0] : s.levelW - 90;
  const by = bd.kind === "warp" && bd.anchors ? bd.anchors[0][1] : 320;
  s.boss = {
    kind: bd.kind,
    x: bx,
    y: by,
    z: 0,
    vx: 0,
    vy: 0,
    face: -1,
    hp: bd.hp,
    hpMax: bd.hp,
    fsm: "gap",
    fsmF: Math.round(bd.gapF * 1.6),
    fsmDur: Math.round(bd.gapF * 1.6),
    patIdx: 0,
    attackId: 0,
    cycleN: 0,
    lane: 320,
    anchor: 0,
    freeze: 0,
  };
}

function bossToGap(s: RiotState, b: Boss, def: BossDef, ph: number): void {
  b.patIdx += 1;
  b.fsm = "gap";
  b.fsmF = Math.max(12, Math.round(def.gapF * ph));
  b.fsmDur = b.fsmF;
  if (b.kind === "warp" && def.anchors && def.anchors.length > 0) {
    b.anchor = (b.anchor + 1) % def.anchors.length;
    b.x = def.anchors[b.anchor][0];
    b.y = def.anchors[b.anchor][1];
  }
}

function beginBossAttack(s: RiotState, b: Boss, def: BossDef): void {
  const atk = def.attacks[b.attackId];
  const p = s.p;
  b.fsm = "attack";
  b.fsmF = atk.activeF;
  b.fsmDur = atk.activeF;
  if (b.kind === "charge") {
    if (b.attackId === 0) {
      // piston slam: frontal melee
      const rel = (p.x - b.x) * b.face;
      if (rel > -14 && rel < 84 && Math.abs(p.y - b.y) <= Y_TOL + 4 && p.z < 36) damagePlayer(s, atk.dmg, true, b.x);
    } else if (b.attackId === 1) {
      // scatter bolts: a 3-way fan
      for (const vy of [-46, 0, 46])
        s.bolts.push({ x: b.x + b.face * 26, y: b.y, z: 20, vx: b.face * ENEMY_BOLT_SPD * 1.1, vy, life: 2.4, mine: false, dead: false });
    } else {
      b.vx = b.face * BOSS_CHARGE_SPD;
    }
  } else if (b.kind === "limbs") {
    if (b.attackId === 0) {
      // the arm comes down your lane
      if (Math.abs(p.y - b.lane) <= Y_TOL + 4 && p.x > b.x - 250 && p.x < b.x - 16 && p.z < 36)
        damagePlayer(s, atk.dmg, true, b.x);
    } else if (b.attackId === 1) {
      // THE LASER: a z=0 tall sweep across every lane - you JUMP it
      s.bolts.push({ x: b.x - 46, y: b.y, z: 0, vx: -LASER_SPD, vy: 0, life: 3.4, mine: false, dead: false });
    } else {
      // double-arm sweep, wide and close
      if (Math.abs(p.x - b.x) < 100 && Math.abs(p.y - b.y) <= Y_TOL + 8 && p.z < 36) damagePlayer(s, atk.dmg, false, b.x);
    }
  } else {
    if (b.attackId === 0) {
      // aimed bolt burst
      const d = Math.hypot(p.x - b.x, p.y - b.y) || 1;
      const ux = (p.x - b.x) / d;
      const uy = (p.y - b.y) / d;
      s.bolts.push({ x: b.x + ux * 24, y: b.y + uy * 24, z: 20, vx: ux * ENEMY_BOLT_SPD * 1.15, vy: uy * ENEMY_BOLT_SPD * 0.6, life: 2.6, mine: false, dead: false });
      s.bolts.push({ x: b.x + ux * 24, y: b.y + uy * 24, z: 20, vx: ux * ENEMY_BOLT_SPD * 0.85, vy: uy * ENEMY_BOLT_SPD * 0.45, life: 2.6, mine: false, dead: false });
    } else if (b.attackId === 1) {
      // dive slash down the lane it locked at tell start
      b.vx = (p.x >= b.x ? 1 : -1) * DIVE_SPD;
    } else {
      // shock nova around itself
      if (Math.hypot(p.x - b.x, p.y - b.y) < 84 && p.z < 44) damagePlayer(s, atk.dmg, true, b.x);
    }
  }
}

function bossAttackActive(s: RiotState, b: Boss, def: BossDef, dt: number): void {
  const p = s.p;
  const atk = def.attacks[b.attackId];
  if (b.kind === "charge" && b.attackId === 2) {
    b.x += b.vx * dt;
    if (Math.abs(b.x - p.x) < 40 && Math.abs(p.y - b.y) <= Y_TOL + 2 && p.z < 30) damagePlayer(s, atk.dmg, true, b.x);
    const wallL = s.camX + 46;
    const wallR = s.camX + DESIGN_W - 46;
    if (b.x <= wallL || b.x >= wallR) {
      // THE WALL STAGGER IS THE WINDOW (the authored charge-boss read)
      b.x = Math.max(wallL, Math.min(wallR, b.x));
      b.vx = 0;
      b.cycleN = 0;
      b.fsm = "vuln";
      b.fsmF = def.vulnF;
      b.fsmDur = def.vulnF;
    }
  } else if (b.kind === "warp" && b.attackId === 1) {
    b.x += b.vx * dt;
    b.y += Math.sign(b.lane - b.y) * Math.min(Math.abs(b.lane - b.y), 180 * dt);
    if (Math.abs(b.x - p.x) < 34 && Math.abs(p.y - b.y) <= Y_TOL + 2 && p.z < 30) damagePlayer(s, atk.dmg, true, b.x);
    const wallL = s.camX + 40;
    const wallR = s.camX + DESIGN_W - 40;
    if (b.x <= wallL || b.x >= wallR) {
      b.x = Math.max(wallL, Math.min(wallR, b.x));
      b.vx = 0;
      b.fsmF = 0;
    }
  }
}

function stepBoss(s: RiotState, dt: number): void {
  const b = s.boss;
  if (!b || s.phase !== "level") return;
  if (b.freeze > 0) {
    b.freeze -= 1;
    return;
  }
  const def = curLevel(s).boss;
  const p = s.p;
  const ph = b.hp <= b.hpMax * 0.25 ? 0.55 : b.hp <= b.hpMax * 0.5 ? 0.75 : 1;
  switch (b.fsm) {
    case "gap": {
      b.face = p.x >= b.x ? 1 : -1;
      if (b.kind === "charge") {
        b.y += Math.sign(p.y - b.y) * Math.min(Math.abs(p.y - b.y), 60 * dt);
      } else if (b.kind === "limbs") {
        b.y += Math.sign(p.y - b.y) * Math.min(Math.abs(p.y - b.y), 44 * dt);
        const ax = s.levelW - 120;
        b.x += Math.sign(ax - b.x) * Math.min(Math.abs(ax - b.x), 70 * dt);
      }
      b.fsmF -= 1;
      if (b.fsmF <= 0) {
        b.attackId = b.patIdx % 3;
        b.fsm = "tell";
        // tells NEVER compress - only gapF rides the phase speedup
        b.fsmF = def.attacks[b.attackId].tellF;
        b.fsmDur = b.fsmF;
        b.lane = p.y;
        b.face = p.x >= b.x ? 1 : -1;
      }
      break;
    }
    case "tell": {
      if (b.kind === "charge" && b.attackId === 2) {
        // eases into the charge lane it called
        b.y += Math.sign(b.lane - b.y) * Math.min(Math.abs(b.lane - b.y), 140 * dt);
      }
      b.fsmF -= 1;
      if (b.fsmF <= 0) beginBossAttack(s, b, def);
      break;
    }
    case "attack": {
      b.fsmF -= 1;
      bossAttackActive(s, b, def, dt);
      if (b.fsm !== "attack") break; // wall stagger opened the window
      if (b.fsmF <= 0) {
        b.vx = 0;
        b.cycleN += 1;
        if (b.cycleN >= def.vulnEvery) {
          b.cycleN = 0;
          b.fsm = "vuln";
          b.fsmF = def.vulnF;
          b.fsmDur = def.vulnF;
        } else {
          b.fsm = "recover";
          b.fsmF = def.attacks[b.attackId].recoverF;
          b.fsmDur = b.fsmF;
        }
      }
      break;
    }
    case "recover": {
      b.fsmF -= 1;
      if (b.fsmF <= 0) bossToGap(s, b, def, ph);
      break;
    }
    case "vuln": {
      b.fsmF -= 1;
      if (b.fsmF <= 0) bossToGap(s, b, def, ph);
      break;
    }
    default:
      break;
  }
}

// ── projectiles ────────────────────────────────────────────────────────────

function stepBolts(s: RiotState, dt: number): void {
  const p = s.p;
  for (const bl of s.bolts) {
    if (bl.dead) continue;
    bl.x += bl.vx * dt;
    bl.y += bl.vy * dt;
    bl.life -= dt;
    if (
      bl.life <= 0 ||
      bl.x < s.camX - 80 ||
      bl.x > s.camX + DESIGN_W + 80 ||
      bl.y < FLOOR_TOP - 60 ||
      bl.y > FLOOR_BOT + 40
    ) {
      bl.dead = true;
      continue;
    }
    if (bl.mine) {
      for (const e of s.enemies) {
        if (e.fsm === "dead" || e.fsm === "down" || e.fsm === "getup") continue;
        if (Math.abs(bl.x - e.x) < 16 && Math.abs(bl.y - e.y) <= Y_TOL && e.z < 44) {
          if (blockerGuardUp(e) && (bl.x - e.x) * e.face > 0 && bl.vx * e.face < 0) {
            s.blockCount += 1;
            bl.dead = true;
            break;
          }
          damageEnemy(s, e, BLASTER.dmg * s.dmgMul, false, false, false);
          bl.dead = true;
          break;
        }
      }
      const b = s.boss;
      if (!bl.dead && b && Math.abs(bl.x - b.x) < 30 && Math.abs(bl.y - b.y) <= Y_TOL + 8) {
        damageBoss(s, BLASTER.dmg * s.dmgMul, false);
        bl.dead = true;
      }
    } else if (!playerInvuln(s)) {
      if (bl.z === 0) {
        // the tall sweep: every lane, only the jump beats it
        if (Math.abs(bl.x - p.x) < 18 && p.z < 26) {
          damagePlayer(s, LASER_DMG, true, bl.x);
          bl.dead = true;
        }
      } else if (Math.abs(bl.x - p.x) < 14 && Math.abs(bl.y - p.y) <= Y_TOL && p.z < 36) {
        damagePlayer(s, EN_STATS.thrower.dmg + dmgBonus(s), false, bl.x);
        bl.dead = true;
      }
    }
    if (s.phase === "dead" || s.phase === "transition") break;
  }
  if (s.bolts.some((b) => b.dead)) s.bolts = s.bolts.filter((b) => !b.dead);
}

function stepBombs(s: RiotState, dt: number): void {
  const p = s.p;
  for (const bm of s.bombs) {
    if (bm.dead) continue;
    bm.x += bm.vx * dt;
    bm.y += bm.vy * dt;
    // contact test FIRST (the stopclock arc law): a bomb landing ON you lands
    if (!playerInvuln(s) && Math.hypot(bm.x - p.x, bm.y - p.y) < 16 && p.z < 22) {
      damagePlayer(s, EN_STATS.bomber.dmg + dmgBonus(s), true, bm.x);
      bm.dead = true;
      continue;
    }
    // then mark-passed termination: the AoE detonates at the authored mark
    if ((bm.x - bm.tx) * bm.vx + (bm.y - bm.ty) * bm.vy >= 0) {
      if (!playerInvuln(s) && Math.hypot(bm.tx - p.x, bm.ty - p.y) <= BOMB_R && p.z < 24)
        damagePlayer(s, EN_STATS.bomber.dmg + dmgBonus(s), true, bm.tx);
      bm.dead = true;
    }
    if (s.phase === "dead") break;
  }
  if (s.bombs.some((b) => b.dead)) s.bombs = s.bombs.filter((b) => !b.dead);
}

// ── world flow ─────────────────────────────────────────────────────────────

function stepPickups(s: RiotState): void {
  const p = s.p;
  if (p.z > 0 || p.fsm === "down" || p.fsm === "getup" || p.fsm === "attack") return;
  for (const pk of s.pickups) {
    if (pk.taken) continue;
    if (Math.abs(pk.x - p.x) >= 26 || Math.abs(pk.y - p.y) > 16) continue;
    if (pk.kind === "health") {
      // a med kit is grabbed only when it can DO something: a full bar walks
      // over it and keeps it for the trip back (never wasted, never a weapon
      // conflict)
      if (p.hp >= p.hpMax) continue;
      pk.taken = true;
      p.hp = Math.min(p.hpMax, p.hp + HEAL_PACK_HP);
      s.pickupCount += 1;
      s.lastPickupKind = "health";
      break;
    }
    if (p.weapon !== "") continue; // armed: weapon pickups stay on the ground
    pk.taken = true;
    p.weapon = pk.kind;
    p.weaponUses = pk.uses;
    s.pickupCount += 1;
    s.lastPickupKind = pk.kind;
    break;
  }
}

function lockTargetX(s: RiotState): number {
  if (s.phase === "arena") return 0;
  if (s.boss) return s.levelW - DESIGN_W;
  if (s.fight >= 0) return curLevel(s).fights[s.fight].lockCamX;
  return s.camX;
}

function stepCamera(s: RiotState, dt: number): void {
  const target = s.camLock
    ? lockTargetX(s)
    : Math.max(0, Math.min(s.levelW - DESIGN_W, s.p.x - (DESIGN_W - CAM_LEAD) / 2 - 40));
  const step = CAM_SPEED * dt;
  const d = target - s.camX;
  if (Math.abs(d) <= step) s.camX = target;
  else s.camX += Math.sign(d) * step;
}

function stepTriggers(s: RiotState): void {
  if (s.phase !== "level" || s.fight >= 0 || s.boss) return;
  const def = curLevel(s);
  if (s.nextFight < def.fights.length) {
    if (s.p.x >= def.fights[s.nextFight].triggerX) {
      s.fight = s.nextFight;
      s.wave = 0;
      s.camLock = true;
      queueWave(s, def.fights[s.fight], 0);
    }
  } else if (s.p.x >= def.bossX) {
    s.camLock = true;
    spawnBoss(s, def);
  }
}

function stepSpawns(s: RiotState): void {
  if (s.pendingSpawns.length === 0) return;
  const due: RiotState["pendingSpawns"] = [];
  const rest: RiotState["pendingSpawns"] = [];
  for (const sp of s.pendingSpawns) {
    sp.delayF -= 1;
    if (sp.delayF <= 0) due.push(sp);
    else rest.push(sp);
  }
  s.pendingSpawns = rest;
  for (const sp of due) s.enemies.push(mkEnemy(sp.kind, sp.x, sp.y, sp.face, ENTRY_WARM_F));
}

function stepProgress(s: RiotState, koBefore: number): void {
  const live = s.enemies.length;
  const pend = s.pendingSpawns.length;
  if (s.phase === "level" && s.fight >= 0) {
    const f = curLevel(s).fights[s.fight];
    if (live === 0 && pend === 0 && s.wave >= f.waves.length - 1) {
      // the last kill unlocks: GO arrow + the clear chunk
      s.clearPts += FIGHT_CLEAR_PTS;
      s.fightsCleared += 1;
      s.nextFight += 1;
      s.fight = -1;
      s.wave = 0;
      s.camLock = false;
      s.goF = GO_F;
    } else if (live <= 1 && pend === 0 && s.wave < f.waves.length - 1) {
      s.wave += 1;
      queueWave(s, f, s.wave);
    }
  } else if (s.phase === "arena") {
    s.atkTokens = ARENA_TOKENS(arenaLap(s));
    if (live === 0 && pend === 0 && s.koCount > koBefore) s.bonusPts += ARENA_WAVE_PTS(s.arenaWave);
    if (s.arenaGapF > 0) s.arenaGapF -= 1;
    if (s.arenaGapF <= 0 && live < ARENA_LIVE_CAP) {
      queueArenaWave(s, s.arenaWave % ARENA_WAVES.length);
      s.arenaWave += 1;
      s.arenaGapF = Math.max(
        ARENA_GAP_FLOOR_F,
        Math.round(ARENA_GAP0_F * Math.pow(ARENA_GAP_DECAY, arenaLap(s))),
      );
    }
  }
}

// ── create / step (frozen signatures) ──────────────────────────────────────

export function createRiot(
  w: number,
  h: number,
  seed: string,
  demo: boolean,
  stats: Stats,
): RiotState {
  const st: Stats = stats || ZEROS;
  const hash = fnv1a(seed || "riot");
  const set = levelSetForSeed(hash);
  const setIdx = Math.max(0, LEVEL_SETS.indexOf(set));
  const aura = clampStat(st.aura, 30);
  const hpMax = PLAYER_HP_BASE + 6 * clampStat(st.botox, 4);
  const s: RiotState = {
    W: w,
    H: h,
    k: w / DESIGN_W,
    demo,
    t: 0,
    wallF: 0,
    phase: "level",
    setIdx,
    level: 0,
    levelW: DESIGN_W,
    camX: 0,
    camLock: false,
    fight: -1,
    nextFight: 0,
    wave: 0,
    goF: 0,
    transF: 0,
    pendingSpawns: [],
    arenaWave: 0,
    arenaGapF: 0,
    p: {
      x: 90,
      y: 320,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      face: 1,
      fsm: "idle",
      fsmF: 0,
      fsmDur: 0,
      attackId: "",
      comboStage: 0,
      chainF: 0,
      runF: 0,
      hp: hpMax,
      hpMax,
      iframes: 0,
      freeze: 0,
      weapon: "",
      weaponUses: 0,
    },
    enemies: [],
    boss: null,
    bolts: [],
    bombs: [],
    pickups: [],
    atkTokens: 2,
    prevDown: false,
    pressX: 0,
    pressY: 0,
    pressDragged: false,
    prevSpace: false,
    speed: PLAYER_SPEED * (1 + 0.06 * clampStat(st.drugs, 4)),
    dmgMul: 1 + 0.01 * aura,
    wakeupF: WAKEUP_IF_BASE + 8 * clampStat(st.ozempic, 4),
    tellLeadF: 3 * clampStat(st.optics, 4),
    hitCount: 0,
    lastHitX: 0,
    lastHitY: 0,
    lastHitHeavy: false,
    hurtCount: 0,
    koCount: 0,
    lastKoX: 0,
    lastKoY: 0,
    pickupCount: 0,
    lastPickupKind: "",
    blockCount: 0,
    comboCount: 0,
    comboT: 0,
    killPts: 0,
    clearPts: 0,
    bonusPts: 0,
    kills: 0,
    fightsCleared: 0,
    bossesDown: 0,
    rng: mulberry32(hash),
  };
  loadLevel(s, 0);
  return s;
}

export function stepRiot(s: RiotState, dt: number, input: SimInput): void {
  if (s.phase === "dead" || s.phase === "timeout") return;
  s.wallF += 1;
  s.t += dt;
  if (s.t >= MISSION_T) {
    s.phase = "timeout"; // anti-hang backstop only; banked points keep
    return;
  }
  if (s.comboT > 0) {
    s.comboT -= 1;
    if (s.comboT <= 0) {
      s.comboT = 0;
      s.comboCount = 0;
    }
  }
  if (s.goF > 0) s.goF -= 1;

  if (s.phase === "transition") {
    // WALL frames (the stopclock dead-air law): the beat never freezes
    s.transF -= 1;
    if (s.transF <= 0) {
      if (s.level >= 2) enterArena(s);
      else loadLevel(s, s.level + 1);
    }
    s.prevDown = input.down;
    s.prevSpace = input.space;
    return;
  }

  // ── input edges: the CLICK LAW v3 (see the constant block) ─────────────────
  const downEdge = input.down && !s.prevDown;
  const upEdge = !input.down && s.prevDown;
  if (downEdge) {
    if (input.px != null && input.py != null) {
      s.pressX = input.px;
      s.pressY = input.py;
      s.pressDragged = false;
    } else {
      // a press with no known origin can never be classified - spend it as
      // movement so it cannot fire a phantom punch
      s.pressDragged = true;
    }
  }
  if (input.down && input.px != null && input.py != null && !s.pressDragged) {
    if (Math.hypot(input.px - s.pressX, input.py - s.pressY) >= DRAG_PX) s.pressDragged = true;
  }
  // CLICK = PUNCH: any undragged release, at any duration, anywhere
  const tap = upEdge && !s.pressDragged;
  const jumpEdge = input.space && !s.prevSpace;
  s.prevDown = input.down;
  s.prevSpace = input.space;

  const koBefore = s.koCount;
  // widened reads below: the helpers mutate s.phase and TS keeps the old
  // narrowing across the calls
  const phase = (): RiotState["phase"] => s.phase;

  stepPlayer(s, dt, input, tap, jumpEdge);
  stepPickups(s);
  stepCamera(s, dt);
  stepTriggers(s);
  stepSpawns(s);
  stepEnemies(s, dt);
  if (phase() === "dead") return;
  stepBoss(s, dt);
  if (phase() === "dead") return;
  stepBolts(s, dt);
  if (phase() === "dead") return;
  stepBombs(s, dt);
  if (phase() === "dead") return;
  stepProgress(s, koBefore);
}

export function riotDone(s: RiotState): boolean {
  return s.phase === "dead" || s.phase === "timeout";
}

export function riotScore(s: RiotState): number {
  return s.killPts + s.clearPts + s.bonusPts;
}

export type { LevelSet, LevelDef, EnemyKind };
