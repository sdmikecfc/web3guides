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
 * WEEK 3 CHANGE (ADR-0141, the Junkyard): the six-listing daily rotation and
 * the paid paint job are gone. The shelf is a daily SHIPMENT and lives in
 * src/lib/bots/shipment.ts (which imports this file, never the other way
 * round); a card's colour arrives with the listing and never changes, so
 * OwnedPart.paint is set once and PAINT_COST is deleted.
 *
 * Renderer-free by law (the tokens.ts rule): no Pixi, no React, no clock.
 * Days and times arrive as inputs (the fixture repair countdown is an OFFSET
 * that garage-state resolves at hydrate).
 */

import type { BotLook } from "./look";
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
import type { PaintId } from "@/app/bots/_ui/tokens";
import { BOT_FIRST_WORDS, BOT_SECOND_WORDS } from "./naming";

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
  /** the colour this card came in, set ONCE when it arrived (the shipment
   * listing, the starter seed, a battle drop) and never changed after: there
   * is no paint job (ADR-0141). Absent on a weapon, which never carries a
   * colour (the engine's own Part.paint shape, so an owned part IS a fight
   * part). The catalog colour is art only, and the fallback the fixtures
   * use for a card whose arrival colour was never written down. */
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

/* ── the fixture wallet ──────────────────────────────────────────────────── */

/** Wallet names only, never an address (the anonymity law). Level 4 so the
 * shop's level gate has something to say (T3 needs 5, T4 needs 10). */
/** The demo garage. NOTHING a signed out visitor reads may come from here:
 * the top bar used to print these coins and this name to everybody. */
export const ME = { walletName: "Brass Falcon 41", coins: 1240, garageNo: 412, level: 4 } as const;

/** Level floors for the tier gates (economy doc section 3). */
export const LEVEL_FOR_TIER: Readonly<Record<Tier, number>> = { 1: 1, 2: 1, 3: 5, 4: 10 };

function owned(uid: string, id: string, provenance: string, paint?: PaintId): OwnedPart {
  const c = CARD_BY_ID[id];
  if (!c) throw new Error(`bots fixtures: no catalog card ${id}`);
  return { ...c, uid, provenance, paint: c.slot === "weapon" ? undefined : paint ?? c.color };
}

/**
 * Twenty five owned parts: four bots' worth plus six spares on the tool
 * board. Every colour is the colour the card CAME IN (ADR-0141), so the
 * fixtures show what a real tool board looks like: bay 1 is three Kettle
 * parts and a Hornet head that all arrived mint (Kettle set 3 of 4, colour
 * set 4 of 4, the reward for buying on the right days); bay 2 is a full
 * Piston body in four colours it happened to arrive in; bay 3 is the starter
 * kit, whose seeded colours match on two of the four cards.
 */
export const OWNED_PARTS: readonly OwnedPart[] = [
  // bay 1: Sparky Kettle 7, four mint cards bought across four shipments
  owned("p_001", "legs.kettleShins", "Found in the Monday shipment . 1 Sep", "mint"),
  owned("p_002", "arms.kettleGrips", "Found in the Sunday shipment . 31 Aug", "mint"),
  owned("p_003", "torso.kettleChest", "Found in the Tuesday shipment . 2 Sep", "mint"),
  owned("p_004", "head.hornetScope", "Found in the Wednesday shipment . 3 Sep", "mint"),
  owned("p_005", "weapon.steelSaw", "Found in the Tuesday shipment . 2 Sep"),
  // bay 2: Iron Otter 41 (in the shop), four colours, no set
  owned("p_006", "legs.pistonTreads", "Found in the Friday shipment . 29 Aug", "cream"),
  owned("p_007", "arms.pistonLevers", "Found in the Saturday shipment . 30 Aug", "ink"),
  owned("p_008", "torso.pistonShell", "Recycled from Sleepy Kettle . 29 Aug", "mint"),
  owned("p_009", "head.pistonVisor", "Found in the Thursday shipment . 28 Aug", "coral"),
  owned("p_010", "weapon.pistonHammer", "Found in the Wednesday shipment . 27 Aug"),
  // bay 3: Tiny Biscuit, the starter kit in its seeded colours (two match)
  owned("p_011", "starter.scrapPegs", "Starter part", "cream"),
  owned("p_012", "starter.scrapMitts", "Starter part", "mint"),
  owned("p_013", "starter.scrapCan", "Starter part", "cream"),
  owned("p_014", "starter.scrapCap", "Starter part", "coral"),
  owned("p_015", "starter.scrapSpanner", "Starter part"),
  // bay 4: Dusty Wagon (no arms yet)
  owned("p_016", "legs.sprocketPegs", "Found in the Monday shipment . 1 Sep", "sky"),
  owned("p_017", "torso.sprocketCan", "Found in the Monday shipment . 1 Sep", "sky"),
  owned("p_018", "head.sprocketCap", "Found in the Sunday shipment . 31 Aug", "moss"),
  owned("p_019", "weapon.rustySpanner", "Found in the Sunday shipment . 31 Aug"),
  // the tool board
  owned("p_020", "legs.lanternStruts", "Found in the Saturday shipment . 30 Aug", "butter"),
  owned("p_021", "head.lanternLens", "Found in the Friday shipment . 29 Aug", "lilac"),
  owned("p_022", "arms.peeperHooks", "Recycled from Sleepy Kettle . 29 Aug", "moss"),
  owned("p_023", "weapon.tinMallet", "Found in the Thursday shipment . 28 Aug"),
  owned("p_024", "torso.hornetFrame", "Found in the Tuesday shipment . 2 Sep", "lilac"),
  owned("p_025", "head.bulldozerHelm", "Found in the Wednesday shipment . 3 Sep", "cream"),
];

/* ── builds ──────────────────────────────────────────────────────────────── */

/**
 * Names come from two fixed tables (screens doc 2.3): no free text, ever.
 *
 * THE TABLES LIVE IN naming.ts NOW. They used to be full of machine words
 * (Piston, Sparky, Bolt, Gear, Kettle, Anvil, Sprocket, Wrench), which are
 * also part words, so a robot could be called "Sparky Kettle 7" and read
 * like a part on a shelf rather than like somebody's robot. A ROBOT IS A
 * FEELING WORD AND A CREATURE; an owner is a metal and an animal, from a
 * table that shares not one word with this one. One table, one meaning,
 * and scripts/bots-naming-check.ts fails on any overlap.
 */
export const FIRST_WORDS = BOT_FIRST_WORDS;
export const SECOND_WORDS = BOT_SECOND_WORDS;

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
 * A bay's build. Colour is NOT here: it lives on each owned part
 * (OwnedPart.paint), because a card wears the colour it arrived in and that
 * colour is what the set rule counts.
 */
export interface Build {
  bay: number;
  name: BotName;
  decal: DecalId | null;
  /** owned part uid per card slot; null = an empty socket pair */
  cards: Record<CardSlot, string | null>;
  /**
   * WHAT THE PLAYER CHOSE ABOUT HOW IT LOOKS: the face, the sticker, its
   * place and its colour, the won hat, and the number off the name. Nothing
   * EARNED is stored here (no star, no patch, no crown): those are counted
   * from the robot's own record every time it is drawn, so a stored look can
   * never claim a mark nobody won.
   *
   * It is the SAME shape the server stores in its build JSON
   * (_server/bots.ts BuildJson.look), and it is written only by
   * garage-state.saveLook, which runs the save route's own gate
   * (look.ts parseLook). The type is imported for its shape only, so
   * fixtures.ts still requires nothing at run time from look.ts and the
   * arrow between the two files keeps pointing one way.
   *
   * `decal` above stays the CHEST sticker: a look wearing its sticker on the
   * chest mirrors it there, so every older surface that reads `decal` keeps
   * reading the right thing and no robot ever wears two stickers at once.
   */
  look?: BotLook | null;
}

export const BAY_COUNT = 5;

/** The starter skeleton: an engine on hooks, no parts. */
export function starterBuild(bay: number): Build {
  return {
    bay,
    name: { first: "Rusty", second: "Pickle", num: null },
    decal: null,
    cards: { head: null, torso: null, arms: null, legs: null, weapon: null },
    look: null,
  };
}

/** The four fixture bots. Bay 5 is empty. */
export const FIXTURE_BUILDS: Readonly<Record<number, Build>> = {
  1: {
    bay: 1,
    name: { first: "Speedy", second: "Otter", num: 7 },
    decal: "bolt",
    cards: { head: "p_004", torso: "p_003", arms: "p_002", legs: "p_001", weapon: "p_005" },
  },
  2: {
    bay: 2,
    name: { first: "Rusty", second: "Beetle", num: 41 },
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
    name: { first: "Dusty", second: "Teapot", num: null },
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

/* ── the calendar words (the shipment itself lives in shipment.ts) ───────── */

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** The day key everyone shares: "2026-09-03" (UTC). */
export function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
    { id: "f_1041", result: "win", opponent: "Bouncy Walnut", wallet: "Copper Hare 7", finisher: "head off", date: "2 Sep" },
    { id: "f_1033", result: "win", opponent: "Tin Pup", wallet: "The game", finisher: "body off", date: "2 Sep" },
    { id: "f_1019", result: "loss", opponent: "Grumpy Turnip", wallet: "Pewter Lynx 3", finisher: "left leg off", date: "1 Sep" },
    { id: "f_1002", result: "win", opponent: "Wobble", wallet: "The game", finisher: "head off", date: "31 Aug" },
    { id: "f_0988", result: "win", opponent: "Clatter", wallet: "The game", finisher: "body off", date: "30 Aug" },
  ],
  2: [
    { id: "f_1044", result: "loss", opponent: "Mighty Beetle 9", wallet: "Chrome Badger 12", finisher: "head off", date: "3 Sep" },
    { id: "f_1030", result: "win", opponent: "Digger", wallet: "The game", finisher: "body off", date: "2 Sep" },
    { id: "f_1021", result: "win", opponent: "Jolly Muffin", wallet: "Cobalt Heron 5", finisher: "right arm off", date: "1 Sep" },
  ],
  3: [
    { id: "f_1038", result: "win", opponent: "Rattle", wallet: "The game", finisher: "body off", date: "2 Sep" },
    { id: "f_1027", result: "loss", opponent: "Bricks", wallet: "The game", finisher: "head off", date: "1 Sep" },
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
    { text: "Rusty Beetle 41 lost the head to Chrome Badger 12 and their Mighty Beetle 9. Watch.", link: { kind: "watch", id: "f_1044" } },
    { text: "Your buy low, sell high helpers made 3 trades. 42 coins.", link: null },
    { text: "Your buy at my price helper made 1 trade. 20 coins.", link: null },
    { text: "There are 2 new 2 star parts to buy today.", link: { kind: "shop" } },
    { text: "You moved up 4 places on the leaders list.", link: null },
  ],
};

/** Bay 2 is in the shop: 14 hours 22 minutes left at first load (an OFFSET,
 * resolved against the clock by garage-state at hydrate, never here). */
export const FIXTURE_REPAIR_LEFT_MS = (14 * 60 + 22) * 60 * 1000;
