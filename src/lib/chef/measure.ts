import "server-only";

/**
 * MEASUREMENT for the campaign ingest (M9, implements the missing half of
 * ADR-0111). Turns a wallet and a window into a `WindowEntry` the pure scorer
 * in `_engine/campaign.ts` can take.
 *
 * Read-only against chain and API. Nothing here writes, mints or pays.
 *
 * ── THE RULE THAT SHAPES THIS FILE ────────────────────────────────────────
 * FAIL THE WINDOW, NEVER A WALLET.
 *
 * ADR-0113 records what happens otherwise: a per-wallet `catch { console.warn }`
 * around a lookup that was ALWAYS throwing turned a whole payout into "$0 to
 * everyone", and it looked completely legitimate from the outside. So every
 * function here either measures a wallet correctly or THROWS, and the caller
 * abandons the entire window with a recorded reason. A window that half-worked
 * is the one outcome this must never produce.
 *
 * ── ATTRIBUTION, VERIFIED ─────────────────────────────────────────────────
 * Volume is credited to `originAddress || buyerAddress`, matching the
 * settlement code that has paid four seasons. Probed against 1,200 recent
 * software.ai swaps on 2026-08-10: where the two differ (724 of 1,200), the
 * BUYER is a contract in 14 of 14 sampled and the ORIGIN is an EOA in 0 of 14
 * — i.e. buyer is the router and origin is the human, so preferring origin
 * credits the right party. No shared-executor pattern exists (the busiest
 * origin fronts 5 buyers; a relayer would front dozens).
 * ⚠️ If Doma's in-app bots ever execute via a relayer, `tx.origin` becomes the
 * relayer and this credits nobody real. Re-probe before trusting bot volume:
 * `doma-reporter/dk-bot-probe.js`.
 */

import { createPublicClient, http, type Address } from "viem";
import {
  DOMA_CHAIN_ID,
  DOMA_RPC_URL,
  ERC20_ABI,
  FACTORY_ABI,
  FEE_TIERS,
  NPM_ABI,
  NPM_ADDRESS,
  POOL_ABI,
  USDC_E,
  USDC_E_DECIMALS,
  V3_FACTORY,
  isInRange,
  positionAmounts,
  priceToken1InToken0,
  rangeWidthPct,
} from "@/app/chef/game/_chain/v3";
import type { WindowEntry } from "@/app/chef/game/_engine/campaign";

const DOMA_GRAPHQL = process.env.DOMA_API_URL || "https://api.doma.xyz/graphql";

/**
 * Cost ceilings. Both are BREAKERS, not silent caps.
 *
 * They used to be `Math.min(count, cap)` and `page < cap`, which quietly
 * returned a partial answer — the exact failure ADR-0113 exists to stop, one
 * layer below where it was written. Breaching either now throws, so the window
 * fails with a reason instead of paying somebody a plausible zero.
 */
/**
 * NFTs enumerated for one wallet. This is NOT "positions in this campaign":
 * `balanceOf` on the NPM contract counts a wallet's v3 positions across EVERY
 * pool on Doma, so an LP active in ten other markets burns the budget before
 * their campaign position is ever read. The old ceiling of 60 was copied from
 * the client reader, where showing the first 60 is a display trade-off; here
 * it decided money. Raised, and now loud.
 */
const MAX_POSITIONS = 400;
/**
 * Pages of swaps to pull per token (100 rows each).
 *
 * Measured 2026-08-13 at rest: software.ai runs ~110 swaps/hour (~1,317 per
 * 12h window, 14 pages) and boner.com ~38/hour (~460, 5 pages). The old
 * ceiling of 60 pages was therefore only **4.6x headroom** on the busier
 * market — and a campaign exists to INCREASE that volume, so a campaign
 * succeeding fivefold would break its own measurement. 300 pages is ~23x
 * headroom, or a sustained 95 swaps/minute for twelve hours.
 *
 * Raising it is close to free: the loop stops at `reachedStart`, so the
 * ordinary window still costs 14 requests. A ceiling only costs anything in
 * the case it exists to catch.
 */
const MAX_SWAP_PAGES = 300;

/**
 * Read client for measurement.
 *
 * Retries hard on purpose. viem defaults to 3 tries at a 150ms base, which is
 * tuned for a user waiting on a page. This client backs a 12-hourly cron that
 * makes thousands of sequential reads and decides what people are paid: slow
 * is free, a dropped read is not. ADR-0113 makes any read failure fail the
 * WHOLE window (never a silent per-wallet zero), which is right, but it also
 * means one hiccup at wallet 190 of 200 discards the entire window's work.
 *
 * Not theoretical: the public RPC rate-limited dk-fdv-check on 2026-08-12
 * during a run of roughly twenty sequential reads.
 */
export const chainClient = () =>
  createPublicClient({
    transport: http(DOMA_RPC_URL, {
      retryCount: 8,
      retryDelay: 400,
      timeout: 20_000,
    }),
    chain: {
      id: DOMA_CHAIN_ID,
      name: "Doma",
      nativeCurrency: { name: "Doma", symbol: "DOMA", decimals: 18 },
      rpcUrls: { default: { http: [DOMA_RPC_URL] } },
    },
  });

type Client = ReturnType<typeof chainClient>;

interface PoolInfo {
  address: Address;
  fee: number;
  sqrtPriceX96: bigint;
  tick: number;
  token0: Address;
  /** in-pool liquidity, so a price can be weighed by what is standing behind it */
  liquidity: bigint;
}

/**
 * Every pool this token has against USDC.e, across ALL FOUR fee tiers,
 * SORTED DEEPEST FIRST.
 *
 * The fee-tier sweep is not defensive padding: SOFTWARE.ai genuinely has pools
 * at 100, 500, 3000 and 10000, and a reader that only checked 500 would score
 * real liquidity as zero.
 *
 * The sort is not cosmetic either. This used to return FEE_TIERS order, so
 * `pools[0]` was always the fee-100 pool, and `measureFdv` called that variable
 * `deepest` and priced the whole campaign's FDV off it. Measured 2026-08-12:
 * fee 100 is 4,899,190x thinner than fee 3000 on software.ai and 59,744,446x
 * thinner on boner.com. The prices agreed to within 2.55% that day only because
 * arbitrage was holding the tiers together; a pool with L=213944 can be moved
 * by a trade small enough to be worth making purely to move the bonus.
 *
 * Uninitialised pools (sqrtPriceX96 == 0) are dropped, matching `pickPool` in
 * _chain/addLiquidity.ts. boner.com really does have two of them, and one of
 * them sorted first would have priced FDV at zero.
 */
export async function poolsFor(client: Client, token: Address): Promise<PoolInfo[]> {
  const out: PoolInfo[] = [];
  for (const fee of FEE_TIERS) {
    const address = (await client.readContract({
      address: V3_FACTORY,
      abi: FACTORY_ABI,
      functionName: "getPool",
      args: [token, USDC_E, fee],
    })) as Address;
    if (!address || /^0x0+$/i.test(address)) continue;
    const slot0 = (await client.readContract({
      address,
      abi: POOL_ABI,
      functionName: "slot0",
    })) as readonly [bigint, number, ...unknown[]];
    // never initialised: it holds no position and carries no usable price
    if (slot0[0] <= BigInt(0)) continue;
    const token0 = (await client.readContract({
      address,
      abi: POOL_ABI,
      functionName: "token0",
    })) as Address;
    const liquidity = (await client.readContract({
      address,
      abi: POOL_ABI,
      functionName: "liquidity",
    })) as bigint;
    out.push({
      address,
      fee,
      sqrtPriceX96: slot0[0],
      tick: Number(slot0[1]),
      token0,
      liquidity,
    });
  }
  out.sort((a, b) => (b.liquidity > a.liquidity ? 1 : b.liquidity < a.liquidity ? -1 : 0));
  return out;
}

/**
 * In-range dollars and a concentration signal for one wallet.
 *
 * Out-of-range positions are counted at ZERO on purpose (ADR-0111): liquidity
 * parked away from the price is helping nobody trade.
 *
 * CONCENTRATION, measured 2026-08-13 rather than assumed. This comment used to
 * claim "a full-range position is ~1"; ADR-0111 claims "a 2% band is ~50".
 * Both are wrong. Against the shipped `rangeWidthPct`:
 *
 *     full range   widthPct 200.00   ->  0.500   <- what the in-game button mints
 *     ~50% band    widthPct  43.91   ->  2.277
 *     ~25% band    widthPct  23.45   ->  4.264
 *     <=12.5% band                   ->  8.000   (the Math.min cap)
 *
 * so TIGHT BEATS FULL RANGE BY EXACTLY 16x PER DOLLAR. `rangeWidthPct` tends
 * to 2 as the lower tick approaches zero, so widthPct is bounded above by 200
 * and the `Math.max(0.25, ...)` floor needs a width over 400: it is
 * unreachable dead code, which is the tell that this curve was never checked
 * against real ranges.
 *
 * ⚠️ UNRESOLVED, Mike's call: ADR-0115 made the in-game LP button mint FULL
 * RANGE only ("the game never asks about ticks"), which is right for
 * beginners — but it means a player who uses the game's own button earns a
 * SIXTEENTH of the concentration credit of someone who LPs tightly outside
 * it, while the Academy teaches tight/medium/wide. The numbers here are
 * locked by dk-measure-check so retuning them has to be deliberate.
 */
export async function measureLiquidity(
  client: Client,
  wallet: Address,
  token: Address,
  pools: PoolInfo[]
): Promise<{ inRangeUsd: number; concentration: number; positions: number }> {
  const count = Number(
    await client.readContract({
      address: NPM_ADDRESS,
      abi: NPM_ABI,
      functionName: "balanceOf",
      args: [wallet],
    })
  );
  if (!(count > 0)) return { inRangeUsd: 0, concentration: 1, positions: 0 };

  const tokenDecimals = Number(
    await client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" })
  );

  let inRangeUsd = 0;
  let weighted = 0;
  let positions = 0;

  // Fail the WINDOW, never the wallet (ADR-0113). Truncating here would score
  // this wallet's campaign position at zero if it happened to sit past the
  // ceiling, and would look exactly like an LP who simply had none.
  if (count > MAX_POSITIONS) {
    throw new Error(
      `wallet ${wallet} holds ${count} v3 positions, over the ${MAX_POSITIONS} enumeration ceiling: ` +
        `refusing to score a window from a partial read`
    );
  }
  for (let i = 0; i < count; i++) {
    const tokenId = (await client.readContract({
      address: NPM_ADDRESS,
      abi: NPM_ABI,
      functionName: "tokenOfOwnerByIndex",
      args: [wallet, BigInt(i)],
    })) as bigint;
    const p = (await client.readContract({
      address: NPM_ADDRESS,
      abi: NPM_ABI,
      functionName: "positions",
      args: [tokenId],
    })) as readonly [
      bigint, Address, Address, Address, number, number, number, bigint, ...unknown[]
    ];
    const [, , t0, t1, fee, tickLower, tickUpper, liquidity] = p;
    // BigInt(0), not 0n: this project's tsc target predates BigInt literals
    if (liquidity <= BigInt(0)) continue;

    // must be THIS token against USDC.e, or it is somebody else's campaign
    const lower0 = t0.toLowerCase();
    const lower1 = t1.toLowerCase();
    const want = token.toLowerCase();
    const usdc = USDC_E.toLowerCase();
    if (!((lower0 === want && lower1 === usdc) || (lower1 === want && lower0 === usdc))) continue;

    const pool = pools.find((x) => x.fee === Number(fee));
    if (!pool) continue;
    positions++;
    if (!isInRange(pool.tick, tickLower, tickUpper)) continue;

    const { amount0, amount1 } = positionAmounts(liquidity, tickLower, tickUpper, pool.sqrtPriceX96);
    const tokenIs0 = lower0 === want;
    const dec0 = tokenIs0 ? tokenDecimals : USDC_E_DECIMALS;
    const dec1 = tokenIs0 ? USDC_E_DECIMALS : tokenDecimals;
    const price1in0 = priceToken1InToken0(pool.sqrtPriceX96, dec0, dec1);

    // value both legs in USDC.e terms
    const amt0 = amount0 / Math.pow(10, dec0);
    const amt1 = amount1 / Math.pow(10, dec1);
    const usd = tokenIs0 ? amt0 * price1in0 + amt1 : amt0 + amt1 * price1in0;
    if (!Number.isFinite(usd) || usd <= 0) continue;

    // width -> concentration: a full range is ~1, a 2% band is ~50
    const widthPct = rangeWidthPct(tickLower, tickUpper);
    const conc = widthPct > 0 ? Math.max(0.25, Math.min(8, 100 / widthPct)) : 1;
    inRangeUsd += usd;
    weighted += usd * conc;
  }

  return {
    inRangeUsd,
    concentration: inRangeUsd > 0 ? weighted / inRangeUsd : 1,
    positions,
  };
}

interface SwapRow {
  txHash: string;
  date: string;
  buyerAddress: string | null;
  originAddress: string | null;
  fractionalTokenAmount: string | null;
  priceUsd: string | number | null;
}

const fromCaip = (v: string | null): string => {
  if (!v) return "";
  const parts = String(v).split(":");
  return (parts[parts.length - 1] || "").toLowerCase();
};

/**
 * Every wallet's traded volume on ONE token over a window, in USD.
 *
 * The TOKEN axis, not the wallet axis. A wallet-axis query returns that
 * wallet's trades across every token it has ever touched (tens of thousands of
 * rows for an active trader) to find the handful that concern this domain; the
 * token axis returns one domain's whole history and needs no per-wallet
 * fan-out. That is the lesson `doma-reporter/lib/doma.js` records from four
 * seasons of settlement, and it applies unchanged here.
 *
 * Pages newest-first and STOPS at the window's own start, so cost is bounded
 * by the window rather than by the token's lifetime history. That matters:
 * software.ai has 1,644,127 lifetime swaps and a 12h window holds ~1,300.
 *
 * KNOWN LIMITATION, deliberately not solved here: paging by `skip` offset over
 * a live DESC list means swaps arriving mid-run shift older rows down an
 * offset, so a row on a page boundary can be read twice. Bounded by the
 * arrival rate during the run (~110/hour against a run of a few seconds, so
 * effectively zero today) and it only grows if the ceiling is ever actually
 * approached. The real fix is cursor pagination, which needs API support.
 */
export async function measureVolume(
  tokenId: number,
  fromMs: number,
  toMs: number
): Promise<Map<string, number>> {
  const key = process.env.DOMA_API_KEY;
  if (!key) throw new Error("DOMA_API_KEY is not set: cannot measure volume");

  const byWallet = new Map<string, number>();
  let reachedStart = false;
  /** true when the token's history ran out, which is a legitimate stop */
  let exhausted = false;
  let scanned = 0;

  for (let page = 0; page < MAX_SWAP_PAGES && !reachedStart; page++) {
    const gql = `{
      fractionalTokenSwaps(skip: ${page * 100}, take: 100, fractionalTokenId: ${tokenId}, sortOrder: DESC) {
        totalCount
        items {
          txHash date buyerAddress originAddress
          fractionalTokenAmount priceUsd
          fractionalToken { params { decimals } }
        }
      }
    }`;
    const res = await fetch(DOMA_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Api-Key": key },
      body: JSON.stringify({ query: gql }),
    });
    if (!res.ok) throw new Error(`Doma API ${res.status} while measuring volume`);
    const body = (await res.json()) as {
      errors?: { message: string }[];
      data?: { fractionalTokenSwaps?: { items?: (SwapRow & { fractionalToken?: { params?: { decimals?: number } } })[] } };
    };
    if (body.errors?.length) throw new Error(`Doma API: ${body.errors[0].message}`);
    const items = body.data?.fractionalTokenSwaps?.items ?? [];
    if (items.length === 0) {
      exhausted = true;
      break;
    }
    scanned += items.length;

    for (const s of items) {
      const t = Date.parse(String(s.date));
      if (!Number.isFinite(t)) continue;
      if (t < fromMs) {
        reachedStart = true;
        continue;
      }
      if (t >= toMs) continue; // newer than this window; skip, keep paging back
      const wallet = fromCaip(s.originAddress) || fromCaip(s.buyerAddress);
      if (!/^0x[a-f0-9]{40}$/.test(wallet)) continue;
      const decimals = Number(s.fractionalToken?.params?.decimals ?? 18);
      const raw = Number(s.fractionalTokenAmount ?? 0);
      const price = Number(s.priceUsd ?? 0);
      if (!Number.isFinite(raw) || !Number.isFinite(price)) continue;
      const usd = Math.abs(raw / Math.pow(10, decimals)) * price;
      if (!(usd > 0)) continue;
      byWallet.set(wallet, (byWallet.get(wallet) ?? 0) + usd);
    }
    if (items.length < 100) {
      exhausted = true;
      break;
    }
  }

  // The ONLY legitimate stops are "paged back past the window start" and "ran
  // out of history". Falling out on the page counter means the window holds
  // more swaps than the budget, and returning here would hand every player in
  // it a partial volume that looks exactly like a quiet window.
  //
  // A campaign PAYS for volume, so the busier the campaign the likelier this
  // is: 60 pages is 6,000 swaps, and a 12h window hits that at 8.3 swaps a
  // minute. Raise MAX_SWAP_PAGES rather than let it slide.
  if (!reachedStart && !exhausted) {
    throw new Error(
      `volume paging hit the ${MAX_SWAP_PAGES}-page ceiling (${scanned} swaps) without reaching the ` +
        `window start: refusing to score a window from partial volume`
    );
  }
  return byWallet;
}

/** TWAP-ish FDV: spot price times supply. Sampled per window, never a wick. */
export async function measureFdv(
  client: Client,
  token: Address,
  pools: PoolInfo[]
): Promise<number | null> {
  // poolsFor already sorts deepest-first, but FDV feeds the bonus every player
  // is paid, so this picks the max explicitly rather than trusting call order.
  const deepest = pools.reduce<PoolInfo | null>(
    (best, p) => (!best || p.liquidity > best.liquidity ? p : best),
    null
  );
  if (!deepest) return null;
  // Every pool empty means no honest price exists. Returning null is correct:
  // a null FDV switches the bonus off rather than paying one off a fiction.
  if (deepest.liquidity <= BigInt(0)) return null;
  const decimals = Number(
    await client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" })
  );
  const supply = (await client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "totalSupply",
  })) as bigint;
  const tokenIs0 = deepest.token0.toLowerCase() === token.toLowerCase();
  const dec0 = tokenIs0 ? decimals : USDC_E_DECIMALS;
  const dec1 = tokenIs0 ? USDC_E_DECIMALS : decimals;
  const p = priceToken1InToken0(deepest.sqrtPriceX96, dec0, dec1);
  const usdPerToken = tokenIs0 ? p : p > 0 ? 1 / p : 0;
  const supplyFloat = Number(supply) / Math.pow(10, decimals);
  const fdv = supplyFloat * usdPerToken;
  return Number.isFinite(fdv) && fdv > 0 ? fdv : null;
}

export interface MeasuredWindow {
  entries: WindowEntry[];
  fdv: number | null;
}

/**
 * Measure one window for a set of players.
 *
 * `excluded` is the operator's own wallets. Every season since S4 has excluded
 * them, and a campaign that pays its own operator is the fact pattern the
 * counsel critique flagged.
 */
export async function measureWindow(opts: {
  token: Address;
  tokenId: number;
  players: { wallet: string; quality: number; active: boolean }[];
  fromMs: number;
  toMs: number;
  excluded?: Set<string>;
}): Promise<MeasuredWindow> {
  const client = chainClient();
  const pools = await poolsFor(client, opts.token);
  if (pools.length === 0) throw new Error("no pools for this token: refusing to score a window");

  const volume = await measureVolume(opts.tokenId, opts.fromMs, opts.toMs);
  const fdv = await measureFdv(client, opts.token, pools);

  const entries: WindowEntry[] = [];
  for (const p of opts.players) {
    const wallet = p.wallet.toLowerCase();
    if (opts.excluded?.has(wallet)) continue;
    // NO per-wallet catch. If this throws the WINDOW fails, loudly, with a
    // reason — which is exactly what ADR-0113 says must happen.
    const liq = await measureLiquidity(client, wallet as Address, opts.token, pools);
    entries.push({
      wallet,
      volumeUsd: volume.get(wallet) ?? 0,
      inRangeUsd: liq.inRangeUsd,
      concentration: liq.concentration,
      quality: p.quality,
      active: p.active,
    });
  }
  return { entries, fdv };
}
