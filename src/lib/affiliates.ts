export interface AffiliateLink {
  slug: string;
  label: string;
  description: string;
  category: "exchange" | "tax" | "hardware" | "swap" | "other";
  /** Replace YOURCODE with your real referral code once approved */
  destination_url: string;
}

export const AFFILIATE_LINKS: AffiliateLink[] = [
  {
    slug: "mexc",
    label: "MEXC",
    description: "1,500+ trading pairs, zero maker fees, and instant signup.",
    category: "exchange",
    destination_url: "https://promote.mexc.com/r/VA9alYyjkL",
  },
  {
    slug: "kucoin",
    label: "KuCoin",
    description: "Trade 700+ altcoins with low fees. Great for finding early gems.",
    category: "exchange",
    destination_url: "https://www.kucoin.com/r/rf/QBSY7JZL",
  },
  {
    slug: "okx",
    label: "OKX",
    description: "One of the world's largest crypto exchanges with a built-in Web3 wallet.",
    category: "exchange",
    destination_url: "https://www.okx.com/join/YOURCODE",
  },
  {
    slug: "kraken",
    label: "Kraken",
    description: "UK-regulated exchange. Buy, sell and stake crypto with peace of mind.",
    category: "exchange",
    destination_url: "https://r.kraken.com/YOURCODE",
  },
  {
    slug: "changenow",
    label: "ChangeNOW",
    description: "Non-custodial instant swaps. No sign-up, no KYC for small amounts.",
    category: "swap",
    destination_url: "https://changenow.app.link/referral?link_id=c1348cadc272f5",
  },
  {
    slug: "koinly",
    label: "Koinly",
    description: "HMRC-compliant crypto tax reports. Supports 700+ exchanges and wallets.",
    category: "tax",
    destination_url: "https://koinly.io/?via=YOURCODE",
  },
  {
    slug: "ledger",
    label: "Ledger",
    description: "Hardware wallet. Keep your private keys offline and your crypto safe.",
    category: "hardware",
    destination_url: "https://shop.ledger.com/?r=d1168e978b3a",
  },
];

export function getAffiliateBySlug(slug: string): AffiliateLink | undefined {
  return AFFILIATE_LINKS.find((a) => a.slug === slug);
}
