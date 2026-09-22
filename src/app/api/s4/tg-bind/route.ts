/**
 * Telegram bind — CONSUME a bind code on the web (Phase 1, ADR-0030 Strategy B).
 *
 *   POST /api/s4/tg-bind  { address, code, message, signature }
 *
 * Runs in the SYSTEM browser (never inside Telegram). The Mini App minted the
 * `code` (POST /api/s4/tg-bind-start) keyed to a verified telegram_id; here the
 * player proves the WALLET with an ownership signature (SIWE), and the two
 * identities bind only when BOTH are proven. Wallet-first: telegram_id merges
 * onto the wallet row in any order (mirrors /api/s4/link-discord, the Discord
 * twin, for telegram_id). One Telegram <-> one wallet, one wallet <-> one
 * Telegram. Response names the team via the THEME; no wallet/dollar is returned.
 */
import { NextResponse } from "next/server";
import { s4Db, verifyOwnership, smallestTeam, SEASON_KEY } from "@/lib/s4/server";
import { getTheme } from "@/lib/s4/data";

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
      { ok: false, error: "Connect your wallet, open the link, then sign." },
      { status: 400 },
    );
  }

  const verified = await verifyOwnership(message, signature, address);
  if ("error" in verified) {
    return NextResponse.json({ ok: false, error: verified.error }, { status: 401 });
  }
  const wallet = verified.address.toLowerCase();
  const cleanCode = String(code).trim();

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
    .from("launch_wars_s4_tg_bind_codes")
    .select("id, telegram_id, tg_username, tg_first_name, used, expires_at")
    .eq("season_key", SEASON_KEY)
    .eq("code", cleanCode)
    .maybeSingle();
  if (!codeRow || codeRow.used || new Date(codeRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "That link is invalid or expired. Open the game in Telegram and try again." },
      { status: 400 },
    );
  }
  const telegramId = String(codeRow.telegram_id);
  const tgName =
    (codeRow.tg_username && `@${codeRow.tg_username}`) || codeRow.tg_first_name || null;

  const markUsed = () =>
    db
      .from("launch_wars_s4_tg_bind_codes")
      .update({ used: true, used_at: new Date().toISOString(), used_by_wallet: wallet })
      .eq("id", codeRow.id);

  // 2) One Telegram <-> one wallet: that Telegram must not already belong to another wallet.
  const { data: tgPlayer } = await db
    .from("launch_wars_s4_players")
    .select("id, wallet")
    .eq("season_key", SEASON_KEY)
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (tgPlayer && tgPlayer.wallet !== wallet) {
    return NextResponse.json(
      { ok: false, error: "That Telegram is already linked to a different wallet." },
      { status: 409 },
    );
  }

  // 3) Find this wallet's player (if any).
  const { data: player } = await db
    .from("launch_wars_s4_players")
    .select("id, wallet, telegram_id, team_key, display_name")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();

  // Already linked to this same Telegram: idempotent success.
  if (player && player.telegram_id === telegramId) {
    await markUsed();
    return teamResponse(player.team_key, { already: true });
  }
  // This wallet is linked to a DIFFERENT Telegram.
  if (player && player.telegram_id) {
    return NextResponse.json(
      { ok: false, error: "This wallet is already linked to a different Telegram." },
      { status: 409 },
    );
  }

  // 4a) Existing player, no Telegram yet: bind it (adopt the Telegram name if none set).
  if (player) {
    const patch: Record<string, unknown> = {
      telegram_id: telegramId,
      updated_at: new Date().toISOString(),
    };
    if (!player.display_name && tgName) patch.display_name = tgName;
    // A game-only player (a row created by a score grant) can be teamless:
    // auto-assign the smallest team now, never hard-block (S3 policy).
    if (!player.team_key) patch.team_key = await smallestTeam(db);
    const { error: upErr } = await db.from("launch_wars_s4_players").update(patch).eq("id", player.id);
    if (upErr) {
      return NextResponse.json(
        { ok: false, error: "Could not link. That Telegram may already be taken." },
        { status: 409 },
      );
    }
    await markUsed();
    return teamResponse((patch.team_key as string) || player.team_key, { tgName });
  }

  // 4b) No player for this wallet: the signature already proved ownership, so
  //     enlist + link in one step (auto-assign the smallest team). Removes the
  //     "join first" dead end for a fresh wallet coming from Telegram.
  const teamKey = await smallestTeam(db);
  const { data: created, error: insErr } = await db
    .from("launch_wars_s4_players")
    .insert({
      season_key: SEASON_KEY,
      wallet,
      team_key: teamKey,
      telegram_id: telegramId,
      display_name: tgName,
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
  return teamResponse(created.team_key, { enlisted: true, tgName });
}
