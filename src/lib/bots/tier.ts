/**
 * BATTLE BOTS tier ladder (game guide section 2, "Parts and bots").
 *
 * ONE LADDER. Week 1 kept a local copy so the Build screen could ship before
 * the engine existed; the engine has landed, so partTier and botTier ARE
 * the engine's (src/app/bots/_engine/parts.ts) and this file only keeps the
 * names the Build screen and the fixtures import. The numbers live in one
 * place now; a second opinion cannot drift.
 *
 * Part tier by total: T1 1 to 4, T2 5 to 10, T3 11 to 15, T4 16 to 20.
 * Bot tier by the sum of the five part totals (5 to 100): T2 at 25, T3 at
 * 55, T4 at 80 (five times the smallest part of that tier).
 */

import {
  BOT_TIER_AT as ENGINE_BOT_TIER_AT,
  PART_MAX,
  PART_MIN,
  STAT_MAX,
  type Tier as EngineTier,
} from "@/app/bots/_engine/parts";

export { partTier, botTier } from "@/app/bots/_engine/parts";

export type Tier = EngineTier;

/** A part's three stats, in the slot's own order. Each 0 to 12. */
export type Stats = readonly [number, number, number];

/** The bot-tier thresholds, by tier, for the readout: the engine's tuple
 * (T2, T3, T4) under the keys the screens lane reads. */
export const BOT_TIER_AT = {
  2: ENGINE_BOT_TIER_AT[0],
  3: ENGINE_BOT_TIER_AT[1],
  4: ENGINE_BOT_TIER_AT[2],
} as const;

/**
 * WHAT A PLAYER READS INSTEAD OF "TIER" (ADR-0140, dated section
 * 2026-09-04). "Tier" is a word this game asks a new player to learn for no
 * gain: a part's tier is already the model number in its name, so the shelf
 * can say "Model 3 parts" and the card can say "Spark 3 Legs" and the two
 * agree by construction. The word "tier" stays in the code, in the engine
 * doc and in the prize ladder; it never reaches a part, a shop row or a
 * garage chip. scripts/bots-naming-check.ts bans it from this lane's copy.
 *
 * A BOT still has a size, and a bot's size is not a model number, so the
 * bot readout says the weight class the guide already names.
 */
export const MODEL_WORD: Readonly<Record<Tier, string>> = {
  1: "Model 1",
  2: "Model 2",
  3: "Model 3",
  4: "Model 4",
};

/** The weight class a whole bot sits in, by bot tier: the guide's four
 * words, which rank themselves without a legend. */
export const WEIGHT_CLASS: Readonly<Record<Tier, string>> = {
  1: "Light",
  2: "Middle",
  3: "Heavy",
  4: "Super",
};

/**
 * A part totals 1 to 20 and has at least 1 point. Anything else is a catalog
 * bug, and a catalog bug must THROW here rather than render a plausible
 * tier: a silent clamp is how a 0-point part would ship as "Tier 1". The
 * bounds are the engine's constants; the breaker stays on the screens side
 * because the engine's partTotal() takes a Part and trusts validateCatalog.
 */
export function partTotal(stats: Stats): number {
  if (stats.length !== 3) throw new Error(`part needs 3 stats, got ${stats.length}`);
  let total = 0;
  for (const v of stats) {
    if (!Number.isInteger(v) || v < 0 || v > STAT_MAX) throw new Error(`stat out of 0..${STAT_MAX}: ${v}`);
    total += v;
  }
  if (total < PART_MIN || total > PART_MAX) throw new Error(`part total out of ${PART_MIN}..${PART_MAX}: ${total}`);
  return total;
}
