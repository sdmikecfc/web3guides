import { NextResponse } from "next/server";
import { botsDb, failResponse, readJson } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { carryPracticeAppearance } from "@/app/bots/_server/practice-handoff";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const body = await readJson<{ appearance?: unknown }>(req);
    const session = sessionFromRequest(req);
    if (!session) return NextResponse.json({ ok: false, error: "Sign in again to open your garage." }, { status: 401 });
    return NextResponse.json({ ok: true, ...await carryPracticeAppearance(botsDb(), session.wallet, body.appearance) });
  } catch (error) { return failResponse(error); }
}
