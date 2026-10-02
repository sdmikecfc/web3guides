/**
 * Launch Wars S7, i18n runtime (mirrors src/lib/s4/i18n.ts).
 *
 * Cookie + dictionary, no routing. A server component calls getLocale(), which
 * reads the `s7_lang` cookie (Next 14 cookies() is synchronous), validates it,
 * and defaults to "en". dict(locale) returns that locale's string table.
 * No cookie means English, byte for byte.
 *
 * This module imports next/headers, so it is SERVER-ONLY. The client-safe
 * locale constants live in ./locale and are re-exported here for server code.
 */
import { cookies } from "next/headers";
import { STRINGS, type S7Dict } from "./strings";
import { LOCALE_COOKIE, isLocale, type Locale } from "./locale";

export { LOCALE_COOKIE, LOCALES, isLocale, type Locale } from "./locale";

/** Server-only: resolve the active locale from the request cookie (default en). */
export function getLocale(): Locale {
  const value = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
}

/** The string table for a locale. */
export function dict(locale: Locale): S7Dict {
  return STRINGS[locale];
}
