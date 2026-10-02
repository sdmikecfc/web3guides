import { NextResponse } from "next/server";
import { botsDb, failResponse, readJson, refuse } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { resumeLiveHouse, parseLiveInput } from "@/app/bots/_server/live-house";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await readJson<{ t?: string; inputId?: unknown; kind?: unknown }>(req);
    const session = sessionFromRequest(req, body);
    if (!session) return refuse(401, "Sign in again to use your special.");
    const input = parseLiveInput(body);
    return NextResponse.json(await resumeLiveHouse(botsDb(), session.wallet, params.id, input));
  } catch (error) { return failResponse(error); }
}
