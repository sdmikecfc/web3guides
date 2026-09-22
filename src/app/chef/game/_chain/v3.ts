/**
 * Uniswap-v3 reads for Domain Kitchen (M5, ADR-0101's chain layer).
 *
 * Renderer-free and React-free: pure ABIs, addresses and math so the same
 * code can run in a component, a route, or a script. Every address and call
 * shape below was confirmed against Doma mainnet by scripts/dk-probe.mts
 * before a line of UI was written:
 *   - the NPM is a real ERC721Enumerable (symbol UNI-V3-POS)
 *   - factory.getPool(token, USDC.e, fee) round-trips to the known pool
 *   - a market has pools at MULTIPLE fee tiers (SOFTWARE.ai has all four),
 *     so a reader that only checks 500 would silently miss real positions
 *
 * Money note: these numbers are for DISPLAY and for sizing a game economy.
 * They are never used to settle anything.
 */

export const DOMA_CHAIN_ID = 97477;
export const DOMA_RPC_URL = "https://rpc.doma.xyz";

/** Uniswap v3 NonfungiblePositionManager (ERC721Enumerable — verified). */
export const NPM_ADDRESS = "0xce126ca6aceBBDCe95D7b8A3Ce637951640811E0" as const;
/** Uniswap v3 factory (getPool verified). */
export const V3_FACTORY = "0x2e50b586d5bcD04cb6125E028A6a669f7f3cF1C2" as const;
/** The stable every domain pool is paired against. */
export const USDC_E = "0x31EEf89D5215C305304a2fA5376a1f1b6C5dc477" as const;
export const USDC_E_DECIMALS = 6;
/** Every fee tier a domain pool can exist at. All four are real on Doma. */
export const FEE_TIERS = [100, 500, 3000, 10000] as const;

export const NPM_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

export const FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

export const POOL_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  // which side of the pair is token0 (M9): valuing a position needs to know
  // whether the domain token or USDC.e sits in slot 0
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  // in-range depth (M10). A market can have pools at all four fee tiers, and
  // putting a beginner's money into the one nobody trades in would be the
  // wrong default, so the add-liquidity flow picks the deepest.
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  // supply, for the FDV term the campaign bonus is measured against (M9)
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  // ── M10: the add-liquidity flow needs to spend, not just read ────────────
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

// ── math ───────────────────────────────────────────────────────────────────

const Q96 = 2 ** 96;

/** sqrt(1.0001^tick) in the same units as sqrtPriceX96, as a float. */
export function tickToSqrtPrice(tick: number): number {
  return Math.pow(1.0001, tick / 2) * Q96;
}

/**
 * The token amounts a position currently holds, in raw units, from the
 * standard v3 formulas. Floats are deliberate: this sizes a game economy and
 * fills a display line, and never settles anything.
 */
export function positionAmounts(
  liquidity: bigint,
  tickLower: number,
  tickUpper: number,
  sqrtPriceX96: bigint
): { amount0: number; amount1: number } {
  const L = Number(liquidity);
  if (!(L > 0)) return { amount0: 0, amount1: 0 };
  const sqrtP = Number(sqrtPriceX96);
  const sqrtA = tickToSqrtPrice(tickLower);
  const sqrtB = tickToSqrtPrice(tickUpper);
  if (!(sqrtA > 0) || !(sqrtB > sqrtA)) return { amount0: 0, amount1: 0 };

  if (sqrtP <= sqrtA) {
    // entirely in token0
    return { amount0: (L * (sqrtB - sqrtA) * Q96) / (sqrtA * sqrtB), amount1: 0 };
  }
  if (sqrtP >= sqrtB) {
    // entirely in token1
    return { amount0: 0, amount1: (L * (sqrtB - sqrtA)) / Q96 };
  }
  return {
    amount0: (L * (sqrtB - sqrtP) * Q96) / (sqrtP * sqrtB),
    amount1: (L * (sqrtP - sqrtA)) / Q96,
  };
}

/** Price of token1 expressed in token0, adjusted for decimals. */
export function priceToken1InToken0(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number
): number {
  const r = Number(sqrtPriceX96) / Q96;
  return r * r * Math.pow(10, decimals1 - decimals0);
}

export function isInRange(tick: number, tickLower: number, tickUpper: number): boolean {
  return tick >= tickLower && tick < tickUpper;
}

/** How concentrated a range is — the shape the campaign rewards will weight. */
export function rangeWidthPct(tickLower: number, tickUpper: number): number {
  const lo = Math.pow(1.0001, tickLower);
  const hi = Math.pow(1.0001, tickUpper);
  if (!(lo > 0) || !(hi > lo)) return 0;
  return ((hi - lo) / ((hi + lo) / 2)) * 100;
}

/** Plain-language width, the tight/medium/wide vocabulary the game teaches. */
export function rangeLabel(tickLower: number, tickUpper: number): "Tight" | "Medium" | "Wide" {
  const pct = rangeWidthPct(tickLower, tickUpper);
  if (pct <= 25) return "Tight";
  if (pct <= 150) return "Medium";
  return "Wide";
}
