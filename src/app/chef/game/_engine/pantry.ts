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

/**
 * THE DAILY SPECIAL (M8) — the reason a pantry keeps mattering.
 *
 * "Cook it better" is a finite pool: four dishes, two upgrades each, eight
 * presses and then ingredients are worthless forever. The special is the sink
 * that never closes. One is drawn each REAL day; prepping it spends commons
 * you have, and the board turns over tomorrow whether you cooked it or not.
 *
 * Prep is PURE UPSIDE. It never adds quality points (money and stock do not
 * buy quality, ADR-0043/0103) and an unprepped day is never a penalty state:
 * the kitchen simply serves its ordinary menu, as it always has.
 */
export interface DailySpecial {
  id: string;
  name: string;
  icon: string;
  needs: Recipe;
}

/**
 * Icons are deliberately OLD emoji (Unicode 9 and earlier). Windows 10 has no
 * glyph for anything newer and renders a hollow box: M7 shipped country flags
 * that came out as bare letter pairs for exactly this reason, and 🫓 (Unicode
 * 13) did the same here before it became a baguette. If you add a special,
 * look at it on Windows before you believe it.
 */
export const DAILY_SPECIALS: DailySpecial[] = [
  { id: "soup", name: "Tomato Soup", icon: "🍲", needs: { tomato: 2, herb: 1 } },
  { id: "flatbread", name: "Herb Bread", icon: "🥖", needs: { flour: 2, herb: 1 } },
  { id: "pepperpasta", name: "Pepper Pasta", icon: "🍝", needs: { flour: 2, pepper: 1 } },
  { id: "lemontart", name: "Lemon Tart", icon: "🍋", needs: { lemon: 2, flour: 1 } },
  { id: "cheeseplate", name: "Cheese Plate", icon: "🧀", needs: { cheese: 2, herb: 1 } },
  { id: "brightsalad", name: "Bright Salad", icon: "🥗", needs: { lemon: 1, herb: 1, tomato: 1 } },
];

/**
 * Extra tip a plate earns while today's special is on (never quality).
 * 1 -> 2 with the inversion: it now rides SERVE_BASE 4 instead of base 1, and
 * a prepped board also feeds the SPECIAL_POT beat, so prep stays worth the
 * commons it spends.
 */
export const SPECIAL_TIP = 2;

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
