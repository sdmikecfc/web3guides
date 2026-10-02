/**
 * Telegram Mini App identity check (Phase 0, ADR-0030).
 *
 *   POST /api/s4/tg-verify  { initData }
 *
 * Verifies the Telegram WebApp `initData` HMAC with the bot token and returns
 * the AUTHENTICATED Telegram user. This is the trust anchor: a client-claimed
 * Telegram id never gets past verifyTelegramInitData. DB-free for now; Phase 1
 * adds the wallet <-> telegram_id lookup here (return the linked player/team).
 * No wallet, no chain, no crypto is ever named or handled on this surface.
 */
import { NextResponse } from "next/server";
import { verifyTelegramInitData } from "@/lib/s4/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    telegramId: v.user?.id ?? null,
    username: v.user?.username ?? null,
    firstName: v.user?.first_name ?? null,
  });
}
