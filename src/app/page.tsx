"use client";

import React, { useEffect, useRef, type CSSProperties } from "react";

const APP_BASE = "https://app.doma.xyz/domain/web3guides.com";

/* ─── Scroll-reveal hook ─────────────────────────────────────────────── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("visible"); obs.disconnect(); } },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

/* ─── Reveal wrapper ─────────────────────────────────────────────────── */
function Reveal({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useReveal();
  return <div ref={ref} className={`lp-reveal ${className}`} style={style}>{children}</div>;
}

/* ════════════════════════════════════════════════════════════════════════
   NAV
════════════════════════════════════════════════════════════════════════ */
function Nav() {
  return (
<<<<<<< HEAD
    <div className="page-content min-h-screen flex flex-col">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <span className="font-display font-bold text-white text-lg">W3G</span>
        <a
          href="/subdomains"
          className="rounded-full px-4 py-1.5 text-xs font-mono font-semibold text-white transition hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #7c6aff, #3b9eff)" }}
        >
          Get a subdomain →
=======
    <nav style={{ background: "rgba(254,251,246,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>
        <a href="/" style={{ fontFamily: "'Bungee', cursive", fontSize: "1.4rem", background: "linear-gradient(135deg, #ff6b35, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", textDecoration: "none" }}>
          Web3 Guides
>>>>>>> claude/sad-hoover
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <a href="#paths" style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", fontSize: "0.95rem", textDecoration: "none", transition: "color 0.2s" }}
             onMouseEnter={e => (e.currentTarget.style.color = "#1a1a1a")}
             onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>Learn</a>
          <a href="#articles" style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", fontSize: "0.95rem", textDecoration: "none", transition: "color 0.2s" }}
             onMouseEnter={e => (e.currentTarget.style.color = "#1a1a1a")}
             onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>Guides</a>
          <a href="#subdomains" style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", fontSize: "0.95rem", textDecoration: "none", transition: "color 0.2s" }}
             onMouseEnter={e => (e.currentTarget.style.color = "#1a1a1a")}
             onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>Subdomains</a>
          <a href={APP_BASE} target="_blank" rel="noopener noreferrer"
             style={{ fontFamily: "'DM Sans', sans-serif", background: "linear-gradient(135deg, #ff6b35, #ec4899)", color: "#fff", padding: "10px 24px", borderRadius: 50, fontSize: "0.9rem", fontWeight: 600, textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: "0 4px 15px rgba(255,107,53,0.3)" }}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 25px rgba(255,107,53,0.4)"; }}
             onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 15px rgba(255,107,53,0.3)"; }}>
            Start Learning Free →
          </a>
        </div>
      </div>
    </nav>
  );
}

<<<<<<< HEAD
      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 pt-20 pb-12">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-mono"
             style={{ background: "rgba(124,106,255,0.12)", border: "1px solid rgba(124,106,255,0.3)", color: "#7c6aff" }}>
          <span className="h-1.5 w-1.5 rounded-full bg-[#00e5a0] animate-pulse" />
          14 specialist crypto education hubs
=======
/* ════════════════════════════════════════════════════════════════════════
   HERO
════════════════════════════════════════════════════════════════════════ */
function Hero() {
  return (
    <section style={{ background: "linear-gradient(135deg, #ff6b35 0%, #ec4899 100%)", position: "relative", overflow: "hidden", padding: "100px 40px 80px" }}>
      {/* Animated star pattern */}
      <div className="lp-float" style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(1.5px 1.5px at 10% 20%, rgba(255,255,255,0.4) 0%, transparent 100%), radial-gradient(1px 1px at 75% 10%, rgba(255,255,255,0.35) 0%, transparent 100%), radial-gradient(2px 2px at 40% 60%, rgba(255,255,255,0.25) 0%, transparent 100%), radial-gradient(1px 1px at 90% 45%, rgba(255,255,255,0.4) 0%, transparent 100%), radial-gradient(1.5px 1.5px at 20% 80%, rgba(255,255,255,0.3) 0%, transparent 100%), radial-gradient(1px 1px at 60% 85%, rgba(255,255,255,0.35) 0%, transparent 100%), radial-gradient(2px 2px at 85% 75%, rgba(255,255,255,0.28) 0%, transparent 100%), radial-gradient(1px 1px at 5% 50%, rgba(255,255,255,0.32) 0%, transparent 100%)", pointerEvents: "none" }} aria-hidden="true" />

      <div style={{ maxWidth: 1400, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        {/* Badge */}
        <div className="lp-fade-in" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 50, padding: "8px 20px", marginBottom: 32 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", color: "#fff", letterSpacing: 1 }}>BLOCKCHAIN EDUCATION PLATFORM</span>
>>>>>>> claude/sad-hoover
        </div>

        <h1 className="lp-slide-down" style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2.5rem, 7vw, 5rem)", color: "#fff", lineHeight: 1.1, marginBottom: 24, textShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          Learn Web3. Build the Future.<br />Own Your Path.
        </h1>

        <p className="lp-slide-up" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "clamp(1rem, 2.5vw, 1.25rem)", color: "rgba(255,255,255,0.9)", maxWidth: 640, margin: "0 auto 48px", lineHeight: 1.7 }}>
          Master blockchain development, decentralized finance, and the technologies reshaping the internet. Join a global community of builders creating tomorrow's decentralized world.
        </p>

<<<<<<< HEAD
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <a
            href="/subdomains"
            className="rounded-xl px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 hover:scale-105 active:scale-95"
            style={{ background: "linear-gradient(135deg, #7c6aff 0%, #3b9eff 100%)", boxShadow: "0 0 40px rgba(124,106,255,0.3)" }}
          >
            🌐 Claim your crypto subdomain
=======
        {/* CTAs */}
        <div className="lp-fade-in" style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", marginBottom: 64 }}>
          <a href={APP_BASE} target="_blank" rel="noopener noreferrer"
             style={{ fontFamily: "'DM Sans', sans-serif", background: "#fff", color: "#ff6b35", padding: "16px 36px", borderRadius: 50, fontSize: "1rem", fontWeight: 700, textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: "0 8px 30px rgba(0,0,0,0.15)", display: "inline-flex", alignItems: "center", gap: 8 }}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 40px rgba(0,0,0,0.2)"; }}
             onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 30px rgba(0,0,0,0.15)"; }}>
            Start Learning Free →
>>>>>>> claude/sad-hoover
          </a>
          <a href="#subdomains"
             style={{ fontFamily: "'DM Sans', sans-serif", background: "rgba(255,255,255,0.15)", color: "#fff", padding: "16px 36px", borderRadius: 50, fontSize: "1rem", fontWeight: 600, textDecoration: "none", border: "2px solid rgba(255,255,255,0.4)", backdropFilter: "blur(8px)", transition: "transform 0.2s, background 0.2s" }}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.25)"; }}
             onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.15)"; }}>
            Claim Your Subdomain
          </a>
        </div>

<<<<<<< HEAD
        <div className="w-32 h-px" style={{ background: "linear-gradient(to right, transparent, #7c6aff, transparent)" }} />
      </section>

      {/* Subdomain grid */}
      <section id="topics" className="mx-auto w-full max-w-6xl px-6 pb-16">
        <p className="text-center font-mono text-xs uppercase tracking-widest mb-8" style={{ color: "#6272a0" }}>
          Choose your topic
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {VALID_SUBDOMAINS.map((key, i) => {
            const cfg = SUBDOMAINS[key];
            return (
              <a
                key={key}
                href={subdomainHref(key)}
                className="group relative flex flex-col gap-3 rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1"
                style={{
                  background: "rgba(13,17,32,0.7)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  backdropFilter: "blur(16px)",
                }}
              >
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse 80% 60% at 0% 0%, ${cfg.glowHex}, transparent)`, boxShadow: `inset 0 0 0 1px ${cfg.accentHex}40` }}
                />
                <div
                  className="relative flex h-11 w-11 items-center justify-center rounded-xl text-xl transition-transform duration-200 group-hover:scale-110"
                  style={{ background: cfg.glowHex, border: `1px solid ${cfg.accentHex}40` }}
                >
                  {cfg.emoji}
                </div>
                <div className="relative flex-1">
                  <p className="font-display font-bold text-white mb-1 transition-colors duration-200 group-hover:text-[var(--acc)]"
                     style={{ "--acc": cfg.accentHex } as React.CSSProperties}>
                    {cfg.label}
                  </p>
                  <p className="text-sm leading-snug line-clamp-2" style={{ color: "#6272a0" }}>
                    {cfg.description}
                  </p>
                </div>
                <div className="relative flex items-center justify-between">
                  <span className="font-mono text-xs" style={{ color: cfg.accentHex }}>
                    {key}.web3guides.com
                  </span>
                  <span className="text-xs opacity-40 group-hover:opacity-100 transition-all" style={{ color: cfg.accentHex }}>→</span>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* Purchase banner */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div
          className="relative overflow-hidden rounded-3xl p-8 md:p-12 text-center"
          style={{ background: "linear-gradient(135deg, rgba(124,106,255,0.15) 0%, rgba(59,158,255,0.10) 100%)", border: "1px solid rgba(124,106,255,0.25)" }}
        >
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,106,255,0.15), transparent)" }} />
          <div className="relative">
            <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: "#7c6aff" }}>
              🔥 Available now · On-chain NFT subdomains
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-extrabold text-white mb-3">
              Own your corner of Web3
            </h2>
            <p className="max-w-lg mx-auto mb-8" style={{ color: "#6272a0" }}>
              Crypto-native subdomains on web3guides.com. Launch your own guide site, newsletter, or community hub. Subdomains are NFTs — you truly own them.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <a
                href="/subdomains"
                className="rounded-xl px-8 py-3.5 text-sm font-bold text-white transition hover:opacity-90 hover:scale-105"
                style={{ background: "linear-gradient(135deg, #7c6aff, #3b9eff)", boxShadow: "0 0 40px rgba(124,106,255,0.35)" }}
              >
                How to get one →
              </a>
              <a
                href="https://app.doma.xyz/subdomain-claim/web3guides.com"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl px-8 py-3.5 text-sm font-semibold transition hover:text-white"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#a0aec0" }}
              >
                Claim on Doma.xyz ↗
              </a>
=======
        {/* Stats */}
        <div className="lp-fade-in" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, maxWidth: 700, margin: "0 auto" }}>
          {[
            { value: "$93-169K", label: "Avg Developer Salary" },
            { value: "$80-255K", label: "Blockchain Industry Avg" },
            { value: "70%", label: "Remote Opportunities" },
          ].map(({ value, label }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20, padding: "24px 20px", textAlign: "center", transition: "transform 0.2s" }}
                 onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-5px)")}
                 onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.8rem", fontWeight: 700, color: "#fff", marginBottom: 6 }}>{value}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", color: "rgba(255,255,255,0.8)", letterSpacing: 0.5 }}>{label}</div>
>>>>>>> claude/sad-hoover
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

<<<<<<< HEAD
      <footer className="border-t py-8 text-center text-sm mt-auto"
              style={{ borderColor: "rgba(255,255,255,0.05)", color: "#6272a0" }}>
        © {new Date().getFullYear()} Web3Guides · Built on Next.js &amp; Supabase ·{" "}
        <a href="/subdomains" className="hover:text-white transition-colors" style={{ color: "#7c6aff" }}>
          Get a subdomain
        </a>
      </footer>
=======
/* ════════════════════════════════════════════════════════════════════════
   BENEFITS
════════════════════════════════════════════════════════════════════════ */
const BENEFITS = [
  {
    emoji: "💰",
    title: "Money You Can Program",
    gradient: "linear-gradient(135deg, #ff6b35 0%, #ec4899 100%)",
    body: "Smart contracts let you create automated financial systems that run exactly as programmed—without banks or intermediaries—just logic you define.",
  },
  {
    emoji: "🚀",
    title: "Future-Proof Your Career",
    gradient: "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
    body: "Web3 is built on fundamental principles of decentralization and cryptographic security. Master these foundations and you'll never be left behind.",
  },
  {
    emoji: "🛡️",
    title: "Censorship Resistance",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
    body: "Build unstoppable applications—code that can't be silenced by governments, corporations, or algorithms. Your code, your values, immutably on-chain.",
  },
  {
    emoji: "🎯",
    title: "True Digital Ownership",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
    body: "Own your identity, assets, and creations without relying on platforms that can ban or delete you. Your code, your keys, your data—truly yours.",
  },
];

function Benefits() {
  return (
    <section style={{ background: "#fff", padding: "100px 40px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 3, color: "#ff6b35", textTransform: "uppercase", marginBottom: 16 }}>WHY WEB3?</div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3.5rem)", color: "#1a1a1a", marginBottom: 20 }}>Build Skills That Matter</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "#6b7280", maxWidth: 560, margin: "0 auto", lineHeight: 1.7 }}>
            Web3 isn't just a technology—it's a movement toward digital ownership, censorship resistance, and economic freedom.
          </p>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 30 }}>
          {BENEFITS.map(({ emoji, title, gradient, body }) => (
            <Reveal key={title}>
              <div className="lp-card-border" style={{ position: "relative", background: "#fff", border: "2px solid #e5e7eb", borderRadius: 24, padding: 40, transition: "transform 0.25s, box-shadow 0.25s, border-color 0.25s", overflow: "hidden" }}
                   onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-8px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 20px 60px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLElement).style.borderColor = "#ff6b35"; }}
                   onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"; }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem", marginBottom: 24 }}>
                  {emoji}
                </div>
                <h3 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.3rem", color: "#1a1a1a", marginBottom: 14 }}>{title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", color: "#6b7280", lineHeight: 1.7 }}>{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   LEARNING PATHS
════════════════════════════════════════════════════════════════════════ */
const PATHS = [
  {
    emoji: "🌱",
    title: "Beginner Path",
    gradient: "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
    subtitle: "Start from zero. No prior blockchain knowledge required.",
    topics: ["What is Blockchain & How It Works", "Understanding Cryptocurrencies", "Setting Up Your First Wallet", "Introduction to DeFi & NFTs", "Web3 Security Basics"],
    href: `${APP_BASE}/beginner`,
    cta: "Start Beginner Path →",
  },
  {
    emoji: "⚡",
    title: "Developer Path",
    gradient: "linear-gradient(135deg, #ff6b35 0%, #ec4899 100%)",
    subtitle: "Build real applications on blockchain networks.",
    topics: ["Solidity Smart Contract Development", "Web3.js & ethers.js Integration", "Building DApps with React", "Testing & Deploying Contracts", "Advanced DeFi Protocols"],
    href: `${APP_BASE}/developer`,
    cta: "Start Developer Path →",
  },
  {
    emoji: "🏗️",
    title: "Advanced Path",
    gradient: "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
    subtitle: "Master cutting-edge Web3 technologies and architecture.",
    topics: ["Layer 2 Scaling Solutions", "Cross-Chain Development", "MEV & Transaction Ordering", "Zero-Knowledge Proofs", "Protocol Design & Economics"],
    href: `${APP_BASE}/advanced`,
    cta: "Start Advanced Path →",
  },
];

function LearningPaths() {
  return (
    <section id="paths" style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)", padding: "100px 40px", position: "relative", overflow: "hidden" }}>
      {/* Dot pattern */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, #93c5fd 1px, transparent 1px)", backgroundSize: "30px 30px", opacity: 0.3, pointerEvents: "none" }} aria-hidden="true" />

      <div style={{ maxWidth: 1400, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <Reveal style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 3, color: "#6366f1", textTransform: "uppercase", marginBottom: 16 }}>STRUCTURED LEARNING</div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3.5rem)", color: "#1a1a1a", marginBottom: 20 }}>Choose Your Path</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "#6b7280", maxWidth: 540, margin: "0 auto", lineHeight: 1.7 }}>
            Structured curricula designed to take you from where you are to where you want to be.
          </p>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 30 }}>
          {PATHS.map(({ emoji, title, gradient, subtitle, topics, href, cta }) => (
            <Reveal key={title}>
              <div style={{ background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", transition: "transform 0.25s, box-shadow 0.25s", display: "flex", flexDirection: "column" }}
                   onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-8px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 20px 60px rgba(0,0,0,0.12)"; }}
                   onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)"; }}>
                {/* Header */}
                <div style={{ background: gradient, padding: 30 }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>{emoji}</div>
                  <h3 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.6rem", color: "#fff", marginBottom: 8 }}>{title}</h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>{subtitle}</p>
                </div>
                {/* Topics */}
                <div style={{ padding: "28px 30px", flex: 1 }}>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {topics.map(t => (
                      <li key={t} style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "'DM Sans', sans-serif", fontSize: "0.95rem", color: "#374151" }}>
                        <span style={{ width: 22, height: 22, borderRadius: "50%", background: gradient, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", color: "#fff", flexShrink: 0 }}>✓</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                  <a href={href} target="_blank" rel="noopener noreferrer"
                     style={{ display: "block", width: "100%", textAlign: "center", background: gradient, color: "#fff", padding: "14px 0", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "0.95rem", textDecoration: "none", transition: "opacity 0.2s, transform 0.2s", boxSizing: "border-box" }}
                     onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.9"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                     onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}>
                    {cta}
                  </a>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ARTICLES
════════════════════════════════════════════════════════════════════════ */
const ARTICLES = [
  { emoji: "🔐", category: "Security", title: "Complete Guide to Wallet Security", excerpt: "Hardware wallets, multi-signature setups, and comprehensive attack prevention strategies.", slug: "wallet-security", color: "#ff6b35" },
  { emoji: "💎", category: "DeFi", title: "Understanding Automated Market Makers", excerpt: "Deep dive into AMM math, liquidity pool mechanics, and navigating impermanent loss.", slug: "amm-explained", color: "#6366f1" },
  { emoji: "⚙️", category: "Development", title: "Build Your First Smart Contract", excerpt: "Step-by-step Solidity tutorial covering writing, testing, and deploying your contract.", slug: "first-smart-contract", color: "#fbbf24" },
  { emoji: "🎨", category: "NFTs", title: "NFT Standards: ERC-721 vs ERC-1155", excerpt: "Key differences between token standards, tradeoffs, and when to use each in your project.", slug: "nft-standards", color: "#ff6b35" },
  { emoji: "🌐", category: "Infrastructure", title: "Intro to IPFS and Decentralized Storage", excerpt: "How IPFS works, content addressing, and integrating decentralized storage into your DApp.", slug: "ipfs-guide", color: "#6366f1" },
  { emoji: "⚡", category: "Scaling", title: "Layer 2 Solutions Explained", excerpt: "Rollups, state channels, and sidechains — the complete guide to Ethereum scaling.", slug: "layer2-explained", color: "#fbbf24" },
  { emoji: "🔗", category: "Development", title: "Building with Ethers.js: Complete Tutorial", excerpt: "Connect wallets, read blockchain state, and interact with contracts using ethers.js.", slug: "ethersjs-tutorial", color: "#ff6b35" },
  { emoji: "🎯", category: "DAO", title: "DAO Governance Mechanisms", excerpt: "On-chain vs off-chain voting, token-weighted governance, and multi-sig structures.", slug: "dao-governance", color: "#6366f1" },
  { emoji: "🛡️", category: "Security", title: "Common Smart Contract Vulnerabilities", excerpt: "Reentrancy attacks, integer overflow, front-running, and how to protect against each.", slug: "contract-vulnerabilities", color: "#fbbf24" },
  { emoji: "🌉", category: "Infrastructure", title: "Cross-Chain Bridges Deep Dive", excerpt: "Bridge architectures, trust models, and the security landscape of cross-chain transfers.", slug: "bridges-explained", color: "#ff6b35" },
  { emoji: "🔮", category: "Advanced", title: "Zero-Knowledge Proofs for Developers", excerpt: "ZK-SNARKs, ZK-STARKs, and how to leverage zero-knowledge cryptography in your dapps.", slug: "zero-knowledge-proofs", color: "#6366f1" },
  { emoji: "📊", category: "DeFi", title: "Yield Farming Strategies & Risks", excerpt: "APY vs APR, compounding strategies, and the smart contract risks you need to manage.", slug: "yield-farming", color: "#fbbf24" },
];

const GRADIENTS = [
  "linear-gradient(135deg, #ff6b35 0%, #ec4899 100%)",
  "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
  "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
];

function Articles() {
  return (
    <section id="articles" style={{ background: "#fefbf6", padding: "100px 40px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 3, color: "#ec4899", textTransform: "uppercase", marginBottom: 16 }}>DEEP DIVES</div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3.5rem)", color: "#1a1a1a", marginBottom: 20 }}>Featured Guides</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "#6b7280", maxWidth: 500, margin: "0 auto", lineHeight: 1.7 }}>
            Comprehensive, developer-focused guides on the topics that matter most in Web3.
          </p>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 30 }}>
          {ARTICLES.map(({ emoji, category, title, excerpt, slug, color }, i) => (
            <Reveal key={slug}>
              <a href={`${APP_BASE}/${slug}`} target="_blank" rel="noopener noreferrer" style={{ display: "block", background: "#fff", borderRadius: 20, overflow: "hidden", border: "1px solid #e5e7eb", textDecoration: "none", transition: "transform 0.25s, box-shadow 0.25s" }}
                 onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-6px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 50px rgba(0,0,0,0.1)"; }}
                 onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}>
                {/* Image area */}
                <div style={{ height: 200, background: GRADIENTS[i % 3], display: "flex", alignItems: "center", justifyContent: "center", fontSize: "4rem" }}>
                  {emoji}
                </div>
                {/* Content */}
                <div style={{ padding: "24px 28px" }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 2, color, textTransform: "uppercase", marginBottom: 10 }}>{category}</div>
                  <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.15rem", fontWeight: 700, color: "#1a1a1a", marginBottom: 12, lineHeight: 1.4 }}>{title}</h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>{excerpt}</p>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", fontWeight: 600, color, display: "inline-flex", alignItems: "center", gap: 6, transition: "gap 0.2s" }}>
                    Read Guide <span>→</span>
                  </span>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   SUBDOMAIN SECTION
════════════════════════════════════════════════════════════════════════ */
const STEPS = [
  { n: "1", title: "Choose Your Topic", body: "Pick a niche within Web3—DeFi protocols, NFT development, DAO tooling, or any specialized area you're passionate about." },
  { n: "2", title: "Claim Your Subdomain", body: "Register your unique subdomain (e.g., defi.web3guides.com) and establish your presence in the ecosystem." },
  { n: "3", title: "Stake & Launch", body: "Stake just 1% of the token supply to get your subdomain promoted across the platform.", badge: "Coming Soon" },
  { n: "4", title: "Create & Monetize", body: "Publish content, use your affiliate links, build your community, and earn from your expertise. Your subdomain, your rules, your revenue." },
];

const SUB_BENEFITS = [
  { title: "Your Brand, Your Domain", body: "Get a professional subdomain that positions you as an authority in your niche." },
  { title: "Monetization Freedom", body: "Use your own affiliate links, referral codes, and sponsorship deals. Keep 100% of revenue." },
  { title: "Platform Distribution", body: "When you stake, your content gets featured on the main platform, reaching thousands of learners." },
  { title: "Community Ownership", body: "Be part of the web3guides ecosystem. Early subdomains build lasting authority." },
  { title: "Decentralized & Unstoppable", body: "Your content lives on-chain. No platform can delete you. True digital ownership." },
];

function SubdomainSection() {
  return (
    <section id="subdomains" style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)", padding: "100px 40px", position: "relative", overflow: "hidden" }}>
      {/* Pulsing overlay */}
      <div className="lp-pulse" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "80vw", height: "80vh", background: "radial-gradient(ellipse at center, rgba(99,102,241,0.15) 0%, transparent 70%)", pointerEvents: "none" }} aria-hidden="true" />

      <div style={{ maxWidth: 1400, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <Reveal style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 3, color: "#06b6d4", textTransform: "uppercase", marginBottom: 16 }}>OWN YOUR CORNER OF WEB3</div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3.5rem)", color: "#fff", marginBottom: 20 }}>Get Your Subdomain</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "rgba(255,255,255,0.7)", maxWidth: 560, margin: "0 auto", lineHeight: 1.7 }}>
            Become a verified Web3 educator. Launch your own guide site, newsletter, or community hub under web3guides.com.
          </p>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 60 }}>
          {/* Steps */}
          <Reveal>
            <h3 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.5rem", color: "#fff", marginBottom: 32 }}>How It Works</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {STEPS.map(({ n, title, body, badge }) => (
                <div key={n} style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 24, display: "flex", gap: 20, alignItems: "flex-start" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #ff6b35, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bungee', cursive", fontSize: "1.1rem", color: "#fff", flexShrink: 0 }}>{n}</div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", fontWeight: 700, color: "#fff" }}>{title}</h4>
                      {badge && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", background: "rgba(6,182,212,0.2)", border: "1px solid rgba(6,182,212,0.4)", color: "#06b6d4", padding: "2px 10px", borderRadius: 50 }}>{badge}</span>}
                    </div>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Benefits */}
          <Reveal>
            <h3 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.5rem", color: "#fff", marginBottom: 32 }}>Why Get a Subdomain?</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 40 }}>
              {SUB_BENEFITS.map(({ title, body }) => (
                <div key={title} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#06b6d4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", color: "#fff", flexShrink: 0 }}>✓</div>
                  <div>
                    <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: 4 }}>{title}</h4>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>

            <a href={`${APP_BASE}/subdomains`} target="_blank" rel="noopener noreferrer"
               style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #ff6b35, #ec4899)", color: "#fff", padding: "16px 36px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem", textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: "0 8px 30px rgba(255,107,53,0.35)" }}
               onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 40px rgba(255,107,53,0.5)"; }}
               onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 30px rgba(255,107,53,0.35)"; }}>
              Claim Your Subdomain →
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   CTA BANNER
════════════════════════════════════════════════════════════════════════ */
function CTABanner() {
  return (
    <section style={{ background: "linear-gradient(135deg, #ff6b35 0%, #ec4899 100%)", padding: "80px 40px", position: "relative", overflow: "hidden" }}>
      <div className="lp-float" style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} aria-hidden="true" />

      <Reveal style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3rem)", color: "#fff", marginBottom: 20 }}>
          Ready to Build Your Web3 Future?
        </h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "rgba(255,255,255,0.9)", lineHeight: 1.7, marginBottom: 40 }}>
          Join thousands of developers and creators learning the technologies that will power the next generation of the internet.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
          <a href={APP_BASE} target="_blank" rel="noopener noreferrer"
             style={{ background: "#fff", color: "#ff6b35", padding: "16px 36px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem", textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: "0 8px 25px rgba(0,0,0,0.15)" }}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 40px rgba(0,0,0,0.2)"; }}
             onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)"; }}>
            Start Learning Now →
          </a>
          <a href="#subdomains"
             style={{ background: "transparent", color: "#fff", padding: "16px 36px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "1rem", textDecoration: "none", border: "2px solid rgba(255,255,255,0.6)", transition: "transform 0.2s, background 0.2s" }}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.15)"; }}
             onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
            Claim Your Subdomain
          </a>
        </div>
      </Reveal>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FOOTER
════════════════════════════════════════════════════════════════════════ */
const FOOTER_LINK_COLS: { head: string; links: { label: string; href: string }[] }[] = [
  {
    head: "Learn",
    links: [
      { label: "Beginner Path", href: `${APP_BASE}/beginner` },
      { label: "Developer Path", href: `${APP_BASE}/developer` },
      { label: "Advanced Path", href: `${APP_BASE}/advanced` },
      { label: "All Tutorials", href: `${APP_BASE}/tutorials` },
    ],
  },
  {
    head: "Resources",
    links: [
      { label: "Developer Tools", href: `${APP_BASE}/tools` },
      { label: "Glossary", href: `${APP_BASE}/glossary` },
      { label: "Community", href: `${APP_BASE}/community` },
      { label: "Blog", href: `${APP_BASE}/blog` },
    ],
  },
  {
    head: "Platform",
    links: [
      { label: "Get a Subdomain", href: `${APP_BASE}/subdomains` },
      { label: "About", href: `${APP_BASE}/about` },
      { label: "Contact", href: `${APP_BASE}/contact` },
      { label: "Visit App", href: APP_BASE },
    ],
  },
];

function Footer() {
  return (
    <footer style={{ background: "#1a1a1a", color: "#fff", padding: "64px 40px 0" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 48, marginBottom: 48 }}>
          {/* Brand col */}
          <div>
            <div style={{ fontFamily: "'Bungee', cursive", fontSize: "1.8rem", background: "linear-gradient(135deg, #ff6b35, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 16 }}>
              Web3 Guides
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#9ca3af", lineHeight: 1.7, maxWidth: 280 }}>
              Your comprehensive resource for mastering blockchain development, DeFi, NFTs, and the decentralized web. Built by developers, for developers.
            </p>
          </div>
          {/* Link cols */}
          {FOOTER_LINK_COLS.map(({ head, links }) => (
            <div key={head}>
              <h4 style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 2, color: "#9ca3af", textTransform: "uppercase", marginBottom: 20 }}>{head}</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <a href={href} target="_blank" rel="noopener noreferrer"
                       style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#6b7280", textDecoration: "none", transition: "color 0.2s, padding-left 0.2s" }}
                       onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; (e.currentTarget as HTMLElement).style.paddingLeft = "4px"; }}
                       onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#6b7280"; (e.currentTarget as HTMLElement).style.paddingLeft = "0"; }}>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: "1px solid #374151", padding: "28px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", color: "#6b7280" }}>
            © 2026 Web3 Guides. Building the decentralized future, one guide at a time.
          </p>
          <a href={APP_BASE} target="_blank" rel="noopener noreferrer"
             style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", color: "#ff6b35", textDecoration: "none", letterSpacing: 1 }}>
            app.doma.xyz →
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PAGE
════════════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <Nav />
      <Hero />
      <Benefits />
      <LearningPaths />
      <Articles />
      <SubdomainSection />
      <CTABanner />
      <Footer />
>>>>>>> claude/sad-hoover
    </div>
  );
}
