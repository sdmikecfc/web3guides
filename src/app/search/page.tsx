import type { Metadata } from "next";
import Link from "next/link";
import { searchGuides } from "@/lib/guides";
import { SUBDOMAINS, getSubdomainConfig } from "@/lib/subdomains";
import DifficultyBadge from "@/components/DifficultyBadge";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { q?: string };
}): Promise<Metadata> {
  const q = searchParams.q?.trim() ?? "";
  return {
    title: q ? `"${q}" — Search Web3Guides` : "Search — Web3Guides",
    description: q
      ? `Search results for "${q}" on Web3Guides. Find crypto and web3 guides on Ethereum, Bitcoin, DeFi, staking, security, and more.`
      : "Search every guide on Web3Guides — Ethereum, Bitcoin, DeFi, Layer 2, staking, crypto tax, security, and more.",
    robots: { index: false, follow: true },
  };
}

const TOPIC_LINKS = [
  { key: "eth",      label: "Ethereum",    color: "#3b9eff" },
  { key: "btc",      label: "Bitcoin",     color: "#f7931a" },
  { key: "defi",     label: "DeFi",        color: "#7c6aff" },
  { key: "sol",      label: "Solana",      color: "#00e5a0" },
  { key: "layer2",   label: "Layer 2",     color: "#a78bfa" },
  { key: "security", label: "Security",    color: "#f87171" },
  { key: "tax",      label: "Crypto Tax",  color: "#fb7185" },
  { key: "staking",  label: "Staking",     color: "#34d399" },
  { key: "rwa",      label: "Real Assets", color: "#fbbf24" },
  { key: "legal",    label: "Regulation",  color: "#60a5fa" },
  { key: "bridge",   label: "Bridges",     color: "#c084fc" },
  { key: "doma",     label: "Doma",        color: "#38bdf8" },
  { key: "jobs",     label: "Web3 Jobs",   color: "#a3e635" },
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q?.trim() ?? "";
  const results = q ? await searchGuides(q, 24) : [];

  const jsonLd = q
    ? {
        "@context": "https://schema.org",
        "@type": "SearchResultsPage",
        name: `Search results for "${q}"`,
        url: `https://${ROOT}/search?q=${encodeURIComponent(q)}`,
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <div style={{ minHeight: "100vh", background: "#0a0a0f", fontFamily: "system-ui, sans-serif" }}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)", borderBottom: "1px solid #21262d", padding: "20px 24px" }}>
          <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/" style={{ textDecoration: "none", color: "#7c6aff", fontWeight: 800, fontSize: "1.1rem", letterSpacing: -0.5, flexShrink: 0 }}>
              W3 <span style={{ color: "#6b7280", fontWeight: 400 }}>guides</span>
            </Link>
            <div style={{ flex: 1 }} />
          </div>
        </div>

        <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px 80px" }}>
          {/* Search form */}
          <form method="GET" action="/search" style={{ marginBottom: 40 }}>
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)",
                color: "#6b7280", fontSize: "1.1rem", pointerEvents: "none",
              }}>
                🔍
              </span>
              <input
                name="q"
                defaultValue={q}
                autoFocus={!q}
                placeholder="Search every guide on Web3Guides…"
                style={{
                  width: "100%",
                  background: "#161b22",
                  border: `1px solid ${q ? "#7c6aff" : "#30363d"}`,
                  borderRadius: 14,
                  padding: "16px 20px 16px 52px",
                  color: "#e6edf3",
                  fontSize: "1rem",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
              />
              {q && (
                <button
                  type="submit"
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "#7c6aff", color: "#fff", border: "none", borderRadius: 8,
                    padding: "8px 18px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                  }}
                >
                  Search
                </button>
              )}
            </div>
          </form>

          {/* Results */}
          {q ? (
            <>
              <p style={{ color: "#6b7280", fontSize: "0.85rem", marginBottom: 24 }}>
                {results.length > 0
                  ? `${results.length} guide${results.length === 1 ? "" : "s"} for "${q}"`
                  : `No guides found for "${q}"`}
              </p>

              {results.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {results.map((g) => {
                    const cfg = getSubdomainConfig(g.subdomain);
                    const accent = cfg?.accentHex ?? "#7c6aff";
                    return (
                      <a
                        key={g.id}
                        href={`https://${g.subdomain}.${ROOT}/guides/${g.slug}`}
                        style={{
                          display: "block",
                          background: "#0d1117",
                          border: "1px solid #21262d",
                          borderRadius: 14,
                          padding: "20px 24px",
                          textDecoration: "none",
                          transition: "border-color 0.2s, transform 0.15s",
                        }}
                        onMouseOver={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = accent;
                          (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                        }}
                        onMouseOut={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = "#21262d";
                          (e.currentTarget as HTMLElement).style.transform = "none";
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <span style={{
                            background: `${accent}22`,
                            color: accent,
                            borderRadius: 6,
                            padding: "2px 10px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            textTransform: "uppercase",
                          }}>
                            {cfg?.label ?? g.subdomain}
                          </span>
                          <DifficultyBadge difficulty={g.difficulty} compact />
                          {g.read_time_minutes && (
                            <span style={{ color: "#6b7280", fontSize: "0.75rem" }}>
                              {g.read_time_minutes} min
                            </span>
                          )}
                        </div>
                        <h2 style={{ margin: "0 0 6px", color: "#e6edf3", fontSize: "1rem", fontWeight: 700, lineHeight: 1.35 }}>
                          {g.title}
                        </h2>
                        {g.summary && (
                          <p style={{ margin: 0, color: "#8b949e", fontSize: "0.85rem", lineHeight: 1.55, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as "vertical" }}>
                            {g.summary}
                          </p>
                        )}
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "60px 24px" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>🔍</div>
                  <p style={{ color: "#6b7280", fontSize: "0.95rem", marginBottom: 24 }}>
                    No guides match that search. Try a broader term or browse by topic below.
                  </p>
                </div>
              )}
            </>
          ) : (
            /* No query — show topic browser */
            <>
              <h1 style={{ margin: "0 0 8px", color: "#e6edf3", fontSize: "1.5rem", fontWeight: 800 }}>
                Browse every topic
              </h1>
              <p style={{ margin: "0 0 32px", color: "#6b7280", fontSize: "0.9rem" }}>
                {Object.keys(SUBDOMAINS).length} topic areas. Hundreds of guides. All free.
              </p>
            </>
          )}

          {/* Topic grid — always shown */}
          <div style={{ marginTop: q && results.length > 0 ? 48 : 0 }}>
            {(q && results.length > 0) && (
              <p style={{ color: "#6b7280", fontSize: "0.78rem", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>
                Browse by topic
              </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {TOPIC_LINKS.map((t) => (
                <a
                  key={t.key}
                  href={`https://${t.key}.${ROOT}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#0d1117",
                    border: "1px solid #21262d",
                    borderRadius: 10,
                    padding: "12px 14px",
                    textDecoration: "none",
                    transition: "border-color 0.2s",
                  }}
                  onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.borderColor = t.color)}
                  onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "#21262d")}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                  <span style={{ color: "#e6edf3", fontSize: "0.82rem", fontWeight: 600 }}>{t.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
