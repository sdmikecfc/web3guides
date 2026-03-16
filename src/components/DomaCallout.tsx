import type { SubdomainKey } from "@/types";

const DOMA_URL = "https://app.doma.xyz/domain/web3guides.com";

interface DomaContent {
  headline: string;
  body: string;
  tag: string;
}

const DOMA_CONTENT: Partial<Record<SubdomainKey, DomaContent>> = {
  eth: {
    tag: "ETHEREUM · WEB3 DOMAINS",
    headline: "Own web3guides.com on Ethereum",
    body: "Doma Protocol uses Ethereum smart contracts to bring traditional domain names on-chain. web3guides.com is available to acquire — verifiable ownership, no central registrar, immutable on-chain record.",
  },
  rwa: {
    tag: "REAL-WORLD ASSETS · DOMAIN OWNERSHIP",
    headline: "Domain Names Are the Next RWA Frontier",
    body: "Premium domain names like web3guides.com are valuable real-world digital assets. Doma Protocol tokenizes domain ownership on-chain — enabling transparent acquisition, provable scarcity, and programmable transfer. This is RWA in action.",
  },
  defi: {
    tag: "DEFI · DOMAIN MARKETS",
    headline: "Permissionless Domain Trading via Doma Protocol",
    body: "Doma Protocol creates a decentralized marketplace for traditional domain names — enabling trustless acquisition and on-chain ownership records. web3guides.com is live on Doma right now.",
  },
  layer2: {
    tag: "LAYER 2 · SCALABLE DOMAIN INFRA",
    headline: "Gas-Efficient Domain Ownership at Scale",
    body: "Doma Protocol leverages modern blockchain infrastructure to make on-chain domain acquisitions accessible and affordable. Own web3guides.com without the friction of expensive L1 transactions.",
  },
  bridge: {
    tag: "CROSS-CHAIN · DOMAIN PORTABILITY",
    headline: "Your Domain, Bridgeable Across Chains",
    body: "Doma Protocol is building the infrastructure for cross-chain domain interoperability. Own web3guides.com on-chain today — and carry that ownership across the multi-chain future.",
  },
  legal: {
    tag: "LEGAL · DIGITAL PROPERTY RIGHTS",
    headline: "On-Chain Domain Ownership & Digital Property Law",
    body: "Doma Protocol creates an immutable, cryptographically verifiable record of domain ownership — complementing (and potentially reshaping) traditional ICANN-based domain law. web3guides.com is available to own on Doma today.",
  },
  security: {
    tag: "SECURITY · DOMAIN PROTECTION",
    headline: "Secure Domain Ownership Without a Central Registrar",
    body: "Traditional domain registrars can seize, suspend, or transfer your domain. Doma Protocol secures ownership through smart contracts — no single point of failure, no censorship risk. Own web3guides.com on-chain.",
  },
  beginner: {
    tag: "BEGINNER · WEB3 DOMAINS 101",
    headline: "Did You Know? You Can Own Domains On-Chain",
    body: "Doma Protocol lets you buy and own real website domains — like web3guides.com — as blockchain-verified digital assets. Think of it like holding a deed to a website address. No middlemen, no surprises.",
  },
  easy: {
    tag: "EASY MODE · PLAIN ENGLISH",
    headline: "Owning a Domain On-Chain: The Simple Version",
    body: "Imagine buying a house where the deed is a smart contract and no bank can take it from you. That's what Doma Protocol does for website domains. web3guides.com is up for grabs — you could own it.",
  },
  sol: {
    tag: "MULTI-CHAIN · DOMAIN PROTOCOL",
    headline: "Multi-Chain Domain Ownership with Doma Protocol",
    body: "Doma Protocol is bringing on-chain domain ownership to the multi-chain world. Solana's speed and low fees make it ideal for domain marketplaces — and web3guides.com is available to acquire on Doma today.",
  },
  staking: {
    tag: "STAKING · DIGITAL ASSETS",
    headline: "Domains as Productive Digital Assets",
    body: "Just as stakers earn yield on their crypto, domain owners on Doma Protocol can monetize premium names like web3guides.com through leasing and licensing — a new class of productive on-chain assets.",
  },
};

// Fallback for categories without specific content
const DEFAULT_CONTENT: DomaContent = {
  tag: "WEB3 DOMAINS · DOMA PROTOCOL",
  headline: "Own web3guides.com On-Chain",
  body: "Doma Protocol enables on-chain ownership of traditional domain names. web3guides.com is available to acquire — verifiable, immutable, and censorship-resistant.",
};

interface Props {
  subdomainKey: SubdomainKey;
  compact?: boolean;
}

export default function DomaCallout({ subdomainKey, compact = false }: Props) {
  const content = DOMA_CONTENT[subdomainKey] ?? DEFAULT_CONTENT;

  if (compact) {
    return (
      <a
        href={DOMA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="doma-callout flex items-center gap-4 p-4 no-underline"
        style={{ display: "flex" }}
      >
        {/* Doma icon */}
        <div
          className="flex shrink-0 items-center justify-center rounded-xl"
          style={{
            width: "44px", height: "44px",
            background: "rgba(245,166,35,0.1)",
            border: "1px solid rgba(245,166,35,0.25)",
          }}
        >
          <DomaIcon size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 font-mono text-[10px] uppercase tracking-widest" style={{ color: "#F5A623", opacity: 0.7 }}>
            {content.tag}
          </p>
          <p className="truncate font-mono text-sm font-semibold" style={{ color: "#F5A623" }}>
            {content.headline}
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs" style={{ color: "#F5A623", opacity: 0.6 }}>→</span>
      </a>
    );
  }

  return (
    <div className="doma-callout relative overflow-hidden p-6 sm:p-8">
      {/* Background decoration */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-full w-1/2 opacity-[0.03]"
        style={{
          background: "radial-gradient(ellipse at right top, #F5A623, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 opacity-[0.06]"
        style={{ fontSize: "120px", lineHeight: 1, userSelect: "none" }}
      >
        ◈
      </div>

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Content */}
        <div className="flex-1">
          <div className="mb-3 flex items-center gap-2">
            <DomaIcon size={18} />
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#F5A623", opacity: 0.75 }}>
              {content.tag}
            </span>
          </div>
          <h3
            className="mb-2 font-display text-xl sm:text-2xl"
            style={{ color: "#F5A623", fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.04em", lineHeight: 1.2 }}
          >
            {content.headline}
          </h3>
          <p className="font-mono text-sm leading-relaxed" style={{ color: "#b8a87a", maxWidth: "540px" }}>
            {content.body}
          </p>
        </div>

        {/* CTA */}
        <div className="shrink-0">
          <a
            href={DOMA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="doma-cta-btn"
          >
            <DomaIcon size={14} />
            View on Doma Protocol
            <span style={{ opacity: 0.7 }}>↗</span>
          </a>
          <p className="mt-2 font-mono text-[10px] text-center" style={{ color: "#7a6840" }}>
            app.doma.xyz
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Doma diamond icon ───────────────────────────────────────────────────── */
function DomaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      {/* Outer diamond */}
      <path
        d="M12 2 L22 12 L12 22 L2 12 Z"
        stroke="#F5A623"
        strokeWidth="1.5"
        fill="none"
        opacity="0.9"
      />
      {/* Inner diamond */}
      <path
        d="M12 6 L18 12 L12 18 L6 12 Z"
        fill="#F5A623"
        opacity="0.25"
      />
      {/* Center dot */}
      <circle cx="12" cy="12" r="2" fill="#F5A623" opacity="0.8" />
    </svg>
  );
}
