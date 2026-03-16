import type { SubdomainConfig } from "@/types";
import { SUBDOMAINS, VALID_SUBDOMAINS } from "@/lib/subdomains";

interface Props {
  subdomain: SubdomainConfig;
}

const DOMA_URL = "https://app.doma.xyz/domain/web3guides.com";

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

  const apexHref = isDev ? `http://${devRoot}` : `https://${rootDomain}`;

  return (
    <footer className="mt-auto border-t border-[#1e2d3d] bg-[#0a0d12]">
      <div className="mx-auto max-w-7xl px-4 pt-10 pb-0 sm:px-6 lg:px-8">

        {/* ── Doma Protocol acquisition banner ─────────────────────────────── */}
        <div
          className="mb-10 rounded-2xl p-6 sm:p-7"
          style={{
            border: "1px solid rgba(245,166,35,0.2)",
            background: "linear-gradient(135deg, rgba(245,166,35,0.06) 0%, rgba(10,13,18,0.98) 55%)",
          }}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              {/* Diamond icon */}
              <div
                className="mt-0.5 flex shrink-0 items-center justify-center rounded-xl"
                style={{
                  width: "44px", height: "44px",
                  background: "rgba(245,166,35,0.1)",
                  border: "1px solid rgba(245,166,35,0.3)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2 L22 12 L12 22 L2 12 Z" stroke="#F5A623" strokeWidth="1.5" fill="none" />
                  <path d="M12 6 L18 12 L12 18 L6 12 Z" fill="#F5A623" opacity="0.25" />
                  <circle cx="12" cy="12" r="2" fill="#F5A623" opacity="0.8" />
                </svg>
              </div>
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest" style={{ color: "#F5A623", opacity: 0.6 }}>
                  Doma Protocol · Own This Domain
                </p>
                <p
                  className="mb-1.5"
                  style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: "20px", color: "#F5A623", letterSpacing: "0.04em", lineHeight: 1.2 }}
                >
                  web3guides.com Is Available On-Chain
                </p>
                <p className="font-mono text-xs leading-relaxed" style={{ color: "#a08c5a", maxWidth: "460px" }}>
                  Acquire <span style={{ color: "#c4a55a" }}>web3guides.com</span> as a verifiable on-chain digital asset via Doma Protocol — no central registrar, immutable ownership record.
                </p>
              </div>
            </div>
            <a
              href={DOMA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="doma-cta-btn shrink-0 self-start sm:self-center"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M12 2 L22 12 L12 22 L2 12 Z" stroke="#F5A623" strokeWidth="1.5" fill="none" />
                <circle cx="12" cy="12" r="2" fill="#F5A623" opacity="0.8" />
              </svg>
              View on Doma
              <span style={{ opacity: 0.6 }}>↗</span>
            </a>
          </div>
        </div>

        {/* ── Network grid ──────────────────────────────────────────────────── */}
        <div className="mb-8">
          <p className="mb-4 font-mono text-xs uppercase tracking-widest" style={{ color: "#4a6478" }}>
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
                    active ? "border-current font-semibold" : "border-[#1e2d3d]"
                  }`}
                  style={
                    active
                      ? { color: cfg.accentHex, borderColor: cfg.accentHex + "60" }
                      : { color: "#6a84a0" }
                  }
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLAnchorElement).style.color = "#b0c4d8";
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLAnchorElement).style.color = "#6a84a0";
                  }}
                >
                  <span>{cfg.emoji}</span>
                  {cfg.label}
                </a>
              );
            })}
          </div>
        </div>

        {/* ── Bottom bar ────────────────────────────────────────────────────── */}
        <div
          className="flex flex-col items-start justify-between gap-3 border-t pt-5 pb-6 sm:flex-row sm:items-center"
          style={{ borderColor: "#1e2d3d" }}
        >
          <p className="font-mono text-xs" style={{ color: "#4a6478" }}>
            © {new Date().getFullYear()}{" "}
            <span style={{ color: subdomain.accentHex }}>Web3Guides</span>{" "}
            · Built for the curious
          </p>
          <div className="flex items-center gap-4">
            <a
              href={DOMA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs transition-colors"
              style={{ color: "#6a5030", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#F5A623")}
              onMouseLeave={e => (e.currentTarget.style.color = "#6a5030")}
            >
              Own web3guides.com ↗
            </a>
            <a
              href={apexHref}
              className="font-mono text-xs transition-colors"
              style={{ color: "#4a6478", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#b0c4d8")}
              onMouseLeave={e => (e.currentTarget.style.color = "#4a6478")}
            >
              {rootDomain} ↗
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
