/**
 * Season 4 — open a scored run (step 2 of the anti-cheat chain: the nonce).
 *
 *   POST /api/s4/run-start  { t, game }  -> { ok, nonce, stats }
 *
 * Port of the proven S3 route (/api/stars/run-start). The game page trades the
 * play-session token for a single-use NONCE tied to the wallet and the game.
 * /api/s4/score requires that nonce back, claims it atomically, and rejects
 * runs faster than the game's floor. Rate limit: 12 nonces/min/wallet.
 * Game keys come from the ONE shared registry (lib/s4/games) — S3 duplicated
 * them across two routes.
 *
 * S4 upgrade — the STAT SYNERGY contract: the response carries the player's
 * persistent character stats (ADR-0004: launch_wars_s4_players.skin JSONB,
 * top-level { botox, drugs, ozempic, aura }) so the game can apply its BOUNDED
 * STAT_EFFECTS baseline. A wallet with no player row (or junk skin) plays at
 * all zeros. Stats only make reaching the existing server caps easier; the
 * caps themselves are enforced in /api/s4/score regardless of what the client
 * does with these numbers.
 */
import { NextResponse } from "next/server";
import { s4Db, SEASON_KEY, scoringOpen } from "@/lib/s4/server";
import { GAME_RULES, clampStats } from "@/lib/s4/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const rules = GAME_RULES[game];
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t) || !rules) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (rules.comingSoon) {
    return NextResponse.json({ ok: false, error: "That game is not open yet." }, { status: 400 });
  }

  const db = s4Db();
  const { data: sess } = await db
    .from("launch_wars_s4_game_sessions")
    .select("wallet, is_test, expires_at")
    .eq("token", t)
    .maybeSingle();
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "session expired: sign in to play again" },
      { status: 401 },
    );
  }
  // Season gate (audit 2026-07-12): no real scored runs while the season is not
  // live (inert, or the settlement freeze). Test sessions bypass for rehearsal.
  if (!sess.is_test && !(await scoringOpen(db))) {
    return NextResponse.json(
      { ok: false, error: "The season is not live right now. Practice mode is always open." },
      { status: 403 },
    );
  }

  const sinceIso = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db
    .from("launch_wars_s4_run_nonces")
    .select("nonce", { count: "exact", head: true })
    .eq("wallet", sess.wallet)
    .gte("issued_at", sinceIso);
  if ((count || 0) >= RATE_LIMIT_PER_MIN) {
    return NextResponse.json({ ok: false, error: "too many runs, slow down" }, { status: 429 });
  }

  // The player's persistent character stats ride along with the nonce (0s for
  // a wallet that has no player row yet — new players fight at baseline).
  const { data: player } = await db
    .from("launch_wars_s4_players")
    .select("skin")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", sess.wallet)
    .maybeSingle();
  const stats = clampStats(player?.skin);

  const nonce = (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  ).replace(/[^A-Za-z0-9_-]/g, "");
  const { error } = await db.from("launch_wars_s4_run_nonces").insert({
    season_key: SEASON_KEY,
    nonce,
    wallet: sess.wallet,
    game,
    is_test: Boolean(sess.is_test),
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "could not open run" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, nonce, stats });
}
