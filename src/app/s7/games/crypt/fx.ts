/**
 * CRYPT FX STATE - the presentation-memory containers Client.tsx diffs sim
 * state into (the gauntlet riot/ironjaw pattern), plus the outcome-consistent
 * d20 face synthesis. Everything here is page-side and pool-preallocated: the
 * frame loop reuses these objects and never allocates. Math.random is allowed
 * HERE and nowhere near the sim.
 *
 * THE d20 FACES (the gauntlet law, restated for the crypt): the sim never
 * republishes resolveAttack's kept die, so the client synthesizes a face
 * CONSISTENT with the true outcome it reads off the counters diff - a crit
 * face sits inside the real crit range, a hit face clears the faced enemy's
 * real AC against the hero's real bonus, a miss face does not. Air whiffs
 * draw NO die at all: the sim rolls no rng for them, so the theater shows a
 * swing and nothing else. Outcomes are never invented; only the theatrical
 * face within the mathematically-true interval is.
 */

// ── clocks ──────────────────────────────────────────────────────────────────

export const SLASH_S = 0.22; // hero weapon arc life
export const DIE_FLICK = 0.2; // flicker window before a die lands
export const DIE_LIFE = 1.1;
export const HIT_STOP_S = 0.12;
export const COLLAPSE_S = 0.55; // billboard death squash
export const BONE_S = 0.8; // bone shard life
export const STEP_FADE_S = 0.15; // move/turn crossfade (120-180ms window)
export const DESCEND_FADE_S = 0.3;

// transition kinds
export const TR_NONE = 0;
export const TR_FWD = 1;
export const TR_BACK = 2;
export const TR_TURN_L = 3;
export const TR_TURN_R = 4;
export const TR_DESCEND = 5;

// slash kinds
export const SLASH_HIT = 0;
export const SLASH_WHIFF = 1;
export const SLASH_CRIT = 2;

// ── pools (preallocated; the frame loop never allocates) ────────────────────

/** Per-enemy hit theater, claimed by sim enemy id (ids are per-floor). */
export interface EnemyFx {
  id: string;
  flash: number; // white overlay 1 -> 0
  gold: number; // crit flash flag
  punch: number; // scale punch 1 -> 0
}

export interface DieFx {
  on: boolean;
  delay: number;
  t: number;
  x: number;
  y: number;
  r: number;
  face: number;
  kind: number;
  victimId: string; // crit settle flash target ("" = none)
  armed: boolean; // crit hit-stop not yet fired
  label: string; // roller name under the die ("YOU" / enemy name; "" = none)
  accent: string; // label color ("" = default dim)
}

export interface FloatFx {
  on: boolean;
  t: number;
  x: number;
  y: number;
  text: string;
  color: string;
  big: boolean;
}

/** A dead billboard squashing down at its last screen position. */
export interface CollapseFx {
  on: boolean;
  t: number;
  x: number;
  feetY: number;
  scale: number; // plane-ladder mid scale at death
  key: string; // bestiary id (art lookup / fallback silhouette)
}

export interface BoneFx {
  on: boolean;
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface SlashFx {
  t: number; // >= SLASH_S = idle
  x: number;
  y: number;
  scale: number;
  kind: number;
}

export interface Fx {
  time: number;
  hitStop: number;
  shake: number;
  shakeAmp: number;
  redPulse: number; // hero-hurt vignette 1 -> 0
  guardFlash: number; // "GUARDED" shield flash 1 -> 0 (CRYPT DUELS)
  deathT: number;
  banner: { text: string; sub: string; t: number; color: string };
  slash: SlashFx;
  enemies: EnemyFx[];
  dice: DieFx[];
  floats: FloatFx[];
  collapses: CollapseFx[];
  bones: BoneFx[];
  /** scene offscreen needs a repaint (state changed) */
  sceneDirty: boolean;
  /** transition requested by the delta engine, consumed by the render loop */
  transPending: number;
  trans: { type: number; t: number; dur: number };
}

export function mkFx(): Fx {
  const enemies: EnemyFx[] = [];
  for (let i = 0; i < 8; i++) enemies.push({ id: "", flash: 0, gold: 0, punch: 0 });
  const dice: DieFx[] = [];
  for (let i = 0; i < 6; i++)
    dice.push({ on: false, delay: 0, t: 0, x: 0, y: 0, r: 26, face: 1, kind: 0, victimId: "", armed: false, label: "", accent: "" });
  const floats: FloatFx[] = [];
  for (let i = 0; i < 16; i++) floats.push({ on: false, t: 0, x: 0, y: 0, text: "", color: "", big: false });
  const collapses: CollapseFx[] = [];
  for (let i = 0; i < 4; i++) collapses.push({ on: false, t: 0, x: 0, feetY: 0, scale: 1, key: "" });
  const bones: BoneFx[] = [];
  for (let i = 0; i < 24; i++) bones.push({ on: false, t: 0, x: 0, y: 0, vx: 0, vy: 0, r: 2 });
  return {
    time: 0,
    hitStop: 0,
    shake: 0,
    shakeAmp: 0,
    redPulse: 0,
    guardFlash: 0,
    deathT: 0,
    banner: { text: "", sub: "", t: 99, color: "#f0b340" },
    slash: { t: 99, x: 400, y: 300, scale: 1, kind: SLASH_HIT },
    enemies,
    dice,
    floats,
    collapses,
    bones,
    sceneDirty: true,
    transPending: TR_NONE,
    trans: { type: TR_NONE, t: 99, dur: STEP_FADE_S },
  };
}

/** Claim (or find) the fx slot for a sim enemy id. */
export function enemyFxFor(fx: Fx, id: string): EnemyFx {
  let free: EnemyFx | null = null;
  let coldest = fx.enemies[0];
  for (const e of fx.enemies) {
    if (e.id === id) return e;
    if (!free && e.id === "" ) free = e;
    if (e.flash <= coldest.flash) coldest = e;
  }
  const slot = free || coldest;
  slot.id = id;
  slot.flash = 0;
  slot.gold = 0;
  slot.punch = 0;
  return slot;
}

/** Read-only lookup (renderer side): null when the id has no live fx. */
export function enemyFxPeek(fx: Fx, id: string): EnemyFx | null {
  for (const e of fx.enemies) if (e.id === id) return e;
  return null;
}

export function clearEnemyFx(fx: Fx): void {
  for (const e of fx.enemies) {
    e.id = "";
    e.flash = 0;
    e.gold = 0;
    e.punch = 0;
  }
}

// ── the per-step snapshot the delta engine diffs against ────────────────────

export interface PrevEnemy {
  id: string;
  key: string;
  x: number;
  y: number;
  hp: number;
  windup: number;
  atk: number;
  ac: number;
  wk: number; // weaken stacks at snapshot time (foe-die interval exactness)
  xp: number;
}

export interface Prev {
  inited: boolean;
  x: number;
  y: number;
  facing: number;
  depth: number;
  hp: number;
  belt: number;
  whet: number;
  kills: number;
  crits: number;
  swings: number;
  whiffs: number;
  enemyWhiffs: number;
  dmgDealt: number;
  dmgTaken: number;
  drinks: number;
  chestsOpened: number;
  floorsDescended: number;
  dead: number;
  /** faced enemy at snapshot time (for the NEXT swing's die synthesis) */
  facedId: string;
  facedAc: number;
  facedD: number; // cells ahead (1..reach); 1 when nothing faced
  // ── the duel machine snapshot (CRYPT DUELS) ───────────────────────────────
  duelId: string;
  duelPhase: number;
  duelStyle: string; // the tell's style at snapshot time ("" outside TELL)
  duels: number;
  guards: number;
  deflects: number;
  countersEaten: number;
  baited: number;
  en: PrevEnemy[];
  enN: number;
}

export function mkPrev(): Prev {
  const en: PrevEnemy[] = [];
  for (let i = 0; i < 8; i++) en.push({ id: "", key: "", x: 0, y: 0, hp: 0, windup: 0, atk: 0, ac: 10, wk: 0, xp: 0 });
  return {
    inited: false,
    x: 0,
    y: 0,
    facing: 0,
    depth: 0,
    hp: 0,
    belt: 0,
    whet: 0,
    kills: 0,
    crits: 0,
    swings: 0,
    whiffs: 0,
    enemyWhiffs: 0,
    dmgDealt: 0,
    dmgTaken: 0,
    drinks: 0,
    chestsOpened: 0,
    floorsDescended: 0,
    dead: 0,
    facedId: "",
    facedAc: 10,
    facedD: 1,
    duelId: "",
    duelPhase: 0,
    duelStyle: "",
    duels: 0,
    guards: 0,
    deflects: 0,
    countersEaten: 0,
    baited: 0,
    en,
    enN: 0,
  };
}

// ── outcome-consistent die faces (gauntlet fx law, local copy) ──────────────

export function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
export function faceForHit(need: number, critRange: number): number {
  const lo = Math.max(2, Math.min(need, 19));
  const hi = Math.max(lo, Math.min(critRange - 1, 19));
  return randInt(lo, hi);
}
export function faceForMiss(need: number): number {
  const hi = Math.min(need - 1, 19);
  if (hi < 2) return 1;
  return Math.random() < 0.08 ? 1 : randInt(2, hi);
}
export function faceForCrit(critRange: number): number {
  const lo = Math.max(2, Math.min(critRange, 20));
  return Math.random() < 0.7 ? 20 : randInt(lo, 20);
}

// ── page-fx stream (the gradekit lcg law: NEVER the sim PRNG family) ────────

export function mkLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
