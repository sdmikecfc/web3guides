/**
 * The Domain Kitchen world sim (ADR-0101/0102/0103/0104). RENDERER-FREE by
 * law: no Pixi, no React — it runs headless under scripts/dk-harness.mts
 * exactly as in the browser. All state is plain serializable data.
 *
 * M4a = THE LAYOUT ENGINE (ADR-0104): the player places everything. `layout`
 * is the source of truth for furniture; `rebuildDerived()` recomputes seats,
 * tables, serve tiles, staff anchors, the walk grid and Gus's seat from it.
 * Placement is validated for overlap AND reachability, so a room can never be
 * arranged into one where guests cannot reach a table or the chef cannot
 * reach a stove. Edit mode politely empties the floor first.
 *
 * Carried: earn-and-spend income (0103), always-on autopilot + presence
 * quality (0102), the no-sliding contract (walkDist == distance moved),
 * player input ONLY through applyAction (determinism = seed + action tape).
 */

import { fnv1a, mulberryNext } from "./rng";
import { buildGrid, findPath, type Grid } from "./path";
import { COLLECTION_LP_DAYS, itemDef, MARKETS, type ItemKind } from "./items";
import { courseById } from "./academy";
import {
  COMMONS,
  DAILY_DELIVERY,
  dishQualityBonus,
  MAX_DISH_LEVEL,
  nextRecipe,
  RARE_DROP_CAP,
  RARES,
  RECIPES,
  VOLUME_DROP_CAP,
  volumeDropInterval,
} from "./pantry";
import { GROWTH_SLOTS, SECOND_STOVE, SHELL, STARTER_LAYOUT } from "./rooms";

export const WORLD_FIXED_DT = 1 / 60;
/** 30 real seconds per game hour = a 12 minute game day. */
export const HOURS_PER_SEC = 1 / 30;

export type Facing = "se" | "sw";
export type Heading = "se" | "sw" | "ne" | "nw";

/** The room SHELL: what the player cannot move (ADR-0104). */
export interface RoomDef {
  w: number;
  h: number;
  windowsLeft: number[];
  windowsRight: number[];
  door: { x: number; y: number };
}

/** A piece the player has placed. `uid` is the instance identity. */
export interface PlacedItem {
  uid: number;
  itemId: string;
  gx: number;
  gy: number;
  facing: Facing;
}
/** Placement without an identity yet (starter data, growth slots). */
export interface PlacedSpec {
  itemId: string;
  gx: number;
  gy: number;
  facing?: Facing;
}

export interface SteamPuff {
  gx: number;
  gy: number;
  z: number;
  age: number;
  life: number;
  drift: number;
}

export type EntityKind = "guest" | "waiter" | "chef";
export type EntityState =
  | "enter"
  | "sit"
  | "eat"
  | "leave"
  | "toBench"
  | "wait"
  | "idle"
  | "toStove"
  | "cook"
  | "toPass"
  | "pickup"
  | "toTable"
  | "serve"
  | "toAnchor"
  | "toBus"
  | "bus"
  | "toChore"
  | "chore"
  | "clockOut";

export interface Entity {
  id: number;
  kind: EntityKind;
  variant: number;
  x: number;
  y: number;
  path: { x: number; y: number }[];
  speed: number;
  state: EntityState;
  stateT: number;
  heading: Heading;
  /** cumulative tiles traveled — the view's ONLY source of walk frames */
  walkDist: number;
  carrying: boolean;
  seatIdx: number;
  /** guests only: the bench they are waiting on, -1 otherwise (ADR-0107) */
  benchIdx: number;
  taskSeat: number;
  taskTable: number;
  /** staff chores (ADR-0106): a litter id, or a restroom uid, or -1 */
  taskTrash: number;
  taskToilet: number;
  eatT: number;
  cookT: number;
  hustleT: number;
  waitT: number;
  emote: "" | "heart" | "coin";
  emoteT: number;
  name: string;
  dead: boolean;
}

export interface Seat {
  gx: number;
  gy: number;
  facing: Facing;
  tableIdx: number;
  serveX: number;
  serveY: number;
  occupiedBy: number;
}

export interface TableState {
  uid: number;
  gx: number;
  gy: number;
  serveX: number;
  serveY: number;
  dirty: number;
  busClaim: number;
}

/** A placed waiting bench (ADR-0107). One slot per waiting guest. */
export interface BenchState {
  uid: number;
  gx: number;
  gy: number;
  facing: Facing;
  /** entity id per slot, 0 = free */
  slots: number[];
}

/** A placed restroom (ADR-0106). Breaks now and then; wants fixing. */
export interface ToiletState {
  uid: number;
  gx: number;
  gy: number;
  /** tile a person stands on to work on it */
  workX: number;
  workY: number;
  broken: boolean;
  /** seconds until the next breakage (only counts down while working) */
  breakIn: number;
  /** staff id that claimed the repair, 0 = unclaimed */
  fixClaim: number;
}

/** A bit of litter on the floor (ADR-0106). Charm, never filth. */
export interface Litter {
  id: number;
  gx: number;
  gy: number;
  /** staff id that claimed the sweep, 0 = unclaimed */
  claim: number;
}

export type OrderStage = "queued" | "cooking" | "ready" | "serving";
export interface Order {
  seatIdx: number;
  stage: OrderStage;
  waiterId: number;
  chefId: number;
}

export interface Dials {
  parkedUsd: number;
  weeklyVolumeUsd: number;
}

/** Staff are HIRED (counts), not placed (ADR-0104). */
export interface HireState {
  waiters: number;
  chefs: number;
}

export interface MenuState {
  dishes: { key: string; name: string; serves: number }[];
  specialUnlocked: boolean;
  specialServes: number;
  specialMastered: boolean;
}

/** The pantry (ADR-0106): what is in stock, and how good each dish is. */
export interface PantryState {
  /** ingredientId -> count in stock. Consumed by upgrades, never bought. */
  stock: Record<string, number>;
  /** dish key -> 1..MAX_DISH_LEVEL */
  levels: Record<string, number>;
  /** per-day drop budgets, reset on the day rollover */
  dropDay: number;
  volumeDrops: number;
  rareDrops: number;
  volumeDropIn: number;
  /** what the last delivery brought, for the arrival toast */
  lastDelivery: string[];
  lastDeliveryDay: number;
}
export const SPECIAL_MASTERY = 15;

export interface Moment {
  day: number;
  hrs: number;
  kind: "visit" | "gus" | "special" | "mastered" | "busy" | "dish" | "delivery" | "course";
  emote: string;
}

export type HireKind = "waiter" | "chef";

export type Action =
  | { type: "bus"; tableIdx: number }
  | { type: "hustle"; entityId: number }
  | { type: "dials"; parkedUsd: number; weeklyVolumeUsd: number }
  | { type: "buyHire"; hire: HireKind }
  | { type: "buyItem"; itemId: string }
  | { type: "sellItem"; itemId: string }
  | { type: "completeCourse"; id: string }
  | { type: "market"; id: string }
  | { type: "upgradeDish"; key: string }
  | { type: "sweep"; trashId: number }
  | { type: "fixToilet"; uid: number }
  | { type: "place"; itemId: string; gx: number; gy: number; facing?: Facing }
  | { type: "move"; uid: number; gx: number; gy: number; facing?: Facing }
  | { type: "rotate"; uid: number }
  | { type: "store"; uid: number }
  | { type: "edit"; on: boolean };

/** Why a placement was refused — player-facing, kind, no jargon. */
export type PlaceError =
  | ""
  | "That does not fit inside the room."
  | "Something is already there."
  | "Guests could not reach every seat."
  | "The crew could not reach the kitchen."
  | "You do not own one of those yet.";

export interface WorldState {
  seed: number;
  rngState: number;
  tick: number;
  timeSec: number;
  clockHrs: number;
  day: number;
  dials: Dials;
  /** which market the position sits at (ADR-0039 markets, minimal) */
  market: string;
  /** days of LP tenure per market — the ADR-0105 collection gate */
  lpDays: Record<string, number>;
  hires: HireState;
  /** the player's arrangement — the source of truth for furniture */
  layout: PlacedItem[];
  /** owned but not placed, by itemId */
  inventory: Record<string, number>;
  nextUid: number;
  editing: boolean;
  presence: number;
  playMoney: number;
  coinFloat: number;
  entities: Entity[];
  nextId: number;
  spawnIn: number;
  // ── derived from layout (rebuildDerived); never hand-edited ──────────────
  grid: Grid;
  seats: Seat[];
  tables: TableState[];
  benches: BenchState[];
  toilets: ToiletState[];
  /** litter is world state, not layout: it comes and goes with traffic */
  trash: Litter[];
  nextTrashId: number;
  trashIn: number;
  stoveAnchors: { x: number; y: number }[];
  passAnchor: { x: number; y: number };
  waiterAnchors: { x: number; y: number }[];
  stovePos: { gx: number; gy: number }[];
  gusSeatIdx: number;
  // ────────────────────────────────────────────────────────────────────────
  gusVisitDay: number;
  menu: MenuState;
  pantry: PantryState;
  /** Academy courses finished (ADR-0050) */
  courses: string[];
  moments: Moment[];
  orders: Order[];
  door: { x: number; y: number };
  stoveFlip: number;
  stats: {
    arrived: number;
    cooked: number;
    served: number;
    departed: number;
    dirtied: number;
    busedAuto: number;
    busedByPlayer: number;
    hustles: number;
    gusVisits: number;
    hearts: number;
    purchases: number;
    coinsFromPosition: number;
    placements: number;
    /** ADR-0107: waiting area. All private diagnostics, never public. */
    waited: number;
    seatedFromBench: number;
    leftWaiting: number;
    turnedAway: number;
    /** ADR-0106: the pantry */
    dishUpgrades: number;
    commonsDropped: number;
    raresDropped: number;
    /** ADR-0106: upkeep */
    trashDropped: number;
    trashSweptAuto: number;
    trashSweptByPlayer: number;
    toiletBreaks: number;
    toiletFixedAuto: number;
    toiletFixedByPlayer: number;
    /** the service record: the best quality this room has held */
    bestQuality: number;
  };
  ambient: {
    lampPhase: number;
    candle: number;
    candleTarget: number;
    candleRetargetIn: number;
    steam: SteamPuff[];
    steamIn: number;
  };
}

// ── the economy (DEMO CONFIG per ADR-0048/0103) ───────────────────────────
export interface Tier {
  name: string;
  seats: number;
}
export const TIERS: Tier[] = [
  { name: "Food Cart", seats: 0 },
  { name: "Corner Spot", seats: 4 },
  { name: "Bistro", seats: 6 },
  { name: "House", seats: 8 },
  { name: "Flagship", seats: 10 },
];
export function tierFor(seatsOwned: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (seatsOwned >= tier.seats) t = tier;
  return t;
}

/** coins per GAME HOUR from the position — the 0043 log curves as income */
export function incomePerHour(dials: Dials): { lp: number; vol: number } {
  return {
    lp: 10 * Math.log1p(Math.max(0, dials.parkedUsd) / 10),
    vol: 14 * Math.log1p(Math.max(0, dials.weeklyVolumeUsd) / 40),
  };
}

export function crowdRate(rating: number, friendsToday: number): number {
  return 1.6 + rating * 1.05 + friendsToday * 0.45;
}

/** Hires keep the ADR-0103 ladder; furniture prices live in the item catalog. */
export const HIRE_SHOP: Record<HireKind, { costs: number[]; max: number }> = {
  waiter: { costs: [0, 200], max: 2 },
  chef: { costs: [0, 350], max: 2 },
};

export function hireCost(w: WorldState, hire: HireKind): number | null {
  const cur = hire === "waiter" ? w.hires.waiters : w.hires.chefs;
  const cfg = HIRE_SHOP[hire];
  if (cur >= cfg.max) return null;
  const c = cfg.costs[cur];
  return typeof c === "number" ? c : null;
}

// ── quality v2 (ADR-0106): four parts, and they add to exactly 100 ────────
const BASELINE_QUALITY = 45;
const PRESENCE_CAP = 25;
/** most quality a spotless room with working restrooms contributes */
export const CLEAN_MAX = 15;
/** litter above this is as bad as it gets, and staff clear it long before */
export const TRASH_VISIBLE_CAP = 4;
/** a room with no restroom at all tops out here (upside to buy one, not a fine) */
const NO_TOILET_FACTOR = 0.75;
const COOK_BASE = 13;
/** what a piece sitting in storage sells back for (DEMO CONFIG) */
export const SELL_BACK = 0.5;
/** seconds of service between bits of litter, scaled by how busy the room is */
const TRASH_BASE_SEC = 55;
/** a restroom runs this long between breakages (DEMO CONFIG) */
const TOILET_LIFE_SEC = 190;

/**
 * Quality v2 (ADR-0106): a bounded sum of EARNED parts. Presence comes from
 * your hands, dish levels from the pantry. Cleanliness joins in M4e. Coins
 * reach none of them — quality is the one thing money cannot buy.
 */
export function qualityParts(w: WorldState): {
  base: number;
  presence: number;
  cleanliness: number;
  dishes: number;
  total: number;
} {
  const presence = Math.min(PRESENCE_CAP, Math.max(0, w.presence));
  const dishes = dishQualityBonus(w.pantry.levels);
  const litterFrac = Math.min(1, w.trash.length / TRASH_VISIBLE_CAP);
  // A restroom is UPSIDE, never a fine: owning one that happens to be broken
  // is exactly as good as owning none at all, so a breakage costs you the
  // bonus and never digs below where you started (ADR-0102's kindness law).
  const working = w.toilets.filter((t) => !t.broken).length;
  const toiletFactor =
    w.toilets.length === 0
      ? NO_TOILET_FACTOR
      : NO_TOILET_FACTOR + (1 - NO_TOILET_FACTOR) * (working / w.toilets.length);
  const cleanliness = CLEAN_MAX * (1 - litterFrac) * toiletFactor;
  const total = Math.max(
    0,
    Math.min(100, BASELINE_QUALITY + presence + cleanliness + dishes)
  );
  return { base: BASELINE_QUALITY, presence, cleanliness, dishes, total };
}

export function qualityOf(w: WorldState): number {
  return qualityParts(w).total;
}

/** Do we hold everything this dish's next level asks for? */
export function canUpgradeDish(w: WorldState, key: string): boolean {
  const recipe = nextRecipe(key, w.pantry.levels[key] ?? 1);
  if (!recipe) return false;
  for (const [id, n] of Object.entries(recipe)) {
    if ((w.pantry.stock[id] ?? 0) < n) return false;
  }
  return true;
}

function addStock(w: WorldState, id: string, n = 1): void {
  w.pantry.stock[id] = (w.pantry.stock[id] ?? 0) + n;
}

/** Tenure days banked at a market (ADR-0105). Never decreases. */
export function lpDaysAt(w: WorldState, marketId: string): number {
  return w.lpDays[marketId] ?? 0;
}

/** Is this market's furniture collection unlocked yet? */
export function collectionUnlocked(w: WorldState, marketId: string): boolean {
  return lpDaysAt(w, marketId) >= COLLECTION_LP_DAYS;
}

/** May this item be bought right now? Domain pieces need LP tenure. */
export function itemPurchasable(w: WorldState, itemId: string): boolean {
  const def = itemDef(itemId);
  if (!def || def.cost <= 0) return false;
  if (def.market) return collectionUnlocked(w, def.market);
  return true;
}

export function countKind(w: WorldState, kind: ItemKind): number {
  let n = 0;
  for (const p of w.layout) if (itemDef(p.itemId)?.kind === kind) n++;
  return n;
}

export interface Service {
  tier: Tier;
  seatsOpen: number;
  openTables: number;
  stoves: number;
  speed: number;
  cookDur: number;
  waitersTarget: number;
  chefsTarget: number;
  arrivalsPerMin: number;
  spawnInterval: number;
  night: boolean;
  income: { lp: number; vol: number };
}

export function deriveService(w: WorldState): Service {
  const seatsOpen = w.seats.length;
  const stoves = w.stovePos.length;
  const tier = tierFor(seatsOpen);
  const cookDur = COOK_BASE * (stoves >= 2 ? 0.8 : 1);
  const speed = (60 / cookDur) * Math.max(1, w.hires.chefs);
  const rating = 1 + (4 * qualityOf(w)) / 100;
  const night = w.clockHrs >= 22 || w.clockHrs < 7;
  const gusHere = w.entities.some((e) => e.name === "Gus" && !e.dead);
  const arrivals = crowdRate(rating, gusHere ? 1 : 0) * (night ? 0.35 : 1);
  return {
    tier,
    seatsOpen,
    openTables: w.tables.length,
    stoves,
    speed,
    cookDur,
    waitersTarget: w.hires.waiters,
    chefsTarget: w.hires.chefs,
    arrivalsPerMin: arrivals,
    spawnInterval: Math.min(30, Math.max(4, 60 / arrivals)),
    night,
    income: incomePerHour(w.dials),
  };
}

const SPEED: Record<EntityKind, number> = {
  guest: 1.6,
  waiter: 2.2,
  chef: 1.8,
};

export function effSpeed(e: Entity): number {
  return e.speed * (e.hustleT > 0 ? 1.55 : 1);
}

// ── layout geometry ────────────────────────────────────────────────────────

const ORTHO = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

/** Cells a placement occupies. */
export function cellsOf(itemId: string, gx: number, gy: number): { x: number; y: number }[] {
  const n = itemDef(itemId)?.cells ?? 1;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ x: gx + i, y: gy });
  return out;
}

/** BFS of every walkable cell reachable from (sx,sy). Seat cells terminate. */
function floodOpen(grid: Grid, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(grid.w * grid.h);
  const idx = (x: number, y: number) => y * grid.w + x;
  if (sx < 0 || sy < 0 || sx >= grid.w || sy >= grid.h) return seen;
  if (grid.cells[idx(sx, sy)] !== 0) return seen;
  const q: number[] = [idx(sx, sy)];
  seen[q[0]] = 1;
  while (q.length > 0) {
    const cur = q.shift() as number;
    const cx = cur % grid.w;
    const cy = Math.floor(cur / grid.w);
    for (const [dx, dy] of ORTHO) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
      const ni = idx(nx, ny);
      if (seen[ni] || grid.cells[ni] !== 0) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  return seen;
}

/** First open+reachable orthogonal neighbor of a cell, in fixed order. */
function openNeighbor(
  grid: Grid,
  reach: Uint8Array,
  gx: number,
  gy: number,
  prefer?: readonly (readonly [number, number])[]
): { x: number; y: number } | null {
  const order = prefer ?? ORTHO;
  for (const [dx, dy] of order) {
    const nx = gx + dx;
    const ny = gy + dy;
    if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
    const i = ny * grid.w + nx;
    if (grid.cells[i] === 0 && reach[i]) return { x: nx, y: ny };
  }
  return null;
}

/**
 * Validate a hypothetical layout: everything in bounds, no solid overlap, and
 * every station reachable from the door. Returns "" when valid.
 */
export function validateLayout(room: RoomDef, layout: PlacedItem[]): PlaceError {
  // bounds + overlap
  const occupied = new Map<number, boolean>();
  for (const p of layout) {
    const def = itemDef(p.itemId);
    if (!def) continue;
    for (const c of cellsOf(p.itemId, p.gx, p.gy)) {
      if (c.x < 0 || c.y < 0 || c.x >= room.w || c.y >= room.h) {
        return "That does not fit inside the room.";
      }
      if (!def.solid) continue; // flat decor never conflicts
      const key = c.y * room.w + c.x;
      if (occupied.get(key)) return "Something is already there.";
      occupied.set(key, true);
    }
  }

  const grid = buildGrid(room.w, room.h, layout);
  const door = room.door;
  if (grid.cells[door.y * room.w + door.x] !== 0) {
    return "Something is already there.";
  }
  const reach = floodOpen(grid, door.x, door.y);

  // every seat and bench needs a reachable neighbor to walk up from
  for (const p of layout) {
    const def = itemDef(p.itemId);
    if (!def) continue;
    if (def.kind === "chair" || def.kind === "bench") {
      if (!openNeighbor(grid, reach, p.gx, p.gy)) return "Guests could not reach every seat.";
    }
  }
  // tables need a serve tile; stoves and the counter need work tiles
  for (const p of layout) {
    const def = itemDef(p.itemId);
    if (!def) continue;
    if (def.kind === "table") {
      if (!openNeighbor(grid, reach, p.gx, p.gy)) return "Guests could not reach every seat.";
    } else if (def.kind === "stove" || def.kind === "counter") {
      let ok = false;
      for (const c of cellsOf(p.itemId, p.gx, p.gy)) {
        if (openNeighbor(grid, reach, c.x, c.y)) {
          ok = true;
          break;
        }
      }
      if (!ok) return "The crew could not reach the kitchen.";
    }
  }
  return "";
}

/**
 * Recompute everything derived from the layout. Runtime state (seat
 * occupancy, table dirt) is preserved by grid position so a rearrangement
 * never loses a guest's seat or forgets an unbused table.
 */
export function rebuildDerived(w: WorldState, room: RoomDef): void {
  const prevSeats = new Map(w.seats?.map((s) => [`${s.gx},${s.gy}`, s]) ?? []);
  const prevTables = new Map(w.tables?.map((t) => [`${t.gx},${t.gy}`, t]) ?? []);
  const prevBenches = new Map(w.benches?.map((b) => [`${b.gx},${b.gy}`, b]) ?? []);

  const grid = buildGrid(room.w, room.h, w.layout);
  w.grid = grid;
  const reach = floodOpen(grid, room.door.x, room.door.y);

  // tables, in depth order (closest to the kitchen first)
  const tableItems = w.layout
    .filter((p) => itemDef(p.itemId)?.kind === "table")
    .sort((a, b) => (a.gx + a.gy !== b.gx + b.gy ? a.gx + a.gy - (b.gx + b.gy) : a.gx - b.gx));

  w.tables = tableItems.map((p) => {
    const serve = openNeighbor(grid, reach, p.gx, p.gy);
    const prev = prevTables.get(`${p.gx},${p.gy}`);
    return {
      uid: p.uid,
      gx: p.gx,
      gy: p.gy,
      serveX: serve ? serve.x : -1,
      serveY: serve ? serve.y : -1,
      dirty: prev ? prev.dirty : 0,
      busClaim: prev ? prev.busClaim : 0,
    };
  });

  // seats: a chair orthogonally adjacent to a table
  const seats: Seat[] = [];
  for (const p of w.layout) {
    if (itemDef(p.itemId)?.kind !== "chair") continue;
    let tableIdx = -1;
    for (const [dx, dy] of ORTHO) {
      const i = w.tables.findIndex((t) => t.gx === p.gx + dx && t.gy === p.gy + dy);
      if (i >= 0) {
        tableIdx = i;
        break;
      }
    }
    if (tableIdx < 0) continue; // a chair on its own is just decor
    const t = w.tables[tableIdx];
    if (t.serveX < 0) continue; // unreachable table: not a usable seat
    if (!openNeighbor(grid, reach, p.gx, p.gy)) continue;
    const prev = prevSeats.get(`${p.gx},${p.gy}`);
    seats.push({
      gx: p.gx,
      gy: p.gy,
      facing: p.facing,
      tableIdx,
      serveX: t.serveX,
      serveY: t.serveY,
      occupiedBy: prev ? prev.occupiedBy : 0,
    });
  }
  w.seats = seats;

  // waiting benches (ADR-0107), in the same depth order as tables
  w.benches = w.layout
    .filter((p) => itemDef(p.itemId)?.kind === "bench")
    .filter((p) => openNeighbor(grid, reach, p.gx, p.gy) !== null)
    .sort((a, b) => (a.gx + a.gy !== b.gx + b.gy ? a.gx + a.gy - (b.gx + b.gy) : a.gx - b.gx))
    .map((p) => {
      const slots = itemDef(p.itemId)?.waitSeats ?? 2;
      const prev = prevBenches.get(`${p.gx},${p.gy}`);
      return {
        uid: p.uid,
        gx: p.gx,
        gy: p.gy,
        facing: p.facing,
        slots: Array.from({ length: slots }, (_, i) => prev?.slots[i] ?? 0),
      };
    });

  // restrooms (ADR-0106), keeping whatever state they were already in
  const prevToilets = new Map(w.toilets?.map((t) => [`${t.gx},${t.gy}`, t]) ?? []);
  w.toilets = w.layout
    .filter((p) => itemDef(p.itemId)?.kind === "toilet")
    .map((p) => {
      const work = openNeighbor(grid, reach, p.gx, p.gy);
      const prev = prevToilets.get(`${p.gx},${p.gy}`);
      return {
        uid: p.uid,
        gx: p.gx,
        gy: p.gy,
        workX: work ? work.x : -1,
        workY: work ? work.y : -1,
        broken: prev ? prev.broken : false,
        breakIn: prev ? prev.breakIn : TOILET_LIFE_SEC,
        fixClaim: prev ? prev.fixClaim : 0,
      };
    });

  // litter that ended up under new furniture just gets tidied away
  w.trash = w.trash.filter((t) => grid.cells[t.gy * room.w + t.gx] === 0);

  // kitchen anchors follow the kitchen wherever the player puts it
  const stoves = w.layout.filter((p) => itemDef(p.itemId)?.kind === "stove");
  w.stovePos = stoves.map((p) => ({ gx: p.gx, gy: p.gy }));
  w.stoveAnchors = stoves
    .map((p) => openNeighbor(grid, reach, p.gx, p.gy, [[0, 1], [1, 0], [-1, 0], [0, -1]]))
    .filter((a): a is { x: number; y: number } => a !== null);
  if (w.stoveAnchors.length === 0) w.stoveAnchors = [{ x: room.door.x, y: room.door.y }];

  const counter = w.layout.find((p) => itemDef(p.itemId)?.kind === "counter");
  if (counter) {
    const cells = cellsOf(counter.itemId, counter.gx, counter.gy);
    let pass: { x: number; y: number } | null = null;
    for (const c of cells) {
      pass = openNeighbor(grid, reach, c.x, c.y, [[0, 1], [1, 0], [-1, 0], [0, -1]]);
      if (pass) break;
    }
    w.passAnchor = pass ?? { x: room.door.x, y: room.door.y };
  } else {
    w.passAnchor = { x: room.door.x, y: room.door.y };
  }
  // waiter stations: open cells near the pass, else fall back to the door
  const wa: { x: number; y: number }[] = [];
  const pa = w.passAnchor;
  for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [-1, 1]] as const) {
    const nx = pa.x + dx;
    const ny = pa.y + dy;
    if (nx < 0 || ny < 0 || nx >= room.w || ny >= room.h) continue;
    const i = ny * room.w + nx;
    if (grid.cells[i] === 0 && reach[i]) wa.push({ x: nx, y: ny });
    if (wa.length >= 2) break;
  }
  while (wa.length < 2) wa.push({ x: room.door.x, y: room.door.y });
  w.waiterAnchors = wa;

  // Gus keeps the first table's seat
  w.gusSeatIdx = seats.findIndex((s) => s.tableIdx === 0 && s.facing === "se");
  if (w.gusSeatIdx < 0) w.gusSeatIdx = seats.findIndex((s) => s.tableIdx === 0);
}

export function createWorld(
  seedStr: string,
  room: RoomDef,
  opts?: {
    parkedUsd?: number;
    weeklyVolumeUsd?: number;
    playMoney?: number;
    hires?: Partial<HireState>;
    layout?: PlacedSpec[];
    inventory?: Record<string, number>;
    market?: string;
    lpDays?: Record<string, number>;
    courses?: string[];
  }
): WorldState {
  const seed = fnv1a(seedStr);
  const w: WorldState = {
    seed,
    rngState: seed,
    tick: 0,
    timeSec: 0,
    clockHrs: 17,
    day: 0,
    dials: {
      parkedUsd: opts?.parkedUsd ?? 25,
      weeklyVolumeUsd: opts?.weeklyVolumeUsd ?? 60,
    },
    market: opts?.market ?? MARKETS[0].id,
    lpDays: { ...(opts?.lpDays ?? {}) },
    hires: {
      waiters: Math.max(1, Math.min(HIRE_SHOP.waiter.max, opts?.hires?.waiters ?? 1)),
      chefs: Math.max(1, Math.min(HIRE_SHOP.chef.max, opts?.hires?.chefs ?? 1)),
    },
    layout: [],
    inventory: { ...(opts?.inventory ?? {}) },
    nextUid: 1,
    editing: false,
    presence: 0,
    playMoney: opts?.playMoney ?? 20,
    coinFloat: 0,
    entities: [],
    nextId: 1,
    spawnIn: 1.5,
    grid: { w: room.w, h: room.h, cells: new Uint8Array(room.w * room.h) },
    seats: [],
    tables: [],
    benches: [],
    toilets: [],
    trash: [],
    nextTrashId: 1,
    trashIn: 40,
    stoveAnchors: [],
    passAnchor: { x: room.door.x, y: room.door.y },
    waiterAnchors: [],
    stovePos: [],
    gusSeatIdx: -1,
    gusVisitDay: -1,
    menu: {
      dishes: [
        { key: "margherita", name: "Margherita", serves: 0 },
        { key: "caciopepe", name: "Cacio e Pepe", serves: 0 },
        { key: "tiramisu", name: "Tiramisu", serves: 0 },
      ],
      specialUnlocked: false,
      specialServes: 0,
      specialMastered: false,
    },
    pantry: {
      stock: {},
      levels: Object.fromEntries(Object.keys(RECIPES).map((k) => [k, 1])),
      dropDay: 0,
      volumeDrops: 0,
      rareDrops: 0,
      volumeDropIn: 20,
      lastDelivery: [],
      lastDeliveryDay: -1,
    },
    courses: [...(opts?.courses ?? [])],
    moments: [],
    orders: [],
    door: { ...room.door },
    stoveFlip: 0,
    stats: {
      arrived: 0,
      cooked: 0,
      served: 0,
      departed: 0,
      dirtied: 0,
      busedAuto: 0,
      busedByPlayer: 0,
      hustles: 0,
      gusVisits: 0,
      hearts: 0,
      purchases: 0,
      coinsFromPosition: 0,
      placements: 0,
      waited: 0,
      seatedFromBench: 0,
      leftWaiting: 0,
      turnedAway: 0,
      dishUpgrades: 0,
      commonsDropped: 0,
      raresDropped: 0,
      trashDropped: 0,
      trashSweptAuto: 0,
      trashSweptByPlayer: 0,
      toiletBreaks: 0,
      toiletFixedAuto: 0,
      toiletFixedByPlayer: 0,
      bestQuality: 0,
    },
    ambient: {
      lampPhase: 0,
      candle: 1,
      candleTarget: 1,
      candleRetargetIn: 0.12,
      steam: [],
      steamIn: 0.6,
    },
  };

  for (const spec of opts?.layout ?? STARTER_LAYOUT) {
    w.layout.push({
      uid: w.nextUid++,
      itemId: spec.itemId,
      gx: spec.gx,
      gy: spec.gy,
      facing: spec.facing ?? "se",
    });
  }
  rebuildDerived(w, room);

  w.entities.push(makeEntity(w, "chef", w.stoveAnchors[0].x, w.stoveAnchors[0].y, "ne"));
  w.entities.push(makeEntity(w, "waiter", w.waiterAnchors[0].x, w.waiterAnchors[0].y, "sw"));
  return w;
}

/**
 * Build a starter layout that honours an older save's counts (ADR-0104
 * migration: an M3 save's tables/stoves become placed pieces).
 */
export function layoutForCounts(tables: number, stoves: number): PlacedSpec[] {
  const specs: PlacedSpec[] = [...STARTER_LAYOUT];
  if (stoves >= 2) specs.push(SECOND_STOVE);
  const extraTables = Math.max(0, Math.min(3, tables - 2));
  for (let i = 0; i < extraTables; i++) {
    specs.push(...GROWTH_SLOTS.slice(i * 3, i * 3 + 3));
  }
  return specs;
}

function makeEntity(
  w: WorldState,
  kind: EntityKind,
  x: number,
  y: number,
  heading: Heading
): Entity {
  return {
    id: w.nextId++,
    kind,
    variant: 0,
    x,
    y,
    path: [],
    speed: SPEED[kind],
    state: "idle",
    stateT: 0,
    heading,
    walkDist: 0,
    carrying: false,
    seatIdx: -1,
    benchIdx: -1,
    taskSeat: -1,
    taskTable: -1,
    taskTrash: -1,
    taskToilet: -1,
    eatT: 0,
    cookT: 0,
    hustleT: 0,
    waitT: 0,
    emote: "",
    emoteT: 0,
    name: "",
    dead: false,
  };
}

function roll(w: WorldState): number {
  const r = mulberryNext(w.rngState);
  w.rngState = r.state;
  return r.value;
}

function pushMoment(w: WorldState, kind: Moment["kind"], emote = ""): void {
  w.moments.push({ day: w.day, hrs: w.clockHrs, kind, emote });
  if (w.moments.length > 14) {
    // ordinary lines rotate out first; milestones stay in the book
    const vi = w.moments.findIndex((m) => m.kind === "visit" || m.kind === "busy");
    if (vi >= 0) w.moments.splice(vi, 1);
    else w.moments.shift();
  }
}

/** Serve one plate off the menu; returns the level of the dish that went out. */
function serveDish(w: WorldState): number {
  const m = w.menu;
  const n = m.dishes.length + (m.specialUnlocked && !m.specialMastered ? 2 : m.specialUnlocked ? 1 : 0);
  const pick = Math.floor(roll(w) * n) % n;
  if (pick >= m.dishes.length) {
    m.specialServes += 1;
    if (!m.specialMastered && m.specialServes >= SPECIAL_MASTERY) {
      m.specialMastered = true;
      pushMoment(w, "mastered");
    }
    return w.pantry.levels["special"] ?? 1;
  }
  const dish = m.dishes[pick];
  dish.serves += 1;
  return w.pantry.levels[dish.key] ?? 1;
}

/** Path using the world's cached layout grid (rebuilt only on layout change). */
function pathTo(
  w: WorldState,
  sx: number,
  sy: number,
  gx: number,
  gy: number
): { x: number; y: number }[] {
  const p = findPath(w.grid, Math.round(sx), Math.round(sy), gx, gy);
  return p || [];
}

function moveEntity(e: Entity, dt: number): void {
  let budget = effSpeed(e) * dt;
  while (budget > 0 && e.path.length > 0) {
    const wp = e.path[0];
    const dx = wp.x - e.x;
    const dy = wp.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) {
      e.x = wp.x;
      e.y = wp.y;
      e.path.shift();
      continue;
    }
    if (Math.abs(dx) >= Math.abs(dy)) e.heading = dx > 0 ? "se" : "nw";
    else e.heading = dy > 0 ? "sw" : "ne";
    const step = Math.min(budget, dist);
    e.x += (dx / dist) * step;
    e.y += (dy / dist) * step;
    e.walkDist += step;
    budget -= step;
    if (step >= dist - 1e-9) {
      e.x = wp.x;
      e.y = wp.y;
      e.path.shift();
    }
  }
  if (e.path.length > 0) {
    const wp = e.path[0];
    const dx = wp.x - e.x;
    const dy = wp.y - e.y;
    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
      if (Math.abs(dx) >= Math.abs(dy)) e.heading = dx > 0 ? "se" : "nw";
      else e.heading = dy > 0 ? "sw" : "ne";
    }
  }
}

function seatAvailable(w: WorldState, i: number): boolean {
  const s = w.seats[i];
  return !!s && s.occupiedBy === 0 && s.serveX >= 0 && w.tables[s.tableIdx].dirty === 0;
}

/** How long a guest will wait on a bench before heading home (DEMO CONFIG). */
const PATIENCE_SEC = 75;
/** how far apart two guests sit on one bench, in tiles along its length */
const BENCH_SLOT_SPREAD = 0.34;

/** Where slot `si` sits on a bench: offset along the bench, not on top of it. */
function benchSlotPos(b: BenchState, si: number): { x: number; y: number } {
  const spread = (si - (b.slots.length - 1) / 2) * BENCH_SLOT_SPREAD;
  return { x: b.gx + spread, y: b.gy - spread };
}

/** First free bench slot, nearest the door first. Returns [benchIdx, slot]. */
function freeBenchSlot(w: WorldState): [number, number] | null {
  for (let i = 0; i < w.benches.length; i++) {
    const b = w.benches[i];
    for (let s = 0; s < b.slots.length; s++) {
      if (b.slots[s] === 0) return [i, s];
    }
  }
  return null;
}

function releaseBench(w: WorldState, entityId: number): void {
  for (const b of w.benches) {
    for (let s = 0; s < b.slots.length; s++) {
      if (b.slots[s] === entityId) b.slots[s] = 0;
    }
  }
}

/** A guest arrives with every table full: take a bench, or look in and go. */
function spawnWaiter(w: WorldState, room: RoomDef, variant: number): void {
  const slot = freeBenchSlot(w);
  if (!slot) {
    // Nowhere to wait. The loss is always COUNTED (it is the honest measure
    // of demand the room could not serve), but only sometimes SHOWN: a
    // constant procession of people walking in and straight back out would
    // read as punishment, which ADR-0107 forbids. A full waiting area earns
    // the occasional visible walk-away; a room with no bench at all gets
    // none, because the player has not opted into a queue yet.
    w.stats.turnedAway += 1;
    const show = w.benches.length > 0 && roll(w) < 0.5;
    if (!show) return;
    const g = makeEntity(w, "guest", w.door.x, room.h + 0.7, "ne");
    g.variant = variant;
    g.seatIdx = -1;
    g.state = "leave";
    g.path = [
      { x: w.door.x, y: w.door.y },
      { x: w.door.x, y: room.h + 0.9 },
    ];
    w.entities.push(g);
    w.stats.arrived += 1;
    return;
  }
  const g = makeEntity(w, "guest", w.door.x, room.h + 0.7, "ne");
  g.variant = variant;
  g.seatIdx = -1;
  const [bi, si] = slot;
  const b = w.benches[bi];
  b.slots[si] = g.id;
  g.state = "toBench";
  g.benchIdx = bi;
  // walk all the way INTO your own slot: the last step is the sideways shuffle
  // along the bench, so nobody ever teleports into their seat (no-sliding)
  g.path = [
    { x: w.door.x, y: w.door.y },
    ...pathTo(w, w.door.x, w.door.y, b.gx, b.gy),
    benchSlotPos(b, si),
  ];
  w.stats.waited += 1;
  w.entities.push(g);
  w.stats.arrived += 1;
}

function spawnGuest(w: WorldState, room: RoomDef, seatIdx: number, name: string, variant: number): void {
  const seat = w.seats[seatIdx];
  const g = makeEntity(w, "guest", w.door.x, room.h + 0.7, "ne");
  g.variant = variant;
  g.name = name;
  g.state = "enter";
  g.seatIdx = seatIdx;
  seat.occupiedBy = g.id;
  g.path = [
    { x: w.door.x, y: w.door.y },
    ...pathTo(w, w.door.x, w.door.y, seat.gx, seat.gy),
  ];
  w.entities.push(g);
  w.stats.arrived += 1;
}

/** Send everyone home politely, then freeze service (ADR-0104 edit mode). */
function clearFloorForEdit(w: WorldState, room: RoomDef): void {
  for (const t of w.toilets) t.fixClaim = 0;
  for (const t of w.trash) t.claim = 0;
  for (const e of w.entities) {
    if (e.kind === "guest") {
      if (e.state !== "leave") {
        const from = { x: Math.round(e.x), y: Math.round(e.y) };
        e.state = "leave";
        e.stateT = 0;
        e.emote = "";
        e.emoteT = 0;
        const seat = w.seats[e.seatIdx];
        if (seat && seat.occupiedBy === e.id) seat.occupiedBy = 0;
        e.path = [
          ...pathTo(w, from.x, from.y, w.door.x, w.door.y),
          { x: w.door.x, y: room.h + 0.9 },
        ];
      }
    } else {
      e.carrying = false;
      e.taskSeat = -1;
      e.taskTable = -1;
      e.taskTrash = -1;
      e.taskToilet = -1;
      e.state = "toAnchor";
      e.stateT = 0;
      const anchor = e.kind === "chef" ? w.stoveAnchors[0] : w.waiterAnchors[0];
      e.path = pathTo(w, e.x, e.y, anchor.x, anchor.y);
    }
  }
  for (const t of w.tables) t.busClaim = 0;
  w.orders = [];
}

/**
 * Walk every staff member back to their station. Called when arranging ends:
 * the room may have changed shape under them (a table can now stand exactly
 * where the chef was parked), so everyone re-paths from wherever they are and
 * steps back out onto open floor.
 */
function sendStaffHome(w: WorldState): void {
  for (const e of w.entities) {
    if (e.kind === "guest" || e.dead || e.state === "clockOut") continue;
    e.carrying = false;
    e.taskSeat = -1;
    e.taskTable = -1;
    e.taskTrash = -1;
    e.taskToilet = -1;
    e.state = "toAnchor";
    e.stateT = 0;
    const anchor = e.kind === "chef" ? w.stoveAnchors[0] : w.waiterAnchors[0];
    e.path = anchor ? pathTo(w, e.x, e.y, anchor.x, anchor.y) : [];
  }
}

/**
 * Everything that must happen after the layout changes: derived state is
 * rebuilt, and (while arranging) staff step out from under whatever just
 * landed on them — you can drop a table on the chef, and he moves aside
 * rather than standing inside it.
 */
function afterLayoutChange(w: WorldState, room: RoomDef): void {
  rebuildDerived(w, room);
  if (w.editing) sendStaffHome(w);
}

/** The ONLY door for player input (determinism = seed + action tape). */
export function applyAction(w: WorldState, room: RoomDef, action: Action): boolean {
  if (action.type === "dials") {
    w.dials.parkedUsd = Math.max(0, Math.min(5000, action.parkedUsd));
    w.dials.weeklyVolumeUsd = Math.max(0, Math.min(5000, action.weeklyVolumeUsd));
    return true;
  }
  if (action.type === "bus") {
    const t = w.tables[action.tableIdx];
    if (!t || t.dirty === 0) return false;
    t.dirty = 0;
    t.busClaim = 0;
    w.presence = Math.min(PRESENCE_CAP, w.presence + 3);
    w.playMoney += 1;
    w.stats.busedByPlayer += 1;
    return true;
  }
  if (action.type === "hustle") {
    const e = w.entities.find(
      (x) => x.id === action.entityId && (x.kind === "waiter" || x.kind === "chef") && !x.dead
    );
    if (!e) return false;
    e.hustleT = 8;
    w.presence = Math.min(PRESENCE_CAP, w.presence + 2);
    w.stats.hustles += 1;
    return true;
  }
  if (action.type === "buyHire") {
    const cost = hireCost(w, action.hire);
    if (cost === null) return false;
    if (action.hire === "chef" && w.hires.chefs >= w.stovePos.length) return false;
    if (w.playMoney < cost) return false;
    w.playMoney -= cost;
    if (action.hire === "waiter") w.hires.waiters += 1;
    else w.hires.chefs += 1;
    w.stats.purchases += 1;
    return true;
  }
  if (action.type === "sweep") {
    const i = w.trash.findIndex((t) => t.id === action.trashId);
    if (i < 0) return false;
    w.trash.splice(i, 1);
    w.presence = Math.min(PRESENCE_CAP, w.presence + 2);
    w.stats.trashSweptByPlayer += 1;
    return true;
  }
  if (action.type === "fixToilet") {
    const t = w.toilets.find((x) => x.uid === action.uid);
    if (!t || !t.broken) return false;
    t.broken = false;
    t.breakIn = TOILET_LIFE_SEC;
    t.fixClaim = 0;
    w.presence = Math.min(PRESENCE_CAP, w.presence + 3);
    w.stats.toiletFixedByPlayer += 1;
    return true;
  }
  if (action.type === "upgradeDish") {
    const level = w.pantry.levels[action.key] ?? 1;
    const recipe = nextRecipe(action.key, level);
    if (!recipe || !canUpgradeDish(w, action.key)) return false;
    for (const [id, n] of Object.entries(recipe)) {
      w.pantry.stock[id] = (w.pantry.stock[id] ?? 0) - n;
      if (w.pantry.stock[id] <= 0) delete w.pantry.stock[id];
    }
    w.pantry.levels[action.key] = Math.min(MAX_DISH_LEVEL, level + 1);
    w.stats.dishUpgrades += 1;
    pushMoment(w, "dish", action.key);
    return true;
  }
  if (action.type === "completeCourse") {
    const course = courseById(action.id);
    if (!course || w.courses.includes(action.id)) return false;
    w.courses.push(action.id);
    w.playMoney += course.reward;
    pushMoment(w, "course", action.id);
    return true;
  }
  if (action.type === "sellItem") {
    // only from STORAGE: selling never reaches into the room and un-builds
    // it (ADR-0103). Put a piece away first if you want it gone.
    const held = w.inventory[action.itemId] ?? 0;
    if (held <= 0) return false;
    const def = itemDef(action.itemId);
    if (!def || def.cost <= 0) return false;
    w.inventory[action.itemId] = held - 1;
    if (w.inventory[action.itemId] <= 0) delete w.inventory[action.itemId];
    w.playMoney += Math.floor(def.cost * SELL_BACK);
    return true;
  }
  if (action.type === "market") {
    if (!MARKETS.some((m) => m.id === action.id)) return false;
    if (w.market === action.id) return false;
    // switching is free and carries everything (ADR-0039); tenure already
    // banked at the old market stays banked
    w.market = action.id;
    return true;
  }
  if (action.type === "buyItem") {
    const def = itemDef(action.itemId);
    if (!def || def.cost <= 0) return false;
    // a domain's collection needs LP tenure at that domain (ADR-0105)
    if (!itemPurchasable(w, action.itemId)) return false;
    if (w.playMoney < def.cost) return false;
    w.playMoney -= def.cost;
    w.inventory[action.itemId] = (w.inventory[action.itemId] ?? 0) + 1;
    w.stats.purchases += 1;
    return true;
  }
  if (action.type === "edit") {
    if (w.editing === action.on) return false;
    w.editing = action.on;
    if (action.on) clearFloorForEdit(w, room);
    else sendStaffHome(w);
    return true;
  }
  // Layout edits are only legal while arranging (ADR-0104): edit mode has
  // already emptied the floor, so no guest can be left standing on a tile
  // that just became a table, and no walk path can cross new furniture.
  if (
    (action.type === "place" ||
      action.type === "move" ||
      action.type === "rotate" ||
      action.type === "store") &&
    !w.editing
  ) {
    return false;
  }

  if (action.type === "place") {
    if ((w.inventory[action.itemId] ?? 0) <= 0) return false;
    const next: PlacedItem[] = [
      ...w.layout,
      {
        uid: w.nextUid,
        itemId: action.itemId,
        gx: action.gx,
        gy: action.gy,
        facing: action.facing ?? "se",
      },
    ];
    if (validateLayout(room, next) !== "") return false;
    w.nextUid += 1;
    w.layout = next;
    w.inventory[action.itemId] -= 1;
    if (w.inventory[action.itemId] <= 0) delete w.inventory[action.itemId];
    w.stats.placements += 1;
    afterLayoutChange(w, room);
    return true;
  }
  if (action.type === "move") {
    const i = w.layout.findIndex((p) => p.uid === action.uid);
    if (i < 0) return false;
    const next = w.layout.map((p) =>
      p.uid === action.uid
        ? { ...p, gx: action.gx, gy: action.gy, facing: action.facing ?? p.facing }
        : p
    );
    if (validateLayout(room, next) !== "") return false;
    w.layout = next;
    w.stats.placements += 1;
    afterLayoutChange(w, room);
    return true;
  }
  if (action.type === "rotate") {
    const i = w.layout.findIndex((p) => p.uid === action.uid);
    if (i < 0) return false;
    const next = w.layout.map((p) =>
      p.uid === action.uid ? { ...p, facing: (p.facing === "se" ? "sw" : "se") as Facing } : p
    );
    if (validateLayout(room, next) !== "") return false;
    w.layout = next;
    afterLayoutChange(w, room);
    return true;
  }
  if (action.type === "store") {
    const item = w.layout.find((p) => p.uid === action.uid);
    if (!item) return false;
    const next = w.layout.filter((p) => p.uid !== action.uid);
    if (validateLayout(room, next) !== "") return false;
    w.layout = next;
    w.inventory[item.itemId] = (w.inventory[item.itemId] ?? 0) + 1;
    afterLayoutChange(w, room);
    return true;
  }
  return false;
}

/** Dry-run a placement so the UI can tint the ghost and explain a refusal. */
export function previewPlace(
  w: WorldState,
  room: RoomDef,
  itemId: string,
  gx: number,
  gy: number,
  movingUid?: number
): PlaceError {
  if (movingUid === undefined && (w.inventory[itemId] ?? 0) <= 0) {
    return "You do not own one of those yet.";
  }
  const base = movingUid === undefined ? w.layout : w.layout.filter((p) => p.uid !== movingUid);
  const facing = movingUid !== undefined ? w.layout.find((p) => p.uid === movingUid)?.facing ?? "se" : "se";
  return validateLayout(room, [...base, { uid: -1, itemId, gx, gy, facing }]);
}

function goHome(w: WorldState, e: Entity): void {
  e.state = "toAnchor";
  e.stateT = 0;
  const anchor = w.waiterAnchors[0];
  e.path = pathTo(w, e.x, e.y, anchor.x, anchor.y);
}

function stepWaiter(w: WorldState, e: Entity): void {
  if (e.state === "clockOut") {
    if (e.path.length === 0) e.dead = true;
    return;
  }
  if (w.editing && e.state !== "toAnchor" && e.state !== "idle") {
    goHome(w, e);
    return;
  }
  if (e.state === "idle") {
    if (w.editing) return;
    const order = w.orders.find((o) => o.stage === "ready");
    if (order) {
      order.stage = "serving";
      order.waiterId = e.id;
      e.taskSeat = order.seatIdx;
      e.state = "toPass";
      e.stateT = 0;
      e.path = pathTo(w, e.x, e.y, w.passAnchor.x, w.passAnchor.y);
      return;
    }
    for (let ti = 0; ti < w.tables.length; ti++) {
      const t = w.tables[ti];
      if (t.dirty > 0 && t.busClaim === 0 && t.serveX >= 0) {
        t.busClaim = e.id;
        e.taskTable = ti;
        e.state = "toBus";
        e.stateT = 0;
        e.path = pathTo(w, e.x, e.y, t.serveX, t.serveY);
        return;
      }
    }
    // ── chores (ADR-0106): a broken restroom first, then litter. This is
    // what keeps an absent player's room presentable (ADR-0102's law).
    const broken = w.toilets.find((t) => t.broken && t.fixClaim === 0 && t.workX >= 0);
    if (broken) {
      broken.fixClaim = e.id;
      e.taskToilet = broken.uid;
      e.state = "toChore";
      e.stateT = 0;
      e.path = pathTo(w, e.x, e.y, broken.workX, broken.workY);
      return;
    }
    const litter = w.trash.find((t) => t.claim === 0);
    if (litter) {
      litter.claim = e.id;
      e.taskTrash = litter.id;
      e.state = "toChore";
      e.stateT = 0;
      e.path = pathTo(w, e.x, e.y, litter.gx, litter.gy);
      return;
    }
    return;
  }
  if (e.state === "toChore" || e.state === "chore") {
    const toilet = e.taskToilet >= 0 ? w.toilets.find((t) => t.uid === e.taskToilet) : undefined;
    const litter = e.taskTrash >= 0 ? w.trash.find((t) => t.id === e.taskTrash) : undefined;
    // the player may have beaten them to it: stand down without fuss
    if ((e.taskToilet >= 0 && (!toilet || !toilet.broken)) || (e.taskTrash >= 0 && !litter)) {
      if (toilet && toilet.fixClaim === e.id) toilet.fixClaim = 0;
      e.taskToilet = -1;
      e.taskTrash = -1;
      goHome(w, e);
      return;
    }
    if (e.state === "toChore" && e.path.length === 0) {
      e.state = "chore";
      e.stateT = 0;
      const target = toilet ?? litter;
      if (target) {
        const dx = target.gx - Math.round(e.x);
        const dy = target.gy - Math.round(e.y);
        if (Math.abs(dx) >= Math.abs(dy)) e.heading = dx > 0 ? "se" : "nw";
        else e.heading = dy > 0 ? "sw" : "ne";
      }
      return;
    }
    if (e.state === "chore" && e.stateT >= (toilet ? 2.4 : 1.1)) {
      if (toilet) {
        toilet.broken = false;
        toilet.breakIn = TOILET_LIFE_SEC;
        toilet.fixClaim = 0;
        w.stats.toiletFixedAuto += 1;
      } else if (litter) {
        const i = w.trash.findIndex((t) => t.id === litter.id);
        if (i >= 0) w.trash.splice(i, 1);
        w.stats.trashSweptAuto += 1;
      }
      e.taskToilet = -1;
      e.taskTrash = -1;
      goHome(w, e);
    }
    return;
  }
  if (e.state === "toPass") {
    if (e.path.length === 0) {
      e.state = "pickup";
      e.stateT = 0;
      e.heading = "ne";
    }
    return;
  }
  if (e.state === "pickup") {
    if (e.stateT >= 0.5) {
      const seat = w.seats[e.taskSeat];
      e.carrying = true;
      e.state = "toTable";
      e.stateT = 0;
      if (seat) e.path = pathTo(w, e.x, e.y, seat.serveX, seat.serveY);
      else goHome(w, e);
    }
    return;
  }
  if (e.state === "toTable") {
    if (e.path.length === 0) {
      const seat = w.seats[e.taskSeat];
      e.state = "serve";
      e.stateT = 0;
      if (seat) {
        const t = w.tables[seat.tableIdx];
        const dx = t.gx - Math.round(e.x);
        const dy = t.gy - Math.round(e.y);
        if (Math.abs(dx) >= Math.abs(dy)) e.heading = dx > 0 ? "se" : "nw";
        else e.heading = dy > 0 ? "sw" : "ne";
      }
    }
    return;
  }
  if (e.state === "serve") {
    if (e.stateT >= 0.7) {
      const oi = w.orders.findIndex((o) => o.waiterId === e.id && o.stage === "serving");
      if (oi >= 0) {
        const order = w.orders[oi];
        const seat = w.seats[order.seatIdx];
        const guest = w.entities.find(
          (g) => g.kind === "guest" && g.seatIdx === order.seatIdx && g.state === "sit"
        );
        const q = qualityOf(w);
        if (guest) {
          guest.state = "eat";
          guest.stateT = 0;
          guest.eatT = 10 + roll(w) * 12;
          guest.emote = guest.waitT < 25 && q >= 70 ? "heart" : "coin";
          guest.emoteT = 1.8;
          if (guest.emote === "heart") {
            w.stats.hearts += 1;
            // RARES ARE PLAY-EARNED ONLY (ADR-0043/0106): they fall out of
            // genuinely good service, never out of money, and are capped.
            if (w.pantry.rareDrops < RARE_DROP_CAP) {
              const id = RARES[Math.floor(roll(w) * RARES.length) % RARES.length];
              addStock(w, id);
              w.pantry.rareDrops += 1;
              w.stats.raresDropped += 1;
            }
          }
          const dishLevel = serveDish(w);
          // a better dish tips a little better; an unlevelled kitchen still
          // cooks a solid B (ADR-0053's softening)
          const tip = 1 + Math.round(q / 25) + (dishLevel - 1) + (guest.name === "Gus" ? 4 : 0);
          w.playMoney += tip;
        }
        if (seat) {
          const t = w.tables[seat.tableIdx];
          for (let k = 0; k < 2; k++) {
            w.ambient.steam.push({
              gx: t.gx + (roll(w) - 0.5) * 0.3,
              gy: t.gy + (roll(w) - 0.5) * 0.3,
              z: -16,
              age: 0,
              life: 1.1 + roll(w) * 0.5,
              drift: (roll(w) - 0.5) * 8,
            });
          }
        }
        w.orders.splice(oi, 1);
        w.stats.served += 1;
      }
      e.carrying = false;
      e.taskSeat = -1;
      goHome(w, e);
    }
    return;
  }
  if (e.state === "toBus" || e.state === "bus") {
    const t = w.tables[e.taskTable];
    if (!t || t.busClaim !== e.id || t.dirty === 0) {
      e.taskTable = -1;
      goHome(w, e);
      return;
    }
    if (e.state === "toBus" && e.path.length === 0) {
      e.state = "bus";
      e.stateT = 0;
      const dx = t.gx - Math.round(e.x);
      const dy = t.gy - Math.round(e.y);
      if (Math.abs(dx) >= Math.abs(dy)) e.heading = dx > 0 ? "se" : "nw";
      else e.heading = dy > 0 ? "sw" : "ne";
      return;
    }
    if (e.state === "bus" && e.stateT >= 1.2) {
      t.dirty = 0;
      t.busClaim = 0;
      e.taskTable = -1;
      w.stats.busedAuto += 1;
      goHome(w, e);
    }
    return;
  }
  if (e.state === "toAnchor") {
    if (e.path.length === 0) {
      e.state = "idle";
      e.stateT = 0;
      e.heading = "sw";
    }
  }
}

function stepChef(w: WorldState, e: Entity, chefSlot: number): void {
  if (e.state === "clockOut") {
    if (e.path.length === 0) e.dead = true;
    return;
  }
  if (e.state === "idle") {
    if (w.editing) return;
    const order = w.orders.find((o) => o.stage === "queued");
    if (order) {
      order.stage = "cooking";
      order.chefId = e.id;
      e.cookT = deriveService(w).cookDur * (0.9 + roll(w) * 0.2);
      let anchorIdx: number;
      if (w.hires.chefs === 1 && w.stoveAnchors.length >= 2) {
        w.stoveFlip = 1 - w.stoveFlip;
        anchorIdx = w.stoveFlip;
      } else {
        anchorIdx = Math.min(chefSlot, w.stoveAnchors.length - 1);
      }
      const anchor = w.stoveAnchors[anchorIdx % w.stoveAnchors.length];
      if (Math.abs(e.x - anchor.x) + Math.abs(e.y - anchor.y) > 0.01) {
        e.state = "toStove";
        e.path = pathTo(w, e.x, e.y, anchor.x, anchor.y);
      } else {
        e.state = "cook";
      }
      e.stateT = 0;
    }
    return;
  }
  if (e.state === "toStove") {
    if (e.path.length === 0) {
      e.state = "cook";
      e.stateT = 0;
      e.heading = "ne";
    }
    return;
  }
  if (e.state === "toAnchor") {
    // chefs walk back to their station too (edit mode parks them here);
    // without this branch they would freeze in place forever
    if (e.path.length === 0) {
      e.state = "idle";
      e.stateT = 0;
      e.heading = "ne";
    }
    return;
  }
  if (e.state === "cook") {
    if (e.hustleT > 0) e.stateT += WORLD_FIXED_DT * 0.5;
    if (e.stateT >= e.cookT) {
      const order = w.orders.find((o) => o.chefId === e.id && o.stage === "cooking");
      if (order) order.stage = "ready";
      w.stats.cooked += 1;
      e.state = "idle";
      e.heading = "ne";
      e.stateT = 0;
    }
  }
}

/** Advance the world by exactly WORLD_FIXED_DT. Deterministic per seed+tape. */
export function stepWorld(w: WorldState, room: RoomDef): void {
  const dt = WORLD_FIXED_DT;
  w.tick += 1;
  w.timeSec += dt;

  w.clockHrs += dt * HOURS_PER_SEC;
  if (w.clockHrs >= 24) {
    w.clockHrs -= 24;
    w.day += 1;
    // a day of liquidity banks a day of tenure at the market it sat in
    // (ADR-0105). Tenure never decreases: pulling out only stops the clock.
    if (w.dials.parkedUsd > 0) {
      w.lpDays[w.market] = (w.lpDays[w.market] ?? 0) + 1;
    }
    // ── the daily delivery (ADR-0106): a handful of commons you did not
    // choose. This is the beat worth waiting for — you are always hoping for
    // the one your next dish needs.
    const delivered: string[] = [];
    for (let i = 0; i < DAILY_DELIVERY; i++) {
      const id = COMMONS[Math.floor(roll(w) * COMMONS.length) % COMMONS.length];
      addStock(w, id);
      delivered.push(id);
      w.stats.commonsDropped += 1;
    }
    w.pantry.lastDelivery = delivered;
    w.pantry.lastDeliveryDay = w.day;
    pushMoment(w, "delivery", delivered.join(","));
    // per-day drop budgets reset with the day
    w.pantry.dropDay = w.day;
    w.pantry.volumeDrops = 0;
    w.pantry.rareDrops = 0;
  }

  // ── trading drops: every swap is a shopping trip (ADR-0043), and the cap
  // is what makes wash volume pointless as a pantry strategy ───────────────
  if (w.dials.weeklyVolumeUsd > 0 && w.pantry.volumeDrops < VOLUME_DROP_CAP) {
    w.pantry.volumeDropIn -= dt;
    if (w.pantry.volumeDropIn <= 0) {
      const id = COMMONS[Math.floor(roll(w) * COMMONS.length) % COMMONS.length];
      addStock(w, id);
      w.pantry.volumeDrops += 1;
      w.stats.commonsDropped += 1;
      w.pantry.volumeDropIn = volumeDropInterval(w.dials.weeklyVolumeUsd);
    }
  }
  w.presence = Math.max(0, w.presence - (dt * 0.5) / 60);

  if (!w.menu.specialUnlocked && (w.dials.parkedUsd > 0 || w.dials.weeklyVolumeUsd > 0)) {
    w.menu.specialUnlocked = true;
    pushMoment(w, "special");
  }

  // income: the position prints coins even while rearranging (ADR-0103)
  const inc = incomePerHour(w.dials);
  w.coinFloat += (inc.lp + inc.vol) * dt * HOURS_PER_SEC;
  if (w.coinFloat >= 1) {
    const whole = Math.floor(w.coinFloat);
    w.coinFloat -= whole;
    w.playMoney += whole;
    w.stats.coinsFromPosition += whole;
  }

  const svc = deriveService(w);
  // the service record: the best this room has ever held (ADR-0106 spotlight)
  const qNow = qualityOf(w);
  if (qNow > w.stats.bestQuality) w.stats.bestQuality = qNow;

  // ── spawner (paused while rearranging) ───────────────────────────────────
  if (!w.editing) {
    w.spawnIn -= dt;
    if (w.spawnIn <= 0) {
      const free: number[] = [];
      for (let i = 0; i < w.seats.length; i++) {
        if (i !== w.gusSeatIdx && seatAvailable(w, i)) free.push(i);
      }
      if (free.length > 0) {
        const seatIdx = free[Math.floor(roll(w) * free.length) % free.length];
        spawnGuest(w, room, seatIdx, "", Math.floor(roll(w) * 8) % 8);
      } else if (w.seats.length > 0) {
        // the room is full: they wait on a bench, or look in and move on
        spawnWaiter(w, room, Math.floor(roll(w) * 8) % 8);
      }
      w.spawnIn = svc.spawnInterval * (0.7 + roll(w) * 0.6);
    }

    if (
      w.clockHrs >= 18 &&
      w.clockHrs < 20 &&
      w.gusVisitDay < w.day &&
      w.gusSeatIdx >= 0 &&
      seatAvailable(w, w.gusSeatIdx)
    ) {
      spawnGuest(w, room, w.gusSeatIdx, "Gus", 6);
      w.gusVisitDay = w.day;
      w.stats.gusVisits += 1;
    } else if (w.clockHrs >= 20 && w.gusVisitDay < w.day) {
      w.gusVisitDay = w.day;
    }
  }

  // ── upkeep: litter appears with traffic, restrooms wear out (ADR-0106) ───
  if (!w.editing) {
    w.trashIn -= dt;
    if (w.trashIn <= 0) {
      // busier rooms make more mess; the visible cap keeps it charming
      const busy = 1 + w.entities.filter((e) => e.kind === "guest").length * 0.35;
      if (w.trash.length < TRASH_VISIBLE_CAP) {
        // drop it on an open tile someone actually walks on
        const open: { x: number; y: number }[] = [];
        for (let gy = 0; gy < room.h; gy++) {
          for (let gx = 0; gx < room.w; gx++) {
            if (w.grid.cells[gy * room.w + gx] === 0) open.push({ x: gx, y: gy });
          }
        }
        if (open.length > 0) {
          const spot = open[Math.floor(roll(w) * open.length) % open.length];
          if (!w.trash.some((t) => t.gx === spot.x && t.gy === spot.y)) {
            w.trash.push({ id: w.nextTrashId++, gx: spot.x, gy: spot.y, claim: 0 });
            w.stats.trashDropped += 1;
          }
        }
      }
      w.trashIn = (TRASH_BASE_SEC / busy) * (0.7 + roll(w) * 0.6);
    }
    for (const t of w.toilets) {
      if (t.broken) continue;
      t.breakIn -= dt;
      if (t.breakIn <= 0) {
        t.broken = true;
        t.fixClaim = 0;
        w.stats.toiletBreaks += 1;
      }
    }
  }

  // ── the host: a freed table goes to whoever has waited longest ───────────
  if (!w.editing) {
    for (let i = 0; i < w.seats.length; i++) {
      if (i === w.gusSeatIdx || !seatAvailable(w, i)) continue;
      let best: Entity | null = null;
      for (const e of w.entities) {
        if (e.kind !== "guest" || e.state !== "wait" || e.dead) continue;
        // fairness is time, never money and never chance (ADR-0107)
        if (!best || e.waitT > best.waitT || (e.waitT === best.waitT && e.id < best.id)) {
          best = e;
        }
      }
      if (!best) break;
      const seat = w.seats[i];
      releaseBench(w, best.id);
      best.benchIdx = -1;
      best.seatIdx = i;
      seat.occupiedBy = best.id;
      best.state = "enter";
      best.stateT = 0;
      best.path = pathTo(w, Math.round(best.x), Math.round(best.y), seat.gx, seat.gy);
      w.stats.seatedFromBench += 1;
    }
  }

  // ── chefs clock in to match the hires ────────────────────────────────────
  const chefsActive = w.entities.filter((e) => e.kind === "chef" && !e.dead && e.state !== "clockOut");
  if (chefsActive.length < svc.chefsTarget) {
    const slot = Math.min(chefsActive.length, Math.max(0, w.stoveAnchors.length - 1));
    const nc = makeEntity(w, "chef", w.door.x, room.h + 0.7, "ne");
    nc.state = "toStove";
    nc.path = [
      { x: w.door.x, y: w.door.y },
      ...pathTo(w, w.door.x, w.door.y, w.stoveAnchors[slot].x, w.stoveAnchors[slot].y),
    ];
    w.entities.push(nc);
  } else if (chefsActive.length > svc.chefsTarget) {
    const idleOnes = chefsActive.filter((e) => e.state === "idle");
    if (idleOnes.length > 0) {
      const leaver = idleOnes[idleOnes.length - 1];
      leaver.state = "clockOut";
      leaver.stateT = 0;
      leaver.path = [
        ...pathTo(w, leaver.x, leaver.y, w.door.x, w.door.y),
        { x: w.door.x, y: room.h + 0.9 },
      ];
    }
  }
  {
    let slot = 0;
    for (const e of w.entities) {
      if (e.kind !== "chef" || e.dead) continue;
      stepChef(w, e, slot);
      if (e.state !== "clockOut") slot++;
    }
  }

  // ── waiters clock in to match the hires ──────────────────────────────────
  const waitersActive = w.entities.filter(
    (e) => e.kind === "waiter" && !e.dead && e.state !== "clockOut"
  );
  if (waitersActive.length < svc.waitersTarget) {
    const slot = Math.min(waitersActive.length, w.waiterAnchors.length - 1);
    const nw = makeEntity(w, "waiter", w.door.x, room.h + 0.7, "ne");
    nw.state = "toAnchor";
    nw.path = [
      { x: w.door.x, y: w.door.y },
      ...pathTo(w, w.door.x, w.door.y, w.waiterAnchors[slot].x, w.waiterAnchors[slot].y),
    ];
    w.entities.push(nw);
  } else if (waitersActive.length > svc.waitersTarget) {
    const idleOnes = waitersActive.filter((e) => e.state === "idle");
    if (idleOnes.length > 0) {
      const leaver = idleOnes[idleOnes.length - 1];
      leaver.state = "clockOut";
      leaver.stateT = 0;
      leaver.path = [
        ...pathTo(w, leaver.x, leaver.y, w.door.x, w.door.y),
        { x: w.door.x, y: room.h + 0.9 },
      ];
    }
  }
  for (const e of w.entities) {
    if (e.kind === "waiter" && !e.dead) stepWaiter(w, e);
  }

  // ── movement + timers + guests ───────────────────────────────────────────
  for (const e of w.entities) {
    e.stateT += dt;
    if (e.hustleT > 0) e.hustleT = Math.max(0, e.hustleT - dt);
    if (e.emoteT > 0) e.emoteT = Math.max(0, e.emoteT - dt);
    if (e.path.length > 0) moveEntity(e, dt);

    if (e.kind === "guest") {
      if (e.state === "sit" || e.state === "wait") e.waitT += dt;

      // ── waiting on a bench (ADR-0107) ───────────────────────────────────
      if (e.state === "toBench" && e.path.length === 0) {
        const b = w.benches[e.benchIdx];
        if (b) {
          // they already WALKED into their slot (the path's last waypoint),
          // so settling is a state change only — never a position jump
          e.state = "wait";
          e.stateT = 0;
          e.waitT = 0;
          e.heading = b.facing;
        } else {
          // the bench moved out from under them: head home, no drama
          e.state = "leave";
          e.stateT = 0;
          e.path = [
            ...pathTo(w, Math.round(e.x), Math.round(e.y), w.door.x, w.door.y),
            { x: w.door.x, y: room.h + 0.9 },
          ];
        }
        continue;
      }
      if (e.state === "wait") {
        if (e.waitT >= PATIENCE_SEC) {
          releaseBench(w, e.id);
          e.benchIdx = -1;
          e.state = "leave";
          e.stateT = 0;
          e.emote = "";
          w.stats.leftWaiting += 1;
          e.path = [
            ...pathTo(w, Math.round(e.x), Math.round(e.y), w.door.x, w.door.y),
            { x: w.door.x, y: room.h + 0.9 },
          ];
        }
        continue;
      }

      if (e.state === "enter" && e.path.length === 0) {
        const seat = w.seats[e.seatIdx];
        if (!seat) {
          // the seat vanished mid-walk (a rearrangement): head home kindly
          e.state = "leave";
          e.stateT = 0;
          e.path = [
            ...pathTo(w, Math.round(e.x), Math.round(e.y), w.door.x, w.door.y),
            { x: w.door.x, y: room.h + 0.9 },
          ];
        } else {
          e.state = "sit";
          e.stateT = 0;
          e.waitT = 0;
          e.x = seat.gx;
          e.y = seat.gy;
          e.heading = seat.facing;
          w.orders.push({ seatIdx: e.seatIdx, stage: "queued", waiterId: 0, chefId: 0 });
        }
      } else if (e.state === "eat" && e.stateT >= e.eatT) {
        e.state = "leave";
        e.stateT = 0;
        const seat = w.seats[e.seatIdx];
        const t = seat ? w.tables[seat.tableIdx] : undefined;
        if (t) {
          t.dirty += 1;
          w.stats.dirtied += 1;
        }
        const from = seat ? { x: seat.gx, y: seat.gy } : { x: Math.round(e.x), y: Math.round(e.y) };
        e.path = [
          ...pathTo(w, from.x, from.y, w.door.x, w.door.y),
          { x: w.door.x, y: room.h + 0.9 },
        ];
      } else if (e.state === "leave" && e.path.length === 0) {
        e.dead = true;
        const seat = w.seats[e.seatIdx];
        if (seat && seat.occupiedBy === e.id) seat.occupiedBy = 0;
        releaseBench(w, e.id);
        w.stats.departed += 1;
        // a guest who never got a table leaves no cheerful entry: the book
        // stays kind and says the room was busy, never that anyone failed
        if (e.seatIdx < 0) pushMoment(w, "busy", "");
        else pushMoment(w, e.name === "Gus" ? "gus" : "visit", e.emote || "coin");
      }
    }
  }
  if (w.entities.some((e) => e.dead)) {
    w.entities = w.entities.filter((e) => !e.dead);
  }

  // ── ambience ─────────────────────────────────────────────────────────────
  const a = w.ambient;
  a.lampPhase += dt;
  a.candleRetargetIn -= dt;
  if (a.candleRetargetIn <= 0) {
    a.candleTarget = 0.85 + roll(w) * 0.3;
    a.candleRetargetIn = 0.09 + roll(w) * 0.08;
  }
  a.candle += (a.candleTarget - a.candle) * Math.min(1, dt * 14);

  a.steamIn -= dt;
  if (a.steamIn <= 0) {
    if (w.stovePos.length > 0) {
      const s = w.stovePos[Math.floor(roll(w) * w.stovePos.length) % w.stovePos.length];
      a.steam.push({
        gx: s.gx + (roll(w) - 0.5) * 0.35,
        gy: s.gy + (roll(w) - 0.5) * 0.35,
        z: 0,
        age: 0,
        life: 1.6 + roll(w) * 0.9,
        drift: (roll(w) - 0.5) * 10,
      });
    }
    a.steamIn = 0.5 + roll(w) * 0.6;
  }
  for (let i = a.steam.length - 1; i >= 0; i--) {
    const p = a.steam[i];
    p.age += dt;
    p.z += dt * 26;
    p.gx += (p.drift * dt) / 64;
    if (p.age >= p.life) a.steam.splice(i, 1);
  }
}

/** Stable hash of the full world state, for the determinism gates. */
export function hashWorld(w: WorldState): number {
  return fnv1a(JSON.stringify(w));
}
