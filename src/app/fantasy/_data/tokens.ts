/**
 * Mock data layer for the Fantasy League pages.
 *
 * In production this is replaced by a server-side fetch against Supabase
 * (fantasy_pool_prices for the current week's snapshot). For now we ship a
 * frozen pull of the live Doma GraphQL response so the demo is real.
 */

import rawTokens from "./live_tokens.json";

export type Tier = "PREMIUM" | "UPPER_MID" | "MID" | "SMALL";

export interface FantasyToken {
  domain: string;        // e.g. "BRAG.com"
  symbol: string;
  address: string;
  tier: Tier;
  fdvUsd: number;        // cost-to-draft (currentFDV)
  priceUsd: number;
  price24hAgoUsd: number | null;
  pctChange24h: number | null;  // null when no prior price
  volumeUsd: number;
  holderCount: number;
  status: "FRACTIONALIZED" | "GRADUATION_SUCCESSFUL";
  fractionalizedAt: string;
}

export interface PoolStats {
  eligibleCount: number;
  totalMarketFdvUsd: number;
  top10FdvSumUsd: number;
  budgetUsd: number;
}

export type RoundPhase = "DRAFTING" | "ACTIVE" | "COMPLETE";

export interface RoundInfo {
  roundNumber: number;
  phase: RoundPhase;
  draftOpensAt: Date;
  draftLocksAt: Date;     // end of the 3-day draft window
  resolvesAt: Date;       // end of the 7-day scoring window
  budgetUsd: number;
  filterDescription: string;
}

const FILTER = {
  minHolders: 25,
  minVolumeUsd: 50,
  orMinFdvUsd: 1000,
};

const BUDGET_FACTOR = 0.35;
const TOP_N_FOR_BUDGET = 10;

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isEligible(t: any): boolean {
  if (!t || !t.params || !t.params.name) return false;
  const status = t.status;
  if (status !== "GRADUATION_SUCCESSFUL" && status !== "FRACTIONALIZED") return false;
  if (t.boughtOutAt) return false;

  const fdv = num(t.currentFDV);
  if (fdv <= 0) return false;

  const holders = num(t.fractionalTokenHolderCount);
  if (holders < FILTER.minHolders) return false;

  const vol = num(t.volumeUsd);
  if (vol < FILTER.minVolumeUsd && fdv < FILTER.orMinFdvUsd) return false;

  return true;
}

function assignTier(idx: number, total: number): Tier {
  const premCutoff = Math.max(1, Math.floor(total * 0.05));
  const upperCutoff = premCutoff + Math.max(1, Math.floor(total * 0.15));
  const midCutoff = upperCutoff + Math.max(1, Math.floor(total * 0.40));
  if (idx < premCutoff) return "PREMIUM";
  if (idx < upperCutoff) return "UPPER_MID";
  if (idx < midCutoff) return "MID";
  return "SMALL";
}

let _tokensCache: FantasyToken[] | null = null;
let _statsCache: PoolStats | null = null;

export function getEligibleTokens(): FantasyToken[] {
  if (_tokensCache) return _tokensCache;

  const eligible = (rawTokens as any[])
    .filter(isEligible)
    .sort((a, b) => num(b.currentFDV) - num(a.currentFDV));

  _tokensCache = eligible.map((t, i) => {
    const price = num(t.priceUsd);
    const prior = t.price24hAgoUsd ? num(t.price24hAgoUsd) : null;
    const pct = prior && prior > 0 ? ((price - prior) / prior) * 100 : null;
    return {
      domain: String(t.params.name),
      symbol: String(t.params.symbol || ""),
      address: String(t.address || ""),
      tier: assignTier(i, eligible.length),
      fdvUsd: num(t.currentFDV),
      priceUsd: price,
      price24hAgoUsd: prior,
      pctChange24h: pct,
      volumeUsd: num(t.volumeUsd),
      holderCount: num(t.fractionalTokenHolderCount),
      status: t.status,
      fractionalizedAt: String(t.fractionalizedAt || ""),
    } as FantasyToken;
  });
  return _tokensCache;
}

export function getPoolStats(): PoolStats {
  if (_statsCache) return _statsCache;
  const tokens = getEligibleTokens();
  const totalMarketFdvUsd = tokens.reduce((s, t) => s + t.fdvUsd, 0);
  const top10FdvSumUsd = tokens.slice(0, TOP_N_FOR_BUDGET).reduce((s, t) => s + t.fdvUsd, 0);
  const budgetUsd = Math.round(top10FdvSumUsd * BUDGET_FACTOR);
  _statsCache = {
    eligibleCount: tokens.length,
    totalMarketFdvUsd,
    top10FdvSumUsd,
    budgetUsd,
  };
  return _statsCache;
}

export function getRoundInfo(): RoundInfo {
  const stats = getPoolStats();
  // Demo round: opened today, drafts lock in 3 days, resolves in 10.
  const now = new Date();
  const draftOpensAt = new Date(now);
  draftOpensAt.setUTCHours(18, 0, 0, 0);
  const draftLocksAt = new Date(draftOpensAt.getTime() + 3 * 86_400_000);
  const resolvesAt = new Date(draftOpensAt.getTime() + 10 * 86_400_000);
  return {
    roundNumber: 1,
    phase: "DRAFTING",
    draftOpensAt,
    draftLocksAt,
    resolvesAt,
    budgetUsd: stats.budgetUsd,
    filterDescription:
      `≥ ${FILTER.minHolders} holders AND (≥ $${FILTER.minVolumeUsd} weekly volume OR ≥ $${FILTER.orMinFdvUsd.toLocaleString()} FDV)`,
  };
}

/* ─────────────────────────────────────────────
   Formatters
   ───────────────────────────────────────────── */

export function fmtUsd(v: number, opts: { compact?: boolean; precise?: boolean } = {}): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "$0";
  const { compact, precise } = opts;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";

  if (compact) {
    if (abs >= 1_000_000_000) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  }

  if (abs >= 1) {
    return `${sign}$${abs.toLocaleString("en-US", {
      maximumFractionDigits: precise ? 2 : 0,
      minimumFractionDigits: precise ? 2 : 0,
    })}`;
  }
  // sub-dollar: 3 sig figs
  const str = abs.toFixed(20);
  const dot = str.indexOf(".");
  let firstNonZero = -1;
  for (let i = dot + 1; i < str.length; i++) {
    if (str[i] !== "0") { firstNonZero = i; break; }
  }
  if (firstNonZero === -1) return "$0";
  const zeros = firstNonZero - dot - 1;
  return `${sign}$${abs.toFixed(zeros + 3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct(p: number | null, opts: { showSign?: boolean } = {}): string {
  if (p === null || !Number.isFinite(p)) return "—";
  const sign = opts.showSign && p > 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

export const TIER_META: Record<Tier, { label: string; tone: string; dot: string; gradient: string }> = {
  PREMIUM: {
    label: "Premium",
    tone: "#f0b340",
    dot: "#f0b340",
    gradient: "linear-gradient(135deg, #f0b340 0%, #d97706 100%)",
  },
  UPPER_MID: {
    label: "Upper-mid",
    tone: "#7c6aff",
    dot: "#7c6aff",
    gradient: "linear-gradient(135deg, #7c6aff 0%, #4f3cc9 100%)",
  },
  MID: {
    label: "Mid",
    tone: "#5eead4",
    dot: "#5eead4",
    gradient: "linear-gradient(135deg, #5eead4 0%, #14b8a6 100%)",
  },
  SMALL: {
    label: "Small",
    tone: "#94a3b8",
    dot: "#94a3b8",
    gradient: "linear-gradient(135deg, #94a3b8 0%, #475569 100%)",
  },
};
