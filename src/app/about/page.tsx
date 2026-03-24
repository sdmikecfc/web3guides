import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";

export const metadata: Metadata = {
  title: "About | Web3 Guides",
  description: "About Web3 Guides — a free network of crypto education hubs covering Ethereum, Bitcoin, DeFi, Solana, and more.",
};

const S = {
  page: { background: "#fefbf6", minHeight: "100vh", padding: "0 0 80px" } as CSSProperties,
  nav: { background: "rgba(254,251,246,0.95)", borderBottom: "1px solid #e5e7eb", padding: "0 40px", height: 60, display: "flex", alignItems: "center" } as CSSProperties,
  logo: { fontFamily: "'Bungee', cursive", fontSize: "1.2rem", background: "linear-gradient(135deg, #ff6b35, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textDecoration: "none" } as CSSProperties,
  wrap: { maxWidth: 760, margin: "0 auto", padding: "60px 40px" } as CSSProperties,
  h1: { fontFamily: "'Bungee', cursive", fontSize: "2.5rem", color: "#1a1a1a", marginBottom: 24 } as CSSProperties,
  h2: { fontFamily: "'DM Sans', sans-serif", fontSize: "1.2rem", fontWeight: 700, color: "#1a1a1a", marginTop: 40, marginBottom: 12 } as CSSProperties,
  p: { fontFamily: "'DM Sans', sans-serif", fontSize: "0.95rem", color: "#4b5563", lineHeight: 1.8, marginBottom: 16 } as CSSProperties,
  tag: { display: "inline-block", background: "#fff3ee", border: "1px solid #ffd4bf", borderRadius: 8, padding: "4px 12px", fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#ff6b35", marginRight: 8, marginBottom: 8 } as CSSProperties,
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

        {/* ── Meet the Creator ─────────────────────────────────────── */}
        <div style={{
          marginTop: 48,
          padding: "36px 32px",
          background: "linear-gradient(135deg, #fff8f4, #fff3ee)",
          border: "1px solid #ffd4bf",
          borderRadius: 20,
          display: "flex",
          gap: 32,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}>
          <div style={{ flexShrink: 0 }}>
            <Image
              src="/bigmike.jpg"
              alt="Big Mike — founder of Web3 Guides"
              width={120}
              height={120}
              style={{ borderRadius: "50%", border: "3px solid #ff6b35", objectFit: "cover", display: "block" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <h2 style={{ ...S.h2, margin: 0 }}>Big Mike</h2>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", background: "#fff", border: "1px solid #ffd4bf", color: "#ff6b35", borderRadius: 6, padding: "3px 8px", letterSpacing: 0.5 }}>FOUNDER</span>
            </div>
            <p style={{ ...S.p, marginBottom: 12, marginTop: 8 }}>
              I&apos;ve been in crypto since 2016 — back when you had to explain what a blockchain was at every dinner party. Since 2018 I&apos;ve worked full-time in the space, focused on community management and helping everyday people actually understand what&apos;s going on.
            </p>
            <p style={{ ...S.p, marginBottom: 12 }}>
              Before crypto took over my life, I taught calculus in California. Education has always been the thing — breaking down complex ideas into something a normal person can act on. That&apos;s exactly what Web3 Guides is: the resource I wish had existed when I was figuring all of this out.
            </p>
            <p style={{ ...S.p, marginBottom: 0 }}>
              For the last five years I&apos;ve been travelling the world while building in Web3. If you&apos;ve got questions or just want to connect, find me at <a href="https://bigmike.web3guides.com" style={{ color: "#ff6b35", fontWeight: 600 }}>bigmike.web3guides.com</a>.
            </p>
          </div>
        </div>

        <h2 style={S.h2}>Powered by Doma Protocol</h2>
        <p style={S.p}>The subdomain infrastructure is powered by <a href="https://doma.xyz" target="_blank" rel="noopener noreferrer" style={{ color: "#ff6b35" }}>Doma Protocol</a> — an on-chain subdomain ownership platform. This means each web3guides.com subdomain can be owned, transferred, and built on by its creator, with no central authority able to revoke access.</p>

        <p style={S.p}>Want your own subdomain on web3guides.com? <a href="https://app.doma.xyz/domain/web3guides.com/#subdomains" target="_blank" rel="noopener noreferrer" style={{ color: "#ff6b35" }}>Claim one on Doma →</a></p>

        <h2 style={S.h2}>Disclaimer</h2>
        <p style={S.p}>Nothing on Web3 Guides constitutes financial, investment, legal, or tax advice. All content is for educational purposes only. See our full <a href="/disclaimer" style={{ color: "#ff6b35" }}>disclaimer</a>.</p>

        <p style={{ ...S.p, marginTop: 40, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
          <a href="https://web3guides.com" style={{ color: "#ff6b35", textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>← Back to Web3 Guides</a>
        </p>
      </div>
    </div>
  );
}
