import { NextResponse } from "next/server";
import { dinerDb, dinerPlayer, dinerSnapshot, loadDinerRecord } from "@/lib/chef/diner/server";
import { DinerAuthorityError } from "@/lib/chef/diner/authority";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { const db = dinerDb(), player = await dinerPlayer(req); return NextResponse.json(dinerSnapshot(await loadDinerRecord(db, player, Date.now())), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ ok: false, code: error instanceof DinerAuthorityError ? error.code : "preview_unavailable", error: error instanceof DinerAuthorityError ? error.message : "The preview could not be reached." }, { status: error instanceof DinerAuthorityError ? error.status : 503, headers: { "Cache-Control": "no-store" } }); }
}
