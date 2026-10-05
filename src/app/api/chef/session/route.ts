import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { verifyOwnership } from "@/lib/stars/server";
import { dkDb, DK_SESSION_TTL_MS } from "@/lib/chef/server";

/**
 * Mint a Domain Kitchen play session (M6). The player signs a plain message
 * with the wallet they already connected for their liquidity reads; we check
 * the signature and hand back a bearer token.
 *
 * The token authorizes SAVING A GAME and nothing else — no money moves
 * through it, and it dies on the server at expires_at regardless of what the
 * browser keeps. Same contract as the S5 game session.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  let body: { address?: unknown; message?: unknown; signature?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad json");
  }
  const address = typeof body.address === "string" ? body.address : "";
  const message = typeof body.message === "string" ? body.message : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!address || !message || !signature) return bad("address, message and signature are required");

  const verified = await verifyOwnership(message, signature, address);
  if ("error" in verified) return bad(verified.error, 401);

  const wallet = verified.address.toLowerCase();
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + DK_SESSION_TTL_MS);

  const db = dkDb();
  const { error } = await db
    .from("domain_kitchen_sessions")
    .insert({ token, wallet, expires_at: expiresAt.toISOString() });
  if (error) return bad("could not start a session, try again", 500);

  return NextResponse.json({
    ok: true,
    token,
    wallet,
    expiresInMs: DK_SESSION_TTL_MS,
  });
}
