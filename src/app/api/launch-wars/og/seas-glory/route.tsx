/**
 * Conquer the Seas. "How to play" / Glory poster (image).
 *
 *   /api/launch-wars/og/seas-glory
 *
 * Landscape (1200x630) banner the Discord bot pins above the Glory guide embed,
 * so the one thing players keep missing (Glory = your cash, posting on X is the
 * biggest + easiest way to earn it) reads as a premium poster. Static, no DB.
 * The full step detail lives in the embed; this is the eye-candy header.
 */

import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 40;

const WEB_BASE = (
  process.env.WEB3GUIDES_BASE_URL ||
  (process.env.NEXT_PUBLIC_ROOT_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
    : "https://web3guides.com")
).replace(/\/$/, "");

const C = {
  gold: "#f0b45c",
  goldBright: "#ffcf7e",
  fg: "#f8fdff",
  fg2: "rgba(248,253,255,0.82)",
  fg3: "rgba(248,253,255,0.55)",
  ink: "#00080d",
  card: "rgba(248,253,255,0.05)",
};

const STEPS = [
  {
    n: "1",
    title: "Pick your flag",
    a: "Join a fleet, free.",
    b: "Type !seas enlist and tap a flag.",
  },
  {
    n: "2",
    title: "Hold to score",
    a: "Your biggest, steadiest points.",
    b: "Hold your fleet coin. It earns Glory every day, up to $100 held, and grows your ship: $5 Sloop up to $100 Flagship.",
  },
  {
    n: "3",
    title: "Stack more Glory",
    a: "Posting is the easiest.",
    b: "Post about your fleet on X, drop the link in #content-share. Plus daily games and the Naval Battle.",
  },
];

const artCache = new Map<string, { data: string | null; at: number }>();
async function inlineImage(url: string): Promise<string | null> {
  const hit = artCache.get(url);
  if (hit) return hit.data;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) { artCache.set(url, { data: null, at: Date.now() }); return null; }
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get("content-type") || "image/png";
    const data = `data:${ct};base64,${buf.toString("base64")}`;
    artCache.set(url, { data, at: Date.now() });
    return data;
  } catch {
    artCache.set(url, { data: null, at: Date.now() });
    return null;
  }
}

export async function GET() {
  const bg = await inlineImage(`${WEB_BASE}/seas-art/battle-bg.png`);

  const W = 1200;
  const H = 630;

  const card = (s: (typeof STEPS)[number]) => (
    <div
      key={s.n}
      style={{
        display: "flex",
        flexDirection: "column",
        width: 348,
        height: 318,
        padding: "26px 24px",
        borderRadius: 18,
        background: C.card,
        border: "1px solid rgba(240,180,92,0.28)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 58,
          height: 58,
          borderRadius: 29,
          background: C.gold,
          color: C.ink,
          fontSize: 34,
          fontWeight: 800,
        }}
      >
        {s.n}
      </div>
      <span style={{ display: "flex", fontSize: 32, fontWeight: 800, color: C.fg, marginTop: 18 }}>{s.title}</span>
      <span style={{ display: "flex", fontSize: 23, fontWeight: 700, color: C.goldBright, marginTop: 8 }}>{s.a}</span>
      <span style={{ display: "flex", fontSize: 20, fontWeight: 500, color: C.fg2, marginTop: 12, lineHeight: 1.32 }}>{s.b}</span>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: W, height: H, background: C.ink, fontFamily: "Georgia, 'Times New Roman', serif", overflow: "hidden" }}>
        {bg ? <img src={bg} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} /> : null}
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, background: "linear-gradient(180deg, rgba(0,8,13,0.92) 0%, rgba(0,8,13,0.82) 48%, rgba(0,8,13,0.93) 100%)", display: "flex" }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: W, height: H, padding: "34px 48px 28px 48px" }}>
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
            <span style={{ display: "flex", fontSize: 21, fontWeight: 700, letterSpacing: 8, color: C.gold, textTransform: "uppercase" }}>
              Conquer the Seas
            </span>
            <span style={{ display: "flex", fontSize: 50, fontWeight: 800, color: C.fg, marginTop: 2 }}>How to play</span>
          </div>

          <div style={{ display: "flex", flexDirection: "row", gap: 24 }}>
            {STEPS.map((s) => card(s))}
          </div>

          <span style={{ display: "flex", position: "absolute", bottom: 26, left: 48, fontSize: 20, fontWeight: 700, color: C.goldBright }}>
            5 crews, 1 ocean, real cash · Free to play · Link a wallet + $5 to share the cash pot
          </span>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=600" } },
  );
}
