import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getSubdomainConfig } from "@/lib/subdomains";
import { getGuide, getGuidesBySubdomain, getRelatedGuides } from "@/lib/guides";
import { formatDate } from "@/lib/utils";
import DifficultyBadge from "@/components/DifficultyBadge";
import { ArticleClient } from "@/components/ArticleClient";
import { extractToc } from "@/lib/extractToc";
import { parseArticleSections } from "@/lib/parseArticleSections";
import { ArticleVisualBlock } from "@/components/ArticleVisual";
import ArticleAffiliatePanel from "@/components/ArticleAffiliatePanel";
import RelatedArticles from "@/components/RelatedArticles";
import type { ArticleVisual } from "@/types";

export const dynamic = "force-dynamic";

interface Props { params: { subdomain: string; slug: string }; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = await getGuide(params.subdomain, params.slug);
  if (!guide) return {};
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";
  const canonical = `https://${params.subdomain}.${rootDomain}/guides/${params.slug}`;
  // Absolute URL on www — subdomain URLs are unreliable for social media crawlers
  const ogImage = `https://www.${rootDomain}/api/og?sub=${encodeURIComponent(params.subdomain)}&t=${encodeURIComponent(guide.title)}`;
  return {
    title: guide.title,
    description: guide.summary,
    alternates: { canonical },
    openGraph: {
      title: guide.title,
      description: guide.summary,
      type: "article",
      publishedTime: guide.published_at,
      url: canonical,
      images: [{ url: ogImage, width: 1200, height: 420, alt: guide.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.summary,
      images: [ogImage],
    },
  };
}

/** Hex → [r, g, b] */
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export default async function GuidePage({ params }: Props) {
  const cfg = getSubdomainConfig(params.subdomain);
  if (!cfg) notFound();

  const [guide, sidebarRelated] = await Promise.all([
    getGuide(params.subdomain, params.slug),
    getGuidesBySubdomain(params.subdomain, { limit: 6 }),
  ]);

  if (!guide) notFound();

  const relatedGuides = sidebarRelated.filter((g) => g.slug !== guide.slug).slice(0, 4);

  // Tag-scored related articles for the below-body panel (fetched after guide is known)
  const bottomRelated = await getRelatedGuides(
    params.subdomain,
    params.slug,
    guide.tags ?? [],
    3
  );
  const toc = guide.content ? extractToc(guide.content) : [];
  const hasContent = !!guide.content;

  const { intro, sections } = hasContent
    ? parseArticleSections(guide.content!)
    : { intro: "", sections: [] };

  const rawVisuals: ArticleVisual[] = Array.isArray(guide.visuals) ? guide.visuals : [];
  const visualsByHeading = new Map<string, ArticleVisual>();
  for (const v of rawVisuals) {
    if (v.after_section) {
      visualsByHeading.set(v.after_section.replace(/^#+\s*/, "").toLowerCase().trim(), v);
    }
  }

  // Premium detection — flagship articles have key_points or "flagship" tag
  const isPremium = !!(
    (guide.key_points && guide.key_points.length >= 4) ||
    guide.tags?.includes("flagship")
  );

  // First stats visual for the "at a glance" bar
  const statsVisual = rawVisuals.find((v) => v.type === "stats") as
    | { type: "stats"; after_section: string; items: { value: string; label: string }[] }
    | undefined;

  const h2SectionIds = sections.filter((s) => s.level === 2).map((s) => s.id);
  const [r, g, b] = hexRgb(cfg.accentHex);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";
  const canonical = `https://${params.subdomain}.${rootDomain}/guides/${params.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.summary,
    url: canonical,
    datePublished: guide.published_at,
    dateModified: guide.published_at,
    author: { "@type": "Organization", name: "Web3Guides", url: `https://${rootDomain}` },
    publisher: {
      "@type": "Organization",
      name: "Web3Guides",
      url: `https://${rootDomain}`,
      logo: { "@type": "ImageObject", url: `https://${rootDomain}/favicon.svg` },
    },
    image: `https://www.${rootDomain}/api/og?sub=${encodeURIComponent(params.subdomain)}&t=${encodeURIComponent(guide.title)}`,
    keywords: (guide.tags ?? []).join(", "),
    articleSection: cfg.label,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Web3Guides", item: `https://${rootDomain}` },
        { "@type": "ListItem", position: 2, name: cfg.label, item: `https://${params.subdomain}.${rootDomain}` },
        { "@type": "ListItem", position: 3, name: guide.title, item: canonical },
      ],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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

        {/* ── HERO PANEL — full width, outside the 3-col grid ── */}
        <div style={{
          borderRadius: 24,
          overflow: "hidden",
          background: "linear-gradient(140deg, #0d0d1f 0%, #111827 100%)",
          position: "relative",
          padding: "52px 64px 48px",
          marginBottom: 32,
        }}>
              {/* Glow blob top-left */}
              <div style={{
                position: "absolute", top: -100, left: -80,
                width: 380, height: 380, borderRadius: "50%",
                background: `rgba(${r},${g},${b},0.22)`,
                pointerEvents: "none",
              }} />
              {/* Glow blob bottom-right */}
              <div style={{
                position: "absolute", bottom: -100, right: -60,
                width: 300, height: 300, borderRadius: "50%",
                background: `rgba(${r},${g},${b},0.15)`,
                pointerEvents: "none",
              }} />
              {/* Accent left line */}
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
                background: `linear-gradient(to bottom, ${cfg.accentHex}, transparent)`,
              }} />

              {/* Content */}
              <div style={{ position: "relative" }}>
                {/* Subdomain badge */}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: `rgba(${r},${g},${b},0.18)`,
                  border: `1px solid rgba(${r},${g},${b},0.35)`,
                  borderRadius: 8, padding: "5px 14px", marginBottom: 18,
                }}>
                  <span style={{ fontSize: 16 }}>{cfg.emoji}</span>
                  <span style={{
                    fontFamily: "'Space Mono', monospace", fontSize: "0.65rem",
                    letterSpacing: 3, color: cfg.accentHex, fontWeight: 700,
                  }}>
                    {cfg.label.toUpperCase()}
                  </span>
                </div>

                {/* Meta row */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <DifficultyBadge difficulty={guide.difficulty} />
                  {guide.read_time_minutes && (
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "rgba(255,255,255,0.45)" }}>
                      {guide.read_time_minutes} min read
                    </span>
                  )}
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "rgba(255,255,255,0.35)" }}>
                    {formatDate(guide.published_at)}
                  </span>
                </div>

                {/* Title */}
                <h1 style={{
                  fontFamily: "'Bungee', cursive", fontWeight: 400,
                  fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
                  lineHeight: 1.1, color: "#ffffff",
                  marginBottom: 16, letterSpacing: "-0.01em",
                }}>
                  {guide.title}
                </h1>

                {/* Summary */}
                <p style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: "1.05rem",
                  lineHeight: 1.65, color: "rgba(255,255,255,0.6)",
                  marginBottom: guide.tags?.length > 0 ? 20 : 0, maxWidth: 560,
                }}>
                  {guide.summary}
                </p>

                {/* Tags */}
                {guide.tags?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                    {guide.tags.map((tag: string) => (
                      <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`}
                        style={{
                          fontFamily: "'Space Mono', monospace", fontSize: "0.62rem",
                          padding: "3px 10px", borderRadius: 50,
                          background: `rgba(${r},${g},${b},0.15)`,
                          color: cfg.accentHex,
                          border: `1px solid rgba(${r},${g},${b},0.3)`,
                          textDecoration: "none",
                        }}>
                        #{tag}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Key points — "What you'll learn" */}
                {guide.key_points && guide.key_points.length > 0 && (
                  <div style={{
                    borderTop: `1px solid rgba(${r},${g},${b},0.22)`,
                    marginTop: 24, paddingTop: 22,
                  }}>
                    <div style={{
                      fontFamily: "'Space Mono', monospace", fontSize: "0.58rem",
                      letterSpacing: 3, color: "rgba(255,255,255,0.35)",
                      textTransform: "uppercase", marginBottom: 14,
                    }}>
                      What you&apos;ll learn
                    </div>
                    <div className="hero-key-points">
                      {guide.key_points.slice(0, 4).map((point: string, i: number) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <span style={{
                            color: cfg.accentHex, flexShrink: 0,
                            fontSize: "0.8rem", marginTop: 2, fontWeight: 700,
                          }}>→</span>
                          <span style={{
                            fontFamily: "'DM Sans', sans-serif",
                            fontSize: "0.85rem", color: "rgba(255,255,255,0.7)",
                            lineHeight: 1.5,
                          }}>
                            {point}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
        </div>

        {/* ── Premium: stats at a glance bar ── */}
        {isPremium && statsVisual && statsVisual.items?.length > 0 && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 2,
            marginBottom: 24, borderRadius: 16, overflow: "hidden",
            border: `1px solid ${cfg.accentHex}25`,
          }}>
            {statsVisual.items.slice(0, 4).map((item, i) => (
              <div key={i} style={{
                flex: "1 1 120px",
                background: i % 2 === 0 ? `${cfg.accentHex}08` : `${cfg.accentHex}04`,
                padding: "18px 20px",
                textAlign: "center",
              }}>
                <div style={{
                  fontFamily: "'Bungee', cursive", fontWeight: 400,
                  fontSize: "1.5rem", color: cfg.accentHex, lineHeight: 1,
                }}>{item.value}</div>
                <div style={{
                  fontFamily: "'Space Mono', monospace", fontSize: "0.6rem",
                  color: "#6b7280", marginTop: 6, letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}>{item.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── 3-column layout — starts below the hero ── */}
        <div className="article-grid">

          {/* Left: sticky TOC + progress bar */}
          <div className="article-toc-col">
            <ArticleClient accentHex={cfg.accentHex} toc={toc} />
          </div>

          {/* Center: article body */}
          <main className="article-main">

            {/* ── ARTICLE BODY ──────────────────────────────────────── */}
            {hasContent ? (
              <article>

                {/* Intro — content before first H2 */}
                {intro.trim() && (
                  <div style={{
                    borderLeft: `4px solid ${cfg.accentHex}`,
                    background: `${cfg.accentHex}06`,
                    borderRadius: "0 16px 16px 0",
                    padding: "22px 28px",
                    marginBottom: 16,
                  }}>
                    <div className="article-body" style={{ margin: 0 }}
                      dangerouslySetInnerHTML={{ __html: sectionToHtml(intro, cfg.accentHex) }} />
                  </div>
                )}

                {/* Sections */}
                {sections.map((section) => {
                  const visual = visualsByHeading.get(section.heading.toLowerCase().trim());
                  const isH2 = section.level === 2;
                  const h2Num = isH2 ? h2SectionIds.indexOf(section.id) + 1 : null;

                  if (isH2) {
                    return (
                      <div key={section.id} style={{
                        background: isPremium
                          ? `linear-gradient(145deg, ${cfg.accentHex}06 0%, #fafafa 100%)`
                          : "#fafafa",
                        border: isPremium
                          ? `1px solid ${cfg.accentHex}30`
                          : "1px solid #f0ece4",
                        borderLeft: isPremium ? `3px solid ${cfg.accentHex}` : undefined,
                        borderRadius: 20,
                        padding: "30px 36px",
                        marginBottom: 16,
                      }}>
                        {/* Section header: number badge + heading */}
                        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
                          <span style={{
                            fontFamily: "'Space Mono', monospace",
                            fontSize: "0.58rem", fontWeight: 700,
                            color: cfg.accentHex,
                            background: `${cfg.accentHex}10`,
                            border: `1px solid ${cfg.accentHex}25`,
                            borderRadius: 6, padding: "4px 8px",
                            letterSpacing: 1, flexShrink: 0,
                          }}>
                            {String(h2Num).padStart(2, "0")}
                          </span>
                          <h2 id={section.id} style={{
                            fontFamily: "'Bungee', cursive", fontWeight: 400,
                            fontSize: "1.3rem", color: "#1a1a1a",
                            scrollMarginTop: 100, margin: 0, lineHeight: 1.2,
                          }}>
                            {section.heading}
                          </h2>
                        </div>

                        {/* Body */}
                        <div className="article-body" style={{ margin: 0, marginBottom: visual ? 24 : 0 }}
                          dangerouslySetInnerHTML={{ __html: sectionToHtml(section.bodyLines.join("\n"), cfg.accentHex) }} />

                        {/* AI-authored visual */}
                        {visual && (
                          <ArticleVisualBlock visual={visual} accentHex={cfg.accentHex} />
                        )}
                      </div>
                    );
                  }

                  // H3 — lightweight, indented, no card
                  return (
                    <div key={section.id} style={{ paddingLeft: 8, marginBottom: 12 }}>
                      <h3 id={section.id} style={{
                        fontFamily: "'Bungee', cursive", fontWeight: 400,
                        fontSize: "1.05rem", color: "#374151",
                        margin: "20px 0 10px", scrollMarginTop: 100,
                        borderLeft: `3px solid ${cfg.accentHex}40`,
                        paddingLeft: 14,
                      }}>
                        {section.heading}
                      </h3>
                      <div className="article-body" style={{ margin: 0, paddingLeft: 17 }}
                        dangerouslySetInnerHTML={{ __html: sectionToHtml(section.bodyLines.join("\n"), cfg.accentHex) }} />
                      {visual && (
                        <div style={{ marginTop: 20, paddingLeft: 17 }}>
                          <ArticleVisualBlock visual={visual} accentHex={cfg.accentHex} />
                        </div>
                      )}
                    </div>
                  );
                })}
              <ArticleAffiliatePanel tags={guide.tags ?? []} accentHex={cfg.accentHex} />
              <RelatedArticles guides={bottomRelated} cfg={cfg} />
              </article>
            ) : (
              /* External guide fallback */
              <div style={{ marginBottom: 40, borderRadius: 16, background: `${cfg.accentHex}08`, border: `1px solid ${cfg.accentHex}25`, padding: 24 }}>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: cfg.accentHex, marginBottom: 8 }}>
                  Read the full guide
                </p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#6b7280", marginBottom: 20 }}>
                  This guide is hosted externally. Click below to read the complete article.
                </p>
                <a
                  href={guide.source_url}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 12, padding: "10px 20px", fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "#fff", textDecoration: "none", background: cfg.accentHex }}
                >
                  Open guide ↗
                </a>
              </div>
            )}

            {/* Attribution banner — shown for articles syndicated from blog.doma.xyz */}
            {guide.source_url?.startsWith("https://blog.doma.xyz") && (
              <div style={{
                marginTop: 32,
                borderRadius: 16,
                border: `1px solid ${cfg.accentHex}30`,
                background: `${cfg.accentHex}08`,
                padding: "20px 24px",
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
              }}>
                <span style={{ fontSize: "1.4rem", flexShrink: 0, marginTop: 2 }}>✍️</span>
                <div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px 0" }}>
                    Originally published by {guide.author ?? "Doma Foundation"}
                  </p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
                    This article was first published on the{" "}
                    <a href={guide.source_url} target="_blank" rel="noopener noreferrer"
                      style={{ color: cfg.accentHex, fontWeight: 600, textDecoration: "none" }}>
                      Doma Blog
                    </a>
                    . Republished on web3guides.com with attribution to support the Doma community.
                    All credit to the original authors.
                  </p>
                </div>
              </div>
            )}

            {/* Author */}
            {guide.author && !guide.source_url?.startsWith("https://blog.doma.xyz") && (
              <p style={{ marginTop: 24, marginBottom: 12, fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#9ca3af" }}>
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
                  {guide.source_url?.startsWith("https://blog.doma.xyz") && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
                      <a href={guide.source_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none" }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", color: "#9ca3af" }}>Original source</span>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", fontWeight: 700, color: cfg.accentHex }}>Doma Blog ↗</span>
                      </a>
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
                          display: "block", padding: "10px 0",
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

/** Convert markdown to HTML — supports links, images, code blocks, blockquotes, lists */
function sectionToHtml(md: string, accent: string = "#6b7280"): string {
  let s = md;

  // 1. Fenced code blocks — protect before any other processing
  s = s.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) =>
    `<pre style="background:#1a1a2e;border-radius:10px;padding:18px 22px;overflow-x:auto;margin:20px 0;border:1px solid rgba(255,255,255,0.1)"><code style="font-family:'Space Mono',monospace;font-size:0.8em;color:#e2e8f0;line-height:1.7;white-space:pre">${
      code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }</code></pre>`
  );

  // 2. Images — must come before link regex so ![ is not consumed by link pattern
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) =>
    `<figure style="margin:24px 0 20px"><img src="${src}" alt="${alt}" style="width:100%;border-radius:14px;display:block;border:1px solid #e5e7eb" loading="lazy" />${
      alt ? `<figcaption style="text-align:center;font-size:0.72rem;color:#9ca3af;margin-top:8px;font-family:'Space Mono',monospace">${alt}</figcaption>` : ""
    }</figure>`
  );

  // 3. Inline links — negative lookbehind for ! prevents re-matching already-processed images
  s = s.replace(/(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
    const ext = href.startsWith("http");
    return `<a href="${href}"${ext ? ' target="_blank" rel="noopener noreferrer sponsored"' : ""} style="color:${accent};font-weight:600;text-decoration:underline;text-underline-offset:2px;text-decoration-color:${accent}60">${text}</a>`;
  });

  // 4. H3 sub-headings
  s = s.replace(/^### (.+)$/gm, (_, t) =>
    `<h3 id="${slugId(t)}" style="font-family:'Bungee',cursive;font-weight:400;font-size:1.05rem;color:#374151;margin:24px 0 10px;scroll-margin-top:100px;padding-left:14px;border-left:3px solid ${accent}40">${t}</h3>`
  );

  // 5. Bold → italic → inline code (bold first so ** isn't accidentally caught by single-* rule)
  s = s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`\n]+)`/g, `<code style="font-family:'Space Mono',monospace;font-size:0.82em;background:#f0ece4;border-radius:4px;padding:2px 6px;color:#374151">$1</code>`);

  // 6. Blockquotes → styled pull-quotes
  s = s.replace(/^> (.+)$/gm, (_, text) =>
    `<blockquote style="border-left:4px solid ${accent};background:${accent}0d;margin:20px 0;padding:14px 22px;border-radius:0 14px 14px 0;font-style:italic;color:#374151;font-size:1.02rem;line-height:1.65">${text}</blockquote>`
  );

  // 7. Unordered list items — mark with a unique sentinel class
  const LI = `<li class="md-li" style="margin:7px 0;display:flex;align-items:flex-start;gap:8px"><span style="color:${accent};flex-shrink:0;margin-top:2px">›</span><span>`;
  s = s.replace(/^[*-] (.+)$/gm, (_, item) => `${LI}${item}</span></li>`);

  // 8. Wrap consecutive <li class="md-li"> lines in <ul> — O(n) line-split, no backtracking
  {
    const lines = s.split("\n");
    const out: string[] = [];
    let inList = false;
    for (const line of lines) {
      const isLi = line.startsWith(`<li class="md-li"`);
      if (isLi && !inList) { out.push(`<ul style="padding-left:0;margin:16px 0;list-style:none">`); inList = true; }
      if (!isLi && inList)  { out.push(`</ul>`); inList = false; }
      out.push(line);
    }
    if (inList) out.push(`</ul>`);
    s = out.join("\n");
  }

  // 9. Paragraph breaks — exclude ALL block-level tags from being double-wrapped
  //    Exclusion covers: h(eadings), u(l), o(l), l(i), p(re), b(lockquote), f(igure), d(iv)
  s = s
    .replace(/\n{2,}/g, `</p><p style="margin:16px 0">`)
    .replace(/^(?!<[hHuUoOlLpPbBfFdD])(.+)$/gm, `<p style="margin:16px 0">$1</p>`)
    .replace(/<p style="margin:16px 0"><\/p>/g, "");

  return s;
}

function slugId(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
