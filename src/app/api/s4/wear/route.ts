/**
 * Season 4 — set the worn look / gender for the caller's agent.
 *
 *   POST /api/s4/wear  { t, look?, gender? }  ->  ModelState (refreshed)
 *
 * The web twin of the bot's /assassin model (modules/season4 handleModel):
 * COSMETIC only, no ledger, no s4_grant. `look` is a combo key to wear (must be
 * owned) or "reset" (clear the pin, render the current build); `gender` is
 * "m"/"f" (a pure render toggle). Gated by a play-session token (game-session
 * on web, tg-session in Telegram). Same optimistic lock on updated_at as every
 * other skin write, so a concurrent shop buy can't be clobbered.
 */
import { NextResponse } from "next/server";
import { s4Db, SEASON_KEY } from "@/lib/s4/server";
import { getTheme } from "@/lib/s4/data";
import { buildModelState, walletForSession } from "@/lib/s4/me";
import { isModelKey, modelKey } from "@/lib/s4/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { t?: string; look?: string; gender?: string };
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

  const look = typeof body.look === "string" ? body.look.toLowerCase().trim() : "";
  const genderReq = typeof body.gender === "string" ? body.gender.toLowerCase().trim() : "";
  const wantGender = genderReq === "m" || genderReq === "f" ? genderReq : null;
  if (!look && !wantGender) {
    return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
  }

  const { data: player } = await db
    .from("launch_wars_s4_players")
    .select("skin, team_key, updated_at")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (!player) {
    return NextResponse.json(
      { ok: false, error: "No agent for this wallet yet. Enlist at /s4/join first." },
      { status: 404 },
    );
  }

  const baseSkin =
    player.skin && typeof player.skin === "object" && !Array.isArray(player.skin)
      ? (player.skin as Record<string, unknown>)
      : {};

  // Owned = the stored collection plus the current build (always wearable).
  const owned = new Set<string>(
    (Array.isArray(baseSkin.owned_models) ? baseSkin.owned_models.filter(isModelKey) : []) as string[],
  );
  owned.add(modelKey(baseSkin));

  const newSkin: Record<string, unknown> = { ...baseSkin };
  if (look === "reset") {
    delete newSkin.worn;
  } else if (look) {
    if (!isModelKey(look)) {
      return NextResponse.json(
        { ok: false, error: "Looks read like b2d1o3 (your three gear levels)." },
        { status: 400 },
      );
    }
    if (!owned.has(look)) {
      return NextResponse.json(
        { ok: false, error: "You have not unlocked that look yet. Raise your gear in Discord to unlock it." },
        { status: 400 },
      );
    }
    newSkin.worn = look;
  }
  if (wantGender) newSkin.gender = wantGender;

  // Optimistic lock on updated_at: a concurrent shop buy / ingest bumps it, so a
  // stale write matches zero rows and we ask the client to retry (never clobber).
  let writeQ = db
    .from("launch_wars_s4_players")
    .update({ skin: newSkin, updated_at: new Date().toISOString() })
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet);
  if (player.updated_at) writeQ = writeQ.eq("updated_at", player.updated_at);
  const { data: written, error } = await writeQ.select("skin, team_key, play_currency");
  if (error || !written || !written.length) {
    return NextResponse.json(
      { ok: false, error: "Could not update your look right now. Nothing changed, try again." },
      { status: 409 },
    );
  }

  const theme = await getTheme();
  return NextResponse.json(buildModelState(written[0], theme));
}
