import bodies from "../../../../public/bots-playtest/assets/catalogue-2/manifest.json";
import weapons from "../../../../public/bots-playtest/assets/weapon-kits-1/manifest.json";
import type { Choices, Entry, Slot } from "./equipment-types";
import { aggregateEquipment, itemStats } from "./equipment-stats";
import { defaultAppearance, parseAppearance, type Appearance } from "./appearance";

export { aggregateEquipment, itemStats, defaultAppearance, parseAppearance };
export type { Choices, Entry, Slot, Appearance };
export const SLOTS: Slot[] = ["torso", "head", "armL", "armR", "legL", "legR", "weapon"];
export const SLOT_NAMES: Record<Slot, string> = { torso: "Body", head: "Head", armL: "Left arm", armR: "Right arm", legL: "Left leg", legR: "Right leg", weapon: "Weapon" };
export const ENTRIES = [...bodies.entries, ...weapons.entries] as unknown as Entry[];
export const ENTRY_MAP = new Map(ENTRIES.map(entry => [entry.id, entry]));
export const STYLE_NAMES = { tank: "Tank", speed: "Speed", ranged: "Ranged" } as const;
export const STYLE_HELP = { tank: "Heavy armour and strong hits. Slower feet.", speed: "Quick feet and fast attacks. Lighter armour.", ranged: "Aim from a distance. Make room to shoot." };
export const SPECIAL_NAMES = { tank: "Energy Shield", speed: "Overdrive", ranged: "Slow Field" };
export type Item = { id: string; entry: Entry; slot: Slot; price: number; image: string };
export const itemId = (entry: string, slot: Slot) => `${entry}:${slot}`;
export const price = (tier: number, slot: Slot) => [0, 250, 750, 2000, 5000][tier] * (["head", "torso", "weapon"].includes(slot) ? .2 : .1);
export const ITEMS: Item[] = ENTRIES.flatMap(entry => (entry.id.startsWith("kit1.") ? ["weapon" as Slot] : entry.slots.filter(slot => slot !== "weapon")).map(slot => ({
  id: itemId(entry.id, slot), entry, slot, price: price(entry.tier, slot), image: `/bots-playtest/part-previews-studio-v2/${entry.id}.${slot}.png`,
})));
export const ITEM_MAP = new Map(ITEMS.map(item => [item.id, item]));
export function legalChoices(value: unknown): value is Choices {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const choices = value as Choices;
  return SLOTS.every(slot => typeof choices[slot] === "string" && !!ITEM_MAP.get(itemId(choices[slot], slot)));
}
export function preset(style: keyof typeof STYLE_NAMES, tier = 1): Choices {
  const family = { tank: "warden", speed: "duelist", ranged: "tracker" }[style];
  return Object.fromEntries(SLOTS.map(slot => [slot, slot === "weapon" ? `kit1.${{ tank: "hammer", speed: "sword_shield", ranged: "rifle" }[style]}.t${tier}` : `bible2.${style}.t${tier}.${family}`])) as Choices;
}
/** Match the seven slot budgets, including a high-tier body among starter limbs. */
export function practiceOpponent(choices:Choices,style:keyof typeof STYLE_NAMES):Choices {
  return Object.fromEntries(SLOTS.map(slot=>[slot,preset(style,ENTRY_MAP.get(choices[slot])!.tier)[slot]])) as Choices;
}
export function dailyItems(day: string): Item[] {
  let hash = 0; for (const c of day) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  const pick = (pool: Item[], count: number, salt: number) => {
    const ordered = pool.slice().sort((a,b) => a.id.localeCompare(b.id));
    return Array.from({ length: Math.min(count, ordered.length) }, (_, i) => ordered[(hash + salt + i * 7) % ordered.length]);
  };
  const basic = ["hammer", "sword_shield", "rifle"].map(kind => ITEM_MAP.get(`kit1.${kind}.t1:weapon`)!).filter(Boolean);
  return [...pick(ITEMS.filter(i => i.entry.tier === 1 && i.slot !== "weapon"), 6, 3), ...basic,
    ...pick(ITEMS.filter(i => i.entry.tier === 2), 3, 9), ...pick(ITEMS.filter(i => i.entry.tier === 3), 3, 17), ...pick(ITEMS.filter(i => i.entry.tier === 4), 1, 23)];
}

