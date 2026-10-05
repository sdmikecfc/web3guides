/**
 * ⚠️ TEST-ONLY PREVIEW DATA for /s5/map?preview=1 — NEVER a production surface.
 *
 * The page gates every use of this module behind NODE_ENV !== "production"
 * (the proven S4 map ?demo pattern: searchParams is only ever awaited
 * off-production, so the production route stays statically cached and this
 * data can never render live). It exists so the populated siege map can be
 * verified before the SQL seed runs against the real DB.
 *
 * The 10 strongholds ARE the real seed literals from
 * doma-reporter/sql/s5_targets_iron_siege_v2.sql (domains, display names,
 * initial_fdv, bonding_fdv, sort order, and the EXPLICIT capped-25%
 * pool_share_usd + bounty_usd rows — Mike 2026-08-01, shares sum 700 and
 * bounties sum 200). STATUSES AND PROGRESS ARE FAKED (per-row comments) so
 * every visual state renders: bonded, live (one under sprint), failed-at-peak,
 * and pending with the true launch_at countdowns. Money runs through
 * lib/s5/data finalizeTargetMoney, the SAME seam as production, so the
 * preview's dollars are exactly what those states would really pay.
 */
import type { SeasonTarget, Snapshot } from "@/lib/s5/data";
import { finalizeTargetMoney, POOL_FULL_USD } from "@/lib/s5/data";
import { DEFAULT_THEME } from "@/lib/s5/theme";
import type { WarEffortTotal } from "@/lib/s5/warEffort";

type Status = SeasonTarget["status"];

/** One preview target. launchAt: the seed literal for pending rows; a shifted
 * past timestamp for rows faked as launched (a live wall cannot list in the
 * future), with the seed literal kept in the row comment. poolShareUsd and
 * bountyUsd are the v2 seed literals (explicit capped shares this season). */
function t(
  domain: string,
  name: string,
  initialFdv: number,
  bondingFdv: number,
  sortOrder: number,
  launchAt: string,
  status: Status,
  progress: number,
  peakProgress: number,
  poolShareUsd: number,
  bountyUsd: number,
): SeasonTarget {
  return {
    domain,
    name,
    status,
    progress,
    peakProgress,
    launchAt,
    bondedAt: status === "bonded" ? launchAt : null, // fixture: a bonded wall needs a bond time for the hold-check countdown
    launched: status !== "pending",
    sortOrder,
    tokenAddress: null,
    bondingFdv,
    initialFdv,
    poolShareUsd,
    bountyUsd,
    poolShare: 0, // filled by finalizeTargetMoney below
    securedUsd: 0, // filled by finalizeTargetMoney below
  };
}

const daysAgo = (nowMs: number, days: number) => new Date(nowMs - days * 86400000).toISOString();

export function previewSnapshot(): Snapshot {
  const nowMs = Date.now();
  const targets: SeasonTarget[] = [
    // 1 hotcommerce.com (seed launch_at 2026-08-03T10:00:00Z) — FAKED BREACHED,
    // listed 6d ago: the gold stamp + full-share state.
    t("hotcommerce.com", "hotcommerce.com", 750, 1500, 1, daysAgo(nowMs, 6), "bonded", 1, 1, 17, 5),
    // 2 fyi.xyz (seed 2026-08-04T10:00:00Z) — FAKED LIVE at 62%, peak 71%,
    // listed 3d ago (inside the freshness window: the fresh note renders).
    t("fyi.xyz", "FYI.xyz", 25000, 35000, 2, daysAgo(nowMs, 3), "live", 0.62, 0.71, 175, 50),
    // 3 hypnotise.ai (seed 2026-08-05T10:00:00Z) — FAKED LIVE at 34%.
    t("hypnotise.ai", "hypnotise.ai", 2500, 3200, 3, daysAgo(nowMs, 2), "live", 0.34, 0.41, 16, 5),
    // 4 deprogram.com (seed 2026-08-06T10:00:00Z) — FAKED FAILED, peak 83%:
    // the ADR-0076 "window closed at 83%, still pays 83%" state.
    t("deprogram.com", "Deprogram.com", 2000, 2500, 4, daysAgo(nowMs, 8), "failed", 0.31, 0.83, 12, 3),
    // 5 walletz.xyz (seed 2026-08-07T10:00:00Z) — FAKED LIVE at 88%, peak 90%,
    // UNDER SIEGE SPRINT (red alert ring + banner).
    t("walletz.xyz", "Walletz.xyz", 1200, 2500, 5, daysAgo(nowMs, 1), "live", 0.88, 0.9, 30, 9),
    // 6 norules.ai (seed 2026-08-10T10:00:00Z) — FAKED LIVE at 12%, listed
    // half a day ago (fresh).
    t("norules.ai", "NoRules.ai", 6250, 12500, 6, daysAgo(nowMs, 0.5), "live", 0.12, 0.15, 145, 41),
    // 7..10 PENDING with the TRUE seed launch_at literals: live launch clocks.
    // applications.com is THE CITADEL (25% cap, largest raise on the board).
    t("vaultpool.com", "vaultpool.com", 7500, 11000, 7, "2026-08-11T10:00:00Z", "pending", 0, 0, 81, 23),
    t("applications.com", "Applications.com", 200000, 225000, 8, "2026-08-12T10:00:00Z", "pending", 0, 0, 175, 50),
    t("datafinder.ai", "datafinder.ai", 2000, 3000, 9, "2026-08-13T10:00:00Z", "pending", 0, 0, 23, 7),
    t("geoquest.xyz", "Geoquest.xyz", 4000, 5100, 10, "2026-08-14T10:00:00Z", "pending", 0, 0, 26, 7),
  ];

  // The production money seam: shares + secured, cent-exact.
  const money = finalizeTargetMoney(targets, POOL_FULL_USD);

  return {
    seasonKey: "s5",
    theme: DEFAULT_THEME,
    targets,
    // A populated board so ?preview=1 shows the commanders on the front, which
    // is the whole point of the layer. Domains match the faked targets above.
    gameBoards: [],
  topCommanders: [
      { rank: 1, name: "Big Mike", points: 4820, handle: "big-mike", tankKey: "panther", tankName: "Panther", camo: "gold", commanderKey: "wrench", domain: "fyi.xyz" },
      { rank: 2, name: "Sam", points: 4110, handle: "sam", tankKey: "tiger", tankName: "Tiger", camo: "night", commanderKey: "vega", domain: "fyi.xyz" },
      { rank: 3, name: "Ihor", points: 3640, handle: "ihor", tankKey: "sherman", tankName: "Sherman", camo: "olive", commanderKey: "diesel", domain: "hotcommerce.com" },
      { rank: 4, name: "Nikko", points: 2980, handle: "nikko", tankKey: "cromwell", tankName: "Cromwell", camo: "winter", commanderKey: "havoc", domain: "walletz.xyz" },
      { rank: 5, name: "Commander", points: 2410, handle: "0xa1b2c3d4", tankKey: "t34", tankName: "T-34", camo: "desert", commanderKey: "granite", domain: "hotcommerce.com" },
      { rank: 6, name: "Rook", points: 1870, handle: "rook", tankKey: "stuart", tankName: "Stuart", camo: "olive", commanderKey: "compass", domain: null },
      { rank: 7, name: "Vane", points: 1540, handle: "vane", tankKey: "chaffee", tankName: "Chaffee", camo: "urban", commanderKey: "forge", domain: null },
      { rank: 8, name: "Halloran", points: 1220, handle: "halloran", tankKey: "bt7", tankName: "BT-7", camo: "olive", commanderKey: "jackal", domain: "hypnotise.ai" },
    ],
    totals: {
      bonded: targets.filter((x) => x.status === "bonded").length,
      live: targets.filter((x) => x.status === "live").length,
      total: targets.length,
      players: 0,
    },
    pool: {
      unlocked: money.unlocked,
      full: POOL_FULL_USD,
      secured: money.secured,
      paidOutUsd: 5, // FAKED: the hotcommerce breach bounty paid (exercises the ticker)
    },
    season: { launchAt: "2026-08-03T09:00:00Z", endAt: "2026-08-21T15:00:00Z" },
    // FAKED sprint on walletz.xyz: the red-alert banner + node ring.
    sprint: {
      active: true,
      domains: ["walletz.xyz"],
      endsAt: new Date(nowMs + 26 * 3600000).toISOString(),
    },
    nowMs,
    empty: false,
  };
}

/** FAKED public War Effort aggregates for the preview card (no wallets). */
export function previewWarEffort(): Map<string, WarEffortTotal> {
  const rows: WarEffortTotal[] = [
    { domain: "walletz.xyz", committed: 1200, commanders: 4, won: 0, lost: 0 },
    { domain: "fyi.xyz", committed: 350, commanders: 2, won: 0, lost: 0 },
    { domain: "hotcommerce.com", committed: 0, commanders: 0, won: 3, lost: 0 },
  ];
  return new Map(rows.map((r) => [r.domain, r]));
}
