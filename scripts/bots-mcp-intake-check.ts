import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MCP_MAX_BODY_BYTES, MCP_MAX_TRADES, McpIntakeError, parseMcpBatch } from "@/lib/bots/mcp-trades";
import { createMcpTradeHandlers } from "@/app/bots/_server/mcp-trade-intake";

// In-memory API boundary tests. Never instantiate a network database client.
const NOW = Date.parse("2026-09-11T12:00:00Z");
const TOKEN = "collector-test-only-" + "x".repeat(40);
const BATCH_ID = "cbaed123-1234-4567-8901-abcdefabcdef";
const wallet = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const env = { MK_MCP_INGEST_ENABLED: "1", MK_MCP_INGEST_TOKEN: TOKEN };
const trade = () => ({
  networkId: "eip155:97477", txHash: "0x" + "AB".repeat(32), eventIndex: 4, sourceFillId: "source/fill-1",
  wallet: "0x" + "AB".repeat(20), marketAddress: wallet(2), tokenIn: wallet(3), tokenOut: wallet(4),
  amountIn: "1234500000000000000", amountOut: "4567000", executedAt: "2026-09-11T09:20:00Z",
  usdValue: "12.34", valuationSource: "  executed fill quote  ", source: "doma_mcp", tool: "tokens.swap.v1",
  executionId: "exec:1", orderId: null, strategyId: null, status: "finalized", revision: 1, correctionReason: null,
});
const batch = () => ({ schemaVersion: 1, batchId: BATCH_ID.toUpperCase(), windowStart: "2026-09-11T09:00:00Z", windowEnd: "2026-09-11T10:00:00Z", complete: true, trades: [trade()] });
type Result = { data: unknown; error: { code?: string; message: string } | null; count?: number | null };
type Call = { kind: "factory" | "from" | "query" | "rpc"; name: string; args: unknown[] };
function mockDb(config: { reads?: Record<string, Result>; rpc?: Result; throwFactory?: boolean; throwRead?: boolean; throwRpc?: boolean } = {}) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      calls.push({ kind: "from", name: table, args: [] });
      const query = {
        select(...args: unknown[]) { calls.push({ kind: "query", name: "select", args }); return query; },
        eq(...args: unknown[]) { calls.push({ kind: "query", name: "eq", args }); return query; },
        gt(...args: unknown[]) { calls.push({ kind: "query", name: "gt", args }); return query; },
        order(...args: unknown[]) { calls.push({ kind: "query", name: "order", args }); return query; },
        limit(...args: unknown[]) { calls.push({ kind: "query", name: "limit", args }); return query; },
        then(resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) {
          return (config.throwRead ? Promise.reject(new Error("private read failure")) : Promise.resolve(config.reads?.[table] ?? { data: [], error: null, count: 0 })).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name: string, args: unknown) {
      calls.push({ kind: "rpc", name, args: [args] });
      if (config.throwRpc) throw new Error("private RPC failure");
      return config.rpc ?? { data: { ok: true, batchId: BATCH_ID, accepted: 1, duplicates: 0, coinsAwarded: 0 }, error: null };
    },
  };
  return { calls, factory: () => { calls.push({ kind: "factory", name: "db", args: [] }); if (config.throwFactory) throw new Error("private database configuration"); return db; } };
}
type Mock = ReturnType<typeof mockDb>;
const handlers = (mock: Mock, settings: Record<string, string | undefined> = env) => createMcpTradeHandlers({ db: mock.factory as never, env: settings, now: () => NOW });
function post(payload: unknown = batch(), headers: Record<string, string> = {}) {
  return new Request("https://modelkombat.test/api/bots/trades/ingest", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...headers }, body: JSON.stringify(payload) });
}
const get = (query = "", authorization = `Bearer ${TOKEN}`) => new Request(`https://modelkombat.test/api/bots/trades/watchlist${query}`, { headers: { authorization } });
let checks = 0;
function pass(label: string) { checks++; console.log(`PASS ${label}`); }
async function rejected(response: Response, status: number, code?: string) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const body = await response.json(); assert.equal(body.ok, false); if (code) assert.equal(body.code, code);
  assert(!JSON.stringify(body).includes(TOKEN)); assert(!JSON.stringify(body).includes("private ")); assert(!("wallets" in body));
  return body;
}
async function main() {
  assert.equal(MCP_MAX_BODY_BYTES, 1024 * 1024); assert.equal(MCP_MAX_TRADES, 500);
  const raw = batch(), before = JSON.stringify(raw), canonical = parseMcpBatch(raw, NOW);
  assert.equal(JSON.stringify(raw), before, "validation does not mutate caller data");
  assert.equal(canonical.batchId, BATCH_ID); assert.equal(canonical.trades[0].wallet, raw.trades[0].wallet.toLowerCase());
  assert.equal(canonical.trades[0].txHash, raw.trades[0].txHash.toLowerCase()); assert.equal(canonical.trades[0].usdValue, "12.340000");
  assert.equal(canonical.trades[0].amountIn, raw.trades[0].amountIn); assert.equal(canonical.trades[0].executedAt, "2026-09-11T09:20:00.000Z");
  assert.equal(canonical.trades[0].valuationSource, "executed fill quote"); assert.equal(canonical.trades[0].source, "doma_mcp"); assert.equal(canonical.trades[0].revision, 1);
  pass("canonical addresses, UUID, UTC timestamps and exact decimal strings preserve raw input");

  type InvalidCase = [string, (b: any) => void];
  const invalid: InvalidCase[] = [
    ["unknown batch field", b => { b.coins = 10; }], ["missing documented field", b => { delete b.complete; }],
    ["schema version", b => { b.schemaVersion = 2; }], ["non-UUID batch", b => { b.batchId = "batch-1"; }],
    ["nonboolean completion", b => { b.complete = "true"; }], ["trades not array", b => { b.trades = {}; }],
    ["unknown item field", b => { b.trades[0].coins = 100; }], ["missing required nullable field", b => { delete b.trades[0].strategyId; }],
    ["wrong source", b => { b.trades[0].source = "strategies"; }], ["quoted output", b => { b.trades[0].tool = "tokens.quote.v1"; }],
    ["router approval", b => { b.trades[0].tool = "defi.limitOrder.approve.v1"; }], ["tool array must not coerce to string", b => { b.trades[0].tool = ["tokens.swap.v1"]; }],
    ["limit order missing original ID", b => { b.trades[0].tool = "defi.limitOrder.create.v1"; }],
    ["broadcast is not finality", b => { b.trades[0].status = "broadcast"; }], ["pending is not a fill", b => { b.trades[0].status = "pending"; }],
    ["bad wallet", b => { b.trades[0].wallet = "0x123"; }], ["zero wallet", b => { b.trades[0].wallet = wallet(0); }],
    ["bad market", b => { b.trades[0].marketAddress = "banana"; }], ["bad input token", b => { b.trades[0].tokenIn = wallet(0); }],
    ["same token pair", b => { b.trades[0].tokenOut = b.trades[0].tokenIn; }], ["zero transaction", b => { b.trades[0].txHash = "0x" + "0".repeat(64); }],
    ["short transaction", b => { b.trades[0].txHash = "0x123"; }], ["wrong network format", b => { b.trades[0].networkId = "97477"; }],
    ["negative log index", b => { b.trades[0].eventIndex = -1; }], ["fractional log index", b => { b.trades[0].eventIndex = 1.5; }],
    ["NaN log index", b => { b.trades[0].eventIndex = NaN; }], ["unsafe log index", b => { b.trades[0].eventIndex = 2147483648; }],
    ["numeric USD", b => { b.trades[0].usdValue = 12.34; }], ["NaN USD", b => { b.trades[0].usdValue = NaN; }],
    ["USD exponent", b => { b.trades[0].usdValue = "1e2"; }], ["USD more than six decimals", b => { b.trades[0].usdValue = "1.0000001"; }],
    ["negative USD", b => { b.trades[0].usdValue = "-1"; }], ["zero finalized value", b => { b.trades[0].usdValue = "0"; }],
    ["leading-zero USD", b => { b.trades[0].usdValue = "01.00"; }], ["unbounded USD", b => { b.trades[0].usdValue = "1000000000000"; }],
    ["numeric base amount", b => { b.trades[0].amountIn = 1000; }], ["fractional base amount", b => { b.trades[0].amountOut = "1.5"; }],
    ["zero base amount", b => { b.trades[0].amountIn = "0"; }], ["base amount exponent", b => { b.trades[0].amountIn = "1e18"; }],
    ["uint256 overflow", b => { b.trades[0].amountOut = (BigInt(1) << BigInt(256)).toString(); }],
    ["timestamp without UTC", b => { b.trades[0].executedAt = "2026-09-11T09:20:00"; }],
    ["offset timestamp", b => { b.trades[0].executedAt = "2026-09-11T10:20:00+01:00"; }],
    ["impossible calendar date", b => { b.trades[0].executedAt = "2026-02-30T09:20:00Z"; }],
    ["fill before window", b => { b.trades[0].executedAt = "2026-09-11T08:59:59.999Z"; }],
    ["exclusive end boundary", b => { b.trades[0].executedAt = b.windowEnd; }],
    ["backward window", b => { b.windowEnd = b.windowStart; }], ["window over 24 hours", b => { b.windowStart = "2026-09-10T09:59:59Z"; }],
    ["future beyond clock tolerance", b => { b.windowEnd = "2026-09-11T12:01:01Z"; }],
    ["unstable source fill ID", b => { b.trades[0].sourceFillId = "white space"; }], ["missing execution identity", b => { b.trades[0].executionId = ""; }],
    ["blank valuation source", b => { b.trades[0].valuationSource = "  "; }], ["control characters in valuation source", b => { b.trades[0].valuationSource = "price\nsource"; }],
    ["revision zero", b => { b.trades[0].revision = 0; }], ["string revision", b => { b.trades[0].revision = "1"; }],
    ["initial reverted record", b => { b.trades[0].status = "reverted"; }], ["initial correction reason", b => { b.trades[0].correctionReason = "correction"; }],
    ["correction without reason", b => { b.trades[0].revision = 2; }],
    ["duplicate economic fill", b => { b.trades.push({ ...b.trades[0], sourceFillId: "different-source", txHash: b.trades[0].txHash.toLowerCase() }); }],
    ["duplicate source fill", b => { b.trades.push({ ...b.trades[0], eventIndex: 999 }); }],
    ["more than 500 fills", b => { b.trades = Array.from({ length: 501 }, (_, i) => ({ ...trade(), eventIndex: i, sourceFillId: `fill-${i}` })); }],
  ];
  for (const [label, mutate] of invalid) {
    const input = batch(); mutate(input);
    assert.throws(() => parseMcpBatch(input, NOW), error => error instanceof McpIntakeError && error.status === 400 && error.code === "invalid_batch", label);
    const db = mockDb(); await rejected(await handlers(db).POST(post(input)), 400, "invalid_batch"); assert.deepEqual(db.calls, [], label + " must be rejected before DB factory"); pass(label);
  }
  const full = { ...batch(), trades: Array.from({ length: 500 }, (_, i) => ({ ...trade(), eventIndex: 499 - i, sourceFillId: `fill-${i}` })) };
  assert.equal(parseMcpBatch(full, NOW).trades.length, 500); assert.equal(parseMcpBatch(full, NOW).trades[0].eventIndex, 0);
  const empty = parseMcpBatch({ ...batch(), trades: [], complete: false }, NOW); assert.equal(empty.trades.length, 0); assert.equal(empty.complete, false);
  const correction = parseMcpBatch({ ...batch(), trades: [{ ...trade(), status: "reverted", revision: 2, usdValue: "0", correctionReason: "Chain reorganization" }] }, NOW);
  assert.equal(correction.trades[0].usdValue, "0.000000"); assert.equal(correction.trades[0].status, "reverted"); assert.equal(correction.trades[0].revision, 2);
  assert.equal(parseMcpBatch({ ...batch(), trades: [{ ...trade(), tool: "defi.limitOrder.create.v1", orderId: "order:123", strategyId: "strategy:456" }] }, NOW).trades[0].orderId, "order:123");
  assert.equal(parseMcpBatch({ ...batch(), trades: [{ ...trade(), amountIn: ((BigInt(1) << BigInt(256)) - BigInt(1)).toString(), usdValue: "0.000001", executedAt: batch().windowStart }] }, NOW).trades[0].usdValue, "0.000001");
  pass("500-fill boundary, canonical sorting, empty partial window, corrections, limit-order attribution and exact-value boundaries");

  const authCases: [string, Record<string, string | undefined>, string, number, string][] = [
    ["disabled", { ...env, MK_MCP_INGEST_ENABLED: "0" }, `Bearer ${TOKEN}`, 503, "feed_disabled"],
    ["missing feature flag", { MK_MCP_INGEST_TOKEN: TOKEN }, `Bearer ${TOKEN}`, 503, "feed_disabled"],
    ["no development auth bypass", { MK_MCP_INGEST_ENABLED: "1", NODE_ENV: "development" }, `Bearer ${TOKEN}`, 503, "feed_unconfigured"],
    ["short configured token", { ...env, MK_MCP_INGEST_TOKEN: "x".repeat(31) }, `Bearer ${TOKEN}`, 503, "feed_unconfigured"],
    ["whitespace configured token", { ...env, MK_MCP_INGEST_TOKEN: "x".repeat(32) + " y" }, `Bearer ${TOKEN}`, 503, "feed_unconfigured"],
    ["overlong configured token", { ...env, MK_MCP_INGEST_TOKEN: "x".repeat(513) }, `Bearer ${TOKEN}`, 503, "feed_unconfigured"],
    ["missing bearer", env, "", 401, "unauthorized"], ["wrong bearer", env, `Bearer ${"y".repeat(TOKEN.length)}`, 401, "unauthorized"],
    ["wallet session is not collector auth", env, "Bearer wallet-session-test", 401, "unauthorized"], ["wrong authorization scheme", env, `Basic ${TOKEN}`, 401, "unauthorized"],
    ["overlong authorization", env, `Bearer ${"x".repeat(600)}`, 401, "unauthorized"],
  ];
  for (const [label, settings, authorization, status, code] of authCases) {
    for (const method of ["POST", "GET"] as const) { const db = mockDb(); const h = handlers(db, settings); await rejected(await h[method](method === "POST" ? post(batch(), { authorization }) : get("", authorization)), status, code); assert.deepEqual(db.calls, [], label); }
    pass(label + " on both routes, no DB work");
  }
  for (const [label, request, status, code] of [
    ["invalid JSON", new Request("https://modelkombat.test/api/bots/trades/ingest", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: "{" }), 400, "invalid_json"],
    ["missing body", new Request("https://modelkombat.test/api/bots/trades/ingest", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" } }), 400, "invalid_json"],
    ["wrong content type", post(batch(), { "content-type": "text/plain" }), 415, "content_type"],
    ["declared oversized", post(batch(), { "content-length": String(MCP_MAX_BODY_BYTES + 1) }), 413, "body_too_large"],
    ["actual oversized despite false length", new Request("https://modelkombat.test/api/bots/trades/ingest", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", "content-length": "1" }, body: " ".repeat(MCP_MAX_BODY_BYTES + 1) }), 413, "body_too_large"],
    ["invalid UTF8", new Request("https://modelkombat.test/api/bots/trades/ingest", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: new Uint8Array([0xc3, 0x28]) }), 400, "invalid_json"],
  ] as const) { const db = mockDb(); await rejected(await handlers(db).POST(request), status, code); assert.deepEqual(db.calls, []); pass(label); }
  let pulled = 0, cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { pulled++; if (pulled > 100) controller.close(); else controller.enqueue(new Uint8Array(65536).fill(32)); }, cancel() { cancelled = true; } });
  const streamingRequest = new Request("https://modelkombat.test/api/bots/trades/ingest", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit & { duplex: "half" });
  const streamDb = mockDb(); await rejected(await handlers(streamDb).POST(streamingRequest), 413, "body_too_large"); assert(cancelled); assert(pulled < 100); assert.deepEqual(streamDb.calls, []); pass("oversized chunked body cancels early instead of buffering the entire stream");

  const successDb = mockDb(), result = await handlers(successDb).POST(post()); assert.equal(result.status, 200); assert.equal((await result.json()).coinsAwarded, 0);
  const call = successDb.calls.find(c => c.kind === "rpc")!; assert.equal(call.name, "mk_mcp_ingest"); const params = call.args[0] as any;
  assert.equal(params.p_batch_id, BATCH_ID); assert.deepEqual(params.p_batch, canonical); assert.equal(params.p_payload_hash, createHash("sha256").update(JSON.stringify(canonical)).digest("hex"));
  assert.equal(successDb.calls.filter(c => c.kind === "rpc").length, 1); assert.equal(successDb.calls.filter(c => c.kind === "from").length, 0);
  const two = { ...batch(), trades: [trade(), { ...trade(), eventIndex: 3, sourceFillId: "second-fill" }] };
  const reversed = { ...two, trades: [...two.trades].reverse().map(t => ({ ...t, usdValue: "12.340000", txHash: t.txHash.toLowerCase(), wallet: t.wallet.toLowerCase() })) };
  const digests = [];
  for (const input of [two, reversed]) { const db = mockDb(); assert.equal((await handlers(db).POST(post(input))).status, 200); digests.push((db.calls.find(c => c.kind === "rpc")!.args[0] as any).p_payload_hash); }
  assert.equal(digests[0], digests[1]); pass("one RPC receives canonical source data; retry digests survive row order, casing and decimal padding");
  for (const [label, config, status, code] of [
    ["SQL conflict", { rpc: { data: null, error: { message: "MK_MCP_CONFLICT private details" } } }, 409, "conflict"],
    ["SQL rejected batch", { rpc: { data: null, error: { message: "MK_MCP_REJECTED private details" } } }, 422, "rejected"],
    ["missing migration", { rpc: { data: null, error: { code: "42883", message: "private missing RPC" } } }, 503, "feed_unavailable"],
    ["RPC throws", { throwRpc: true }, 503, "feed_unavailable"], ["factory throws", { throwFactory: true }, 503, "feed_unavailable"],
    ["null receipt", { rpc: { data: null, error: null } }, 503, "feed_unavailable"],
    ["receipt for wrong batch", { rpc: { data: { ok: true, batchId: "wrong", coinsAwarded: 0 }, error: null } }, 503, "feed_unavailable"],
    ["unexpected coin grant", { rpc: { data: { ok: true, batchId: BATCH_ID, coinsAwarded: 1 }, error: null } }, 503, "feed_unavailable"],
    ["rejected receipt", { rpc: { data: { ok: false, batchId: BATCH_ID, coinsAwarded: 0 }, error: null } }, 503, "feed_unavailable"],
  ] as const) { await rejected(await handlers(mockDb(config)).POST(post()), status, code); pass(label + " fails closed without database details"); }

  const market = { network_id: "eip155:97477", market_address: wallet(2), token_a: wallet(3), token_b: wallet(4), domain_name: "gochujang.com" };
  const marketRead = { data: [market], count: 1, error: null };
  const members = Array.from({ length: 501 }, (_, i) => ({ wallet: wallet(i + 1), enlisted_at: "2026-09-10T09:00:00Z" }));
  const watchDb = mockDb({ reads: { mk_mcp_watchlist: { data: members, error: null }, mk_mcp_markets: marketRead } });
  const watch = await handlers(watchDb).GET(get(`?after=${wallet(0)}`)); assert.equal(watch.status, 200); const view = await watch.json();
  assert.equal(view.wallets.length, 500); assert.equal(view.nextCursor, wallet(500)); assert.equal(view.wallets[0].since, members[0].enlisted_at);
  assert.equal(view.markets[0].marketAddress, wallet(2)); assert.equal(view.markets[0].networkId, "eip155:97477"); assert.equal(view.ready, true); assert.equal(view.rewardsEnabled, false); assert.equal(view.maxTradesPerBatch, 500); assert.equal(view.generatedAt, new Date(NOW).toISOString());
  assert(watchDb.calls.some(c => c.name === "gt" && c.args[0] === "wallet" && c.args[1] === wallet(0))); assert(watchDb.calls.some(c => c.name === "eq" && c.args[0] === "enabled" && c.args[1] === true));
  assert(watchDb.calls.some(c => c.name === "eq" && c.args[0] === "domain_name" && c.args[1] === "gochujang.com"));
  assert(watchDb.calls.some(c => c.name === "limit" && c.args[0] === 501)); assert(watchDb.calls.some(c => c.name === "limit" && c.args[0] === 2000)); assert.equal(watchDb.calls.filter(c => c.kind === "rpc").length, 0);
  const lastDb = mockDb({ reads: { mk_mcp_watchlist: { data: members.slice(500), error: null }, mk_mcp_markets: marketRead } }); const last = await (await handlers(lastDb).GET(get(`?after=${view.nextCursor}`))).json(); assert.equal(last.nextCursor, null); assert.equal(last.wallets[0].wallet, wallet(501));
  const emptyDb = mockDb(); const noMembers = await (await handlers(emptyDb).GET(get())).json(); assert.equal(noMembers.ok, true); assert.equal(noMembers.ready, false); assert.deepEqual(noMembers.wallets, []); assert.equal(noMembers.nextCursor, null);
  pass("watchlist keyset page/last/empty responses use enrolled rows, enabled market filters and fixed read limits");
  for (const query of ["?after=banana", "?limit=5000", `?after=0x${"AB".repeat(20)}`, "?after=", `?after=${wallet(1)}&after=${wallet(2)}`]) { const db = mockDb(); await rejected(await handlers(db).GET(get(query)), 400, "invalid_cursor"); assert.deepEqual(db.calls, []); }
  pass("invalid watchlist cursors and caller-defined limits are rejected before DB access");
  for (const [label, config] of [
    ["wallet view missing", { reads: { mk_mcp_watchlist: { data: null, error: { code: "42P01", message: "private missing view" } }, mk_mcp_markets: marketRead } }],
    ["market read fails", { reads: { mk_mcp_watchlist: { data: members, error: null }, mk_mcp_markets: { data: null, error: { message: "private market failure" } } } }],
    ["market count truncation", { reads: { mk_mcp_markets: { data: [market], count: 2001, error: null } } }],
    ["missing market count", { reads: { mk_mcp_markets: { data: [market], error: null } } }],
    ["invalid wallet rows", { reads: { mk_mcp_watchlist: { data: {}, error: null }, mk_mcp_markets: marketRead } }],
    ["network read rejection", { throwRead: true }], ["watchlist factory failure", { throwFactory: true }],
  ] as const) { await rejected(await handlers(mockDb(config)).GET(get()), 503, "feed_unavailable"); pass(label + " returns no partial watchlist"); }
  console.log(`MCP intake: ${checks} checks passed. No network database, Reporter, or coin-grant calls.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
