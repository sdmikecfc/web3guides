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
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">

      {/* Breadcrumb */}
      <nav className="mb-8 flex items-center gap-2 text-sm" style={{ color: "var(--color-muted,#6272a0)" }}>
        <Link href="/" className="transition-colors hover:text-white" style={{ color: "var(--color-muted)" }}>
          {cfg.emoji} {cfg.label}
        </Link>
        <span className="opacity-30">/</span>
        <span className="text-white/70 line-clamp-1">{guide.title}</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <DifficultyBadge difficulty={guide.difficulty} />
          {guide.read_time_minutes && (
            <span className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
              {guide.read_time_minutes} min read
            </span>
          )}
          <span className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
            {formatDate(guide.published_at)}
          </span>
        </div>

        <h1 className="mb-4 font-display text-3xl font-extrabold tracking-tight text-white text-balance sm:text-4xl">
          {guide.title}
        </h1>
        <p className="text-lg leading-relaxed" style={{ color: "var(--color-muted)" }}>{guide.summary}</p>
      </header>

      {/* Tags */}
      {guide.tags?.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          {guide.tags.map((tag) => (
            <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`} className="tag-pill">
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {/* Accent divider */}
      <div className="mb-10 accent-line" />

      {/* Source CTA */}
      <div
        className="mb-10 rounded-2xl glass p-6"
        style={{ border: `1px solid ${cfg.accentHex}25` }}
      >
        <p className="mb-1 font-display text-xs font-semibold uppercase tracking-widest" style={{ color: cfg.accentHex }}>
          Read the full guide
        </p>
        <p className="mb-5 text-sm" style={{ color: "var(--color-muted)" }}>
          This guide is hosted externally. Click below to read the complete article.
        </p>
        <a
          href={guide.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-lg active:scale-95"
          style={{
            background: cfg.accentHex,
            boxShadow: `0 0 30px ${cfg.glowHex}`,
          }}
        >
          Open guide ↗
        </a>
      </div>

      {guide.author && (
        <p className="mb-10 text-sm" style={{ color: "var(--color-muted)" }}>
          Written by <span className="font-medium text-white">{guide.author}</span>
        </p>
      )}

      {/* Related guides */}
      {relatedGuides.length > 0 && (
        <section className="mt-12 border-t pt-10" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <h2 className="mb-5 font-display text-lg font-bold text-white">
            More {cfg.label} guides
          </h2>
          <div className="flex flex-col gap-3">
            {relatedGuides.map((g) => (
              <Link
                key={g.id}
                href={`/guides/${g.slug}`}
                className="group flex items-start gap-3 rounded-xl glass p-4 transition-all hover:border-[var(--subdomain-accent)]"
              >
                <DifficultyBadge difficulty={g.difficulty} compact />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-white transition-colors group-hover:text-[var(--subdomain-accent)]">
                    {g.title}
                  </p>
                  <p className="mt-0.5 truncate text-sm" style={{ color: "var(--color-muted)" }}>{g.summary}</p>
                </div>
                <span className="mt-0.5 shrink-0 transition-colors group-hover:text-[var(--subdomain-accent)]"
                      style={{ color: "var(--color-muted)" }}>→</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
