import type { SubdomainConfig } from "@/types";

interface Props {
  config: SubdomainConfig;
  total: number;
}

export default function HeroSection({ config, total }: Props) {
  return (
    <section style={{ position: "relative", overflow: "hidden", padding: "56px 24px 48px", background: "#fefbf6" }}>

      {/* Subtle radial spotlight */}
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(ellipse 70% 80% at 50% 0%, ${config.accentHex}18 0%, transparent 70%)`,
        }}
      />

      {/* Top accent line */}
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3, pointerEvents: "none",
          background: `linear-gradient(to right, transparent, ${config.accentHex}80, transparent)`,
        }}
      />

      <div style={{ position: "relative", margin: "0 auto", maxWidth: 1280 }}>
        {/* Subdomain badge */}
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 10, borderRadius: 50,
            padding: "6px 16px", marginBottom: 20,
            background: `${config.accentHex}12`,
            border: `1px solid ${config.accentHex}30`,
            color: config.accentHex,
            fontFamily: "'Space Mono', monospace", fontSize: "0.7rem",
          }}
        >
          {config.logoUrl
            ? <img src={config.logoUrl} alt={config.label} style={{ width: 20, height: 20, objectFit: "contain" }} />
            : <span style={{ fontSize: "1rem", lineHeight: 1 }}>{config.emoji}</span>}
          <span style={{ opacity: 0.7 }}>{config.key}.web3guides.com</span>
        </div>

        {/* Headline */}
        <h1 style={{ fontFamily: "'Bungee', cursive", fontWeight: 400, fontSize: "clamp(2.5rem, 6vw, 4.5rem)", lineHeight: 1.05, color: "#1a1a1a", marginBottom: 16 }}>
          {config.label}{" "}
          <span style={{ color: config.accentHex }}>Guides</span>
        </h1>

        <p style={{ fontFamily: "'DM Sans', sans-serif", maxWidth: 520, fontSize: "1.05rem", lineHeight: 1.65, color: "#6b7280" }}>
          {config.description}
        </p>

        {/* Guide count pill */}
        {total > 0 && (
          <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ height: 2, width: 40, borderRadius: 2, background: config.accentHex, opacity: 0.5 }} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: config.accentHex }}>
              {total} {total === 1 ? "guide" : "guides"} available
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
