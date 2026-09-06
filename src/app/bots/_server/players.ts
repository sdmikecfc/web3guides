/**
 * BATTLE BOTS PLAYERS: the identity row (battle_bots_players) and the
 * starter sequence. One row per wallet, wallet lowercase (the s7 join
 * route's idiom, src/app/api/s7/join/route.ts).
 *
 *  - WALLET NAMES ONLY (the anonymity law): wallet_name is two words from
 *    the fixed tables plus a numeral, derived from the wallet with fnv1a so
 *    the same wallet always gets the same name and no free text exists.
 *  - THE STARTER (the guide "Shop and progression"): 120 starter coins
 *    (reason starter:<wallet>) and the five starter cards at 15 coins each,
 *    75 of the 120 (reason starter-kit:<wallet>, a negative grant), every
 *    step idempotent through bb_grant so a second enlist grants nothing.
 *    Each starter BODY card arrives in a colour from starterColors() in
 *    src/lib/bots/shipment.ts (ADR-0141 decision 7). Before this the kit
 *    wrote no colour at all and every wallet fell through to the catalogue's
 *    factory colour, which is art only: four cards from four families would
 *    share one colour and hand a player a free colour set worth plus one to
 *    every stat.
 *  - denominator_usd is NOT set here. The tracking module (doma-reporter
 *    modules/battlebots/enlist.js) snapshots the bankroll at enlist; the
 *    column keeps its schema default (the 50 floor) until that job runs.
 */
import { EQUIPMENT_SOCKETS, EQUIPMENT_KIND, splitPairValue } from "@/lib/bots/equipment";
import "server-only";
import { nameText } from "@/lib/bots/fixtures";
import { BOT_FIRST_WORDS, BOT_SECOND_WORDS, OWNER_FIRST_WORDS, OWNER_SECOND_WORDS } from "@/lib/bots/naming";
import { STARTER_PARTS } from "../_engine/catalog";
import { STARTER_PRICE, botTier, isPaintId, type Slot } from "../_engine/parts";
import { weightClassOf } from "../_engine/rewards";
import { starterColors } from "@/lib/bots/shipment";
import type { PaintId } from "../_engine/parts";
import { fnv1a } from "../_engine/rng";
import { type BotsDb, nowIso } from "./db";
import { grant } from "./grants";

/** The `color` column lands with battle_bots_003_junkyard_shipments.sql.
 * The same test src/app/api/bots/shop/buy/route.ts makes before it retries
 * without the column. */
function isMissingColumn(message: string, column: string): boolean {
  return new RegExp(`'${column}' column|column .*\\b${column}\\b.* does not exist`, "i").test(message);
}

/** The bay the assembled starter robot stands in. */
export const STARTER_BAY = 1;
/** The five sockets the starter kit fills, in the order a bot wears them. */
const STARTER_SLOTS: readonly Slot[] = ["legs", "arms", "torso", "head", "weapon"];

export const STARTER_COINS = 120;
export const STARTER_KIT_COST = STARTER_PARTS.length * STARTER_PRICE;
export const STARTER_PROVENANCE = "Starter part";

export interface PlayerRow {
  id: number;
  wallet: string;
  wallet_name: string | null;
  enlisted_at: string;
  coins: number | string;
  battle_points: number | string;
  is_operator: boolean;
  is_test: boolean;
  review_status: string;
}

/** "Brass Otter 41": AN OWNER IS A METAL AND AN ANIMAL. The old tables were
 * shared with the robot names and were full of machine words, so a wallet
 * and a robot could be called the same thing and a part name could be either
 * ("Sparky Kettle 7" reads like a part on a shelf, not like somebody's
 * robot). naming.ts owns the five name spaces and its check fails on any
 * overlap. */
export function walletNameFor(wallet: string): string {
  const h = fnv1a(wallet.toLowerCase());
  const first = OWNER_FIRST_WORDS[h % OWNER_FIRST_WORDS.length];
  const second = OWNER_SECOND_WORDS[Math.floor(h / 64) % OWNER_SECOND_WORDS.length];
  const num = 1 + (Math.floor(h / 4096) % 99);
  return `${first} ${second} ${num}`;
}

export function coinsOf(p: PlayerRow | null | undefined): number {
  return Math.round(Number(p?.coins) || 0);
}

export function pointsOf(p: PlayerRow | null | undefined): number {
  return Number(p?.battle_points) || 0;
}

export function displayName(p: PlayerRow): string {
  return p.wallet_name && !/^0x[0-9a-f]{40}$/i.test(p.wallet_name) ? p.wallet_name : walletNameFor(p.wallet);
}

export async function loadPlayer(db: BotsDb, wallet: string): Promise<PlayerRow | null> {
  const { data, error } = await db
    .from("battle_bots_players")
    .select("id, wallet, wallet_name, enlisted_at, coins, battle_points, is_operator, is_test, review_status")
    .eq("wallet", wallet.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`player read: ${error.message}`);
  return (data as PlayerRow | null) ?? null;
}

/** Wallet names for a set of wallets (the battles page, the paper). */
export async function walletNames(db: BotsDb, wallets: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const want = Array.from(new Set(wallets.map((w) => w.toLowerCase()))).filter(Boolean);
  if (!want.length) return out;
  const { data } = await db.from("battle_bots_players").select("wallet, wallet_name").in("wallet", want);
  for (const r of (data || []) as { wallet: string; wallet_name: string | null }[]) {
    out.set(r.wallet, r.wallet_name && !/^0x/i.test(r.wallet_name) ? r.wallet_name : walletNameFor(r.wallet));
  }
  for (const w of want) if (!out.has(w)) out.set(w, walletNameFor(w));
  return out;
}

async function hasStarterParts(db: BotsDb, wallet: string): Promise<boolean> {
  const { count } = await db
    .from("battle_bots_part_instances")
    .select("id", { count: "exact", head: true })
    .eq("wallet", wallet)
    .eq("source", "starter");
  return (count || 0) > 0;
}

/** Seven starter instances; the two limbs retain the old pair's total price and resale. */
export function starterPartRows(wallet: string, isTest: boolean, colors = starterColors(wallet)) {
  return STARTER_PARTS.flatMap((c) => {
    const paint = c.slot === "weapon" ? null : colors[c.slot];
    if (c.slot !== "weapon" && !paint) throw new Error(`starter kit: no colour for the ${c.slot} card`);
    const row = {
      wallet,
      part_key: c.id,
      slot_kind: c.slot,
      tier: c.tier,
      stats: { equipmentVersion: 2, s: [c.s[0], c.s[1], c.s[2]], provenance: STARTER_PROVENANCE, ...(paint ? { paint } : {}) },
      bot_id: null,
      source: "starter",
      list_price: STARTER_PRICE,
      is_test: isTest,
      color: paint,
    };
    return c.slot === "arms" || c.slot === "legs"
      ? splitPairValue(STARTER_PRICE).map(value => ({ ...row, list_price: value.price, stats: { ...row.stats, salvage: value.salvage } }))
      : [row];
  });
}

/** The starter coins and the starter kit, every step idempotent. */
async function ensureStarter(db: BotsDb, player: PlayerRow): Promise<void> {
  const wallet = player.wallet;
  const name = displayName(player);
  await grant(db, { wallet, walletName: name, coins: STARTER_COINS, reason: `starter:${wallet}`, meta: { kind: "starter" }, isTest: player.is_test });
  if (await hasStarterParts(db, wallet)) return;
  const kit = await grant(db, {
    wallet,
    walletName: name,
    coins: -STARTER_KIT_COST,
    reason: `starter-kit:${wallet}`,
    meta: { kind: "starter-kit", cards: STARTER_PARTS.map((c) => c.id), each: STARTER_PRICE },
    isTest: player.is_test,
  });
  if (!kit.ok) throw new Error(`starter kit for ${name} refused (coins ${kit.coins})`);
  // EVERY STARTER BODY CARD ARRIVES IN A COLOUR (ADR-0141 decision 7): four
  // independent picks from a per-wallet seed, so a new player already owns
  // colours to chase and two of them often match, which is the point. The
  // weapon gets none. Called here, from the one exported entry point in
  // src/lib/bots/shipment.ts, so the shelf, the drops and the kit cannot
  // drift apart; a colourless body card would be a card no colour set can
  // ever count and no rig can tint.
  const colors = starterColors(wallet);
  const rows = starterPartRows(wallet, player.is_test, colors);
  const made = await insertStarterParts(db, rows);
  // THE ROBOT IS ALREADY BUILT (Mike, 2026-09-04: three steps, and the third
  // one is play). Assembling five cards is a lovely thing to do on purpose
  // and a terrible thing to be made to do before you have seen a single
  // fight, so the kit arrives already standing in bay 1. The player can still
  // strip it, repaint it and rebuild it; they just do not have to first.
  await createStarterBot(db, player, made, colors);
}

interface MadePart {
  id: number;
  slot_kind: Slot;
}

/**
 * The five starter cards, returning their new ids so the starter bot can wear
 * them. The `color` column arrives with battle_bots_003_junkyard_shipments.sql;
 * until an operator has run it, drop the column and keep going, because the
 * card still carries its colour in stats.paint, which is what the engine and
 * partPaint() read. Same fallback the buy route makes.
 */
async function insertStarterParts(db: BotsDb, rows: readonly Record<string, unknown>[]): Promise<MadePart[]> {
  const { data, error } = await db.from("battle_bots_part_instances").insert(rows).select("id, slot_kind");
  if (error && isMissingColumn(error.message || "", "color")) {
    console.warn("[bots] battle_bots_part_instances.color is missing: run battle_bots_003_junkyard_shipments.sql");
    const withoutColor = rows.map(({ color: _color, ...rest }) => rest);
    const { data: retryData, error: retry } = await db.from("battle_bots_part_instances").insert(withoutColor).select("id, slot_kind");
    if (retry) throw new Error(`starter parts: ${retry.message}`);
    return (retryData || []) as MadePart[];
  }
  if (error) throw new Error(`starter parts: ${error.message}`);
  return (data || []) as MadePart[];
}

/** "Speedy Otter 12": A ROBOT IS A FEELING WORD AND A CREATURE, from tables
 * that share not one word with the owner tables above, so a fight card can
 * never print the same name twice and leave a reader guessing which one is
 * the robot. */
export function starterBotName(wallet: string): { first: string; second: string; num: number } {
  const h = fnv1a(`bb:starter-bot:${wallet.toLowerCase()}`);
  return {
    first: BOT_FIRST_WORDS[h % BOT_FIRST_WORDS.length],
    second: BOT_SECOND_WORDS[Math.floor(h / 64) % BOT_SECOND_WORDS.length],
    num: 1 + (Math.floor(h / 4096) % 99),
  };
}

/**
 * BAY 1, ALREADY STANDING. One bot row wearing the five cards that were just
 * made, so a wallet that has just connected can press Play and watch a fight
 * without opening the Build screen at all.
 *
 * Called from ensureStarter and ONLY from there, which is behind the
 * hasStarterParts guard, so it runs exactly once per wallet for ever: a player
 * who recycles this bot has recycled its cards too, and nothing grows back.
 *
 * It THROWS rather than shrugging if a slot is missing. A bot standing in a
 * bay with an empty socket cannot fight (engineBuildOf returns null), so a
 * quiet half-built starter would look exactly like the thing this whole change
 * exists to remove.
 */
async function createStarterBot(
  db: BotsDb,
  player: PlayerRow,
  made: readonly MadePart[],
  colors: Record<string, PaintId | null>,
): Promise<void> {
  const parts = {} as Record<Slot, number>;
  for (const slot of STARTER_SLOTS) {
    const p = made.find((m) => m.slot_kind === slot);
    if (!p) throw new Error(`starter bot: no ${slot} card came back`);
    parts[slot] = p.id;
  }
  const remaining=[...made];
  const sockets=Object.fromEntries(EQUIPMENT_SOCKETS.map(socket=>{
    const index=remaining.findIndex(p=>p.slot_kind===EQUIPMENT_KIND[socket]);
    if(index<0) throw new Error(`Starter kit missing ${socket}`);
    return [socket,remaining.splice(index,1)[0].id];
  }));
  const total = STARTER_PARTS.reduce((n, c) => n + c.s[0] + c.s[1] + c.s[2], 0);
  const torsoPaint = colors.torso;
  const name = starterBotName(player.wallet);
  const { data, error } = await db
    .from("battle_bots_bots")
    .insert({
      wallet: player.wallet,
      slot: STARTER_BAY,
      name: nameText(name),
      build: { parts, sockets, equipmentVersion:2, name, decal: null, ...(isPaintId(torsoPaint) ? { paint: torsoPaint } : {}) },
      total,
      tier: botTier(total),
      weight_class: weightClassOf(total),
      is_test: player.is_test,
    })
    .select("id")
    .single();
  // Bay 1 is already taken (a row the tracking module or an older enlist
  // made): the player has a bot, which is all this is for. Leave it alone.
  if (error && /duplicate|unique/i.test(error.message || "")) return;
  if (error) throw new Error(`starter bot: ${error.message}`);
  const botId = (data as { id: number } | null)?.id;
  if (!botId) throw new Error("starter bot: the row did not land");
  const { error: wear } = await db
    .from("battle_bots_part_instances")
    .update({ bot_id: botId })
    .in("id", Object.values(sockets));
  if (wear) throw new Error(`starter bot: the cards did not go on (${wear.message})`);
}

/**
 * Enlist a wallet: a returning wallet is returned as is (nothing granted);
 * a new wallet gets its row, its name and the starter. The is_test flag is
 * set ONLY at creation (a dev header can never flip a real player).
 *
 * NOTHING IS ASKED OF THE PLAYER HERE. A verified signature over a
 * server-issued nonce is the whole price of a seat (Mike, 2026-09-04: open
 * the site, connect the wallet, play). Splitting one person's trading across
 * many wallets is answered in the money rules instead, where a wallet is only
 * paid for a week it really traded, so it costs an honest player nothing at
 * the door.
 */
export async function enlistPlayer(
  db: BotsDb,
  walletIn: string,
  isTest: boolean,
): Promise<{ player: PlayerRow; joined: boolean }> {
  const wallet = walletIn.toLowerCase();
  const existing = await loadPlayer(db, wallet);
  if (existing) {
    // a row the tracking module or a grant created before the web saw it:
    // give it a name and the starter it never got
    const { data: starter } = await db
      .from("battle_bots_ledger")
      .select("id")
      .eq("wallet", wallet)
      .eq("reason", `starter:${wallet}`)
      .maybeSingle();
    if (!starter) {
      if (!existing.wallet_name || /^0x/i.test(existing.wallet_name)) {
        await db.from("battle_bots_players").update({ wallet_name: walletNameFor(wallet), updated_at: nowIso() }).eq("id", existing.id);
        existing.wallet_name = walletNameFor(wallet);
      }
      await ensureStarter(db, existing);
      const fresh = await loadPlayer(db, wallet);
      return { player: fresh ?? existing, joined: true };
    }
    return { player: existing, joined: false };
  }
  const { error } = await db
    .from("battle_bots_players")
    .insert({ wallet, wallet_name: walletNameFor(wallet), is_test: isTest })
    .select("id")
    .single();
  if (error && !/duplicate|unique/i.test(error.message || "")) throw new Error(`enlist: ${error.message}`);
  const created = await loadPlayer(db, wallet);
  if (!created) throw new Error("enlist: the player row did not land");
  await ensureStarter(db, created);
  const fresh = await loadPlayer(db, wallet);
  return { player: fresh ?? created, joined: !error };
}
