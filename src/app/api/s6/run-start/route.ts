/**
 * Season 5, open a scored run (step 2 of the anti-cheat chain: the nonce).
 *
 *   POST /api/s6/run-start  { t, game }  -> { ok, nonce, stats }
 *
 * Port of the proven S4 route. The game page trades the play-session token
 * for a single-use NONCE tied to the wallet and the game. /api/s6/score
 * requires that nonce back, claims it atomically, and rejects runs faster
 * than the game's floor. Rate limit: 12 nonces/min/wallet. Game keys come
 * from the ONE shared registry (lib/s6/games).
 *
 * The response carries the player's persistent character stats (hq JSONB,
 * top-level { botox, drugs, ozempic, aura }: Armor/Engine/Smoke/Caliber) so a
 * game can apply its BOUNDED baseline. Stats never raise any server cap.
 */
import { NextResponse } from "next/server";
import { s6Db, SEASON_KEY, scoringOpen } from "@/lib/s6/server";
import { GAME_RULES, clampStats } from "@/lib/s6/games";
import { hullForTier, resolveTank } from "@/lib/s6/model";

export const runtime = "nodejs";

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

  const db = s6Db();
  const { data: sess } = await db
    .from("launch_wars_s6_game_sessions")
    .select("wallet, is_test, expires_at")
    .eq("token", t)
    .maybeSingle();
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "session expired: sign in to play again" },
      { status: 401 },
    );
  }
  // Season gate: no real scored runs while the season is not live. Test
  // sessions bypass for rehearsal.
  if (!sess.is_test && !(await scoringOpen(db))) {
    return NextResponse.json(
      { ok: false, error: "The season is not live right now. Practice mode is always open." },
      { status: 403 },
    );
  }

  const sinceIso = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db
    .from("launch_wars_s6_run_nonces")
    .select("nonce", { count: "exact", head: true })
    .eq("wallet", sess.wallet)
    .gte("issued_at", sinceIso);
  if ((count || 0) >= RATE_LIMIT_PER_MIN) {
    return NextResponse.json({ ok: false, error: "too many runs, slow down" }, { status: 429 });
  }

  // The player's persistent stats ride along with the nonce (0s for a wallet
  // with no player row yet).
  //
  // ⚠️ STATS LIVE IN `skin`, NOT `hq`. This selected only `hq` and clamped from
  // it, which silently yields ZERO for every stat -- so every scored run in the
  // season was played on a stock tank and every upgrade bought in the Discord
  // shop did nothing in the games it was sold for. The HQ read correctly the
  // whole time (api/s6/me reads `skin`, lib/s6/roster reads `skin`, and S4's
  // own run-start reads `skin`), which is exactly why nobody caught it: the
  // levels displayed fine and only the gameplay ignored them.
  //
  // Both columns are needed: `skin` carries the stat levels, `hq` carries the
  // cosmetic tank selection below.
  const { data: player } = await db
    .from("launch_wars_s6_players")
    .select("hq, skin")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", sess.wallet)
    .maybeSingle();
  const stats = clampStats(player?.skin);
  // The fielded tank rides along COSMETIC-ONLY (ADR-0075): resolved server-side
  // from the same hq row so games can print the real tank name and pick the
  // hull-class sprite. Sims never receive it; it cannot touch scoring.
  const tankSel = resolveTank(player?.hq);
  const tank = {
    key: tankSel.tankKey,
    name: tankSel.tankName,
    // RunTank.hullClass is the CLASS KEY string ("scout".."superheavy")
    hullClass: hullForTier(tankSel.tier).key,
  };

  const nonce = (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  ).replace(/[^A-Za-z0-9_-]/g, "");
  const { error } = await db.from("launch_wars_s6_run_nonces").insert({
    season_key: SEASON_KEY,
    nonce,
    wallet: sess.wallet,
    game,
    is_test: Boolean(sess.is_test),
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "could not open run" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, nonce, stats, tank });
}
