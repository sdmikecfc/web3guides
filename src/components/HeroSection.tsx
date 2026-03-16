import type { SubdomainConfig } from "@/types";

interface Props {
  config: SubdomainConfig;
  total: number;
}

export default function HeroSection({ config, total }: Props) {
  return (
    <section className="relative overflow-hidden px-4 pt-14 pb-12 sm:px-6 lg:px-8">

      {/* Inline radial spotlight — punches through the global background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 100% at 50% -10%,
              ${config.accentHex}30 0%,
              ${config.accentHex}08 40%,
              transparent 70%
            )
          `,
        }}
      />

      {/* Horizontal beam line */}
      <div
        className="pointer-events-none absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(to right, transparent, ${config.accentHex}60, transparent)`,
        }}
      />

      <div className="relative mx-auto max-w-7xl">
        {/* Subdomain badge */}
        <div
          className="mb-5 inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 font-mono text-xs font-medium"
          style={{
            background: config.glowHex,
            border: `1px solid ${config.accentHex}40`,
            color: config.accentHex,
          }}
        >
          <span className="text-sm leading-none">{config.emoji}</span>
          <span className="opacity-60">{config.key}.web3guides.com</span>
        </div>

        {/* Headline */}
        <h1 className="mb-3 font-display text-balance text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
          {config.label}
          <br />
          <span style={{ color: config.accentHex }} className="text-glow">
            Guides
          </span>
        </h1>

        <p className="max-w-lg text-base sm:text-lg leading-relaxed" style={{ color: "var(--color-muted,#6272a0)" }}>
          {config.description}
        </p>

        {/* Guide count pill */}
        {total > 0 && (
          <div className="mt-6 flex items-center gap-3">
            <div
              className="h-px w-12 rounded"
              style={{ background: config.accentHex, opacity: 0.4 }}
            />
            <span className="font-mono text-xs" style={{ color: config.accentHex }}>
              {total} {total === 1 ? "guide" : "guides"} available
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
