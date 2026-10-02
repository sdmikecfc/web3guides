/**
 * Campaign scoring (ADR-0111). A pure function of one 12-hour window's
 * measurements — no clock, no rng, no I/O — so it can be tested headlessly
 * and audited after the fact against what actually paid.
 *
 * THE LAWS THIS FILE ENFORCES, not just describes:
 *   - out-of-range liquidity scores ZERO (it is helping nobody trade)
 *   - volume rides a log curve, so wash volume buys a shrinking share while
 *     paying real fees for the privilege (ADR-0043)
 *   - service quality pays a FLAT award to a tier, never a multiplier on
 *     anyone's contribution (ADR-0054's refusal, restated)
 *   - a per-wallet cap means no single player can take the window
 *   - every genuinely active player clears a floor
 *
 * Nothing here mints, custodies, or promises anything. It produces SHARES of
 * a window; settlement is manual and public, as it has been for two seasons.
 */

// ── tunables (config per campaign, ADR-0048) ──────────────────────────────
export interface CampaignWeights {
  /** how much of a window goes to contribution vs the service award */
  serviceAwardShare: number;
  /** relative pull of each contribution input */
  volumeWeight: number;
  liquidityWeight: number;
  /**
   * How hard concentration is paid, as an exponent on the concentration
   * signal. Measured 2026-08-13: a full range scores 0.5 and the tightest
   * reachable range scores 8, so the RAW gap is 16x — but the score has
   * always applied a square root, making the real gap in the payout 4x.
   *
   * Mike's call 2026-08-14, after that measurement: lower it so the gap is
   * smaller. ADR-0115 makes the in-game LP button mint FULL RANGE only, so
   * the 4x fell entirely on beginners using the game's own button, while the
   * Academy taught tight/medium/wide.
   *
   *   0.5  (the old hardcoded sqrt) -> full 0.707, tight 2.828, gap 4.00x
   *   0.25 (this default)           -> full 0.841, tight 1.682, gap 2.00x
   *
   * Tight still earns double, so the incentive and the lesson survive; a
   * beginner is no longer quartered for pressing the button we point them at.
   * Per-campaign config like every other weight (ADR-0111).
   */
  concentrationExponent: number;
  /** the most the FDV bonus can lift a score */
  fdvBonusMax: number;
  /** no wallet may take more than this fraction of one window */
  perWalletCap: number;
  /** every active player gets at least this fraction */
  activeFloor: number;
  /** quality at or above this joins the top tier */
  topTierQuality: number;
}

export const DEFAULT_WEIGHTS: CampaignWeights = {
  serviceAwardShare: 0.1,
  volumeWeight: 1,
  liquidityWeight: 1.4,
  concentrationExponent: 0.25,
  fdvBonusMax: 0.25,
  perWalletCap: 0.25,
  activeFloor: 0.005,
  topTierQuality: 80,
};

/** What we measured about one player over one window. */
export interface WindowEntry {
  wallet: string;
  /** dollars traded through the domain's pools this window */
  volumeUsd: number;
  /** dollars of liquidity that were IN RANGE (out-of-range is not counted) */
  inRangeUsd: number;
  /**
   * v3's own concentration signal: liquidity per dollar, normalised so a
   * full-range position is ~1 and a tight one is higher. Tighter earns more
   * per dollar because it is doing more work at the current price.
   */
  concentration: number;
  /** the day's service quality, 0-100 (ADR-0106) */
  quality: number;
  /** did they actually play this window */
  active: boolean;
}

export interface WindowInput {
  entries: WindowEntry[];
  /** TWAP FDV now vs at campaign start; 1 = flat */
  fdvRatio: number;
  weights?: Partial<CampaignWeights>;
}

export interface Share {
  wallet: string;
  /** fraction of this window, 0..1 */
  share: number;
  /** what drove it, for the audit trail — never shown as money in game */
  fromContribution: number;
  fromServiceAward: number;
  cappedByWallet: boolean;
  liftedByFloor: boolean;
  topTier: boolean;
}

export interface WindowResult {
  shares: Share[];
  /** 0..fdvBonusMax, applied to the whole contribution pool */
  fdvBonus: number;
  topTierCount: number;
  /** sums to <= 1; any remainder rolls into the next window */
  distributed: number;
}

/** Diminishing returns on volume: the anti-wash curve from ADR-0043. */
export function volumeScore(usd: number): number {
  return Math.log1p(Math.max(0, usd) / 50);
}

/**
 * In-range dollars, paid a little more per dollar the tighter they work.
 *
 * The exponent is config (see `concentrationExponent`): at the 0.25 default a
 * tight range earns 2x a full range, down from the 4x the hardcoded square
 * root used to give. The clamp stays as a belt-and-braces guard even though
 * `measureLiquidity` already bounds the input.
 */
export function liquidityScore(
  inRangeUsd: number,
  concentration: number,
  exponent: number = DEFAULT_WEIGHTS.concentrationExponent
): number {
  if (!(inRangeUsd > 0)) return 0; // out of range earns nothing at all
  const c = Math.max(0.25, Math.min(8, concentration || 1));
  const e = Number.isFinite(exponent) && exponent >= 0 ? exponent : DEFAULT_WEIGHTS.concentrationExponent;
  return Math.log1p(inRangeUsd / 25) * Math.pow(c, e);
}

/** The FDV bonus, bounded and only ever upward from the campaign start. */
export function fdvBonus(fdvRatio: number, max: number): number {
  if (!Number.isFinite(fdvRatio) || fdvRatio <= 1) return 0;
  // +100% FDV reaches the cap; beyond that it stops paying more
  return Math.min(max, (fdvRatio - 1) * max);
}

/**
 * Split one 12-hour window. Returns fractions of the window, never dollars —
 * the amount is applied by the settlement pipeline, and the math itself stays
 * private (ADR-0042).
 */
export function scoreWindow(input: WindowInput): WindowResult {
  const w: CampaignWeights = { ...DEFAULT_WEIGHTS, ...(input.weights ?? {}) };
  const entries = input.entries.filter((e) => e && typeof e.wallet === "string");
  const bonus = fdvBonus(input.fdvRatio, w.fdvBonusMax);

  if (entries.length === 0) {
    return { shares: [], fdvBonus: bonus, topTierCount: 0, distributed: 0 };
  }

  // ── the service award: FLAT, split among the top tier (ADR-0111) ─────────
  const topTier = entries.filter((e) => e.active && e.quality >= w.topTierQuality);
  const awardPool = topTier.length > 0 ? w.serviceAwardShare : 0;
  const awardEach = topTier.length > 0 ? awardPool / topTier.length : 0;
  const topSet = new Set(topTier.map((e) => e.wallet));

  // ── contribution ─────────────────────────────────────────────────────────
  const raw = entries.map((e) => {
    const v = volumeScore(e.volumeUsd) * w.volumeWeight;
    const l = liquidityScore(e.inRangeUsd, e.concentration, w.concentrationExponent) * w.liquidityWeight;
    return { wallet: e.wallet, active: e.active, score: (v + l) * (1 + bonus) };
  });
  const totalRaw = raw.reduce((n, r) => n + r.score, 0);
  const contributionPool = 1 - awardPool;

  let shares: Share[] = raw.map((r) => ({
    wallet: r.wallet,
    share: totalRaw > 0 ? (r.score / totalRaw) * contributionPool : 0,
    fromContribution: totalRaw > 0 ? (r.score / totalRaw) * contributionPool : 0,
    fromServiceAward: topSet.has(r.wallet) ? awardEach : 0,
    cappedByWallet: false,
    liftedByFloor: false,
    topTier: topSet.has(r.wallet),
  }));

  // ── the floor: an active player is never sent away with nothing ──────────
  const activeCount = raw.filter((r) => r.active).length;
  if (activeCount > 0 && w.activeFloor > 0) {
    const floor = Math.min(w.activeFloor, contributionPool / activeCount);
    shares = shares.map((s, i) => {
      if (!raw[i].active || s.fromContribution >= floor) return s;
      return { ...s, fromContribution: floor, liftedByFloor: true };
    });
    // renormalise contribution back down to its pool
    const sum = shares.reduce((n, s) => n + s.fromContribution, 0);
    if (sum > contributionPool && sum > 0) {
      const k = contributionPool / sum;
      shares = shares.map((s) => ({ ...s, fromContribution: s.fromContribution * k }));
    }
  }

  // ── the cap: nobody takes the window ─────────────────────────────────────
  for (let pass = 0; pass < 4; pass++) {
    const totals = shares.map((s) => s.fromContribution + s.fromServiceAward);
    const over = totals.map((t, i) => (t > w.perWalletCap ? i : -1)).filter((i) => i >= 0);
    if (over.length === 0) break;
    let spill = 0;
    for (const i of over) {
      const excess = totals[i] - w.perWalletCap;
      spill += excess;
      // trim the contribution part; the flat award is not what made them big
      shares[i] = {
        ...shares[i],
        fromContribution: Math.max(0, shares[i].fromContribution - excess),
        cappedByWallet: true,
      };
    }
    // hand the spill to everyone still under the cap, by their existing weight
    const under = shares
      .map((s, i) => ({ s, i, t: s.fromContribution + s.fromServiceAward }))
      .filter((x) => x.t < w.perWalletCap && x.s.fromContribution > 0);
    const underTotal = under.reduce((n, x) => n + x.s.fromContribution, 0);
    if (spill <= 0 || under.length === 0 || underTotal <= 0) break;
    for (const x of under) {
      const add = spill * (x.s.fromContribution / underTotal);
      shares[x.i] = { ...x.s, fromContribution: x.s.fromContribution + add };
    }
  }

  shares = shares.map((s) => ({
    ...s,
    share: Math.min(w.perWalletCap, s.fromContribution + s.fromServiceAward),
  }));
  shares.sort((a, b) => b.share - a.share);

  return {
    shares,
    fdvBonus: bonus,
    topTierCount: topTier.length,
    distributed: shares.reduce((n, s) => n + s.share, 0),
  };
}

// ── the PUBLIC ladder (ADR-0042: ladders public, math private) ────────────
export interface ServiceTier {
  name: string;
  minQuality: number;
  blurb: string;
}
export const SERVICE_TIERS: ServiceTier[] = [
  { name: "Finding its feet", minQuality: 0, blurb: "Open and serving." },
  { name: "Well run", minQuality: 60, blurb: "Tidy room, steady service." },
  { name: "Talked about", minQuality: 70, blurb: "People mention this place." },
  { name: "The best table in town", minQuality: 80, blurb: "Top tier. Shares the service award." },
];

export function serviceTier(quality: number): ServiceTier {
  let t = SERVICE_TIERS[0];
  for (const tier of SERVICE_TIERS) if (quality >= tier.minQuality) t = tier;
  return t;
}
