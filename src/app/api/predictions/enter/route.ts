/**
 * Doma Predictions magic-link exchange.
 *
 *   GET /api/predictions/enter?code=<one-time>&round=<id>
 *
 * Validates the one-time code from `lines_auth_codes`, marks it consumed,
 * sets a HttpOnly session cookie tied to the discord_id, then redirects
 * the user to /predictions/[roundId]/enter (the form page).
 *
 * Mirrors the fantasy/enter flow — same session module is reused so a
 * single Discord user has one identity across both games.
 */

import { NextRequest, NextResponse } from "next/server";
import { fantasyDb } from "@/lib/fantasy/supabase";
import { setSessionCookie } from "@/lib/fantasy/session";

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

function fail(req: NextRequest, reason: string) {
  const url = new URL("/predictions/login", req.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code    = req.nextUrl.searchParams.get("code");
  const roundId = req.nextUrl.searchParams.get("round");
  if (!code)    return fail(req, "missing-code");
  if (!roundId) return fail(req, "missing-round");

  const db = fantasyDb();

  const { data: row, error } = await db
    .from("lines_auth_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("[predictions/enter] db read error", error);
    return fail(req, "server-error");
  }
  if (!row)                                                return fail(req, "invalid-code");
  if (row.used_at)                                         return fail(req, "already-used");
  if (new Date(row.expires_at).getTime() < Date.now())     return fail(req, "expired");

  // Mark consumed (race-safe: only succeeds if still unused)
  const { error: updErr } = await db
    .from("lines_auth_codes")
    .update({
      used_at:    new Date().toISOString(),
      user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      ip_address: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
    })
    .eq("code", code)
    .is("used_at", null);
  if (updErr) {
    console.error("[predictions/enter] consume error", updErr);
    return fail(req, "server-error");
  }

  setSessionCookie(row.discord_id);
  return NextResponse.redirect(new URL(`/predictions/${roundId}/enter`, req.url));
}
