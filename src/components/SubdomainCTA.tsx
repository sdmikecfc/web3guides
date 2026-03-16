import type { SubdomainConfig } from "@/types";

interface Props { config: SubdomainConfig; }

export default function SubdomainCTA({ config }: Props) {
  return (
    <section style={{ margin: "0 auto", width: "100%", maxWidth: 1280, padding: "0 24px 64px" }}>
      <div
        style={{
          position: "relative", overflow: "hidden", borderRadius: 20,
          padding: "40px 48px", display: "flex", flexDirection: "row", alignItems: "center",
          justifyContent: "space-between", gap: 24, flexWrap: "wrap",
          background: `linear-gradient(135deg, ${config.accentHex}15 0%, #fff 100%)`,
          border: `1px solid ${config.accentHex}30`,
        }}
      >
        {/* Subtle orb */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 20, background: `radial-gradient(ellipse 50% 80% at 0% 50%, ${config.accentHex}10, transparent)` }} />

        <div style={{ position: "relative" }}>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: config.accentHex, marginBottom: 8 }}>
            🌐 Powered by Doma Protocol
          </p>
          <p style={{ fontFamily: "'Bungee', cursive", fontWeight: 400, fontSize: "1.4rem", color: "#1a1a1a", marginBottom: 6 }}>
            Build your own Web3 knowledge hub
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#6b7280" }}>
            Claim a subdomain on web3guides.com and publish your own guides — powered by Doma Protocol.
          </p>
        </div>
        <a
          href="https://app.doma.xyz/domain/web3guides.com/subdomains"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: "relative", flexShrink: 0, borderRadius: 12, padding: "12px 28px",
            fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", fontWeight: 700,
            color: "#fff", textDecoration: "none",
            background: config.accentHex,
            boxShadow: `0 4px 20px ${config.accentHex}40`,
            whiteSpace: "nowrap",
          }}
        >
          Get a subdomain →
        </a>
      </div>
    </section>
  );
}
