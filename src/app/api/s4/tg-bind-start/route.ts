/**
 * Telegram Mini App — START a wallet bind (Phase 1, ADR-0030 Strategy B).
 *
 *   POST /api/s4/tg-bind-start  { initData }  ->  { ok, url, code, expiresInMs }
 *
 * The Mini App calls this with its `Telegram.WebApp.initData`. We VERIFY that
 * HMAC (the only trust anchor) to get an authenticated telegram_id, then mint a
 * single-use, server-stored bind nonce keyed to it and hand back a normal https
 * link ( /s4/tg-link?code=... ) that opens the SYSTEM browser. Connect + SIWE
 * happen there (never inside Telegram); POST /api/s4/tg-bind consumes the code.
 *
 * SECURITY: the telegram_id is NEVER placed in the URL — only the opaque nonce
 * is, and the nonce maps back to the telegram_id only here, server-side. No
 * wallet, chain, or crypto word is ever named on this surface (Strategy B copy
 * rule). If already bound, we say so and skip minting.
 */
import { NextResponse } from "next/server";
import { verifyTelegramInitData } from "@/lib/s4/telegram";
import { s4Db, SEASON_KEY } from "@/lib/s4/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MS = 15 * 60 * 1000; // 15 min: mirrors the Discord link codes

// Public origin for the link the Mini App opens in the system browser. Falls
// back to the production host so a missing env never breaks the bind.
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

  // Already linked? Say so and skip minting (idempotent, no dead codes).
  const { data: linked } = await db
    .from("launch_wars_s4_players")
    .select("id")
    .eq("season_key", SEASON_KEY)
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (linked) return NextResponse.json({ ok: true, alreadyLinked: true });

  // Mint the opaque nonce (URL-safe, no personal data). Invalidate this user's
  // older unused codes first so only the newest link works.
  await db
    .from("launch_wars_s4_tg_bind_codes")
    .update({ used: true, used_at: new Date().toISOString() })
    .eq("season_key", SEASON_KEY)
    .eq("telegram_id", telegramId)
    .eq("used", false);

  const code = (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  ).replace(/[^A-Za-z0-9_-]/g, "");
  const { error } = await db.from("launch_wars_s4_tg_bind_codes").insert({
    season_key: SEASON_KEY,
    code,
    telegram_id: telegramId,
    tg_username: v.user?.username ?? null,
    tg_first_name: v.user?.first_name ?? null,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not start the link." }, { status: 500 });
  }

  const url = `${siteOrigin()}/s4/tg-link?code=${encodeURIComponent(code)}`;
  return NextResponse.json({ ok: true, url, code, expiresInMs: CODE_TTL_MS });
}
