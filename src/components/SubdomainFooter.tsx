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

  const homeHref = isDev ? `http://${devRoot}` : `https://${rootDomain}`;

  return (
    <footer style={{ marginTop: "auto", borderTop: "1px solid #e5e7eb", background: "#fff" }}>
      <div style={{ margin: "0 auto", maxWidth: 1280, padding: "40px 24px" }}>

        {/* Network grid */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af", marginBottom: 16 }}>
            The Web3Guides Network
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {VALID_SUBDOMAINS.map((key) => {
              const cfg = SUBDOMAINS[key];
              const active = key === subdomain.key;
              return (
                <a
                  key={key}
                  href={subdomainHref(key)}
                  style={
                    active
                      ? { display: "flex", alignItems: "center", gap: 6, borderRadius: 50, padding: "4px 14px", fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", fontWeight: 700, color: cfg.accentHex, background: `${cfg.accentHex}12`, border: `1px solid ${cfg.accentHex}40`, textDecoration: "none" }
                      : { display: "flex", alignItems: "center", gap: 6, borderRadius: 50, padding: "4px 14px", fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", textDecoration: "none" }
                  }
                >
                  {cfg.emoji} {cfg.label}
                </a>
              );
            })}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between", gap: 12, borderTop: "1px solid #e5e7eb", paddingTop: 24 }}>
          <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#9ca3af" }}>
              © {new Date().getFullYear()}{" "}
              <span style={{ color: subdomain.accentHex }}>Web3Guides</span> · Built for the curious
            </p>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <a
                href="https://doma.xyz"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#6b7280", textDecoration: "none" }}
              >
                Powered by Doma ↗
              </a>
              <a
                href={homeHref}
                style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#6b7280", textDecoration: "none" }}
              >
                {rootDomain} ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
