"use client";

import Link from "next/link";
import { useState } from "react";
import type { SubdomainConfig } from "@/types";
import { SUBDOMAINS, VALID_SUBDOMAINS } from "@/lib/subdomains";

interface Props { subdomain: SubdomainConfig; }

export default function SubdomainHeader({ subdomain }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";
  const isDev = process.env.NODE_ENV === "development";
  const devRoot = process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ?? "localhost:3000";

  function subdomainHref(key: string) {
    if (isDev) return `http://${key}.${devRoot}`;
    return `https://${key}.${rootDomain}`;
  }

  const homeHref = isDev ? `http://${devRoot}` : `https://${rootDomain}`;

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #e5e7eb" }}>
      <div style={{ margin: "0 auto", maxWidth: 1280, display: "flex", height: 56, alignItems: "center", justifyContent: "space-between", gap: 16, padding: "0 24px" }}>

        {/* Left — brand + subdomain */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <a
            href={homeHref}
            style={{ fontFamily: "'Bungee', cursive", fontSize: "1.1rem", fontWeight: 400, background: "linear-gradient(135deg, #ff6b35, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textDecoration: "none", flexShrink: 0 }}
          >
            W3G
          </a>
          <span style={{ color: "#d1d5db" }}>/</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{ display: "flex", height: 28, width: 28, alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: "0.95rem", background: `${subdomain.accentHex}15`, border: `1px solid ${subdomain.accentHex}30` }}
            >
              {subdomain.emoji}
            </span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", fontWeight: 700, color: subdomain.accentHex }}>
              {subdomain.label}
            </span>
          </div>
        </div>

        {/* Right — nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Topic switcher dropdown */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb", padding: "6px 12px", fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#6b7280", cursor: "pointer" }}
            >
              Switch topic
              <span style={{ display: "inline-block", transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
            </button>

            {menuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setMenuOpen(false)} />
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 20, width: 220, borderRadius: 16, background: "#fff", border: "1px solid #e5e7eb", boxShadow: "0 20px 40px rgba(0,0,0,0.12)", padding: 8 }}>
                  {VALID_SUBDOMAINS.map((key) => {
                    const cfg = SUBDOMAINS[key];
                    const active = key === subdomain.key;
                    return (
                      <a
                        key={key}
                        href={subdomainHref(key)}
                        onClick={() => setMenuOpen(false)}
                        style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 8, padding: "8px 12px", textDecoration: "none", fontFamily: "'DM Sans', sans-serif", fontSize: "0.85rem", fontWeight: active ? 700 : 400, color: active ? cfg.accentHex : "#374151", background: active ? `${cfg.accentHex}10` : "transparent", transition: "background 0.15s" }}
                      >
                        <span>{cfg.emoji}</span>
                        <span style={{ flex: 1 }}>{cfg.label}</span>
                        {active && (
                          <span style={{ height: 6, width: 6, borderRadius: "50%", background: cfg.accentHex, flexShrink: 0 }} />
                        )}
                      </a>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <a
            href={homeHref}
            style={{ borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb", padding: "6px 12px", fontFamily: "'Space Mono', monospace", fontSize: "0.7rem", color: "#6b7280", textDecoration: "none" }}
          >
            All topics
          </a>
        </nav>
      </div>

      {/* Accent underline */}
      <div
        style={{
          height: 2,
          background: `linear-gradient(to right, ${subdomain.accentHex}80, ${subdomain.accentHex}20 50%, transparent)`,
        }}
      />
    </header>
  );
}
