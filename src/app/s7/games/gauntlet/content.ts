/**
 * GAUNTLET CONTENT - every authored table the sim selects from. The seed
 * SELECTS, it never DESIGNS (the S5/S6 law carried whole): node patterns,
 * encounter rows, draft pools, treasure and relic tables are all hand-written
 * here; sim.ts only ever indexes into them with a forked stream.
 *
 * LAWS THIS FILE CARRIES:
 *  - CARD EFFECTS ARE A CLOSED UNION (damage / block / draw / condition /
 *    heal / energy). No bespoke scripting, no callbacks: a card is data, and
 *    the whole card pool is auditable by reading this one file.
 *  - FLOOR 0 IS THE AFK GATE. Every floor-0 pattern is all-fight and every
 *    floor-0 encounter row has at least two bodies, so an empty tape meets
 *    lethal opposition immediately and dies well inside 75s. validateContent()
 *    asserts this - the law is executable, not a comment.
 *  - EVERY PATTERN HAS A LIVE MID SLOT. The idle auto-pick and the demo both
 *    prefer mid; a dead mid would strand them. Validated.
 *  - PERKS (relics + treasure boons) are flat integer counters only - they
 *    move SURVIVAL and SPEED, never a point value (ceiling-neutrality,
 *    ADR-0070 lineage). There is no perk field a sim could route into score.
 *  - XP LIVES IN THE BESTIARY, NOT HERE. Encounter rows are bestiary ids;
 *    the kill's score value comes from core.ts and is never restated (one
 *    source of truth, and no way for content to inflate a kill).
 */

import {
  d,
  statblock,
  CLASS_IDS,
  type ClassId,
  type CondId,
  type DiceSpec,
  type LootEntry,
} from "../_shared/rules/core";

// ── the card union ──────────────────────────────────────────────────────────

export type CardKind = "attack" | "skill";

/** The CLOSED effect union (spec law). `dice: null` means "the hero's weapon
 * dice from derive()"; a DiceSpec means a fixed spell shape. addDice/addBonus
 * modify whichever base applies - that is the whole extent of card scripting. */
export type Effect =
  | { k: "dmg"; dice: DiceSpec | null; addDice: number; addBonus: number; hits: number; adv: -1 | 0 | 1; all: boolean }
  | { k: "block"; n: number }
  | { k: "draw"; n: number }
  | { k: "cond"; cond: CondId; ticks: number; all: boolean }
  | { k: "heal"; n: number }
  | { k: "energy"; n: number };

export interface Card {
  id: string;
  name: string;
  cost: number; // energy
  kind: CardKind;
  /** Barbarian rage tax: paid in hp on play. A card is only playable while
   * hp > hpCost, so a card can never kill its own hero (deterministic guard,
   * documented in sim.ts). */
  hpCost: number;
  effects: Effect[];
}

// terse constructors - the tables below should read like a card list
type WpnOpts = { dice?: number; bonus?: number; hits?: number; adv?: -1 | 0 | 1; all?: boolean };
const W = (o: WpnOpts = {}): Effect => ({
  k: "dmg", dice: null, addDice: o.dice ?? 0, addBonus: o.bonus ?? 0, hits: o.hits ?? 1, adv: o.adv ?? 0, all: o.all ?? false,
});
const SP = (dice: DiceSpec, o: WpnOpts = {}): Effect => ({
  k: "dmg", dice, addDice: 0, addBonus: 0, hits: o.hits ?? 1, adv: o.adv ?? 0, all: o.all ?? false,
});
const BLK = (n: number): Effect => ({ k: "block", n });
const DRW = (n: number): Effect => ({ k: "draw", n });
const CND = (cond: CondId, ticks: number, all = false): Effect => ({ k: "cond", cond, ticks, all });
const HL = (n: number): Effect => ({ k: "heal", n });
const EN = (n: number): Effect => ({ k: "energy", n });

const card = (id: string, name: string, cost: number, kind: CardKind, effects: Effect[], hpCost = 0): Card => ({
  id, name, cost, kind, hpCost, effects,
});

// ── the card pool ───────────────────────────────────────────────────────────
// STARTERS: 6 classes x 5 definitions. The starting DECK is 10 cards built
// from those 5 (duplicates authored below in STARTER_DECKS).
// DRAFTABLES: 8 neutral + 4 per class -> every draft pool is exactly 12.

export const CARDS: readonly Card[] = [
  // barbarian - big dice, pays in blood
  card("bbStrike", "Axe Strike", 1, "attack", [W()]),
  card("bbGuard", "Bone Guard", 1, "skill", [BLK(6)]),
  card("bbCleave", "Reckless Cleave", 1, "attack", [W({ dice: 1 })], 1),
  card("bbSmash", "Skull Smash", 2, "attack", [W({ dice: 2, bonus: 2 })], 2),
  card("bbRage", "Blood Rage", 0, "skill", [EN(2)], 2),
  // monk - many small hits, flows around damage
  card("mkPalm", "Open Palm", 1, "attack", [W({ bonus: 1 })]),
  card("mkDodge", "Flow Dodge", 1, "skill", [BLK(5), DRW(1)]),
  card("mkFlurry", "Flurry", 1, "attack", [W({ hits: 2 })]),
  card("mkTempest", "Tempest Kicks", 2, "attack", [W({ hits: 3 })]),
  card("mkChi", "Center Chi", 0, "skill", [EN(1)]),
  // ranger - precise shots at advantage, pins and snares
  card("rgShot", "Aimed Shot", 1, "attack", [W({ adv: 1 })]),
  card("rgBrace", "Hunter's Brace", 1, "skill", [BLK(5)]),
  card("rgPin", "Pinning Arrow", 1, "attack", [W(), CND("slow", 2)]),
  card("rgSnare", "Snare", 1, "skill", [CND("stun", 1)]),
  card("rgTwin", "Twin Arrows", 2, "attack", [W({ hits: 2, adv: 1 })]),
  // bard - the enemy fights worse, you fight more
  card("bdJab", "Rapier Jab", 1, "attack", [W()]),
  card("bdDirge", "Dissonant Dirge", 1, "skill", [CND("weaken", 2, true)]),
  card("bdInspire", "Inspire", 0, "skill", [DRW(2)]),
  card("bdCadence", "Battle Cadence", 1, "skill", [EN(1), DRW(1)]),
  card("bdLull", "Lullaby", 2, "skill", [CND("fear", 2, true)]),
  // wizard - glass cannon, hits the whole line
  card("wzBolt", "Fire Bolt", 1, "attack", [W()]),
  card("wzWard", "Arcane Ward", 1, "skill", [BLK(6)]),
  card("wzNova", "Frost Nova", 2, "attack", [SP(d(2, 6), { all: true }), CND("slow", 1, true)]),
  card("wzIgnite", "Ignite", 1, "skill", [CND("burn", 3)]),
  card("wzStorm", "Chain Storm", 2, "attack", [SP(d(3, 6), { all: true })]),
  // cleric - the undead's least favourite class
  card("clMace", "Mace Blow", 1, "attack", [W()]),
  card("clShield", "Shield of Faith", 1, "skill", [BLK(6)]),
  card("clWord", "Healing Word", 1, "skill", [HL(6)]),
  card("clSmite", "Radiant Smite", 2, "attack", [W({ dice: 1, bonus: 2 })]),
  card("clTurn", "Turn Undead", 2, "skill", [CND("fear", 2, true)]),
  // neutral draftables (every class's pool)
  card("ntSplit", "Bone Splitter", 1, "attack", [W({ bonus: 3 })]),
  card("ntTower", "Tower Guard", 2, "skill", [BLK(12)]),
  card("ntAdren", "Adrenaline", 0, "skill", [EN(1), DRW(1)]),
  card("ntBandage", "Field Bandage", 1, "skill", [HL(5)]),
  card("ntSweep", "Wide Sweep", 2, "attack", [W({ all: true })]),
  card("ntFocus", "Battle Focus", 1, "skill", [DRW(2)]),
  card("ntOil", "Torch Oil", 1, "skill", [CND("burn", 2, true)]),
  card("ntBash", "Shield Bash", 1, "attack", [SP(d(1, 6)), CND("stun", 1)]),
  // class draftables (4 each)
  card("bbFrenzy", "Frenzy", 1, "attack", [W({ hits: 2 })], 2),
  card("bbQuake", "Earthshatter", 3, "attack", [W({ dice: 1, all: true })], 2),
  card("bbHide", "Thick Hide", 1, "skill", [BLK(8)]),
  card("bbLust", "Bloodlust", 1, "skill", [EN(1), DRW(1)], 2),
  card("mkMantis", "Mantis Strike", 1, "attack", [W({ adv: 1 })]),
  card("mkWhirl", "Whirlwind", 2, "attack", [W({ all: true })]),
  card("mkSerenity", "Serenity", 1, "skill", [HL(4), BLK(4)]),
  card("mkHundred", "Hundred Fists", 3, "attack", [W({ hits: 4 })]),
  card("rgHead", "Headshot", 2, "attack", [W({ dice: 1, adv: 1 })]),
  card("rgCamo", "Camouflage", 1, "skill", [BLK(6), DRW(1)]),
  card("rgPoison", "Poison Tips", 1, "skill", [CND("burn", 2), CND("weaken", 1)]),
  card("rgBarrage", "Barrage", 3, "attack", [W({ hits: 2, all: true })]),
  card("bdMock", "Vicious Mockery", 1, "attack", [SP(d(1, 4)), CND("weaken", 2)]),
  card("bdFinale", "Crescendo", 2, "attack", [W({ dice: 1, bonus: 2 })]),
  card("bdEncore", "Encore", 2, "skill", [DRW(2), EN(1)]),
  card("bdShanty", "Shield Shanty", 1, "skill", [BLK(5), HL(3)]),
  card("wzRay", "Ray of Frost", 1, "attack", [SP(d(1, 8)), CND("slow", 2)]),
  card("wzMirror", "Mirror Shield", 2, "skill", [BLK(14)]),
  card("wzSiphon", "Mana Siphon", 1, "skill", [EN(2)], 2),
  card("wzMeteor", "Meteor", 3, "attack", [SP(d(4, 8), { all: true })]),
  card("clJudge", "Judgement", 2, "attack", [SP(d(2, 8))]),
  card("clPrayer", "Prayer", 2, "skill", [HL(12)]),
  card("clBulwark", "Bulwark", 2, "skill", [BLK(10), HL(4)]),
  card("clBanish", "Banish", 2, "skill", [CND("stun", 1, true)]),
] as const;

export const CARD_INDEX: Readonly<Record<string, Card>> = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
);

/** The 10-card starting deck per class, built from that class's 5 starters. */
export const STARTER_DECKS: Readonly<Record<ClassId, readonly string[]>> = {
  barbarian: ["bbStrike", "bbStrike", "bbStrike", "bbGuard", "bbGuard", "bbGuard", "bbCleave", "bbCleave", "bbSmash", "bbRage"],
  monk: ["mkPalm", "mkPalm", "mkPalm", "mkDodge", "mkDodge", "mkDodge", "mkFlurry", "mkFlurry", "mkTempest", "mkChi"],
  ranger: ["rgShot", "rgShot", "rgShot", "rgBrace", "rgBrace", "rgBrace", "rgPin", "rgPin", "rgSnare", "rgTwin"],
  // bard carries FOUR attacks since 2026-08-25 (balance gate f2: 3 attacks +
  // the smallest die left bard at ~0.23x the field): Vicious Mockery is the
  // bard attack, and it keeps the fights-dirty identity (spell dmg + weaken).
  bard: ["bdJab", "bdJab", "bdJab", "bdMock", "bdDirge", "bdInspire", "bdInspire", "bdCadence", "bdCadence", "bdLull"],
  wizard: ["wzBolt", "wzBolt", "wzBolt", "wzWard", "wzWard", "wzWard", "wzNova", "wzNova", "wzIgnite", "wzStorm"],
  cleric: ["clMace", "clMace", "clMace", "clShield", "clShield", "clWord", "clWord", "clSmite", "clSmite", "clTurn"],
};

const NEUTRAL_POOL: readonly string[] = ["ntSplit", "ntTower", "ntAdren", "ntBandage", "ntSweep", "ntFocus", "ntOil", "ntBash"];

/** Draft pool per class: the 8 neutrals + that class's 4 draftables = 12.
 * SAME SIZE for every class, so the draft stream's draws line up across
 * loadouts and a recorded tape stays valid whatever class replays it. */
export const DRAFT_POOLS: Readonly<Record<ClassId, readonly string[]>> = {
  barbarian: [...NEUTRAL_POOL, "bbFrenzy", "bbQuake", "bbHide", "bbLust"],
  monk: [...NEUTRAL_POOL, "mkMantis", "mkWhirl", "mkSerenity", "mkHundred"],
  ranger: [...NEUTRAL_POOL, "rgHead", "rgCamo", "rgPoison", "rgBarrage"],
  bard: [...NEUTRAL_POOL, "bdMock", "bdFinale", "bdEncore", "bdShanty"],
  wizard: [...NEUTRAL_POOL, "wzRay", "wzMirror", "wzSiphon", "wzMeteor"],
  cleric: [...NEUTRAL_POOL, "clJudge", "clPrayer", "clBulwark", "clBanish"],
};

// ── the node map ────────────────────────────────────────────────────────────

export type NodeType = "fight" | "elite" | "treasure" | "shrine" | "rest";
/** "" = an empty slot (the "up to 3" of the spec). Selecting it is a no-op. */
export type NodeSlot = NodeType | "";
export type Pattern = readonly [NodeSlot, NodeSlot, NodeSlot];

/** Depth band: 0 = the gate floor, then early / mid / deep / abyss. */
export function bandFor(floor: number): number {
  if (floor <= 0) return 0;
  if (floor <= 2) return 1;
  if (floor <= 5) return 2;
  if (floor <= 9) return 3;
  return 4;
}

/** Authored patterns per band. Floor N picks ONE of its band's patterns via
 * rngFork(seed, "map", "floorN") - one draw, pure selection. */
export const NODE_PATTERNS: readonly (readonly Pattern[])[] = [
  // band 0 - the gate floor: all fights (the AFK law, validated)
  [
    ["fight", "fight", "fight"],
  ],
  // band 1 - floors 1-2. Mid is never an elite here: mid is the idle
  // auto-pick's lane AND the cautious default; elites are a chosen risk on
  // the side slots until the mid-game.
  [
    ["fight", "rest", "fight"],
    ["treasure", "fight", "fight"],
    ["elite", "fight", "shrine"],
    ["rest", "fight", "elite"],
    ["elite", "fight", ""],
    ["fight", "fight", "fight"], // unavoidable: some floors simply must be fought
  ],
  // band 2 - floors 3-5 (mid: fight/rest/shrine only, same reasoning)
  [
    ["fight", "rest", "elite"],
    ["shrine", "fight", "fight"],
    ["elite", "fight", "treasure"],
    ["fight", "shrine", "fight"],
    ["rest", "fight", "elite"],
    ["", "fight", "rest"],
    ["elite", "fight", "fight"], // unavoidable
  ],
  // band 3 - floors 6-9 (mid is fight/rest/shrine; deep elites stay a side
  // choice - at this scaling a wraith on the default lane is a coin-flip
  // execution, not a fight)
  [
    ["elite", "rest", "fight"],
    ["elite", "fight", "shrine"],
    ["treasure", "fight", "elite"],
    ["elite", "shrine", "fight"],
    ["fight", "rest", "fight"],
    ["fight", "fight", "elite"], // unavoidable
  ],
  // band 4 - floors 10+ (the abyss cycles)
  [
    ["elite", "fight", "rest"],
    ["fight", "elite", "elite"],
    ["shrine", "elite", "fight"],
    ["elite", "rest", "elite"],
  ],
];

// ── encounters ──────────────────────────────────────────────────────────────

export interface EncounterBand {
  normal: readonly (readonly string[])[];
  elite: readonly (readonly string[])[];
}

/** Bestiary-id rows, 1-3 bodies, per band. Statblocks scale by FLOOR via
 * scaleStatblock; xp per kill never moves (core law). Band 0 rows all carry
 * at least two bodies so an idle hero is dead in a handful of rounds. */
export const ENCOUNTERS: readonly EncounterBand[] = [
  // band 0: frail but NUMEROUS - two bodies overwhelm an idle hero fast,
  // while an active hero drops them in a couple of swings each (the AFK
  // gate's whole trick is that lethality here is about bodies, not hp)
  {
    normal: [
      ["skeleton", "skeleton"],
      ["skeleton", "zombie"],
      ["zombie", "zombie"],
    ],
    elite: [["ghoul", "ghoul"]], // unreachable on floor 0 (all-fight), kept total
  },
  // band 1: singles and frail pairs - the active hero's sustain lane
  {
    normal: [
      ["skeleton"],
      ["skeleton", "skeleton"],
      ["zombie", "zombie"],
      ["boneArcher"],
      ["skeleton", "zombie"],
    ],
    elite: [
      ["ghoul", "ghoul"],
      ["wight"],
    ],
  },
  // bands 2-3: SINGLES ONLY on the normal lane. Depth scaling alone (x1.75
  // at floor 3 up to x3.25 at floor 9, +atk, +dmg) makes one frail body a
  // real fight; a scaled PAIR out-damages any pure-aggression hero, so pairs
  // and walls (wight, specter, knight) are elite/abyss material - risk you
  // choose, never the lane you are dealt
  {
    normal: [
      ["ghoul"],
      ["skeleton"],
      ["boneArcher"],
      ["zombie"],
    ],
    elite: [
      ["boneKnight"],
      ["necromancer"],
      ["wight", "ghoul"],
    ],
  },
  // band 3's normal lane is thick with the shambling dead: the zombie's low
  // ac and weak dice make it the one body a deep hero can still race - the
  // fights run LONG (that is the point at this depth), the threat is attrition
  {
    normal: [
      ["zombie"],
      ["zombie"],
      ["boneArcher"],
      ["zombie"],
    ],
    elite: [
      ["wraith"],
      ["boneKnight", "necromancer"],
      ["wight", "wight"],
    ],
  },
  {
    normal: [
      ["wraith"],
      ["boneKnight", "specter"],
      ["necromancer", "ghoul", "ghoul"],
      ["wight", "wight", "boneArcher"],
    ],
    elite: [
      ["boneDragon"],
      ["wraith", "wraith", "skeleton"],
      ["boneDragon", "specter"],
    ],
  },
];

/** The single richest fight in the book: Bone Dragon + Specter. ceiling()
 * in sim.ts leans on this number - keep them in sync (validated below). */
export const MAX_ENCOUNTER_XP = 3100;

// ── boss gates (every 10th floor) ───────────────────────────────────────────

/** The named gate keepers, AUTHORED here, cycling every 10 floors. The names
 * echo the raid cast EDITORIALLY but are deliberately NOT imported from
 * raid.ts: that module carries Date-driven schedulers, and these names land
 * inside tape state hashes - content stays self-contained and deterministic.
 * `key` is the bestiary id the fight actually spawns: stats, floor scaling
 * and xp are the creature's own (the score law is never restated here). */
export const BOSS_LADDER: readonly { name: string; key: string }[] = [
  { name: "THE BONE COLOSSUS", key: "boneKnight" },
  { name: "THE GRAVE TITAN", key: "wraith" },
  { name: "THE BONE DRAGON", key: "boneDragon" },
] as const;

/** Every 10th floor (10, 20, 30, ...) is a boss gate. The floor INDEX
 * decides; the seed designs nothing about a gate. */
export function isBossFloor(floor: number): boolean {
  // DISPLAY-ALIGNED (2026-08-30): every HUD surface shows floor + 1, and the
  // promise is "every 10th floor" in the numbers the PLAYER sees - so the
  // gate fires on internal indices 9/19/29, which read FLOOR 10/20/30.
  return (floor + 1) % 10 === 0;
}

/** The gate keeper for the boss at internal index N (displayed N+1, a
 * multiple of 10): displayed 10 gets ladder[0], 20 ladder[1], 30 ladder[2],
 * 40 cycles back. */
export function bossFor(floor: number): { name: string; key: string } {
  return BOSS_LADDER[((floor + 1) / 10 - 1) % BOSS_LADDER.length];
}

// ── perks: relics + treasure boons ──────────────────────────────────────────

/** Flat integer counters ONLY (ceiling-neutrality): survival and speed, never
 * a point. The sim adds these onto its cached run modifiers on pickup. */
export interface Perk {
  id: string;
  name: string;
  bonusDmg: number;     // + to every hero damage roll's bonus
  bonusAtk: number;     // + to-hit
  turnBlock: number;    // block granted at every hero turn start
  turnHeal: number;     // heal at every hero turn start
  victoryHeal: number;  // heal after every fight victory
  hpMaxUp: number;      // permanent hpMax raise
  healNow: number;      // one-shot heal on pickup
  keen: number;         // widens critRange (floor 18 enforced in sim)
}

const perk = (id: string, name: string, p: Partial<Perk>): Perk => ({
  id, name,
  bonusDmg: p.bonusDmg ?? 0, bonusAtk: p.bonusAtk ?? 0, turnBlock: p.turnBlock ?? 0,
  turnHeal: p.turnHeal ?? 0, victoryHeal: p.victoryHeal ?? 0, hpMaxUp: p.hpMaxUp ?? 0,
  healNow: p.healNow ?? 0, keen: p.keen ?? 0,
});

/** Shrine relics: floor N's shrine picks ONE via rngFork(seed,"relic","floorN").
 * Duplicates across a run stack (all counters are additive ints). */
export const RELICS: readonly Perk[] = [
  perk("rlEmber", "Ember Sigil", { bonusDmg: 1 }),
  perk("rlFang", "Wolf Fang", { bonusAtk: 1 }),
  perk("rlAegis", "Aegis Fragment", { turnBlock: 3 }),
  perk("rlTome", "Bone Tome", { turnHeal: 2 }),
  perk("rlBoots", "Grave Boots", { victoryHeal: 4 }),
  perk("rlSkull", "Skull Chalice", { hpMaxUp: 8, healNow: 8 }),
];

/** Treasure boons: rollLoot over this table (core's weighted pick). */
export const TREASURE_TABLE: readonly LootEntry[] = [
  { item: "boonSharp", weight: 3 },
  { item: "boonStone", weight: 3 },
  { item: "boonWard", weight: 2 },
  { item: "boonKeen", weight: 1 },
];

export const BOONS: Readonly<Record<string, Perk>> = {
  boonSharp: perk("boonSharp", "Whetstone", { bonusDmg: 1 }),
  boonStone: perk("boonStone", "Grave Stone", { hpMaxUp: 5, healNow: 5 }),
  boonWard: perk("boonWard", "Warding Chalk", { turnBlock: 2 }),
  boonKeen: perk("boonKeen", "Keen Eye", { keen: 1 }),
};

// ── validation (the laws, executable) ───────────────────────────────────────

export function validateContent(): void {
  const fail = (msg: string): never => {
    throw new Error(`gauntlet content: ${msg}`);
  };
  // cards: unique ids, sane costs, non-empty effects
  const seen = new Set<string>();
  for (const c of CARDS) {
    if (seen.has(c.id)) fail(`duplicate card id ${c.id}`);
    seen.add(c.id);
    if (c.cost < 0 || c.cost > 3) fail(`${c.id}: cost ${c.cost} out of 0..3`);
    if (c.hpCost < 0) fail(`${c.id}: negative hpCost`);
    if (c.effects.length === 0) fail(`${c.id}: no effects`);
    if (c.kind === "attack" && !c.effects.some((e) => e.k === "dmg")) fail(`${c.id}: attack without dmg`);
  }
  // decks + pools reference real cards; pools all size 12 (tape-across-class law)
  for (const cls of CLASS_IDS) {
    const deck = STARTER_DECKS[cls];
    if (deck.length !== 10) fail(`${cls}: starter deck is ${deck.length}, want 10`);
    for (const id of deck) if (!CARD_INDEX[id]) fail(`${cls}: unknown starter ${id}`);
    const pool = DRAFT_POOLS[cls];
    if (pool.length !== 12) fail(`${cls}: draft pool is ${pool.length}, want 12`);
    for (const id of pool) if (!CARD_INDEX[id]) fail(`${cls}: unknown draftable ${id}`);
  }
  // node patterns: band 0 all-fight; every pattern's mid slot is live;
  // (i) at most ONE avoidable slot per pattern - avoidable means a node that
  // dodges combat AND still advances (rest/shrine/treasure); "" is NOT
  // avoidable, it is a no-op wall; (ii) every band keeps at least one
  // ZERO-avoidable pattern, so no seed can hand out a fight-free lane
  const avoidable = (slot: NodeSlot): boolean =>
    slot === "rest" || slot === "shrine" || slot === "treasure";
  for (let b = 0; b < NODE_PATTERNS.length; b++) {
    const band = NODE_PATTERNS[b];
    if (band.length === 0) fail(`band ${b}: no patterns`);
    let zeroAvoid = 0;
    for (const p of band) {
      if (p[1] === "") fail(`band ${b}: pattern with empty mid slot`);
      if (b === 0 && p.some((slot) => slot !== "fight")) fail(`band 0 pattern is not all-fight (AFK law)`);
      const av = p.filter(avoidable).length;
      if (av > 1) fail(`band ${b}: pattern [${p.join(",")}] has ${av} avoidable slots (max 1)`);
      if (av === 0) zeroAvoid += 1;
    }
    if (zeroAvoid === 0) fail(`band ${b}: no unavoidable (zero-avoidable-slot) pattern`);
  }
  // boss ladder: every key resolves in the bestiary (statblock throws on an
  // unknown id) and pays within the encounter book's own max, so the burst
  // envelope (MAX_ENCOUNTER_XP + FLOOR_BONUS + margin) covers a boss floor
  if (BOSS_LADDER.length === 0) fail("BOSS_LADDER is empty");
  for (const boss of BOSS_LADDER) {
    if (!boss.name) fail(`boss ${boss.key}: empty name`);
    const sb = statblock(boss.key);
    if (sb.xp > MAX_ENCOUNTER_XP) fail(`boss ${boss.name} (${boss.key}) xp ${sb.xp} exceeds MAX_ENCOUNTER_XP ${MAX_ENCOUNTER_XP}`);
  }
  // encounters: every id real (statblock throws), band-0 rows >= 2 bodies
  let maxXp = 0;
  for (let b = 0; b < ENCOUNTERS.length; b++) {
    const { normal, elite } = ENCOUNTERS[b];
    if (normal.length === 0 || elite.length === 0) fail(`band ${b}: empty encounter table`);
    for (const rows of [normal, elite]) {
      for (const row of rows) {
        if (row.length < 1 || row.length > 3) fail(`band ${b}: row size ${row.length}`);
        let xp = 0;
        for (const id of row) xp += statblock(id).xp;
        if (xp > maxXp) maxXp = xp;
        if (b === 0 && row.length < 2 && rows === normal) fail(`band 0 row under 2 bodies (AFK lethality law)`);
      }
    }
  }
  if (maxXp !== MAX_ENCOUNTER_XP) fail(`MAX_ENCOUNTER_XP drifted: tables say ${maxXp}, constant says ${MAX_ENCOUNTER_XP}`);
  if (NODE_PATTERNS.length !== ENCOUNTERS.length) fail(`pattern bands (${NODE_PATTERNS.length}) != encounter bands (${ENCOUNTERS.length})`);
}
