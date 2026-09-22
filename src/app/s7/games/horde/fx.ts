/**
 * HORDE FX STATE - the presentation-memory containers Client.tsx diffs sim
 * state into (the gauntlet/riot pattern carried whole). Everything here is
 * page-side and pool-preallocated: the frame loop reuses these objects and
 * never allocates. Math.random is allowed HERE and nowhere near the sim.
 *
 * The sim publishes monotonic counters (swings/casts/crits/kills/dmgTaken/
 * potsUsed) plus per-entity positions and hp; the client diffs a Prev
 * snapshot per fixed step into countdown fx - hit flashes, scale punches,
 * skill shapes, loot-drop bursts, death sinks with bone scatter, screen
 * shake and the big-moment hit-stop (stepping pauses, rendering continues).
 */

import type { ClassId } from "../_shared/rules/core";
import type { HordeState } from "./sim";
import { ENEMY_CAP } from "./content";

export const HIT_STOP_S = 0.09; // big-moment freeze (wave wipe / elite fall)
export const DEATH_S = 0.75;    // corpse fade + sink
export const SWING_S = 0.16;    // melee arc life

/** DIRS8 x/y components mirrored from the sim's private table (presentation
 * copy - facing index semantics: 0=E,1=SE,2=S,3=SW,4=W,5=NW,6=N,7=NE). */
export const FACE_X: readonly number[] = [1, 1, 0, -1, -1, -1, 0, 1];
export const FACE_Y: readonly number[] = [0, 1, 1, 1, 0, -1, -1, -1];

// ring-fx kinds
export const RK_RING = 0;   // expanding stroked circle (nova, blast rim)
export const RK_DISC = 1;   // soft filled burst disc (blast core, loot pop)
export const RK_ARC = 2;    // partial arc in a facing direction (swing, wave)
export const RK_PILLAR = 3; // vertical light column (smite; loot beams are
                            // NOT rings - they render straight from s.items)

// ── pools ───────────────────────────────────────────────────────────────────

export interface SparkFx {
  on: boolean;
  t: number;
  life: number;
  x: number;
  y: number;
  vx: number; // px/s
  vy: number;
  size: number;
  color: string;
  add: boolean; // additive (budgeted) vs plain (bone chips)
  drag: number; // velocity decay per second
}

export interface RingFx {
  on: boolean;
  delay: number;
  t: number;
  life: number;
  x: number;
  y: number;
  r0: number;
  r1: number;
  width: number;
  color: string;
  kind: number; // RK_*
  ang: number;  // ARC center angle; PILLAR unused
  spread: number; // ARC half-angle
}

export interface BoltFx {
  on: boolean;
  t: number;
  life: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  color: string;
}

export interface GhostFx {
  on: boolean;
  t: number;
  life: number;
  x: number;
  y: number;
  flip: boolean;
  cls: ClassId;
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

export interface DeathFx {
  on: boolean;
  t: number;
  x: number; // px
  y: number;
  key: string; // bestiary id, for the sprite/vector corpse
  flip: boolean;
  elite: boolean;
}

/** Per-live-enemy hit memory, claimed by sim entity id (enemies churn, the
 * pool never does). id === "" marks a free slot. */
export interface EnemyFx {
  id: string;
  flash: number;
  punch: number;
}

export interface Fx {
  time: number;
  hitStop: number;
  shake: number;
  shakeAmp: number;
  heroFlash: number;
  heroPunch: number;
  heroFlip: boolean;
  moveT: number; // >0 while the hero walked recently (walk bob)
  orbHp: number; // hp orb pulse (potion / heal)
  orbMp: number;
  sparks: SparkFx[];
  rings: RingFx[];
  bolts: BoltFx[];
  ghosts: GhostFx[];
  floats: FloatFx[];
  deaths: DeathFx[];
  eFx: EnemyFx[];
  banner: { text: string; sub: string; t: number; color: string };
  deathT: number;
}

export function mkFx(): Fx {
  const sparks: SparkFx[] = [];
  for (let i = 0; i < 160; i++)
    sparks.push({ on: false, t: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0, size: 2, color: "", add: false, drag: 3 });
  const rings: RingFx[] = [];
  for (let i = 0; i < 40; i++)
    rings.push({ on: false, delay: 0, t: 0, life: 1, x: 0, y: 0, r0: 0, r1: 0, width: 4, color: "", kind: RK_RING, ang: 0, spread: 0 });
  const bolts: BoltFx[] = [];
  for (let i = 0; i < 12; i++)
    bolts.push({ on: false, t: 0, life: 1, x0: 0, y0: 0, x1: 0, y1: 0, width: 4, color: "" });
  const ghosts: GhostFx[] = [];
  for (let i = 0; i < 8; i++) ghosts.push({ on: false, t: 0, life: 1, x: 0, y: 0, flip: false, cls: "barbarian" });
  const floats: FloatFx[] = [];
  for (let i = 0; i < 20; i++) floats.push({ on: false, t: 0, x: 0, y: 0, text: "", color: "", big: false });
  const deaths: DeathFx[] = [];
  for (let i = 0; i < 24; i++) deaths.push({ on: false, t: 0, x: 0, y: 0, key: "skeleton", flip: false, elite: false });
  const eFx: EnemyFx[] = [];
  for (let i = 0; i < ENEMY_CAP + 8; i++) eFx.push({ id: "", flash: 0, punch: 0 });
  return {
    time: 0,
    hitStop: 0,
    shake: 0,
    shakeAmp: 0,
    heroFlash: 0,
    heroPunch: 0,
    heroFlip: false,
    moveT: 0,
    orbHp: 0,
    orbMp: 0,
    sparks,
    rings,
    bolts,
    ghosts,
    floats,
    deaths,
    eFx,
    banner: { text: "", sub: "", t: 99, color: "#f0b340" },
    deathT: 0,
  };
}

/** Room transition: everything anchored in room space dies with the room. */
export function clearRoomFx(fx: Fx): void {
  for (const s of fx.sparks) s.on = false;
  for (const r of fx.rings) r.on = false;
  for (const b of fx.bolts) b.on = false;
  for (const g of fx.ghosts) g.on = false;
  for (const f of fx.floats) f.on = false;
  for (const d of fx.deaths) d.on = false;
  for (const e of fx.eFx) {
    e.id = "";
    e.flash = 0;
    e.punch = 0;
  }
}

// ── the per-step snapshot (preallocated; the delta engine diffs it) ─────────

const PREV_CAP = ENEMY_CAP + 8;

export interface Prev {
  inited: boolean;
  phase: HordeState["phase"];
  depth: number;
  exitOpen: number;
  hp: number;
  mana: number;
  x: number; // FINE
  y: number;
  kills: number;
  crits: number;
  swings: number;
  casts: number;
  dmgTaken: number;
  potsUsed: number;
  weaponTier: number;
  spellTier: number;
  hpPots: number;
  mpPots: number;
  eN: number;
  eId: string[];
  eHp: number[];
  eX: number[]; // FINE
  eY: number[];
  eXp: number[];
  eElite: number[];
  eKey: string[];
}

export function mkPrev(): Prev {
  const eId: string[] = [];
  const eHp: number[] = [];
  const eX: number[] = [];
  const eY: number[] = [];
  const eXp: number[] = [];
  const eElite: number[] = [];
  const eKey: string[] = [];
  for (let i = 0; i < PREV_CAP; i++) {
    eId.push("");
    eHp.push(0);
    eX.push(0);
    eY.push(0);
    eXp.push(0);
    eElite.push(0);
    eKey.push("");
  }
  return {
    inited: false,
    phase: "run",
    depth: 0,
    exitOpen: 0,
    hp: 0,
    mana: 0,
    x: 0,
    y: 0,
    kills: 0,
    crits: 0,
    swings: 0,
    casts: 0,
    dmgTaken: 0,
    potsUsed: 0,
    weaponTier: 0,
    spellTier: 0,
    hpPots: 0,
    mpPots: 0,
    eN: 0,
    eId,
    eHp,
    eX,
    eY,
    eXp,
    eElite,
    eKey,
  };
}

export function snap(p: Prev, s: HordeState): void {
  p.inited = true;
  p.phase = s.phase;
  p.depth = s.depth;
  p.exitOpen = s.exitOpen;
  p.hp = s.hp;
  p.mana = s.mana;
  p.x = s.x;
  p.y = s.y;
  p.kills = s.kills;
  p.crits = s.crits;
  p.swings = s.swings;
  p.casts = s.casts;
  p.dmgTaken = s.dmgTaken;
  p.potsUsed = s.potsUsed;
  p.weaponTier = s.weaponTier;
  p.spellTier = s.spellTier;
  p.hpPots = s.hpPots;
  p.mpPots = s.mpPots;
  const n = Math.min(s.enemies.length, PREV_CAP);
  p.eN = n;
  for (let i = 0; i < n; i++) {
    const en = s.enemies[i];
    p.eId[i] = en.id;
    p.eHp[i] = en.hp;
    p.eX[i] = en.x;
    p.eY[i] = en.y;
    p.eXp[i] = en.xp;
    p.eElite[i] = en.elite;
    p.eKey[i] = en.key;
  }
}
