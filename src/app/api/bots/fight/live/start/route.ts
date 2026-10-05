import { NextResponse } from "next/server";
import { botsDb, failResponse, readJson, refuse } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { startLiveHouse, parseLiveStartInput, type StartLiveHouseInput } from "@/app/bots/_server/live-house";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const body = await readJson<StartLiveHouseInput & { t?: string }>(req);
    const session = sessionFromRequest(req, body);
    if (!session) return refuse(401, "Sign in again to enter the arena.");
    const input = parseLiveStartInput(body);
    return NextResponse.json(await startLiveHouse(botsDb(), session.wallet, input));
  } catch (error) { return failResponse(error); }
}
