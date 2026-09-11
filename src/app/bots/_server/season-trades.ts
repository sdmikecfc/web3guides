import "server-only";
import type { BotsDb } from "./db";

export interface ConfirmedSeasonTrade {
  canonicalKey: string; source: "mcp" | "strategies"; wallet: string; day: string;
  usdMicros: number; completed: boolean; revision: number; evidence: Record<string, unknown>;
}
export interface TradeSourceResult { status: "ready" | "unavailable"; facts: ConfirmedSeasonTrade[]; message?: string }
export interface ConfirmedTradeSource { read(db: BotsDb, wallet: string, since: string): Promise<TradeSourceResult> }
/** Exact six-decimal source values; no floating-point dollar multiplication. */
export function usdMicros(value: unknown): number | null {
  const text = String(value), match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) return null;
  const n = BigInt(match[1]) * BigInt(1_000_000) + BigInt((match[2] ?? "").padEnd(6, "0"));
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
}
type McpFill = { network_id: string; tx_hash: string; event_index: string | number; wallet: string; executed_at: string; status: string; usd_value: unknown; revision: number; batch_id: string; payload: Record<string, unknown> };
type McpBatch = { batch_id: string; complete: boolean; window_start: string; window_end: string; body?: { trades?: Record<string, unknown>[] } };
export function confirmedMcpFact(fill: McpFill, batch: McpBatch | undefined): ConfirmedSeasonTrade | null {
  const micros = usdMicros(fill.usd_value), at = Date.parse(fill.executed_at);
  const payload = fill.payload;
  if (!payload || payload.source !== "doma_mcp" || !["tokens.swap.v1", "agent.execute.v1", "defi.limitOrder.create.v1"].includes(String(payload.tool))
    || typeof payload.executionId !== "string" || !payload.executionId || payload.networkId !== fill.network_id || payload.txHash !== fill.tx_hash
    || String(payload.eventIndex) !== String(fill.event_index) || payload.wallet !== fill.wallet || payload.status !== fill.status || payload.revision !== fill.revision
    || usdMicros(payload.usdValue) !== micros || Date.parse(String(payload.executedAt)) !== at) return null;
  const identicalLaterReport = batch?.body?.trades?.some(t => t.networkId === fill.network_id && t.txHash === fill.tx_hash && String(t.eventIndex) === String(fill.event_index)
    && t.wallet === fill.wallet && Number(t.revision) === fill.revision && t.status === fill.status && usdMicros(t.usdValue) === micros && Date.parse(String(t.executedAt)) === at);
  if (!batch?.complete || (batch.batch_id !== fill.batch_id && !identicalLaterReport) || !Number.isFinite(at) || at < Date.parse(batch.window_start) || at >= Date.parse(batch.window_end)
    || micros === null || !/^eip155:\d+$/.test(fill.network_id) || !/^0x[0-9a-f]{64}$/.test(fill.tx_hash) || !/^\d+$/.test(String(fill.event_index))
    || !/^0x[0-9a-f]{40}$/.test(fill.wallet) || !Number.isSafeInteger(fill.revision) || fill.revision < 1 || !["finalized", "reverted"].includes(fill.status)) return null;
  return { canonicalKey: `${fill.network_id}:${fill.tx_hash}:${fill.event_index}`, source: "mcp", wallet: fill.wallet,
    day: new Date(at).toISOString().slice(0, 10), usdMicros: micros,
    // Creating an order does not establish that it filled. Keep its correction
    // record, but do not unlock coins without a reviewed completed-fill source.
    completed: fill.status === "finalized" && payload.tool !== "defi.limitOrder.create.v1", revision: fill.revision,
    evidence: { batchId: batch.batch_id, completeWindow: [batch.window_start, batch.window_end], tool: payload.tool, executionId: payload.executionId,
      verification: "approved-source-reported-finality", ...(payload.tool === "defi.limitOrder.create.v1" ? { excluded: "order-creation-is-not-fill-proof" } : {}) } };
}
/** These game-owned records are source-reported. Deployment must explicitly approve that source's readiness. */
export const mcpSeasonSource: ConfirmedTradeSource = {
  async read(db, wallet, since) {
    if (process.env.BOTS_SEASON_MCP_READY !== "1") return { status: "unavailable", facts: [], message: "MCP trade checks are not ready yet." };
    const facts: ConfirmedSeasonTrade[] = [];
    // Read every revision in this season, including reversals below $10. Never filter corrections away.
    for (let page = 0; page < 100; page++) {
      const { data, error } = await db.from("mk_mcp_fills").select("network_id,tx_hash,event_index,wallet,executed_at,status,usd_value,revision,batch_id,payload")
        .eq("wallet", wallet).gte("executed_at", since).order("executed_at").order("network_id").order("tx_hash").order("event_index").range(page * 500, page * 500 + 499);
      if (error) return { status: "unavailable", facts: [], message: "MCP trade checks are unavailable. Your play coins still count." };
      const fills = (data ?? []) as McpFill[];
      if (fills.length) {
        const batchIds = Array.from(new Set(fills.map(f => f.batch_id)));
        const batches = await db.from("mk_mcp_batches").select("batch_id,complete,window_start,window_end").in("batch_id", batchIds);
        if (batches.error) return { status: "unavailable", facts: [], message: "MCP trade checks are unavailable." };
        const index = new Map((batches.data as McpBatch[]).map(b => [b.batch_id, b]));
        for (const fill of fills) {
          let fact = confirmedMcpFact(fill, index.get(fill.batch_id));
          // A partial batch may precede an identical complete report. Ingest preserves
          // the original fill.batch_id on duplicates, so verify that later report's
          // exact canonical execution/revision instead of permanently hiding the fill.
          if (!fact) {
            const later = await db.from("mk_mcp_batches").select("batch_id,complete,window_start,window_end,body").eq("complete", true)
              .lte("window_start", fill.executed_at).gt("window_end", fill.executed_at).order("recorded_at", { ascending: false }).limit(20);
            if (!later.error) for (const report of (later.data ?? []) as McpBatch[]) { fact = confirmedMcpFact(fill, report); if (fact) break; }
          }
          // Incomplete coverage cannot establish a new reward or an authoritative reversal.
          if (!fact) return { status: "unavailable", facts: [], message: "MCP trade records are still being checked." };
          facts.push(fact);
        }
      }
      if (fills.length < 500) return { status: "ready", facts };
    }
    return { status: "unavailable", facts: [], message: "MCP trade checks have not finished." };
  },
};
/** The current Strategies dashboard is not proof of completed execution. No bonus is invented from it. */
export const strategiesSeasonSource: ConfirmedTradeSource = {
  async read() { return { status: "unavailable", facts: [], message: "Strategy trade checks are not ready yet." }; },
};
export async function seasonTradeReadiness(db: BotsDb, wallet: string, since: string) {
  const results = await Promise.all([mcpSeasonSource.read(db, wallet, since), strategiesSeasonSource.read(db, wallet, since)]);
  return { mcp: results[0].status, strategies: results[1].status };
}
export async function oldestSeasonStart(db: BotsDb, fallback: string) {
  // Include old league corrections after rollover; these are only game-owned season dates.
  const r = await db.from("mk6_seasons").select("starts_at").order("starts_at").limit(1);
  return !r.error && r.data?.[0]?.starts_at ? String(r.data[0].starts_at) : fallback;
}
export async function syncSeasonTrades(db: BotsDb, wallet: string, since: string, sources = { mcp: mcpSeasonSource, strategies: strategiesSeasonSource }) {
  const results = await Promise.all([sources.mcp.read(db, wallet, since), sources.strategies.read(db, wallet, since)]);
  for (const result of results) {
    if (result.status !== "ready") continue;
    for (const fact of result.facts) {
      if (fact.wallet !== wallet) throw new Error("Trade source returned another wallet");
      const response = await db.rpc("mk6_confirm_trade", { p_fact: fact });
      if (response.error) { result.status = "unavailable"; result.message = "Trade checks will retry. Your play coins are safe."; break; }
    }
  }
  return { mcp: results[0].status, strategies: results[1].status };
}
