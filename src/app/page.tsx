"use client";

import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { SUBDOMAINS } from "@/lib/subdomains";

/* ─── Subdomain SVG Icons ────────────────────────────────────────────── */
function SubdomainIcon({ sdKey, color }: { sdKey: string; color: string }) {
  const s = { stroke: color, fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const f = { fill: color };
  switch (sdKey) {
    case "eth": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><polygon points="12,2 20,12 12,16 4,12" {...s}/><polygon points="12,16 20,12 12,22 4,12" style={{ ...s, opacity: 0.6 }}/></svg>
    );
    case "btc": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="10" {...s}/><text x="12" y="17" textAnchor="middle" style={{ fontWeight: 900, fontSize: 14 }} fill={color} stroke="none">₿</text></svg>
    );
    case "sol": return (
      <svg viewBox="0 0 24 24" width="26" height="26">
        <line x1="3" y1="7" x2="21" y2="7" {...s} strokeWidth={2.5}/>
        <line x1="6" y1="12" x2="21" y2="12" {...s} strokeWidth={2.5}/>
        <line x1="3" y1="17" x2="18" y2="17" {...s} strokeWidth={2.5}/>
      </svg>
    );
    case "defi": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" {...s}/></svg>
    );
    case "staking": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><rect x="5" y="11" width="14" height="10" rx="2" {...s}/><path d="M8 11V7a4 4 0 018 0v4" {...s}/><circle cx="12" cy="16" r="1.5" {...f}/></svg>
    );
    case "layer2": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2L2 7l10 5 10-5-10-5z" {...s}/><path d="M2 12l10 5 10-5" {...s}/><path d="M2 17l10 5 10-5" {...s}/></svg>
    );
    case "bridge": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 17 Q3 10 12 10 Q21 10 21 17" {...s}/><line x1="3" y1="17" x2="3" y2="21" {...s}/><line x1="21" y1="17" x2="21" y2="21" {...s}/><line x1="8" y1="10" x2="8" y2="17" {...s}/><line x1="16" y1="10" x2="16" y2="17" {...s}/></svg>
    );
    case "rwa": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 22V10l9-8 9 8v12" {...s}/><rect x="9" y="14" width="6" height="8" {...s}/><line x1="3" y1="22" x2="21" y2="22" {...s}/></svg>
    );
    case "legal": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3v18" {...s}/><path d="M5 21h14" {...s}/><path d="M5 8l-3 6h6L5 8z" {...s}/><path d="M19 8l-3 6h6L19 8z" {...s}/></svg>
    );
    case "tax": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><rect x="4" y="2" width="16" height="20" rx="2" {...s}/><line x1="8" y1="7" x2="16" y2="7" {...s}/><line x1="8" y1="11" x2="16" y2="11" {...s}/><line x1="8" y1="15" x2="12" y2="15" {...s}/></svg>
    );
    case "security": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2l8 4v6c0 5-4 9-8 10C8 21 4 17 4 12V6l8-4z" {...s}/><path d="M9 12l2 2 4-4" {...s}/></svg>
    );
    case "easy": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2l2 7h7l-6 4 2 7-5-4-5 4 2-7-6-4h7z" {...s}/></svg>
    );
    case "jobs": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><rect x="2" y="7" width="20" height="14" rx="2" {...s}/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" {...s}/><line x1="12" y1="12" x2="12" y2="16" {...s}/><line x1="10" y1="14" x2="14" y2="14" {...s}/></svg>
    );
    case "medium": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><rect x="3" y="14" width="4" height="7" rx="1" {...s}/><rect x="10" y="9" width="4" height="12" rx="1" {...s}/><rect x="17" y="5" width="4" height="16" rx="1" {...s}/></svg>
    );
    case "advanced": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2a7 7 0 017 7c0 3-2 5-3 6l-1 3H9l-1-3c-1-1-3-3-3-6a7 7 0 017-7z" {...s}/><line x1="9" y1="21" x2="15" y2="21" {...s}/><line x1="9" y1="18" x2="15" y2="18" {...s}/></svg>
    );
    case "beginner": return (
      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2L8 8H3l4 4-2 6 7-4 7 4-2-6 4-4h-5L12 2z" {...s}/></svg>
    );
    case "doma": return (
      <svg viewBox="0 0 24 24" width="26" height="26">
        <circle cx="12" cy="12" r="9" {...s}/>
        <circle cx="12" cy="12" r="3" {...f} opacity={0.9}/>
        <line x1="12" y1="3" x2="12" y2="9" {...s}/>
        <line x1="12" y1="15" x2="12" y2="21" {...s}/>
        <line x1="3" y1="12" x2="9" y2="12" {...s}/>
        <line x1="15" y1="12" x2="21" y2="12" {...s}/>
      </svg>
    );
    case "aivm": return (
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" opacity="0.4"/>
        <circle cx="12" cy="12" r="4.5" stroke={color} strokeWidth="1.5"/>
        <circle cx="12" cy="12" r="1.8" fill={color}/>
        <line x1="12" y1="3" x2="12" y2="7.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="12" y1="16.5" x2="12" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="3" y1="12" x2="7.5" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="16.5" y1="12" x2="21" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="5.5" cy="5.5" r="1.5" fill={color} opacity="0.7"/>
        <circle cx="18.5" cy="5.5" r="1.5" fill={color} opacity="0.7"/>
        <circle cx="5.5" cy="18.5" r="1.5" fill={color} opacity="0.7"/>
        <circle cx="18.5" cy="18.5" r="1.5" fill={color} opacity="0.7"/>
      </svg>
    );
    default: return <span style={{ fontSize: "1.4rem" }}>📄</span>;
  }
}

/* ─── URLs ───────────────────────────────────────────────────────────── */
const DOMA_REGISTER = "https://app.doma.xyz/domain/web3guides.com/#subdomains";
const DOMA_HOME     = "https://doma.xyz";

function subUrl(key: string) {
  return `https://${key}.web3guides.com`;
}

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

function Reveal({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useReveal();
  return <div ref={ref} className={`lp-reveal ${className}`} style={style}>{children}</div>;
}

/* ════════════════════════════════════════════════════════════════════════
   NAV
════════════════════════════════════════════════════════════════════════ */
function Nav() {
  return (
    <nav style={{ background: "rgba(254,251,246,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 100 }}>
      <div className="lp-nav-inner" style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>
        <a href="/" style={{ fontFamily: "'Bungee', cursive", fontSize: "1.4rem", background: "linear-gradient(135deg, #ff6b35, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", textDecoration: "none" }}>
          Web3 Guides
        </a>
        <div className="lp-nav-links">
          <a href="#browse" style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", fontSize: "0.95rem", textDecoration: "none", transition: "color 0.2s" }}
             onMouseEnter={e => (e.currentTarget.style.color = "#1a1a1a")}
             onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>Topics</a>
          <a href="#paths" style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", fontSize: "0.95rem", textDecoration: "none", transition: "color 0.2s" }}
             onMouseEnter={e => (e.currentTarget.style.color = "#1a1a1a")}
             onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>Learn</a>
          <a href="/tools" style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", fontSize: "0.95rem", textDecoration: "none", transition: "color 0.2s" }}
             onMouseEnter={e => (e.currentTarget.style.color = "#1a1a1a")}
             onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>Tools</a>
          <a href="#subdomains" style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", fontSize: "0.95rem", textDecoration: "none", transition: "color 0.2s" }}
             onMouseEnter={e => (e.currentTarget.style.color = "#1a1a1a")}
             onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>Subdomains</a>
          <a href="/search" style={{ fontFamily: "'DM Sans', sans-serif", color: "#6b7280", fontSize: "0.95rem", textDecoration: "none", display: "flex", alignItems: "center", gap: 5, transition: "color 0.2s" }}
             onMouseEnter={e => (e.currentTarget.style.color = "#1a1a1a")}
             onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            Search
          </a>
          <a href="#browse" className="lp-nav-cta"
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

/* ════════════════════════════════════════════════════════════════════════
   HERO
════════════════════════════════════════════════════════════════════════ */
function Hero() {
  return (
    <section className="lp-hero-pad" style={{ background: "linear-gradient(135deg, #ff6b35 0%, #ec4899 100%)", position: "relative", overflow: "hidden" }}>
      <div className="lp-float" style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(1.5px 1.5px at 10% 20%, rgba(255,255,255,0.4) 0%, transparent 100%), radial-gradient(1px 1px at 75% 10%, rgba(255,255,255,0.35) 0%, transparent 100%), radial-gradient(2px 2px at 40% 60%, rgba(255,255,255,0.25) 0%, transparent 100%), radial-gradient(1px 1px at 90% 45%, rgba(255,255,255,0.4) 0%, transparent 100%), radial-gradient(1.5px 1.5px at 20% 80%, rgba(255,255,255,0.3) 0%, transparent 100%), radial-gradient(1px 1px at 60% 85%, rgba(255,255,255,0.35) 0%, transparent 100%), radial-gradient(2px 2px at 85% 75%, rgba(255,255,255,0.28) 0%, transparent 100%), radial-gradient(1px 1px at 5% 50%, rgba(255,255,255,0.32) 0%, transparent 100%)", pointerEvents: "none" }} aria-hidden="true" />
      {/* Rolling clouds */}
      <div className="cloud cloud-1" aria-hidden="true" />
      <div className="cloud cloud-2" aria-hidden="true" />
      <div className="cloud cloud-3" aria-hidden="true" />
      <div className="cloud cloud-4" aria-hidden="true" />
      <div className="cloud cloud-5" aria-hidden="true" />

      <div style={{ maxWidth: 1400, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        <div className="lp-fade-in" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 50, padding: "8px 20px", marginBottom: 32 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", color: "#fff", letterSpacing: 1 }}>BLOCKCHAIN EDUCATION PLATFORM · POWERED BY DOMA PROTOCOL</span>
        </div>

        <h1 className="lp-slide-down" style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2.5rem, 7vw, 5rem)", color: "#fff", lineHeight: 1.1, marginBottom: 24, textShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          Learn Web3. Build the Future.<br />Own Your Path.
        </h1>

        <p className="lp-slide-up" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "clamp(1rem, 2.5vw, 1.25rem)", color: "rgba(255,255,255,0.9)", maxWidth: 640, margin: "0 auto 48px", lineHeight: 1.7 }}>
          Master blockchain development, decentralized finance, and the technologies reshaping the internet. Join a global community of builders creating tomorrow's decentralized world.
        </p>

        <div className="lp-fade-in" style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", marginBottom: 64 }}>
          {/* Scrolls to topic grid — free content, no purchase */}
          <a href="#browse"
             style={{ fontFamily: "'DM Sans', sans-serif", background: "#fff", color: "#ff6b35", padding: "16px 36px", borderRadius: 50, fontSize: "1rem", fontWeight: 700, textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: "0 8px 30px rgba(0,0,0,0.15)", display: "inline-flex", alignItems: "center", gap: 8 }}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 40px rgba(0,0,0,0.2)"; }}
             onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 30px rgba(0,0,0,0.15)"; }}>
            Start Learning Free →
          </a>
          <a href="#subdomains"
             style={{ fontFamily: "'DM Sans', sans-serif", background: "rgba(255,255,255,0.15)", color: "#fff", padding: "16px 36px", borderRadius: 50, fontSize: "1rem", fontWeight: 600, textDecoration: "none", border: "2px solid rgba(255,255,255,0.4)", backdropFilter: "blur(8px)", transition: "transform 0.2s, background 0.2s" }}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.25)"; }}
             onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.15)"; }}>
            Claim Your Subdomain
          </a>
        </div>

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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   DIFFICULTY TILES
════════════════════════════════════════════════════════════════════════ */
const DIFF_TILES = [
  {
    label: "Easy",
    emoji: "🌱",
    slug: "/easy",
    gradient: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
    glow: "rgba(16,185,129,0.15)",
    desc: "Plain-English explainers. No prior knowledge required.",
  },
  {
    label: "Medium",
    emoji: "⚡",
    slug: "/medium",
    gradient: "linear-gradient(135deg, #ff6b35 0%, #fbbf24 100%)",
    glow: "rgba(255,107,53,0.15)",
    desc: "Core concepts and hands-on tutorials for growing builders.",
  },
  {
    label: "Advanced",
    emoji: "🔮",
    slug: "/advanced",
    gradient: "linear-gradient(135deg, #6366f1 0%, #ec4899 100%)",
    glow: "rgba(99,102,241,0.15)",
    desc: "Deep dives, protocol internals, and cutting-edge research.",
  },
];

function DifficultyTiles() {
  return (
    <section className="lp-diff-pad" style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 3, color: "#10b981", textTransform: "uppercase", marginBottom: 12 }}>FILTER BY LEVEL</div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(1.8rem, 4vw, 2.5rem)", color: "#1a1a1a" }}>Browse All Articles by Difficulty</h2>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {DIFF_TILES.map(({ label, emoji, slug, gradient, glow, desc }) => (
            <Reveal key={label}>
              <a href={slug} style={{ display: "flex", alignItems: "center", gap: 20, padding: "24px 28px", borderRadius: 20, background: "#fff", border: "1.5px solid #e5e7eb", textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s" }}
                 onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-5px)"; el.style.boxShadow = `0 16px 40px ${glow}`; el.style.borderColor = "transparent"; }}
                 onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; el.style.borderColor = "#e5e7eb"; }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", flexShrink: 0 }}>{emoji}</div>
                <div>
                  <div style={{ fontFamily: "'Bungee', cursive", fontSize: "1.2rem", color: "#1a1a1a", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", color: "#6b7280", lineHeight: 1.5 }}>{desc}</div>
                </div>
                <div style={{ marginLeft: "auto", fontSize: "1.2rem", color: "#d1d5db" }}>→</div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   BROWSE TOPICS (subdomain tile grid)
════════════════════════════════════════════════════════════════════════ */

// ── Featured project config — change this to swap the featured project ──────
const FEATURED_PROJECT = {
  key:         "aivm",
  label:       "AIVM by ChainGPT",
  tagline:     "Decentralised AI. No Big Tech Required.",
  description: "ChainGPT's Layer-1 blockchain for open AI compute, verifiable agent execution, and tokenised data markets. Public testnet live now — mainnet Q2/3 2026.",
  badge:       "Featured Project Guides",
  accentFrom:  "#00FEFC",
  accentTo:    "#2DFFB9",
  bg:          "#0B1320",
  url:         "https://aivm.web3guides.com",
  partnerLine: "Backed by Google · Nvidia · Alibaba Cloud · Binance",
};

// Ordered intentionally: easy entry points first, then chains, then specialisms
// 'beginner' subdomain excluded — not managed by this platform
const BROWSE_ORDER = [
  "easy", "eth", "btc", "sol", "defi", "staking",
  "layer2", "security", "rwa", "bridge", "legal", "tax", "bigmike", "doma", "aivm",
];

function BrowseSection() {
  return (
    <section id="browse" className="lp-section-pad" style={{ background: "#fff" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 3, color: "#ff6b35", textTransform: "uppercase", marginBottom: 16 }}>FREE CONTENT</div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3rem)", color: "#1a1a1a", marginBottom: 16 }}>Choose Your Topic</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.05rem", color: "#6b7280", maxWidth: 500, margin: "0 auto", lineHeight: 1.7 }}>
            Each topic is a dedicated knowledge hub. Pick one and go deep — no signup required.
          </p>
        </Reveal>

        {/* ── Featured Project Banner ──────────────────────────────────── */}
        <Reveal style={{ marginBottom: 16 }}>
          <a
            href={FEATURED_PROJECT.url}
            style={{
              display: "block",
              textDecoration: "none",
              borderRadius: 24,
              overflow: "hidden",
              background: FEATURED_PROJECT.bg,
              border: `1.5px solid rgba(0,254,252,0.25)`,
              boxShadow: `0 0 0 0 rgba(0,254,252,0)`,
              transition: "box-shadow 0.3s, transform 0.2s",
              position: "relative",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.boxShadow = "0 8px 60px rgba(0,254,252,0.2)";
              el.style.transform = "translateY(-3px)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.boxShadow = "0 0 0 0 rgba(0,254,252,0)";
              el.style.transform = "translateY(0)";
            }}
          >
            {/* Animated background glow */}
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: `radial-gradient(ellipse at 20% 50%, rgba(0,254,252,0.07) 0%, transparent 60%), radial-gradient(ellipse at 80% 50%, rgba(45,255,185,0.05) 0%, transparent 60%)`,
              pointerEvents: "none",
            }} />
            {/* Scanline texture */}
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,254,252,0.015) 3px, rgba(0,254,252,0.015) 4px)",
              pointerEvents: "none",
            }} />

            <div style={{
              position: "relative", zIndex: 1,
              display: "flex", alignItems: "center", gap: 28,
              padding: "28px 36px", flexWrap: "wrap",
            }}>
              {/* Icon */}
              <div style={{
                width: 72, height: 72, borderRadius: 20, flexShrink: 0,
                background: "rgba(0,254,252,0.08)",
                border: "1.5px solid rgba(0,254,252,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 24px rgba(0,254,252,0.15)",
              }}>
                <svg viewBox="0 0 32 32" width="36" height="36" fill="none">
                  <circle cx="16" cy="16" r="12" stroke="#00FEFC" strokeWidth="1.5" opacity="0.4"/>
                  <circle cx="16" cy="16" r="6" stroke="#00FEFC" strokeWidth="1.5"/>
                  <circle cx="16" cy="16" r="2.5" fill="#00FEFC"/>
                  <line x1="16" y1="4" x2="16" y2="10" stroke="#2DFFB9" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="16" y1="22" x2="16" y2="28" stroke="#2DFFB9" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="4" y1="16" x2="10" y2="16" stroke="#2DFFB9" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="22" y1="16" x2="28" y2="16" stroke="#2DFFB9" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="7" cy="7" r="2" fill="#00FEFC" opacity="0.6"/>
                  <circle cx="25" cy="7" r="2" fill="#00FEFC" opacity="0.6"/>
                  <circle cx="7" cy="25" r="2" fill="#2DFFB9" opacity="0.6"/>
                  <circle cx="25" cy="25" r="2" fill="#2DFFB9" opacity="0.6"/>
                </svg>
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 200 }}>
                {/* Badge */}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "rgba(0,254,252,0.1)",
                  border: "1px solid rgba(0,254,252,0.2)",
                  borderRadius: 50, padding: "3px 12px", marginBottom: 10,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00FEFC", display: "inline-block", boxShadow: "0 0 6px #00FEFC" }} />
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", color: "#00FEFC", letterSpacing: 1.5 }}>
                    {FEATURED_PROJECT.badge.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)", color: "#fff", marginBottom: 6, lineHeight: 1.15 }}>
                  {FEATURED_PROJECT.label}
                </div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.6, maxWidth: 580 }}>
                  {FEATURED_PROJECT.description}
                </div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", color: "rgba(255,255,255,0.25)", letterSpacing: 1, marginTop: 10 }}>
                  {FEATURED_PROJECT.partnerLine}
                </div>
              </div>

              {/* CTA */}
              <div style={{ flexShrink: 0 }}>
                <div style={{
                  background: `linear-gradient(135deg, ${FEATURED_PROJECT.accentFrom}, ${FEATURED_PROJECT.accentTo})`,
                  color: "#0B1320", padding: "12px 28px", borderRadius: 50,
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "0.9rem",
                  whiteSpace: "nowrap",
                }}>
                  Explore AIVM →
                </div>
              </div>
            </div>
          </a>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {BROWSE_ORDER.map((key, i) => {
            const cfg = SUBDOMAINS[key as keyof typeof SUBDOMAINS];
            if (!cfg) return null;
            return (
              <Reveal key={key}>
                <a href={subUrl(key)}
                   style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20, borderRadius: 20, background: "#fafafa", border: "1.5px solid #e5e7eb", textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s", animationDelay: `${i * 40}ms` }}
                   onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-5px)"; el.style.boxShadow = `0 16px 40px ${cfg.glowHex}`; el.style.borderColor = cfg.accentHex; }}
                   onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; el.style.borderColor = "#e5e7eb"; }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: `${cfg.accentHex}18`, border: `2px solid ${cfg.accentHex}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                    {key === "bigmike"
                      ? <img src="/bigmike.jpg" alt="Big Mike" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }} />
                      : <SubdomainIcon sdKey={key} color={cfg.accentHex} />}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: "#1a1a1a", fontSize: "0.95rem", marginBottom: 4 }}>{cfg.label}</div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", color: "#6b7280", lineHeight: 1.5 }}>{cfg.description}</div>
                  </div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: cfg.accentHex, marginTop: "auto" }}>
                    {key}.web3guides.com →
                  </div>
                </a>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

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
    <section className="lp-section-pad" style={{ background: "#fefbf6" }}>
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
                   onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-8px)"; el.style.boxShadow = "0 20px 60px rgba(0,0,0,0.1)"; el.style.borderColor = "#ff6b35"; }}
                   onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; el.style.borderColor = "#e5e7eb"; }}>
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
    href: subUrl("easy"),   // easy.web3guides.com — plain-English explainers
    cta: "Start Beginner Path →",
  },
  {
    emoji: "⚡",
    title: "Developer Path",
    gradient: "linear-gradient(135deg, #ff6b35 0%, #ec4899 100%)",
    subtitle: "Build real applications on blockchain networks.",
    topics: ["Solidity Smart Contract Development", "Web3.js & ethers.js Integration", "Building DApps with React", "Testing & Deploying Contracts", "Advanced DeFi Protocols"],
    href: subUrl("eth"),    // eth.web3guides.com — Ethereum dev focus
    cta: "Start Developer Path →",
  },
  {
    emoji: "🏗️",
    title: "Advanced Path",
    gradient: "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
    subtitle: "Master cutting-edge Web3 technologies and architecture.",
    topics: ["Layer 2 Scaling Solutions", "Cross-Chain Development", "MEV & Transaction Ordering", "Zero-Knowledge Proofs", "Protocol Design & Economics"],
    href: subUrl("layer2"), // layer2.web3guides.com — advanced scaling content
    cta: "Start Advanced Path →",
  },
];

function LearningPaths() {
  return (
    <section id="paths" className="lp-section-pad" style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, #93c5fd 1px, transparent 1px)", backgroundSize: "30px 30px", opacity: 0.3, pointerEvents: "none" }} aria-hidden="true" />

      <div style={{ maxWidth: 1400, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <Reveal style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 3, color: "#6366f1", textTransform: "uppercase", marginBottom: 16 }}>STRUCTURED LEARNING</div>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: "clamp(2rem, 5vw, 3.5rem)", color: "#1a1a1a", marginBottom: 20 }}>Choose Your Path</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "#6b7280", maxWidth: 540, margin: "0 auto", lineHeight: 1.7 }}>
            Structured curricula designed to take you from where you are to where you want to be.
          </p>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 30 }}>
          {PATHS.map(({ emoji, title, gradient, subtitle, topics, href, cta }) => (
            <Reveal key={title}>
              <div style={{ background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", transition: "transform 0.25s, box-shadow 0.25s", display: "flex", flexDirection: "column" }}
                   onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-8px)"; el.style.boxShadow = "0 20px 60px rgba(0,0,0,0.12)"; }}
                   onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(0)"; el.style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)"; }}>
                <div style={{ background: gradient, padding: 30 }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>{emoji}</div>
                  <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: "1.6rem", color: "#fff", marginBottom: 8, letterSpacing: "-0.01em" }}>{title}</h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>{subtitle}</p>
                </div>
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
const GRADIENTS = [
  "linear-gradient(135deg, #ff6b35 0%, #ec4899 100%)",
  "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
  "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
];

interface FeaturedGuide {
  id: number;
  title: string;
  slug: string;
  subdomain: string;
  summary: string | null;
  difficulty: string | null;
  cover_image: string | null;
}

function FeaturedGuideCard({ guide, imgSrc, color }: {
  guide: FeaturedGuide;
  imgSrc: string | null;
  color: string;
}) {
  const ogFallback = `/api/og?sub=${encodeURIComponent(guide.subdomain)}&t=${encodeURIComponent(guide.title)}`;
  const [src, setSrc] = useState(imgSrc ?? ogFallback);

  return (
    <a
      href={`${subUrl(guide.subdomain)}/guides/${guide.slug}`}
      style={{ display: "block", background: "#fff", borderRadius: 20, overflow: "hidden", border: "1px solid #e5e7eb", textDecoration: "none", transition: "transform 0.25s, box-shadow 0.25s" }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-6px)"; el.style.boxShadow = "0 16px 50px rgba(0,0,0,0.1)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; }}
    >
      <div style={{ height: 160, position: "relative", overflow: "hidden", background: "#0d0d1f" }}>
        <img
          src={src}
          alt=""
          onError={() => { if (src !== ogFallback) setSrc(ogFallback); }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
        />
      </div>
      <div style={{ padding: "24px 28px" }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 2, color, textTransform: "uppercase", marginBottom: 10 }}>{guide.subdomain}</div>
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", fontWeight: 700, color: "#1a1a1a", marginBottom: 12, lineHeight: 1.4 }}>{guide.title}</h3>
        {guide.summary && (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>{guide.summary}</p>
        )}
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", fontWeight: 600, color, display: "inline-flex", alignItems: "center", gap: 6 }}>
          Read Guide →
        </span>
      </div>
    </a>
  );
}

function Articles() {
  const [guides, setGuides] = useState<FeaturedGuide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/featured-guides")
      .then(r => r.json())
      .then(data => { setGuides(data.guides ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const SUBDOMAIN_COLORS: Record<string, string> = {
    eth: "#627eea", btc: "#f7931a", sol: "#9945ff", defi: "#10b981",
    staking: "#06b6d4", layer2: "#8b5cf6", security: "#ef4444",
    rwa: "#f59e0b", bridge: "#3b82f6", legal: "#6366f1", tax: "#ec4899",
    easy: "#10b981", bigmike: "#ff6b35",
  };

  return (
    <section id="articles" className="lp-section-pad" style={{ background: "#fff" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 3, color: "#ec4899", textTransform: "uppercase", marginBottom: 16 }}>DEEP DIVES</div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3.5rem)", color: "#1a1a1a", marginBottom: 20 }}>Featured Guides</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "#6b7280", maxWidth: 500, margin: "0 auto", lineHeight: 1.7 }}>
            Comprehensive guides on the topics that matter most in Web3.
          </p>
        </Reveal>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", fontFamily: "'DM Sans', sans-serif", color: "#9ca3af" }}>Loading guides…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 30 }}>
            {guides.map((guide, i) => {
              const color = SUBDOMAIN_COLORS[guide.subdomain] ?? "#6366f1";
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
              const fallbackImg = supabaseUrl
                ? `${supabaseUrl}/storage/v1/object/public/guide-images/${guide.subdomain}/${guide.slug}/1.png`
                : null;
              const imgSrc = guide.cover_image ?? fallbackImg;
              return (
                <Reveal key={guide.id}>
                  <FeaturedGuideCard guide={guide} imgSrc={imgSrc} color={color} />
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   DOMA PROTOCOL SECTION
════════════════════════════════════════════════════════════════════════ */
const DOMA_FEATURES = [
  { emoji: "⛓️", title: "On-Chain Ownership",       body: "Subdomains are minted as on-chain assets — your subdomain is owned by your wallet, not a platform." },
  { emoji: "🔑", title: "Wallet-Controlled",         body: "Transfer, sell, or stake your subdomain directly from your wallet with no middlemen or approval queues." },
  { emoji: "💸", title: "Stake to Get Featured",     body: "Stake $DOMA tokens against your subdomain to get promoted across the Web3 Guides platform and earn distribution." },
  { emoji: "🌐", title: "ENS & DNS Integration",     body: "Doma subdomains work with ENS and standard DNS so your content is reachable from both Web3 and the open web." },
  { emoji: "📈", title: "Creator Revenue Share",     body: "Use your own affiliate links, referral codes, and sponsorships. Doma Protocol takes nothing — 100% of revenue is yours." },
  { emoji: "🛡️", title: "Censorship-Resistant",     body: "No central authority can revoke your subdomain. Ownership is enforced by smart contracts, not a company's terms of service." },
];

function DomaSection() {
  return (
    <section className="lp-section-pad" style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1040 50%, #0f0c29 100%)", position: "relative", overflow: "hidden" }}>
      {/* Subtle grid overlay */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(124,106,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(124,106,255,0.05) 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} aria-hidden="true" />

      <div style={{ maxWidth: 1400, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <Reveal style={{ textAlign: "center", marginBottom: 64 }}>
          {/* Doma logo pill */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(124,106,255,0.15)", border: "1px solid rgba(124,106,255,0.35)", borderRadius: 50, padding: "10px 24px", marginBottom: 28 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c6aff", display: "inline-block" }} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.8rem", color: "#7c6aff", letterSpacing: 1 }}>POWERED BY DOMA PROTOCOL</span>
          </div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3.5rem)", color: "#fff", marginBottom: 20 }}>
            What is Doma Protocol?
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "rgba(255,255,255,0.7)", maxWidth: 640, margin: "0 auto", lineHeight: 1.8 }}>
            Doma Protocol is the on-chain infrastructure that powers Web3 Guides subdomains. Instead of renting a subdomain from a company, you <strong style={{ color: "#fff" }}>own it as a blockchain asset</strong> — mintable, transferable, and unstoppable. Stake $DOMA to boost your reach across the entire platform.
          </p>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, marginBottom: 56 }}>
          {DOMA_FEATURES.map(({ emoji, title, body }) => (
            <Reveal key={title}>
              <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(12px)", border: "1px solid rgba(124,106,255,0.2)", borderRadius: 20, padding: 28, transition: "border-color 0.2s, background 0.2s" }}
                   onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(124,106,255,0.5)"; el.style.background = "rgba(124,106,255,0.1)"; }}
                   onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(124,106,255,0.2)"; el.style.background = "rgba(255,255,255,0.05)"; }}>
                <div style={{ fontSize: "2rem", marginBottom: 14 }}>{emoji}</div>
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem", color: "#fff", marginBottom: 8 }}>{title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal style={{ textAlign: "center" }}>
          <a href={DOMA_HOME} target="_blank" rel="noopener noreferrer"
             style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "linear-gradient(135deg, #7c6aff, #3b9eff)", color: "#fff", padding: "16px 40px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem", textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: "0 8px 30px rgba(124,106,255,0.35)" }}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 40px rgba(124,106,255,0.5)"; }}
             onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 30px rgba(124,106,255,0.35)"; }}>
            Learn more at doma.xyz →
          </a>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", color: "rgba(255,255,255,0.4)", marginTop: 16 }}>
            Subdomain registration and $DOMA staking happen on the Doma Protocol platform.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   SUBDOMAIN SECTION
════════════════════════════════════════════════════════════════════════ */
const STEPS = [
  { n: "1", title: "Choose Your Topic", body: "Pick a niche within Web3—DeFi protocols, NFT development, DAO tooling, or any specialized area you're passionate about." },
  { n: "2", title: "Register via Doma Protocol", body: "Connect your wallet on doma.xyz and mint your subdomain as an on-chain asset. You own it — not a platform." },
  { n: "3", title: "Stake $DOMA to Get Featured", body: "Stake $DOMA tokens against your subdomain to unlock promotion across Web3 Guides and boost your reach.", badge: "Coming Soon" },
  { n: "4", title: "Create & Monetize", body: "Publish content, use your own affiliate links, build your community, and earn from your expertise. 100% of revenue is yours." },
];

const SUB_BENEFITS = [
  { title: "Your Brand, Your Domain",      body: "Get a professional subdomain that positions you as an authority in your niche." },
  { title: "Monetization Freedom",         body: "Your own affiliate links, referral codes, sponsorships. Doma takes nothing — keep 100% of what you earn." },
  { title: "Platform Distribution",        body: "Staking $DOMA gets your content featured on the main platform, reaching thousands of learners." },
  { title: "On-Chain Ownership",           body: "Your subdomain is a blockchain asset. Transfer it, sell it, or hold it — no permission required." },
  { title: "Censorship-Resistant Content", body: "No platform can delete you. Content and ownership are enforced by smart contracts." },
];

function SubdomainSection() {
  return (
    <section id="subdomains" className="lp-section-pad" style={{ background: "linear-gradient(135deg, #1a0533 0%, #302b63 50%, #24243e 100%)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "80vw", height: "80vh", background: "radial-gradient(ellipse at center, rgba(99,102,241,0.12) 0%, transparent 70%)", pointerEvents: "none" }} aria-hidden="true" />

      <div style={{ maxWidth: 1400, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <Reveal style={{ textAlign: "center", marginBottom: 64 }}>
          {/* Doma badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(124,106,255,0.15)", border: "1px solid rgba(124,106,255,0.3)", borderRadius: 50, padding: "6px 16px", marginBottom: 20 }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#7c6aff", letterSpacing: 1 }}>POWERED BY DOMA PROTOCOL</span>
          </div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 3, color: "#06b6d4", textTransform: "uppercase", marginBottom: 16 }}>OWN YOUR CORNER OF WEB3</div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3.5rem)", color: "#fff", marginBottom: 20 }}>Get Your Subdomain</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "rgba(255,255,255,0.7)", maxWidth: 560, margin: "0 auto", lineHeight: 1.7 }}>
            Become a verified Web3 educator. Launch your own guide site, newsletter, or community hub under web3guides.com — owned by your wallet through Doma Protocol.
          </p>
        </Reveal>

        <div className="lp-two-col">
          <Reveal>
            <h3 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.5rem", color: "#fff", marginBottom: 32 }}>How It Works</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {STEPS.map(({ n, title, body, badge }) => (
                <div key={n} style={{ background: "rgba(255,255,255,0.07)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 24, display: "flex", gap: 20, alignItems: "flex-start" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #ff6b35, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bungee', cursive", fontSize: "1.1rem", color: "#fff", flexShrink: 0 }}>{n}</div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", fontWeight: 700, color: "#fff" }}>{title}</h4>
                      {badge && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", background: "rgba(6,182,212,0.2)", border: "1px solid rgba(6,182,212,0.4)", color: "#06b6d4", padding: "2px 10px", borderRadius: 50 }}>{badge}</span>}
                    </div>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal>
            <h3 style={{ fontFamily: "'Bungee', cursive", fontSize: "1.5rem", color: "#fff", marginBottom: 32 }}>Why Get a Subdomain?</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 40 }}>
              {SUB_BENEFITS.map(({ title, body }) => (
                <div key={title} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#06b6d4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", color: "#fff", flexShrink: 0 }}>✓</div>
                  <div>
                    <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: 4 }}>{title}</h4>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>

            <a href={DOMA_REGISTER} target="_blank" rel="noopener noreferrer"
               style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #ff6b35, #ec4899)", color: "#fff", padding: "16px 36px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem", textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: "0 8px 30px rgba(255,107,53,0.35)" }}
               onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 40px rgba(255,107,53,0.5)"; }}
               onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 30px rgba(255,107,53,0.35)"; }}>
              Register on Doma Protocol →
            </a>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", marginTop: 12 }}>
              Opens app.doma.xyz — subdomain registration requires a wallet &amp; $DOMA
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FREE TOOLS
════════════════════════════════════════════════════════════════════════ */
function FreeTools() {
  const tools = [
    {
      icon: "🇬🇧",
      label: "Free Tool",
      labelColor: "#22c55e",
      labelBg: "rgba(34,197,94,0.12)",
      title: "UK Crypto Tax Calculator",
      body: "Estimate your capital gains tax liability for 2024/25. Enter your disposals, pick your income band, and get an instant CGT figure. No signup.",
      accent: "#ec4899",
      accentBg: "linear-gradient(135deg, #1a0a14, #2d0a24)",
      border: "rgba(236,72,153,0.2)",
      href: "/tools/tax-calculator",
      cta: "Calculate My Tax →",
      stats: [
        { value: "£3,000", label: "Annual exempt amount" },
        { value: "18%", label: "Basic rate CGT 2024/25" },
        { value: "24%", label: "Higher rate CGT 2024/25" },
      ],
    },
    {
      icon: "📈",
      label: "Free Tool",
      labelColor: "#0ea5e9",
      labelBg: "rgba(14,165,233,0.12)",
      title: "Staking Rewards Calculator",
      body: "See how much you could earn staking ETH, SOL, ADA, DOT, MATIC and more. Compare timeframes, toggle compounding, and view projected GBP returns.",
      accent: "#0ea5e9",
      accentBg: "linear-gradient(135deg, #030f1a, #0c2a3e)",
      border: "rgba(14,165,233,0.2)",
      href: "/tools/staking-calculator",
      cta: "Calculate Staking Rewards →",
      stats: [
        { value: "8", label: "Assets supported" },
        { value: "16%", label: "Top APY (ATOM)" },
        { value: "5yr", label: "Max projection" },
      ],
    },
  ];

  return (
    <section
      className="lp-section-pad"
      style={{ background: "#080812", borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* heading */}
        <Reveal style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 20, padding: "4px 14px", marginBottom: 16 }}>
            <span style={{ fontSize: 14 }}>🔧</span>
            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, fontWeight: 700, color: "#818cf8", letterSpacing: 1, textTransform: "uppercase" }}>Free Tools</span>
          </div>
          <h2 style={{ fontFamily: "'Bungee',cursive", fontSize: "clamp(1.6rem,3.5vw,2.4rem)", color: "#fff", margin: "0 0 12px" }}>
            Tools Built for Crypto Investors
          </h2>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "1rem", color: "#64748b", maxWidth: 480, margin: "0 auto" }}>
            No signup. No paywalls. Just useful calculators.
          </p>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: 24 }}>
          {tools.map((t) => (
            <Reveal key={t.href}>
              <a
                href={t.href}
                style={{
                  display: "block",
                  background: t.accentBg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 20,
                  padding: "32px 32px 28px",
                  textDecoration: "none",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow = `0 20px 60px ${t.border}`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
              >
                {/* Glow orb */}
                <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: `${t.accent}18`, filter: "blur(40px)", pointerEvents: "none" }} />

                {/* Label + icon */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <span style={{ fontSize: 28 }}>{t.icon}</span>
                  <span style={{ background: t.labelBg, color: t.labelColor, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, letterSpacing: 0.5, textTransform: "uppercase" as const, fontFamily: "'Space Mono',monospace" }}>
                    {t.label}
                  </span>
                </div>

                <h3 style={{ fontFamily: "'Bungee',cursive", fontSize: "1.35rem", color: "#fff", margin: "0 0 12px", lineHeight: 1.2 }}>{t.title}</h3>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "0.95rem", color: "#94a3b8", lineHeight: 1.7, margin: "0 0 24px" }}>{t.body}</p>

                {/* Mini stats */}
                <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
                  {t.stats.map((s) => (
                    <div key={s.label} style={{ borderLeft: `2px solid ${t.accent}40`, paddingLeft: 10 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: t.accent, fontFamily: "'Space Mono',monospace" }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "0.9rem", fontWeight: 700, color: t.accent }}>
                  {t.cta}
                </span>
              </a>
            </Reveal>
          ))}
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
    <section className="lp-section-pad" style={{ background: "linear-gradient(135deg, #ff6b35 0%, #ec4899 100%)", position: "relative", overflow: "hidden" }}>
      <div className="lp-float" style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} aria-hidden="true" />

      <Reveal style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(2rem, 5vw, 3rem)", color: "#fff", marginBottom: 20 }}>
          Ready to Build Your Web3 Future?
        </h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", color: "rgba(255,255,255,0.9)", lineHeight: 1.7, marginBottom: 40 }}>
          Join thousands of developers and creators learning the technologies that will power the next generation of the internet.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
          {/* Free content — scrolls to topic grid */}
          <a href="#browse"
             style={{ background: "#fff", color: "#ff6b35", padding: "16px 36px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem", textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: "0 8px 25px rgba(0,0,0,0.15)" }}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 40px rgba(0,0,0,0.2)"; }}
             onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)"; }}>
            Browse Free Topics →
          </a>
          {/* Subdomain registration via Doma Protocol */}
          <a href={DOMA_REGISTER} target="_blank" rel="noopener noreferrer"
             style={{ background: "transparent", color: "#fff", padding: "16px 36px", borderRadius: 50, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "1rem", textDecoration: "none", border: "2px solid rgba(255,255,255,0.6)", transition: "transform 0.2s, background 0.2s" }}
             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.15)"; }}
             onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
            Get a Subdomain via Doma
          </a>
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", marginTop: 20 }}>
          Subdomain registration opens on app.doma.xyz and requires a wallet &amp; $DOMA tokens.
        </p>
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
      { label: "Easy Mode",       href: subUrl("easy") },
      { label: "Ethereum",        href: subUrl("eth") },
      { label: "DeFi",            href: subUrl("defi") },
      { label: "Layer 2",         href: subUrl("layer2") },
    ],
  },
  {
    head: "Explore",
    links: [
      { label: "Bitcoin",         href: subUrl("btc") },
      { label: "Solana",          href: subUrl("sol") },
      { label: "Security",        href: subUrl("security") },
      { label: "All Topics",      href: "#browse" },
    ],
  },
  {
    head: "Platform",
    links: [
      { label: "Get a Subdomain", href: DOMA_REGISTER },
      { label: "Doma Protocol",   href: DOMA_HOME },
      { label: "Big Mike",        href: subUrl("bigmike") },
      { label: "About",           href: "/about" },
    ],
  },
  {
    head: "Legal",
    links: [
      { label: "Privacy Policy",  href: "/privacy" },
      { label: "Disclaimer",      href: "/disclaimer" },
      { label: "Terms of Use",    href: "/terms" },
    ],
  },
];

function Footer() {
  return (
    <footer className="lp-section-pad" style={{ background: "#1a1a1a", color: "#fff", paddingBottom: 0 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 40, marginBottom: 48 }}>
          <div>
            <div style={{ fontFamily: "'Bungee', cursive", fontSize: "1.8rem", background: "linear-gradient(135deg, #ff6b35, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 16 }}>
              Web3 Guides
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#9ca3af", lineHeight: 1.7, maxWidth: 280, marginBottom: 20 }}>
              Your comprehensive resource for mastering blockchain development, DeFi, NFTs, and the decentralized web. Built by developers, for developers.
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(124,106,255,0.15)", border: "1px solid rgba(124,106,255,0.3)", borderRadius: 50, padding: "6px 14px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c6aff", display: "inline-block" }} />
              <a href={DOMA_HOME} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#7c6aff", textDecoration: "none", letterSpacing: 1 }}>
                Powered by Doma Protocol
              </a>
            </div>
          </div>
          {FOOTER_LINK_COLS.map(({ head, links }) => (
            <div key={head}>
              <h4 style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", letterSpacing: 2, color: "#9ca3af", textTransform: "uppercase", marginBottom: 20 }}>{head}</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
                       style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#6b7280", textDecoration: "none", transition: "color 0.2s, padding-left 0.2s" }}
                       onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = "#fff"; el.style.paddingLeft = "4px"; }}
                       onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = "#6b7280"; el.style.paddingLeft = "0"; }}>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #374151", padding: "28px 0" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.75rem", color: "#4b5563", lineHeight: 1.6, marginBottom: 16 }}>
            ⚠️ <strong style={{ color: "#6b7280" }}>Not financial advice.</strong> All content on Web3 Guides is for educational and informational purposes only. Nothing here constitutes financial, investment, legal, or tax advice. Crypto assets are highly volatile and speculative. Always do your own research and consult a qualified professional before making any financial decisions. AI-generated content may contain inaccuracies — verify independently.
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", color: "#6b7280" }}>
              © 2026 Web3 Guides. Educational content for the decentralized web.
            </p>
            <a href={DOMA_HOME} target="_blank" rel="noopener noreferrer"
               style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", color: "#7c6aff", textDecoration: "none", letterSpacing: 1 }}>
              doma.xyz →
            </a>
          </div>
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
      <BrowseSection />
      <DifficultyTiles />
      <Benefits />
      <LearningPaths />
      <Articles />
      <SubdomainSection />
      <DomaSection />
      <FreeTools />
      <CTABanner />
      <Footer />
    </div>
  );
}
