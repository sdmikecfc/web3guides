import { NextResponse } from "next/server";
import { botsDb, readJson } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { SeasonError, seasonErrorResponse, requireSeason, finishSeasonBot, parseSeasonFinish } from "@/app/bots/_server/season";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    requireSeason();
    const body = await readJson<unknown>(req);
    const auth = sessionFromRequest(req, body as { t?: string });
    if (!auth) throw new SeasonError(401, "SIGN_IN", "Connect your wallet to open this season.");
    const input = parseSeasonFinish(body);

    return NextResponse.json(await finishSeasonBot(botsDb(), auth.wallet, input));
  } catch (error) { return seasonErrorResponse(error); }
}
