import Link from "next/link";
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
    <div className="page-content min-h-screen">
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative px-6 pt-28 pb-16 text-center">
        <div className="relative mx-auto max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full glass px-4 py-2 text-xs font-mono"
               style={{ color: "var(--subdomain-accent, #7c6aff)" }}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#00e5a0] animate-pulse" />
            14 specialist crypto education hubs
          </div>

          <h1 className="mb-5 font-display text-6xl font-extrabold tracking-tight text-white text-glow md:text-8xl">
            Web3
            <span style={{ color: "var(--subdomain-accent,#7c6aff)" }}>Guides</span>
          </h1>

          <p className="mx-auto max-w-lg text-lg leading-relaxed" style={{ color: "var(--color-muted,#6272a0)" }}>
            The most comprehensive crypto education network on the internet.
            Pick your topic and go deep.
          </p>

          {/* Decorative accent line */}
          <div className="mt-10 accent-line w-48 mx-auto" />
        </div>
      </section>

      {/* ── Subdomain grid ──────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-28">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {VALID_SUBDOMAINS.map((key, i) => {
            const cfg = SUBDOMAINS[key];
            return (
              <a
                key={key}
                href={subdomainHref(key)}
                className="group relative flex flex-col gap-3 rounded-2xl glass card-hover p-5"
                style={{
                  animationDelay: `${i * 45}ms`,
                  "--subdomain-accent": cfg.accentHex,
                  "--subdomain-glow":   cfg.glowHex,
                } as React.CSSProperties}
              >
                {/* Accent corner glow */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse 80% 60% at 0% 0%, ${cfg.glowHex}, transparent)` }}
                />

                <div
                  className="relative flex h-11 w-11 items-center justify-center rounded-xl text-xl transition-transform duration-200 group-hover:scale-110"
                  style={{ background: cfg.glowHex, border: `1px solid ${cfg.accentHex}30` }}
                >
                  {cfg.emoji}
                </div>

                <div className="relative">
                  <p className="font-display font-bold text-white transition-colors duration-200 group-hover:text-[var(--subdomain-accent)]">
                    {cfg.label}
                  </p>
                  <p className="mt-1 text-sm leading-snug line-clamp-2" style={{ color: "var(--color-muted,#6272a0)" }}>
                    {cfg.description}
                  </p>
                </div>

                <div className="relative mt-auto flex items-center gap-1 font-mono text-xs"
                     style={{ color: cfg.accentHex }}>
                  <span>{key}.web3guides.com</span>
                  <span className="opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">→</span>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm"
              style={{ borderColor: "var(--color-border,#1c2236)", color: "var(--color-muted,#6272a0)" }}>
        © {new Date().getFullYear()} Web3Guides · Built on Next.js 14 &amp; Supabase
      </footer>
    </div>
  );
}
