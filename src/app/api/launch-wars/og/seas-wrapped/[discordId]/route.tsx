/**
 * Conquer the Seas. Season Wrapped card.
 *
 *   /api/launch-wars/og/seas-wrapped/[discordId]   (?test=1 for sandbox ships)
 *
 * Landscape (1200x630) end-of-season recap the Discord bot DMs back for
 * "!seas wrapped". Composes the player's season totals over the battle backdrop
 * so it renders full in a tweet preview (the share lever). Reads one ship row +
 * cheap ledger/duty counts + the final fleet placement from the settlement
 * snapshot (or the live standings before settlement).
 *
 * Public-safe: hull_usd is private held capital. Only the CLASS NAME is ever
 * shown, never a dollar figure. Every inlined PNG is optional; the card still
 * renders (typography-only) if any asset fails to inline.
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
  fg2: "rgba(248,253,255,0.82)",
  fg3: "rgba(248,253,255,0.6)",
  ink: "#00080d",
};

function hullClass(hullUsd: number): string {
  if (hullUsd >= 100) return "Flagship";
  if (hullUsd >= 50) return "Galleon";
  if (hullUsd >= 25) return "Frigate";
  if (hullUsd >= 5) return "Sloop";
  return "Dinghy";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// A flavor title from the player's standout numbers (keeps the card personal).
function captainTitle(glory: number, battlesWon: number, cls: string): string {
  if (battlesWon >= 10) return "Scourge of the Seas";
  if (cls === "Flagship" || cls === "Galleon") return "Fleet Admiral";
  if (glory >= 200) return "Glory Hound";
  if (battlesWon >= 3) return "Battle-Tested";
  if (glory >= 50) return "Rising Captain";
  return "Free Sailor";
}

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
    if (!r.ok) {
      artCache.set(url, { data: null, at: Date.now() });
      return null;
    }
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

// Final fleet placement from the frozen settlement snapshot, else live standings.
async function fleetPlacement(
  db: ReturnType<typeof launchWarsDb>,
  discordId: string,
  faction: string | null,
): Promise<{ rank: number; total: number } | null> {
  try {
    const { data: snapRow } = await db
      .from("launch_wars_boss_config")
      .select("value")
      .eq("key", "s2_settlement_snapshot")
      .maybeSingle();
    if (snapRow?.value) {
      const snap = JSON.parse(snapRow.value);
      const me = (snap.ships || []).find((s: { discord_id: string }) => s.discord_id === discordId);
      const total = (snap.fleets || []).filter((f: { size: number }) => f.size > 0).length || 5;
      if (me && me.fleet_rank) return { rank: me.fleet_rank, total };
    }
  } catch {
    /* no snapshot */
  }
  if (!faction) return null;
  try {
    const { data: stRow } = await db
      .from("launch_wars_boss_config")
      .select("value")
      .eq("key", "s2_fleet_standings")
      .maybeSingle();
    if (stRow?.value) {
      const st = JSON.parse(stRow.value);
      const crewed = (st.fleets || []).filter((f: { size: number }) => f.size > 0);
      const me = crewed.find((f: { domain: string }) => f.domain === faction);
      if (me && me.rank) return { rank: me.rank, total: crewed.length || 5 };
    }
  } catch {
    /* no standings */
  }
  return null;
}

export async function GET(req: Request, { params }: { params: { discordId: string } }) {
  const discordId = String(params.discordId || "").trim();
  if (!discordId) return new Response("Bad captain id", { status: 400 });
  void (new URL(req.url).searchParams.get("test") === "1");

  const db = launchWarsDb();
  const { data: ship } = await db
    .from("launch_wars_s2_ships")
    .select("display_name, faction, hull_usd, doubloons, glory")
    .eq("season_key", "s2")
    .eq("discord_id", discordId)
    .maybeSingle();
  if (!ship) return new Response("Ship not found", { status: 404 });

  const captain = String(ship.display_name || "Captain").slice(0, 24);
  const faction = ship.faction ? String(ship.faction).toLowerCase() : null;
  const cls = hullClass(Number(ship.hull_usd || 0));
  const doubloons = Math.max(0, Math.round(Number(ship.doubloons || 0)));
  const glory = Math.max(0, Math.round(Number(ship.glory || 0)));

  // Cheap season aggregates (counts only).
  const [battlesRes, dutiesRes, placement, bg, vessel, crest] = await Promise.all([
    db
      .from("launch_wars_s2_ledger")
      .select("id", { count: "exact", head: true })
      .eq("season_key", "s2")
      .eq("discord_id", discordId)
      .in("reason", ["battle_win", "battle_last_afloat"]),
    db
      .from("launch_wars_s2_duty_runs")
      .select("id", { count: "exact", head: true })
      .eq("season_key", "s2")
      .eq("discord_id", discordId),
    fleetPlacement(db, discordId, faction),
    inlineImage(`${WEB_BASE}/seas-art/battle-bg.png`),
    inlineImage(`${WEB_BASE}/seas-art/vessel-${cls.toLowerCase()}.png`),
    faction ? inlineImage(`${WEB_BASE}/seas-art/crest-${faction}.png`) : Promise.resolve(null),
  ]);
  const battlesWon = battlesRes.count || 0;
  const duties = dutiesRes.count || 0;
  const title = captainTitle(glory, battlesWon, cls);

  const W = 1200;
  const H = 630;

  const stat = (value: string, label: string) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ display: "flex", fontSize: 60, fontWeight: 800, color: C.fg }}>{value}</span>
      <span style={{ display: "flex", fontSize: 18, fontWeight: 700, color: C.gold, letterSpacing: 4, marginTop: 2 }}>
        {label}
      </span>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: W,
          height: H,
          background: C.ink,
          fontFamily: "Georgia, 'Times New Roman', serif",
          overflow: "hidden",
        }}
      >
        {bg ? (
          <img src={bg} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} />
        ) : null}
        {/* Dark scrim so typography reads over the scene. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            background: "linear-gradient(90deg, rgba(0,8,13,0.86) 0%, rgba(0,8,13,0.66) 55%, rgba(0,8,13,0.5) 100%)",
            display: "flex",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "row",
            width: W,
            height: H,
            padding: "44px 56px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Left: identity */}
          <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
            <span style={{ display: "flex", fontSize: 22, fontWeight: 700, letterSpacing: 8, color: C.gold, textTransform: "uppercase" }}>
              Season 2 Wrapped
            </span>
            <span style={{ display: "flex", fontSize: captain.length > 16 ? 56 : 68, fontWeight: 800, color: C.fg, marginTop: 10, lineHeight: 1.02 }}>
              {captain}
            </span>
            <span style={{ display: "flex", fontSize: 28, fontWeight: 700, color: C.goldBright, marginTop: 8, letterSpacing: 2 }}>
              {title}
            </span>
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 14, marginTop: 18 }}>
              {crest ? <img src={crest} width={56} height={56} style={{ width: 56, height: 56, objectFit: "contain" }} /> : null}
              <span style={{ display: "flex", fontSize: 26, fontWeight: 700, color: C.fg2, letterSpacing: 1 }}>
                {cls}
                {faction ? ` · ${faction}` : ""}
              </span>
            </div>
            {placement ? (
              <span style={{ display: "flex", fontSize: 24, fontWeight: 700, color: C.fg, marginTop: 16 }}>
                Fleet finished {ordinal(placement.rank)} of {placement.total}
              </span>
            ) : null}
          </div>

          {/* Right: vessel + stat grid */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 520 }}>
            {vessel ? (
              <img src={vessel} width={300} height={200} style={{ width: 300, height: 200, objectFit: "contain" }} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 300, height: 200, fontSize: 34, fontWeight: 800, color: C.fg3, letterSpacing: 4 }}>
                {cls.toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "row", gap: 44, marginTop: 6 }}>
              {stat(glory.toLocaleString("en-US"), "GLORY")}
              {stat(battlesWon.toLocaleString("en-US"), "BATTLES WON")}
            </div>
            <div style={{ display: "flex", flexDirection: "row", gap: 44, marginTop: 20 }}>
              {stat(doubloons.toLocaleString("en-US"), "DOUBLOONS")}
              {stat(duties.toLocaleString("en-US"), "DUTIES")}
            </div>
          </div>
        </div>

        {/* Footer brand */}
        <span
          style={{
            display: "flex",
            position: "absolute",
            bottom: 24,
            left: 56,
            fontSize: 18,
            fontWeight: 700,
            color: C.gold,
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          Conquer the Seas · Launch Wars
        </span>
      </div>
    ),
    {
      width: W,
      height: H,
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=120",
      },
    },
  );
}
