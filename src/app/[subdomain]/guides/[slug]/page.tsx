import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getSubdomainConfig } from "@/lib/subdomains";
import { getGuide, getGuidesBySubdomain } from "@/lib/guides";
import { formatDate } from "@/lib/utils";
import DifficultyBadge from "@/components/DifficultyBadge";

const DOMA_URL = "https://app.doma.xyz/domain/web3guides.com";

interface Props {
  params: { subdomain: string; slug: string };
}

export const revalidate = 120;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = await getGuide(params.subdomain, params.slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.summary,
    openGraph: {
      title: guide.title,
      description: guide.summary,
      type: "article",
      publishedTime: guide.published_at,
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const cfg = getSubdomainConfig(params.subdomain);
  if (!cfg) notFound();

  const [guide, related] = await Promise.all([
    getGuide(params.subdomain, params.slug),
    getGuidesBySubdomain(params.subdomain, { limit: 3 }),
  ]);

  if (!guide) notFound();

  const relatedGuides = related.filter((g) => g.slug !== guide.slug).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-8 flex items-center gap-2 text-sm" style={{ color: "#7a94a8" }}>
        <Link
          href="/"
          className="transition-colors hover:text-[var(--subdomain-accent)]"
        >
          {cfg.emoji} {cfg.label}
        </Link>
        <span>/</span>
        <span className="line-clamp-1" style={{ color: "#eef2f8" }}>{guide.title}</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <DifficultyBadge difficulty={guide.difficulty} />
          {guide.read_time_minutes && (
            <span className="font-mono text-xs" style={{ color: "#7a94a8" }}>
              {guide.read_time_minutes} min read
            </span>
          )}
          <span className="font-mono text-xs" style={{ color: "#7a94a8" }}>
            {formatDate(guide.published_at)}
          </span>
        </div>

        <h1 className="mb-4 font-display text-3xl font-extrabold tracking-tight text-white text-balance sm:text-4xl">
          {guide.title}
        </h1>

        <p className="text-lg leading-relaxed" style={{ color: "#9ab0c4" }}>{guide.summary}</p>
      </header>

      {/* Tags */}
      {guide.tags && guide.tags.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          {guide.tags.map((tag) => (
            <Link
              key={tag}
              href={`/?tag=${encodeURIComponent(tag)}`}
              className="tag-pill hover:text-[var(--subdomain-accent)] hover:border-[var(--subdomain-accent)]"
            >
              # {tag}
            </Link>
          ))}
        </div>
      )}

      {/* Divider */}
      <div
        className="mb-10 h-px w-full"
        style={{
          background: `linear-gradient(to right, var(--subdomain-accent), transparent)`,
          opacity: 0.35,
        }}
      />

      {/* Source CTA */}
      <div
        className="mb-10 rounded-2xl border p-6"
        style={{
          borderColor: "var(--color-border, #1e2d3d)",
          background: "var(--subdomain-glow)",
        }}
      >
        <p
          className="mb-1 font-display text-sm font-semibold uppercase tracking-widest"
          style={{ color: "var(--subdomain-accent)" }}
        >
          Read the full guide
        </p>
        <p className="mb-4 text-sm" style={{ color: "#7a94a8" }}>
          This guide is hosted externally. Click below to read the complete article.
        </p>
        <a
          href={guide.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95"
          style={{ background: "var(--subdomain-accent)" }}
        >
          Open guide ↗
        </a>
      </div>

      {/* Author */}
      {guide.author && (
        <p className="mb-8 text-sm" style={{ color: "#7a94a8" }}>
          Written by{" "}
          <span className="font-medium" style={{ color: "#eef2f8" }}>{guide.author}</span>
        </p>
      )}

      {/* Doma Protocol inline link */}
      <div
        className="mb-10 flex items-center justify-between gap-4 rounded-xl px-5 py-3"
        style={{
          border: "1px solid rgba(245,166,35,0.18)",
          background: "rgba(245,166,35,0.04)",
        }}
      >
        <div className="flex items-center gap-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M12 2 L22 12 L12 22 L2 12 Z" stroke="#F5A623" strokeWidth="1.5" fill="none" />
            <circle cx="12" cy="12" r="2" fill="#F5A623" opacity="0.8" />
          </svg>
          <p className="font-mono text-xs" style={{ color: "#8a7040" }}>
            <span style={{ color: "#c4a040" }}>web3guides.com</span> is available to own on-chain via Doma Protocol
          </p>
        </div>
        <a
          href={DOMA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 font-mono text-xs transition-opacity hover:opacity-75"
          style={{ color: "#F5A623", textDecoration: "none" }}
        >
          View ↗
        </a>
      </div>

      {/* Related guides */}
      {relatedGuides.length > 0 && (
        <section className="mt-12 border-t pt-10" style={{ borderColor: "#1e2d3d" }}>
          <h2 className="mb-5 font-display text-lg font-bold text-white">
            More {cfg.label} guides
          </h2>
          <div className="flex flex-col gap-3">
            {relatedGuides.map((g) => (
              <Link
                key={g.id}
                href={`/guides/${g.slug}`}
                className="group flex items-start gap-3 rounded-xl border p-4 transition hover:border-[var(--subdomain-accent)]"
                style={{ borderColor: "#1e2d3d", background: "#0d1117" }}
              >
                <DifficultyBadge difficulty={g.difficulty} compact />
                <div className="flex-1 min-w-0">
                  <p
                    className="truncate font-medium transition-colors group-hover:text-[var(--subdomain-accent)]"
                    style={{ color: "#eef2f8" }}
                  >
                    {g.title}
                  </p>
                  <p className="mt-0.5 truncate text-sm" style={{ color: "#7a94a8" }}>
                    {g.summary}
                  </p>
                </div>
                <span
                  className="mt-0.5 shrink-0 transition-colors group-hover:text-[var(--subdomain-accent)]"
                  style={{ color: "#7a94a8" }}
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
