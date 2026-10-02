/** Versioned intake contract. These are source-reported fills, not coin grants. */
export const MCP_MAX_TRADES = 500;
export const MCP_MAX_BODY_BYTES = 1024 * 1024;
export class McpIntakeError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const bad = (message: string): never => { throw new McpIntakeError(400, "invalid_batch", message); };
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uint256 = (BigInt(1) << BigInt(256)) - BigInt(1);
const TRADE_KEYS = ["networkId", "txHash", "eventIndex", "sourceFillId", "wallet", "marketAddress", "tokenIn", "tokenOut", "amountIn", "amountOut", "executedAt", "usdValue", "valuationSource", "source", "tool", "executionId", "orderId", "strategyId", "status", "revision", "correctionReason"];

export interface McpTrade {
  networkId: string; txHash: string; eventIndex: number; sourceFillId: string;
  wallet: string; marketAddress: string; tokenIn: string; tokenOut: string;
  amountIn: string; amountOut: string; executedAt: string; usdValue: string; valuationSource: string;
  source: "doma_mcp"; tool: "tokens.swap.v1" | "agent.execute.v1" | "defi.limitOrder.create.v1";
  executionId: string; orderId: string | null; strategyId: string | null;
  status: "finalized" | "reverted"; revision: number; correctionReason: string | null;
}
export interface McpTradeBatch {
  schemaVersion: 1; batchId: string; windowStart: string; windowEnd: string;
  /** True only once every page of source results for this window was delivered. */
  complete: boolean; trades: McpTrade[];
}
function object(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad(`${label} must be an object.`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(k => !keys.includes(k)) || keys.some(k => !Object.prototype.hasOwnProperty.call(row, k))) return bad(`${label} must contain exactly the documented fields.`);
  return row;
}
function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/.test(value)) return bad(`${label} must be a stable identifier of 1 to 160 characters.`);
  return value;
}
function address(value: unknown, label: string): string {
  if (typeof value !== "string" || !ADDRESS.test(value) || /^0x0{40}$/i.test(value)) return bad(`${label} must be a nonzero EVM address.`);
  return value.toLowerCase();
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return bad(`${label} must be readable text of 1 to ${max} characters.`);
  return value.trim();
}
function time(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return bad(`${label} must use an ISO timestamp in UTC ending in Z.`);
  const n = Date.parse(value);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0,19) !== value.slice(0,19)) return bad(`${label} is not a real date.`);
  return new Date(n).toISOString();
}
function amount(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[1-9]\d{0,77}$/.test(value) || BigInt(value) > uint256) return bad(`${label} must be a positive uint256 integer string in token base units.`);
  return value;
}
function usd(value: unknown): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value)) return bad("usdValue must be a nonnegative decimal string with at most 6 decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(6, "0")}`;
}

export function parseMcpBatch(value: unknown, nowMs = Date.now()): McpTradeBatch {
  const row = object(value, "Batch", ["schemaVersion", "batchId", "windowStart", "windowEnd", "complete", "trades"]);
  if (row.schemaVersion !== 1) return bad("schemaVersion must be 1.");
  if (typeof row.batchId !== "string" || !UUID.test(row.batchId)) return bad("batchId must be a UUID.");
  const windowStart = time(row.windowStart, "windowStart"), windowEnd = time(row.windowEnd, "windowEnd");
  const start = Date.parse(windowStart), end = Date.parse(windowEnd);
  if (end <= start || end - start > 86400000 || end > nowMs + 60000) return bad("A window must cover at most 24 hours, end after it starts, and not be in the future.");
  if (typeof row.complete !== "boolean") return bad("complete must be true or false.");
  if (!Array.isArray(row.trades) || row.trades.length > MCP_MAX_TRADES) return bad(`trades must be an array of at most ${MCP_MAX_TRADES} completed fills.`);
  const economicKeys = new Set<string>(), sourceKeys = new Set<string>();
  const trades = row.trades.map((item, index): McpTrade => {
    const t = object(item, `Trade ${index}`, TRADE_KEYS);
    if (typeof t.networkId !== "string" || !/^eip155:[1-9]\d{0,14}$/.test(t.networkId)) return bad("networkId must be an EVM CAIP-2 identifier, such as eip155:97477.");
    if (typeof t.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(t.txHash) || /^0x0{64}$/i.test(t.txHash)) return bad("txHash must identify the settled transaction.");
    if (typeof t.eventIndex !== "number" || !Number.isInteger(t.eventIndex) || t.eventIndex < 0 || t.eventIndex > 2147483647) return bad("eventIndex must be a nonnegative EVM receipt log index.");
    if (t.source !== "doma_mcp") return bad("This endpoint accepts only doma_mcp records.");
    if (typeof t.tool !== "string" || !["tokens.swap.v1", "agent.execute.v1", "defi.limitOrder.create.v1"].includes(t.tool)) return bad("tool must identify a supported MCP swap or limit-order origin.");
    if (t.status !== "finalized" && t.status !== "reverted") return bad("Only finalized fills or explicit corrections to reverted fills are accepted.");
    if (typeof t.revision !== "number" || !Number.isInteger(t.revision) || t.revision < 1 || t.revision > 2147483647) return bad("revision must be a positive integer.");
    const correctionReason = t.correctionReason === null ? null : text(t.correctionReason, "correctionReason", 240);
    if (t.revision === 1 && (t.status !== "finalized" || correctionReason !== null)) return bad("The first revision must be a finalized fill without a correction reason.");
    if (t.revision > 1 && !correctionReason) return bad("Corrections require a correctionReason.");
    const orderId = t.orderId === null ? null : identifier(t.orderId, "orderId");
    if (t.tool === "defi.limitOrder.create.v1" && !orderId) return bad("A limit-order fill must link to its original MCP orderId.");
    const tokenIn = address(t.tokenIn, "tokenIn"), tokenOut = address(t.tokenOut, "tokenOut");
    if (tokenIn === tokenOut) return bad("tokenIn and tokenOut must differ.");
    const executedAt = time(t.executedAt, "executedAt");
    if (Date.parse(executedAt) < start || Date.parse(executedAt) >= end) return bad("Each fill must fall within [windowStart, windowEnd). Use its original execution time for corrections.");
    const sourceFillId = identifier(t.sourceFillId, "sourceFillId"), txHash = t.txHash.toLowerCase();
    const key = `${t.networkId}:${txHash}:${t.eventIndex}`, sourceKey = `${t.networkId}:${sourceFillId}`;
    if (economicKeys.has(key) || sourceKeys.has(sourceKey)) return bad("A batch cannot repeat an on-chain fill or sourceFillId.");
    economicKeys.add(key); sourceKeys.add(sourceKey);
    const usdValue = usd(t.usdValue);
    if (t.status === "finalized" && usdValue === "0.000000") return bad("A finalized fill requires a positive executed USD value.");
    return { networkId: t.networkId, txHash, eventIndex: t.eventIndex, sourceFillId,
      wallet: address(t.wallet, "wallet"), marketAddress: address(t.marketAddress, "marketAddress"), tokenIn, tokenOut,
      amountIn: amount(t.amountIn, "amountIn"), amountOut: amount(t.amountOut, "amountOut"), executedAt, usdValue,
      valuationSource: text(t.valuationSource, "valuationSource", 200), source: "doma_mcp", tool: t.tool as McpTrade["tool"],
      executionId: identifier(t.executionId, "executionId"), orderId, strategyId: t.strategyId === null ? null : identifier(t.strategyId, "strategyId"),
      status: t.status, revision: t.revision, correctionReason };
  });
  // Canonical ordering means retries survive harmless source row reordering.
  trades.sort((a,b) => a.networkId.localeCompare(b.networkId) || a.txHash.localeCompare(b.txHash) || a.eventIndex-b.eventIndex);
  return { schemaVersion: 1, batchId: row.batchId.toLowerCase(), windowStart, windowEnd, complete: row.complete, trades };
}
