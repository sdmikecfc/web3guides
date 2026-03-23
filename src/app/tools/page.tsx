"use client";
// metadata exported from layout — this page uses event handlers so must be a client component
import ToolShell from "@/components/ToolShell";


const TOOLS = [
  {
    href: "/tools/tax-calculator",
    accent: "#6366f1",
    gradient: "linear-gradient(135deg, #1a0a2e 0%, #0d0d1f 100%)",
    badge: "🇬🇧 UK Only",
    badgeColor: "#6366f1",
    title: "UK Crypto CGT Calculator",
    description:
      "Estimate your capital gains tax liability for 2024/25, 2023/24, and 2022/23. Enter your disposals and see basic and higher rate CGT instantly — no signup.",
    stats: [
      { value: "3 tax years", label: "2022/23 → 2024/25" },
      { value: "£3,000", label: "2024/25 exempt amount" },
      { value: "18% / 24%", label: "Basic / higher rate" },
    ],
    cta: "Open Calculator →",
  },
  {
    href: "/tools/staking-calculator",
    accent: "#0ea5e9",
    gradient: "linear-gradient(135deg, #030f1a 0%, #0d0d1f 100%)",
    badge: "8 assets",
    badgeColor: "#0ea5e9",
    title: "Staking Rewards Calculator",
    description:
      "Project staking returns for ETH, SOL, ADA, DOT, MATIC, ATOM, AVAX and BNB. Toggle compound vs simple interest, add a GBP price, and see a month-by-month growth chart.",
    stats: [
      { value: "8 assets", label: "ETH, SOL, ADA + more" },
      { value: "Up to 5yr", label: "Projection timeframe" },
      { value: "Compound", label: "vs simple interest" },
    ],
    cta: "Open Calculator →",
  },
];

export default function ToolsPage() {
  return (
    <ToolShell toolLabel="Free Tools" accentColor="#7c6aff">
      <div style={{ padding: "60px 24px 80px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{
              display: "inline-block",
              background: "rgba(124,106,255,0.15)",
              border: "1px solid rgba(124,106,255,0.3)",
              borderRadius: 20,
              padding: "4px 16px",
              fontSize: 11,
              fontWeight: 700,
              color: "#a5b4fc",
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 18,
            }}>
              Free Tools
            </div>
            <h1 style={{
              margin: "0 0 16px",
              fontSize: "clamp(28px, 5vw, 44px)",
              fontWeight: 900,
              color: "#fff",
              lineHeight: 1.15,
            }}>
              Crypto tools that{" "}
              <span style={{
                background: "linear-gradient(135deg, #7c6aff, #ec4899)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                actually help
              </span>
            </h1>
            <p style={{ margin: "0 auto", maxWidth: 500, fontSize: 16, color: "#64748b", lineHeight: 1.7 }}>
              Two free calculators built for UK crypto investors. No account needed, no data collected.
            </p>
          </div>

          {/* Tool cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {TOOLS.map((tool) => (
              <a
                key={tool.href}
                href={tool.href}
                style={{ textDecoration: "none", display: "block" }}
              >
                <div style={{
                  background: tool.gradient,
                  border: `1px solid ${tool.accent}30`,
                  borderRadius: 20,
                  overflow: "hidden",
                  transition: "border-color 0.2s, box-shadow 0.2s, transform 0.15s",
                }}
                  onMouseOver={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = tool.accent;
                    el.style.boxShadow = `0 8px 40px ${tool.accent}22`;
                    el.style.transform = "translateY(-2px)";
                  }}
                  onMouseOut={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = `${tool.accent}30`;
                    el.style.boxShadow = "none";
                    el.style.transform = "none";
                  }}
                >
                  <div style={{ padding: "36px 40px" }}>
                    {/* Badge + title */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                      <span style={{
                        background: `${tool.accent}20`,
                        color: tool.accent,
                        borderRadius: 20,
                        padding: "3px 12px",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                      }}>
                        {tool.badge}
                      </span>
                    </div>
                    <h2 style={{ margin: "0 0 12px", fontSize: "1.5rem", fontWeight: 900, color: "#fff", lineHeight: 1.2 }}>
                      {tool.title}
                    </h2>
                    <p style={{ margin: "0 0 28px", fontSize: "0.95rem", color: "#94a3b8", lineHeight: 1.7, maxWidth: 540 }}>
                      {tool.description}
                    </p>

                    {/* Stats row */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 32, paddingBottom: 28, borderBottom: `1px solid ${tool.accent}18` }}>
                      {tool.stats.map((s) => (
                        <div key={s.label}>
                          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>{s.value}</div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* CTA */}
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      background: tool.accent,
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      padding: "12px 24px",
                      borderRadius: 10,
                    }}>
                      {tool.cta}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>

          {/* Bottom note */}
          <p style={{ textAlign: "center", marginTop: 48, fontSize: "0.8rem", color: "#334155", lineHeight: 1.7 }}>
            These tools are for educational purposes only and do not constitute financial or tax advice.<br />
            Always consult a qualified professional for your specific situation.
          </p>
        </div>
      </div>
    </ToolShell>
  );
}
