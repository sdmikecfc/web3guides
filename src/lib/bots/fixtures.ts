/**
 * BATTLE BOTS FIXTURES (week 2): the ONE catalog, owned instances, demo
 * builds and the garage's fixture data, so the Garage, Build and Shop
 * screens run with no server behind them.
 *
 * WEEK 2 CHANGE: the second catalog is gone. Every part here is an instance
 * of the engine's hand-authored PartCard (src/app/bots/_engine/catalog.ts,
 * field name `s`, never `stats`), so the shop, the tray, the lore card and a
 * fight all read the same numbers. The seed only ever SELECTS from that
 * list (the shop rotation below); nothing here rolls a part.
 *
 * SETS come from the engine too: `family` is the engine's Family id and
 * `color` its factory paint; setProgress() counts with the engine's own
 * partFamily / partColor and takes the bonus from setBonus(), so the panel
 * can never disagree with the fight. The only thing added per card is the
 * art design number (which baked still draws it) and the family's display
 * name (FAMILY_INDEX, so "Kettle set: 3 of 4" reads off the shelf).
 *
 * Renderer-free by law (the tokens.ts rule): no Pixi, no React, no clock.
 * Days and times arrive as inputs (shopListings takes the date; the fixture
 * repair countdown is an OFFSET that garage-state resolves at hydrate).
 */

import { CARD_INDEX, FAMILY_INDEX, PARTS, STARTER_PARTS } from "@/app/bots/_engine/catalog";
import {
  PRICE_BY_TIER,
  botTier as engineBotTier,
  partColor,
  partFamily,
  partTier as enginePartTier,
  setBonus,
  type Build as EngineBuild,
  type Part as EnginePart,
  type PartCard as EnginePartCard,
  type Slot,
  type Stats as EngineStats,
  type Tier,
} from "@/app/bots/_engine/parts";
import { fnv1a, mulberry32 } from "@/app/bots/_engine/rng";
import type { PaintId } from "@/app/bots/_ui/tokens";

export type { Tier };

/* ── slots ───────────────────────────────────────────────────────────────── */

/** The five purchasable part cards (the engine's Slot). Legs and arms are PAIRS. */
export type CardSlot = Slot;
export const CARD_SLOTS: readonly CardSlot[] = ["head", "torso", "arms", "legs", "weapon"];
/** the four BODY slots: the only ones a set counts (the weapon never does) */
export const BODY_SLOTS: readonly CardSlot[] = ["head", "torso", "arms", "legs"];

/** The seven body sockets a fight sees. A pair card fills two. */
export type Socket = "head" | "torso" | "armL" | "armR" | "legL" | "legR" | "weapon";
export const SOCKETS: readonly Socket[] = ["head", "torso", "armL", "armR", "legL", "legR", "weapon"];

export const SOCKETS_OF: Record<CardSlot, readonly Socket[]> = {
  head: ["head"],
  torso: ["torso"],
  arms: ["armL", "armR"],
  legs: ["legL", "legR"],
  weapon: ["weapon"],
};

export const CARD_OF_SOCKET: Record<Socket, CardSlot> = {
  head: "head",
  torso: "torso",
  armL: "arms",
  armR: "arms",
  legL: "legs",
  legR: "legs",
  weapon: "weapon",
};

/** The art slot a card draws from (arms and legs are one mirrored sprite). */
export type ArtSlot = "head" | "torso" | "arm" | "leg" | "weapon";
export const ART_OF_CARD: Record<CardSlot, ArtSlot> = {
  head: "head",
  torso: "torso",
  arms: "arm",
  legs: "leg",
  weapon: "weapon",
};

/* ── stats ───────────────────────────────────────────────────────────────── */

export type StatKey =
  | "speed"
  | "strength"
  | "dodge"
  | "damage"
  | "block"
  | "health"
  | "luck"
  | "accuracy"
  | "attackSpeed";

/** Readout order (screens doc 2.1, rows 3 to 11). */
export const STAT_KEYS: readonly StatKey[] = [
  "speed",
  "strength",
  "dodge",
  "damage",
  "block",
  "health",
  "luck",
  "accuracy",
  "attackSpeed",
];

/** Which three stats each card carries, in the part's `s` order (Mike's spec;
 * the engine's SLOT_STATS says "attack speed", the readout key is camel). */
export const SLOT_STATS: Record<CardSlot, readonly [StatKey, StatKey, StatKey]> = {
  legs: ["speed", "strength", "dodge"],
  arms: ["damage", "strength", "block"],
  torso: ["health", "strength", "luck"],
  head: ["accuracy", "dodge", "luck"],
  weapon: ["damage", "attackSpeed", "accuracy"],
};

export type Stats = EngineStats;

/* ── the catalog, adapted ────────────────────────────────────────────────── */

/**
 * The engine PartCard plus what the screens need: the family's display name
 * (the engine keeps the id) and the baked art design number. `s` is the
 * engine's field; nothing here is called `stats`. `family` and `color` stay
 * the engine's (absent on a weapon; starter scrap has a colour, no family).
 */
export interface PartCard extends EnginePartCard {
  /** "Kettle" for a launch body part, "Scrap" for starter scrap, null for a weapon */
  familyName: string | null;
  /** which of the two baked designs per slot per tier draws it */
  design: 1 | 2;
}

/** An owned instance of a card, with provenance stamped at arrival. */
export interface OwnedPart extends PartCard {
  /** the instance id (a card can be owned twice) */
  uid: string;
  /** written once at purchase, drop or recycle, never changes */
  provenance: string;
  /** the CURRENT colour: the factory colour until a paid paint job changes
   * it; absent on a weapon, which never carries paint (the engine's own
   * Part.paint shape, so an owned part IS a fight part) */
  paint?: PaintId;
}

export const PRICE_OF_TIER = PRICE_BY_TIER;

/** the family's display name, or the starter kit's "Scrap" (the catalog's
 * rule: a body part's first word IS its family) */
function familyNameOf(card: EnginePartCard): string | null {
  if (card.slot === "weapon") return null;
  if (card.family) return FAMILY_INDEX[card.family]?.name ?? card.name.split(" ")[0];
  return card.name.split(" ")[0];
}

/** the design number is the card's position inside its slot and tier group,
 * in catalog order (the bake script's t<tier>-<design> contract) */
function adaptCatalog(cards: readonly EnginePartCard[]): PartCard[] {
  const seen = new Map<string, number>();
  return cards.map((c) => {
    const key = `${c.slot}:${c.tier}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return { ...c, familyName: familyNameOf(c), design: n === 1 ? 1 : 2 };
  });
}

/** The forty launch parts, adapted. Order: catalog order. */
export const CATALOG_PARTS: readonly PartCard[] = adaptCatalog(PARTS);

/** The starter kit: the engine's FIVE cards (a legs pair, an arms pair, a
 * torso, a head, a weapon) at 15 coins each, 75 of the 120 starter coins. */
export const STARTER_KIT: readonly PartCard[] = STARTER_PARTS.map((c) => ({ ...c, familyName: familyNameOf(c), design: 1 as const }));

export const CARD_BY_ID: Readonly<Record<string, PartCard>> = Object.fromEntries(
  [...CATALOG_PARTS, ...STARTER_KIT].map((p) => [p.id, p]),
);

/** Where a card's baked art lives (the bake script's contract). */
export function partArt(p: PartCard): { base: string; mask: string } {
  const art = ART_OF_CARD[p.slot];
  const stem = `/bots-art/parts/${art}/t${p.tier}-${p.design}`;
  return { base: `${stem}.png`, mask: `${stem}.mask.png` };
}

/** A part totals 1 to 20 (the engine's rule). */
export function partTotal(p: { s: Stats }): number {
  return p.s[0] + p.s[1] + p.s[2];
}
export const partTier = enginePartTier;
export const botTier = engineBotTier;

/** Recycle returns 40 percent of the list price, whole coins (the guide). */
export const RECYCLE_PERCENT = 40;
export function recycleValue(p: { price: number }): number {
  return Math.floor((p.price * RECYCLE_PERCENT) / 100);
}

/** A paint job: 25 coins per body part (the guide's matched-set rule). */
export const PAINT_COST = 25;

/* ── the fixture wallet ──────────────────────────────────────────────────── */

/** Wallet names only, never an address (the anonymity law). Level 4 so the
 * shop's level gate has something to say (T3 needs 5, T4 needs 10). */
export const ME = { walletName: "Brass Otter 41", coins: 1240, garageNo: 412, level: 4 } as const;

/** Level floors for the tier gates (economy doc section 3). */
export const LEVEL_FOR_TIER: Readonly<Record<Tier, number>> = { 1: 1, 2: 1, 3: 5, 4: 10 };

function owned(uid: string, id: string, provenance: string, paint?: PaintId): OwnedPart {
  const c = CARD_BY_ID[id];
  if (!c) throw new Error(`bots fixtures: no catalog card ${id}`);
  return { ...c, uid, provenance, paint: c.slot === "weapon" ? undefined : paint ?? c.color };
}

/**
 * Twenty five owned parts: four bots' worth plus six spares on the tool
 * board. Bay 1 is three Kettle parts and a Hornet head, all painted mint
 * (Kettle set 3 of 4, Color set 4 of 4); bay 2 is a full Piston body in its
 * factory colours; bay 3 is the starter kit painted butter.
 */
export const OWNED_PARTS: readonly OwnedPart[] = [
  // bay 1: Sparky Kettle 7
  owned("p_001", "legs.kettleShins", "Found in the Monday shop . 1 Sep", "mint"),
  owned("p_002", "arms.kettleGrips", "Found in the Sunday shop . 31 Aug", "mint"),
  owned("p_003", "torso.kettleChest", "Found in the Tuesday shop . 2 Sep", "mint"),
  owned("p_004", "head.hornetScope", "Found in the Wednesday shop . 3 Sep", "mint"),
  owned("p_005", "weapon.steelSaw", "Found in the Tuesday shop . 2 Sep"),
  // bay 2: Iron Otter 41 (in the shop)
  owned("p_006", "legs.pistonTreads", "Found in the Friday shop . 29 Aug"),
  owned("p_007", "arms.pistonLevers", "Found in the Saturday shop . 30 Aug"),
  owned("p_008", "torso.pistonShell", "Recycled from Sleepy Kettle . 29 Aug"),
  owned("p_009", "head.pistonVisor", "Found in the Thursday shop . 28 Aug"),
  owned("p_010", "weapon.pistonHammer", "Found in the Wednesday shop . 27 Aug"),
  // bay 3: Tiny Biscuit (the starter kit, painted butter)
  owned("p_011", "starter.scrapPegs", "Starter part", "butter"),
  owned("p_012", "starter.scrapMitts", "Starter part", "butter"),
  owned("p_013", "starter.scrapCan", "Starter part", "butter"),
  owned("p_014", "starter.scrapCap", "Starter part", "butter"),
  owned("p_015", "starter.scrapSpanner", "Starter part"),
  // bay 4: Dusty Wagon (no arms yet)
  owned("p_016", "legs.sprocketPegs", "Found in the Monday shop . 1 Sep"),
  owned("p_017", "torso.sprocketCan", "Found in the Monday shop . 1 Sep"),
  owned("p_018", "head.sprocketCap", "Found in the Sunday shop . 31 Aug"),
  owned("p_019", "weapon.rustySpanner", "Found in the Sunday shop . 31 Aug"),
  // the tool board
  owned("p_020", "legs.lanternStruts", "Found in the Saturday shop . 30 Aug"),
  owned("p_021", "head.lanternLens", "Found in the Friday shop . 29 Aug"),
  owned("p_022", "arms.peeperHooks", "Recycled from Sleepy Kettle . 29 Aug"),
  owned("p_023", "weapon.tinMallet", "Found in the Thursday shop . 28 Aug"),
  owned("p_024", "torso.hornetFrame", "Found in the Tuesday shop . 2 Sep"),
  owned("p_025", "head.bulldozerHelm", "Found in the Wednesday shop . 3 Sep"),
];

/* ── builds ──────────────────────────────────────────────────────────────── */

/** Names come from two fixed tables (screens doc 2.3): no free text, ever. */
export const FIRST_WORDS = [
  "Rusty", "Copper", "Brass", "Tin", "Piston", "Sparky", "Bolt", "Gear",
  "Dusty", "Iron", "Nickel", "Chrome", "Cog", "Rivet", "Socket", "Diesel",
  "Turbo", "Ember", "Steam", "Widget", "Crank", "Gasket", "Flint", "Pebble",
  "Mossy", "Jolly", "Grumpy", "Sleepy", "Speedy", "Tiny", "Mighty", "Lucky",
] as const;

export const SECOND_WORDS = [
  "Piston", "Hammer", "Kettle", "Wagon", "Bucket", "Lantern", "Anvil", "Beetle",
  "Otter", "Badger", "Pickle", "Biscuit", "Teapot", "Toaster", "Tractor", "Rocket",
  "Pudding", "Walnut", "Muffin", "Dumpling", "Marble", "Noodle", "Turnip", "Radish",
  "Lemon", "Button", "Thimble", "Pigeon", "Donkey", "Sprocket", "Wrench", "Bolt",
] as const;

export interface BotName {
  first: string;
  second: string;
  /** optional numeral 1 to 99 */
  num: number | null;
}

export function nameText(n: BotName): string {
  return n.num ? `${n.first} ${n.second} ${n.num}` : `${n.first} ${n.second}`;
}

/** Six drawn decals (screens doc 2.1, Panel B). Drawn in Pixi, never images. */
export type DecalId = "plate" | "bolt" | "star" | "stripes" | "wrenches" | "heart";
export const DECAL_IDS: readonly DecalId[] = ["plate", "bolt", "star", "stripes", "wrenches", "heart"];

/**
 * A bay's build. Paint is NOT here any more: colour lives on each owned part
 * (OwnedPart.paint), because a paint job is per part and the painted colour
 * is what the set rule counts.
 */
export interface Build {
  bay: number;
  name: BotName;
  decal: DecalId | null;
  /** owned part uid per card slot; null = an empty socket pair */
  cards: Record<CardSlot, string | null>;
}

export const BAY_COUNT = 5;

/** The starter skeleton: an engine on hooks, no parts. */
export function starterBuild(bay: number): Build {
  return {
    bay,
    name: { first: "Rusty", second: "Piston", num: null },
    decal: null,
    cards: { head: null, torso: null, arms: null, legs: null, weapon: null },
  };
}

/** The four fixture bots. Bay 5 is empty. */
export const FIXTURE_BUILDS: Readonly<Record<number, Build>> = {
  1: {
    bay: 1,
    name: { first: "Sparky", second: "Kettle", num: 7 },
    decal: "bolt",
    cards: { head: "p_004", torso: "p_003", arms: "p_002", legs: "p_001", weapon: "p_005" },
  },
  2: {
    bay: 2,
    name: { first: "Iron", second: "Otter", num: 41 },
    decal: "star",
    cards: { head: "p_009", torso: "p_008", arms: "p_007", legs: "p_006", weapon: "p_010" },
  },
  3: {
    bay: 3,
    name: { first: "Tiny", second: "Biscuit", num: null },
    decal: "heart",
    cards: { head: "p_014", torso: "p_013", arms: "p_012", legs: "p_011", weapon: "p_015" },
  },
  4: {
    bay: 4,
    name: { first: "Dusty", second: "Wagon", num: null },
    decal: null,
    cards: { head: "p_018", torso: "p_017", arms: null, legs: "p_016", weapon: "p_019" },
  },
};

/** Bay 1's fixture, kept under its week-1 name for the Build screen. */
export const FIXTURE_BUILD: Build = FIXTURE_BUILDS[1];

/* ── derived numbers (whole numbers, never a float) ──────────────────────── */

export function emptyStats(): Record<StatKey, number> {
  return {
    speed: 0, strength: 0, dodge: 0, damage: 0, block: 0,
    health: 0, luck: 0, accuracy: 0, attackSpeed: 0,
  };
}

/** The nine readout stats: the sum over the five cards (a pair counts once). */
export function botStats(build: Build, parts: readonly OwnedPart[]): Record<StatKey, number> {
  const out = emptyStats();
  for (const slot of CARD_SLOTS) {
    const uid = build.cards[slot];
    if (!uid) continue;
    const p = parts.find((x) => x.uid === uid);
    if (!p) continue;
    const keys = SLOT_STATS[slot];
    for (let i = 0; i < 3; i++) out[keys[i]] += p.s[i];
  }
  return out;
}

/** Bot total = the five part totals (5 to 100 when complete). */
export function botTotal(build: Build, parts: readonly OwnedPart[]): number {
  let total = 0;
  for (const slot of CARD_SLOTS) {
    const uid = build.cards[slot];
    const p = uid ? parts.find((x) => x.uid === uid) : undefined;
    if (p) total += partTotal(p);
  }
  return total;
}

/** Empty SOCKETS (the seven the player sees), so a missing pair counts as 2. */
export function emptySockets(build: Build): Socket[] {
  return SOCKETS.filter((s) => build.cards[CARD_OF_SOCKET[s]] == null);
}

/**
 * The engine's Build for a bay: id, stats and the painted colour per part,
 * exactly what the resolver and setBonus read. An empty slot becomes a
 * placeholder part the card index cannot see (no family, no colour), so an
 * incomplete bot still gets an honest count.
 */
export function engineBuild(build: Build, parts: readonly OwnedPart[]): EngineBuild {
  const part = (slot: CardSlot): EnginePart => {
    const uid = build.cards[slot];
    const p = uid ? parts.find((x) => x.uid === uid) : undefined;
    if (!p) return { id: `empty.${slot}`, s: [1, 0, 0] };
    const e: EnginePart = { id: p.id, s: [p.s[0], p.s[1], p.s[2]] };
    if (p.paint && p.slot !== "weapon") e.paint = p.paint;
    return e;
  };
  return { legs: part("legs"), arms: part("arms"), torso: part("torso"), head: part("head"), weapon: part("weapon") };
}

/* ── matched sets (the guide, "Matched sets") ────────────────────────────── */

export interface SetProgress {
  /** the family with the most body parts on the bot (display name), and how many (0 to 4) */
  family: string | null;
  familyCount: number;
  /** the paint with the most body parts on the bot, and how many (0 to 4) */
  color: PaintId | null;
  colorCount: number;
  /** +1 colour set, +2 style set, +3 both; the engine's number, fights only */
  bonus: number;
}

/**
 * Counts with the engine's own partFamily / partColor over CARD_INDEX and
 * takes the bonus from setBonus(), so the panel and the pit agree. A tie
 * goes to the earlier slot in BODY_SLOTS order.
 */
export function setProgress(build: Build, parts: readonly OwnedPart[]): SetProgress {
  const b = engineBuild(build, parts);
  const famCount = new Map<string, number>();
  const colCount = new Map<PaintId, number>();
  for (const slot of BODY_SLOTS) {
    const f = partFamily(b[slot], CARD_INDEX);
    if (f) famCount.set(f, (famCount.get(f) ?? 0) + 1);
    const c = partColor(b[slot], CARD_INDEX);
    if (c) colCount.set(c, (colCount.get(c) ?? 0) + 1);
  }
  const lead = <K,>(m: Map<K, number>): [K | null, number] => {
    let best: K | null = null;
    let n = 0;
    m.forEach((count, k) => {
      if (count > n) {
        best = k;
        n = count;
      }
    });
    return [best, n];
  };
  const [famId, familyCount] = lead(famCount);
  const [color, colorCount] = lead(colCount);
  return {
    family: famId ? FAMILY_INDEX[famId]?.name ?? famId : null,
    familyCount,
    color,
    colorCount,
    bonus: setBonus(b, CARD_INDEX).perStat,
  };
}

/* ── the shop rotation (economy doc section 3) ───────────────────────────── */

export interface ShopListing {
  /** the catalog id; also the "one purchase per listing per day" key */
  id: string;
  card: PartCard;
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** The day key everyone shares: "2026-09-03" (UTC). */
export function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Today's six listings. seed = fnv1a("bb:" + month + ":" + day); 2 T1, 2 T2,
 * 1 T3, and a T4 on Wednesdays (3) and Saturdays (6). The stream only ever
 * picks an index into the published tables. Everyone sees the same shelf.
 */
export function shopListings(year: number, month: number, day: number, weekday: number): ShopListing[] {
  const seed = fnv1a(`bb:${year}-${String(month).padStart(2, "0")}:${String(day).padStart(2, "0")}`);
  const rng = mulberry32(seed);
  const want: Array<[Tier, number]> = [[1, 2], [2, 2], [3, 1]];
  if (weekday === 3 || weekday === 6) want.push([4, 1]);
  const out: ShopListing[] = [];
  for (const [tier, n] of want) {
    const pool = CATALOG_PARTS.filter((p) => p.tier === tier);
    for (let i = 0; i < n && pool.length; i++) {
      const at = Math.floor(rng() * pool.length);
      const card = pool.splice(at, 1)[0];
      out.push({ id: card.id, card });
    }
  }
  return out;
}

/* ── the garage's fixture data (the tracker job writes these later) ──────── */

export type StrategyKind = "blsh" | "position" | "limit";

export interface CrewLive {
  kind: StrategyKind;
  tokens: readonly string[];
  fillsToday: number;
  coinsToday: number;
  /** the last fill's coins, for the speech chip */
  lastFillCoins: number;
}

/** Two live strategies: a hammer at the bench and a trip wire on the floor. */
export const CREW: readonly CrewLive[] = [
  { kind: "blsh", tokens: ["forge.keep", "hexline.ai", "ember.vale"], fillsToday: 3, coinsToday: 42, lastFillCoins: 14 },
  { kind: "limit", tokens: ["signal.zone"], fillsToday: 1, coinsToday: 20, lastFillCoins: 20 },
];

export interface FightRow {
  id: string;
  result: "win" | "loss";
  opponent: string;
  wallet: string;
  /** the part that ended it, in player words */
  finisher: string;
  date: string;
}

/** Last five fights per bay (fixture; the fight rows come from the server). */
export const FIGHTS: Readonly<Record<number, readonly FightRow[]>> = {
  1: [
    { id: "f_1041", result: "win", opponent: "Big Bruiser", wallet: "Copper Hare 7", finisher: "head off", date: "2 Sep" },
    { id: "f_1033", result: "win", opponent: "Scrapper", wallet: "House", finisher: "body off", date: "2 Sep" },
    { id: "f_1019", result: "loss", opponent: "Grumpy Turnip", wallet: "Tin Pigeon 3", finisher: "left leg off", date: "1 Sep" },
    { id: "f_1002", result: "win", opponent: "Scrapper", wallet: "House", finisher: "head off", date: "31 Aug" },
    { id: "f_0988", result: "win", opponent: "Foreman", wallet: "House", finisher: "body off", date: "30 Aug" },
  ],
  2: [
    { id: "f_1044", result: "loss", opponent: "Mighty Anvil 9", wallet: "Steam Badger 12", finisher: "head off", date: "3 Sep" },
    { id: "f_1030", result: "win", opponent: "Big Rig", wallet: "House", finisher: "body off", date: "2 Sep" },
    { id: "f_1021", result: "win", opponent: "Jolly Muffin", wallet: "Flint Otter 5", finisher: "right arm off", date: "1 Sep" },
  ],
  3: [
    { id: "f_1038", result: "win", opponent: "Scrapper", wallet: "House", finisher: "body off", date: "2 Sep" },
    { id: "f_1027", result: "loss", opponent: "Scrapper", wallet: "House", finisher: "head off", date: "1 Sep" },
  ],
  4: [],
  5: [],
};

/** Wins and losses per bay (fixture). */
export const RECORDS: Readonly<Record<number, { wins: number; losses: number }>> = {
  1: { wins: 7, losses: 3 },
  2: { wins: 4, losses: 2 },
  3: { wins: 1, losses: 1 },
  4: { wins: 0, losses: 0 },
  5: { wins: 0, losses: 0 },
};

export interface PaperLine {
  text: string;
  /** a Watch link (fight id), a Shop link, or nothing */
  link: { kind: "watch"; id: string } | { kind: "shop" } | null;
}

/** Last night's Morning Paper (fixture; generated once a day per wallet). */
export const PAPER: { date: string; lines: readonly PaperLine[] } = {
  date: "Thursday 3 September",
  lines: [
    { text: "Iron Otter 41 lost the head to Steam Badger 12's Mighty Anvil 9. Watch.", link: { kind: "watch", id: "f_1044" } },
    { text: "Your Buy Low Sell High crew filled 3 times. 42 coins.", link: null },
    { text: "Your limit order filled once. 20 coins.", link: null },
    { text: "The shop has 2 new Tier 2 parts today.", link: { kind: "shop" } },
    { text: "You moved up 4 places on the board.", link: null },
  ],
};

/** Bay 2 is in the shop: 14 hours 22 minutes left at first load (an OFFSET,
 * resolved against the clock by garage-state at hydrate, never here). */
export const FIXTURE_REPAIR_LEFT_MS = (14 * 60 + 22) * 60 * 1000;
