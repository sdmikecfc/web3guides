import { SUBDOMAINS, VALID_SUBDOMAINS } from "@/lib/subdomains";

export default function ApexHomePage() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";
  const isDev = process.env.NODE_ENV === "development";
  const devRoot = process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ?? "localhost:3000";

  function subdomainHref(key: string) {
    if (isDev) return `http://${key}.${devRoot}`;
    return `https://${key}.${rootDomain}`;
  }

  return (
    <div className="page-content min-h-screen flex flex-col">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <span className="font-display font-bold text-white text-lg">W3G</span>
        <a
          href="/subdomains"
          className="rounded-full px-4 py-1.5 text-xs font-mono font-semibold text-white transition hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #7c6aff, #3b9eff)" }}
        >
          Get a subdomain →
        </a>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 pt-20 pb-12">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-mono"
             style={{ background: "rgba(124,106,255,0.12)", border: "1px solid rgba(124,106,255,0.3)", color: "#7c6aff" }}>
          <span className="h-1.5 w-1.5 rounded-full bg-[#00e5a0] animate-pulse" />
          14 specialist crypto education hubs
        </div>

        <h1 className="font-display font-extrabold tracking-tight text-white mb-4"
            style={{ fontSize: "clamp(3rem, 10vw, 7rem)", lineHeight: 1.05, textShadow: "0 0 80px rgba(124,106,255,0.4)" }}>
          Web3<span style={{ color: "#7c6aff" }}>Guides</span>
        </h1>

        <p className="max-w-lg text-lg leading-relaxed mb-8" style={{ color: "#6272a0" }}>
          The most comprehensive crypto education network on the internet.
          Pick your topic and go deep.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <a
            href="/subdomains"
            className="rounded-xl px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 hover:scale-105 active:scale-95"
            style={{ background: "linear-gradient(135deg, #7c6aff 0%, #3b9eff 100%)", boxShadow: "0 0 40px rgba(124,106,255,0.3)" }}
          >
            🌐 Claim your crypto subdomain
          </a>
          <a
            href="#topics"
            className="rounded-xl px-6 py-3 text-sm font-semibold transition hover:text-white"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#a0aec0" }}
          >
            Browse topics ↓
          </a>
        </div>

        <div className="w-32 h-px" style={{ background: "linear-gradient(to right, transparent, #7c6aff, transparent)" }} />
      </section>

      {/* Subdomain grid */}
      <section id="topics" className="mx-auto w-full max-w-6xl px-6 pb-16">
        <p className="text-center font-mono text-xs uppercase tracking-widest mb-8" style={{ color: "#6272a0" }}>
          Choose your topic
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {VALID_SUBDOMAINS.map((key, i) => {
            const cfg = SUBDOMAINS[key];
            return (
              <a
                key={key}
                href={subdomainHref(key)}
                className="group relative flex flex-col gap-3 rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1"
                style={{
                  background: "rgba(13,17,32,0.7)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  backdropFilter: "blur(16px)",
                }}
              >
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse 80% 60% at 0% 0%, ${cfg.glowHex}, transparent)`, boxShadow: `inset 0 0 0 1px ${cfg.accentHex}40` }}
                />
                <div
                  className="relative flex h-11 w-11 items-center justify-center rounded-xl text-xl transition-transform duration-200 group-hover:scale-110"
                  style={{ background: cfg.glowHex, border: `1px solid ${cfg.accentHex}40` }}
                >
                  {cfg.emoji}
                </div>
                <div className="relative flex-1">
                  <p className="font-display font-bold text-white mb-1 transition-colors duration-200 group-hover:text-[var(--acc)]"
                     style={{ "--acc": cfg.accentHex } as React.CSSProperties}>
                    {cfg.label}
                  </p>
                  <p className="text-sm leading-snug line-clamp-2" style={{ color: "#6272a0" }}>
                    {cfg.description}
                  </p>
                </div>
                <div className="relative flex items-center justify-between">
                  <span className="font-mono text-xs" style={{ color: cfg.accentHex }}>
                    {key}.web3guides.com
                  </span>
                  <span className="text-xs opacity-40 group-hover:opacity-100 transition-all" style={{ color: cfg.accentHex }}>→</span>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* Purchase banner */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div
          className="relative overflow-hidden rounded-3xl p-8 md:p-12 text-center"
          style={{ background: "linear-gradient(135deg, rgba(124,106,255,0.15) 0%, rgba(59,158,255,0.10) 100%)", border: "1px solid rgba(124,106,255,0.25)" }}
        >
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,106,255,0.15), transparent)" }} />
          <div className="relative">
            <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: "#7c6aff" }}>
              🔥 Available now · On-chain NFT subdomains
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-extrabold text-white mb-3">
              Own your corner of Web3
            </h2>
            <p className="max-w-lg mx-auto mb-8" style={{ color: "#6272a0" }}>
              Crypto-native subdomains on web3guides.com. Launch your own guide site, newsletter, or community hub. Subdomains are NFTs — you truly own them.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <a
                href="/subdomains"
                className="rounded-xl px-8 py-3.5 text-sm font-bold text-white transition hover:opacity-90 hover:scale-105"
                style={{ background: "linear-gradient(135deg, #7c6aff, #3b9eff)", boxShadow: "0 0 40px rgba(124,106,255,0.35)" }}
              >
                How to get one →
              </a>
              <a
                href="https://app.doma.xyz/subdomain-claim/web3guides.com"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl px-8 py-3.5 text-sm font-semibold transition hover:text-white"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#a0aec0" }}
              >
                Claim on Doma.xyz ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm mt-auto"
              style={{ borderColor: "rgba(255,255,255,0.05)", color: "#6272a0" }}>
        © {new Date().getFullYear()} Web3Guides · Built on Next.js &amp; Supabase ·{" "}
        <a href="/subdomains" className="hover:text-white transition-colors" style={{ color: "#7c6aff" }}>
          Get a subdomain
        </a>
      </footer>
    </div>
  );
}
