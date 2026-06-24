/**
 * Conquer the Seas. Fleet Standings board (image) — S1-style emblem-card grid.
 *
 *   /api/launch-wars/og/seas-standings   (?test=1 accepted for forward-compat)
 *
 * Landscape (1200x630, rendered at 1.5x for sharpness) the Discord bot posts for
 * "!seas standings": the five fleets as a row of premium emblem cards (rank medal,
 * crest, big PTS, crew, payout, bonded badge), mirroring the S1 standings card.
 * Reads the bot-published "s2_fleet_standings" config (ranked, fair across launch
 * days). Public-safe: crew counts, points, and the placement pot only — never a
 * private dollar holding.
 *
 * Glyph note: next/og renders EMOJI (🥇⭐🎯) but NOT symbol glyphs like ①/★, which
 * tofu. Ranks/medals here are emoji or plain numbers on purpose.
 */

import { ImageResponse } from "next/og";
import { launchWarsDb } from "@/lib/launch-wars/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

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
  green: "#3de3a4",
  row: "rgba(248,253,255,0.05)",
};

// Faction accent colors (match the map + fleets routes).
const FACTION_COLOR: Record<string, string> = {
  "realityapps.com": "#ff6b6b",
  "recertify.ai": "#4ac6ff",
  "warriors.xyz": "#3de3a4",
  "bottoken.com": "#f0b45c",
  "rackets.xyz": "#b69cff",
};

type Fleet = {
  domain: string;
  size?: number;
  glory?: number;
  capital?: number;
  momentum?: number;
  points?: number;
  rank?: number;
  bonded?: boolean;
  failed?: boolean;
  bondedPct?: number;
  projectedPayout?: number;
};

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
const MEDALS = ["🥇", "🥈", "🥉"];

export async function GET(req: Request) {
  void new URL(req.url).searchParams.get("test"); // accepted for forward-compat
  const db = launchWarsDb();

  let fleets: Fleet[] = [];
  let stormFleet: string | null = null;
  try {
    const { data } = await db
      .from("launch_wars_boss_config")
      .select("value")
      .eq("key", "s2_fleet_standings")
      .maybeSingle();
    if (data?.value) {
      const st = JSON.parse(data.value);
      fleets = Array.isArray(st.fleets) ? st.fleets : [];
      stormFleet = typeof st.stormFleet === "string" ? st.stormFleet.toLowerCase() : null;
    }
  } catch {
    /* render an empty board rather than 500 */
  }
  fleets = fleets.slice(0, 5);

  const bg = await inlineImage(`${WEB_BASE}/seas-art/battle-bg.png`);
  // Tier-1 emblem (gold-framed, S1-card feel), with the legacy crest as fallback.
  const emblems = await Promise.all(
    fleets.map(async (f) => {
      const dom = String(f.domain).toLowerCase();
      return (
        (await inlineImage(`${WEB_BASE}/seas-art/emblem-${emblemSlug(dom)}-t1.png`)) ||
        (await inlineImage(`${WEB_BASE}/seas-art/crest-${dom}.png`))
      );
    }),
  );

  const SCALE = 1.5; // render larger so Discord's compressed preview stays sharp
  const W = 1200;
  const H = 630;
  const n = Math.max(1, fleets.length);
  const cardW = Math.min(212, Math.floor((1080 - (n - 1) * 18) / n));
  const artSize = Math.max(120, Math.min(170, cardW - 12));

  const card = (f: Fleet, emblem: string | null, i: number) => {
    const dom = String(f.domain || "").toLowerCase();
    const color = FACTION_COLOR[dom] || C.gold;
    const crew = Number(f.size) || 0;
    const pts = Math.round(Number(f.points ?? f.momentum) || 0);
    const payout = Number(f.projectedPayout) || 0;
    const bonded = Boolean(f.bonded);
    const failed = Boolean(f.failed) && !bonded; // GRADUATION_FAILED: dead, cannot bond
    const pct = Math.max(0, Math.min(100, Math.round(Number(f.bondedPct) || 0)));
    const isStorm = Boolean(stormFleet && dom === stormFleet);
    return (
      <div key={dom} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: cardW }}>
        <div style={{ display: "flex", position: "relative", width: artSize, height: artSize }}>
          {emblem ? (
            <img src={emblem} width={artSize} height={artSize} style={{ width: artSize, height: artSize, objectFit: "contain" }} />
          ) : (
            <div style={{ display: "flex", width: artSize, height: artSize, borderRadius: 18, background: color, opacity: 0.35 }} />
          )}
          {/* A failed fleet is DEAD — scrim its crest and stamp a skull so it never reads as a winner. */}
          {failed ? (
            <div style={{ position: "absolute", top: 0, left: 0, display: "flex", alignItems: "center", justifyContent: "center", width: artSize, height: artSize, borderRadius: 16, background: "rgba(2,6,12,0.68)", fontSize: Math.round(artSize * 0.42) }}>
              💀
            </div>
          ) : null}
          {MEDALS[i] && bonded ? (
            <div style={{
              position: "absolute", top: -8, left: -8, display: "flex",
              alignItems: "center", justifyContent: "center",
              width: 46, height: 46, borderRadius: 999,
              background: "rgba(0,8,13,0.92)", border: `2px solid ${C.gold}cc`, fontSize: 26,
            }}>
              {MEDALS[i]}
            </div>
          ) : (
            <div style={{
              position: "absolute", top: -8, left: -8, display: "flex",
              alignItems: "center", justifyContent: "center",
              width: 40, height: 40, borderRadius: 999,
              background: "rgba(0,8,13,0.85)", border: "1px solid rgba(248,253,255,0.25)",
              fontSize: 20, fontWeight: 800, color: C.fg3,
            }}>
              {i + 1}
            </div>
          )}
        </div>
        <div style={{ display: "flex", width: 52, height: 5, borderRadius: 3, background: color, marginTop: 12 }} />
        <span style={{ display: "flex", fontSize: dom.length > 15 ? 18 : 21, fontWeight: 800, color: C.fg, marginTop: 12, whiteSpace: "nowrap" }}>
          {dom}
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
          <span style={{ display: "flex", fontSize: 40, fontWeight: 800, color: C.goldBright }}>{pts.toLocaleString("en-US")}</span>
          <span style={{ display: "flex", fontSize: 13, color: C.fg3, letterSpacing: 1 }}>PTS</span>
        </div>
        <span style={{ display: "flex", fontSize: 14, color: C.fg3, marginTop: 3 }}>
          {crew} {crew === 1 ? "captain" : "crew"}{isStorm ? "  🌊" : ""}
        </span>
        {/* Bonding progress — the whole point: only bonded fleets win the cash. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: Math.max(80, cardW - 18), marginTop: 10 }}>
          <div style={{ display: "flex", width: "100%", height: 8, borderRadius: 999, background: "rgba(255,255,255,0.1)" }}>
            <div style={{ display: "flex", width: `${bonded || failed ? 100 : pct}%`, height: "100%", borderRadius: 999, background: bonded ? C.green : failed ? "rgba(255,255,255,0.13)" : pct >= 60 ? C.gold : "#ff8f8f" }} />
          </div>
          {bonded ? (
            <span style={{ display: "flex", fontSize: 15, fontWeight: 800, color: C.green, marginTop: 5, letterSpacing: 0.3 }}>🎯 BONDED{payout > 0 ? ` · $${payout}` : ""}</span>
          ) : failed ? (
            <span style={{ display: "flex", fontSize: 14, fontWeight: 800, color: "#ff8f8f", marginTop: 5, letterSpacing: 0.3 }}>💀 FAILED · $0</span>
          ) : (
            <span style={{ display: "flex", fontSize: 14, fontWeight: 800, color: "#ff8f8f", marginTop: 5, letterSpacing: 0.3 }}>🔒 {pct}% bonded · $0</span>
          )}
        </div>
      </div>
    );
  };

  return new ImageResponse(
    (
      <div style={{ display: "flex", overflow: "hidden", width: W * SCALE, height: H * SCALE }}>
        <div style={{ display: "flex", width: W, height: H, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
          <div style={{ position: "relative", display: "flex", flexDirection: "column", width: W, height: H, background: C.ink, fontFamily: "Georgia, 'Times New Roman', serif", overflow: "hidden" }}>
            {bg ? <img src={bg} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} /> : null}
            <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, background: "linear-gradient(180deg, rgba(0,8,13,0.9) 0%, rgba(0,8,13,0.8) 50%, rgba(0,8,13,0.92) 100%)", display: "flex" }} />

            <div style={{ position: "relative", display: "flex", flexDirection: "column", width: W, height: H, padding: "34px 50px 26px 50px" }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ display: "flex", fontSize: 18, fontWeight: 700, letterSpacing: 8, color: C.gold, textTransform: "uppercase" }}>
                    Conquer the Seas
                  </span>
                  <span style={{ display: "flex", fontSize: 42, fontWeight: 800, color: C.fg, marginTop: 2 }}>Fleet Standings</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={{ display: "flex", fontSize: 12, fontWeight: 800, letterSpacing: 3, color: C.green, border: `1px solid ${C.green}55`, background: `${C.green}22`, padding: "4px 10px", borderRadius: 4 }}>
                    LIVE
                  </span>
                  <span style={{ display: "flex", fontSize: 14, color: C.fg3, marginTop: 6, letterSpacing: 1 }}>Season 2 · $1,000 / week</span>
                </div>
              </div>

              {/* Title strip */}
              <span style={{ display: "flex", fontSize: 23, fontWeight: 700, color: C.fg2, marginTop: 8 }}>Top 3 bonded fleets win 1st $500 · 2nd $300 · 3rd $200, then split among the crew.</span>

              {/* Cards */}
              {fleets.length ? (
                <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "flex-start", gap: 18, flex: 1, marginTop: 6 }}>
                  {fleets.map((f, i) => card(f, emblems[i], i))}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, fontSize: 26, color: C.fg3 }}>
                  No fleets afloat yet. Raise a flag with !seas enlist.
                </div>
              )}

              {/* Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 12, fontSize: 15, fontWeight: 700, color: C.goldBright }}>
                <span style={{ display: "flex" }}>Top 3 bonded fleets split $1,000: 1st $500 · 2nd $300 · 3rd $200 · then split among your crew</span>
                <span style={{ display: "flex", color: C.fg3 }}>seas.web3guides.com</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: W * SCALE, height: H * SCALE, headers: { "Cache-Control": "no-store" } },
  );
}
