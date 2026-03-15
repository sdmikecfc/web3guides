"use client";

import Link from "next/link";
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

  function subdomainHref(key: string) {
    if (isDev) return `http://${key}.${devRoot}`;
    return `https://${key}.${rootDomain}`;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[#1e1e2e] bg-[#0a0a0f]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left — brand + subdomain */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="shrink-0 font-display text-sm font-bold text-white"
          >
            W3G
          </Link>
          <span className="hidden text-[#2a2a3e] sm:block">/</span>
          <div className="hidden items-center gap-2 sm:flex">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-sm"
              style={{ background: subdomain.glowHex }}
            >
              {subdomain.emoji}
            </span>
            <span
              className="font-display text-sm font-semibold"
              style={{ color: subdomain.accentHex }}
            >
              {subdomain.label}
            </span>
          </div>
        </div>

        {/* Right — nav actions */}
        <nav className="flex items-center gap-2">
          {/* Desktop subdomain switcher */}
          <div className="relative hidden lg:block">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-[#1e1e2e] bg-[#12121a] px-3 py-1.5 text-xs font-mono text-[#6b6b8a] transition hover:border-[var(--subdomain-accent)] hover:text-[var(--subdomain-accent)]"
            >
              Switch topic
              <span
                className={`inline-block transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
              >
                ▾
              </span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-[#1e1e2e] bg-[#12121a] p-2 shadow-2xl">
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
                          : "text-[#6b6b8a] hover:bg-[#1a1a26] hover:text-white"
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

          {/* All guides link */}
          <a
            href={`https://${rootDomain}`}
            className="hidden rounded-lg border border-[#1e1e2e] bg-[#12121a] px-3 py-1.5 text-xs font-mono text-[#6b6b8a] transition hover:border-[var(--subdomain-accent)] hover:text-[var(--subdomain-accent)] sm:block"
          >
            All topics
          </a>
        </nav>
      </div>

      {/* Accent underline */}
      <div
        className="h-[2px] w-full"
        style={{
          background: `linear-gradient(to right, ${subdomain.accentHex}60, transparent 60%)`,
        }}
      />
    </header>
  );
}
