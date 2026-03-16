import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getSubdomainConfig } from "@/lib/subdomains";
import { getGuide, getGuidesBySubdomain } from "@/lib/guides";
import { formatDate } from "@/lib/utils";
import DifficultyBadge from "@/components/DifficultyBadge";
import { ArticleClient } from "@/components/ArticleClient";
import { extractToc } from "@/lib/extractToc";
import { parseArticleSections } from "@/lib/parseArticleSections";
import { SectionInfographic } from "@/components/SectionInfographic";

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
    getGuidesBySubdomain(params.subdomain, { limit: 6 }),
  ]);

  if (!guide) notFound();

  const relatedGuides = related.filter((g) => g.slug !== guide.slug).slice(0, 4);
  const toc = guide.content ? extractToc(guide.content) : [];
  const hasContent = !!guide.content;

  // Parse article into sections for section-level infographics
  const { intro, sections } = hasContent
    ? parseArticleSections(guide.content!)
    : { intro: "", sections: [] };

  // Pick which section indices get infographics (max 3, spaced apart)
  // Map: sectionIndex → infographicIndex (0, 1, 2) so we know which variant to render
  const infographicAt = new Map<number, number>();
  let placed = 0;
  for (let i = 0; i < sections.length && placed < 3; i++) {
    const s = sections[i];
    const hasData =
      s.bullets.length >= 2 || s.stats.length >= 2 || s.concepts.length >= 3;
    if (hasData && i > 0 && i % 2 === 1) {
      infographicAt.set(i, placed);
      placed++;
    }
  }
  // Always try to show at least 1 infographic if there's any usable section
  if (infographicAt.size === 0 && sections.length > 0) {
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (s.bullets.length >= 2 || s.stats.length >= 2) {
        infographicAt.set(i, 0);
        break;
      }
    }
  }

  return (
    <>
      <div className="article-page-wrap">

        {/* Breadcrumb */}
        <nav className="article-breadcrumb">
          <Link href="/" style={{ color: "#9ca3af", textDecoration: "none" }}>
            {cfg.emoji} {cfg.label}
          </Link>
          <span style={{ color: "#d1d5db" }}>/</span>
          <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {guide.title}
          </span>
        </nav>

        {/* 3-column layout */}
        <div className="article-grid">

          {/* Left: sticky TOC + progress bar */}
          <div className="article-toc-col">
            <ArticleClient accentHex={cfg.accentHex} toc={toc} />
          </div>

          {/* Center: article */}
          <main className="article-main">

            {/* Header */}
            <header style={{ marginBottom: 28 }}>
              <div style={{ marginBottom: 14, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
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

              <h1 style={{
                fontFamily: "'Bungee', cursive",
                fontWeight: 400,
                fontSize: "clamp(1.7rem, 3.5vw, 2.4rem)",
                lineHeight: 1.1,
                color: "#1a1a1a",
                marginBottom: 14,
              }}>
                {guide.title}
              </h1>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.05rem", lineHeight: 1.65, color: "#6b7280" }}>
                {guide.summary}
              </p>
            </header>

            {/* Tags */}
            {guide.tags?.length > 0 && (
              <div style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {guide.tags.map((tag: string) => (
                  <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`}
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: "0.65rem",
                      padding: "3px 10px",
                      borderRadius: 50,
                      background: `${cfg.accentHex}12`,
                      color: cfg.accentHex,
                      border: `1px solid ${cfg.accentHex}30`,
                      textDecoration: "none",
                    }}>
                    #{tag}
                  </Link>
                ))}
              </div>
            )}

            {/* Accent divider */}
            <div style={{ marginBottom: 32, height: 2, background: `linear-gradient(to right, ${cfg.accentHex}60, transparent)`, borderRadius: 2 }} />

            {/* Article body */}
            {hasContent ? (
              <article className="article-body">
                {/* Intro (content before first H2) */}
                {intro.trim() && (
                  <div dangerouslySetInnerHTML={{ __html: sectionToHtml(intro) }} />
                )}

                {/* Sections with infographics */}
                {sections.map((section, i) => (
                  <div key={section.id}>
                    {/* Section heading */}
                    {section.level === 2 ? (
                      <h2
                        id={section.id}
                        style={{
                          fontFamily: "'Bungee', cursive",
                          fontWeight: 400,
                          fontSize: "1.35rem",
                          color: "#1a1a1a",
                          margin: "40px 0 16px",
                          scrollMarginTop: 100,
                        }}
                      >
                        {section.heading}
                      </h2>
                    ) : (
                      <h3
                        id={section.id}
                        style={{
                          fontFamily: "'Bungee', cursive",
                          fontWeight: 400,
                          fontSize: "1.1rem",
                          color: "#1a1a1a",
                          margin: "28px 0 12px",
                          scrollMarginTop: 100,
                        }}
                      >
                        {section.heading}
                      </h3>
                    )}

                    {/* Section body */}
                    <div dangerouslySetInnerHTML={{ __html: sectionToHtml(section.bodyLines.join("\n")) }} />

                    {/* Infographic after this section */}
                    {infographicAt.has(i) && (
                      <div style={{ margin: "32px 0" }}>
                        <SectionInfographic
                          section={section}
                          accentHex={cfg.accentHex}
                          index={infographicAt.get(i) ?? 0}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </article>
            ) : (
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
              <p style={{ marginTop: 32, marginBottom: 12, fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#9ca3af" }}>
                Written by <span style={{ color: "#374151", fontWeight: 700 }}>{guide.author}</span>
              </p>
            )}

            {/* Mobile related */}
            {relatedGuides.length > 0 && (
              <section className="article-related-mobile" style={{ marginTop: 48, borderTop: "1px solid #e5e7eb", paddingTop: 32 }}>
                <h2 style={{ fontFamily: "'Bungee', cursive", fontWeight: 400, fontSize: "1rem", color: "#1a1a1a", marginBottom: 16 }}>
                  More {cfg.label} guides
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {relatedGuides.map((g) => (
                    <Link key={g.id} href={`/guides/${g.slug}`}
                      style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb", padding: 14, textDecoration: "none" }}>
                      <DifficultyBadge difficulty={g.difficulty} compact />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", fontWeight: 700, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.title}
                        </p>
                        <p style={{ marginTop: 3, fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.summary}</p>
                      </div>
                      <span style={{ color: cfg.accentHex, flexShrink: 0, marginTop: 2 }}>→</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </main>

          {/* Right: desktop sidebar */}
          <aside className="article-sidebar">
            <div style={{ position: "sticky", top: 80 }}>
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", letterSpacing: 2, color: "#9ca3af", textTransform: "uppercase", marginBottom: 12 }}>
                  About this guide
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", color: "#9ca3af" }}>Difficulty</span>
                    <DifficultyBadge difficulty={guide.difficulty} compact />
                  </div>
                  {guide.read_time_minutes && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", color: "#9ca3af" }}>Read time</span>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.72rem", color: "#374151" }}>{guide.read_time_minutes} min</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", color: "#9ca3af" }}>Published</span>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.72rem", color: "#374151" }}>{formatDate(guide.published_at)}</span>
                  </div>
                  {guide.author && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", color: "#9ca3af" }}>Author</span>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", fontWeight: 700, color: "#374151" }}>{guide.author}</span>
                    </div>
                  )}
                </div>
              </div>

              {relatedGuides.length > 0 && (
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", letterSpacing: 2, color: "#9ca3af", textTransform: "uppercase", marginBottom: 14 }}>
                    More {cfg.label}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {relatedGuides.map((g, i) => (
                      <Link key={g.id} href={`/guides/${g.slug}`}
                        style={{
                          display: "block",
                          padding: "10px 0",
                          borderBottom: i < relatedGuides.length - 1 ? "1px solid #f3f4f6" : "none",
                          textDecoration: "none",
                        }}>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.82rem", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.3, marginBottom: 4 }}>
                          {g.title}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <DifficultyBadge difficulty={g.difficulty} compact />
                          {g.read_time_minutes && (
                            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", color: "#9ca3af" }}>
                              {g.read_time_minutes}m
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                  <Link href="/" style={{ display: "block", marginTop: 14, textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", fontWeight: 700, color: cfg.accentHex, textDecoration: "none" }}>
                    View all guides →
                  </Link>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

/** Convert a markdown section body (no headings) to HTML */
function sectionToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, (_, t) => `<h3 id="${slugId(t)}" style="font-family:'Bungee',cursive;font-weight:400;font-size:1.1rem;color:#1a1a1a;margin:28px 0 12px;scroll-margin-top:100px">${t}</h3>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code style=\"font-family:'Space Mono',monospace;font-size:0.85em;background:#f3f4f6;border-radius:4px;padding:2px 6px\">$1</code>")
    .replace(/^- (.+)$/gm, "<li style=\"margin:6px 0\">$1</li>")
    .replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g, (match) => `<ul style="padding-left:20px;margin:16px 0">${match}</ul>`)
    .replace(/\n{2,}/g, "</p><p style=\"margin:16px 0\">")
    .replace(/^(?!<[hHuUlLpP])(.+)$/gm, "<p style=\"margin:16px 0\">$1</p>")
    .replace(/<p style="margin:16px 0"><\/p>/g, "");
}

function slugId(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
