/**
 * Server-side data helpers shared by the Fantasy pages and API routes.
 */

import "server-only";
import { fantasyDb } from "./supabase";
import { getAllTokensByAddress } from "./doma";

export interface RoundRow {
  round_id: number;
  name: string;
  draft_opens_at: string;
  draft_locks_at: string;
  resolves_at: string;
  budget_usd: number;
  status: "UPCOMING" | "DRAFTING" | "ACTIVE" | "COMPLETE";
}

export interface PoolPriceRow {
  token_address: string;
  domain_name: string;
  fdv_usd: number;
  price_usd: number | null;
  volume_usd: number | null;
  holder_count: number | null;
  status: string | null;
  tier: "PREMIUM" | "UPPER_MID" | "MID" | "SMALL";
}

export interface HoldingRow {
  token_address: string;
  domain_name: string;
  cost_basis_fdv_usd: number;
  drafted_at: string;
}

/** The current DRAFTING round, if any. */
export async function getCurrentDraftingRound(): Promise<RoundRow | null> {
  const { data } = await fantasyDb()
    .from("fantasy_rounds")
    .select("*")
    .eq("status", "DRAFTING")
    .order("draft_opens_at", { ascending: false })
    .limit(1);
  return (data?.[0] as RoundRow) ?? null;
}

/** The most recent round in any state (used by /fantasy/me when nothing is drafting). */
export async function getLatestRound(): Promise<RoundRow | null> {
  const { data } = await fantasyDb()
    .from("fantasy_rounds")
    .select("*")
    .order("draft_opens_at", { ascending: false })
    .limit(1);
  return (data?.[0] as RoundRow) ?? null;
}

/** Eligible pool with prices for a given round's snapshot. Sorted by FDV desc. */
export async function getPoolForRound(roundId: number): Promise<PoolPriceRow[]> {
  const db = fantasyDb();
  const { data: snap } = await db
    .from("fantasy_pool_snapshots")
    .select("snapshot_id")
    .eq("round_id", roundId)
    .single();
  if (!snap) return [];
  const { data: prices } = await db
    .from("fantasy_pool_prices")
    .select("*")
    .eq("snapshot_id", snap.snapshot_id)
    .order("fdv_usd", { ascending: false });
  return (prices ?? []) as PoolPriceRow[];
}

/** Holdings for one user in one round. */
export async function getUserHoldings(roundId: number, discordId: string): Promise<HoldingRow[]> {
  const { data } = await fantasyDb()
    .from("fantasy_holdings")
    .select("token_address, domain_name, cost_basis_fdv_usd, drafted_at")
    .eq("round_id", roundId)
    .eq("discord_id", discordId);
  return (data ?? []) as HoldingRow[];
}

/**
 * Decorate user holdings with live FDV. Falls back to cost basis if the
 * token isn't currently in the Doma response (e.g. graduation lost / removed).
 */
export async function decorateHoldings(holdings: HoldingRow[]) {
  if (holdings.length === 0) return [];
  const live = await getAllTokensByAddress();
  return holdings.map((h) => {
    const tok = live.get(h.token_address.toLowerCase());
    const liveFdv = Number(tok?.currentFDV ?? h.cost_basis_fdv_usd);
    const pct = h.cost_basis_fdv_usd > 0
      ? ((liveFdv - h.cost_basis_fdv_usd) / h.cost_basis_fdv_usd) * 100
      : 0;
    return {
      ...h,
      current_fdv_usd: liveFdv,
      pct_change: pct,
    };
  });
}
