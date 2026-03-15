import type { SubdomainConfig } from "@/types";
import { SUBDOMAINS, VALID_SUBDOMAINS } from "@/lib/subdomains";

interface Props {
  subdomain: SubdomainConfig;
}

export default function SubdomainFooter({ subdomain }: Props) {
  const rootDomain =
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";
  const isDev = process.env.NODE_ENV === "development";
  const devRoot =
    process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ?? "localhost:3000";

  function subdomainHref(key: string) {
    if (isDev) return `http://${key}.${devRoot}`;
    return `https://${key}.${rootDomain}`;
  }

  return (
    <footer className="mt-auto border-t border-[#1e1e2e] bg-[#0a0a0f]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Network grid */}
        <div className="mb-8">
          <p className="mb-4 font-mono text-xs uppercase tracking-widest text-[#6b6b8a]">
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
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs transition ${
                    active
                      ? "border-current font-semibold"
                      : "border-[#1e1e2e] text-[#6b6b8a] hover:border-[#2a2a3e] hover:text-[#e2e2f0]"
                  }`}
                  style={active ? { color: cfg.accentHex, borderColor: cfg.accentHex + "60" } : {}}
                >
                  <span>{cfg.emoji}</span>
                  {cfg.label}
                </a>
              );
            })}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-start justify-between gap-3 border-t border-[#1e1e2e] pt-6 sm:flex-row sm:items-center">
          <p className="font-mono text-xs text-[#6b6b8a]">
            © {new Date().getFullYear()}{" "}
            <span style={{ color: subdomain.accentHex }}>Web3Guides</span> ·
            Built for the curious
          </p>
          <a
            href={`https://${rootDomain}`}
            className="font-mono text-xs text-[#6b6b8a] hover:text-[#e2e2f0] transition-colors"
          >
            {rootDomain} ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
