import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSubdomainConfig } from "@/lib/subdomains";
import { getGuidesBySubdomain, countGuides, getGuidesByDifficulty, countGuidesByDifficulty } from "@/lib/guides";
import GuideCard from "@/components/GuideCard";
import FilterBar from "@/components/FilterBar";
import HeroSection from "@/components/HeroSection";
import SubdomainCTA from "@/components/SubdomainCTA";
import type { Difficulty } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";

export async function generateMetadata({ params }: { params: { subdomain: string } }): Promise<Metadata> {
  const cfg = getSubdomainConfig(params.subdomain);
  if (!cfg) return {};
  const canonical = `https://${params.subdomain}.${ROOT}`;
  const ogImage = `https://${ROOT}/api/og?sub=${encodeURIComponent(params.subdomain)}&t=${encodeURIComponent(cfg.label + " Guides")}`;
  return {
    title: `${cfg.label} Guides — Web3Guides`,
    description: cfg.description,
    alternates: {
      canonical,
      types: {
        "application/rss+xml": `https://${ROOT}/api/rss/${params.subdomain}`,
      },
    },
    openGraph: {
      title: `${cfg.label} Guides — Free Web3 Education`,
      description: cfg.description,
      url: canonical,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${cfg.label} Guides on Web3Guides` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${cfg.label} Guides — Web3Guides`,
      description: cfg.description,
      images: [ogImage],
    },
  };
}

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

  // AIVM subdomain: custom branded page
  if (params.subdomain === "aivm") {
    const [guides, total] = await Promise.all([
      getGuidesBySubdomain("aivm", { limit: PAGE_SIZE, offset: 0 }),
      countGuides("aivm"),
    ]);
    return <AivmPage guides={guides} cfg={cfg} />;
  }

  // PAI3 subdomain: custom branded page
  if (params.subdomain === "pai3") {
    const guides = await getGuidesBySubdomain("pai3", { limit: 10, offset: 0 });
    return <Pai3Page guides={guides} cfg={cfg} />;
  }

  // Ink subdomain: custom branded page
  if (params.subdomain === "ink") {
    const [guides, total] = await Promise.all([
      getGuidesBySubdomain("ink", { limit: PAGE_SIZE, offset: 0 }),
      countGuides("ink"),
    ]);
    return <InkPage guides={guides} cfg={cfg} />;
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

  // Tool banners for specific subdomains
  const toolBanner =
    params.subdomain === "tax" ? (
      <a
        href="/tools/tax-calculator"
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(135deg, #1a0a14, #2d0a24)",
          border: "1px solid rgba(236,72,153,0.25)", borderRadius: 16,
          padding: "20px 28px", marginBottom: 28, textDecoration: "none", gap: 20,
          boxShadow: "0 4px 30px rgba(236,72,153,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 32 }}>🇬🇧</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#ec4899", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 3 }}>Free Tool</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>UK Crypto CGT Calculator</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>Estimate your 2024/25 capital gains tax in seconds. No signup.</div>
          </div>
        </div>
        <span style={{ flexShrink: 0, background: "#ec4899", color: "#fff", fontWeight: 700, fontSize: 14, padding: "10px 22px", borderRadius: 10 }}>
          Calculate →
        </span>
      </a>
    ) : params.subdomain === "staking" ? (
      <a
        href="/tools/staking-calculator"
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(135deg, #030f1a, #0c2a3e)",
          border: "1px solid rgba(14,165,233,0.25)", borderRadius: 16,
          padding: "20px 28px", marginBottom: 28, textDecoration: "none", gap: 20,
          boxShadow: "0 4px 30px rgba(14,165,233,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 32 }}>📈</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#0ea5e9", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 3 }}>Free Tool</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>Staking Rewards Calculator</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>ETH, SOL, ADA, DOT, MATIC and more. Project your returns over 5 years.</div>
          </div>
        </div>
        <span style={{ flexShrink: 0, background: "#0ea5e9", color: "#fff", fontWeight: 700, fontSize: 14, padding: "10px 22px", borderRadius: 10 }}>
          Calculate →
        </span>
      </a>
    ) : null;

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${cfg.label} Guides`,
    description: cfg.description,
    url: `https://${params.subdomain}.${ROOT}`,
    numberOfItems: total,
    publisher: { "@type": "Organization", name: "Web3Guides", url: `https://${ROOT}` },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      <HeroSection config={cfg} total={total} />

      <section style={{ margin: "0 auto", width: "100%", maxWidth: 1280, padding: "0 24px 48px" }}>
        {toolBanner}
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

// ─── AIVM Page ───────────────────────────────────────────────────────────────

const AIVM_REFERRAL = "https://app.chaingpt.org?referralcode=e60e25cd2a";

const CYAN   = "#00FEFC";
const NAVY   = "#0B1320";
const GREEN  = "#2DFFB9";
const BLUE   = "#1F51FF";

const AIVM_PILLARS = [
  {
    icon: "⚡",
    title: "Decentralised AI Compute",
    body: "A GPU marketplace with no vendor lock-in. Any provider can join. Models run on verifiable distributed infrastructure — not a single cloud company's servers.",
    color: CYAN,
  },
  {
    icon: "🤖",
    title: "Agent-Based AI Execution",
    body: "AI agents run on-chain with cryptographic verification. Every inference is auditable, tamper-proof, and reproducible — unlike black-box API calls to centralised models.",
    color: GREEN,
  },
  {
    icon: "📦",
    title: "Tokenised Data Marketplaces",
    body: "Buy, sell, and collaborate on training datasets directly on-chain. Data contributors get paid fairly. No platform taking 30% of your work.",
    color: CYAN,
  },
  {
    icon: "🛠",
    title: "Developer Tooling",
    body: "SDK, CLI, and agent runtime frameworks let builders deploy AI applications on AIVM without needing a PhD in distributed systems. EVM-compatible for easy onboarding.",
    color: GREEN,
  },
];

const AIVM_VALIDATORS = [
  { title: "Core Validators", body: "Secure network consensus via Tendermint. The backbone of the chain — process transactions, produce blocks, maintain finality.", tag: "Consensus" },
  { title: "AI Validators", body: "Verify that AI model executions produce correct outputs. Use ZK proofs and TEEs to confirm inference results without revealing model weights.", tag: "Verification" },
  { title: "Compute Validators", body: "Monitor GPU quality and performance across the decentralised compute marketplace. Enforce SLAs and benchmark providers.", tag: "Compute" },
  { title: "Data Validators", body: "Maintain data integrity and privacy across the tokenised data marketplace. Audit dataset quality and enforce privacy guarantees.", tag: "Data" },
];

const AIVM_PARTNERS = [
  { name: "Google", logo: "G" },
  { name: "Nvidia", logo: "N" },
  { name: "Alibaba Cloud", logo: "A" },
  { name: "Binance", logo: "B" },
  { name: "Polygon", logo: "P" },
  { name: "Chainlink", logo: "⬡" },
];

function AivmPage({ guides, cfg }: { guides: import("@/types").Guide[]; cfg: import("@/types").SubdomainConfig }) {
  return (
    <div style={{ background: NAVY, minHeight: "100vh", color: "#fff" }}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section style={{
        background: `linear-gradient(160deg, #0B1320 0%, #0a1a2e 50%, #030810 100%)`,
        padding: "90px 24px 80px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        borderBottom: `1px solid rgba(0,254,252,0.12)`,
      }}>
        {/* Glow orbs */}
        <div style={{ position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, rgba(0,254,252,0.08) 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -100, right: "10%", width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, rgba(45,255,185,0.06) 0%, transparent 70%)`, pointerEvents: "none" }} />

        <div style={{ maxWidth: 780, margin: "0 auto", position: "relative", zIndex: 1 }}>
          {/* Badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,254,252,0.08)", border: "1px solid rgba(0,254,252,0.2)", borderRadius: 50, padding: "6px 18px", marginBottom: 28 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: CYAN, display: "inline-block", boxShadow: `0 0 8px ${CYAN}` }} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: CYAN, letterSpacing: 1.5 }}>BACKED BY GOOGLE · NVIDIA · ALIBABA CLOUD · BINANCE</span>
          </div>

          <h1 style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: "clamp(2.2rem, 6vw, 4rem)", lineHeight: 1.05, marginBottom: 24 }}>
            <span style={{ color: "#fff" }}>Decentralised AI.</span>
            <br />
            <span style={{ background: `linear-gradient(90deg, ${CYAN}, ${GREEN})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              No Big Tech Required.
            </span>
          </h1>

          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.75, maxWidth: 600, margin: "0 auto 44px" }}>
            AIVM is ChainGPT&apos;s Layer-1 blockchain purpose-built for AI. Decentralised compute, verifiable agent execution, tokenised data markets — everything OpenAI and Google keep locked behind closed APIs, now open and on-chain.
          </p>

          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <a href={AIVM_REFERRAL} target="_blank" rel="noopener noreferrer"
               style={{ display: "inline-flex", alignItems: "center", gap: 10, background: `linear-gradient(135deg, ${CYAN}, ${GREEN})`, color: NAVY, padding: "15px 36px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "1rem", textDecoration: "none", boxShadow: `0 8px 40px rgba(0,254,252,0.25)`, letterSpacing: 0.3 }}>
              Join the AIVM Testnet →
            </a>
            <a href="#guides"
               style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", padding: "15px 32px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "1rem", textDecoration: "none" }}>
              Read the Guides
            </a>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────── */}
      <section style={{ background: "rgba(0,254,252,0.03)", borderBottom: "1px solid rgba(0,254,252,0.08)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 48 }}>
          {[
            { value: "700K+", label: "Community Members" },
            { value: "$CGPT", label: "Gas Token · Live on Binance" },
            { value: "Q2/3 2026", label: "Mainnet Launch" },
            { value: "4 Types", label: "Specialised Validators" },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: "1.6rem", color: CYAN, textShadow: `0 0 20px rgba(0,254,252,0.4)` }}>{value}</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", color: "rgba(255,255,255,0.35)", letterSpacing: 1, textTransform: "uppercase", marginTop: 6 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The problem AIVM solves ───────────────────────────────── */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 3, height: 32, background: `linear-gradient(180deg, ${CYAN}, ${GREEN})`, borderRadius: 2 }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: CYAN, letterSpacing: 2 }}>THE PROBLEM</span>
        </div>
        <h2 style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: "clamp(1.6rem, 3vw, 2.4rem)", color: "#fff", marginBottom: 24, lineHeight: 1.15 }}>
          AI is the most powerful technology in history.<br />
          <span style={{ color: "rgba(255,255,255,0.4)" }}>And a handful of companies control all of it.</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {[
            { label: "Compute", problem: "AWS, GCP, Azure own all the GPUs. No access, no AI." },
            { label: "Models", problem: "OpenAI, Anthropic, Google keep weights proprietary. Take it or leave it." },
            { label: "Data", problem: "Training data is scraped from the public then locked behind paywalls." },
            { label: "Execution", problem: "API calls are black boxes. No way to verify what actually ran." },
          ].map(({ label, problem }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 22px" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: "rgba(255,69,69,0.8)", letterSpacing: 1, marginBottom: 8 }}>❌ {label}</div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.88rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>{problem}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 28, padding: "22px 28px", background: "rgba(0,254,252,0.05)", border: "1px solid rgba(0,254,252,0.15)", borderRadius: 16 }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.7, margin: 0 }}>
            <strong style={{ color: CYAN }}>AIVM fixes this.</strong> Open compute marketplace. Cryptographically verifiable model execution. Tokenised data ownership. All on a decentralised Layer-1 — no permission required.
          </p>
        </div>
      </section>

      {/* ── 4 Pillars ────────────────────────────────────────────── */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(0,254,252,0.06)", borderBottom: "1px solid rgba(0,254,252,0.06)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "72px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: CYAN, letterSpacing: 2, marginBottom: 14 }}>THE FOUR PILLARS</div>
            <h2 style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: "clamp(1.6rem, 3vw, 2.2rem)", color: "#fff", margin: 0 }}>What AIVM Actually Does</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {AIVM_PILLARS.map(({ icon, title, body, color }) => (
              <div key={title} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(0,254,252,0.1)`, borderRadius: 18, padding: "28px 24px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}, transparent)` }} />
                <div style={{ fontSize: "1.8rem", marginBottom: 16 }}>{icon}</div>
                <h3 style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "#fff", marginBottom: 10 }}>{title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.87rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.65, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Validator Types ──────────────────────────────────────── */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "72px 24px" }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: GREEN, letterSpacing: 2, marginBottom: 14 }}>NETWORK ARCHITECTURE</div>
          <h2 style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: "clamp(1.6rem, 3vw, 2.2rem)", color: "#fff", marginBottom: 10 }}>4 Specialised Validator Types</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.45)", fontSize: "0.95rem", margin: 0 }}>
            Unlike generic blockchains where one validator does everything, AIVM specialises validation by function — making AI verification efficient at scale.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {AIVM_VALIDATORS.map(({ title, body, tag }) => (
            <div key={title} style={{ display: "flex", gap: 20, alignItems: "flex-start", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "22px 24px" }}>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", background: "rgba(0,254,252,0.1)", border: "1px solid rgba(0,254,252,0.2)", color: CYAN, borderRadius: 6, padding: "4px 10px", whiteSpace: "nowrap", marginTop: 2, flexShrink: 0 }}>{tag}</span>
              <div>
                <h3 style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "#fff", marginBottom: 6 }}>{title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Partners ─────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", letterSpacing: 2, marginBottom: 32 }}>BACKED & PARTNERED WITH</div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>
            {AIVM_PARTNERS.map(({ name }) => (
              <div key={name} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "0.9rem", color: "rgba(255,255,255,0.6)" }}>
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Guides ──────────────────────────────────────────────── */}
      <section id="guides" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px 64px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: "1.8rem", color: "#fff", margin: 0 }}>AIVM Guides</h2>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>{guides.length} guide{guides.length !== 1 ? "s" : ""}</span>
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.4)", marginBottom: 44, fontSize: "0.95rem" }}>
          Everything you need to understand, participate in, and build on AIVM — from testnet setup to deep technical architecture.
        </p>
        {guides.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 16, opacity: 0.3 }}>🤖</div>
            <p style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, fontSize: "1.1rem", color: "rgba(255,255,255,0.2)" }}>Guides dropping soon</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((guide, i) => (
              <GuideCard key={guide.id} guide={guide} config={cfg} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px 100px", textAlign: "center" }}>
        <div style={{ background: "rgba(0,254,252,0.04)", border: "1px solid rgba(0,254,252,0.12)", borderRadius: 24, padding: "56px 40px" }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: CYAN, letterSpacing: 2, marginBottom: 16 }}>PUBLIC TESTNET · NOW LIVE</div>
          <h2 style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: "clamp(1.5rem, 3vw, 2rem)", color: "#fff", marginBottom: 16, lineHeight: 1.2 }}>
            Get In Early.<br />The Mainnet Window is Q2/3 2026.
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.5)", marginBottom: 36, lineHeight: 1.7, fontSize: "0.95rem" }}>
            Join the testnet, complete quests, run a validator node, and contribute to the network before mainnet. The early participants who put in the work during testnet are historically the ones who benefit most at launch.
          </p>
          <a href={AIVM_REFERRAL} target="_blank" rel="noopener noreferrer"
             style={{ display: "inline-flex", alignItems: "center", gap: 10, background: `linear-gradient(135deg, ${CYAN}, ${GREEN})`, color: NAVY, padding: "16px 44px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "1.05rem", textDecoration: "none", boxShadow: `0 8px 40px rgba(0,254,252,0.2)` }}>
            Join ChainGPT · Start Earning →
          </a>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", color: "rgba(255,255,255,0.2)", marginTop: 16 }}>
            Opens app.chaingpt.org — Web3 wallet required
          </p>
        </div>
      </section>

    </div>
  );
}

// ─── PAI3 Page ───────────────────────────────────────────────────────────────

const P_PURPLE  = "#8B5CF6";
const P_VIOLET  = "#6D28D9";
const P_CYAN    = "#06B6D4";
const P_DARK    = "#0A0714";
const P_NAVY    = "#1E1B4B";

const PAI3_PILLARS = [
  {
    icon: "🖥️",
    title: "Own Your AI Hardware",
    body: "Power Nodes are physical devices you own outright — not leased from Big Tech. Your hardware runs AI privately, earns $PAI3 tokens, and holds residual value independent of the network.",
    color: P_PURPLE,
  },
  {
    icon: "🔐",
    title: "Privacy-First Architecture",
    body: "Sensitive data never leaves your local environment. PAI3 is HIPAA-compliant and enterprise-ready — healthcare, legal, and financial data stays secure by design, not by promise.",
    color: P_CYAN,
  },
  {
    icon: "🔥",
    title: "Deflationary Token Economics",
    body: "Every AI inference burns $PAI3. Every transaction burns $PAI3. As the network grows and usage scales, supply shrinks — creating natural price pressure aligned with adoption.",
    color: P_PURPLE,
  },
  {
    icon: "🗳️",
    title: "Quadratic Voting Governance",
    body: "Voting power is the square root of tokens staked — not one-token-one-vote. This prevents whale dominance and ensures the community, not the wealthy few, governs the network.",
    color: P_CYAN,
  },
];

const PAI3_PARTICIPATION = [
  {
    tag: "HARDWARE",
    title: "Buy a Power Node",
    body: "Purchase physical hardware that runs AI models privately on your premises. Receive a 150,000 $PAI3 token allocation at TGE and earn ongoing emissions from network activity.",
  },
  {
    tag: "SOFTWARE",
    title: "Run a Professional Node",
    body: "Software-based nodes with lower hardware requirements. Stake $PAI3 to participate in validation and compute tasks. Open to the public at mainnet launch in Q3 2026.",
  },
  {
    tag: "BUILD",
    title: "Develop on PAI3",
    body: "Use AgentOS to build and deploy AI agents on the network. Deploy models to the marketplace, earn from usage fees, and access the full-stack decentralised AI infrastructure.",
  },
];

const PAI3_ROADMAP = [
  { quarter: "Q1 2026", label: "Token Prep", detail: "Security audits, smart contract finalisation, exchange partnerships", done: true },
  { quarter: "Q2 2026", label: "TGE · $PAI3 Launch", detail: "BNB Chain deployment, exchange listings, Power Node rewards begin, governance live", done: false },
  { quarter: "Q3 2026", label: "Mainnet · World Computer", detail: "Full decentralised AI inference network, Professional Nodes open, Marketplace live", done: false },
  { quarter: "Q4 2026", label: "PAI3 Computer", detail: "Consumer hardware unveiled — plug-and-play decentralised AI for mass adoption", done: false },
];

function Pai3Page({ guides, cfg }: { guides: import("@/types").Guide[]; cfg: import("@/types").SubdomainConfig }) {
  return (
    <div style={{ background: P_DARK, minHeight: "100vh", color: "#fff" }}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section style={{
        background: `linear-gradient(160deg, #110d2e 0%, #1a1040 50%, ${P_DARK} 100%)`,
        padding: "90px 24px 80px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        borderBottom: `1px solid rgba(139,92,246,0.15)`,
      }}>
        <div style={{ position: "absolute", top: -100, left: "50%", transform: "translateX(-50%)", width: 700, height: 700, borderRadius: "50%", background: `radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -80, right: "8%", width: 380, height: 380, borderRadius: "50%", background: `radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)`, pointerEvents: "none" }} />

        <div style={{ maxWidth: 800, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 50, padding: "6px 18px", marginBottom: 28 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: P_PURPLE, display: "inline-block", boxShadow: `0 0 8px ${P_PURPLE}` }} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: P_PURPLE, letterSpacing: 1.5 }}>PEOPLE&apos;S AI · TGE Q2 2026 · BNB CHAIN</span>
          </div>

          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "clamp(2.2rem, 6vw, 4rem)", lineHeight: 1.05, marginBottom: 24 }}>
            <span style={{ color: "#fff" }}>AI You Own.</span>
            <br />
            <span style={{ background: `linear-gradient(90deg, ${P_PURPLE}, ${P_CYAN})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Not Rent from Big Tech.
            </span>
          </h1>

          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.75, maxWidth: 620, margin: "0 auto 44px" }}>
            PAI3 is a decentralised AI network where you own the hardware, earn the rewards, and govern the future. Physical Power Nodes. Privacy-first compute. A deflationary token that burns with every AI inference.
          </p>

          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="https://pai3.ai" target="_blank" rel="noopener noreferrer"
               style={{ display: "inline-flex", alignItems: "center", gap: 10, background: `linear-gradient(135deg, ${P_PURPLE}, ${P_VIOLET})`, color: "#fff", padding: "15px 36px", borderRadius: 50, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1rem", textDecoration: "none", boxShadow: `0 8px 40px rgba(139,92,246,0.3)`, letterSpacing: 0.2 }}>
              Explore PAI3 →
            </a>
            <a href="#guides"
               style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", padding: "15px 32px", borderRadius: 50, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: "1rem", textDecoration: "none" }}>
              Read the Guides
            </a>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────── */}
      <section style={{ background: "rgba(139,92,246,0.04)", borderBottom: "1px solid rgba(139,92,246,0.1)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 48 }}>
          {[
            { value: "26K+",    label: "Community Members" },
            { value: "500+",    label: "Power Nodes Sold" },
            { value: "Q2 2026", label: "$PAI3 Token Launch" },
            { value: "40+",     label: "Enterprise Partners" },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.6rem", color: P_PURPLE, textShadow: `0 0 20px rgba(139,92,246,0.4)` }}>{value}</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", color: "rgba(255,255,255,0.35)", letterSpacing: 1, textTransform: "uppercase", marginTop: 6 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The problem ──────────────────────────────────────────── */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 3, height: 32, background: `linear-gradient(180deg, ${P_PURPLE}, ${P_CYAN})`, borderRadius: 2 }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: P_PURPLE, letterSpacing: 2 }}>THE PROBLEM</span>
        </div>
        <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.4rem)", color: "#fff", marginBottom: 24, lineHeight: 1.15 }}>
          AI is reshaping the world.<br />
          <span style={{ color: "rgba(255,255,255,0.35)" }}>But you don&apos;t own any of it.</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {[
            { label: "Ownership", problem: "OpenAI, Google, Microsoft own the models. You pay per call and get nothing back." },
            { label: "Privacy",   problem: "Your data trains their models. Healthcare, legal, financial records — all at risk." },
            { label: "Profits",   problem: "The value you generate flows to shareholders, not to the people running the network." },
            { label: "Control",   problem: "One API change, one policy update, one shutdown — and your business disappears overnight." },
          ].map(({ label, problem }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 22px" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: "rgba(255,69,69,0.8)", letterSpacing: 1, marginBottom: 8 }}>❌ {label}</div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.88rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>{problem}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 28, padding: "22px 28px", background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16 }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.7, margin: 0 }}>
            <strong style={{ color: P_PURPLE }}>PAI3 flips the model.</strong> Own the hardware. Keep your data private. Earn from the network you run. Govern with a vote that can&apos;t be drowned out by whales.
          </p>
        </div>
      </section>

      {/* ── Four Pillars ─────────────────────────────────────────── */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(139,92,246,0.08)", borderBottom: "1px solid rgba(139,92,246,0.08)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "72px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: P_PURPLE, letterSpacing: 2, marginBottom: 14 }}>HOW IT WORKS</div>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.2rem)", color: "#fff", margin: 0 }}>Four Pillars of People&apos;s AI</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {PAI3_PILLARS.map(({ icon, title, body, color }) => (
              <div key={title} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(139,92,246,0.12)`, borderRadius: 18, padding: "28px 24px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}, transparent)` }} />
                <div style={{ fontSize: "1.8rem", marginBottom: 16 }}>{icon}</div>
                <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#fff", marginBottom: 10 }}>{title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.87rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.65, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How to Participate ────────────────────────────────────── */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "72px 24px" }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: P_CYAN, letterSpacing: 2, marginBottom: 14 }}>GET INVOLVED</div>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.2rem)", color: "#fff", marginBottom: 10 }}>Three Ways to Participate</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.45)", fontSize: "0.95rem", margin: 0 }}>
            Whether you want to own hardware, run software, or build applications — PAI3 has an entry point for every level.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {PAI3_PARTICIPATION.map(({ tag, title, body }) => (
            <div key={title} style={{ display: "flex", gap: 20, alignItems: "flex-start", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "22px 24px" }}>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: P_PURPLE, borderRadius: 6, padding: "4px 10px", whiteSpace: "nowrap", marginTop: 2, flexShrink: 0 }}>{tag}</span>
              <div>
                <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#fff", marginBottom: 6 }}>{title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Roadmap ──────────────────────────────────────────────── */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(139,92,246,0.08)", borderBottom: "1px solid rgba(139,92,246,0.08)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "72px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: P_CYAN, letterSpacing: 2, marginBottom: 14 }}>WHAT&apos;S COMING</div>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.2rem)", color: "#fff", margin: 0 }}>The Road to the World Computer</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {PAI3_ROADMAP.map(({ quarter, label, detail, done }, i) => (
              <div key={quarter} style={{ display: "flex", gap: 0 }}>
                {/* Timeline spine */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 40, flexShrink: 0 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: done ? P_PURPLE : "rgba(139,92,246,0.25)", border: `2px solid ${done ? P_PURPLE : "rgba(139,92,246,0.4)"}`, flexShrink: 0, boxShadow: done ? `0 0 12px rgba(139,92,246,0.5)` : "none", marginTop: 4 }} />
                  {i < PAI3_ROADMAP.length - 1 && (
                    <div style={{ width: 2, flex: 1, background: "rgba(139,92,246,0.15)", marginTop: 4, marginBottom: 4, minHeight: 32 }} />
                  )}
                </div>
                <div style={{ paddingLeft: 20, paddingBottom: i < PAI3_ROADMAP.length - 1 ? 36 : 0 }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", color: done ? P_PURPLE : "rgba(255,255,255,0.3)", letterSpacing: 1, marginBottom: 4 }}>{quarter}</div>
                  <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1rem", color: done ? "#fff" : "rgba(255,255,255,0.6)", marginBottom: 6 }}>{label}</h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", color: "rgba(255,255,255,0.4)", lineHeight: 1.6, margin: 0 }}>{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Guides ──────────────────────────────────────────────── */}
      <section id="guides" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px 64px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.8rem", color: "#fff", margin: 0 }}>PAI3 Guides</h2>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>{guides.length} guide{guides.length !== 1 ? "s" : ""}</span>
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.4)", marginBottom: 44, fontSize: "0.95rem" }}>
          Everything you need to understand PAI3 — from Power Nodes and tokenomics to enterprise use cases and the Q2 2026 token launch.
        </p>
        {guides.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 16, opacity: 0.3 }}>◈</div>
            <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem", color: "rgba(255,255,255,0.2)" }}>Guides dropping soon</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((guide, i) => (
              <GuideCard key={guide.id} guide={guide} config={cfg} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px 100px", textAlign: "center" }}>
        <div style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.18)", borderRadius: 24, padding: "56px 40px" }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: P_CYAN, letterSpacing: 2, marginBottom: 16 }}>TOKEN LAUNCH · Q2 2026 · BNB CHAIN</div>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem, 3vw, 2rem)", color: "#fff", marginBottom: 16, lineHeight: 1.2 }}>
            Ground Floor Is Closing.<br />The TGE Is Coming Q2 2026.
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.5)", marginBottom: 36, lineHeight: 1.7, fontSize: "0.95rem" }}>
            Power Node owners receive 150,000 $PAI3 at token launch. Node price increases with every unit sold — and 500+ are already gone. Join the community, understand the project, and position before the window closes.
          </p>
          <a href="https://pai3.ai" target="_blank" rel="noopener noreferrer"
             style={{ display: "inline-flex", alignItems: "center", gap: 10, background: `linear-gradient(135deg, ${P_PURPLE}, ${P_VIOLET})`, color: "#fff", padding: "16px 44px", borderRadius: 50, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.05rem", textDecoration: "none", boxShadow: `0 8px 40px rgba(139,92,246,0.25)` }}>
            Learn More at PAI3.ai →
          </a>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", color: "rgba(255,255,255,0.2)", marginTop: 16 }}>
            Opens pai3.ai — not financial advice
          </p>
        </div>
      </section>

    </div>
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

// ─── Ink Page ────────────────────────────────────────────────────────────────

const INK_BLUE     = "#0066FF";
const INK_BLUE_LT  = "#1A8FFF";
const INK_PURPLE   = "#8B5CF6";
const INK_GREEN    = "#10B981";
const INK_DARK     = "#0A0B1E";
const INK_RED      = "#FF0420";

const INK_PILLARS = [
  {
    icon: "🛡️",
    title: "Permissionless Fault Proofs",
    body: "The first Superchain with multiple challengers — Kraken and Gelato both monitor the chain. Anyone can contest invalid transactions, making Ink more decentralised and accountable than any single-challenger rollup.",
    color: INK_BLUE,
  },
  {
    icon: "⚡",
    title: "SuperchainERC20",
    body: "Native token interoperability across 34+ OP Chains. Move assets between Base, OP Mainnet, Unichain, and Ink in seconds — no third-party bridge needed. Unified liquidity across the entire Superchain.",
    color: INK_PURPLE,
  },
  {
    icon: "🏦",
    title: "Kraken Native Integration",
    body: "10M+ Kraken users get a one-click on-ramp from CEX to DeFi. No manual bridging, no confusing steps — just connect your Kraken account and you're live on Ink. The simplest CEX → DeFi path in crypto.",
    color: INK_GREEN,
  },
  {
    icon: "🔗",
    title: "1-Second Blocks",
    body: "Near-instant transaction confirmation with sub-second targeting on the roadmap. Gas fees a fraction of Ethereum mainnet. Ink inherits Ethereum's security while delivering the speed users actually need for DeFi.",
    color: INK_BLUE,
  },
];

const INK_ECOSYSTEM = [
  { icon: "🏦", name: "Tydro", tag: "Lending", body: "Aave-powered lending protocol. Supply assets to earn Tydro Points (Season 2 live) — primary path to INK airdrop allocation." },
  { icon: "🔄", name: "Velodrome", tag: "DEX", body: "Leading Superchain DEX and liquidity marketplace. LP on Velodrome to earn trading fees and build transaction history." },
  { icon: "💱", name: "SuperSwap", tag: "DEX", body: "Native Ink decentralised exchange. Simple swaps, accessible to new DeFi users coming from Kraken." },
  { icon: "📈", name: "Nado", tag: "Perps", body: "Perpetual futures DEX on Ink. Trading volume tracked for airdrop. INK allocation confirmed for Nado users." },
  { icon: "🌉", name: "Across Protocol", tag: "Bridge", body: "Official day-1 bridge partner. 2-second L2-to-L2 transfers across the Superchain ecosystem." },
  { icon: "🌐", name: "ZNS · .ink Domains", tag: "Domains", body: "Register your .ink domain. NFT ownership + airdrop qualification. Identity layer for the Ink ecosystem." },
];

const INK_AIRDROP_TIERS = [
  {
    tier: "Minimum",
    cost: "~$100 + gas",
    color: INK_GREEN,
    steps: [
      "Bridge $50–100 ETH to Ink via Superbridge",
      "Swap on SuperSwap or Velodrome (1–2 times)",
      "Register a .ink domain via ZNS",
      "Send a few GMs on OnChainGM",
      "Join Discord + Telegram",
    ],
  },
  {
    tier: "Medium",
    cost: "~$1,000–2,000 + gas",
    color: INK_BLUE,
    steps: [
      "Supply $500–2,000 to Tydro (Season 2 live)",
      "Borrow and repay on Tydro multiple times",
      "Trade on Nado perp DEX",
      "Mint Ink Pass NFT",
      "Deploy 1–2 contracts via OnChainGM",
    ],
  },
  {
    tier: "Maximum",
    cost: "$5,000–10,000+ + gas",
    color: INK_PURPLE,
    steps: [
      "Supply $5,000–10,000+ to Tydro",
      "Maintain liquidity through full Season 2",
      "High-volume trading on Nado",
      "Active LP on Velodrome + SuperSwap",
      "Build a dApp on Ink (grants available)",
    ],
  },
];

function InkPage({ guides, cfg }: { guides: import("@/types").Guide[]; cfg: import("@/types").SubdomainConfig }) {
  return (
    <div style={{ background: INK_DARK, minHeight: "100vh", color: "#fff" }}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section style={{
        background: `linear-gradient(160deg, #00051A 0%, #000B2E 50%, ${INK_DARK} 100%)`,
        padding: "90px 24px 80px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        borderBottom: `1px solid rgba(0,102,255,0.15)`,
      }}>
        {/* Glow orbs */}
        <div style={{ position: "absolute", top: -100, left: "50%", transform: "translateX(-50%)", width: 700, height: 700, borderRadius: "50%", background: `radial-gradient(circle, rgba(0,102,255,0.1) 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -80, right: "8%", width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, left: "5%", width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)`, pointerEvents: "none" }} />

        <div style={{ maxWidth: 800, margin: "0 auto", position: "relative", zIndex: 1 }}>
          {/* Badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,102,255,0.1)", border: "1px solid rgba(0,102,255,0.25)", borderRadius: 50, padding: "6px 18px", marginBottom: 28 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: INK_BLUE, display: "inline-block", boxShadow: `0 0 8px ${INK_BLUE}` }} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: INK_BLUE_LT, letterSpacing: 1.5 }}>POWERED BY KRAKEN · BUILT ON OPTIMISM SUPERCHAIN</span>
          </div>

          <h1 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "clamp(2.2rem, 6vw, 4rem)", lineHeight: 1.05, marginBottom: 24 }}>
            <span style={{ color: "#fff" }}>DeFi&apos;s New Home.</span>
            <br />
            <span style={{ background: `linear-gradient(90deg, ${INK_BLUE}, ${INK_PURPLE})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Backed by Kraken&apos;s 10M Users.
            </span>
          </h1>

          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.75, maxWidth: 620, margin: "0 auto 44px" }}>
            Ink is Kraken&apos;s Layer 2 blockchain — a DeFi-first Optimism Superchain rollup that bridges the gap between centralised exchanges and on-chain finance. Airdrop confirmed. TGE expected Q3 2026. This is where Base was 18 months ago.
          </p>

          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="https://inkonchain.com" target="_blank" rel="noopener noreferrer"
               style={{ display: "inline-flex", alignItems: "center", gap: 10, background: `linear-gradient(135deg, ${INK_BLUE}, ${INK_PURPLE})`, color: "#fff", padding: "15px 36px", borderRadius: 50, fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "1rem", textDecoration: "none", boxShadow: `0 8px 40px rgba(0,102,255,0.3)`, letterSpacing: 0.2 }}>
              Bridge to Ink Now →
            </a>
            <a href="#airdrop"
               style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", padding: "15px 32px", borderRadius: 50, fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "1rem", textDecoration: "none" }}>
              Airdrop Guide
            </a>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────── */}
      <section style={{ background: "rgba(0,102,255,0.04)", borderBottom: "1px solid rgba(0,102,255,0.1)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 48 }}>
          {[
            { value: "100K+",    label: "Discord Members" },
            { value: "~$8.5M",   label: "Total Value Locked" },
            { value: "Q3 2026",  label: "INK Token Launch" },
            { value: "10M+",     label: "Kraken Users · On-Ramp Ready" },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "1.6rem", color: INK_BLUE_LT, textShadow: `0 0 20px rgba(0,102,255,0.4)` }}>{value}</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", color: "rgba(255,255,255,0.35)", letterSpacing: 1, textTransform: "uppercase", marginTop: 6 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The Opportunity ──────────────────────────────────────── */}
      <section style={{ maxWidth: 920, margin: "0 auto", padding: "80px 24px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 3, height: 32, background: `linear-gradient(180deg, ${INK_BLUE}, ${INK_PURPLE})`, borderRadius: 2 }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: INK_BLUE_LT, letterSpacing: 2 }}>THE OPPORTUNITY</span>
        </div>
        <h2 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.4rem)", color: "#fff", marginBottom: 24, lineHeight: 1.15 }}>
          Ink is where Base was 18 months ago.<br />
          <span style={{ color: "rgba(255,255,255,0.35)" }}>Base went from $0 to $5.34B TVL.</span>
        </h2>

        {/* Ink vs Base table */}
        <div style={{ overflowX: "auto", marginBottom: 28 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans', sans-serif", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <th style={{ textAlign: "left", padding: "10px 16px", color: "rgba(255,255,255,0.4)", fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", letterSpacing: 1, fontWeight: 400 }}>METRIC</th>
                <th style={{ textAlign: "center", padding: "10px 16px", color: INK_BLUE_LT, fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", letterSpacing: 1, fontWeight: 700 }}>INK (NOW)</th>
                <th style={{ textAlign: "center", padding: "10px 16px", color: "rgba(255,255,255,0.4)", fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", letterSpacing: 1, fontWeight: 400 }}>BASE (AT SAME AGE)</th>
              </tr>
            </thead>
            <tbody>
              {[
                { metric: "Age",              ink: "3 months old",          base: "~3 months old at launch" },
                { metric: "Backing",           ink: "Kraken · 10M users",    base: "Coinbase · 110M users" },
                { metric: "TVL",               ink: "~$8.5M",                base: "~$30M (3 months in)" },
                { metric: "Block Time",        ink: "1 second",              base: "2 seconds" },
                { metric: "Fault Proofs",      ink: "✅ Multiple challengers", base: "❌ Not until Oct 2024" },
                { metric: "Token",             ink: "NO TOKEN YET",          base: "No confirmed token" },
                { metric: "Airdrop",           ink: "✅ CONFIRMED · Q3 2026", base: "❌ Not confirmed" },
                { metric: "CEX Integration",   ink: "Native Kraken on-ramp", base: "Coinbase on-ramp" },
              ].map(({ metric, ink, base }, i) => (
                <tr key={metric} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                  <td style={{ padding: "12px 16px", color: "rgba(255,255,255,0.5)" }}>{metric}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center", color: "#fff", fontWeight: 600 }}>{ink}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>{base}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "22px 28px", background: "rgba(0,102,255,0.06)", border: "1px solid rgba(0,102,255,0.2)", borderRadius: 16 }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.7, margin: 0 }}>
            <strong style={{ color: INK_BLUE_LT }}>The window is open right now.</strong> Ink just launched 3 months ago. The DeFi protocols are live, the airdrop is confirmed, and the Kraken on-ramp is ready. Early participants in Base-equivalent ecosystems have historically seen 5–10x+ returns on their farming capital.
          </p>
        </div>
      </section>

      {/* ── Four Pillars ─────────────────────────────────────────── */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(0,102,255,0.07)", borderBottom: "1px solid rgba(0,102,255,0.07)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "72px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: INK_BLUE_LT, letterSpacing: 2, marginBottom: 14 }}>WHY INK IS DIFFERENT</div>
            <h2 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.2rem)", color: "#fff", margin: 0 }}>Built Different from Day One</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {INK_PILLARS.map(({ icon, title, body, color }) => (
              <div key={title} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(0,102,255,0.12)`, borderRadius: 18, padding: "28px 24px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}, transparent)` }} />
                <div style={{ fontSize: "1.8rem", marginBottom: 16 }}>{icon}</div>
                <h3 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#fff", marginBottom: 10 }}>{title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.87rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.65, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Airdrop Section ──────────────────────────────────────── */}
      <section id="airdrop" style={{ maxWidth: 1000, margin: "0 auto", padding: "80px 24px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 3, height: 32, background: `linear-gradient(180deg, ${INK_GREEN}, ${INK_BLUE})`, borderRadius: 2 }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: INK_GREEN, letterSpacing: 2 }}>AIRDROP</span>
        </div>

        {/* Confirmed badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: "12px 20px", marginBottom: 32 }}>
          <span style={{ fontSize: "1.2rem" }}>✅</span>
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: INK_GREEN }}>INK Token Airdrop — OFFICIALLY CONFIRMED</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", color: "rgba(255,255,255,0.45)", marginTop: 2 }}>TGE expected July–September 2026 · No exact date announced yet</div>
          </div>
        </div>

        <h2 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem, 3vw, 2.2rem)", color: "#fff", marginBottom: 12, lineHeight: 1.15 }}>
          How to Qualify for the INK Airdrop
        </h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.45)", marginBottom: 48, fontSize: "0.95rem" }}>
          Multiple qualification paths. Pick the tier that matches your risk tolerance.
        </p>

        {/* Three tiers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 48 }}>
          {INK_AIRDROP_TIERS.map(({ tier, cost, color, steps }) => (
            <div key={tier} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 18, padding: "28px 24px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, transparent)` }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "1.05rem", color: "#fff" }}>{tier}</div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", color: color, background: `rgba(255,255,255,0.05)`, border: `1px solid ${color}30`, borderRadius: 6, padding: "4px 10px", whiteSpace: "nowrap" }}>{cost}</div>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {steps.map((step) => (
                  <li key={step} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: color, fontSize: "0.75rem", marginTop: 3, flexShrink: 0 }}>▸</span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.87rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Primary path callout */}
        <div style={{ padding: "24px 28px", background: "rgba(0,102,255,0.06)", border: "1px solid rgba(0,102,255,0.2)", borderRadius: 16 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: INK_BLUE_LT, letterSpacing: 1.5, marginBottom: 10 }}>⭐ PRIMARY PATH</div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.7, margin: 0 }}>
            <strong style={{ color: "#fff" }}>Tydro is your #1 priority.</strong> Season 2 points are live now. Supplying to Tydro (Ink&apos;s Aave-powered lending protocol) is the most direct path to INK token allocation. The longer you hold, the more points you accumulate.{" "}
            <a href="https://tydro.com" target="_blank" rel="noopener noreferrer" style={{ color: INK_BLUE_LT, textDecoration: "none", fontWeight: 600 }}>Open Tydro →</a>
          </p>
        </div>
      </section>

      {/* ── Ecosystem ────────────────────────────────────────────── */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(139,92,246,0.07)", borderBottom: "1px solid rgba(139,92,246,0.07)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "72px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", color: INK_PURPLE, letterSpacing: 2, marginBottom: 14 }}>LIVE PROTOCOLS</div>
            <h2 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.2rem)", color: "#fff", margin: 0 }}>The Ink Ecosystem</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {INK_ECOSYSTEM.map(({ icon, name, tag, body }) => (
              <div key={name} style={{ display: "flex", gap: 16, alignItems: "flex-start", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 22px" }}>
                <div style={{ fontSize: "1.6rem", flexShrink: 0, marginTop: 2 }}>{icon}</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>{name}</span>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.58rem", color: INK_PURPLE, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 4, padding: "2px 8px" }}>{tag}</span>
                  </div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.86rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Guides ──────────────────────────────────────────────── */}
      <section id="guides" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px 64px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "1.8rem", color: "#fff", margin: 0 }}>Ink Guides</h2>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>{guides.length} guide{guides.length !== 1 ? "s" : ""}</span>
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.4)", marginBottom: 44, fontSize: "0.95rem" }}>
          Step-by-step guides for bridging to Ink, qualifying for the airdrop, and using every protocol in the ecosystem.
        </p>
        {guides.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 16, opacity: 0.3 }}>🖊️</div>
            <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "1.1rem", color: "rgba(255,255,255,0.2)" }}>Guides dropping soon</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((guide, i) => (
              <GuideCard key={guide.id} guide={guide} config={cfg} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px 100px", textAlign: "center" }}>
        <div style={{ background: "rgba(0,102,255,0.05)", border: "1px solid rgba(0,102,255,0.15)", borderRadius: 24, padding: "56px 40px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 50, padding: "6px 16px", marginBottom: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: INK_GREEN, display: "inline-block", boxShadow: `0 0 8px ${INK_GREEN}` }} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: INK_GREEN, letterSpacing: 1.5 }}>AIRDROP CONFIRMED · SEASON 2 LIVE</span>
          </div>
          <h2 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem, 3vw, 2rem)", color: "#fff", marginBottom: 16, lineHeight: 1.2 }}>
            The Early Window is Open.<br />The TGE is Q3 2026.
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.5)", marginBottom: 36, lineHeight: 1.7, fontSize: "0.95rem" }}>
            Bridge to Ink, supply to Tydro, trade on Nado, register your .ink domain. Every action now counts toward your INK airdrop allocation. This is the Base playbook — and Ink is at month 3.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="https://inkonchain.com" target="_blank" rel="noopener noreferrer"
               style={{ display: "inline-flex", alignItems: "center", gap: 10, background: `linear-gradient(135deg, ${INK_BLUE}, ${INK_PURPLE})`, color: "#fff", padding: "16px 40px", borderRadius: 50, fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "1.05rem", textDecoration: "none", boxShadow: `0 8px 40px rgba(0,102,255,0.25)` }}>
              Bridge to Ink →
            </a>
            <a href="https://tydro.com" target="_blank" rel="noopener noreferrer"
               style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: INK_GREEN, padding: "16px 32px", borderRadius: 50, fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "1rem", textDecoration: "none" }}>
              Open Tydro
            </a>
          </div>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.62rem", color: "rgba(255,255,255,0.2)", marginTop: 18 }}>
            Opens inkonchain.com — connect any Web3 wallet to get started
          </p>
        </div>
      </section>

    </div>
  );
}
