/**
 * BATTLE BOTS READ A FIGHT. GET /api/bots/fight/[id]
 *
 * { seed, buildA, buildB, orders, mode, engineVersion, hash, winner,
 *   frames, chain, names, walletNames, createdAt, ... } (engine doc 7): the
 * client replays from the seed and compares hashes. PvE and PvP replays
 * are public (the replay link is the share link). Sparring is private:
 * only the owner, carrying the play session in the Authorization header,
 * can read one.
 */
import { NextResponse } from "next/server";
import { botsDb, failResponse, refuse } from "@/app/bots/_server/db";
import { fightView, loadBattle } from "@/app/bots/_server/fights";
import { sessionFromRequest } from "@/app/bots/_server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const db = botsDb();
    const row = await loadBattle(db, String(params.id || ""));
    if (!row) return refuse(404, "Fight not found.");
    const sess = sessionFromRequest(req, null);
    return NextResponse.json(fightView(row, sess));
  } catch (e) {
    return failResponse(e);
  }
}
