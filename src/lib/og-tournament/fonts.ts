/**
 * Font loader for OG-Tournament image routes.
 *
 * @vercel/og (Satori) ships a default font that has zero CJK glyph coverage —
 * Japanese / Chinese / Korean display names render as tofu boxes (□□□□). To
 * fix that, we fetch Noto Sans JP at request time and pass it to ImageResponse.
 * Noto Sans JP covers both Latin and CJK, so a single font handles everything.
 *
 * The font ArrayBuffer is cached in a module-level Promise — first request per
 * server instance pays the ~4MB fetch, subsequent requests are instant. We also
 * use Next.js fetch revalidation (1 day) so the CDN response itself stays warm.
 *
 * If the fetch fails (CDN hiccup, network), we return `undefined` and the route
 * falls back to Satori's default font — so the image still renders, just with
 * tofu boxes for non-Latin characters. Failure is non-fatal.
 */

import "server-only";

type SatoriFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

const CJK_REGULAR_URL =
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetTTF/JP/NotoSansJP-Regular.ttf";
const CJK_BOLD_URL =
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetTTF/JP/NotoSansJP-Bold.ttf";

let regularPromise: Promise<ArrayBuffer> | null = null;
let boldPromise:    Promise<ArrayBuffer> | null = null;

// Hard timeout — if the CDN hangs, we'd rather render the image without the
// CJK font (a few names show as tofu boxes) than have the whole route stall
// past Discord's image-fetch deadline (~10s).
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

export async function loadCjkFonts(): Promise<SatoriFont[] | undefined> {
  try {
    if (!regularPromise) regularPromise = fetchFont(CJK_REGULAR_URL);
    if (!boldPromise)    boldPromise    = fetchFont(CJK_BOLD_URL);
    const [regular, bold] = await Promise.all([regularPromise, boldPromise]);
    return [
      { name: "NotoSansJP", data: regular, weight: 400, style: "normal" },
      { name: "NotoSansJP", data: bold,    weight: 700, style: "normal" },
    ];
  } catch (err) {
    console.warn("[og-tournament] CJK font load failed — falling back to default:", err);
    // Reset so the next request can retry (in case CDN had a transient hiccup)
    regularPromise = null;
    boldPromise    = null;
    return undefined;
  }
}
