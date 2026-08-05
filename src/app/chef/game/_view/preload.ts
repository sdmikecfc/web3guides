/**
 * The Domain Kitchen preloader (ADR-0101): a REAL counted load. Every file the
 * game needs is listed here — the FIVE themed room sets AND the character
 * spritesheets — Pixi Assets downloads them, and the boot screen's bar is
 * driven by actual progress. The S5 try-image-else-vector law is retired for
 * this game: a missing file is a load error, never a silent vector fallback.
 *
 * All five themes load at boot (they total ~318KB, far inside the ~4-6MB
 * budget) so switching a restaurant's country style is INSTANT — no second
 * loading screen mid-play.
 *
 * Room art baked by scripts/dk-bake-room.mjs; character atlases packed by
 * scripts/dk-atlas.mjs (strips from scripts/dk-bake-chars.mjs, later AI art).
 */

import { Assets, type Spritesheet, type Texture } from "pixi.js";

/** The five country styles Mike locked in the demo round (ADR-0049). */
export const THEME_IDS = ["trattoria", "izakaya", "taqueria", "diner", "bistro"] as const;

/**
 * Domain collections (ADR-0105) ship FURNITURE ONLY and never follow the
 * player's chosen country style, so they load as their own small sets.
 */
export const ITEM_SET_IDS = ["neonlab", "bonebronze"] as const;
export type ItemSetId = (typeof ITEM_SET_IDS)[number];
const ITEM_SET_ARTS = ["table", "chair", "counter", "stove", "plant"] as const;
export type ItemSetArt = (typeof ITEM_SET_ARTS)[number];
export type ItemSetTextures = Record<ItemSetArt, Texture>;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_META: Record<ThemeId, { flag: string; label: string; blurb: string }> = {
  trattoria: { flag: "🇮🇹", label: "Trattoria", blurb: "Checkered cloths, wine on the shelf, nonna energy." },
  izakaya: { flag: "🇯🇵", label: "Izakaya", blurb: "Paper lanterns, quiet wood and warm red." },
  taqueria: { flag: "🇲🇽", label: "Taqueria", blurb: "Papel picado overhead, tile underfoot, loud and happy." },
  diner: { flag: "🇺🇸", label: "Diner", blurb: "Checker floor, chrome and mint, neon in the window." },
  bistro: { flag: "🇫🇷", label: "Bistro", blurb: "Parquet and brass, deep green, flowers on every table." },
};

const ROOM_ASSETS = [
  "floor",
  "floorAlt",
  "wallLeft",
  "wallRight",
  "table",
  "chair",
  "counter",
  "stove",
  "plant",
  "doormat",
  "rug",
  "dishes",
  "bench",
  "toilet",
  "toiletBroken",
  "trash",
] as const;
export type RoomAssetKey = (typeof ROOM_ASSETS)[number];

/** file names on disk (camelCase key -> kebab file) */
const FILE_OF: Record<RoomAssetKey, string> = {
  floor: "floor.png",
  floorAlt: "floor-alt.png",
  wallLeft: "wall-left.png",
  wallRight: "wall-right.png",
  table: "table.png",
  chair: "chair.png",
  counter: "counter.png",
  stove: "stove.png",
  plant: "plant.png",
  doormat: "doormat.png",
  rug: "rug.png",
  dishes: "dishes.png",
  bench: "bench.png",
  toilet: "toilet.png",
  toiletBroken: "toilet-broken.png",
  trash: "trash.png",
};

export type RoomTextures = Record<RoomAssetKey, Texture>;

export type SheetKey =
  | "guest0" | "guest1" | "guest2" | "guest3"
  | "guest4" | "guest5" | "guest6" | "guest7"
  | "waiter" | "chef";

export interface GameAssets {
  /** every theme's room set, keyed by theme id */
  themes: Record<ThemeId, RoomTextures>;
  /** domain collection furniture, keyed by collection id (ADR-0105) */
  itemSets: Record<ItemSetId, ItemSetTextures>;
  sheets: Record<SheetKey, Spritesheet>;
}

const SHEET_KEYS: SheetKey[] = [
  "guest0", "guest1", "guest2", "guest3",
  "guest4", "guest5", "guest6", "guest7",
  "waiter", "chef",
];

export async function loadGameAssets(
  onProgress: (p: number) => void
): Promise<GameAssets> {
  const entries: { alias: string; src: string }[] = [];
  for (const theme of THEME_IDS) {
    for (const key of ROOM_ASSETS) {
      entries.push({ alias: `${theme}_${key}`, src: `/chef-art/room/${theme}/${FILE_OF[key]}` });
    }
  }
  for (const set of ITEM_SET_IDS) {
    for (const key of ITEM_SET_ARTS) {
      entries.push({ alias: `iset_${set}_${key}`, src: `/chef-art/room/${set}/${FILE_OF[key]}` });
    }
  }
  for (const k of SHEET_KEYS) {
    entries.push({ alias: `sheet_${k}`, src: `/chef-art/chars/${k}.json` });
  }

  const loaded = await Assets.load(entries, onProgress);

  const themes = {} as Record<ThemeId, RoomTextures>;
  for (const theme of THEME_IDS) {
    const set = {} as RoomTextures;
    for (const key of ROOM_ASSETS) set[key] = loaded[`${theme}_${key}`] as Texture;
    themes[theme] = set;
  }
  const itemSets = {} as Record<ItemSetId, ItemSetTextures>;
  for (const set of ITEM_SET_IDS) {
    const t = {} as ItemSetTextures;
    for (const key of ITEM_SET_ARTS) t[key] = loaded[`iset_${set}_${key}`] as Texture;
    itemSets[set] = t;
  }
  const sheets = {} as Record<SheetKey, Spritesheet>;
  for (const k of SHEET_KEYS) sheets[k] = loaded[`sheet_${k}`] as Spritesheet;
  return { themes, itemSets, sheets };
}
