/**
 * The persistent Battle Bots nav: a FIXED, translucent 52px top bar rendered
 * by the /bots root layout, so it is on EVERY page without touching any
 * page's own layout (the S7TopNav shape, src/app/s7/_components/S7TopNav.tsx).
 *
 * Desktop: wordmark left, five nav words centred, the coin chip and the
 * wallet-name chip right. Phone: the wordmark and the coin chip up top, and a
 * 64px bottom dock with the five entries as DockButtons (screens doc 1 and
 * 2.2). Build is its own entry and is also a sub-route of Garage, so the
 * active match is longest-prefix: /bots/garage/build lights Build, not
 * Garage.
 *
 * Week 1: coins and the wallet name come from the fixture. When the enlist
 * route lands they come from the play session; nothing else here changes.
 */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FONT_BODY, FONT_DISPLAY, M } from "../_ui/tokens";
import { CoinChip, DockButton, NameChip } from "../_ui/primitives";
import { IconGarage, IconPegboard, IconStar, IconWeapon, IconWrench } from "../_ui/icons";
import { STRINGS } from "@/lib/bots/strings";
import { ME } from "@/lib/bots/fixtures";
import css from "../_ui/ui.module.css";

export const BOTS_NAV_HEIGHT = 52;

export function BotsTopNav() {
  const path = usePathname() || "";
  const router = useRouter();
  const t = STRINGS.en.nav;

  const nav = [
    { t: t.garage, href: "/bots/garage", icon: <IconGarage size={22} /> },
    { t: t.build, href: "/bots/garage/build", icon: <IconWrench size={22} /> },
    { t: t.shop, href: "/bots/shop", icon: <IconPegboard size={22} /> },
    { t: t.battles, href: "/bots/battles", icon: <IconWeapon size={22} /> },
    { t: t.board, href: "/bots/board", icon: <IconStar size={22} /> },
  ];
  // longest matching prefix wins, so Build (under Garage) lights only itself
  const activeHref = nav
    .filter((n) => path === n.href || path.startsWith(n.href + "/") || path.startsWith(n.href + "?"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          height: BOTS_NAV_HEIGHT,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px",
          background: "rgba(8,11,20,0.86)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: `1px solid ${M.border}`,
        }}
      >
        <Link
          href="/bots"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.28em",
            color: M.text,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {t.wordmark}
        </Link>
        <nav
          aria-label={t.aria}
          className={css.navWords}
          style={{ flex: 1, justifyContent: "center", gap: 4 }}
        >
          {nav.map(({ t: label, href }) => {
            const active = href === activeHref;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? M.text : M.muted,
                  textDecoration: "none",
                  padding: "8px 12px 6px",
                  borderBottom: `2px solid ${active ? M.accent : "transparent"}`,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <CoinChip coins={ME.coins} ariaLabel={t.coinsAria} />
          <span className={css.navWords}>
            <NameChip ariaLabel={t.walletAria}>{ME.walletName}</NameChip>
          </span>
        </div>
      </header>

      {/* the phone dock: 64px, five entries, icon over label, 44px targets */}
      <nav
        aria-label={t.aria}
        className={css.dock}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          height: 64,
          alignItems: "center",
          justifyContent: "space-around",
          padding: "0 4px env(safe-area-inset-bottom, 0px)",
          background: "rgba(8,11,20,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderTop: `1px solid ${M.border}`,
        }}
      >
        {nav.map(({ t: label, href, icon }) => (
          <DockButton
            key={href}
            icon={icon}
            label={label}
            active={href === activeHref}
            onClick={() => router.push(href)}
          />
        ))}
      </nav>
    </>
  );
}
