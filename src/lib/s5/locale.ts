/**
 * Launch Wars S5, client-safe locale constants (mirrors src/lib/s4/locale.ts).
 *
 * These live apart from i18n.ts because that module imports next/headers
 * (server-only) for getLocale(); a "use client" component may not transitively
 * import next/headers. i18n.ts re-exports everything here.
 */
export type Locale = "en" | "ko" | "zh";

/** Cookie the language switcher sets and getLocale() reads. */
export const LOCALE_COOKIE = "s5_lang";

/** The offered locales, in display order, with their in-language labels. */
export const LOCALES: ReadonlyArray<{ code: Locale; label: string }> = [
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
];

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ko" || value === "zh";
}

/**
 * Client-side locale read (document.cookie). Safe to import anywhere; returns
 * "en" during SSR or when storage is blocked. Client components call this in
 * a mount effect (never in the first render) so hydration stays byte-for-byte
 * with the server's English render, the S4-proven pattern.
 */
export function clientLocale(): Locale {
  try {
    if (typeof document === "undefined") return "en";
    const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
    const v = m ? decodeURIComponent(m[1]) : "";
    return isLocale(v) ? v : "en";
  } catch {
    return "en";
  }
}
