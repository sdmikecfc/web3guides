/** Styled shelves have their own version and receipt IDs. Historical shelves stay frozen. */
import { LEVEL_FOR_TIER, type CardSlot } from "./fixtures";
import { dayIndexOf, PALETTE, type Listing, type Shipment, type RowKey } from "./shipment";
import { STYLE_CATALOG, type StylePartCard } from "./style-catalog";
import { FIGHTING_STYLES, type FightingStyle } from "./style-guide";
import type { Tier, PaintId } from "@/app/bots/_engine/parts";

export interface StyleShipment extends Omit<Shipment, "v"> { v: 2 }
export type CabinetShipment = Shipment | StyleShipment;
export const STYLE_LISTING_ID_RE = /^s2:(?:t1|t2|t3|t4|rack):[1-6]$/;
const bodySlots: readonly CardSlot[] = ["torso", "head", "arms", "legs"];
const allSlots: readonly CardSlot[] = [...bodySlots, "weapon"];
const wrap = (n: number, length: number) => (n % length + length) % length;

function select(style: FightingStyle, tier: Tier, slot: CardSlot, day: number): StylePartCard {
  const choices = STYLE_CATALOG.filter(c => !c.starter && c.style === style && c.tier === tier && c.slot === slot);
  if (!choices.length) throw new Error(`Styled shop has no ${style} tier ${tier} ${slot}`);
  return choices[wrap(day, choices.length)];
}

export function styleShipmentFor(dayKey: string, dayIndex: number = dayIndexOf(dayKey)): StyleShipment {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || new Date(`${dayKey}T00:00:00Z`).toISOString().slice(0, 10) !== dayKey || !Number.isSafeInteger(dayIndex)) throw new Error("Invalid styled shipment day");
  const colors = { t1: PALETTE[wrap(dayIndex, 8)], t2: PALETTE[wrap(dayIndex + 3, 8)], t3: PALETTE[wrap(dayIndex + 6, 8)] };
  const rows: Record<RowKey, Listing[]> = { t1: [], t2: [], t3: [], t4: [], rack: [] };
  const add = (row: RowKey, card: StylePartCard, color: PaintId) => {
    const paint = card.slot === "weapon" ? null : color;
    rows[row].push({ id: `s2:${row}:${rows[row].length + 1}`, row, partKey: card.id, slot: card.slot,
      tier: card.tier, color: paint, price: card.price, needsLevel: LEVEL_FOR_TIER[card.tier], dayColor: !!paint, card });
  };
  FIGHTING_STYLES.forEach((style, i) => {
    // Every style has two different body slots plus its basic weapon, every day.
    add("t1", select(style, 1, bodySlots[wrap(dayIndex + i, 4)], dayIndex), colors.t1);
    add("t1", select(style, 1, bodySlots[wrap(dayIndex + i + 2, 4)], dayIndex), colors.t1);
    add("rack", select(style, 1, "weapon", dayIndex), colors.t1);
    add("t2", select(style, 2, allSlots[wrap(dayIndex + i, 5)], dayIndex), colors.t2);
    add("t3", select(style, 3, allSlots[wrap(dayIndex + i + 2, 5)], dayIndex), colors.t3);
  });
  const topStyle = FIGHTING_STYLES[wrap(dayIndex, 3)], topSlot = allSlots[wrap(dayIndex, 5)];
  const topColor = PALETTE[wrap(Math.floor(dayIndex / 7), 8)];
  add("t4", select(topStyle, 4, topSlot, dayIndex), topColor);
  const result: StyleShipment = { v: 2, dayKey, dayIndex, name: "Tank, Speed and Ranged parts. New choices every day.", colors,
    t4: { week: Math.floor(dayIndex / 7) + 1, weekday: wrap(dayIndex, 7), slot: topSlot, color: topSlot === "weapon" ? null : topColor },
    rackTier: 1, rows, listings: [...rows.t1, ...rows.rack, ...rows.t2, ...rows.t3, ...rows.t4] };
  assertStyleShipment(result);
  return result;
}

export function assertStyleShipment(shipment: StyleShipment) {
  const sizes: Record<RowKey, number> = { t1: 6, rack: 3, t2: 3, t3: 3, t4: 1 };
  if (shipment.listings.length !== 16 || new Set(shipment.listings.map(l => l.id)).size !== 16) throw new Error("Styled shelves need 16 distinct listings");
  (Object.keys(sizes) as RowKey[]).forEach(row => { if (shipment.rows[row].length !== sizes[row]) throw new Error(`Invalid styled shelf ${row}`); });
  shipment.listings.forEach(l => {
    if (!STYLE_LISTING_ID_RE.test(l.id) || (l.slot === "weapon") !== (l.color === null) || !Number.isInteger(l.price) || l.price <= 0) throw new Error("Invalid styled listing");
  });
}
