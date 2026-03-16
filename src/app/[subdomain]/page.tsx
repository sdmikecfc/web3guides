import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSubdomainConfig } from "@/lib/subdomains";
import { getGuidesBySubdomain, countGuides } from "@/lib/guides";
import GuideCard from "@/components/GuideCard";
import GuideFeedSkeleton from "@/components/GuideFeedSkeleton";
import FilterBar from "@/components/FilterBar";
import HeroSection from "@/components/HeroSection";
import type { Difficulty } from "@/types";

interface Props {
  params: { subdomain: string };
  searchParams: { difficulty?: string; tag?: string; page?: string };
}

const PAGE_SIZE = 12;

export const dynamic = "force-dynamic";
export const revalidate = 0; // ISR: revalidate every 60 seconds

export default async function SubdomainPage({ params, searchParams }: Props) {
  const cfg = getSubdomainConfig(params.subdomain);
  if (!cfg) notFound();

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const [guides, total] = await Promise.all([
    getGuidesBySubdomain(params.subdomain, {
      limit: PAGE_SIZE,
      offset,
      difficulty: searchParams.difficulty as Difficulty | undefined,
      tag: searchParams.tag,
    }),
    countGuides(params.subdomain),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <HeroSection config={cfg} total={total} />

      <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <FilterBar
          currentDifficulty={searchParams.difficulty}
          currentTag={searchParams.tag}
        />

        {guides.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {guides.map((guide, i) => (
                <GuideCard
                  key={guide.id}
                  guide={guide}
                  config={cfg}
                  index={i}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                searchParams={searchParams}
              />
            )}
          </>
        )}
      </section>
    </>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 text-5xl opacity-30">📭</div>
      <p className="font-display text-xl font-bold text-white/60">
        No guides yet
      </p>
      <p className="mt-1 text-sm text-[var(--color-muted,#6b6b8a)]">
        Check back soon — content is being added.
      </p>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  currentPage,
  totalPages,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}) {
  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (searchParams.difficulty) sp.set("difficulty", searchParams.difficulty);
    if (searchParams.tag) sp.set("tag", searchParams.tag);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  }

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <nav
      className="mt-12 flex items-center justify-center gap-2"
      aria-label="Pagination"
    >
      {currentPage > 1 && (
        <a
          href={pageHref(currentPage - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1e1e2e] bg-[#12121a] text-sm text-[#6b6b8a] transition hover:border-[var(--subdomain-accent)] hover:text-[var(--subdomain-accent)]"
        >
          ←
        </a>
      )}

      {pages.map((p) => (
        <a
          key={p}
          href={pageHref(p)}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-mono font-medium transition ${
            p === currentPage
              ? "border-[var(--subdomain-accent)] bg-[var(--subdomain-accent)] text-white"
              : "border-[#1e1e2e] bg-[#12121a] text-[#6b6b8a] hover:border-[var(--subdomain-accent)] hover:text-[var(--subdomain-accent)]"
          }`}
        >
          {p}
        </a>
      ))}

      {currentPage < totalPages && (
        <a
          href={pageHref(currentPage + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1e1e2e] bg-[#12121a] text-sm text-[#6b6b8a] transition hover:border-[var(--subdomain-accent)] hover:text-[var(--subdomain-accent)]"
        >
          →
        </a>
      )}
    </nav>
  );
}
