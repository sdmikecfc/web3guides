import "server-only";

/**
 * Domain Kitchen server helpers (M6). Same one-line-wrapper convention every
 * other domain in this repo uses (s5Db, s4Db, starsDb, fantasyDb): routes
 * never touch createServiceClient directly.
 *
 * The service-role key BYPASSES RLS, and the domain_kitchen_* tables are
 * RLS-on with no public policies, so these helpers are the only way in — and
 * every route that uses them must authenticate a session token first.
 */

import { createServiceClient } from "@/lib/supabase/server";

export const DK_GAME_KEY = "dk";
/** how long a play session lasts before the player signs again */
export const DK_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function dkDb() {
  return createServiceClient();
}

/**
 * The wallet a play-session token belongs to, or null. Mirrors
 * src/lib/s5/me.ts's walletForSession: the token is gated by shape before it
 * ever reaches the database, checked for expiry, and the wallet comes back
 * lowercased so it always keys the same row.
 */
export async function walletForDkSession(
  db: ReturnType<typeof dkDb>,
  token: unknown
): Promise<string | null> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(token)) return null;
  const { data, error } = await db
    .from("domain_kitchen_sessions")
    .select("wallet, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  const expires = Date.parse(String(data.expires_at));
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  const wallet = String(data.wallet || "").toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : null;
}
