/**
 * Magic-link exchange endpoint.
 *
 *   GET /api/fantasy/enter?code=<one-time-code>
 *
 * Validates the code, marks it consumed, sets a HttpOnly session cookie,
 * and redirects to /fantasy/draft (or /fantasy/me if the round has locked).
 */

import { NextRequest, NextResponse } from "next/server";
import { fantasyDb } from "@/lib/fantasy/supabase";
import { setSessionCookie } from "@/lib/fantasy/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(req: NextRequest, reason: string) {
  const url = new URL("/fantasy/login", req.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail(req, "missing-code");

  const db = fantasyDb();

  const { data: row, error } = await db
    .from("fantasy_auth_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("[fantasy/enter] db read error", error);
    return fail(req, "server-error");
  }
  if (!row) return fail(req, "invalid-code");
  if (row.used_at) return fail(req, "already-used");
  if (new Date(row.expires_at).getTime() < Date.now()) return fail(req, "expired");

  // Mark consumed (best-effort — also stamp UA/IP for audit)
  const { error: updErr } = await db
    .from("fantasy_auth_codes")
    .update({
      used_at: new Date().toISOString(),
      user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      ip_address: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
    })
    .eq("code", code)
    .is("used_at", null); // race-safe: only succeeds if still unused
  if (updErr) {
    console.error("[fantasy/enter] db write error", updErr);
    return fail(req, "server-error");
  }

  // Upsert the user (idempotent — first sign-in creates the row)
  await db
    .from("fantasy_users")
    .upsert({ discord_id: row.discord_id, updated_at: new Date().toISOString() }, { onConflict: "discord_id" });

  // Decide where to land: if any round is currently DRAFTING, go to draft.
  // Otherwise go to /fantasy/me (which will redirect to landing if no active round).
  const { data: drafting } = await db
    .from("fantasy_rounds")
    .select("round_id")
    .eq("status", "DRAFTING")
    .order("draft_opens_at", { ascending: false })
    .limit(1);

  const target = drafting && drafting.length > 0 ? "/fantasy/draft" : "/fantasy/me";

  // Set cookie THEN redirect.
  setSessionCookie(row.discord_id);
  return NextResponse.redirect(new URL(target, req.url));
}
