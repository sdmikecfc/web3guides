/**
 * OG-Tournament Supabase client.
 *
 * Mirrors `fantasyDb()` (same project, same key, same pattern) — kept as a
 * separate export so OG routes can be re-pointed independently of fantasy /
 * lines if we ever need different settings (e.g. different cache strategy,
 * different key, etc.).
 *
 * Cache-busting fetch wrapper RESTORED 2026-05-26:
 *   The wrapper was removed previously under the assumption that bot writes
 *   would invalidate Supabase's gateway cache automatically. That assumption
 *   turned out to be wrong — observed in the May 2026 OG tournament where the
 *   bot advanced R16→QUARTERS (status update + winner_id writes + QF inserts
 *   all confirmed in DB) but the bracket image route kept reading the
 *   pre-transition rows for 12+ hours.
 *
 *   The wrapper adds `Cache-Control: no-cache` to every Supabase API call,
 *   forcing PostgREST to bypass its edge cache and read fresh from Postgres.
 *   Cost: small extra IO per route invocation. Worth it for read-correctness
 *   on bracket image routes that are read-heavy from Discord embed fetches.
 *
 *   Only affects ogTournamentDb() — fantasy/predictions use their own client.
 */

import "server-only";
import { createServerClient } from "@supabase/ssr";

// Force every Supabase API call from this client to bypass gateway cache.
// Critical: use `new Headers(init.headers)` so we preserve Supabase's
// auth/apikey headers (which arrive as a Headers object, not a plain dict —
// spreading a Headers object yields {} and silently breaks every query).
const noCacheFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-cache");
  headers.set("Pragma", "no-cache");
  return fetch(input, {
    ...init,
    cache: "no-store",
    headers,
  });
};

export function ogTournamentDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      global: { fetch: noCacheFetch },
    }
  );
}
