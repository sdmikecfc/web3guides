import type { ShopView } from "@/app/bots/_server/types";
import type { Listing } from "./shipment";
import type { CabinetShipment } from "./style-shipment";
import { gameCard } from "./beginner-catalog";

/** Display the authenticated shelf exactly; never substitute a browser-day offer. */
export function cabinetShipment(shop: ShopView): CabinetShipment {
  const listings: Listing[] = shop.listings.flatMap(l => {
    const card = gameCard(l.partKey);
    return card ? [{ id: l.id, partKey: l.partKey, row: l.row, card, slot: l.slot, tier: l.tier, color: l.color, dayColor: l.dayColor, price: l.price, needsLevel: l.needsLevel }] : [];
  });
  return { v: shop.v ?? 1, dayKey: shop.day, dayIndex: shop.dayIndex, name: shop.name, colors: shop.colors, t4: shop.t4, rackTier: shop.rackTier,
    rows: { t1: listings.filter(l => l.row === "t1"), t2: listings.filter(l => l.row === "t2"), t3: listings.filter(l => l.row === "t3"), t4: listings.filter(l => l.row === "t4"), rack: listings.filter(l => l.row === "rack") }, listings };
}
