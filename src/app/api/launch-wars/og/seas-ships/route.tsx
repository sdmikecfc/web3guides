/**
 * Conquer the Seas. Shipyard ship-gallery (image).
 *
 *   /api/launch-wars/og/seas-ships
 *
 * Landscape (1200x630) board the Discord bot posts for "!seas shipyard", so the
 * 10 cosmetic vessels read as a premium showroom instead of a text dropdown.
 * Pure showcase: the ship art + name + doubloon price. No DB read. Each PNG is
 * optional (null on failure -> the cell renders name + price only).
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
  row: "rgba(248,253,255,0.05)",
};

// The 10 vessels, in price order. Keys + prices + rigs MUST match the bot's
// SHIP_SKINS and the /seas-art/ship-<key>.png assets. `rig` = the on-top-of-
// fittings battle bonus (battle odds only, never Glory/cash).
const SHIPS: { key: string; name: string; price: number; rig: string }[] = [
  { key: "sovereign", name: "The Sovereign", price: 600, rig: "+1 cannon, +1 hull" },
  { key: "seawolf", name: "The Sea Wolf", price: 700, rig: "+1 cannon, +1 sail" },
  { key: "crimsonmarauder", name: "The Crimson Marauder", price: 750, rig: "+2 cannon" },
  { key: "corsair", name: "The Scarlet Corsair", price: 800, rig: "+2 sail" },
  { key: "gildedlion", name: "The Gilded Lion", price: 900, rig: "+1 hull, +1 spyglass" },
  { key: "blackreaver", name: "The Black Reaver", price: 900, rig: "+2 spyglass" },
  { key: "jadeserpent", name: "The Jade Serpent", price: 1000, rig: "+1 cannon, +1 spyglass" },
  { key: "drownedwraith", name: "The Drowned Wraith", price: 1200, rig: "+2 sail, +1 repair" },
  { key: "bonecrusher", name: "The Bonecrusher", price: 1200, rig: "+3 hull" },
  { key: "tempest", name: "The Tempest", price: 1500, rig: "+2 cannon, +1 spyglass" },
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

export async function GET() {
  const bg = await inlineImage(`${WEB_BASE}/seas-art/battle-bg.png`);
  const art = await Promise.all(
    SHIPS.map((s) => inlineImage(`${WEB_BASE}/seas-art/ship-${s.key}.png`)),
  );

  const W = 1200;
  const H = 630;

  const cell = (s: { name: string; price: number; rig: string }, sprite: string | null) => (
    <div
      key={s.name}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        width: 526,
        height: 88,
        padding: "0 14px",
        borderRadius: 14,
        background: C.row,
        border: "1px solid rgba(248,253,255,0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 160, height: 78 }}>
        {sprite ? (
          <img src={sprite} width={160} height={78} style={{ width: 160, height: 78, objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", width: 160, height: 78 }} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: 10, flexGrow: 1 }}>
        <span style={{ display: "flex", fontSize: 23, fontWeight: 800, color: C.fg, lineHeight: 1.05 }}>{s.name}</span>
        <span style={{ display: "flex", fontSize: 17, fontWeight: 700, color: C.goldBright, marginTop: 2 }}>
          {s.price.toLocaleString("en-US")} doubloons
        </span>
        <span style={{ display: "flex", fontSize: 15, fontWeight: 600, color: C.fg2, marginTop: 2 }}>Rig: {s.rig}</span>
      </div>
    </div>
  );

  const left = SHIPS.slice(0, 5);
  const right = SHIPS.slice(5, 10);

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: W, height: H, background: C.ink, fontFamily: "Georgia, 'Times New Roman', serif", overflow: "hidden" }}>
        {bg ? <img src={bg} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} /> : null}
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, background: "linear-gradient(180deg, rgba(0,8,13,0.92) 0%, rgba(0,8,13,0.84) 50%, rgba(0,8,13,0.93) 100%)", display: "flex" }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: W, height: H, padding: "22px 44px 18px 44px" }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ display: "flex", fontSize: 18, fontWeight: 700, letterSpacing: 8, color: C.gold, textTransform: "uppercase" }}>
                Conquer the Seas
              </span>
              <span style={{ display: "flex", fontSize: 38, fontWeight: 800, color: C.fg, marginTop: 2 }}>The Shipyard</span>
            </div>
            <span style={{ display: "flex", fontSize: 18, fontWeight: 700, color: C.fg3, paddingBottom: 8 }}>
              Earn doubloons in missions. Each rig stacks on top of your fittings.
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "row", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {left.map((s, i) => cell(s, art[i]))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {right.map((s, i) => cell(s, art[i + 5]))}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=600" } },
  );
}
