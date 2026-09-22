/**
 * Season 5, the funding-wizard STUCK-STEP DETECTOR. GET/POST /api/s5/funding-status
 *
 * Answers "where exactly is this commander stuck on the road to their first
 * hold?" with one server-side JSON-RPC batch against https://rpc.doma.xyz:
 *
 *   eth_getBalance(wallet)                        -> gas
 *   eth_call balanceOf(USDC.e, wallet)            -> spendable dollars
 *   eth_call balanceOf(<stronghold token>, ...)   -> holder detection
 *
 * States (thresholds in lib/s5/funding.ts): HOLDER when ANY stronghold token
 * balance > 0 (presence is enough; USD pricing is the bot's job);
 * FUNDED_NOT_BOUGHT when USDC.e >= $5 and gas >= 0.00002 ETH; NO_GAS when the
 * dollars are there but gas is not; EMPTY otherwise; NO_WALLET without a valid
 * session. RPC trouble fails SOFT to UNKNOWN (10s budget): the wizard must
 * never look broken because a chain node hiccuped.
 *
 * POST { t } carries the play-session token (never in a URL/query log, the
 * same rule as /api/s5/me). GET is the tokenless probe: it returns NO_WALLET
 * plus the stronghold list so a guest wizard can still render buy links.
 * The response never echoes the wallet.
 */
import { NextResponse } from "next/server";
import { s5Db } from "@/lib/s5/server";
import { walletForSession } from "@/lib/s5/me";
import { getSeasonSnapshot } from "@/lib/s5/data";
import {
  DOMA_RPC_URL,
  GAS_OK_ETH,
  USDC_E_ADDRESS,
  USDC_OK_UNITS,
  buyLink,
  type FundingHold,
  type FundingState,
} from "@/lib/s5/funding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC_TIMEOUT_MS = 10_000;

type RpcResult = { id: number; result?: unknown; error?: unknown };

/** balanceOf(address) calldata: selector 0x70a08231 + the 32-byte padded address. */
function balanceOfData(wallet: string): string {
  return "0x70a08231" + wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function hexToBigInt(v: unknown): bigint | null {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]*$/.test(v)) return null;
  try {
    return BigInt(v === "0x" ? "0x0" : v);
  } catch {
    return null;
  }
}

type TargetLink = { domain: string; name: string; status: string; buyUrl: string };

async function targetList(): Promise<{ links: TargetLink[]; tokens: Array<{ domain: string; address: string }> }> {
  try {
    const snap = await getSeasonSnapshot();
    const usable = snap.targets.filter((t) => t.status !== "failed");
    return {
      links: usable.map((t) => ({ domain: t.domain, name: t.name, status: t.status, progress: t.progress, buyUrl: buyLink(t.domain) })),
      tokens: usable
        .filter((t) => t.tokenAddress)
        .map((t) => ({ domain: t.domain, address: t.tokenAddress as string })),
    };
  } catch {
    return { links: [], tokens: [] };
  }
}

function respond(state: FundingState, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, state, gasEth: 0, usdcUsd: 0, holds: [] as FundingHold[], ...extra });
}

/** Tokenless probe: a guest wizard still gets the stronghold buy links. */
export async function GET() {
  const { links } = await targetList();
  return respond("NO_WALLET", { targets: links });
}

export async function POST(req: Request) {
  let body: { t?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { links, tokens } = await targetList();

  let wallet: string | null = null;
  try {
    wallet = await walletForSession(s5Db(), body.t);
  } catch {
    wallet = null; // db unreachable: treat as no session, the wizard still works
  }
  if (!wallet) return respond("NO_WALLET", { targets: links });

  // One JSON-RPC batch: [gas, usdc, ...stronghold tokens], 10s budget.
  const calls = [
    { jsonrpc: "2.0", id: 0, method: "eth_getBalance", params: [wallet, "latest"] },
    { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC_E_ADDRESS, data: balanceOfData(wallet) }, "latest"] },
    ...tokens.map((t, i) => ({
      jsonrpc: "2.0",
      id: 2 + i,
      method: "eth_call",
      params: [{ to: t.address, data: balanceOfData(wallet) }, "latest"],
    })),
  ];

  let results: RpcResult[];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS);
    const r = await fetch(DOMA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(calls),
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`rpc ${r.status}`);
    const parsed = (await r.json()) as unknown;
    if (!Array.isArray(parsed)) throw new Error("rpc shape");
    results = parsed as RpcResult[];
  } catch {
    // Fail SOFT: the wizard shows its paths either way.
    return respond("UNKNOWN", { targets: links });
  }

  const byId = new Map<number, RpcResult>(results.map((x) => [Number(x.id), x]));
  const gasWei = hexToBigInt(byId.get(0)?.result);
  const usdcUnits = hexToBigInt(byId.get(1)?.result);
  if (gasWei === null && usdcUnits === null) {
    return respond("UNKNOWN", { targets: links });
  }

  const holds: FundingHold[] = [];
  tokens.forEach((t, i) => {
    const bal = hexToBigInt(byId.get(2 + i)?.result);
    if (bal !== null && bal > BigInt(0)) holds.push({ domain: t.domain, raw: bal.toString() });
  });

  const gasEth = gasWei === null ? 0 : Number(gasWei) / 1e18;
  const usdcUsd = usdcUnits === null ? 0 : Number(usdcUnits) / 1e6;
  const gasOk = gasWei !== null && gasWei >= BigInt(Math.round(GAS_OK_ETH * 1e18));
  const usdcOk = usdcUnits !== null && usdcUnits >= BigInt(USDC_OK_UNITS);

  let state: FundingState;
  if (holds.length > 0) state = "HOLDER";
  else if (usdcOk && gasOk) state = "FUNDED_NOT_BOUGHT";
  else if (usdcOk) state = "NO_GAS";
  else state = "EMPTY";

  return respond(state, {
    gasEth: Math.round(gasEth * 1e6) / 1e6,
    usdcUsd: Math.round(usdcUsd * 100) / 100,
    holds,
    targets: links,
  });
}
