import "server-only";
import { BEGINNER_ALLOWANCE, BEGINNER_OFFERS, BEGINNER_ORDER, beginnerOffer, isBeginnerSocket } from "@/lib/bots/beginner-catalog";
import type { CoinBalance, OnboardingView } from "@/lib/bots/onboarding-types";
import { parseDraftName, parseDraftOffers } from "@/lib/bots/onboarding-draft";
import type { Build as GarageBuild } from "@/lib/bots/fixtures";
import { resolveFight } from "@/lib/bots/combat";
import { NO_ORDERS, PIECE, PIECE_NAMES, type FightEvent } from "../_engine/parts";
import { chainSummary } from "../_engine/commentary";
import { fnv1a } from "../_engine/rng";
import { marksOf } from "@/lib/bots/look";
import { EQUIPMENT_KIND } from "@/lib/bots/equipment";
import { engineBuildOf, loadBots, loadCrownBotIds, loadHats, loadParts, lookOf, nameTextOf, paintOf, socketPaintsOf, totalOf, type BotRow } from "./bots";
import { canonicalBuild, type ResultJson } from "./fight-read";
import { coinsOf, displayName, loadPlayer, type PlayerRow } from "./players";
import { refuse, type BotsDb } from "./db";
import { requireFightConfiguration } from "./fight-configuration";
import type { FightIdentityView, FightRewardsView, LookView } from "./types";
import { onboardingEnabled, missingMigration } from "./rollout";

export interface OnboardingRow {
  wallet: string; version: 1 | 2; welcome_bot_id: number | null; draft_bot_id: number; reserved_coins: number;
  welcomed_at: string | null; assembled_at: string | null; practice_fight_id: number | null;
  practiced_at: string | null; completed_at: string | null;
  draft_offers?: Record<string, string | null>; draft_name?: GarageBuild["name"]; revision?: number;
  handoff_fingerprint?: string | null; finished_revision?: number | null;
}
const absentMigration = (message: string) => /could not find the table|does not exist|schema cache/i.test(message);
export async function loadOnboarding(db: BotsDb, wallet: string): Promise<OnboardingRow | null> {
  const { data, error } = await db.from("battle_bots_onboarding").select("*").eq("wallet", wallet.toLowerCase()).maybeSingle();
  // Older accounts remain readable while an operator stages the additive migration.
  if (error && absentMigration(error.message)) return null;
  if (error) throw new Error(`onboarding read: ${error.message}`);
  return data as OnboardingRow | null;
}
export function coinBalance(player: Pick<PlayerRow, "coins">, onboarding: OnboardingRow | null): CoinBalance {
  const total = coinsOf(player as PlayerRow);
  const reserved = onboarding && !onboarding.completed_at ? Number(onboarding.reserved_coins) : 0;
  return { total, reserved, spendable: Math.max(0, total - reserved) };
}
/** The three amounts come from one MVCC snapshot, including during another tab's purchase. */
export async function loadCoinBalance(db: BotsDb, wallet: string, player: PlayerRow): Promise<CoinBalance> {
  const { data, error } = await db.rpc("bb_coin_balance", { p_wallet: wallet });
  if (error && absentMigration(error.message)) return coinBalance(player, await loadOnboarding(db, wallet));
  if (error) throw new Error(`coin balance: ${error.message}`);
  if (!data) return coinBalance(player, null);
  return { total: Number(data.total), reserved: Number(data.reserved), spendable: Number(data.spendable) };
}
export async function onboardingView(db: BotsDb, wallet: string, known?: OnboardingRow | null): Promise<OnboardingView | null> {
  const row = known === undefined ? await loadOnboarding(db, wallet) : known;
  if (!row) return null;
  const [{ data: claims, error }, bots] = await Promise.all([
    db.from("battle_bots_beginner_claims").select("socket,part_id,offer_id").eq("wallet", wallet.toLowerCase()).eq("version", row.version),
    loadBots(db, wallet),
  ]);
  if (error) throw new Error(`beginner claims: ${error.message}`);
  const purchases = Object.fromEntries(BEGINNER_ORDER.map(s => [s, null])) as OnboardingView["purchases"];
  for (const c of claims ?? []) if (isBeginnerSocket(c.socket)) purchases[c.socket] = { partId: Number(c.part_id), offerId: String(c.offer_id) };
  const draftOffers = row.version === 2 ? parseDraftOffers(row.draft_offers) : null;
  if (draftOffers && !row.completed_at) for (const s of BEGINNER_ORDER) if (draftOffers[s]) purchases[s] = { partId: -1 - BEGINNER_ORDER.indexOf(s), offerId: draftOffers[s]! };
  const purchasedCount = BEGINNER_ORDER.filter(s => purchases[s] !== null).length;
  return {
    version: row.version,
    step: row.completed_at ? "complete" : !row.welcomed_at ? "welcome" : row.version === 2 || purchasedCount < 7 ? "shop" : "practice",
    welcomeBotId: Number(row.welcome_bot_id ?? row.draft_bot_id), welcomeBay: bots.find(b => b.id === row.welcome_bot_id)?.slot ?? 1,
    draftBotId: Number(row.draft_bot_id), draftBay: bots.find(b => b.id === row.draft_bot_id)?.slot ?? (row.version === 2 ? 1 : 2),
    allowance: BEGINNER_ALLOWANCE, reservedCoins: Number(row.reserved_coins), purchases,
    nextSocket: BEGINNER_ORDER.find(s => !purchases[s]) ?? null, purchasedCount,
    practiceFightId: row.practice_fight_id == null ? null : String(row.practice_fight_id),
    milestones: { welcomed: !!row.welcomed_at, assembled: !!row.assembled_at, practiced: !!row.practiced_at, completed: !!row.completed_at },
    offers: BEGINNER_OFFERS,
    ...(row.version === 2 ? { revision: Number(row.revision ?? 0), draftOffers: draftOffers ?? undefined, draftName: row.draft_name } : {}),
  };
}
export async function assertOnboardingUnlocked(db: BotsDb, wallet: string, botId?: number): Promise<void> {
  const o = await loadOnboarding(db, wallet);
  if (o && !o.completed_at && (botId === undefined || botId === o.welcome_bot_id || botId === o.draft_bot_id)) {
    return refuse(409, o.version === 2 ? "Finish building your robot first." : "Finish your welcome practice first.");
  }
}
export const WELCOME_REWARDS: FightRewardsView = {
  attackerCoins: 0, attackerPoints: 0, attackerXp: 0, defenderCoins: 0, stakeHeld: 0, stakePayout: 0,
  houseBonus: 0, drop: null, hat: null, attackerRepair: false,
};
function finisher(log: readonly FightEvent[]): string {
  let last = "no part came off";
  for (const e of log) {
    if (e.t === "timeout") return "time ran out";
    if (e.t === "break") last = e.part === PIECE.HEAD ? "head off" : e.part === PIECE.BODY ? "body cracked" : `${PIECE_NAMES[e.part]} off`;
  }
  return last;
}
async function practice(db: BotsDb, wallet: string, day: string, o: OnboardingRow): Promise<string> {
  if (o.practice_fight_id !== null) return String(o.practice_fight_id);
  if (!o.assembled_at || o.reserved_coins !== 0) return refuse(409, "Choose all seven parts first.");
  const [player, bots, parts, hats, crowns] = await Promise.all([loadPlayer(db, wallet), loadBots(db, wallet), loadParts(db, wallet), loadHats(db, wallet), loadCrownBotIds(db, wallet)]);
  if (!player) return refuse(401, "Enlist first.");
  const a = bots.find(b => b.id === o.draft_bot_id), b = bots.find(b => b.id === o.welcome_bot_id);
  if (!a || !b) return refuse(409, "Your welcome robots are not ready.");
  const rawA = engineBuildOf(a, parts), rawB = engineBuildOf(b, parts);
  if (!rawA || !rawB) return refuse(409, "Your robot needs all seven parts.");
  const buildA = canonicalBuild(rawA), buildB = canonicalBuild(rawB);
  // A tutorial has a stable identity before its battle row exists. No fight ID is consumed on a failed request.
  const seed = fnv1a(`bb:welcome:v1:${wallet}|${requireFightConfiguration("spar")}`);
  const result = resolveFight(seed, buildA, buildB, NO_ORDERS, NO_ORDERS, "spar");
  const identity = (bot: BotRow): FightIdentityView => ({ name: nameTextOf(bot), wallet: displayName(player), wins: bot.wins, losses: bot.losses, strategy: "Welcome practice", paint: paintOf(bot), tier: 1, total: totalOf(bot, parts) });
  const appearance = (bot: BotRow): LookView => ({ paints: socketPaintsOf(bot, parts), look: lookOf(bot, parts, hats, crowns.has(bot.id)), marks: marksOf(bot.wins, bot.losses, bot.level, crowns.has(bot.id)), wins: bot.wins });
  const ids: [FightIdentityView, FightIdentityView] = [identity(a), identity(b)];
  const names: [string, string] = [ids[0].name, ids[1].name];
  const stored: ResultJson = {
    v: result.engineVersion, seed, mode: "spar", difficulty: null, buildA, buildB, orders: [NO_ORDERS, NO_ORDERS],
    winner: result.winner, frames: result.frames, end: result.end, hash: result.hash,
    chain: chainSummary(result.log, names), finisher: finisher(result.log), names,
    walletNames: [ids[0].wallet, ids[1].wallet], ids, houseShape: null, rewards: WELCOME_REWARDS,
    totalA: ids[0].total, totalB: ids[1].total, looks: [appearance(a), appearance(b)],
  };
  const { data, error } = await db.rpc("bb_onboarding_practice", { p_wallet: wallet, p_result: stored, p_day: day });
  if (error) throw new Error(`welcome practice: ${error.message}`);
  if (!data) throw new Error("welcome practice did not return an ID");
  return String(data);
}
export interface OnboardingMutation { action?: unknown; socket?: unknown; offerId?: unknown; revision?: unknown; name?: unknown }
export async function mutateOnboarding(db: BotsDb, wallet: string, body: OnboardingMutation, day: string) {
  const o = await loadOnboarding(db, wallet);
  if (!o && !onboardingEnabled()) return refuse(409, "The welcome build is not open for new players.");
  if (!o) return refuse(409, "Your garage is already open.");
  if (o.version === 2) {
    const action = body.action;
    if (!["welcome", "choose", "name", "finish"].includes(String(action))) return refuse(400, "Choose your next step.");
    if (action !== "welcome" && (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0 || Number(body.revision) > 2147483647)) return refuse(400, "Refresh your build before saving it.");
    const offer = action === "choose" ? beginnerOffer(body.offerId) : null;
    if (action === "choose" && (!isBeginnerSocket(body.socket) || !offer || offer.part.slot !== EQUIPMENT_KIND[body.socket])) return refuse(400, "Choose a part for this place.");
    const name = action === "name" ? parseDraftName(body.name) : null;
    if (action === "name" && !name) return refuse(400, "Choose a robot name.");
    const { error } = action === "finish"
      ? await db.rpc("bb_onboarding_v2_finish", { p_wallet: wallet, p_revision: body.revision })
      : await db.rpc("bb_onboarding_v2_edit", { p_wallet: wallet, p_revision: body.revision ?? o.revision ?? 0, p_action: action, p_socket: body.socket ?? null, p_offer_id: offer?.id ?? null, p_name: name });
    if (error && missingMigration(error)) return refuse(503, "The new builder is being set up. Your saved build is safe. Please try again later.");
    if (error?.code === "P0001") return refuse(409, error.message);
    if (error) throw new Error(`starter build: ${error.message}`);
    return { ok: true as const, onboarding: await onboardingView(db, wallet) };
  }
  let fightId: string | undefined;
  if (body.action === "buy") {
    const offer = beginnerOffer(body.offerId);
    if (!isBeginnerSocket(body.socket) || !offer || offer.part.slot !== EQUIPMENT_KIND[body.socket]) return refuse(400, "Choose a part for this socket.");
    const { error } = await db.rpc("bb_onboarding_buy", { p_wallet: wallet, p_socket: body.socket, p_offer_id: offer.id });
    if (error) throw new Error(`beginner purchase: ${error.message}`);
  } else if (body.action === "practice") fightId = await practice(db, wallet, day, o);
  else if (body.action === "welcome" || body.action === "complete") {
    if (body.action === "complete" && !o.practice_fight_id) return refuse(409, "Watch your first practice first.");
    const { error } = await db.rpc("bb_onboarding_ack", { p_wallet: wallet, p_action: body.action });
    if (error) throw new Error(`welcome progress: ${error.message}`);
  } else return refuse(400, "Choose your next step.");
  return { ok: true as const, onboarding: await onboardingView(db, wallet), ...(fightId ? { fightId } : {}) };
}
