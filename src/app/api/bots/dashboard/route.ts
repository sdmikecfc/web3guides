import { NextResponse } from "next/server";
import { botsDb, failResponse, readJson } from "@/app/bots/_server/db";
import { loadDashboard } from "@/app/bots/_server/dashboard";
import { sessionFromRequest } from "@/app/bots/_server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization, X-Bots-Session" };
async function dashboard(req: Request, body: { t?: unknown } | null) {
  try {
    const session = sessionFromRequest(req, body);
    if (!session) return NextResponse.json({ ok: false, error: "Sign in again to see your dashboard." }, { status: 401, headers });
    return NextResponse.json(await loadDashboard(botsDb(), session.wallet), { headers });
  } catch (error) { const response = failResponse(error); Object.entries(headers).forEach(([key,value]) => response.headers.set(key,value)); return response; }
}
export async function GET(req: Request) { return dashboard(req, null); }
export async function POST(req: Request) {
  try { return await dashboard(req, await readJson<{ t?: unknown }>(req)); }
  catch (error) { const response = failResponse(error); Object.entries(headers).forEach(([key,value]) => response.headers.set(key,value)); return response; }
}
