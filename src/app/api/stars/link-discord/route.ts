/**
 * STARFALL — link a wallet-first pilot to a Discord account.
 *
 *   POST /api/stars/link-discord  { address, code, message, signature }
 *
 * The bot's /stars link writes a one-time code (launch_wars_s3_link_codes) keyed to
 * the player's discord_id. Here the player proves the WALLET with an ownership
 * signature, we look the code up, and set discord_id on that wallet's pilot — so the
 * two identities (wallet + Discord) are bound only when BOTH are proven. Service-role
 * read/write (RLS-bypassing). No wallets/dollars are returned.
 */
import { NextResponse } from "next/server";
import { starsDb, verifyOwnership, smallestCrew, SEASON_KEY } from "@/lib/stars/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { address?: string; code?: string; message?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const { address, code, message, signature } = body || {};
  if (!address || !code || !message || !signature) {
    return NextResponse.json(
      { ok: false, error: "Connect your wallet, enter the code, then sign." },
      { status: 400 },
    );
  }

  const verified = await verifyOwnership(message, signature, address);
  if ("error" in verified) {
    return NextResponse.json({ ok: false, error: verified.error }, { status: 401 });
  }
  const wallet = verified.address.toLowerCase();
  const cleanCode = String(code).trim().toUpperCase();

  const db = starsDb();

  // 1) The code must exist, be unused, and be unexpired.
  const { data: codeRow } = await db
    .from("launch_wars_s3_link_codes")
    .select("id, discord_id, display_name, used, expires_at")
    .eq("season_key", SEASON_KEY)
    .eq("code", cleanCode)
    .maybeSingle();
  if (!codeRow || codeRow.used || new Date(codeRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "That code is invalid or expired. Run /stars link in Discord again." },
      { status: 400 },
    );
  }

  const markUsed = () =>
    db
      .from("launch_wars_s3_link_codes")
      .update({ used: true, used_at: new Date().toISOString(), used_by_wallet: wallet })
      .eq("id", codeRow.id);

  // 2) One Discord ↔ one wallet: that Discord must not already belong to another wallet.
  const { data: discordPilot } = await db
    .from("launch_wars_s3_pilots")
    .select("id, wallet")
    .eq("season_key", SEASON_KEY)
    .eq("discord_id", codeRow.discord_id)
    .maybeSingle();
  if (discordPilot && discordPilot.wallet !== wallet) {
    return NextResponse.json(
      { ok: false, error: "That Discord is already linked to a different wallet." },
      { status: 409 },
    );
  }

  // 3) Find this wallet's pilot (if any).
  const { data: pilot } = await db
    .from("launch_wars_s3_pilots")
    .select("id, wallet, discord_id, crew, callsign")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();

  // Already linked to this same Discord → idempotent success.
  if (pilot && pilot.discord_id === codeRow.discord_id) {
    await markUsed();
    return NextResponse.json({ ok: true, crew: pilot.crew, already: true });
  }
  // This wallet is linked to a DIFFERENT Discord.
  if (pilot && pilot.discord_id) {
    return NextResponse.json(
      { ok: false, error: "This wallet is already linked to a different Discord." },
      { status: 409 },
    );
  }

  // 4a) Existing pilot, no Discord yet → bind it (adopt the Discord name unless a callsign is set).
  if (pilot) {
    const patch: Record<string, unknown> = {
      discord_id: codeRow.discord_id,
      updated_at: new Date().toISOString(),
    };
    if (!pilot.callsign && codeRow.display_name) patch.display_name = codeRow.display_name;
    // A game-only pilot (e.g. a row created by a score grant) can be crewless → auto-assign
    // the smallest crew now, so linking Discord also lands them on a balanced crew.
    if (!pilot.crew) patch.crew = await smallestCrew(db);
    const { error: upErr } = await db.from("launch_wars_s3_pilots").update(patch).eq("id", pilot.id);
    if (upErr) {
      return NextResponse.json(
        { ok: false, error: "Could not link. That Discord may already be taken." },
        { status: 409 },
      );
    }
    await markUsed();
    return NextResponse.json({ ok: true, crew: (patch.crew as string) || pilot.crew, discordName: codeRow.display_name || null });
  }

  // 4b) No pilot for this wallet → the signature already proved ownership, so enlist
  //     + link in one step (auto-assign the smallest crew). Removes the "join first"
  //     dead end for a fresh wallet or a wiped row.
  const crew = await smallestCrew(db);
  const { data: created, error: insErr } = await db
    .from("launch_wars_s3_pilots")
    .insert({
      season_key: SEASON_KEY,
      wallet,
      crew,
      discord_id: codeRow.discord_id,
      display_name: codeRow.display_name || null,
    })
    .select("crew")
    .single();
  if (insErr) {
    return NextResponse.json(
      { ok: false, error: "Could not enlist + link. Try again in a moment." },
      { status: 500 },
    );
  }
  await markUsed();
  return NextResponse.json({ ok: true, crew: created.crew, enlisted: true });
}
