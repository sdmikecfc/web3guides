/**
 * PUT MONEY TO WORK — the in-game add-liquidity flow (M10, implements ADR-0048).
 *
 * WHY THIS EXISTS AT ALL. There is no add-liquidity deep link on the Doma app,
 * and `src/lib/s5/launchpad.ts` records that Doma was asked for URL parameters
 * and answered that they do not exist and are not coming. The team's response
 * for BUYING was to build it in-app (`s5/_components/BuyPanel.tsx`); ADR-0048
 * already ruled the same for liquidity: in-game, FULL RANGE, and "the game
 * never asks about ticks". A link-out cannot be made easy, so this is the only
 * honest way to answer "LP this token right now".
 *
 * ── THE ONE DESIGN RULE ──────────────────────────────────────────────────
 * FULL RANGE ONLY. The player is never shown a tick, a range, a fee tier or a
 * percentage. They pick a dollar amount. Full range is the position that
 * cannot go out of range, cannot quietly stop earning, and needs no
 * management — which is the correct default for somebody doing this for the
 * first time, even though a tighter band would earn more per dollar. The game
 * teaches tight-versus-wide elsewhere; it does not make a beginner choose one
 * to get started.
 *
 * ── WHY TWO TOKENS ───────────────────────────────────────────────────────
 * A full-range position holds BOTH sides, so a player holding only dollars
 * cannot do this yet. That is not a limitation to hide: the flow detects it
 * and sends them to buy some of the token first. Two taps, each of them
 * simple, beats one tap that fails in a wallet with an unreadable error.
 *
 * Renderer-free: no React here. The modal drives it.
 */

import type { Address, PublicClient, WalletClient } from "viem";
import {
  DOMA_CHAIN_ID,
  ERC20_ABI,
  FACTORY_ABI,
  FEE_TIERS,
  NPM_ADDRESS,
  POOL_ABI,
  USDC_E,
  USDC_E_DECIMALS,
  V3_FACTORY,
  priceToken1InToken0,
} from "./v3";

/** Uniswap v3's absolute tick bounds. Full range is these, aligned to spacing. */
const MIN_TICK = -887272;
const MAX_TICK = 887272;
/** fee -> tick spacing, the standard Uniswap v3 table */
const TICK_SPACING: Record<number, number> = { 100: 1, 500: 10, 3000: 60, 10000: 200 };

/** how far the pool may move between quoting and mining before we bail */
const SLIPPAGE_BPS = 200; // 2%
/** a mint needs gas; Doma gas is tiny but not zero */
const MIN_GAS_WEI = BigInt("100000000000000"); // 0.0001

export const NPM_MINT_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
] as const;

export interface PoolPick {
  address: Address;
  fee: number;
  spacing: number;
  token0: Address;
  sqrtPriceX96: bigint;
  tick: number;
  /** liquidity, used only to pick the deepest pool */
  liquidity: bigint;
}

/**
 * The pool to use: the DEEPEST one across all four fee tiers.
 *
 * All four are checked because SOFTWARE.ai genuinely has pools at every tier;
 * a reader that assumed 500 would put a beginner's money into a pool nobody
 * trades in.
 */
export async function pickPool(
  client: PublicClient,
  token: Address
): Promise<PoolPick | null> {
  let best: PoolPick | null = null;
  for (const fee of FEE_TIERS) {
    const address = (await client.readContract({
      address: V3_FACTORY,
      abi: FACTORY_ABI,
      functionName: "getPool",
      args: [token, USDC_E, fee],
    })) as Address;
    if (!address || /^0x0+$/i.test(address)) continue;
    const [slot0, token0, liquidity] = await Promise.all([
      client.readContract({ address, abi: POOL_ABI, functionName: "slot0" }) as Promise<
        readonly [bigint, number, ...unknown[]]
      >,
      client.readContract({ address, abi: POOL_ABI, functionName: "token0" }) as Promise<Address>,
      client.readContract({ address, abi: POOL_ABI, functionName: "liquidity" }) as Promise<bigint>,
    ]);
    if (slot0[0] <= BigInt(0)) continue; // never initialised
    const pick: PoolPick = {
      address,
      fee,
      spacing: TICK_SPACING[fee] ?? 60,
      token0,
      sqrtPriceX96: slot0[0],
      tick: Number(slot0[1]),
      liquidity,
    };
    if (!best || pick.liquidity > best.liquidity) best = pick;
  }
  return best;
}

/** Full range, aligned to this pool's tick spacing. Never shown to the player. */
export function fullRange(spacing: number): { tickLower: number; tickUpper: number } {
  return {
    tickLower: Math.ceil(MIN_TICK / spacing) * spacing,
    tickUpper: Math.floor(MAX_TICK / spacing) * spacing,
  };
}

export interface Plan {
  pool: PoolPick;
  tokenIs0: boolean;
  tokenDecimals: number;
  /** raw units of the domain token this will supply */
  tokenAmount: bigint;
  /** raw units of USDC.e this will supply */
  usdcAmount: bigint;
  /** what the player holds, for a plain-language shortfall message */
  tokenBalance: bigint;
  usdcBalance: bigint;
  /** price of one domain token in dollars, for display */
  usdPerToken: number;
  haveEnoughToken: boolean;
  haveEnoughUsdc: boolean;
}

const pow10 = (n: number): bigint => {
  let v = BigInt(1);
  for (let i = 0; i < n; i++) v *= BigInt(10);
  return v;
};

/**
 * Work out both legs from ONE dollar figure.
 *
 * A full-range position is worth roughly half in each token at the current
 * price, which is why the player only ever names a total. Anything the pool
 * does not take is refunded by the position manager in the same transaction,
 * so supplying a touch too much of one side costs nothing.
 */
export async function planAddLiquidity(
  client: PublicClient,
  token: Address,
  owner: Address,
  usdTotal: number
): Promise<Plan | null> {
  const pool = await pickPool(client, token);
  if (!pool) return null;

  const tokenDecimals = Number(
    await client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" })
  );
  const tokenIs0 = pool.token0.toLowerCase() === token.toLowerCase();
  const dec0 = tokenIs0 ? tokenDecimals : USDC_E_DECIMALS;
  const dec1 = tokenIs0 ? USDC_E_DECIMALS : tokenDecimals;
  const p1in0 = priceToken1InToken0(pool.sqrtPriceX96, dec0, dec1);
  // dollars for one whole domain token
  const usdPerToken = tokenIs0 ? p1in0 : p1in0 > 0 ? 1 / p1in0 : 0;
  if (!(usdPerToken > 0)) return null;

  const halfUsd = Math.max(0, usdTotal) / 2;
  const usdcAmount = BigInt(Math.round(halfUsd * Math.pow(10, USDC_E_DECIMALS)));
  const tokenAmount = BigInt(
    Math.round((halfUsd / usdPerToken) * Math.pow(10, tokenDecimals))
  );

  const [tokenBalance, usdcBalance] = await Promise.all([
    client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [owner],
    }) as Promise<bigint>,
    client.readContract({
      address: USDC_E,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [owner],
    }) as Promise<bigint>,
  ]);

  return {
    pool,
    tokenIs0,
    tokenDecimals,
    tokenAmount,
    usdcAmount,
    tokenBalance,
    usdcBalance,
    usdPerToken,
    haveEnoughToken: tokenBalance >= tokenAmount,
    haveEnoughUsdc: usdcBalance >= usdcAmount,
  };
}

export type MintPhase =
  | "idle"
  | "switching"
  | "approving-token"
  | "approving-usdc"
  | "minting"
  | "done"
  | "error";

/**
 * The transaction sequence, following BuyPanel's hardened order exactly:
 * right chain -> balances -> gas -> approve EXACTLY what is needed -> act.
 *
 * `simulate` runs the mint through `eth_call` and stops. That proves the exact
 * call would succeed against the live chain, or shows the precise revert,
 * without spending anything. It is how this gets verified before it ever
 * touches a real wallet.
 */
export async function addLiquidity(opts: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
  token: Address;
  plan: Plan;
  chainId: number;
  switchChain: (o: { chainId: number }) => Promise<unknown>;
  onPhase?: (p: MintPhase) => void;
  simulate?: boolean;
}): Promise<{ ok: true; hash?: string } | { ok: false; reason: string }> {
  const { publicClient, walletClient, account, token, plan, onPhase } = opts;
  const say = (p: MintPhase) => onPhase?.(p);

  try {
    if (opts.chainId !== DOMA_CHAIN_ID) {
      say("switching");
      await opts.switchChain({ chainId: DOMA_CHAIN_ID });
    }

    if (!plan.haveEnoughToken) {
      return { ok: false, reason: "needs-token" };
    }
    if (!plan.haveEnoughUsdc) {
      return { ok: false, reason: "needs-usdc" };
    }

    // Doma gas is paid in the chain's own coin. A wallet with none cannot
    // transact at all, and the wallet's own error for that is unreadable.
    const gas = await publicClient.getBalance({ address: account });
    if (gas < MIN_GAS_WEI) return { ok: false, reason: "needs-gas" };

    const { tickLower, tickUpper } = fullRange(plan.pool.spacing);
    const amount0Desired = plan.tokenIs0 ? plan.tokenAmount : plan.usdcAmount;
    const amount1Desired = plan.tokenIs0 ? plan.usdcAmount : plan.tokenAmount;
    const floor = (v: bigint) =>
      (v * BigInt(10_000 - SLIPPAGE_BPS)) / BigInt(10_000);

    // Approve EXACTLY what this mint will spend, never unlimited. Two tokens,
    // so potentially two approvals; each is skipped when the allowance covers
    // it already.
    for (const [addr, need, phase] of [
      [token, plan.tokenAmount, "approving-token"],
      [USDC_E as Address, plan.usdcAmount, "approving-usdc"],
    ] as const) {
      const allowance = (await publicClient.readContract({
        address: addr,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account, NPM_ADDRESS],
      })) as bigint;
      if (allowance < need) {
        say(phase);
        if (opts.simulate) continue; // a dry run does not spend on approvals
        const hash = await walletClient.writeContract({
          address: addr,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [NPM_ADDRESS, need],
          chain: null,
          account,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
    }

    say("minting");
    const params = {
      token0: plan.pool.token0,
      token1: (plan.tokenIs0 ? USDC_E : token) as Address,
      fee: plan.pool.fee,
      tickLower,
      tickUpper,
      amount0Desired,
      amount1Desired,
      amount0Min: floor(amount0Desired),
      amount1Min: floor(amount1Desired),
      recipient: account,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
    };

    if (opts.simulate) {
      await publicClient.simulateContract({
        address: NPM_ADDRESS,
        abi: NPM_MINT_ABI,
        functionName: "mint",
        args: [params],
        account,
      });
      say("done");
      return { ok: true };
    }

    const hash = await walletClient.writeContract({
      address: NPM_ADDRESS,
      abi: NPM_MINT_ABI,
      functionName: "mint",
      args: [params],
      chain: null,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    say("done");
    return { ok: true, hash };
  } catch (e) {
    say("error");
    const msg = e instanceof Error ? e.message : String(e);
    // a rejected signature is a normal thing a person does, not a failure
    if (/user rejected|denied|rejected the request/i.test(msg)) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: false, reason: msg.slice(0, 200) };
  }
}
