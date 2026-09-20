import { NextResponse } from "next/server";
import { DinerAuthorityError } from "@/lib/chef/diner/authority";
import { dinerDb, loadDinerRecord } from "@/lib/chef/diner/server";
import { findDinerByHandle } from "@/lib/chef/diner/social-server";
import { publicDiner } from "@/lib/chef/diner/social";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, context: { params: Promise<{ handle: string }> }) {
  try {
    const { handle } = await context.params; if (!/^diner-[a-f0-9]{16}$/.test(handle)) throw new DinerAuthorityError("diner_unavailable", "That diner is unavailable.", 404);
    const db = dinerDb(), found = await findDinerByHandle(db, handle); if (!found.published) throw new DinerAuthorityError("diner_unavailable", "That diner is unavailable.", 404);
    const record = await loadDinerRecord(db, found.player_id, Date.now());
    return NextResponse.json(publicDiner(record.state, found.social), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ ok: false, error: "That diner is unavailable." }, { status: error instanceof DinerAuthorityError ? error.status : 503, headers: { "Cache-Control": "no-store" } }); }
}
