import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | Web3 Guides",
  description: "About Web3 Guides — a free network of crypto education hubs covering Ethereum, Bitcoin, DeFi, Solana, and more.",
};

const S = {
  page: { background: "#fefbf6", minHeight: "100vh", padding: "0 0 80px" } as React.CSSProperties,
  nav: { background: "rgba(254,251,246,0.95)", borderBottom: "1px solid #e5e7eb", padding: "0 40px", height: 60, display: "flex", alignItems: "center" } as React.CSSProperties,
  logo: { fontFamily: "'Bungee', cursive", fontSize: "1.2rem", background: "linear-gradient(135deg, #ff6b35, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textDecoration: "none" } as React.CSSProperties,
  wrap: { maxWidth: 760, margin: "0 auto", padding: "60px 40px" } as React.CSSProperties,
  h1: { fontFamily: "'Bungee', cursive", fontSize: "2.5rem", color: "#1a1a1a", marginBottom: 24 } as React.CSSProperties,
  h2: { fontFamily: "'DM Sans', sans-serif", fontSize: "1.2rem", fontWeight: 700, color: "#1a1a1a", marginTop: 40, marginBottom: 12 } as React.CSSProperties,
  p: { fontFamily: "'DM Sans', sans-serif", fontSize: "0.95rem", color: "#4b5563", lineHeight: 1.8, marginBottom: 16 } as React.CSSProperties,
  tag: { display: "inline-block", background: "#fff3ee", border: "1px solid #ffd4bf", borderRadius: 8, padding: "4px 12px", fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#ff6b35", marginRight: 8, marginBottom: 8 } as React.CSSProperties,
};

export default function AboutPage() {
  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <a href="https://web3guides.com" style={S.logo}>Web3 Guides</a>
      </nav>
      <div style={S.wrap}>
        <h1 style={S.h1}>About Web3 Guides</h1>

        <p style={S.p}>Web3 Guides is a free, open network of crypto education hubs. Each subdomain on web3guides.com is a focused knowledge base on a specific topic — from Ethereum and Bitcoin fundamentals to DeFi protocols, Solana development, staking, Layer 2 scaling, and more.</p>

        <p style={S.p}>Our goal is simple: make Web3 knowledge accessible to everyone, without paywalls, signups, or jargon overload.</p>

        <h2 style={S.h2}>What We Cover</h2>
        <div style={{ marginBottom: 24 }}>
          {["Ethereum", "Bitcoin", "Solana", "DeFi", "Staking", "Layer 2", "Security", "Real-World Assets", "Bridges", "Crypto Legal", "Crypto Tax", "Easy Mode"].map(t => (
            <span key={t} style={S.tag}>{t}</span>
          ))}
        </div>

        <h2 style={S.h2}>How It Works</h2>
        <p style={S.p}>Each subdomain (e.g. <a href="https://eth.web3guides.com" style={{ color: "#ff6b35" }}>eth.web3guides.com</a>, <a href="https://defi.web3guides.com" style={{ color: "#ff6b35" }}>defi.web3guides.com</a>) is a dedicated knowledge hub. Guides are written and curated by subject matter experts, with AI assistance used to keep content up to date as the space evolves rapidly.</p>

        <p style={S.p}>All AI-assisted content is reviewed for accuracy and clearly noted. We encourage readers to verify information independently and consult professionals for financial or legal decisions.</p>

        <h2 style={S.h2}>Powered by Doma Protocol</h2>
        <p style={S.p}>The subdomain infrastructure is powered by <a href="https://doma.xyz" target="_blank" rel="noopener noreferrer" style={{ color: "#ff6b35" }}>Doma Protocol</a> — an on-chain subdomain ownership platform. This means each web3guides.com subdomain can be owned, transferred, and built on by its creator, with no central authority able to revoke access.</p>

        <p style={S.p}>Want your own subdomain on web3guides.com? <a href="https://app.doma.xyz/domain/web3guides.com/subdomains" target="_blank" rel="noopener noreferrer" style={{ color: "#ff6b35" }}>Claim one on Doma →</a></p>

        <h2 style={S.h2}>Disclaimer</h2>
        <p style={S.p}>Nothing on Web3 Guides constitutes financial, investment, legal, or tax advice. All content is for educational purposes only. See our full <a href="/disclaimer" style={{ color: "#ff6b35" }}>disclaimer</a>.</p>

        <p style={{ ...S.p, marginTop: 40, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
          <a href="https://web3guides.com" style={{ color: "#ff6b35", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>← Back to Web3 Guides</a>
        </p>
      </div>
    </div>
  );
}
