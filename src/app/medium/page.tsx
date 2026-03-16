import { getGuidesByDifficulty, countGuidesByDifficulty } from "@/lib/guides";
import { getSubdomainConfig } from "@/lib/subdomains";
import type { Metadata } from "next";
import Link from "next/link";
import GuideCard from "@/components/GuideCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Medium Guides — Web3Guides",
  description: "Intermediate-level crypto and Web3 guides. Build on your foundations with in-depth coverage of DeFi protocols, staking, bridges, and more.",
};

const PAGE_SIZE = 12;

interface Props {
  searchParams: { page?: string };
}

export default async function MediumPage({ searchParams }: Props) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const [guides, total] = await Promise.all([
    getGuidesByDifficulty("intermediate", { limit: PAGE_SIZE, offset }),
    countGuidesByDifficulty("intermediate"),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ background: "#fefbf6", minHeight: "100vh" }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ margin: "0 auto", maxWidth: 1280, display: "flex", height: 56, alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
          <Link href="/" style={{ fontFamily: "'Bungee', cursive", fontSize: "1.1rem", background: "linear-gradient(135deg, #ff6b35, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textDecoration: "none" }}>
            W3G
          </Link>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/easy" style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#6b7280", textDecoration: "none" }}>🌱 Easy</Link>
            <Link href="/advanced" style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#6b7280", textDecoration: "none" }}>🔮 Advanced</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: "56px 24px 40px", background: "linear-gradient(135deg, rgba(255,107,53,0.08) 0%, transparent 60%)" }}>
        <div style={{ margin: "0 auto", maxWidth: 1280 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, borderRadius: 50, padding: "6px 16px", marginBottom: 20, background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.3)", color: "#ea580c", fontFamily: "'Space Mono', monospace", fontSize: "0.7rem" }}>
            ⚡ Medium Level
          </div>
          <h1 style={{ fontFamily: "'Bungee', cursive", fontWeight: 400, fontSize: "clamp(2.5rem, 6vw, 4rem)", lineHeight: 1.05, color: "#1a1a1a", marginBottom: 16 }}>
            Intermediate{" "}
            <span style={{ color: "#ff6b35" }}>Guides</span>
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", maxWidth: 520, fontSize: "1.05rem", lineHeight: 1.65, color: "#6b7280" }}>
            Ready to go deeper? Explore DeFi protocols, staking strategies, cross-chain bridges, Layer 2 solutions, and more.
          </p>
          {total > 0 && (
            <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ height: 2, width: 40, borderRadius: 2, background: "#ff6b35", opacity: 0.5 }} />
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#ff6b35" }}>
                {total} {total === 1 ? "guide" : "guides"} available
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Guides grid */}
      <section style={{ margin: "0 auto", maxWidth: 1280, padding: "0 24px 64px" }}>
        {guides.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 0", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", opacity: 0.3, marginBottom: 16 }}>📭</div>
            <p style={{ fontFamily: "'Bungee', cursive", fontSize: "1.3rem", color: "#9ca3af", marginBottom: 8 }}>No medium guides yet</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#9ca3af" }}>Check back soon — articles are being added.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {guides.map((guide, i) => {
                const cfg = getSubdomainConfig(guide.subdomain);
                if (!cfg) return null;
                return <GuideCard key={guide.id} guide={guide} config={cfg} index={i} />;
              })}
            </div>
            {totalPages > 1 && (
              <DifficultyPagination currentPage={page} totalPages={totalPages} accentColor="#ff6b35" />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function DifficultyPagination({ currentPage, totalPages, accentColor }: { currentPage: number; totalPages: number; accentColor: string }) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <nav style={{ marginTop: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {currentPage > 1 && (
        <a href={`?page=${currentPage - 1}`} style={{ display: "flex", height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", textDecoration: "none" }}>←</a>
      )}
      {pages.map((p) => (
        <a key={p} href={`?page=${p}`}
           style={p === currentPage
             ? { display: "flex", height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", fontWeight: 700, color: "#fff", background: accentColor, textDecoration: "none" }
             : { display: "flex", height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", textDecoration: "none" }
           }>
          {p}
        </a>
      ))}
      {currentPage < totalPages && (
        <a href={`?page=${currentPage + 1}`} style={{ display: "flex", height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", textDecoration: "none" }}>→</a>
      )}
    </nav>
  );
}
