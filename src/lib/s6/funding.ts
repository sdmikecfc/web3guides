/**
 * S6 funding wizard constants (client-safe: shared by the HQ wizard UI and the
 * /api/s6/funding-status route). Chain facts for Doma plus the two funding
 * paths (card via the Doma app, crypto via Stargate). Constants + pure helpers
 * only, no IO, no secrets.
 */

/** Doma chain params, EXACTLY as wallet_addEthereumChain expects them. */
export const DOMA_CHAIN = {
  chainId: "0x17CC5", // 97477
  chainName: "Doma",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.doma.xyz"],
  blockExplorerUrls: ["https://explorer.doma.xyz"],
} as const;

export const DOMA_RPC_URL = "https://rpc.doma.xyz";

/** USDC.e on Doma (6 decimals). */
export const USDC_E_ADDRESS = "0x31EEf89D5215C305304a2fA5376a1f1b6C5dc477";
export const USDC_E_DECIMALS = 6;

/** USDC on Base (the Stargate source-side prefill). */
export const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** Prefilled Stargate bridge link: Base USDC in, Doma USDC.e out. */
export const STARGATE_BRIDGE_URL =
  "https://stargate.finance/bridge?srcChain=base&dstChain=doma" +
  `&srcToken=${USDC_BASE_ADDRESS}&dstToken=${USDC_E_ADDRESS}`;

/** The Doma app (card path: Google sign-in mints a wallet, card/Apple Pay funds it). */
export const DOMA_APP_URL = "https://app.doma.xyz";

/** Deep link to buy one mainframe on the Doma app. */
export function buyLink(domain: string): string {
  return `${DOMA_APP_URL}/domain/${encodeURIComponent(String(domain || "").toLowerCase())}`;
}

/**
 * The player's own holdings on Doma (Mike, 2026-07-28: "if they are buying
 * they need more access to their portfolio"). We put people into real tokens,
 * so the place they can SEE and MANAGE those tokens has to be one tap away
 * from every surface that sold them, not something they have to go find.
 */
export const DOMA_PROFILE_URL = `${DOMA_APP_URL}/profile`;

/** The token's own page on Doma: chart, trades, and the sell side. */
export const tokenPageLink = buyLink;

// ── Detector thresholds (mirrored by the funding-status route) ──────────────
/** Enough gas to move: 0.00002 ETH. */
export const GAS_OK_ETH = 0.00002;
/** Enough USDC.e to enter a mainframe: $5 (in 6-decimal units). */
export const USDC_OK_UNITS = 5_000_000;
export const USDC_OK_USD = 5;

export type FundingState =
  | "NO_WALLET" // no session, so no wallet to read
  | "EMPTY" // wallet known, but no USDC.e worth entering with
  | "NO_GAS" // USDC.e is there, but not enough ETH to pay gas
  | "FUNDED_NOT_BOUGHT" // armed: USDC.e + gas, no mainframe token yet
  | "HOLDER" // holds at least one mainframe token
  | "UNKNOWN"; // RPC unreachable: fail soft, never block the wizard

export type FundingHold = { domain: string; raw: string };

export type FundingStatus = {
  ok: boolean;
  state: FundingState;
  /** Native ETH balance in ETH (display only). */
  gasEth: number;
  /** USDC.e balance in dollars (6-decimal units / 1e6, display only). */
  usdcUsd: number;
  /** Mainframe tokens with a balance > 0 (raw token units as strings;
   * presence is the signal, USD pricing is the bot's job). */
  holds: FundingHold[];
};
