/**
 * Launch Wars Season 4 — THE HIT LIST MAP (web3guides.com/s4/map).
 *
 * The themed world map: the noir bounty-board city. Server component reads
 * the SAME season snapshot the status board uses (lib/s4/data.ts) and hands
 * it to the client HitListMap renderer. Keeps Season 3's battlefield
 * readability grammar, hit-list-translated (ADR-0008): team camps at fixed
 * CORNERS (NW/SW/NE), featured contracts pinned in a tight ring around the
 * bounty board CENTER, an events column RIGHT reserved for future events.
 *
 * force-dynamic governs RENDERING, not the fetch Data Cache. Without the
 * fetchCache directive plus noStore(), the service-role reads get stored in
 * Next's Data Cache and served stale (the S3 map froze on an old snapshot
 * until all three were in place). Replicated on every live-data S4 page.
 */
import { getSeasonSnapshot, poolLine, POOL_FULL_USD, type Snapshot, type TopPlayer } from "@/lib/s4/data";
import { DEFAULT_THEME } from "@/lib/s4/theme";
import { HitListMap } from "./HitListMap";
import MapIntro from "./MapIntro";

// RE-ENABLED 2026-07-14: script rewritten to HIT LIST per Mike (Fred +
// Michael as their agency characters, new contract-era intro art at
// /s4-art/intro/). Cameo re-approval channel = Mike (ADR-0018 consent gate).
const INTRO_ENABLED = true;

// ISR, matching the other S4 pages (landing/board/rules). The season snapshot is
// unstable_cache'd 60s in lib/s4/data, so revalidate 60 keeps the map cached and
// prefetchable (instant nav) instead of re-querying Supabase on every load. The
// guide rule (S4-Game-Guide "SURFACES"): NEVER force-dynamic + noStore here —
// that re-queried on every tab click and "read as the site is slow."
export const revalidate = 60;

export const metadata = {
  title: `Hit List Map · ${DEFAULT_THEME.seasonName}`,
  description: "The world map: three team camps, the featured contracts pinned to the board, one shared pool.",
};

/** Pre-season / read-failure fallback: camps render, targets section shows its empty state. */
function emptySnapshot(): Snapshot {
  return {
    seasonKey: "s4",
    theme: DEFAULT_THEME,
    targets: [],
    teams: DEFAULT_THEME.teams.map((t) => ({
      key: t.key,
      name: t.name,
      accent: t.accent,
      players: 0,
      points: 0,
    })),
    topPlayers: [],
    totals: { bonded: 0, live: 0, total: 0, players: 0 },
    pool: { unlocked: 0, full: POOL_FULL_USD, perBond: POOL_FULL_USD },
    season: { launchAt: null, endAt: null },
    nowMs: Date.now(),
    empty: true,
  };
}

// DEV-ONLY preview mock (gated to non-production; ?demo never renders live).
// Lets us verify the camps, the dossier ring, every bond state (one at 100%,
// so the CLOSED stamp renders), and the tap cards before the season starts.
function demoSnapshot(): Snapshot {
  const now = Date.now();
  const iso = (days: number) => new Date(now + days * 86400000).toISOString();
  const target = (
    domain: string,
    name: string,
    status: Snapshot["targets"][number]["status"],
    progress: number,
    launchDays: number,
    sortOrder: number,
    bondingFdv: number | null,
  ) => ({
    domain,
    name,
    status,
    progress,
    launchAt: iso(launchDays),
    launched: launchDays <= 0,
    sortOrder,
    bondingFdv,
    initialFdv: null, // demo targets weight by bond FDV alone
    poolShareUsd: null, // no operator money table in the demo
    poolShare: 0, // weighted below, once the whole set is known
  });
  const teams = DEFAULT_THEME.teams;
  const demoTeams = [
    { key: teams[0].key, name: teams[0].name, accent: teams[0].accent, players: 14, points: 1420 },
    { key: teams[1].key, name: teams[1].name, accent: teams[1].accent, players: 17, points: 1265 },
    { key: teams[2].key, name: teams[2].name, accent: teams[2].accent, players: 12, points: 990 },
  ];
  const targets = [
    target("beachclub.com", "BeachClub", "bonded", 1, -3, 0, 5000),
    target("sunscreen.xyz", "Sunscreen", "live", 0.8, -2, 1, 9500),
    target("cabana.io", "Cabana", "live", 0.45, -2, 2, 3500),
    target("tikibar.ai", "TikiBar", "live", 0.18, -1, 3, 600),
    target("mojito.xyz", "Mojito", "pending", 0, 2, 4, 10000),
  ];
  // Weighted per-contract pool share (ADR-0026), same math as the live snapshot.
  const demoTotW = targets.reduce((s, t) => s + (t.bondingFdv || 0), 0);
  for (const t of targets) t.poolShare = demoTotW > 0 ? (POOL_FULL_USD * (t.bondingFdv || 0)) / demoTotW : 0;
  // Demo leaderboard: descending Bounty across the three demo teams, with a mix
  // of geared (grid) and base looks, plus one deliberately-missing art path to
  // exercise the silhouette fallback. Dev-only; never rendered in production.
  const dp = (
    rank: number,
    name: string,
    ti: number,
    points: number,
    art: string,
  ): TopPlayer => ({
    rank,
    name,
    teamKey: demoTeams[ti].key,
    teamName: demoTeams[ti].name,
    accent: demoTeams[ti].accent,
    points,
    art,
  });
  const topPlayers: TopPlayer[] = [
    dp(1, "Nightshade", 0, 1420, "/s4-art/cast-grid-b3d2o1.png"),
    dp(2, "Vesper", 1, 1265, "/s4-art/cast-singularity-1.png"),
    dp(3, "El Vaquero", 0, 1180, "/s4-art/cast-grid-b1d4o2.png"),
    dp(4, "Ghost", 2, 990, "/s4-art/cast-agency-1.png"),
    dp(5, "Six", 1, 870, "/s4-art/cast-grid-b2d1o3.png"),
    dp(6, "Dead-Eye Rosa", 0, 760, "/s4-art/cast-frontier-1.png"),
    dp(7, "Cipher", 1, 645, "/s4-art/cast-grid-b0d3o4.png"),
    dp(8, "Agent", 2, 520, "/s4-art/cast-grid-b9d9o9.png"),
  ];
  return {
    seasonKey: "s4",
    theme: DEFAULT_THEME,
    targets,
    teams: demoTeams,
    topPlayers,
    totals: { bonded: 1, live: 3, total: 5, players: 43 },
    pool: {
      unlocked: POOL_FULL_USD / 5,
      full: POOL_FULL_USD,
      perBond: POOL_FULL_USD / 5,
    },
    season: { launchAt: iso(-3), endAt: iso(11) },
    nowMs: now,
    empty: false,
  };
}

export default async function S4MapPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  // Demo is DEV-ONLY. Only touch searchParams off-production: awaiting
  // searchParams opts a route into dynamic rendering, which would defeat the ISR
  // cache above. In production the route stays statically cached + revalidated.
  if (process.env.NODE_ENV !== "production") {
    const demo = (await searchParams)?.demo;
    if (demo) {
      const d = demoSnapshot();
      return (
        <>
          {INTRO_ENABLED ? <MapIntro /> : null}
          <HitListMap snap={d} poolLineText={poolLine(d)} />
        </>
      );
    }
  }
  let snap: Snapshot;
  try {
    snap = await getSeasonSnapshot();
  } catch {
    snap = emptySnapshot();
  }
  return (
    <>
      {INTRO_ENABLED ? <MapIntro /> : null}
      <HitListMap snap={snap} poolLineText={poolLine(snap)} />
    </>
  );
}
