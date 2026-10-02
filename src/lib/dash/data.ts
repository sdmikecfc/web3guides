/**
 * Ambassador dashboard read path — precomputed snapshots ONLY.
 *
 * The doma-reporter bot computes everything nightly (04:10 UTC) and writes
 * ambassador_snapshot_runs / ambassador_snapshots / ambassador_referred_wallets;
 * this module reads the latest run with ok=true and NOTHING else. No chain
 * calls, no aggregation, no live queries — the whole point of the design.
 *
 * Caching contract (house rule, see src/lib/s6/data.ts): every read wrapped in
 * unstable_cache(revalidate 600) + the AMB_CACHE_TAG so the bot's post-run
 * purge (POST /api/dash/revalidate) drops it instantly. Pages set
 * `export const revalidate = 600` to match. NEVER force-dynamic here — that
 * is the launch-wars/page.tsx trap (a comment claiming caching that the config
 * pair actually disables).
 *
 * PUBLIC-SAFE: rows leave this module display-shaped. Wallets only ever exit
 * pre-shortened (0x1234…abcd); raw Discord ids stay server-side except as
 * opaque handle inputs. Nothing here may be passed to a client component.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { buildHandles, shortWallet } from "./handles";

/**
 * Dash-local Supabase client — deliberately NOT the shared createServiceClient.
 *
 * The shared client pins `cache: "no-store"` on every fetch (the 2026-08-17 empty-feed
 * fix for ROUTE HANDLERS, where Next force-caches fetches). But this module's reads run
 * inside unstable_cache, and a no-store fetch inside unstable_cache is an ILLEGAL
 * combination in Next 14: at prerender it throws internally, supabase-js converts the
 * throw into a quiet { data: null, error }, and { empty: true } gets baked into the page
 * and the data cache — then every revalidation repeats the failure. That served
 * "First snapshot pending" forever with valid keys and data present.
 *
 * Inside unstable_cache, the wrapper owns caching — the inner fetch needs NO cache
 * directive at all. Route handlers must keep the shared no-store client; this stays local.
 */
function createDashClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export const AMB_CACHE_TAG = "ambassadors-snapshot";

export type TopPost = {
  tweetId: string;
  url: string | null;
  author: string | null;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  engagement: number;
  season: string;
};

export type BoardRow = {
  rank: number;
  handle: string;
  discordId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  walletShort: string;
  hasWallet: boolean;
  referralsTotal: number;
  referralsQualified: number;
  ownVolumeUsd: number;
  referredVolumeUsd: number;
  volumeUsd: number;
  volUsdcEth: number;
  volGraduated: number;
  volBonding: number;
  ownUsdcEth: number;
  ownGraduated: number;
  ownBonding: number;
  refUsdcEth: number;
  refGraduated: number;
  refBonding: number;
  postsTotal: number;
  engagementTotal: number;
  likesTotal: number;
  retweetsTotal: number;
  repliesTotal: number;
  viewsTotal: number;
  topPosts: TopPost[];
  messages30d: number;
  messagesApprox: boolean;
  volumeScore: number;
  referralScore: number;
  socialScore: number;
  totalScore: number;
  flags: { code: string; detail?: Record<string, unknown> }[];
  notes: { scope: string; note: string }[];
  // ADR-0127 cycle points (null until the first post-deploy snapshot)
  lane: string | null;
  ptsVolume: number;
  ptsReferral: number;
  ptsSocial: number;
  ptsTotal: number;
  refStrength: number;
  socialStrength: number;
  eligible: boolean;
  payoutShare: number;
  payoutUsd: number;
  ownCycleUsd: number;
  refCycleUsd: number;
};

export type CycleTotals = {
  cohortCycleUsd: number;
  poolUsd: number;
  poolUnlockedUsd: number;
  unlockStepUsd: number;
  unlockPerStepUsd: number;
  minOwnUsd: number;
  seatCapShare: number;
  eligibleCount: number;
  ptsSum: number;
  cycleStart: string;
  cycleEnd: string;
};

export type BoardTotals = {
  volumeUsd: number;
  volUsdcEth: number;
  volGraduated: number;
  volBonding: number;
  ambassadors: number;
  postsTotal: number;
  engagement: { likes: number; retweets: number; replies: number; views: number };
  probe?: { noFracRows: number; refusedWallets: number };
  cycle?: CycleTotals | null;
};

export type Board =
  | { empty: true }
  | { empty: false; date: string; totals: BoardTotals; rows: BoardRow[] };

export type ReferredRow = {
  walletShort: string;
  source: string;
  referredAt: string | null;
  volumeUsd: number;
  volUsdcEth: number;
  volGraduated: number;
  volBonding: number;
  activeDays: number;
  qualified: boolean;
  note: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
async function _getBoard(): Promise<Board> {
  const db = createDashClient();

  const { data: run } = await db
    .from("ambassador_snapshot_runs")
    .select("snapshot_date, totals")
    .eq("ok", true)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return { empty: true };

  // Cohorts are small (~a role's worth) but page defensively past the 1000 cap.
  const raw: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("ambassador_snapshots")
      .select("*")
      .eq("snapshot_date", run.snapshot_date)
      .order("total_score", { ascending: false })
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    raw.push(...data);
    if (data.length < 1000) break;
  }

  const handleable = raw.map((r) => ({ discordId: r.discord_id as string, displayName: r.display_name as string | null }));
  const handleOf = new Map<string, string>();
  buildHandles(handleable).forEach((row, handle) => handleOf.set(row.discordId, handle));

  const rows: BoardRow[] = raw.map((r, i) => ({
    rank: i + 1,
    handle: handleOf.get(r.discord_id) ?? `amb-${String(r.discord_id).slice(-6)}`,
    discordId: r.discord_id,
    displayName: r.display_name || r.username || "Ambassador",
    username: r.username || "",
    avatarUrl: r.avatar_url || null,
    walletShort: shortWallet(r.wallet),
    hasWallet: Boolean(r.wallet),
    referralsTotal: Number(r.referrals_total) || 0,
    referralsQualified: Number(r.referrals_qualified) || 0,
    ownVolumeUsd: Number(r.own_volume_usd) || 0,
    referredVolumeUsd: Number(r.referred_volume_usd) || 0,
    volumeUsd: Number(r.volume_usd) || 0,
    volUsdcEth: Number(r.vol_usdc_eth_usd) || 0,
    volGraduated: Number(r.vol_graduated_usd) || 0,
    volBonding: Number(r.vol_bonding_usd) || 0,
    ownUsdcEth: Number(r.own_usdc_eth_usd) || 0,
    ownGraduated: Number(r.own_graduated_usd) || 0,
    ownBonding: Number(r.own_bonding_usd) || 0,
    refUsdcEth: Number(r.ref_usdc_eth_usd) || 0,
    refGraduated: Number(r.ref_graduated_usd) || 0,
    refBonding: Number(r.ref_bonding_usd) || 0,
    postsTotal: Number(r.posts_total) || 0,
    engagementTotal: Number(r.engagement_total) || 0,
    likesTotal: Number(r.likes_total) || 0,
    retweetsTotal: Number(r.retweets_total) || 0,
    repliesTotal: Number(r.replies_total) || 0,
    viewsTotal: Number(r.views_total) || 0,
    topPosts: Array.isArray(r.top_posts) ? (r.top_posts as TopPost[]) : [],
    messages30d: Number(r.messages_30d) || 0,
    messagesApprox: r.messages_method !== "author_id",
    volumeScore: Number(r.volume_score) || 0,
    referralScore: Number(r.referral_score) || 0,
    socialScore: Number(r.social_score) || 0,
    totalScore: Number(r.total_score) || 0,
    flags: Array.isArray(r.flags) ? r.flags : [],
    notes: Array.isArray(r.notes) ? r.notes : [],
    lane: r.lane || null,
    ptsVolume: Number(r.pts_volume) || 0,
    ptsReferral: Number(r.pts_referral) || 0,
    ptsSocial: Number(r.pts_social) || 0,
    ptsTotal: Number(r.pts_total) || 0,
    refStrength: Number(r.ref_strength) || 0,
    socialStrength: Number(r.social_strength) || 0,
    eligible: r.eligible === true,
    payoutShare: Number(r.payout_share) || 0,
    payoutUsd: Number(r.payout_usd) || 0,
    ownCycleUsd: Number(r.own_cycle_usd) || 0,
    refCycleUsd: Number(r.ref_cycle_usd) || 0,
  }));

  // Points era sorts by cycle points; pre-004 snapshots (all pts 0) keep score order.
  if (rows.some((r) => r.ptsTotal > 0)) {
    rows.sort((a, b) => b.ptsTotal - a.ptsTotal || b.totalScore - a.totalScore);
    rows.forEach((r, i) => { r.rank = i + 1; });
  }

  return {
    empty: false,
    date: String(run.snapshot_date),
    totals: (run.totals || {}) as BoardTotals,
    rows,
  };
}

export const getBoard = unstable_cache(_getBoard, ["dash-board-v2"], {
  revalidate: 600,
  tags: [AMB_CACHE_TAG],
});

/** Request-deduped: page + generateMetadata share one read (s6 hq pattern). */
export const getBoardCached = cache(getBoard);

// ── PUBLIC projection (the /maxxers Maxxer Tracker) ─────────────────────────
// A hard allowlist: the public shape has NO slots for per-person USD, wallets
// (even shortened), flags, notes, messages, or payout numbers — so a future
// page edit cannot leak them without changing this type on purpose. Group
// totals expose ONLY the cycle block: cohort volume + pool numbers are
// deliberately public (they are in the pinned rules posts). Accepted bound
// (Mike, 2026-08-21): ptsTotal implies vol ≥ pts/6 at worst; the V/R/S split
// stays private so a dollar figure is not recoverable.
// Rides getBoardCached's cache + tag — no second unstable_cache wrapper.

export type PublicRow = {
  rank: number;
  displayName: string;
  avatarUrl: string | null;
  lane: string | null;
  ptsTotal: number;
  refStrength: number;
  socialStrength: number;
  // Counts only, never dollars (2026-09-01, users asked to SEE their referrals)
  referralsTotal: number;
  referralsQualified: number;
  eligible: boolean;
};

export type PublicBoard =
  | { empty: true }
  | {
      empty: false;
      date: string;
      seats: number;
      totals: {
        cohortCycleUsd: number;
        poolUsd: number;
        poolUnlockedUsd: number;
        unlockStepUsd: number;
        unlockPerStepUsd: number;
        eligibleCount: number;
        cycleStart: string;
        cycleEnd: string;
      };
      rows: PublicRow[];
    };

export async function getPublicBoard(): Promise<PublicBoard> {
  const board = await getBoardCached();
  if (board.empty) return { empty: true };
  const cy = board.totals.cycle;
  // Pre-points snapshots (no cycle block) stay private-only; public page waits.
  if (!cy) return { empty: true };
  return {
    empty: false,
    date: board.date,
    seats: board.rows.length,
    totals: {
      cohortCycleUsd: cy.cohortCycleUsd,
      poolUsd: cy.poolUsd,
      poolUnlockedUsd: cy.poolUnlockedUsd,
      unlockStepUsd: cy.unlockStepUsd,
      unlockPerStepUsd: cy.unlockPerStepUsd,
      eligibleCount: cy.eligibleCount,
      cycleStart: cy.cycleStart,
      cycleEnd: cy.cycleEnd,
    },
    rows: board.rows.map((r) => ({
      rank: r.rank,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      lane: r.lane,
      ptsTotal: r.ptsTotal,
      refStrength: r.refStrength,
      socialStrength: r.socialStrength,
      referralsTotal: r.referralsTotal,
      referralsQualified: r.referralsQualified,
      eligible: r.eligible,
    })),
  };
}

async function _getReferred(discordId: string, date: string): Promise<ReferredRow[]> {
  const db = createDashClient();
  const out: ReferredRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("ambassador_referred_wallets")
      .select("*")
      .eq("snapshot_date", date)
      .eq("ambassador_discord_id", discordId)
      .order("volume_usd", { ascending: false })
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      out.push({
        walletShort: shortWallet(r.referred_wallet),
        source: r.source || "?",
        referredAt: r.referred_at ? String(r.referred_at).slice(0, 10) : null,
        volumeUsd: Number(r.volume_usd) || 0,
        volUsdcEth: Number(r.vol_usdc_eth_usd) || 0,
        volGraduated: Number(r.vol_graduated_usd) || 0,
        volBonding: Number(r.vol_bonding_usd) || 0,
        activeDays: Number(r.active_days) || 0,
        qualified: Boolean(r.qualified),
        note: r.note || null,
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}

export const getReferred = unstable_cache(_getReferred, ["dash-referred-v2"], {
  revalidate: 600,
  tags: [AMB_CACHE_TAG],
});
