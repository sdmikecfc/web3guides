import { NextResponse } from "next/server";
import { botsDb } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { readProgress } from "@/app/bots/_server/progress";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
  const sess = sessionFromRequest(req);
  if (!sess) return NextResponse.json({ ok: false, error: "Sign in to see your finds." }, { status: 401 });
  return NextResponse.json({ ok: true, ...await readProgress(botsDb(), sess.wallet) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ ok: true, source: "unavailable", activeDays: null, firstSeenAt: null, firstBuildAt: null, firstFightAt: null, awards: [] }, { headers: { "Cache-Control": "private, no-store" } }); }
}
