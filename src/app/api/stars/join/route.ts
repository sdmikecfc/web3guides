/**
 * STARFALL (Launch Wars S3) — POST /api/stars/join
 * Wallet-first enlist. Two paths:
 *   - RETURNING wallet (already linked in a prior season, SIWE-proven) → enlist
 *     with NO signature. Body: { address }. (Fix for "I already connected this
 *     wallet for the other games.")
 *   - NEW wallet → require a fresh ownership signature (anti-Sybil).
 *     Body: { address, message, signature }. If sig missing → { needsSignature:true }.
 * Either way: upsert the pilot keyed on wallet + auto-assign the smallest crew.
 * Idempotent: a known pilot returns immediately.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import {
  starsDb,
  verifyOwnership,
  smallestCrew,
  isReturningWallet,
  SEASON_KEY,
} from "@/lib/stars/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error }, { status });

export async function POST(req: NextRequest) {
  let body: { message?: string; signature?: string; address?: string; ref?: string };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }
  const { message, signature, address } = body;
  if (!address || !isAddress(address)) return bad("Missing or invalid wallet address");
  const wallet = getAddress(address).toLowerCase();

  const db = starsDb();

  // Idempotent: a known pilot returns immediately (no signature, no new crew).
  const { data: existing } = await db
    .from("launch_wars_s3_pilots")
    .select("*")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, pilot: existing, joined: false, welcomeBack: true });
  }

  // Returning player (wallet linked in a prior season) → trust the prior proof, no re-sign.
  const returning = await isReturningWallet(db, wallet);

  if (!returning) {
    // New wallet → require a fresh ownership signature.
    if (!message || !signature) {
      return NextResponse.json({ ok: false, needsSignature: true });
    }
    const v = await verifyOwnership(message, signature, address);
    if ("error" in v) return bad(v.error);
  }

  // Enlist → auto-assign the smallest crew.
  const crew = await smallestCrew(db);
  const { data: pilot, error } = await db
    .from("launch_wars_s3_pilots")
    .insert({ season_key: SEASON_KEY, wallet, crew })
    .select("*")
    .single();

  if (error) {
    // Race (UNIQUE season_key+wallet): another request just created it → return that.
    const { data: race } = await db
      .from("launch_wars_s3_pilots")
      .select("*")
      .eq("season_key", SEASON_KEY)
      .eq("wallet", wallet)
      .maybeSingle();
    if (race) return NextResponse.json({ ok: true, pilot: race, joined: false, welcomeBack: returning });
    return bad(error.message, 500);
  }

  // Referral attribution (best-effort; never blocks enlist). Only on this genuine NEW join.
  // ref is a short CODE (not a wallet — we never make a player expose their wallet). Resolve it
  // to the referrer pilot, then record the edge. It only QUALIFIES for the bounty once the friend
  // also holds >= $5 and links Discord (computed live at leaderboard/settlement time).
  try {
    const refRaw = typeof body.ref === "string" ? body.ref.trim().toUpperCase() : "";
    if (/^[A-Z0-9]{4,12}$/.test(refRaw)) {
      const { data: refPilot } = await db
        .from("launch_wars_s3_pilots")
        .select("wallet")
        .eq("season_key", SEASON_KEY)
        .eq("ref_code", refRaw)
        .maybeSingle();
      const referrer = refPilot ? String(refPilot.wallet).toLowerCase() : null;
      if (referrer && referrer !== wallet) {
        // UNIQUE(season_key, referred) makes this first-attribution-wins; a dup just no-ops.
        await db.from("launch_wars_s3_referrals").insert({ season_key: SEASON_KEY, referrer, referred: wallet });
      }
    }
  } catch {
    /* referral is best-effort; a failure never blocks the enlist */
  }

  return NextResponse.json({ ok: true, pilot, joined: true, welcomeBack: returning });
}
