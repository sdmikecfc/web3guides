import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { V6_CATALOG, cardV6, presetV6, snapshotBuildV6, createFightV6, advanceFightV6, acceptSpecialV6, resultV6, RULES_V6, FPS_V6, MAX_FRAMES_V6, type BuildV6, type StateV6 } from "@/lib/bots/v6";
import { modularBuild } from "@/lib/bots/combat-model";
import { SEASON_RULES, SEASON_SOCKETS, repairPrice, seasonalPartPrice } from "@/lib/bots/season/rules";
import type { SeasonStateResponse, SeasonDraft, SeasonMatch, SeasonInputReceipt, SeasonStartInput, RepairQuote, SeasonBot, DefensePlan, SeasonInfo, SeasonMatchResponse } from "@/lib/bots/season/types";
import { fnv1a } from "../_engine/rng";
import { fightSalt, type BotsDb } from "./db";
import { syncSeasonTrades, seasonTradeReadiness, oldestSeasonStart } from "./season-trades";

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,95}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class SeasonError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const reject = (status: number, code: string, message: string): never => { throw new SeasonError(status, code, message); };
export function seasonErrorResponse(error: unknown) {
  if (error instanceof SeasonError) return NextResponse.json({ ok: false, error: { code: error.code, message: error.message } }, { status: error.status });
  console.error("[bots season]", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ ok: false, error: { code: "UNAVAILABLE", message: "The season could not load. Please try again." } }, { status: 503 });
}
export function requireSeason(): string {
  if (process.env.BOTS_SEASON_V1 !== "1") return reject(404, "NOT_OPEN", "The new season is not open yet.");
  const id = process.env.BOTS_SEASON_ID;
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$/.test(id)) return reject(503, "NOT_CONFIGURED", "The new season is being set up.");
  return id;
}
function dbError(error: { code?: string; message: string }): never {
  if (error.code === "P0001") { const [code, message] = error.message.split("|"); return reject(409, code || "CONFLICT", message || "Refresh this season and try again."); }
  return reject(503, "UNAVAILABLE", "The season is being set up. Your collection is safe.");
}
async function rpc<T>(db: BotsDb, name: string, values: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, values); if (r.error) return dbError(r.error); return r.data as T; }
function object(raw: unknown, keys: string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(k => k !== "t" && !keys.includes(k))) return reject(400, "INVALID_REQUEST", "Check this request and try again.");
  return raw as Record<string, unknown>;
}
function requestId(value: unknown) { if (typeof value !== "string" || !ID.test(value)) return reject(400, "INVALID_REQUEST_ID", "Try that button again."); return value; }
function uuid(value: unknown) { if (typeof value !== "string" || !UUID.test(value)) return reject(400, "INVALID_ID", "Choose a saved robot or fight."); return value; }
export const parseSeasonEnroll = (raw: unknown) => { const b = object(raw, ["requestId"]); return { requestId: requestId(b.requestId) }; };
export function parseSeasonDraft(raw: unknown) {
  const b = object(raw, ["requestId", "revision", "name", "parts", "defensePlan"]), parts = object(b.parts, [...SEASON_SOCKETS]);
  if (!Number.isSafeInteger(b.revision) || Number(b.revision) < 0 || typeof b.name !== "string" || b.name.trim().length < 1 || b.name.trim().length > 32 || !["early", "balanced", "last-stand"].includes(String(b.defensePlan))) return reject(400, "INVALID_DRAFT", "Name your robot and choose its parts.");
  const choices: SeasonDraft["parts"] = {};
  for (const slot of SEASON_SOCKETS) {
    if (parts[slot] == null) continue;
    const card = typeof parts[slot] === "string" ? cardV6(parts[slot] as string) : null;
    const kind = slot.startsWith("arm") ? "arms" : slot.startsWith("leg") ? "legs" : slot;
    if (!card || card.slot !== kind) return reject(400, "INVALID_PART", "Choose an available part for each place.");
    choices[slot] = card.id;
  }
  return { requestId: requestId(b.requestId), revision: b.revision as number, draft: { name: b.name.trim(), parts: choices, defensePlan: b.defensePlan as DefensePlan } };
}
export function parseSeasonFinish(raw: unknown) { const b = object(raw, ["requestId", "revision"]); if (!Number.isSafeInteger(b.revision) || Number(b.revision) < 0) return reject(400, "INVALID_REVISION", "Refresh your build first."); return { requestId: requestId(b.requestId), revision: Number(b.revision) }; }
export function parseSeasonStart(raw: unknown): SeasonStartInput {
  const b = object(raw, ["requestId", "mode", "botId", "targetBotId"]);
  if (!["ranked", "direct", "house", "loaner", "exhibition"].includes(String(b.mode))) return reject(400, "INVALID_MODE", "Choose a fight.");
  if (b.mode === "loaner" && (b.botId !== undefined || b.targetBotId !== undefined)) return reject(400, "INVALID_LOANER", "The Workshop loaner fights house robots.");
  if (!["direct", "exhibition"].includes(String(b.mode)) && b.targetBotId !== undefined) return reject(400, "INVALID_TARGET", "The arena chooses this opponent.");
  return { requestId: requestId(b.requestId), mode: b.mode as SeasonStartInput["mode"], ...(b.mode !== "loaner" ? { botId: uuid(b.botId) } : {}), ...(b.targetBotId !== undefined ? { targetBotId: uuid(b.targetBotId) } : {}) };
}
export function parseSeasonInput(raw: unknown) { const b = object(raw, ["inputId", "kind"]); if (b.kind !== "special") return reject(400, "INVALID_INPUT", "Use Special when it is ready."); return { inputId: requestId(b.inputId), kind: "special" as const }; }
export function parseSeasonRepair(raw: unknown) { const b = object(raw, ["requestId", "quoteId"]); if (typeof b.quoteId !== "string" || b.quoteId.length > 2048) return reject(400, "INVALID_QUOTE", "Open a new repair quote."); return { requestId: requestId(b.requestId), quoteId: b.quoteId }; }
export function parseSeasonDefense(raw: unknown) { const b = object(raw, ["requestId", "defensePlan"]); if (!["early", "balanced", "last-stand"].includes(String(b.defensePlan))) return reject(400, "INVALID_PLAN", "Choose Early, Balanced, or Last stand."); return { requestId: requestId(b.requestId), defensePlan: b.defensePlan as DefensePlan }; }
export function parseArchiveBuy(raw: unknown) { const b = object(raw, ["requestId", "cardId"]); if (typeof b.cardId !== "string" || !cardV6(b.cardId)) return reject(400, "INVALID_PART", "Choose an available collection part."); return { requestId: requestId(b.requestId), cardId: b.cardId }; }
export function parseArchiveBuild(raw: unknown) { const b = object(raw, ["requestId", "name", "parts"]); const draft = parseSeasonDraft({ ...b, revision: 0, defensePlan: "balanced" }); return { requestId: draft.requestId, name: draft.draft.name, parts: draft.draft.parts, build: seasonBuild(draft.draft.parts) }; }

type SeasonRow = { id: string; name: string; starts_at: string; ends_at: string; rules_version: string; enabled: boolean };
type PlayerRow = { wallet: string; coins: number; rating: number; wins: number; losses: number; draft: SeasonDraft };
type BotRow = { id: string; season_id: string; wallet: string; name: string; build: BuildV6; gp: number; defense_plan: DefensePlan; wins: number; losses: number; defense_wins: number; defense_losses: number; archived_at: string | null; repair_until: string | null; protected_until: string | null };
export interface SeasonMatchRow { id: string; season_id: string; wallet: string; bot_id: string | null; mode: SeasonMatch["mode"]; requested_mode: SeasonMatch["mode"]; revision: number; status: SeasonMatch["status"] | "preparing"; started_at: string; seed: number; builds: [BuildV6, BuildV6]; plans: [DefensePlan, DefensePlan]; identities: SeasonMatch["identities"]; rules: Record<string, unknown>; state: StateV6 | null; input_receipts: SeasonInputReceipt[]; result: unknown; settlement: SeasonMatch["settlement"] }
function phase(row: SeasonRow, now: number): SeasonInfo { return { id: row.id, name: row.name, startsAt: row.starts_at, endsAt: row.ends_at, rulesVersion: row.rules_version, phase: now < Date.parse(row.starts_at) ? "upcoming" : now >= Date.parse(row.ends_at) ? "ended" : "current" }; }
const signingKey = () => { const key = process.env.BOTS_SEASON_QUOTE_SECRET; if (key && key.length >= 24) return key; if (process.env.NODE_ENV !== "production") return "local-season-quote-preview-only"; return reject(503, "NOT_CONFIGURED", "Repair quotes are being set up."); };
function signQuote(payload: Record<string, unknown>) { const text = Buffer.from(JSON.stringify(payload)).toString("base64url"); return `${text}.${createHmac("sha256", signingKey()).update(text).digest("base64url")}`; }
export function readRepairQuote(token: string, season: string, wallet: string, botId: string) {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return reject(400, "INVALID_QUOTE", "Open a fresh repair quote.");
  const expected = createHmac("sha256", signingKey()).update(body).digest(), provided = Buffer.from(signature, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return reject(400, "INVALID_QUOTE", "Open a fresh repair quote.");
  let value: Record<string, unknown>; try { value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return reject(400, "INVALID_QUOTE", "Open a fresh repair quote."); }
  if (value.season !== season || value.wallet !== wallet || value.botId !== botId) return reject(400, "INVALID_QUOTE", "This quote belongs to a different robot.");
  return { ...value, quoteId: token };
}
function repairQuote(row: BotRow, now: number): RepairQuote | null {
  if (!row.repair_until || Date.parse(row.repair_until) <= now || row.archived_at) return null;
  const value = { season: row.season_id, wallet: row.wallet, botId: row.id, coins: repairPrice(row.gp, Date.parse(row.repair_until), now), readyAt: row.repair_until, quotedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30_000).toISOString() };
  return { ...value, quoteId: signQuote(value) };
}
function botView(row: BotRow, now: number, rating: number, archived = false): SeasonBot { return { id: row.id, seasonId: row.season_id, name: row.name, build: row.build, gp: row.gp, defensePlan: row.defense_plan,
  archived: archived || !!row.archived_at, wins: row.wins, losses: row.losses, rating, defenseWins: row.defense_wins, defenseLosses: row.defense_losses,
  repairUntil: row.repair_until, ready: !row.repair_until || Date.parse(row.repair_until) <= now, protectedUntil: row.protected_until, repairQuote: archived ? null : repairQuote(row, now) }; }
export async function seasonState(db: BotsDb, wallet: string, now = Date.now()): Promise<SeasonStateResponse> {
  const id = requireSeason(), day = new Date(now).toISOString().slice(0, 10);
  const s = await db.from("mk6_seasons").select("*").eq("id", id).maybeSingle(); if (s.error) return dbError(s.error);
  if (!s.data || !s.data.enabled) return reject(503, "NOT_CONFIGURED", "The next season is being set up.");
  const season = s.data as SeasonRow;
  const sources = await seasonTradeReadiness(db, wallet, season.starts_at);
  const results = await Promise.all([
    db.from("mk6_players").select("*").eq("season_id", id).eq("wallet", wallet).maybeSingle(),
    db.from("mk6_bots").select("*").eq("wallet", wallet).order("created_at"),
    db.from("mk6_days").select("*").eq("season_id", id).eq("wallet", wallet).eq("day", day).maybeSingle(),
    db.from("mk6_matches").select("id").eq("season_id", id).eq("wallet", wallet).neq("status", "complete").maybeSingle(),
    db.from("mk6_trade_facts").select("canonical_key").eq("wallet", wallet).eq("day", day).eq("completed", true).gte("usd_micros", 10_000_000).limit(1),
    db.rpc("mk6_collection_view", { p_wallet: wallet }),
    db.from("mk6_matches").select("id,wallet,bot_id,target_bot_id,mode,identities,settlement").eq("season_id", id).eq("wallet", wallet).eq("status", "complete").order("started_at", { ascending: false }).limit(12),
    db.from("mk6_matches").select("id,wallet,bot_id,target_bot_id,mode,identities,settlement").eq("season_id", id).eq("target_wallet", wallet).eq("status", "complete").order("started_at", { ascending: false }).limit(12),
    db.rpc("mk6_standings", { p_season: id }),
    db.rpc("mk6_rivalries", { p_season: id, p_wallet: wallet }),
  ]);
  for (const r of results) if (r.error) return dbError(r.error);
  const p = results[0].data as PlayerRow | null, bots = results[1].data as BotRow[], d = results[2].data;
  const dayIndex = Math.floor(now / 86_400_000), sorted = [...V6_CATALOG].sort((a, b) => fnv1a(`${dayIndex}:${a.id}`) - fnv1a(`${dayIndex}:${b.id}`));
  const shop = sorted.slice(0, 16).map(card => ({ id: card.id, name: card.name, slot: card.slot, tier: card.tier, gp: card.gp, coins: seasonalPartPrice(card.tier, card.slot), available: true }));
  const history = [...(results[6].data ?? []), ...(results[7].data ?? [])].sort((a, b) => Date.parse(b.settlement.finishedAt) - Date.parse(a.settlement.finishedAt)).slice(0, 16).map(h => ({
    id: h.id, mode: h.mode, attackerName: h.identities[0].name, defenderName: h.identities[1].name, attackerBotId: h.bot_id, defenderBotId: h.target_bot_id,
    viewerSide: (h.wallet === wallet ? 0 : 1) as 0 | 1, winner: h.settlement.winner, finishedAt: h.settlement.finishedAt, revengeBotId: h.wallet !== wallet && h.settlement.winner === 0 ? h.bot_id : null,
  }));
  const currentPhase = phase(season, now);
  return { ok: true, readiness: "ready", enrollment: p ? "enrolled" : "not-enrolled", season: phase(season, now), starterCoins: 250,
    player: p ? { wallet, coins: Number(p.coins), spendable: Math.max(0, Number(p.coins)), correctionDue: Math.max(0, -Number(p.coins)), rating: p.rating, wins: p.wins, losses: p.losses, draft: p.draft } : null,
    roster: bots.filter(b => b.season_id === id && !b.archived_at && currentPhase.phase !== "ended").map(b => botView(b, now, p?.rating ?? 1000)), archive: bots.filter(b => b.season_id !== id || b.archived_at || currentPhase.phase === "ended").map(b => botView(b, now, 1000, true)),
    daily: { day, completions: d?.completions ?? 0, rewardedCompletions: d?.rewarded ?? 0, remainingRewards: Math.max(0, 12 - (d?.rewarded ?? 0)), playCoins: d?.play_coins ?? 0, goalAt: 6, goalCoins: 100, goalClaimed: (d?.rewarded ?? 0) >= 6, tradeBonus: d?.trade_bonus ?? 0, directRated: d?.direct_rated ?? 0, defensiveRankLoss: d?.defense_loss ?? 0 },
    shop, tradeBonus: { requiredUsd: 10, percent: 50, dailyCap: 500, unlocked: !!results[4].data?.length, earned: d?.trade_bonus ?? 0, sources,
      message: sources.mcp === "ready" || sources.strategies === "ready" ? "One checked trade of $10 or more adds 50% to today's play coins, up to 500 extra coins." : "Trade checks are not ready yet. You can still earn all 1,000 daily play coins." },
    activeMatchId: results[3].data?.id ?? null, collections: results[5].data ?? [], history, standings: results[8].data ?? [], rivalries: results[9].data ?? [] };
}
export async function enrollSeason(db: BotsDb, wallet: string, input: { requestId: string }) { const id = requireSeason(); await rpc(db, "mk6_enroll", { p_season: id, p_wallet: wallet, p_request: input.requestId }); return seasonState(db, wallet); }
export async function saveSeasonDraft(db: BotsDb, wallet: string, input: ReturnType<typeof parseSeasonDraft>) { const id = requireSeason(); const draft = await rpc<SeasonDraft>(db, "mk6_save_draft", { p_season: id, p_wallet: wallet, p_request: input.requestId, p_revision: input.revision, p_draft: input.draft }); return { ok: true as const, draft }; }
export function seasonBuild(parts: SeasonDraft["parts"]): BuildV6 {
  const selected = SEASON_SOCKETS.map(slot => { const card = cardV6(parts[slot] ?? ""); if (!card) return reject(400, "INCOMPLETE_BUILD", "Choose all seven parts first."); return { id: card.id, s: [...card.s] as [number, number, number] }; });
  try { return snapshotBuildV6(modularBuild(selected[0], selected[1], selected[2], selected[3], selected[4], selected[5], selected[6])); } catch { return reject(400, "INCOMPATIBLE_BUILD", "This weapon needs its matching Tier 3 or Tier 4 body."); }
}
export async function finishSeasonBot(db: BotsDb, wallet: string, input: ReturnType<typeof parseSeasonFinish>) {
  const id = requireSeason();
  // A retry after the successful Finish must find its receipt before reading the newly empty draft.
  const old = await db.from("mk6_receipts").select("kind,payload,result").eq("season_id", id).eq("wallet", wallet).eq("request_id", input.requestId).maybeSingle();
  if (old.error) return dbError(old.error); if (old.data) { if (old.data.kind !== "finish" || old.data.payload.revision !== input.revision) return reject(409, "REQUEST_CONFLICT", "This request was already used."); return { ok: true as const, bot: old.data.result }; }
  const p = await db.from("mk6_players").select("draft").eq("season_id", id).eq("wallet", wallet).maybeSingle(); if (p.error) return dbError(p.error); if (!p.data) return reject(409, "NOT_ENROLLED", "Join this season first.");
  const bot = await rpc(db, "mk6_finish_bot", { p_season: id, p_wallet: wallet, p_request: input.requestId, p_revision: input.revision, p_id: randomUUID(), p_build: seasonBuild(p.data.draft.parts) });
  return { ok: true as const, bot };
}

const canonical = (value: unknown): string => value && typeof value === "object" ? Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(value);
const savedRules = () => ({ ...SEASON_RULES, engine: RULES_V6 });
export function advanceSeasonSnapshot(row: SeasonMatchRow, now: number, input?: ReturnType<typeof parseSeasonInput>) {
  if (canonical(row.rules) !== canonical(savedRules())) return reject(503, "RULES_UNAVAILABLE", "This replay needs its saved combat rules.");
  const state = row.state ? structuredClone(row.state) : createFightV6(row.seed, row.builds[0], row.builds[1], { autoSpecial: [false, true], defensePlans: row.plans });
  const receipts = row.input_receipts.slice(), previous = input && receipts.find(r => r.inputId === input.inputId);
  const tick = Math.max(state.frame, Math.min(MAX_FRAMES_V6, Math.max(0, Math.floor((now - Date.parse(row.started_at)) * FPS_V6 / 1000))));
  if (!state.done) advanceFightV6(state, tick);
  let receipt = previous;
  if (input && !previous) {
    if (receipts.length >= 256) return reject(429, "TOO_MANY_INPUTS", "You can still watch this fight. Wait before pressing again.");
    const result = acceptSpecialV6(state, { id: input.inputId, who: 0, kind: "special", frame: state.frame });
    receipt = { inputId: input.inputId, kind: "special", frame: state.frame, accepted: result.accepted, ...(result.reason ? { reason: result.reason } : {}) }; receipts.push(receipt);
  }
  return { state, receipts, receipt, changed: !row.state || state.frame !== row.state.frame || receipts.length !== row.input_receipts.length };
}
function matchView(row: SeasonMatchRow, now: number): SeasonMatch {
  if (!row.state || row.status === "preparing") return reject(503, "MATCH_PREPARING", "Your fight is getting ready. Try again.");
  return { id: row.id, seasonId: row.season_id, botId: row.bot_id, mode: row.mode, requestedMode: row.requested_mode, revision: row.revision, engineVersion: 6, status: row.status,
    serverNow: now, startedAt: row.started_at, tick: row.state.frame, builds: row.builds, state: row.state, rules: row.rules, inputs: row.input_receipts, identities: row.identities, result: row.result, settlement: row.settlement };
}
export async function resumeSeasonMatch(db: BotsDb, wallet: string, matchId: string, input?: ReturnType<typeof parseSeasonInput>, now = Date.now()): Promise<SeasonMatchResponse> {
  requireSeason(); uuid(matchId);
  for (let attempt = 0; attempt < 6; attempt++) {
    const read = await db.from("mk6_matches").select("*").eq("id", matchId).eq("wallet", wallet).maybeSingle(); if (read.error) return dbError(read.error);
    if (!read.data) {
      const defense = await db.from("mk6_matches").select("*").eq("id", matchId).eq("target_wallet", wallet).eq("status", "complete").maybeSingle();
      if (defense.error) return dbError(defense.error);
      if (!defense.data) return reject(404, "MATCH_NOT_FOUND", "This fight is not in your season.");
      if (input) return reject(403, "ATTACKER_ONLY", "You can watch this replay. Only the attacker chooses Special during the fight.");
      return { ok: true, session: { ...matchView(defense.data as SeasonMatchRow, now), viewerSide: 1 } };
    }
    let row = read.data as SeasonMatchRow;
    const id = row.season_id;
    if (row.status === "complete") { const receipt = input && row.input_receipts.find(r => r.inputId === input.inputId); return { ok: true, session: matchView(row, now), ...(receipt ? { input: receipt } : {}) }; }
    const next = advanceSeasonSnapshot(row, now, input);
    if (next.changed) { const saved = await rpc<SeasonMatchRow | null>(db, "mk6_match_cas", { p_season: id, p_wallet: wallet, p_id: matchId, p_revision: row.revision, p_state: next.state, p_receipts: next.receipts }); if (!saved) continue; row = saved; }
    if (row.status === "settlement-pending") {
      const since = await oldestSeasonStart(db, row.started_at);
      await syncSeasonTrades(db, wallet, since);
      const settled = await db.rpc("mk6_settle_match", { p_season: id, p_wallet: wallet, p_id: matchId, p_result: resultV6(row.state!) });
      if (!settled.error && settled.data) row = settled.data as SeasonMatchRow;
      // A failed settlement stays pending and retries atomically on the next resume.
    }
    return { ok: true, session: matchView(row, now), ...(next.receipt ? { input: next.receipt } : {}) };
  }
  return reject(409, "MATCH_UPDATING", "This fight is updating in another window. Try again.");
}
export async function startSeasonMatch(db: BotsDb, wallet: string, input: SeasonStartInput, now = Date.now()): Promise<SeasonMatchResponse> {
  const id = requireSeason(), matchId = randomUUID(), salt = fightSalt();
  let gp = 100;
  if (input.botId) { const b = await db.from("mk6_bots").select("gp").eq("id", input.botId).eq("season_id", id).eq("wallet", wallet).maybeSingle(); if (b.error) return dbError(b.error); if (b.data) gp = b.data.gp; }
  const tiers = [100, 200, 350, 500]; let tier = 1; for (let n = 1; n < 4; n++) if (Math.abs(tiers[n] - gp) < Math.abs(tiers[tier - 1] - gp)) tier = n + 1;
  const seed = fnv1a(`${matchId}|${salt}`), styles = ["tank", "speed", "ranged"] as const;
  const row = await rpc<SeasonMatchRow>(db, "mk6_start_match", { p_season: id, p_wallet: wallet, p_request: input.requestId, p_id: matchId, p_seed: seed,
    p_payload: input, p_house: presetV6(styles[seed % 3], tier as 1 | 2 | 3 | 4), p_loaner: presetV6("tank", 1), p_rules: savedRules() });
  return resumeSeasonMatch(db, wallet, row.id, undefined, now);
}
export async function repairSeasonBot(db: BotsDb, wallet: string, botId: string, input: ReturnType<typeof parseSeasonRepair>) { const id = requireSeason(); uuid(botId); const quote = readRepairQuote(input.quoteId, id, wallet, botId); const repair = await rpc(db, "mk6_repair", { p_season: id, p_wallet: wallet, p_request: input.requestId, p_bot: botId, p_quote: quote }); return { ok: true as const, repair }; }
export async function setSeasonDefense(db: BotsDb, wallet: string, botId: string, input: ReturnType<typeof parseSeasonDefense>) { const id = requireSeason(); uuid(botId); const bot = await rpc(db, "mk6_defense_plan", { p_season: id, p_wallet: wallet, p_request: input.requestId, p_bot: botId, p_plan: input.defensePlan }); return { ok: true as const, bot }; }
export async function checkSeasonTradeBonus(db: BotsDb, wallet: string, _input: { requestId: string }) {
  const id = requireSeason(), p = await db.from("mk6_players").select("season_id").eq("season_id", id).eq("wallet", wallet).maybeSingle();
  if (p.error) return dbError(p.error); if (!p.data) return reject(409, "NOT_ENROLLED", "Join this season first.");
  await syncSeasonTrades(db, wallet, await oldestSeasonStart(db, new Date().toISOString()));
  return seasonState(db, wallet);
}
function archiveId(value: string) { if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$/.test(value)) return reject(400, "INVALID_COLLECTION", "Choose a saved collection."); return value; }
export async function buyArchivePart(db: BotsDb, wallet: string, collectionId: string, input: ReturnType<typeof parseArchiveBuy>) {
  requireSeason(); await rpc(db, "mk6_archive_buy", { p_season: archiveId(collectionId), p_wallet: wallet, p_request: input.requestId, p_card: input.cardId }); return seasonState(db, wallet);
}
export async function buildArchiveRobot(db: BotsDb, wallet: string, collectionId: string, input: ReturnType<typeof parseArchiveBuild>) {
  requireSeason(); await rpc(db, "mk6_archive_build", { p_season: archiveId(collectionId), p_wallet: wallet, p_request: input.requestId, p_id: randomUUID(), p_name: input.name, p_choices: input.parts, p_build: input.build }); return seasonState(db, wallet);
}
