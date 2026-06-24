/**
 * Conquer the Seas — Naval Battle victory card.
 *
 *   /api/launch-wars/og/seas-battle/[battleId]
 *
 * 1200×630 card the bot attaches to the battle finale (and players can
 * share). Reads ONE row (launch_wars_s2_battles, including its plunder JSON
 * summary written at resolve time) and renders typography only, so the cold
 * render stays fast. Test battles render too (the sandbox needs cards).
 */

import { ImageResponse } from "next/og";
import { launchWarsDb } from "@/lib/launch-wars/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// One extra image fetch (the battle-scene background) inside the render, inlined
// as a data URI. Give the cold render a little more headroom; warm instances
// serve the cached inline so this rarely matters.
export const maxDuration = 40;

// Absolute base for fetching public art (satori can't fetch relative URLs).
const WEB_BASE =
  process.env.WEB3GUIDES_BASE_URL ||
  (process.env.NEXT_PUBLIC_ROOT_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
    : "https://web3guides.com");

// In-instance cache for inlined art, mirroring the standings route. The battle
// background is a static asset, so a warm instance skips the refetch entirely.
// Module scope so it survives across invocations.
const artCache = new Map<string, { data: string; at: number }>();
const ART_CACHE_TTL_MS = 10 * 60 * 1000;
async function inlineImage(url: string): Promise<string | null> {
  const hit = artCache.get(url);
  if (hit && Date.now() - hit.at < ART_CACHE_TTL_MS) return hit.data;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get("content-type") || "image/png";
    const data = `data:${ct};base64,${buf.toString("base64")}`;
    artCache.set(url, { data, at: Date.now() });
    return data;
  } catch {
    return null;
  }
}

const C = {
  bg: "#000f16",
  panel: "rgba(248,253,255,0.03)",
  hairline: "rgba(248,253,255,0.1)",
  fg: "#f8fdff",
  fg2: "rgba(248,253,255,0.84)",
  fg3: "rgba(248,253,255,0.6)",
  gold: "#f0b45c",
  goldSoft: "rgba(240,180,92,0.16)",
};

// Faction accent colors, matching the bot's flag emojis.
const FACTION_COLORS: Record<string, string> = {
  "realityapps.com": "#ff6b6b",
  "recertify.ai": "#4ac6ff",
  "warriors.xyz": "#3de3a4",
  "bottoken.com": "#f0b45c",
  "rackets.xyz": "#b69cff",
};

type Plunder = {
  doubloons_each?: number;
  winners?: string[];
  ships_entered?: number;
  fleets?: number;
  rounds?: number;
  last_afloat_name?: string;
  last_afloat_class?: string;
};

// Hull → vessel-class sprite name (thresholds match the bot's hullClass). Used
// only when the winner sails no custom skin, so we still show THEIR class ship.
function vesselClass(hullUsd: number): string {
  if (hullUsd >= 100) return "flagship";
  if (hullUsd >= 50) return "galleon";
  if (hullUsd >= 25) return "frigate";
  if (hullUsd >= 5) return "sloop";
  return "dinghy";
}

export async function GET(
  _req: Request,
  { params }: { params: { battleId: string } },
) {
  const battleId = parseInt(params.battleId, 10);
  if (!Number.isFinite(battleId)) {
    return new Response("Bad battle id", { status: 400 });
  }

  const db = launchWarsDb();
  const { data: battle } = await db
    .from("launch_wars_s2_battles")
    .select("id, kind, status, winner_faction, plunder, resolved_at, is_test, last_afloat_discord_id")
    .eq("id", battleId)
    .maybeSingle();

  if (!battle || battle.status !== "resolved") {
    return new Response("Battle not found", { status: 404 });
  }

  // The winner's ACTUAL boat: their worn ship skin if any, else their hull-class
  // vessel. Looked up from the last-ship-afloat captain (Mike: show the winner
  // and their real boat). Best-effort — the card renders fine without it.
  let boat: string | null = null;
  if (battle.last_afloat_discord_id) {
    const { data: ship } = await db
      .from("launch_wars_s2_ships")
      .select("cosmetics, hull_usd")
      .eq("season_key", "s2")
      .eq("discord_id", battle.last_afloat_discord_id)
      .maybeSingle();
    const skin = (ship?.cosmetics as { skin?: string } | null)?.skin;
    const artName = skin ? `ship-${skin}` : `vessel-${vesselClass(Number(ship?.hull_usd || 0))}`;
    boat = await inlineImage(`${WEB_BASE}/seas-art/${artName}.png`);
  }

  const p: Plunder = (battle.plunder as Plunder) || {};
  const winnerFaction: string | null = battle.winner_faction || null;
  const accent = (winnerFaction && FACTION_COLORS[winnerFaction]) || C.gold;
  const winnerTitle = winnerFaction || p.last_afloat_name || "Unknown waters";
  const crew = (p.winners || []).length;
  const date = battle.resolved_at
    ? new Date(battle.resolved_at).toISOString().slice(0, 10)
    : "";

  // Cinematic battle-scene background, inlined as a data URI (satori can't fetch
  // remote URLs at render). If it fails to inline, render WITHOUT it and fall
  // back to the flat dark background below.
  const battleBg = await inlineImage(`${WEB_BASE}/seas-art/battle-bg.png`);

  const stat = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 22, color: C.fg3, letterSpacing: 4, textTransform: "uppercase" as const }}>
        {label}
      </span>
      <span style={{ fontSize: 44, color: C.fg, fontWeight: 700 }}>{value}</span>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          // Flat dark fallback — stays as the base layer, and is the whole
          // background when battle-bg fails to inline.
          background: C.bg,
          padding: "56px 72px",
          fontFamily: "sans-serif",
          overflow: "hidden",
        }}
      >
        {/* full-bleed battle scene + dark scrim (only when the art inlined) */}
        {battleBg ? (
          <div style={{ position: "absolute", top: 0, left: 0, display: "flex", width: 1200, height: 630 }}>
            <img
              src={battleBg}
              width={1200}
              height={630}
              style={{ width: 1200, height: 630, objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                display: "flex",
                width: 1200,
                height: 630,
                background:
                  "linear-gradient(135deg, rgba(0,8,12,0.78) 0%, rgba(0,8,12,0.55) 100%)",
              }}
            />
          </div>
        ) : null}

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 14, height: 14, background: accent, borderRadius: 3 }} />
            <span style={{ fontSize: 28, color: C.gold, letterSpacing: 8, textTransform: "uppercase" as const }}>
              Naval Battle{battle.is_test ? " · Test" : ""}
            </span>
          </div>
          <span style={{ fontSize: 24, color: C.fg3 }}>
            Conquer the Seas · Season 2{date ? ` · ${date}` : ""}
          </span>
        </div>

        {/* winner + their actual boat */}
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 30, zIndex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
            <span style={{ fontSize: 26, color: C.fg3, letterSpacing: 6, textTransform: "uppercase" as const }}>
              {winnerFaction ? "Winning fleet" : "Lone victor"}
            </span>
            <span style={{ fontSize: 56, color: C.fg, fontWeight: 800, lineHeight: 1.05 }}>
              {winnerTitle}
            </span>
            <span style={{ fontSize: 32, color: accent, fontWeight: 600 }}>
              takes the plunder{p.doubloons_each ? ` · ${p.doubloons_each} doubloons per crew member` : ""}
            </span>
          </div>
          {boat ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 440 }}>
              <img src={boat} width={420} height={240} style={{ width: 420, height: 240, objectFit: "contain" }} />
              {p.last_afloat_name ? (
                <span style={{ display: "flex", fontSize: 23, color: C.fg2, fontWeight: 600, marginTop: 2 }}>
                  Last afloat: {String(p.last_afloat_name).slice(0, 22)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* stats band — panel opacity lifted a touch so it reads over the scene */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "auto",
            padding: "30px 40px",
            background: battleBg ? "rgba(0,12,18,0.55)" : C.panel,
            border: `1px solid ${C.hairline}`,
            borderRadius: 18,
            zIndex: 1,
          }}
        >
          {stat("Ships", String(p.ships_entered ?? "?"))}
          {stat("Fleets", String(p.fleets ?? "?"))}
          {stat("Rounds", String(p.rounds ?? "?"))}
          {stat("Crew paid", String(crew || "?"))}
          {stat(
            "Last afloat",
            p.last_afloat_name ? String(p.last_afloat_name).slice(0, 18) : "?",
          )}
        </div>

        {/* footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28, zIndex: 1 }}>
          <span style={{ fontSize: 24, color: C.fg3 }}>seas.web3guides.com</span>
          <span style={{ fontSize: 24, color: C.fg3 }}>
            Hold builds the ship. Play arms it.
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
