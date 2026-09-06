/**
 * S7 BUY INFO: what the in-app bonding-curve buy needs to start.
 *
 *   GET /api/s7/buy-info?domain=braking.io
 *     -> { ok, domain, tokenAddress, launchpadAddress, status, tradable,
 *          symbol, decimals, fallbackUrl }
 *
 * The launchpad address is per-token and lives only in Doma's GraphQL, so
 * this route resolves it server-side and caches it: the launchpad for a given
 * token never changes, and a 5-minute ISR window keeps the map card instant
 * without hammering their API on launch day.
 *
 * FAILS SOFT BY DESIGN. Anything unresolvable comes back tradable:false with a
 * fallbackUrl, and the caller shows the old app.doma.xyz link instead. A buy
 * button is never rendered on a guess.
 */
import { NextResponse } from "next/server";
import { getSeasonSnapshot } from "@/lib/s7/data";
import { buyLink } from "@/lib/s7/funding";
import { isLaunchpadTradable } from "@/lib/s7/launchpad";

export const runtime = "nodejs";
export const revalidate = 300;

const DOMA_GRAPHQL = process.env.DOMA_API_URL || "https://api.doma.xyz/graphql";
const CHAIN_ID = 97477;

type FtResult = {
  launchpadAddress?: string | null;
  status?: string | null;
  params?: { symbol?: string | null; decimals?: number | null } | null;
};

/** One GraphQL read for the token's venue. Never throws. */
async function fetchFractionalToken(tokenAddress: string): Promise<FtResult | null> {
  const query = `query GetFractionalToken($address: AddressCAIP10!) {
    fractionalToken(address: $address) {
      status
      launchpadAddress
      params { symbol decimals }
    }
  }`;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.DOMA_API_KEY) headers["Api-Key"] = process.env.DOMA_API_KEY;
    const resp = await fetch(DOMA_GRAPHQL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        variables: { address: `eip155:${CHAIN_ID}:${tokenAddress}` },
      }),
      next: { revalidate: 300 },
    });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { data?: { fractionalToken?: FtResult | null } };
    return j?.data?.fractionalToken ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = String(url.searchParams.get("domain") || "").toLowerCase().trim();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    return NextResponse.json({ ok: false, error: "bad domain" }, { status: 400 });
  }

  const fallbackUrl = buyLink(domain);
  const dead = (reason: string) =>
    NextResponse.json({ ok: true, domain, tradable: false, reason, fallbackUrl });

  // The domain must be a real stronghold on this season's roster: never let a
  // caller point the buy flow at an arbitrary token.
  const snap = await getSeasonSnapshot().catch(() => null);
  const target = snap?.targets?.find((t) => t.domain === domain) || null;
  if (!target) return dead("not a stronghold");
  if (!target.tokenAddress) return dead("no token yet");

  const ft = await fetchFractionalToken(target.tokenAddress);
  if (!ft) return dead("venue unresolved");

  const launchpadAddress =
    typeof ft.launchpadAddress === "string" && /^0x[0-9a-fA-F]{40}$/.test(ft.launchpadAddress)
      ? ft.launchpadAddress
      : null;
  const tradable = isLaunchpadTradable(ft.status) && !!launchpadAddress;

  return NextResponse.json({
    ok: true,
    domain,
    tokenAddress: target.tokenAddress,
    launchpadAddress,
    status: ft.status ?? null,
    tradable,
    // A graduated wall trades on Uniswap, which this flow deliberately does
    // not implement; the caller links out instead.
    reason: tradable ? null : "not on the curve",
    symbol: ft.params?.symbol ?? null,
    decimals: Number.isFinite(Number(ft.params?.decimals)) ? Number(ft.params?.decimals) : 18,
    fallbackUrl,
  });
}
