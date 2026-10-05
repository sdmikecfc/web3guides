/**
 * Season 4 — open a mini-game play SESSION (step 1 of the anti-cheat chain).
 *
 *   POST /api/s4/game-session  { address, message, signature }  -> { ok, token }
 *
 * Port of the proven S3 route (/api/stars/game-session): wallet-first, so a
 * session opens with a one-time wallet-ownership signature (no gas). The token
 * (carried by game pages, sessionStorage key in lib/s4/games SESSION_STORAGE_KEY)
 * is exchanged for run nonces (/api/s4/run-start) and banked scores
 * (/api/s4/score). Chain: game-session -> run-start -> score.
 */
import { NextResponse } from "next/server";
import { s4Db, verifyOwnership, SEASON_KEY } from "@/lib/s4/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h: sign rarely

export async function POST(req: Request) {
  let body: { address?: string; message?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const { address, message, signature } = body || {};
  if (!address || !message || !signature) {
    return NextResponse.json(
      { ok: false, error: "Connect your wallet and sign to play." },
      { status: 400 },
    );
  }
  const v = await verifyOwnership(message, signature, address);
  if ("error" in v) return NextResponse.json({ ok: false, error: v.error }, { status: 401 });
  const wallet = v.address.toLowerCase();

  const db = s4Db();
  const token = (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  ).replace(/[^A-Za-z0-9_-]/g, "");
  const { error } = await db.from("launch_wars_s4_game_sessions").insert({
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
