/**
 * The Domain Kitchen ITEM CATALOG (ADR-0104/0105). One shared table used by
 * the shop, the inventory tray, the placement rules, and the renderer, so an
 * item's footprint and art key can never disagree between systems.
 *
 * COLLECTIONS group items for the shop tabs:
 *   "essentials" — always available (the starter pieces + hires)
 *   country styles — the five baked room styles, sold piece by piece
 *   domain collections — unlocked by providing LP to that domain (ADR-0105)
 *
 * Renderer-free by law: no Pixi, no React. `art` is the room-asset key the
 * view resolves against the ACTIVE theme's texture set; items with their own
 * baked art carry an explicit `artSet` instead.
 */

export type ItemKind =
  | "table"
  | "chair"
  | "counter"
  | "stove"
  | "plant"
  | "rug"
  | "doormat"
  | "bench"
  | "toilet"
  | "partition"
  | "wallArt";

export type ItemFacing = "se" | "sw" | "nw" | "ne";
export type PlacementLayer = "floor" | "furniture" | "wall";
export type AmenityCategory = "greenery" | "textiles" | "welcome" | "art";
export type ItemEffect = { type: "production"; capacity: number } | { type: "comfort"; category: AmenityCategory; points: number } | { type: "decoration" };

export type CollectionId =
  | "essentials"
  | "trattoria"
  | "izakaya"
  | "taqueria"
  | "diner"
  | "bistro"
  | "neonlab"
  | "bonebronze";

/** Art sets that do NOT follow the player's country style (ADR-0105). */
export type ArtSetId = "neonlab" | "bonebronze";

/**
 * The pilot markets (ADR-0039's markets model, minimally implemented so the
 * ADR-0105 tenure gate is honest). A market grants its dish (ADR-0090) and,
 * after LP tenure, its furniture COLLECTION.
 */
export interface MarketDef {
  id: string;
  label: string;
  collection: CollectionId;
  collectionName: string;
  blurb: string;
  /**
   * The market's fractional token on Doma. When set, the game reads the
   * player's REAL liquidity there (M5); when absent, that market still works
   * on the demo dials and says so rather than pretending to be live.
   */
  token?: `0x${string}`;
}
export const MARKETS: MarketDef[] = [
  {
    id: "software.ai",
    label: "software.ai",
    collection: "neonlab",
    collectionName: "Neon Lab",
    blurb: "Chrome, glass, and cool blue light.",
    // verified live by scripts/dk-probe.mts: 6 decimals, pools at all four
    // fee tiers against USDC.e
    token: "0xa100000000000d6e18bc155f425685e4badfe11c",
  },
  {
    id: "boner.com",
    label: "boner.com",
    collection: "bonebronze",
    collectionName: "Bone & Bronze",
    blurb: "Old stone, warm bronze, torchlight.",
    // resolved 2026-08-10 from the Doma API (fractionalTokenId 11,
    // GRADUATION_SUCCESSFUL, 6 decimals) and confirmed on-chain: real pools
    // with real liquidity at fee 100 and fee 3000 against USDC.e. Until this
    // was filled in, the second of the game's two markets silently ran on the
    // demo dials.
    token: "0xa1000000009a7a132488b2d48235b7024a843039",
  },
];
export function marketDef(id: string): MarketDef | undefined {
  return MARKETS.find((m) => m.id === id);
}
/** Days of continuous LP a market's collection asks for (DEMO CONFIG). */
export const COLLECTION_LP_DAYS = 3;

export interface ItemDef {
  id: string;
  kind: ItemKind;
  collection: CollectionId;
  label: string;
  desc: string;
  /** coin price; 0 = starter piece, never sold */
  cost: number;
  /** Legacy width; explicit footprint and orientation drive actual occupancy. */
  cells: number;
  footprint?: { width: number; height: number };
  layer?: PlacementLayer;
  effect?: ItemEffect;
  /** Local grid offsets for working positions, rotated with the item. */
  interactions?: { x: number; y: number }[];
  /** Equipment capabilities drive both live staff and offline production. */
  machine?: "stove" | "fryer" | "drinks";
  artPath?: string;
  artBackPath?: string;
  /** blocks walking (tables, stoves...) vs flat decor (rug, doormat) */
  solid: boolean;
  /** room-asset key the view maps onto the active theme's texture set */
  art:
    | "table"
    | "chair"
    | "counter"
    | "stove"
    | "plant"
    | "rug"
    | "doormat"
    | "bench"
    | "toilet"
    | "partition"
    | "wallArt";
  /** fixed art set: a domain piece keeps its look in any country style */
  artSet?: ArtSetId;
  /** market whose LP tenure unlocks this piece (ADR-0105) */
  market?: string;
  /** seats provided when a guest sits here directly (bench = waiting seats) */
  waitSeats?: number;
}

/**
 * M4a catalog. Every country style sells the same four pieces (their art is
 * already baked per theme); Essentials holds the starter set and the fixtures
 * that are not style-specific. Domain collections land with ADR-0105.
 */
const STYLE_PIECES: { kind: ItemKind; art: ItemDef["art"]; label: string; desc: string; cost: number; cells: number; solid: boolean }[] = [
  { kind: "table", art: "table", label: "Dining table", desc: "Add chairs beside it to seat guests. Keep a clear side for service.", cost: 120, cells: 1, solid: true },
  { kind: "chair", art: "chair", label: "Dining chair", desc: "Seats one guest beside a table. Leave a clear walking path.", cost: 40, cells: 1, solid: true },
  { kind: "plant", art: "plant", label: "Potted plant", desc: "Potted greenery that adds customer comfort.", cost: 60, cells: 1, solid: true },
  { kind: "rug", art: "rug", label: "Rug", desc: "Large floor rug that adds customer comfort. Guests can walk across it.", cost: 80, cells: 1, solid: false },
];

const STYLES: CollectionId[] = ["trattoria", "izakaya", "taqueria", "diner", "bistro"];

export const ITEMS: ItemDef[] = [
  { id: "fryer_basic", kind: "stove", machine: "fryer", collection: "essentials", label: "Golden fryer", desc: "Place it to start serving golden fries. Earn your first fryer on the food truck.", cost: 420, cells: 1, solid: true, art: "stove", artPath: "/chef-art/equipment/fryer.png", artBackPath: "/chef-art/equipment/fryer-back.png", effect: { type: "production", capacity: 1 } },
  { id: "drinks_basic", kind: "stove", machine: "drinks", collection: "essentials", label: "Lemonade station", desc: "Place it to serve fresh lemonade automatically. Discover it on your food truck.", cost: 320, cells: 1, solid: true, art: "stove", artPath: "/chef-art/equipment/drinks.png", artBackPath: "/chef-art/equipment/drinks-back.png", effect: { type: "production", capacity: 1 } },
  // ── essentials: the starter room and the shared fixtures ────────────────
  { id: "table_basic", kind: "table", collection: "essentials", label: "Dining table", desc: "Add chairs beside it to seat guests. Keep a clear side for service.", cost: 100, cells: 1, solid: true, art: "table" },
  { id: "chair_basic", kind: "chair", collection: "essentials", label: "Dining chair", desc: "Seats one guest beside a table. Leave a clear walking path.", cost: 35, cells: 1, solid: true, art: "chair" },
  { id: "stove_basic", kind: "stove", collection: "essentials", label: "Stove", desc: "Cooking station for one chef. Staff are hired separately.", cost: 150, cells: 1, solid: true, art: "stove" },
  { id: "counter_basic", kind: "counter", collection: "essentials", label: "Serving counter", desc: "Chefs leave dishes here for waiters. Extra counters do not add capacity.", cost: 180, cells: 2, solid: true, art: "counter" },
  { id: "plant_basic", kind: "plant", collection: "essentials", label: "Potted plant", desc: "Potted greenery that adds customer comfort.", cost: 50, cells: 1, solid: true, art: "plant" },
  { id: "rug_basic", kind: "rug", collection: "essentials", label: "Rug", desc: "Large floor rug that adds customer comfort. Guests can walk across it.", cost: 70, cells: 1, solid: false, art: "rug" },
  { id: "doormat_basic", kind: "doormat", collection: "essentials", label: "Doormat", desc: "Small floor mat that adds customer comfort. Guests can walk across it.", cost: 25, cells: 1, solid: false, art: "doormat" },
  { id: "bench_basic", kind: "bench", collection: "essentials", label: "Waiting bench", desc: "Seats two guests while they wait for a table.", cost: 90, cells: 1, solid: true, art: "bench", waitSeats: 2 },
  { id: "toilet_basic", kind: "toilet", collection: "essentials", label: "Toilet", desc: "Working toilet. Tap it to repair when it breaks.", cost: 130, cells: 1, solid: true, art: "toilet" },
  { id: "partition_basic", kind: "partition", collection: "essentials", label: "Room divider", desc: "Short wall that separates areas and blocks walking. Leave a clear route.", cost: 60, cells: 1, solid: true, art: "partition", effect: { type: "decoration" } },
  { id: "wallArt_basic", kind: "wallArt", collection: "essentials", label: "Framed print", desc: "Framed picture for a back wall. Adds customer comfort.", cost: 75, cells: 1, solid: false, art: "wallArt", layer: "wall", effect: { type: "comfort", category: "art", points: 2 } },

  // ── the five country styles, sold piece by piece ─────────────────────────
  ...STYLES.flatMap((c) =>
    STYLE_PIECES.map((p) => ({
      id: `${c}_${p.kind}`,
      kind: p.kind,
      collection: c,
      label: p.label,
      desc: p.desc,
      cost: p.cost,
      cells: p.cells,
      solid: p.solid,
      art: p.art,
    }))
  ),

  // ── DOMAIN COLLECTIONS (ADR-0105): unlocked by LP tenure at that market.
  // Their art is FIXED (artSet), so a neon table stays neon in a trattoria.
  ...MARKETS.flatMap((m) =>
    [
      { kind: "table" as ItemKind, art: "table" as const, label: "Dining table", desc: "Add chairs beside it to seat guests. Keep a clear side for service.", cost: 140, cells: 1, solid: true },
      { kind: "chair" as ItemKind, art: "chair" as const, label: "Dining chair", desc: "Seats one guest beside a table. Leave a clear walking path.", cost: 50, cells: 1, solid: true },
      { kind: "counter" as ItemKind, art: "counter" as const, label: "Serving counter", desc: "Chefs leave dishes here for waiters. Extra counters do not add capacity.", cost: 200, cells: 2, solid: true },
      { kind: "plant" as ItemKind, art: "plant" as const, label: "Potted plant", desc: "Potted greenery that adds customer comfort.", cost: 90, cells: 1, solid: true },
    ].map((p) => ({
      id: `${m.collection}_${p.kind}`,
      kind: p.kind,
      collection: m.collection,
      label: p.label,
      desc: p.desc,
      cost: p.cost,
      cells: p.cells,
      solid: p.solid,
      art: p.art,
      artSet: m.collection as ArtSetId,
      market: m.id,
    }))
  ),
];

const BY_ID = new Map<string, ItemDef>(ITEMS.map((i) => [i.id, i]));

// Complete every definition once so UI and simulation share the same effects.
for (const item of ITEMS) {
  item.footprint ??= { width: item.cells, height: 1 };
  item.layer ??= item.solid ? "furniture" : "floor";
  item.effect ??= item.kind === "stove" || item.kind === "table" || item.kind === "counter"
    ? { type: "production", capacity: item.kind === "table" ? 2 : 1 }
    : item.kind === "plant" ? { type: "comfort", category: "greenery", points: 2 }
    : item.kind === "rug" ? { type: "comfort", category: "textiles", points: 2 }
    : item.kind === "bench" || item.kind === "doormat" ? { type: "comfort", category: "welcome", points: 1 }
    : { type: "decoration" };
}

export function rotateFacing(facing: ItemFacing): ItemFacing {
  const directions: ItemFacing[] = ["se", "sw", "nw", "ne"];
  return directions[(directions.indexOf(facing) + 1) % directions.length];
}

function rotatedOffset(x: number, y: number, width: number, height: number, facing: ItemFacing): { x: number; y: number } {
  if (facing === "sw") return { x: height - 1 - y, y: x };
  if (facing === "nw") return { x: width - 1 - x, y: height - 1 - y };
  if (facing === "ne") return { x: y, y: width - 1 - x };
  return { x, y };
}

export function footprintCells(itemId: string, gx: number, gy: number, facing: ItemFacing = "se"): { x: number; y: number }[] {
  const def = itemDef(itemId);
  const { width, height } = def?.footprint ?? { width: def?.cells ?? 1, height: 1 };
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = rotatedOffset(x, y, width, height, facing);
    cells.push({ x: gx + offset.x, y: gy + offset.y });
  }
  return cells;
}

/** Candidate work positions in stable order, excluding the occupied footprint. */
export function interactionCells(itemId: string, gx: number, gy: number, facing: ItemFacing = "se"): { x: number; y: number }[] {
  const def = itemDef(itemId), { width, height } = def?.footprint ?? { width: 1, height: 1 };
  if (def?.interactions) return def.interactions.map((p) => { const q = rotatedOffset(p.x, p.y, width, height, facing); return { x: gx + q.x, y: gy + q.y }; });
  const occupied = footprintCells(itemId, gx, gy, facing), keys = new Set(occupied.map((p) => `${p.x},${p.y}`));
  const output: { x: number; y: number }[] = [];
  for (const p of occupied) for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
    const candidate = { x: p.x + dx, y: p.y + dy }, key = `${candidate.x},${candidate.y}`;
    if (!keys.has(key)) { keys.add(key); output.push(candidate); }
  }
  return output;
}

export function comfortOf(layout: { itemId: string }[]): { total: number; categories: Record<AmenityCategory, number>; patienceBonus: number } {
  const categories: Record<AmenityCategory, number> = { greenery: 0, textiles: 0, welcome: 0, art: 0 };
  const counts: Record<AmenityCategory, number> = { greenery: 0, textiles: 0, welcome: 0, art: 0 };
  for (const p of layout) {
    const effect = itemDef(p.itemId)?.effect;
    if (effect?.type !== "comfort") continue;
    categories[effect.category] = Math.min(4, categories[effect.category] + effect.points / 2 ** counts[effect.category]++);
  }
  const total = Math.min(12, Object.values(categories).reduce((sum, n) => sum + n, 0));
  return { total, categories, patienceBonus: total / 60 };
}

export function itemDef(id: string): ItemDef | undefined {
  return BY_ID.get(id);
}

/** Items a placement action may create, keyed for quick membership tests. */
export function isSolid(id: string): boolean {
  return itemDef(id)?.solid ?? true;
}

export function itemCells(id: string): number {
  return itemDef(id)?.cells ?? 1;
}
