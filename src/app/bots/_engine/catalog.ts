/**
 * BATTLE BOTS CATALOG - every authored table the game selects from. The
 * seed SELECTS, it never DESIGNS (the S5/S6/S7 law carried whole, see
 * s7/games/gauntlet/content.ts): the 40 launch parts, the five starter
 * cards, the four reference fighters and the nine house-bot shapes are all
 * hand-written here; the shop, the drop table and the battles page only
 * ever index into them with a forked stream.
 *
 * LAWS THIS FILE CARRIES:
 *  - NAMES COME FROM FIXED WORD TABLES (NAME_WORDS): two words, first plus
 *    second, per slot. No free text anywhere; validateCatalog() checks it.
 *  - ONE LINE OF LORE PER CARD, plain words for a global audience, no
 *    idioms, under LORE_MAX_CHARS.
 *  - PRICES ARE THE GUIDE'S LADDER by tier (parts.ts PRICE_BY_TIER); the
 *    starter kit is the guide's 15.
 *  - THE BODY PARTS ARE FAMILIES (guide "Matched sets", engine doc 1.5):
 *    per tier two style lines x four body parts (32), plus two weapons per
 *    tier (8). A family's first word is the card's first word, so "Kettle
 *    set: 3 of 4" reads straight off the shelf. Inside a tier one family
 *    leans into each slot's first stat and the other into its third, so a
 *    shelf still offers a real choice. Every body part has a factory color
 *    from the eight paints, varied inside a family so a style set is never
 *    a color set for free; a full color set is collectable ACROSS tiers.
 *  - THE REFERENCE FIGHTERS (CANON_T1..T4) match the engine doc's table as
 *    closely as legal parts allow. They are authored parts, not shop cards:
 *    the pinned STR / HEALTH / DMG numbers force stat lines no shop card
 *    should have, and they carry no family, so they never get a set bonus.
 */

import {
  BODY_SLOTS,
  PRICE_BY_TIER,
  STARTER_PRICE,
  partTier,
  scaleShape,
  type BodySlot,
  type Build,
  type CanonKey,
  type CardLookup,
  type CatalogTables,
  type Family,
  type NameWords,
  type PaintId,
  type Part,
  type PartCard,
  type Shape,
  type Slot,
  type Stats,
  type Tier,
} from "./parts";

export { scaleShape } from "./parts";

export const LORE_MAX_CHARS = 90;

// ── the style families (one pair per tier) ──────────────────────────────────

const family = (id: string, name: string, tier: Tier, feel: string): Family => ({ id, name, tier, feel });

export const FAMILIES: readonly Family[] = [
  family("sprocket", "Sprocket", 1, "small gears, quick and light"),
  family("peeper", "Peeper", 1, "big eyes, hard to pin down"),
  family("kettle", "Kettle", 2, "round and tough, whistles when hit"),
  family("lantern", "Lantern", 2, "warm light, lucky and slippery"),
  family("hornet", "Hornet", 3, "fast, sharp and always on target"),
  family("piston", "Piston", 3, "heavy steel that blocks and holds"),
  family("bulldozer", "Bulldozer", 4, "raw power on wide feet"),
  family("anvil", "Anvil", 4, "the top shelf, nothing gets through"),
] as const;

export const FAMILY_INDEX: Readonly<Record<string, Family>> = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));

// ── the word tables ─────────────────────────────────────────────────────────

/** A body part's first word is its family; "Scrap" is the starter kit. */
const BODY_FIRST: readonly string[] = ["Scrap", ...FAMILIES.map((f) => f.name)];

export const NAME_WORDS: Readonly<Record<Slot, NameWords>> = {
  legs: {
    first: BODY_FIRST,
    second: ["Pegs", "Stilts", "Shins", "Struts", "Boots", "Treads", "Hooves", "Springs"],
  },
  arms: {
    first: BODY_FIRST,
    second: ["Mitts", "Hooks", "Clamps", "Fists", "Grips", "Levers", "Pistons"],
  },
  torso: {
    first: BODY_FIRST,
    second: ["Can", "Box", "Chest", "Drum", "Frame", "Shell", "Hull", "Core"],
  },
  head: {
    first: BODY_FIRST,
    second: ["Cap", "Helm", "Dome", "Eye", "Scope", "Lens", "Visor", "Mask"],
  },
  weapon: {
    first: ["Scrap", "Rusty", "Tin", "Iron", "Spark", "Steel", "Brass", "Piston", "Anvil"],
    second: ["Spanner", "Mallet", "Wrench", "Drill", "Saw", "Pike", "Hammer", "Cleaver"],
  },
};

// terse constructors: the tables below should read like a card list
const body = (id: string, slot: BodySlot, familyId: string, name: string, s: Stats, color: PaintId, lore: string): PartCard => {
  const tier = partTier(s[0] + s[1] + s[2]);
  return { id, slot, name, s, tier, price: PRICE_BY_TIER[tier], lore, family: familyId, color };
};
// a weapon and a starter card carry no family key at all (not an empty
// string): "neither" is an absent field, so a screens-side `??` fallback
// can fill a look for art without the engine ever counting it in a set
const weapon = (id: string, name: string, s: Stats, lore: string): PartCard => {
  const tier = partTier(s[0] + s[1] + s[2]);
  return { id, slot: "weapon", name, s, tier, price: PRICE_BY_TIER[tier], lore };
};
const starter = (id: string, slot: Slot, name: string, s: Stats, color: PaintId | undefined, lore: string): PartCard => ({
  id, slot, name, s, tier: 1, price: STARTER_PRICE, lore, ...(color ? { color } : {}),
});

// ── the 40 launch parts (8 families x 4 body parts, plus 8 weapons) ─────────
// legs: speed / strength / dodge. arms: damage / strength / block.
// torso: health / strength / luck. head: accuracy / dodge / luck.
// weapon: damage / attack speed / accuracy.

export const PARTS: readonly PartCard[] = [
  // T1 Sprocket: leans speed / damage / health / accuracy
  body("legs.sprocketPegs", "legs", "sprocket", "Sprocket Pegs", [2, 1, 1], "mint", "Two pegs on little gears. They hold a bot up and not much more."),
  body("arms.sprocketMitts", "arms", "sprocket", "Sprocket Mitts", [1, 1, 1], "coral", "Soft mitts with a gear at the wrist. Good for a first punch, bad for a second."),
  body("torso.sprocketCan", "torso", "sprocket", "Sprocket Can", [2, 1, 0], "butter", "A tin can with a gear on the front. It dents if you look at it."),
  body("head.sprocketCap", "head", "sprocket", "Sprocket Cap", [2, 1, 0], "sky", "A cap with two eye holes and a gear on top. It sees the target, mostly."),
  // T1 Peeper: leans dodge / block / luck / dodge
  body("legs.peeperStilts", "legs", "peeper", "Peeper Stilts", [1, 0, 2], "lilac", "Thin stilts that wobble. Light enough to hop out of the way."),
  body("arms.peeperHooks", "arms", "peeper", "Peeper Hooks", [2, 0, 2], "moss", "Bent hooks on thin arms. They catch a swing now and then."),
  body("torso.peeperBox", "torso", "peeper", "Peeper Box", [1, 1, 2], "cream", "A small box that rattles. Something inside brings luck."),
  body("head.peeperEye", "head", "peeper", "Peeper Eye", [1, 2, 1], "ink", "One big eye on a spring. It sees a swing coming and leans away."),
  // T2 Kettle: leans speed / damage / health / accuracy
  body("legs.kettleShins", "legs", "kettle", "Kettle Shins", [4, 1, 3], "coral", "Coil springs in each shin. Every step has a little bounce."),
  body("arms.kettleGrips", "arms", "kettle", "Kettle Grips", [3, 3, 2], "butter", "Round grips held on with big bolts. Simple and honest."),
  body("torso.kettleChest", "torso", "kettle", "Kettle Chest", [5, 2, 1], "sky", "An old kettle turned into a chest. It still whistles when hit."),
  body("head.kettleDome", "head", "kettle", "Kettle Dome", [3, 1, 2], "lilac", "A kettle lid for a head, with a warm light inside. It finds the target."),
  // T2 Lantern: leans strength / block / luck / dodge. Authored at 30, the
  // middle of the band like Kettle: the massim's gate H showed a T2 set at
  // the band's top (37) fights level with an unmatched T3 body (T3 won 57
  // percent against the bar of 70), and the guide says a set is a boost,
  // never a tier.
  body("legs.lanternStruts", "legs", "lantern", "Lantern Struts", [2, 4, 2], "moss", "Heavy struts with a lamp on each knee. Slow to move, hard to knock over."),
  body("arms.lanternClamps", "arms", "lantern", "Lantern Clamps", [2, 2, 4], "cream", "Clamps that lock shut. A fine wall to hide behind."),
  body("torso.lanternDrum", "torso", "lantern", "Lantern Drum", [3, 1, 3], "ink", "A drum with a lucky dent and a glow inside. Nobody knows why it helps."),
  body("head.lanternLens", "head", "lantern", "Lantern Lens", [2, 3, 2], "mint", "A lantern with a wide lens. It sees a swing coming early."),
  // T3 Hornet: leans speed / damage / health / accuracy
  body("legs.hornetBoots", "legs", "hornet", "Hornet Boots", [6, 3, 4], "butter", "Boots with a piston in each heel. They push off the floor fast."),
  body("arms.hornetFists", "arms", "hornet", "Hornet Fists", [6, 4, 3], "sky", "Fists with a sting. Each punch lands with a thump."),
  body("torso.hornetFrame", "torso", "hornet", "Hornet Frame", [7, 4, 2], "lilac", "A striped frame with thick plates. It takes hits all day."),
  body("head.hornetScope", "head", "hornet", "Hornet Scope", [6, 3, 4], "moss", "A narrow head with a scope. It locks on and does not let go."),
  // T3 Piston: leans strength / block / luck / dodge
  body("legs.pistonTreads", "legs", "piston", "Piston Treads", [3, 7, 3], "cream", "Tank treads driven by pistons. They grip the pit floor and take a beating."),
  body("arms.pistonLevers", "arms", "piston", "Piston Levers", [3, 5, 6], "ink", "Long lever arms off a crane. They hold a guard for a long time."),
  body("torso.pistonShell", "torso", "piston", "Piston Shell", [5, 3, 6], "mint", "A steel shell with a charm bolted inside. Lucky and tough."),
  body("head.pistonVisor", "head", "piston", "Piston Visor", [4, 6, 4], "coral", "A visor that slides down on a piston. Swings often miss it."),
  // T4 Bulldozer: leans speed / damage / health / accuracy
  body("legs.bulldozerHooves", "legs", "bulldozer", "Bulldozer Hooves", [8, 3, 7], "sky", "Wide hooves with tiny rockets. The bot is gone before the swing lands."),
  body("arms.bulldozerFists", "arms", "bulldozer", "Bulldozer Fists", [8, 5, 5], "lilac", "Fists like shovel blades. Built to tear parts loose."),
  body("torso.bulldozerHull", "torso", "bulldozer", "Bulldozer Hull", [9, 6, 3], "moss", "A hull cut from a bank vault. Almost nothing gets through."),
  body("head.bulldozerHelm", "head", "bulldozer", "Bulldozer Helm", [8, 4, 4], "cream", "A hawk visor on a heavy helm. It never loses the target."),
  // T4 Anvil: leans strength / block / luck / dodge
  body("legs.anvilSprings", "legs", "anvil", "Anvil Springs", [6, 6, 6], "ink", "Steel springs built for the show ring. Fast, strong and hard to pin."),
  body("arms.anvilGrips", "arms", "anvil", "Anvil Grips", [5, 7, 7], "mint", "Polished grips forged on the big anvil. Strong, steady and hard to get past."),
  body("torso.anvilCore", "torso", "anvil", "Anvil Core", [7, 4, 8], "coral", "A furnace core that glows. Strange things happen around it."),
  body("head.anvilMask", "head", "anvil", "Anvil Mask", [5, 7, 7], "butter", "A brass mask with a grin. Hard to read, hard to hit."),
  // weapons, two per tier, no family and no color
  weapon("weapon.rustySpanner", "Rusty Spanner", [2, 1, 1], "A rusty spanner. It was a tool once. Now it is a weapon, sort of."),
  weapon("weapon.tinMallet", "Tin Mallet", [1, 2, 0], "A light tin mallet. Quick taps, small dents."),
  weapon("weapon.ironWrench", "Iron Wrench", [4, 2, 3], "A big iron wrench. Heavy enough to leave a mark."),
  weapon("weapon.sparkDrill", "Spark Drill", [2, 5, 3], "A drill that throws sparks. It bites fast and often."),
  weapon("weapon.steelSaw", "Steel Saw", [6, 4, 4], "A steel saw blade on a handle. It cuts parts loose."),
  weapon("weapon.brassPike", "Brass Pike", [4, 4, 6], "A long brass pike. It reaches the target first."),
  weapon("weapon.pistonHammer", "Piston Hammer", [9, 3, 5], "A hammer with a piston head. One hit can end a fight."),
  weapon("weapon.anvilCleaver", "Anvil Cleaver", [7, 6, 6], "A cleaver forged on the big anvil. Fast, sharp and true."),
] as const;

export const PART_INDEX: Readonly<Record<string, PartCard>> = Object.fromEntries(
  PARTS.map((p) => [p.id, p]),
);

/** The guide's starter kit: FIVE T1 cards at 15 coins (a legs pair, an arms
 * pair, a torso, a head, a weapon), 75 of the 120 starter coins, so a new
 * player builds a whole bot on day one. Scrap has no style line and the
 * four colors differ, so the kit is never a free set. */
export const STARTER_PARTS: readonly PartCard[] = [
  starter("starter.scrapPegs", "legs", "Scrap Pegs", [1, 1, 0], "cream", "Starter scrap. Two pegs that get a bot to the pit."),
  starter("starter.scrapMitts", "arms", "Scrap Mitts", [1, 1, 0], "mint", "Starter scrap. Mitts that can throw one honest punch."),
  starter("starter.scrapCan", "torso", "Scrap Can", [1, 1, 0], "cream", "Starter scrap. A can that keeps the wires in."),
  starter("starter.scrapCap", "head", "Scrap Cap", [1, 1, 0], "coral", "Starter scrap. A cap with one eye hole. It sees enough."),
  starter("starter.scrapSpanner", "weapon", "Scrap Spanner", [1, 1, 0], undefined, "Starter scrap. A spanner that still turns a bolt."),
] as const;

/** Every card a build can hold, by id: the lookup setBonus() reads. */
export const CARD_INDEX: CardLookup = Object.fromEntries(
  [...PARTS, ...STARTER_PARTS].map((p) => [p.id, p]),
);

// ── family helpers (the build readout, the massim set gates, the CLI) ───────

/** The four body cards of a family, by slot. Throws on an unknown family
 * or an incomplete one; validateCatalog() makes the second impossible. */
export function familyCards(familyId: string): Readonly<Record<BodySlot, PartCard>> {
  if (!FAMILY_INDEX[familyId]) throw new Error(`unknown family: ${familyId}`);
  const out: Partial<Record<BodySlot, PartCard>> = {};
  for (const card of PARTS) {
    if (card.family === familyId && card.slot !== "weapon") out[card.slot] = card;
  }
  for (const slot of BODY_SLOTS) {
    if (!out[slot]) throw new Error(`family ${familyId} has no ${slot}`);
  }
  return out as Record<BodySlot, PartCard>;
}

/** A card as the plain Part a build stores (id and stats, nothing else). */
export function partOf(card: PartCard): Part {
  return { id: card.id, s: [card.s[0], card.s[1], card.s[2]] };
}

/** A full family body plus a weapon card: the matched-set fighter. */
export function familyBuild(familyId: string, weaponId: string): Build {
  const w = PART_INDEX[weaponId];
  if (!w || w.slot !== "weapon") throw new Error(`familyBuild: ${weaponId} is not a weapon card`);
  const cards = familyCards(familyId);
  return { legs: partOf(cards.legs), arms: partOf(cards.arms), torso: partOf(cards.torso), head: partOf(cards.head), weapon: partOf(w) };
}

/** The mid weapon of each tier, for a family fighter (the CLI, the gates). */
export const WEAPON_OF_TIER: Readonly<Record<Tier, string>> = {
  1: "weapon.rustySpanner",
  2: "weapon.ironWrench",
  3: "weapon.steelSaw",
  4: "weapon.pistonHammer",
};

/** THE SAME BODY, UNMATCHED: identical stats under ids the card index cannot
 * see ("twin." prefix), so setBonus() finds no family and no color. This is
 * how the harness and the massim measure the bonus alone (gates s, G, H):
 * the only difference between a build and its twin is the set. */
export function unmatchedTwin(b: Build): Build {
  const twin = (p: Part): Part => ({ id: `twin.${p.id}`, s: [p.s[0], p.s[1], p.s[2]] });
  return { legs: twin(b.legs), arms: twin(b.arms), torso: twin(b.torso), head: twin(b.head), weapon: twin(b.weapon) };
}

/** Every body part painted one color (the weapon never carries paint). */
export function paintAll(b: Build, paint: PaintId): Build {
  const painted = (p: Part): Part => ({ id: p.id, s: [p.s[0], p.s[1], p.s[2]], paint });
  return { legs: painted(b.legs), arms: painted(b.arms), torso: painted(b.torso), head: painted(b.head), weapon: { id: b.weapon.id, s: [b.weapon.s[0], b.weapon.s[1], b.weapon.s[2]] } };
}

// ── the reference fighters (engine doc section 2) ───────────────────────────
// Targets: T1 STR 4 / HEALTH 2 / DMG 3, T2 12 / 5 / 8, T3 20 / 8 / 14,
// T4 30 / 11 / 20. T4's 48-frame interval is not reachable with 12-point
// stats and 20-point parts alongside STR 30 and DMG 20; it lands at 52.

const canonPart = (key: CanonKey, slot: Slot, s: Stats): Part => ({ id: `canon.${key}.${slot}`, s });

export const CANON_T1: Build = {
  legs: canonPart("T1", "legs", [1, 1, 1]),
  arms: canonPart("T1", "arms", [1, 2, 1]),
  torso: canonPart("T1", "torso", [2, 1, 0]),
  head: canonPart("T1", "head", [1, 1, 0]),
  weapon: canonPart("T1", "weapon", [2, 1, 0]),
};
export const CANON_T2: Build = {
  legs: canonPart("T2", "legs", [4, 4, 0]),
  arms: canonPart("T2", "arms", [4, 4, 1]),
  torso: canonPart("T2", "torso", [5, 4, 0]),
  head: canonPart("T2", "head", [2, 0, 0]),
  weapon: canonPart("T2", "weapon", [4, 3, 0]),
};
export const CANON_T3: Build = {
  legs: canonPart("T3", "legs", [8, 7, 0]),
  arms: canonPart("T3", "arms", [7, 7, 0]),
  torso: canonPart("T3", "torso", [8, 6, 0]),
  head: canonPart("T3", "head", [2, 1, 0]),
  weapon: canonPart("T3", "weapon", [7, 7, 0]),
};
export const CANON_T4: Build = {
  legs: canonPart("T4", "legs", [8, 12, 0]),
  arms: canonPart("T4", "arms", [10, 9, 1]),
  torso: canonPart("T4", "torso", [11, 9, 0]),
  head: canonPart("T4", "head", [5, 3, 2]),
  weapon: canonPart("T4", "weapon", [10, 10, 0]),
};

export const CANON: Readonly<Record<CanonKey, Build>> = { T1: CANON_T1, T2: CANON_T2, T3: CANON_T3, T4: CANON_T4 };
export const CANON_TOTALS: Readonly<Record<CanonKey, number>> = { T1: 15, T2: 35, T3: 60, T4: 90 };
/** Read-aloud names for the reference fighters (the CLI printer). */
export const CANON_NAMES: Readonly<Record<CanonKey, string>> = { T1: "Rusty", T2: "Sprocket", T3: "Piston", T4: "Forge" };

// ── the house bots (engine doc section 4) ───────────────────────────────────
// Authored at total 60 so every shape is itself a legal T3 build; the
// battles page scales them to 75 / 100 / 130 percent of the player's bot.

const shape = (id: string, name: string, feel: string, legs: Stats, arms: Stats, torso: Stats, head: Stats, weapon: Stats): Shape => ({
  id, name, feel, legs, arms, torso, head, weapon,
});

export const SHAPES: readonly Shape[] = [
  // easy: Scrapper tier, 75 percent of your bot
  shape("tinpup", "Tin Pup", "balanced", [4, 4, 4], [4, 4, 4], [4, 4, 4], [4, 4, 4], [4, 4, 4]),
  shape("kettle", "Kettle", "slow, tanky", [1, 6, 1], [3, 6, 5], [10, 6, 2], [3, 1, 2], [5, 2, 7]),
  shape("wobble", "Wobble", "dodgy, weak", [6, 1, 8], [2, 1, 3], [4, 1, 3], [4, 8, 4], [3, 6, 6]),
  // medium: Foreman tier, 100 percent
  shape("clatter", "Clatter", "fast, glass", [9, 2, 3], [6, 2, 1], [3, 2, 2], [6, 3, 1], [7, 10, 3]),
  shape("anvil", "Anvil", "block, low dodge", [2, 6, 0], [4, 6, 10], [7, 6, 1], [4, 0, 2], [5, 2, 5]),
  shape("peeper", "Peeper", "accuracy, luck", [4, 2, 3], [3, 2, 2], [4, 2, 6], [9, 2, 7], [4, 3, 7]),
  // hard: Big Rig tier, 130 percent
  shape("hornet", "Hornet", "fast, accurate", [9, 2, 4], [5, 2, 2], [4, 2, 1], [8, 3, 1], [6, 8, 3]),
  shape("bulldozer", "Bulldozer", "damage, strength", [3, 7, 1], [8, 7, 2], [5, 7, 0], [3, 0, 0], [10, 4, 3]),
  shape("gremlin", "Gremlin", "dodge, luck", [5, 1, 8], [3, 1, 3], [3, 1, 8], [3, 7, 8], [4, 3, 2]),
] as const;

export const SHAPE_INDEX: Readonly<Record<string, Shape>> = Object.fromEntries(SHAPES.map((s) => [s.id, s]));

export type Difficulty = "easy" | "medium" | "hard";

/** Roster by difficulty and the house total as a percent of the player's
 * bot (the guide: Scrapper 75, Foreman 100, Big Rig 130; easy floors at 8). */
export const HOUSE_ROSTER: Readonly<Record<Difficulty, { title: string; percent: number; minTotal: number; shapes: readonly string[] }>> = {
  easy: { title: "Scrapper", percent: 75, minTotal: 8, shapes: ["tinpup", "kettle", "wobble"] },
  medium: { title: "Foreman", percent: 100, minTotal: 8, shapes: ["clatter", "anvil", "peeper"] },
  hard: { title: "Big Rig", percent: 130, minTotal: 8, shapes: ["hornet", "bulldozer", "gremlin"] },
};

/** The house bot's target total for a player bot of `playerTotal`, whole
 * numbers, floored at the roster minimum and capped at a legal 100. */
export function houseTarget(difficulty: Difficulty, playerTotal: number): number {
  const r = HOUSE_ROSTER[difficulty];
  const raw = Math.floor((playerTotal * r.percent) / 100);
  return Math.min(100, Math.max(r.minTotal, raw));
}

/** Convenience for callers that hold a shape id (the battles page, the CLI). */
export function houseBuild(shapeId: string, target: number): Build {
  const sh = SHAPE_INDEX[shapeId];
  if (!sh) throw new Error(`unknown house shape: ${shapeId}`);
  return scaleShape(sh, target);
}

// ── the tables, in one place for validateCatalog() ──────────────────────────

export const CATALOG: CatalogTables = {
  parts: PARTS,
  starter: STARTER_PARTS,
  families: FAMILIES,
  canon: CANON,
  canonTotals: CANON_TOTALS,
  shapes: SHAPES,
  nameWords: NAME_WORDS,
  loreMaxChars: LORE_MAX_CHARS,
};
