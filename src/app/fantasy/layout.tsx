import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Doma Fantasy League",
  description: "Build a 10-domain portfolio from the live Doma fractional-token market. Win on growth.",
};

export default function FantasyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Animated background — same chassis as the rest of web3guides */}
      <div className="bg-canvas" />
      <div className="bg-orb" />
      <div className="bg-stars" />
      <div className="bg-grid" />
      <div className="bg-vignette" />

      <div className="page-content">
        <FantasyNav />
        <main className="min-h-screen pb-24">{children}</main>
      </div>
    </>
  );
}

function FantasyNav() {
  return (
    <nav className="sticky top-0 z-30 border-b border-border/60 backdrop-blur-xl"
         style={{ background: "rgba(7,9,15,0.65)" }}>
      <div className="mx-auto flex max-w-[1380px] items-center justify-between px-6 py-3.5">
        <Link href="/fantasy" className="flex items-center gap-2.5 group">
          <DomaMark />
          <span className="font-display text-[15px] tracking-tight">
            <span className="text-text/90">Doma</span>
            <span className="ml-1.5 text-muted/80 font-normal">Fantasy League</span>
          </span>
        </Link>

        <div className="flex items-center gap-1 text-[13px]">
          <NavLink href="/fantasy/draft" label="Draft" />
          <NavLink href="/fantasy/me" label="My team" />
          <NavLink href="/fantasy/leaderboard" label="Leaderboard" />
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-muted hover:text-text transition-colors"
    >
      {label}
    </Link>
  );
}

function DomaMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="doma-mark-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c6aff" />
          <stop offset="100%" stopColor="#4f3cc9" />
        </linearGradient>
      </defs>
      <path
        d="M16 3 L28 10 V22 L16 29 L4 22 V10 Z"
        fill="url(#doma-mark-gradient)"
        opacity="0.9"
      />
      <path
        d="M16 3 L28 10 V22 L16 29 L4 22 V10 Z"
        stroke="rgba(255,255,255,0.20)"
        strokeWidth="1"
        fill="none"
      />
      <circle cx="16" cy="16" r="3.5" fill="#0d1120" />
    </svg>
  );
}
