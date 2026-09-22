import { NextResponse } from "next/server";
import { botsDb, readJson } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { SeasonError, seasonErrorResponse, requireSeason, buildArchiveRobot, parseArchiveBuild } from "@/app/bots/_server/season";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request, context: { params: Promise<{ seasonId: string }> }) {
  try {
    requireSeason(); const body = await readJson<unknown>(req), auth = sessionFromRequest(req, body as { t?: string });
    if (!auth) throw new SeasonError(401, "SIGN_IN", "Connect your wallet to open your collection.");
    const input = parseArchiveBuild(body), { seasonId } = await context.params;
    return NextResponse.json(await buildArchiveRobot(botsDb(), auth.wallet, seasonId, input));
  } catch (error) { return seasonErrorResponse(error); }
}
