/**
 * Conquer the Seas — Naval Battle OPENING card ("the fleets clash").
 *
 *   /api/launch-wars/og/seas-battle-start/[battleId]
 *
 * 1200×630 card the bot attaches to the "cannons roar" opening message, so the
 * fight kicks off with a cinematic shot instead of a bare line. Reads the
 * battle's entries (launch_wars_s2_battle_entries) for the ship count + the
 * fleets that showed up, and renders their emblems over the battle scene.
 * Works while the battle is still joining/resolving (no resolved status needed).
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
  ink: "#00080d",
  fg: "#f8fdff",
  fg3: "rgba(248,253,255,0.6)",
  gold: "#f0b45c",
  goldBright: "#ffcf7e",
};

// Faction accent colors + server order (match the map / standings routes).
const FACTION_COLOR: Record<string, string> = {
  "realityapps.com": "#ff6b6b",
  "recertify.ai": "#4ac6ff",
  "warriors.xyz": "#3de3a4",
  "bottoken.com": "#f0b45c",
  "rackets.xyz": "#b69cff",
};
const ORDER = ["realityapps.com", "recertify.ai", "warriors.xyz", "bottoken.com", "rackets.xyz"];

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

const emblemSlug = (d: string) => d.replace(/\./g, "");

export async function GET(_req: Request, { params }: { params: { battleId: string } }) {
  const battleId = parseInt(params.battleId, 10);
  if (!Number.isFinite(battleId)) return new Response("Bad battle id", { status: 400 });

  const db = launchWarsDb();
  const { data: battle } = await db
    .from("launch_wars_s2_battles")
    .select("id, is_test")
    .eq("id", battleId)
    .maybeSingle();
  if (!battle) return new Response("Battle not found", { status: 404 });

  const { data: entries } = await db
    .from("launch_wars_s2_battle_entries")
    .select("faction")
    .eq("battle_id", battleId);
  const rows = entries || [];
  const shipCount = rows.length;
  const present = new Set(rows.map((r) => String(r.faction || "").toLowerCase()).filter(Boolean));
  const fleets = ORDER.filter((d) => present.has(d));
  const fleetCount = fleets.length;

  const bg = await inlineImage(`${WEB_BASE}/seas-art/battle-bg.png`);
  const emblems = await Promise.all(
    fleets.map(async (d) =>
      (await inlineImage(`${WEB_BASE}/seas-art/emblem-${emblemSlug(d)}-t1.png`)) ||
      (await inlineImage(`${WEB_BASE}/seas-art/crest-${d}.png`)),
    ),
  );

  const W = 1200;
  const H = 630;

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: W, height: H, background: C.ink, fontFamily: "Georgia, 'Times New Roman', serif", overflow: "hidden" }}>
        {bg ? <img src={bg} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} /> : null}
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, background: "linear-gradient(180deg, rgba(0,8,13,0.82) 0%, rgba(0,8,13,0.6) 45%, rgba(0,8,13,0.9) 100%)", display: "flex" }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: W, height: H, padding: "40px 56px" }}>
          <span style={{ display: "flex", fontSize: 22, fontWeight: 700, letterSpacing: 8, color: C.gold, textTransform: "uppercase" }}>
            Conquer the Seas{battle.is_test ? " · Test" : ""}
          </span>
          <span style={{ display: "flex", fontSize: 80, fontWeight: 800, color: C.fg, marginTop: 2 }}>Naval Battle</span>
          <span style={{ display: "flex", fontSize: 30, fontWeight: 600, color: C.goldBright, marginTop: 8 }}>
            {shipCount} {shipCount === 1 ? "ship" : "ships"} from {fleetCount} {fleetCount === 1 ? "fleet" : "fleets"}. The cannons roar.
          </span>

          <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 26, marginTop: 38 }}>
            {fleets.map((d, i) => (
              <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 178 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 148, height: 148 }}>
                  {emblems[i] ? (
                    <img src={emblems[i] as string} width={148} height={148} style={{ width: 148, height: 148, objectFit: "contain" }} />
                  ) : (
                    <div style={{ display: "flex", width: 108, height: 108, borderRadius: 54, background: FACTION_COLOR[d] || C.gold, opacity: 0.5 }} />
                  )}
                </div>
                <div style={{ display: "flex", width: 54, height: 5, borderRadius: 3, background: FACTION_COLOR[d] || C.gold, marginTop: 10 }} />
                <span style={{ display: "flex", fontSize: 20, fontWeight: 800, color: C.fg, marginTop: 10 }}>{d}</span>
              </div>
            ))}
          </div>

          <span style={{ display: "flex", position: "absolute", bottom: 30, fontSize: 22, fontWeight: 700, color: C.fg3 }}>
            Bigger ships have better odds. The winning fleet splits the plunder.
          </span>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "no-store" } },
  );
}
