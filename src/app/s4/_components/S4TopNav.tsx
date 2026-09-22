/**
 * The persistent Season 4 nav (Mike 2026-07-15: "nav bar across all pages that
 * has every place you might need to go. No hunting"). A FIXED, translucent top
 * bar rendered by the /s4 root layout, so it is on EVERY page — landing, map,
 * board, agent, arcade, games, rules — without touching any page's own layout
 * (fixed = out of flow, cannot break the full-screen games or the map).
 *
 * Right side = the ONE global wallet Connect (RainbowKit). Connect once here and
 * every game/page sees it; the games then only need the play-session signature.
 *
 * TELEGRAM (Phase 2, ADR-0030): inside the Mini App the Connect button is HIDDEN.
 * Strategy B means no EVM wallet ever appears in Telegram: the wallet is bound
 * once out on the web, and in here the play session comes from initData instead
 * (see TelegramProvider + useS4Session). The tabs stay; only the wallet goes.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTelegram } from "./TelegramProvider";

const NAV = [
  { t: "Case File", href: "/s4" },
  { t: "Map", href: "/s4/map" },
  { t: "Character", href: "/s4/me" },
  { t: "Profile", href: "/s4/profile" },
  { t: "Payout", href: "/s4/payout" },
  { t: "Arcade", href: "/s4/play" },
];

export const S4_NAV_HEIGHT = 52;

export function S4TopNav() {
  const path = usePathname() || "";
  const { isTelegram } = useTelegram();
  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        height: S4_NAV_HEIGHT,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 10px",
        background: "rgba(7,10,18,0.82)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: "1px solid #1c2236",
      }}
    >
      <nav
        aria-label="Season sections"
        style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {NAV.map(({ t, href }) => {
          const active = href === "/s4" ? path === "/s4" : path.startsWith(href);
          return (
            <Link
              key={t}
              href={href}
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11.5,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                textDecoration: "none",
                fontWeight: active ? 700 : 400,
                color: active ? "#1a1205" : "#aeb6c8",
                padding: "8px 13px",
                borderRadius: 7,
                border: `1px solid ${active ? "#f0b340" : "#ffffff14"}`,
                background: active ? "#f0b340" : "#ffffff08",
              }}
            >
              {t}
            </Link>
          );
        })}
      </nav>
      {!isTelegram && (
        <div style={{ flexShrink: 0 }}>
          <ConnectButton showBalance={false} accountStatus="avatar" chainStatus="none" label="Connect" />
        </div>
      )}
    </header>
  );
}
