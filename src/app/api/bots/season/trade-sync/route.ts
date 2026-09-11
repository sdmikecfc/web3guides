import { NextResponse } from "next/server";
import { botsDb, readJson } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { SeasonError, seasonErrorResponse, requireSeason, checkSeasonTradeBonus, parseSeasonEnroll } from "@/app/bots/_server/season";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    requireSeason(); const body = await readJson<unknown>(req), auth = sessionFromRequest(req, body as { t?: string });
    if (!auth) throw new SeasonError(401, "SIGN_IN", "Connect your wallet to open this season.");
    const input = parseSeasonEnroll(body);
    return NextResponse.json(await checkSeasonTradeBonus(botsDb(), auth.wallet, input));
  } catch (error) { return seasonErrorResponse(error); }
}
