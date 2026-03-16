"use client";

import { useState } from "react";
import type { SubdomainConfig } from "@/types";
import { SUBDOMAINS, VALID_SUBDOMAINS } from "@/lib/subdomains";

interface Props {
  subdomain: SubdomainConfig;
}

export default function SubdomainHeader({ subdomain }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const rootDomain =
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";
  const isDev = process.env.NODE_ENV === "development";
  const devRoot =
    process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ?? "localhost:3000";

  // Absolute URL to apex — fixes logo linking to itself on subdomains
  const apexHref = isDev ? `http://${devRoot}` : `https://${rootDomain}`;

  function subdomainHref(key: string) {
    if (isDev) return `http://${key}.${devRoot}`;
    return `https://${key}.${rootDomain}`;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[#243040] bg-[#0d1117]/92 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left — brand + subdomain */}
        <div className="flex items-center gap-3 min-w-0">
          {/* W3G logo — absolute URL to apex domain (not relative "/" which points to self) */}
          <a
            href={apexHref}
            className="shrink-0 transition-opacity hover:opacity-80"
            style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: "18px",
              letterSpacing: "0.1em",
              color: "#00F5D4",
              textDecoration: "none",
            }}
          >
            W3G
          </a>
          <span className="hidden text-[#384860] sm:block">/</span>
          <div className="hidden items-center gap-2 sm:flex">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-sm"
              style={{ background: subdomain.glowHex }}
            >
              {subdomain.emoji}
            </span>
            <span
              style={{
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: "14px",
                letterSpacing: "0.06em",
                color: subdomain.accentHex,
              }}
            >
              {subdomain.label}
            </span>
          </div>
        </div>

        {/* Right — nav actions */}
        <nav className="flex items-center gap-2">
          {/* Doma Protocol — buy this domain */}
          <a
            href="https://app.doma.xyz/domain/web3guides.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono transition sm:flex"
            style={{
              borderColor: "rgba(245,166,35,0.35)",
              color: "#F5A623",
              background: "rgba(245,166,35,0.06)",
              textDecoration: "none",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.background = "rgba(245,166,35,0.12)";
              el.style.borderColor = "rgba(245,166,35,0.6)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.background = "rgba(245,166,35,0.06)";
              el.style.borderColor = "rgba(245,166,35,0.35)";
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M12 2 L22 12 L12 22 L2 12 Z" stroke="#F5A623" strokeWidth="1.5" fill="none" />
              <circle cx="12" cy="12" r="2" fill="#F5A623" opacity="0.8" />
            </svg>
            Own this domain
          </a>

          {/* Desktop subdomain switcher */}
          <div className="relative hidden lg:block">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-[#243040] bg-[#0d1117] px-3 py-1.5 text-xs font-mono text-[#8a9ab8] transition hover:border-[var(--subdomain-accent)] hover:text-[var(--subdomain-accent)]"
            >
              Switch topic
              <span
                className={`inline-block transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
              >
                ▾
              </span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-[#243040] bg-[#0d1117] p-2 shadow-2xl">
                {VALID_SUBDOMAINS.map((key) => {
                  const cfg = SUBDOMAINS[key];
                  const active = key === subdomain.key;
                  return (
                    <a
                      key={key}
                      href={subdomainHref(key)}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                        active
                          ? "font-medium text-white"
                          : "text-[#8a9ab8] hover:bg-[#131a21] hover:text-white"
                      }`}
                    >
                      <span>{cfg.emoji}</span>
                      <span className="flex-1">{cfg.label}</span>
                      {active && (
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: cfg.accentHex }}
                        />
                      )}
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* All topics link */}
          <a
            href={apexHref}
            className="hidden rounded-lg border border-[#243040] bg-[#0d1117] px-3 py-1.5 text-xs font-mono text-[#8a9ab8] transition hover:border-[var(--subdomain-accent)] hover:text-[var(--subdomain-accent)] sm:block"
          >
            All topics
          </a>
        </nav>
      </div>

      {/* Accent underline — brighter gradient */}
      <div
        className="h-[2px] w-full"
        style={{
          background: `linear-gradient(to right, ${subdomain.accentHex}70, transparent 60%)`,
        }}
      />
    </header>
  );
}
