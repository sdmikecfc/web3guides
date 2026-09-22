/**
 * BATTLE BOTS MORNING PAPER. GET /api/bots/paper (Authorization: Bearer <t>)
 *
 * The digest since the player last read it (defences, results, repairs
 * finished, today's shelf) in plain words, and the read mark for today
 * (_server/paper.ts). Session required: the paper is about YOUR bots.
 */
import { NextResponse } from "next/server";
import { botsDb, failResponse } from "@/app/bots/_server/db";
import { paperView } from "@/app/bots/_server/paper";
import { sessionFromRequest } from "@/app/bots/_server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sess = sessionFromRequest(req, null);
    if (!sess) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });
    const db = botsDb();
    return NextResponse.json(await paperView(db, sess));
  } catch (e) {
    return failResponse(e);
  }
}
