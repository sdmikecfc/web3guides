import { NextResponse } from "next/server";
import { botsDb, failResponse, refuse } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { resumeLiveHouse } from "@/app/bots/_server/live-house";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = sessionFromRequest(req, null);
    if (!session) return refuse(401, "Sign in again to open this fight.");
    return NextResponse.json(await resumeLiveHouse(botsDb(), session.wallet, params.id), { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) { return failResponse(error); }
}
