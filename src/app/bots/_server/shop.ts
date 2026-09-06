/**
 * THE JUNKYARD (server side): today's shipment recomputed from the SAME pure
 * module the shop page renders (src/lib/bots/shipment.ts), so a purchase can
 * only ever name a listing everyone saw today. 16 listings in five rows,
 * new at 00:00 UTC, per ADR-0141.
 *
 * ONE PURCHASE PER LISTING PER WALLET PER DAY is the UNIQUE (wallet,
 * day_key, listing_id) on battle_bots_purchases. Stock is per player: no
 * counters, no sell-outs, no race between time zones.
 *
 * A LISTING CARRIES A COLOUR and the card keeps it for life. There is no
 * paint job, so this file is the only place a colour is ever chosen.
 */
import "server-only";
import { MONTHS_SHORT, WEEKDAYS, dayKey as fixtureDayKey } from "@/lib/bots/fixtures";
import { SHOP_EPOCH_MONDAY, dayIndexOf, listingOf, shipmentFor, type Listing, type Shipment } from "@/lib/bots/shipment";
import type { BotsDb } from "./db";
import type { ShopListingView, ShopView } from "./types";

export interface Calendar {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

/** UTC calendar parts of a clock value (src/lib/bots/garage-state.ts
 * utcParts; copied because that module carries React hooks). */
export function utcParts(nowMs: number): Calendar {
  const d = new Date(nowMs);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() };
}

export interface TodayShop {
  day: string;
  weekday: string;
  cal: Calendar;
  shipment: Shipment;
  /** the same 16 listings, flattened: what callers that only want to count
   * the shelf read (the Morning Paper's "the shop has N listings today"). */
  listings: Listing[];
}

/**
 * The shipment for the UTC day of `nowMs`. The epoch Monday is
 * `battle_bots_config.shop_epoch_monday`; until an operator sets it, the
 * module default stands (shipment.ts SHOP_EPOCH_MONDAY), which is a
 * published constant, not a guess.
 */
export function todayShop(nowMs: number, epochMonday: string = SHOP_EPOCH_MONDAY): TodayShop {
  const cal = utcParts(nowMs);
  const day = fixtureDayKey(cal.year, cal.month, cal.day);
  const shipment = shipmentFor(day, dayIndexOf(day, epochMonday));
  return { day, weekday: WEEKDAYS[cal.weekday], cal, shipment, listings: shipment.listings };
}

/** One listing off today's shelf, or null (the buy route's only lookup). */
export function listingToday(shop: TodayShop, listingId: string): Listing | null {
  return listingOf(shop.shipment, listingId);
}

/** "Bought on Monday 1 Sep" (stamped once, never changed). */
export function shopProvenance(shop: TodayShop): string {
  return `Bought on ${shop.weekday} ${shop.cal.day} ${MONTHS_SHORT[shop.cal.month - 1]}`;
}

export async function boughtToday(db: BotsDb, wallet: string, day: string): Promise<string[]> {
  const { data, error } = await db.from("battle_bots_purchases").select("listing_id").eq("wallet", wallet.toLowerCase()).eq("day_key", day);
  if (error) throw new Error(`purchases read: ${error.message}`);
  return ((data || []) as { listing_id: string }[]).map((r) => r.listing_id);
}

export function shopView(shop: TodayShop, bought: readonly string[]): ShopView {
  const s = shop.shipment;
  const view = (l: Listing): ShopListingView => ({
    id: l.id,
    row: l.row,
    partKey: l.partKey,
    name: l.card.name,
    slot: l.slot,
    tier: l.tier,
    color: l.color,
    dayColor: l.dayColor,
    price: l.price,
    bought: bought.includes(l.id),
    needsLevel: l.needsLevel,
  });
  return {
    day: shop.day,
    weekday: shop.weekday,
    dayIndex: s.dayIndex,
    name: s.name,
    colors: s.colors,
    t4: { week: s.t4.week, weekday: s.t4.weekday, slot: s.t4.slot, color: s.t4.color },
    rackTier: s.rackTier,
    listings: s.listings.map(view),
  };
}
