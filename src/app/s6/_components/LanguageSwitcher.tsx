/**
 * Season 5 language switcher (mirrors the proven S4 control, steel-styled).
 *
 * Three understated chips (EN / 한국어 / 中文). Clicking writes the `s6_lang`
 * cookie and reloads so server components re-render in the chosen locale
 * (getLocale in lib/s6/i18n) and client components re-read it on mount. The
 * active chip is detected from document.cookie AFTER mount, which keeps the
 * server and first client render identical (no hydration mismatch).
 */
"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, LOCALES, clientLocale, type Locale } from "@/lib/s6/locale";

const STEEL = "#9aa7b4";

export function LanguageSwitcher({ ariaLabel = "Language" }: { ariaLabel?: string }) {
  const [active, setActive] = useState<Locale>("en");

  useEffect(() => {
    setActive(clientLocale());
  }, []);

  function pick(code: Locale) {
    if (code === active) return;
    // 1 year, path=/ so it applies to every /s6 route; lax is fine (same-site).
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    // Simplest reliable refresh: re-render on the server with the new cookie.
    window.location.reload();
  }

  return (
    <div role="group" aria-label={ariaLabel} style={{ display: "inline-flex", gap: 4, flexWrap: "nowrap" }}>
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
              fontSize: 10.5,
              letterSpacing: "0.08em",
              lineHeight: 1,
              minHeight: 30,
              padding: "7px 9px",
              borderRadius: 7,
              border: `1px solid ${on ? `${STEEL}88` : "#ffffff14"}`,
              background: on ? `${STEEL}1f` : "#ffffff08",
              color: on ? "#e9edf1" : "#aab4bd",
              fontWeight: on ? 700 : 500,
              whiteSpace: "nowrap",
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
