/**
 * GAUNTLET FX STATE - the presentation-memory containers Client.tsx diffs
 * sim state into (the riot/ironjaw pattern), plus the outcome-consistent d20
 * face synthesis. Everything here is page-side and pool-preallocated: the
 * frame loop reuses these objects and never allocates. Math.random is
 * allowed HERE and nowhere near the sim.
 *
 * THE d20 FACES: the sim does not republish resolveAttack's kept die
 * (AttackOut.die is consumed internally), so the client synthesizes a face
 * CONSISTENT with the true outcome it reads off the sim's counters - a crit
 * face sits inside the real crit range, a hit face clears the target's real
 * AC against the attacker's real bonus, a miss face does not, and a
 * sub-(AC-atk) whiff can land a red nat 1. Outcomes are never invented;
 * only the theatrical face within the mathematically-true interval is.
 */

import type { GauntletState } from "./sim";
import { PAL } from "./draw";

export const LUNGE_S = 0.24; // 120ms out + 120ms back
export const DIE_FLICK = 0.2; // flicker window before the die lands
export const DIE_LIFE = 1.15;
export const DEATH_S = 0.7;
export const HIT_STOP_S = 0.12;

// ── fx pools (preallocated; the frame loop never allocates) ─────────────────

export interface ActorFx {
  flash: number;
  gold: number;
  punch: number;
  lunge: number;
  rim: number;
  death: number;
}
export const mkActor = (): ActorFx => ({ flash: 0, gold: 0, punch: 0, lunge: 0, rim: 0, death: 0 });

export interface DieFx {
  on: boolean;
  delay: number;
  t: number;
  x: number;
  y: number;
  r: number;
  face: number;
  kind: number;
  slot: number; // victim enemy slot for the crit settle flash; -1 = none
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

export interface Fx {
  time: number;
  hitStop: number;
  shake: number;
  shakeAmp: number;
  hero: ActorFx;
  foes: ActorFx[];
  dice: DieFx[];
  floats: FloatFx[];
  banner: { text: string; sub: string; t: number; color: string };
  handEnter: number;
  deathT: number;
  /** First-run hint latch: which hint is on screen ("" = none) and its line.
   * Page-side only; resets with the run via mkFx. */
  hintKey: string;
  hintText: string;
}

export function mkFx(): Fx {
  const dice: DieFx[] = [];
  for (let i = 0; i < 8; i++)
    dice.push({ on: false, delay: 0, t: 0, x: 0, y: 0, r: 26, face: 1, kind: 0, slot: -1, armed: false, label: "", accent: "" });
  const floats: FloatFx[] = [];
  for (let i = 0; i < 16; i++) floats.push({ on: false, t: 0, x: 0, y: 0, text: "", color: "", big: false });
  return {
    time: 0,
    hitStop: 0,
    shake: 0,
    shakeAmp: 0,
    hero: mkActor(),
    foes: [mkActor(), mkActor(), mkActor()],
    dice,
    floats,
    banner: { text: "", sub: "", t: 99, color: PAL.gold },
    handEnter: 1,
    deathT: 0,
    hintKey: "",
    hintText: "",
  };
}

/** The per-step snapshot the delta engine diffs against (reused, never
 * re-created: plain preallocated fields). */
export interface Prev {
  inited: boolean;
  phase: GauntletState["phase"];
  sub: GauntletState["sub"];
  turn: number;
  floor: number;
  floorsCleared: number;
  enemyIdx: number;
  kills: number;
  crits: number;
  whiffs: number;
  cardsPlayed: number;
  hp: number;
  block: number;
  cower: number;
  relicN: number;
  handLen: number;
  hand: string[];
  eHp: number[];
  eBlock: number[];
  eStun: number[];
  eAlive: number;
}
export function mkPrev(): Prev {
  return {
    inited: false,
    phase: "node",
    sub: "hero",
    turn: 0,
    floor: 0,
    floorsCleared: 0,
    enemyIdx: 0,
    kills: 0,
    crits: 0,
    whiffs: 0,
    cardsPlayed: 0,
    hp: 0,
    block: 0,
    cower: 0,
    relicN: 0,
    handLen: 0,
    hand: ["", "", "", "", ""],
    eHp: [0, 0, 0],
    eBlock: [0, 0, 0],
    eStun: [0, 0, 0],
    eAlive: 0,
  };
}
export function snap(p: Prev, s: GauntletState): void {
  p.inited = true;
  p.phase = s.phase;
  p.sub = s.sub;
  p.turn = s.turn;
  p.floor = s.floor;
  p.floorsCleared = s.floorsCleared;
  p.enemyIdx = s.enemyIdx;
  p.kills = s.kills;
  p.crits = s.crits;
  p.whiffs = s.whiffs;
  p.cardsPlayed = s.cardsPlayed;
  p.hp = s.hp;
  p.block = s.block;
  p.cower = s.cower;
  p.relicN = s.relics.length;
  p.handLen = s.hand.length;
  for (let i = 0; i < 5; i++) p.hand[i] = i < s.hand.length ? s.hand[i] : "";
  p.eAlive = 0;
  for (let i = 0; i < 3; i++) {
    const en = i < s.enemies.length ? s.enemies[i] : null;
    p.eHp[i] = en ? en.hp : 0;
    p.eBlock[i] = en ? en.block : 0;
    p.eStun[i] = en ? en.conds.stun : 0;
    if (en && en.hp > 0) p.eAlive++;
  }
}

// ── outcome-consistent die faces (see header) ───────────────────────────────

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

// ── first-run hints (localStorage-gated, one time ever per browser) ─────────
// Same wrapped-storage pattern as src/lib/s7/ftue.ts: storage being blocked
// must never break the page - a blocked read just shows the hints again.

export const HINTS_STORAGE_KEY = "s7_gauntlet_hints";

export interface HintsSeen {
  node: boolean;
  draft: boolean;
  shrine: boolean;
  boss: boolean;
}

export type HintKey = keyof HintsSeen;

/** The hint copy, keyed like the storage fields (canvas strings, en). */
export const HINT_TEXT: Record<HintKey, string> = {
  node: "Fights pay score. Rest and shrines keep you alive, but only battles pay.",
  draft: "Add one card to your deck. SPACE skips if none fits.",
  shrine: "Shrines trade risk for power. A relic lasts the whole run.",
  boss: "A named horror guards every 10th floor. Slay it for a guaranteed relic.",
};

let hintsCache: HintsSeen | null = null;

export function readHintsSeen(): HintsSeen {
  if (hintsCache) return hintsCache;
  const empty: HintsSeen = { node: false, draft: false, shrine: false, boss: false };
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(HINTS_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<HintsSeen>;
      empty.node = Boolean(p.node);
      empty.draft = Boolean(p.draft);
      empty.shrine = Boolean(p.shrine);
      empty.boss = Boolean(p.boss);
    }
  } catch {
    // storage blocked: hints simply show again
  }
  hintsCache = empty;
  return empty;
}

export function markHintSeen(k: HintKey): void {
  const seen = readHintsSeen();
  if (seen[k]) return;
  seen[k] = true;
  try {
    localStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // storage blocked: seen-state lives for this page load only
  }
}
