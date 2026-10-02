/**
 * Season 5, the player's own HQ state. POST /api/s6/me  { t }
 *
 * Gated by a play-session token (the same token /api/s6/game-session mints;
 * POST so the token never lands in a URL/query log). Returns the caller's OWN
 * state only: display name, Signal, Scrap, the resolved TANK
 * (lib/s6/model resolveTank over the hq JSONB + dollars held), and the
 * past-season TROPHIES (lib/s6/trophies). Never returns the wallet.
 */
import { NextResponse } from "next/server";
import { s6Db, SEASON_KEY } from "@/lib/s6/server";
import { resolveTank } from "@/lib/s6/model";
import { handleForPlayer } from "@/lib/s6/handles";
import { clampStats } from "@/lib/s6/games";
import { buildHqView, heldUsdOf } from "@/lib/s6/me";
import { getTrophies } from "@/lib/s6/trophies";
import { getSeasonSnapshot } from "@/lib/s6/data";
import { myCommitments } from "@/lib/s6/warEffort";

export const runtime = "nodejs";

// ── Field Report helpers (the HQ stats board) ───────────────────────────────

/** One upgrade level 0..5 from the skin JSONB, junk-tolerant. */
function statLevel(v: unknown): number {
  const n = Math.floor(Number(v) || 0);
  return Math.max(0, Math.min(5, n));
}

/** The five upgrade stats. `aura` tolerates the legacy 0..30 weapon ladder by
 * mapping its thresholds (1/5/10/20/30) onto levels 1..5. */
function statsOf(player: Record<string, unknown> | null): {
  armor: number; engine: number; smoke: number; caliber: number; optics: number;
} {
  const skin =
    player?.skin && typeof player.skin === "object" && !Array.isArray(player.skin)
      ? (player.skin as Record<string, unknown>)
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

export type PayoutView = {
  /** Estimated cut if the season settled right now (unlocked pool x share). */
  estNowUsd: number;
  /** Estimated cut under the ADR-0076 peak rule: the SECURED pool (breached
   * shares in full + every standing wall's peak percent of its share) x this
   * wallet's Signal share. Estimate only; settlement adds breadth + the
   * qualifier gate. */
  securedUsd: number;
  /** Pool dollars sitting on mainframes THIS wallet holds ($5+) that have not
   * breached yet: the "get it bonded" number. */
  lockedUsd: number;
  lockedCount: number;
  /** Up to 4 of those mainframe names for the warning line. */
  lockedNames: string[];
  /** This wallet's share of the Column's Signal, 0..1 (points only; the final
   * settlement adds breadth, so every surface says "estimated"). */
  share: number;
  /** The ADR-0076 cash qualifier: $5+ held on at least `needed` SEPARATE UTC
   * days of the season (gates BOTH pots). heldDays counts this wallet's
   * qualifying days so far, from the same reason='hold' ledger rows the bot's
   * settlement derives it from. */
  qualifier: { heldDays: number; needed: number };
  /** What this wallet holds on EACH mainframe, in USD, keyed by lowercase
   * domain. Empty when signed out. The season total cannot answer "am I in
   * this one?", which is what a mainframe dossier has to show. */
  holdings: Record<string, number>;
};

// Mirror of the bot's ECONOMY.PRIZE_QUALIFY_DAYS / PRIZE_MIN_HOLD_USD (the bot
// is the source of truth; these only draw the "2 of 3 days" progress line).
const QUALIFY_DAYS = 3;
const QUALIFY_MIN_HOLD_USD = 5;

/**
 * Distinct UTC days this wallet held $5+ at the daily accrual, derived from
 * the reason='hold' ledger rows' meta ({day, held_usd_total}) exactly like the
 * bot's qualifiedHoldDays (zero new write paths). One wallet writes at most
 * one hold row per day, so a season fits one page; the loop mirrors the bot's
 * pagination anyway so a truncated read can never under-count. Display-only
 * here: on any error it degrades to 0, it never gates anything itself.
 */
async function heldDaysOf(db: ReturnType<typeof s6Db>, wallet: string): Promise<number> {
  try {
    const days = new Set<string>();
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await db
        .from("launch_wars_s6_ledger")
        .select("meta")
        .eq("season_key", SEASON_KEY)
        .eq("wallet", wallet)
        .eq("reason", "hold")
        .eq("is_test", false)
        .order("id", { ascending: true })
        .range(from, from + page - 1);
      if (error || !data) break;
      for (const r of data as { meta?: Record<string, unknown> | null }[]) {
        const meta = r?.meta;
        if (!meta || typeof meta !== "object") continue;
        const day = meta.day == null ? null : String(meta.day);
        const usd = Number(meta.held_usd_total);
        if (day && Number.isFinite(usd) && usd >= QUALIFY_MIN_HOLD_USD) days.add(day);
      }
      if (data.length < page) break;
    }
    return days.size;
  } catch {
    return 0;
  }
}

async function payoutOf(
  db: ReturnType<typeof s6Db>,
  wallet: string,
  myPoints: number,
): Promise<PayoutView> {
  const empty: PayoutView = {
    estNowUsd: 0,
    securedUsd: 0,
    lockedUsd: 0,
    lockedCount: 0,
    lockedNames: [],
    share: 0,
    qualifier: { heldDays: 0, needed: QUALIFY_DAYS },
    holdings: {},
  };
  try {
    const snapshot = await getSeasonSnapshot();
    if (snapshot.empty) return empty;

    // Share of the Column: my Signal over everyone's (players count is small;
    // the read stays inside this authed per-player route).
    const { data: rows } = await db
      .from("launch_wars_s6_players")
      .select("points")
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .limit(10000);
    const total = (rows || []).reduce((s, r) => s + (Number(r.points) || 0), 0);
    const share = total > 0 && myPoints > 0 ? myPoints / total : 0;

    // Mainframes this wallet actually holds at $5+.
    const { data: held } = await db
      .from("launch_wars_s6_holdings")
      .select("domain, held_usd")
      .eq("season_key", SEASON_KEY)
      .eq("wallet", wallet)
      .eq("is_test", false);
    const heldDomains = new Set(
      (held || [])
        .filter((h) => (Number(h.held_usd) || 0) >= 5)
        .map((h) => String(h.domain).toLowerCase()),
    );

    const lockedTargets = snapshot.targets.filter(
      (t) => heldDomains.has(t.domain) && t.status !== "bonded" && t.status !== "failed",
    );
    const lockedUsd = lockedTargets.reduce((s, t) => s + t.poolShare, 0);

    // The ADR-0076 qualifier progress ("2 of 3 days"), ledger-derived.
    const heldDays = await heldDaysOf(db, wallet);

    return {
      estNowUsd: Math.round(snapshot.pool.unlocked * share * 100) / 100,
      securedUsd: Math.round(snapshot.pool.secured * share * 100) / 100,
      lockedUsd: Math.round(lockedUsd * 100) / 100,
      lockedCount: lockedTargets.length,
      lockedNames: lockedTargets.slice(0, 4).map((t) => t.name),
      share: Math.round(share * 10000) / 10000,
      qualifier: { heldDays, needed: QUALIFY_DAYS },
      // PER-DOMAIN, not just the season total. A mainframe's dossier has to
      // answer "am I in this one?" and the aggregate cannot. Keyed lowercase
      // to match how the snapshot spells a domain.
      holdings: Object.fromEntries(
        (held || [])
          .map((h) => [String(h.domain).toLowerCase(), Math.round((Number(h.held_usd) || 0) * 100) / 100])
          .filter(([, usd]) => (usd as number) > 0),
      ) as Record<string, number>,
    };
  } catch {
    return empty;
  }
}

export async function POST(req: Request) {
  let body: { t?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const t = String(body.t || "");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t)) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const db = s6Db();
  const { data: sess } = await db
    .from("launch_wars_s6_game_sessions")
    .select("wallet, expires_at")
    .eq("token", t)
    .maybeSingle();
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });
  }
  const wallet = String(sess.wallet).toLowerCase();

  // select("*") on purpose: the s6 schema lands via a later migration and this
  // route must tolerate missing columns (fields are read defensively below and
  // the wallet is never echoed back).
  let player: Record<string, unknown> | null = null;
  try {
    const { data } = await db
      .from("launch_wars_s6_players")
      .select("*")
      .eq("season_key", SEASON_KEY)
      .eq("wallet", wallet)
      .maybeSingle();
    player = (data as Record<string, unknown> | null) ?? null;
  } catch {
    player = null;
  }

  // The schema column is held_usd_total (held_usd fallback for older rows).
  const heldUsd = heldUsdOf(player);
  const tank = resolveTank(player?.hq, heldUsd);
  const trophies = await getTrophies(wallet);
  const myPoints = Math.round(Number(player?.points) || 0);
  const payout = await payoutOf(db, wallet, myPoints);

  // THE WAR EFFORT: this wallet's OWN Scrap commitments, named from the
  // season snapshot. Play currency only; nothing here is a dollar figure.
  let warEffort: { domain: string; name: string; shells: number; status: string }[] = [];
  try {
    const commits = await myCommitments(db, wallet);
    if (commits.length) {
      const snap = await getSeasonSnapshot();
      const nameOf = new Map(snap.targets.map((t) => [t.domain, t.name]));
      warEffort = commits.map((c) => ({
        domain: c.domain,
        name: nameOf.get(c.domain) || c.domain,
        shells: c.shells,
        status: c.status,
      }));
    }
  } catch {
    warEffort = [];
  }

  // Brothers in Arms (ADR-0068 §3): the recruiter's NAME, permanently on the
  // recruit's HQ. Name only, never a wallet; missing/unresolvable stays null.
  let enlistedBy: string | null = null;
  try {
    const inv = typeof player?.invited_by === "string" ? player.invited_by.toLowerCase() : null;
    if (inv && /^0x[0-9a-f]{40}$/.test(inv)) {
      const { data: rec } = await db
        .from("launch_wars_s6_players")
        .select("display_name")
        .eq("season_key", SEASON_KEY)
        .eq("wallet", inv)
        .maybeSingle();
      if (typeof rec?.display_name === "string" && rec.display_name.trim()) {
        enlistedBy = rec.display_name.trim().slice(0, 40);
      }
    }
  } catch {
    enlistedBy = null;
  }

  return NextResponse.json({
    ok: true,
    player: {
      displayName: typeof player?.display_name === "string" ? player.display_name : null,
      teamKey: typeof player?.team_key === "string" ? player.team_key : null,
      points: Math.round(Number(player?.points) || 0),
      playCurrency: Math.round(Number(player?.play_currency) || 0),
      enlistedBy,
      // YOUR OWN PUBLIC HANDLE. Without it there was no way to reach your own
      // garage: you could open anyone else's from the map, but finding
      // yourself meant spotting your name among fifty pilots. It is the
      // same handle the board and the map already publish about you, so this
      // exposes nothing new -- it just tells you which one is yours.
      handle: handleForPlayer(player?.display_name, wallet) || null,
    },
    tank,
    trophies,
    // The caller's OWN held dollars (private to them; never anyone else's).
    heldUsd: Math.round(heldUsd * 100) / 100,
    // Display-safe hq projection: web-owned picks + bot-owned progress keys.
    hq: buildHqView(player?.hq),
    // Field Report: the five upgrade levels + the payout projection (their own
    // estimate only; every consuming surface labels it as an estimate).
    stats: statsOf(player),
    // RAW stat levels (botox 0..4, aura 0..30): what the Upgrades shelf buys
    // against. `stats` above is the display projection; prices key off these.
    rawStats: clampStats(player?.skin),
    payout,
    // THE WAR EFFORT: Scrap committed to specific mainframes (never cash).
    warEffort,
  });
}
