/**
 * LAUNCH WARS ARCADE, open a scored run (step 2: the nonce).
 *
 *   POST /api/arcade/run-start  { t, game }  -> { ok, nonce }
 *
 * Port of /api/s7/run-start minus everything a season adds: no season gate, no
 * players row, no stats, no class loadout. Every arcade run plays the stock
 * build (the season shells treat missing stats/loadout as "stock", and the S7
 * sims fall back to their level 1 default), so the boards are fair by
 * construction. Rate limit: 12 nonces per minute per wallet.
 */
import { NextResponse } from "next/server";
import { arcadeDb, arcadeOpen, ARCADE_SEASON_KEY, T_NONCES, T_SESSIONS } from "@/lib/arcade/server";
import { ARCADE_RULES } from "@/lib/arcade/games";

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
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t) || !ARCADE_RULES[game]) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const db = arcadeDb();
  // season_key is part of the lookup: a season token is not an arcade token.
  const { data: sess } = await db
    .from(T_SESSIONS)
    .select("wallet, is_test, expires_at")
    .eq("season_key", ARCADE_SEASON_KEY)
    .eq("token", t)
    .maybeSingle();
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "session expired: sign in to play again" }, { status: 401 });
  }
  if (!(await arcadeOpen(db))) {
    return NextResponse.json(
      { ok: false, error: "The arcade is closed right now. Practice mode is always open." },
      { status: 403 },
    );
  }

  const sinceIso = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db
    .from(T_NONCES)
    .select("nonce", { count: "exact", head: true })
    .eq("season_key", ARCADE_SEASON_KEY)
    .eq("wallet", sess.wallet)
    .gte("issued_at", sinceIso);
  if ((count || 0) >= RATE_LIMIT_PER_MIN) {
    return NextResponse.json({ ok: false, error: "too many runs, slow down" }, { status: 429 });
  }

  const nonce = (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  ).replace(/[^A-Za-z0-9_-]/g, "");
  const { error } = await db.from(T_NONCES).insert({
    season_key: ARCADE_SEASON_KEY,
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
