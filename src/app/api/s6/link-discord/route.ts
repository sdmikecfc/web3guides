/**
 * Season 5 — link a wallet-first pilot to a Discord account.
 *
 *   POST /api/s6/link-discord  { address, code, message, signature }
 *
 * WHY THIS EXISTS. The bot has shipped `/resist link` since launch: it writes a
 * one-time code into launch_wars_s6_link_codes and tells the player to finish
 * at `${homeUrl}/link`. The web half was never built for S6, so that URL 404'd
 * and every player who ran the command hit a dead end on launch day. This is a
 * straight port of the proven S4 route (itself a port of S3's) against the s6
 * tables.
 *
 * The player proves the WALLET with an ownership signature; the two identities
 * bind only when BOTH are proven. Service-role read/write, no wallets or
 * dollars in the response.
 *
 * ONE DIFFERENCE FROM S4, and it is the whole shape of this season: S6 is SOLO
 * (ADR-0058). TEAM_KEYS is the single "front", so smallestTeam() always returns
 * it and there is no team to name back. The response keeps the same field names
 * the form already reads, so the client needs no special case.
 */
import { NextResponse } from "next/server";
import { s6Db, verifyOwnership, smallestTeam, SEASON_KEY } from "@/lib/s6/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generic fallbacks that got written INTO the row as if they were a name.
 * Mirrors the bot's GENERIC_NAMES set and must stay in step with it: on launch
 * day the standings rail was a column of identical "Pilot" entries, because
 * a row already holding that word was not treated as a placeholder and so never
 * healed to the player's real Discord name. */
const GENERIC_NAMES = new Set(["pilot", "player", "pilot", "captain", "recruit", "anon", "unknown"]);

// A display_name equal to the wallet (the s6_grant auto-create placeholder),
// empty, or one of the generic words above is not a real name; linking
// overwrites it with the Discord name.
function isPlaceholderName(name: unknown): boolean {
  const s = typeof name === "string" ? name.trim() : "";
  return !s || /^0x[0-9a-fA-F]{40}$/.test(s) || GENERIC_NAMES.has(s.toLowerCase());
}

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

  const db = s6Db();

  // Solo season: there is one column and it needs no naming. Kept as a function
  // so the shape matches S4's and a future team season is a one-line change.
  const ok = (extra: Record<string, unknown>) =>
    NextResponse.json({ ok: true, team: "front", teamName: "The Resistance", accent: "#d9963a", ...extra });

  // 1) The code must exist, be unused, and be unexpired.
  const { data: codeRow } = await db
    .from("launch_wars_s6_link_codes")
    .select("id, discord_id, display_name, used, expires_at")
    .eq("season_key", SEASON_KEY)
    .eq("code", cleanCode)
    .maybeSingle();
  if (!codeRow || codeRow.used || new Date(codeRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "That code is invalid or expired. Run /resist link in Discord again." },
      { status: 400 },
    );
  }

  const markUsed = () =>
    db
      .from("launch_wars_s6_link_codes")
      .update({ used: true, used_at: new Date().toISOString(), used_by_wallet: wallet })
      .eq("id", codeRow.id);

  // 2) One Discord <-> one wallet: that Discord must not already belong to another wallet.
  const { data: discordPlayer } = await db
    .from("launch_wars_s6_players")
    .select("id, wallet")
    .eq("season_key", SEASON_KEY)
    .eq("discord_id", codeRow.discord_id)
    .maybeSingle();
  if (discordPlayer && discordPlayer.wallet !== wallet) {
    return NextResponse.json(
      { ok: false, error: "That Discord is already linked to a different wallet." },
      { status: 409 },
    );
  }

  // 3) Find this wallet's pilot (if any).
  const { data: player } = await db
    .from("launch_wars_s6_players")
    .select("id, wallet, discord_id, team_key, display_name")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();

  // Already linked to this same Discord: idempotent success. Still heal a
  // wallet-placeholder name on a repeat link (matches the bot's already-linked path).
  if (player && player.discord_id === codeRow.discord_id) {
    if (isPlaceholderName(player.display_name) && codeRow.display_name) {
      await db
        .from("launch_wars_s6_players")
        .update({ display_name: codeRow.display_name, updated_at: new Date().toISOString() })
        .eq("id", player.id);
    }
    await markUsed();
    return ok({ already: true });
  }
  // This wallet is linked to a DIFFERENT Discord.
  if (player && player.discord_id) {
    return NextResponse.json(
      { ok: false, error: "This wallet is already linked to a different Discord." },
      { status: 409 },
    );
  }

  // 4a) Existing pilot, no Discord yet: bind it (adopt the Discord name if none set).
  if (player) {
    const patch: Record<string, unknown> = {
      discord_id: codeRow.discord_id,
      updated_at: new Date().toISOString(),
    };
    if (isPlaceholderName(player.display_name) && codeRow.display_name) patch.display_name = codeRow.display_name;
    // A game-only row (created by a score grant) can be teamless: put them on
    // the column now rather than hard-blocking (S3 policy, carried forward).
    if (!player.team_key) patch.team_key = await smallestTeam(db);
    const { error: upErr } = await db.from("launch_wars_s6_players").update(patch).eq("id", player.id);
    if (upErr) {
      return NextResponse.json(
        { ok: false, error: "Could not link. That Discord may already be taken." },
        { status: 409 },
      );
    }
    await markUsed();
    return ok({ discordName: codeRow.display_name || null });
  }

  // 4b) No pilot for this wallet: the signature already proved ownership,
  //     so enlist + link in one step. Removes the "join first" dead end.
  const { error: insErr } = await db
    .from("launch_wars_s6_players")
    .insert({
      season_key: SEASON_KEY,
      wallet,
      team_key: await smallestTeam(db),
      discord_id: codeRow.discord_id,
      display_name: codeRow.display_name || null,
    })
    .select("team_key")
    .single();
  if (insErr) {
    return NextResponse.json(
      { ok: false, error: "Could not enlist and link. Try again in a moment." },
      { status: 500 },
    );
  }
  await markUsed();
  return ok({ enlisted: true });
}
