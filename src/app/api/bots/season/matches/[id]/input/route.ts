import { NextResponse } from "next/server";
import { botsDb, readJson } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { SeasonError, seasonErrorResponse, requireSeason, resumeSeasonMatch, parseSeasonInput } from "@/app/bots/_server/season";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSeason();
    const body = await readJson<unknown>(req);
    const auth = sessionFromRequest(req, body as { t?: string });
    if (!auth) throw new SeasonError(401, "SIGN_IN", "Connect your wallet to open this season.");
    const input = parseSeasonInput(body);
    const { id } = await context.params;
    return NextResponse.json(await resumeSeasonMatch(botsDb(), auth.wallet, id, input));
  } catch (error) { return seasonErrorResponse(error); }
}
