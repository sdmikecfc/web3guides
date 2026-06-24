/**
 * Conquer the Seas: world map data.
 *
 *   GET /api/seas/map
 *
 * One JSON snapshot the map page renders: faction islands (level grows with
 * the fleet), every ship (position computed HERE, deterministically, from the
 * captain's id so the world looks stable between loads), event beacons from
 * the battles table, and the Lookout day state (never its coordinates: the
 * spawn point is derived client- and server-side from the day seed, and the
 * claim is re-validated server-side in /api/seas/score).
 *
 * Test-world ships are included while the sandbox is active (config key
 * s2_test_world) so the map is playable before the season flips on.
 * Public-safe: names, classes, doubloons, glory, LP-driven island level, and a
 * READ-ONLY Season 1 service record (team, rank, founder, points). NEVER any
 * dollar holdings; the per-faction lpUsd and projectedPayout below are fleet
 * staking/prize figures from the standings the bot publishes, not a captain's
 * private balance.
 */

import { NextResponse } from "next/server";
import { launchWarsDb } from "@/lib/launch-wars/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Force every Supabase read to be uncached, so freshly-published standings
// (e.g. a fleet flipping to failed) show immediately instead of a stale snapshot.
export const fetchCache = "force-no-store";

const SEASON_KEY = "s2";

// Fixed scenic anchors (normalized world coords). Center stays open sea.
const FACTIONS: { domain: string; color: string; flag: string; island: { x: number; y: number }; raid?: boolean }[] = [
  { domain: "realityapps.com", color: "#ff6b6b", flag: "🟥", island: { x: 0.22, y: 0.28 } },
  { domain: "recertify.ai", color: "#4ac6ff", flag: "🟦", island: { x: 0.78, y: 0.22 } },
  { domain: "warriors.xyz", color: "#3de3a4", flag: "🟩", island: { x: 0.17, y: 0.72 } },
  // bottoken.com is the lone hold-out: the Pillage raid target, dead-centre + menacing.
  { domain: "bottoken.com", color: "#f0b45c", flag: "🟨", island: { x: 0.50, y: 0.50 }, raid: true },
  { domain: "rackets.xyz", color: "#b69cff", flag: "🟪", island: { x: 0.83, y: 0.78 } },
];

// Island level 1-5 from the fleet's combined hull. The Doma asks ARE the
// growth mechanic: once a fleet has staked LP, its level is driven by LP_LEVELS
// (USD thresholds) instead of this hull proxy.
const LEVEL_THRESHOLDS = [0, 250, 1000, 5000, 20000];
const LP_LEVELS = [0, 250, 1000, 5000, 20000];

function levelFromThresholds(value: number, thresholds: number[]): number {
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) if (value >= thresholds[i]) level = i + 1;
  return level;
}

// Shape of the standings the bot publishes to config key "s2_fleet_standings".
type StandingsFleet = {
  domain: string;
  size?: number;
  capital?: number;
  glory?: number;
  lpUsd?: number;
  daysLive?: number;
  momentum?: number;
  rank?: number;
  projectedPayout?: number;
  bonded?: boolean;
  failed?: boolean;
};
type Standings = {
  updatedAt?: string;
  includeTest?: boolean;
  fleets?: StandingsFleet[];
  stormFleet?: string | null;
};

function hullClassName(hull: number) {
  if (hull >= 100) return { cls: "Flagship", icon: "🚢" };
  if (hull >= 50) return { cls: "Galleon", icon: "⛵" };
  if (hull >= 25) return { cls: "Frigate", icon: "⛵" };
  if (hull >= 5) return { cls: "Sloop", icon: "🛶" };
  return { cls: "Dinghy", icon: "🛶" };
}

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic anchorage: ships cluster around their island's harbor. */
function shipPosition(discordId: string, faction: string | null) {
  const h = hash32(discordId);
  const a = ((h % 6283) / 1000); // angle 0..2π
  const f = FACTIONS.find((x) => x.domain === faction);
  if (!f) {
    // Free sailors drift the open middle sea.
    const r = 0.06 + ((h >>> 8) % 1000) / 1000 * 0.10;
    return { x: 0.5 + Math.cos(a) * r * 1.6, y: 0.42 + Math.sin(a) * r };
  }
  const r = 0.055 + ((h >>> 8) % 1000) / 1000 * 0.075;
  return {
    x: Math.min(0.96, Math.max(0.04, f.island.x + Math.cos(a) * r * 1.25)),
    y: Math.min(0.96, Math.max(0.04, f.island.y + Math.sin(a) * r)),
  };
}

// Compact, public-safe Season 1 service record. NO dollar figures, ever.
type Career = { s1Team?: string; s1Rank?: number; s1Founder?: boolean; s1Points?: number };

/**
 * Best-effort Season 1 history, keyed by discord_id. The entire read is wrapped
 * in try/catch: any schema surprise (missing season, renamed column) returns an
 * empty map and the map still renders. NEVER exposes dollars.
 */
async function loadS1Careers(
  db: ReturnType<typeof launchWarsDb>,
  shipRows: { discord_id: string }[],
): Promise<Map<string, Career>> {
  const out = new Map<string, Career>();
  try {
    const discordIds = Array.from(
      new Set(shipRows.map((s) => String(s.discord_id)).filter(Boolean)),
    );
    if (discordIds.length === 0) return out;

    // Resolve the Season 1 season id: explicit config override, else the most
    // recent COMPLETE non-test season.
    let s1SeasonId: number | null = null;
    const { data: pinned } = await db
      .from("launch_wars_boss_config")
      .select("value")
      .eq("key", "s2_s1_season_id")
      .maybeSingle();
    if (pinned?.value && Number.isFinite(Number(pinned.value))) {
      s1SeasonId = Number(pinned.value);
    } else {
      const { data: seasonRow } = await db
        .from("launch_wars_seasons")
        .select("id")
        .eq("status", "COMPLETE")
        .eq("is_test", false)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (seasonRow?.id != null) s1SeasonId = Number(seasonRow.id);
    }
    if (s1SeasonId == null) return out;

    // Teams in that season -> domain name lookup.
    const { data: teamRows } = await db
      .from("launch_wars_teams")
      .select("id, domain_name")
      .eq("season_id", s1SeasonId);
    const teamName = new Map<string, string>();
    for (const t of teamRows || []) teamName.set(String(t.id), t.domain_name || "");

    // Members for that season. total_score drives the rank; founder flag column
    // is named is_founder in the schema, but we read it defensively in case a
    // deployment used "founder" instead.
    const { data: memberRows } = await db
      .from("launch_wars_members")
      .select("discord_id, team_id, total_score, is_founder, left_at")
      .eq("season_id", s1SeasonId);
    const members = (memberRows || []).map((m) => {
      const rec = m as Record<string, unknown>;
      const founder =
        rec.is_founder === true || rec.founder === true;
      return {
        discord_id: String(m.discord_id),
        team_id: m.team_id != null ? String(m.team_id) : null,
        score: Number(m.total_score) || 0,
        founder,
      };
    });

    // Rank by total_score desc across the whole season (1 = top scorer).
    const ranked = [...members].sort((a, b) => b.score - a.score);
    const rankOf = new Map<string, number>();
    ranked.forEach((m, i) => {
      if (!rankOf.has(m.discord_id)) rankOf.set(m.discord_id, i + 1);
    });

    const wanted = new Set(discordIds);
    for (const m of members) {
      if (!wanted.has(m.discord_id) || out.has(m.discord_id)) continue;
      const career: Career = {
        s1Team: (m.team_id && teamName.get(m.team_id)) || undefined,
        s1Rank: rankOf.get(m.discord_id),
        s1Founder: m.founder || undefined,
        s1Points: Math.round(m.score),
      };
      out.set(m.discord_id, career);
    }
  } catch {
    return new Map();
  }
  return out;
}

export async function GET() {
  const db = launchWarsDb();
  const day = new Date().toISOString().slice(0, 10);

  // Include sandbox ships while the test world is up.
  const { data: testCfg } = await db
    .from("launch_wars_boss_config")
    .select("value")
    .eq("key", "s2_test_world")
    .maybeSingle();
  const includeTest = testCfg?.value === "active";

  // Fleet standings the bot publishes (LP staked, projected prizes, storm fleet).
  // Best-effort: a missing or unparseable row leaves the map fully renderable.
  let standings: Standings | null = null;
  try {
    const { data: stCfg } = await db
      .from("launch_wars_boss_config")
      .select("value")
      .eq("key", "s2_fleet_standings")
      .maybeSingle();
    if (stCfg?.value) standings = JSON.parse(stCfg.value) as Standings;
  } catch {
    standings = null;
  }

  // Bonded fleets (the bot marks a fleet's domain when its token graduates) →
  // gold legendary emblem tier. Best-effort; absent = none bonded.
  const bondedSet = new Set<string>();
  try {
    const { data: bCfg } = await db
      .from("launch_wars_boss_config")
      .select("value")
      .eq("key", "s2_bonded")
      .maybeSingle();
    if (bCfg?.value) for (const d of JSON.parse(bCfg.value) as string[]) bondedSet.add(String(d).toLowerCase());
  } catch {
    /* none bonded */
  }

  const lpByFaction = new Map<string, number>();
  const payoutByFaction = new Map<string, number>();
  const failedSet = new Set<string>();
  for (const fl of standings?.fleets || []) {
    if (!fl?.domain) continue;
    const dom = String(fl.domain).toLowerCase();
    lpByFaction.set(dom, Number(fl.lpUsd) || 0);
    payoutByFaction.set(dom, Number(fl.projectedPayout) || 0);
    if (fl.failed && !fl.bonded) failedSet.add(dom);
  }
  const stormFaction =
    typeof standings?.stormFleet === "string" && standings.stormFleet
      ? standings.stormFleet.toLowerCase()
      : null;

  let shipQ = db
    .from("launch_wars_s2_ships")
    .select("discord_id, display_name, faction, hull_usd, doubloons, glory, is_test, cosmetics")
    .eq("season_key", SEASON_KEY)
    .order("hull_usd", { ascending: false })
    .limit(1200);
  if (!includeTest) shipQ = shipQ.eq("is_test", false);
  const { data: shipRows } = await shipQ;

  // Captains who banked a duty run TODAY are "raiding" (off their harbor anchor).
  // Same is_test filter the ships query uses; one extra distinct read.
  const raidingIds = new Set<string>();
  let dutyQ = db
    .from("launch_wars_s2_duty_runs")
    .select("discord_id")
    .eq("season_key", SEASON_KEY)
    .like("day_key", `${day}%`)
    .limit(5000);
  if (!includeTest) dutyQ = dutyQ.eq("is_test", false);
  const { data: dutyRows } = await dutyQ;
  for (const r of dutyRows || []) if (r.discord_id) raidingIds.add(String(r.discord_id));

  // Season 1 service record (READ-ONLY, best-effort). Joined server-side by
  // discord_id BEFORE the public ship id is built, so no discord_id leaks.
  const careerByDiscord = await loadS1Careers(db, shipRows || []);

  const ships = (shipRows || []).map((s) => {
    const hull = Number(s.hull_usd) || 0;
    const { cls, icon } = hullClassName(hull);
    const pos = shipPosition(s.discord_id, s.faction);
    const career = careerByDiscord.get(String(s.discord_id));
    // Worn vessel skin (doubloon cosmetic): the shipyard stores it in cosmetics.skin.
    const skin = (s.cosmetics as { skin?: string } | null)?.skin || null;
    return {
      id: hash32(`${SEASON_KEY}:${s.discord_id}`).toString(36), // public id, not the discord id
      name: s.display_name || "Captain",
      faction: s.faction,
      cls,
      icon,
      doubloons: Math.round(Number(s.doubloons) || 0),
      glory: Math.round(Number(s.glory) || 0),
      x: pos.x,
      y: pos.y,
      state: raidingIds.has(String(s.discord_id)) ? "raiding" : "harbor",
      ...(skin ? { skin } : {}),
      ...(career ? { career } : {}),
    };
  });

  const fleetHull = new Map<string, number>();
  const fleetCount = new Map<string, number>();
  for (const s of shipRows || []) {
    if (!s.faction) continue;
    fleetHull.set(s.faction, (fleetHull.get(s.faction) || 0) + (Number(s.hull_usd) || 0));
    fleetCount.set(s.faction, (fleetCount.get(s.faction) || 0) + 1);
  }
  const factions = FACTIONS.map((f) => {
    const lpUsd = lpByFaction.get(f.domain) || 0;
    const projectedPayout = payoutByFaction.get(f.domain) || 0;
    // LP staking takes over island growth once a fleet has staked; otherwise we
    // fall back to the combined-hull proxy.
    const level =
      lpUsd > 0
        ? levelFromThresholds(lpUsd, LP_LEVELS)
        : levelFromThresholds(fleetHull.get(f.domain) || 0, LEVEL_THRESHOLDS);
    // Hybrid emblem tier: island growth drives t1→t2 automatically; an actual
    // token bond (bot-marked) unlocks the gold legendary t3.
    const bonded = bondedSet.has(f.domain.toLowerCase());
    const failed = !bonded && failedSet.has(f.domain.toLowerCase());
    const tier = bonded ? "t3" : level >= 3 ? "t2" : "t1";
    return { ...f, level, shipCount: fleetCount.get(f.domain) || 0, lpUsd, projectedPayout, bonded, failed, tier };
  });

  // Beacons: open rumbles/epics (join call) + today's results.
  let battleQ = db
    .from("launch_wars_s2_battles")
    .select("id, kind, status, resolve_at, winner_faction, plunder, is_test, resolved_at")
    .eq("season_key", SEASON_KEY)
    .neq("kind", "duel")
    .or(`status.eq.joining,and(status.eq.resolved,resolved_at.gte.${day}T00:00:00Z)`)
    .order("id", { ascending: false })
    .limit(6);
  if (!includeTest) battleQ = battleQ.eq("is_test", false);
  const { data: battles } = await battleQ;

  const beacons = (battles || []).map((b) => {
    if (b.status === "joining") {
      return {
        kind: b.kind === "epic" ? "epic" : "battle",
        x: 0.5,
        y: 0.38,
        title: b.kind === "epic" ? "🌊 Epic Sea Battle" : "⚔️ Daily Naval Battle",
        line: `Starts soon. Join with one tap in the Doma Discord, #mini-games.${b.is_test ? " [TEST]" : ""}`,
        resolveAt: b.resolve_at,
      };
    }
    const p = (b.plunder || {}) as { ships_entered?: number; last_afloat_name?: string };
    const f = FACTIONS.find((x) => x.domain === b.winner_faction);
    const hero = p.last_afloat_name || null; // the captain last afloat = the day's hero
    return {
      kind: "result",
      x: f ? f.island.x + 0.05 : 0.5,
      y: f ? f.island.y - 0.06 : 0.38,
      title: `🏴‍☠️ ${b.winner_faction || hero || "The sea"} won`,
      line: `${p.ships_entered || "?"} ships fought today.${b.is_test ? " [TEST]" : ""}`,
      resolveAt: b.resolved_at,
      winnerFaction: b.winner_faction || null,
      winnerFlag: f ? f.flag : null,
      hero,
    };
  });

  // Lookout day state (coords derived from the day seed on both sides).
  let lookoutQ = db
    .from("launch_wars_s2_duty_runs")
    .select("id", { count: "exact", head: true })
    .eq("season_key", SEASON_KEY)
    .eq("game", "lookout")
    .eq("day_key", day);
  if (!includeTest) lookoutQ = lookoutQ.eq("is_test", false);
  const { count: lookoutClaims } = await lookoutQ;

  return NextResponse.json(
    {
      day,
      includeTest,
      storm: stormFaction ? { faction: stormFaction } : null,
      factions,
      ships,
      beacons,
      lookout: { active: true, claims: lookoutClaims || 0 },
    },
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60" } },
  );
}
