/**
 * Conquer the Seas. Fleet / enlist emblem board (image).
 *
 *   /api/launch-wars/og/seas-fleets   (?test=1 to include sandbox crews)
 *
 * Landscape (1200x630) board the Discord bot posts for "!seas enlist", so the
 * five fleets read as a row of premium emblems instead of text. Shows each
 * fleet's emblem + domain + current crew count (from the bot-published
 * s2_fleet_standings config). No fleet is highlighted: enlisting is free and we
 * never glow one flag, or everyone piles into it.
 */

import { ImageResponse } from "next/og";
import { launchWarsDb } from "@/lib/launch-wars/supabase";

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
  fg3: "rgba(248,253,255,0.55)",
  ink: "#00080d",
  row: "rgba(248,253,255,0.05)",
};

// Server faction order (matches the map + standings routes).
const FLEETS: { domain: string; color: string }[] = [
  { domain: "realityapps.com", color: "#ff6b6b" },
  { domain: "recertify.ai", color: "#4ac6ff" },
  { domain: "warriors.xyz", color: "#3de3a4" },
  { domain: "bottoken.com", color: "#f0b45c" },
  { domain: "rackets.xyz", color: "#b69cff" },
];

const artCache = new Map<string, { data: string | null; at: number }>();
const ART_CACHE_TTL_MS = 10 * 60 * 1000;
async function inlineImage(url: string): Promise<string | null> {
  const hit = artCache.get(url);
  if (hit && Date.now() - hit.at < ART_CACHE_TTL_MS) return hit.data;
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

// Emblem asset slug = domain with the dots removed (emblem-<slug>-t1.png).
const emblemSlug = (domain: string) => domain.replace(/\./g, "");

export async function GET(req: Request) {
  void new URL(req.url).searchParams.get("test"); // accepted for forward-compat
  const db = launchWarsDb();

  // Crew counts from the bot-published standings (optional; 0 if not ready).
  const crewBy = new Map<string, number>();
  const failedSet = new Set<string>();
  try {
    const { data } = await db
      .from("launch_wars_boss_config")
      .select("value")
      .eq("key", "s2_fleet_standings")
      .maybeSingle();
    if (data?.value) {
      const st = JSON.parse(data.value);
      for (const f of Array.isArray(st.fleets) ? st.fleets : []) {
        const dom = String(f.domain).toLowerCase();
        crewBy.set(dom, Number(f.size) || 0);
        if (f.failed && !f.bonded) failedSet.add(dom); // a failed fleet is not joinable
      }
    }
  } catch {
    /* render with zeroed crew rather than 500 */
  }

  // Drop failed fleets + bottoken.com (the raid target) — none are joinable, same
  // as the bot's enlist buttons.
  const live = FLEETS.filter((f) => !failedSet.has(f.domain.toLowerCase()) && f.domain.toLowerCase() !== 'bottoken.com');

  const bg = await inlineImage(`${WEB_BASE}/seas-art/battle-bg.png`);
  // Tier-1 emblem, with the legacy crest as a graceful fallback.
  const emblems = await Promise.all(
    live.map(async (f) =>
      (await inlineImage(`${WEB_BASE}/seas-art/emblem-${emblemSlug(f.domain)}-t1.png`)) ||
      (await inlineImage(`${WEB_BASE}/seas-art/crest-${f.domain}.png`)),
    ),
  );

  const W = 1200;
  const H = 630;

  const col = (f: { domain: string; color: string }, emblem: string | null, i: number) => {
    const crew = crewBy.get(f.domain) || 0;
    return (
      <div
        key={f.domain}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: 210,
          height: 380,
          padding: "22px 10px 18px 10px",
          borderRadius: 16,
          background: C.row,
          border: `1px solid ${f.color}44`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 168, height: 168 }}>
          {emblem ? (
            <img src={emblem} width={168} height={168} style={{ width: 168, height: 168, objectFit: "contain" }} />
          ) : (
            <div style={{ display: "flex", width: 120, height: 120, borderRadius: 60, background: f.color, opacity: 0.5 }} />
          )}
        </div>
        <div style={{ display: "flex", width: 60, height: 5, borderRadius: 3, background: f.color, marginTop: 12 }} />
        <span style={{ display: "flex", fontSize: 23, fontWeight: 800, color: C.fg, marginTop: 14, textAlign: "center", lineHeight: 1.05 }}>
          {f.domain}
        </span>
        <span style={{ display: "flex", fontSize: 18, fontWeight: 700, color: C.fg3, marginTop: 8 }}>
          {crew} {crew === 1 ? "captain" : "crew"}
        </span>
      </div>
    );
  };

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: W, height: H, background: C.ink, fontFamily: "Georgia, 'Times New Roman', serif", overflow: "hidden" }}>
        {bg ? <img src={bg} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} /> : null}
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, background: "linear-gradient(180deg, rgba(0,8,13,0.9) 0%, rgba(0,8,13,0.82) 50%, rgba(0,8,13,0.92) 100%)", display: "flex" }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: W, height: H, padding: "34px 40px 28px 40px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 14 }}>
            <span style={{ display: "flex", fontSize: 20, fontWeight: 700, letterSpacing: 8, color: C.gold, textTransform: "uppercase" }}>
              Conquer the Seas
            </span>
            <span style={{ display: "flex", fontSize: 46, fontWeight: 800, color: C.fg, marginTop: 2 }}>Choose your flag</span>
          </div>

          <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 18 }}>
            {live.map((f, i) => col(f, emblems[i], i))}
          </div>

          <span style={{ display: "flex", justifyContent: "center", width: "100%", fontSize: 21, fontWeight: 700, color: C.goldBright, marginTop: 20 }}>
            Enlisting is free. Tap a fleet in Discord to pick your flag and start playing.
          </span>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "no-store" } },
  );
}
