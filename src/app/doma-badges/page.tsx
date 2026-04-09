import type { Metadata } from "next";
import Image from "next/image";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Doma Protocol Season 1 Badges Explained | Web3 Guides",
  description:
    "Everything you need to know about Doma Protocol's Genesis Founder and Day 1 Genesis badges — eligibility, requirements, rewards, and how the point boosts work.",
};

/* ─── Fetch generated guide from Supabase ───────────────────────────────── */
async function getGuide() {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("guides")
      .select("title, content, summary, key_points")
      .eq("subdomain", "doma")
      .eq("slug", "doma-season-1-badges-genesis-founder-and-day-1-genesis-explained")
      .single();
    return data;
  } catch {
    return null;
  }
}

/* ─── Minimal markdown → HTML ───────────────────────────────────────────── */
function mdToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 style="font-size:17px;font-weight:800;color:#f1f5f9;margin:28px 0 10px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:21px;font-weight:800;color:#f1f5f9;margin:40px 0 14px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.07)">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:26px;font-weight:900;color:#f1f5f9;margin:0 0 20px">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e2e8f0;font-weight:700">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#1e293b;color:#f472b6;padding:2px 6px;border-radius:4px;font-size:13px">$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:12px;margin:20px 0;display:block" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#818cf8;text-decoration:none" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #6366f1;margin:16px 0;padding:10px 16px;background:rgba(99,102,241,0.08);color:#94a3b8;font-style:italic">$1</blockquote>')
    .replace(/^[-*] (.+)$/gm, '<li style="margin:6px 0;color:#cbd5e1;line-height:1.6">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul style="padding-left:20px;margin:12px 0">${m}</ul>`)
    .replace(/\n\n([^<\n].+)/g, '\n\n<p style="color:#94a3b8;line-height:1.8;margin:14px 0">$1</p>');
}

/* ─── Data ──────────────────────────────────────────────────────────────── */
const FOUNDER_DOMAINS = ["$SOFTWARE.ai", "$BRAG.com", "$BONER.com"];

const FOUNDER_REQS = [
  { icon: "💵", text: "Purchased at least $10 USDC.e of the token" },
  { icon: "🔗", text: "Purchased while the token was still in its bonding curve" },
  { icon: "📅", text: "Purchased on Day 1 of the token launch" },
  { icon: "⏳", text: "Held at least $10 USDC.e worth for a minimum of 7 days" },
];

const DAY1_REQS = [
  { icon: "💵", text: "$10 USD minimum net spend" },
  { icon: "🔗", text: "Domain must still be in its Day 1 bonding period at time of purchase" },
  { icon: "🕛", text: "Purchase made before midnight UTC on April 1st" },
  { icon: "⏳", text: "7-day minimum holding period" },
  { icon: "✅", text: "The purchased domain must successfully bond" },
];

/* ─── Components ──────────────────────────────────────────────────────────── */
function ReqItem({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <span style={{ fontSize: 18, lineHeight: 1.4, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 15, color: "#cbd5e1", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default async function DomaBadgesPage() {
  const guide = await getGuide();

  return (
    <div style={{ minHeight: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Nav */}
      <nav style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", display: "flex", alignItems: "center", gap: 24, height: 56 }}>
        <a href="/" style={{ fontFamily: "'Bungee', cursive", fontSize: 16, background: "linear-gradient(135deg,#ff6b35,#ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", textDecoration: "none" }}>
          Web3 Guides
        </a>
        <a href="https://doma.web3guides.com" style={{ fontSize: 13, color: "#475569", textDecoration: "none" }}>Doma Hub →</a>
      </nav>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "52px 24px 100px" }}>

        {/* Hero */}
        <div style={{ marginBottom: 52 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700, color: "#818cf8", marginBottom: 20, textTransform: "uppercase" as const, letterSpacing: 0.8 }}>
            Doma Protocol · Season 1
          </div>
          <h1 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(32px, 6vw, 52px)", lineHeight: 1.1, margin: "0 0 20px", background: "linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Doma Badges Explained
          </h1>
          <p style={{ fontSize: 18, color: "#94a3b8", lineHeight: 1.7, maxWidth: 640, margin: 0 }}>
            Doma Protocol just launched Season 1 badges. A lot of people are confused about what they mean and how to qualify — here&apos;s everything you need to know.
          </p>
        </div>

        {/* Badge overview cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 52 }}>

          {/* Day 1 badge */}
          <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)", borderRadius: 16, padding: "32px 24px", display: "flex", flexDirection: "column" as const, alignItems: "center", textAlign: "center" as const }}>
            <div style={{ width: 110, height: 110, borderRadius: "50%", background: "rgba(56,189,248,0.08)", border: "2px solid rgba(56,189,248,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, overflow: "hidden" }}>
              <Image src="/day1badge.png" alt="Day 1 Genesis Badge" width={90} height={90} style={{ objectFit: "contain" }} />
            </div>
            <h3 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 800, color: "#38bdf8" }}>Day 1 Genesis Badge</h3>
            <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
              Available for any fractionalized domain that launched, provided you met the eligibility requirements.
            </p>
          </div>

          {/* Founder badge */}
          <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 16, padding: "32px 24px", display: "flex", flexDirection: "column" as const, alignItems: "center", textAlign: "center" as const }}>
            <div style={{ width: 110, height: 110, borderRadius: "50%", background: "rgba(245,158,11,0.08)", border: "2px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, overflow: "hidden" }}>
              <Image src="/foundersbadge.png" alt="Genesis Founder Badge" width={90} height={90} style={{ objectFit: "contain" }} />
            </div>
            <h3 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 800, color: "#f59e0b" }}>Genesis Founder Badge</h3>
            <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
              Exclusive to the first three launches: <strong style={{ color: "#94a3b8" }}>$SOFTWARE.ai, $BRAG.com,</strong> and <strong style={{ color: "#94a3b8" }}>$BONER.com</strong>.
            </p>
          </div>
        </div>

        {/* Founder requirements */}
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, padding: "28px", marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: "0 0 20px", paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            Genesis Founder Badge — Requirements
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10, marginBottom: 24 }}>
            {FOUNDER_DOMAINS.map(d => (
              <span key={d} style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{d}</span>
            ))}
          </div>
          <div>{FOUNDER_REQS.map((r, i) => <ReqItem key={i} {...r} />)}</div>
          <div style={{ marginTop: 20, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#818cf8", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>⚡ $SOFTWARE.ai Exception</div>
            <p style={{ margin: 0, fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>
              $SOFTWARE.ai bonded in a single block — technically impossible to buy during bonding. To keep things fair, the &quot;must have purchased during bonding&quot; requirement was waived for $SOFTWARE.ai holders.
            </p>
          </div>
        </div>

        {/* Day 1 requirements */}
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, padding: "28px", marginBottom: 52 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: "0 0 8px", paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            Day 1 Genesis Badge — Requirements
          </h2>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b" }}>Available for all fractionalized domains, not just the first three.</p>
          <div>{DAY1_REQS.map((r, i) => <ReqItem key={i} {...r} />)}</div>
        </div>

        {/* Rewards — clean two-col, no testnet clutter */}
        <div style={{ marginBottom: 52 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: "0 0 24px" }}>What Do the Badges Give You?</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>

            <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: 16, padding: "24px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: "#38bdf8" }}>Day 1 Genesis</h3>
              <p style={{ margin: 0, fontSize: 15, color: "#cbd5e1", lineHeight: 1.7 }}>
                🔵 <strong>1% lifetime trading point boost</strong> on all domains.
              </p>
            </div>

            <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 16, padding: "24px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: "#f59e0b" }}>Genesis Founder</h3>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                <p style={{ margin: 0, fontSize: 15, color: "#cbd5e1", lineHeight: 1.7 }}>
                  🔵 <strong>1% lifetime trading point boost</strong> on all domains.
                </p>
                <p style={{ margin: 0, fontSize: 15, color: "#cbd5e1", lineHeight: 1.7 }}>
                  🟡 <strong>2× multiplier</strong> on trading points earned on $BONER.com, $BRAG.com and $SOFTWARE.ai during S0 — retroactively added to S0 points.
                </p>
              </div>
            </div>
          </div>

          {/* Testnet note — its own full-width row so it's not squashed */}
          <div style={{ marginTop: 16, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 16, padding: "18px 24px", display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 20 }}>🛠️</span>
            <p style={{ margin: 0, fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>
              <strong style={{ color: "#818cf8" }}>Testnet users</strong> also receive retroactive point allocations, added separately to their Season Testnet points.
            </p>
          </div>
        </div>

        {/* ── Generated deep-dive guide from Supabase ── */}
        {guide && (
          <div style={{ marginBottom: 52 }}>
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 0 48px" }} />
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 10 }}>Deep Dive</div>
              <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(24px,4vw,36px)", lineHeight: 1.15, margin: "0 0 16px", color: "#f1f5f9" }}>
                {guide.title}
              </h2>
              {guide.summary && (
                <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.7, margin: 0 }}>{guide.summary}</p>
              )}
            </div>

            {guide.key_points && Array.isArray(guide.key_points) && guide.key_points.length > 0 && (
              <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 14, padding: "20px 24px", marginBottom: 36 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 14 }}>Key Takeaways</div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" as const, gap: 10 }}>
                  {(guide.key_points as string[]).map((pt: string, i: number) => (
                    <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>
                      <span style={{ color: "#6366f1", fontWeight: 700, flexShrink: 0 }}>→</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {guide.content && (
              <div
                style={{ fontSize: 16, lineHeight: 1.8, color: "#94a3b8" }}
                dangerouslySetInnerHTML={{ __html: mdToHtml(guide.content) }}
              />
            )}
          </div>
        )}

        {/* CTA */}
        <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(236,72,153,0.08) 100%)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 16, padding: "32px", textAlign: "center" as const }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", marginBottom: 10 }}>Want to go deeper on Doma?</div>
          <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>Our Doma hub covers tokenisation mechanics, the DOT/DST dual-token model, bonding curves, and more.</p>
          <a href="https://doma.web3guides.com" style={{ display: "inline-block", background: "linear-gradient(135deg,#6366f1,#ec4899)", color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 10, textDecoration: "none" }}>
            Visit the Doma Hub →
          </a>
        </div>

      </div>
    </div>
  );
}
