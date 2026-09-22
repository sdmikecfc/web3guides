/**
 * Season 4 — bank a mini-game run (step 3 of the anti-cheat chain).
 *
 *   POST /api/s4/score  { t, game, score, nonce, meta? }
 *
 * Port of the proven S3 route (/api/stars/score) with neutral renames
 * (Starlight -> Points, Salvage/stardust -> Credits/play currency) plus one S4
 * upgrade: a COMBINED daily Points cap across ALL games
 * (GAME_DAILY_POINTS_CAP in lib/s4/games — the bot module mirrors it).
 *
 * Mechanics, unchanged from S3:
 * - One best-of-N scored row per game per UTC day per wallet
 *   (UNIQUE(season_key, wallet, game, day_key) on launch_wars_s4_scores).
 * - Rewards computed SERVER-SIDE from the shared per-game rules; the client
 *   score only passes through under maxScore (an anti-forge ceiling) so the
 *   games leaderboard still separates skill.
 * - Anti-cheat: a single-use nonce from /api/s4/run-start claimed atomically
 *   (update ... is used_at null), a per-game minimum play time (floorMs), and
 *   a 45 min nonce TTL.
 * - Improving a daily best pays only the reward delta, so a day's total never
 *   exceeds the formula on the best score.
 * - Grants go through the s4_grant RPC (same contract as the proven s3_grant:
 *   p_season_key/p_wallet/p_display_name/p_points/p_play_currency/p_reason/
 *   p_meta/p_is_test, returning {ok, new_points, new_play_currency}; fail-closed).
 *   Param names must match sql/launch_wars_034_s4_init.sql (PostgREST matches
 *   named args EXACTLY; a wrong key is a PGRST202 runtime failure, not a type error).
 */
import { NextResponse } from "next/server";
import { s4Db, SEASON_KEY, scoringOpen } from "@/lib/s4/server";
import { GAME_RULES, GAME_DAILY_POINTS_CAP, pointsForCredits } from "@/lib/s4/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NONCE_TTL_MS = 45 * 60 * 1000;
const dayKey = () => new Date().toISOString().slice(0, 10);

export async function POST(req: Request) {
  let body: { t?: string; game?: string; score?: number; nonce?: string; meta?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const t = String(body.t || "");
  const game = String(body.game || "");
  const rawScore = Number(body.score);
  const rules = GAME_RULES[game];
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t) || !rules || !Number.isFinite(rawScore) || rawScore < 0) {
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
  const wallet = sess.wallet;
  const isTest = Boolean(sess.is_test);
  // Season gate (audit 2026-07-12): the money write. No real Points/Credits mint
  // while the season is not live; a Point minted during the settlement freeze
  // would corrupt real-dollar payout weights. Test sessions bypass.
  if (!isTest && !(await scoringOpen(db))) {
    return NextResponse.json(
      { ok: false, error: "The season is not live right now. Practice mode is always open." },
      { status: 403 },
    );
  }

  const score = Math.min(rawScore, rules.maxScore);
  const credits = Math.max(0, Math.min(rules.creditsCap, rules.toCredits(score)));
  const pointsUncapped = pointsForCredits(credits, rules.pointsCap);
  const day = dayKey();

  // ── Anti-cheat: claim the single-use run nonce + enforce min play time ──────
  {
    const nonce = String(body.nonce || "");
    const claim = await db
      .from("launch_wars_s4_run_nonces")
      .update({ used_at: new Date().toISOString() })
      .eq("nonce", nonce)
      .eq("wallet", wallet)
      .eq("game", game)
      .is("used_at", null)
      .select("issued_at")
      .maybeSingle();
    if (claim.error) {
      return NextResponse.json({ ok: false, error: "run check failed" }, { status: 500 });
    }
    if (!claim.data) {
      return NextResponse.json({ ok: false, error: "open a fresh run" }, { status: 401 });
    }
    const elapsed = Date.now() - new Date(claim.data.issued_at).getTime();
    if (elapsed < rules.floorMs) {
      return NextResponse.json({ ok: false, error: "too fast" }, { status: 400 });
    }
    if (elapsed > NONCE_TTL_MS) {
      return NextResponse.json({ ok: false, error: "run expired, start again" }, { status: 400 });
    }
  }

  const grant = (points: number, creditsGrant: number, meta: Record<string, unknown>) =>
    db.rpc("s4_grant", {
      p_season_key: SEASON_KEY,
      p_wallet: wallet,
      p_display_name: null,
      p_points: points,
      p_play_currency: creditsGrant,
      p_reason: `game:${game}`,
      p_meta: meta,
      p_is_test: isTest,
    });

  // One read: ALL of today's banked rows for this wallet. The current game's
  // row (if any) rides along for the best-of-N logic; the sum of `points`
  // across every row enforces the COMBINED daily cap (rows store what was
  // actually banked after capping, so this sum is always truthful).
  const { data: todayRows, error: readErr } = await db
    .from("launch_wars_s4_scores")
    .select("id, game, score, play_currency, points, meta")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .eq("day_key", day);
  if (readErr) {
    return NextResponse.json({ ok: false, error: "score check failed" }, { status: 500 });
  }
  const rows = todayRows || [];
  const existing = rows.find((r) => r.game === game) || null;
  const bankedToday = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);
  const capRoom = Math.max(0, GAME_DAILY_POINTS_CAP - bankedToday);

  if (!existing) {
    const points = Math.min(pointsUncapped, capRoom);
    const { error: insErr } = await db.from("launch_wars_s4_scores").insert({
      season_key: SEASON_KEY,
      wallet,
      game,
      day_key: day,
      score,
      play_currency: credits,
      points,
      meta: { ...(body.meta || {}), attempts: 1 },
      is_test: isTest,
    });
    if (insErr) {
      if (/duplicate|unique/i.test(insErr.message || "")) return NextResponse.json({ ok: false, already: true });
      return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });
    }
    const { error: gErr } = await grant(points, credits, { day, score });
    if (gErr) return NextResponse.json({ ok: false, error: "grant failed" }, { status: 500 });
    return NextResponse.json({
      ok: true,
      credits,
      points,
      best: score,
      improved: true,
      attemptsLeft: rules.attempts - 1,
      dailyPointsLeft: Math.max(0, capRoom - points),
    });
  }

  const used = Math.max(1, Number((existing.meta as { attempts?: number } | null)?.attempts) || 1);
  if (used >= rules.attempts) {
    return NextResponse.json({ ok: false, already: true, best: Number(existing.score) || 0, attemptsLeft: 0 });
  }

  const prevScore = Number(existing.score) || 0;
  const prevCredits = Number(existing.play_currency) || 0;
  const prevPoints = Number(existing.points) || 0;
  const improved = score > prevScore;
  const creditsDelta = improved ? Math.max(0, credits - prevCredits) : 0;
  // The improvement delta is bounded by BOTH the per-game formula and the
  // remaining combined daily room (capRoom already accounts for prevPoints,
  // since this game's row is included in bankedToday).
  const pointsDelta = improved ? Math.max(0, Math.min(pointsUncapped - prevPoints, capRoom)) : 0;

  const { error: updErr } = await db
    .from("launch_wars_s4_scores")
    .update({
      score: improved ? score : prevScore,
      play_currency: improved ? Math.max(prevCredits, credits) : prevCredits,
      // Store what was ACTUALLY banked (prev + capped delta), not the formula
      // value, so future combined-cap sums stay correct.
      points: prevPoints + pointsDelta,
      meta: { ...((existing.meta as Record<string, unknown>) || {}), attempts: used + 1, last_score: score },
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (updErr) return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });

  if (creditsDelta > 0 || pointsDelta > 0) {
    // Surface a grant failure instead of swallowing it: the row above already
    // recorded the delta as banked, so an unpaid grant must be visible (500)
    // rather than a silent points/ledger desync.
    const { error: gErr } = await grant(pointsDelta, creditsDelta, { day, score, improvement: true });
    if (gErr) {
      console.warn(`[s4/score] improvement grant failed for ${wallet} ${game}: ${gErr.message}`);
      return NextResponse.json({ ok: false, error: "grant failed" }, { status: 500 });
    }
  }
  return NextResponse.json({
    ok: true,
    credits: creditsDelta,
    points: pointsDelta,
    best: improved ? score : prevScore,
    improved,
    attemptsLeft: rules.attempts - used - 1,
    dailyPointsLeft: Math.max(0, capRoom - pointsDelta),
  });
}
