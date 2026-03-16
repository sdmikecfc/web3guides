import { notFound } from "next/navigation";
import { getSubdomainConfig } from "@/lib/subdomains";
import { getGuidesBySubdomain, countGuides } from "@/lib/guides";
import GuideCard from "@/components/GuideCard";
import FilterBar from "@/components/FilterBar";
import HeroSection from "@/components/HeroSection";
import SubdomainCTA from "@/components/SubdomainCTA";
import type { Difficulty } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: { subdomain: string };
  searchParams: { difficulty?: string; tag?: string; page?: string };
}

const PAGE_SIZE = 12;

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

      <section style={{ margin: "0 auto", width: "100%", maxWidth: 1280, padding: "0 24px 48px" }}>
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
                <GuideCard key={guide.id} guide={guide} config={cfg} index={i} />
              ))}
            </div>
            {totalPages > 1 && (
              <Pagination currentPage={page} totalPages={totalPages} searchParams={searchParams} />
            )}
          </>
        )}
      </section>

      <SubdomainCTA config={cfg} />
    </>
  );
}

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "96px 0", textAlign: "center" }}>
      <div style={{ fontSize: "3rem", opacity: 0.3, marginBottom: 16 }}>📭</div>
      <p style={{ fontFamily: "'Bungee', cursive", fontSize: "1.3rem", color: "#9ca3af", marginBottom: 8 }}>No guides yet</p>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#9ca3af" }}>Check back soon — content is being added.</p>
    </div>
  );
}

function Pagination({ currentPage, totalPages, searchParams }: {
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
    <nav style={{ marginTop: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {currentPage > 1 && (
        <a href={pageHref(currentPage - 1)} style={{ display: "flex", height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", textDecoration: "none" }}>←</a>
      )}
      {pages.map((p) => (
        <a key={p} href={pageHref(p)}
           style={p === currentPage
             ? { display: "flex", height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", fontWeight: 700, color: "#fff", background: "var(--subdomain-accent)", textDecoration: "none" }
             : { display: "flex", height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", textDecoration: "none" }
           }>
          {p}
        </a>
      ))}
      {currentPage < totalPages && (
        <a href={pageHref(currentPage + 1)} style={{ display: "flex", height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", textDecoration: "none" }}>→</a>
      )}
    </nav>
  );
}
