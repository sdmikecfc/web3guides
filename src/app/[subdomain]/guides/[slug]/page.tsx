import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getSubdomainConfig } from "@/lib/subdomains";
import { getGuide, getGuidesBySubdomain } from "@/lib/guides";
import { formatDate } from "@/lib/utils";
import DifficultyBadge from "@/components/DifficultyBadge";

export const dynamic = "force-dynamic";

interface Props { params: { subdomain: string; slug: string }; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = await getGuide(params.subdomain, params.slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.summary,
    openGraph: { title: guide.title, description: guide.summary, type: "article", publishedTime: guide.published_at },
  };
}

export default async function GuidePage({ params }: Props) {
  const cfg = getSubdomainConfig(params.subdomain);
  if (!cfg) notFound();

  const [guide, related] = await Promise.all([
    getGuide(params.subdomain, params.slug),
    getGuidesBySubdomain(params.subdomain, { limit: 4 }),
  ]);

  if (!guide) notFound();

  const relatedGuides = related.filter((g) => g.slug !== guide.slug).slice(0, 3);

  return (
    <div style={{ margin: "0 auto", maxWidth: 768, padding: "40px 24px" }}>

      {/* Breadcrumb */}
      <nav style={{ marginBottom: 32, display: "flex", alignItems: "center", gap: 8, fontFamily: "'Space Mono', monospace", fontSize: "0.75rem" }}>
        <Link href="/" style={{ color: "#9ca3af", textDecoration: "none" }}>
          {cfg.emoji} {cfg.label}
        </Link>
        <span style={{ color: "#d1d5db" }}>/</span>
        <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{guide.title}</span>
      </nav>

      {/* Header */}
      <header style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <DifficultyBadge difficulty={guide.difficulty} />
          {guide.read_time_minutes && (
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#9ca3af" }}>
              {guide.read_time_minutes} min read
            </span>
          )}
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#9ca3af" }}>
            {formatDate(guide.published_at)}
          </span>
        </div>

        <h1 style={{ fontFamily: "'Bungee', cursive", fontWeight: 400, fontSize: "clamp(1.8rem, 4vw, 2.5rem)", lineHeight: 1.1, color: "#1a1a1a", marginBottom: 16 }}>
          {guide.title}
        </h1>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.05rem", lineHeight: 1.65, color: "#6b7280" }}>{guide.summary}</p>
      </header>

      {/* Tags */}
      {guide.tags?.length > 0 && (
        <div style={{ marginBottom: 32, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {guide.tags.map((tag) => (
            <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`}
              style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", padding: "3px 10px", borderRadius: 50, background: `${cfg.accentHex}12`, color: cfg.accentHex, border: `1px solid ${cfg.accentHex}30`, textDecoration: "none" }}>
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {/* Accent divider */}
      <div style={{ marginBottom: 40, height: 2, background: `linear-gradient(to right, ${cfg.accentHex}60, transparent)`, borderRadius: 2 }} />

      {/* Article content (if AI-generated) */}
      {guide.content ? (
        <article style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", lineHeight: 1.8, color: "#374151", marginBottom: 40 }}
          dangerouslySetInnerHTML={{ __html: markdownToHtml(guide.content) }}
        />
      ) : (
        /* Source CTA for external guides */
        <div style={{ marginBottom: 40, borderRadius: 16, background: `${cfg.accentHex}08`, border: `1px solid ${cfg.accentHex}25`, padding: 24 }}>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: cfg.accentHex, marginBottom: 8 }}>
            Read the full guide
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#6b7280", marginBottom: 20 }}>
            This guide is hosted externally. Click below to read the complete article.
          </p>
          <a
            href={guide.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 12, padding: "10px 20px", fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "#fff", textDecoration: "none", background: cfg.accentHex }}
          >
            Open guide ↗
          </a>
        </div>
      )}

      {guide.author && (
        <p style={{ marginBottom: 40, fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#9ca3af" }}>
          Written by <span style={{ color: "#374151", fontWeight: 700 }}>{guide.author}</span>
        </p>
      )}

      {/* Related guides */}
      {relatedGuides.length > 0 && (
        <section style={{ marginTop: 48, borderTop: "1px solid #e5e7eb", paddingTop: 40 }}>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontWeight: 400, fontSize: "1.1rem", color: "#1a1a1a", marginBottom: 20 }}>
            More {cfg.label} guides
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {relatedGuides.map((g) => (
              <Link
                key={g.id}
                href={`/guides/${g.slug}`}
                style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb", padding: 16, textDecoration: "none" }}
              >
                <DifficultyBadge difficulty={g.difficulty} compact />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.title}
                  </p>
                  <p style={{ marginTop: 4, fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.summary}</p>
                </div>
                <span style={{ color: cfg.accentHex, flexShrink: 0, marginTop: 2 }}>→</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Minimal markdown-to-HTML converter for article content */
function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 style="font-family:\'Bungee\',cursive;font-weight:400;font-size:1.1rem;color:#1a1a1a;margin:28px 0 12px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-family:\'Bungee\',cursive;font-weight:400;font-size:1.3rem;color:#1a1a1a;margin:36px 0 16px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-family:\'Bungee\',cursive;font-weight:400;font-size:1.6rem;color:#1a1a1a;margin:40px 0 20px">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="font-family:\'Space Mono\',monospace;font-size:0.85em;background:#f3f4f6;border-radius:4px;padding:2px 6px">$1</code>')
    .replace(/^- (.+)$/gm, '<li style="margin:6px 0">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="padding-left:20px;margin:16px 0">$&</ul>')
    .replace(/\n\n/g, '</p><p style="margin:16px 0">')
    .replace(/^(?!<[h|u|l|p])(.+)$/gm, '<p style="margin:16px 0">$1</p>');
}
