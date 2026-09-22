/**
 * "WHAT DO I GET PER DAY, PER DOLLAR?" — the one seam that answers it.
 *
 * Mike's brief for the stronghold dossier: clicking an enemy base should show
 * the domain token, an option to buy, "and what rewards to expect per day per
 * dollar". This module is that calculation and nothing else, so the map, the
 * how-to-play page and the HQ can never quote different numbers.
 *
 * It imports ONLY from lib/s5/games.ts, which is client-safe by design and is
 * itself a mirror of the bot's authoritative ECONOMY. No server-only import,
 * no data layer, no fetch: pure functions over constants, callable from a
 * "use client" component without tripping the build-breaking server-only
 * boundary.
 *
 * THE HONESTY RULE, which is not negotiable and is why this file has comments
 * at all: these are MEDALS, which are points. A Medal is not a dollar and this
 * module must never be used to render an expected dollar return. Your share of
 * the pool depends on every other commander's Medals too, so no per-player
 * dollar figure is knowable in advance. lib/s5/hq.ts EDUCATION["why-hold"]
 * already states this in the house voice; keep the two in agreement.
 */
import {
  FRESH_BONUS,
  FRESH_WINDOW_DAYS,
  HOLD_RATE_PER_USD_DAY,
  TIER_MAX,
  TIER_STEP_PCT,
  holdBaseDaily,
  holdCap,
} from "./games";

/** One row of the "hold this much, earn this much" table. */
export type HoldRow = {
  usd: number;
  /** Base Medals per day before freshness and breadth. */
  medalsPerDay: number;
  /** Medals per day per dollar held, the number Mike actually asked for. */
  perDollar: number;
};

/** The three amounts the dossier previews. $5 is the qualifying floor, $25 is
 * a common mid stake, $100 is the base ceiling — the three numbers that
 * actually explain the (now linear, ADR-0098) curve's shape. */
export const PREVIEW_USD = [5, 25, 100] as const;

/** Build the preview table for a given breadth (how many distinct strongholds
 * the player already holds $5+ of, which raises their ceiling). */
export function holdPreview(domainsEntered = 0, amounts: readonly number[] = PREVIEW_USD): HoldRow[] {
  return amounts.map((usd) => {
    const medalsPerDay = holdBaseDaily(usd, domainsEntered);
    return {
      usd,
      medalsPerDay,
      perDollar: usd > 0 ? medalsPerDay / usd : 0,
    };
  });
}

/**
 * Freshness multiplier for a newly listed stronghold: up to x(1 + FRESH_BONUS)
 * on listing day, easing linearly to x1 over FRESH_WINDOW_DAYS. Display only —
 * the bot does the actual accrual.
 *
 * `launchedMsAgo` may be negative (not listed yet) or NaN (no launch date); both
 * return 1 rather than a bonus, because a wall you cannot buy pays nothing.
 */
export function freshMultiplier(launchedMsAgo: number): number {
  if (!Number.isFinite(launchedMsAgo) || launchedMsAgo < 0) return 1;
  const days = launchedMsAgo / 86400000;
  if (days >= FRESH_WINDOW_DAYS) return 1;
  return 1 + FRESH_BONUS * (1 - days / FRESH_WINDOW_DAYS);
}

/** Breadth bonus: +5% daily hold per distinct stronghold held $5+ past the
 * first, capped at Tier 5. Returned as a whole percent for display. */
export function breadthPct(domainsEntered: number): number {
  const extra = Math.max(0, (domainsEntered || 0) - 1);
  return TIER_STEP_PCT * Math.min(extra, TIER_MAX);
}

/** The plain-words explanation of the curve, so the dossier never shows a
 * table of numbers with no story. Kept here beside the maths that produces it
 * so the two cannot drift. No em-dashes (house rule). */
export function curveNote(): string {
  return `Every dollar you hold pays a flat ${HOLD_RATE_PER_USD_DAY} Medals a day, counted up to your ceiling. Holding more strongholds raises the ceiling.`;
}

/** Current ceiling in dollars for a given breadth, for the "your ceiling is
 * $X" line. */
export function ceilingUsd(domainsEntered: number): number {
  return holdCap(domainsEntered);
}
