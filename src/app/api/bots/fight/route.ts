/**
 * BATTLE BOTS START A FIGHT. POST /api/bots/fight
 *   { t, botId, mode: "spar" | "pve" | "pvp", difficulty?, defenderBotId?,
 *     stake?, orders? }  ->  { ok, fightId }
 *
 * The whole fight law lives in src/app/bots/_server/fights.ts startFight:
 * both builds from the database, seed = fnv1a(fightId + "|" + FIGHT_SALT),
 * resolveFight once, the row, then rewards, stakes, drops, repair, the
 * attack counter and the first-win card in one pass. The response is the
 * fight id only; the replay page fetches the rest.
 */
import { NextResponse } from "next/server";
import { botsDb, failResponse, readJson, requestDay } from "@/app/bots/_server/db";
import { startFight, type StartFightInput } from "@/app/bots/_server/fights";
import { sessionFromRequest } from "@/app/bots/_server/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ t?: string } & StartFightInput>(req);
    const sess = sessionFromRequest(req, body);
    if (!sess) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });
    const db = botsDb();
    // the day key: the clock's, or the dev-only x-bots-day header (db.ts)
    const { fightId } = await startFight(db, sess, body, requestDay(req));
    return NextResponse.json({ ok: true, fightId });
  } catch (e) {
    return failResponse(e);
  }
}
