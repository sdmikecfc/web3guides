/**
 * Telegram Mini App — open a play SESSION from initData (Phase 1, ADR-0030).
 *
 *   POST /api/s4/tg-session  { initData }  ->  { ok, token, expiresInMs } | { needsLink, url }
 *
 * The Telegram twin of /api/s4/game-session. There, a wallet signature opens the
 * session; here the VERIFIED initData (the trust anchor) resolves the wallet the
 * player already bound on the web (Strategy B: no signature, no wallet pop-up
 * ever inside Telegram). It writes the SAME launch_wars_s4_game_sessions row, so
 * the whole anti-cheat chain downstream (run-start -> score) treats a Telegram
 * session identically to a web one. No wallet address is returned to the client.
 *
 * If the Telegram user has not linked a wallet yet, we return { needsLink } with
 * a fresh bind link (see /api/s4/tg-bind-start) so the shell can prompt to link.
 */
import { NextResponse } from "next/server";
import { verifyTelegramInitData } from "@/lib/s4/telegram";
import { s4Db, SEASON_KEY } from "@/lib/s4/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h, matches /api/s4/game-session
const CODE_TTL_MS = 15 * 60 * 1000;

function siteOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_ORIGIN ||
    process.env.NEXT_PUBLIC_ASSASSIN_ORIGIN ||
    "https://assassin.web3guides.com";
  return raw.replace(/\/+$/, "");
}

export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Telegram is not configured yet." }, { status: 503 });
  }

  let body: { initData?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const v = verifyTelegramInitData(String(body.initData || ""), token);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 401 });
  const telegramId = v.user?.id ? String(v.user.id) : null;
  if (!telegramId) return NextResponse.json({ ok: false, error: "No Telegram user." }, { status: 401 });

  const db = s4Db();

  // Resolve the wallet this Telegram user bound on the web.
  const { data: player } = await db
    .from("launch_wars_s4_players")
    .select("wallet")
    .eq("season_key", SEASON_KEY)
    .eq("telegram_id", telegramId)
    .maybeSingle();

  // Not linked yet -> mint a bind link and tell the shell to prompt.
  if (!player?.wallet) {
    const code = (
      globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    ).replace(/[^A-Za-z0-9_-]/g, "");
    await db
      .from("launch_wars_s4_tg_bind_codes")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("season_key", SEASON_KEY)
      .eq("telegram_id", telegramId)
      .eq("used", false);
    await db.from("launch_wars_s4_tg_bind_codes").insert({
      season_key: SEASON_KEY,
      code,
      telegram_id: telegramId,
      tg_username: v.user?.username ?? null,
      tg_first_name: v.user?.first_name ?? null,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    return NextResponse.json({
      ok: true,
      needsLink: true,
      url: `${siteOrigin()}/s4/tg-link?code=${encodeURIComponent(code)}`,
    });
  }

  // Linked -> open a play session identical to the web game-session row.
  const sessionToken = (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  ).replace(/[^A-Za-z0-9_-]/g, "");
  const { error } = await db.from("launch_wars_s4_game_sessions").insert({
    season_key: SEASON_KEY,
    token: sessionToken,
    wallet: player.wallet,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not open a play session." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, token: sessionToken, expiresInMs: SESSION_TTL_MS });
}
