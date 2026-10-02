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
  | "toilet";

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
  /** footprint in grid cells, anchored at (gx,gy) growing along +gx */
  cells: number;
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
    | "toilet";
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
  { kind: "table", art: "table", label: "Table", desc: "Seats two when you set chairs beside it.", cost: 120, cells: 1, solid: true },
  { kind: "chair", art: "chair", label: "Chair", desc: "A seat at the table beside it.", cost: 40, cells: 1, solid: true },
  { kind: "plant", art: "plant", label: "Plant", desc: "A little green in the corner.", cost: 60, cells: 1, solid: true },
  { kind: "rug", art: "rug", label: "Rug", desc: "Warms up the middle of the floor.", cost: 80, cells: 1, solid: false },
];

const STYLES: CollectionId[] = ["trattoria", "izakaya", "taqueria", "diner", "bistro"];

export const ITEMS: ItemDef[] = [
  // ── essentials: the starter room and the shared fixtures ────────────────
  { id: "table_basic", kind: "table", collection: "essentials", label: "Table", desc: "Seats two when you set chairs beside it.", cost: 100, cells: 1, solid: true, art: "table" },
  { id: "chair_basic", kind: "chair", collection: "essentials", label: "Chair", desc: "A seat at the table beside it.", cost: 35, cells: 1, solid: true, art: "chair" },
  { id: "stove_basic", kind: "stove", collection: "essentials", label: "Stove", desc: "Another burner. Room for another chef.", cost: 150, cells: 1, solid: true, art: "stove" },
  { id: "counter_basic", kind: "counter", collection: "essentials", label: "Pass counter", desc: "Where the kitchen hands plates to the floor.", cost: 180, cells: 2, solid: true, art: "counter" },
  { id: "plant_basic", kind: "plant", collection: "essentials", label: "Plant", desc: "A little green in the corner.", cost: 50, cells: 1, solid: true, art: "plant" },
  { id: "rug_basic", kind: "rug", collection: "essentials", label: "Rug", desc: "Warms up the middle of the floor.", cost: 70, cells: 1, solid: false, art: "rug" },
  { id: "doormat_basic", kind: "doormat", collection: "essentials", label: "Doormat", desc: "A welcome at the door.", cost: 25, cells: 1, solid: false, art: "doormat" },
  { id: "bench_basic", kind: "bench", collection: "essentials", label: "Waiting bench", desc: "Seats two guests while they wait for a table.", cost: 90, cells: 1, solid: true, art: "bench", waitSeats: 2 },
  { id: "toilet_basic", kind: "toilet", collection: "essentials", label: "Restroom", desc: "Guests notice. Keep it working and your service lifts.", cost: 130, cells: 1, solid: true, art: "toilet" },

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
      { kind: "table" as ItemKind, art: "table" as const, label: "Table", desc: "Seats two when you set chairs beside it.", cost: 140, cells: 1, solid: true },
      { kind: "chair" as ItemKind, art: "chair" as const, label: "Chair", desc: "A seat at the table beside it.", cost: 50, cells: 1, solid: true },
      { kind: "counter" as ItemKind, art: "counter" as const, label: "Pass counter", desc: "Where the kitchen hands plates to the floor.", cost: 200, cells: 2, solid: true },
      { kind: "plant" as ItemKind, art: "plant" as const, label: "Centrepiece", desc: "A piece of the market, standing in your room.", cost: 90, cells: 1, solid: true },
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
