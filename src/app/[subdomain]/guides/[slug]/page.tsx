import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getSubdomainConfig } from "@/lib/subdomains";
import { getGuide, getGuidesBySubdomain } from "@/lib/guides";
import { formatDate } from "@/lib/utils";
import DifficultyBadge from "@/components/DifficultyBadge";

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
      <nav className="mb-8 flex items-center gap-2 text-sm text-[#6b6b8a]">
        <Link href="/" className="hover:text-[var(--subdomain-accent)] transition-colors">
          {cfg.emoji} {cfg.label}
        </Link>
        <span>/</span>
        <span className="text-[#e2e2f0] line-clamp-1">{guide.title}</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <DifficultyBadge difficulty={guide.difficulty} />
          {guide.read_time_minutes && (
            <span className="font-mono text-xs text-[#6b6b8a]">
              {guide.read_time_minutes} min read
            </span>
          )}
          <span className="font-mono text-xs text-[#6b6b8a]">
            {formatDate(guide.published_at)}
          </span>
        </div>

        <h1 className="mb-4 font-display text-3xl font-extrabold tracking-tight text-white text-balance sm:text-4xl">
          {guide.title}
        </h1>

        <p className="text-lg leading-relaxed text-[#a0a0b8]">{guide.summary}</p>
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
          opacity: 0.3,
        }}
      />

      {/* Source CTA */}
      <div
        className="mb-10 rounded-2xl border p-6"
        style={{
          borderColor: "var(--color-border, #1e1e2e)",
          background: "var(--subdomain-glow)",
        }}
      >
        <p className="mb-1 font-display text-sm font-semibold uppercase tracking-widest"
           style={{ color: "var(--subdomain-accent)" }}>
          Read the full guide
        </p>
        <p className="mb-4 text-sm text-[#6b6b8a]">
          This guide is hosted externally. Click below to read the complete
          article.
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
        <p className="mb-10 text-sm text-[#6b6b8a]">
          Written by{" "}
          <span className="font-medium text-[#e2e2f0]">{guide.author}</span>
        </p>
      )}

      {/* Related guides */}
      {relatedGuides.length > 0 && (
        <section className="mt-12 border-t border-[#1e1e2e] pt-10">
          <h2 className="mb-5 font-display text-lg font-bold text-white">
            More {cfg.label} guides
          </h2>
          <div className="flex flex-col gap-3">
            {relatedGuides.map((g) => (
              <Link
                key={g.id}
                href={`/guides/${g.slug}`}
                className="group flex items-start gap-3 rounded-xl border border-[#1e1e2e] bg-[#12121a] p-4 transition hover:border-[var(--subdomain-accent)]"
              >
                <DifficultyBadge difficulty={g.difficulty} compact />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-[#e2e2f0] group-hover:text-[var(--subdomain-accent)] transition-colors">
                    {g.title}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-[#6b6b8a]">
                    {g.summary}
                  </p>
                </div>
                <span className="mt-0.5 shrink-0 text-[#6b6b8a] group-hover:text-[var(--subdomain-accent)] transition-colors">
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
