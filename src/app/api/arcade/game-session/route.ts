/**
 * LAUNCH WARS ARCADE, open a play SESSION (step 1 of the anti-forge chain).
 *
 *   POST /api/arcade/game-session  { address, message, signature }  -> { ok, token }
 *
 * Port of /api/s7/game-session. One gasless wallet-ownership signature opens a
 * 12 hour session; the token is traded for run nonces (/api/arcade/run-start)
 * and banked scores (/api/arcade/score). The row lands in the shared S7
 * sessions table under season_key "arcade" (see lib/arcade/server).
 *
 * is_test: sessions minted anywhere but production are flagged, so their score
 * rows stay off the public boards. Nobody can mint a test session on prod.
 */
import { NextResponse } from "next/server";
import { arcadeDb, arcadeOpen, verifyOwnership, ARCADE_SEASON_KEY, T_SESSIONS } from "@/lib/arcade/server";

export const runtime = "nodejs";

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
    return NextResponse.json({ ok: false, error: "Connect your wallet and sign to play." }, { status: 400 });
  }
  const v = await verifyOwnership(message, signature, address);
  if ("error" in v) return NextResponse.json({ ok: false, error: v.error }, { status: 401 });
  const wallet = v.address.toLowerCase();

  const db = arcadeDb();
  if (!(await arcadeOpen(db))) {
    return NextResponse.json(
      { ok: false, error: "The arcade is closed right now. Practice mode is always open." },
      { status: 403 },
    );
  }
  const token = (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  ).replace(/[^A-Za-z0-9_-]/g, "");
  const { error } = await db.from(T_SESSIONS).insert({
    season_key: ARCADE_SEASON_KEY,
    token,
    wallet,
    is_test: process.env.NODE_ENV !== "production",
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not open a play session." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, token, wallet, expiresInMs: SESSION_TTL_MS });
}
