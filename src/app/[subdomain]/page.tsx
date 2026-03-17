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

  // Doma subdomain: custom page with referral + guides
  if (params.subdomain === "doma") {
    const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
    const offset = (page - 1) * PAGE_SIZE;
    const [guides, total] = await Promise.all([
      getGuidesBySubdomain("doma", { limit: PAGE_SIZE, offset }),
      countGuides("doma"),
    ]);
    return <DomaPage guides={guides} cfg={cfg} />;
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

// ─── Doma Page ───────────────────────────────────────────────────────────────

const DOMA_REFERRAL = "https://app.doma.xyz/join/4urmvv4ouvvsu";

const DOMA_HOW_IT_WORKS = [
  { n: "1", title: "Tokenize a Domain", body: "Connect your wallet at app.doma.xyz, select any .com, .ai, .xyz, or other ICANN-compliant domain, and mint it as a blockchain asset on Doma's OP Stack L2." },
  { n: "2", title: "Get DOTs + DSTs", body: "Every tokenized domain produces two ERC-20 tokens: a DOT (Domain Ownership Token) representing title, and a DST (Domain Service Token) controlling DNS records." },
  { n: "3", title: "Trade or DeFi", body: "Trade DOTs 24/7 on DEXs, use them as loan collateral, earn yield in liquidity pools, or fractionalize a premium domain into thousands of micro-tokens." },
  { n: "4", title: "Domain Still Works", body: "Because DOTs and DSTs are separate, you can sell ownership while the website and email keep running — or lease DNS control while holding the title." },
];

const DOMA_FEATURES = [
  { emoji: "🌐", title: "Real Domains, On-Chain", body: "Doma tokenizes traditional internet domains (.com, .ai, .xyz) — not crypto namespaces. Your domain works on the normal web with no special browser extensions." },
  { emoji: "🔑", title: "Dual-Token System", body: "DOTs = ownership & transfer rights. DSTs = DNS control & nameserver access. Split ownership from DNS control — a first in the domain industry." },
  { emoji: "💎", title: "DomainFi", body: "Use premium domains as DeFi collateral, earn yield in liquidity pools, or fractionalize a single domain (e.g. software.ai → $SOFTWARE tokens) for fractional trading." },
  { emoji: "⚡", title: "Instant Settlement", body: "Sell a domain in seconds with no escrow, no brokers, and no 10–20% commission fees. 24/7 trading on the Base Names Marketplace with USDC or ETH." },
  { emoji: "🔗", title: "Cross-Chain via LayerZero", body: "Doma domains are portable across Ethereum, Base, Solana, Avalanche, and ENS — powered by LayerZero omnichain messaging." },
  { emoji: "🏗", title: "Build with Doma Forge", body: "Developers can tap $1M USDC in grants at doma.xyz/forge to build DomainFi applications on top of the Doma Protocol infrastructure." },
];

function DomaPage({ guides, cfg }: { guides: import("@/types").Guide[]; cfg: import("@/types").SubdomainConfig }) {
  return (
    <div style={{ background: "#fefbf6", minHeight: "100vh" }}>
      {/* Hero */}
      <section style={{ background: "linear-gradient(135deg, #1a0533 0%, #302b63 50%, #24243e 100%)", padding: "80px 24px 64px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 50% 50%, rgba(124,106,255,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 720, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(124,106,255,0.15)", border: "1px solid rgba(124,106,255,0.3)", borderRadius: 50, padding: "6px 16px", marginBottom: 24 }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#7c6aff", letterSpacing: 1 }}>BUILT BY D3 GLOBAL · $25M SERIES A · PARADIGM-BACKED</span>
          </div>
          <h1 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3.5rem)", color: "#fff", marginBottom: 20, lineHeight: 1.1 }}>
            Your Domain.<br />On the Blockchain.
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.7, marginBottom: 40 }}>
            Doma Protocol tokenizes traditional internet domains (.com, .ai, .xyz) as programmable real-world assets. Trade 24/7, use as DeFi collateral, or fractionalize premium domains — while your website keeps running normally.
          </p>
          <a href={DOMA_REFERRAL} target="_blank" rel="noopener noreferrer"
             style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #ff6b35, #ec4899)", color: "#fff", padding: "16px 40px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem", textDecoration: "none", boxShadow: "0 8px 30px rgba(255,107,53,0.35)" }}>
            Explore Doma Protocol →
          </a>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", marginTop: 12 }}>
            Opens app.doma.xyz — connect your wallet to get started
          </p>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{ background: "#fff", borderBottom: "1px solid #f0ece4" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 32 }}>
          {[
            { value: "$38M+", label: "Trading Volume" },
            { value: "107K+", label: "Tokenized Domains" },
            { value: "3.2M+", label: "Transactions" },
            { value: "40M+", label: "Domain Inventory" },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Bungee', cursive", fontSize: "1.8rem", color: "#7c6aff" }}>{value}</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px 48px" }}>
        <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.6rem", color: "#1a1a2e", marginBottom: 8 }}>How Doma Works</h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", marginBottom: 40 }}>Turn any internet domain into a tradeable on-chain asset in four steps.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {DOMA_HOW_IT_WORKS.map(({ n, title, body }) => (
            <div key={n} style={{ display: "flex", gap: 20, alignItems: "flex-start", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #7c6aff, #3b9eff)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bungee', cursive", fontSize: "1.1rem", color: "#fff", flexShrink: 0 }}>{n}</div>
              <div>
                <h3 style={{ fontFamily: "'Bungee', cursive", fontSize: "1rem", color: "#1a1a2e", marginBottom: 6 }}>{title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#6b7280", lineHeight: 1.6, margin: 0 }}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ background: "#fff", borderTop: "1px solid #f0ece4", borderBottom: "1px solid #f0ece4" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px" }}>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.6rem", color: "#1a1a2e", marginBottom: 8 }}>What Makes Doma Different</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", marginBottom: 40 }}>Unlike ENS, Handshake, or Unstoppable Domains — Doma works with the real internet.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
            {DOMA_FEATURES.map(({ emoji, title, body }) => (
              <div key={title} style={{ background: "#fefbf6", border: "1px solid #f0ece4", borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: "1.8rem", marginBottom: 12 }}>{emoji}</div>
                <h3 style={{ fontFamily: "'Bungee', cursive", fontSize: "1rem", color: "#1a1a2e", marginBottom: 8 }}>{title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", color: "#6b7280", margin: 0, lineHeight: 1.6 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guides */}
      {guides.length > 0 && (
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px 48px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.6rem", color: "#1a1a2e", margin: 0 }}>Doma Guides</h2>
            <a href="/guides" style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", color: "#7c6aff", textDecoration: "none" }}>View all guides →</a>
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", marginBottom: 40 }}>
            Practical walkthroughs for building and trading on Doma Protocol.
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((guide, i) => (
              <GuideCard key={guide.id} guide={guide} config={cfg} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.8rem", color: "#1a1a2e", marginBottom: 16 }}>Start Exploring DomainFi</h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", marginBottom: 32, lineHeight: 1.7 }}>
          Mainnet is live. $38M+ in trading volume. 107,000+ domains already tokenized. Browse the marketplace and see what your domain could be worth on-chain.
        </p>
        <a href={DOMA_REFERRAL} target="_blank" rel="noopener noreferrer"
           style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #7c6aff, #3b9eff)", color: "#fff", padding: "16px 40px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem", textDecoration: "none", boxShadow: "0 8px 30px rgba(124,106,255,0.3)" }}>
          Open app.doma.xyz →
        </a>
      </section>
    </div>
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
