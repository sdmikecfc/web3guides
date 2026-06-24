/**
 * Conquer the Seas — open a scored run (anti-cheat).
 *
 *   POST /api/seas/run-start   { t, game }  ->  { ok, nonce } | { degraded }
 *
 * Before a captain banks a run, the game page asks for a single-use NONCE tied
 * to their token and game. /api/seas/score requires that nonce back and claims
 * it atomically, then rejects any run that arrives faster than the game's
 * minimum play time. This is the shippable interim that closes the "curl the
 * max score with only a token" hole (full headless input-replay is a later
 * pass). Read + one insert; no payout here.
 *
 * DEGRADES GRACEFULLY: if migration 023 has not run, this returns
 * { degraded: true } and the games bank without a nonce (the score route also
 * detects the missing table and falls back to the old token-only behavior).
 */

import { NextResponse } from "next/server";
import { launchWarsDb } from "@/lib/launch-wars/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Games that bank a scored run. Anything else is rejected up front.
const GAMES = new Set(["channel-run", "gunnery", "powder-hold", "heading", "lookout"]);

// A captain should never need many open runs in a minute (each real run takes
// longer than its play floor). This only stops a script hammering thousands.
const RATE_LIMIT_PER_MIN = 12;

// Postgres / PostgREST "table does not exist" => migration 023 not run yet.
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "");
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(msg);
}

export async function POST(req: Request) {
  let body: { t?: string; game?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const t = String(body.t || "");
  const game = String(body.game || "");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(t) || !GAMES.has(game)) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const db = launchWarsDb();
  const { data: tok } = await db
    .from("launch_wars_s2_game_tokens")
    .select("discord_id, season_key, is_test, expires_at")
    .eq("token", t)
    .maybeSingle();
  if (!tok || new Date(tok.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "expired token" }, { status: 401 });
  }

  // Rate limit: recent nonces for this captain. A missing table means migration
  // 023 has not run, so we degrade rather than block play.
  const sinceIso = new Date(Date.now() - 60_000).toISOString();
  const { count, error: countErr } = await db
    .from("launch_wars_s2_run_nonces")
    .select("nonce", { count: "exact", head: true })
    .eq("discord_id", tok.discord_id)
    .gte("issued_at", sinceIso);
  if (countErr) {
    if (isMissingTable(countErr)) {
      return NextResponse.json({ ok: true, degraded: true });
    }
    return NextResponse.json({ ok: false, error: "rate check failed" }, { status: 500 });
  }
  if ((count || 0) >= RATE_LIMIT_PER_MIN) {
    return NextResponse.json({ ok: false, error: "too many runs, slow down" }, { status: 429 });
  }

  const nonce = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`).replace(
    /[^A-Za-z0-9_-]/g,
    "",
  );
  const { error: insErr } = await db.from("launch_wars_s2_run_nonces").insert({
    nonce,
    season_key: tok.season_key || "s2",
    discord_id: tok.discord_id,
    game,
    is_test: Boolean(tok.is_test),
  });
  if (insErr) {
    if (isMissingTable(insErr)) {
      return NextResponse.json({ ok: true, degraded: true });
    }
    return NextResponse.json({ ok: false, error: "could not open run" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, nonce });
}
