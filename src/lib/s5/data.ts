/**
 * Launch Wars Season 5 (IRON SIEGE), the season snapshot (service-role read;
 * server-only). Mirrors the proven S4 shape (src/lib/s4/data.ts):
 *
 * - getSeasonSnapshot is wrapped in unstable_cache (60s): pages set
 *   `revalidate = 60` to match; NEVER force-dynamic/noStore.
 * - EVERY read is wrapped: a missing table (migration not run yet) returns an
 *   EMPTY snapshot, never throws, so the pages render pre-season.
 * - Pool numbers are computed HERE and nowhere else.
 *
 * PUBLIC-SAFE: points and per-target bond progress only. Never a wallet, a
 * balance, or any per-player dollar holding.
 */
import "server-only";
import { unstable_cache } from "next/cache";

/**
 * ONE TAG FOR THE WHOLE SEASON'S CACHED READS.
 *
 * These caches are keyed by a static string and took no tags, so there was NO
 * way to purge them: a targets-table flip sat behind a 60s data cache UNDER a
 * 60s ISR page, both stale-while-revalidate, and the front door could serve the
 * old board for minutes (Mike ran the 10-domain swap and the map kept showing
 * the old eleven). Tagging them means POST /api/s5/revalidate can drop every
 * S5 read the moment the operator changes the database.
 */
export const S5_CACHE_TAG = "s5-season";
import { s5Db, SEASON_KEY } from "./server";
import { POOL_FULL_USD, GAMES } from "./games";
import { STRINGS, fill, type S5Dict } from "./strings";
import { handleForPlayer } from "./handles";
import { resolveCommanderKey, resolveTank } from "./model";
import {
  DEFAULT_THEME,
  mergeTheme,
  type TargetStatus,
  type Theme,
} from "./theme";

export type { TargetStatus } from "./theme";
export { POOL_FULL_USD };

export type SeasonTarget = {
  domain: string;
  name: string;
  status: TargetStatus;
  progress: number; // 0..1 on the target's own bond curve
  /** Highest bond progress this target has held through an hourly close, 0..1
   * (the bot persists peak_normalized_progress; ADR-0076 payout basis). Reads
   * 0 until the SQL 040 migration runs; NEVER falls back to spot progress, so
   * the web can never show a peak the settlement would not pay. */
  peakProgress: number;
  launchAt: string | null;
  launched: boolean;
  /** When the wall broke. Drives the bounty HOLD CHECK countdown on the card
   * (breach + 48h), so a holder can see the deadline rather than be told a
   * rule. Null until it bonds. */
  bondedAt: string | null;
  sortOrder: number;
  /** On-chain token address once listed (public chain data); null until then.
   * The funding-status detector reads this for balanceOf checks. */
  tokenAddress: string | null;
  /** The bond amount for THIS target; null when unset. */
  bondingFdv: number | null;
  /** The starting FDV at launch; weight = bondingFdv - initialFdv (the RAISE). */
  initialFdv: number | null;
  /** Operator-set pool dollars for THIS stronghold (the S4 SQL 037 money-table
   * pattern); wins over weight math when set. */
  poolShareUsd: number | null;
  /** Operator-set flat breach bounty for THIS stronghold; null when unset. */
  bountyUsd: number | null;
  /** USD of the pool THIS target unlocks when it breaches (weighted). Filled in
   * by the snapshot once all targets are known. */
  poolShare: number;
  /** USD this target has ALREADY secured for the holders' pot under the
   * ADR-0076 peak rule: the full share once BREACHED, else the whole-percent
   * floor of its peak times the share (same cent math as the bot's
   * computePools, so display equals paid). Filled in by the snapshot. */
  securedUsd: number;
};

/** One row of the TOP COMMANDERS board: PUBLIC-safe. Name and Medals only,
 * NEVER the wallet and NEVER a personal dollar figure. */
export type TopCommander = {
  rank: number; // leaderboard position 1..N
  name: string; // display_name, or "Commander" when unnamed. Never the wallet.
  points: number; // Medals, rounded
  /** Public garage handle for /s5/hq/<handle>: the display-name slug, else
   * 0x + the first 8 hex of the wallet. NEVER the full wallet. */
  handle: string;
  /** What to DRAW for them on the siege map. Resolved server-side through the
   * same junk-tolerant resolvers the HQ uses, so a garbled hq blob renders the
   * starter tank rather than breaking the map. */
  tankKey: string;
  tankName: string;
  /** Their EARNED camo. The map sprite is drawn per tank AND per camo, so a
   * prize somebody won by topping the arcade is visible to everyone else on
   * the front - which is the entire point of awarding it. */
  camo: string;
  commanderKey: string;
  /** The stronghold they hold the most of, lowercased, or null if they hold
   * nothing. Drives WHERE they stand on the map; null means the staging area. */
  domain: string | null;
};

export type SeasonTotals = {
  bonded: number;
  live: number;
  total: number;
  players: number;
};

export type SeasonPool = {
  /** USD fully unlocked by breaches alone (bonded shares only). Display seam
   * for "unlocked by breaches"; the money view is `secured` below. */
  unlocked: number;
  full: number;
  /** USD already secured for the holders' pot under the ADR-0076 peak rule:
   * breached shares in full plus every standing wall's peak percent of its
   * share. The remainder (full - secured) is the GARRISON pot at settlement
   * (ADR-0098): commanders still holding a wall that already breached, split
   * by the Medals they earned on it after the breach. */
  secured: number;
  /** Real dollars already paid out this season (config key s5_paid_ledger; 0
   * until the first payout is recorded). */
  paidOutUsd: number;
};

/** Season window from the s5_season config row (JSON {launchAt,endAt}). */
export type SeasonWindow = { launchAt: string | null; endAt: string | null };

/**
 * THE FRONT REACTS. The bot owns the siege-sprint mechanic (modules/season5:
 * SPRINT_ARM_PCT 0.85, SPRINT_HOURS 48, config row s5_sprint_state shaped
 * `{[domain]: {arms, activeUntil, lastLapse, done}}`). The web NEVER arms,
 * ends or writes a sprint: it only READS that row and reacts.
 */
export type SeasonSprint = {
  /** true while at least one stronghold is inside its 48h window. */
  active: boolean;
  /** Lowercased domains currently under sprint (empty when none). */
  domains: string[];
  /** The LATEST activeUntil among them, ISO; null when nothing is running. */
  endsAt: string | null;
};

const NO_SPRINT: SeasonSprint = { active: false, domains: [], endsAt: null };

export type Snapshot = {
  seasonKey: "s5";
  theme: Theme;
  targets: SeasonTarget[];
  topCommanders: TopCommander[];
  gameBoards: GameBoard[];
  totals: SeasonTotals;
  pool: SeasonPool;
  season: SeasonWindow;
  /** Live siege-sprint state read off the bot's config row; never throws and
   * resolves to "no active sprint" when the row is missing or malformed. */
  sprint: SeasonSprint;
  nowMs: number; // server timestamp, so client countdowns don't drift
  /** true pre-season: migration not run yet or no targets seeded. */
  empty: boolean;
};

type Db = ReturnType<typeof s5Db>;

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

/** Merged theme (DEFAULT_THEME + the s5_theme config JSON), junk-tolerant. */
async function readTheme(db: Db): Promise<Theme> {
  const raw = await readConfigValue(db, "s5_theme");
  if (!raw) return DEFAULT_THEME;
  try {
    return mergeTheme(JSON.parse(raw));
  } catch {
    return DEFAULT_THEME;
  }
}

async function readSeason(db: Db): Promise<SeasonWindow> {
  const raw = await readConfigValue(db, "s5_season");
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

/** Dollars already paid out, from the s5_paid_ledger config row. Accepts a bare
 * number ("250") or JSON ({"total": 250} / {"paid": 250}); anything else is 0. */
async function readPaidOutUsd(db: Db): Promise<number> {
  const raw = await readConfigValue(db, "s5_paid_ledger");
  if (!raw) return 0;
  const direct = Number(raw);
  if (Number.isFinite(direct) && direct >= 0) return direct;
  try {
    const o = JSON.parse(raw) as { total?: unknown; paid?: unknown };
    const n = Number(o?.total ?? o?.paid);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** One usable entry off the s5_sprint_state row. Anything that does not parse
 * into this shape is dropped, so a half-written row degrades to "no sprint"
 * instead of throwing. */
type SprintRow = { domain: string; activeUntilMs: number };

/**
 * Parse the s5_sprint_state config value. Junk-tolerant by construction: a
 * missing row, a non-object, an array, a bad date, or a `done` entry all fall
 * out and leave an empty list. NEVER throws (same contract as readSeason).
 */
function parseSprintRows(raw: string | null): SprintRow[] {
  if (!raw) return [];
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return [];
    const out: SprintRow[] = [];
    for (const [domain, v] of Object.entries(o as Record<string, unknown>)) {
      if (!domain || !v || typeof v !== "object" || Array.isArray(v)) continue;
      const rec = v as { activeUntil?: unknown; done?: unknown };
      if (rec.done === true) continue; // bonded inside the window: sprint closed
      if (typeof rec.activeUntil !== "string") continue;
      const ms = Date.parse(rec.activeUntil);
      if (!Number.isFinite(ms)) continue;
      out.push({ domain: String(domain).toLowerCase(), activeUntilMs: ms });
    }
    return out;
  } catch {
    return [];
  }
}

/** Which of those rows are still running at nowMs. Pure, so the 60s cache can
 * hold the parsed rows and freshness stays evaluated per call. */
function sprintFrom(rows: SprintRow[], nowMs: number): SeasonSprint {
  const live = rows.filter((r) => r.activeUntilMs > nowMs).sort((a, b) => a.activeUntilMs - b.activeUntilMs);
  if (!live.length) return NO_SPRINT;
  return {
    active: true,
    domains: live.map((r) => r.domain),
    endsAt: new Date(live[live.length - 1].activeUntilMs).toISOString(),
  };
}

async function readSprintRows(db: Db): Promise<SprintRow[]> {
  return parseSprintRows(await readConfigValue(db, "s5_sprint_state"));
}

/** Sprint state on its own (for API routes that must not pay for the whole
 * snapshot). Same 60s cache seam; a 48h window makes 60s granularity free. */
async function _getSprintRows(): Promise<SprintRow[]> {
  try {
    return await readSprintRows(s5Db());
  } catch {
    return [];
  }
}
const getSprintRows = unstable_cache(_getSprintRows, ["s5-sprint-state"], {
  revalidate: 60,
  tags: [S5_CACHE_TAG],
});

export async function getSprint(): Promise<SeasonSprint> {
  try {
    return sprintFrom(await getSprintRows(), Date.now());
  } catch {
    // The cache seam itself failed (a caller outside a cacheable scope, say).
    // Fall back to a direct read, then to "no sprint": a sprint must never be
    // able to fail a run bank or a public feed.
    try {
      return sprintFrom(await readSprintRows(s5Db()), Date.now());
    } catch {
      return NO_SPRINT;
    }
  }
}

const KNOWN_STATUSES = new Set<TargetStatus>(["pending", "live", "bonded", "failed"]);

const TARGET_COLS =
  "domain,name,status,normalized_progress,launch_at,bonded_at,sort_order,token_address,bonding_fdv,initial_fdv,pool_share_usd,bounty_usd";

async function readTargets(db: Db, nowMs: number): Promise<SeasonTarget[]> {
  try {
    // peak_normalized_progress lands via the SQL 040 migration (ADR-0076). A
    // select naming a missing column errors the WHOLE read, so retry without
    // it rather than blanking the front on deploy order; peak then reads 0
    // (secured = breached shares only, conservative and honest).
    let rows: Record<string, unknown>[] | null = null;
    const primary = await db
      .from("launch_wars_s5_targets")
      .select(`${TARGET_COLS},peak_normalized_progress`)
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .order("sort_order", { ascending: true });
    if (!primary.error && primary.data) {
      rows = primary.data as Record<string, unknown>[];
    } else {
      const fallback = await db
        .from("launch_wars_s5_targets")
        .select(TARGET_COLS)
        .eq("season_key", SEASON_KEY)
        .eq("is_test", false)
        .order("sort_order", { ascending: true });
      if (!fallback.error && fallback.data) rows = fallback.data as Record<string, unknown>[];
    }
    if (!rows) return [];
    return rows.map((r) => {
      const launchAt = typeof r.launch_at === "string" ? r.launch_at : null;
      const launched = !!launchAt && nowMs >= new Date(launchAt).getTime();
      const bondedAt = typeof r.bonded_at === "string" ? r.bonded_at : null;
      const progress = Math.max(0, Math.min(1, Number(r.normalized_progress) || 0));
      // Same clamp as the bot's readers: close-basis peak only, never spot.
      const peakProgress = Math.max(0, Math.min(1, Number(r.peak_normalized_progress) || 0));
      const fdv = Number(r.bonding_fdv);
      const bondingFdv = Number.isFinite(fdv) && fdv > 0 ? fdv : null;
      const ifdv = Number(r.initial_fdv);
      const initialFdv = Number.isFinite(ifdv) && ifdv > 0 ? ifdv : null;
      const pshare = r.pool_share_usd === null || r.pool_share_usd === undefined ? null : Number(r.pool_share_usd);
      const poolShareUsd = pshare !== null && Number.isFinite(pshare) && pshare >= 0 ? pshare : null;
      const bty = r.bounty_usd === null || r.bounty_usd === undefined ? null : Number(r.bounty_usd);
      const bountyUsd = bty !== null && Number.isFinite(bty) && bty >= 0 ? bty : null;
      let status = (KNOWN_STATUSES.has(r.status as TargetStatus)
        ? (r.status as TargetStatus)
        : "pending") as TargetStatus;
      // S3 lesson: a target that has listed or shows any on-chain progress is at
      // least live. bonded/failed always win; only pending gets promoted.
      //
      // BUT "launched" IS ONLY A CLOCK. It means the listing HOUR has passed,
      // not that a token exists to buy. On launch morning hotcommerce.com read
      // UNDER SIEGE at the top of its card and "Not listed yet. There is
      // nothing to buy until it lists." in the middle of the same card, because
      // the badge came from the clock and the buy panel came from
      // token_address. The clock is the weaker signal, so it now needs a token
      // behind it; real on-chain progress still promotes on its own, since
      // progress cannot exist without a token anyway.
      const listed =
        typeof r.token_address === "string" && /^0x[0-9a-fA-F]{40}$/.test(r.token_address);
      if (status === "pending" && ((launched && listed) || progress > 0)) status = "live";
      return {
        bondedAt,
        domain: String(r.domain || "").toLowerCase(),
        name: String(r.name || r.domain || ""),
        status,
        progress,
        peakProgress,
        launchAt,
        launched,
        sortOrder: Number(r.sort_order) || 0,
        tokenAddress:
          typeof r.token_address === "string" && /^0x[0-9a-fA-F]{40}$/.test(r.token_address)
            ? r.token_address
            : null,
        bondingFdv,
        initialFdv,
        poolShareUsd,
        bountyUsd,
        poolShare: 0, // set once every target's weight is known
        securedUsd: 0, // set once poolShare is known
      };
    });
  } catch {
    return [];
  }
}

// A cached display_name that IS a raw wallet address must never reach a public
// board. Shorten it to the truncated 0x form; null/blank becomes "Commander".
const WALLET_NAME_RE = /^0x[0-9a-fA-F]{40}$/;
function publicName(raw: unknown): string {
  if (typeof raw !== "string") return "Commander";
  const s = raw.trim();
  if (!s) return "Commander";
  if (WALLET_NAME_RE.test(s)) return `${s.slice(0, 6)}…${s.slice(-4)}`;
  return s;
}

/**
 * EVERY PLAYER GOES ON THE MAP, not a top slice (Mike, 2026-08-04).
 *
 * This was 20, and that quietly contradicted the thing the board is for: S2, S3
 * and S4 all drew the whole roster, and page.tsx records that S4 locked it twice
 * ("the standings don't show the individuals like S3, people love this"). A cap
 * of 20 against a roster of 53 meant most of the season could not find itself on
 * the board, and anyone below the line who earned a camo would never see it fly.
 *
 * 500 is a ceiling against a runaway query, not a design limit. The standings
 * (top 12) and the OG image (top 5) slice this list themselves, so they are
 * unaffected; the extra cost is one wider IN list on the holdings read.
 */
const MAP_COMMANDER_CAP = 500;

async function readTopCommanders(db: Db): Promise<TopCommander[]> {
  try {
    // wallet is read ONLY to derive the truncated public handle below; it is
    // never stored on the row that reaches a page.
    const { data, error } = await db
      .from("launch_wars_s5_players")
      .select("display_name, points, wallet, hq")
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .order("points", { ascending: false })
      .limit(MAP_COMMANDER_CAP);
    if (error || !data) return [];

    // Where each of them stands: their LARGEST holding. One extra query inside
    // the same 60s snapshot cache. It fails soft: no holdings data just means
    // everyone musters in the staging area.
    //
    // BOUNDED SEPARATELY from the roster above. PostgREST puts an `in` list in
    // the query string, so handing it every wallet of a 500-player season would
    // build a ~20 KB URL. Only the leading slice needs a domain anyway: the
    // world map stopped positioning anyone by their holdings (ADR-0108), so this
    // field now feeds display alone.
    const wallets = data.slice(0, 60).map((r) => String(r.wallet || "")).filter(Boolean);
    const biggest = new Map<string, { domain: string; usd: number }>();
    if (wallets.length) {
      try {
        const { data: hold } = await db
          .from("launch_wars_s5_holdings")
          .select("wallet, domain, held_usd")
          .eq("season_key", SEASON_KEY)
          .eq("is_test", false)
          .in("wallet", wallets);
        for (const h of hold || []) {
          const w = String(h.wallet || "");
          const usd = Number(h.held_usd) || 0;
          if (!w || usd <= 0) continue;
          const cur = biggest.get(w);
          if (!cur || usd > cur.usd) biggest.set(w, { domain: String(h.domain || "").toLowerCase(), usd });
        }
      } catch {
        /* the map just musters everyone in the staging area */
      }
    }

    return data.map((row, i) => {
      const tank = resolveTank(row.hq);
      return {
        rank: i + 1,
        name: publicName(row.display_name),
        points: Math.round(Number(row.points) || 0),
        handle: handleForPlayer(row.display_name, row.wallet),
        tankKey: tank.tankKey,
        tankName: tank.tankName,
        camo: tank.camo,
        commanderKey: resolveCommanderKey(row.hq),
        domain: biggest.get(String(row.wallet || ""))?.domain ?? null,
      };
    });
  } catch {
    return [];
  }
}

/** One game's high-score table. Score is the duel currency: it buys nothing
 * (a banked run pays a flat 10 Medals whatever you scored), so it is pure
 * standing, which is exactly what makes it worth competing over. */
export type GameBoardRow = {
  rank: number;
  name: string;
  score: number;
  /** true when the shown score came from a practice run (past the attempts
   * budget; meta.practice_best). Counted scores pay; practice only ranks. */
  practice?: boolean;
};
export type GameBoard = { key: string; name: string; rows: GameBoardRow[] };

async function readGameBoards(db: Db): Promise<GameBoard[]> {
  const out: GameBoard[] = [];
  for (const g of GAMES) {
    if (g.comingSoon) continue;
    try {
      // Uses s5_scores_board_idx (season_key, game, score DESC) directly. A
      // wallet's row is already its best of the day per the table's unique
      // key, so this is a season high-score list without any aggregation.
      // PRACTICE RANKS TOO (Mike 2026-08-13): a row's shown score is
      // max(score, meta.practice_best), so the index order is only a
      // pre-sort - pull a wider slice, re-rank on the shown value, cut 5.
      // `score` itself stays counted-only (the bot's sweep/duels read it).
      const { data: raw } = await db
        .from("launch_wars_s5_scores")
        .select("wallet, score, meta")
        .eq("season_key", SEASON_KEY)
        .eq("game", g.key)
        .eq("is_test", false)
        .order("score", { ascending: false })
        .limit(40);
      const data = (raw || [])
        .map((r) => {
          const counted = Math.round(Number(r.score) || 0);
          const pb = Math.round(
            Number((r.meta as { practice_best?: number } | null)?.practice_best) || 0,
          );
          return { wallet: r.wallet, score: Math.max(counted, pb), practice: pb > counted };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      if (!data.length) {
        out.push({ key: g.key, name: g.name, rows: [] });
        continue;
      }
      // resolve display names in ONE bounded query rather than five
      const wallets = data.map((r) => String(r.wallet || "")).filter(Boolean);
      const names = new Map<string, string>();
      if (wallets.length) {
        try {
          const { data: ps } = await db
            .from("launch_wars_s5_players")
            .select("wallet, display_name")
            .eq("season_key", SEASON_KEY)
            .in("wallet", wallets);
          for (const p of ps || []) {
            names.set(String(p.wallet || ""), String(p.display_name || ""));
          }
        } catch {
          /* fall through to the truncated handle */
        }
      }
      out.push({
        key: g.key,
        name: g.name,
        rows: data.map((r, i) => {
          const w = String(r.wallet || "");
          return {
            rank: i + 1,
            name: publicName(names.get(w) || "") || handleForPlayer(names.get(w) || "", w),
            score: r.score,
            ...(r.practice ? { practice: true as const } : {}),
          };
        }),
      });
    } catch {
      out.push({ key: g.key, name: g.name, rows: [] });
    }
  }
  return out;
}

async function readPlayerCount(db: Db): Promise<number> {
  try {
    const { count } = await db
      .from("launch_wars_s5_players")
      .select("id", { count: "exact", head: true })
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false);
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ── Prize weighting (the proven ADR-0026 math, ported) ──────────────────────
// A target unlocks a slice of the pool in PROPORTION to its bonding difficulty
// (the FDV raise required), so pricey strongholds are worth far more to breach.
// The operator money table (pool_share_usd) wins over weight math per target.
function targetWeightUsd(t: SeasonTarget): number {
  if (!t.bondingFdv || t.bondingFdv <= 0) return 0;
  if (t.initialFdv && t.initialFdv > 0 && t.initialFdv < t.bondingFdv) return t.bondingFdv - t.initialFdv;
  return t.bondingFdv;
}
function targetPoolShareUsd(t: SeasonTarget, targets: SeasonTarget[], poolUsd: number): number {
  if (t.poolShareUsd !== null && t.poolShareUsd >= 0) return t.poolShareUsd;
  // STATUS-BLIND denominator (ADR-0076, mirrors the bot's poolWeights;
  // supersedes ADR-0056's redistribute-on-fail): EVERY target keeps its share
  // for the whole season. Under the peak rule a failed wall still PAYS its
  // peak percent, so filtering failed out here would silently inflate the
  // survivors' shares AND double-count the failed wall's money. The unclosed
  // remainder flows visibly to the season's top-10 Medals pot instead.
  const totW = targets.reduce((s, x) => s + targetWeightUsd(x), 0);
  if (totW <= 0) return poolUsd / Math.max(1, targets.length);
  return poolUsd * (targetWeightUsd(t) / totW);
}
function poolUnlockedUsd(targets: SeasonTarget[], poolUsd: number): number {
  return targets
    .filter((t) => t.status === "bonded")
    .reduce((s, t) => s + targetPoolShareUsd(t, targets, poolUsd), 0);
}

// ── ADR-0076 peak rule: the secured math (mirrors the bot's computePools) ────
// Whole-percent FLOOR of the persisted hourly-close peak, so the displayed %
// always equals the paid %. The +1e-9 epsilon defeats IEEE noise (0.83 * 100 =
// 82.999...; without it a true 83% peak would floor to 82). Bonded pays 100.
// Exported for the map surface: every peak % a player sees is THIS number, so
// display can never show a percent the settlement would not pay.
export function paidPeakPct(t: SeasonTarget): number {
  if (t.status === "bonded") return 100;
  return Math.floor(Math.max(0, Math.min(1, t.peakProgress)) * 100 + 1e-9);
}
/** USD a target has secured for the holders' pot: bonded = the full share,
 * else peak% of the share, in integer cents exactly like the bot, so the web
 * number can never drift from what settlement pays. */
function targetSecuredUsd(t: SeasonTarget): number {
  const shareCents = Math.round(t.poolShare * 100);
  if (t.status === "bonded") return shareCents / 100;
  return Math.floor((shareCents * paidPeakPct(t)) / 100 + 1e-6) / 100;
}

/**
 * Fill poolShare + securedUsd on a target list and return the pool aggregates.
 * Pure, and the ONE money seam: the live snapshot below AND the dev-only map
 * preview (/s5/map?preview=1) both go through it, so a preview render can
 * never drift from the production math (weights, peak floor, cent rounding).
 */
export function finalizeTargetMoney(
  targets: SeasonTarget[],
  poolUsd: number = POOL_FULL_USD,
): { unlocked: number; secured: number } {
  for (const tg of targets) tg.poolShare = targetPoolShareUsd(tg, targets, poolUsd);
  for (const tg of targets) tg.securedUsd = targetSecuredUsd(tg);
  return {
    unlocked: poolUnlockedUsd(targets, poolUsd),
    secured: Math.round(targets.reduce((s, t) => s + t.securedUsd * 100, 0)) / 100,
  };
}

async function _getSeasonSnapshot(): Promise<Snapshot> {
  const nowMs = Date.now();

  let db: Db | null = null;
  try {
    db = s5Db();
  } catch {
    db = null; // env not configured: still render an empty pre-season snapshot
  }

  const theme = db ? await readTheme(db) : DEFAULT_THEME;
  const season = db ? await readSeason(db) : { launchAt: null, endAt: null };
  const targets = db ? await readTargets(db, nowMs) : [];
  const topCommanders = db ? await readTopCommanders(db) : [];
  const gameBoards = db ? await readGameBoards(db) : [];
  const players = db ? await readPlayerCount(db) : 0;
  const paidOutUsd = db ? await readPaidOutUsd(db) : 0;
  const sprint = db ? sprintFrom(await readSprintRows(db), nowMs) : NO_SPRINT;

  const totals: SeasonTotals = {
    bonded: targets.filter((t) => t.status === "bonded").length,
    live: targets.filter((t) => t.status === "live").length,
    total: targets.length,
    players,
  };

  // Shares first (the secured math needs them), then the per-target and
  // pool-level secured numbers under the ADR-0076 peak rule, all through the
  // one finalizeTargetMoney seam (shared with the dev-only map preview).
  const money = finalizeTargetMoney(targets, POOL_FULL_USD);

  const pool: SeasonPool = {
    unlocked: money.unlocked,
    full: POOL_FULL_USD,
    secured: money.secured,
    paidOutUsd,
  };

  return {
    seasonKey: "s5",
    theme,
    targets,
    topCommanders,
    gameBoards,
    totals,
    pool,
    season,
    sprint,
    nowMs,
    empty: targets.length === 0,
  };
}
// 60s snapshot cache (the S4 lesson: per-navigation round-trips read as a slow
// site; the underlying holdings source refreshes hourly anyway).
export const getSeasonSnapshot = unstable_cache(_getSeasonSnapshot, ["s5-season-snapshot"], {
  revalidate: 60,
  tags: [S5_CACHE_TAG],
});

/** Theme only (for API responses that name the Column). Same tolerance. */
async function _getTheme(): Promise<Theme> {
  try {
    return await readTheme(s5Db());
  } catch {
    return DEFAULT_THEME;
  }
}
// 60s, not 300: a theme edit that takes five minutes to appear reads as a
// broken deploy. Same tag as everything else, so one purge clears the season.
export const getTheme = unstable_cache(_getTheme, ["s5-theme"], {
  revalidate: 60,
  tags: [S5_CACHE_TAG],
});

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * The shared pool line (one surface, no other dollar math anywhere). Honest:
 * unlocked of full, weighted wording, never a promise. Pass a locale dict to
 * localize; the default (no dict) is byte-for-byte the English line.
 */
export function poolLine(snapshot: Snapshot, d: S5Dict = STRINGS.en): string {
  if (snapshot.totals.total > 0 && snapshot.totals.bonded >= snapshot.totals.total) {
    return fill(d.pool.fullInPlay, { full: usd(snapshot.pool.full) });
  }
  return fill(d.pool.unlockedLine, {
    unlocked: usd(snapshot.pool.unlocked),
    full: usd(snapshot.pool.full),
  });
}
