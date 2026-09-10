/** HTTP handler + actual staged SQL, using only an ephemeral in-memory PGlite DB. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createMcpTradeHandlers } from "@/app/bots/_server/mcp-trade-intake";
import { parseMcpBatch } from "@/lib/bots/mcp-trades";
const { PGlite } = require(process.env.BOTS_PGLITE_PATH || "@electric-sql/pglite");
const sqlPath = process.env.MK_MCP_SQL_PATH || path.join(__dirname, "sql", "bots-mcp-trades-v1.sql");
const migration = fs.readFileSync(sqlPath, "utf8");
const db = new PGlite();
const query = async (sql: string, args: unknown[] = []) => db.query(sql, args);
const one = async (sql: string, args: unknown[] = []) => (await query(sql, args)).rows[0];
const TOKEN = "local-api-sql-test-" + "x".repeat(40), NOW = Date.parse("2026-09-11T12:00:00Z");
const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const wallet = address(1), market = address(10), tokenA = address(11), tokenB = address(12);
const fill = (id: number) => ({ networkId: "eip155:97477", txHash: `0x${id.toString(16).padStart(64, "0")}`, eventIndex: 0, sourceFillId: `api-fill-${id}`,
  wallet, marketAddress: market, tokenIn: tokenA, tokenOut: tokenB, amountIn: "123456789012345678901234567890", amountOut: "4567000",
  executedAt: "2026-09-10T09:30:00Z", usdValue: "12.34", valuationSource: "actual executed fixture fill", source: "doma_mcp", tool: "tokens.swap.v1",
  executionId: `api-exec-${id}`, orderId: null, strategyId: null, status: "finalized", revision: 1, correctionReason: null });
let sequence = 1, checks = 0, rpcCalls = 0;
const batch = (trades: unknown[]) => ({ schemaVersion: 1, batchId: `ad000000-0000-4000-8000-${String(sequence++).padStart(12,"0")}`,
  windowStart: "2026-09-10T09:00:00Z", windowEnd: "2026-09-10T10:00:00Z", complete: true, trades });
const handler = createMcpTradeHandlers({
  env: { MK_MCP_INGEST_ENABLED: "1", MK_MCP_INGEST_TOKEN: TOKEN }, now: () => NOW,
  db: (() => ({
    async rpc(name: string, args: { p_batch_id: string; p_payload_hash: string; p_batch: unknown }) {
      assert.equal(name, "mk_mcp_ingest"); rpcCalls++;
      await db.exec("SET ROLE service_role");
      try {
        const row = await one("SELECT public.mk_mcp_ingest($1::uuid,$2::text,$3::jsonb) AS receipt", [args.p_batch_id, args.p_payload_hash, JSON.stringify(args.p_batch)]);
        return { data: row.receipt, error: null };
      } catch (error) {
        const e = error as { message: string; code?: string }; return { data: null, error: { message: e.message, code: e.code } };
      } finally { await db.exec("RESET ROLE"); }
    },
  })) as never,
});
async function post(value: ReturnType<typeof batch>) {
  const response = await handler.POST(new Request("https://modelkombat.test/api/bots/trades/ingest", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(value) }));
  const body = await response.json(); assert.match(response.headers.get("cache-control") ?? "", /no-store/); return { status: response.status, body };
}
const snapshot = async () => ({
  batches: (await query("SELECT * FROM mk_mcp_batches ORDER BY batch_id")).rows,
  fills: (await query("SELECT * FROM mk_mcp_fills ORDER BY network_id,tx_hash,event_index")).rows,
  history: (await query("SELECT * FROM mk_mcp_fill_history ORDER BY network_id,tx_hash,event_index,revision")).rows,
});
const rewards = async () => ({
  players: (await query("SELECT * FROM battle_bots_players ORDER BY wallet")).rows,
  ledger: (await query("SELECT * FROM battle_bots_ledger ORDER BY id")).rows,
  strategies: (await query("SELECT * FROM battle_bots_campaign_fills ORDER BY fill_id")).rows,
});
const pass = (label: string) => { checks++; console.log(`PASS ${label}`); };
async function expectRollback(value: ReturnType<typeof batch>, status: number, code: string) {
  const before = await snapshot(), calls = rpcCalls, result = await post(value);
  assert.equal(result.status, status, JSON.stringify(result.body)); assert.equal(result.body.code, code); assert.equal(result.body.ok, false);
  assert.equal(rpcCalls, calls + 1, "valid HTTP shape must reach real SQL rejection");
  assert.deepEqual(await snapshot(), before, "SQL rejection cannot leave a receipt, fill, revision or updated payload");
}
async function main() {
  await db.exec(`
    CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE doma_ai_ro;
    CREATE TABLE battle_bots_players(wallet TEXT PRIMARY KEY,enlisted_at TIMESTAMPTZ,is_test BOOLEAN NOT NULL DEFAULT false,is_operator BOOLEAN NOT NULL DEFAULT false,coins NUMERIC NOT NULL);
    CREATE TABLE battle_bots_ledger(id INT PRIMARY KEY,wallet TEXT,coins NUMERIC,reason TEXT);
    CREATE TABLE battle_bots_campaign_fills(fill_id TEXT PRIMARY KEY,wallet TEXT,automation_source TEXT,coins NUMERIC);
    CREATE FUNCTION bb_grant() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Reward grant forbidden by API SQL fixture'; END $$;
  `);
  await query("INSERT INTO battle_bots_players VALUES($1,'2026-01-01',false,false,321)", [wallet]);
  await query("INSERT INTO battle_bots_ledger VALUES(1,$1,321,'existing credit')", [wallet]);
  await query("INSERT INTO battle_bots_campaign_fills VALUES('existing-strategy-fill',$1,'keeper',9)", [wallet]);
  await db.exec(`
    CREATE FUNCTION forbid_existing_writes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Existing game data cannot change during MCP intake'; END $$;
    CREATE TRIGGER freeze_players BEFORE INSERT OR UPDATE OR DELETE ON battle_bots_players FOR EACH STATEMENT EXECUTE FUNCTION forbid_existing_writes();
    CREATE TRIGGER freeze_ledger BEFORE INSERT OR UPDATE OR DELETE ON battle_bots_ledger FOR EACH STATEMENT EXECUTE FUNCTION forbid_existing_writes();
    CREATE TRIGGER freeze_strategies BEFORE INSERT OR UPDATE OR DELETE ON battle_bots_campaign_fills FOR EACH STATEMENT EXECUTE FUNCTION forbid_existing_writes();
  `);
  const previousRewards = await rewards();
  await db.exec(migration);
  await query("INSERT INTO mk_mcp_markets(network_id,market_address,token_a,token_b,domain_name,enabled) VALUES('eip155:97477',$1,$2,$3,'gochujang.com',true)", [market, tokenA, tokenB]);
  assert.deepEqual(await rewards(), previousRewards);
  const original = fill(1), first = batch([original]), committed = await post(first);
  assert.equal(committed.status, 200, JSON.stringify(committed.body)); assert.equal(committed.body.inserted, 1); assert.equal(committed.body.coinsAwarded, 0); assert.equal(committed.body.replayed, false);
  const row = await one("SELECT usd_value::text AS usd,payload FROM mk_mcp_fills WHERE tx_hash=$1", [original.txHash]);
  assert.equal(row.usd, "12.340000"); assert.deepEqual(row.payload, parseMcpBatch(first, NOW).trades[0]);
  assert.equal((await snapshot()).history.length, 1); pass("authenticated API request commits actual SQL receipt, canonical amounts and immutable history");

  const saved = await snapshot(), retry = await post(first);
  assert.equal(retry.status, 200); assert.deepEqual(retry.body, { ...committed.body, replayed: true }); assert.deepEqual(await snapshot(), saved);
  await expectRollback({ ...first, trades: [{ ...original, usdValue: "13" }] }, 409, "conflict");
  pass("identical API retry reuses receipt; reused batch ID with changed payload is a real SQL 409");

  const overlap = await post(batch([fill(2), original])); assert.equal(overlap.status, 200); assert.equal(overlap.body.inserted, 1); assert.equal(overlap.body.duplicates, 1);
  assert.equal((await snapshot()).fills.length, 2); assert.equal((await snapshot()).history.length, 2); pass("overlapping new API batch counts existing fill once and commits its genuinely new fill");

  const revised = { ...original, revision: 2, amountOut: "5678000", usdValue: "15.125", correctionReason: "Corrected executed value" };
  const correction = await post(batch([revised])); assert.equal(correction.status, 200); assert.equal(correction.body.updated, 1);
  const reverted = { ...revised, revision: 3, status: "reverted", usdValue: "0", correctionReason: "Finalized-chain reversal" };
  const reversal = await post(batch([reverted])); assert.equal(reversal.status, 200); assert.equal(reversal.body.updated, 1); assert.equal(reversal.body.coinsAwarded, 0);
  const current = await one("SELECT status,revision,usd_value::text AS usd FROM mk_mcp_fills WHERE tx_hash=$1", [original.txHash]); assert.deepEqual(current, { status: "reverted", revision: 3, usd: "0.000000" });
  const history = (await query("SELECT revision,payload FROM mk_mcp_fill_history WHERE tx_hash=$1 ORDER BY revision", [original.txHash])).rows;
  assert.deepEqual(history.map((h: any) => h.revision), [1,2,3]); assert.equal(history[0].payload.usdValue, "12.340000"); assert.equal(history[1].payload.usdValue, "15.125000");
  pass("API correction and revert execute consecutive SQL revisions while retaining original payloads");

  await expectRollback(batch([{ ...fill(3), marketAddress: address(99) }]), 422, "rejected");
  await expectRollback(batch([fill(3), { ...fill(4), tokenOut: address(99) }]), 422, "rejected");
  pass("unapproved market and mixed valid/invalid token batch are rejected by SQL with no partial writes");

  // Fill 3 sorts before 100. The latter conflicts only after the insertion branch.
  const later = fill(100); assert.equal((await post(batch([later]))).status, 200);
  await expectRollback(batch([fill(3), { ...later, revision: 3, correctionReason: "Skipped revision" }]), 409, "conflict");
  pass("late SQL revision conflict rolls back an earlier valid insertion and its history within the same API call");

  assert.deepEqual(await rewards(), previousRewards); assert.equal((await one("SELECT count(*)::int AS count FROM battle_bots_ledger")).count, 1);
  pass("all successful and rejected API operations leave player coins, reward ledger and Strategies records unchanged");
  console.log(`MCP API→SQL: ${checks} checks passed using ${rpcCalls} real in-memory SQL RPC calls. No live DB or Reporter access.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
