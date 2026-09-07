/** Starter-shop identities are deliberately outside the frozen combat catalogue.
 * Appearance may borrow any toy mould; its price, stats and family never do. */
import { CATALOG_PARTS, CARD_BY_ID, type PartCard, type Socket } from "./fixtures";
import type { PaintId, Slot } from "@/app/bots/_engine/parts";

export const ONBOARDING_VERSION = 1 as const;
export const BEGINNER_ALLOWANCE = 250;
export const BEGINNER_ORDER = ["head", "torso", "armL", "armR", "legL", "legR", "weapon"] as const;
export const BEGINNER_PRICE: Readonly<Record<Socket, number>> = { head: 50, torso: 50, armL: 25, armR: 25, legL: 25, legR: 25, weapon: 50 };
const label: Record<Slot, string> = { head: "Head", torso: "Body", arms: "Arm", legs: "Leg", weapon: "Weapon" };
export interface BeginnerOffer {
  id: string;
  part: PartCard;
  artKey: string;
  color: PaintId | null;
  /** Single-piece price, including arms and legs. Never halve this again. */
  price: number;
}
const counts: Partial<Record<Slot, number>> = {};
export const BEGINNER_OFFERS: readonly BeginnerOffer[] = CATALOG_PARTS.map(c => {
  const n = counts[c.slot] = (counts[c.slot] ?? 0) + 1;
  const price = c.slot === "arms" || c.slot === "legs" ? 25 : 50;
  const part: PartCard = { id: `beginner.v1.${c.id}`, slot: c.slot, name: `${label[c.slot]} ${n}`, s: [1, 1, 1], tier: 1, price, lore: "A little part for your first build.", familyName: null, design: c.design, ...(c.color ? { color: c.color } : {}) };
  return { id: part.id, part, artKey: c.id, color: c.color ?? null, price };
});
export const BEGINNER_CARD_BY_ID: Readonly<Record<string, PartCard>> = Object.fromEntries(BEGINNER_OFFERS.map(o => [o.id, o.part]));
export const beginnerOffer = (id: unknown) => typeof id === "string" ? BEGINNER_OFFERS.find(o => o.id === id) : undefined;
export const beginnerArtKey = (id: string | undefined): string | undefined => beginnerOffer(id)?.artKey;
export const gameCard = (id: string): PartCard | undefined => BEGINNER_CARD_BY_ID[id] ?? CARD_BY_ID[id];
export const isBeginnerSocket = (v: unknown): v is Socket => typeof v === "string" && (BEGINNER_ORDER as readonly string[]).includes(v);

