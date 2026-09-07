/** Public campaign contract. Addresses and other players' earning records never cross this boundary. */
export const CAMPAIGN_PERIODS = ["week1", "week2", "final"] as const;
export type CampaignPeriod = typeof CAMPAIGN_PERIODS[number];
export const CAMPAIGN_CATEGORIES = ["roi", "profit", "battles"] as const;
export type CampaignCategory = typeof CAMPAIGN_CATEGORIES[number];
export const CAMPAIGN_LABEL: Record<CampaignCategory, string> = { roi: "ROI %", profit: "Profit in USD", battles: "Battle points" };
export const CAMPAIGN_PRIZES = {
  roi: { weekly: [60, 35, 25, 20, 10], final: [200, 120, 80, 60, 40] },
  profit: { weekly: [60, 35, 25, 20, 10], final: [200, 120, 80, 60, 40] },
  battles: { weekly: [30, 20, 12, 8, 5], final: [100, 60, 40, 30, 20] },
} as const;
export interface CampaignStanding { name: string; rank: number; score: number; prizeCents: number; status: string; eligibility: string }
export interface CampaignEarning {
  status: string; snapshotStatus: "pending" | "ready" | "failed" | null;
  creditFromAt: string | null; confirmedFillCount: number | null; pendingFillCount: number | null;
  countedVolumeUsd: number | null; earnedCoins: number | null; lastConfirmedFillAt: string | null; updatedAt: string | null;
}
export interface CampaignView {
  ok: true; source: "available" | "unavailable";
  campaign: { id: string; title: string; status: "draft" | "active" | "closed" | "frozen"; startsAt: string | null; endsAt: string | null } | null;
  period: { key: CampaignPeriod; startsAt: string | null; endsAt: string | null; status: "upcoming" | "active" | "checking" | "frozen" };
  updatedAt: string | null; confirmedThrough: string | null; ready: boolean | null; standings: Record<CampaignCategory, CampaignStanding[]>;
  earning: CampaignEarning | null; domaMcp: "pending" | "available";
}
export const emptyCampaign = (period: CampaignPeriod = "final", source: CampaignView["source"] = "unavailable"): CampaignView => ({
  ok: true, source, campaign: null, period: { key: period, startsAt: null, endsAt: null, status: "upcoming" }, updatedAt: null, confirmedThrough: null, ready: null,
  standings: { roi: [], profit: [], battles: [] }, earning: null, domaMcp: "pending",
});
export function campaignPeriod(value: unknown): CampaignPeriod { return CAMPAIGN_PERIODS.includes(value as CampaignPeriod) ? value as CampaignPeriod : "final"; }

/** Ten-minute reporter cadence: three missed runs makes live results unavailable.
 * Frozen awards retain their reviewed validity without a running reporter. */
export const CAMPAIGN_FRESH_MS = 30 * 60 * 1000;
export function campaignSnapshotAvailable(raw: unknown, id: string, period: CampaignPeriod, frozen: boolean, now = Date.now()): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const p = raw as Record<string, any>;
  if (p.schemaVersion !== 1 || p.campaign?.id !== id || p.period?.key !== period || p.ready !== true) return false;
  if (!Array.isArray(p.issues) || p.issues.length) return false;
  if (frozen) return p.period?.status === "frozen";
  const updated = Date.parse(p.updatedAt), through = Date.parse(p.provenance?.confirmedThrough), end = Date.parse(p.campaign?.endsAt);
  if (!Number.isFinite(updated) || updated > now + 60000 || now - updated > CAMPAIGN_FRESH_MS) return false;
  return Number.isFinite(through) && through <= now + 60000 && Math.min(now, end) - through <= CAMPAIGN_FRESH_MS;
}

/** Only explicitly named fields are serialized; the source payload contains private wallet keys. */
export function publicStandings(raw: unknown, names: ReadonlyMap<string, string>): Record<CampaignCategory, CampaignStanding[]> {
  const result = { roi: [], profit: [], battles: [] } as Record<CampaignCategory, CampaignStanding[]>;
  const groups = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  for (const key of CAMPAIGN_CATEGORIES) {
    if (!Array.isArray(groups[key])) continue;
    for (const row of (groups[key] as unknown[]).slice(0, 100)) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>, name = typeof r.wallet === "string" ? names.get(r.wallet.toLowerCase()) : undefined;
      if (!name || typeof r.score !== "number" || !Number.isFinite(r.score) || typeof r.rank !== "number" || !Number.isInteger(r.rank) || r.rank < 1) continue;
      result[key].push({ name, score: r.score, rank: r.rank,
        prizeCents: typeof r.prizeCents === "number" && Number.isFinite(r.prizeCents) ? Math.max(0, r.prizeCents) : 0,
        status: ["eligible", "pending", "confirmed", "checking", "frozen", "ranked", "unranked", "excluded"].includes(String(r.status)) ? String(r.status) : "checking",
        eligibility: ["eligible", "pending", "ineligible"].includes(String(r.eligibility)) ? String(r.eligibility) : "pending" });
    }
  }
  return result;
}
