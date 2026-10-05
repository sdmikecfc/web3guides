/**
 * THE RULES CORE (S7, ADR-0129 panel law) - one D&D-flavoured engine, every
 * game a presentation. All four S7 sims consume THIS module and render its
 * events; no sim ever rolls its own combat numbers. Mechanics borrowed from
 * SRD 5.2.1 (CC BY 4.0, (c) Wizards of the Coast; attribution ships in site
 * credits - a license condition): d20 vs AC, advantage/disadvantage, natural-20
 * crits doubling damage dice, XdY+Z weapon dice, the undead line, CR-to-XP.
 * Deliberately NOT borrowed: ability scores, proficiency, saves, spell slots,
 * initiative - the games are 60-180s score runs, not campaigns.
 *
 * LAWS THIS FILE ENFORCES:
 *  - INTEGER-ONLY outputs. Every number leaving this module is an int, so
 *    FNV-1a hashes of sim state stay platform-stable (the determinism gate).
 *  - FORKED RNG: one stream per entity per purpose via rngFork(). A player
 *    stat change must never move a monster's dice - a shared stream is a
 *    butterfly bomb that turns the stats-matter gate into noise.
 *  - NO turn engine here. Turn order, timing, and pacing belong to each sim;
 *    the core resolves single actions and emits events.
 *  - Gear/level change SURVIVAL and SPEED, never points-per-event
 *    (ceiling-neutrality, ADR-0070 lineage). The core exposes numbers; sims
 *    must never route them into per-event score values.
 */

// ── seeded RNG (byte-identical to the S6 game contract) ─────────────────────
export function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = () => number;

export function mulberry32(a: number): Rng {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One stream per entity per purpose. `rngFork(seed, "skel_07", "attack")`
 * always yields the same stream regardless of what any OTHER entity rolled. */
export function rngFork(seed: number, entityId: string, purpose: string): Rng {
  return mulberry32(fnv1a(`${seed >>> 0}|${entityId}|${purpose}`));
}

// ── dice ────────────────────────────────────────────────────────────────────
/** Damage/dice spec: `count`d`sides`+`bonus` (XdY+Z). All ints. */
export interface DiceSpec {
  count: number;
  sides: number;
  bonus: number;
}

export const d = (count: number, sides: number, bonus = 0): DiceSpec => ({ count, sides, bonus });

/** Roll XdY+Z. Integer result, floor 0. */
export function rollDice(spec: DiceSpec, rng: Rng): number {
  let total = spec.bonus | 0;
  for (let i = 0; i < spec.count; i++) total += 1 + Math.floor(rng() * spec.sides);
  return Math.max(0, total | 0);
}

/** d20 with advantage (+1) / disadvantage (-1). Returns the kept die. */
export function rollD20(rng: Rng, adv: -1 | 0 | 1 = 0): number {
  const a = 1 + Math.floor(rng() * 20);
  if (adv === 0) return a;
  const b = 1 + Math.floor(rng() * 20);
  return adv > 0 ? Math.max(a, b) : Math.min(a, b);
}

// ── classes + loadout -> derived numbers ────────────────────────────────────
export type ClassId = "barbarian" | "monk" | "ranger" | "bard" | "wizard" | "cleric";
export const CLASS_IDS: readonly ClassId[] = ["barbarian", "monk", "ranger", "bard", "wizard", "cleric"];

/** Store gear: three slots, FLAT stat mods only in v1 (panel law - no procs).
 * tier 0 = empty slot. */
export interface Gear {
  weapon: number; // tier 0..3: raises damage dice/bonus
  armor: number;  // tier 0..3: raises AC + hp
  trinket: number; // tier 0..3: raises the class's signature stat
}

export interface Loadout {
  classId: ClassId;
  level: number; // 1..20 (per-(wallet,class) track)
  gear: Gear;
}

/** Everything a sim needs to field the hero. ALL INTS. */
export interface Derived {
  classId: ClassId;
  hpMax: number;
  ac: number;
  atkBonus: number;
  dmgDice: DiceSpec;
  speed: number;     // sim-units per second class multiplier x100 (int, 100 = 1.0x)
  critRange: number; // natural roll >= this crits (20 default, trinkets can widen)
  manaMax: number;   // HORDE's skill resource; 0 for classes whose kit is stamina-flavoured
}

/** Class identity table: base numbers at level 1, ungeared. The FEEL of each
 * class lives here (Barbarian hits like a truck, Monk is fast, Wizard is
 * glass): per-game KITS live in each game's registry, never here. */
const CLASS_BASE: Record<ClassId, { hp: number; ac: number; atk: number; dice: DiceSpec; speed: number; mana: number }> = {
  barbarian: { hp: 30, ac: 12, atk: 3, dice: d(1, 12), speed: 100, mana: 20 },
  monk:      { hp: 24, ac: 14, atk: 3, dice: d(2, 4),  speed: 125, mana: 30 },
  ranger:    { hp: 24, ac: 13, atk: 4, dice: d(1, 8),  speed: 110, mana: 30 },
  bard:      { hp: 22, ac: 12, atk: 2, dice: d(1, 6),  speed: 105, mana: 40 },
  wizard:    { hp: 18, ac: 10, atk: 4, dice: d(1, 10), speed: 100, mana: 50 },
  cleric:    { hp: 26, ac: 15, atk: 2, dice: d(1, 8),  speed: 95,  mana: 40 },
};

/** Level curve: +hp and slow +atk, mirrored dice step at milestones. Kept
 * deliberately flat-ish: level is progress, gear is the store, and the
 * class-spread gate (f) asserts no class runs away. */
export function derive(loadout: Loadout): Derived {
  const base = CLASS_BASE[loadout.classId];
  const lvl = Math.max(1, Math.min(20, loadout.level | 0));
  const g = loadout.gear;
  const wpn = Math.max(0, Math.min(3, g.weapon | 0));
  const arm = Math.max(0, Math.min(3, g.armor | 0));
  const trk = Math.max(0, Math.min(3, g.trinket | 0));
  // dice grow by weapon tier: +1 die at tier 2, +bonus at tiers 1/3
  const dice = d(base.dice.count + (wpn >= 2 ? 1 : 0), base.dice.sides, base.dice.bonus + (wpn === 1 || wpn === 3 ? 2 : 0));
  return {
    classId: loadout.classId,
    hpMax: base.hp + (lvl - 1) * 3 + arm * 4,
    ac: base.ac + arm + (lvl >= 10 ? 1 : 0),
    atkBonus: base.atk + (lvl >> 2) + (wpn >= 1 ? 1 : 0),
    dmgDice: dice,
    speed: base.speed + trk * 5,
    critRange: 20 - (trk >= 2 ? 1 : 0),
    manaMax: base.mana + trk * 5 + (lvl >> 1),
  };
}

// ── attack resolution ───────────────────────────────────────────────────────
export type RulesEvent =
  | { t: "roll"; who: string; die: number; vs: number; adv: -1 | 0 | 1 }
  | { t: "hit"; who: string; target: string }
  | { t: "miss"; who: string; target: string }
  | { t: "crit"; who: string; target: string }
  | { t: "dmg"; who: string; target: string; amount: number }
  | { t: "cond"; target: string; cond: CondId; ticks: number }
  | { t: "loot"; who: string; item: string };

export interface AttackIn {
  attackerId: string;
  targetId: string;
  atkBonus: number;
  dmgDice: DiceSpec;
  critRange: number; // 20, or 19 with a keen trinket
  defAc: number;
  adv: -1 | 0 | 1;
  rng: Rng; // the ATTACKER's attack stream (rngFork per entity per purpose)
}

export interface AttackOut {
  hit: boolean;
  crit: boolean;
  dmg: number;
  die: number; // the kept d20, for renderers that show the roll
  events: RulesEvent[];
}

/** SRD shape: d20 + atkBonus vs AC; nat-1 always misses, nat >= critRange
 * always hits and doubles the damage DICE (not the bonus). */
export function resolveAttack(a: AttackIn): AttackOut {
  const die = rollD20(a.rng, a.adv);
  const events: RulesEvent[] = [{ t: "roll", who: a.attackerId, die, vs: a.defAc, adv: a.adv }];
  const crit = die >= a.critRange;
  const hit = crit || (die !== 1 && die + a.atkBonus >= a.defAc);
  if (!hit) {
    events.push({ t: "miss", who: a.attackerId, target: a.targetId });
    return { hit, crit: false, dmg: 0, die, events };
  }
  const dice = crit ? d(a.dmgDice.count * 2, a.dmgDice.sides, a.dmgDice.bonus) : a.dmgDice;
  const dmg = rollDice(dice, a.rng);
  events.push({ t: crit ? "crit" : "hit", who: a.attackerId, target: a.targetId });
  events.push({ t: "dmg", who: a.attackerId, target: a.targetId, amount: dmg });
  return { hit, crit, dmg, die, events };
}

// ── conditions (five, panel cap) ────────────────────────────────────────────
export type CondId = "stun" | "slow" | "burn" | "weaken" | "fear";
export interface CondState {
  stun: number;   // ticks remaining: skip action
  slow: number;   // ticks: half speed
  burn: number;   // ticks: BURN_DMG per tick
  weaken: number; // ticks: -2 atk
  fear: number;   // ticks: forced move away
}
export const BURN_DMG = 2;
export const noConds = (): CondState => ({ stun: 0, slow: 0, burn: 0, weaken: 0, fear: 0 });

/** Advance one tick. Mutates nothing: returns the next state + events. */
export function tickConditions(target: string, c: CondState): { next: CondState; dmg: number; events: RulesEvent[] } {
  const events: RulesEvent[] = [];
  let dmg = 0;
  if (c.burn > 0) {
    dmg = BURN_DMG;
    events.push({ t: "dmg", who: "burn", target, amount: BURN_DMG });
  }
  const dec = (n: number) => (n > 0 ? n - 1 : 0);
  return {
    next: { stun: dec(c.stun), slow: dec(c.slow), burn: dec(c.burn), weaken: dec(c.weaken), fear: dec(c.fear) },
    dmg,
    events,
  };
}

// ── the legion bestiary ─────────────────────────────────────────────────────
/** SRD undead line, tuned to our envelope. xp doubles as the score curve
 * (CR-to-XP): sims award score for KILLS from this table only - never scaled
 * by player stats (ceiling-neutrality). */
export interface Statblock {
  id: string;
  name: string;
  hp: number;
  ac: number;
  atkBonus: number;
  dmgDice: DiceSpec;
  speed: number; // x100 int, 100 = baseline
  xp: number;    // the score value of the kill
}

export const BESTIARY: readonly Statblock[] = [
  { id: "skeleton",    name: "Skeleton",       hp: 13, ac: 13, atkBonus: 4, dmgDice: d(1, 6, 2),  speed: 100, xp: 50 },
  { id: "zombie",      name: "Zombie",         hp: 22, ac: 8,  atkBonus: 3, dmgDice: d(1, 6, 1),  speed: 60,  xp: 50 },
  { id: "ghoul",       name: "Ghoul",          hp: 22, ac: 12, atkBonus: 4, dmgDice: d(2, 4, 2),  speed: 120, xp: 100 },
  { id: "boneArcher",  name: "Bone Archer",    hp: 13, ac: 13, atkBonus: 4, dmgDice: d(1, 6, 2),  speed: 100, xp: 100 },
  { id: "wight",       name: "Wight",          hp: 45, ac: 14, atkBonus: 4, dmgDice: d(1, 8, 2),  speed: 100, xp: 200 },
  { id: "specter",     name: "Specter",        hp: 22, ac: 12, atkBonus: 4, dmgDice: d(3, 6),     speed: 130, xp: 200 },
  { id: "necromancer", name: "Necromancer",    hp: 33, ac: 12, atkBonus: 5, dmgDice: d(2, 8),     speed: 90,  xp: 450 },
  { id: "boneKnight",  name: "Bone Knight",    hp: 60, ac: 17, atkBonus: 6, dmgDice: d(2, 8, 3),  speed: 90,  xp: 450 },
  { id: "wraith",      name: "Wraith",         hp: 67, ac: 13, atkBonus: 6, dmgDice: d(4, 8, 3),  speed: 130, xp: 1100 },
  { id: "boneDragon",  name: "Bone Dragon",    hp: 127, ac: 17, atkBonus: 8, dmgDice: d(2, 10, 5), speed: 110, xp: 2900 },
] as const;

export const statblock = (id: string): Statblock => {
  const s = BESTIARY.find((b) => b.id === id);
  if (!s) throw new Error(`unknown statblock: ${id}`);
  return s;
};

/** Endless escalation: depth 0 = the table as written; each depth step adds
 * hp/atk/ac on a curve WITHOUT touching xp per kill - deeper play means more
 * kills per minute is harder, never that each kill pays more (ADR-0120:
 * validity plateaus rate, score stays open through survival). */
export function scaleStatblock(base: Statblock, depth: number): Statblock {
  const k = Math.max(0, depth | 0);
  return {
    ...base,
    hp: base.hp + Math.floor((base.hp * k) / 4),
    ac: base.ac + (k >> 2),
    atkBonus: base.atkBonus + (k >> 1),
    dmgDice: d(base.dmgDice.count, base.dmgDice.sides, base.dmgDice.bonus + (k >> 1)),
    speed: base.speed + Math.min(50, k * 3),
    xp: base.xp,
  };
}

// ── loot ────────────────────────────────────────────────────────────────────
/** Weighted seeded pick. Loot pays GOLD or run-boons, never score (law). */
export interface LootEntry {
  item: string;
  weight: number;
}

export function rollLoot(table: readonly LootEntry[], rng: Rng): string {
  let total = 0;
  for (const e of table) total += e.weight;
  let r = rng() * total;
  for (const e of table) {
    r -= e.weight;
    if (r <= 0) return e.item;
  }
  return table[table.length - 1].item;
}
