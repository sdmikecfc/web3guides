/**
 * BATTLE BOTS REWARDS - the battle coin and battle point tables, the stake
 * model and the house bonus, as pure whole-number functions (the guide
 * "Battles" and "Shop and progression"; economy doc section 1 (a) and (b)).
 *
 * SOURCE OF TRUTH: doma-reporter/modules/battlebots/coins.js (PVE,
 * PVP_STAKE_MIN / MAX, PVP_HOUSE_PCT_PER_CLASS / MAX, PVP_WIN_POINTS,
 * PVP_LOSS_POINTS, GAP_MULT, battleCoinsPvp, battlePointsPvp, repeatDecay).
 * This file MIRRORS those numbers BY VALUE so the web never imports across
 * repos; scripts/bots-rewards-check.ts replays the same table on both sides
 * and goes red the day they drift. Change coins.js first, then this file.
 *
 * LAWS THIS FILE CARRIES:
 *  - PURE. No clock, no randomness, no database: the resolver's drop roll
 *    arrives as a whole number the caller drew from a forked stream.
 *  - WHOLE COINS. The house never pays a fraction of a coin: the bonus is
 *    floored. Battle points are exact binary fractions (5 x 0.25 = 1.25) so
 *    the ledger never drifts.
 *  - EVERY CEILING THROWS. A stake outside 25..500, a class gap that is not
 *    a whole number, or a wallet's battle coins in a day past the ceiling is
 *    a bug, never a clamp (the economy doc section 7 breaker law).
 *  - THE DEFENDER IS NEVER CHARGED. Only the challenger holds a stake; the
 *    defender's ghost earns 3 coins when it wins and nothing when it loses.
 */

import { botTier, type Tier } from "./parts";

// ── the three game robots (EASY, HARDER, HARDEST) ───────────────────────────

export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

/** coins on a win / on a loss, battle points on a win (a loss pays 0), part
 * drop chance on a win in whole percent. MIRRORS coins.js PVE plus the
 * guide's drop row (5 / 15 / 35). */
export const PVE: Readonly<Record<Difficulty, { win: number; lose: number; points: number; drop: number }>> = {
  easy: { win: 10, lose: 3, points: 1, drop: 5 },
  medium: { win: 20, lose: 5, points: 2, drop: 15 },
  hard: { win: 40, lose: 8, points: 4, drop: 35 },
};

export function battleCoinsPve(difficulty: Difficulty, won: boolean): number {
  const row = PVE[difficulty];
  if (!row) throw new Error(`unknown PvE difficulty ${String(difficulty)}`);
  return won ? row.win : row.lose;
}

export function battlePointsPve(difficulty: Difficulty, won: boolean): number {
  const row = PVE[difficulty];
  if (!row) throw new Error(`unknown PvE difficulty ${String(difficulty)}`);
  return won ? row.points : 0;
}

/** The drop's tier: easy drops the bot's own tier, medium and hard one tier
 * up (engine doc section 4), never past T4. */
export function dropTier(difficulty: Difficulty, botTierNow: Tier): Tier {
  if (difficulty === "easy") return botTierNow;
  return Math.min(4, botTierNow + 1) as Tier;
}

/** `roll` is a whole number 0..99 the caller drew from a forked stream. */
export function pveDrops(difficulty: Difficulty, won: boolean, roll: number): boolean {
  if (!won) return false;
  if (!Number.isInteger(roll) || roll < 0 || roll > 99) throw new Error(`drop roll must be a whole number 0..99, got ${roll}`);
  return roll < PVE[difficulty].drop;
}

// ── PvP: the stake model (the guide; coins.js battleCoinsPvp) ───────────────

export const STAKE_MIN = 25;
export const STAKE_MAX = 500;
export const HOUSE_PCT_PER_CLASS = 50;
export const HOUSE_PCT_MAX = 100;
export const PVP_WIN_POINTS = 5;
export const PVP_LOSS_POINTS = 1;
/** the defender's ghost, when it wins: 3 coins, never charged, never broken */
export const DEFENDER_GHOST_WIN_COINS = 3;

export function assertStake(stake: number): void {
  if (!(Number.isInteger(stake) && stake >= STAKE_MIN && stake <= STAKE_MAX)) {
    throw new Error(`CEILING: PvP stake must be a whole number ${STAKE_MIN}..${STAKE_MAX}, got ${stake}`);
  }
}

export function assertGap(classGap: number): void {
  if (!Number.isInteger(classGap)) throw new Error(`class gap must be a whole number, got ${classGap}`);
}

/** The house bonus in whole percent of the stake: 50 per weight class the
 * defender is ABOVE the challenger, max 100; challenging down or level pays
 * nothing from the house. */
export function housePercent(classGap: number): number {
  assertGap(classGap);
  return classGap > 0 ? Math.min(HOUSE_PCT_MAX, HOUSE_PCT_PER_CLASS * classGap) : 0;
}

/** Whole coins, floored (the house never pays a fraction of a coin). */
export function houseBonus(stake: number, classGap: number): number {
  assertStake(stake);
  return Math.floor((stake * housePercent(classGap)) / 100);
}

/** MIRRORS coins.js battleCoinsPvp: the winner's gross payout is both
 * stakes (2 x S) plus the house bonus; the loser gets 0. The web pays this
 * as ONE grant on top of the stake hold (-S before the bell), so the net
 * is +S + bonus on a win and -S on a loss. */
export function battleCoinsPvp(stake: number, classGap: number, won: boolean): number {
  assertStake(stake);
  assertGap(classGap);
  if (!won) return 0;
  return 2 * stake + houseBonus(stake, classGap);
}

// ── battle points (the 30 percent score; coins.js battlePointsPvp) ─────────

/** Gap multiplier by the opponent's weight class minus yours: two or more
 * lighter 0.25, one lighter 0.5, same 1, one heavier 1.5, two or more
 * heavier 2. Clamped to the table's ends. */
export function gapMultiplier(classGap: number): number {
  assertGap(classGap);
  if (classGap <= -2) return 0.25;
  if (classGap === -1) return 0.5;
  if (classGap === 0) return 1;
  if (classGap === 1) return 1.5;
  return 2;
}

/** Repeat opponent inside a week: the first fight vs a wallet pays in full,
 * the second half, the third and later a quarter. */
export function repeatDecay(priorFightsVsOpponent: number): number {
  const n = Number(priorFightsVsOpponent) || 0;
  if (n <= 0) return 1;
  if (n === 1) return 0.5;
  return 0.25;
}

/** PvP battle points for the challenger: 5 x gap multiplier on a win, 1 on
 * a loss, both times the repeat decay. Every multiplier is a power-of-two
 * fraction, so the product is exact in binary. */
export function battlePointsPvp(classGap: number, won: boolean, priorFightsVsOpponent: number): number {
  const base = won ? PVP_WIN_POINTS * gapMultiplier(classGap) : PVP_LOSS_POINTS;
  return base * repeatDecay(priorFightsVsOpponent);
}

// ── weight classes (the guide: the same bands as bot tier) ──────────────────

export const WEIGHT_CLASSES = ["light", "middle", "heavy", "super"] as const;
export type WeightClass = (typeof WEIGHT_CLASSES)[number];
export const WEIGHT_CLASS_NAMES: Readonly<Record<WeightClass, string>> = {
  light: "Small",
  middle: "Medium",
  heavy: "Big",
  super: "Giant",
};

/** 0 Small under 25, 1 Medium 25 to 54, 2 Big 55 to 79, 3 Giant 80 and up. */
export function weightClassIndex(total: number): number {
  return botTier(total) - 1;
}

export function weightClassOf(total: number): WeightClass {
  return WEIGHT_CLASSES[weightClassIndex(total)];
}

// ── levels (economy doc section 3: coins cannot buy levels) ────────────────

export const XP = {
  pve: { win: 3, lose: 1 },
  pvp: { win: 4, lose: 2 },
} as const;

/** XP floors for levels 1..10. T3 parts need level 5, T4 need level 10. */
export const LEVEL_FLOORS: readonly number[] = [0, 5, 12, 20, 30, 42, 56, 72, 90, 110];
export const MAX_LEVEL = LEVEL_FLOORS.length;

export function levelForXp(xp: number): number {
  const v = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  for (let i = 0; i < LEVEL_FLOORS.length; i++) if (v >= LEVEL_FLOORS[i]) level = i + 1;
  return level;
}

export function fightXp(mode: "pve" | "pvp", won: boolean): number {
  return won ? XP[mode].win : XP[mode].lose;
}

// ── the daily rules (the guide "Battles") ───────────────────────────────────

export const ATTACKS_PER_DAY = 2;
export const DEFENCES_PER_DAY = 5;
export const REPAIR_HOURS = 24;
export const REPAIR_MS = REPAIR_HOURS * 60 * 60 * 1000;
/** repeat-opponent decay looks back this many days */
export const REPEAT_WINDOW_DAYS = 7;

// ── the ceiling: a BREAKER, never a clamp ───────────────────────────────────

/**
 * The most battle coins one wallet can earn in a UTC day, derived from the
 * rules: 5 bots x 2 attacks x the biggest PvP payout (2 x 500 + 500 bonus =
 * 1,500) is 15,000, plus 5 defences x (500 + 3) is 2,515, so 17,515. Anything
 * past 20,000 in one day is a bug and the grant path throws.
 */
export const BATTLE_COINS_DAY_CEILING = 20000;
/** the biggest single grant the battle path can legally make */
export const BATTLE_GRANT_CEILING = 2 * STAKE_MAX + STAKE_MAX;

export function assertBattleGrant(coins: number): void {
  if (!Number.isInteger(coins)) throw new Error(`CEILING: a battle grant must be a whole number, got ${coins}`);
  if (coins > BATTLE_GRANT_CEILING) {
    throw new Error(`CEILING: a battle grant of ${coins} coins is over ${BATTLE_GRANT_CEILING}; the route stops here`);
  }
}

export function assertBattleCoinsDay(coinsSoFarToday: number, adding: number): void {
  assertBattleGrant(adding);
  if (coinsSoFarToday + adding > BATTLE_COINS_DAY_CEILING) {
    throw new Error(
      `CEILING: ${coinsSoFarToday + adding} battle coins in one day is over ${BATTLE_COINS_DAY_CEILING}; the route stops here`,
    );
  }
}

// ── one fight, both sides, as one pure table ────────────────────────────────

export interface FightRewardInput {
  mode: "spar" | "pve" | "pvp";
  difficulty?: Difficulty;
  /** did the ATTACKER (side A, the challenger) win */
  attackerWon: boolean;
  /** defender weight class index minus the attacker's (pvp only) */
  classGap?: number;
  stake?: number;
  /** pvp fights between these two wallets inside the window, before this one */
  priorVsOpponent?: number;
  /** the attacker bot's tier now (for the drop tier) */
  attackerTier?: Tier;
  /** a whole number 0..99 from a forked stream (pve only) */
  dropRoll?: number;
}

export interface SideReward {
  coins: number;
  points: number;
  xp: number;
}

export interface FightRewards {
  attacker: SideReward;
  defender: SideReward;
  /** the stake the challenger put up before the bell (pvp), else 0 */
  stakeHeld: number;
  /** the winner's stake payout: 2 x S plus the house bonus to a winning
   * challenger, S (the challenger's stake) to a winning defender */
  stakePayout: number;
  houseBonus: number;
  /** a PvE win rolled a part: the drop's tier, else null */
  drop: Tier | null;
  /** the attacker's bot goes to the shop (a lost pve or pvp fight) */
  attackerRepair: boolean;
}

const NOTHING: SideReward = { coins: 0, points: 0, xp: 0 };

/** Sparring pays nothing and breaks nothing. PvE pays the table. PvP moves
 * the stake and the house bonus and pays the defender's ghost 3 coins on a
 * win. The defender is never charged and never repaired. */
export function fightRewards(inp: FightRewardInput): FightRewards {
  if (inp.mode === "spar") {
    return { attacker: NOTHING, defender: NOTHING, stakeHeld: 0, stakePayout: 0, houseBonus: 0, drop: null, attackerRepair: false };
  }
  if (inp.mode === "pve") {
    const d = inp.difficulty;
    if (!d || !PVE[d]) throw new Error(`pve needs a difficulty, got ${String(d)}`);
    const roll = inp.dropRoll ?? 100;
    const dropped = inp.attackerWon && Number.isInteger(roll) && roll >= 0 && roll <= 99 ? pveDrops(d, true, roll) : false;
    return {
      attacker: { coins: battleCoinsPve(d, inp.attackerWon), points: battlePointsPve(d, inp.attackerWon), xp: fightXp("pve", inp.attackerWon) },
      defender: NOTHING,
      stakeHeld: 0,
      stakePayout: 0,
      houseBonus: 0,
      drop: dropped ? dropTier(d, inp.attackerTier ?? 1) : null,
      attackerRepair: !inp.attackerWon,
    };
  }
  const stake = inp.stake ?? 0;
  assertStake(stake);
  const gap = inp.classGap ?? 0;
  assertGap(gap);
  const prior = inp.priorVsOpponent ?? 0;
  const bonus = inp.attackerWon ? houseBonus(stake, gap) : 0;
  return {
    attacker: {
      coins: 0,
      points: battlePointsPvp(gap, inp.attackerWon, prior),
      xp: fightXp("pvp", inp.attackerWon),
    },
    defender: { coins: inp.attackerWon ? 0 : DEFENDER_GHOST_WIN_COINS, points: 0, xp: 0 },
    stakeHeld: stake,
    stakePayout: inp.attackerWon ? battleCoinsPvp(stake, gap, true) : stake,
    houseBonus: bonus,
    drop: null,
    attackerRepair: !inp.attackerWon,
  };
}

// ── what one fight credits the challenger's wallet ──────────────────────────

/**
 * The coins a resolved fight actually credits the CHALLENGER: the battle
 * coins, plus the stake payout when the challenger won (the stake itself was
 * already taken before the bell, so the net of a win is one stake plus the
 * house bonus). One definition, so the ceiling check and the grant can never
 * disagree about the number.
 */
export function attackerCoinsPaid(r: FightRewards, attackerWon: boolean): number {
  return r.attacker.coins + (attackerWon ? r.stakePayout : 0);
}

/**
 * The MOST one fight could credit the challenger, whichever way it goes.
 *
 * The daily coin ceiling has to be checked before the stake is taken and
 * before any row is written, and at that moment nobody knows who wins, so
 * the check uses this worst case. It asks fightRewards both ways rather than
 * repeating its tables: a second copy of the reward maths would reproduce
 * this file's own assumptions and pass while the real table drifted.
 */
export function maxAttackerCoins(inp: Omit<FightRewardInput, "attackerWon">): number {
  let most = 0;
  for (const attackerWon of [true, false]) {
    const paid = attackerCoinsPaid(fightRewards({ ...inp, attackerWon }), attackerWon);
    if (paid > most) most = paid;
  }
  return most;
}

// ── plain words for the battles page ────────────────────────────────────────

/** What beating a robot `classGap` sizes away pays, in fight points, as a
 * whole number a child can rank (screens doc 4.1).
 *
 * These are the REAL numbers, not a word ladder: PVP_WIN_POINTS is 5 and the
 * gap multiplier is 0.25, 0.5, 1, 1.5, 2, so the five rungs are 1.25, 2.5, 5,
 * 7.5 and 10. Printing "about 1", "about 2", 5, "about 7" and 10 is honest,
 * carries no fraction and no multiplier sign, and 1 < 2 < 5 < 7 < 10 needs no
 * teaching at all. Every word ladder tried instead (quarter / half / normal /
 * extra / double) failed both readers. */
export function gapWords(classGap: number): string {
  if (classGap <= -2) return "about 1 fight point";
  if (classGap === -1) return "about 2 fight points";
  if (classGap === 0) return "5 fight points";
  if (classGap === 1) return "about 7 fight points";
  return "10 fight points";
}

/** "3" for a 35 in 100 chance, so a screen can say "You win a free part in
 * about 1 fight out of 3." Whole numbers only, and no per cent sign ever
 * reaches a player: 5 -> 20, 15 -> 7, 35 -> 3. */
export function dropOneIn(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) throw new Error(`dropOneIn: bad chance ${String(percent)}`);
  return Math.max(1, Math.round(100 / percent));
}

/** "plus 25 extra coins" for 50 coins put in one size up; empty when there
 * are no extra coins. "The house" is a casino word and is gone. */
export function bonusWords(stake: number, classGap: number): string {
  const b = houseBonus(stake, classGap);
  return b > 0 ? `plus ${b} extra coins` : "";
}
