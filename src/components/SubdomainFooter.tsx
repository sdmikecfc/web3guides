import type { SubdomainConfig } from "@/types";
import { SUBDOMAINS, VALID_SUBDOMAINS } from "@/lib/subdomains";

interface Props { subdomain: SubdomainConfig; }

export default function SubdomainFooter({ subdomain }: Props) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";
  const isDev = process.env.NODE_ENV === "development";
  const devRoot = process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ?? "localhost:3000";

  function subdomainHref(key: string) {
    if (isDev) return `http://${key}.${devRoot}`;
    return `https://${key}.${rootDomain}`;
  }

  return (
    <footer className="mt-auto border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">

        {/* Network grid */}
        <div className="mb-8">
          <p className="mb-4 font-mono text-xs uppercase tracking-widest" style={{ color: "var(--color-muted,#6272a0)" }}>
            The Web3Guides Network
          </p>
          <div className="flex flex-wrap gap-2">
            {VALID_SUBDOMAINS.map((key) => {
              const cfg = SUBDOMAINS[key];
              const active = key === subdomain.key;
              return (
                <a
                  key={key}
                  href={subdomainHref(key)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-all duration-200 ${
                    active ? "font-semibold" : "hover:text-white"
                  }`}
                  style={
                    active
                      ? { color: cfg.accentHex, background: cfg.glowHex, border: `1px solid ${cfg.accentHex}40` }
                      : { color: "var(--color-muted,#6272a0)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }
                  }
                >
                  {cfg.emoji} {cfg.label}
                </a>
              );
            })}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-start justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center"
             style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          <p className="font-mono text-xs" style={{ color: "var(--color-muted,#6272a0)" }}>
            © {new Date().getFullYear()}{" "}
            <span style={{ color: subdomain.accentHex }}>Web3Guides</span> · Built for the curious
          </p>
          <a
            href={isDev ? `http://${devRoot}` : `https://${rootDomain}`}
            className="font-mono text-xs transition-colors hover:text-white"
            style={{ color: "var(--color-muted,#6272a0)" }}
          >
            {rootDomain} ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
