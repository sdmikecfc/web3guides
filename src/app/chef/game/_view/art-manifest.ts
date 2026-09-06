/**
 * The art manifest: WHAT files the game loads, with no idea HOW.
 *
 * Split out of preload.ts (M7) so it can be imported without pulling in
 * pixi.js. preload.ts needs a browser; scripts/dk-art-check.mts runs in node
 * and dies on `navigator is not defined` the moment pixi is in the graph.
 *
 * Keeping the manifest here means the gate checks the SAME list the game
 * loads, rather than a hand-copied second list that drifts. Pure data only:
 * nothing in this file may import a renderer.
 */

/** The five country styles Mike locked in the demo round (ADR-0049). */
export const THEME_IDS = ["trattoria", "izakaya", "taqueria", "diner", "bistro"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/**
 * Domain collections (ADR-0105) ship FURNITURE ONLY and never follow the
 * player's chosen country style, so they load as their own small sets.
 */
export const ITEM_SET_IDS = ["neonlab", "bonebronze"] as const;
export type ItemSetId = (typeof ITEM_SET_IDS)[number];

export const ITEM_SET_ARTS = ["table", "chair", "counter", "stove", "plant"] as const;
export type ItemSetArt = (typeof ITEM_SET_ARTS)[number];

/**
 * WALLS ARE SIZED (M8b). A wall runs the length of one room edge, so a room
 * that can grow needs one per tile count: the left wall follows the shell's
 * `h`, the right wall its `w`. These lists must cover every size in
 * SHELL_SIZES (_engine/rooms.ts) and every size baked by dk-bake-room.mjs;
 * dk-art-check.mts is what proves all three agree.
 */
export const WALL_LEFT_TILES = [8, 9, 12] as const;
export const WALL_RIGHT_TILES = [10, 14, 18] as const;

export const ROOM_ASSETS = [
  "floor",
  "floorAlt",
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
export const FILE_OF: Record<RoomAssetKey, string> = {
  floor: "floor.png",
  floorAlt: "floor-alt.png",
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

export const wallFile = (side: "left" | "right", tiles: number): string =>
  `wall-${side}-${tiles}.png`;

/**
 * SIXTEEN guest looks (M7), up from eight.
 *
 * The sim still rolls a variant in 0..7 and that roll is part of the
 * determinism contract — hashWorld is fnv1a over the whole WorldState, so
 * widening the roll would move the hash. scene.ts instead maps
 * (variant, entity id) onto 0..15 at draw time: same rolls, same hash, twice
 * the faces in the room.
 */
export const GUEST_LOOKS = 16;

/**
 * YOUR CREW (M7d): how many chef and waiter looks the picker offers. Must
 * match CREW_LOOKS in scripts/dk-bake-chars.mjs; dk-art-check.mts proves every
 * sheet named here exists on disk with the frames the renderer asks for.
 */
export const CREW_LOOKS = 6;

export type SheetKey =
  | `guest${number}`
  | `chef${number}`
  | `waiter${number}`
  // effects (M7c): flame / sizzle / sparkle, packed by the same atlas step
  | "fx";

export const SHEET_KEYS: SheetKey[] = [
  ...Array.from({ length: GUEST_LOOKS }, (_, i) => `guest${i}` as SheetKey),
  ...Array.from({ length: CREW_LOOKS }, (_, i) => `chef${i}` as SheetKey),
  ...Array.from({ length: CREW_LOOKS }, (_, i) => `waiter${i}` as SheetKey),
  "fx",
];

/**
 * `code` is a two-letter country code, NOT a flag emoji.
 *
 * These used to be regional-indicator flag emoji. Windows ships no flag glyphs
 * in Segoe UI Emoji, so on the platform most of these players are using they
 * silently degraded to bare letter pairs, and the shop tabs read "IT JP MX US
 * FR" with no hint they were country styles at all. Caught by looking at a
 * headless screenshot, not by reading the code. A deliberate badge beats an
 * emoji that only renders on some machines.
 */
export const THEME_META: Record<ThemeId, { code: string; label: string; blurb: string }> = {
  trattoria: { code: "IT", label: "Trattoria", blurb: "Checkered cloths, wine on the shelf, nonna energy." },
  izakaya: { code: "JP", label: "Izakaya", blurb: "Paper lanterns, quiet wood and warm red." },
  taqueria: { code: "MX", label: "Taqueria", blurb: "Papel picado overhead, tile underfoot, loud and happy." },
  diner: { code: "US", label: "Diner", blurb: "Checker floor, chrome and mint, neon in the window." },
  bistro: { code: "FR", label: "Bistro", blurb: "Parquet and brass, deep green, flowers on every table." },
};
