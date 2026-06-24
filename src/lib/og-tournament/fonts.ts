/**
 * Font loader for OG-Tournament image routes.
 *
 * @vercel/og (Satori) ships a default font with zero CJK glyph coverage, so
 * Chinese / Japanese / Korean display names render as tofu boxes. We fetch a
 * Noto Sans CJK subset at request time and pass it to ImageResponse.
 *
 * PRIMARY = Simplified Chinese (Noto Sans SC) so the CN edition renders correct
 * Simplified glyphs with native shapes. FALLBACK = Japanese (Noto Sans JP), the
 * subset that has been serving in production; if the SC fetch ever fails (bad
 * path, CDN hiccup), we drop to JP rather than to tofu. The registered font name
 * stays "NotoSansJP" so the six route files keep their existing fontFamily string
 * without edits.
 *
 * The ArrayBuffer is cached in a module-level Promise — first request per server
 * instance pays the fetch, the rest are instant. Next.js fetch revalidation keeps
 * the CDN response warm. If BOTH SC and JP fail we return `undefined` and the
 * route falls back to Satori's default font (tofu for non-Latin); failure is
 * non-fatal to the image.
 */

import "server-only";

type SatoriFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

// Primary: Simplified Chinese.
const SC_REGULAR_URL =
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetTTF/SC/NotoSansSC-Regular.ttf";
const SC_BOLD_URL =
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetTTF/SC/NotoSansSC-Bold.ttf";
// Fallback: Japanese (the subset proven in production). Covers most shared Han.
const JP_REGULAR_URL =
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetTTF/JP/NotoSansJP-Regular.ttf";
const JP_BOLD_URL =
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetTTF/JP/NotoSansJP-Bold.ttf";

let regularPromise: Promise<ArrayBuffer> | null = null;
let boldPromise:    Promise<ArrayBuffer> | null = null;

// Hard timeout — if the CDN hangs, we'd rather render the image without the
// CJK font than stall past Discord's image-fetch deadline (~10s).
const FONT_FETCH_TIMEOUT_MS = 4000;

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FONT_FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      next: { revalidate: 86400 },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`Font fetch ${r.status} for ${url}`);
    return await r.arrayBuffer();
  } finally {
    clearTimeout(timeoutId);
  }
}

// Try the Simplified-Chinese subset first; if it fails for any reason, fall back
// to the Japanese subset that is known to serve. Only throws if BOTH fail.
async function fetchFontWithFallback(primary: string, fallback: string): Promise<ArrayBuffer> {
  try {
    return await fetchFont(primary);
  } catch (err) {
    console.warn(`[og-tournament] primary CJK font failed (${primary}), falling back to JP:`, err);
    return await fetchFont(fallback);
  }
}

export async function loadCjkFonts(): Promise<SatoriFont[] | undefined> {
  try {
    if (!regularPromise) regularPromise = fetchFontWithFallback(SC_REGULAR_URL, JP_REGULAR_URL);
    if (!boldPromise)    boldPromise    = fetchFontWithFallback(SC_BOLD_URL, JP_BOLD_URL);
    const [regular, bold] = await Promise.all([regularPromise, boldPromise]);
    return [
      { name: "NotoSansJP", data: regular, weight: 400, style: "normal" },
      { name: "NotoSansJP", data: bold,    weight: 700, style: "normal" },
    ];
  } catch (err) {
    console.warn("[og-tournament] CJK font load failed (SC and JP) — falling back to default:", err);
    // Reset so the next request can retry (in case the CDN had a transient hiccup)
    regularPromise = null;
    boldPromise    = null;
    return undefined;
  }
}
