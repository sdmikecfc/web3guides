/**
 * The Domain Kitchen preloader (ADR-0101): a REAL counted load. Every file the
 * game needs is listed in _view/art-manifest.ts — the FIVE themed room sets,
 * the character spritesheets and the fx sheet — Pixi Assets downloads them,
 * and the boot screen's bar is driven by actual progress. The S5
 * try-image-else-vector law is retired for this game: a missing file is a load
 * error, never a silent vector fallback.
 *
 * That makes the manifest load-bearing, so it lives in a pixi-free module and
 * scripts/dk-art-check.mts asserts every entry has a real file behind it.
 *
 * All five themes load at boot so switching a restaurant's country style is
 * INSTANT, with no second loading screen mid-play.
 *
 * Room art baked by scripts/dk-bake-room.mjs; character and fx atlases packed
 * by scripts/dk-atlas.mjs (strips from scripts/dk-bake-chars.mjs, later AI art).
 */

import { Assets, type Spritesheet, type Texture } from "pixi.js";

import {
  FILE_OF,
  ITEM_SET_ARTS,
  ITEM_SET_IDS,
  ROOM_ASSETS,
  SHEET_KEYS,
  THEME_IDS,
  WALL_LEFT_TILES,
  WALL_RIGHT_TILES,
  wallFile,
} from "./art-manifest";
import type {
  ItemSetArt,
  ItemSetId,
  RoomAssetKey,
  SheetKey,
  ThemeId,
} from "./art-manifest";

export {
  CREW_LOOKS,
  GUEST_LOOKS,
  ITEM_SET_IDS,
  THEME_IDS,
  THEME_META,
} from "./art-manifest";
export type { ItemSetId, ItemSetArt, RoomAssetKey, SheetKey, ThemeId } from "./art-manifest";

export type ItemSetTextures = Record<ItemSetArt, Texture>;
/**
 * A theme's room art. `wallLeft`/`wallRight` are keyed by TILE COUNT (M8b),
 * because the room can grow and a wall has to span whichever edge it is on.
 * Every size is preloaded for the same reason every theme is: expanding is a
 * purchase the player watches happen, not a second loading screen.
 */
export type RoomTextures = Record<RoomAssetKey, Texture> & {
  wallLeft: Record<number, Texture>;
  wallRight: Record<number, Texture>;
};

export interface GameAssets {
  /** every theme's room set, keyed by theme id */
  themes: Record<ThemeId, RoomTextures>;
  /** domain collection furniture, keyed by collection id (ADR-0105) */
  itemSets: Record<ItemSetId, ItemSetTextures>;
  sheets: Record<SheetKey, Spritesheet>;
}

export async function loadGameAssets(
  onProgress: (p: number) => void
): Promise<GameAssets> {
  const entries: { alias: string; src: string }[] = [];
  for (const theme of THEME_IDS) {
    for (const key of ROOM_ASSETS) {
      entries.push({ alias: `${theme}_${key}`, src: `/chef-art/room/${theme}/${FILE_OF[key]}` });
    }
    for (const t of WALL_LEFT_TILES) {
      entries.push({ alias: `${theme}_wl${t}`, src: `/chef-art/room/${theme}/${wallFile("left", t)}` });
    }
    for (const t of WALL_RIGHT_TILES) {
      entries.push({ alias: `${theme}_wr${t}`, src: `/chef-art/room/${theme}/${wallFile("right", t)}` });
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
    const set = { wallLeft: {}, wallRight: {} } as RoomTextures;
    for (const key of ROOM_ASSETS) set[key] = loaded[`${theme}_${key}`] as Texture;
    for (const t of WALL_LEFT_TILES) set.wallLeft[t] = loaded[`${theme}_wl${t}`] as Texture;
    for (const t of WALL_RIGHT_TILES) set.wallRight[t] = loaded[`${theme}_wr${t}`] as Texture;
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
