/**
 * Conquer the Seas. Top Captains board (image).
 *
 *   /api/launch-wars/og/seas-top   (?test=1 to include sandbox captains)
 *
 * Landscape (1200x630) leaderboard the Discord bot posts for "!seas top", so the
 * captains' ladder reads as a premium image (S1-style) instead of plain text.
 * Top 10 by Glory. Public-safe: name / fleet color / Glory / hull CLASS only.
 * Never a dollar figure.
 */

import { ImageResponse } from "next/og";
import { launchWarsDb } from "@/lib/launch-wars/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 40;

const C = {
  gold: "#f0b45c",
  goldBright: "#ffcf7e",
  fg: "#f8fdff",
  fg2: "rgba(248,253,255,0.82)",
  fg3: "rgba(248,253,255,0.55)",
  ink: "#00080d",
  row: "rgba(248,253,255,0.05)",
};

const WEB_BASE = (
  process.env.WEB3GUIDES_BASE_URL ||
  (process.env.NEXT_PUBLIC_ROOT_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
    : "https://web3guides.com")
).replace(/\/$/, "");

const FACTION_COLOR: Record<string, string> = {
  "realityapps.com": "#ff6b6b",
  "recertify.ai": "#4ac6ff",
  "warriors.xyz": "#3de3a4",
  "bottoken.com": "#f0b45c",
  "rackets.xyz": "#b69cff",
};

function hullClass(hullUsd: number): string {
  if (hullUsd >= 100) return "Flagship";
  if (hullUsd >= 50) return "Galleon";
  if (hullUsd >= 25) return "Frigate";
  if (hullUsd >= 5) return "Sloop";
  return "Dinghy";
}

const artCache = new Map<string, { data: string | null; at: number }>();
async function inlineImage(url: string): Promise<string | null> {
  const hit = artCache.get(url);
  if (hit && Date.now() - hit.at < 600000) return hit.data;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) { artCache.set(url, { data: null, at: Date.now() }); return null; }
    const data = `data:${r.headers.get("content-type") || "image/png"};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    artCache.set(url, { data, at: Date.now() });
    return data;
  } catch {
    artCache.set(url, { data: null, at: Date.now() });
    return null;
  }
}

type Ship = { display_name: string | null; faction: string | null; glory: number | null; hull_usd: number | null };

const MEDAL = ["🥇", "🥈", "🥉"];

export async function GET(req: Request) {
  const includeTest = new URL(req.url).searchParams.get("test") === "1";
  const db = launchWarsDb();

  let q = db
    .from("launch_wars_s2_ships")
    .select("display_name, faction, glory, hull_usd")
    .eq("season_key", "s2")
    .order("glory", { ascending: false })
    .limit(10);
  if (!includeTest) q = q.eq("is_test", false);
  const { data } = await q;
  const ships: Ship[] = (data as Ship[]) || [];

  const bg = await inlineImage(`${WEB_BASE}/seas-art/battle-bg.png`);

  const W = 1200;
  const H = 630;

  const row = (s: Ship, i: number) => {
    const dom = String(s.faction || "").toLowerCase();
    const color = FACTION_COLOR[dom] || "rgba(248,253,255,0.4)";
    const name = String(s.display_name || "Captain").slice(0, 22);
    const glory = Math.max(0, Math.round(Number(s.glory) || 0));
    const cls = hullClass(Number(s.hull_usd) || 0);
    return (
      <div
        key={`${i}-${name}`}
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          width: 1010,
          height: 40,
          padding: "0 16px",
          marginBottom: 4,
          borderRadius: 10,
          background: i < 3 ? "rgba(240,180,92,0.1)" : C.row,
          border: `1px solid ${i < 3 ? "rgba(240,180,92,0.35)" : "rgba(248,253,255,0.07)"}`,
        }}
      >
        <span style={{ display: "flex", width: 46, fontSize: i < 3 ? 28 : 22, fontWeight: 800, color: i < 3 ? C.goldBright : C.fg3 }}>
          {MEDAL[i] || `${i + 1}`}
        </span>
        <div style={{ display: "flex", width: 7, height: 28, borderRadius: 4, background: color, marginRight: 16 }} />
        <span style={{ display: "flex", flexGrow: 1, fontSize: 25, fontWeight: 700, color: C.fg }}>{name}</span>
        <span style={{ display: "flex", width: 168, justifyContent: "flex-end", alignItems: "center", gap: 6, fontSize: 25, fontWeight: 800, color: C.gold }}>
          <span style={{ display: "flex", fontSize: 22 }}>⭐</span>
          {glory.toLocaleString("en-US")}
        </span>
        <span style={{ display: "flex", width: 130, justifyContent: "flex-end", fontSize: 19, fontWeight: 600, color: C.fg3 }}>{cls}</span>
      </div>
    );
  };

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: W, height: H, background: C.ink, fontFamily: "Georgia, 'Times New Roman', serif", overflow: "hidden" }}>
        {bg ? <img src={bg} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} /> : null}
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, background: "linear-gradient(180deg, rgba(0,8,13,0.9) 0%, rgba(0,8,13,0.82) 50%, rgba(0,8,13,0.92) 100%)", display: "flex" }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: W, height: H, padding: "34px 56px" }}>
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
            <span style={{ display: "flex", fontSize: 18, fontWeight: 700, letterSpacing: 8, color: C.gold, textTransform: "uppercase" }}>
              Conquer the Seas
            </span>
            <span style={{ display: "flex", fontSize: 36, fontWeight: 800, color: C.fg, marginTop: 2 }}>
              Top Captains <span style={{ display: "flex", fontSize: 22, fontWeight: 700, color: C.fg3, marginLeft: 14, marginTop: 12 }}>by Glory</span>
            </span>
          </div>

          {ships.length ? (
            <div style={{ display: "flex", flexDirection: "column" }}>{ships.map((s, i) => row(s, i))}</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", height: 240, fontSize: 26, color: C.fg3 }}>
              No captains on the board yet. Play a mission to climb on.
            </div>
          )}

          <span style={{ display: "flex", marginTop: "auto", paddingTop: 10, fontSize: 16, fontWeight: 700, color: C.goldBright }}>
            Earn Glory in missions and battles · anyone can climb, free or paid
          </span>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "no-store" } },
  );
}
