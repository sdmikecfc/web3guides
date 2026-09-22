/**
 * BATTLE BOTS GRANTS: the ONE way coins or battle points move. Every change
 * to battle_bots_players.coins goes through the bb_grant RPC
 * (doma-reporter/sql/battle_bots_001_init.sql section 18) with a reason
 * that is unique per wallet, so a rerun of any route grants nothing twice
 * (duplicate = true, nothing moved) and an overdraft is refused by the
 * database (ok = false, nothing written). Never a direct UPDATE of coins.
 *
 * Called exactly the way the s7 score route calls s7_grant
 * (src/app/api/s7/score/route.ts): db.rpc("bb_grant", { p_wallet, ... })
 * with PostgREST-exact named args.
 *
 * Coins are whole numbers; a fractional coin here is a bug and throws.
 */
import "server-only";
import type { BotsDb } from "./db";

export interface GrantArgs {
  wallet: string;
  walletName?: string | null;
  coins: number;
  points?: number;
  reason: string;
  meta?: Record<string, unknown>;
  isTest: boolean;
}

export interface GrantResult {
  ok: boolean;
  duplicate: boolean;
  coins: number;
  battlePoints: number;
}

export async function grant(db: BotsDb, a: GrantArgs): Promise<GrantResult> {
  if (!Number.isInteger(a.coins)) throw new Error(`grant ${a.reason}: coins must be a whole number, got ${a.coins}`);
  const points = a.points ?? 0;
  if (!(Number.isFinite(points) && points >= 0)) throw new Error(`grant ${a.reason}: points must be >= 0, got ${points}`);
  const { data, error } = await db.rpc("bb_grant", {
    p_wallet: a.wallet.toLowerCase(),
    p_wallet_name: a.walletName ?? null,
    p_coins: a.coins,
    p_battle_points: points,
    p_reason: a.reason,
    p_meta: a.meta ?? null,
    p_is_test: a.isTest,
  });
  if (error) throw new Error(`bb_grant ${a.reason}: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; duplicate: boolean; new_coins: number | string; new_battle_points: number | string }
    | undefined;
  if (!row) throw new Error(`bb_grant ${a.reason}: no row returned`);
  return {
    ok: !!row.ok,
    duplicate: !!row.duplicate,
    coins: Math.round(Number(row.new_coins) || 0),
    battlePoints: Number(row.new_battle_points) || 0,
  };
}

/** Positive battle-side coins this wallet was paid today (battle:* and
 * stake:*:win reasons), for the daily ceiling breaker. */
export async function battleCoinsToday(db: BotsDb, wallet: string, day: string): Promise<number> {
  const { data, error } = await db
    .from("battle_bots_ledger")
    .select("coins, reason")
    .eq("wallet", wallet.toLowerCase())
    .gte("created_at", `${day}T00:00:00.000Z`)
    .or("reason.like.battle:%,reason.like.stake:%")
    .limit(5000);
  if (error) throw new Error(`ledger read: ${error.message}`);
  let sum = 0;
  for (const r of (data || []) as { coins: number | string; reason: string }[]) {
    const c = Number(r.coins) || 0;
    if (c > 0) sum += c;
  }
  return sum;
}
