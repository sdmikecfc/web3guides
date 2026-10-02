import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { verifyOwnership } from "@/lib/s7/server";
import { botsDb, devTestFlag, readJson } from "@/app/bots/_server/db";
import { mintSession } from "@/app/bots/_server/session";
import { burnNonce, nonceInMessage } from "../../enlist/nonce-store";
import { requireSignInConfiguration, signInFailure } from "../../enlist/sign-in";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Authentication only. Season enrollment and its allowance are explicit,
 * separate transactions; opening Connect cannot create an old starter robot. */
export async function POST(req: Request) {
  try {
    if (process.env.BOTS_SEASON_V1 !== "1") return NextResponse.json({ ok: false, error: "Season preview is not open yet." }, { status: 404 });
    const body = await readJson<{ address?: string; message?: string; signature?: string }>(req);
    if (!body?.address || !isAddress(body.address) || typeof body.message !== "string" || typeof body.signature !== "string") return NextResponse.json({ ok: false, error: "Sign the message in your wallet to continue." }, { status: 400 });
    requireSignInConfiguration();
    const verified = await verifyOwnership(body.message, body.signature, body.address);
    if ("error" in verified) return NextResponse.json({ ok: false, error: verified.error }, { status: 401 });
    const wallet = getAddress(body.address).toLowerCase();
    await burnNonce(botsDb(), wallet, nonceInMessage(body.message));
    return NextResponse.json({ ok: true, token: mintSession(wallet, devTestFlag(req)), joined: false });
  } catch (error) { return signInFailure(error); }
}
