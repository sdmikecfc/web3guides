import { NextResponse } from "next/server";
import { DinerAuthorityError } from "@/lib/chef/diner/authority";
import { dinerAuthClient, dinerDb } from "@/lib/chef/diner/server";
import { verifyDinerWalletChallenge } from "@/lib/chef/diner/wallet-auth-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 4_096) return respond({ ok: false, code: "request_too_large", error: "Wallet proof too large." }, 413);
    let body: unknown; try { body = JSON.parse(raw); } catch { throw new DinerAuthorityError("invalid_json", "Choose a valid wallet proof."); }
    return respond({ ok: true, ...await verifyDinerWalletChallenge(dinerDb(), dinerAuthClient(), body, req.headers.get("origin")) });
  } catch (error) {
    return respond({ ok: false, code: error instanceof DinerAuthorityError ? error.code : "wallet_session_unavailable", error: error instanceof DinerAuthorityError ? error.message : "Wallet sign-in is unavailable." }, error instanceof DinerAuthorityError ? error.status : 503);
  }
}
