/**
 * Doma Help Center deep links (audit 2026-08-14). One constants file so
 * every surface (web chips, bot embeds, cadence posts) points at the same
 * four guides and a rename at Doma is a one-line fix here.
 */
export const DOMA_HELP = {
  home: "https://app.doma.xyz/help",
  /** "Create a Doma Wallet": gasless, Google or email, no seed phrase. */
  wallet: "https://app.doma.xyz/help",
  /** "Buying & Selling Domain Tokens" */
  buying: "https://app.doma.xyz/help",
  /** "What graduation means" = our bond/liberate moment */
  graduation: "https://app.doma.xyz/help",
  /** "Liquidity Pools" */
  pools: "https://app.doma.xyz/help",
} as const;

export const HELP_LINKS: ReadonlyArray<{ label: string; href: string; blurb: string }> = [
  { label: "Get a Doma wallet in a minute", href: DOMA_HELP.wallet, blurb: "Google or email, gasless, no seed phrase." },
  { label: "How buying domain tokens works", href: DOMA_HELP.buying, blurb: "Buy instantly or make an offer, from $5." },
  { label: "What graduation means", href: DOMA_HELP.graduation, blurb: "The bonding moment we call the RECLAIMING." },
  { label: "Liquidity pools", href: DOMA_HELP.pools, blurb: "Where a bonded domain's market lives." },
];
