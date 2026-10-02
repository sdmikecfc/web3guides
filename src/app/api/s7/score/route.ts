/**
 * Season 5, bank a mini-game run (step 3 of the anti-cheat chain).
 *
 *   POST /api/s7/score  { t, game, score, nonce, meta? }
 *
 * Port of the proven S4 route with the S7 economy simplification: a banked run
 * pays a FLAT POINTS_PER_RUN Valor (no per-game credit formulas yet), plus
 * SPRINT_RUN_BONUS_POINTS while an assault sprint is running, always bounded by
 * the COMBINED daily cap (GAME_DAILY_POINTS_CAP). Later attempts inside the
 * per-game attempts budget can still improve the day's best SCORE (the games
 * leaderboard separates skill), but Valor for the day are already banked.
 *
 * Mechanics, unchanged from S4:
 * - One best-of-N scored row per game per UTC day per wallet
 *   (UNIQUE(season_key, wallet, game, day_key) on launch_wars_s7_scores).
 * - The client score only passes through under maxScore (anti-forge ceiling).
 * - Anti-cheat: a single-use nonce from /api/s7/run-start claimed atomically,
 *   a per-game minimum play time (floorMs), a 45 min nonce TTL.
 * - Grants go through the s7_grant RPC (same contract as the proven s4_grant:
 *   p_season_key/p_wallet/p_display_name/p_points/p_play_currency/p_reason/
 *   p_meta/p_is_test; PostgREST matches named args EXACTLY).
 */
import { NextResponse } from "next/server";
import { s7Db, SEASON_KEY, scoringOpen } from "@/lib/s7/server";
import { grantClassXp } from "@/lib/s7/classes";
import {
  GAME_RULES,
  bankableRules,
  GAME_DAILY_POINTS_CAP,
  POINTS_PER_RUN,
  SHELLS_PER_RUN,
  SPRINT_RUN_BONUS_POINTS,
} from "@/lib/s7/games";
import { getSprint } from "@/lib/s7/data";

export const runtime = "nodejs";

/** Run-nonce lifetime. WAS 45 minutes, and on S6's final day that ceiling
 * ate the BEST runs: the games are endless by law (scores never cap), the
 * top runs are the longest, and every run past 45 minutes was refused at
 * submit with "run expired" (vodota34's 10005 IRON JAW among them,
 * 2026-08-31). Three hours covers any human session while the rate
 * envelope below still binds score to elapsed time at the sim's own
 * maximum rate, so a long window stays anti-forge-sound. */
const NONCE_TTL_MS = 3 * 60 * 60 * 1000;
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
  // BANKING accepts a retired key inside its grace window; STARTING one never
  // does (see run-start, which still keys off GAME_RULES alone). So a run that
  // was legally started before a slate cutover can still be banked after it,
  // and nothing new can enter the window. The retired entry carries the old
  // game's own maxScore/floorMs/attempts, so the clamp is unchanged.
  const rules = bankableRules(game);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t) || !rules || !Number.isFinite(rawScore) || rawScore < 0) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (GAME_RULES[game]?.comingSoon) {
    return NextResponse.json({ ok: false, error: "That game is not open yet." }, { status: 400 });
  }

  const db = s7Db();
  const { data: sess } = await db
    .from("launch_wars_s7_game_sessions")
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
  // Season gate: the money write. No real Valor mint while the season is not
  // live (a Medal minted during the settlement freeze would corrupt payout
  // weights). Test sessions bypass.
  if (!isTest && !(await scoringOpen(db))) {
    return NextResponse.json(
      { ok: false, error: "The season is not live right now. Practice mode is always open." },
      { status: 403 },
    );
  }

  const score = Math.min(rawScore, rules.maxScore);
  const day = dayKey();

  // ── Anti-cheat: claim the single-use run nonce + enforce min play time ──────
  {
    const nonce = String(body.nonce || "");
    const claim = await db
      .from("launch_wars_s7_run_nonces")
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
    // THE FLOOR, WITH A FAST-WIN EXEMPTION.
    //
    // floorMs blocks an instantly-replayed nonce and an AFK run that dies early
    // (the harness AFK probe shows idle runs ending at 15-31s scoring 0-84).
    // But it cannot tell those apart from a genuine fast WIN, and on launch day
    // it refused one: a player razed the Armor Clash HQ inside a minute, the
    // best result that board allows, and was told "too fast" and paid nothing.
    //
    // So a short run still banks IF it scored like real play. The bar is
    // ABSOLUTE per game (ADR-0120: a fraction of the far-off sanity clamp
    // would be meaningless): 400-500 against idle scores of ~0, so this
    // cannot launder an AFK run, while any real fast start clears it.
    const fastWinBar = rules.fastWinScore;
    const clearedFastWin = fastWinBar > 0 && score >= fastWinBar;
    if (elapsed < rules.floorMs && !clearedFastWin) {
      return NextResponse.json({ ok: false, error: "too fast" }, { status: 400 });
    }
    if (elapsed > NONCE_TTL_MS) {
      return NextResponse.json({ ok: false, error: "run expired, start again" }, { status: 400 });
    }
    // THE RATE ENVELOPE (ADR-0120): scores never cap, VALIDITY does. A legit
    // run cannot out-earn the sim's own maximum rate over its duration. Wall
    // elapsed >= sim seconds always (time only ever slows), so the bound is
    // sound for the time-scaled game too, just looser.
    const envelope = Math.round(rules.ratePerSec * (elapsed / 1000) + rules.burst);
    if (score > envelope) {
      return NextResponse.json({ ok: false, error: "impossible score for that run length" }, { status: 400 });
    }
  }

  // Valor AND Gold. Gold are deliberately NOT clamped by `capRoom`:
  // that cap bounds the season's MEDALS payout, which is prize weight and real
  // money, whereas Gold are a shop token with no payout and are already
  // bounded by the attempts budget (four games x one paying run a day). Tying
  // them to the Valor room would mean a sprint day quietly paid fewer Gold,
  // which is backwards.
  const grant = (points: number, shells: number, meta: Record<string, unknown>) =>
    db.rpc("s7_grant", {
      p_season_key: SEASON_KEY,
      p_wallet: wallet,
      p_display_name: null,
      p_points: points,
      p_play_currency: shells,
      p_reason: `game:${game}`,
      p_meta: meta,
      p_is_test: isTest,
    });

  // One read: ALL of today's banked rows for this wallet. The current game's
  // row (if any) rides along for the best-of-N logic; the sum of `points`
  // across every row enforces the COMBINED daily cap (rows store what was
  // actually banked after capping, so this sum is always truthful).
  const { data: todayRows, error: readErr } = await db
    .from("launch_wars_s7_scores")
    .select("id, game, score, points, meta")
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

  // THE GRID REACTS: a run banked while a keep is inside its assault
  // sprint is worth more. Read SERVER-SIDE off the bot's config row (the
  // client never claims it), and note that this only changes the size of ONE
  // run: `capRoom` below is still the binding ceiling, so the day total can
  // never pass GAME_DAILY_POINTS_CAP. The sprint shifts WHEN players play, it
  // does not raise what the season pays out.
  const sprint = await getSprint();
  // THE ARCADE PAYS MEDALS ONCE A DAY (2026-08-03 economy redesign). Score
  // scaling is gone and so is the per-game payout: the FIRST scored run of the
  // day pays a flat 10 (15 in a sprint) and every later run of any game pays
  // Gold, a score-board standing and raid damage, but no Valor.
  //
  // Why: the flat-40 law. Arcade 10 + raid 20 + post 10 = 40 exactly, which
  // sits below the 50 a day a $5 hold pays, so holding leads at every tier
  // BY CONSTRUCTION and no shared counter is needed to enforce it. The old
  // model let a good player out-earn a holder through the arcade, which is
  // S3's lesson #11 (the inversion that rewards not bonding).
  const base = POINTS_PER_RUN + (sprint.active ? SPRINT_RUN_BONUS_POINTS : 0);
  const paidSignalToday = rows.some((r) => (Number(r.points) || 0) > 0);
  const runPoints = paidSignalToday ? 0 : base;

  if (!existing) {
    const points = Math.min(runPoints, capRoom);
    const { error: insErr } = await db.from("launch_wars_s7_scores").insert({
      season_key: SEASON_KEY,
      wallet,
      game,
      day_key: day,
      score,
      points,
      meta: { ...(body.meta || {}), attempts: 1, sprint: sprint.active || undefined },
      is_test: isTest,
    });
    if (insErr) {
      if (/duplicate|unique/i.test(insErr.message || "")) return NextResponse.json({ ok: false, already: true });
      return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });
    }
    // A run that banks pays Gold even once the Valor cap is full: the
    // fourth run of the day is still a run, and a player who has capped is
    // exactly the player we want to keep playing.
    if (points > 0 || SHELLS_PER_RUN > 0) {
      const { error: gErr } = await grant(points, SHELLS_PER_RUN, {
        day,
        score,
        shells: SHELLS_PER_RUN,
        sprint: sprint.active || undefined,
      });
      if (gErr) return NextResponse.json({ ok: false, error: "grant failed" }, { status: 500 });
    }
    // CLASS XP (ADR-0129: "game runs grant XP to the class you played them
    // as"). Pays on the SAME dedupe as everything else here - one banked
    // FIRST run per game per day (the nonce + the insert path we are inside)
    // - so it cannot be farmed past the daily attempt structure. score/5
    // capped at 400: a typical 500-1500 run pays 100-300 xp, landing level 3
    // inside a first session against the 50*n*(n-1) curve. XP is play-side
    // progression only; Valor and Gold above are untouched, cash never.
    let classXp = 0;
    let leveled = false;
    let classLevel: number | undefined;
    try {
      // THE DAILY CLASS QUEST (ADR-0129: "plus ONE daily class quest"). The
      // first banked run of the UTC day pays a flat quest bonus on top of the
      // run's own XP. Dedupe is structural: `rows` is today's score rows for
      // this wallet, so empty rows == first bank of the day; the nonce chain
      // already guarantees this insert path runs once per banked run.
      const QUEST_XP = 150;
      const questBonus = rows.length === 0 ? QUEST_XP : 0;
      const xp = Math.min(400, Math.floor(score / 5)) + questBonus;
      const res = xp > 0 && !isTest ? await grantClassXp(db, wallet, xp) : null;
      if (res) {
        classXp = xp;
        leveled = res.leveled;
        classLevel = res.track.level;
      }
    } catch {
      /* class grant is progression, not money: a failure never voids the banked run */
    }
    return NextResponse.json({
      classXp,
      leveled,
      // The active class's level AFTER this bank (undefined when no XP was
      // granted, so the field simply drops out of the JSON): the client shows
      // "LEVEL UP" from `leveled` + this number. Additive, optional field.
      classLevel,
      ok: true,
      points,
      shells: SHELLS_PER_RUN,
      best: score,
      improved: true,
      attemptsLeft: rules.attempts - 1,
      // ARCADE room, not the 40/day all-activity ceiling. Once a paying run
      // is banked, runPoints is 0 for the rest of the day (see paidSignalToday
      // above), so anything but 0 here tells the player to grind for Valor
      // that cannot arrive. capRoom stays the upper bound for the edge case
      // where the day's other sources have already eaten the ceiling.
      dailyPointsLeft: Math.min(capRoom, points > 0 ? 0 : Math.max(0, runPoints - points)),
      sprint: sprint.active,
      sprintBonus: sprint.active ? SPRINT_RUN_BONUS_POINTS : 0,
    });
  }

  const used = Math.max(1, Number((existing.meta as { attempts?: number } | null)?.attempts) || 1);
  if (used >= rules.attempts) {
    // PRACTICE LEDGER (Mike 2026-08-13, S7 parity): past-budget runs pay
    // nothing and never touch `score` (bot sweep/duels read it); the day's
    // practice best rides meta for the board. Same nonce/clamp path.
    const pMeta = (existing.meta as Record<string, unknown>) || {};
    const prevPractice = Number((pMeta as { practice_best?: number }).practice_best) || 0;
    if (score > prevPractice) {
      await db
        .from("launch_wars_s7_scores")
        .update({
          meta: { ...pMeta, practice_best: score },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
    return NextResponse.json({
      ok: false,
      already: true,
      best: Number(existing.score) || 0,
      attemptsLeft: 0,
      practiceBest: Math.max(prevPractice, score),
    });
  }

  const prevScore = Number(existing.score) || 0;
  const improved = score > prevScore;

  // Valor for this game today are already banked (flat POINTS_PER_RUN); an
  // improvement only raises the day's best SCORE for the games leaderboard.
  const { error: updErr } = await db
    .from("launch_wars_s7_scores")
    .update({
      score: improved ? score : prevScore,
      meta: { ...((existing.meta as Record<string, unknown>) || {}), attempts: used + 1, last_score: score },
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (updErr) return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });

  return NextResponse.json({
    ok: true,
    points: 0,
    best: improved ? score : prevScore,
    improved,
    attemptsLeft: rules.attempts - used - 1,
    // Already banked today: the arcade has nothing left to pay this player,
    // whatever room the 40/day ceiling still has.
    dailyPointsLeft: 0,
    sprint: sprint.active,
    sprintBonus: 0, // this game's Valor for today are already banked
  });
}
