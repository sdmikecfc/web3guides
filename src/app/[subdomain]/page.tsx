import { notFound } from "next/navigation";
import { getSubdomainConfig } from "@/lib/subdomains";
import { getGuidesBySubdomain, countGuides, getGuidesByDifficulty, countGuidesByDifficulty } from "@/lib/guides";
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

// Subdomains that show difficulty-filtered content instead of subdomain-specific
const DIFFICULTY_SUBDOMAINS: Record<string, string> = {
  medium: "intermediate",
  advanced: "advanced",
};

export default async function SubdomainPage({ params, searchParams }: Props) {
  const cfg = getSubdomainConfig(params.subdomain);
  if (!cfg) notFound();

  // Jobs subdomain: custom page
  if (params.subdomain === "jobs") {
    return <JobsPage />;
  }

  // Medium/Advanced: filter by difficulty across all subdomains
  const difficultyFilter = DIFFICULTY_SUBDOMAINS[params.subdomain];
  if (difficultyFilter) {
    const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
    const offset = (page - 1) * PAGE_SIZE;
    const [guides, total] = await Promise.all([
      getGuidesByDifficulty(difficultyFilter, { limit: PAGE_SIZE, offset }),
      countGuidesByDifficulty(difficultyFilter),
    ]);
    const totalPages = Math.ceil(total / PAGE_SIZE);
    return (
      <>
        <HeroSection config={cfg} total={total} />
        <section style={{ margin: "0 auto", width: "100%", maxWidth: 1280, padding: "0 24px 48px" }}>
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

  // Default: standard subdomain article listing
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

// ─── Jobs Page ───────────────────────────────────────────────────────────────

const JOB_BOARDS = [
  { name: "Web3.career", url: "https://web3.career", description: "Largest web3 job board — dev, marketing, ops roles daily", tag: "General" },
  { name: "CryptoJobsList", url: "https://cryptojobslist.com", description: "Curated crypto & blockchain jobs, remote-friendly", tag: "General" },
  { name: "Cryptocurrency Jobs", url: "https://cryptocurrencyjobs.co", description: "Quality-filtered crypto positions across all disciplines", tag: "General" },
  { name: "Wellfound (AngelList)", url: "https://wellfound.com/jobs?q=web3", description: "Startup jobs — great for early-stage Web3 companies", tag: "Startups" },
  { name: "Lever / Greenhouse", url: "https://jobs.lever.co", description: "Search crypto companies directly on their ATS pages", tag: "Direct" },
  { name: "Remote3", url: "https://remote3.co", description: "Remote-only Web3 jobs — developer focused", tag: "Remote" },
  { name: "Bankless Job Board", url: "https://bankless.com/jobs", description: "DeFi & Ethereum ecosystem jobs from the Bankless community", tag: "DeFi" },
  { name: "Gitcoin", url: "https://gitcoin.co/explorer", description: "Bounties & grants — get paid for open source contributions", tag: "Bounties" },
];

const TIPS = [
  { emoji: "🔗", title: "Build on-chain", body: "GitHub is your resume. Contribute to open-source protocols, deploy contracts, and make your work visible on-chain." },
  { emoji: "📝", title: "Write publicly", body: "Publish threads, blog posts, or guides explaining what you're learning. Companies hire people who teach." },
  { emoji: "🤝", title: "Join Discord servers", body: "Most Web3 jobs are never posted publicly. Get active in protocol Discords — Uniswap, Aave, Chainlink, etc." },
  { emoji: "🏆", title: "Win a hackathon", body: "ETHGlobal and Devfolio hackathons are direct pipelines into protocol teams and funded startups." },
  { emoji: "💼", title: "Apply fast", body: "Web3 companies move quickly. Apply within 48 hours of a posting — teams often close roles in under a week." },
  { emoji: "🌐", title: "Go to conferences", body: "ETHDenver, Devcon, Token2049 — the ROI on meeting people in person is enormous. Relationships get you hired." },
];

function JobsPage() {
  return (
    <div style={{ background: "#fefbf6", minHeight: "100vh" }}>
      {/* Hero */}
      <section style={{ padding: "80px 24px 60px", textAlign: "center", borderBottom: "1px solid #f0ece4" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>💼</div>
          <h1 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3.5rem)", color: "#1a1a2e", marginBottom: 16, lineHeight: 1.1 }}>
            Web3 Jobs
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.15rem", color: "#6b7280", lineHeight: 1.7, marginBottom: 0 }}>
            The best places to find your next role in crypto — plus a straight-talking guide on how to actually get hired.
          </p>
        </div>
      </section>

      {/* Job Boards */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px 48px" }}>
        <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.6rem", color: "#1a1a2e", marginBottom: 8 }}>Where to Find Roles</h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", marginBottom: 40 }}>
          These are the highest-signal job boards for Web3. Check them weekly.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
          {JOB_BOARDS.map((board) => (
            <a key={board.name} href={board.url} target="_blank" rel="noopener noreferrer"
               style={{ display: "block", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px", textDecoration: "none", transition: "box-shadow 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontFamily: "'Bungee', cursive", fontSize: "1rem", color: "#1a1a2e" }}>{board.name}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", background: "#f3f4f6", color: "#6366f1", borderRadius: 6, padding: "2px 8px" }}>{board.tag}</span>
              </div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", color: "#6b7280", margin: 0, lineHeight: 1.5 }}>{board.description}</p>
              <div style={{ marginTop: 14, fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", color: "#6366f1" }}>Visit →</div>
            </a>
          ))}
        </div>
      </section>

      {/* How to Get Hired */}
      <section style={{ background: "#fff", borderTop: "1px solid #f0ece4", borderBottom: "1px solid #f0ece4" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px" }}>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.6rem", color: "#1a1a2e", marginBottom: 8 }}>How to Actually Get Hired</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", marginBottom: 40 }}>
            Web3 hiring is different. Here&apos;s what actually works.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
            {TIPS.map((tip) => (
              <div key={tip.title} style={{ background: "#fefbf6", border: "1px solid #f0ece4", borderRadius: 16, padding: "24px" }}>
                <div style={{ fontSize: "1.8rem", marginBottom: 12 }}>{tip.emoji}</div>
                <h3 style={{ fontFamily: "'Bungee', cursive", fontSize: "1rem", color: "#1a1a2e", marginBottom: 8 }}>{tip.title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", color: "#6b7280", margin: 0, lineHeight: 1.6 }}>{tip.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Skills in demand */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px 80px" }}>
        <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.6rem", color: "#1a1a2e", marginBottom: 8 }}>Skills in Demand Right Now</h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", marginBottom: 40 }}>
          The roles getting the most traction in 2026.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {["Solidity", "Rust (Solana)", "ZK Proofs", "TypeScript", "Smart Contract Auditing", "DeFi Protocol Design", "Tokenomics", "DAO Operations", "Growth / GTM", "Developer Relations", "Technical Writing", "Protocol Research", "MEV / Arbitrage", "Cross-chain Infra"].map((skill) => (
            <span key={skill} style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 999, padding: "8px 16px", color: "#374151" }}>
              {skill}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

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
