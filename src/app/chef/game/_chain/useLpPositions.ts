"use client";

/**
 * Reads the connected wallet's REAL liquidity positions for a market (M5).
 *
 * Client-side by design: it uses the wallet's own address from wagmi and
 * never accepts an address parameter, so there is no route that will read an
 * arbitrary stranger's holdings on request. Every call is a plain view call
 * and fails soft — a dead RPC leaves the game running on its demo dials
 * rather than breaking the room.
 *
 * The reader checks EVERY fee tier: a domain's pools exist at 100/500/3000/
 * 10000 on Doma (probe-verified), so looking only at one would quietly miss
 * a player's real position.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import {
  DOMA_CHAIN_ID,
  ERC20_ABI,
  FACTORY_ABI,
  FEE_TIERS,
  isInRange,
  NPM_ABI,
  NPM_ADDRESS,
  POOL_ABI,
  positionAmounts,
  priceToken1InToken0,
  rangeLabel,
  USDC_E,
  USDC_E_DECIMALS,
  V3_FACTORY,
} from "./v3";

export interface LpPosition {
  tokenId: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  inRange: boolean;
  /** the range in the game's own tight/medium/wide vocabulary */
  width: "Tight" | "Medium" | "Wide";
  /** position value in dollars, both sides counted */
  usd: number;
}

export interface LpRead {
  status: "idle" | "loading" | "ready" | "error" | "unconfigured";
  positions: LpPosition[];
  /** everything this wallet holds in this market, in dollars */
  totalUsd: number;
  /** the market's current token price in dollars, for the display line */
  priceUsd: number;
  refresh: () => void;
}

const EMPTY: LpPosition[] = [];

/**
 * @param tokenAddress the market's fractional token, or undefined if that
 * market has not had its address filled in yet (the hook says so rather than
 * pretending the wallet holds nothing).
 */
export function useLpPositions(tokenAddress: string | undefined): LpRead {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: DOMA_CHAIN_ID });
  const [status, setStatus] = useState<LpRead["status"]>("idle");
  const [positions, setPositions] = useState<LpPosition[]>(EMPTY);
  const [priceUsd, setPriceUsd] = useState(0);
  const [nonce, setNonce] = useState(0);
  const runIdRef = useRef(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!tokenAddress) {
      setStatus("unconfigured");
      setPositions(EMPTY);
      return;
    }
    if (!isConnected || !address || !publicClient) {
      setStatus("idle");
      setPositions(EMPTY);
      return;
    }
    const runId = ++runIdRef.current;
    let cancelled = false;
    setStatus("loading");

    (async () => {
      try {
        // 1. every pool this market has, across all fee tiers
        const pools = await Promise.all(
          FEE_TIERS.map(async (fee) => {
            const pool = (await publicClient
              .readContract({
                address: V3_FACTORY,
                abi: FACTORY_ABI,
                functionName: "getPool",
                args: [tokenAddress as `0x${string}`, USDC_E, fee],
              })
              .catch(() => undefined)) as `0x${string}` | undefined;
            if (!pool || /^0x0+$/.test(pool)) return null;
            const slot0 = (await publicClient
              .readContract({ address: pool, abi: POOL_ABI, functionName: "slot0" })
              .catch(() => undefined)) as readonly [bigint, number, ...unknown[]] | undefined;
            if (!slot0) return null;
            return { fee, pool: pool.toLowerCase(), sqrtPriceX96: slot0[0], tick: slot0[1] };
          })
        );
        const byFee = new Map(pools.filter(Boolean).map((p) => [p!.fee, p!]));
        if (byFee.size === 0) {
          if (!cancelled && runId === runIdRef.current) {
            setStatus("ready");
            setPositions(EMPTY);
          }
          return;
        }

        // 2. the market token's decimals, so amounts read as real money
        const tokenDecimals = Number(
          (await publicClient
            .readContract({ address: tokenAddress as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" })
            .catch(() => 18)) ?? 18
        );

        // 3. this wallet's position NFTs
        const count = Number(
          (await publicClient.readContract({
            address: NPM_ADDRESS,
            abi: NPM_ABI,
            functionName: "balanceOf",
            args: [address],
          })) as bigint
        );
        // positions get burned, so ids are never a range: always enumerate
        const ids = await Promise.all(
          Array.from({ length: Math.min(count, 60) }, (_, i) =>
            publicClient
              .readContract({
                address: NPM_ADDRESS,
                abi: NPM_ABI,
                functionName: "tokenOfOwnerByIndex",
                args: [address, BigInt(i)],
              })
              .catch(() => undefined)
          )
        );

        const found: LpPosition[] = [];
        let anyPrice = 0;
        await Promise.all(
          ids.map(async (id) => {
            if (id === undefined) return;
            const p = (await publicClient
              .readContract({
                address: NPM_ADDRESS,
                abi: NPM_ABI,
                functionName: "positions",
                args: [id as bigint],
              })
              .catch(() => undefined)) as
              | readonly [bigint, string, string, string, number, number, number, bigint, bigint, bigint, bigint, bigint]
              | undefined;
            if (!p) return;
            const [, , token0, token1, fee, tickLower, tickUpper, liquidity] = p;
            // an emptied position is not a position (BigInt(0), not a 0n
            // literal: the repo targets below ES2020)
            if (liquidity <= BigInt(0)) return;

            const pair = new Set([token0.toLowerCase(), token1.toLowerCase()]);
            if (!pair.has(USDC_E.toLowerCase()) || !pair.has(tokenAddress.toLowerCase())) return;
            const poolInfo = byFee.get(fee as (typeof FEE_TIERS)[number]);
            if (!poolInfo) return;

            const usdcIsToken0 = token0.toLowerCase() === USDC_E.toLowerCase();
            const dec0 = usdcIsToken0 ? USDC_E_DECIMALS : tokenDecimals;
            const dec1 = usdcIsToken0 ? tokenDecimals : USDC_E_DECIMALS;
            const { amount0, amount1 } = positionAmounts(
              liquidity,
              tickLower,
              tickUpper,
              poolInfo.sqrtPriceX96
            );
            // price of token1 in token0, then everything valued in dollars
            const p1in0 = priceToken1InToken0(poolInfo.sqrtPriceX96, dec0, dec1);
            const human0 = amount0 / Math.pow(10, dec0);
            const human1 = amount1 / Math.pow(10, dec1);
            const tokenPrice = usdcIsToken0 ? p1in0 : p1in0 > 0 ? 1 / p1in0 : 0;
            const usd = usdcIsToken0
              ? human0 + human1 * tokenPrice
              : human1 + human0 * tokenPrice;
            if (tokenPrice > 0) anyPrice = tokenPrice;

            found.push({
              tokenId: String(id),
              fee: Number(fee),
              tickLower: Number(tickLower),
              tickUpper: Number(tickUpper),
              inRange: isInRange(poolInfo.tick, Number(tickLower), Number(tickUpper)),
              width: rangeLabel(Number(tickLower), Number(tickUpper)),
              usd: Number.isFinite(usd) ? usd : 0,
            });
          })
        );

        if (cancelled || runId !== runIdRef.current) return;
        found.sort((a, b) => b.usd - a.usd);
        setPositions(found);
        setPriceUsd(anyPrice);
        setStatus("ready");
      } catch {
        // a dead RPC must never take the room down: the game keeps running
        // on its demo dials and simply says the read did not land
        if (!cancelled && runId === runIdRef.current) {
          setStatus("error");
          setPositions(EMPTY);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, isConnected, publicClient, tokenAddress, nonce]);

  const totalUsd = positions.reduce((n, p) => n + p.usd, 0);
  return { status, positions, totalUsd, priceUsd, refresh };
}
