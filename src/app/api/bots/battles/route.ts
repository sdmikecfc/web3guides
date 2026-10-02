/**
 * BATTLE BOTS BATTLES PAGE DATA. GET /api/bots/battles[?bot=<id>]
 *
 * The shelves (screens doc 4.1): the caller's bots and the PvE ladder for
 * the selected one, the PvP defenders with plain-words multipliers, Live
 * (last 90 s), Featured today and Recent (last 50 public). Works signed
 * out (the watch column needs no wallet); the Authorization header adds
 * the fight column. Shapes in _server/types.ts BattlesView.
 */
import { NextResponse } from "next/server";
import { battlesView } from "@/app/bots/_server/battles";
import { botsDb, failResponse } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const botRaw = url.searchParams.get("bot");
    const wantBot = botRaw && /^\d{1,12}$/.test(botRaw) ? Number(botRaw) : null;
    const sess = sessionFromRequest(req, null);
    const db = botsDb();
    return NextResponse.json(await battlesView(db, sess, wantBot));
  } catch (e) {
    return failResponse(e);
  }
}
