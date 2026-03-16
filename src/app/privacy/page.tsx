import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Privacy Policy | Web3 Guides",
  description: "Privacy policy for Web3 Guides — how we collect, use, and protect your data.",
};

const S = {
  page: { background: "#fefbf6", minHeight: "100vh", padding: "0 0 80px" } as CSSProperties,
  nav: { background: "rgba(254,251,246,0.95)", borderBottom: "1px solid #e5e7eb", padding: "0 40px", height: 60, display: "flex", alignItems: "center" } as CSSProperties,
  logo: { fontFamily: "'Bungee', cursive", fontSize: "1.2rem", background: "linear-gradient(135deg, #ff6b35, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textDecoration: "none" } as CSSProperties,
  wrap: { maxWidth: 760, margin: "0 auto", padding: "60px 40px" } as CSSProperties,
  h1: { fontFamily: "'Bungee', cursive", fontSize: "2.5rem", color: "#1a1a1a", marginBottom: 8 } as CSSProperties,
  date: { fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", color: "#9ca3af", marginBottom: 40 } as CSSProperties,
  h2: { fontFamily: "'DM Sans', sans-serif", fontSize: "1.2rem", fontWeight: 700, color: "#1a1a1a", marginTop: 40, marginBottom: 12 } as CSSProperties,
  p: { fontFamily: "'DM Sans', sans-serif", fontSize: "0.95rem", color: "#4b5563", lineHeight: 1.8, marginBottom: 16 } as CSSProperties,
};

export default function PrivacyPage() {
  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <a href="https://web3guides.com" style={S.logo}>Web3 Guides</a>
      </nav>
      <div style={S.wrap}>
        <h1 style={S.h1}>Privacy Policy</h1>
        <p style={S.date}>Last updated: March 2026</p>

        <p style={S.p}>Web3 Guides ("we", "us", or "our") is committed to protecting your privacy. This policy explains what information we collect, how we use it, and your rights.</p>

        <h2 style={S.h2}>Information We Collect</h2>
        <p style={S.p}>We collect minimal data to operate this site. This may include:</p>
        <p style={S.p}><strong>Usage data:</strong> Pages visited, browser type, referring URLs, and general geographic region — collected anonymously via server logs and analytics tools (e.g. Vercel Analytics). No personally identifiable information is collected without your consent.</p>
        <p style={S.p}><strong>No accounts:</strong> Web3 Guides does not require registration or account creation. We do not collect your name, email address, or payment information.</p>

        <h2 style={S.h2}>Cookies</h2>
        <p style={S.p}>We may use essential cookies to ensure the site functions correctly. We do not use tracking cookies for advertising purposes. Third-party services (such as Vercel) may set their own cookies as described in their respective privacy policies.</p>

        <h2 style={S.h2}>AI-Generated Content</h2>
        <p style={S.p}>Some articles on this site are generated using AI tools including Anthropic Claude. While we strive for accuracy, AI-generated content may contain errors. We do not store any user-submitted prompts or inputs.</p>

        <h2 style={S.h2}>Third-Party Services</h2>
        <p style={S.p}>This site may link to or integrate with third-party platforms including Doma Protocol, Supabase, and Vercel. These services have their own privacy policies and we encourage you to review them.</p>

        <h2 style={S.h2}>Data Retention</h2>
        <p style={S.p}>Anonymous usage logs are retained for up to 90 days. We do not sell, trade, or transfer any data to third parties.</p>

        <h2 style={S.h2}>Your Rights</h2>
        <p style={S.p}>Since we collect no personal data by default, there is nothing to request deletion of. If you believe we hold data about you, contact us at the address below.</p>

        <h2 style={S.h2}>Contact</h2>
        <p style={S.p}>For privacy-related questions, reach out via <a href="https://doma.xyz" style={{ color: "#ff6b35" }}>Doma Protocol</a> or through the Web3 Guides community channels.</p>

        <p style={{ ...S.p, marginTop: 40, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
          <a href="https://web3guides.com" style={{ color: "#ff6b35", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>← Back to Web3 Guides</a>
        </p>
      </div>
    </div>
  );
}
