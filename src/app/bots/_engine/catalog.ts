/**
 * BATTLE BOTS CATALOG - every authored table the game selects from. The
 * seed SELECTS, it never DESIGNS (the S5/S6/S7 law carried whole, see
 * s7/games/gauntlet/content.ts): the 40 launch parts, the five starter
 * cards, the four reference fighters and the nine house-bot shapes are all
 * hand-written here; the shop, the drop table and the battles page only
 * ever index into them with a forked stream.
 *
 * LAWS THIS FILE CARRIES:
 *  - NAMES COME FROM FIXED WORD TABLES (NAME_WORDS): a first entry plus a
 *    last word, per slot. No free text anywhere; validateCatalog() checks
 *    it and scripts/bots-naming-check.ts checks what the words MEAN.
 *  - THE NAMING CONVENTION IS BRAND, MODEL NUMBER, PART (ADR-0140, dated
 *    section 2026-09-04, answering Mike: "have a naming convention like
 *    they do in other games, where there is a brand, part and color").
 *    "Spark 3 Legs" is a Spark brand model 3 pair of legs. The brand says
 *    what the part is good at and the numbers keep the promise: SPARK
 *    parts lead speed on legs, damage on arms, luck on the body and
 *    accuracy on the head; ANVIL parts lead strength on legs, block on
 *    arms, health on the body and dodge on the head; FORGE weapons lead
 *    damage and JET weapons lead attack speed. The model number is the
 *    tier, so a bigger number is always a better part, and it is also the
 *    set key, so "Spark 3 set: 3 of 4" reads straight off the title. The
 *    last word is always the socket the part fills, in the plain word the
 *    player already owns. The COLOR is never inside the name: it is a
 *    swatch and one word beside it. Copy lives in src/lib/bots/naming.ts.
 *  - ONE LINE OF LORE PER CARD, plain words for a global audience, no
 *    idioms, no numbers (the numbers are printed from the engine), under
 *    LORE_MAX_CHARS.
 *  - PRICES ARE THE GUIDE'S LADDER by tier (parts.ts PRICE_BY_TIER); the
 *    starter kit is the guide's 15.
 *  - THE BODY PARTS ARE FAMILIES (guide "Matched sets", engine doc 1.5):
 *    per tier two style lines x four body parts (32), plus two weapons per
 *    tier (8). A FAMILY IS A BRAND AT ONE MODEL NUMBER, so its name is
 *    "Spark 3" and the card's title starts with it: "Spark 3 set: 3 of 4"
 *    reads straight off the shelf. The family IDS never move (sprocket,
 *    kettle, hornet and so on), so the art pipeline, the shipment calendar
 *    and every generated PNG keep working untouched; only what a player
 *    READS changed. Inside a tier the two families are the two brands, so
 *    a shelf always offers attack against defence. Every body part has a
 *    factory color
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

/**
 * A family is ONE BRAND AT ONE MODEL NUMBER. The id is the shipped id and
 * never moves (the art pipeline, scripts/bots-parts-manifest.json and
 * src/lib/bots/shipment.ts all key on it); the NAME is what a player reads.
 * Spark builds for attack, Anvil builds to last, and the model number is
 * the tier, so a bigger number is always a better part.
 */
export const FAMILIES: readonly Family[] = [
  family("sprocket", "Spark 1", 1, "Spark parts hit hard: quicker legs, harder punches, sharper aim. 1 star is the cheapest Spark."),
  family("peeper", "Anvil 1", 1, "Anvil parts are hard to break: more armour, more blocking, harder to hit. 1 star is the cheapest Anvil."),
  family("kettle", "Spark 2", 2, "Spark parts hit hard. 2 stars cost more than 1 star, and every part is better."),
  family("lantern", "Anvil 2", 2, "Anvil parts are hard to break. 2 stars cost more than 1 star, and every part is better."),
  family("hornet", "Spark 3", 3, "Spark parts hit hard. 3 stars is near the best you can buy."),
  family("piston", "Anvil 3", 3, "Anvil parts are hard to break. 3 stars is near the best you can buy."),
  family("bulldozer", "Spark 4", 4, "Spark parts hit hard. 4 stars is the best Spark you can buy."),
  family("anvil", "Anvil 4", 4, "Anvil parts are hard to break. 4 stars is the best Anvil you can buy."),
] as const;

export const FAMILY_INDEX: Readonly<Record<string, Family>> = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));

// ── the word tables ─────────────────────────────────────────────────────────

/**
 * FIRST is the brand plus its model number ("Spark 3"), which for a body
 * part IS its family name; "Scrap" is the starter kit and has no brand.
 * SECOND is the last word of the title and it is always the plain word for
 * the socket the part fills. A player who reads only the last word still
 * knows whether they are looking at legs or a head, which is the whole
 * point: "Piston Hammer" and "Kettle Shins" never said that.
 *
 * A weapon says its own kind instead of the word "Weapon", because a hammer
 * already tells you it is a weapon, and the eight kinds sit on the rack in
 * one row so the kind never has to be decoded.
 */
const BODY_FIRST: readonly string[] = ["Scrap", ...FAMILIES.map((f) => f.name)];
const WEAPON_FIRST: readonly string[] = ["Scrap", "Forge 1", "Forge 2", "Forge 3", "Forge 4", "Jet 1", "Jet 2", "Jet 3", "Jet 4"];

export const NAME_WORDS: Readonly<Record<Slot, NameWords>> = {
  legs: { first: BODY_FIRST, second: ["Legs"] },
  arms: { first: BODY_FIRST, second: ["Arms"] },
  torso: { first: BODY_FIRST, second: ["Body"] },
  head: { first: BODY_FIRST, second: ["Head"] },
  weapon: {
    first: WEAPON_FIRST,
    second: ["Wrench", "Stick", "Axe", "Drill", "Saw", "Spike", "Hammer", "Blade"],
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
//
// THE BRAND PROMISE IS THE FIRST NUMBER YOU CAN CHECK. Every Spark part's
// promised stat is the strict biggest of its three, and so is every Anvil
// part's, at every model number:
//
//     slot     Spark leads   Anvil leads      slot     Forge   Jet
//     legs     speed         strength         weapon   damage  attack speed
//     arms     damage        block
//     body     luck          health
//     head     accuracy      dodge
//
// The points were REDISTRIBUTED inside each part on 2026-09-04 to make that
// true (ADR-0140, dated section). EVERY PART'S TOTAL IS UNCHANGED, so every
// tier, price, recycle value and shelf cost is exactly what it was, and the
// frozen replay baseline (canon.* parts, which no shop card can reach) does
// not move. scripts/bots-naming-check.ts is the executable version of the
// table above.

export const PARTS: readonly PartCard[] = [
  // Spark 1 (family id sprocket): attack, model 1
  body("legs.sprocketPegs", "legs", "sprocket", "Spark 1 Legs", [2, 1, 1], "mint", "The cheapest Spark legs. Light, thin and quick off the mark."),
  body("arms.sprocketMitts", "arms", "sprocket", "Spark 1 Arms", [2, 1, 0], "coral", "Soft mitts built to punch. They do not guard much at all."),
  body("torso.sprocketCan", "torso", "sprocket", "Spark 1 Body", [1, 0, 2], "butter", "A tin can with a lucky dent. Thin, but good things happen in it."),
  body("head.sprocketCap", "head", "sprocket", "Spark 1 Head", [2, 1, 0], "sky", "A little cap with two eye holes. It finds the target."),
  // Anvil 1 (family id peeper): defence, model 1
  body("legs.peeperStilts", "legs", "peeper", "Anvil 1 Legs", [1, 2, 0], "lilac", "Short thick stilts. They add armor to the whole bot."),
  body("arms.peeperHooks", "arms", "peeper", "Anvil 1 Arms", [1, 0, 3], "moss", "Bent hooks that catch a swing. Built to guard, not to punch."),
  body("torso.peeperBox", "torso", "peeper", "Anvil 1 Body", [2, 1, 1], "cream", "A small padded box. It takes a few more hits than scrap."),
  body("head.peeperEye", "head", "peeper", "Anvil 1 Head", [1, 2, 1], "ink", "One big eye on a spring. It leans away from a swing."),
  // Spark 2 (family id kettle): attack, model 2
  body("legs.kettleShins", "legs", "kettle", "Spark 2 Legs", [4, 1, 3], "coral", "Coil springs in each shin. Every step has a bounce in it."),
  body("arms.kettleGrips", "arms", "kettle", "Spark 2 Arms", [4, 2, 2], "butter", "Heavy round grips on big bolts. Made to land a punch."),
  body("torso.kettleChest", "torso", "kettle", "Spark 2 Body", [3, 1, 4], "sky", "An old kettle with a charm inside. Odd things go your way."),
  body("head.kettleDome", "head", "kettle", "Spark 2 Head", [3, 1, 2], "lilac", "A kettle lid with a warm light inside. It picks out the target."),
  // Anvil 2 (family id lantern): defence, model 2. Authored at 30, the
  // middle of the band like Spark 2: the massim's gate H showed a T2 set at
  // the band's top (37) fights level with an unmatched T3 body (T3 won 57
  // percent against the bar of 70), and the guide says a set is a boost,
  // never a tier.
  body("legs.lanternStruts", "legs", "lantern", "Anvil 2 Legs", [2, 4, 2], "moss", "Heavy struts with a lamp on each knee. Hard to knock over."),
  body("arms.lanternClamps", "arms", "lantern", "Anvil 2 Arms", [2, 2, 4], "cream", "Clamps that lock shut. A good wall to hide behind."),
  body("torso.lanternDrum", "torso", "lantern", "Anvil 2 Body", [4, 1, 2], "ink", "A thick drum with a glow inside. It soaks up hits."),
  body("head.lanternLens", "head", "lantern", "Anvil 2 Head", [2, 3, 2], "mint", "A lantern with a wide lens. It sees a swing coming early."),
  // Spark 3 (family id hornet): attack, model 3
  body("legs.hornetBoots", "legs", "hornet", "Spark 3 Legs", [6, 3, 4], "butter", "Boots with a spring in each heel. They push off the floor fast."),
  body("arms.hornetFists", "arms", "hornet", "Spark 3 Arms", [6, 4, 3], "sky", "Fists with a sting in them. Each punch lands with a thump."),
  body("torso.hornetFrame", "torso", "hornet", "Spark 3 Body", [5, 2, 6], "lilac", "A striped frame with a charm bolted in. Luck rides with it."),
  body("head.hornetScope", "head", "hornet", "Spark 3 Head", [6, 3, 4], "moss", "A narrow head with a long scope. It locks on and holds."),
  // Anvil 3 (family id piston): defence, model 3
  body("legs.pistonTreads", "legs", "piston", "Anvil 3 Legs", [3, 7, 3], "cream", "Wide steel treads on a heavy frame. They grip the floor and hold."),
  body("arms.pistonLevers", "arms", "piston", "Anvil 3 Arms", [3, 5, 6], "ink", "Long lever arms off a crane. They keep a guard up for a long time."),
  body("torso.pistonShell", "torso", "piston", "Anvil 3 Body", [6, 3, 5], "mint", "A steel shell in two layers. Very little gets through it."),
  body("head.pistonVisor", "head", "piston", "Anvil 3 Head", [4, 6, 4], "coral", "A visor that drops down on a spring. Swings often miss it."),
  // Spark 4 (family id bulldozer): attack, model 4
  body("legs.bulldozerHooves", "legs", "bulldozer", "Spark 4 Legs", [8, 3, 7], "sky", "Wide hooves with tiny rockets. The bot is gone before the swing lands."),
  body("arms.bulldozerFists", "arms", "bulldozer", "Spark 4 Arms", [8, 5, 5], "lilac", "Fists like shovel blades. Built to tear parts loose."),
  body("torso.bulldozerHull", "torso", "bulldozer", "Spark 4 Body", [7, 3, 8], "moss", "A wide hull with a glowing core. Strange luck follows it around."),
  body("head.bulldozerHelm", "head", "bulldozer", "Spark 4 Head", [8, 4, 4], "cream", "A hawk visor on a heavy helm. It never loses the target."),
  // Anvil 4 (family id anvil): defence, model 4
  body("legs.anvilSprings", "legs", "anvil", "Anvil 4 Legs", [5, 8, 5], "ink", "Forged legs built for the show ring. They carry the whole bot."),
  body("arms.anvilGrips", "arms", "anvil", "Anvil 4 Arms", [5, 6, 8], "mint", "Polished guard plates on both arms. Very hard to get past."),
  body("torso.anvilCore", "torso", "anvil", "Anvil 4 Body", [9, 4, 6], "coral", "A body cut from a bank vault. Almost nothing gets through."),
  body("head.anvilMask", "head", "anvil", "Anvil 4 Head", [5, 9, 5], "butter", "A brass mask with a grin. Hard to read and hard to hit."),
  // the rack: Forge is heavy (damage leads), Jet is fast (attack speed
  // leads). Weapons carry no family and no color, so they never join a set.
  weapon("weapon.rustySpanner", "Forge 1 Wrench", [2, 1, 1], "A rusty wrench. It was a tool once. Now it is a weapon, sort of."),
  weapon("weapon.tinMallet", "Jet 1 Stick", [1, 2, 0], "A light tin stick. Quick taps and small dents."),
  weapon("weapon.ironWrench", "Forge 2 Axe", [4, 2, 3], "A big iron axe. Heavy enough to leave a mark."),
  weapon("weapon.sparkDrill", "Jet 2 Drill", [2, 5, 3], "A drill that throws sparks. It bites fast and often."),
  weapon("weapon.steelSaw", "Forge 3 Saw", [6, 4, 4], "A saw blade on a long handle. It cuts parts loose."),
  weapon("weapon.brassPike", "Jet 3 Spike", [4, 6, 4], "A long brass spike. It gets there first, again and again."),
  weapon("weapon.pistonHammer", "Forge 4 Hammer", [9, 3, 5], "A hammer with a heavy head. One hit can end a fight."),
  weapon("weapon.anvilCleaver", "Jet 4 Blade", [6, 7, 6], "A light blade on a short arm. It never stops swinging."),
] as const;

export const PART_INDEX: Readonly<Record<string, PartCard>> = Object.fromEntries(
  PARTS.map((p) => [p.id, p]),
);

/** The guide's starter kit: FIVE T1 cards at 15 coins (a legs pair, an arms
 * pair, a torso, a head, a weapon), 75 of the 120 starter coins, so a new
 * player builds a whole bot on day one. Scrap has no style line and the
 * four colors differ, so the kit is never a free set. */
export const STARTER_PARTS: readonly PartCard[] = [
  starter("starter.scrapPegs", "legs", "Scrap Legs", [1, 1, 0], "cream", "Scrap has no maker's name. Two pegs that get a robot to the ring."),
  starter("starter.scrapMitts", "arms", "Scrap Arms", [1, 1, 0], "mint", "Scrap has no maker's name. Mitts that can throw one honest punch."),
  starter("starter.scrapCan", "torso", "Scrap Body", [1, 1, 0], "cream", "Scrap has no maker's name. A can that keeps the wires in."),
  starter("starter.scrapCap", "head", "Scrap Head", [1, 1, 0], "coral", "Scrap has no maker's name. A cap with one eye hole. It sees enough."),
  starter("starter.scrapSpanner", "weapon", "Scrap Wrench", [1, 1, 0], undefined, "Scrap has no maker's name. A wrench that still turns a bolt."),
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
/** Read-aloud names for the reference fighters (the CLI printer and the dev
 * pages). They rank themselves by size, and none of the four is a brand
 * word, a part word or a house opponent, so a screen can never print one of
 * these beside a card and leave the reader guessing which is which. */
export const CANON_NAMES: Readonly<Record<CanonKey, string>> = { T1: "Pebble", T2: "Barrel", T3: "Boulder", T4: "Mountain" };

// ── the house bots (engine doc section 4) ───────────────────────────────────
// Authored at total 60 so every shape is itself a legal T3 build; the
// battles page scales them to 75 / 100 / 130 percent of the player's bot.

const shape = (id: string, name: string, feel: string, legs: Stats, arms: Stats, torso: Stats, head: Stats, weapon: Stats): Shape => ({
  id, name, feel, legs, arms, torso, head, weapon,
});

/**
 * NINE NAMES THAT ARE ONLY OPPONENT NAMES. Five of the shipped nine were
 * Kettle, Anvil, Peeper, Hornet and Bulldozer, which were also part names,
 * so a card could read "Big Rig Gremlin" and a player could be wearing an
 * opponent. None of these nine is a brand word, a part word, a weapon kind
 * or a reference fighter, and the DIFFICULTY is never joined to the name:
 * it sits on its own line above it (HOUSE_ROSTER titles, ADR-0140).
 *
 * The feel line is a plain sentence, not a list of stat words: "slow,
 * tanky" told a new player nothing they could act on.
 */
export const SHAPES: readonly Shape[] = [
  // EASY, 75 percent of your robot
  shape("tinpup", "Tin Pup", "Good at everything and best at nothing.", [4, 4, 4], [4, 4, 4], [4, 4, 4], [4, 4, 4], [4, 4, 4]),
  shape("kettle", "Rattle", "Slow and thick. Hard to knock down.", [1, 6, 1], [3, 6, 5], [10, 6, 2], [3, 1, 2], [5, 2, 7]),
  shape("wobble", "Wobble", "Very hard to hit. Its punches are weak.", [6, 1, 8], [2, 1, 3], [4, 1, 3], [4, 8, 4], [3, 6, 6]),
  // HARDER, 100 percent
  shape("clatter", "Clatter", "Very fast. It falls apart quickly.", [9, 2, 3], [6, 2, 1], [3, 2, 2], [6, 3, 1], [7, 10, 3]),
  shape("anvil", "Bricks", "It blocks nearly every swing. It is easy to hit.", [2, 6, 0], [4, 6, 10], [7, 6, 1], [4, 0, 2], [5, 2, 5]),
  shape("peeper", "Blinky", "It rarely misses, and it gets lucky.", [4, 2, 3], [3, 2, 2], [4, 2, 6], [9, 2, 7], [4, 3, 7]),
  // HARDEST, 130 percent
  shape("hornet", "Buzz", "Fast, and it rarely misses. Thin armour.", [9, 2, 4], [5, 2, 2], [4, 2, 1], [8, 3, 1], [6, 8, 3]),
  shape("bulldozer", "Digger", "It hits harder than anything else. It is slow.", [3, 7, 1], [8, 7, 2], [5, 7, 0], [3, 0, 0], [10, 4, 3]),
  shape("gremlin", "Shadow", "It dodges a lot, and its hits often count double.", [5, 1, 8], [3, 1, 3], [3, 1, 8], [3, 7, 8], [4, 3, 2]),
] as const;

export const SHAPE_INDEX: Readonly<Record<string, Shape>> = Object.fromEntries(SHAPES.map((s) => [s.id, s]));

export type Difficulty = "easy" | "medium" | "hard";

/**
 * Roster by difficulty and the house total as a percent of the player's bot
 * (the guide: 75, 100, 130; easy floors at 8).
 *
 * THE TITLE IS THE DIFFICULTY AND IT RANKS ITSELF. "Scrapper", "Foreman"
 * and "Big Rig" were three job words a player could not put in order, and
 * two of them read as names, which is how a screen came to show "Big Rig
 * Gremlin". Then came "Small Bot", "Same Size Bot" and "Big Bot", which say
 * how BIG but not how HARD, which is the question a player is asking. EASY,
 * HARDER and HARDEST answer it and are in order on sight. The size sentence
 * lives underneath, in src/lib/bots/naming.ts (HOUSE_TIERS), which holds the
 * same three words; the title always sits on its OWN line above the
 * opponent's name, never joined to it.
 */
export const HOUSE_ROSTER: Readonly<Record<Difficulty, { title: string; percent: number; minTotal: number; shapes: readonly string[] }>> = {
  easy: { title: "EASY", percent: 75, minTotal: 8, shapes: ["tinpup", "kettle", "wobble"] },
  medium: { title: "HARDER", percent: 100, minTotal: 8, shapes: ["clatter", "anvil", "peeper"] },
  hard: { title: "HARDEST", percent: 130, minTotal: 8, shapes: ["hornet", "bulldozer", "gremlin"] },
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
