import type { SubdomainConfig } from "@/types";

interface Props { config: SubdomainConfig; }

export default function SubdomainCTA({ config }: Props) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
      <div
        className="relative overflow-hidden rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6"
        style={{
          background: `linear-gradient(135deg, ${config.glowHex} 0%, rgba(13,17,32,0.8) 100%)`,
          border: `1px solid ${config.accentHex}30`,
        }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-2xl"
             style={{ background: `radial-gradient(ellipse 60% 80% at 0% 50%, ${config.glowHex}, transparent)` }} />
        <div className="relative">
          <p className="font-mono text-xs uppercase tracking-widest mb-1" style={{ color: config.accentHex }}>
            🔥 Own this space
          </p>
          <p className="font-display text-xl font-bold text-white">
            Want your own {config.label} subdomain?
          </p>
          <p className="text-sm mt-1" style={{ color: "#6272a0" }}>
            Launch on {config.key}.web3guides.com — yours to build on.
          </p>
        </div>
        <a
          href="https://doma.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="relative shrink-0 rounded-xl px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 hover:scale-105 active:scale-95 whitespace-nowrap"
          style={{
            background: config.accentHex,
            boxShadow: `0 0 30px ${config.glowHex}`,
          }}
        >
          Get it on Doma.xyz →
        </a>
      </div>
    </section>
  );
}
