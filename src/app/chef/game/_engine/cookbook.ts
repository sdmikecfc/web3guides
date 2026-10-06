import type { Recipe } from "./pantry";

/** Stable identities: a dish never changes when the room style or market does. */
export interface DishDef {
  id: string; name: string; description: string; domain?: string;
  art: string; icon: string; recipes: [Recipe, Recipe];
  machine?: "fryer" | "drinks";
}
export const DISHES: DishDef[] = [
  { id: "tomato_pasta", name: "Sunday Tomato Pasta", description: "Twisted ribbons with a bright tomato sauce and fresh basil.", art: "tomato_pasta", icon: "pasta", recipes: [{ tomato: 2, flour: 1 }, { tomato: 3, herb: 2, saffron: 1 }] },
  { id: "garden_salad", name: "Garden Picnic Salad", description: "Crisp greens, sweet tomatoes, and a sunny lemon dressing.", art: "garden_salad", icon: "salad", recipes: [{ herb: 2, lemon: 1 }, { herb: 3, tomato: 2, truffle: 1 }] },
  { id: "fries", name: "Golden Road Fries", description: "Crisp golden fries with a little herb salt. Your fryer brings them to the menu.", art: "fries", icon: "fries", machine: "fryer", recipes: [{ pepper: 2, herb: 1 }, { pepper: 3, cheese: 2, truffle: 1 }] },
  { id: "lemonade", name: "Sunshine Lemonade", description: "Cloudy lemonade, ice, and a sprig of mint. Served from your lemonade station.", art: "lemonade", icon: "drink", machine: "drinks", recipes: [{ lemon: 2, herb: 1 }, { lemon: 4, herb: 2, saffron: 1 }] },
  { id: "margherita", name: "Garden Margherita", description: "Sweet tomatoes, torn basil, and a golden crust.", art: "margherita", icon: "pizza", recipes: [{ tomato: 2, herb: 1 }, { tomato: 3, cheese: 2, saffron: 1 }] },
  { id: "caciopepe", name: "Pepper Ribbon Pasta", description: "Fresh ribbons in a silky cheese and pepper sauce.", art: "caciopepe", icon: "pasta", recipes: [{ cheese: 2, pepper: 1 }, { cheese: 3, flour: 2, truffle: 1 }] },
  { id: "tiramisu", name: "Cloud Tiramisu", description: "A little layered cloud to finish the meal.", art: "tiramisu", icon: "cake", recipes: [{ flour: 2, lemon: 1 }, { flour: 3, cheese: 2, saffron: 1 }] },
  { id: "software_noodles", name: "Neon Garden Noodles", description: "Bright herbs, golden noodles, and a precise pepper finish.", domain: "software.ai", art: "software_noodles", icon: "noodles", recipes: [{ herb: 2, lemon: 1 }, { pepper: 3, tomato: 2, truffle: 1 }] },
  { id: "software_tart", name: "Lemon Byte Tart", description: "A tiny lemon tart with a jewel-bright saffron glaze.", domain: "software.ai", art: "software_tart", icon: "tart", recipes: [{ lemon: 2, flour: 2 }, { lemon: 3, cheese: 1, saffron: 1 }] },
  { id: "boner_broth", name: "Bronze Pot Broth", description: "Slow-simmered tomato broth with a generous herb finish.", domain: "boner.com", art: "boner_broth", icon: "soup", recipes: [{ herb: 2, lemon: 1 }, { pepper: 3, tomato: 2, truffle: 1 }] },
  { id: "boner_feast", name: "Hearthside Feast", description: "Rustic pepper flatbread with melted cheese and truffle.", domain: "boner.com", art: "boner_feast", icon: "bread", recipes: [{ flour: 2, pepper: 2 }, { cheese: 3, herb: 2, truffle: 1 }] },
];
export const STARTER_DISH_IDS = ["margherita", "caciopepe", "tiramisu"];
export const MENU_SLOTS = 4;
/** Launch recipe access is earned in the kitchen. Kept here rather than
 * launch-progression.ts to avoid a cookbook↔pantry/config runtime cycle. */
export const COOKBOOK_UNLOCK_RULES = {
  version: 1,
  requirements: {
    software_noodles: { level: 2, recipes: 2 },
    software_tart: { level: 3, recipes: 1 },
    boner_broth: { level: 2, recipes: 3 },
    boner_feast: { level: 3, recipes: 3 },
  },
} as const;
export function dishDef(id: string): DishDef | undefined { return DISHES.find((d) => d.id === id); }
export function legacyDomainDish(market: string): string { return DISHES.find((d) => d.domain === market)?.id ?? "software_noodles"; }
export interface CookbookOwner { market: string; lpDays: Record<string, number>; menu: { specialUnlocked: boolean; unlocked?: string[] }; pantry?: { levels: Record<string, number> }; truck?: { unlockedMachineIds: string[] } }
function unlockRule(id: string) {
  return Object.prototype.hasOwnProperty.call(COOKBOOK_UNLOCK_RULES.requirements, id)
    ? COOKBOOK_UNLOCK_RULES.requirements[id as keyof typeof COOKBOOK_UNLOCK_RULES.requirements] : null;
}
export function dishUnlockHint(id: string): string | null {
  const machine = dishDef(id)?.machine;
  if (machine) return `Discover the ${machine === "fryer" ? "fryer" : "lemonade station"} on your food truck.`;
  const rule = unlockRule(id);
  if (!rule) return null;
  return rule.level === 3 ? `Master ${rule.recipes} ${rule.recipes === 1 ? "recipe" : "recipes"} to unlock.`
    : `Get ${rule.recipes} recipes to level 2 to unlock.`;
}
function knownLevel(levels: Record<string, number> | undefined, id: string): number {
  const level = levels && Object.prototype.hasOwnProperty.call(levels, id) ? levels[id] : 1;
  return Number.isInteger(level) && level >= 1 && level <= 3 ? level : 1;
}
function earnedByMastery(id: string, levels: Record<string, number> = {}): boolean {
  const rule = unlockRule(id);
  if (!rule) return false;
  // Only real dish IDs count. A legacy alias, unknown key, non-finite value,
  // or inherited field cannot manufacture extra mastered recipes.
  return DISHES.filter(dish => knownLevel(levels, dish.id) >= rule.level).length >= rule.recipes;
}
export function availableDishes(owner: CookbookOwner): DishDef[] {
  return DISHES.filter((d) => d.machine ? owner.truck?.unlockedMachineIds.includes(d.machine) || owner.menu.unlocked?.includes(d.id) || knownLevel(owner.pantry?.levels, d.id) > 1 : !d.domain || owner.menu.unlocked?.includes(d.id) || knownLevel(owner.pantry?.levels, d.id) > 1 || earnedByMastery(d.id, owner.pantry?.levels) || (owner.lpDays[d.domain] ?? 0) > 0 || (owner.menu.unlocked === undefined && owner.market === d.domain && owner.menu.specialUnlocked));
}
export function sanitizeSelected(value: unknown, fallback = STARTER_DISH_IDS): string[] {
  const ids = Array.isArray(value) ? Array.from(new Set(value.filter((id): id is string => typeof id === "string" && !!dishDef(id)))).slice(0, MENU_SLOTS) : [];
  return ids.length ? ids : [...fallback];
}
