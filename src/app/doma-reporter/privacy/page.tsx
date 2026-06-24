import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "DOMA Reporter Privacy Policy | Web3 Guides",
  description: "Privacy policy for the DOMA Reporter Discord bot: what data it collects, how it is used, and your rights.",
};

const S = {
  page: { background: "#fefbf6", minHeight: "100vh", padding: "0 0 80px" } as CSSProperties,
  nav: { background: "rgba(254,251,246,0.95)", borderBottom: "1px solid #e5e7eb", padding: "0 40px", height: 60, display: "flex", alignItems: "center" } as CSSProperties,
  logo: { fontFamily: "'Bungee', cursive", fontSize: "1.2rem", background: "linear-gradient(135deg, #ff6b35, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textDecoration: "none" } as CSSProperties,
  wrap: { maxWidth: 760, margin: "0 auto", padding: "60px 40px" } as CSSProperties,
  h1: { fontFamily: "'Bungee', cursive", fontSize: "2.2rem", color: "#1a1a1a", marginBottom: 8 } as CSSProperties,
  date: { fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", color: "#9ca3af", marginBottom: 40 } as CSSProperties,
  h2: { fontFamily: "'DM Sans', sans-serif", fontSize: "1.2rem", fontWeight: 700, color: "#1a1a1a", marginTop: 40, marginBottom: 12 } as CSSProperties,
  p: { fontFamily: "'DM Sans', sans-serif", fontSize: "0.95rem", color: "#4b5563", lineHeight: 1.8, marginBottom: 16 } as CSSProperties,
};

export default function DomaReporterPrivacyPage() {
  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <a href="https://web3guides.com" style={S.logo}>Web3 Guides</a>
      </nav>
      <div style={S.wrap}>
        <h1 style={S.h1}>DOMA Reporter Privacy Policy</h1>
        <p style={S.date}>Last updated: June 11, 2026</p>

        <p style={S.p}>DOMA Reporter is a private Discord bot operated for the official DOMA Protocol Discord server. It runs in that single server only and is not available for installation elsewhere. This policy explains what data the bot collects from server members, how that data is used, and the choices you have.</p>

        <h2 style={S.h2}>What We Collect</h2>
        <p style={S.p}><strong>Message data:</strong> the bot processes messages posted in the server, including message text, author username and ID, channel name, and timestamp. This powers the server&apos;s scam and phishing protection, community analytics, and feedback triage.</p>
        <p style={S.p}><strong>Member data:</strong> usernames, display names, nicknames, and role assignments. This powers staff impersonation protection, role management commands, and post-incident role recovery.</p>
        <p style={S.p}><strong>Moderation records:</strong> when the bot detects a policy violation such as a scam post, it logs the offending message, the author, and the action taken.</p>
        <p style={S.p}><strong>Voluntarily submitted data:</strong> wallet addresses and competition entries that members submit through designated bot channels and commands.</p>

        <h2 style={S.h2}>How We Use It</h2>
        <p style={S.p}>Data is used solely to operate the server: detecting and removing phishing and scam posts, identifying accounts impersonating staff, restoring member roles after security incidents, producing community activity and sentiment summaries for the server&apos;s leadership team, routing member feedback and bug reports to the development team, and running community programs that members opt into.</p>

        <h2 style={S.h2}>AI Processing</h2>
        <p style={S.p}>Some messages are classified or summarized using the Anthropic Claude API, for example to decide whether a message is a scam or to produce weekly community summaries. This processing happens at inference time only. Message data is not used to train machine learning or AI models, by us or by Anthropic, whose API terms exclude customer data from model training.</p>

        <h2 style={S.h2}>Storage and Security</h2>
        <p style={S.p}>Data is stored in a private PostgreSQL database (hosted on Supabase) with row-level security enabled. Access is limited to the bot service and the server&apos;s leadership team. Data is never sold, traded, shared with third parties, or used for advertising.</p>

        <h2 style={S.h2}>Data Retention</h2>
        <p style={S.p}>Message and moderation data is retained for as long as it is operationally useful for the purposes above, including security review of past incidents. Data belonging to members who leave the server is not collected further from the moment they leave.</p>

        <h2 style={S.h2}>Your Choices</h2>
        <p style={S.p}>Participation in bot-driven programs (competitions, wallet collection) is always opt-in. Message processing for moderation and analytics applies to public channels in the server and cannot be opted out of individually, as it is part of how the server is kept safe. If you want data about you removed, contact the server&apos;s moderation team through the DOMA Discord and we will handle the request.</p>

        <h2 style={S.h2}>Children</h2>
        <p style={S.p}>The bot operates inside Discord and is subject to Discord&apos;s own age requirements. We do not knowingly collect data from anyone under the minimum age required by Discord&apos;s Terms of Service.</p>

        <h2 style={S.h2}>Changes</h2>
        <p style={S.p}>If this policy changes, the updated version will be posted at this address with a new date at the top.</p>

        <h2 style={S.h2}>Contact</h2>
        <p style={S.p}>For privacy questions or data removal requests, contact the moderation team in the official <a href="https://discord.gg/doma" style={{ color: "#ff6b35" }}>DOMA Protocol Discord</a>.</p>

        <p style={{ ...S.p, marginTop: 40, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
          <a href="https://web3guides.com" style={{ color: "#ff6b35", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>← Back to Web3 Guides</a>
        </p>
      </div>
    </div>
  );
}
