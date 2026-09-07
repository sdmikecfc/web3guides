/**
 * BATTLE BOTS PARTS - the stat model (engine doc sections 1 and 3.1). Every
 * other engine file reads its shapes from here. Nothing here rolls, steps or
 * prices anything by formula: prices are the guide's ladder, tiers are the
 * guide's bands, and the seed never invents a part.
 *
 * LAWS THIS FILE CARRIES:
 *  - A PART IS THREE WHOLE NUMBERS, 0 to 12 each, 1 to 20 together. The
 *    catalog is hand-authored; validateCatalog() makes the rules executable
 *    (the validateContent() pattern in s7/games/gauntlet/content.ts).
 *  - PART TIER BY TOTAL: T1 1 to 4, T2 5 to 10, T3 11 to 15, T4 16 to 20.
 *  - BOT TIER BY TOTAL: T2 at 25, T3 at 55, T4 at 80 (five times the
 *    smallest part of that tier). Five bargain T2 parts are always T2; five
 *    T2 parts can never be T3; three mid T2 plus two lucky T4 finds reach T3.
 *  - PRICES ARE THE GUIDE'S LADDER (T1 50 / T2 200 / T3 600 / T4 2000, the
 *    starter set at 15), never a per-point formula.
 *  - EVENTS ARE ALL INTS. `who` is the side that ACTED for swing / miss /
 *    hit / ko and the side that SUFFERED for block / bounce / break /
 *    stagger; `part` is a piece index (PIECE); `f` is the frame.
 *  - A HOUSE BOT IS ALWAYS A LEGAL BUILD: scaleShape() keeps every part at
 *    1 point, every stat under 12, every part under 20 and the total exact.
 *  - MATCHED SETS (guide "Matched sets", engine doc 1.5): every launch BODY
 *    part carries a style FAMILY and a factory COLOR; the weapon carries
 *    neither. setBonus() reads a build: all four body parts one color = +1,
 *    one family = +2, both = +3, applied by derive.ts to the fight
 *    aggregates ONLY. A painted color (Part.paint) is what counts. The bot
 *    total and tier never see the bonus: tier stays "what you own".
 */

// ── slots and stats ─────────────────────────────────────────────────────────

export type Slot = "legs" | "arms" | "torso" | "head" | "weapon";
export const SLOTS: readonly Slot[] = ["legs", "arms", "torso", "head", "weapon"];

/** The four slots a set is made of. The weapon never counts toward a set. */
export type BodySlot = "legs" | "arms" | "torso" | "head";
export const BODY_SLOTS: readonly BodySlot[] = ["legs", "arms", "torso", "head"];

export type StatName =
  | "speed" | "strength" | "dodge" | "damage" | "block" | "health" | "luck" | "accuracy" | "attack speed";

/** Mike's list, verbatim order, per slot. */
export const SLOT_STATS: Readonly<Record<Slot, readonly [StatName, StatName, StatName]>> = {
  legs: ["speed", "strength", "dodge"],
  arms: ["damage", "strength", "block"],
  torso: ["health", "strength", "luck"],
  head: ["accuracy", "dodge", "luck"],
  weapon: ["damage", "attack speed", "accuracy"],
};

export type Stats = [number, number, number];

export const STAT_MAX = 12;
export const PART_MIN = 1;
export const PART_MAX = 20;

// ── paint ───────────────────────────────────────────────────────────────────

/** The eight paint ids, MIRRORED from src/app/bots/_ui/tokens.ts (PAINTS)
 * so the engine imports nothing from the UI tree, the same reason rng.ts
 * copies core.ts instead of importing it. The harness checks the two lists
 * agree (gate p); change tokens.ts first, then this line. */
export const PAINT_IDS = ["mint", "coral", "butter", "sky", "lilac", "moss", "cream", "ink"] as const;
export type PaintId = (typeof PAINT_IDS)[number];

export function isPaintId(v: unknown): v is PaintId {
  return typeof v === "string" && (PAINT_IDS as readonly string[]).includes(v);
}

// ── engine doc 3.1 shapes ───────────────────────────────────────────────────

export interface Part {
  id: string;
  s: Stats;
  /** a paint job (25 coins a part, the economy doc): the painted color is
   * what a color set counts. Absent = the card's factory color. */
  paint?: PaintId;
}

export interface Build {
  legs: Part;
  arms: Part;
  torso: Part;
  head: Part;
  weapon: Part;
}

/** Pre-fight orders (the week 4 layer): stance 0 balanced / 1 guard / 2 rush;
 * focus 0 none / 1 legs / 2 arms / 3 head / 4 body. Defaults 0/0. */
export interface Orders {
  stance: 0 | 1 | 2;
  focus: 0 | 1 | 2 | 3 | 4;
}
export const NO_ORDERS: Orders = { stance: 0, focus: 0 };

export type Mode = "spar" | "pve" | "pvp" | "titan";

export type Side = 0 | 1;

/** The seven body pieces: six can be hit, the weapon is held and never a
 * target (the doc's weights: body 8, head 2, each arm 3, each leg 2). */
export const PIECE = { HEAD: 0, BODY: 1, ARM_L: 2, ARM_R: 3, LEG_L: 4, LEG_R: 5 } as const;
export type Piece = 0 | 1 | 2 | 3 | 4 | 5;
export const PIECE_COUNT = 6;
export const PIECE_NAMES: readonly string[] = ["head", "body", "left arm", "right arm", "left leg", "right leg"];

export type FightEvent =
  | { t: "start"; f: number }
  | { t: "swing"; f: number; who: Side; target: Side }
  | { t: "miss"; f: number; who: Side }
  | { t: "block"; f: number; who: Side; arm: Piece; dmg: number }
  | { t: "hit"; f: number; who: Side; part: Piece; dmg: number; crit: number }
  | { t: "bounce"; f: number; who: Side; part: Piece }
  | { t: "break"; f: number; who: Side; part: Piece }
  | { t: "stagger"; f: number; who: Side }
  | { t: "tired"; f: number }
  | { t: "ko"; f: number; winner: Side }
  | { t: "timeout"; f: number; winner: Side; why: number };

export type EventKind = FightEvent["t"];
export const EVENT_KINDS: readonly EventKind[] = [
  "start", "swing", "miss", "block", "hit", "bounce", "break", "stagger", "tired", "ko", "timeout",
];

/** timeout.why codes: 0 more body armor left, 1 more damage dealt, 2 dead
 * even so the challenged bot (side B) keeps it. */
export const TIMEOUT_WHY = { BODY: 0, DAMAGE: 1, CHALLENGED: 2 } as const;

export interface FightResult {
  winner: Side;
  frames: number;
  end: "ko" | "timeout";
  log: FightEvent[];
  hash: number;
  engineVersion: number;
}

// ── tiers and prices ────────────────────────────────────────────────────────

export type Tier = 1 | 2 | 3 | 4;

export function partTotal(p: Part): number {
  return p.s[0] + p.s[1] + p.s[2];
}

/** Part tier by total: T1 1 to 4, T2 5 to 10, T3 11 to 15, T4 16 to 20. */
export function partTier(total: number): Tier {
  if (total >= 16) return 4;
  if (total >= 11) return 3;
  if (total >= 5) return 2;
  return 1;
}

/** Bot tier thresholds: five times the smallest part of that tier. */
export const BOT_TIER_AT: readonly [number, number, number] = [25, 55, 80];

export function botTier(total: number): Tier {
  if (total >= BOT_TIER_AT[2]) return 4;
  if (total >= BOT_TIER_AT[1]) return 3;
  if (total >= BOT_TIER_AT[0]) return 2;
  return 1;
}

export function buildTotal(b: Build): number {
  return partTotal(b.legs) + partTotal(b.arms) + partTotal(b.torso) + partTotal(b.head) + partTotal(b.weapon);
}

/** The guide's ladder. Recycle returns 40 percent of these (economy lane). */
export const PRICE_BY_TIER: Readonly<Record<Tier, number>> = { 1: 50, 2: 200, 3: 600, 4: 2000 };
export const STARTER_PRICE = 15;

// ── legality ────────────────────────────────────────────────────────────────

export function isLegalStats(s: Stats): boolean {
  if (s.length !== 3) return false;
  let total = 0;
  for (const v of s) {
    if (!Number.isInteger(v) || v < 0 || v > STAT_MAX) return false;
    total += v;
  }
  return total >= PART_MIN && total <= PART_MAX;
}

export function isLegalBuild(b: Build): boolean {
  for (const slot of SLOTS) {
    const p = b[slot];
    if (!p || typeof p.id !== "string" || p.id.length === 0) return false;
    if (!isLegalStats(p.s)) return false;
    if (p.paint !== undefined && !isPaintId(p.paint)) return false;
  }
  return true;
}

/** A breaker, not a clamp: the resolver refuses an illegal build outright. */
export function assertLegalBuild(b: Build, label: string): void {
  for (const slot of SLOTS) {
    const p = b[slot];
    if (!p || typeof p.id !== "string" || p.id.length === 0) throw new Error(`${label}: ${slot} has no part id`);
    if (!isLegalStats(p.s)) throw new Error(`${label}: ${slot} ${p.id} stats [${p.s.join(",")}] are not legal (0..12 each, 1..20 total)`);
    if (p.paint !== undefined && !isPaintId(p.paint)) throw new Error(`${label}: ${slot} ${p.id} paint "${String(p.paint)}" is not one of the eight paints`);
  }
}

// ── catalog shapes (authored in catalog.ts, validated here) ─────────────────

export interface PartCard extends Part {
  slot: Slot;
  name: string;
  tier: Tier;
  price: number;
  lore: string;
  /** style line (a Family id) on every launch body part; ABSENT on weapons
   * and on starter scrap (style parts come only from the shop and drops) */
  family?: string;
  /** factory paint on every body part; a weapon carries none */
  color?: PaintId;
}

/** A style line: four body parts (legs, arms, torso, head) in ONE tier, so
 * a full family body is collectable from one shelf. */
export interface Family {
  id: string;
  name: string;
  tier: Tier;
  feel: string;
}

/** A house-bot SHAPE: a stat distribution scaled to a target total by
 * scaleShape(). Authored so the shape itself is a legal build. */
export interface Shape {
  id: string;
  name: string;
  feel: string;
  legs: Stats;
  arms: Stats;
  torso: Stats;
  head: Stats;
  weapon: Stats;
}

export interface NameWords {
  first: readonly string[];
  second: readonly string[];
}

export type CanonKey = "T1" | "T2" | "T3" | "T4";

export interface CatalogTables {
  parts: readonly PartCard[];
  starter: readonly PartCard[];
  families: readonly Family[];
  canon: Readonly<Record<CanonKey, Build>>;
  canonTotals: Readonly<Record<CanonKey, number>>;
  shapes: readonly Shape[];
  nameWords: Readonly<Record<Slot, NameWords>>;
  loreMaxChars: number;
}

/** Scale a shape to an exact target total with whole numbers only: floor
 * each stat, hand the remainder out by largest remainder (ties to the
 * earlier stat), respect the 12-per-stat and 20-per-part caps, then lift
 * any empty part to 1 point by taking one from the biggest stat elsewhere.
 * The result is always a legal build whose total is exactly `target`. */
export function scaleShape(shape: Shape, target: number): Build {
  if (!Number.isInteger(target) || target < 5 * PART_MIN || target > 5 * PART_MAX) {
    throw new Error(`scaleShape ${shape.id}: target ${target} outside ${5 * PART_MIN}..${5 * PART_MAX}`);
  }
  const src: number[] = [];
  for (const slot of SLOTS) for (const v of shape[slot]) src.push(v);
  let shapeTotal = 0;
  for (const v of src) shapeTotal += v;
  if (shapeTotal <= 0) throw new Error(`scaleShape ${shape.id}: empty shape`);

  const out: number[] = src.map((v) => Math.floor((v * target) / shapeTotal));
  const rem: number[] = src.map((v) => (v * target) % shapeTotal);
  const partOf = (i: number): number => Math.floor(i / 3);
  const partSum = (p: number): number => out[p * 3] + out[p * 3 + 1] + out[p * 3 + 2];

  // scaling UP can push a floor past the caps: pull those points back into
  // the deficit (a capped stat drops out of the remainder race)
  for (let i = 0; i < out.length; i++) {
    if (out[i] > STAT_MAX) {
      out[i] = STAT_MAX;
      rem[i] = -1;
    }
  }
  for (let p = 0; p < SLOTS.length; p++) {
    while (partSum(p) > PART_MAX) {
      let big = p * 3;
      for (let i = p * 3; i < p * 3 + 3; i++) if (out[i] > out[big]) big = i;
      out[big] -= 1;
      rem[big] = -1;
    }
  }

  let placed = 0;
  for (const v of out) placed += v;
  let deficit = target - placed;
  while (deficit > 0) {
    let best = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i] >= STAT_MAX || partSum(partOf(i)) >= PART_MAX) continue;
      if (best < 0 || rem[i] > rem[best]) best = i;
    }
    if (best < 0) throw new Error(`scaleShape ${shape.id}: no room for ${deficit} points at target ${target}`);
    out[best] += 1;
    rem[best] -= shapeTotal;
    deficit -= 1;
  }

  for (let p = 0; p < SLOTS.length; p++) {
    if (partSum(p) > 0) continue;
    let donor = -1;
    for (let i = 0; i < out.length; i++) {
      if (partOf(i) === p || partSum(partOf(i)) < 2 || out[i] < 1) continue;
      if (donor < 0 || out[i] > out[donor]) donor = i;
    }
    if (donor < 0) throw new Error(`scaleShape ${shape.id}: cannot lift ${SLOTS[p]} to 1 point at target ${target}`);
    out[donor] -= 1;
    out[p * 3] += 1;
  }

  const part = (p: number, slot: Slot): Part => ({
    id: `house.${shape.id}.${slot}`,
    s: [out[p * 3], out[p * 3 + 1], out[p * 3 + 2]],
  });
  return {
    legs: part(0, "legs"),
    arms: part(1, "arms"),
    torso: part(2, "torso"),
    head: part(3, "head"),
    weapon: part(4, "weapon"),
  };
}

// ── matched sets (guide "Matched sets") ─────────────────────────────────────

export interface SetBonus {
  colorMatch: boolean;
  familyMatch: boolean;
  /** +N to every fight aggregate: color 1, family 2, both 3 */
  perStat: 0 | 1 | 2 | 3;
}
export const SET_PER_STAT = { color: 1, family: 2 } as const;

/** Cards by id: the catalog's launch plus starter index. A part whose id the
 * lookup does not know (a canon fighter, a house bot, a massim probe) has no
 * family and, unless painted, no color. */
export type CardLookup = Readonly<Record<string, PartCard>>;

/**
 * The colour a part OWNS, which is the instance's and only the instance's
 * (ADR-0141 decision 3: "the catalog's factory color is art only").
 *
 * This used to fall back to the catalogue colour, and that fallback decided
 * matched sets: four cards from four different families, none of which had
 * ever been given a colour, all reported their factory colour, and if two
 * families happen to be painted the same the bot collected a colour set worth
 * plus one to every stat in the fight. A card with no colour matches nothing
 * now, which is what "no colour" means.
 *
 * The lookup stays in the signature (partFamily beside it still needs one and
 * every caller passes both) and is deliberately unread.
 */
export function partColor(p: Part, _cards: CardLookup): PaintId | undefined {
  return p.paint;
}

export function partFamily(p: Part, cards: CardLookup): string {
  return cards[p.id]?.family ?? "";
}

/** The rule, exactly: all four body parts the same color = 1, the same
 * family = 2, both = 3. A missing color or an empty family never matches. */
export function setBonus(b: Build, cards: CardLookup): SetBonus {
  const c0 = partColor(b.legs, cards);
  const f0 = partFamily(b.legs, cards);
  let colorMatch = c0 !== undefined;
  let familyMatch = f0 !== "";
  for (const slot of BODY_SLOTS) {
    if (partColor(b[slot], cards) !== c0) colorMatch = false;
    if (partFamily(b[slot], cards) !== f0) familyMatch = false;
  }
  const perStat = (colorMatch ? SET_PER_STAT.color : 0) + (familyMatch ? SET_PER_STAT.family : 0);
  return { colorMatch, familyMatch, perStat: perStat as SetBonus["perStat"] };
}

// ── validation (the laws, executable) ───────────────────────────────────────

/** Every check here is a law from the guide or the engine doc. The harness
 * runs this as gate (0); a red line here blocks the merge. */
export function validateCatalog(t: CatalogTables): void {
  const fail = (msg: string): never => {
    throw new Error(`bots catalog: ${msg}`);
  };
  const noDash = (where: string, text: string): void => {
    if (/[\u2013\u2014]/.test(text)) fail(`${where}: em-dash or en-dash in copy`);
  };
  /** A name is ONE entry from the slot's `first` table followed by ONE word
   * from its `second` table. The first entry may itself be two words
   * ("Spark 3"), because ADR-0140's naming pass put the brand and the model
   * number in front of the part word; the LAST word is always the plain
   * word for the socket ("Legs", "Body", "Hammer"). Still no free text: both
   * halves have to be in the catalog's tables. */
  const nameOk = (card: PartCard): boolean => {
    const words = card.name.split(" ");
    if (words.length < 2) return false;
    const table = t.nameWords[card.slot];
    return table.first.includes(words.slice(0, -1).join(" ")) && table.second.includes(words[words.length - 1]);
  };
  const checkCard = (card: PartCard, expectPrice: (tier: Tier) => number, where: string): void => {
    if (!card.id) fail(`${where}: empty id`);
    if (!SLOTS.includes(card.slot)) fail(`${where} ${card.id}: unknown slot ${card.slot}`);
    if (!isLegalStats(card.s)) fail(`${where} ${card.id}: stats [${card.s.join(",")}] not legal (0..12 each, 1..20 total)`);
    const total = partTotal(card);
    if (partTier(total) !== card.tier) fail(`${where} ${card.id}: total ${total} is T${partTier(total)}, card says T${card.tier}`);
    if (card.price !== expectPrice(card.tier)) fail(`${where} ${card.id}: price ${card.price}, ladder says ${expectPrice(card.tier)}`);
    if (!nameOk(card)) fail(`${where} ${card.id}: name "${card.name}" is not two words from the ${card.slot} tables`);
    if (!card.lore || card.lore.length > t.loreMaxChars) fail(`${where} ${card.id}: lore missing or over ${t.loreMaxChars} chars`);
    noDash(`${where} ${card.id} lore`, card.lore);
    noDash(`${where} ${card.id} name`, card.name);
  };

  const familyById = new Map<string, Family>();
  for (const fam of t.families) {
    if (!fam.id || !fam.name || !fam.feel) fail(`family ${fam.id}: missing id, name or feel`);
    if (familyById.has(fam.id)) fail(`duplicate family id ${fam.id}`);
    if (![1, 2, 3, 4].includes(fam.tier)) fail(`family ${fam.id}: tier ${fam.tier}`);
    noDash(`family ${fam.id}`, `${fam.name} ${fam.feel}`);
    familyById.set(fam.id, fam);
  }

  // launch parts: unique ids and names, 8 per slot (2 designs x 4 tiers);
  // every body part has a family from the table and a color from the eight
  // paints, and its first word IS the family so the set reads on the card;
  // a weapon has neither
  const ids = new Set<string>();
  const names = new Set<string>();
  const perSlotTier = new Map<string, number>();
  const perSlot = new Map<Slot, number>();
  const perFamily = new Map<string, PartCard[]>();
  for (const card of t.parts) {
    if (ids.has(card.id)) fail(`duplicate part id ${card.id}`);
    ids.add(card.id);
    if (names.has(card.name)) fail(`duplicate part name ${card.name}`);
    names.add(card.name);
    checkCard(card, (tier) => PRICE_BY_TIER[tier], "part");
    const key = `${card.slot}/T${card.tier}`;
    perSlotTier.set(key, (perSlotTier.get(key) ?? 0) + 1);
    perSlot.set(card.slot, (perSlot.get(card.slot) ?? 0) + 1);
    if (card.slot === "weapon") {
      if (card.family !== undefined) fail(`weapon ${card.id} carries a family (${card.family}); weapons never count toward a set`);
      if (card.color !== undefined) fail(`weapon ${card.id} carries a color; weapons never count toward a set`);
      continue;
    }
    const fam = card.family ? familyById.get(card.family) : undefined;
    if (!fam) fail(`body part ${card.id}: family "${String(card.family)}" is not in the family table`);
    else {
      if (fam.tier !== card.tier) fail(`body part ${card.id}: T${card.tier} but family ${fam.id} is T${fam.tier}`);
      // startsWith, not split(" ")[0]: a family name is now a brand plus a
      // model number ("Spark 3"), so the card's title begins with two words
      if (!card.name.startsWith(`${fam.name} `)) fail(`body part ${card.id}: name "${card.name}" does not start with its family ${fam.name}`);
      const list = perFamily.get(fam.id) ?? [];
      list.push(card);
      perFamily.set(fam.id, list);
    }
    if (!isPaintId(card.color)) fail(`body part ${card.id}: color "${String(card.color)}" is not one of the eight paints`);
  }
  for (const fam of t.families) {
    const list = perFamily.get(fam.id) ?? [];
    if (list.length !== 4) fail(`family ${fam.id}: ${list.length} body parts, want exactly 4`);
    for (const slot of BODY_SLOTS) {
      if (list.filter((c) => c.slot === slot).length !== 1) fail(`family ${fam.id}: want exactly one ${slot}`);
    }
    // a family set is never a free color set: colors vary inside a family
    if (new Set(list.map((c) => c.color)).size === 1) fail(`family ${fam.id}: all four parts share one color, so a style set would be a color set for free`);
  }
  for (const slot of SLOTS) {
    if ((perSlot.get(slot) ?? 0) < 8) fail(`${slot}: ${perSlot.get(slot) ?? 0} parts, want at least 8`);
    for (const tier of [1, 2, 3, 4] as Tier[]) {
      const n = perSlotTier.get(`${slot}/T${tier}`) ?? 0;
      if (n < 2) fail(`${slot} T${tier}: ${n} designs, want at least 2`);
    }
  }

  // starter kit: FIVE T1 cards at the starter price, one per slot (a legs
  // pair, an arms pair, a torso, a head, a weapon); body parts carry a
  // color but no family, since style parts come only from the shop and drops
  if (t.starter.length !== 5) fail(`starter kit has ${t.starter.length} cards, want 5`);
  for (const card of t.starter) {
    if (ids.has(card.id)) fail(`starter id ${card.id} collides`);
    ids.add(card.id);
    if (card.tier !== 1) fail(`starter ${card.id} is T${card.tier}, want T1`);
    checkCard(card, () => STARTER_PRICE, "starter");
    if (card.family !== undefined) fail(`starter ${card.id} carries a family; starter scrap has no style line`);
    if (card.slot === "weapon") {
      if (card.color !== undefined) fail(`starter weapon ${card.id} carries a color`);
    } else if (!isPaintId(card.color)) {
      fail(`starter body part ${card.id}: color "${String(card.color)}" is not one of the eight paints`);
    }
  }
  for (const slot of SLOTS) {
    if (t.starter.filter((c) => c.slot === slot).length !== 1) fail(`starter kit wants exactly one ${slot}`);
  }
  const starterBody = Object.fromEntries(t.starter.map((c) => [c.slot, c])) as Record<Slot, PartCard>;
  const starterIndex: CardLookup = Object.fromEntries(t.starter.map((c) => [c.id, c]));
  const starterSet = setBonus(starterBody, starterIndex);
  if (starterSet.perStat !== 0) fail(`starter kit is a free set (perStat ${starterSet.perStat}); paint is not free`);

  // canonical builds: legal, and they sum to the reference totals
  const launchIndex: CardLookup = Object.fromEntries(t.parts.map((c) => [c.id, c]));
  for (const key of ["T1", "T2", "T3", "T4"] as CanonKey[]) {
    const b = t.canon[key];
    if (!b) fail(`canon ${key} missing`);
    if (!isLegalBuild(b)) fail(`canon ${key} is not a legal build`);
    const total = buildTotal(b);
    if (total !== t.canonTotals[key]) fail(`canon ${key} totals ${total}, want ${t.canonTotals[key]}`);
    const tier = Number(key[1]) as Tier;
    if (botTier(total) !== tier) fail(`canon ${key} total ${total} is bot tier T${botTier(total)}`);
    // the reference fighters are authored parts, not cards: never a set
    if (setBonus(b, launchIndex).perStat !== 0) fail(`canon ${key} carries a set bonus`);
  }

  // house shapes: nine, unique, each a legal build as authored, and legal
  // at the scaled totals the battles page will ask for
  if (t.shapes.length !== 9) fail(`${t.shapes.length} house shapes, want 9`);
  const shapeIds = new Set<string>();
  for (const sh of t.shapes) {
    if (shapeIds.has(sh.id)) fail(`duplicate shape id ${sh.id}`);
    shapeIds.add(sh.id);
    if (!sh.name || !sh.feel) fail(`shape ${sh.id}: missing name or feel`);
    noDash(`shape ${sh.id}`, `${sh.name} ${sh.feel}`);
    for (const slot of SLOTS) {
      if (!isLegalStats(sh[slot])) fail(`shape ${sh.id} ${slot}: stats [${sh[slot].join(",")}] not legal`);
    }
    for (const target of [8, 15, 26, 35, 45, 60, 78, 90, 100]) {
      const b = scaleShape(sh, target);
      if (!isLegalBuild(b)) fail(`shape ${sh.id} at ${target} is not a legal build`);
      if (buildTotal(b) !== target) fail(`shape ${sh.id} at ${target} totals ${buildTotal(b)}`);
    }
  }

  // the tier bands themselves (the guide's checked examples)
  if (botTier(25) !== 2 || botTier(24) !== 1) fail("bot tier T2 must start at 25");
  if (botTier(50) !== 2) fail("five T2 parts (50) must never be T3");
  if (botTier(56) !== 3) fail("three mid T2 plus two T4 (56) must be T3");
  if (botTier(80) !== 4 || botTier(79) !== 3) fail("bot tier T4 must start at 80");
  if (partTier(4) !== 1 || partTier(5) !== 2 || partTier(10) !== 2 || partTier(11) !== 3 || partTier(15) !== 3 || partTier(16) !== 4) {
    fail("part tier bands drifted from 1..4 / 5..10 / 11..15 / 16..20");
  }
}
