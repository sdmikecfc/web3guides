import "server-only";
import { randomUUID } from "node:crypto";
import { createFightV5, advanceFightV5, acceptSpecialV5, snapshotBuildV5, presetV5, resultV5, RULES_V5, FPS_V5, MAX_FRAMES_V5, V5_CATALOG, type StateV5, type BuildV5 } from "@/lib/bots/v5";
import type { CombatBuild } from "@/lib/bots/combat-model";
import type { LiveHouseSession, LiveInputReceipt, LiveHouseResponse } from "@/lib/bots/live-house-types";
import { STYLE_GUIDE, FIGHTING_STYLES } from "@/lib/bots/style-guide";
import { styleCardOf } from "@/lib/bots/style-catalog";
import { dropColor } from "@/lib/bots/shipment";
import { fightRewards, REPAIR_MS, type Difficulty } from "../_engine/rewards";
import { fnv1a, rngFork } from "../_engine/rng";
import { type Tier } from "../_engine/parts";
import { buildJsonOf, engineBuildOf, socketIdsOf, loadBot, loadParts, loadHats, loadCrownBotIds, nameTextOf, lookOf, socketPaintsOf } from "./bots";
import { EQUIPMENT_SOCKETS, EQUIPMENT_KIND } from "@/lib/bots/equipment";
import { marksOf } from "@/lib/bots/look";
import { looksFromBuild } from "./fight-read";
import { requireFightConfiguration } from "./fight-configuration";
import { missingMigration } from "./rollout";
import { refuse, dayKey, type BotsDb } from "./db";

export const stylesEnabled = () => process.env.BOTS_STYLES_V1 === "1";
/** Match the whole assembly's budget, not the body's special-unlock tier. */
export function houseGearTier(build: BuildV5): Tier {
  const sum = (slot: keyof BuildV5["parts"]) => build.parts[slot].s.reduce((a, b) => a + b, 0);
  const budget = sum("head") + sum("torso") + sum("weapon") + (sum("armL") + sum("armR") + sum("legL") + sum("legR")) / 2;
  const budgets = [15, 35, 60, 90];
  let index = 0;
  for (let i = 1; i < budgets.length; i++) if (Math.abs(budgets[i] - budget) < Math.abs(budgets[index] - budget)) index = i;
  return (index + 1) as Tier;
}
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,95}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TABLE = "battle_bots_live_house_v5";
export function parseLiveStartInput(raw: unknown): { botId: number; difficulty: Difficulty; requestId: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(k => !["t", "botId", "difficulty", "requestId"].includes(k))) return refuse(400, "Use your saved robot to start this fight.");
  const value = raw as Record<string, unknown>;
  if (!Number.isSafeInteger(value.botId) || Number(value.botId) < 1) return refuse(400, "Choose your robot first.");
  if (value.difficulty !== "easy" && value.difficulty !== "medium" && value.difficulty !== "hard") return refuse(400, "Choose a house robot.");
  if (typeof value.requestId !== "string" || !ID.test(value.requestId)) return refuse(400, "Start this fight again.");
  return { botId: value.botId as number, difficulty: value.difficulty, requestId: value.requestId };
}
export function parseLiveInput(raw: unknown): { inputId: string; kind: "special" } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(k => !["t", "inputId", "kind"].includes(k))) return refuse(400, "Use the special button to send this move.");
  const value = raw as Record<string, unknown>;
  if (typeof value.inputId !== "string" || !ID.test(value.inputId) || value.kind !== "special") return refuse(400, "Press the special button when it is ready.");
  return { inputId: value.inputId, kind: "special" };
}
export interface LiveHouseRow {
  id: string; wallet: string; bot_id: number; difficulty: Difficulty; revision: number; started_at: string;
  balance_version: string; status: LiveHouseSession["status"]; state: StateV5; input_receipts: LiveInputReceipt[];
  rules_snapshot: Record<string, unknown>; identity_snapshot: LiveHouseSession["identities"];
  result: LiveHouseSession["result"]; settlement: LiveHouseSession["settlement"];
}
function databaseError(error: { code?: string; message: string }, operation: string): never {
  if (missingMigration(error)) return refuse(503, "The new arena is being set up. Your saved robot is safe.");
  if (error.code === "P0001" || error.code === "P0002") return refuse(409, error.code === "P0002" ? "This saved robot is not available." : error.message);
  throw new Error(`${operation}: ${error.message}`);
}
async function read(db: BotsDb, wallet: string, id: string): Promise<LiveHouseRow> {
  if (!UUID.test(id)) return refuse(400, "Choose a saved fight.");
  const { data, error } = await db.from(TABLE).select("*").eq("id", id).eq("wallet", wallet.toLowerCase()).maybeSingle();
  if (error) return databaseError(error, "live fight read");
  if (!data) return refuse(404, "That fight is not in your garage.");
  return data as LiveHouseRow;
}
function view(row: LiveHouseRow, now: number): LiveHouseSession {
  return { id: row.id, botId: Number(row.bot_id), revision: row.revision, engineVersion: 5,
    balanceVersion: row.balance_version, difficulty: row.difficulty, serverNow: now, startedAt: row.started_at,
    tick: row.state.frame, status: row.status, rules: row.rules_snapshot, builds: row.state.builds,
    state: row.state, events: row.state.events, inputs: row.input_receipts, identities: row.identity_snapshot,
    result: row.result ?? (row.state.done ? resultV5(row.state) : null), settlement: row.settlement };
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
};
/** Receive time is authoritative. Lost connections add no commands. */
export function liveTargetFrame(startedAt: string, serverNow: number, previousFrame: number): number {
  return Math.max(previousFrame, Math.min(MAX_FRAMES_V5, Math.max(0, Math.floor((serverNow - Date.parse(startedAt)) * FPS_V5 / 1000))));
}
export function advanceLiveSnapshot(row: LiveHouseRow, now: number, input?: { inputId: string; kind: "special" }) {
  if (row.balance_version !== RULES_V5.balanceVersion || canonical(row.rules_snapshot) !== canonical(RULES_V5)) {
    return refuse(503, "This fight needs its saved combat rules. Please try again later.");
  }
  const state: StateV5 = structuredClone(row.state);
  const receipts = row.input_receipts.slice();
  const previous = input && receipts.find(r => r.inputId === input.inputId);
  if (!state.done) advanceFightV5(state, liveTargetFrame(row.started_at, now, state.frame));
  let receipt = previous;
  if (input && !previous) {
    if (receipts.length >= 256) return refuse(429, "Too many button presses. You can still watch this fight.");
    const result = acceptSpecialV5(state, { id: input.inputId, kind: "special", who: 0, frame: state.frame });
    receipt = { inputId: input.inputId, kind: "special", frame: state.frame, accepted: result.accepted, ...(result.reason ? { reason: result.reason } : {}) };
    receipts.push(receipt);
  }
  return { state, receipts, receipt, changed: state.frame !== row.state.frame || receipts.length !== row.input_receipts.length };
}

/** All consequences retry together in SQL; failure leaves a durable pending result. */
async function settle(db: BotsDb, row: LiveHouseRow): Promise<LiveHouseRow> {
  if (row.status !== "settlement-pending") return row;
  const { data, error } = await db.rpc("bb_live_house_v5_settle", { p_wallet: row.wallet, p_id: row.id, p_result: resultV5(row.state) });
  if (error || !data) {
    console.error("[bots live settlement]", row.id, error?.message ?? "No result");
    return row;
  }
  return data as LiveHouseRow;
}
export async function resumeLiveHouse(db: BotsDb, wallet: string, id: string, input?: { inputId?: unknown; kind?: unknown }, now = Date.now()): Promise<LiveHouseResponse> {
  if (input && (typeof input.inputId !== "string" || !ID.test(input.inputId) || input.kind !== "special")) return refuse(400, "Press the special button when it is ready.");
  const command = input ? { inputId: input.inputId as string, kind: "special" as const } : undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    let row = await read(db, wallet, id);
    if (row.status === "complete") {
      const receipt = command && row.input_receipts.find(r => r.inputId === command.inputId);
      return { ok: true, session: view(row, now), ...(receipt ? { input: receipt } : {}) };
    }
    const next = advanceLiveSnapshot(row, now, command);
    if (next.changed) {
      const { data, error } = await db.rpc("bb_live_house_v5_cas", { p_wallet: wallet.toLowerCase(), p_id: id, p_revision: row.revision, p_state: next.state, p_receipts: next.receipts });
      if (error) return databaseError(error, "live fight update");
      if (!data) continue;
      row = data as LiveHouseRow;
    }
    row = await settle(db, row);
    return { ok: true, session: view(row, now), ...(next.receipt ? { input: next.receipt } : {}) };
  }
  return refuse(409, "This fight is updating in another window. Try again.");
}

export interface StartLiveHouseInput { botId?: unknown; difficulty?: unknown; requestId?: unknown }
export async function startLiveHouse(db: BotsDb, walletIn: string, input: StartLiveHouseInput, now = Date.now()): Promise<LiveHouseResponse> {
  if (!stylesEnabled()) return refuse(404, "The new arena is not open yet.");
  const wallet = walletIn.toLowerCase();
  if (!Number.isSafeInteger(input.botId) || Number(input.botId) < 1) return refuse(400, "Choose your robot first.");
  if (input.difficulty !== "easy" && input.difficulty !== "medium" && input.difficulty !== "hard") return refuse(400, "Choose a house robot.");
  if (typeof input.requestId !== "string" || !ID.test(input.requestId)) return refuse(400, "Start this fight again.");
  const salt = requireFightConfiguration("pve");
  const { data: existing, error: existingError } = await db.from(TABLE).select("id,bot_id,difficulty").eq("wallet", wallet).eq("request_id", input.requestId).maybeSingle();
  if (existingError) return databaseError(existingError, "live request read");
  if (existing) {
    if (Number(existing.bot_id) !== input.botId || existing.difficulty !== input.difficulty) return refuse(409, "This request already belongs to another fight.");
    return resumeLiveHouse(db, wallet, existing.id, undefined, now);
  }
  const [bot, parts, hats, crowns] = await Promise.all([loadBot(db, input.botId as number), loadParts(db, wallet), loadHats(db, wallet), loadCrownBotIds(db, wallet)]);
  if (!bot || bot.wallet !== wallet) return refuse(404, "That robot is not in your garage.");
  if (buildJsonOf(bot).engineVersion !== 5) return refuse(409, "Choose a styled robot for this arena.");
  const sockets = socketIdsOf(bot);
  if (buildJsonOf(bot).assemblyLocked !== true || new Set(Object.values(sockets)).size !== EQUIPMENT_SOCKETS.length ||
    EQUIPMENT_SOCKETS.some(socket => !parts.some(part => part.id === sockets[socket] && part.wallet === wallet && part.bot_id === bot.id && part.slot_kind === EQUIPMENT_KIND[socket] && !part.recycled_at))) {
    return refuse(409, "Your saved parts are not all on this robot. Refresh your garage.");
  }
  const raw = engineBuildOf(bot, parts) as CombatBuild | null;
  if (!raw) return refuse(409, "Finish all seven parts first.");
  const build = snapshotBuildV5(raw);
  const gearTier = houseGearTier(build);
  const id = randomUUID(), seed = fnv1a(`${id}|${salt}`);
  const style = FIGHTING_STYLES[seed % FIGHTING_STYLES.length];
  const tier = Math.min(4, gearTier + (input.difficulty === "hard" ? 2 : input.difficulty === "medium" ? 1 : 0)) as Tier;
  const opponent = presetV5(style, tier);
  const state = createFightV5(seed, build, opponent, { autoSpecial: [false, true] });
  const dropRoll = Math.floor(rngFork(seed, "A", "drop")() * 100);
  const reward = (won: boolean) => {
    const r = fightRewards({ mode: "pve", difficulty: input.difficulty as Difficulty, attackerWon: won, attackerTier: gearTier, dropRoll });
    const pool = V5_CATALOG.map(c => styleCardOf(c.id)).filter(c => c && c.tier === r.drop);
    const card = r.drop && pool.length ? pool[Math.floor(rngFork(seed, "A", "dropPick")() * pool.length)] : null;
    return { coins: r.attacker.coins, points: r.attacker.points, xp: r.attacker.xp, repairMs: r.attackerRepair ? REPAIR_MS : 0,
      drop: card ? { partKey: card.id, slot: card.slot, tier: card.tier, s: [...card.s], price: card.price, paint: dropColor(`live5:${id}`, card.id, card.slot) } : null };
  };
  const identity: LiveHouseSession["identities"] = [
    { name: nameTextOf(bot), look: { look: lookOf(bot, parts, hats, crowns.has(bot.id)), paints: socketPaintsOf(bot, parts), marks: marksOf(bot.wins, bot.losses, bot.level, crowns.has(bot.id)), wins: bot.wins } },
    { name: `${STYLE_GUIDE[style].label} house robot`, look: looksFromBuild(opponent.appearanceBuild, undefined) },
  ];
  const { data, error } = await db.rpc("bb_live_house_v5_start", { p_wallet: wallet, p_id: id, p_request_id: input.requestId, p_bot_id: bot.id,
    p_bot_updated_at: bot.updated_at, p_difficulty: input.difficulty, p_day: dayKey(now), p_started_at: new Date(now).toISOString(),
    p_state: state, p_rewards: { win: reward(true), loss: reward(false) }, p_identity: identity, p_rules: RULES_V5 });
  if (error) return databaseError(error, "live fight start");
  if (!data) throw new Error("Live fight did not return its saved session");
  return resumeLiveHouse(db, wallet, (data as LiveHouseRow).id, undefined, now);
}
