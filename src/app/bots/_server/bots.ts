/**
 * BATTLE BOTS BOTS AND PARTS: the rows (battle_bots_bots,
 * battle_bots_part_instances), the views the client renders, the engine
 * Build a fight reads, and the two daily counters.
 *
 *  - A BOT ROW'S `build` JSON: { parts: { legs, arms, torso, head, weapon }
 *    (part instance ids, null = empty), name: { first, second, num },
 *    decal, paint }. The `name` TEXT column mirrors nameText() for the
 *    tracking module's listings.
 *  - A PART ROW'S `stats` JSON: { s: [a, b, c], paint?, provenance,
 *    fightId? }. `paint` is the colour the CARD ARRIVED IN and keeps for
 *    life (ADR-0141: there is no paint job). It lives on the instance
 *    because it is what a colour set counts, and because the catalogue's
 *    factory colour is art only and must never stand in for it
 *    (src/lib/bots/garage-state.ts carries the same rule locally).
 *  - THE COUNTERS are compare-and-swap updates (the s7 nonce claim idiom,
 *    src/app/api/s7/score/route.ts: update ... eq(old) ... select()): two
 *    overlapping requests cannot both spend the last attack.
 *  - THE ENGINE BUILD is built from the OWNED ROWS, never from a request
 *    (the server resolves from the database; house law).
 */
import { EQUIPMENT_SOCKETS, EQUIPMENT_KIND, type EquipmentIds } from "@/lib/bots/equipment";
import { gameCard } from "@/lib/bots/beginner-catalog";
import { modularBuild, equipmentStatsTotal, type CombatBuild, type CombatSocket } from "@/lib/bots/combat-model";
import { buildTotal } from "../_engine/parts";
import "server-only";
import { CARD_BY_ID, DECAL_IDS, FIRST_WORDS, SECOND_WORDS, nameText, recycleValue, type DecalId } from "@/lib/bots/fixtures";
import {
  CROWN_CARD_KIND,
  bodyPaints,
  dedupeHats,
  findsOf,
  marksOf,
  normalizeLook,
  socketPaints,
  type BotLook,
  type HatWon,
  type LookEarned,
  type SocketPaints,
} from "@/lib/bots/look";
import { dropColor } from "@/lib/bots/shipment";
import { SLOTS, botTier, isPaintId, partTier, type Build, type PaintId, type Part, type Slot, type Stats, type Tier } from "../_engine/parts";
import { ATTACKS_PER_DAY, DEFENCES_PER_DAY, levelForXp, weightClassOf } from "../_engine/rewards";
import { type BotsDb, nowIso } from "./db";
import type { BotName, BotView, PartView } from "./types";

export interface BuildJson {
  parts?: Partial<Record<Slot, number | null>>;
  sockets?: EquipmentIds<number>;
  equipmentVersion?: 2;
  name?: BotName;
  decal?: DecalId | null;
  paint?: PaintId;
  /**
   * THE CHOSEN HALF of the look: the face, the sticker, its place and its
   * colour, and the won hat. Only what a player picks lives here, and only
   * after the save route checked it against the wallet's own rows
   * (look.ts parseLook). The socket colours and every earned mark are NOT
   * stored: they are derived from the part rows and the bot row on every
   * read, so a stored look can never claim a star nobody won.
   */
  look?: BotLook;
}

export interface BotRow {
  id: number;
  wallet: string;
  slot: number;
  name: string | null;
  build: BuildJson | null;
  total: number;
  tier: number;
  weight_class: string;
  level: number;
  xp: number;
  wins: number;
  losses: number;
  broken_until: string | null;
  attacks_day_key: string | null;
  attacks_today: number;
  defenses_today: number;
  listed: boolean;
  recycled_at: string | null;
  is_test: boolean;
  created_at: string;
}

export interface PartStatsJson {
  s?: number[];
  paint?: string;
  provenance?: string;
  fightId?: string;
  equipmentVersion?: 2;
  /** Whole-coin resale retained when a legacy pair becomes two owned limbs. */
  salvage?: number;
  pairOriginId?: number;
  equipmentSide?: "left" | "right";
}

export interface PartRow {
  id: number;
  wallet: string;
  part_key: string;
  slot_kind: Slot;
  tier: number;
  stats: PartStatsJson | null;
  bot_id: number | null;
  source: string;
  list_price: number;
  recycled_at: string | null;
  is_test: boolean;
  created_at: string;
}

/** Exported so a read that is not per wallet (the look census in ./twins.ts)
 * selects the SAME columns and its rows really are BotRows, rather than a
 * shorter list cast into the shape and hoping nothing downstream reads a
 * column it did not ask for. */
export const BOT_COLS =
  "id, wallet, slot, name, build, total, tier, weight_class, level, xp, wins, losses, broken_until, attacks_day_key, attacks_today, defenses_today, listed, recycled_at, is_test, created_at";
export const PART_COLS = "id, wallet, part_key, slot_kind, tier, stats, bot_id, source, list_price, recycled_at, is_test, created_at";

export const BAY_MIN = 1;
export const BAY_MAX = 5;
export const DEFAULT_BOT_PAINT: PaintId = "cream";

// ── reads ───────────────────────────────────────────────────────────────────

export async function loadParts(db: BotsDb, wallet: string): Promise<PartRow[]> {
  const { data, error } = await db
    .from("battle_bots_part_instances")
    .select(PART_COLS)
    .eq("wallet", wallet.toLowerCase())
    .is("recycled_at", null)
    .order("id", { ascending: true })
    .limit(2000);
  if (error) throw new Error(`parts read: ${error.message}`);
  return (data || []) as PartRow[];
}

export async function loadPartsOfBot(db: BotsDb, botId: number): Promise<PartRow[]> {
  const { data, error } = await db.from("battle_bots_part_instances").select(PART_COLS).eq("bot_id", botId).is("recycled_at", null).limit(20);
  if (error) throw new Error(`parts read: ${error.message}`);
  return (data || []) as PartRow[];
}

export async function loadBots(db: BotsDb, wallet: string): Promise<BotRow[]> {
  const { data, error } = await db
    .from("battle_bots_bots")
    .select(BOT_COLS)
    .eq("wallet", wallet.toLowerCase())
    .is("recycled_at", null)
    .order("slot", { ascending: true });
  if (error) throw new Error(`bots read: ${error.message}`);
  return (data || []) as BotRow[];
}

export async function loadBot(db: BotsDb, id: number): Promise<BotRow | null> {
  const { data, error } = await db.from("battle_bots_bots").select(BOT_COLS).eq("id", id).is("recycled_at", null).maybeSingle();
  if (error) throw new Error(`bot read: ${error.message}`);
  return (data as BotRow | null) ?? null;
}

// ── shapes ──────────────────────────────────────────────────────────────────

export function partStats(p: PartRow): Stats {
  const s = p.stats?.s;
  if (Array.isArray(s) && s.length === 3) return [Number(s[0]) || 0, Number(s[1]) || 0, Number(s[2]) || 0];
  const card = gameCard(p.part_key);
  if (card) return [card.s[0], card.s[1], card.s[2]];
  return [1, 0, 0];
}

/**
 * The colour this CARD arrived in. The instance is the only source of truth
 * (ADR-0141 decision 3: "the catalog's factory color is art only").
 *
 * There used to be a fall back to the catalogue colour here, and it was
 * quiet: a card that no producer had given a colour looked coloured, and four
 * cards from four different families would report the same factory colour and
 * count as a matched colour set worth plus one to every stat in a fight.
 * A card with no colour now says so, and the producers are what got fixed:
 * the shop writes the listing colour, the starter kit writes starterColors(),
 * a drop writes dropColor(). Nothing else makes a body card.
 */
export function partPaint(p: PartRow): PaintId | undefined {
  if (p.slot_kind === "weapon") return undefined;
  const paint = p.stats?.paint;
  if (isPaintId(paint)) return paint;
  // A DROP, from before its producer wrote a colour. Not a fallback: this is
  // the drop seed itself (dropColor, the one entry point ADR-0141 names), so
  // the card gets exactly the colour the fixed producer would have written,
  // the same every time it is read, for ever. Once the fight route writes
  // stats.paint at insert this line stops being reached.
  if (p.source === "drop" && p.stats?.fightId) {
    return dropColor(p.stats.fightId, p.part_key, p.slot_kind) ?? undefined;
  }
  return undefined;
}

export function partRecycleValue(p: Pick<PartRow, "list_price" | "stats">): number {
  const value = p.stats?.salvage;
  const salvage = typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
  return recycleValue({ price: p.list_price, salvage });
}

export function partView(p: PartRow): PartView {
  const card = gameCard(p.part_key);
  const s = partStats(p);
  const tier = (card?.tier ?? partTier(s[0] + s[1] + s[2])) as Tier;
  const view: PartView = {
    id: p.id,
    partKey: p.part_key,
    slot: p.slot_kind,
    tier,
    s,
    botId: p.bot_id,
    source: p.source,
    provenance: p.stats?.provenance ?? "",
    listPrice: p.list_price,
    salvage: partRecycleValue(p),
    name: (card?.name ?? p.part_key).replace(/Arms$/, "Arm").replace(/Legs$/, "Leg"),
    familyName: card?.familyName ?? null,
    design: card?.design ?? 1,
    lore: card?.lore ?? "",
  };
  const paint = partPaint(p);
  if (paint) view.paint = paint;
  // view.color is NOT set from the catalogue. The catalogue's factory colour
  // is art only (ADR-0141 decision 3): it is the colour the plate happens to
  // be painted in, not a colour anybody owns, and putting it on the view is
  // how a colourless card came to look coloured on every surface that reads
  // one. The colour a card owns is `paint`, above, and nothing else.
  return view;
}

export function buildJsonOf(b: BotRow): BuildJson {
  return b.build && typeof b.build === "object" ? b.build : {};
}

export function partIdsOf(b: BotRow): Record<Slot, number | null> {
  const parts = buildJsonOf(b).parts ?? {};
  const out = {} as Record<Slot, number | null>;
  for (const slot of SLOTS) {
    const v = parts[slot];
    out[slot] = typeof v === "number" && Number.isInteger(v) ? v : null;
  }
  return out;
}

export function socketIdsOf(b: BotRow): EquipmentIds<number> {
  const modern=buildJsonOf(b).sockets;
  if (modern) return Object.fromEntries(EQUIPMENT_SOCKETS.map(s=>[s, Number.isInteger(modern[s]) ? modern[s] : null])) as EquipmentIds<number>;
  const c=partIdsOf(b); return {head:c.head,torso:c.torso,armL:c.arms,armR:c.arms,legL:c.legs,legR:c.legs,weapon:c.weapon};
}

export function nameOf(b: BotRow): BotName {
  const n = buildJsonOf(b).name;
  const first = n && (FIRST_WORDS as readonly string[]).includes(n.first) ? n.first : FIRST_WORDS[0];
  const second = n && (SECOND_WORDS as readonly string[]).includes(n.second) ? n.second : SECOND_WORDS[0];
  const num = n && typeof n.num === "number" && Number.isInteger(n.num) && n.num >= 1 && n.num <= 99 ? n.num : null;
  return { first, second, num };
}

export function nameTextOf(b: BotRow): string {
  return b.name || nameText(nameOf(b));
}

export function paintOf(b: BotRow): PaintId {
  const p = buildJsonOf(b).paint;
  return isPaintId(p) ? p : DEFAULT_BOT_PAINT;
}

export function decalOf(b: BotRow): DecalId | null {
  const d = buildJsonOf(b).decal;
  return d && (DECAL_IDS as readonly string[]).includes(d) ? d : null;
}

/** The part rows on a bot, by slot (missing slots absent). */
export function partsOf(b: BotRow, parts: readonly PartRow[]): Partial<Record<Slot, PartRow>> {
  const ids = partIdsOf(b);
  const out: Partial<Record<Slot, PartRow>> = {};
  for (const slot of SLOTS) {
    const id = ids[slot];
    if (id == null) continue;
    const p = parts.find((x) => x.id === id && x.slot_kind === slot && !x.recycled_at);
    if (p) out[slot] = p;
  }
  return out;
}

export function isComplete(b: BotRow, parts: readonly PartRow[]): boolean {
  const ids=socketIdsOf(b);
  if (buildJsonOf(b).sockets && new Set(Object.values(ids).filter(id => id != null)).size !== EQUIPMENT_SOCKETS.length) return false;
  return EQUIPMENT_SOCKETS.every(s=>parts.some(p=>p.id===ids[s] && p.slot_kind===EQUIPMENT_KIND[s] && !p.recycled_at));
}

/** The engine's Build from the OWNED rows: id, stats and the painted
 * colour per part (src/lib/bots/fixtures.ts engineBuild did this for the
 * local store). null when a slot is empty: an incomplete bot never fights. */
export function engineBuildOf(b: BotRow, parts: readonly PartRow[]): Build | null {
  if (buildJsonOf(b).sockets) {
    if (!isComplete(b, parts)) return null;
    const ids=socketIdsOf(b);
    const get=(s: keyof EquipmentIds): Part | null => {
      const p=parts.find(p=>p.id===ids[s] && p.slot_kind===EQUIPMENT_KIND[s] && !p.recycled_at);
      if (!p) return null; const paint=partPaint(p);
      return {id:p.part_key,s:partStats(p),...(paint ? {paint} : {})};
    };
    const [head,torso,armL,armR,legL,legR,weapon]=EQUIPMENT_SOCKETS.map(get);
    return head && torso && armL && armR && legL && legR && weapon ? modularBuild(head,torso,armL,armR,legL,legR,weapon) : null;
  }
  const on = partsOf(b, parts);
  const part = (slot: Slot): Part | null => {
    const p = on[slot];
    if (!p) return null;
    const e: Part = { id: p.part_key, s: partStats(p) };
    const paint = p.slot_kind !== "weapon" ? p.stats?.paint : undefined;
    if (isPaintId(paint)) e.paint = paint;
    return e;
  };
  const legs = part("legs");
  const arms = part("arms");
  const torso = part("torso");
  const head = part("head");
  const weapon = part("weapon");
  if (!legs || !arms || !torso || !head || !weapon) return null;
  return { legs, arms, torso, head, weapon };
}

export function totalOf(b: BotRow, parts: readonly PartRow[]): number {
  if (buildJsonOf(b).sockets) {
    const ids = socketIdsOf(b), values = {} as Record<CombatSocket, Stats>;
    for (const s of EQUIPMENT_SOCKETS) {
      const p = parts.find(p => p.id === ids[s] && p.slot_kind === EQUIPMENT_KIND[s] && !p.recycled_at);
      values[s] = p ? partStats(p) : [0, 0, 0];
    }
    return equipmentStatsTotal(values);
  }
  const on = partsOf(b, parts);
  let total = 0;
  for (const slot of SLOTS) {
    const p = on[slot];
    if (!p) continue;
    const s = partStats(p);
    total += s[0] + s[1] + s[2];
  }
  return total;
}

export function inShop(b: BotRow, nowMs: number): boolean {
  if (!b.broken_until) return false;
  const t = Date.parse(b.broken_until);
  return Number.isFinite(t) && t > nowMs;
}

export function attacksLeft(b: BotRow, day: string): number {
  const used = b.attacks_day_key === day ? b.attacks_today : 0;
  return Math.max(0, ATTACKS_PER_DAY - used);
}

export function defencesLeft(b: BotRow, day: string): number {
  const used = b.attacks_day_key === day ? b.defenses_today : 0;
  return Math.max(0, DEFENCES_PER_DAY - used);
}

// -- the look, derived from the rows -----------------------------------------
// src/lib/bots/look.ts is the ONE place a look is defined. Everything below
// only READS ROWS and hands them over: no rule about a face, a sticker, a
// hat or a mark is restated here (the Domain Kitchen lesson, a second copy
// of a rule is a second rule that quietly disagrees).

/** A part row's star count, from the catalogue when the row does not carry one. */
export function partStarsOf(p: PartRow): Tier {
  const card = CARD_BY_ID[p.part_key];
  if (card) return card.tier;
  const s = partStats(p);
  return partTier(s[0] + s[1] + s[2]);
}

/** The colour on each of the seven sockets: the card's own colour, spread
 * over the sockets it fills, with the weapon riding the arm. */
export function socketPaintsOf(b: BotRow, parts: readonly PartRow[]): SocketPaints {
  if (buildJsonOf(b).sockets) {
    const ids=socketIdsOf(b);
    const paints=Object.fromEntries(EQUIPMENT_SOCKETS.map(s=>{ const p=parts.find(p=>p.id===ids[s]); return [s,p ? partPaint(p) ?? null : null]; })) as SocketPaints;
    paints.weapon=paints.armR; return paints;
  }
  const on = partsOf(b, parts);
  return socketPaints((slot) => {
    const p = on[slot];
    return p ? partPaint(p) : undefined;
  });
}

/**
 * WHAT A ROBOT HAS EARNED, from server rows only: its wins, its lost fights,
 * its level, whether a week champion card names it, the colours on the parts
 * it wears, the stars on those parts, and the hats this wallet has won.
 * Nothing a client sent is read.
 *
 * It takes the part ids and the name rather than a bot row so the SAVE route
 * can check a claimed look against the robot it is BUILDING and not the one
 * on the row a moment ago: a player who fits a fourth mint part and picks
 * the wink in the same save has earned the wink.
 */
export interface EarnedInput {
  wins: number;
  losses: number;
  level: number;
  crown: boolean;
  partIds: Record<Slot, number | null>;
  socketIds?: EquipmentIds<number>;
  plateNumber: number | null;
}

export function earnedFor(o: EarnedInput, parts: readonly PartRow[], hats: readonly HatWon[] = []): LookEarned {
  const on: Partial<Record<Slot, PartRow>> = {};
  for (const slot of SLOTS) {
    const id = o.partIds[slot];
    if (id == null) continue;
    const p = parts.find((x) => x.id === id && x.slot_kind === slot && !x.recycled_at);
    if (p) on[slot] = p;
  }
  const worn = o.socketIds ? EQUIPMENT_SOCKETS.map(s=>parts.find(p=>p.id===o.socketIds![s] && p.slot_kind===EQUIPMENT_KIND[s] && !p.recycled_at)).filter((p): p is PartRow=>!!p) : SLOTS.map((slot) => on[slot]).filter((p): p is PartRow => !!p);
  return findsOf({
    wins: o.wins,
    losses: o.losses,
    level: o.level,
    champion: o.crown,
    bodyCount: o.socketIds ? 6 : 4,
    bodyPaints: o.socketIds ? worn.filter(p=>p.slot_kind!=="weapon").map(partPaint).filter((p): p is PaintId=>!!p) : bodyPaints((slot) => {
      const p = on[slot];
      return p ? partPaint(p) : undefined;
    }),
    partStars: worn.map(partStarsOf),
    hats,
    plateNumber: o.plateNumber,
  });
}

/** The same, for a robot that is already a row. */
export function earnedOf(b: BotRow, parts: readonly PartRow[], hats: readonly HatWon[] = [], crown = false): LookEarned {
  return earnedFor(
    { wins: b.wins, losses: b.losses, level: b.level, crown, partIds: partIdsOf(b), socketIds: buildJsonOf(b).sockets, plateNumber: nameOf(b).num },
    parts,
    hats,
  );
}

/**
 * THE LOOK A ROBOT DRAWS WITH, from server rows only.
 *
 * The chosen half comes off the build JSON the save route already checked;
 * normalizeLook is the read path, so a sticker whose colour left the robot
 * moves to a colour it still wears and nothing here throws. A robot must
 * still draw after its owner takes a part off.
 */
export function lookOf(b: BotRow, parts: readonly PartRow[], hats: readonly HatWon[] = [], crown = false): BotLook {
  return normalizeLook(buildJsonOf(b).look, earnedOf(b, parts, hats, crown));
}

// -- hats: won from a fight, never sold --------------------------------------

export interface HatRow {
  id: number;
  wallet: string;
  kind: string;
  /** the paint it turned up in. Null on a row written before 009 was run,
   *  and null is answered honestly: the drawing falls back to the head's. */
  color: string | null;
  fight_id: string | null;
  won_at: string;
}

/**
 * Postgres for "that table is not there".
 *
 * Mike runs migrations by hand, so there is a window in which the code is
 * deployed and doma-reporter/sql/battle_bots_008_look.sql has not been run.
 * In that window the honest answer to "which hats has this wallet won" is
 * none, because nothing has given one out yet, and a garage that answers 500
 * would be a worse answer than the true one. The miss is logged every time
 * so it is never quiet, and it stops happening the moment the file is run.
 */
function isMissingHatsTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /battle_bots_hats/i.test(err.message || "");
}

const RUN_008 = "run doma-reporter/sql/battle_bots_008_look.sql";
const RUN_009 = "run doma-reporter/sql/battle_bots_009_hat_colour.sql";

/** Postgres for "that column is not there": 009 has not been run yet. */
function isMissingHatColour(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || /column .*color/i.test(err.message || "");
}

/**
 * WHICH HATS THIS WALLET HAS WON, kind and colour, each one once.
 *
 * It asks for the colour and falls back to the kind alone when the column is
 * not there yet, because Mike runs migrations by hand and there is a window
 * in which the code is deployed and 009 is not. In that window a hat is a
 * hat with no recorded colour, which every drawing renders in the head's own
 * colour: the true answer for a row that really does not know, and the exact
 * picture every surface drew before this lane.
 */
export async function loadHats(db: BotsDb, wallet: string): Promise<HatWon[]> {
  const read = (cols: string) =>
    db.from("battle_bots_hats").select(cols).eq("wallet", wallet.toLowerCase()).order("id", { ascending: true }).limit(200);

  let { data, error } = await read("kind, color");
  if (error && isMissingHatColour(error)) {
    // eslint-disable-next-line no-console
    console.error("[bots hats] battle_bots_hats has no colour column yet:", RUN_009);
    ({ data, error } = await read("kind"));
  }
  if (error) {
    if (isMissingHatsTable(error)) {
      // eslint-disable-next-line no-console
      console.error("[bots hats] battle_bots_hats is not there yet:", RUN_008);
      return [];
    }
    throw new Error(`hats read: ${error.message}`);
  }
  return dedupeHats((data || []) as { kind?: unknown; color?: unknown }[]);
}

/**
 * Give a hat to a wallet. UNIQUE (wallet, fight_id) makes it idempotent by
 * fight the way every grant is idempotent by reason, so a replayed fight
 * hands out its hat once and never twice. False means the wallet already
 * had this fight's hat, or the table is not there yet.
 */
export async function insertHat(db: BotsDb, wallet: string, hat: HatWon, fightId: string, isTest: boolean): Promise<boolean> {
  const row = { wallet: wallet.toLowerCase(), fight_id: fightId, is_test: isTest };
  const put = (extra: Record<string, unknown>) => db.from("battle_bots_hats").insert({ ...row, ...extra });

  let { error } = await put({ kind: hat.kind, color: hat.color });
  if (error && isMissingHatColour(error)) {
    // the kind still lands, so a hat won in the window before 009 is a real
    // hat the wallet keeps; it wears the head's colour until somebody asks
    // for its own, which nobody can, because it never had one
    // eslint-disable-next-line no-console
    console.error("[bots hats] hat given out with no colour:", RUN_009);
    ({ error } = await put({ kind: hat.kind }));
  }
  if (!error) return true;
  if (/duplicate|unique/i.test(error.message || "")) return false;
  if (isMissingHatsTable(error)) {
    // eslint-disable-next-line no-console
    console.error("[bots hats] no hat given out:", RUN_008);
    return false;
  }
  throw new Error(`hat insert: ${error.message}`);
}

/**
 * The bot ids that hold a week champion card, so a crown is a row and never
 * a client's word. Empty until the weekly job writes its first card.
 */
export async function loadCrownBotIds(db: BotsDb, wallet: string): Promise<Set<number>> {
  const { data, error } = await db
    .from("battle_bots_cards")
    .select("bot_id")
    .eq("wallet", wallet.toLowerCase())
    .eq("kind", CROWN_CARD_KIND)
    .limit(200);
  if (error) throw new Error(`crowns read: ${error.message}`);
  const out = new Set<number>();
  for (const r of (data || []) as { bot_id: number | null }[]) if (r.bot_id) out.add(Number(r.bot_id));
  return out;
}

/** What botView needs beyond the rows it already has: the wallet's hats and
 * the bot ids that wear a crown. Both default to nothing, so every existing
 * caller keeps working and simply shows no hat and no crown. */
export interface LookExtras {
  hats?: readonly HatWon[];
  crowns?: ReadonlySet<number>;
}

export function botView(b: BotRow, parts: readonly PartRow[], day: string, nowMs: number, extras?: LookExtras): BotView {
  const total = totalOf(b, parts);
  const name = nameOf(b);
  return {
    id: b.id,
    bay: b.slot,
    name,
    nameText: nameTextOf(b),
    decal: decalOf(b),
    paint: paintOf(b),
    look: lookOf(b, parts, extras?.hats ?? [], !!extras?.crowns?.has(b.id)),
    paints: socketPaintsOf(b, parts),
    marks: marksOf(b.wins, b.losses, b.level, !!extras?.crowns?.has(b.id)),
    parts: partIdsOf(b),
    ...(buildJsonOf(b).sockets ? {sockets:socketIdsOf(b)} : {}),
    total,
    tier: botTier(total),
    weightClass: weightClassOf(total),
    level: b.level,
    xp: b.xp,
    wins: b.wins,
    losses: b.losses,
    repairUntil: inShop(b, nowMs) ? b.broken_until : null,
    inShop: inShop(b, nowMs),
    attacksLeft: attacksLeft(b, day),
    defencesLeft: defencesLeft(b, day),
    listed: b.listed,
    complete: isComplete(b, parts),
  };
}

// ── the daily counters (compare-and-swap) ───────────────────────────────────

/** Roll the counters to `day` if the row still carries an older day. */
async function rollDay(db: BotsDb, b: BotRow, day: string): Promise<void> {
  if (b.attacks_day_key === day) return;
  const { error } = await db
    .from("battle_bots_bots")
    .update({ attacks_day_key: day, attacks_today: 0, defenses_today: 0, updated_at: nowIso() })
    .eq("id", b.id)
    .or(`attacks_day_key.is.null,attacks_day_key.neq.${day}`);
  if (error) throw new Error(`day roll: ${error.message}`);
  b.attacks_day_key = day;
  b.attacks_today = 0;
  b.defenses_today = 0;
}

/** Spend one of the bot's two attacks today. False = none left (or a
 * concurrent request took it). */
export async function claimAttack(db: BotsDb, b: BotRow, day: string): Promise<boolean> {
  await rollDay(db, b, day);
  const used = b.attacks_today;
  if (used >= ATTACKS_PER_DAY) return false;
  const { data, error } = await db
    .from("battle_bots_bots")
    .update({ attacks_today: used + 1, updated_at: nowIso() })
    .eq("id", b.id)
    .eq("attacks_day_key", day)
    .eq("attacks_today", used)
    .select("id");
  if (error) throw new Error(`attack claim: ${error.message}`);
  if (!data || data.length !== 1) return false;
  b.attacks_today = used + 1;
  return true;
}

/** Give an attack back when the fight could not start after the claim. */
export async function releaseAttack(db: BotsDb, b: BotRow, day: string): Promise<void> {
  const used = b.attacks_today;
  if (used <= 0) return;
  await db.from("battle_bots_bots").update({ attacks_today: used - 1, updated_at: nowIso() }).eq("id", b.id).eq("attacks_day_key", day).eq("attacks_today", used);
  b.attacks_today = used - 1;
}

/** Count one defence against a listed bot (at most five a day). */
export async function claimDefence(db: BotsDb, b: BotRow, day: string): Promise<boolean> {
  await rollDay(db, b, day);
  const used = b.defenses_today;
  if (used >= DEFENCES_PER_DAY) return false;
  const { data, error } = await db
    .from("battle_bots_bots")
    .update({ defenses_today: used + 1, updated_at: nowIso() })
    .eq("id", b.id)
    .eq("attacks_day_key", day)
    .eq("defenses_today", used)
    .select("id");
  if (error) throw new Error(`defence claim: ${error.message}`);
  if (!data || data.length !== 1) return false;
  b.defenses_today = used + 1;
  return true;
}

export async function releaseDefence(db: BotsDb, b: BotRow, day: string): Promise<void> {
  const used = b.defenses_today;
  if (used <= 0) return;
  await db.from("battle_bots_bots").update({ defenses_today: used - 1, updated_at: nowIso() }).eq("id", b.id).eq("attacks_day_key", day).eq("defenses_today", used);
  b.defenses_today = used - 1;
}

/** Wins, losses, xp and the level that xp earns. */
export async function recordFight(db: BotsDb, b: BotRow, won: boolean, xp: number): Promise<void> {
  const nextXp = b.xp + Math.max(0, Math.floor(xp));
  const patch: Record<string, unknown> = {
    wins: won ? b.wins + 1 : b.wins,
    losses: won ? b.losses : b.losses + 1,
    xp: nextXp,
    level: levelForXp(nextXp),
    updated_at: nowIso(),
  };
  const { error } = await db.from("battle_bots_bots").update(patch).eq("id", b.id);
  if (error) throw new Error(`record: ${error.message}`);
  b.wins = patch.wins as number;
  b.losses = patch.losses as number;
  b.xp = nextXp;
  b.level = patch.level as number;
}

/** The wallet's best bot level: what the shop's tier gate reads. */
export function bestLevel(bots: readonly BotRow[]): number {
  let best = 1;
  for (const b of bots) if (b.level > best) best = b.level;
  return best;
}
