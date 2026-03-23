import Link from "next/link";
import type { Guide } from "@/types";
import type { SubdomainConfig } from "@/types";
import DifficultyBadge from "@/components/DifficultyBadge";

interface Props {
  guides: Guide[];
  cfg: SubdomainConfig;
}

export default function RelatedArticles({ guides, cfg }: Props) {
  if (!guides.length) return null;

  const accent = cfg.accentHex;

  return (
    <section style={{ marginTop: 56, paddingTop: 40, borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span style={{ display: "inline-block", width: 3, height: 18, borderRadius: 2, background: accent }} />
        <h2 style={{
          fontFamily: "'Bungee', cursive",
          fontWeight: 400,
          fontSize: "0.95rem",
          color: "#1a1a1a",
          margin: 0,
          letterSpacing: 0.3,
        }}>
          Keep reading
        </h2>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", color: "#9ca3af" }}>
          More {cfg.label} guides
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {guides.map((g) => (
          <Link
            key={g.id}
            href={`/guides/${g.slug}`}
            style={{ textDecoration: "none" }}
          >
            <div style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: "18px 20px",
              height: "100%",
              boxSizing: "border-box",
              transition: "border-color 0.2s, box-shadow 0.2s, transform 0.15s",
              cursor: "pointer",
            }}
              onMouseOver={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = accent;
                el.style.boxShadow = `0 4px 16px ${accent}20`;
                el.style.transform = "translateY(-2px)";
              }}
              onMouseOut={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "#e5e7eb";
                el.style.boxShadow = "none";
                el.style.transform = "none";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <DifficultyBadge difficulty={g.difficulty} compact />
                {g.read_time_minutes && (
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: "#9ca3af" }}>
                    {g.read_time_minutes} min
                  </span>
                )}
              </div>
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: "#1a1a1a",
                margin: "0 0 8px",
                lineHeight: 1.4,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical" as "vertical",
                overflow: "hidden",
              }}>
                {g.title}
              </p>
              {g.summary && (
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "0.78rem",
                  color: "#6b7280",
                  margin: 0,
                  lineHeight: 1.5,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as "vertical",
                  overflow: "hidden",
                }}>
                  {g.summary}
                </p>
              )}
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.75rem", fontWeight: 700, color: accent }}>
                  Read guide
                </span>
                <span style={{ color: accent, fontSize: "0.75rem" }}>→</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
