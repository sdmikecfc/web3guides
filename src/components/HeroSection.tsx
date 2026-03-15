import type { SubdomainConfig } from "@/types";

interface Props {
  config: SubdomainConfig;
  total: number;
}

export default function HeroSection({ config, total }: Props) {
  return (
    <section className="relative overflow-hidden px-4 py-16 sm:px-6 lg:px-8">
      {/* Background gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 0%, ${config.glowHex.replace("0.15", "0.25")}, transparent 70%)`,
        }}
      />

      {/* Grid overlay */}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />

      <div className="relative mx-auto max-w-7xl">
        {/* Subdomain pill */}
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs"
             style={{
               borderColor: config.accentHex + "40",
               color: config.accentHex,
               background: config.glowHex,
             }}>
          <span className="text-base leading-none">{config.emoji}</span>
          <span>{config.key}.web3guides.com</span>
        </div>

        <h1 className="mb-3 font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
          {config.label}
          <br />
          <span style={{ color: config.accentHex }}>Guides</span>
        </h1>

        <p className="max-w-xl text-base text-[#6b6b8a] sm:text-lg">
          {config.description}
        </p>

        {total > 0 && (
          <p className="mt-4 font-mono text-xs text-[#6b6b8a]">
            <span style={{ color: config.accentHex }}>{total}</span>{" "}
            {total === 1 ? "guide" : "guides"} available
          </p>
        )}
      </div>
    </section>
  );
}
