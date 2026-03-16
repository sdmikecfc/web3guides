import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Disclaimer | Web3 Guides",
  description: "Financial and content disclaimer for Web3 Guides.",
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
  box: { background: "#fff3ee", border: "1px solid #ffd4bf", borderRadius: 12, padding: "20px 24px", marginBottom: 32 } as CSSProperties,
};

export default function DisclaimerPage() {
  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <a href="https://web3guides.com" style={S.logo}>Web3 Guides</a>
      </nav>
      <div style={S.wrap}>
        <h1 style={S.h1}>Disclaimer</h1>
        <p style={S.date}>Last updated: March 2026</p>

        <div style={S.box}>
          <p style={{ ...S.p, marginBottom: 0, fontWeight: 600, color: "#c2410c" }}>
            ⚠️ Nothing on this website is financial, investment, legal, or tax advice. All content is for educational and informational purposes only.
          </p>
        </div>

        <h2 style={S.h2}>Not Financial Advice</h2>
        <p style={S.p}>The content published on Web3 Guides — including all guides, articles, tutorials, and analyses — is provided solely for general educational and informational purposes. It does not constitute financial advice, investment advice, trading advice, or any other type of professional advice.</p>
        <p style={S.p}>You should not make any financial or investment decisions based on the content of this website without first consulting a qualified financial advisor who is aware of your individual circumstances.</p>

        <h2 style={S.h2}>Cryptocurrency Risk</h2>
        <p style={S.p}>Cryptocurrencies and digital assets are highly speculative and volatile instruments. The value of any cryptocurrency or digital asset can decrease to zero. Past performance is not indicative of future results. Never invest more than you can afford to lose.</p>

        <h2 style={S.h2}>AI-Generated Content</h2>
        <p style={S.p}>Some articles on this site are generated with the assistance of artificial intelligence (AI) tools, including Anthropic Claude. While we aim for accuracy, AI-generated content may contain errors, outdated information, or inaccuracies. All content should be independently verified before acting on it.</p>

        <h2 style={S.h2}>No Professional Relationship</h2>
        <p style={S.p}>Reading content on Web3 Guides does not create a professional relationship of any kind between you and Web3 Guides or its operators. No content on this site should be construed as legal, tax, accounting, or investment advice.</p>

        <h2 style={S.h2}>Third-Party Links</h2>
        <p style={S.p}>This site may contain links to third-party websites and services. We have no control over the content, privacy policies, or practices of any third-party sites and accept no responsibility for them.</p>

        <h2 style={S.h2}>Accuracy of Information</h2>
        <p style={S.p}>The Web3 space evolves rapidly. While we aim to keep content current, information may become outdated. We make no representations as to the accuracy, completeness, or suitability of any information on this site.</p>

        <p style={{ ...S.p, marginTop: 40, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
          <a href="https://web3guides.com" style={{ color: "#ff6b35", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>← Back to Web3 Guides</a>
        </p>
      </div>
    </div>
  );
}
