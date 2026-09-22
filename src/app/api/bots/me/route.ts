/**
 * BATTLE BOTS ME. GET /api/bots/me (Authorization: Bearer <t>) or
 * POST /api/bots/me { t }
 *
 * The caller's OWN state, gated by the play session (the src/app/api/s7/me
 * route shape): the player (wallet name, coins, battle points, best bot
 * level), the bots with their builds, attacks left today per bot and the
 * repair clock, every owned part instance, and today's shelf with what
 * was bought. Never returns the wallet.
 */
import { NextResponse } from "next/server";
import { bestLevel, botView, loadBots, loadCrownBotIds, loadHats, loadParts, partView } from "@/app/bots/_server/bots";
import { botsDb, failResponse, readJson, requestDay } from "@/app/bots/_server/db";
import { coinsOf, displayName, loadPlayer, pointsOf } from "@/app/bots/_server/players";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { boughtToday, shopView, todayShop } from "@/app/bots/_server/shop";
import { loadCoinBalance, loadOnboarding, onboardingView } from "@/app/bots/_server/onboarding";
import { campaignEnrollment } from "@/app/bots/_server/campaign-enrollment";
import { touchProgress } from "@/app/bots/_server/progress";
import type { MeView } from "@/app/bots/_server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function me(req: Request, body: { t?: string } | null) {
  const sess = sessionFromRequest(req, body);
  if (!sess) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });
  const db = botsDb();
  const player = await loadPlayer(db, sess.wallet);
  if (!player) return NextResponse.json({ ok: false, error: "Enlist first." }, { status: 401 });
  const nowMs = Date.now();
  // the clock's day, or the dev-only x-bots-day header (db.ts requestDay)
  const day = requestDay(req, nowMs);
  const [bots, parts, shop] = await Promise.all([loadBots(db, sess.wallet), loadParts(db, sess.wallet), Promise.resolve(todayShop(nowMs))]);
  const bought = await boughtToday(db, sess.wallet, day);
  // the two rows a look needs beyond the bot and its parts: the hats this
  // wallet has won and the robots a week champion card names. Both are
  // server rows, which is the whole point (the joint law: what a robot has
  // earned is derived from rows, never from what the client says it has).
  await touchProgress(db, sess.wallet);
  const [hats, crowns] = await Promise.all([loadHats(db, sess.wallet), loadCrownBotIds(db, sess.wallet)]);
  const onboardingRow = await loadOnboarding(db, sess.wallet);
  const balance = await loadCoinBalance(db, sess.wallet, player);
  const [onboarding, enrollment] = await Promise.all([onboardingView(db, sess.wallet, onboardingRow), campaignEnrollment(db, sess.wallet, true, !!player.is_test)]);
  const view: MeView = {
    onboarding,
    campaignEnrollment: enrollment,
    ok: true,
    day,
    player: {
      walletName: displayName(player),
      coins: balance.total,
      reservedCoins: balance.reserved,
      spendableCoins: balance.spendable,
      battlePoints: pointsOf(player),
      level: bestLevel(bots),
      isTest: !!player.is_test,
      enlistedAt: player.enlisted_at,
    },
    bots: bots.map((b) => botView(b, parts, day, nowMs, { hats, crowns })),
    parts: parts.map(partView),
    shop: shopView(shop, bought),
  };
  return NextResponse.json(view);
}

export async function GET(req: Request) {
  try {
    return await me(req, null);
  } catch (e) {
    return failResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{ t?: string }>(req);
    return await me(req, body);
  } catch (e) {
    return failResponse(e);
  }
}
