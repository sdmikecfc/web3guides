/**
 * Conquer the Seas — bank a duty run.
 *
 *   POST /api/seas/score   { t, game, score, nonce?, meta? }
 *
 * One SCORED run per game per UTC DAY per captain (enforced by the UNIQUE
 * constraint on launch_wars_s2_duty_runs); later runs (up to the per-game
 * attempts cap) keep the BEST and pay only the doubloon delta. Doubloons are
 * computed SERVER-SIDE from the score with per-game caps, then granted
 * atomically through the s2_grant SQL function.
 *
 * Anti-cheat: every scored run must carry a single-use NONCE from
 * /api/seas/run-start, claimed atomically here, and must arrive no faster than
 * the game's minimum play time. This closes the "curl the max score with only a
 * token" hole. If migration 023 is not run, the nonce table is absent and we
 * fall back to the old token-only behavior (so a missing migration never breaks
 * the games).
 *
 * Daily windows: caps reset once per UTC day (not per 12h tide), so the daily
 * ceiling is the same for every captain regardless of longitude. (A full
 * per-captain rolling 24h window is a later refinement.)
 */

import { NextResponse } from "next/server";
import { launchWarsDb } from "@/lib/launch-wars/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEASON_KEY = "s2";
const GLORY_PER_DUTY = 5;

// Per game: a REWARD cap (doubloons, via `cap`) that is separate from `maxScore`.
// maxScore is NOT a gameplay cap — it is only a high anti-forge ceiling so a
// garbage submission can't store an absurd number. The real score passes through
// so DUELS and the leaderboard separate skill (Mike: "don't cap the score if we
// have duels, just cap the rewards"). Doubloons still max at `cap` no matter how
// high the score climbs (e.g. gunnery hits the 80 cap by a score of 800). Game
// scores never touch the cash prize (duty Glory is a flat +5). TUNABLE.
// attempts = banked tries per UTC day, BEST score keeps the payout. floorMs = the
// fastest a real run can finish; faster than this is rejected as forged.
const GAMES: Record<
  string,
  {
    maxScore: number;
    toDoubloons: (score: number) => number;
    cap: number;
    attempts: number;
    floorMs: number;
  }
> = {
  "channel-run": { maxScore: 20000, toDoubloons: (s) => Math.round(s / 100), cap: 120, attempts: 4, floorMs: 12000 },
  gunnery: { maxScore: 20000, toDoubloons: (s) => Math.round(s / 10), cap: 80, attempts: 3, floorMs: 12000 }, // was 1500: that capped DUEL scores into ties. Reward still caps at 80 doubloons (score 800).
  "powder-hold": { maxScore: 30000, toDoubloons: (s) => Math.round(s / 150), cap: 100, attempts: 3, floorMs: 10000 },
  heading: { maxScore: 100, toDoubloons: (s) => Math.round(s * 0.8), cap: 80, attempts: 1, floorMs: 4000 },
  lookout: { maxScore: 1, toDoubloons: () => 40, cap: 40, attempts: 1, floorMs: 2500 },
};

// A claimed nonce older than this is stale; the captain must open a fresh run.
const NONCE_TTL_MS = 45 * 60 * 1000;

// Caps reset once per UTC day for every game (no 12h tide split), so the daily
// ceiling does not depend on the player's longitude.
function periodKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Postgres / PostgREST "table does not exist" => migration 023 not run yet.
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "");
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(msg);
}

// ── The Lookout: daily spawn, derived from the day seed on BOTH sides ───────
// (identical algorithm in the map page; the claim must land near the real
// spot, so replaying the API blind earns nothing).
function seededRng(seedText: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function lookoutSpawn(day: string): { x: number; y: number } {
  const r = seededRng(`${day}:lookout`);
  return { x: 0.08 + r() * 0.84, y: 0.08 + r() * 0.84 };
}
const LOOKOUT_TOLERANCE = 0.04;

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

  if (!/^[A-Za-z0-9_-]{8,64}$/.test(t) || !rules || !Number.isFinite(rawScore) || rawScore < 0) {
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

  // The score passes through (maxScore is only the high anti-forge ceiling), so
  // duels + the leaderboard separate skill. The REWARD is what's capped: doubloons
  // never exceed rules.cap no matter how high the score climbs.
  const score = Math.min(rawScore, rules.maxScore);
  const doubloons = Math.max(0, Math.min(rules.cap, rules.toDoubloons(score)));
  const dayKey = periodKey();

  // ── Anti-cheat: claim the single-use run nonce + enforce min play time ────
  // The nonce is issued by /api/seas/run-start when the game page opens. We
  // claim it atomically (used_at), so it works exactly once, and reject a run
  // that arrives faster than the game can really be played. If the nonce table
  // is absent (migration 023 not run), we fall back to token-only behavior so
  // the games never break on a missing migration.
  {
    const nonce = String(body.nonce || "");
    const claim = await db
      .from("launch_wars_s2_run_nonces")
      .update({ used_at: new Date().toISOString() })
      .eq("nonce", nonce)
      .eq("discord_id", tok.discord_id)
      .eq("game", game)
      .is("used_at", null)
      .select("issued_at")
      .maybeSingle();
    if (claim.error && isMissingTable(claim.error)) {
      // degrade gracefully: no nonce table yet, keep token-only behavior
    } else if (claim.error) {
      return NextResponse.json({ ok: false, error: "run check failed" }, { status: 500 });
    } else if (!claim.data) {
      return NextResponse.json({ ok: false, error: "open a fresh run" }, { status: 401 });
    } else {
      const elapsed = Date.now() - new Date(claim.data.issued_at).getTime();
      if (elapsed < rules.floorMs) {
        return NextResponse.json({ ok: false, error: "too fast" }, { status: 400 });
      }
      if (elapsed > NONCE_TTL_MS) {
        return NextResponse.json({ ok: false, error: "run expired, start again" }, { status: 400 });
      }
    }
  }

  // Lookout claims must land near today's real spawn point.
  if (game === "lookout") {
    const spawn = lookoutSpawn(dayKey);
    const mx = Number((body.meta as { x?: number } | undefined)?.x);
    const my = Number((body.meta as { y?: number } | undefined)?.y);
    if (
      !Number.isFinite(mx) ||
      !Number.isFinite(my) ||
      Math.abs(mx - spawn.x) > LOOKOUT_TOLERANCE ||
      Math.abs(my - spawn.y) > LOOKOUT_TOLERANCE
    ) {
      return NextResponse.json({ ok: false, error: "not the right spot" }, { status: 400 });
    }
  }

  const seasonKey = tok.season_key || SEASON_KEY;
  const grant = async (dbl: number, glory: number, meta: Record<string, unknown>) =>
    db.rpc("s2_grant", {
      p_season_key: seasonKey,
      p_discord_id: tok.discord_id,
      p_display_name: null,
      p_doubloons: dbl,
      p_glory: glory,
      p_reason: `duty:${game}`,
      p_meta: meta,
      p_is_test: Boolean(tok.is_test),
    });

  // Best-of-N banking: the period row keeps the BEST score; improvements pay
  // only the doubloon DIFFERENCE (total payout per period never exceeds the
  // single-run formula on the best score). Glory pays once per period.
  const { data: existing } = await db
    .from("launch_wars_s2_duty_runs")
    .select("id, score, doubloons, meta")
    .eq("season_key", seasonKey)
    .eq("discord_id", tok.discord_id)
    .eq("game", game)
    .eq("day_key", dayKey)
    .maybeSingle();

  if (!existing) {
    const { error: insErr } = await db.from("launch_wars_s2_duty_runs").insert({
      season_key: seasonKey,
      discord_id: tok.discord_id,
      game,
      day_key: dayKey,
      score,
      doubloons,
      glory: GLORY_PER_DUTY,
      meta: { ...(body.meta || {}), banked_via: "web", attempts: 1 },
      is_test: Boolean(tok.is_test),
    });
    if (insErr) {
      // A racing first-bank hit the unique index; count this one as practice.
      const dup = /duplicate|unique/i.test(insErr.message || "");
      if (dup) return NextResponse.json({ ok: false, already: true });
      return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });
    }
    const { error: grantErr } = await grant(doubloons, GLORY_PER_DUTY, { day_key: dayKey, score });
    if (grantErr) {
      return NextResponse.json({ ok: false, error: "grant failed" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      doubloons,
      glory: GLORY_PER_DUTY,
      best: score,
      improved: true,
      attemptsLeft: rules.attempts - 1,
    });
  }

  const used = Math.max(1, Number((existing.meta as { attempts?: number } | null)?.attempts) || 1);
  if (used >= rules.attempts) {
    return NextResponse.json({ ok: false, already: true, best: Number(existing.score) || 0, attemptsLeft: 0 });
  }

  const prevScore = Number(existing.score) || 0;
  const prevDbl = Number(existing.doubloons) || 0;
  const improved = score > prevScore;
  const delta = improved ? Math.max(0, doubloons - prevDbl) : 0;

  const { error: updErr } = await db
    .from("launch_wars_s2_duty_runs")
    .update({
      score: improved ? score : prevScore,
      doubloons: improved ? Math.max(prevDbl, doubloons) : prevDbl,
      meta: { ...((existing.meta as Record<string, unknown>) || {}), attempts: used + 1, last_score: score },
    })
    .eq("id", existing.id);
  if (updErr) {
    return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });
  }
  if (delta > 0) {
    await grant(delta, 0, { day_key: dayKey, score, improvement: true });
  }

  return NextResponse.json({
    ok: true,
    doubloons: delta,
    glory: 0,
    best: improved ? score : prevScore,
    improved,
    attemptsLeft: rules.attempts - used - 1,
  });
}
