/**
 * The save shape, and the sanitizer that makes a save SAFE TO TRUST (M6).
 *
 * This module is shared by the browser and the server on purpose: the client
 * writes saves and the server accepts them, and both must agree on exactly
 * what a legal save is. The server treats every incoming save as hostile —
 * anyone can POST anything — so `sanitizeSave` is the only way state enters
 * the game, and it drops unknown keys rather than trusting them.
 *
 * Renderer-free and React-free: importable from a route handler.
 */

import { COURSES } from "./academy";
import { itemDef, MARKETS } from "./items";
import { INGREDIENTS, MAX_DISH_LEVEL, RECIPES } from "./pantry";
import { HIRE_SHOP, type Facing, type PlacedSpec, type WorldState } from "./world";

export const SAVE_VERSION = 4;

/** Hard ceilings. A save that exceeds them is clamped, never rejected. */
export const LIMITS = {
  layout: 120,
  inventoryKinds: 60,
  perItem: 999,
  coins: 1_000_000_000,
  stock: 999,
  serves: 1_000_000,
  lpDays: 3650,
  /** biggest JSON we will accept over the wire, before parsing */
  bytes: 24_000,
} as const;

export interface DkSave {
  v: number;
  market: string;
  lpDays: Record<string, number>;
  coins: number;
  waiters: number;
  chefs: number;
  layout: { itemId: string; gx: number; gy: number; facing: Facing }[];
  inventory: Record<string, number>;
  pantry: { stock: Record<string, number>; levels: Record<string, number> };
  menu: {
    serves: Record<string, number>;
    specialUnlocked: boolean;
    specialServes: number;
    specialMastered: boolean;
  };
  bestQuality: number;
  theme: string;
  /** Academy courses finished (ADR-0050) */
  courses: string[];
  savedAt: number;
}

const THEMES = ["trattoria", "izakaya", "taqueria", "diner", "bistro"];
const MARKET_IDS = MARKETS.map((m) => m.id);
const IGREDIENT_IDS = new Set(INGREDIENTS.map((i) => i.id));
const DISH_KEYS = Object.keys(RECIPES);
const COURSE_IDS = new Set(COURSES.map((c) => c.id));

function num(v: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function bool(v: unknown): boolean {
  return v === true;
}

/** Serialize a live world into the save shape. */
export function serializeSave(w: WorldState, theme: string): DkSave {
  const serves: Record<string, number> = {};
  for (const d of w.menu.dishes) serves[d.key] = d.serves;
  return {
    v: SAVE_VERSION,
    market: w.market,
    lpDays: { ...w.lpDays },
    coins: Math.floor(w.playMoney),
    waiters: w.hires.waiters,
    chefs: w.hires.chefs,
    layout: w.layout.map((p) => ({ itemId: p.itemId, gx: p.gx, gy: p.gy, facing: p.facing })),
    inventory: { ...w.inventory },
    pantry: { stock: { ...w.pantry.stock }, levels: { ...w.pantry.levels } },
    menu: {
      serves,
      specialUnlocked: w.menu.specialUnlocked,
      specialServes: w.menu.specialServes,
      specialMastered: w.menu.specialMastered,
    },
    bestQuality: Math.round(w.stats.bestQuality * 10) / 10,
    theme,
    courses: [...w.courses],
    savedAt: Date.now(),
  };
}

/**
 * Turn anything at all into a legal save. Unknown items, out-of-range
 * numbers, junk keys and oversized collections are dropped or clamped; the
 * result is always safe to hand to createWorld.
 */
export function sanitizeSave(raw: unknown): DkSave {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // layout: only real catalog items, only inside the room, only known facings
  const rawLayout = Array.isArray(src.layout) ? src.layout.slice(0, LIMITS.layout) : [];
  const layout: DkSave["layout"] = [];
  for (const entry of rawLayout) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const itemId = typeof e.itemId === "string" ? e.itemId : "";
    if (!itemDef(itemId)) continue; // an item we do not sell cannot be placed
    layout.push({
      itemId,
      gx: num(e.gx, 0, 63),
      gy: num(e.gy, 0, 63),
      facing: e.facing === "sw" ? "sw" : "se",
    });
  }

  // inventory: known items only, sane counts
  const inventory: Record<string, number> = {};
  const rawInv = (src.inventory && typeof src.inventory === "object" ? src.inventory : {}) as Record<string, unknown>;
  for (const [id, n] of Object.entries(rawInv).slice(0, LIMITS.inventoryKinds)) {
    if (!itemDef(id)) continue;
    const c = num(n, 0, LIMITS.perItem);
    if (c > 0) inventory[id] = c;
  }

  // pantry: known ingredients, levels inside their real bounds
  const stock: Record<string, number> = {};
  const rawStock = (src.pantry && typeof src.pantry === "object"
    ? ((src.pantry as Record<string, unknown>).stock ?? {})
    : {}) as Record<string, unknown>;
  for (const [id, n] of Object.entries(rawStock)) {
    if (!IGREDIENT_IDS.has(id)) continue;
    const c = num(n, 0, LIMITS.stock);
    if (c > 0) stock[id] = c;
  }
  const levels: Record<string, number> = {};
  const rawLevels = (src.pantry && typeof src.pantry === "object"
    ? ((src.pantry as Record<string, unknown>).levels ?? {})
    : {}) as Record<string, unknown>;
  for (const key of DISH_KEYS) levels[key] = num(rawLevels[key], 1, MAX_DISH_LEVEL, 1);

  // tenure: known markets only
  const lpDays: Record<string, number> = {};
  const rawDays = (src.lpDays && typeof src.lpDays === "object" ? src.lpDays : {}) as Record<string, unknown>;
  for (const id of MARKET_IDS) {
    const d = num(rawDays[id], 0, LIMITS.lpDays);
    if (d > 0) lpDays[id] = d;
  }

  const rawMenu = (src.menu && typeof src.menu === "object" ? src.menu : {}) as Record<string, unknown>;
  const rawServes = (rawMenu.serves && typeof rawMenu.serves === "object" ? rawMenu.serves : {}) as Record<string, unknown>;
  const serves: Record<string, number> = {};
  for (const key of DISH_KEYS) {
    if (key === "special") continue;
    serves[key] = num(rawServes[key], 0, LIMITS.serves);
  }

  const marketRaw = typeof src.market === "string" ? src.market : "";
  const themeRaw = typeof src.theme === "string" ? src.theme : "";

  return {
    v: SAVE_VERSION,
    market: MARKET_IDS.includes(marketRaw) ? marketRaw : MARKET_IDS[0],
    lpDays,
    coins: num(src.coins, 0, LIMITS.coins, 20),
    waiters: num(src.waiters, 1, HIRE_SHOP.waiter.max, 1),
    chefs: num(src.chefs, 1, HIRE_SHOP.chef.max, 1),
    layout,
    inventory,
    pantry: { stock, levels },
    menu: {
      serves,
      specialUnlocked: bool(rawMenu.specialUnlocked),
      specialServes: num(rawMenu.specialServes, 0, LIMITS.serves),
      specialMastered: bool(rawMenu.specialMastered),
    },
    bestQuality: num(src.bestQuality, 0, 100),
    theme: THEMES.includes(themeRaw) ? themeRaw : THEMES[0],
    // only real course ids, each at most once
    courses: Array.isArray(src.courses)
      ? Array.from(
          new Set(
            (src.courses as unknown[])
              .filter((c): c is string => typeof c === "string")
              .filter((c) => COURSE_IDS.has(c))
          )
        )
      : [],
    savedAt: num(src.savedAt, 0, Number.MAX_SAFE_INTEGER),
  };
}

/** The layout in the shape createWorld wants. */
export function layoutFromSave(save: DkSave): PlacedSpec[] {
  return save.layout.map((p) => ({ itemId: p.itemId, gx: p.gx, gy: p.gy, facing: p.facing }));
}

/** Which of two saves to trust when local and cloud disagree. */
export function newerSave(a: DkSave | null, b: DkSave | null): DkSave | null {
  if (!a) return b;
  if (!b) return a;
  return b.savedAt > a.savedAt ? b : a;
}
