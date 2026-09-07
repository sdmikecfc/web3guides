import { CARD_BY_ID } from "./fixtures";
import type { ShopView } from "@/app/bots/_server/types";
import type { Shipment, Listing } from "./shipment";

/** Display the authenticated shelf exactly; never substitute a browser-day offer. */
export function cabinetShipment(shop: ShopView): Shipment {
  const listings: Listing[] = shop.listings.flatMap(l => {
    const card = CARD_BY_ID[l.partKey];
    return card ? [{ id: l.id, partKey: l.partKey, row: l.row, card, slot: l.slot, tier: l.tier, color: l.color, dayColor: l.dayColor, price: l.price, needsLevel: l.needsLevel }] : [];
  });
  return { v: 1, dayKey: shop.day, dayIndex: shop.dayIndex, name: shop.name, colors: shop.colors, t4: shop.t4, rackTier: shop.rackTier,
    rows: { t1: listings.filter(l => l.row === "t1"), t2: listings.filter(l => l.row === "t2"), t3: listings.filter(l => l.row === "t3"), t4: listings.filter(l => l.row === "t4"), rack: listings.filter(l => l.row === "rack") }, listings };
}
