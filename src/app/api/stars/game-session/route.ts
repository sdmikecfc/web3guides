/**
 * STARFALL — open a mini-game play SESSION.
 *
 *   POST /api/stars/game-session  { address, message, signature }  -> { token }
 *
 * The S3 games are wallet-first, so a session is opened with a one-time wallet
 * ownership signature (no gas). The returned token is carried by the game pages and
 * exchanged for run nonces (/api/stars/run-start) and banked scores (/api/stars/score),
 * exactly like S2's bot-issued game token — but proven by the wallet, not Discord.
 */
import { NextResponse } from "next/server";
import { starsDb, verifyOwnership, SEASON_KEY } from "@/lib/stars/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — sign rarely

export async function POST(req: Request) {
  let body: { address?: string; message?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const { address, message, signature } = body || {};
  if (!address || !message || !signature) {
    return NextResponse.json({ ok: false, error: "Connect your wallet and sign to play." }, { status: 400 });
  }
  const v = await verifyOwnership(message, signature, address);
  if ("error" in v) return NextResponse.json({ ok: false, error: v.error }, { status: 401 });
  const wallet = v.address.toLowerCase();

  const db = starsDb();
  const token = (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  ).replace(/[^A-Za-z0-9_-]/g, "");
  const { error } = await db.from("launch_wars_s3_game_sessions").insert({
    season_key: SEASON_KEY,
    token,
    wallet,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not open a play session." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, token, wallet, expiresInMs: SESSION_TTL_MS });
}
