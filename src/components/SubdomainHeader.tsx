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

  return (
    <header className="sticky top-0 z-50 glass-bright border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">

        {/* Left — brand + subdomain */}
        <div className="flex items-center gap-3 min-w-0">
          <a
            href={isDev ? `http://${devRoot}` : `https://${rootDomain}`}
            className="shrink-0 font-display text-sm font-bold text-white/80 hover:text-white transition-colors"
          >
            W3G
          </a>
          <span className="hidden text-white/20 sm:block">/</span>
          <div className="hidden items-center gap-2 sm:flex">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-sm"
              style={{ background: subdomain.glowHex, border: `1px solid ${subdomain.accentHex}30` }}
            >
              {subdomain.emoji}
            </span>
            <span className="font-display text-sm font-semibold" style={{ color: subdomain.accentHex }}>
              {subdomain.label}
            </span>
          </div>
        </div>

        {/* Right — nav */}
        <nav className="flex items-center gap-2">
          {/* Topic switcher dropdown */}
          <div className="relative hidden lg:block">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg glass px-3 py-1.5 text-xs font-mono transition-colors hover:text-white"
              style={{ color: "var(--color-muted,#6272a0)" }}
            >
              Switch topic
              <span className={`inline-block transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}>▾</span>
            </button>

            {menuOpen && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl glass-bright p-2 shadow-2xl"
                     style={{ boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)` }}>
                  {VALID_SUBDOMAINS.map((key) => {
                    const cfg = SUBDOMAINS[key];
                    const active = key === subdomain.key;
                    return (
                      <a
                        key={key}
                        href={subdomainHref(key)}
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                          active ? "font-medium text-white" : "hover:bg-white/5 hover:text-white"
                        }`}
                        style={{ color: active ? cfg.accentHex : undefined }}
                      >
                        <span>{cfg.emoji}</span>
                        <span className="flex-1">{cfg.label}</span>
                        {active && (
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.accentHex }} />
                        )}
                      </a>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <a
            href={isDev ? `http://${devRoot}` : `https://${rootDomain}`}
            className="hidden rounded-lg glass px-3 py-1.5 text-xs font-mono transition-colors hover:text-white sm:block"
            style={{ color: "var(--color-muted,#6272a0)" }}
          >
            All topics
          </a>
        </nav>
      </div>

      {/* Accent underline */}
      <div
        className="h-px w-full"
        style={{
          background: `linear-gradient(to right, ${subdomain.accentHex}60, ${subdomain.accentHex}20 40%, transparent)`,
        }}
      />
    </header>
  );
}
