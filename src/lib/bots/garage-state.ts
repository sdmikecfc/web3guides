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
 *    is the shipment's UTC day and the listing id is "row:n" ("t1:3"),
 *    because one catalog part can sit on the shelf twice in two colours.
 *  - RECYCLE RETURNS 40 PERCENT of list price (fixtures.recycleValue) and
 *    the parts are GONE (Mike: "recycle them for a fraction").
 *  - A CARD WEARS THE COLOUR IT ARRIVED IN, for life (ADR-0141). There is no
 *    paint job and nothing here spends coins on a colour: the shipment
 *    listing's colour is copied onto the card at purchase and never moves.
 *  - A LOOK IS NEVER TAKEN ON TRUST. saveLook() below runs look.ts parseLook
 *    against a LookEarned that findsOf() builds out of this store's own rows,
 *    which are the two functions POST /api/bots/bot/save runs. Nothing here
 *    re-states a rule about what may be worn, so a face this store accepts is
 *    a face that route accepts, and there is exactly one place to change when
 *    a rule changes.
 */

import { splitLegacyEquipment, socketsOf, socketUid, equippedIds, fitPart, equipmentPaints, EQUIPMENT_SOCKETS, EQUIPMENT_KIND } from "./equipment";
import { useEffect, useSyncExternalStore } from "react";
import {
  BAY_COUNT,
  BODY_SLOTS,
  CARD_BY_ID,
  CARD_SLOTS,
  CREW,
  FIXTURE_BUILDS,
  FIXTURE_REPAIR_LEFT_MS,
  ME,
  OWNED_PARTS,
  RECORDS,
  emptySockets,
  recycleValue,
  type Build,
  type CardSlot,
  type CrewLive,
  type OwnedPart,
} from "./fixtures";
import {
  bodyPaints,
  dedupeHats,
  findsOf,
  normalizeLook,
  parseLook,
  type BotLook,
  type BotLookRaw,
  type LookEarned,
} from "./look";
import type { Listing } from "./shipment";

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
  equipmentVersion?: 2;
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
  return splitLegacyEquipment<GarageState>({
    v: 1,
    coins: ME.coins,
    level: ME.level,
    parts: OWNED_PARTS.map((p) => ({ ...p })),
    builds: Object.fromEntries(Object.entries(FIXTURE_BUILDS).map(([k, b]) => [Number(k), { ...b, cards: { ...b.cards } }])),
    bays,
    bought: {},
    nextUid: OWNED_PARTS.length + 1,
    crew: CREW.map((c) => ({ ...c })),
  });
}

/** The one server snapshot: stable identity, no clock. */
const SERVER_SEED: GarageState = seedState(0);

/* ── the look: what this robot has actually earned ───────────────────────── */

/**
 * WHAT ONE ROBOT HAS UNLOCKED, out of this store's own rows.
 *
 * It hands plain numbers to look.ts findsOf and takes back a LookEarned, so
 * every rule about what may be worn lives in that one file and this one owns
 * nothing but the reading. _server/bots.ts earnedFor does the same job from
 * database rows and calls the same findsOf, which is why a look this screen
 * offers is a look POST /api/bots/bot/save accepts.
 *
 * THREE THINGS THIS STORE CANNOT KNOW, and each returns its true answer:
 *  - a CROWN is a week champion card, and only the server writes those, so
 *    nothing here is ever a champion;
 *  - a HAT drops from beating a bigger robot, which is a real fight, so the
 *    only hat this store knows about is the one already on the robot, put
 *    there by the route that checked it (see the note on `hats` below);
 *  - LEVEL is one number for the whole garage here (the server keeps one per
 *    robot), so every robot in the garage reads the player's level.
 * None of the three is a guess in the player's favour: each is the smallest
 * true answer, so this screen can never offer a mark the route would refuse.
 */
export function earnedOfBuild(
  build: Build | undefined,
  parts: readonly OwnedPart[],
  bay: BayState | undefined,
  level: number,
): LookEarned {
  const on = (slot: CardSlot): OwnedPart | undefined => {
    const uid = build?.cards[slot];
    return uid ? parts.find((p) => p.uid === uid) : undefined;
  };
  const worn = EQUIPMENT_SOCKETS.map(s => parts.find(p => p.uid === (build ? socketUid(build,s) : null))).filter((p): p is OwnedPart => !!p);
  return findsOf({
    wins: bay?.wins ?? 0,
    losses: bay?.losses ?? 0,
    level,
    champion: false,
    bodyCount: build?.sockets ? 6 : 4,
    bodyPaints: build?.sockets ? Object.entries(equipmentPaints(build,parts)).filter(([s])=>s!=="weapon").map(([,p])=>p).filter((p): p is NonNullable<typeof p>=>!!p) : bodyPaints(slot => on(slot)?.paint),
    partStars: worn.map((p) => p.tier),
    // THE ONE HAT THE ROBOT IS ALREADY WEARING, and never any other.
    //
    // The browser cannot know which hats a wallet has won: hat rows are server
    // truth (the ninth law) and this file has none of them. Handed an empty
    // list it would do something worse than not knowing, though. parseLook
    // refuses a hat that is not in the list, so every tap on a face by a
    // player whose robot wears a hat would be refused with "You have not won
    // that hat yet", and normalizeLook would quietly take the hat off the
    // drawn robot and then off the row on the next save. A player would lose
    // a trophy because a browser could not see it.
    //
    // A hat can only have reached a stored build through POST
    // /api/bots/bot/look, which checked it against the wallet's own rows, so a
    // hat on a stored look IS a won hat. This echoes that one hat back and
    // invents nothing: it cannot add a hat, cannot change one's colour, and
    // cannot offer a second. The picker's row is drawn from the SERVER's
    // earned, never from this, so nothing here puts a tile on a screen.
    hats: dedupeHats(build?.look?.hat ? [build.look.hat] : []),
    plateNumber: build?.name.num ?? null,
  });
}

/** The same, for a bay of the store as it stands. */
export function lookEarnedOf(st: GarageState, bay: number): LookEarned {
  return earnedOfBuild(st.builds[bay], st.parts, st.bays[bay], st.level);
}

/**
 * The look a bay is wearing right now, already checked against its rows. A
 * bay with nothing chosen answers the plain robot, never null, so a caller
 * draws one thing and not two.
 */
export function lookOfBay(st: GarageState, bay: number): BotLook {
  return normalizeLook(st.builds[bay]?.look, lookEarnedOf(st, bay));
}

/**
 * Put a look on a build, and MIRROR A CHEST STICKER onto the old `decal`
 * field. A robot must never wear two stickers: the rig draws the look's own
 * sticker and stands its decal down, and every older surface that still reads
 * `decal` (the fight, a stored replay, the knockout card) gets the same
 * answer as the ones that read the look.
 */
function withLook(build: Build, look: BotLook): Build {
  return { ...build, look, decal: look.sticker && look.spot === "chest" ? look.sticker : null };
}

/* ── persistence ─────────────────────────────────────────────────────────── */

function load(): GarageState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const st = JSON.parse(raw) as GarageState;
    if (!st || st.v !== 1 || !Array.isArray(st.parts) || typeof st.coins !== "number") return null;
    // a part whose card left the catalog is dropped, and the socket it filled opens
    const parts: OwnedPart[] = st.parts
      .filter((p) => p && CARD_BY_ID[p.id])
      .map((p) => {
        const card = CARD_BY_ID[p.id];
        return { ...card, price: st.equipmentVersion === 2 ? p.price : card.price, salvage: Number.isInteger(p.salvage) && p.salvage! >= 0 ? p.salvage : undefined, uid: p.uid, provenance: p.provenance, paint: card.slot === "weapon" ? undefined : p.paint ?? card.color };
      });
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
      const sockets = b.sockets ? Object.fromEntries(EQUIPMENT_SOCKETS.map(s => {
        const p = parts.find(p => p.uid === b.sockets?.[s]);
        return [s, p && p.slot === EQUIPMENT_KIND[s] ? p.uid : null];
      })) as NonNullable<Build["sockets"]> : undefined;
      builds[bay] = { bay, name: b.name, decal: b.decal ?? null, cards, sockets, look: null };
    }
    const bays: Record<number, BayState> = {};
    for (let b = 1; b <= BAY_COUNT; b++) {
      // a saved bay wins field by field; a missing one is a quiet bay, not the fixture's shop timer
      const quiet: BayState = { ...bayState(b, 0), repairUntil: null, inBattle: false };
      bays[b] = { ...quiet, ...(st.bays?.[b] ?? {}) };
    }
    const level = typeof st.level === "number" ? st.level : ME.level;
    // THE LOOK IS RE-CHECKED ON EVERY READ, never trusted off the disk. This
    // is the read path (look.ts normalizeLook), so a robot whose owner took
    // the fourth mint part off between visits quietly loses the wink and
    // still draws, rather than throwing on the way in and blanking a garage.
    for (const bay of Object.keys(builds).map(Number)) {
      const stored = (st.builds?.[bay] as { look?: BotLookRaw } | undefined)?.look;
      builds[bay] = withLook(builds[bay], normalizeLook(stored, earnedOfBuild(builds[bay], parts, bays[bay], level)));
    }
    return splitLegacyEquipment<GarageState>({
      v: 1,
      equipmentVersion: st.equipmentVersion,
      coins: Math.max(0, Math.floor(st.coins)),
      level,
      parts,
      builds,
      bays,
      bought: st.bought ?? {},
      nextUid: typeof st.nextUid === "number" ? st.nextUid : parts.length + 1,
      crew: Array.isArray(st.crew) ? st.crew : CREW.map((c) => ({ ...c })),
    });
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

/**
 * Whether THIS snapshot is the hydrated one. A screen that loads a saved
 * build must gate on the snapshot it rendered with, not on the module flag:
 * hydrate() flips the flag synchronously inside an earlier effect, so a
 * later effect in the same commit still holds the server seed (found on the
 * Build screen's save-then-reload check, 2026-09-03).
 */
export function isHydratedState(st: GarageState): boolean {
  return st !== SERVER_SEED;
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
  for (const b of Object.values(st.builds)) for (const uid of Object.values(socketsOf(b))) if (uid) used.add(uid);
  return st.parts.filter((p) => !used.has(p.uid));
}

/** Which bay a part is on, or null. */
export function bayOfPart(st: GarageState, uid: string): number | null {
  for (const b of Object.values(st.builds)) for (const v of Object.values(socketsOf(b))) if (v === uid) return b.bay;
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

/** "14 hours" or "45 minutes" from ms left, in whole numbers and in words,
 * never negative. It used to print "14:22", which reads as twenty two
 * minutes past two. (ShopClient.tsx has the same helper and the same words;
 * that screen cannot import this one without its React store.) */
export function formatLeft(ms: number): string {
  const mins = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  if (h > 0) return `${h} ${h === 1 ? "hour" : "hours"}`;
  return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
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
  for (const uid of equippedIds(build)) {
    const p = partByUid(st, uid);
    if (!p) continue;
    const coins = recycleValue(p);
    rows.push({ part: p, count: 1, coins });
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

/**
 * PUT A LOOK ON A ROBOT, THROUGH THE SAVE ROUTE'S OWN GATE.
 *
 * It runs look.ts parseLook against earnedOfBuild's LookEarned, which is the
 * pair POST /api/bots/bot/save runs, and it THROWS a LookRefused carrying the
 * sentence the player reads when a claim does not hold up. Nothing is stored
 * on a refusal: a screen that asked for a face nobody earned has drifted, and
 * quietly storing a different look than the one asked for would hide that.
 *
 * IT SAVES THE MOMENT IT IS CALLED, because the game takes no step for a
 * cosmetic (the joint law): a tap on a face IS the save. There is no second
 * button to find and nothing to lose by walking away.
 *
 * IT WRITES THE WHOLE BUILD, parts and look together, exactly as the save
 * route writes one row. That is deliberate and it is the only arrangement in
 * which the two halves cannot disagree: a player who fits the fourth mint
 * part and then picks the Wink is picking a face the robot HAS earned, and
 * storing the face without the part that earned it would make the read path
 * quietly take it off again on the next visit. Building costs nothing
 * (strings.ts build.costsNothing), so committing the parts a tap early takes
 * nothing away from anybody.
 */
export function saveLook(bay: number, raw: BotLookRaw | null | undefined, build?: Build): BotLook {
  const current = build ?? state.builds[bay];
  if (!current) throw new Error(`spot ${bay} is empty`);
  const look = parseLook(raw, earnedOfBuild(current, state.parts, state.bays[bay], state.level));
  const bays = { ...state.bays };
  if (!bays[bay]) bays[bay] = { repairUntil: null, inBattle: false, attacksLeft: ATTACKS_PER_DAY, wins: 0, losses: 0 };
  const next = withLook({ ...current, bay, cards: { ...current.cards } }, look);
  setState({ ...state, builds: { ...state.builds, [bay]: next }, bays });
  return look;
}

export type BuyResult =
  | { ok: true; uid: string }
  | { ok: false; reason: "bought" | "coins" | "level"; need: number };

/**
 * Buy one listing off today's shipment: one purchase per listing per day,
 * then the level gate, then the coins. The card is stamped with the
 * LISTING's colour, which is the only place a colour ever comes from
 * (ADR-0141); a weapon gets none.
 */
export function buyListing(listing: Listing, day: string, provenance: string): BuyResult {
  const today = state.bought[day] ?? [];
  if (today.includes(listing.id)) return { ok: false, reason: "bought", need: 0 };
  if (state.level < listing.needsLevel) return { ok: false, reason: "level", need: listing.needsLevel };
  const price = listing.price;
  if (price > state.coins) return { ok: false, reason: "coins", need: price - state.coins };
  const uid = `p_${String(state.nextUid).padStart(3, "0")}`;
  const part: OwnedPart = { ...listing.card, price: listing.price, uid, provenance, paint: listing.color ?? undefined };
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
  setState({ ...state, builds: { ...state.builds, [bay]: fitPart(build, p, EQUIPMENT_SOCKETS.find(s => EQUIPMENT_KIND[s] === p.slot && !socketUid(build,s)) ?? EQUIPMENT_SOCKETS.find(s => EQUIPMENT_KIND[s] === p.slot)!) } });
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
