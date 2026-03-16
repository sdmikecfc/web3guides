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

  // Doma subdomain: custom page with referral
  if (params.subdomain === "doma") {
    return <DomaPage />;
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

const DOMA_STEPS = [
  { n: "1", title: "Connect Your Wallet", body: "Head to doma.xyz and connect your Web3 wallet. Doma supports MetaMask, WalletConnect, and most major wallets." },
  { n: "2", title: "Choose Your Subdomain", body: "Browse available subdomains under web3guides.com. Pick a topic you know — eth, defi, sol, or carve your own niche." },
  { n: "3", title: "Mint It On-Chain", body: "Mint your subdomain as a blockchain asset. You own it — not a platform. Transfer it, sell it, or hold it indefinitely." },
  { n: "4", title: "Publish & Earn", body: "Your subdomain goes live as a guide site. Add your affiliate links, build your audience, and keep 100% of what you earn." },
];

const DOMA_BENEFITS = [
  { emoji: "🔒", title: "True Ownership", body: "Your subdomain is enforced by smart contracts, not a platform TOS. No one can delete or deactivate it." },
  { emoji: "💰", title: "100% Revenue", body: "Every affiliate link, referral code, and sponsorship on your subdomain is yours. Doma takes nothing." },
  { emoji: "📡", title: "Featured Distribution", body: "Stake $DOMA against your subdomain to get featured placement across web3guides.com — reaching thousands of learners." },
  { emoji: "🌐", title: "Instant Web Presence", body: "Your subdomain launches as a fully functional guide site with AI-generated content, no dev skills required." },
  { emoji: "🤝", title: "Community Network", body: "Join a network of Web3 educators. Cross-promote, collaborate, and build alongside other subdomain owners." },
  { emoji: "⚡", title: "AI-Powered Content", body: "New articles generated automatically for your subdomain every few days — always fresh, always relevant." },
];

function DomaPage() {
  return (
    <div style={{ background: "#fefbf6", minHeight: "100vh" }}>
      {/* Hero */}
      <section style={{ background: "linear-gradient(135deg, #1a0533 0%, #302b63 50%, #24243e 100%)", padding: "80px 24px 64px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 50% 50%, rgba(124,106,255,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 720, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(124,106,255,0.15)", border: "1px solid rgba(124,106,255,0.3)", borderRadius: 50, padding: "6px 16px", marginBottom: 24 }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#7c6aff", letterSpacing: 1 }}>POWERED BY DOMA PROTOCOL</span>
          </div>
          <h1 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3.5rem)", color: "#fff", marginBottom: 20, lineHeight: 1.1 }}>
            Own Your Corner of Web3
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.7, marginBottom: 40 }}>
            Mint a subdomain under web3guides.com as an on-chain asset. Launch your own guide site, build your audience, and keep every dollar you earn — enforced by smart contracts, not platform rules.
          </p>
          <a href={DOMA_REFERRAL} target="_blank" rel="noopener noreferrer"
             style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #ff6b35, #ec4899)", color: "#fff", padding: "16px 40px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem", textDecoration: "none", boxShadow: "0 8px 30px rgba(255,107,53,0.35)" }}>
            Claim Your Subdomain →
          </a>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", marginTop: 12 }}>
            Opens app.doma.xyz — wallet &amp; $DOMA required
          </p>
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px 48px" }}>
        <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.6rem", color: "#1a1a2e", marginBottom: 8 }}>How It Works</h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", marginBottom: 40 }}>Four steps from wallet connect to live guide site.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {DOMA_STEPS.map(({ n, title, body }) => (
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

      {/* Benefits */}
      <section style={{ background: "#fff", borderTop: "1px solid #f0ece4", borderBottom: "1px solid #f0ece4" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px" }}>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.6rem", color: "#1a1a2e", marginBottom: 8 }}>Why Get a Subdomain?</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", marginBottom: 40 }}>Everything a traditional domain gives you, plus on-chain ownership and built-in distribution.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
            {DOMA_BENEFITS.map(({ emoji, title, body }) => (
              <div key={title} style={{ background: "#fefbf6", border: "1px solid #f0ece4", borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: "1.8rem", marginBottom: 12 }}>{emoji}</div>
                <h3 style={{ fontFamily: "'Bungee', cursive", fontSize: "1rem", color: "#1a1a2e", marginBottom: 8 }}>{title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", color: "#6b7280", margin: 0, lineHeight: 1.6 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.8rem", color: "#1a1a2e", marginBottom: 16 }}>Ready to Own Your Piece of the Web?</h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", marginBottom: 32, lineHeight: 1.7 }}>
          Subdomains are limited. The best topics go first. Mint yours on Doma Protocol and start building your audience today.
        </p>
        <a href={DOMA_REFERRAL} target="_blank" rel="noopener noreferrer"
           style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #7c6aff, #3b9eff)", color: "#fff", padding: "16px 40px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem", textDecoration: "none", boxShadow: "0 8px 30px rgba(124,106,255,0.3)" }}>
          Mint on Doma Protocol →
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
