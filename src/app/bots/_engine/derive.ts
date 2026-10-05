/**
 * BATTLE BOTS DERIVE - every fighter number from engine doc section 2 as a
 * linear whole-number formula, so a part card can print what it does
 * (describePart feeds cards, the build screen and the harness) and the
 * resolver never invents a number of its own.
 *
 * LAWS THIS FILE CARRIES:
 *  - INTEGER-ONLY outputs. Every field on Fighter is an int; it is serialized
 *    inside the fight state and hashed (the crypt law).
 *  - THE KNOBS ARE NAMED. FORMULA holds every tunable the engine doc names
 *    (interval floor, base damage, hit clamp, crit base); the massim tunes
 *    them and the engine version bumps when they move.
 *  - ORDERS ARE STAT DELTAS through the same formulas, never a new rule.
 *    Stance 1 Guard: block +2, dodge +2, damage -3. Stance 2 Rush: attack
 *    speed +2, damage +2, dodge -3, block -2. Focus is a target weight the
 *    resolver reads. Aggregates never go under 0 after a delta.
 *  - THE SET BONUS LANDS HERE AND NOWHERE ELSE (guide "Matched sets"):
 *    setBonus().perStat is added to every fight aggregate in aggregates().
 *    buildTotal() and botTier() never see it, so a set is a boost in the
 *    pit and never a tier in the garage. describeSet() is the readout.
 */

import {
  BODY_SLOTS,
  NO_ORDERS,
  PIECE,
  SLOT_STATS,
  buildTotal,
  partColor,
  partFamily,
  setBonus,
  type Build,
  type CardLookup,
  type Orders,
  type PaintId,
  type SetBonus,
  type Slot,
  type StatName,
  type Stats,
} from "./parts";
import { CARD_INDEX, FAMILY_INDEX } from "./catalog";

// ── the knobs (engine doc section 2, tuned by scripts/bots-massim.ts) ───────
// TUNED 2026-09-03 (week 1 massim, engine v1 before any fight shipped). The
// doc's paper numbers (body 50 + 8H + 2S, limb 16 + 2S, damage 8 + DMG,
// hit 70 + 3ACC - 3DODGE, interval 90 - 3AS - SPD, crit 2 + LUCK) made a
// +10 point bot win 89 percent and one tier down win 0 percent: every
// dimension compounds, and per-hit noise averages out over 60 hits. None
// of the doc's named knobs moved that by more than 3 points. The fix is
// the bases and coefficients below: four times the base armor and damage
// with the same per-point gains, hit and interval at 2 per point, crit at
// 3 per luck. Measured: +10 wins 70, +20 wins 91, T3 vs T1 99.6, the max
// luck build 49, medians 33 to 48 s at every tier, 2 hits per limb held.
// Then the archetype round robin (gate E): max dodge won 80 percent and
// every high-block build sat under 30, because a block parked half the hit
// on the arm and cost the arm, the block and the body shielding together.
// Hit floor 20 -> 40 and the arm takes a quarter (resolve.ts BLOCK_DIVISOR)
// put all 40 archetypes inside 39..64 with block at the doc's 4 per point.

export const FORMULA = {
  BODY_BASE: 200,
  BODY_PER_HEALTH: 8,
  BODY_PER_STR: 2,
  LIMB_BASE: 64,
  LIMB_PER_STR: 2,
  DMG_BASE: 36,
  STR_PER_DMG: 3,
  HIT_BASE: 70,
  HIT_PER_ACC: 2,
  HIT_PER_DODGE: 2,
  HIT_MIN: 40,
  HIT_MAX: 95,
  BLOCK_PER_POINT: 4,
  INTERVAL_BASE: 120,
  INTERVAL_PER_ATKSPD: 2,
  INTERVAL_PER_SPEED: 1,
  INTERVAL_MIN: 72,
  INTERVAL_MAX: 120,
  CRIT_BASE: 5,
  CRIT_PER_LUCK: 3,
} as const;

/** Torso shielding by intact target arms (index = arms standing): percent
 * of body damage that lands. "Each arm shields the body by a quarter." */
export const SHIELD_PERCENT: readonly [number, number, number] = [100, 75, 50];

interface StanceDelta {
  block: number;
  dodge: number;
  dmg: number;
  atkSpd: number;
}
const STANCES: readonly StanceDelta[] = [
  { block: 0, dodge: 0, dmg: 0, atkSpd: 0 },
  { block: 2, dodge: 2, dmg: -3, atkSpd: 0 },
  { block: -2, dodge: -3, dmg: 2, atkSpd: 2 },
];

// ── aggregates ──────────────────────────────────────────────────────────────

export interface Aggregates {
  speed: number;   // legs.speed (0..12)
  str: number;     // legs + arms + torso strength (0..36)
  dodge: number;   // legs + head dodge (0..24)
  dmg: number;     // arms + weapon damage (0..24)
  block: number;   // arms.block (0..12)
  health: number;  // torso.health (0..12)
  luck: number;    // torso + head luck (0..24)
  acc: number;     // head + weapon accuracy (0..24)
  atkSpd: number;  // weapon.attackSpeed (0..12)
}

export const AGGREGATE_KEYS: readonly (keyof Aggregates)[] = ["speed", "str", "dodge", "dmg", "block", "health", "luck", "acc", "atkSpd"];

const nz = (n: number): number => (n < 0 ? 0 : n);

/** The nine fight aggregates. The set bonus (0 / 1 / 2 / 3) is added to
 * every one of them here, before the stance delta's floor at 0; every
 * aggregate then carries +k, so a matched body is stronger everywhere by
 * the same whole number the card promised. */
export function aggregates(b: Build, o: Orders = NO_ORDERS): Aggregates {
  const st = STANCES[o.stance] ?? STANCES[0];
  const k = setBonus(b, CARD_INDEX).perStat;
  return {
    speed: b.legs.s[0] + k,
    str: b.legs.s[1] + b.arms.s[1] + b.torso.s[1] + k,
    dodge: nz(b.legs.s[2] + b.head.s[1] + st.dodge + k),
    dmg: nz(b.arms.s[0] + b.weapon.s[0] + st.dmg + k),
    block: nz(b.arms.s[2] + st.block + k),
    health: b.torso.s[0] + k,
    luck: b.torso.s[2] + b.head.s[2] + k,
    acc: b.head.s[0] + b.weapon.s[2] + k,
    atkSpd: nz(b.weapon.s[1] + st.atkSpd + k),
  };
}

// ── the fighter numbers ─────────────────────────────────────────────────────

export interface Fighter extends Aggregates {
  total: number;         // bot total (5..100), NEVER including the set bonus
  setPerStat: number;    // the set bonus every aggregate above carries (0..3)
  bodyArmor: number;     // BODY_BASE + 8 x HEALTH + 2 x STR
  limbArmor: number;     // LIMB_BASE + 2 x STR, each arm, each leg and the head
  damagePerHit: number;  // DMG_BASE + DMG + floor(STR / 3)
  interval: number;      // INTERVAL_BASE - 2 x ATKSPD - SPEED, clamped
  critChance: number;    // CRIT_BASE + 3 x LUCK percent, damage x2
  bounceChance: number;  // LUCK percent, once per fight
  focus: number;         // orders.focus, read by the resolver's target pick
}

export function clampInt(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Hit chance for one swing: HIT_BASE + 2 x ACC - 2 x DODGE, clamped 40..95.
 * The resolver passes the EFFECTIVE acc and dodge (broken legs, broken
 * head, the tired rule) through here. */
export function hitChance(acc: number, dodge: number): number {
  return clampInt(FORMULA.HIT_BASE + FORMULA.HIT_PER_ACC * acc - FORMULA.HIT_PER_DODGE * dodge, FORMULA.HIT_MIN, FORMULA.HIT_MAX);
}

export function blockChance(block: number): number {
  return FORMULA.BLOCK_PER_POINT * block;
}

export function swingInterval(atkSpd: number, speed: number): number {
  return clampInt(
    FORMULA.INTERVAL_BASE - FORMULA.INTERVAL_PER_ATKSPD * atkSpd - FORMULA.INTERVAL_PER_SPEED * speed,
    FORMULA.INTERVAL_MIN,
    FORMULA.INTERVAL_MAX,
  );
}

export function deriveFighter(b: Build, o: Orders = NO_ORDERS): Fighter {
  const a = aggregates(b, o);
  return {
    ...a,
    total: buildTotal(b),
    setPerStat: setBonus(b, CARD_INDEX).perStat,
    bodyArmor: FORMULA.BODY_BASE + FORMULA.BODY_PER_HEALTH * a.health + FORMULA.BODY_PER_STR * a.str,
    limbArmor: FORMULA.LIMB_BASE + FORMULA.LIMB_PER_STR * a.str,
    damagePerHit: FORMULA.DMG_BASE + a.dmg + Math.floor(a.str / FORMULA.STR_PER_DMG),
    interval: swingInterval(a.atkSpd, a.speed),
    critChance: FORMULA.CRIT_BASE + FORMULA.CRIT_PER_LUCK * a.luck,
    bounceChance: a.luck,
    focus: o.focus,
  };
}

/** Starting armor per piece in PIECE order: head, body, arms, legs. */
export function startingArmor(f: Fighter): number[] {
  const out = new Array<number>(6);
  out[PIECE.HEAD] = f.limbArmor;
  out[PIECE.BODY] = f.bodyArmor;
  out[PIECE.ARM_L] = f.limbArmor;
  out[PIECE.ARM_R] = f.limbArmor;
  out[PIECE.LEG_L] = f.limbArmor;
  out[PIECE.LEG_R] = f.limbArmor;
  return out;
}

// ── card lines ──────────────────────────────────────────────────────────────

/** One plain-words line per stat with the part's own numbers worked in
 * (whole numbers, "percent" spelled out). Arms add the shielding line. */
function statLine(name: StatName, v: number): string {
  const F = FORMULA;
  switch (name) {
    case "speed":
      return `Speed ${v}: swings ${v * F.INTERVAL_PER_SPEED} frames sooner, and the faster bot swings first`;
    case "strength":
      return `Strength ${v}: +${v * F.LIMB_PER_STR} armor on the body, each arm, each leg and the head, and every 3 strength adds 1 damage`;
    case "dodge":
      return `Dodge ${v}: ${v * F.HIT_PER_DODGE} percent harder to hit`;
    case "damage":
      return `Damage ${v}: +${v} damage on every hit`;
    case "block":
      return `Block ${v}: ${v * F.BLOCK_PER_POINT} percent chance to block. A block cuts the hit to a quarter and the arm takes it`;
    case "health":
      return `Health ${v}: +${v * F.BODY_PER_HEALTH} body armor`;
    case "luck":
      return `Luck ${v}: +${v * F.CRIT_PER_LUCK} percent lucky hit for double damage, and ${v} percent that a breaking part hangs on at 1, once a fight`;
    case "accuracy":
      return `Accuracy ${v}: +${v * F.HIT_PER_ACC} percent to hit`;
    case "attack speed":
      return `Attack speed ${v}: swings ${v * F.INTERVAL_PER_ATKSPD} frames sooner`;
  }
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The style line and the paint a body card prints under its stats; a
 * weapon prints nothing here because it never counts toward a set. */
export function styleLine(part: { slot: Slot; family?: string; color?: PaintId }): string | null {
  if (part.slot === "weapon") return null;
  const fam = part.family ? (FAMILY_INDEX[part.family]?.name ?? part.family) : "";
  const paint = part.color ? `${part.color} paint` : "no paint";
  return fam ? `${fam} style, ${paint}` : `No style line, ${paint}`;
}

export function describePart(part: { slot: Slot; s: Stats; family?: string; color?: PaintId }): string[] {
  const names = SLOT_STATS[part.slot];
  const lines = [statLine(names[0], part.s[0]), statLine(names[1], part.s[1]), statLine(names[2], part.s[2])];
  if (part.slot === "arms") lines.push("Each arm shields the body by a quarter");
  const style = styleLine(part);
  if (style) lines.push(style);
  return lines;
}

// ── the set readout (the build screen, the CLI) ─────────────────────────────

/** The guide's player line, printed whenever the body has no set yet. */
export const SET_HINT = "Match all four body parts by color or by style and your bot fights stronger.";

export interface SetReadout {
  /** the leading style line among the four body parts (most parts; a tie
   * goes to the earlier slot), null when no body part has one */
  family: { id: string; name: string; count: number } | null;
  /** the leading paint the same way, painted color first */
  color: { id: PaintId; count: number } | null;
  bonus: SetBonus;
  /** "Kettle set: 3 of 4", "Coral paint: 2 of 4", then the bonus or the hint */
  lines: string[];
}

/** The entry with the most parts; a tie goes to the earlier one (a Map keeps
 * insertion order, and the body slots are walked in order). Array.from and
 * an index loop, not for..of: the repo tsconfig has no target, so a Map
 * cannot be iterated without downlevelIteration. */
function leading<K>(m: Map<K, number>): { id: K; count: number } | null {
  let best: { id: K; count: number } | null = null;
  const entries = Array.from(m.entries());
  for (let i = 0; i < entries.length; i++) {
    const [id, count] = entries[i];
    if (best === null || count > best.count) best = { id, count };
  }
  return best;
}

export function describeSet(b: Build, cards: CardLookup = CARD_INDEX): SetReadout {
  const famCount = new Map<string, number>();
  const colCount = new Map<PaintId, number>();
  for (const slot of BODY_SLOTS) {
    const f = partFamily(b[slot], cards);
    if (f) famCount.set(f, (famCount.get(f) ?? 0) + 1);
    const c = partColor(b[slot], cards);
    if (c) colCount.set(c, (colCount.get(c) ?? 0) + 1);
  }
  const famLead = leading(famCount);
  const family: SetReadout["family"] = famLead ? { id: famLead.id, name: FAMILY_INDEX[famLead.id]?.name ?? famLead.id, count: famLead.count } : null;
  const color: SetReadout["color"] = leading(colCount);
  const bonus = setBonus(b, cards);
  const lines: string[] = [];
  lines.push(family ? `${family.name} set: ${family.count} of 4` : "No style set yet");
  lines.push(color ? `${capital(color.id)} paint: ${color.count} of 4` : "No paint yet");
  if (bonus.perStat > 0) {
    const why = bonus.familyMatch && bonus.colorMatch ? "style and paint" : bonus.familyMatch ? "style" : "paint";
    lines.push(`Set bonus: +${bonus.perStat} to every stat in the fight (${why})`);
  } else {
    lines.push(SET_HINT);
  }
  return { family, color, bonus, lines };
}
