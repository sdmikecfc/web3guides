/**
 * BATTLE BOTS: ASK FOR A NONCE. POST /api/bots/enlist/nonce
 *
 *   Body { address }
 *   -> { ok: true, nonce, expiresAt }   sign this, then enlist
 *
 * WHAT THIS ROUTE IS FOR. One thing: hand out the single-use number the
 * enlist signature has to carry, so a captured message and signature cannot
 * be posted a second time (./../nonce-store.ts). It asks nothing of the
 * player, it refuses nobody, and it runs before the wallet opens so the
 * signature the player approves is already the last step.
 *
 * IT USED TO DO MORE, AND THAT WAS THE BUG. It ran a Discord identity gate
 * here and could answer "you cannot play yet" to somebody who had done
 * nothing but click Connect. Mike, 2026-09-04: three steps to join, open the
 * site, connect the wallet, play. Farming is priced in the money rules
 * instead, where it costs a real player nothing at the door.
 *
 * WHAT THIS ROUTE NEVER RETURNS: a wallet address or a dollar figure.
 */
import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { botsDb, devTestFlag, failResponse, readJson } from "@/app/bots/_server/db";
import { issueNonce, requestNonceTtlMs } from "../nonce-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ address?: string }>(req);
    const address = body?.address;
    if (!address || !isAddress(address)) {
      return NextResponse.json({ ok: false, error: "Connect a wallet first." }, { status: 400 });
    }
    const wallet = getAddress(address).toLowerCase();
    const db = botsDb();
    const issued = await issueNonce(db, wallet, devTestFlag(req), requestNonceTtlMs(req));
    return NextResponse.json({ ok: true, nonce: issued.nonce, expiresAt: issued.expiresAtIso });
  } catch (e) {
    return failResponse(e);
  }
}
