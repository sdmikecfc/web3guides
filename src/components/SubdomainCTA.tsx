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
            🔥 Own a piece of this
          </p>
          <p className="font-display text-xl font-bold text-white">
            Want your own {config.label} subdomain?
          </p>
          <p className="text-sm mt-1" style={{ color: "#6272a0" }}>
            Claim {config.key}.web3guides.com or get a new one — it's an NFT you truly own.
          </p>
        </div>
        <div className="relative flex flex-col sm:flex-row gap-2 shrink-0">
          <a
            href="https://app.doma.xyz/subdomain-claim/web3guides.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 hover:scale-105 active:scale-95 whitespace-nowrap text-center"
            style={{ background: config.accentHex, boxShadow: `0 0 30px ${config.glowHex}` }}
          >
            Claim a subdomain →
          </a>
          <a
            href="/subdomains"
            className="rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:text-white whitespace-nowrap text-center"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#a0aec0" }}
          >
            How it works
          </a>
        </div>
      </div>
    </section>
  );
}
