/**
 * The pantry: ingredients and dish recipes (ADR-0106, implementing the dish
 * spine of ADR-0051 under the ADR-0043 firewall).
 *
 * THE LAW, in one line: money stocks the pantry, money never buys quality.
 * Commons arrive from a random daily delivery and from capped trading drops;
 * RARES are strictly play-earned (they fall out of genuinely good service).
 * Nothing here is ever purchasable with coins.
 *
 * Renderer-free: no Pixi, no React. Every number is DEMO CONFIG (ADR-0048).
 */

export type Rarity = "common" | "rare";

export interface Ingredient {
  id: string;
  label: string;
  icon: string;
  rarity: Rarity;
}

export const INGREDIENTS: Ingredient[] = [
  { id: "tomato", label: "Tomatoes", icon: "🍅", rarity: "common" },
  { id: "herb", label: "Herbs", icon: "🌿", rarity: "common" },
  { id: "flour", label: "Flour", icon: "🌾", rarity: "common" },
  { id: "pepper", label: "Pepper", icon: "🌶️", rarity: "common" },
  { id: "cheese", label: "Cheese", icon: "🧀", rarity: "common" },
  { id: "lemon", label: "Lemons", icon: "🍋", rarity: "common" },
  { id: "saffron", label: "Saffron", icon: "✨", rarity: "rare" },
  { id: "truffle", label: "Truffle", icon: "🍄", rarity: "rare" },
];

export const COMMONS = INGREDIENTS.filter((i) => i.rarity === "common").map((i) => i.id);
export const RARES = INGREDIENTS.filter((i) => i.rarity === "rare").map((i) => i.id);

const BY_ID = new Map(INGREDIENTS.map((i) => [i.id, i]));
export function ingredient(id: string): Ingredient | undefined {
  return BY_ID.get(id);
}

/** What a dish needs to reach the NEXT level. Level 3 always costs a rare. */
export type Recipe = Record<string, number>;
export const RECIPES: Record<string, [Recipe, Recipe]> = {
  //            level 1 -> 2                  level 2 -> 3
  margherita: [{ tomato: 2, herb: 1 }, { tomato: 3, cheese: 2, saffron: 1 }],
  caciopepe: [{ cheese: 2, pepper: 1 }, { cheese: 3, flour: 2, truffle: 1 }],
  tiramisu: [{ flour: 2, lemon: 1 }, { flour: 3, cheese: 2, saffron: 1 }],
  special: [{ herb: 2, lemon: 1 }, { pepper: 3, tomato: 2, truffle: 1 }],
};

export const MAX_DISH_LEVEL = 3;

/** The recipe to take `key` from its current level to the next, or null. */
export function nextRecipe(key: string, level: number): Recipe | null {
  const pair = RECIPES[key];
  if (!pair || level >= MAX_DISH_LEVEL) return null;
  return pair[level - 1] ?? null;
}

/** Quality points a levelled kitchen contributes (bounded, ADR-0106). */
export const QUALITY_PER_LEVEL = 2;
export const QUALITY_DISH_CAP = 15;

export function dishQualityBonus(levels: Record<string, number>): number {
  let n = 0;
  for (const key of Object.keys(RECIPES)) {
    n += Math.max(0, (levels[key] ?? 1) - 1) * QUALITY_PER_LEVEL;
  }
  return Math.min(QUALITY_DISH_CAP, n);
}

// ── drop rates (DEMO CONFIG) ───────────────────────────────────────────────
/** commons handed over at the start of each game day, no matter what */
export const DAILY_DELIVERY = 2;
/** most commons a day of trading can drop */
export const VOLUME_DROP_CAP = 6;
/** most rares a day of good service can drop */
export const RARE_DROP_CAP = 1;
/** seconds between trading drops at full volume, stretched when quiet */
export function volumeDropInterval(weeklyVolumeUsd: number): number {
  const v = Math.max(0, weeklyVolumeUsd);
  if (v <= 0) return Infinity;
  // busy weeks restock faster, but the cap is what really bounds it
  return Math.max(18, 90 - 12 * Math.log1p(v / 40));
}
