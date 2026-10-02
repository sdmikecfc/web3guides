/**
 * BATTLE BOTS NAMING - the brand, model number and part convention, and
 * every word the shop, the garage and the battles screens print around it.
 *
 * WHY THIS FILE EXISTS. Mike, 2026-09-04, looking at the shop and the
 * battles screens: "Too much jargon, doesn't explain which part it is (arm,
 * leg, etc) has weird names like Gremlin and a second name Big Rig? Why
 * though, is that for the sake of being confusing as fuck? Why not have a
 * naming convention like they do in other games? Where there is a brand,
 * part and color? Brands represent speed focused on strength focused, etc.
 * Instead of Big Rig Gremlin that means literally nothing."
 *
 * THE CONVENTION, read left to right, the way a parts catalogue reads:
 *
 *     BRAND   MODEL   PART        COLOR
 *     Spark     3     Legs        moss
 *     Anvil     2     Body        ink
 *     Forge     4     Hammer      (weapons carry no color)
 *
 *  - BRAND says what the part is good at and it never changes its mind.
 *    Spark is attack. Anvil is defence. Forge is heavy weapons. Jet is fast
 *    weapons. Four words learned once, then every card in the game reads.
 *    THE PROMISE IS CHECKED AGAINST THE NUMBERS: BRAND_PROMISE below is the
 *    machine-readable version, and scripts/bots-naming-check.ts fails the
 *    build if any part in src/app/bots/_engine/catalog.ts does not lead on
 *    the stat its brand promised, at every model number.
 *  - MODEL is the part's tier as a plain number. It rises 1, 2, 3, 4. It is
 *    not a fourth thing to read: it is the tier badge moved into the name,
 *    so the badge can stop shouting "TIER 3" beside a name that already
 *    says it. It is also exactly the set key, so "Spark 3 set: 3 of 4" is
 *    true by construction.
 *  - PART is the word the player already uses for the socket: Legs, Arms,
 *    Body, Head. A weapon says its own kind (Hammer, Saw, Drill), which is
 *    itself a weapon word, so the slot still reads off the title. "Torso"
 *    is a code word and never reaches a screen.
 *  - COLOR is a swatch plus one word beside the title, never inside it, so
 *    the title stays three words on the narrowest card.
 *
 * THE FIVE NAME SPACES NEVER SHARE A WORD. Before this file a part could be
 * called "Piston Hammer", a bot "Rusty Piston 7" and a wallet "Brass Otter
 * 41" out of the same two tables, and a house opponent could be called
 * "Gremlin" under a rank called "Big Rig", so a screen could show "Big Rig
 * Gremlin" and mean nothing by it. Now: a PART is a brand and a number, a
 * BOT is a feeling word and a creature, an OWNER is a metal and an animal,
 * a HOUSE OPPONENT is a short nickname with its SIZE on the line above, and
 * a REFERENCE FIGHTER is a rock. scripts/bots-naming-check.ts fails on any
 * overlap.
 *
 * COPY LAWS CARRIED: plain words for a global audience whose first language
 * is often not English; short sentences; whole numbers; no algebra; no
 * finance or gaming jargon; no idioms; no abbreviations; no em-dashes
 * anywhere; never a dollar figure and never a wallet address.
 */

import { SLOT_STATS, type PaintId, type Slot, type StatName, type Tier } from "@/app/bots/_engine/parts";
import { STRINGS } from "./strings";

/* ── the brands ───────────────────────────────────────────────────────────── */

export type BrandId = "spark" | "anvil" | "forge" | "jet";

export interface Brand {
  id: BrandId;
  /** the word every one of this brand's card titles starts with */
  name: string;
  /** the shortest true thing to print under the name on a narrow card */
  short: string;
  /** ONE line of character. This is the promise the numbers keep. */
  character: string;
  /** the slots this brand sells */
  sells: readonly Slot[];
}

export const BRANDS: readonly Brand[] = [
  {
    id: "spark",
    name: "Spark",
    short: "Hits hard",
    character: "Spark parts swing sooner, aim better, hit harder and get lucky more often.",
    sells: ["legs", "arms", "torso", "head"],
  },
  {
    id: "anvil",
    name: "Anvil",
    short: "Hard to break",
    character: "Anvil parts carry more armour, block more punches and are harder to hit.",
    sells: ["legs", "arms", "torso", "head"],
  },
  {
    id: "forge",
    name: "Forge",
    short: "Heavy hits",
    character: "Forge weapons take off a lot of life. You wait longer between swings.",
    sells: ["weapon"],
  },
  {
    id: "jet",
    name: "Jet",
    short: "Fast hits",
    character: "Jet weapons swing far more often. Each hit takes off less life.",
    sells: ["weapon"],
  },
] as const;

export const BRAND_INDEX: Readonly<Record<BrandId, Brand>> = Object.fromEntries(
  BRANDS.map((b) => [b.id, b]),
) as Record<BrandId, Brand>;

export const BODY_BRANDS: readonly BrandId[] = ["spark", "anvil"];
export const WEAPON_BRANDS: readonly BrandId[] = ["forge", "jet"];

/**
 * THE PROMISE, MACHINE READABLE. Per brand, per slot, the ONE stat that
 * every part of that brand leads on, at every model number. This is not
 * decoration: scripts/bots-naming-check.ts reads the shipped catalog and
 * fails if the promised stat is not the strict biggest of a part's three
 * numbers. A brand that cannot keep its promise is a brand that means
 * nothing, which is the thing Mike asked us to stop doing.
 *
 *     slot     Spark leads   Anvil leads      slot     Forge   Jet
 *     legs     speed         strength         weapon   damage  attack speed
 *     arms     damage        block
 *     body     luck          health
 *     head     accuracy      dodge
 */
export const BRAND_PROMISE: Readonly<Record<BrandId, Partial<Record<Slot, StatName>>>> = {
  spark: { legs: "speed", arms: "damage", torso: "luck", head: "accuracy" },
  anvil: { legs: "strength", arms: "block", torso: "health", head: "dodge" },
  forge: { weapon: "damage" },
  jet: { weapon: "attack speed" },
};

/* ── the part word ────────────────────────────────────────────────────────── */

/** The word the player already uses for the socket. "torso" stays in code. */
export const PART_WORD: Readonly<Record<Slot, string>> = {
  legs: "Legs",
  arms: "Arms",
  torso: "Body",
  head: "Head",
  weapon: "Weapon",
};

/** A weapon's kind replaces the generic word in its title, because a hammer
 * already tells you it is a weapon. Two kinds per model number, one per
 * brand. Keyed by the shipped catalog id, which never moves. */
export const WEAPON_KIND: Readonly<Record<string, string>> = {
  "weapon.rustySpanner": "Wrench",
  "weapon.tinMallet": "Stick",
  "weapon.ironWrench": "Axe",
  "weapon.sparkDrill": "Drill",
  "weapon.steelSaw": "Saw",
  "weapon.brassPike": "Spike",
  "weapon.pistonHammer": "Hammer",
  "weapon.anvilCleaver": "Blade",
};

/* ── which brand a shipped card belongs to ────────────────────────────────── */

/**
 * The eight style families in catalog.ts ARE brand plus model number. The
 * family ids do not move, so scripts/bots-parts-manifest.json, the paint
 * masks, src/lib/bots/shipment.ts and every generated PNG keep working with
 * zero regeneration. The art lane says "kettle"; the player reads "Spark 2".
 */
export const BRAND_OF_FAMILY: Readonly<Record<string, BrandId>> = {
  sprocket: "spark", kettle: "spark", hornet: "spark", bulldozer: "spark",
  peeper: "anvil", lantern: "anvil", piston: "anvil", anvil: "anvil",
};

export const BRAND_OF_WEAPON: Readonly<Record<string, BrandId>> = {
  "weapon.rustySpanner": "forge", "weapon.ironWrench": "forge",
  "weapon.steelSaw": "forge", "weapon.pistonHammer": "forge",
  "weapon.tinMallet": "jet", "weapon.sparkDrill": "jet",
  "weapon.brassPike": "jet", "weapon.anvilCleaver": "jet",
};

/** The starter kit has no brand, and the card says so rather than leaving a
 * player to guess why "Scrap Legs" never counts toward a set. */
export const SCRAP_WORD = "Scrap";
export const SCRAP_NOTE = "Scrap parts have no maker's name. They never count for the match reward.";

/* ── the title makers ─────────────────────────────────────────────────────── */

/** The full card title: brand, model number, part word. Three words. */
export function cardTitle(brand: BrandId, model: Tier, slot: Slot, weaponId?: string): string {
  const word = slot === "weapon" && weaponId ? (WEAPON_KIND[weaponId] ?? PART_WORD.weapon) : PART_WORD[slot];
  return `${BRAND_INDEX[brand].name} ${model} ${word}`;
}

/** The shelf line: the title, then the color as its own word beside its
 * swatch. Never joined into the title, and never a color a card lacks. */
export function shelfLine(title: string, color: PaintId | null): string {
  return color ? `${title}, ${color}` : title;
}

/** The narrow parts tray in the garage: two short lines, so nothing has to
 * be cut down to letters nobody can read. Line 1 is brand plus model, line
 * 2 is the part word. */
export function trayLines(brand: BrandId, model: Tier, slot: Slot, weaponId?: string): [string, string] {
  const word = slot === "weapon" && weaponId ? (WEAPON_KIND[weaponId] ?? PART_WORD.weapon) : PART_WORD[slot];
  return [`${BRAND_INDEX[brand].name} ${model}`, word];
}

/** The build screen socket row: the socket first, then what is fitted. */
export function socketRow(slot: Slot, brand: BrandId, model: Tier, color: PaintId | null): string {
  return `${PART_WORD[slot]}: ${BRAND_INDEX[brand].name} ${model}${color ? `, ${color}` : ""}`;
}

/** An empty socket says the socket word and nothing clever. */
export function emptySocketRow(slot: Slot): string {
  return `${PART_WORD[slot]}: empty`;
}

/* ── one stat vocabulary, nine words, never shortened ─────────────────────── */

/**
 * The fight readout, the shop card and the build screen use THE SAME nine
 * words, spelled out, with the number beside them. No synonym, no short
 * form: the block Mike called jargon (SPD STR DGE DMG BLK HP LCK ACC ASP)
 * has no place to come back from if the long word is the only word.
 */
export const STAT_MEANING: Readonly<Record<StatName, string>> = {
  speed: "Your robot swings sooner.",
  strength: "Every part of the robot is harder to break.",
  dodge: "More punches miss your robot.",
  damage: "Each hit takes off more life.",
  block: "Your arms stop part of a hit.",
  health: "Your robot takes more hits before it falls.",
  luck: "More of your hits count double.",
  accuracy: "Fewer of your own punches miss.",
  "attack speed": "You swing more often.",
} as const;

/**
 * THE NINE WORDS A PLAYER READS, keyed by the engine's own stat name.
 *
 * The engine calls them speed, strength, dodge, damage, block, health, luck,
 * accuracy and attack speed. A player reads Speed, Strong, Dodge, Punch,
 * Block, Life, Luck, Aim and Swings, which is one table, in strings.ts, and
 * this is the bridge to it. Before this bridge the shop card and the tool
 * board capitalised the ENGINE word, so three screens said "Strength",
 * "Accuracy" and "Attack speed" while the build readout beside them said
 * "Strong", "Aim" and "Swings".
 */
export const STAT_WORD: Readonly<Record<StatName, string>> = {
  speed: STRINGS.en.ui.stat.speed,
  strength: STRINGS.en.ui.stat.strength,
  dodge: STRINGS.en.ui.stat.dodge,
  damage: STRINGS.en.ui.stat.damage,
  block: STRINGS.en.ui.stat.block,
  health: STRINGS.en.ui.stat.health,
  luck: STRINGS.en.ui.stat.luck,
  accuracy: STRINGS.en.ui.stat.accuracy,
  "attack speed": STRINGS.en.ui.stat.attackSpeed,
};

/** "Speed 6" and nothing else, for a chip with room for two words. */
export function statChip(name: StatName, value: number): string {
  return `${STAT_WORD[name]} ${value}`;
}

/** "Speed 6. Your robot swings sooner." The number comes from the part, so
 * this line cannot drift away from the card it sits under. */
export function statSentence(name: StatName, value: number): string {
  return `${statChip(name, value)}. ${STAT_MEANING[name]}`;
}

/** The part's three stats as three plain lines, in the slot's own order. */
export function statLines(slot: Slot, s: readonly [number, number, number]): [string, string, string] {
  const names = SLOT_STATS[slot];
  return [statSentence(names[0], s[0]), statSentence(names[1], s[1]), statSentence(names[2], s[2])];
}

/** The ONE line under a card title: the stat the brand leads, spelled out
 * with its number. A tie falls back to the slot's first stat, which cannot
 * happen on a shipped card (the naming check forbids a tie on the promise). */
export function leadStat(slot: Slot, s: readonly [number, number, number]): { name: StatName; value: number } {
  const names = SLOT_STATS[slot];
  let best = 0;
  for (let i = 1; i < 3; i++) if (s[i] > s[best]) best = i;
  return { name: names[best], value: s[best] };
}

export function leadLine(slot: Slot, s: readonly [number, number, number]): string {
  const lead = leadStat(slot, s);
  return statSentence(lead.name, lead.value);
}

/* ── the set lines (brand plus model number IS the set key) ───────────────── */

export const SET_LINES = {
  /** "Spark 3: 3 of 4". The title carries the match key, so this cannot lie. */
  /** a placeholder name is vocabulary too: the maker's name and the star
   * count, never "brand" and never "model" */
  progress: "{maker} {stars}: {n} of 4",
  none: "Same name: 0 of 4",
  color: "Same colour, {color}: {n} of 4",
  noColor: "Same colour: 0 of 4",
  bonus: "Match reward: every number goes up by {n} in a fight",
  noBonus: "No match yet.",
  /** replaces "Weapon . no set", which told a player nothing they could use */
  weapon: "Weapons come from Forge and Jet. A weapon never counts for the match reward.",
  /** replaces the bare "no color" */
  partNoColor: "This part has no colour.",
  sameBrandDifferentModel: "Same name, different number. They only match when the number is the same too.",
} as const;

/* ── the shelf and badge words Mike flagged as jargon ─────────────────────── */

export const SHELF_WORDS = {
  /** was "TODAY'S COLOR" */
  todayColor: "Today's colour",
  /** was "TIER 1 . 8 parts" */
  rowModel1: "1 STAR, 8 PARTS",
  rowModel2: "2 STARS, 4 PARTS",
  rowModel3: "3 STARS, 2 PARTS",
  rowModel4: "4 STARS, 1 PART",
  rowRack: "WEAPONS, 1 TODAY",
  /** was the "TIER {t}" badge shouting beside a name that already says it */
  badge: "{n} stars",
  /** the one line that teaches the whole convention, on the shop header */
  howToRead: "A part's name says who made it, then its stars, then the body part. Spark 3 Legs is a pair of legs with 3 stars. Spark parts hit hard. Anvil parts are hard to break.",
  brandFilter: "Show one maker",
  modelFilter: "Show 1, 2, 3 or 4",
} as const;

/** "3 stars", the phrase that replaces the word "tier" on every player
 * surface. Tier and model stay in the code and in the design docs, and never
 * reach a screen. One star is never "1 stars". */
export function modelWord(model: Tier): string {
  return model === 1 ? "1 star" : `${model} stars`;
}

/* ── the house opponents ──────────────────────────────────────────────────── */

/**
 * The difficulty ranks itself and sits on its OWN line above the opponent's
 * name, never joined to it. "Scrapper", "Foreman" and "Big Rig" were three
 * job words a player could not put in order, and two of them read as names,
 * which is how a screen came to print "Big Rig Gremlin". The titles
 * themselves are in catalog.ts HOUSE_ROSTER; these are the lines beside
 * them. Whole numbers, no algebra.
 */
export type HouseSize = "easy" | "medium" | "hard";

export interface HouseTier {
  size: HouseSize;
  /** the title, on its own line above the opponent's name */
  label: string;
  line: string;
}

export const HOUSE_TIERS: readonly HouseTier[] = [
  { size: "easy", label: "EASY", line: "A smaller robot. The easiest fight." },
  { size: "medium", label: "HARDER", line: "The same size as your robot. A fair fight." },
  { size: "hard", label: "HARDEST", line: "A bigger robot. The hardest fight, and it pays the most." },
] as const;

export const HOUSE_TIER_INDEX: Readonly<Record<HouseSize, HouseTier>> = Object.fromEntries(
  HOUSE_TIERS.map((h) => [h.size, h]),
) as Record<HouseSize, HouseTier>;

/** The nine house nicknames, by the shipped shape id. The names themselves
 * live in catalog.ts SHAPES; this table is what a screen keys on when it
 * has a shape id and wants the name without importing the engine. */
export const HOUSE_NAME: Readonly<Record<string, string>> = {
  tinpup: "Tin Pup",
  kettle: "Rattle",
  wobble: "Wobble",
  clatter: "Clatter",
  anvil: "Bricks",
  peeper: "Blinky",
  hornet: "Buzz",
  bulldozer: "Digger",
  gremlin: "Shadow",
};

/** The size on one line, the name on the next. Never one string. */
export function houseCard(size: HouseSize, shapeId: string): [string, string] {
  return [HOUSE_TIER_INDEX[size].label, HOUSE_NAME[shapeId] ?? shapeId];
}

/* ── bot names and owner names ────────────────────────────────────────────── */

/**
 * A BOT IS A FEELING WORD AND A CREATURE OR A SMALL OBJECT, so the name
 * says "this is somebody's bot" before you read a word of it. Every machine
 * word is gone from these tables, because a machine word is exactly what
 * made "Rusty Piston 7" read like a part on a shelf. Dropped from the
 * shipped first words: Piston, Sparky, Bolt, Gear, Iron, Cog, Rivet,
 * Socket, Diesel, Widget, Crank, Gasket. Dropped from the second words:
 * Piston, Hammer, Kettle, Lantern, Anvil, Sprocket, Wrench, Bolt, Bucket.
 *
 * Handoff: src/lib/bots/fixtures.ts and src/app/bots/_server/players.ts own
 * the generators and belong to another lane. They should read these tables
 * instead of their own; nothing else about how they pick a word changes.
 */
export const BOT_FIRST_WORDS: readonly string[] = [
  "Rusty", "Dusty", "Mossy", "Jolly", "Grumpy", "Sleepy", "Speedy", "Tiny",
  "Mighty", "Lucky", "Sunny", "Cloudy", "Snowy", "Cheeky", "Wobbly", "Bouncy",
  "Quiet", "Noisy", "Hungry", "Happy", "Clever", "Gentle", "Bold", "Shy",
  "Chubby", "Skinny", "Fuzzy", "Shiny", "Sticky", "Bumpy", "Crooked", "Neat",
] as const;

export const BOT_SECOND_WORDS: readonly string[] = [
  "Beetle", "Otter", "Badger", "Pickle", "Biscuit", "Teapot", "Toaster", "Tractor",
  "Pudding", "Walnut", "Muffin", "Dumpling", "Marble", "Noodle", "Turnip", "Radish",
  "Lemon", "Button", "Thimble", "Pigeon", "Donkey", "Penguin", "Rabbit", "Turtle",
  "Peanut", "Cherry", "Onion", "Melon", "Kitten", "Puppy", "Duckling", "Cricket",
] as const;

/**
 * AN OWNER IS A METAL AND AN ANIMAL, and the tables share nothing with the
 * bot tables. Today a wallet and a bot are built from the same two lists,
 * so a fight card can print the identical name twice and the reader cannot
 * tell which one is the bot.
 */
export const OWNER_FIRST_WORDS: readonly string[] = [
  "Copper", "Brass", "Bronze", "Nickel", "Chrome", "Silver", "Golden", "Pewter",
  "Amber", "Onyx", "Jade", "Pearl", "Ruby", "Slate", "Ivory", "Cobalt",
] as const;

export const OWNER_SECOND_WORDS: readonly string[] = [
  "Falcon", "Heron", "Marten", "Lynx", "Bison", "Ibex", "Crane", "Raven",
  "Salmon", "Wolf", "Seal", "Hare", "Moth", "Newt", "Gecko", "Finch",
] as const;

export interface BotName {
  first: string;
  second: string;
  /** an optional number, 1 to 99, so two bots can share the two words */
  num: number | null;
}

/** "Speedy Otter 41". A creature word means it is a bot. A brand word plus
 * a number means it is a part. Nothing here can produce "Big Rig Gremlin". */
export function botNameText(n: BotName): string {
  return n.num ? `${n.first} ${n.second} ${n.num}` : `${n.first} ${n.second}`;
}

export const NAME_SPACE_NOTE =
  "A part is a maker's name and a number. A robot is a creature. An owner is a metal and an animal. An opponent has how hard it is on the line above its name.";

/* ── what has to fit ──────────────────────────────────────────────────────── */

/**
 * The widest string each surface can hold, in characters. Measured off the
 * shipped layouts: the shop card title line, the two lines of the garage
 * parts tray, and the name plate over a fighter in the pit. The naming
 * check fails on anything longer, including the longest name the bot and
 * owner tables can generate, so a name can never be cut in half on a phone.
 */
export const NAME_LIMITS = {
  /** shop card title, one line: "Forge 4 Hammer" is the longest at 14 */
  title: 16,
  /** garage parts tray, EACH of the two lines */
  chipLine: 8,
  /** the name plate over a fighter, and every house opponent name */
  plate: 20,
} as const;

/* ── the words that must never appear in player copy ──────────────────────── */

/**
 * A banned word is one of four things: a piece of game or finance jargon, a
 * short form of a stat, an idiom that does not survive translation, or a
 * word this game deliberately retired. The naming check greps every string
 * this lane owns. Kept lower case; the check is case insensitive and
 * matches whole words only, so "tier" is banned and "tyre" is not.
 */
export const BANNED_WORDS: readonly string[] = [
  // stat short forms: the block Mike called jargon. The long words stay:
  // "stat" itself is the guide's own player word and is NOT banned, the
  // abbreviations of it are.
  "spd", "str", "dge", "dmg", "blk", "hp", "lck", "acc", "asp", "atk", "def", "dps", "aoe", "xp",
  // game jargon
  "tier", "buff", "nerf", "meta", "proc", "crit", "rng", "cc", "loadout", "gacha",
  "noob", "gg", "op", "pve", "pvp", "tanky", "dodgy", "glass cannon", "min max",
  // finance jargon
  "ev", "roi", "apr", "apy", "yield", "alpha", "liquidity", "bankroll", "arbitrage",
  // idioms and figures of speech that do not survive translation
  "no brainer", "piece of cake", "under the hood", "out of the box", "game changer",
  "bang for your buck", "punch above", "rule of thumb", "ballpark", "silver bullet",
  "on the fly", "cutting edge", "state of the art", "hit the ground running",
  "level playing field", "a breeze", "sweet spot", "all day", "hands down",
  // retired words: the second names and ranks Mike called out by name
  "gremlin", "big rig", "foreman", "scrapper",
  // retired by the copy pack (2026-09-04): one word per idea, and the word a
  // seven year old already owns wins. Every one of these has a replacement in
  // the vocabulary table, so nothing here leaves an idea unsayable.
  "spar", "sparring", "ghost", "stake", "pot", "bracket", "set bonus", "seat cap",
  "counted volume", "settle", "settlement", "payout", "rack", "shelf", "shelves",
  "attribution", "denominator", "keeper", "recycle", "body armor", "build points",
  "pts", "decal", "equip", "bay", "bays", "shipment", "pit", "upset",
  "tool board", "crew", "fill", "fills", "model number", "replay", "enlist",
  "nonce", "hash",
] as const;

/** Characters that must never appear in player copy at all. */
export const BANNED_CHARS: readonly { char: string; why: string }[] = [
  { char: "—", why: "em-dash" },
  { char: "–", why: "en-dash" },
  { char: "$", why: "a dollar figure never appears on a player surface" },
  { char: "0x", why: "a wallet address never appears on a player surface" },
  { char: "%", why: "a per cent sign never appears on a player surface" },
] as const;

/* ── the lines that teach the convention, once ────────────────────────────── */

export const TEACH = {
  /** the shop header, first visit */
  shop: "Read a part left to right: who made it, its stars, then the body part. Spark 3 Legs is a pair of legs with 3 stars, made by Spark.",
  /** the build screen, first visit */
  build: "Spark parts hit hard. Anvil parts are hard to break. More stars is a better part. All six body parts with the same name and stars make your robot stronger.",
  /** the battles screen, first visit */
  battles: "The word above an opponent's name tells you how hard the fight is. Easy is the smallest robot. Hardest is the biggest, and it pays the most.",
  /** one line for a share card or the morning post */
  short: "Who made it, how many stars, which body part. That is the whole thing.",
} as const;

/** Replace {name} placeholders, the same helper shape as strings.ts fill(). */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Every string in this file that a player can read, for the naming check
 * and for anyone auditing the copy in one place. */
export function playerCopy(): string[] {
  const out: string[] = [];
  for (const b of BRANDS) out.push(b.name, b.short, b.character);
  for (const w of Object.values(PART_WORD)) out.push(w);
  for (const k of Object.values(WEAPON_KIND)) out.push(k);
  for (const m of Object.values(STAT_MEANING)) out.push(m);
  for (const v of Object.values(SET_LINES)) out.push(v);
  for (const v of Object.values(SHELF_WORDS)) out.push(v);
  for (const h of HOUSE_TIERS) out.push(h.label, h.line);
  for (const n of Object.values(HOUSE_NAME)) out.push(n);
  for (const v of Object.values(TEACH)) out.push(v);
  out.push(SCRAP_WORD, SCRAP_NOTE, NAME_SPACE_NOTE);
  return out;
}
