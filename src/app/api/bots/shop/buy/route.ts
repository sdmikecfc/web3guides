/**
 * BUY A LISTING OFF TODAY'S SHIPMENT. POST /api/bots/shop/buy { t, listingId }
 *
 * The day's 16 listings are recomputed SERVER-SIDE from the same pure module
 * the shop page renders (_server/shop.ts -> src/lib/bots/shipment.ts), so a
 * purchase can only name a card everyone saw today. The listing id is
 * "row:n" ("t1:3"), never a catalog key: one catalog part can sit on the
 * shelf twice in a day in two colours.
 *
 * One purchase per listing per wallet per day is the UNIQUE on
 * battle_bots_purchases (the row is inserted FIRST, so two taps cannot both
 * pay). The level gate is the wallet's best bot level against the listing's
 * own needsLevel (T3 needs 5, T4 needs 10). The price is a NEGATIVE bb_grant
 * with reason shop:<day>:<listing>, refused on an overdraft (then the
 * purchase row is taken back).
 *
 * THE COLOUR: the listing's colour is written onto the new card and never
 * changes (ADR-0141; there is no paint route any more). It goes into
 * stats.paint, which the engine and partPaint() already read, AND into the
 * `color` column that SQL 003 adds. Until an operator has run 003 the column
 * is absent, so the insert retries once without it and says so in the server
 * log; the card still carries its colour in stats.paint either way.
 */
import { NextResponse } from "next/server";
import { LISTING_ID_RE } from "@/lib/bots/shipment";
import { STRINGS, fill } from "@/lib/bots/strings";
import { bestLevel, loadBots, partView, type PartRow } from "@/app/bots/_server/bots";
import { botsDb, failResponse, readJson, refuse } from "@/app/bots/_server/db";
import { grant } from "@/app/bots/_server/grants";
import { coinsOf, displayName, loadPlayer } from "@/app/bots/_server/players";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { boughtToday, listingToday, shopProvenance, todayShop } from "@/app/bots/_server/shop";

export const runtime = "nodejs";

const PART_COLS = "id, wallet, part_key, slot_kind, tier, stats, bot_id, source, list_price, recycled_at, is_test, created_at";

/** PostgREST says this when a column in the payload is not in the schema
 * cache. Only that error may fall back; anything else throws. */
function isMissingColumn(message: string, column: string): boolean {
  return new RegExp(`'${column}' column|column .*\\b${column}\\b.* does not exist`, "i").test(message);
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{ t?: string; listingId?: unknown }>(req);
    const sess = sessionFromRequest(req, body);
    if (!sess) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });
    const listingId = typeof body.listingId === "string" ? body.listingId : "";
    if (!LISTING_ID_RE.test(listingId)) return refuse(400, "Pick a listing.");

    const db = botsDb();
    const player = await loadPlayer(db, sess.wallet);
    if (!player) return refuse(401, "Enlist first.");
    const shop = todayShop(Date.now());
    const listing = listingToday(shop, listingId);
    if (!listing) return refuse(404, "That part is not on today's shelf.");
    const card = listing.card;

    // "already bought" is checked BEFORE the coins, so a player who spent
    // their last coins on this very listing is told the true reason
    // ("Bought today") and not "You need 45 more coins." The unique key
    // below is still the race guard; this read is only for the words.
    const already = await boughtToday(db, sess.wallet, shop.day);
    if (already.includes(listing.id)) return refuse(409, STRINGS.en.shopUi.bought);

    const bots = await loadBots(db, sess.wallet);
    if (bestLevel(bots) < listing.needsLevel) return refuse(403, fill(STRINGS.en.shopUi.needsLevel, { n: listing.needsLevel }));
    const coins = coinsOf(player);
    if (listing.price > coins) return refuse(400, fill(STRINGS.en.shop.notEnough, { n: listing.price - coins }));

    // the purchase row first: the unique key is the "one per day" gate
    const purchaseRow: Record<string, unknown> = {
      wallet: sess.wallet,
      day_key: shop.day,
      listing_id: listing.id,
      part_key: card.id,
      price: listing.price,
      is_test: !!player.is_test,
      color: listing.color,
    };
    let purchase: { id: number } | null = null;
    {
      const first = await db.from("battle_bots_purchases").insert(purchaseRow).select("id").single();
      let err = first.error;
      purchase = (first.data as { id: number } | null) ?? null;
      if (err && isMissingColumn(err.message || "", "color")) {
        console.warn("[bots] battle_bots_purchases.color is missing: run battle_bots_003_junkyard_shipments.sql");
        const { color: _color, ...withoutColor } = purchaseRow;
        const retry = await db.from("battle_bots_purchases").insert(withoutColor).select("id").single();
        err = retry.error;
        purchase = (retry.data as { id: number } | null) ?? null;
      }
      if (err || !purchase) {
        if (err && /duplicate|unique/i.test(err.message || "")) return refuse(409, STRINGS.en.shopUi.bought);
        throw new Error(`purchase: ${err?.message || "no row"}`);
      }
    }

    const g = await grant(db, {
      wallet: sess.wallet,
      walletName: displayName(player),
      coins: -listing.price,
      reason: `shop:${shop.day}:${listing.id}`,
      meta: { part: card.id, price: listing.price, day: shop.day, color: listing.color, listing: listing.id },
      isTest: !!player.is_test,
    });
    if (!g.ok) {
      await db.from("battle_bots_purchases").delete().eq("id", purchase.id);
      return refuse(400, fill(STRINGS.en.shop.notEnough, { n: Math.max(1, listing.price - g.coins) }));
    }

    // the card, stamped with the listing's colour for life
    const partRow: Record<string, unknown> = {
      wallet: sess.wallet,
      part_key: card.id,
      slot_kind: card.slot,
      tier: card.tier,
      stats: {
        equipmentVersion: 2,
        s: [card.s[0], card.s[1], card.s[2]],
        provenance: shopProvenance(shop),
        ...(listing.color ? { paint: listing.color } : {}),
      },
      bot_id: null,
      source: "shop",
      list_price: listing.price,
      is_test: !!player.is_test,
      color: listing.color,
    };
    const first = await db.from("battle_bots_part_instances").insert(partRow).select(PART_COLS).single();
    let partErr = first.error;
    let part = first.data;
    if (partErr && isMissingColumn(partErr.message || "", "color")) {
      console.warn("[bots] battle_bots_part_instances.color is missing: run battle_bots_003_junkyard_shipments.sql");
      const { color: _color, ...withoutColor } = partRow;
      const retry = await db.from("battle_bots_part_instances").insert(withoutColor).select(PART_COLS).single();
      partErr = retry.error;
      part = retry.data;
    }
    if (partErr || !part) throw new Error(`part insert: ${partErr?.message || "no row"}`);

    const view = partView(part as PartRow);
    // which card the purchase made (SQL 003). Never fatal: the coins are
    // already spent and the card already exists, so a missing column is a
    // log line, not a lost purchase.
    const link = await db.from("battle_bots_purchases").update({ part_instance_id: view.id }).eq("id", purchase.id);
    if (link.error) console.warn(`[bots] purchase ${purchase.id} not linked to card ${view.id}: ${link.error.message}`);
    return NextResponse.json({ ok: true, part: view, coins: g.coins });
  } catch (e) {
    return failResponse(e);
  }
}
