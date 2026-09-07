import { NextResponse } from "next/server";
import { botsDb, failResponse, readJson, requestDay, refuse } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { mutateOnboarding, onboardingView } from "@/app/bots/_server/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const session = sessionFromRequest(req, null);
    if (!session) return refuse(401, "Sign in again to open your garage.");
    return NextResponse.json({ ok: true, onboarding: await onboardingView(botsDb(), session.wallet) });
  } catch (e) { return failResponse(e); }
}
export async function POST(req: Request) {
  try {
    const body = await readJson<{ t?: string; action?: unknown; socket?: unknown; offerId?: unknown }>(req);
    const session = sessionFromRequest(req, body);
    if (!session) return refuse(401, "Sign in again to open your garage.");
    return NextResponse.json(await mutateOnboarding(botsDb(), session.wallet, body, requestDay(req)));
  } catch (e) { return failResponse(e); }
}
