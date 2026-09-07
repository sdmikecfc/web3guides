/** Compatibility only for databases predating the transactional provisioning RPC.
 * A duplicate kit debit never creates a second set of owned pieces. */
import "server-only";
import { EQUIPMENT_SOCKETS, EQUIPMENT_KIND } from "@/lib/bots/equipment";
import { nameText } from "@/lib/bots/fixtures";
import { starterColors } from "@/lib/bots/shipment";
import { STARTER_PARTS } from "../_engine/catalog";
import { STARTER_PRICE, botTier, isPaintId, type Slot, type PaintId } from "../_engine/parts";
import { weightClassOf } from "../_engine/rewards";
import type { BotsDb } from "./db";
import { grant } from "./grants";
import { displayName, starterBotName, starterPartRows, STARTER_COINS, STARTER_KIT_COST, type PlayerRow, type StarterPartInsert } from "./players";
const STARTER_BAY=1;
const STARTER_SLOTS: readonly Slot[]=["legs","arms","torso","head","weapon"];
const isMissingColumn=(message:string,column:string)=>new RegExp(`'${column}' column|column .*\\b${column}\\b.* does not exist`,"i").test(message);
async function hasStarterParts(db: BotsDb, wallet: string): Promise<boolean> {
  const { count, error } = await db
    .from("battle_bots_part_instances")
    .select("id", { count: "exact", head: true })
    .eq("wallet", wallet)
    .eq("source", "starter");
  if (error) throw new Error(`starter parts read: ${error.message}`);
  return (count || 0) > 0;
}

/** The starter coins and the starter kit, every step idempotent. */
export async function ensureLegacyStarter(db: BotsDb, player: PlayerRow): Promise<boolean> {
  const wallet = player.wallet;
  const name = displayName(player);
  await grant(db, { wallet, walletName: name, coins: STARTER_COINS, reason: `starter:${wallet}`, meta: { kind: "starter" }, isTest: player.is_test });
  if (await hasStarterParts(db, wallet)) return false;
  const kit = await grant(db, {
    wallet,
    walletName: name,
    coins: -STARTER_KIT_COST,
    reason: `starter-kit:${wallet}`,
    meta: { kind: "starter-kit", cards: STARTER_PARTS.map((c) => c.id), each: STARTER_PRICE },
    isTest: player.is_test,
  });
  if (kit.duplicate) return false;
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
  return true;
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
async function insertStarterParts(db: BotsDb, rows: readonly StarterPartInsert[]): Promise<MadePart[]> {
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
