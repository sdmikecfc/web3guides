/**
 * LAUNCH WARS ARCADE, bank a score (step 3 of the anti-forge chain).
 *
 *   POST /api/arcade/score  { t, game, score, nonce, meta? }
 *     -> { ok, best, improved }
 *
 * The VALIDITY chain is the seasons' own, in the seasons' own order: clamp to
 * the game's maxScore, claim the single-use nonce atomically, enforce the
 * floor (with that game's fast-win bar), the 3h run window, and the rate
 * envelope where the game has one. Rules come from lib/arcade/games, which
 * IMPORTS each season's registry, so a number can never drift from its owner.
 *
 * What is deliberately gone: the season gate, the grant RPC, points, play
 * currency, class XP, the daily quest, sprints, and the attempts budget. Runs
 * are unlimited; the table's unique key (season_key, wallet, game, day_key)
 * keeps one best-of-day row, and the board reads the best row per wallet.
 *
 * The response carries NO `points`, `shells` or `attemptsLeft`: the season
 * shells print those lines only when the field is present.
 */
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  arcadeDb,
  arcadeOpen,
  ARCADE_SEASON_KEY,
  BOARDS_TAG,
  T_NONCES,
  T_SCORES,
  T_SESSIONS,
} from "@/lib/arcade/server";
import { ARCADE_RULES } from "@/lib/arcade/games";

export const runtime = "nodejs";

/** Same window the seasons settled on after the S6 final-day incident: a long
 * run (or a phone that slept mid-run) must still bank. The envelope scales
 * with elapsed time, so a long window stays anti-forge-sound. */
const NONCE_TTL_MS = 3 * 60 * 60 * 1000;
const META_MAX_BYTES = 2048;
const dayKey = () => new Date().toISOString().slice(0, 10);

/** Client meta is decoration (share-card details). Keep it only when small. */
function boundedMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  try {
    return JSON.stringify(raw).length <= META_MAX_BYTES ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  let body: { t?: string; game?: string; score?: number; nonce?: string; meta?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const t = String(body.t || "");
  const game = String(body.game || "");
  const rawScore = Number(body.score);
  const entry = ARCADE_RULES[game];
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t) || !entry || !Number.isFinite(rawScore) || rawScore < 0) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const rules = entry.rules;

  const db = arcadeDb();
  const { data: sess } = await db
    .from(T_SESSIONS)
    .select("wallet, is_test, expires_at")
    .eq("season_key", ARCADE_SEASON_KEY)
    .eq("token", t)
    .maybeSingle();
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "session expired: sign in to play again" }, { status: 401 });
  }
  const wallet = String(sess.wallet).toLowerCase();
  const isTest = Boolean(sess.is_test);
  if (!(await arcadeOpen(db))) {
    return NextResponse.json(
      { ok: false, error: "The arcade is closed right now. Practice mode is always open." },
      { status: 403 },
    );
  }

  const score = Math.round(Math.min(rawScore, rules.maxScore));
  const day = dayKey();

  // ── Anti-forge: claim the single-use nonce, then floor / window / envelope ──
  {
    const nonce = String(body.nonce || "");
    const claim = await db
      .from(T_NONCES)
      .update({ used_at: new Date().toISOString() })
      .eq("season_key", ARCADE_SEASON_KEY) // an arcade run banks only on an arcade nonce
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
    const clearedFastWin = rules.fastWinScore > 0 && score >= rules.fastWinScore;
    if (elapsed < rules.floorMs && !clearedFastWin) {
      return NextResponse.json({ ok: false, error: "too fast" }, { status: 400 });
    }
    if (elapsed > NONCE_TTL_MS) {
      return NextResponse.json({ ok: false, error: "run expired, start again" }, { status: 400 });
    }
    if (rules.ratePerSec !== null) {
      const envelope = Math.round(rules.ratePerSec * (elapsed / 1000) + rules.burst);
      if (score > envelope) {
        return NextResponse.json({ ok: false, error: "impossible score for that run length" }, { status: 400 });
      }
    }
  }

  // ── Best of day, one row ─────────────────────────────────────────────────────
  const readRow = () =>
    db
      .from(T_SCORES)
      .select("id, score, meta")
      .eq("season_key", ARCADE_SEASON_KEY)
      .eq("wallet", wallet)
      .eq("game", game)
      .eq("day_key", day)
      .maybeSingle();

  const first = await readRow();
  if (first.error) {
    return NextResponse.json({ ok: false, error: "could not save the score" }, { status: 500 });
  }
  let existing = first.data;

  if (!existing) {
    const ins = await db.from(T_SCORES).insert({
      season_key: ARCADE_SEASON_KEY,
      wallet,
      game,
      day_key: day,
      score,
      points: 0,
      play_currency: 0,
      meta: { ...boundedMeta(body.meta), season: entry.season, runs: 1, last_score: score },
      is_test: isTest,
    });
    if (!ins.error) {
      if (!isTest && score > 0) revalidateTag(BOARDS_TAG);
      return NextResponse.json({ ok: true, best: score, improved: true });
    }
    // Two tabs banking the same first run of the day: the unique key refused
    // this insert, so the row exists now. Fall through to the update path.
    const again = await readRow();
    existing = again.data;
    if (!existing) {
      return NextResponse.json({ ok: false, error: "could not save the score" }, { status: 500 });
    }
  }

  const prevScore = Math.round(Number(existing.score) || 0);
  const improved = score > prevScore;
  const prevMeta = (existing.meta && typeof existing.meta === "object" ? existing.meta : {}) as Record<string, unknown>;
  const runs = (Number(prevMeta.runs) || 1) + 1;
  const upd = await db
    .from(T_SCORES)
    .update({
      score: improved ? score : prevScore,
      meta: improved
        ? { ...boundedMeta(body.meta), season: entry.season, runs, last_score: score }
        : { ...prevMeta, runs, last_score: score },
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (upd.error) {
    return NextResponse.json({ ok: false, error: "could not save the score" }, { status: 500 });
  }
  if (improved && !isTest) revalidateTag(BOARDS_TAG);
  return NextResponse.json({ ok: true, best: improved ? score : prevScore, improved });
}
