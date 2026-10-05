import "server-only";
import type { DashboardBattle, DashboardSource, DashboardTradingScope, DashboardView } from "@/lib/bots/dashboard-view";
import { BOT_COLS, nameTextOf, type BotRow } from "./bots";
import { type BotsDb, refuse } from "./db";
import { loadCoinBalance } from "./onboarding";
import { loadPlayer } from "./players";

type Row = Record<string, unknown>;
type Read = { data: Row[] | null; error: unknown; count?: number | null };
export interface LedgerRow { id?: unknown; coins: unknown; reason: unknown; meta?: unknown; created_at?: unknown }
const PAGE = 1000, MAX_ROWS = 5000;
const object = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const number = (v: unknown): number | null => (typeof v === "number" || typeof v === "string" && v.trim() !== "") && Number.isFinite(Number(v)) ? Number(v) : null;
const date = (v: unknown): string | null => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
const text = (v: unknown, fallback = ""): string => typeof v === "string" ? v.slice(0, 100) : fallback;
const money = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const absentTrade = (source: DashboardSource = "unavailable"): DashboardTradingScope => ({ source, countedUsd: null, tradeCoins: null, roiBonusCoins: null });

/** Exact count prevents a PostgREST row cap from silently becoming a lifetime total.
 * At most five pages, each selected as-of the request timestamp by the caller. */
async function scan(read: (from: number, to: number) => PromiseLike<Read>): Promise<{ source: DashboardSource; rows: Row[] }> {
  try {
    const first = await read(0, PAGE - 1);
    if (first.error || !Array.isArray(first.data) || !Number.isInteger(first.count) || first.count! < 0) return { source: "unavailable", rows: [] };
    const total = first.count!;
    if (total > MAX_ROWS) return { source: "partial", rows: first.data };
    const pages = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / PAGE) - 1) }, (_, i) => read((i + 1) * PAGE, (i + 2) * PAGE - 1)));
    if (pages.some(p => p.error || !Array.isArray(p.data))) return { source: "unavailable", rows: [] };
    const rows = [...first.data, ...pages.flatMap(p => p.data!)];
    return { source: rows.length === total ? "available" : "partial", rows };
  } catch { return { source: "unavailable", rows: [] }; }
}

/** The ledger is already deduplicated by (wallet, reason). Old/new fill reason
 * formats both count. Corrections change paid coins, never rewrite frozen USD. */
export function strategyLedger(rows: readonly LedgerRow[], source: DashboardSource): DashboardTradingScope {
  if (source !== "available") return absentTrade(source);
  let counted = 0, base = 0, bonus = 0, volumeKnown = true, coinsKnown = true, bonusKnown = true;
  const mcpDays = new Set(rows.filter(r => object(r.meta).automation_source === "doma_mcp").map(r => text(object(r.meta).day_key)));
  for (const row of rows) {
    const reason = text(row.reason), meta = object(row.meta), coins = number(row.coins);
    if (reason.startsWith("fill:")) {
      if (meta.automation_source === "doma_mcp") continue;
      if (coins == null) coinsKnown = false; else base += coins;
      if (reason.startsWith("fill:adjust:")) continue;
      const usd = number(meta.counted_usd);
      if (usd == null || usd < 0) volumeKnown = false; else counted += usd;
    } else if (reason.startsWith("roi:")) {
      // A historical mixed-source bonus cannot be allocated to Strategies by guessing.
      if (mcpDays.has(text(meta.day_key, reason.slice(4)))) { bonusKnown = false; continue; }
      if (coins == null) bonusKnown = false; else bonus += coins;
    }
  }
  return { source: volumeKnown && coinsKnown && bonusKnown ? "available" : "partial", countedUsd: volumeKnown ? money(counted) : null, tradeCoins: coinsKnown ? money(base) : null, roiBonusCoins: bonusKnown ? money(bonus) : null };
}

/** Money actually posted, separating own returned stakes from winnings. The
 * current ghost defender places no stake; its payout is entirely a win. */
export function battleLedger(rows: readonly LedgerRow[], source: DashboardSource): DashboardView["battles"]["coins"] {
  const empty = { source, rewards: null, stakeReturned: null, stakeWon: null, houseBonus: null, stakeSpent: null, net: null };
  if (source !== "available") return empty;
  let rewards = 0, returned = 0, won = 0, bonus = 0, spent = 0, net = 0, splitKnown = true;
  const holds = new Map<string, number>();
  for (const row of rows) { const match = /^stake:(\d+):hold$/.exec(text(row.reason)), coins = number(row.coins); if (match && coins != null && coins < 0) holds.set(match[1], -coins); }
  for (const row of rows) {
    const reason = text(row.reason); if (!/^(battle:|stake:)/.test(reason)) continue;
    const coins = number(row.coins), meta = object(row.meta); if (coins == null) return { ...empty, source: "partial" };
    net += coins;
    if (reason.startsWith("battle:")) { rewards += coins; continue; }
    const match = /^stake:(\d+):(hold|refund|win)$/.exec(reason);
    if (!match) { splitKnown = false; continue; }
    if (match[2] === "hold") { spent -= coins; continue; }
    if (match[2] === "refund") { returned += coins; continue; }
    const ownStake = holds.get(match[1]) ?? 0;
    const extra = number(meta.houseBonus) ?? (meta.role === "defender" ? 0 : null);
    if (extra == null || extra < 0 || ownStake + extra > coins) { splitKnown = false; continue; }
    returned += ownStake; bonus += extra; won += coins - ownStake - extra;
  }
  return { source: splitKnown ? "available" : "partial", rewards: money(rewards), stakeReturned: splitKnown ? money(returned) : null, stakeWon: splitKnown ? money(won) : null, houseBonus: splitKnown ? money(bonus) : null, stakeSpent: money(spent), net: money(net) };
}

function recentBattle(row: Row, wallet: string, ledger: readonly LedgerRow[], ledgerSource: DashboardSource): DashboardBattle | null {
  const id = String(row.id), r = object(row.result);
  if (!/^\d{1,12}$/.test(id) || !["pve", "pvp"].includes(String(row.mode)) || !date(row.created_at)) return null;
  const mine = row.challenger_wallet === wallet ? 0 : row.defender_wallet === wallet ? 1 : null;
  if (mine == null) return null;
  const names = Array.isArray(r.names) ? r.names : [];
  const awards = ledger.filter(l => text(l.reason) === `battle:${id}:${mine === 0 ? "attacker" : "defender"}` || text(l.reason) === `stake:${id}:win`);
  let rewardCoins: number | null = ledgerSource === "available" ? 0 : null, payout: number | null = rewardCoins, house: number | null = rewardCoins;
  if (ledgerSource === "available") for (const award of awards) {
    const coins = number(award.coins); if (coins == null) { rewardCoins = payout = house = null; break; }
    if (text(award.reason).startsWith("battle:")) rewardCoins! += coins;
    else { payout! += coins; const meta = object(award.meta), extra = number(meta.houseBonus) ?? (meta.role === "defender" ? 0 : null); house = extra == null ? null : house == null ? null : house + extra; }
  }
  return { id, createdAt: String(row.created_at), mode: row.mode as "pve" | "pvp", difficulty: typeof row.difficulty === "string" ? row.difficulty : null,
    botName: text(names[mine], "Your robot"), opponentName: text(names[1 - mine], row.mode === "pve" ? "Game robot" : "Opponent"),
    outcome: r.winner === 0 || r.winner === 1 ? r.winner === mine ? "win" : "loss" : "unknown", replayUrl: `/bots/fight/${id}`, rewardCoins, stakePayout: payout, houseBonus: house };
}

export async function loadDashboard(db: BotsDb, wallet: string, now = new Date().toISOString()): Promise<DashboardView> {
  // Never accept an arbitrary wallet from a query/body. Only the verified session calls this.
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return refuse(401, "Sign in again.");
  const player = await loadPlayer(db, wallet); if (!player) return refuse(401, "Enlist first.");
  const out: DashboardView = { ok: true, wallet, updatedAt: now,
    coins: { source: "unavailable", balance: null, reserved: null, spendable: null },
    trading: { lifetime: { ...absentTrade(), since: date(player.enlisted_at), through: null }, campaign: { ...absentTrade(), id: null, title: null, startsAt: null, endsAt: null }, strategies: "available", mcp: "coming-soon" },
    battles: { source: "unavailable", scope: "lifetime-paid-fights", fought: null, wins: null, losses: null, coins: battleLedger([], "unavailable"), recent: [] },
    bestBot: { source: "unavailable", botId: null, name: null, wins: null, losses: null, level: null, total: null } };
  const battleQuery = () => db.from("battle_bots_battles").select("id", { count: "exact", head: true }).eq("status", "resolved").in("mode", ["pve", "pvp"]).eq("is_test", !!player.is_test).lte("created_at", now).or(`challenger_wallet.eq.${wallet},defender_wallet.eq.${wallet}`);
  const results = await Promise.allSettled([
    loadCoinBalance(db, wallet, player),
    scan((from, to) => db.from("battle_bots_ledger").select("id,coins,reason,meta,created_at", { count: "exact" }).eq("wallet", wallet).eq("is_test", !!player.is_test).lte("created_at", now).or("reason.like.fill:%,reason.like.roi:%,reason.like.battle:%,reason.like.stake:%").order("id", { ascending: false }).range(from, to)),
    battleQuery(), battleQuery().eq("winner_wallet", wallet),
    db.from("battle_bots_battles").select("id,mode,difficulty,challenger_wallet,defender_wallet,result,created_at").eq("status", "resolved").in("mode", ["pve", "pvp"]).eq("is_test", !!player.is_test).lte("created_at", now).or(`challenger_wallet.eq.${wallet},defender_wallet.eq.${wallet}`).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(10),
    db.from("battle_bots_bots").select(BOT_COLS).eq("wallet", wallet).eq("is_test", !!player.is_test).is("recycled_at", null).order("id", { ascending: true }).limit(5),
    (async () => { const columns = "id,title,status,starts_at,ends_at,created_at"; let result = await db.from("battle_bots_campaigns").select(columns).eq("status", "active").lte("starts_at", now).gt("ends_at", now).order("created_at", { ascending: false }).limit(1).maybeSingle(); if (!result.error && !result.data) result = await db.from("battle_bots_campaigns").select(columns).order("created_at", { ascending: false }).limit(1).maybeSingle(); return result; })(),
  ] as const);
  const balance = results[0]; if (balance.status === "fulfilled") { const b = balance.value; if ([b.total, b.reserved, b.spendable].every(Number.isFinite)) out.coins = { source: "available", balance: b.total, reserved: b.reserved, spendable: b.spendable }; }
  const ledger = results[1].status === "fulfilled" ? results[1].value : { source: "unavailable" as const, rows: [] };
  const ledgerRows = ledger.rows as unknown as LedgerRow[];
  const lastTradeGrant = ledgerRows.filter(row => /^(fill:|roi:)/.test(text(row.reason))).map(row => date(row.created_at)).filter((value): value is string => value != null).sort().at(-1) ?? null;
  out.trading.lifetime = { ...strategyLedger(ledgerRows, ledger.source), since: date(player.enlisted_at), through: ledger.source === "available" ? lastTradeGrant : null };
  out.battles.coins = battleLedger(ledgerRows, ledger.source);
  const count = results[2], wins = results[3];
  if (count.status === "fulfilled" && wins.status === "fulfilled" && !count.value.error && !wins.value.error && Number.isInteger(count.value.count) && Number.isInteger(wins.value.count) && count.value.count! >= wins.value.count!) out.battles = { ...out.battles, source: "available", fought: count.value.count, wins: wins.value.count, losses: count.value.count! - wins.value.count! };
  const history = results[4]; if (history.status === "fulfilled" && !history.value.error && Array.isArray(history.value.data)) out.battles.recent = history.value.data.map(row => recentBattle(row, wallet, ledgerRows, ledger.source)).filter((row): row is DashboardBattle => !!row); else if (out.battles.source === "available") out.battles.source = "partial";
  const bots = results[5]; if (bots.status === "fulfilled" && !bots.value.error && Array.isArray(bots.value.data)) {
    const best = (bots.value.data as BotRow[]).sort((a,b) => b.wins-a.wins || b.level-a.level || b.total-a.total || a.id-b.id)[0];
    out.bestBot = best ? { source: "available", botId: best.id, name: nameTextOf(best), wins: number(best.wins), losses: number(best.losses), level: number(best.level), total: number(best.total) } : { ...out.bestBot, source: "available" };
  }
  const campaign = results[6]; if (campaign.status === "fulfilled" && !campaign.value.error && campaign.value.data) {
    const c = campaign.value.data, id = String(c.id);
    const grants = await scan((from,to) => db.from("battle_bots_campaign_fills").select("fill_id,counted_usd,coins,created_at", { count: "exact" }).eq("wallet", wallet).eq("campaign_id", id).eq("automation_source", "keeper").lte("created_at", now).order("fill_id", { ascending: false }).range(from,to));
    const campaignLedger = ledgerRows.filter(row => object(row.meta).campaign_id === id);
    const bonus = strategyLedger(campaignLedger, ledger.source);
    let counted = 0, paid = 0, valid = grants.source === "available";
    for (const row of grants.rows) { const usd = number(row.counted_usd), coins = number(row.coins); if (usd == null || coins == null || usd < 0 || coins < 0) valid = false; else { counted += usd; paid += coins; } }
    out.trading.campaign = { source: valid && bonus.roiBonusCoins != null ? "available" : grants.source === "available" ? "partial" : grants.source,
      id, title: text(c.title, "Model Kombat"), startsAt: date(c.starts_at), endsAt: date(c.ends_at), countedUsd: valid ? money(counted) : null, tradeCoins: valid ? money(paid) : null, roiBonusCoins: bonus.roiBonusCoins };
  }
  return out;
}
