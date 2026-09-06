/**
 * THE JUNKYARD: one shipment a day (ADR-0141, Mike 2026-09-03: "I don't want
 * them to buy paint. I want it to be like a junkyard and shipments of parts
 * arrive everyday").
 *
 * PURE AND DETERMINISTIC. No clock read, no React, no Pixi (the tokens.ts
 * rule fixtures.ts carries). The day key and the day index arrive as
 * arguments; every number is a whole number; the seed only ever SELECTS an
 * index into a published table (the S5/S6/S7 law carried whole, see
 * _engine/catalog.ts). A port of the design lane's reference
 * (lane-c/shipment-ref.mjs), draw for draw, so the web, the reporter and the
 * 60 day fixture agree byte for byte.
 *
 * THE SHELF, every day: 16 listings in five rows.
 *   T1  8  four body parts in the day's T1 colour, one per slot, the two T1
 *          families dealt two and two, plus one more per slot in four other
 *          colours, all distinct (five colours on the T1 shelf every day)
 *   T2  4  one per body slot in the day's T2 colour, families two and two
 *   T3  2  the day's T3 colour; head and torso on that colour's even visits,
 *          arms and legs on its odd visits (visits are 8 days apart)
 *   T4  1  the authored calendar's slot and colour; the seed picks only the
 *          design (Bulldozer or Anvil)
 *   rack 1 one weapon; the tier walks T1, T2, T3 by day. Weapons never carry
 *          a colour and never count toward a set.
 *
 * ROW COLOURS walk the palette one step a day from three starts (T1 from
 * mint, T2 three colours on, T3 six on), so the three rows never share a
 * colour on a day and every colour returns every 8 days.
 *
 * A LISTING'S COLOUR IS THE CARD'S COLOUR FOR LIFE. There is no paint job.
 * The catalog colour is art only from here on (the shelf thumb before a
 * listing colour lands, and the fixtures).
 */

import { FAMILIES, PARTS } from "@/app/bots/_engine/catalog";
import { PAINT_IDS, PRICE_BY_TIER, type PaintId, type Tier } from "@/app/bots/_engine/parts";
import { fnv1a, mulberry32, type Rng } from "@/app/bots/_engine/rng";
import { CARD_BY_ID, LEVEL_FOR_TIER, type CardSlot, type PartCard } from "./fixtures";

/* ── the authored tables ─────────────────────────────────────────────────── */

/** The eight paints in palette order. The engine's own table (parts.ts
 * PAINT_IDS), so a rename there breaks this file at compile time. */
export const PALETTE: readonly PaintId[] = PAINT_IDS;

/** A body slot: the four a colour set counts. A weapon is never one. */
export type BodySlotKey = "head" | "torso" | "arms" | "legs";

/** The four body slots in SHELF order (head first, the way a card reads).
 * The engine's BODY_SLOTS is in stat order and is a different list on
 * purpose; the shelf never uses it. */
export const SHELF_SLOTS: readonly BodySlotKey[] = ["head", "torso", "arms", "legs"];

/** The five rows of a shipment, top to bottom. */
export type RowKey = "t1" | "t2" | "t3" | "t4" | "rack";
export const ROW_KEYS: readonly RowKey[] = ["t1", "t2", "t3", "t4", "rack"];

/** How many BODY listings each row holds. The rack holds one weapon. */
export const ROW_SIZE: Readonly<Record<RowKey, number>> = { t1: 8, t2: 4, t3: 2, t4: 1, rack: 1 };

/**
 * The seven arrival lines, one picked a day. An authored player-facing
 * table living beside its selector, the way FIRST_WORDS and SECOND_WORDS do
 * in fixtures.ts; the seed only indexes into it.
 */
export const SHIPMENT_NAMES: readonly string[] = [
  "It came in this morning on a boat.",
  "It came in last night on a train.",
  "A truck brought it very early.",
  "A crane put it down before the sun came up.",
  "Pulled out of the water this morning.",
  "A big cart rolled it in.",
  "Lowered down from a big balloon.",
];

/** The T4 walk, Monday to Friday. Saturday and Sunday repeat two body slots. */
export const T4_WALK: readonly CardSlot[] = ["head", "torso", "arms", "legs", "weapon"];

/** The Monday of campaign week 1 (UTC). The server config
 * `battle_bots_config.shop_epoch_monday` overrides it; this is the default
 * the screens and the gates run on. */
export const SHOP_EPOCH_MONDAY = "2026-09-07";

/** Recycle returns 40 percent of list price (the guide). Kept here too so a
 * gate can prove a listing's price and its recycle value are whole coins. */
export const RECYCLE_PERCENT = 40;

/* ── the catalog, indexed the way the shelf reads it ─────────────────────── */

type FamilyKeys = Readonly<Record<BodySlotKey, string>>;

/** family id -> body slot -> catalog key. Built from the ONE catalog, never
 * transcribed: a family missing a slot THROWS at import (a shelf that cannot
 * be dealt must never quietly deal three parts). */
function buildFamilyKeys(): Readonly<Record<string, FamilyKeys>> {
  const out: Record<string, Partial<Record<BodySlotKey, string>>> = {};
  for (const p of PARTS) {
    if (!p.family || p.slot === "weapon") continue;
    (out[p.family] ??= {})[p.slot as BodySlotKey] = p.id;
  }
  for (const f of FAMILIES) {
    const got = out[f.id];
    for (const slot of SHELF_SLOTS) {
      if (!got || !got[slot]) throw new Error(`shipment: family ${f.id} has no ${slot} in the catalog`);
    }
  }
  return out as Readonly<Record<string, FamilyKeys>>;
}

const FAMILY_KEYS = buildFamilyKeys();

/** The two families of each tier, in catalog order. */
function buildFamiliesByTier(): Readonly<Record<Tier, readonly string[]>> {
  const out = {} as Record<Tier, string[]>;
  for (const tier of [1, 2, 3, 4] as const) {
    out[tier] = FAMILIES.filter((f) => f.tier === tier).map((f) => f.id);
    if (out[tier].length !== 2) throw new Error(`shipment: tier ${tier} has ${out[tier].length} families, expected 2`);
  }
  return out;
}

/** The two weapons of each tier, in catalog order. */
function buildWeaponsByTier(): Readonly<Record<Tier, readonly string[]>> {
  const out = {} as Record<Tier, string[]>;
  for (const tier of [1, 2, 3, 4] as const) {
    out[tier] = PARTS.filter((p) => p.slot === "weapon" && p.tier === tier).map((p) => p.id);
    if (out[tier].length !== 2) throw new Error(`shipment: tier ${tier} has ${out[tier].length} weapons, expected 2`);
  }
  return out;
}

export const FAMILIES_BY_TIER = buildFamiliesByTier();
export const WEAPONS_BY_TIER = buildWeaponsByTier();

/* ── whole-number calendar maths (no Date inside the pure path) ───────────── */

/** Days since 1970-01-01 for a civil UTC date (Howard Hinnant's days_from_civil,
 * integer arithmetic only). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The civil UTC date of a day number (the inverse of daysFromCivil). */
export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-09-07" -> its parts. THROWS on anything else: a bad day key must
 * never quietly become day zero. */
export function partsOfDayKey(dayKey: string): { year: number; month: number; day: number } {
  const m = DAY_KEY_RE.exec(dayKey);
  if (!m) throw new Error(`shipment: bad day key ${JSON.stringify(dayKey)}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** The day key everyone shares: "2026-09-07" (UTC). */
export function dayKeyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** N days after a day key, as a day key. */
export function addDays(dayKey: string, n: number): string {
  const p = partsOfDayKey(dayKey);
  const c = civilFromDays(daysFromCivil(p.year, p.month, p.day) + n);
  return dayKeyOf(c.year, c.month, c.day);
}

/** Days since the shop's epoch Monday. Negative before the epoch (the
 * shipment maths handles that; the callers never ship a past date). */
export function dayIndexOf(dayKey: string, epochMonday: string = SHOP_EPOCH_MONDAY): number {
  const a = partsOfDayKey(dayKey);
  const b = partsOfDayKey(epochMonday);
  return daysFromCivil(a.year, a.month, a.day) - daysFromCivil(b.year, b.month, b.day);
}

/** 0 Sunday .. 6 Saturday, so it indexes fixtures.WEEKDAYS. */
export function weekdayOf(dayKey: string): number {
  const p = partsOfDayKey(dayKey);
  const d = daysFromCivil(p.year, p.month, p.day);
  return ((d + 4) % 7 + 7) % 7;
}

/** Milliseconds from a clock value to the next 00:00 UTC. A conversion, not
 * a clock read: the screen hands its own mount clock in. */
export function msToNextShipment(nowMs: number): number {
  const dayMs = 86400000;
  const left = dayMs - (((nowMs % dayMs) + dayMs) % dayMs);
  return left === dayMs ? 0 : left;
}

/* ── the seed stream (selects, never designs) ────────────────────────────── */

/** seed = fnv1a("bb:<year>-<month>:<day>"), the week-2 shop's own contract. */
export function seedOfDay(dayKey: string): number {
  const p = partsOfDayKey(dayKey);
  return fnv1a(`bb:${p.year}-${String(p.month).padStart(2, "0")}:${String(p.day).padStart(2, "0")}`);
}

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/* ── the authored T4 calendar ────────────────────────────────────────────── */

export interface T4Day {
  /** 1..8, then it repeats (week 9 reads week 1) */
  week: number;
  /** 0 Monday .. 6 Sunday */
  weekday: number;
  slot: CardSlot;
  /** null on Friday, the weapon day */
  color: PaintId | null;
}

/**
 * The authored calendar: one colour a week in palette order; Mon head, Tue
 * torso, Wed arms, Thu legs, Fri the T4 weapon (no colour), Sat and Sun
 * repeat two body slots (odd weeks head and torso, even weeks arms and
 * legs). The seed never touches any of this.
 */
export function t4Calendar(week: number, weekday: number): { slot: CardSlot; color: PaintId | null } {
  const n = PALETTE.length;
  // the week number cycles in BOTH directions: week 9 reads week 1, and a
  // week at or before 0 (the days before the epoch Monday, which the shop
  // shows until an operator sets shop_epoch_monday) reads its own place in
  // the cycle instead of falling off the front of the palette
  const color = PALETTE[(((week - 1) % n) + n) % n];
  if (weekday < 5) return { slot: T4_WALK[weekday], color: weekday === 4 ? null : color };
  const odd = (((week % 2) + 2) % 2) === 1;
  const pair: BodySlotKey[] = odd ? ["head", "torso"] : ["arms", "legs"];
  return { slot: pair[weekday - 5], color };
}

/** The whole eight-week calendar, for the shop strip and the gates. */
export function t4CalendarTable(): T4Day[] {
  const out: T4Day[] = [];
  for (let week = 1; week <= PALETTE.length; week++) {
    for (let weekday = 0; weekday < 7; weekday++) {
      const c = t4Calendar(week, weekday);
      out.push({ week, weekday, slot: c.slot, color: c.color });
    }
  }
  return out;
}

/* ── a listing and a shipment ────────────────────────────────────────────── */

export interface Listing {
  /** "t1:3": the row and the index inside it. Stable, and the once-a-day
   * key, because one catalog part can sit on the shelf twice in two
   * colours (which is why the catalog key stopped being the id). */
  id: string;
  row: RowKey;
  partKey: string;
  slot: CardSlot;
  tier: Tier;
  /** the colour this card wears for life; null on a weapon */
  color: PaintId | null;
  price: number;
  /** true when the colour is the row's colour of the day */
  dayColor: boolean;
  /** the bot level this tier needs (T3 5, T4 10) */
  needsLevel: number;
  card: PartCard;
}

export interface Shipment {
  v: 1;
  dayKey: string;
  dayIndex: number;
  /** the shipment line, picked from SHIPMENT_NAMES */
  name: string;
  colors: { t1: PaintId; t2: PaintId; t3: PaintId };
  t4: T4Day;
  rackTier: Tier;
  rows: Record<RowKey, Listing[]>;
  /** the same 16 listings, flattened in row order */
  listings: Listing[];
}

export const LISTING_ID_RE = /^(?:t1|t2|t3|t4|rack):(?:[1-9]|1[0-6])$/;

/**
 * A shipment's own shape check. THROWS, never clamps: a shelf that is not
 * 8/4/2/1/1 with distinct row colours and unique ids is a bug, and a shop
 * that quietly sells a short shelf is worse than a shop that stops.
 */
export function assertShipment(s: Shipment): void {
  for (const row of ROW_KEYS) {
    if (s.rows[row].length !== ROW_SIZE[row]) {
      throw new Error(`shipment ${s.dayKey}: row ${row} has ${s.rows[row].length} listings, expected ${ROW_SIZE[row]}`);
    }
  }
  if (s.listings.length !== 16) throw new Error(`shipment ${s.dayKey}: ${s.listings.length} listings, expected 16`);
  const ids = new Set(s.listings.map((l) => l.id));
  if (ids.size !== 16) throw new Error(`shipment ${s.dayKey}: listing ids are not unique`);
  const { t1, t2, t3 } = s.colors;
  if (t1 === t2 || t2 === t3 || t1 === t3) throw new Error(`shipment ${s.dayKey}: row colours collide (${t1}, ${t2}, ${t3})`);
  for (const l of s.listings) {
    if (!LISTING_ID_RE.test(l.id)) throw new Error(`shipment ${s.dayKey}: bad listing id ${l.id}`);
    if ((l.slot === "weapon") !== (l.color === null)) {
      throw new Error(`shipment ${s.dayKey}: ${l.id} breaks the colour rule (slot ${l.slot}, colour ${String(l.color)})`);
    }
    if (!Number.isInteger(l.price) || l.price <= 0) throw new Error(`shipment ${s.dayKey}: ${l.id} price ${l.price} is not whole coins`);
  }
  const t4 = s.rows.t4[0];
  if (t4.tier !== 4 || t4.slot !== s.t4.slot) throw new Error(`shipment ${s.dayKey}: the T4 listing does not follow the calendar`);
}

function cardOf(partKey: string): PartCard {
  const card = CARD_BY_ID[partKey];
  if (!card) throw new Error(`shipment: no catalog card ${partKey}`);
  return card;
}

function listing(row: RowKey, n: number, tier: Tier, slot: CardSlot, partKey: string, color: PaintId | null, dayColor: boolean): Listing {
  return {
    id: `${row}:${n}`,
    row,
    partKey,
    slot,
    tier,
    color,
    price: PRICE_BY_TIER[tier],
    dayColor,
    needsLevel: LEVEL_FOR_TIER[tier],
    card: cardOf(partKey),
  };
}

/**
 * The day's shipment. `dayIndex` is days since the shop's epoch Monday; it
 * decides the row colours, the T3 pair, the rack tier and the T4 calendar
 * slot, and the seed decides nothing but which authored design fills each
 * of them.
 *
 * The draw order is the reference's, exactly, because the reporter and the
 * 60 day fixture read the same stream.
 */
export function shipmentFor(dayKey: string, dayIndex: number = dayIndexOf(dayKey)): Shipment {
  if (!Number.isInteger(dayIndex)) throw new Error(`shipment: day index ${dayIndex} is not a whole number`);
  const rng = mulberry32(seedOfDay(dayKey));
  const n = PALETTE.length;
  const mod = (x: number): number => ((x % n) + n) % n;
  const colors = {
    t1: PALETTE[mod(dayIndex)],
    t2: PALETTE[mod(dayIndex + 3)],
    t3: PALETTE[mod(dayIndex + 6)],
  };
  const week = Math.floor(dayIndex / 7) + 1;
  const weekday = ((dayIndex % 7) + 7) % 7;
  const cal = t4Calendar(week, weekday);
  const t4: T4Day = { week, weekday, slot: cal.slot, color: cal.color };
  const rackTier = ((((dayIndex % 3) + 3) % 3) + 1) as Tier;
  const rows: Record<RowKey, Listing[]> = { t1: [], t2: [], t3: [], t4: [], rack: [] };

  // T1: four body parts in the day's colour, the two families dealt two and two
  const f1 = FAMILIES_BY_TIER[1];
  const deal1 = shuffle(rng, [f1[0], f1[0], f1[1], f1[1]]);
  SHELF_SLOTS.forEach((slot, i) => rows.t1.push(listing("t1", i + 1, 1, slot, FAMILY_KEYS[deal1[i]][slot], colors.t1, true)));
  // T1: one more per slot in four OTHER colours, all distinct
  const others = shuffle(rng, PALETTE.filter((c) => c !== colors.t1)).slice(0, 4);
  SHELF_SLOTS.forEach((slot, i) => rows.t1.push(listing("t1", i + 5, 1, slot, FAMILY_KEYS[pick(rng, f1)][slot], others[i], false)));
  // T2: one per body slot in the day's T2 colour, families dealt two and two
  const f2 = FAMILIES_BY_TIER[2];
  const deal2 = shuffle(rng, [f2[0], f2[0], f2[1], f2[1]]);
  SHELF_SLOTS.forEach((slot, i) => rows.t2.push(listing("t2", i + 1, 2, slot, FAMILY_KEYS[deal2[i]][slot], colors.t2, true)));
  // T3: the pair by this colour's visit number (even head and torso, odd arms and legs)
  const visit = Math.floor(dayIndex / n);
  const pair: BodySlotKey[] = ((visit % 2) + 2) % 2 === 0 ? ["head", "torso"] : ["arms", "legs"];
  const f3 = FAMILIES_BY_TIER[3];
  pair.forEach((slot, i) => rows.t3.push(listing("t3", i + 1, 3, slot, FAMILY_KEYS[pick(rng, f3)][slot], colors.t3, true)));
  // T4: the calendar's slot and colour; the seed picks only Bulldozer or Anvil
  const t4Slot = t4.slot;
  if (t4Slot === "weapon") rows.t4.push(listing("t4", 1, 4, "weapon", pick(rng, WEAPONS_BY_TIER[4]), null, false));
  else rows.t4.push(listing("t4", 1, 4, t4Slot, FAMILY_KEYS[pick(rng, FAMILIES_BY_TIER[4])][t4Slot as BodySlotKey], t4.color, true));
  // the rack: one weapon, the tier walking T1, T2, T3
  rows.rack.push(listing("rack", 1, rackTier, "weapon", pick(rng, WEAPONS_BY_TIER[rackTier]), null, false));

  const s: Shipment = {
    v: 1,
    dayKey,
    dayIndex,
    name: pick(rng, SHIPMENT_NAMES),
    colors,
    t4,
    rackTier,
    rows,
    listings: ROW_KEYS.flatMap((r) => rows[r]),
  };
  assertShipment(s);
  return s;
}

/** One listing of a shipment by id, or null. */
export function listingOf(s: Shipment, id: string): Listing | null {
  return s.listings.find((l) => l.id === id) ?? null;
}

/* ── the wire manifest (what the shop_days row stores) ───────────────────── */

export interface ManifestListing {
  id: string;
  row: RowKey;
  part_key: string;
  slot_kind: CardSlot;
  tier: Tier;
  color: PaintId | null;
  price: number;
  day_color: boolean;
}

export interface Manifest {
  v: 1;
  day_key: string;
  day_index: number;
  name: string;
  colors: { t1: PaintId; t2: PaintId; t3: PaintId };
  t4: { week: number; weekday: number; slot: CardSlot; color: PaintId | null };
  rack_tier: Tier;
  rows: Record<RowKey, ManifestListing[]>;
}

/** The shipment as `battle_bots_shop_days.manifest` stores it (ADR-0141),
 * snake_case and without the catalog card: the same 16 listings the 60 day
 * fixture pins on both sides of the wire. */
export function manifestOf(s: Shipment): Manifest {
  const wire = (l: Listing): ManifestListing => ({
    id: l.id,
    row: l.row,
    part_key: l.partKey,
    slot_kind: l.slot,
    tier: l.tier,
    color: l.color,
    price: l.price,
    day_color: l.dayColor,
  });
  return {
    v: 1,
    day_key: s.dayKey,
    day_index: s.dayIndex,
    name: s.name,
    colors: s.colors,
    t4: { week: s.t4.week, weekday: s.t4.weekday, slot: s.t4.slot, color: s.t4.color },
    rack_tier: s.rackTier,
    rows: {
      t1: s.rows.t1.map(wire),
      t2: s.rows.t2.map(wire),
      t3: s.rows.t3.map(wire),
      t4: s.rows.t4.map(wire),
      rack: s.rows.rack.map(wire),
    },
  };
}

/* ── the starter kit's colours ───────────────────────────────────────────── */

/**
 * The five starter cards keep the same 15 coin price; each BODY card gets one
 * palette colour from a per-wallet seed, four independent picks (all four
 * matching is 1 in 512), so a new player already owns colours to chase. The
 * weapon gets none.
 *
 * ADR-0141 writes the seed as sha256("bb:starter:" + wallet); the design
 * lane's reference used the game's own fnv1a plus mulberry32 for the
 * shipment, and this file keeps ONE rng so the browser needs no crypto and
 * the reporter and the web agree. Flagged for Mike in the hand-off.
 */
export function starterColors(wallet: string): Record<CardSlot, PaintId | null> {
  const rng = mulberry32(fnv1a(`bb:starter:${wallet.toLowerCase()}`));
  const out = {} as Record<CardSlot, PaintId | null>;
  for (const slot of SHELF_SLOTS) out[slot] = PALETTE[Math.floor(rng() * PALETTE.length)];
  out.weapon = null;
  return out;
}

/**
 * THE DROP SEED. A part won from a fight arrives in a colour, the same way a
 * bought part and a starter part do: ADR-0141 decision 3 says a card's colour
 * is set once when it arrives, "from the shipment listing, the per-wallet
 * starter seed, or the drop seed", and this is that seed.
 *
 * It is a pure function of the fight id and the part, so the same fight always
 * hands out the same colour: the drop insert is written once, but it is
 * retried and replayed, and a colour that changed between two attempts would
 * be a different card each time.
 *
 * A weapon has no colour, which is the same rule the shelf keeps
 * (assertShipment: colour is null exactly on the weapon slot).
 *
 * THE ONE ENTRY POINT. Anything that creates a part card from a fight calls
 * this. A private copy somewhere else would be a second colour rule, and a
 * player would see the shelf and their winnings disagree.
 */
export function dropColor(fightId: string, partKey: string, slot: CardSlot): PaintId | null {
  if (slot === "weapon") return null;
  const rng = mulberry32(fnv1a(`bb:drop:${fightId}:${partKey}`));
  return PALETTE[Math.floor(rng() * PALETTE.length)];
}
