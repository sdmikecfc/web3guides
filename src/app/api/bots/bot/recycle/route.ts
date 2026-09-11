/**
 * BATTLE BOTS RECYCLE A BOT. POST /api/bots/bot/recycle { t, botId }
 *
 * Returns 40 percent of the list price of every part on the bot (the guide;
 * PRICE_BY_TIER through list_price, floored per part exactly like
 * src/lib/bots/fixtures.ts recycleValue) through ONE bb_grant with reason
 * recycle:<botId>, so a retry pays nothing twice, then deletes the part
 * instances and the bot row, which frees the bay (UNIQUE (wallet, slot)).
 * A bot in the shop can be recycled (Mike: "recycle them for a fraction").
 */
import { NextResponse } from "next/server";
import { buildJsonOf, assertPracticeHandoffReady, loadBot, loadPartsOfBot, nameTextOf, partRecycleValue } from "@/app/bots/_server/bots";
import { recyclableParts, type RecycleReceipt } from "@/app/bots/_server/recycle";
import { botsDb, failResponse, intIn, readJson, refuse } from "@/app/bots/_server/db";
import { assertOnboardingUnlocked } from "@/app/bots/_server/onboarding";
import { grant } from "@/app/bots/_server/grants";
import { displayName, loadPlayer } from "@/app/bots/_server/players";
import { sessionFromRequest } from "@/app/bots/_server/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ t?: string; botId?: unknown }>(req);
    const sess = sessionFromRequest(req, body);
    if (!sess) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });
    const db = botsDb();
    const player = await loadPlayer(db, sess.wallet);
    if (!player) return refuse(401, "Enlist first.");
    const botId = intIn(body.botId, 1, Number.MAX_SAFE_INTEGER, "The bot");
    const bot = await loadBot(db, botId);
    if (!bot || bot.wallet !== sess.wallet) return refuse(404, "That bot is not in your garage.");
    assertPracticeHandoffReady(bot);
    if (buildJsonOf(bot).engineVersion === 5) {
      const { data, error } = await db.rpc("bb_styles_recycle", { p_wallet: sess.wallet, p_bot_id: bot.id });
      if (error?.code === "P0001") return refuse(409, error.message);
      if (error || !data) throw new Error("The robot could not be recycled. Try again.");
      return NextResponse.json({ ok: true, ...data });
    }

    await assertOnboardingUnlocked(db, sess.wallet, bot.id);
    const [attached, paid] = await Promise.all([
      loadPartsOfBot(db, bot.id),
      db.from("battle_bots_ledger").select("wallet, reason, meta").eq("wallet", sess.wallet).eq("reason", `recycle:${bot.id}`).maybeSingle(),
    ]);
    if (paid.error) throw new Error(`recycle receipt read: ${paid.error.message}`);
    const parts = recyclableParts(bot, attached, sess.wallet, paid.data as RecycleReceipt | null);
    const { count: pendingFights, error: pendingError } = await db.from("battle_bots_battles").select("id", { count: "exact", head: true }).eq("status", "open").or(`challenger_bot_id.eq.${bot.id},defender_bot_id.eq.${bot.id}`);
    if (pendingError) throw new Error(`recycle fight check: ${pendingError.message}`);
    if (pendingFights) return refuse(409, "Wait for this robot's fight to finish before recycling it.");
    let coins = 0;
    for (const p of parts) coins += partRecycleValue(p);
    const name = nameTextOf(bot);
    const g = await grant(db, {
      wallet: sess.wallet,
      walletName: displayName(player),
      coins,
      reason: `recycle:${bot.id}`,
      meta: { bot: name, bay: bot.slot, parts: parts.map((p) => p.id), each: parts.map((p) => partRecycleValue(p)) },
      isTest: !!player.is_test,
    });
    if (!g.ok) throw new Error("recycle grant refused");

    if (parts.length) {
      const { error } = await db.from("battle_bots_part_instances").delete().in("id", parts.map((p) => p.id)).eq("wallet", sess.wallet);
      if (error) throw new Error(`parts delete: ${error.message}`);
    }
    const { error: botErr } = await db.from("battle_bots_bots").delete().eq("id", bot.id).eq("wallet", sess.wallet);
    if (botErr) throw new Error(`bot delete: ${botErr.message}`);

    return NextResponse.json({ ok: true, coins: g.duplicate ? 0 : coins, balance: g.coins, bay: bot.slot, bot: name });
  } catch (e) {
    return failResponse(e);
  }
}
