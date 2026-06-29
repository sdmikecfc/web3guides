/**
 * STARFALL — open a scored run (anti-cheat nonce).
 *
 *   POST /api/stars/run-start  { t, game }  -> { ok, nonce }
 *
 * The game page asks for a single-use NONCE tied to the play session's wallet and
 * the game before a run is banked. /api/stars/score requires that nonce back, claims
 * it atomically, and rejects any run faster than the game's floor. Read + one insert.
 */
import { NextResponse } from "next/server";
import { starsDb, SEASON_KEY } from "@/lib/stars/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAMES = new Set(["rally", "trench", "slingshot", "raid"]);
const RATE_LIMIT_PER_MIN = 12;

export async function POST(req: Request) {
  let body: { t?: string; game?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const t = String(body.t || "");
  const game = String(body.game || "");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t) || !GAMES.has(game)) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const db = starsDb();
  const { data: sess } = await db
    .from("launch_wars_s3_game_sessions")
    .select("wallet, is_test, expires_at")
    .eq("token", t)
    .maybeSingle();
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "session expired — sign in to play again" }, { status: 401 });
  }

  const sinceIso = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db
    .from("launch_wars_s3_run_nonces")
    .select("nonce", { count: "exact", head: true })
    .eq("wallet", sess.wallet)
    .gte("issued_at", sinceIso);
  if ((count || 0) >= RATE_LIMIT_PER_MIN) {
    return NextResponse.json({ ok: false, error: "too many runs, slow down" }, { status: 429 });
  }

  const nonce = (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  ).replace(/[^A-Za-z0-9_-]/g, "");
  const { error } = await db.from("launch_wars_s3_run_nonces").insert({
    season_key: SEASON_KEY,
    nonce,
    wallet: sess.wallet,
    game,
    is_test: Boolean(sess.is_test),
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "could not open run" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, nonce });
}
