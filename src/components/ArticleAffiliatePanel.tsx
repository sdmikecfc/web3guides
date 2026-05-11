import { AFFILIATE_LINKS, type AffiliateLink } from "@/lib/affiliates";

// ─── Tag → affiliate mapping ───────────────────────────────────────────────────
// Each keyword maps to one or more affiliate slugs in priority order

const TAG_MAP: Record<string, string[]> = {
  // Tax
  tax:         ["koinly"],
  hmrc:        ["koinly"],
  "tax-report":["koinly"],
  "capital-gains": ["koinly"],
  cgt:         ["koinly"],

  // Exchanges
  trading:     ["mexc", "kucoin"],
  exchange:    ["mexc", "kucoin"],
  altcoin:     ["mexc", "kucoin"],
  defi:        ["mexc", "changenow"],
  ethereum:    ["mexc", "kucoin"],
  bitcoin:     ["mexc", "kucoin"],
  solana:      ["mexc", "kucoin"],
  layer2:      ["mexc", "changenow"],

  // Swaps / no-KYC
  swap:        ["changenow"],
  bridge:      ["changenow"],
  privacy:     ["changenow"],
  "no-kyc":    ["changenow"],

  // Hardware / Security
  security:    ["ledger"],
  wallet:      ["ledger"],
  hardware:    ["ledger"],
  "cold-storage": ["ledger"],
  "private-key": ["ledger"],

  // Staking
  staking:     ["mexc", "kucoin"],
  yield:       ["mexc", "kucoin"],
};

const TOOL_LINKS: Record<string, { label: string; href: string; note: string }> = {
  koinly: {
    label: "Free CGT Calculator",
    href:  "/tools/tax-calculator",
    note:  "Estimate your UK crypto tax instantly",
  },
  staking: {
    label: "Staking Rewards Calculator",
    href:  "/tools/staking-calculator",
    note:  "See how much you could earn staking",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickAffiliates(tags: string[]): AffiliateLink[] {
  const slugs: string[] = [];
  const normalised = tags.map((t) => t.toLowerCase().replace(/[^a-z0-9-]/g, "-"));

  for (const tag of normalised) {
    for (const mapped of TAG_MAP[tag] ?? []) {
      if (!slugs.includes(mapped)) slugs.push(mapped);
    }
  }

  // Always show at most 3 affiliates to keep it clean
  return slugs
    .slice(0, 3)
    .map((s) => AFFILIATE_LINKS.find((a) => a.slug === s))
    .filter((a): a is AffiliateLink => !!a && !a.destination_url.includes("YOURCODE"));
}

function pickTools(tags: string[]): typeof TOOL_LINKS[string][] {
  const normalised = tags.map((t) => t.toLowerCase());
  const tools: typeof TOOL_LINKS[string][] = [];
  if (normalised.some((t) => ["tax", "hmrc", "cgt", "capital-gains"].includes(t))) {
    tools.push(TOOL_LINKS.koinly);
  }
  if (normalised.some((t) => ["staking", "yield", "eth", "sol"].includes(t))) {
    tools.push(TOOL_LINKS.staking);
  }
  return tools;
}

// ─── Accent colours per category ─────────────────────────────────────────────

const CATEGORY_ACCENT: Record<string, { bg: string; border: string; badge: string }> = {
  exchange: { bg: "#0d1f3c", border: "#1e3a5f", badge: "#3b82f6" },
  tax:      { bg: "#0c2a1a", border: "#14532d", badge: "#22c55e" },
  hardware: { bg: "#1c1006", border: "#451a03", badge: "#f97316" },
  swap:     { bg: "#1a0d2e", border: "#3b0764", badge: "#a855f7" },
  other:    { bg: "#1e293b", border: "#334155", badge: "#64748b" },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  tags:       string[];
  accentHex?: string;
}

export default function ArticleAffiliatePanel({ tags, accentHex }: Props) {
  const affiliates = pickAffiliates(tags);
  const tools      = pickTools(tags);

  if (affiliates.length === 0 && tools.length === 0) return null;

  return (
    <aside
      aria-label="Recommended tools and services"
      style={{
        marginTop: 48,
        borderTop: "1px solid #1e293b",
        paddingTop: 32,
      }}
    >
      <h3
        style={{
          margin: "0 0 20px",
          fontSize: 13,
          fontWeight: 700,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        Recommended Tools &amp; Services
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Free tools first */}
        {tools.map((tool) => (
          <a
            key={tool.href}
            href={tool.href}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#0f172a",
              border: `1px solid ${accentHex ?? "#334155"}33`,
              borderLeft: `3px solid ${accentHex ?? "#6366f1"}`,
              borderRadius: 10,
              padding: "14px 18px",
              textDecoration: "none",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 2 }}>
                🔧 {tool.label}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{tool.note}</div>
            </div>
            <span style={{ fontSize: 12, color: accentHex ?? "#6366f1", fontWeight: 700, whiteSpace: "nowrap" }}>
              Free →
            </span>
          </a>
        ))}

        {/* Affiliate cards */}
        {affiliates.map((aff) => {
          const accent = CATEGORY_ACCENT[aff.category] ?? CATEGORY_ACCENT.other;
          return (
            <a
              key={aff.slug}
              href={`/go/${aff.slug}`}
              target="_blank"
              rel="noopener noreferrer sponsored"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: accent.bg,
                border: `1px solid ${accent.border}`,
                borderRadius: 10,
                padding: "14px 18px",
                textDecoration: "none",
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span
                    style={{
                      background: accent.badge,
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 7px",
                      borderRadius: 4,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {aff.category}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{aff.label}</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{aff.description}</div>
              </div>
              <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700, whiteSpace: "nowrap" }}>
                Visit →
              </span>
            </a>
          );
        })}

      </div>

      <p style={{ margin: "12px 0 0", fontSize: 11, color: "#334155" }}>
        Some links above are affiliate links. We may earn a commission at no extra cost to you.
      </p>
    </aside>
  );
}
