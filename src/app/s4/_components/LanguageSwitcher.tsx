/**
 * Season 4 language switcher (Phase 1 i18n).
 *
 * A tiny client control: three understated chips (EN / 한국어 / 中文) styled to
 * match the S4 nav. Clicking writes the `s4_lang` cookie and reloads so the
 * server re-renders in the chosen locale (getLocale in lib/s4/i18n). The active
 * chip is detected from document.cookie after mount, which keeps the server and
 * first client render identical (no hydration mismatch) and needs no server prop.
 *
 * Only mounted on the two translated surfaces (landing + rules) in Phase 1.
 */
"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, LOCALES, isLocale, type Locale } from "@/lib/s4/locale";

export function LanguageSwitcher({ align = "center" }: { align?: "center" | "end" }) {
  const [active, setActive] = useState<Locale>("en");

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)s4_lang=([^;]+)/);
    const value = match ? decodeURIComponent(match[1]) : null;
    if (isLocale(value)) setActive(value);
  }, []);

  function pick(code: Locale) {
    if (code === active) return;
    // 1 year, path=/ so it applies to every /s4 route; lax is fine (same-site).
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    // Simplest reliable refresh: re-render on the server with the new cookie.
    window.location.reload();
  }

  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: "inline-flex",
        gap: 6,
        justifyContent: align === "end" ? "flex-end" : "center",
        flexWrap: "wrap",
      }}
    >
      {LOCALES.map(({ code, label }) => {
        const on = code === active;
        // English shows "EN"; the CJK labels show in-language.
        const text = code === "en" ? "EN" : label;
        return (
          <button
            key={code}
            type="button"
            onClick={() => pick(code)}
            aria-pressed={on}
            lang={code === "en" ? undefined : code}
            style={{
              appearance: "none",
              cursor: on ? "default" : "pointer",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              letterSpacing: "0.1em",
              lineHeight: 1,
              minHeight: 30,
              padding: "7px 10px",
              borderRadius: 8,
              border: `1px solid ${on ? "rgba(240,179,64,0.55)" : "rgba(232,236,245,0.14)"}`,
              background: on ? "rgba(240,179,64,0.12)" : "rgba(232,236,245,0.05)",
              color: on ? "#f0b340" : "rgba(174,182,200,0.9)",
              fontWeight: on ? 700 : 500,
              transition: "color .15s ease, border-color .15s ease, background .15s ease",
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
