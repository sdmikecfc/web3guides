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
    <section className="relative overflow-hidden px-4 py-16 sm:px-6 lg:px-8">
      {/* Background gradient — brighter than before */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 0%, ${config.glowHex.replace("0.15", "0.35")}, transparent 70%)`,
        }}
      />

      {/* Grid overlay */}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-80" />

      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
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

            {/* Brighter body text */}
            <p
              className="max-w-xl text-base sm:text-lg"
              style={{ color: "#8aabb8" }}
            >
              {config.description}
            </p>

            {total > 0 && (
              <p className="mt-4 font-mono text-xs" style={{ color: "#4a6478" }}>
                <span style={{ color: config.accentHex }}>{total}</span>{" "}
                {total === 1 ? "guide" : "guides"} available
              </p>
            )}
          </div>

          {/* Doma micro-badge — shown on relevant categories */}
          {hasDoma && (
            <a
              href={DOMA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 self-start rounded-xl px-4 py-3 transition-all sm:self-auto"
              style={{
                border: "1px solid rgba(245,166,35,0.25)",
                background: "rgba(245,166,35,0.05)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = "rgba(245,166,35,0.5)";
                el.style.background = "rgba(245,166,35,0.1)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = "rgba(245,166,35,0.25)";
                el.style.background = "rgba(245,166,35,0.05)";
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M12 2 L22 12 L12 22 L2 12 Z" stroke="#F5A623" strokeWidth="1.5" fill="none" />
                <path d="M12 6 L18 12 L12 18 L6 12 Z" fill="#F5A623" opacity="0.2" />
                <circle cx="12" cy="12" r="2" fill="#F5A623" opacity="0.9" />
              </svg>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "#F5A623", opacity: 0.6, marginBottom: "2px" }}>
                  Doma Protocol
                </p>
                <p className="font-mono text-xs font-semibold" style={{ color: "#F5A623" }}>
                  Own web3guides.com →
                </p>
              </div>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
