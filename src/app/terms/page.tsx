import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Terms of Use | Web3 Guides",
  description: "Terms of use for Web3 Guides.",
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

export default function TermsPage() {
  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <a href="https://web3guides.com" style={S.logo}>Web3 Guides</a>
      </nav>
      <div style={S.wrap}>
        <h1 style={S.h1}>Terms of Use</h1>
        <p style={S.date}>Last updated: March 2026</p>

        <p style={S.p}>By accessing or using Web3 Guides ("the site"), you agree to be bound by these Terms of Use. If you do not agree, please do not use the site.</p>

        <h2 style={S.h2}>Use of Content</h2>
        <p style={S.p}>All content on Web3 Guides is provided for educational and informational purposes only. You may read, share, and link to content on this site for non-commercial purposes with attribution. You may not republish, sell, or commercially exploit site content without prior written permission.</p>

        <h2 style={S.h2}>No Warranties</h2>
        <p style={S.p}>This site is provided "as is" without warranties of any kind, either express or implied. We make no warranty that the site will be error-free, uninterrupted, or free of viruses or harmful components.</p>

        <h2 style={S.h2}>Limitation of Liability</h2>
        <p style={S.p}>To the fullest extent permitted by law, Web3 Guides and its operators shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from your use of the site or reliance on any content published here.</p>

        <h2 style={S.h2}>External Links</h2>
        <p style={S.p}>The site may contain links to external websites. These links are provided for convenience only and do not constitute endorsement of the linked site or its content. We have no responsibility for the content of external sites.</p>

        <h2 style={S.h2}>Intellectual Property</h2>
        <p style={S.p}>The Web3 Guides name, logo, and site design are proprietary. AI-generated article content is the property of Web3 Guides. All other trademarks referenced on this site are property of their respective owners.</p>

        <h2 style={S.h2}>Modifications</h2>
        <p style={S.p}>We reserve the right to modify these terms at any time. Continued use of the site after changes constitutes acceptance of the updated terms.</p>

        <h2 style={S.h2}>Governing Law</h2>
        <p style={S.p}>These terms are governed by applicable law. Any disputes shall be resolved through binding arbitration.</p>

        <p style={{ ...S.p, marginTop: 40, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
          <a href="https://web3guides.com" style={{ color: "#ff6b35", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>← Back to Web3 Guides</a>
        </p>
      </div>
    </div>
  );
}
