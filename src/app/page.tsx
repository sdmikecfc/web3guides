import Link from "next/link";
import { SUBDOMAINS, VALID_SUBDOMAINS } from "@/lib/subdomains";

export default function ApexHomePage() {
  const rootDomain =
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";
  const isDev = process.env.NODE_ENV === "development";
  const devRoot =
    process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ?? "localhost:3000";

  function subdomainHref(key: string): string {
    if (isDev) {
      return `http://${key}.${devRoot}`;
    }
    return `https://${key}.${rootDomain}`;
  }

  return (
    <div className="min-h-screen grid-bg">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,106,255,0.25), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2a2a3e] bg-[#12121a] px-4 py-1.5 text-xs font-mono text-[#7c6aff]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00e5a0] animate-pulse" />
            14 specialist crypto education hubs
          </div>
          <h1 className="mb-5 text-5xl font-display font-extrabold tracking-tight text-white md:text-7xl">
            Web3Guides
          </h1>
          <p className="mx-auto max-w-xl text-lg text-[#6b6b8a]">
            The most thorough crypto education network on the internet. Pick
            your topic and dive deep.
          </p>
        </div>
      </section>

      {/* Subdomain grid */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {VALID_SUBDOMAINS.map((key, i) => {
            const cfg = SUBDOMAINS[key];
            return (
              <a
                key={key}
                href={subdomainHref(key)}
                className="group relative flex flex-col gap-3 rounded-2xl border border-[#1e1e2e] bg-[#12121a] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-opacity-80"
                style={
                  {
                    "--hover-accent": cfg.accentHex,
                    animationDelay: `${i * 40}ms`,
                  } as React.CSSProperties
                }
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
                  style={{ background: cfg.glowHex }}
                >
                  {cfg.emoji}
                </div>
                <div>
                  <p
                    className="font-display font-bold text-white group-hover:text-[var(--hover-accent)] transition-colors"
                    style={{ "--hover-accent": cfg.accentHex } as React.CSSProperties}
                  >
                    {cfg.label}
                  </p>
                  <p className="mt-1 text-sm leading-snug text-[#6b6b8a] line-clamp-2">
                    {cfg.description}
                  </p>
                </div>
                <div className="mt-auto flex items-center gap-1 text-xs font-mono"
                     style={{ color: cfg.accentHex }}>
                  <span>{key}.web3guides.com</span>
                  <span className="opacity-60">→</span>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-[#1e1e2e] py-8 text-center text-sm text-[#6b6b8a]">
        © {new Date().getFullYear()} Web3Guides · Built on Next.js 14 & Supabase
      </footer>
    </div>
  );
}
