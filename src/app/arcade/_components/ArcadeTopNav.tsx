/**
 * The arcade's fixed top bar: wordmark home link, language chips, wallet.
 *
 * 52px tall on purpose: every season game shell pads its own <main> by 84px to
 * clear a fixed nav of exactly that height, so the mounted games sit right
 * without touching them.
 *
 * The home link is "/arcade" on every host. launchwars.xyz passes the /arcade
 * prefix through untouched (src/middleware.ts), so it resolves there and on
 * web3guides.com alike, and the browser path always starts with /arcade inside
 * a game, which is what lib/arcade/mode keys on.
 *
 * Locale: the labels are read from the s7_lang cookie AFTER mount (the S4
 * proven pattern), so the server render and the first client render are both
 * English and hydration never mismatches.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { LanguageSwitcher } from "@/app/s7/_components/LanguageSwitcher";
import { clientLocale, type Locale } from "@/lib/s7/locale";
import { arcadeDict } from "@/lib/arcade/strings";

export const ARCADE_NAV_HEIGHT = 52;

// At phone width the bar holds a wordmark, three language chips and the wallet
// button. Inline styles cannot express a breakpoint, so the two text spans get
// class names: under 560px the "Arcade" tag goes and the wordmark tightens,
// which is what keeps "LAUNCH WARS" whole at 375px.
const NAV_CSS = `
.arc-nav-word{font-size:14px;letter-spacing:0.14em;}
@media (max-width: 560px){
  .arc-nav-word{font-size:12px;letter-spacing:0.06em;}
  .arc-nav-sub{display:none;}
}
`;

export function ArcadeTopNav() {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    setLocale(clientLocale());
  }, []);
  const d = arcadeDict(locale);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        height: ARCADE_NAV_HEIGHT,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        background: "rgba(11,13,16,0.84)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: "1px solid #232a32",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: NAV_CSS }} />
      <nav aria-label={d.navAria} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
        <Link
          href="/arcade"
          style={{
            display: "inline-flex",
            alignItems: "baseline",
            gap: 8,
            textDecoration: "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span className="arc-nav-word" style={{ fontWeight: 800, color: "#e9edf1" }}>
            LAUNCH WARS
          </span>
          <span
            className="arc-nav-sub"
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#e0662e",
              fontWeight: 700,
            }}
          >
            {d.navHome}
          </span>
        </Link>
      </nav>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <LanguageSwitcher ariaLabel={d.langAria} />
        <ConnectButton showBalance={false} accountStatus="avatar" chainStatus="none" label={d.navConnect} />
      </div>
    </header>
  );
}
