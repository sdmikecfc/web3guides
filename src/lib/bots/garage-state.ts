/**
 * BATTLE BOTS GARAGE STATE (week 2): coins, level, the owned parts, the five
 * bays and the shop's "one per listing per day" book, in ONE store with
 * localStorage persistence. The server replaces the persistence in week 3;
 * every screen keeps calling the same actions.
 *
 * SHAPE: a module store read through useSyncExternalStore (the React 18
 * pattern), seeded from src/lib/bots/fixtures.ts. The seed is PURE: the
 * server snapshot and the client's first render both use seedState(0), so
 * hydration never mismatches; hydrate(nowMs) then swaps in localStorage (or
 * materialises the seed against the clock the caller hands it).
 *
 * LAWS THIS FILE CARRIES:
 *  - NO CLOCK READS. Every `nowMs` arrives as an argument from the screen.
 *  - COINS ARE WHOLE NUMBERS and an overdraft is REFUSED, never clamped: a
 *    purchase or a paint job that cannot be paid returns { ok: false } with
 *    the coins still needed, and the screen says so in plain words.
 *  - ONE PURCHASE PER LISTING PER DAY (economy doc section 3). The day key
 *    is the shop's UTC day.
 *  - RECYCLE RETURNS 40 PERCENT of list price (fixtures.recycleValue) and
 *    the parts are GONE (Mike: "recycle them for a fraction").
 *  - A PAINT JOB IS 25 COINS PER PART and only parts whose colour changes
 *    are charged; the painted colour is what the set rule counts.
 */

import { useEffect, useSyncExternalStore } from "react";
import type { PaintId } from "@/app/bots/_ui/tokens";
import {
  BAY_COUNT,
  CARD_BY_ID,
  CARD_SLOTS,
  CREW,
  FIXTURE_BUILDS,
  FIXTURE_REPAIR_LEFT_MS,
  LEVEL_FOR_TIER,
  ME,
  OWNED_PARTS,
  PAINT_COST,
  RECORDS,
  emptySockets,
  recycleValue,
  type Build,
  type CardSlot,
  type CrewLive,
  type OwnedPart,
  type ShopListing,
} from "./fixtures";

/* ── shapes ──────────────────────────────────────────────────────────────── */

export interface BayState {
  /** ms since epoch when the shop lets the bot go; null = not in the shop */
  repairUntil: number | null;
  inBattle: boolean;
  attacksLeft: number;
  wins: number;
  losses: number;
}

export interface GarageState {
  v: 1;
  coins: number;
  level: number;
  parts: OwnedPart[];
  /** by bay number 1..5; a missing bay is an empty bay */
  builds: Record<number, Build>;
  bays: Record<number, BayState>;
  /** day key -> listing ids bought that day */
  bought: Record<string, string[]>;
  nextUid: number;
  /** the live strategies the tracker sees (fixture until the job lands) */
  crew: CrewLive[];
}

export type BayStatus =
  | { kind: "ready"; attacksLeft: number }
  | { kind: "shop"; leftMs: number }
  | { kind: "battle" }
  | { kind: "notReady"; empty: number }
  | { kind: "empty" };

const KEY = "bots.garage.v1";
const ATTACKS_PER_DAY = 2;

/* ── the seed (pure) ─────────────────────────────────────────────────────── */

function bayState(bay: number, nowMs: number): BayState {
  const rec = RECORDS[bay] ?? { wins: 0, losses: 0 };
  return {
    repairUntil: bay === 2 ? nowMs + FIXTURE_REPAIR_LEFT_MS : null,
    inBattle: bay === 3,
    attacksLeft: bay === 2 ? 0 : bay === 3 ? 1 : ATTACKS_PER_DAY,
    wins: rec.wins,
    losses: rec.losses,
  };
}

export function seedState(nowMs: number): GarageState {
  const bays: Record<number, BayState> = {};
  for (let b = 1; b <= BAY_COUNT; b++) bays[b] = bayState(b, nowMs);
  return {
    v: 1,
    coins: ME.coins,
    level: ME.level,
    parts: OWNED_PARTS.map((p) => ({ ...p })),
    builds: Object.fromEntries(Object.entries(FIXTURE_BUILDS).map(([k, b]) => [Number(k), { ...b, cards: { ...b.cards } }])),
    bays,
    bought: {},
    nextUid: OWNED_PARTS.length + 1,
    crew: CREW.map((c) => ({ ...c })),
  };
}

/** The one server snapshot: stable identity, no clock. */
const SERVER_SEED: GarageState = seedState(0);

/* ── persistence ─────────────────────────────────────────────────────────── */

function load(): GarageState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const st = JSON.parse(raw) as GarageState;
    if (!st || st.v !== 1 || !Array.isArray(st.parts) || typeof st.coins !== "number") return null;
    // a part whose card left the catalog is dropped, and the socket it filled opens
    const parts = st.parts.filter((p) => p && CARD_BY_ID[p.id]).map((p) => ({ ...CARD_BY_ID[p.id], uid: p.uid, provenance: p.provenance, paint: p.paint ?? CARD_BY_ID[p.id].color }));
    const have = new Set(parts.map((p) => p.uid));
    const builds: Record<number, Build> = {};
    for (const [k, b] of Object.entries(st.builds ?? {})) {
      const bay = Number(k);
      if (!b || !b.cards || bay < 1 || bay > BAY_COUNT) continue;
      const cards = {} as Record<CardSlot, string | null>;
      for (const slot of CARD_SLOTS) {
        const uid = b.cards[slot];
        const p = uid ? parts.find((x) => x.uid === uid) : null;
        cards[slot] = p && p.slot === slot && have.has(p.uid) ? p.uid : null;
      }
      builds[bay] = { bay, name: b.name, decal: b.decal ?? null, cards };
    }
    const bays: Record<number, BayState> = {};
    for (let b = 1; b <= BAY_COUNT; b++) {
      // a saved bay wins field by field; a missing one is a quiet bay, not the fixture's shop timer
      const quiet: BayState = { ...bayState(b, 0), repairUntil: null, inBattle: false };
      bays[b] = { ...quiet, ...(st.bays?.[b] ?? {}) };
    }
    return {
      v: 1,
      coins: Math.max(0, Math.floor(st.coins)),
      level: typeof st.level === "number" ? st.level : ME.level,
      parts,
      builds,
      bays,
      bought: st.bought ?? {},
      nextUid: typeof st.nextUid === "number" ? st.nextUid : parts.length + 1,
      crew: Array.isArray(st.crew) ? st.crew : CREW.map((c) => ({ ...c })),
    };
  } catch {
    return null; // storage blocked or garbage: the seed stands
  }
}

function save(st: GarageState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
  } catch {
    /* storage blocked: the change lives for the session only */
  }
}

/* ── the store ───────────────────────────────────────────────────────────── */

let state: GarageState = SERVER_SEED;
let hydrated = false;
const subs = new Set<() => void>();

function emit(): void {
  subs.forEach((fn) => fn());
}

function setState(next: GarageState): void {
  state = next;
  save(next);
  emit();
}

export function subscribeGarage(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function getGarage(): GarageState {
  return state;
}

/** Called once by the screens after mount, with the clock they read. */
export function hydrateGarage(nowMs: number): void {
  if (hydrated) return;
  hydrated = true;
  const loaded = load();
  state = loaded ?? seedState(nowMs);
  if (!loaded) save(state);
  emit();
}

export function isGarageHydrated(): boolean {
  return hydrated;
}

/** Dev and harness only: throw the saved garage away and reseed. */
export function resetGarage(nowMs: number): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to remove */
  }
  hydrated = true;
  setState(seedState(nowMs));
}

/**
 * The hook. Also runs the hydrate effect, so a screen needs nothing else.
 * `nowMs` is the screen's clock at mount (never read here).
 */
export function useGarage(nowMs: number): GarageState {
  const st = useSyncExternalStore(subscribeGarage, getGarage, () => SERVER_SEED);
  useEffect(() => {
    hydrateGarage(nowMs);
    // hydrate once: the mount clock is the only one that matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return st;
}

/* ── reads ───────────────────────────────────────────────────────────────── */

export function partByUid(st: GarageState, uid: string | null): OwnedPart | null {
  return uid ? st.parts.find((p) => p.uid === uid) ?? null : null;
}

/** The parts on a build, by card slot (missing slots absent). */
export function partsOnBuild(st: GarageState, build: Build): Partial<Record<CardSlot, OwnedPart>> {
  const out: Partial<Record<CardSlot, OwnedPart>> = {};
  for (const slot of CARD_SLOTS) {
    const p = partByUid(st, build.cards[slot]);
    if (p) out[slot] = p;
  }
  return out;
}

/** Parts on no bot: what hangs on the tool board. */
export function spareParts(st: GarageState): OwnedPart[] {
  const used = new Set<string>();
  for (const b of Object.values(st.builds)) for (const uid of Object.values(b.cards)) if (uid) used.add(uid);
  return st.parts.filter((p) => !used.has(p.uid));
}

/** Which bay a part is on, or null. */
export function bayOfPart(st: GarageState, uid: string): number | null {
  for (const b of Object.values(st.builds)) for (const v of Object.values(b.cards)) if (v === uid) return b.bay;
  return null;
}

export function bayStatus(st: GarageState, bay: number, nowMs: number): BayStatus {
  const build = st.builds[bay];
  if (!build) return { kind: "empty" };
  const bs = st.bays[bay];
  if (bs?.inBattle) return { kind: "battle" };
  if (bs?.repairUntil != null && bs.repairUntil > nowMs) return { kind: "shop", leftMs: bs.repairUntil - nowMs };
  const empty = emptySockets(build).length;
  if (empty > 0) return { kind: "notReady", empty };
  return { kind: "ready", attacksLeft: bs?.attacksLeft ?? 0 };
}

/** "14:22" from ms left: hours and minutes, whole numbers, never negative. */
export function formatLeft(ms: number): string {
  const mins = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** The first empty bay, or null when the garage holds five bots. */
export function firstEmptyBay(st: GarageState): number | null {
  for (let b = 1; b <= BAY_COUNT; b++) if (!st.builds[b]) return b;
  return null;
}

export interface RecycleRow {
  part: OwnedPart;
  /** 2 for a pair card (the sheet says "x2"), else 1 */
  count: number;
  coins: number;
}

/** What a recycle returns, per part, and the total (40 percent of list). */
export function recycleRows(st: GarageState, bay: number): { rows: RecycleRow[]; total: number } {
  const build = st.builds[bay];
  if (!build) return { rows: [], total: 0 };
  const rows: RecycleRow[] = [];
  let total = 0;
  for (const slot of CARD_SLOTS) {
    const p = partByUid(st, build.cards[slot]);
    if (!p) continue;
    const coins = recycleValue(p);
    rows.push({ part: p, count: slot === "arms" || slot === "legs" ? 2 : 1, coins });
    total += coins;
  }
  return { rows, total };
}

/** UTC calendar parts of a clock value (a conversion, not a read). */
export function utcParts(nowMs: number): { year: number; month: number; day: number; weekday: number } {
  const d = new Date(nowMs);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() };
}

/* ── actions ─────────────────────────────────────────────────────────────── */

export function saveBuild(build: Build): void {
  const bays = { ...state.bays };
  if (!bays[build.bay]) bays[build.bay] = { repairUntil: null, inBattle: false, attacksLeft: ATTACKS_PER_DAY, wins: 0, losses: 0 };
  setState({ ...state, builds: { ...state.builds, [build.bay]: { ...build, cards: { ...build.cards } } }, bays });
}

export type PayResult = { ok: true; cost: number } | { ok: false; need: number };

/**
 * Paint the given parts one colour. Charges PAINT_COST per part whose
 * colour actually changes; refuses (nothing painted) when coins fall short.
 */
export function paintParts(uids: readonly string[], paint: PaintId): PayResult {
  const changing = state.parts.filter((p) => uids.includes(p.uid) && p.paint !== paint);
  const cost = changing.length * PAINT_COST;
  if (cost > state.coins) return { ok: false, need: cost - state.coins };
  if (cost === 0) return { ok: true, cost: 0 };
  const ids = new Set(changing.map((p) => p.uid));
  setState({
    ...state,
    coins: state.coins - cost,
    parts: state.parts.map((p) => (ids.has(p.uid) ? { ...p, paint } : p)),
  });
  return { ok: true, cost };
}

/** The cost a paint job WOULD charge, for the confirm line. */
export function paintCost(st: GarageState, uids: readonly string[], paint: PaintId): { cost: number; parts: number } {
  const n = st.parts.filter((p) => uids.includes(p.uid) && p.paint !== paint).length;
  return { cost: n * PAINT_COST, parts: n };
}

export type BuyResult =
  | { ok: true; uid: string }
  | { ok: false; reason: "bought" | "coins" | "level"; need: number };

/** One purchase per listing per day; the level gate; then the coins. */
export function buyListing(listing: ShopListing, day: string, provenance: string): BuyResult {
  const today = state.bought[day] ?? [];
  if (today.includes(listing.id)) return { ok: false, reason: "bought", need: 0 };
  const needLevel = LEVEL_FOR_TIER[listing.card.tier];
  if (state.level < needLevel) return { ok: false, reason: "level", need: needLevel };
  const price = listing.card.price;
  if (price > state.coins) return { ok: false, reason: "coins", need: price - state.coins };
  const uid = `p_${String(state.nextUid).padStart(3, "0")}`;
  const part: OwnedPart = { ...listing.card, uid, provenance, paint: listing.card.color };
  setState({
    ...state,
    coins: state.coins - price,
    parts: [...state.parts, part],
    bought: { ...state.bought, [day]: [...today, listing.id] },
    nextUid: state.nextUid + 1,
  });
  return { ok: true, uid };
}

export function boughtToday(st: GarageState, day: string, id: string): boolean {
  return (st.bought[day] ?? []).includes(id);
}

/** Recycle a bay's bot: the parts are gone, 40 percent comes back, the bay opens. */
export function recycleBay(bay: number): { coins: number } | null {
  const { rows, total } = recycleRows(state, bay);
  if (!state.builds[bay]) return null;
  const gone = new Set(rows.map((r) => r.part.uid));
  const builds = { ...state.builds };
  delete builds[bay];
  setState({
    ...state,
    coins: state.coins + total,
    parts: state.parts.filter((p) => !gone.has(p.uid)),
    builds,
    bays: { ...state.bays, [bay]: { repairUntil: null, inBattle: false, attacksLeft: ATTACKS_PER_DAY, wins: 0, losses: 0 } },
  });
  return { coins: total };
}

/** Put a spare part on a bay (the tool board's "Put on bay N"). */
export function putOnBay(uid: string, bay: number): boolean {
  const p = partByUid(state, uid);
  if (!p) return false;
  const build = state.builds[bay];
  if (!build) return false;
  setState({ ...state, builds: { ...state.builds, [bay]: { ...build, cards: { ...build.cards, [p.slot]: uid } } } });
  return true;
}

/** Recycle one spare part from the tool board. */
export function recyclePart(uid: string): { coins: number } | null {
  const p = partByUid(state, uid);
  if (!p || bayOfPart(state, uid) != null) return null;
  const coins = recycleValue(p);
  setState({ ...state, coins: state.coins + coins, parts: state.parts.filter((x) => x.uid !== uid) });
  return { coins };
}
