/**
 * Launch Wars S4 — client-safe locale constants (Phase 1 i18n).
 *
 * These are the pieces the client LanguageSwitcher needs (the Locale type, the
 * cookie name, the offered locales, and the validator). They live apart from
 * i18n.ts because that module imports next/headers (server-only) for
 * getLocale(), and a "use client" component may not transitively import
 * next/headers. i18n.ts re-exports everything here so server code has one entry.
 */
export type Locale = "en" | "ko" | "zh";

/** Cookie the LanguageSwitcher sets and getLocale() reads. */
export const LOCALE_COOKIE = "s4_lang";

/** The offered locales, in display order, with their in-language labels. */
export const LOCALES: ReadonlyArray<{ code: Locale; label: string }> = [
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
];

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ko" || value === "zh";
}
