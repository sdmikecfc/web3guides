/**
 * S5 IN-APP BUY: the Doma Launchpad bonding curve, called directly.
 *
 * WHY THIS EXISTS (Mike, 2026-07-27): the buy used to be a link out to
 * app.doma.xyz, where the player lands on an unfamiliar panel whose amount
 * presets start at $10 and has to type "5" themselves. We asked Doma for a
 * `?amount=` prefill; it does not exist and is not coming. So the buy moves
 * IN HERE instead: the player's wallet is already connected from the SIWE
 * enlist, so a stronghold is one tap away and they never leave the game.
 *
 * WHERE THE FACTS COME FROM: every address, ABI and formula below was read
 * out of Doma's own public CLI (@doma-protocol/cli 0.7.3, viem-based) rather
 * than guessed, and the USDC.e address cross-checks against the one this repo
 * already shipped in funding.ts.
 *
 * THE VENUE RULE (docs: "Doma Fractionalization"): a fractional token with
 * status FRACTIONALIZED trades on its Launchpad bonding curve; once it
 * graduates, liquidity migrates to a Uniswap V3 pool. Every stronghold we
 * want bought is pre-graduation, so the launchpad IS the venue. This module
 * deliberately implements ONLY the launchpad buy: a graduated or failed token
 * falls back to the app.doma.xyz link, never to a half-supported path.
 *
 * Constants + pure helpers only. No IO, no secrets, client-safe.
 */

/** THE KILL SWITCH. Flip to false and redeploy to remove every in-app buy
 * button instantly; the map/wizard fall back to the app.doma.xyz link. */
export const BUY_IN_APP_ENABLED = true;

export const DOMA_CHAIN_ID = 97477;

/**
 * Slippage tolerance for the curve buy, in basis points.
 *
 * MEASURED, NOT GUESSED (2026-07-27, live reads against BRUNCHCASUAL.com and
 * SUPPLEMINTZ.com): these walls are TINY, so the curve walks fast in dollar
 * terms. On a fresh $1,000-raise wall, the buy that lands immediately before
 * yours costs you:
 *     $5 ahead -> 2.3% fewer tokens
 *    $25 ahead -> 10.3%
 *   $100 ahead -> 28.8%
 *   $500 ahead -> 58.7%
 * Doma's CLI ships 50 bps and our first draft used 100; both would revert on a
 * single other $5 buyer landing first, which on launch day is the NORMAL case,
 * not the exception. 1500 bps survives ordinary traffic while still aborting
 * if something genuinely strange happens (a whale, or a stale quote).
 *
 * There is no sandwich to defend against here: the curve is linear and
 * monotonic with a fixed start and end price, so the WORST price anyone can
 * ever pay is the end price (~1.97x the start). Slippage here is a sanity
 * bound, not MEV protection.
 */
export const BUY_SLIPPAGE_BPS = BigInt(1500);

/**
 * Quick amounts, in whole USDC. $1 leads because the cheapest way past
 * first-purchase nerves is proving the flow works for a dollar; $5 sits next
 * to it because that is the qualifying hold (QUALIFYING_HOLD_USD) and the
 * panel warns whenever the chosen amount is under it.
 */
export const BUY_PRESETS_USD = [1, 5, 25] as const;

/**
 * FRACTIONAL BUYS ARE FINE (measured 2026-07-27 against BRUNCHCASUAL's live
 * curve). USDC.e is 6dp and the launchpad takes any uint256, so the curve
 * quotes cleanly from about a cent upward; only a single raw unit rounds to
 * zero tokens once the 0.5% fee is applied. Gas is not the obstacle it would
 * be elsewhere either: a 300k-gas buy on Doma costs ~0.0000003 ETH, so a $1
 * purchase is not eaten by fees. Small buys actually price slightly BETTER
 * per dollar (995 tokens/$1 at $0.01 vs 983 at $5) because they move the
 * curve less.
 *
 * The floor is a usability choice, not a protocol one: below a dime the token
 * counts stop meaning anything to a human.
 */
export const BUY_MIN_USD = 0.1;
export const BUY_MAX_USD = 1000;

/** The hold that qualifies for the cash split. A smaller buy is a legitimate
 * first step (holdings accumulate), but the UI must never let someone think
 * $1 puts them in the money. */
export const QUALIFYING_HOLD_USD = 5;

/** Clamp + round a typed amount to something the curve can price. */
export function sanitizeUsd(raw: number): number {
  if (!Number.isFinite(raw)) return BUY_PRESETS_USD[0];
  const clamped = Math.min(BUY_MAX_USD, Math.max(BUY_MIN_USD, raw));
  return Math.round(clamped * 100) / 100; // cents; USDC.e carries 6dp
}

/** Only a FRACTIONALIZED token is on its bonding curve. */
export type TokenStatus = string | null | undefined;
export function isLaunchpadTradable(status: TokenStatus): boolean {
  return String(status || "").toUpperCase() === "FRACTIONALIZED";
}

/** Minimal launchpad surface: the reads we quote from + the one write. */
export const LAUNCHPAD_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "quoteAmount", type: "uint256" },
      { internalType: "uint256", name: "minTokenAmount", type: "uint256" },
    ],
    name: "buy",
    outputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "uint256", name: "", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [], name: "quoteToken", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "fractionalToken", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "curveModel", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "buyFeeRateBps", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "tokensSold", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getAvailableTokensToBuy", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  // The launch tranche size: fill % and the "vs the wall's last dollar" quote
  // are both derived from it.
  { inputs: [], name: "launchTokensSupply", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  // On-chain launch state. Mike's production sniper (trading-bot/snipe.py:197)
  // gates every buy on this rather than on an API field, because the chain is
  // the truth and the indexer can lag a fresh launch by seconds.
  { inputs: [], name: "launchStatus", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
] as const;

/**
 * Fallbacks lifted from the production sniper (trading-bot/snipe.py:866-872),
 * which has been buying these same launchpads with real money:
 *   - gas estimation CAN fail on a launchpad that just went live, so a
 *     hard gas limit is used instead of failing the buy;
 *   - the gas price is lifted so a buy is not stuck behind the crowd on a
 *     competitive launch.
 * The sniper uses 1.5x on both. A player buy is not racing anyone, so the
 * limit fallback is kept and the price bump is gentler.
 */
export const BUY_GAS_LIMIT_FALLBACK = BigInt(300000);
export const APPROVE_GAS_LIMIT_FALLBACK = BigInt(80000);
export const GAS_PRICE_BOOST_PCT = BigInt(125); // 1.25x

/** Gas is paid in ETH ON DOMA CHAIN, not mainnet ETH: a wallet holding only
 * mainnet ETH cannot transact here at all. Same floor the funding wizard
 * already uses to detect an unarmed wallet. */
export const MIN_GAS_WEI = BigInt(20000000000000); // 0.00002 ETH

/** The curve model's quote read. */
export const BONDING_CURVE_MODEL_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "quoteAmount", type: "uint256" },
      { internalType: "uint256", name: "totalSupply", type: "uint256" },
    ],
    name: "calculateBuyExactQuote",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** Just the ERC-20 bits the approve-then-buy dance needs. */
export const ERC20_ABI = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], stateMutability: "view", type: "function" },
] as const;

/**
 * The curve's fee haircut, exactly as Doma's CLI computes it:
 *   quoteAfterFee = amountIn * (10000 - buyFeeRateBps) / 10000
 * The curve is then quoted on the POST-fee amount.
 */
export function quoteAfterFee(amountIn: bigint, buyFeeRateBps: bigint): bigint {
  const bps = buyFeeRateBps > BigInt(10000) ? BigInt(10000) : buyFeeRateBps < BigInt(0) ? BigInt(0) : buyFeeRateBps;
  return (amountIn * (BigInt(10000) - bps)) / BigInt(10000);
}

/** The curve can never sell more than is left in the launch tranche. */
export function clampToAvailable(amountOut: bigint, available: bigint): bigint {
  return available >= BigInt(0) && amountOut > available ? available : amountOut;
}

/** minTokenAmount for the buy call: the quote minus slippage. */
export function minOut(amountOut: bigint, slippageBps: bigint = BUY_SLIPPAGE_BPS): bigint {
  if (amountOut <= BigInt(0)) return BigInt(0);
  return (amountOut * (BigInt(10000) - slippageBps)) / BigInt(10000);
}

/** USDC (6dp) whole dollars -> base units, integer-only so no float dust. */
export function usdToUnits(usd: number): bigint {
  return BigInt(Math.max(0, Math.round(usd * 1_000_000)));
}

/** Token base units -> a short human string (fractional tokens are 18dp and
 * the counts are large, so this reads as a rounded whole number). */
export function formatTokens(raw: bigint, decimals: number): string {
  if (raw <= BigInt(0)) return "0";
  // pow10 by loop, not `**`: this repo sets no tsconfig target, so bigint
  // exponentiation will not compile.
  let unit = BigInt(1);
  const d = Math.max(0, Math.min(36, Math.floor(decimals)));
  for (let i = 0; i < d; i++) unit = unit * BigInt(10);
  const whole = raw / unit;
  if (whole >= BigInt(1000)) return whole.toLocaleString("en-US");
  if (whole > BigInt(0)) {
    const frac = ((raw % unit) * BigInt(100)) / unit;
    return `${whole}.${String(frac).padStart(2, "0")}`;
  }
  const milli = (raw * BigInt(10000)) / unit;
  return `0.${String(milli).padStart(4, "0")}`;
}

/** An explorer link for a settled buy, so the receipt is checkable. */
export function txUrl(hash: string): string {
  return `https://explorer.doma.xyz/tx/${hash}`;
}
