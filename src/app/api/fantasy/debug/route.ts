/**
 * TEMPORARY DIAGNOSTIC ENDPOINT — DELETE AFTER LAUNCH.
 *
 * Reports what the service-role client can actually see, without
 * leaking any secrets. Visit:
 *
 *   https://web3guides.com/api/fantasy/debug
 *
 * If row counts come back as 0 when rows exist in the DB, RLS is
 * filtering and the env var isn't a true service_role key.
 */

import { NextResponse } from "next/server";
import { fantasyDb } from "@/lib/fantasy/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result: Record<string, unknown> = {
    env: {
      has_NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      has_SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      has_FANTASY_SESSION_SECRET: Boolean(process.env.FANTASY_SESSION_SECRET),
      has_DOMA_API_KEY: Boolean(process.env.DOMA_API_KEY),
      url_host: (() => {
        try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").host; } catch { return null; }
      })(),
      service_role_key_prefix: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").slice(0, 12) || null,
    },
  };

  try {
    const db = fantasyDb();

    const tables = [
      "fantasy_auth_codes",
      "fantasy_users",
      "fantasy_rounds",
      "fantasy_pool_snapshots",
      "fantasy_pool_prices",
      "fantasy_holdings",
    ];
    const counts: Record<string, unknown> = {};
    for (const t of tables) {
      const { count, error } = await db
        .from(t)
        .select("*", { count: "exact", head: true });
      counts[t] = error ? { error: error.message } : { count };
    }
    result.row_counts_visible_to_service_role = counts;

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const parts = key.split(".");
    if (parts.length === 3) {
      try {
        const padded = parts[1] + "==".slice(0, (4 - (parts[1].length % 4)) % 4);
        const payload = JSON.parse(
          Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
        );
        result.jwt_role = payload.role ?? null;
        result.jwt_iss = payload.iss ?? null;
        result.jwt_ref = payload.ref ?? null;
      } catch {
        result.jwt_role = "<could-not-decode>";
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
