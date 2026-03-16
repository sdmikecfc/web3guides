import type { SubdomainConfig, SubdomainKey } from "@/types";

interface Props {
  config: SubdomainConfig;
  total: number;
}

/* Subdomains where Doma Protocol is highly relevant */
const DOMA_RELEVANT: SubdomainKey[] = [
  "eth", "rwa", "defi", "layer2", "bridge", "legal", "security", "beginner", "easy", "sol", "staking",
];

const DOMA_URL = "https://app.doma.xyz/domain/web3guides.com";

export default function HeroSection({ config, total }: Props) {
  const hasDoma = DOMA_RELEVANT.includes(config.key as SubdomainKey);

  return (
    <section className="relative overflow-hidden px-4 py-14 sm:px-6 lg:px-8">
      {/* Background gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 0%, ${config.glowHex.replace("0.15", "0.35")}, transparent 70%)`,
        }}
      />

      {/* Grid overlay */}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-80" />

      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col gap-6">
          {/* Top row: pill + title + description */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {/* Subdomain pill */}
              <div
                className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs"
                style={{
                  borderColor: config.accentHex + "50",
                  color: config.accentHex,
                  background: config.glowHex,
                }}
              >
                <span className="text-base leading-none">{config.emoji}</span>
                <span>{config.key}.web3guides.com</span>
              </div>

              <h1 className="mb-3 font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
                {config.label}
                <br />
                <span style={{ color: config.accentHex }}>Guides</span>
              </h1>

              <p className="max-w-xl text-base sm:text-lg" style={{ color: "#8aabb8" }}>
                {config.description}
              </p>

              {total > 0 && (
                <p className="mt-4 font-mono text-xs" style={{ color: "#4a6478" }}>
                  <span style={{ color: config.accentHex }}>{total}</span>{" "}
                  {total === 1 ? "guide" : "guides"} available
                </p>
              )}
            </div>
          </div>

          {/* Doma Protocol CTA — prominent card shown on relevant categories */}
          {hasDoma && (
            <a
              href={DOMA_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "16px 20px",
                borderRadius: "14px",
                border: "1px solid rgba(245,166,35,0.35)",
                background: "linear-gradient(135deg, rgba(245,166,35,0.1) 0%, rgba(245,166,35,0.04) 100%)",
                textDecoration: "none",
                transition: "border-color 0.2s ease, background 0.2s ease, transform 0.15s ease",
                maxWidth: "600px",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = "rgba(245,166,35,0.65)";
                el.style.background = "linear-gradient(135deg, rgba(245,166,35,0.16) 0%, rgba(245,166,35,0.08) 100%)";
                el.style.transform = "translateY(-2px)";
                el.style.boxShadow = "0 8px 32px rgba(245,166,35,0.15)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = "rgba(245,166,35,0.35)";
                el.style.background = "linear-gradient(135deg, rgba(245,166,35,0.1) 0%, rgba(245,166,35,0.04) 100%)";
                el.style.transform = "";
                el.style.boxShadow = "";
              }}
            >
              {/* Icon */}
              <div style={{
                flexShrink: 0,
                width: "40px", height: "40px",
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "10px",
                background: "rgba(245,166,35,0.12)",
                border: "1px solid rgba(245,166,35,0.3)",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2 L22 12 L12 22 L2 12 Z" stroke="#F5A623" strokeWidth="1.5" fill="none" />
                  <path d="M12 6 L18 12 L12 18 L6 12 Z" fill="#F5A623" opacity="0.25" />
                  <circle cx="12" cy="12" r="2.5" fill="#F5A623" opacity="0.9" />
                </svg>
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: "10px",
                  color: "#F5A623",
                  opacity: 0.65,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginBottom: "3px",
                }}>
                  Doma Protocol · Domain Ownership
                </p>
                <p style={{
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: "18px",
                  color: "#F5A623",
                  letterSpacing: "0.05em",
                  lineHeight: 1.2,
                }}>
                  Own web3guides.com as an on-chain digital asset
                </p>
              </div>

              {/* Arrow */}
              <span style={{
                flexShrink: 0,
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: "13px",
                color: "#F5A623",
                opacity: 0.7,
              }}>
                ↗
              </span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
