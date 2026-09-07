/**
 * Launch Wars Season 4 — the season snapshot (service-role read; server-only).
 *
 * One typed JSON snapshot every S4 surface renders from: targets (with live
 * bond status/progress), team standings, totals, the prize pool math, the
 * season window, and the merged THEME. Mirrors the proven S3 shape
 * (src/lib/stars/map.ts getSectorSnapshot) with the S4 upgrades:
 *
 * - getSeasonSnapshot/getTheme are wrapped in unstable_cache (60s / 300s): the
 *   holdings source refreshes hourly, so a per-navigation Supabase round-trip was
 *   pure latency. Pages set `revalidate` to match. (Was force-dynamic + noStore,
 *   which re-queried on EVERY tab click and read as a slow site.)
 * - Targets/teams come from the DB, never a hardcoded const mirror (kills the
 *   S3 web/bot drift class).
 * - EVERY read is wrapped: a missing table (migration not run yet) returns an
 *   EMPTY snapshot, never throws, so the pages render pre-season.
 * - Pool numbers are computed HERE and nowhere else (S3 hardcoded $1,000 in
 *   multiple components).
 *
 * PUBLIC-SAFE: team sizes, points, and per-target bond progress only. Never a
 * wallet, a balance, or any dollar holding.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { s4Db, SEASON_KEY } from "./server";
import { resolveModel } from "./model";
import {
  DEFAULT_THEME,
  mergeTheme,
  type TargetStatus,
  type Theme,
} from "./theme";

export type { TargetStatus } from "./theme";

// The season pool total lives in games.ts (client-safe); re-exported here so
// existing server-side imports of it from data.ts keep working. The client map
// imports it directly from games.ts to stay clear of this server-only module.
import { POOL_FULL_USD } from "./games";
export { POOL_FULL_USD };

export type SeasonTarget = {
  domain: string;
  name: string;
  status: TargetStatus;
  progress: number; // 0..1 on the target's own bond curve
  launchAt: string | null;
  launched: boolean; // launchAt has passed
  sortOrder: number;
  /** The bond amount for THIS target (the contract's "worth"); null when unset. */
  bondingFdv: number | null;
  /** The starting FDV at launch; weight = bondingFdv - initialFdv (the RAISE required). */
  initialFdv: number | null;
  /** Operator-set dollars for THIS contract (SQL 037); wins over weight math when set. */
  poolShareUsd: number | null;
  /** USD of the prize pool THIS target unlocks when it bonds, weighted by bonding
   * difficulty (ADR-0026). Filled in by the snapshot once all targets are known. */
  poolShare: number;
};

export type TeamStanding = {
  key: string;
  name: string;
  accent: string;
  players: number;
  points: number;
};

/**
 * A single row of the TOP AGENTS leaderboard: one player, PUBLIC-safe.
 * Name, team, and Bounty (points) only. NEVER the wallet, and NEVER the
 * per-player dollar payout (that stays private in Discord /assassin me).
 */
export type TopPlayer = {
  rank: number; // leaderboard position 1..20 (from the points-sorted index)
  name: string; // display_name, or "Agent" when unnamed. Never the wallet.
  teamKey: string; // stable team key (alpha/beta/gamma); "" when unjoined
  teamName: string; // themed team name (from theme.teams by key); "" when unknown
  accent: string; // team accent color (from theme.teams by key)
  points: number; // Bounty, rounded
  art: string; // resolved character art src (per-team base look when no skin)
};

export type SeasonTotals = {
  bonded: number;
  live: number;
  total: number;
  players: number;
};

export type SeasonPool = {
  unlocked: number; // POOL_FULL_USD * (bonded weight / total weight) — ADR-0026
  full: number; // POOL_FULL_USD
  perBond: number; // legacy flat 1/N (kept for compatibility; copy no longer uses it)
  /** Failed contracts' slices: forfeited for good, never redistributed. The
   * headline "in play" number = full - forfeited (Mike 2026-07-20). */
  forfeited?: number;
};

/** Season window from the s4_season config row (JSON {launchAt,endAt}); nulls pre-config. */
export type SeasonWindow = { launchAt: string | null; endAt: string | null };

export type Snapshot = {
  seasonKey: "s4";
  theme: Theme;
  targets: SeasonTarget[];
  teams: TeamStanding[]; // sorted by points desc (the standings order)
  topPlayers: TopPlayer[]; // top 20 players by Bounty, for the TOP AGENTS board
  totals: SeasonTotals;
  pool: SeasonPool;
  season: SeasonWindow;
  nowMs: number; // server timestamp, so client countdowns don't drift on hydration
  /** true pre-season: migration not run yet or no targets seeded. */
  empty: boolean;
};

type Db = ReturnType<typeof s4Db>;

async function readConfigValue(db: Db, key: string): Promise<string | null> {
  try {
    const { data } = await db
      .from("launch_wars_boss_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    return typeof data?.value === "string" ? data.value : null;
  } catch {
    return null;
  }
}

/** Merged theme (DEFAULT_THEME + the s4_theme config JSON), tolerant of missing/bad JSON. */
async function readTheme(db: Db): Promise<Theme> {
  const raw = await readConfigValue(db, "s4_theme");
  if (!raw) return DEFAULT_THEME;
  try {
    return mergeTheme(JSON.parse(raw));
  } catch {
    return DEFAULT_THEME;
  }
}

async function readSeason(db: Db): Promise<SeasonWindow> {
  const raw = await readConfigValue(db, "s4_season");
  if (!raw) return { launchAt: null, endAt: null };
  try {
    const o = JSON.parse(raw) as { launchAt?: unknown; endAt?: unknown };
    return {
      launchAt: typeof o?.launchAt === "string" ? o.launchAt : null,
      endAt: typeof o?.endAt === "string" ? o.endAt : null,
    };
  } catch {
    return { launchAt: null, endAt: null };
  }
}

const KNOWN_STATUSES = new Set<TargetStatus>(["pending", "live", "bonded", "failed"]);

async function readTargets(db: Db, nowMs: number): Promise<SeasonTarget[]> {
  try {
    const { data, error } = await db
      .from("launch_wars_s4_targets")
      .select("domain,name,status,normalized_progress,launch_at,sort_order,bonding_fdv,initial_fdv,pool_share_usd")
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .order("sort_order", { ascending: true });
    if (error || !data) return [];
    return data.map((r) => {
      const launchAt = typeof r.launch_at === "string" ? r.launch_at : null;
      const launched = !!launchAt && nowMs >= new Date(launchAt).getTime();
      const progress = Math.max(0, Math.min(1, Number(r.normalized_progress) || 0));
      const fdv = Number(r.bonding_fdv);
      const bondingFdv = Number.isFinite(fdv) && fdv > 0 ? fdv : null;
      const ifdv = Number(r.initial_fdv);
      const initialFdv = Number.isFinite(ifdv) && ifdv > 0 ? ifdv : null;
      const pshare = r.pool_share_usd === null || r.pool_share_usd === undefined ? null : Number(r.pool_share_usd);
      const poolShareUsd = pshare !== null && Number.isFinite(pshare) && pshare >= 0 ? pshare : null;
      let status = (KNOWN_STATUSES.has(r.status as TargetStatus)
        ? (r.status as TargetStatus)
        : "pending") as TargetStatus;
      // S3 lesson (the "60% lit but Standby" bug): a target that has listed
      // (launch time passed) or shows any on-chain bond progress is at least
      // live. bonded/failed always win; only pending gets promoted.
      if (status === "pending" && (launched || progress > 0)) status = "live";
      return {
        domain: String(r.domain || "").toLowerCase(),
        name: String(r.name || r.domain || ""),
        status,
        progress,
        launchAt,
        launched,
        sortOrder: Number(r.sort_order) || 0,
        bondingFdv,
        initialFdv,
        poolShareUsd,
        poolShare: 0, // set by the snapshot once every target's weight is known
      };
    });
  } catch {
    return [];
  }
}

async function readTeamAggregates(
  db: Db,
): Promise<Map<string, { players: number; points: number }>> {
  const agg = new Map<string, { players: number; points: number }>();
  try {
    const { data, error } = await db
      .from("launch_wars_s4_players")
      .select("team_key, points")
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .not("team_key", "is", null)
      .limit(10000);
    if (error || !data) return agg;
    for (const row of data) {
      const key = String(row.team_key);
      const cur = agg.get(key) || { players: 0, points: 0 };
      cur.players += 1;
      cur.points += Math.round(Number(row.points) || 0);
      agg.set(key, cur);
    }
  } catch {
    // missing table / pre-migration: empty standings
  }
  return agg;
}

// Some players' cached display_name IS their raw wallet address (wallet-first
// link with no Discord name). A public board must never show a full wallet
// (privacy) and a 42-char hex string wrecks the premium layout, so shorten a
// wallet-shaped name to the standard truncated 0x form. Real names pass through;
// null/blank becomes "Agent". This is the ONE place a name becomes public-safe.
const WALLET_NAME_RE = /^0x[0-9a-fA-F]{40}$/;
function publicPlayerName(raw: unknown): string {
  if (typeof raw !== "string") return "Agent";
  const s = raw.trim();
  if (!s) return "Agent";
  if (WALLET_NAME_RE.test(s)) return `${s.slice(0, 6)}…${s.slice(-4)}`;
  return s;
}

// EVERY ungeared player resolves to the SAME team base look (cast-<era>-1, or
// -m1 for the male toggle), so a whole team reads as one cloned character (Mike
// 2026-07-15). Spread the ungeared agents across the THREE base looks of their
// gender by a stable per-player hash (FNV-1a over the wallet), so the map crowd
// and the board vary. Geared players (a real grid combo) are left untouched.
// All six base cutouts (1/2/3 + m1/m2/m3) already exist under /s4-art/cut/.
const BASE_ART_RE = /^\/s4-art\/cast-(frontier|singularity|agency)-(m?)1\.png$/;
function variedBaseArt(art: string, seed: string): string {
  const m = BASE_ART_RE.exec(art);
  if (!m) return art; // geared or unrecognized — keep the resolved art
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const v = (h % 3) + 1; // 1..3, stable per seed
  return `/s4-art/cast-${m[1]}-${m[2]}${v}.png`;
}

/**
 * The top players by Bounty. PUBLIC-safe: selects name, team, points, and the
 * cosmetic skin only (never the wallet). Character art resolves through
 * resolveModel, which is fully tolerant: a missing or empty skin (the launch-day
 * default, since most players never geared up) resolves to the team-flavored
 * base look, so every row renders a character, not a break. Rank is the
 * leaderboard POSITION (the sorted index + 1), not the DB rank ladder. Limit 60
 * (was 20): the MAP now renders the WHOLE team swarm (Mike 2026-07-15, S3
 * parity — "show all characters like in Stars"), so it needs the full roster,
 * not just a top slice; the board leaderboard slices back to 20 itself.
 * Error-tolerant like every other read here: a missing table or a bad query
 * returns an EMPTY list, never throws.
 */
async function readTopPlayers(db: Db, theme: Theme): Promise<TopPlayer[]> {
  try {
    const { data, error } = await db
      .from("launch_wars_s4_players")
      .select("wallet, display_name, team_key, points, skin, rank")
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .order("points", { ascending: false })
      .limit(60);
    if (error || !data) return [];
    const byKey = new Map(theme.teams.map((tm) => [tm.key, tm]));
    return data.map((row, i) => {
      const teamKey = typeof row.team_key === "string" ? row.team_key : "";
      const team = byKey.get(teamKey);
      return {
        rank: i + 1,
        name: publicPlayerName(row.display_name),
        teamKey,
        teamName: team?.name ?? "",
        accent: team?.accent ?? "#8b95ad",
        points: Math.round(Number(row.points) || 0),
        // Vary the base look so a team is not one cloned character (see below).
        // wallet is the stable per-player seed (server-only; never returned).
        art: variedBaseArt(
          resolveModel(row.skin, teamKey || null).art,
          String(row.wallet || row.display_name || i),
        ),
      };
    });
  } catch {
    // missing table / pre-migration: empty leaderboard
    return [];
  }
}

// ── Prize weighting (ADR-0026) ───────────────────────────────────────────────
// A target unlocks a slice of the pool in PROPORTION to its bonding difficulty
// (bondingFdv), so the pricey domains are worth far more to bond than the cheap
// ones — there is no farming the cheapest. Mirrors the bot's poolUnlockedUsd
// EXACTLY so the site and the actual payout can never disagree. Missing FDVs
// everywhere → equal weights (the old flat model), never NaN.
function targetWeightUsd(t: SeasonTarget): number {
  if (!t.bondingFdv || t.bondingFdv <= 0) return 0;
  // Weight = the FDV RAISE required (bond - start), Mike 2026-07-20; falls back
  // to bond FDV alone pre-backfill. Mirrors the bot's targetWeight EXACTLY.
  if (t.initialFdv && t.initialFdv > 0 && t.initialFdv < t.bondingFdv) return t.bondingFdv - t.initialFdv;
  return t.bondingFdv;
}
// Redistribution ruling (Mike 2026-07-20, one-time, "for impact"): a failed
// contract drops out of the weight denominator so the survivors carry more.
// The OPERATOR MONEY TABLE (pool_share_usd, SQL 037) wins over weight math per
// target. Mirrors the bot's helpers EXACTLY.
function targetPoolShareUsd(t: SeasonTarget, targets: SeasonTarget[], poolUsd: number): number {
  if (t.poolShareUsd !== null && t.poolShareUsd >= 0) return t.poolShareUsd;
  const live = targets.filter((x) => x.status !== "failed");
  const totW = live.reduce((s, x) => s + targetWeightUsd(x), 0);
  if (totW <= 0) return poolUsd / Math.max(1, live.length);
  return poolUsd * (targetWeightUsd(t) / totW);
}
function poolUnlockedUsd(targets: SeasonTarget[], poolUsd: number): number {
  return targets
    .filter((t) => t.status === "bonded")
    .reduce((s, t) => s + targetPoolShareUsd(t, targets, poolUsd), 0);
}
// Nothing forfeits under the redistribution ruling; kept so the forfeit copy
// stays dormant rather than deleted.
function poolForfeitedUsd(): number {
  return 0;
}

async function _getSeasonSnapshot(): Promise<Snapshot> {
  const nowMs = Date.now();

  let db: Db | null = null;
  try {
    db = s4Db();
  } catch {
    db = null; // env not configured: still render an empty pre-season snapshot
  }

  const theme = db ? await readTheme(db) : DEFAULT_THEME;
  const season = db ? await readSeason(db) : { launchAt: null, endAt: null };
  const targets = db ? await readTargets(db, nowMs) : [];
  const agg = db ? await readTeamAggregates(db) : new Map<string, { players: number; points: number }>();
  const topPlayers = db ? await readTopPlayers(db, theme) : [];

  const teams: TeamStanding[] = theme.teams.map((t) => {
    const a = agg.get(t.key) || { players: 0, points: 0 };
    return { key: t.key, name: t.name, accent: t.accent, players: a.players, points: a.points };
  });
  // A team_key in the DB that the theme does not know still shows up (belt and
  // suspenders; should never happen since keys are stable).
  const known = new Set(teams.map((t) => t.key));
  Array.from(agg.entries())
    .filter(([key]) => !known.has(key))
    .forEach(([key, a]) => {
      teams.push({ key, name: key, accent: "#8b95ad", players: a.players, points: a.points });
    });
  teams.sort((a, b) => b.points - a.points || b.players - a.players || a.key.localeCompare(b.key));

  const totals: SeasonTotals = {
    bonded: targets.filter((t) => t.status === "bonded").length,
    live: targets.filter((t) => t.status === "live").length,
    total: targets.length,
    players: teams.reduce((s, t) => s + t.players, 0),
  };

  const pool: SeasonPool = {
    unlocked: poolUnlockedUsd(targets, POOL_FULL_USD), // weighted by the FDV raise required
    full: POOL_FULL_USD,
    perBond: POOL_FULL_USD / Math.max(1, totals.total),
    forfeited: poolForfeitedUsd(), // 0 under the redistribution ruling
  };
  // What each contract unlocks when it bonds (the map card's "unlocks $Y" line) —
  // the pricey targets unlock far more, so bonding the cheapest is not the play.
  for (const tg of targets) tg.poolShare = targetPoolShareUsd(tg, targets, POOL_FULL_USD);

  return {
    seasonKey: "s4",
    theme,
    targets,
    teams,
    topPlayers,
    totals,
    pool,
    season,
    nowMs,
    empty: targets.length === 0,
  };
}
// Cache the snapshot for 60s: the holdings source only refreshes hourly, so a
// per-navigation Supabase round-trip was pure latency. This makes tab-to-tab
// nav instant while staying far fresher than the underlying data. (Replaces the
// old force-dynamic + noStore path; pages set `revalidate` for the route cache.)
export const getSeasonSnapshot = unstable_cache(_getSeasonSnapshot, ["s4-season-snapshot"], { revalidate: 60 });

/** Theme only (for API responses that name a team). Same tolerance as the snapshot. */
async function _getTheme(): Promise<Theme> {
  try {
    return await readTheme(s4Db());
  } catch {
    return DEFAULT_THEME;
  }
}
// Theme changes rarely (a config write); cache it longer.
export const getTheme = unstable_cache(_getTheme, ["s4-theme"], { revalidate: 300 });

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * The shared pool line (guide lesson #16: on every surface, no other $ math).
 * Weighted by bonding difficulty (ADR-0026): "$X of $500 unlocked · bigger
 * targets unlock a bigger slice, so the pricey ones are worth the most."
 */
export function poolLine(snapshot: Snapshot): string {
  const t = snapshot.theme;
  const forfeited = Math.round(snapshot.pool.forfeited || 0);
  const inPlay = Math.max(0, snapshot.pool.full - forfeited);
  const gone = forfeited > 0 ? ` · ${usd(forfeited)} expired unclaimed, off the table for good` : "";
  if (snapshot.totals.total > 0 && snapshot.totals.bonded >= snapshot.totals.total) {
    return `The full ${usd(inPlay)} is in play${gone}`;
  }
  return `${usd(snapshot.pool.unlocked)} of ${usd(inPlay)} unlocked${gone} · bigger ${t.target.plural} unlock a bigger slice, so the pricey ones are worth the most`;
}
