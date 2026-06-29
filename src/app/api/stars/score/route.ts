/**
 * STARFALL — bank a mini-game run.
 *
 *   POST /api/stars/score  { t, game, score, nonce, meta? }
 *
 * One best-of-N scored run per game per UTC day per wallet (UNIQUE on
 * launch_wars_s3_scores). Reward = Salvage (player-facing name; stored/returned internally as 'stardust') + a little Starlight,
 * computed SERVER-SIDE with per-game caps, granted atomically via s3_grant. Improving
 * your daily best pays only the delta, so the day's total never exceeds the formula on
 * the best score. Anti-cheat: a single-use nonce from /api/stars/run-start, claimed
 * here, plus a per-game minimum play time. score passes through (the cap is only an
 * anti-forge ceiling), so the games leaderboard separates skill.
 */
import { NextResponse } from "next/server";
import { starsDb, SEASON_KEY } from "@/lib/stars/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAMES: Record<
  string,
  { maxScore: number; toStardust: (s: number) => number; stardustCap: number; starlightCap: number; attempts: number; floorMs: number }
> = {
  rally: { maxScore: 30000, toStardust: (s) => Math.round(s / 50), stardustCap: 120, starlightCap: 15, attempts: 3, floorMs: 20000 },
  trench: { maxScore: 50000, toStardust: (s) => Math.round(s / 50), stardustCap: 120, starlightCap: 15, attempts: 3, floorMs: 9000 },
  slingshot: { maxScore: 20000, toStardust: (s) => Math.round(s / 30), stardustCap: 100, starlightCap: 12, attempts: 3, floorMs: 6000 },
  raid: { maxScore: 40000, toStardust: (s) => Math.round(s / 80), stardustCap: 120, starlightCap: 15, attempts: 3, floorMs: 9000 },
};
const NONCE_TTL_MS = 45 * 60 * 1000;
const dayKey = () => new Date().toISOString().slice(0, 10);
// Games are a SMALL Starlight source (~10-15% pillar); Salvage is the main reward.
const starlightFor = (stardust: number, cap: number) => Math.min(cap, Math.round(stardust * 0.2));

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
  const rules = GAMES[game];
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t) || !rules || !Number.isFinite(rawScore) || rawScore < 0) {
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
  const wallet = sess.wallet;
  const isTest = Boolean(sess.is_test);

  const score = Math.min(rawScore, rules.maxScore);
  const stardust = Math.max(0, Math.min(rules.stardustCap, rules.toStardust(score)));
  const starlight = starlightFor(stardust, rules.starlightCap);
  const day = dayKey();

  // ── Anti-cheat: claim the single-use run nonce + enforce min play time ──────
  {
    const nonce = String(body.nonce || "");
    const claim = await db
      .from("launch_wars_s3_run_nonces")
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

  const grant = (sl: number, sd: number, meta: Record<string, unknown>) =>
    db.rpc("s3_grant", {
      p_season_key: SEASON_KEY,
      p_wallet: wallet,
      p_display_name: null,
      p_starlight: sl,
      p_stardust: sd,
      p_reason: `game:${game}`,
      p_meta: meta,
      p_is_test: isTest,
    });

  // Best-of-N daily: keep the best score; improvements pay only the reward delta.
  const { data: existing } = await db
    .from("launch_wars_s3_scores")
    .select("id, score, stardust, starlight, meta")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .eq("game", game)
    .eq("day_key", day)
    .maybeSingle();

  if (!existing) {
    const { error: insErr } = await db.from("launch_wars_s3_scores").insert({
      season_key: SEASON_KEY,
      wallet,
      game,
      day_key: day,
      score,
      stardust,
      starlight,
      meta: { ...(body.meta || {}), attempts: 1 },
      is_test: isTest,
    });
    if (insErr) {
      if (/duplicate|unique/i.test(insErr.message || "")) return NextResponse.json({ ok: false, already: true });
      return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });
    }
    const { error: gErr } = await grant(starlight, stardust, { day, score });
    if (gErr) return NextResponse.json({ ok: false, error: "grant failed" }, { status: 500 });
    return NextResponse.json({ ok: true, stardust, starlight, best: score, improved: true, attemptsLeft: rules.attempts - 1 });
  }

  const used = Math.max(1, Number((existing.meta as { attempts?: number } | null)?.attempts) || 1);
  if (used >= rules.attempts) {
    return NextResponse.json({ ok: false, already: true, best: Number(existing.score) || 0, attemptsLeft: 0 });
  }

  const prevScore = Number(existing.score) || 0;
  const prevSd = Number(existing.stardust) || 0;
  const prevSl = Number(existing.starlight) || 0;
  const improved = score > prevScore;
  const sdDelta = improved ? Math.max(0, stardust - prevSd) : 0;
  const slDelta = improved ? Math.max(0, starlight - prevSl) : 0;

  const { error: updErr } = await db
    .from("launch_wars_s3_scores")
    .update({
      score: improved ? score : prevScore,
      stardust: improved ? Math.max(prevSd, stardust) : prevSd,
      starlight: improved ? Math.max(prevSl, starlight) : prevSl,
      meta: { ...((existing.meta as Record<string, unknown>) || {}), attempts: used + 1, last_score: score },
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (updErr) return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });

  if (sdDelta > 0 || slDelta > 0) {
    await grant(slDelta, sdDelta, { day, score, improvement: true });
  }
  return NextResponse.json({
    ok: true,
    stardust: sdDelta,
    starlight: slDelta,
    best: improved ? score : prevScore,
    improved,
    attemptsLeft: rules.attempts - used - 1,
  });
}
