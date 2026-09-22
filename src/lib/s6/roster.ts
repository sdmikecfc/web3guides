import "server-only";
/**
 * THE ROSTER — every pilot in the season, readable by anyone.
 *
 * PUBLIC-SAFE BY CONSTRUCTION, and this is the load-bearing rule of the file,
 * copied deliberately from lib/s6/publicHq.ts: no row that leaves here may
 * carry a WALLET or a DOLLAR FIGURE of any kind. Wallets are read (to derive
 * the truncated public handle and to join holdings) and then dropped; they
 * never reach a returned object. Note the near-miss that publicHq.ts already
 * documents: buildHqView returns peakUsd and buildView simply does not copy it
 * across. Same discipline here. If you add a field, ask what it leaks first.
 *
 * WHY ITS OWN FILE rather than an extension of lib/s6/data.ts: getSeasonSnapshot
 * is one cached blob that EVERY s6 page awaits, including the landing. Folding a
 * 500-row roster read into it would make the camp pay for the roster. This
 * follows the lib/s6/warEffort.ts precedent instead — a sibling server-only
 * reader with its own cache, awaited only by the page that needs it.
 */
import { unstable_cache } from "next/cache";
import { s6Db, SEASON_KEY } from "./server";
import { resolvePilotKey, resolveTank } from "./model";
import { handleForPlayer, publicCallsign, rankName } from "./handles";

/** The five upgrade levels, 0..5, as the garage shows them. */
export type RosterStats = {
  armor: number;
  engine: number;
  smoke: number;
  caliber: number;
  optics: number;
};

/** One pilot, safe for any public surface. */
export type RosterRow = {
  /** Position in the Signal ordering, 1-based. */
  rank: number;
  name: string;
  /** Public garage handle for /s6/hq/<handle>. May be "" when the wallet is
   * garbled; callers MUST guard, exactly as board/page.tsx already does. */
  handle: string;
  points: number;
  /** The Recruit..Field Marshal ladder name, from bonds tier. */
  rankName: string;
  tankKey: string;
  tankName: string;
  pilotKey: string;
  stats: RosterStats;
  /** Which mainframe they camp at on the explore map, or null to muster. */
  domain: string | null;
};

export type RosterPage = {
  rows: RosterRow[];
  /** Opaque keyset cursor for the next page, or null at the end. */
  nextCursor: string | null;
};

const PAGE_MAX = 50;
/** How deep the roster can be walked at all. Bounded reads are house style
 * (publicHq.ts caps its name lookup at 1000) and it stops this being usable as
 * a scraping endpoint. */
const DEPTH_MAX = 2000;

/** 0..5 from a raw skin value. Mirrors statsOf in /api/s6/me. */
function statLevel(raw: unknown): number {
  const n = Math.floor(Number(raw) || 0);
  return Math.max(0, Math.min(5, n));
}

/** The five levels out of a skin JSONB blob. `aura` carries a legacy 0..30
 * weapon ladder, so its thresholds map onto 1..5 the same way the me-route
 * does; anything else clamps. */
function statsOf(skinRaw: unknown): RosterStats {
  const skin =
    skinRaw && typeof skinRaw === "object" && !Array.isArray(skinRaw)
      ? (skinRaw as Record<string, unknown>)
      : {};
  const auraRaw = Math.floor(Number(skin.aura) || 0);
  const caliber =
    auraRaw > 5 ? [1, 5, 10, 20, 30].filter((t) => auraRaw >= t).length : statLevel(auraRaw);
  return {
    armor: statLevel(skin.botox),
    engine: statLevel(skin.drugs),
    smoke: statLevel(skin.ozempic),
    caliber,
    optics: statLevel(skin.optics),
  };
}

/** Where each wallet camps: their LARGEST holding. Bounded IN list, fails soft
 * to "everyone musters in the staging area". Mirrors readTopPilots. */
type Db = NonNullable<ReturnType<typeof s6Db>>;

async function biggestHoldings(db: Db, wallets: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!wallets.length) return out;
  try {
    const { data } = await db
      .from("launch_wars_s6_holdings")
      .select("wallet, domain, held_usd")
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .in("wallet", wallets);
    const best = new Map<string, number>();
    for (const h of data || []) {
      const w = String(h.wallet || "");
      const usd = Number(h.held_usd) || 0;
      if (!w || usd <= 0) continue;
      if (usd > (best.get(w) ?? 0)) {
        best.set(w, usd);
        out.set(w, String(h.domain || "").toLowerCase());
      }
    }
  } catch {
    /* no holdings data: everyone musters */
  }
  return out;
}

/** Encode/decode the keyset cursor. `id` is an opaque BIGSERIAL, never a
 * wallet, so nothing sensitive rides in a URL. */
function encodeCursor(points: number, id: number, seen: number): string {
  return Buffer.from(`${points}:${id}:${seen}`).toString("base64url");
}
function decodeCursor(raw: string | null | undefined): { points: number; id: number; seen: number } | null {
  if (!raw) return null;
  try {
    const [p, i, s] = Buffer.from(raw, "base64url").toString("utf8").split(":");
    const points = Number(p);
    const id = Number(i);
    const seen = Number(s);
    if (!Number.isFinite(points) || !Number.isFinite(id) || !Number.isFinite(seen)) return null;
    return { points, id, seen };
  } catch {
    return null;
  }
}

async function readRoster(cursorRaw: string | null, pageSize: number): Promise<RosterPage> {
  const db = s6Db();
  if (!db) return { rows: [], nextCursor: null };
  const size = Math.max(1, Math.min(PAGE_MAX, Math.floor(pageSize) || PAGE_MAX));
  const cursor = decodeCursor(cursorRaw);
  const seen = cursor?.seen ?? 0;
  if (seen >= DEPTH_MAX) return { rows: [], nextCursor: null };

  try {
    // KEYSET, never OFFSET. Signal move continuously (every banked run calls
    // s6_grant), so an OFFSET page 2 taken a second after page 1 duplicates or
    // drops rows. The (points, id) tiebreak is not optional either: everyone
    // starts on 0 Signal, so ties are the COMMON case in week one and without
    // a stable second key the ordering is not deterministic between pages.
    let q = db
      .from("launch_wars_s6_players")
      .select("id, display_name, wallet, points, hq, skin")
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .order("points", { ascending: false })
      .order("id", { ascending: false })
      .limit(size + 1); // the +1 probes for a next page without a second query

    if (cursor) {
      q = q.or(
        `points.lt.${cursor.points},and(points.eq.${cursor.points},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await q;
    if (error || !data) return { rows: [], nextCursor: null };

    const hasMore = data.length > size;
    const page = hasMore ? data.slice(0, size) : data;

    const wallets = page.map((r) => String(r.wallet || "")).filter(Boolean);
    const camps = await biggestHoldings(db, wallets);

    const rows: RosterRow[] = page.map((row, i) => {
      const tank = resolveTank(row.hq);
      const hq =
        row.hq && typeof row.hq === "object" && !Array.isArray(row.hq)
          ? (row.hq as Record<string, unknown>)
          : {};
      return {
        rank: seen + i + 1,
        name: publicCallsign(row.display_name),
        handle: handleForPlayer(row.display_name, row.wallet),
        points: Math.round(Number(row.points) || 0),
        rankName: rankName(hq.bonds_tier),
        tankKey: tank.tankKey,
        tankName: tank.tankName,
        pilotKey: resolvePilotKey(row.hq),
        stats: statsOf(row.skin),
        domain: camps.get(String(row.wallet || "")) ?? null,
      };
      // NOTE: row.wallet stops here. It is never spread into the result.
    });

    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last && seen + rows.length < DEPTH_MAX
        ? encodeCursor(Math.round(Number(last.points) || 0), Number(last.id) || 0, seen + rows.length)
        : null;

    return { rows, nextCursor };
  } catch {
    return { rows: [], nextCursor: null };
  }
}

/** Page 1 is cached with the rest of the season's 60s reads; deeper pages come
 * through the API route uncached-but-CDN-fronted. */
export const getRosterPage1 = unstable_cache(
  async () => readRoster(null, PAGE_MAX),
  ["s6-roster-p1"],
  { revalidate: 60 },
);

export async function getRoster(cursor: string | null, pageSize = PAGE_MAX): Promise<RosterPage> {
  if (!cursor) return getRosterPage1();
  return readRoster(cursor, pageSize);
}

/**
 * The pilots DRAWN on the explore map.
 *
 * Capped at 40, and the cap is measured rather than taste: the placement pass
 * is O(n^2), forty figures resolve to a handful of image requests once the
 * hull markers exist, and the holdings join serialises wallets into a request
 * URL that PostgREST will eventually refuse. Everyone past 40 is reachable
 * through the scrollable roster, which is what the roster is FOR, and it keeps
 * the map a picture instead of turning it into a list.
 */
export const getMapBases = unstable_cache(
  async (): Promise<RosterRow[]> => {
    const page = await readRoster(null, 40);
    return page.rows;
  },
  ["s6-map-bases"],
  { revalidate: 60 },
);
