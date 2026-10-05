/**
 * The persistent Season 5 nav: a FIXED, translucent top bar rendered by the /s5
 * root layout, so it is on EVERY page without touching any page's own layout
 * (fixed = out of flow, cannot break the full-screen games or the HQ scene).
 * Right side = the language switcher + the ONE global wallet Connect
 * (RainbowKit); connect once here and every game/page sees it (S4-proven
 * single-provider pattern). Labels come from the s5 dict; the locale is read
 * from the cookie AFTER mount so hydration matches the server's English render.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { STRINGS, type S5Dict } from "@/lib/s5/strings";
import { clientLocale } from "@/lib/s5/locale";
import { LanguageSwitcher } from "./LanguageSwitcher";

const STEEL = "#9aa7b4";
export const S5_NAV_HEIGHT = 52;

export function S5TopNav() {
  const path = usePathname() || "";
  const [dict, setDict] = useState<S5Dict>(STRINGS.en);
  useEffect(() => {
    const loc = clientLocale();
    if (loc !== "en") setDict(STRINGS[loc]);
    // A11Y BLOCKER FIX (2026-07-27 audit): the root layout is shared with the
    // whole site and hardcodes lang="en", so ko/zh players had every string
    // read out by an English speech synthesizer (SC 3.1.1). The S5 nav mounts
    // on every /s5 route, so syncing here covers the season. Restores "en" on
    // unmount so leaving S5 cannot leave the document mislabelled.
    try {
      const prev = document.documentElement.lang;
      document.documentElement.lang = loc;
      return () => {
        document.documentElement.lang = prev || "en";
      };
    } catch {
      return undefined; // never break the nav over an attribute
    }
  }, []);

  const nav = [
    { t: dict.nav.hq, href: "/s5" },
    // Round-2 onboarding: HOW TO PLAY lives in the top nav so the guide is
    // never buried (Mike, 2026-07-25). Second slot: right where a lost new
    // player looks first.
    { t: dict.nav.howToPlay, href: "/s5/how-to-play" },
    // NO MAP TAB. /s5 IS the map now (Mike, 2026-07-29: "if this is our main
    // map, we do not need the map button at the top"). A tab that takes you
    // to the board you are already standing on is a tab that teaches players
    // the nav is decorative. The old /s5/map route still resolves for links
    // already in the wild; it just stopped advertising itself.
    { t: dict.nav.arcade, href: "/s5/play" },
    { t: dict.nav.board, href: "/s5/board" },
    { t: dict.nav.rules, href: "/s5/rules" },
  ];

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        height: S5_NAV_HEIGHT,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 10px",
        background: "rgba(11,13,16,0.84)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: "1px solid #232a32",
      }}
    >
      <nav
        aria-label={dict.common.navAria}
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          flex: 1,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          // The scrollbar is hidden, so on a phone the last nav items were
          // silently off-screen with no affordance (2026-07-27 audit). A
          // right-edge fade says "there is more this way".
          maskImage: "linear-gradient(90deg, #000 calc(100% - 24px), transparent)",
          WebkitMaskImage: "linear-gradient(90deg, #000 calc(100% - 24px), transparent)",
        }}
      >
        {nav.map(({ t, href }) => {
          const active = href === "/s5" ? path === "/s5" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11.5,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                textDecoration: "none",
                fontWeight: active ? 700 : 400,
                color: active ? "#0b0d10" : "#aab4bd",
                padding: "8px 13px",
                borderRadius: 7,
                border: `1px solid ${active ? STEEL : "#ffffff14"}`,
                background: active ? STEEL : "#ffffff08",
              }}
            >
              {/* HQ is HOME on every page: the house glyph makes that readable
                  at a glance in en/ko/zh alike, without another string. */}
              {href === "/s5" ? (
                <span aria-hidden style={{ marginRight: 5, fontSize: 12.5 }}>
                  ⌂
                </span>
              ) : null}
              {t}
            </Link>
          );
        })}
      </nav>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <LanguageSwitcher ariaLabel={dict.common.langAria} />
        <ConnectButton showBalance={false} accountStatus="avatar" chainStatus="none" label={dict.common.connect} />
      </div>
    </header>
  );
}
