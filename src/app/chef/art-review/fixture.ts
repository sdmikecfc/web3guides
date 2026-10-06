/** Development fixture only. Uses production layout validation and simulation. */
import { defaultDesign } from "../game/_engine/building";
import { ITEMS, type CollectionId, type ItemDef, type ItemFacing, type ItemKind } from "../game/_engine/items";
import { shellAt, starterDesign, starterLayout } from "../game/_engine/rooms";
import { createWorld, stepWorld, validateLayout, WORLD_FIXED_DT, type PlacedSpec, type WorldState } from "../game/_engine/world";
import { FILE_OF, ITEM_SET_IDS, THEME_IDS, type RoomAssetKey, type ThemeId } from "../game/_view/art-manifest";

export const REVIEW_COLLECTIONS = [...THEME_IDS, ...ITEM_SET_IDS];
export type ReviewCollection = typeof REVIEW_COLLECTIONS[number];
export const FACINGS: ItemFacing[] = ["se", "sw", "nw", "ne"];
export type ToiletView = "comparison" | "working" | "broken";
export type ReviewScene = "starter" | "inspection";

export function collectionItem(kind: ItemKind, collection: CollectionId): ItemDef {
  const item = ITEMS.find((entry) => entry.collection === collection && entry.kind === kind)
    ?? ITEMS.find((entry) => entry.collection === "essentials" && entry.kind === kind);
  if (!item) throw new Error(`Missing inspection fixture: ${kind}`);
  return item;
}

export function reviewTheme(collection: ReviewCollection): ThemeId {
  return (THEME_IDS as readonly string[]).includes(collection) ? collection as ThemeId : "trattoria";
}

/** Exactly the front/back and mirror rule used by the actual scene. */
export function fixtureSprite(item: ItemDef, theme: ThemeId, facing: ItemFacing, broken = false) {
  const rear = facing === "nw" || facing === "ne";
  const back = rear && ["chair", "stove", "counter", "bench"].includes(item.art);
  const key: RoomAssetKey = item.art === "toilet"
    ? rear ? broken ? "toiletBrokenBack" : "toiletBack" : broken ? "toiletBroken" : "toilet"
    : back ? `${item.art}Back` as RoomAssetKey : item.art;
  const set = item.artSet ?? (item.collection === "essentials" ? theme : item.collection);
  const flat = item.kind === "rug" || item.kind === "doormat";
  const mirror = item.layer === "wall" ? facing === "se" || facing === "nw" : !flat && (facing === "sw" || facing === "ne");
  return { src: `/chef-art/room/${set}/${FILE_OF[key]}`, mirror };
}

export function createInspectionWorld(collection: ReviewCollection, shellIndex: number, facing: ItemFacing, mode: ReviewScene = "inspection") {
  const room = shellAt(shellIndex);
  const piece = (kind: ItemKind, gx: number, gy: number, direction: ItemFacing = facing): PlacedSpec => ({
    itemId: collectionItem(kind, collection).id, gx, gy, facing: direction,
  });
  const layout: PlacedSpec[] = mode === "starter" ? starterLayout(room).map((entry) => ({
    ...entry, itemId: collectionItem(ITEMS.find((item) => item.id === entry.itemId)!.kind, collection).id,
  })) : [
    piece("stove", 2, 0), piece("counter", 5, 0),
    piece("table", 2, 3, "se"), piece("chair", 1, 3, "se"), piece("chair", 2, 2, "sw"),
    piece("table", 5, 3, "se"), piece("chair", 6, 3, "nw"), piece("chair", 5, 4, "ne"),
    piece("bench", 0, 5), piece("plant", 0, 1, "se"), piece("rug", 3, 4, "se"),
    piece("partition", 8, 3), piece("wallArt", 0, 3, "se"), piece("wallArt", 8, 0, "sw"),
    // Keep both bathrooms out in the open for bowl, tank and damage inspection.
    piece("toilet", 7, 5), piece("toilet", 9, 5),
    piece("doormat", room.door.x, room.door.y, "se"),
  ];
  if (mode === "inspection" && shellIndex > 0) layout.push(
    piece("table", 11, 3, "se"), piece("chair", 10, 3, "se"), piece("chair", 11, 2, "sw"),
    piece("bench", 11, room.h - 2), piece("plant", room.w - 1, 0, "se"),
  );
  if (mode === "inspection" && shellIndex > 1) layout.push(
    piece("table", 13, 7, "se"), piece("chair", 14, 7, "nw"), piece("chair", 13, 8, "ne"),
    piece("stove", 10, 0), piece("counter", 13, 0), piece("partition", 9, 7),
  );
  const error = validateLayout(room, layout.map((entry, index) => ({ ...entry, facing: entry.facing ?? "se", uid: index + 1 })));
  if (error) throw new Error(`Inspection layout is invalid: ${error}`);
  const design = mode === "starter" ? starterDesign(room) : defaultDesign();
  design.storefront.sign = "Little Olive";
  if (mode === "inspection") {
    design.wallTiles = { "left,5": "sage", "left,6": "sage" };
    for (let x = 1; x <= 7; x++) for (let y = 0; y <= 1; y++) design.tiles[`${x},${y}`] = "checker";
    for (let x = 7; x <= 9; x++) for (let y = 4; y <= 6; y++) design.tiles[`${x},${y}`] = "sage";
  }
  const world = createWorld("dk-art-inspection-v1", room, {
    layout, shellIdx: shellIndex, hires: mode === "starter" ? { waiters: 1, chefs: 1 } : { waiters: shellIndex > 1 ? 3 : 2, chefs: shellIndex > 1 ? 2 : 1 },
    parkedUsd: 0, weeklyVolumeUsd: 0, design, careJobsActive: false,
    pantry: { stock: {}, levels: { margherita: 3, caciopepe: 2, tiramisu: 1 } },
    menu: { selected: ["margherita", "caciopepe", "tiramisu"], unlocked: ["margherita", "caciopepe", "tiramisu"], serves: {}, specialUnlocked: false, specialServes: 0, specialMastered: false },
  });
  // Start in a real, populated service state, obtained by advancing the engine.
  for (let tick = 0; tick < Math.ceil(90 / WORLD_FIXED_DT); tick++) stepWorld(world, room);
  applyToiletView(world, mode === "starter" ? "working" : "comparison");
  return { world, room };
}

export function applyToiletView(world: WorldState, view: ToiletView) {
  world.toilets.forEach((toilet, index) => {
    toilet.broken = view === "broken" || (view === "comparison" && index === 1);
    toilet.breakIn = 3600;
    toilet.fixClaim = 0;
  });
}
