/**
 * THE ENGINE'S MONEY SPINE (ADR-0129 carve) - the ADR-0126 percent-bonded
 * model, carved VERBATIM from src/lib/s6/data.ts (targetWeightUsd, sliceTable,
 * paidPeakPct, targetSecuredUsd, finalizeTargetMoney) with exactly one change:
 * the pool and slice band come from SeasonConfig.money instead of module
 * constants. No season words, no season keys.
 *
 * The carve's honesty is PROVEN, not asserted: scripts/s7-shadow-diff.ts feeds
 * the live S6 target rows through BOTH this module and the shipped S6 code and
 * fails on any cent of disagreement (the ADR-0129 shadow-fixture gate).
 * Comment history lives in the S6 original; behavior notes that matter to a
 * caller are kept here.
 */
import type { SeasonMoney } from "./config";

/** The structural subset of a season target the money math needs. S6's
 * SeasonTarget satisfies it as-is, which is what lets the shadow diff feed
 * identical rows to both implementations. */
export interface MoneyTarget {
  status: string; // "pending" | "live" | "bonded" | "failed"
  bondingFdv: number | null;
  initialFdv: number | null;
  poolShareUsd: number | null; // operator override: wins outright
  peakProgress: number; // 0..1 persisted hourly-close peak
  poolShare: number; // OUT: filled by finalizeTargetMoney
  securedUsd: number; // OUT: filled by finalizeTargetMoney
}

/** The FDV raise a target represents (ADR-0026 weighting). */
export function targetWeightUsd(t: MoneyTarget): number {
  if (!t.bondingFdv || t.bondingFdv <= 0) return 0;
  if (t.initialFdv && t.initialFdv > 0 && t.initialFdv < t.bondingFdv) return t.bondingFdv - t.initialFdv;
  return t.bondingFdv;
}

/** Water-filled slice table: weight by raise, clamp to the band, renormalize,
 * operator shares first, residual pass so the slices sum to the pool exactly
 * (the $975-not-$1,000 lesson). STATUS-BLIND per ADR-0076. */
export function sliceTable<T extends MoneyTarget>(targets: T[], money: SeasonMoney): Map<T, number> {
  const { poolFullUsd, sliceMinUsd, sliceMaxUsd } = money;
  const out = new Map<T, number>();
  let pool = poolFullUsd;
  const free: T[] = [];
  for (const t of targets) {
    if (t.poolShareUsd !== null && t.poolShareUsd >= 0) {
      out.set(t, t.poolShareUsd);
      pool -= t.poolShareUsd;
    } else free.push(t);
  }
  if (!free.length) return out;
  pool = Math.max(0, pool);

  const lo = sliceMinUsd * free.length;
  const hi = sliceMaxUsd * free.length;
  if (pool < lo || pool > hi) {
    for (const t of free) out.set(t, pool / free.length);
    return out;
  }

  let rest = [...free];
  let budget = pool;
  for (let pass = 0; pass < free.length + 1 && rest.length; pass++) {
    const totW = rest.reduce((s, x) => s + targetWeightUsd(x), 0);
    const raw = new Map<T, number>();
    for (const t of rest) {
      raw.set(t, totW > 0 ? budget * (targetWeightUsd(t) / totW) : budget / rest.length);
    }
    const pinned: T[] = [];
    for (const t of rest) {
      const v = raw.get(t)!;
      if (v < sliceMinUsd) { out.set(t, sliceMinUsd); budget -= sliceMinUsd; pinned.push(t); }
      else if (v > sliceMaxUsd) { out.set(t, sliceMaxUsd); budget -= sliceMaxUsd; pinned.push(t); }
    }
    if (!pinned.length) {
      for (const t of rest) out.set(t, raw.get(t)!);
      rest = [];
      break;
    }
    rest = rest.filter((t) => !pinned.includes(t));
  }
  if (rest.length) for (const t of rest) out.set(t, budget / rest.length);

  // residual pass: money is never orphaned (upward water-fill under the cap)
  const assigned = () => free.reduce((s, t) => s + (out.get(t) ?? 0), 0);
  let residual = pool - assigned();
  for (let guard = 0; guard < free.length + 1 && residual > 0.005; guard++) {
    const room = free.filter((t) => (out.get(t) ?? 0) < sliceMaxUsd - 1e-9);
    if (!room.length) break;
    const totW = room.reduce((s, t) => s + targetWeightUsd(t), 0);
    let spent = 0;
    for (const t of room) {
      const want = totW > 0 ? residual * (targetWeightUsd(t) / totW) : residual / room.length;
      const give = Math.min(want, sliceMaxUsd - (out.get(t) ?? 0));
      out.set(t, (out.get(t) ?? 0) + give);
      spent += give;
    }
    if (spent <= 1e-9) break;
    residual -= spent;
  }
  return out;
}

/** ADR-0076 peak rule: whole-percent FLOOR of the persisted peak; bonded pays
 * 100. The +1e-9 epsilon defeats IEEE noise so a true 83% never floors to 82.
 * Every peak % a player sees must be THIS number. */
export function paidPeakPct(t: MoneyTarget): number {
  if (t.status === "bonded") return 100;
  return Math.floor(Math.max(0, Math.min(1, t.peakProgress)) * 100 + 1e-9);
}

/** USD a target has EARNED FOR ITS OWN HOLDERS, integer-cent exact like the
 * bot's computePools; the remainder is paid to nobody. */
function targetSecuredUsd(t: MoneyTarget): number {
  const shareCents = Math.round(t.poolShare * 100);
  if (t.status === "bonded") return shareCents / 100;
  return Math.floor((shareCents * paidPeakPct(t)) / 100 + 1e-6) / 100;
}

function poolUnlockedUsd<T extends MoneyTarget>(targets: T[], money: SeasonMoney): number {
  const slices = sliceTable(targets, money);
  return targets
    .filter((t) => t.status === "bonded")
    .reduce((s, t) => s + (slices.get(t) ?? 0), 0);
}

/** Fill poolShare + securedUsd and return the aggregates. Pure; the one money
 * seam every season surface goes through. */
export function finalizeTargetMoney<T extends MoneyTarget>(
  targets: T[],
  money: SeasonMoney,
): { unlocked: number; secured: number } {
  const slices = sliceTable(targets, money);
  for (const tg of targets) tg.poolShare = slices.get(tg) ?? 0;
  for (const tg of targets) tg.securedUsd = targetSecuredUsd(tg);
  return {
    unlocked: poolUnlockedUsd(targets, money),
    secured: Math.round(targets.reduce((s, t) => s + t.securedUsd * 100, 0)) / 100,
  };
}
