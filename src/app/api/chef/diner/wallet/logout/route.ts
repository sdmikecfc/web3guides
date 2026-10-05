import { NextResponse } from "next/server";
import { DinerAuthorityError } from "@/lib/chef/diner/authority";
import { dinerAuthClient, dinerDb } from "@/lib/chef/diner/server";
import { revokeDinerWalletSession } from "@/lib/chef/diner/wallet-auth-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  try {
    const authorization = req.headers.get("authorization"), token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    await revokeDinerWalletSession(dinerDb(), dinerAuthClient(), token);
    return respond({ ok: true });
  } catch (error) {
    return respond({ ok: false, code: error instanceof DinerAuthorityError ? error.code : "wallet_session_unavailable", error: error instanceof DinerAuthorityError ? error.message : "Wallet sign-out is unavailable." }, error instanceof DinerAuthorityError ? error.status : 503);
  }
}
