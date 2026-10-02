import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { McpIntakeError, MCP_MAX_BODY_BYTES, parseMcpBatch } from "@/lib/bots/mcp-trades";
import { botsDb, type BotsDb } from "./db";

interface IntakeDependencies { db: () => BotsDb; env: Record<string, string | undefined>; now: () => number }
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
const hash = (value: string) => createHash("sha256").update(value).digest();

/** Separate collector credentials. Never accepts a player's wallet-session token. */
function authorize(req: Request, env: IntakeDependencies["env"]) {
  if (env.MK_MCP_INGEST_ENABLED !== "1") throw new McpIntakeError(503, "feed_disabled", "MCP trade intake is not enabled.");
  const token = env.MK_MCP_INGEST_TOKEN;
  if (!token || token.length < 32 || token.length > 512 || /\s/.test(token)) throw new McpIntakeError(503, "feed_unconfigured", "MCP trade intake is not configured.");
  const auth = req.headers.get("authorization") ?? "";
  if (auth.length > 520 || !auth.startsWith("Bearer ") || !timingSafeEqual(hash(auth.slice(7)), hash(token))) throw new McpIntakeError(401, "unauthorized", "A valid collector token is required.");
}
async function body(req: Request): Promise<unknown> {
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new McpIntakeError(415, "content_type", "Send application/json.");
  if (Number(req.headers.get("content-length")) > MCP_MAX_BODY_BYTES) throw new McpIntakeError(413, "body_too_large", "The batch exceeds 1 MiB.");
  const reader = req.body?.getReader();
  if (!reader) throw new McpIntakeError(400, "invalid_json", "A JSON body is required.");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > MCP_MAX_BODY_BYTES) { await reader.cancel(); throw new McpIntakeError(413, "body_too_large", "The batch exceeds 1 MiB."); }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof McpIntakeError) throw error;
    throw new McpIntakeError(400, "invalid_json", "The request body is not valid JSON.");
  } finally { reader.releaseLock(); }
}
function failure(error: unknown) {
  if (error instanceof McpIntakeError) return response({ ok: false, code: error.code, error: error.message }, error.status);
  // Do not log source payloads, authorization headers or database details.
  return response({ ok: false, code: "feed_unavailable", error: "The trade feed is unavailable. Retry the same batch later." }, 503);
}

/** Injectable clients allow route tests without opening a live database connection. */
export function createMcpTradeHandlers(deps: IntakeDependencies = { db: botsDb, env: process.env, now: Date.now }) {
  return {
    async POST(req: Request) {
      try {
        authorize(req, deps.env);
        const batch = parseMcpBatch(await body(req), deps.now());
        const digest = hash(JSON.stringify(batch)).toString("hex");
        const { data, error } = await deps.db().rpc("mk_mcp_ingest", { p_batch_id: batch.batchId, p_payload_hash: digest, p_batch: batch });
        if (error) {
          if (error.message?.includes("MK_MCP_CONFLICT")) throw new McpIntakeError(409, "conflict", "This batch or fill conflicts with a saved record. Check its ID and revision.");
          if (error.message?.includes("MK_MCP_REJECTED")) throw new McpIntakeError(422, "rejected", "No records were saved. Check the wallet, enrollment time, approved market, token pair and revision.");
          throw error;
        }
        if (!data || typeof data !== "object" || data.ok !== true || data.batchId !== batch.batchId || data.coinsAwarded !== 0) throw new Error("Invalid intake receipt");
        return response(data);
      } catch (error) { return failure(error); }
    },
    async GET(req: Request) {
      try {
        authorize(req, deps.env);
        const url = new URL(req.url), after = url.searchParams.get("after");
        if (Array.from(url.searchParams.keys()).some(k => k !== "after") || url.searchParams.getAll("after").length > 1 || (after !== null && !/^0x[0-9a-f]{40}$/.test(after))) throw new McpIntakeError(400, "invalid_cursor", "after must be a lowercase wallet from the previous page.");
        const db = deps.db();
        const walletQuery = (view: string) => {
          const query = db.from(view).select("wallet,enlisted_at").order("wallet", { ascending: true }).limit(501);
          return after ? query.gt("wallet", after) : query;
        };
        const [walletsRead, seasonRead, marketsRead] = await Promise.all([
          walletQuery("mk_mcp_watchlist"),
          // Archived season wallets remain included for later corrections. Never
          // query the new view while its rollout flag is off (old installations).
          deps.env.BOTS_SEASON_V1 === "1" ? walletQuery("mk6_mcp_watchlist") : Promise.resolve({ data: [], error: null }),
          db.from("mk_mcp_markets").select("network_id,market_address,token_a,token_b,domain_name", { count: "exact" }).eq("enabled", true).eq("domain_name", "gochujang.com").order("network_id").order("market_address").limit(2000),
        ]);
        if (walletsRead.error || seasonRead.error || marketsRead.error || !Array.isArray(walletsRead.data) || !Array.isArray(seasonRead.data) || !Array.isArray(marketsRead.data) || marketsRead.count !== marketsRead.data.length) throw new Error("Incomplete feed configuration");
        const merged = new Map<string, { wallet: string; enlisted_at: string }>();
        for (const row of [...walletsRead.data, ...seasonRead.data]) {
          if (!/^0x[0-9a-f]{40}$/.test(row.wallet) || !Number.isFinite(Date.parse(row.enlisted_at))) throw new Error("Invalid watchlist row");
          const earlier = merged.get(row.wallet);
          if (!earlier || Date.parse(row.enlisted_at) < Date.parse(earlier.enlisted_at)) merged.set(row.wallet, row);
        }
        // Each source contributes501 rows after the same cursor. Taking the first
        //500 of their sorted union cannot skip a wallet, including overlapping pages.
        const combined = Array.from(merged.values()).sort((a,b) => a.wallet.localeCompare(b.wallet));
        const wallets = combined.slice(0,500);
        return response({ ok: true, schemaVersion: 1, generatedAt: new Date(deps.now()).toISOString(),
          wallets: wallets.map(w => ({ wallet: w.wallet, since: w.enlisted_at })),
          nextCursor: combined.length > 500 ? wallets[wallets.length-1].wallet : null,
          markets: marketsRead.data.map(m => ({ networkId: m.network_id, marketAddress: m.market_address, tokenA: m.token_a, tokenB: m.token_b, domain: m.domain_name })),
          intakePath: "/api/bots/trades/ingest", maxTradesPerBatch: 500, ready: marketsRead.data.length > 0, rewardsEnabled: false });
      } catch (error) { return failure(error); }
    },
  };
}
