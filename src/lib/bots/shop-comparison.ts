import { aggregates } from "./combat";
import { engineBuild, SLOT_STATS, type Build, type OwnedPart, type Socket } from "./fixtures";
import { equipmentTarget, fitPart, socketsOf } from "./equipment";
import type { Listing } from "./shipment";

/** Read-only shop context. Buying a part never replaces an equipped item. */
export interface ShopComparisonContext {
  builds: readonly Build[];
  parts: readonly OwnedPart[];
  selectedBay?: number;
  finishedBays?: readonly number[];
}

export const SHOP_TOTAL_NAMES = {
  speed: "Speed", str: "Strength", dodge: "Dodge", dmg: "Damage", block: "Block",
  health: "Health", luck: "Luck", acc: "Accuracy", atkSpd: "Attack speed",
} as const;

/** A hypothetical single-socket fit, using the same averaging and set bonuses as fights. */
export function compareShopPart(build: Build, parts: readonly OwnedPart[], listing: Listing, preferred?: Socket) {
  const socket = equipmentTarget(build, listing.slot, preferred);
  const previous = parts.find(p => p.uid === socketsOf(build)[socket]);
  // Keep this UID outside the inventory so an identical owned item is not moved.
  let uid = `shop-preview:${listing.id}:${socket}`;
  while (parts.some(p => p.uid === uid)) uid += ":preview";
  const part: OwnedPart = {
    ...listing.card, uid, provenance: "Shop preview", price: listing.price,
    ...(listing.color ? { paint: listing.color } : {}),
  };
  const nextBuild = fitPart(build, part, socket), nextParts = [...parts, part];
  // Read older paired builds as seven sockets on both sides: replacing one
  // arm must not appear to replace the whole pair or change its set rules.
  const beforeBuild = build.sockets ? build : { ...build, sockets: socketsOf(build) };
  const before = aggregates(engineBuild(beforeBuild, parts));
  const after = aggregates(engineBuild(nextBuild, nextParts));
  return {
    socket, previous, build: nextBuild, parts: nextParts,
    partStats: SLOT_STATS[listing.slot].map((key, i) => ({ key, before: previous?.s[i] ?? 0, after: part.s[i], delta: part.s[i] - (previous?.s[i] ?? 0) })),
    totals: (Object.keys(SHOP_TOTAL_NAMES) as (keyof typeof SHOP_TOTAL_NAMES)[]).map(key => ({ key, label: SHOP_TOTAL_NAMES[key], before: before[key], after: after[key], delta: after[key] - before[key] })),
  };
}
