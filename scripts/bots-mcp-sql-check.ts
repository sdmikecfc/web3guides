/** Isolated in-memory SQL only: never connects to Supabase, Reporter or a wallet. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const { PGlite } = require(process.env.BOTS_PGLITE_PATH || "@electric-sql/pglite");
const repoSql = path.join(__dirname, "sql", "bots-mcp-trades-v1.sql");
const migration = fs.readFileSync(process.env.MK_MCP_SQL_PATH || (fs.existsSync(repoSql) ? repoSql : path.join(__dirname, "bots-mcp-trades-v1.sql")), "utf8");
const db = new PGlite();
const query = async (sql: string, values: unknown[] = []) => db.query(sql, values);
const one = async (sql: string, values: unknown[] = []) => (await query(sql, values)).rows[0];
const address = (digit: string) => `0x${digit.repeat(40)}`;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const wallet = address("1"), otherWallet = address("2"), market = address("a"), tokenA = address("b"), tokenB = address("c");
const windowEnd = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
const windowStart = new Date(Date.parse(windowEnd) - 86400000).toISOString();
const executionAt = new Date(Date.parse(windowStart) + 4 * 3600000).toISOString();
const uint256Max = ((BigInt(1) << BigInt(256)) - BigInt(1)).toString();
let batchSequence = 1, checks = 0;
const nextBatchId = () => `10000000-0000-4000-8000-${(batchSequence++).toString().padStart(12, "0")}`;
const baseTrade = (n = 1) => ({ networkId: "eip155:1", txHash: tx(n), eventIndex: 0, sourceFillId: `fixture-fill-${n}`,
  wallet, marketAddress: market, tokenIn: tokenA, tokenOut: tokenB,
  amountIn: "123456789012345678901234567890", amountOut: "987654321098765432109876543210",
  executedAt: executionAt, usdValue: "1234.123456", valuationSource: "trusted-fixture-price",
  source: "doma_mcp", tool: "tokens.swap.v1", executionId: `fixture-execution-${n}`, orderId: null, strategyId: null,
  status: "finalized", revision: 1, correctionReason: null } as Record<string, any>);
const batch = (trades: Record<string, any>[], complete = true) => ({ schemaVersion: 1, batchId: nextBatchId(), windowStart, windowEnd, complete, trades });
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function asRole<T>(role: "service_role" | "anon" | "authenticated" | "doma_ai_ro", work: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE ${role}`);
  try { return await work(); } finally { await db.exec("RESET ROLE"); }
}
async function ingest(value: ReturnType<typeof batch>, payloadHash = hash(value)) {
  return asRole("service_role", async () => (await one("SELECT public.mk_mcp_ingest($1,$2,$3) AS receipt", [value.batchId, payloadHash, JSON.stringify(value)])).receipt);
}
const intakeSnapshot = async () => ({
  batches: (await query("SELECT * FROM public.mk_mcp_batches ORDER BY batch_id")).rows,
  fills: (await query("SELECT * FROM public.mk_mcp_fills ORDER BY network_id,tx_hash,event_index")).rows,
  history: (await query("SELECT * FROM public.mk_mcp_fill_history ORDER BY network_id,tx_hash,event_index,revision")).rows,
});
const existingSnapshot = async () => ({
  players: (await query("SELECT * FROM public.battle_bots_players ORDER BY wallet")).rows,
  ledger: (await query("SELECT * FROM public.battle_bots_ledger ORDER BY id")).rows,
  strategies: (await query("SELECT * FROM public.battle_bots_campaign_fills ORDER BY fill_id")).rows,
  functions: (await query("SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('bb_grant','bb_coin_balance') ORDER BY p.proname")).rows,
});
const reject = async (value: ReturnType<typeof batch>, code: "MK_MCP_CONFLICT" | "MK_MCP_REJECTED") => {
  const before = await intakeSnapshot();
  await assert.rejects(ingest(value), (error: any) => error.code === "P0001" && error.message.includes(code));
  assert.deepEqual(await intakeSnapshot(), before, "rejected batches must leave no partial receipt, fill or history");
};
const pass = (name: string) => { checks++; console.log(`PASS ${name}`); };

async function main() {
  await db.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE doma_ai_ro;
    CREATE TABLE public.battle_bots_players(wallet TEXT PRIMARY KEY,enlisted_at TIMESTAMPTZ NOT NULL,is_test BOOLEAN NOT NULL DEFAULT false,is_operator BOOLEAN NOT NULL DEFAULT false,coins NUMERIC NOT NULL DEFAULT 99);
    CREATE TABLE public.battle_bots_ledger(id INT PRIMARY KEY,wallet TEXT,coins NUMERIC,reason TEXT);
    CREATE TABLE public.battle_bots_campaign_fills(fill_id TEXT PRIMARY KEY,wallet TEXT,automation_source TEXT,coins NUMERIC);
    CREATE FUNCTION public.bb_coin_balance(TEXT) RETURNS JSONB LANGUAGE sql AS $$ SELECT '{"sentinel":"unchanged"}'::jsonb $$;
    CREATE FUNCTION public.bb_grant() RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'EXISTING GRANT MUST NEVER BE CALLED'; END $$;
  `);
  for (const [w, date, test, operator] of [
    [wallet, "2026-01-01", false, false], [otherWallet, "2026-01-01", false, false],
    [address("3"), new Date(Date.parse(windowEnd) + 86400000).toISOString(), false, false], [address("4"), "2026-01-01", true, false],
    [address("5"), "2026-01-01", false, true], ["not-a-wallet", "2026-01-01", false, false],
    [`0x${"A".repeat(40)}`, "2026-01-01", false, false],
  ]) await query("INSERT INTO public.battle_bots_players(wallet,enlisted_at,is_test,is_operator) VALUES($1,$2,$3,$4)", [w, date, test, operator]);
  await query("INSERT INTO public.battle_bots_ledger VALUES(1,$1,99,'existing-strategy-credit')", [wallet]);
  await query("INSERT INTO public.battle_bots_campaign_fills VALUES('fixture-fill-1',$1,'keeper',99)", [wallet]);
  const existing = await existingSnapshot();
  await db.exec(migration);
  assert.deepEqual(await existingSnapshot(), existing);
  assert.equal((await one("SELECT count(*)::int AS n FROM pg_class WHERE relname IN ('mk_mcp_markets','mk_mcp_batches','mk_mcp_fills','mk_mcp_fill_history') AND relrowsecurity")).n, 4);
  pass("additive mk_mcp objects preserve existing players, ledger, Strategies records and money functions");

  const watchlist = await asRole("doma_ai_ro", () => query("SELECT * FROM public.mk_mcp_watchlist ORDER BY wallet"));
  assert.deepEqual(watchlist.rows.map((r: any) => r.wallet), [wallet, otherWallet, address("3")]);
  for (const role of ["anon", "authenticated", "doma_ai_ro", "service_role"] as const) {
    const permissions = await one("SELECT has_function_privilege($1,'public.mk_mcp_ingest(uuid,text,jsonb)','EXECUTE') AS execute,has_table_privilege($1,'public.mk_mcp_watchlist','SELECT') AS watch,has_table_privilege($1,'public.mk_mcp_fills','INSERT,UPDATE,DELETE') AS write,has_table_privilege($1,'public.mk_mcp_fill_history','UPDATE,DELETE') AS history", [role]);
    assert.equal(permissions.execute, role === "service_role");
    assert.equal(permissions.watch, role === "service_role" || role === "doma_ai_ro");
    assert.equal(permissions.write, false); assert.equal(permissions.history, false);
  }
  await assert.rejects(asRole("doma_ai_ro", () => query("SELECT * FROM public.battle_bots_players")), /permission denied/);
  await assert.rejects(asRole("service_role", () => query("DELETE FROM public.mk_mcp_fill_history")), /permission denied/);
  for (const role of ["anon", "authenticated", "doma_ai_ro"] as const) await assert.rejects(asRole(role, () => one("SELECT public.mk_mcp_ingest($1,$2,$3)", [nextBatchId(), "a".repeat(64), "{}"])), /permission denied/);
  pass("watchlist is canonical and read-only; RPC is service-only; anonymous/authenticated and history edits are denied");

  await query("INSERT INTO public.mk_mcp_markets(network_id,market_address,token_a,token_b,enabled) VALUES('eip155:1',$1,$2,$3,true)", [market, tokenA, tokenB]);
  const trade = baseTrade(), first = batch([trade]), receipt = await ingest(first);
  assert.deepEqual(receipt, { ok: true, batchId: first.batchId, inserted: 1, updated: 0, duplicates: 0, received: 1, coinsAwarded: 0, status: "recorded", replayed: false });
  const stored = await one("SELECT usd_value::text AS usd,executed_at,payload FROM public.mk_mcp_fills");
  assert.equal(stored.usd, "1234.123456"); assert.deepEqual(stored.payload, trade);
  assert.equal(new Date(stored.executed_at).toISOString(), trade.executedAt);
  assert.equal((await one("SELECT count(*)::int AS n FROM pg_indexes WHERE indexname='mk_mcp_fills_wallet_executed_idx'")).n, 1);
  assert.equal(stored.payload.amountIn, "123456789012345678901234567890");
  const afterFirst = await intakeSnapshot();
  assert.deepEqual(await ingest(first), { ...receipt, replayed: true });
  assert.deepEqual(await intakeSnapshot(), afterFirst);
  await assert.rejects(ingest(first, "f".repeat(64)), /MK_MCP_CONFLICT/);
  await assert.rejects(ingest({ ...first, complete: false }, hash(first)), /MK_MCP_CONFLICT/);
  assert.deepEqual(await intakeSnapshot(), afterFirst);
  const duplicateReceipt = await ingest(batch([trade]));
  assert.equal(duplicateReceipt.duplicates, 1); assert.equal(duplicateReceipt.inserted, 0);
  assert.equal((await intakeSnapshot()).history.length, 1);
  pass("exact decimal/raw amount storage, receipt replay, conflicting batch IDs and cross-batch fill retries");

  await reject(batch([baseTrade(2), { ...baseTrade(2), sourceFillId: "different-source-id" }]), "MK_MCP_REJECTED");
  await reject(batch([baseTrade(2), { ...baseTrade(3), sourceFillId: baseTrade(2).sourceFillId }]), "MK_MCP_REJECTED");
  await reject(batch([{ ...baseTrade(3), sourceFillId: trade.sourceFillId }]), "MK_MCP_CONFLICT");
  await reject(batch([{ ...baseTrade(2), revision: 2, correctionReason: "out of order" }]), "MK_MCP_CONFLICT");
  await reject(batch([{ ...baseTrade(2), status: "reverted" }]), "MK_MCP_CONFLICT");
  pass("duplicate economic/source keys and non-finalized or out-of-order first observations cannot enter intake");

  await query("INSERT INTO public.mk_mcp_markets(network_id,market_address,token_a,token_b) VALUES('eip155:1',$1,$2,$3)", [address("d"), tokenA, tokenB]);
  await assert.rejects(query("INSERT INTO public.mk_mcp_markets(network_id,market_address,token_a,token_b,domain_name,enabled) VALUES('eip155:1',$1,$2,$3,'another-domain.test',true)", [address("e"), tokenA, tokenB]), /check constraint/);
  await assert.rejects(query("INSERT INTO public.mk_mcp_markets(network_id,market_address,token_a,token_b) VALUES('eip155:1',$1,$2,$3)", [address("0"), tokenA, tokenB]), /check constraint/);
  assert.deepEqual((await asRole("doma_ai_ro", () => query("SELECT market_address FROM public.mk_mcp_markets ORDER BY market_address"))).rows.map((row: any) => row.market_address), [market], "AI reads only enabled gochujang markets");
  assert.equal((await asRole("service_role", () => one("SELECT count(*)::int AS n FROM public.mk_mcp_markets"))).n, 2);
  await assert.rejects(asRole("doma_ai_ro", () => query("UPDATE public.mk_mcp_markets SET enabled=true")), /permission denied/);
  await assert.rejects(asRole("anon", () => query("SELECT * FROM public.mk_mcp_markets")), /permission denied/);
  for (const change of [
    { wallet: address("9") }, { wallet: address("3") }, { wallet: address("4") }, { wallet: address("5") },
    { marketAddress: address("9") }, { marketAddress: address("d") }, { marketAddress: address("e") }, { tokenOut: address("9") },
    { executedAt: new Date(Date.parse(windowStart) - 1).toISOString() }, { executedAt: windowEnd },
    { executedAt: "2026-02-30T04:00:00.000Z" }, { executedAt: "2026-09-10T04:00:00+00:00" },
    { usdValue: "1.2" }, { usdValue: "1e6" }, { usdValue: "-1.000000" }, { usdValue: "01.000000" },
    { usdValue: 1234.123456 }, { usdValue: "0.000000" }, { usdValue: "1000000000000.000000" },
    { amountIn: "1.0" }, { amountIn: "0" }, { amountOut: (BigInt(uint256Max) + BigInt(1)).toString() },
    { eventIndex: -1 }, { eventIndex: "0" }, { eventIndex: 2147483648 }, { revision: 0 }, { revision: 2147483648 },
    { sourceFillId: "has spaces" }, { executionId: "e".repeat(161) }, { orderId: "o".repeat(161) }, { correctionReason: "r".repeat(241) },
    { tool: "defi.limitOrder.create.v1", orderId: null }, { txHash: tx(0) }, { wallet: address("0") }, { tokenOut: tokenA },
    { executedAt: executionAt.replace(":00.000Z", ":60.000Z") }, { executedAt: executionAt.replace(".000Z", ".000000Z") },
    { networkId: "eip155:1234567890123456" },
    { source: "keeper" }, { tool: "limit-order-intent-without-fill" }, { correctionReason: "" },
  ]) await reject(batch([{ ...baseTrade(2), ...change }]), "MK_MCP_REJECTED");
  const missing = baseTrade(2); delete missing.orderId;
  await reject(batch([missing]), "MK_MCP_REJECTED");
  const invalidWindow = batch([]); invalidWindow.windowEnd = invalidWindow.windowStart;
  await reject(invalidWindow, "MK_MCP_REJECTED");
  await reject({ ...batch([]), windowStart: new Date(Date.parse(windowStart) - 1).toISOString() }, "MK_MCP_REJECTED");
  await reject({ ...batch([]), windowStart: new Date(Date.now() + 120000).toISOString(), windowEnd: new Date(Date.now() + 180000).toISOString() }, "MK_MCP_REJECTED");
  await reject({ ...batch([]), unknownField: true } as any, "MK_MCP_REJECTED");
  await reject(batch(Array.from({ length: 501 }, (_, i) => baseTrade(1000 + i))), "MK_MCP_REJECTED");
  const reverse = baseTrade(2); reverse.tokenIn = tokenB; reverse.tokenOut = tokenA;
  assert.equal((await ingest(batch([reverse]))).inserted, 1);
  assert.equal((await ingest(batch([{ ...baseTrade(3), amountIn: uint256Max, tool: "defi.limitOrder.create.v1", orderId: "original-order:3" }]))).inserted, 1);
  pass("wallet enlistment/window, enabled gochujang market, both token directions and normalized fill validation");

  const revision2 = { ...trade, amountOut: "999999999999999999999999999999", usdValue: "999999999999.000001", valuationSource: "corrected-fixture-price", revision: 2, correctionReason: "Corrected pricing record" };
  assert.equal((await ingest(batch([revision2]))).updated, 1);
  assert.equal((await one("SELECT usd_value::text AS usd FROM public.mk_mcp_fills WHERE tx_hash=$1", [trade.txHash])).usd, revision2.usdValue);
  assert.equal((await ingest(batch([revision2]))).duplicates, 1);
  await reject(batch([{ ...revision2, usdValue: "7.000000" }]), "MK_MCP_CONFLICT");
  await reject(batch([trade]), "MK_MCP_CONFLICT");
  await reject(batch([{ ...revision2, revision: 4 }]), "MK_MCP_CONFLICT");
  await reject(batch([{ ...revision2, revision: 3, correctionReason: null }]), "MK_MCP_CONFLICT");
  for (const change of [
    { wallet: otherWallet }, { sourceFillId: "reassigned" }, { tokenIn: tokenB, tokenOut: tokenA },
    { executedAt: new Date(Date.parse(windowStart) + 5 * 3600000).toISOString() }, { tool: "agent.execute.v1" }, { executionId: "changed-execution" },
    { orderId: "changed-order" }, { strategyId: "changed-strategy" },
  ]) await reject(batch([{ ...revision2, ...change, revision: 3 }]), "MK_MCP_CONFLICT");
  // Owner-controlled fixture changes simulate later eligibility revocation; the RPC must not write either table.
  await query("UPDATE public.mk_mcp_markets SET enabled=false WHERE market_address=$1", [market]);
  await query("UPDATE public.battle_bots_players SET is_operator=true WHERE wallet=$1", [wallet]);
  const excludedSnapshot = await existingSnapshot();
  assert.equal((await ingest(batch([revision2]))).duplicates, 1);
  const reverted = { ...revision2, revision: 3, status: "reverted", usdValue: "0.000000", correctionReason: "Trusted producer reports reversal" };
  assert.equal((await ingest(batch([reverted]))).updated, 1);
  assert.deepEqual(await existingSnapshot(), excludedSnapshot, "retry/reversal never edits revoked wallet eligibility or rewards");
  await reject(batch([baseTrade(8)]), "MK_MCP_REJECTED");
  await query("UPDATE public.mk_mcp_markets SET enabled=true WHERE market_address=$1", [market]);
  await query("UPDATE public.battle_bots_players SET is_operator=false WHERE wallet=$1", [wallet]);
  const current = await one("SELECT status,revision,executed_at,payload FROM public.mk_mcp_fills WHERE tx_hash=$1", [trade.txHash]);
  assert.equal(current.status, "reverted"); assert.equal(current.revision, 3);
  assert.equal(new Date(current.executed_at).toISOString(), trade.executedAt, "indexed original execution time never changes during correction");
  const history = (await query("SELECT revision,payload FROM public.mk_mcp_fill_history WHERE tx_hash=$1 ORDER BY revision", [trade.txHash])).rows;
  assert.deepEqual(history.map((r: any) => r.payload), [trade, revision2, reverted]);
  pass("strict corrections/reverts retain attribution/history and remain possible after wallet/pool eligibility revocation");

  // The first fill is new; a later stale correction fails after the insertion branch.
  await reject(batch([baseTrade(10), { ...revision2, revision: 99 }]), "MK_MCP_CONFLICT");
  await db.exec(`CREATE FUNCTION public.mk_mcp_fixture_late_failure() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'sourceFillId'='fixture-fill-12' THEN RAISE EXCEPTION 'injected history failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER mk_mcp_fixture_late_failure BEFORE INSERT ON public.mk_mcp_fill_history FOR EACH ROW EXECUTE FUNCTION public.mk_mcp_fixture_late_failure();`);
  const beforeLateFailure = await intakeSnapshot();
  await assert.rejects(ingest(batch([baseTrade(11), baseTrade(12)])), /injected history failure/);
  assert.deepEqual(await intakeSnapshot(), beforeLateFailure);
  await db.exec("DROP TRIGGER mk_mcp_fixture_late_failure ON public.mk_mcp_fill_history; DROP FUNCTION public.mk_mcp_fixture_late_failure();");
  const empty = await ingest(batch([], true));
  assert.equal(empty.received, 0); assert.equal(empty.inserted, 0); assert.equal(empty.coinsAwarded, 0);
  assert.equal(empty.status, "recorded"); assert(!("verified" in empty));
  const afterWrites = await intakeSnapshot();
  await db.exec(migration);
  assert.deepEqual(await intakeSnapshot(), afterWrites);
  assert.deepEqual(await existingSnapshot(), existing);
  pass("late batch errors fully roll back; empty complete windows and migration reruns preserve all existing data");

  // Optional read-only role may be absent; the migration must not create it.
  await db.exec("DROP POLICY mk_mcp_markets_read ON public.mk_mcp_markets; REVOKE SELECT ON public.mk_mcp_watchlist,public.mk_mcp_markets FROM doma_ai_ro; DROP ROLE doma_ai_ro;");
  await db.exec(migration);
  assert.equal((await one("SELECT count(*)::int AS n FROM pg_roles WHERE rolname='doma_ai_ro'")).n, 0);
  assert.deepEqual(await existingSnapshot(), existing);
  pass("missing reporting role is left absent; no credential/role creation or rewards integration");
  console.log(JSON.stringify({ checks, failed: 0, coinsAwarded: 0, existingDataUnchanged: true, liveServices: false, physicalConcurrencyTested: false }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
