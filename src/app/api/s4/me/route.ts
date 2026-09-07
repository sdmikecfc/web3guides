/**
 * Season 4 — the player's own agent state for the character picker.
 *
 *   POST /api/s4/me  { t }  ->  ModelState  (see lib/s4/me)
 *
 * Gated by a play-session token (the games open it via /api/s4/game-session;
 * Telegram mints it via /api/s4/tg-session). POST, not GET, so the secret token
 * never lands in a URL/query log. Returns the caller's OWN model state only:
 * current build, owned looks (with art), gender, gear levels, and the "next
 * unlocks" preview. Never returns the wallet or any dollar figure.
 */
import { NextResponse } from "next/server";
import { s4Db, SEASON_KEY } from "@/lib/s4/server";
import { getTheme } from "@/lib/s4/data";
import { buildModelState, walletForSession } from "@/lib/s4/me";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { t?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const db = s4Db();
  const wallet = await walletForSession(db, body.t);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });
  }

  const { data: player } = await db
    .from("launch_wars_s4_players")
    .select("skin, team_key, play_currency")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();

  const theme = await getTheme();
  return NextResponse.json(buildModelState(player ?? null, theme));
}
