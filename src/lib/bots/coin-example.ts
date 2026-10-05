/** Display-only example of the published trading coin rule. Never awards coins. */
export function coinExample(countedUsd: number, coinRoiPercent: number) {
  const dollars = Number.isFinite(countedUsd) ? Math.max(0, countedUsd) : 0;
  const roi = Number.isFinite(coinRoiPercent) ? coinRoiPercent : 0;
  const bonusPercent = Math.min(100, Math.max(0, Math.round(2 * roi)));
  const base = Math.round(dollars);
  const bonus = Math.round(dollars * bonusPercent / 100);
  return { base, bonus, bonusPercent, total: base + bonus };
}
