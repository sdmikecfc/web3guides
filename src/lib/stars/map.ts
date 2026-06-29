/**
 * STARFALL — sector-map snapshot (service-role read; server-only).
 *
 * One JSON snapshot the /stars/map page (and /api/stars/map) renders: each of the
 * 5 stars merged with its live on-chain state (pending | live | bonded | failed +
 * normalized bond progress) from launch_wars_s3_stars, plus the 3 crew rosters
 * (pilot counts) from launch_wars_s3_pilots. PUBLIC-SAFE: crew sizes and per-star
 * bond progress only — never a pilot wallet, balance, or any dollar holding.
 */
import "server-only";
import { starsDb } from "./server";
import { STARS, CREWS, type StarStatus, type StarSize } from "./stars";

const SEASON_KEY = "s3";

export type SectorStar = {
  domain: string;
  name: string;
  size: StarSize;
  pos: { x: number; y: number };
  card: "above" | "below";
  tag?: string;
  relist?: boolean;
  status: StarStatus;
  progress: number; // 0..1 on the star's own bond curve
  launchAt: string;
  launched: boolean; // launchAt has passed
};

// One pilot on a crew roster. PUBLIC-SAFE: a display name (callsign, or a
// shortened wallet — never the full address), the hull rank (1..12 → ship sprite),
// and Starlight (the public score). NEVER hull_usd or any dollar holding.
export type RosterPilot = { name: string; rank: number; starlight: number };

export type SectorCrew = {
  key: string;
  name: string;
  accent: string;
  pilots: number;
  starlight: number; // crew total (the standings sort key)
  roster: RosterPilot[]; // top pilots by Starlight (capped)
};

export type Sector = {
  stars: SectorStar[];
  crews: SectorCrew[];
  totals: { lit: number; live: number; total: number; pilots: number };
  nowMs: number; // server timestamp, so client-side countdowns don't drift on hydration
};

const ROSTER_CAP = 100; // most ships we render per crew on the map

/** Public pilot label: callsign if set, else a shortened wallet, never the full address. */
function pilotLabel(displayName: string | null, callsign: string | null): string {
  const c = (callsign || "").trim();
  if (c) return c;
  const d = (displayName || "").trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(d)) return `${d.slice(0, 6)}…${d.slice(-4)}`;
  return d || "Pilot";
}

export async function getSectorSnapshot(): Promise<Sector> {
  const db = starsDb();

  // Live on-chain state per star (best-effort; a missing row falls back to pending).
  const { data: rows } = await db
    .from("launch_wars_s3_stars")
    .select("domain,status,normalized_progress")
    .eq("season_key", SEASON_KEY)
    .eq("is_test", false);
  const byDomain = new Map(
    (rows || []).map((r) => [String(r.domain).toLowerCase(), r]),
  );

  const now = Date.now();
  const stars: SectorStar[] = STARS.map((meta) => {
    const row = byDomain.get(meta.domain.toLowerCase());
    const status = ((row?.status as StarStatus) || "pending") as StarStatus;
    const launched = now >= new Date(meta.launchAt).getTime();
    return {
      domain: meta.domain,
      name: meta.name,
      size: meta.size,
      pos: meta.pos,
      card: meta.card,
      tag: meta.tag,
      relist: meta.relist,
      status,
      progress: Math.max(0, Math.min(1, Number(row?.normalized_progress) || 0)),
      launchAt: meta.launchAt,
      launched,
    };
  });

  // Crew rosters: one read, grouped in JS. Ordered by Starlight desc so each crew's
  // roster is already a leaderboard. No wallets / no dollars leave the server.
  const { data: prows } = await db
    .from("launch_wars_s3_pilots")
    .select("crew, display_name, callsign, rank, starlight")
    .eq("season_key", SEASON_KEY)
    .eq("is_test", false)
    .not("crew", "is", null)
    .order("starlight", { ascending: false })
    .limit(2000);

  const rosterByCrew = new Map<string, RosterPilot[]>();
  const starlightByCrew = new Map<string, number>();
  for (const p of prows || []) {
    const crew = String(p.crew);
    const sl = Math.round(Number(p.starlight) || 0);
    const list = rosterByCrew.get(crew) || [];
    if (list.length < ROSTER_CAP) {
      list.push({ name: pilotLabel(p.display_name, p.callsign), rank: Number(p.rank) || 1, starlight: sl });
    }
    rosterByCrew.set(crew, list);
    starlightByCrew.set(crew, (starlightByCrew.get(crew) || 0) + sl);
  }

  const crews: SectorCrew[] = CREWS.map((c) => {
    const roster = rosterByCrew.get(c.key) || [];
    return {
      key: c.key,
      name: c.name,
      accent: c.accent,
      pilots: roster.length,
      starlight: starlightByCrew.get(c.key) || 0,
      roster,
    };
  });
  const pilots = crews.reduce((s, c) => s + c.pilots, 0);

  const totals = {
    lit: stars.filter((s) => s.status === "bonded").length,
    live: stars.filter((s) => s.status === "live").length,
    total: stars.length,
    pilots,
  };

  return { stars, crews, totals, nowMs: now };
}
