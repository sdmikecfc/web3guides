import assert from "node:assert/strict";
import Module from "node:module";
import type { LedgerRow } from "../src/app/bots/_server/dashboard";
import type { BotsDb } from "../src/app/bots/_server/db";

// This Node test runs the real route/server code without Next's bundler.
// Stub only its compile-time boundary marker, not React or database behavior.
const modules = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = modules._load;
modules._load = function(id, ...args) { return id === "server-only" ? {} : originalLoad.call(this,id,...args); };
const { battleLedger, loadDashboard, strategyLedger } = require("../src/app/bots/_server/dashboard") as typeof import("../src/app/bots/_server/dashboard");
const { GET } = require("../src/app/api/bots/dashboard/route") as typeof import("../src/app/api/bots/dashboard/route");
const { mintSession } = require("../src/app/bots/_server/session") as typeof import("../src/app/bots/_server/session");
modules._load = originalLoad;

const wallet = "0x" + "1".repeat(40), other = "0x" + "2".repeat(40), at = "2026-09-08T10:00:00.000Z";
const ledger: LedgerRow[] = [
  { coins: 2, reason: "fill:old-tx:leg", meta: { counted_usd: 2.4, day_key: "2026-09-07" } },
  { coins: 3, reason: "fill:new-tx:token:leg", meta: { counted_usd: 2.4, day_key: "2026-09-07", campaign_id: "active", automation_source: "keeper" } },
  { coins: -1, reason: `fill:adjust:${wallet}:2026-09-07`, meta: { from: 5, to: 4, day_key: "2026-09-07" } },
  { coins: 1, reason: "roi:2026-09-07", meta: { day_key: "2026-09-07", campaign_id: "active" } },
  { coins: 10, reason: "battle:1:attacker" },
  { coins: -100, reason: "stake:2:hold" },
  { coins: 250, reason: "stake:2:win", meta: { stake: 100, houseBonus: 50 } },
  { coins: -25, reason: "stake:3:hold" },
  { coins: 25, reason: "stake:3:refund" },
  { coins: 100, reason: "stake:4:win", meta: { stake: 100, role: "defender" } },
  { coins: 3, reason: "battle:4:defender" },
  { coins: -50, reason: "stake:5:hold" },
];
assert.deepEqual(strategyLedger(ledger, "available"), { source: "available", countedUsd: 4.8, tradeCoins: 4, roiBonusCoins: 1 });
assert.deepEqual(battleLedger(ledger, "available"), { source: "available", rewards: 13, stakeReturned: 125, stakeWon: 200, houseBonus: 50, stakeSpent: 175, net: 213 });
assert.equal(strategyLedger([{ coins: 12, reason: "fill:missing-metadata" }], "available").countedUsd, null);
assert.equal(strategyLedger(ledger, "partial").tradeCoins, null);
assert.equal(battleLedger(ledger, "unavailable").net, null);
const mixed = strategyLedger([...ledger, { coins: 20, reason: "fill:mcp", meta: { automation_source: "doma_mcp", counted_usd: 20, day_key: "2026-09-07" } }], "available");
assert.equal(mixed.countedUsd, 4.8); assert.equal(mixed.roiBonusCoins, null, "mixed-source bonus is not guessed to belong to Strategies");
console.log("PASS frozen strategy volume, old/new reasons, signed adjustments, bonus isolation, PvP stake returns/house bonus/ghost wins/refunds and net ledger coins");

type Row = Record<string, any>;
const rows: Record<string, Row[]> = {
  battle_bots_players: [{ id: 1, wallet, wallet_name: "Copper Otter", enlisted_at: "2026-09-01T00:00:00Z", coins: 99, is_test: false }],
  battle_bots_ledger: ledger.map((row, i) => ({ ...row, id: i + 1, wallet, is_test: false, created_at: "2026-09-07T12:00:00Z" })),
  battle_bots_battles: [
    { id: 1, mode: "pve", difficulty: "easy", challenger_wallet: wallet, defender_wallet: null, winner_wallet: wallet, status: "resolved", is_test: false, created_at: "2026-09-07T12:00:00Z", result: { names: ["Speedy Otter 7", "House robot"], winner: 0 } },
    { id: 6, mode: "pvp", challenger_wallet: other, defender_wallet: wallet, winner_wallet: other, status: "resolved", is_test: false, created_at: "2026-09-07T11:00:00Z", result: { names: ["Rival", "Speedy Otter 7"], winner: 0 } },
    { id: 99, mode: "spar", challenger_wallet: wallet, defender_wallet: null, winner_wallet: wallet, status: "resolved", is_test: false, created_at: "2026-09-07T10:00:00Z", result: {} },
  ],
  battle_bots_bots: [{ id: 4, wallet, is_test: false, recycled_at: null, name: "Speedy Otter 7", wins: 3, losses: 1, level: 2, total: 34 }],
  battle_bots_campaigns: [{ id: "active", title: "Test campaign", status: "active", starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-09-15T00:00:00Z", created_at: "2026-09-01T00:00:00Z" }],
  battle_bots_campaign_fills: [{ campaign_id: "active", wallet, fill_id: 7, automation_source: "keeper", counted_usd: 2.4, coins: 3, created_at: "2026-09-07T12:00:00Z" }],
};
let failedTable = "", oversized = false;
const queries: { table: string; filters: [string, unknown][] }[] = [];
class Query {
  data: Row[]; head = false; single = false; filters: [string, unknown][] = []; start = 0; end = Infinity;
  constructor(public table: string) { this.data = [...rows[table] ?? []]; queries.push(this); }
  select(_columns: string, options?: { head?: boolean }) { this.head = !!options?.head; return this; }
  eq(key: string, value: unknown) { this.filters.push([key,value]); this.data = this.data.filter(row => row[key] === value); return this; }
  is(key: string, value: unknown) { return this.eq(key, value); }
  in(key: string, values: unknown[]) { this.data = this.data.filter(row => values.includes(row[key])); return this; }
  lte(key: string, value: string) { this.data = this.data.filter(row => row[key] <= value); return this; }
  gt(key: string, value: string) { this.data = this.data.filter(row => row[key] > value); return this; }
  or(value: string) { if (value.startsWith("challenger_wallet")) { assert.equal(value, `challenger_wallet.eq.${wallet},defender_wallet.eq.${wallet}`); this.filters.push(["participants",wallet]); this.data = this.data.filter(row => row.challenger_wallet === wallet || row.defender_wallet === wallet); } return this; }
  order() { return this; }
  range(start: number, end: number) { this.start = start; this.end = end; return this; }
  limit(n: number) { this.end = n - 1; return this; }
  maybeSingle() { this.single = true; return this; }
  then(resolve: (v: any) => unknown, reject: (e: unknown) => unknown) { return Promise.resolve(this.table === failedTable ? { data: null, error: { message: "private backend error" }, count: null } : { data: this.head ? null : this.single ? this.data[0] ?? null : this.data.slice(this.start,this.end+1), error: null, count: oversized && this.table === "battle_bots_ledger" ? 5001 : this.data.length }).then(resolve,reject); }
}
const db = { from: (table: string) => new Query(table), rpc: () => Promise.resolve({ data: { total: 99, reserved: 25, spendable: 74 }, error: null }) } as unknown as BotsDb;
async function main() {
  const view = await loadDashboard(db, wallet, at);
  assert.equal(view.wallet, wallet); assert.equal(view.coins.spendable, 74);
  assert.equal(view.battles.fought, 2); assert.equal(view.battles.wins, 1); assert.equal(view.battles.losses, 1);
  assert.equal(view.battles.recent.length, 2); assert.equal(view.battles.recent[0].rewardCoins, 10);
  assert.equal(view.bestBot.botId, 4); assert.equal(view.trading.campaign.countedUsd, 2.4);
  assert.equal(view.trading.campaign.roiBonusCoins, 1); assert.equal(view.trading.mcp, "coming-soon");
  assert(!JSON.stringify(view).includes(other), "other participant wallet and private ledger metadata never leave the API");
  assert(queries.every(q => q.table === "battle_bots_campaigns" || q.filters.some(([key,value]) => ["wallet","participants"].includes(key) && value === wallet)), "every private query is restricted to the session wallet");
  failedTable = "battle_bots_ledger"; const unavailable = await loadDashboard(db, wallet, at);
  assert.equal(unavailable.trading.lifetime.countedUsd, null); assert.equal(unavailable.battles.coins.net, null); assert.equal(unavailable.coins.balance, 99);
  failedTable = ""; oversized = true; const limited = await loadDashboard(db, wallet, at);
  assert.equal(limited.trading.lifetime.source, "partial"); assert.equal(limited.trading.lifetime.tradeCoins, null);
  console.log("PASS self-only section reads, actual paid-fight counts/history, best bot, campaign scope, partial table failure and bounded-scan truncation");
  for (const token of [null,"forged",mintSession(wallet,false,Date.now()-24*3600*1000)]) {
    const response = await GET(new Request(`http://localhost/api/bots/dashboard?wallet=${other}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined));
    assert.equal(response.status, 401); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert(!JSON.stringify(await response.json()).includes(wallet));
  }
  console.log("PASS unsigned/forged/expired sessions rejected before database access; query wallet cannot select another account; private no-store responses");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
