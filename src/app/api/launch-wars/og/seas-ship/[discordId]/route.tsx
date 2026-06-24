/**
 * Conquer the Seas. Ship Profile card.
 *
 *   /api/launch-wars/og/seas-ship/[discordId]   (?test=1 for sandbox ships)
 *
 * Portrait (~800x1120) card the Discord bot DMs back for "!seas me". Reads ONE
 * row (launch_wars_s2_ships, season s2) and composes it over the carved-wood
 * parchment frame: captain name + hull class, the vessel sprite, doubloon /
 * glory totals, a fittings pip grid, and the faction crest.
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

// Absolute origin to fetch /seas-art/*.png from (satori cannot resolve relative
// URLs, so every image must be fetched + inlined as a base64 data URL).
const WEB_BASE = (
  process.env.WEB3GUIDES_BASE_URL ||
  (process.env.NEXT_PUBLIC_ROOT_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
    : "https://web3guides.com")
).replace(/\/$/, "");

const C = {
  ink: "#3a2410", // dark brown ink, reads on cream parchment
  inkSoft: "#5c421f",
  inkFaint: "#7a5f38",
  gold: "#9a6a1c",
  pipOn: "#6b3d12",
  pipOff: "rgba(90,66,31,0.22)",
  card: "#000f16",
};

// Hull class from cached net held capital. Thresholds MUST match the bot.
function hullClass(hullUsd: number): string {
  if (hullUsd >= 100) return "Flagship";
  if (hullUsd >= 50) return "Galleon";
  if (hullUsd >= 25) return "Frigate";
  if (hullUsd >= 5) return "Sloop";
  return "Dinghy";
}

// ── Art inlining ────────────────────────────────────────────────────────────
// Module-scope cache so warm instances skip the refetch. A cold render fetching
// several multi-KB PNGs has headroom (maxDuration 40); per-image timeout means
// one slow/missing asset never stalls the whole card, it just renders without.
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
    // Negative cache so a missing asset doesn't get re-fetched every render.
    artCache.set(url, { data: null, at: Date.now() });
    return null;
  }
}

const FITTING_KEYS = ["cannons", "sails", "spyglass", "pumps"] as const;
type FittingKey = (typeof FITTING_KEYS)[number];

function fittingLevel(fittings: Record<string, unknown> | null | undefined, key: FittingKey): number {
  const raw = Number((fittings || {})[key]);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(5, Math.round(raw)));
}

export async function GET(
  req: Request,
  { params }: { params: { discordId: string } },
) {
  const discordId = String(params.discordId || "").trim();
  if (!discordId) return new Response("Bad captain id", { status: 400 });

  // ?test=1 may be sent for sandbox ships. We match purely by discord_id within
  // season s2 (a captain has at most one ship per season), so test rows resolve
  // the same way; the flag is accepted for forward-compat and ignored otherwise.
  const isTest = new URL(req.url).searchParams.get("test") === "1";

  const db = launchWarsDb();
  const { data: ship } = await db
    .from("launch_wars_s2_ships")
    .select("display_name, faction, hull_usd, doubloons, glory, fittings, is_test")
    .eq("season_key", "s2")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (!ship) return new Response("Ship not found", { status: 404 });

  const captain = String(ship.display_name || "Captain").slice(0, 28);
  const faction = ship.faction ? String(ship.faction).toLowerCase() : null;
  const hullUsd = Number(ship.hull_usd || 0);
  const cls = hullClass(hullUsd);
  const doubloons = Math.max(0, Math.round(Number(ship.doubloons || 0)));
  const glory = Math.max(0, Math.round(Number(ship.glory || 0)));
  const fittings = (ship.fittings || {}) as Record<string, unknown>;
  void isTest; // accepted, not load-bearing for the match

  // Inline art in parallel; each is optional (null on failure → graceful skip).
  const [frame, vessel, crest] = await Promise.all([
    inlineImage(`${WEB_BASE}/seas-art/shipcard-bg.png`),
    inlineImage(`${WEB_BASE}/seas-art/vessel-${cls.toLowerCase()}.png`),
    faction ? inlineImage(`${WEB_BASE}/seas-art/crest-${faction}.png`) : Promise.resolve(null),
  ]);

  const W = 800;
  const H = 1120;

  // Pip bar (0-5) for a fitting level. Small filled squares, drawn (no emoji).
  const pips = (level: number) => (
    <div style={{ display: "flex", flexDirection: "row", gap: 5 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            display: "flex",
            width: 14,
            height: 14,
            borderRadius: 3,
            background: i < level ? C.pipOn : C.pipOff,
            border: `1px solid ${i < level ? C.pipOn : "rgba(90,66,31,0.30)"}`,
          }}
        />
      ))}
    </div>
  );

  const fittingRow = (key: FittingKey, label: string) => {
    const lvl = fittingLevel(fittings, key);
    return (
      <div
        key={key}
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <span
          style={{
            display: "flex",
            fontSize: 22,
            fontWeight: 700,
            color: C.inkSoft,
            letterSpacing: 3,
          }}
        >
          {label}
        </span>
        {pips(lvl)}
      </div>
    );
  };

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: W,
          height: H,
          // Parchment-cream base behind the frame so missing art still reads.
          background: "#e9d8b4",
          fontFamily: "Georgia, 'Times New Roman', serif",
          overflow: "hidden",
        }}
      >
        {/* Carved-wood + parchment frame, full-bleed. */}
        {frame ? (
          <img
            src={frame}
            width={W}
            height={H}
            style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }}
          />
        ) : null}

        {/* Content laid onto the parchment center. Inset to stay off the wood. */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: W,
            height: H,
            padding: "108px 96px 96px 96px",
          }}
        >
          {/* Faction crest, small, top-right corner of the parchment. */}
          {crest ? (
            <img
              src={crest}
              width={108}
              height={108}
              style={{ position: "absolute", top: 96, right: 92, width: 108, height: 108, objectFit: "contain" }}
            />
          ) : null}

          {/* Header: captain name + hull class. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <span
              style={{
                display: "flex",
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 8,
                color: C.gold,
                textTransform: "uppercase",
              }}
            >
              Captain
            </span>
            <span
              style={{
                display: "flex",
                fontSize: captain.length > 18 ? 50 : 62,
                fontWeight: 800,
                color: C.ink,
                marginTop: 6,
                textAlign: "center",
                lineHeight: 1.04,
              }}
            >
              {captain}
            </span>
            <span
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 700,
                color: C.inkSoft,
                marginTop: 8,
                letterSpacing: 4,
                textTransform: "uppercase",
              }}
            >
              {cls}
            </span>
          </div>

          {/* Vessel sprite, large, centered upper-middle. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 420,
              height: 300,
              marginTop: 14,
            }}
          >
            {vessel ? (
              <img
                src={vessel}
                width={420}
                height={300}
                style={{ width: 420, height: 300, objectFit: "contain" }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 420,
                  height: 300,
                  fontSize: 40,
                  fontWeight: 800,
                  color: C.inkFaint,
                  letterSpacing: 4,
                }}
              >
                {cls.toUpperCase()}
              </div>
            )}
          </div>

          {/* Stat band: DOUBLOONS / GLORY (text labels, no emoji glyphs). */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "flex-start",
              gap: 64,
              marginTop: 18,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ display: "flex", fontSize: 54, fontWeight: 800, color: C.ink, fontFamily: "Georgia, serif" }}>
                {doubloons.toLocaleString("en-US")}
              </span>
              <span style={{ display: "flex", fontSize: 19, fontWeight: 700, color: C.inkSoft, letterSpacing: 5, marginTop: 2 }}>
                DOUBLOONS
              </span>
            </div>
            <div
              style={{
                display: "flex",
                width: 2,
                height: 78,
                background: "rgba(90,66,31,0.28)",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ display: "flex", fontSize: 54, fontWeight: 800, color: C.ink, fontFamily: "Georgia, serif" }}>
                {glory.toLocaleString("en-US")}
              </span>
              <span style={{ display: "flex", fontSize: 19, fontWeight: 700, color: C.inkSoft, letterSpacing: 5, marginTop: 2 }}>
                GLORY
              </span>
            </div>
          </div>

          {/* Fittings grid: pip bars 0-5 per fitting. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: 440,
              gap: 16,
              marginTop: 30,
            }}
          >
            <span
              style={{
                display: "flex",
                fontSize: 18,
                fontWeight: 700,
                color: C.gold,
                letterSpacing: 6,
                textTransform: "uppercase",
              }}
            >
              Fittings
            </span>
            {fittingRow("cannons", "CANNONS")}
            {fittingRow("sails", "SAILS")}
            {fittingRow("spyglass", "SPYGLASS")}
            {fittingRow("pumps", "PUMPS")}
          </div>

          {/* Faction name (crest is in the corner). */}
          {faction ? (
            <span
              style={{
                display: "flex",
                fontSize: 24,
                fontWeight: 700,
                color: C.inkSoft,
                letterSpacing: 3,
                marginTop: 26,
              }}
            >
              {faction}
            </span>
          ) : null}

          {/* Footer. */}
          <span
            style={{
              display: "flex",
              position: "absolute",
              bottom: 96,
              fontSize: 20,
              fontWeight: 700,
              color: C.gold,
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            Conquer the Seas · S2
          </span>
        </div>
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
