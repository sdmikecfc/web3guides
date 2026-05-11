"use client";

import React, { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { SUBDOMAINS } from "@/lib/subdomains";

/* ─── Constants ──────────────────────────────────────────────────────────── */
const DOMA_REGISTER = "https://app.doma.xyz/domain/web3guides.com/#subdomains";
const DOMA_HOME     = "https://doma.xyz";
function subUrl(key: string) { return `https://${key}.web3guides.com`; }

/* ─── Scroll-reveal ──────────────────────────────────────────────────────── */
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
function Reveal({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useReveal();
  return <div ref={ref} className="lp-reveal" style={style}>{children}</div>;
}

/* ─── Subdomain SVG Icons ────────────────────────────────────────────────── */
function SubdomainIcon({ sdKey, color }: { sdKey: string; color: string }) {
  const s = { stroke: color, fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const f = { fill: color };
  switch (sdKey) {
    case "eth": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><polygon points="12,2 20,12 12,16 4,12" {...s}/><polygon points="12,16 20,12 12,22 4,12" style={{ ...s, opacity: 0.6 }}/></svg>
    );
    case "btc": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" {...s}/><text x="12" y="17" textAnchor="middle" style={{ fontWeight: 900, fontSize: 14 }} fill={color} stroke="none">₿</text></svg>
    );
    case "sol": return (
      <svg viewBox="0 0 24 24" width="22" height="22">
        <line x1="3" y1="7" x2="21" y2="7" {...s} strokeWidth={2.5}/>
        <line x1="6" y1="12" x2="21" y2="12" {...s} strokeWidth={2.5}/>
        <line x1="3" y1="17" x2="18" y2="17" {...s} strokeWidth={2.5}/>
      </svg>
    );
    case "defi": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" {...s}/></svg>
    );
    case "staking": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><rect x="5" y="11" width="14" height="10" rx="2" {...s}/><path d="M8 11V7a4 4 0 018 0v4" {...s}/><circle cx="12" cy="16" r="1.5" {...f}/></svg>
    );
    case "layer2": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2L2 7l10 5 10-5-10-5z" {...s}/><path d="M2 12l10 5 10-5" {...s}/><path d="M2 17l10 5 10-5" {...s}/></svg>
    );
    case "bridge": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 17 Q3 10 12 10 Q21 10 21 17" {...s}/><line x1="3" y1="17" x2="3" y2="21" {...s}/><line x1="21" y1="17" x2="21" y2="21" {...s}/><line x1="8" y1="10" x2="8" y2="17" {...s}/><line x1="16" y1="10" x2="16" y2="17" {...s}/></svg>
    );
    case "rwa": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 22V10l9-8 9 8v12" {...s}/><rect x="9" y="14" width="6" height="8" {...s}/></svg>
    );
    case "legal": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3v18" {...s}/><path d="M5 21h14" {...s}/><path d="M5 8l-3 6h6L5 8z" {...s}/><path d="M19 8l-3 6h6L19 8z" {...s}/></svg>
    );
    case "tax": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><rect x="4" y="2" width="16" height="20" rx="2" {...s}/><line x1="8" y1="7" x2="16" y2="7" {...s}/><line x1="8" y1="11" x2="16" y2="11" {...s}/><line x1="8" y1="15" x2="12" y2="15" {...s}/></svg>
    );
    case "security": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2l8 4v6c0 5-4 9-8 10C8 21 4 17 4 12V6l8-4z" {...s}/><path d="M9 12l2 2 4-4" {...s}/></svg>
    );
    case "easy": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2l2 7h7l-6 4 2 7-5-4-5 4 2-7-6-4h7z" {...s}/></svg>
    );
    case "jobs": return (
      <svg viewBox="0 0 24 24" width="22" height="22"><rect x="2" y="7" width="20" height="14" rx="2" {...s}/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" {...s}/><line x1="12" y1="12" x2="12" y2="16" {...s}/><line x1="10" y1="14" x2="14" y2="14" {...s}/></svg>
    );
    case "doma": return (
      <svg viewBox="0 0 24 24" width="22" height="22">
        <circle cx="12" cy="12" r="9" {...s}/>
        <circle cx="12" cy="12" r="3" {...f} opacity={0.9}/>
        <line x1="12" y1="3" x2="12" y2="9" {...s}/>
        <line x1="12" y1="15" x2="12" y2="21" {...s}/>
        <line x1="3" y1="12" x2="9" y2="12" {...s}/>
        <line x1="15" y1="12" x2="21" y2="12" {...s}/>
      </svg>
    );
    default: return <span style={{ fontSize: "1.1rem" }}>📄</span>;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   NAV
════════════════════════════════════════════════════════════════════════ */
function Nav() {
  return (
    <nav style={{
      background: "rgba(10,10,15,0.94)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      position: "sticky", top: 0, zIndex: 100,
    }}>
      <div className="lp-nav-inner" style={{ maxWidth: 1200, margin: "0 auto", height: 64, display: "flex", alignItems: "center" }}>
        <a href="/" style={{
          fontFamily: "'Bungee', cursive", fontSize: "1.2rem",
          background: "linear-gradient(135deg, #ff6b35, #ec4899)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          textDecoration: "none", flexShrink: 0,
        }}>Web3 Guides</a>

        <div style={{ flex: 1 }} />

        <div className="lp-nav-links">
          {[
            { label: "Tools", href: "#tools" },
            { label: "Topics", href: "#topics" },
            { label: "Projects", href: "#projects" },
            { label: "Search", href: "/search" },
          ].map(({ label, href }) => (
            <a key={label} href={href} style={{ fontFamily: "system-ui", fontSize: "0.88rem", color: "#64748b", textDecoration: "none", transition: "color 0.2s" }}
               onMouseOver={e => (e.currentTarget.style.color = "#e2e8f0")}
               onMouseOut={e => (e.currentTarget.style.color = "#64748b")}>
              {label}
            </a>
          ))}
          <a href="#newsletter" className="lp-nav-cta" style={{
            fontFamily: "system-ui", fontSize: "0.85rem", fontWeight: 700,
            color: "#fff", background: "linear-gradient(135deg, #ff6b35, #ec4899)",
            padding: "8px 18px", borderRadius: 20, textDecoration: "none",
            transition: "opacity 0.2s",
          }}
             onMouseOver={e => ((e.currentTarget as HTMLElement).style.opacity = "0.85")}
             onMouseOut={e => ((e.currentTarget as HTMLElement).style.opacity = "1")}>
            Newsletter →
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
    <section style={{
      background: "linear-gradient(180deg, #080810 0%, #0d0d1f 100%)",
      padding: "88px 24px 72px",
      textAlign: "center",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)",
        backgroundSize: "48px 48px", pointerEvents: "none",
      }} />
      <div style={{ maxWidth: 700, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <div className="lp-fade-in" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)",
          borderRadius: 20, padding: "5px 14px", marginBottom: 24,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.72rem", color: "#fbbf24", letterSpacing: 1 }}>
            BEAR MARKET 2025 — STAY SHARP
          </span>
        </div>

        <h1 className="lp-slide-down" style={{
          fontFamily: "'Bungee', cursive",
          fontSize: "clamp(2.2rem, 6vw, 3.8rem)",
          color: "#fff", lineHeight: 1.1, marginBottom: 20,
        }}>
          Free Crypto Tools &amp; Guides.<br />
          <span style={{
            background: "linear-gradient(135deg, #ff6b35, #ec4899)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>No Signup. No BS.</span>
        </h1>

        <p className="lp-slide-up" style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "clamp(1rem, 2.5vw, 1.15rem)",
          color: "#94a3b8", maxWidth: 520, margin: "0 auto 36px", lineHeight: 1.7,
        }}>
          Interactive calculators, airdrop trackers, and bear market strategies. Used by thousands of crypto investors. 100% free.
        </p>

        <div className="lp-fade-in" style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginBottom: 56 }}>
          <a href="#tools" style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "1rem",
            color: "#fff", background: "linear-gradient(135deg, #ff6b35, #ec4899)",
            padding: "14px 32px", borderRadius: 50, textDecoration: "none",
            boxShadow: "0 8px 30px rgba(255,107,53,0.35)", transition: "transform 0.2s, box-shadow 0.2s",
          }}
             onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 14px 40px rgba(255,107,53,0.5)"; }}
             onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "none"; el.style.boxShadow = "0 8px 30px rgba(255,107,53,0.35)"; }}>
            Explore Free Tools →
          </a>
          <a href="#newsletter" style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "1rem",
            color: "#94a3b8", background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.12)",
            padding: "14px 32px", borderRadius: 50, textDecoration: "none",
            transition: "color 0.2s, border-color 0.2s, background 0.2s",
          }}
             onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = "#fff"; el.style.borderColor = "rgba(255,255,255,0.3)"; el.style.background = "rgba(255,255,255,0.08)"; }}
             onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = "#94a3b8"; el.style.borderColor = "rgba(255,255,255,0.12)"; el.style.background = "rgba(255,255,255,0.04)"; }}>
            Bear Market Briefing →
          </a>
        </div>

        <div className="lp-fade-in" style={{ display: "flex", flexWrap: "wrap", gap: 40, justifyContent: "center" }}>
          {[
            { value: "60+", label: "Free Guides" },
            { value: "5", label: "Free Tools" },
            { value: "20+", label: "Topic Hubs" },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.6rem", fontWeight: 700, color: "#fff" }}>{value}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", color: "#475569", marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TOOLS SECTION
════════════════════════════════════════════════════════════════════════ */
const TOOLS_DATA = [
  {
    href: "/tools/dca",
    accent: "#F7931A",
    bg: "linear-gradient(135deg, #150800 0%, #0d0d1f 100%)",
    border: "rgba(247,147,26,0.2)",
    badge: "🐻 Bear Market",
    title: "Bear Market Time Machine",
    desc: "What if you'd DCA'd through the crash? See what $100/month into BTC, ETH or SOL through 2022 would be worth today.",
    preview: { label: "Example ROI", value: "+78.6%", sub: "$2,700 → $4,823", color: "#F7931A" },
    cta: "Try the Time Machine →",
    live: true,
  },
  {
    href: "/tools/airdrop-checker",
    accent: "#a78bfa",
    bg: "linear-gradient(135deg, #0d0518 0%, #0d0d1f 100%)",
    border: "rgba(167,139,250,0.2)",
    badge: "🪂 5 Airdrops",
    title: "Airdrop Eligibility Checker",
    desc: "Check your score for Ink, Base, Backpack, Polymarket and AIVM. See exactly what to do next to maximise your allocation.",
    preview: { label: "Average score", value: "42 / 100", sub: "Most people score below 50", color: "#a78bfa" },
    cta: "Check eligibility →",
    live: true,
  },
  {
    href: "/tools/security-score",
    accent: "#10b981",
    bg: "linear-gradient(135deg, #001208 0%, #0d0d1f 100%)",
    border: "rgba(16,185,129,0.2)",
    badge: "🛡️ 13 Questions",
    title: "Wallet Security Scorer",
    desc: "Answer 13 questions and get your personal security grade. Find out if your setup is actually protecting your assets.",
    preview: { label: "Example grade", value: "B+", sub: "Above average — 2 critical gaps", color: "#10b981" },
    cta: "Check your score →",
    live: true,
  },
  {
    href: "/tools/tax-calculator",
    accent: "#ec4899",
    bg: "linear-gradient(135deg, #1a0a14 0%, #0d0d1f 100%)",
    border: "rgba(236,72,153,0.2)",
    badge: "🇬🇧 UK Only",
    title: "UK Crypto CGT Calculator",
    desc: "Estimate your capital gains tax for 2024/25, 2023/24, and 2022/23. Instant results — no signup.",
    preview: { label: "Example output", value: "£1,248", sub: "Basic rate · £8,400 gain", color: "#ec4899" },
    cta: "Calculate my tax →",
    live: true,
  },
  {
    href: "/tools/staking-calculator",
    accent: "#0ea5e9",
    bg: "linear-gradient(135deg, #030f1a 0%, #0d0d1f 100%)",
    border: "rgba(14,165,233,0.2)",
    badge: "8 Assets",
    title: "Staking Rewards Calculator",
    desc: "Project staking returns for ETH, SOL, ADA, DOT and more. Toggle compound vs simple, add GBP price, see monthly growth.",
    preview: { label: "Example APY", value: "12.3%", sub: "SOL · 2 year compound", color: "#0ea5e9" },
    cta: "Calculate rewards →",
    live: true,
  },
  {
    href: "/tools/regret",
    accent: "#f59e0b",
    bg: "linear-gradient(135deg, #1a1000 0%, #0d0d1f 100%)",
    border: "rgba(245,158,11,0.15)",
    badge: "⏳ Coming Soon",
    title: "Regret Calculator",
    desc: "Enter an asset, amount, and date. See how much you'd have made at ATH, with perfect timing, vs what you actually did.",
    preview: { label: "Coming soon", value: "💸", sub: "How much did you leave behind?", color: "#f59e0b" },
    cta: "Coming soon",
    live: false,
  },
  {
    href: "/tools/bear-score",
    accent: "#6366f1",
    bg: "linear-gradient(135deg, #06060f 0%, #0d0d1f 100%)",
    border: "rgba(99,102,241,0.15)",
    badge: "🏔️ Coming Soon",
    title: "Bear Market Survival Score",
    desc: "Quiz: how well positioned is your portfolio for a prolonged downturn? Get a score and personalised action plan.",
    preview: { label: "Coming soon", value: "🏔️", sub: "Are you ready for the bottom?", color: "#6366f1" },
    cta: "Coming soon",
    live: false,
  },
];

function ToolPreview({ p }: { p: { label: string; value: string; sub: string; color: string } }) {
  return (
    <div style={{
      background: "rgba(0,0,0,0.3)", border: `1px solid ${p.color}20`,
      borderRadius: 12, padding: "14px 16px", marginBottom: 20,
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: p.value.length <= 4 ? "1.8rem" : "1.3rem",
        fontWeight: 700, color: p.color, flexShrink: 0, lineHeight: 1,
      }}>{p.value}</div>
      <div>
        <div style={{ fontFamily: "system-ui", fontSize: "0.7rem", color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{p.label}</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.8rem", color: "#64748b" }}>{p.sub}</div>
      </div>
    </div>
  );
}

function ToolsSection() {
  return (
    <section id="tools" style={{ background: "#08080f", padding: "80px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            display: "inline-block", background: "rgba(99,102,241,0.12)",
            border: "1px solid rgba(99,102,241,0.25)", borderRadius: 20,
            padding: "4px 14px", marginBottom: 16,
          }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#818cf8", letterSpacing: 1.5, textTransform: "uppercase" as const }}>
              Free Tools
            </span>
          </div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", color: "#fff", margin: "0 0 12px" }}>
            Free Crypto Tools
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", color: "#64748b", maxWidth: 420, margin: "0 auto" }}>
            No signup. No wallet connection. Just useful.
          </p>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
          {TOOLS_DATA.map((tool) => (
            <Reveal key={tool.href}>
              {tool.live ? (
                <a href={tool.href} style={{ display: "block", textDecoration: "none", height: "100%" }}>
                  <div style={{
                    background: tool.bg, border: `1px solid ${tool.border}`,
                    borderRadius: 16, padding: "24px 24px 20px",
                    transition: "border-color 0.2s, box-shadow 0.2s, transform 0.15s",
                    height: "100%", boxSizing: "border-box",
                  }}
                       onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = tool.accent; el.style.boxShadow = `0 8px 40px ${tool.accent}22`; el.style.transform = "translateY(-3px)"; }}
                       onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = tool.border; el.style.boxShadow = "none"; el.style.transform = "none"; }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <span style={{
                        background: `${tool.accent}18`, color: tool.accent,
                        borderRadius: 20, padding: "3px 10px",
                        fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", fontWeight: 700, letterSpacing: 0.5,
                      }}>{tool.badge}</span>
                    </div>
                    <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "1.05rem", color: "#fff", margin: "0 0 10px", lineHeight: 1.3 }}>{tool.title}</h3>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", color: "#64748b", lineHeight: 1.6, margin: "0 0 18px" }}>{tool.desc}</p>
                    <ToolPreview p={tool.preview} />
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.88rem", fontWeight: 700, color: tool.accent }}>
                      {tool.cta}
                    </span>
                  </div>
                </a>
              ) : (
                <div style={{
                  background: tool.bg, border: `1px solid ${tool.border}`,
                  borderRadius: 16, padding: "24px 24px 20px", opacity: 0.65,
                  height: "100%", boxSizing: "border-box",
                }}>
                  <div style={{ marginBottom: 16 }}>
                    <span style={{
                      background: `${tool.accent}15`, color: tool.accent,
                      borderRadius: 20, padding: "3px 10px",
                      fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", fontWeight: 700, letterSpacing: 0.5,
                    }}>{tool.badge}</span>
                  </div>
                  <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "1.05rem", color: "#fff", margin: "0 0 10px", lineHeight: 1.3 }}>{tool.title}</h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", color: "#64748b", lineHeight: 1.6, margin: "0 0 18px" }}>{tool.desc}</p>
                  <ToolPreview p={tool.preview} />
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.75rem", color: "#334155" }}>{tool.cta}</span>
                </div>
              )}
            </Reveal>
          ))}
        </div>

        <Reveal style={{ textAlign: "center", marginTop: 36 }}>
          <a href="/tools" style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "0.9rem",
            color: "#64748b", border: "1px solid rgba(255,255,255,0.1)",
            padding: "11px 28px", borderRadius: 50, textDecoration: "none",
            transition: "color 0.2s, border-color 0.2s",
          }}
             onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.color = "#fff"; el.style.borderColor = "rgba(255,255,255,0.3)"; }}
             onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.color = "#64748b"; el.style.borderColor = "rgba(255,255,255,0.1)"; }}>
            View all tools →
          </a>
        </Reveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PROJECT HUBS
════════════════════════════════════════════════════════════════════════ */
const PROJECT_HUBS = [
  {
    key: "aivm",
    label: "AIVM by ChainGPT",
    tagline: "Decentralised AI. No Big Tech Required.",
    desc: "ChainGPT's Layer-1 blockchain for open AI compute, verifiable agent execution, and tokenised data markets. Public testnet live — mainnet Q2/3 2026.",
    badge: "Featured Project",
    partnerLine: "Backed by Google · Nvidia · Alibaba Cloud · Binance",
    accent: "#00FEFC",
    accentTo: "#2DFFB9",
    bg: "#0B1320",
    url: "https://aivm.web3guides.com",
    guideCount: "6 guides",
    logoEl: (
      <svg viewBox="0 0 32 32" width="32" height="32" fill="none">
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
    ),
  },
  {
    key: "ink",
    label: "Ink by Kraken",
    tagline: "Kraken's L2. Built for DeFi.",
    desc: "Ink is Kraken's Ethereum Layer 2, built on the OP Stack. Backed by one of crypto's most trusted exchanges. Airdrop confirmed for Q3 2026.",
    badge: "Airdrop Confirmed",
    partnerLine: "Built by Kraken · OP Stack · EVM Compatible",
    accent: "#0066FF",
    accentTo: "#4d94ff",
    bg: "#00071a",
    url: "https://ink.web3guides.com",
    guideCount: "6 guides",
    logoEl: (
      <img src="/ink-logo.svg" alt="Ink" style={{ width: 32, height: 32, objectFit: "contain" }} />
    ),
  },
];

function ProjectHubs() {
  return (
    <section id="projects" style={{ background: "#0d0d1f", padding: "80px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            display: "inline-block", background: "rgba(167,139,250,0.1)",
            border: "1px solid rgba(167,139,250,0.25)", borderRadius: 20,
            padding: "4px 14px", marginBottom: 16,
          }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#a78bfa", letterSpacing: 1.5, textTransform: "uppercase" as const }}>
              Project Deep Dives
            </span>
          </div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", color: "#fff", margin: "0 0 12px" }}>
            Project Guide Hubs
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", color: "#64748b", maxWidth: 440, margin: "0 auto" }}>
            Comprehensive guide hubs for the protocols that matter.
          </p>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 20 }}>
          {PROJECT_HUBS.map((proj) => (
            <Reveal key={proj.key}>
              <a href={proj.url} style={{ display: "block", textDecoration: "none" }}>
                <div style={{
                  background: proj.bg, borderRadius: 20,
                  border: `1px solid ${proj.accent}22`,
                  padding: "32px 36px", position: "relative", overflow: "hidden",
                  transition: "border-color 0.2s, box-shadow 0.2s, transform 0.15s",
                }}
                     onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${proj.accent}55`; el.style.boxShadow = `0 8px 50px ${proj.accent}15`; el.style.transform = "translateY(-3px)"; }}
                     onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${proj.accent}22`; el.style.boxShadow = "none"; el.style.transform = "none"; }}>
                  <div style={{
                    position: "absolute", inset: 0,
                    backgroundImage: `radial-gradient(ellipse at 20% 50%, ${proj.accent}08 0%, transparent 60%)`,
                    pointerEvents: "none",
                  }} />
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                      <div style={{
                        width: 56, height: 56, borderRadius: 14, flexShrink: 0,
                        background: `${proj.accent}10`, border: `1px solid ${proj.accent}30`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {proj.logoEl}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{
                            background: `${proj.accent}18`, color: proj.accent,
                            borderRadius: 20, padding: "2px 10px",
                            fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", fontWeight: 700, letterSpacing: 0.5,
                          }}>{proj.badge}</span>
                          <span style={{
                            background: "rgba(255,255,255,0.05)", color: "#475569",
                            borderRadius: 20, padding: "2px 10px",
                            fontFamily: "'Space Mono', monospace", fontSize: "0.6rem",
                          }}>{proj.guideCount}</span>
                        </div>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "1.2rem", color: "#fff", lineHeight: 1.2 }}>
                          {proj.label}
                        </div>
                      </div>
                    </div>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 20 }}>
                      {proj.desc}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.6rem", color: "rgba(255,255,255,0.2)", letterSpacing: 0.5 }}>
                        {proj.partnerLine}
                      </span>
                      <span style={{
                        background: `linear-gradient(135deg, ${proj.accent}, ${proj.accentTo})`,
                        color: "#0B1320", padding: "8px 20px", borderRadius: 50,
                        fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "0.82rem",
                        whiteSpace: "nowrap" as const, flexShrink: 0, marginLeft: 12,
                      }}>
                        Explore →
                      </span>
                    </div>
                  </div>
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
   NEWSLETTER BANNER
════════════════════════════════════════════════════════════════════════ */
function NewsletterBanner() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || status === "loading") return;
    setStatus("loading");
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { error } = await supabase.from("email_signups").insert({ email });
      if (error) { setStatus("error"); return; }
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section id="newsletter" style={{
      background: "linear-gradient(135deg, #0a0515 0%, #0d0d1f 100%)",
      padding: "64px 24px",
      borderTop: "1px solid rgba(167,139,250,0.15)",
      borderBottom: "1px solid rgba(167,139,250,0.15)",
    }}>
      <Reveal style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.4rem" }}>📬</span>
          <span style={{ fontFamily: "'Bungee', cursive", fontSize: "1.6rem", color: "#fff" }}>Bear Market Briefing</span>
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", color: "#94a3b8", marginBottom: 28, lineHeight: 1.7 }}>
          One actionable crypto play per week. Tools, strategies, and airdrop alerts while everyone else is panicking.
          <br /><span style={{ color: "#64748b", fontSize: "0.88rem" }}>Free. No spam. Unsubscribe anytime.</span>
        </p>

        {status === "success" ? (
          <div style={{
            background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
            borderRadius: 12, padding: "16px 24px",
            fontFamily: "'DM Sans', sans-serif", fontSize: "0.95rem", color: "#10b981",
          }}>
            ✓ You&apos;re in. First issue coming your way soon.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: "0.95rem",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#fff", borderRadius: 50, padding: "13px 22px",
                outline: "none", minWidth: 240, flex: 1, maxWidth: 300,
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "rgba(167,139,250,0.5)")}
              onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
            />
            <button type="submit" disabled={status === "loading"} style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "0.95rem",
              color: "#fff", background: "linear-gradient(135deg, #a78bfa, #7c6aff)",
              border: "none", padding: "13px 28px", borderRadius: 50, cursor: "pointer",
              transition: "opacity 0.2s", opacity: status === "loading" ? 0.6 : 1,
            }}>
              {status === "loading" ? "Subscribing…" : "Subscribe Free →"}
            </button>
          </form>
        )}
        {status === "error" && (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", color: "#ef4444", marginTop: 10 }}>
            Something went wrong. Try again or email us directly.
          </p>
        )}
      </Reveal>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TOPICS SECTION
════════════════════════════════════════════════════════════════════════ */
const TOPIC_GROUPS = [
  {
    label: "Blockchains",
    keys: ["eth", "btc", "sol"],
  },
  {
    label: "Strategies",
    keys: ["defi", "staking", "layer2", "bridge"],
  },
  {
    label: "Protect & Comply",
    keys: ["security", "tax", "legal", "rwa"],
  },
  {
    label: "Get Started",
    keys: ["easy", "jobs"],
  },
];

function TopicsSection() {
  return (
    <section id="topics" style={{ background: "#0d0d1f", padding: "80px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            display: "inline-block", background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.2)", borderRadius: 20,
            padding: "4px 14px", marginBottom: 16,
          }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#6ee7b7", letterSpacing: 1.5, textTransform: "uppercase" as const }}>
              Knowledge Hubs
            </span>
          </div>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", color: "#fff", margin: "0 0 12px" }}>
            Explore by Topic
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", color: "#64748b", maxWidth: 400, margin: "0 auto" }}>
            20+ dedicated knowledge hubs. Pick one and go deep.
          </p>
        </Reveal>

        {TOPIC_GROUPS.map(({ label, keys }) => (
          <div key={label} style={{ marginBottom: 40 }}>
            <Reveal>
              <div style={{
                fontFamily: "'Space Mono', monospace", fontSize: "0.7rem",
                color: "#334155", letterSpacing: 2, textTransform: "uppercase" as const,
                marginBottom: 14, paddingLeft: 2,
              }}>
                {label}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                {keys.map((key) => {
                  const cfg = SUBDOMAINS[key as keyof typeof SUBDOMAINS];
                  if (!cfg) return null;
                  return (
                    <a key={key} href={subUrl(key)} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 16px", borderRadius: 12,
                      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                      textDecoration: "none", transition: "border-color 0.2s, background 0.2s, transform 0.15s",
                    }}
                       onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${cfg.accentHex}50`; el.style.background = `${cfg.accentHex}08`; el.style.transform = "translateY(-2px)"; }}
                       onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(255,255,255,0.05)"; el.style.background = "rgba(255,255,255,0.02)"; el.style.transform = "none"; }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: `${cfg.accentHex}15`, border: `1px solid ${cfg.accentHex}30`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {(cfg as { logoUrl?: string }).logoUrl
                          ? <img src={(cfg as { logoUrl?: string }).logoUrl} alt={cfg.label} style={{ width: 16, height: 16, objectFit: "contain" }} />
                          : <SubdomainIcon sdKey={key} color={cfg.accentHex} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "0.88rem", color: "#e2e8f0", marginBottom: 2 }}>{cfg.label}</div>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.75rem", color: "#475569", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {cfg.description}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </Reveal>
          </div>
        ))}

        <Reveal style={{ textAlign: "center", marginTop: 8 }}>
          <a href="/search" style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: "0.88rem", color: "#475569",
            textDecoration: "none", transition: "color 0.2s",
          }}
             onMouseOver={e => (e.currentTarget.style.color = "#94a3b8")}
             onMouseOut={e => (e.currentTarget.style.color = "#475569")}>
            + More topics available — search all guides →
          </a>
        </Reveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   DIFFICULTY PATHS
════════════════════════════════════════════════════════════════════════ */
function DifficultyPaths() {
  return (
    <section style={{ background: "#080810", padding: "60px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(1.4rem, 3vw, 2rem)", color: "#fff", margin: "0 0 8px" }}>
            Start at Your Level
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#475569" }}>
            Pick a track and dive in — no account needed.
          </p>
        </Reveal>

        <Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {[
              { emoji: "🌱", label: "Beginner", desc: "New to crypto? Plain-English explainers, no jargon.", href: subUrl("easy"), accent: "#10b981" },
              { emoji: "⚡", label: "Intermediate", desc: "Core concepts, DeFi mechanics, and how protocols work.", href: "/medium", accent: "#f59e0b" },
              { emoji: "🔮", label: "Advanced", desc: "Deep dives: protocol internals, ZK proofs, MEV, and more.", href: "/advanced", accent: "#6366f1" },
            ].map(({ emoji, label, desc, href, accent }) => (
              <a key={label} href={href} style={{
                display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
                padding: "28px 20px", borderRadius: 16,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                textDecoration: "none", transition: "border-color 0.2s, box-shadow 0.2s, transform 0.15s",
              }}
                 onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${accent}50`; el.style.boxShadow = `0 8px 30px ${accent}15`; el.style.transform = "translateY(-3px)"; }}
                 onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(255,255,255,0.06)"; el.style.boxShadow = "none"; el.style.transform = "none"; }}>
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>{emoji}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "1rem", color: "#fff", marginBottom: 8 }}>{label}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.82rem", color: "#475569", lineHeight: 1.5 }}>{desc}</div>
              </a>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   DOMA CTA
════════════════════════════════════════════════════════════════════════ */
function DomaCTA() {
  return (
    <section style={{
      background: "linear-gradient(135deg, #0f0c29 0%, #1a1040 50%, #0f0c29 100%)",
      padding: "72px 24px",
      borderBottom: "1px solid rgba(124,106,255,0.15)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "linear-gradient(rgba(124,106,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,106,255,0.04) 1px, transparent 1px)",
        backgroundSize: "48px 48px", pointerEvents: "none",
      }} />
      <Reveal style={{ maxWidth: 640, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(124,106,255,0.15)", border: "1px solid rgba(124,106,255,0.3)",
          borderRadius: 20, padding: "5px 14px", marginBottom: 20,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c6aff", display: "inline-block" }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.72rem", color: "#7c6aff", letterSpacing: 1 }}>
            Powered by Doma Protocol
          </span>
        </div>

        <h2 style={{ fontFamily: "'Bungee', cursive", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", color: "#fff", marginBottom: 16 }}>
          Build Your Own Crypto Education Hub
        </h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: 32, maxWidth: 480, margin: "0 auto 32px" }}>
          Claim a <strong style={{ color: "#fff" }}>yours.web3guides.com</strong> subdomain — powered by Doma Protocol.
          On-chain ownership. Keep 100% of your revenue.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <a href={DOMA_REGISTER} target="_blank" rel="noopener noreferrer" style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "0.95rem",
            color: "#fff", background: "linear-gradient(135deg, #7c6aff, #3b9eff)",
            padding: "13px 28px", borderRadius: 50, textDecoration: "none",
            boxShadow: "0 8px 30px rgba(124,106,255,0.35)", transition: "transform 0.2s, box-shadow 0.2s",
          }}
             onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 14px 40px rgba(124,106,255,0.5)"; }}
             onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "none"; el.style.boxShadow = "0 8px 30px rgba(124,106,255,0.35)"; }}>
            Claim Your Subdomain →
          </a>
          <a href={DOMA_HOME} target="_blank" rel="noopener noreferrer" style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "0.95rem",
            color: "#7c6aff", background: "transparent", border: "1px solid rgba(124,106,255,0.3)",
            padding: "13px 28px", borderRadius: 50, textDecoration: "none", transition: "border-color 0.2s, color 0.2s",
          }}
             onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(124,106,255,0.7)"; el.style.color = "#a78bfa"; }}
             onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(124,106,255,0.3)"; el.style.color = "#7c6aff"; }}>
            Learn about Doma →
          </a>
        </div>
      </Reveal>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FOOTER
════════════════════════════════════════════════════════════════════════ */
const FOOTER_COLS = [
  {
    head: "Tools",
    links: [
      { label: "Bear Market Time Machine", href: "/tools/dca" },
      { label: "Airdrop Checker", href: "/tools/airdrop-checker" },
      { label: "Wallet Security Scorer", href: "/tools/security-score" },
      { label: "UK CGT Calculator", href: "/tools/tax-calculator" },
      { label: "Staking Calculator", href: "/tools/staking-calculator" },
    ],
  },
  {
    head: "Topics",
    links: [
      { label: "Ethereum", href: subUrl("eth") },
      { label: "Bitcoin", href: subUrl("btc") },
      { label: "DeFi", href: subUrl("defi") },
      { label: "Security", href: subUrl("security") },
      { label: "Crypto Tax (UK)", href: subUrl("tax") },
    ],
  },
  {
    head: "Projects",
    links: [
      { label: "AIVM / ChainGPT", href: "https://aivm.web3guides.com" },
      { label: "Ink / Kraken L2", href: "https://ink.web3guides.com" },
      { label: "Doma Protocol", href: subUrl("doma") },
    ],
  },
  {
    head: "Platform",
    links: [
      { label: "About", href: "/about" },
      { label: "All Tools", href: "/tools" },
      { label: "Get a Subdomain", href: DOMA_REGISTER },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Disclaimer", href: "/disclaimer" },
    ],
  },
];

function Footer() {
  return (
    <footer style={{ background: "#050508", padding: "56px 24px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr repeat(4, 1fr)", gap: 40, marginBottom: 48, flexWrap: "wrap" as const }}>

          {/* Brand col */}
          <div>
            <div style={{ fontFamily: "'Bungee', cursive", fontSize: "1.4rem", background: "linear-gradient(135deg, #ff6b35, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 12 }}>
              Web3 Guides
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", color: "#475569", lineHeight: 1.6, maxWidth: 240, marginBottom: 20 }}>
              Free crypto tools, guides, and bear market strategies. No signup. No BS.
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(124,106,255,0.1)", border: "1px solid rgba(124,106,255,0.2)", borderRadius: 50, padding: "5px 12px" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#7c6aff", display: "inline-block" }} />
              <a href={DOMA_HOME} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.65rem", color: "#7c6aff", textDecoration: "none", letterSpacing: 1 }}>
                Powered by Doma Protocol
              </a>
            </div>
          </div>

          {FOOTER_COLS.map(({ head, links }) => (
            <div key={head}>
              <h4 style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.68rem", letterSpacing: 2, color: "#334155", textTransform: "uppercase" as const, marginBottom: 16 }}>{head}</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
                       style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.83rem", color: "#475569", textDecoration: "none", transition: "color 0.2s" }}
                       onMouseOver={e => (e.currentTarget.style.color = "#94a3b8")}
                       onMouseOut={e => (e.currentTarget.style.color = "#475569")}>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "24px 0 32px" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.75rem", color: "#1e293b", lineHeight: 1.6, marginBottom: 12 }}>
            ⚠️ <strong style={{ color: "#334155" }}>Not financial advice.</strong> All content on Web3 Guides is for educational purposes only. Nothing here constitutes financial, investment, legal, or tax advice. Crypto assets are highly volatile. Always do your own research and consult a qualified professional. This page contains affiliate links — we may earn a commission at no extra cost to you. Don&apos;t invest unless you&apos;re prepared to lose all the money you invest.
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", color: "#1e293b" }}>
              © 2026 Web3 Guides · Free crypto education
            </p>
            <a href={DOMA_HOME} target="_blank" rel="noopener noreferrer"
               style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#1e293b", textDecoration: "none", letterSpacing: 1, transition: "color 0.2s" }}
               onMouseOver={e => (e.currentTarget.style.color = "#7c6aff")}
               onMouseOut={e => (e.currentTarget.style.color = "#1e293b")}>
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
    <div style={{ background: "#080810", minHeight: "100vh" }}>
      <Nav />
      <Hero />
      <ToolsSection />
      <ProjectHubs />
      <NewsletterBanner />
      <TopicsSection />
      <DifficultyPaths />
      <DomaCTA />
      <Footer />
    </div>
  );
}
