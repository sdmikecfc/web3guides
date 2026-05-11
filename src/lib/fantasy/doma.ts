/**
 * Thin Doma GraphQL client for server-side Fantasy routes.
 *
 * We only use this to mark holdings to market. The eligibility snapshot
 * is taken by doma-reporter and persisted to fantasy_pool_prices —
 * web3guides reads that table for draft pricing.
 */

import "server-only";

const ENDPOINT = "https://api.doma.xyz/graphql";

type RawToken = {
  address: string;
  status: string;
  priceUsd: number | null;
  currentFDV: number | null;
  fractionalTokenHolderCount: number | null;
  params: { name: string; symbol: string } | null;
};

let _cache: { tokens: Map<string, RawToken>; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchPage(skip: number, take: number): Promise<RawToken[]> {
  const apiKey = process.env.DOMA_API_KEY;
  if (!apiKey) throw new Error("DOMA_API_KEY not set");
  const gql = `{
    fractionalTokens(skip: ${skip}, take: ${take}) {
      items {
        address status priceUsd currentFDV fractionalTokenHolderCount
        params { name symbol }
      }
    }
  }`;
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": apiKey },
    body: JSON.stringify({ query: gql }),
    // Next caches fetch by default — we don't want that for live data
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`Doma API ${resp.status}`);
  const body = await resp.json();
  if (body.errors) throw new Error(`Doma GraphQL: ${JSON.stringify(body.errors)}`);
  return body?.data?.fractionalTokens?.items ?? [];
}

const CHAIN = 97477;
function caip10(addr: string | null): string | null {
  if (!addr) return null;
  if (addr.includes(":")) return addr.toLowerCase();
  return `eip155:${CHAIN}:${addr.toLowerCase()}`;
}

/** Fetch every fractional token, paginated. Cached 5min server-wide. */
export async function getAllTokensByAddress(): Promise<Map<string, RawToken>> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.tokens;
  const out = new Map<string, RawToken>();
  let skip = 0;
  // Bound for safety — current count is ~478, so 1500 is plenty of headroom.
  while (skip < 1500) {
    const page = await fetchPage(skip, 100);
    if (page.length === 0) break;
    for (const t of page) {
      const key = caip10(t.address);
      if (key) out.set(key, t);
    }
    if (page.length < 100) break;
    skip += 100;
  }
  _cache = { tokens: out, at: Date.now() };
  return out;
}

export function invalidateTokenCache() {
  _cache = null;
}
