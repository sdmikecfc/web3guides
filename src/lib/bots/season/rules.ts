export const SEASON_RULES = Object.freeze({ version: "mk-season-1", starterCoins: 250, activeBots: 5,
  rewardedCompletions: 12, completionCoins: 75, objectiveAt: 6, objectiveCoins: 100,
  tradeMinUsdMicros: 10_000_000, tradePercent: 50, tradeCap: 500, directRatedDaily: 2,
  pairCooldownMs: 86_400_000, defenseProtectionMs: 7_200_000, defenseLossCap: 20,
  initialRating: 1000, attackerK: 24, defenderK: 8, ratingFloor: 100,
  gpTiers: [100, 200, 350, 500], buildPrices: [250, 750, 2000, 5000] });
export const SEASON_SOCKETS = ["head", "torso", "armL", "armR", "legL", "legR", "weapon"] as const;
export function fullBuildPrice(tier: number) { if (![1, 2, 3, 4].includes(tier)) throw new Error("Unknown tier"); return SEASON_RULES.buildPrices[tier - 1]; }
export function seasonalPartPrice(tier: number, slot: string) { return fullBuildPrice(tier) * (["head", "torso", "weapon"].includes(slot) ? 0.2 : 0.1); }
export function repairPolicy(gp: number) { const factor = Math.max(0, Math.min(1, (gp - 100) / 400)); return { durationMs: Math.round(3_600_000 + factor * 7_200_000), fullCoins: 50 + factor * 100 }; }
export function repairPrice(gp: number, readyAt: number, now: number) { const p = repairPolicy(gp); return Math.ceil(p.fullCoins * Math.min(p.durationMs, Math.max(0, readyAt - now)) / p.durationMs); }
export function dailyPlayCoins(completions: number) { const n = Math.max(0, Math.min(12, Math.floor(completions))); return n * 75 + (n >= 6 ? 100 : 0); }
export function tradeBonusTarget(playCoins: number, qualified: boolean) { return qualified ? Math.min(500, Math.floor(Math.max(0, playCoins) / 2)) : 0; }
export function fairGp(a: number, b: number, tolerance = 0.1) { return a > 0 && b > 0 && Math.abs(a - b) / a <= tolerance; }
export function ratingChange(attackerRating: number, defenderRating: number, winner: 0 | 1 | null, defenseLossAlready: number) {
  const score = winner === null ? 0.5 : winner === 0 ? 1 : 0;
  const expected = 1 / (1 + Math.pow(10, (defenderRating - attackerRating) / 400));
  const attacker = Math.max(100 - attackerRating, Math.round(24 * (score - expected)));
  const rawDefender = Math.round(8 * (expected - score));
  const defender = Math.max(100 - defenderRating, rawDefender < 0 ? -Math.min(-rawDefender, Math.max(0, 20 - defenseLossAlready)) : rawDefender);
  return { attacker, defender };
}
export function candidateScore(rating: number, wins: number, candidateRating: number, candidateWins: number) { return Math.abs(rating - candidateRating) + 12 * Math.min(10, Math.abs(wins - candidateWins)); }
