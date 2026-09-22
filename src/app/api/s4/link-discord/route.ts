/**
 * Season 4 — link a wallet-first player to a Discord account.
 *
 *   POST /api/s4/link-discord  { address, code, message, signature }
 *
 * Port of the proven S3 route (/api/stars/link-discord) against the s4 tables.
 * The bot's /s4 link writes a one-time code (launch_wars_s4_link_codes) keyed
 * to the player's discord_id. The player proves the WALLET with an ownership
 * signature; the two identities bind only when BOTH are proven. Service-role
 * read/write. No wallets or dollars are returned; the response names the team
 * via the THEME so the client never hardcodes a themed word.
 */
import { NextResponse } from "next/server";
import { s4Db, verifyOwnership, smallestTeam, SEASON_KEY } from "@/lib/s4/server";
import { getTheme } from "@/lib/s4/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A display_name equal to the wallet (the s4_grant auto-create placeholder) or
// empty is not a real name; linking overwrites it with the Discord name.
function isPlaceholderName(name: unknown): boolean {
  const s = typeof name === "string" ? name.trim() : "";
  return !s || /^0x[0-9a-fA-F]{40}$/.test(s);
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

  const db = s4Db();

  const teamResponse = async (teamKey: string | null, extra: Record<string, unknown>) => {
    const theme = await getTheme();
    const team = theme.teams.find((x) => x.key === teamKey) || null;
    return NextResponse.json({
      ok: true,
      team: teamKey,
      teamName: team ? team.name : teamKey,
      accent: team ? team.accent : "#8b95ad",
      ...extra,
    });
  };

  // 1) The code must exist, be unused, and be unexpired.
  const { data: codeRow } = await db
    .from("launch_wars_s4_link_codes")
    .select("id, discord_id, display_name, used, expires_at")
    .eq("season_key", SEASON_KEY)
    .eq("code", cleanCode)
    .maybeSingle();
  if (!codeRow || codeRow.used || new Date(codeRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "That code is invalid or expired. Run /s4 link in Discord again." },
      { status: 400 },
    );
  }

  const markUsed = () =>
    db
      .from("launch_wars_s4_link_codes")
      .update({ used: true, used_at: new Date().toISOString(), used_by_wallet: wallet })
      .eq("id", codeRow.id);

  // 2) One Discord <-> one wallet: that Discord must not already belong to another wallet.
  const { data: discordPlayer } = await db
    .from("launch_wars_s4_players")
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

  // 3) Find this wallet's player (if any).
  const { data: player } = await db
    .from("launch_wars_s4_players")
    .select("id, wallet, discord_id, team_key, display_name")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();

  // Already linked to this same Discord: idempotent success. Still heal a
  // wallet-placeholder name on a repeat link (matches the bot's already-linked path).
  if (player && player.discord_id === codeRow.discord_id) {
    if (isPlaceholderName(player.display_name) && codeRow.display_name) {
      await db
        .from("launch_wars_s4_players")
        .update({ display_name: codeRow.display_name, updated_at: new Date().toISOString() })
        .eq("id", player.id);
    }
    await markUsed();
    return teamResponse(player.team_key, { already: true });
  }
  // This wallet is linked to a DIFFERENT Discord.
  if (player && player.discord_id) {
    return NextResponse.json(
      { ok: false, error: "This wallet is already linked to a different Discord." },
      { status: 409 },
    );
  }

  // 4a) Existing player, no Discord yet: bind it (adopt the Discord name if none set).
  if (player) {
    const patch: Record<string, unknown> = {
      discord_id: codeRow.discord_id,
      updated_at: new Date().toISOString(),
    };
    if (isPlaceholderName(player.display_name) && codeRow.display_name) patch.display_name = codeRow.display_name;
    // A game-only player (a row created by a score grant) can be teamless:
    // auto-assign the smallest team now, never hard-block (S3 policy).
    if (!player.team_key) patch.team_key = await smallestTeam(db);
    const { error: upErr } = await db.from("launch_wars_s4_players").update(patch).eq("id", player.id);
    if (upErr) {
      return NextResponse.json(
        { ok: false, error: "Could not link. That Discord may already be taken." },
        { status: 409 },
      );
    }
    await markUsed();
    return teamResponse((patch.team_key as string) || player.team_key, {
      discordName: codeRow.display_name || null,
    });
  }

  // 4b) No player for this wallet: the signature already proved ownership, so
  //     enlist + link in one step (auto-assign the smallest team). Removes the
  //     "join first" dead end for a fresh wallet.
  const teamKey = await smallestTeam(db);
  const { data: created, error: insErr } = await db
    .from("launch_wars_s4_players")
    .insert({
      season_key: SEASON_KEY,
      wallet,
      team_key: teamKey,
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
  return teamResponse(created.team_key, { enlisted: true });
}
