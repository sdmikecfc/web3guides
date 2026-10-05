/**
 * Season 5, GUEST PROGRESS CLAIM. POST /api/s7/claim-guest  { t, scores }
 *
 * A visitor can try the arcade before enlisting; their per-game bests park in
 * localStorage (GUEST_STORAGE_KEY). After they enlist and open a play session,
 * this banks that guest progress ONCE per wallet:
 *
 * - `scores` is { [gameKey]: bestScore }. Unknown games are dropped; each
 *   score is bounds-checked to [0, maxScore] via bankableRules (live games,
 *   plus retired keys still inside their grace window).
 * - Valor: POINTS_PER_RUN per valid played game, total clamped to
 *   GAME_DAILY_POINTS_CAP (40), granted via s7_grant reason "guest-claim".
 * - IDEMPOTENT + fail-closed: the claim is recorded FIRST as a sentinel row in
 *   launch_wars_s7_scores (game "guest-claim", day_key "guest"; the table's
 *   UNIQUE(season_key, wallet, game, day_key) makes the second claim a
 *   duplicate-key error, returned as { already: true }). Sentinel day_key is
 *   never a real date, so daily-cap sums never see it. If the grant after the
 *   sentinel fails, the response is a 500 (visible, not silently unpaid).
 */
import { NextResponse } from "next/server";
import { s7Db, SEASON_KEY, scoringOpen } from "@/lib/s7/server";
import { GAME_DAILY_POINTS_CAP, POINTS_PER_RUN, SHELLS_PER_RUN, bankableRules } from "@/lib/s7/games";

export const runtime = "nodejs";

const SENTINEL_GAME = "guest-claim";
const SENTINEL_DAY = "guest";

export async function POST(req: Request) {
  let body: { t?: string; scores?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const t = String(body.t || "");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t)) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  // Bounds-check the claimed scores against the shared registry. Anything
  // unknown, non-finite, negative, or over maxScore is dropped (fail-closed:
  // a claim is only as big as its VALID games).
  const claimed: Array<{ game: string; score: number }> = [];
  if (body.scores && typeof body.scores === "object" && !Array.isArray(body.scores)) {
    for (const [game, raw] of Object.entries(body.scores)) {
      // Retired keys stay claimable inside their grace window: a guest who
      // parked a score the evening before a slate cutover would otherwise lose
      // it on connect, through no action of their own.
      const rules = bankableRules(game);
      if (!rules) continue;
      const score = Number(raw);
      if (!Number.isFinite(score) || score <= 0) continue;
      claimed.push({ game, score: Math.min(Math.floor(score), rules.maxScore) });
    }
  }
  if (claimed.length === 0) {
    return NextResponse.json({ ok: false, error: "nothing to claim" }, { status: 400 });
  }

  const db = s7Db();
  const { data: sess } = await db
    .from("launch_wars_s7_game_sessions")
    .select("wallet, is_test, expires_at")
    .eq("token", t)
    .maybeSingle();
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "session expired: sign in to claim" },
      { status: 401 },
    );
  }
  const wallet = String(sess.wallet).toLowerCase();
  const isTest = Boolean(sess.is_test);
  if (!isTest && !(await scoringOpen(db))) {
    return NextResponse.json(
      { ok: false, error: "The season is not live right now." },
      { status: 403 },
    );
  }

  // Total: flat Valor per valid played game, hard-clamped to the combined cap.
  const points = Math.min(claimed.length * POINTS_PER_RUN, GAME_DAILY_POINTS_CAP);

  // Atomic once-per-wallet claim: insert the sentinel FIRST. A duplicate-key
  // error means this wallet already claimed; nothing is granted twice.
  const { error: insErr } = await db.from("launch_wars_s7_scores").insert({
    season_key: SEASON_KEY,
    wallet,
    game: SENTINEL_GAME,
    day_key: SENTINEL_DAY,
    score: 0,
    points,
    meta: { games: claimed, claimed_at: new Date().toISOString() },
    is_test: isTest,
  });
  if (insErr) {
    if (/duplicate|unique/i.test(insErr.message || "")) {
      return NextResponse.json({ ok: false, already: true });
    }
    return NextResponse.json({ ok: false, error: "claim failed" }, { status: 500 });
  }

  const { error: gErr } = await db.rpc("s7_grant", {
    p_season_key: SEASON_KEY,
    p_wallet: wallet,
    p_display_name: null,
    p_points: points,
    // Gold for the runs they already played. A guest who tried the arcade
    // before enlisting banked real runs; paying Valor for them and not Gold
    // would make having tried the game first a small punishment.
    p_play_currency: SHELLS_PER_RUN * claimed.length,
    p_reason: "guest-claim",
    p_meta: { games: claimed },
    p_is_test: isTest,
  });
  if (gErr) {
    // The sentinel already recorded the claim; an unpaid grant must be VISIBLE
    // (a 500 to retry operationally), never a silent points desync.
    console.warn(`[s7/claim-guest] grant failed for ${wallet}: ${gErr.message}`);
    return NextResponse.json({ ok: false, error: "grant failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, points, games: claimed.map((c) => c.game) });
}
