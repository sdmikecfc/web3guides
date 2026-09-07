/**
 * THE WAR EFFORT (web side), Launch Wars S6.
 *
 * A pilot COMMITS Scrap (the play currency) to ONE mainframe as declared
 * war effort. Breach = the commitment returns DOUBLED plus that mainframe's
 * cosmetic decal. Fail = the Scrap are gone. The window CLOSES once a
 * mainframe enters its sprint band (the 85% tripwire), so nobody can back a
 * wall that is already falling.
 *
 * OWNERSHIP: the BOT owns resolution. modules/season5 resolves every commitment
 * off the same detected breach event that fires the Breach Bounty, flipping
 * `status` conditionally so a repeated tick can never pay twice. The web only
 * COMMITS and READS. Nothing here ever writes `status`, and nothing here ever
 * touches Signal, the pool, or any USD figure: settlement weight stays
 * Signal x breadth and no cash cut can move because of this file.
 *
 * Server-only (service role). Never import from a client component.
 */
import "server-only";
import { s6Db, SEASON_KEY } from "./server";

export const WAR_EFFORT_TABLE = "launch_wars_s6_war_effort";

/** Mirrors modules/season5 WAR_EFFORT. Keep the two in step by hand: the BOT is
 * the authority, and its commitWarEffort re-checks every bound server-side. */
export const WAR_EFFORT = {
  MIN_SHELLS: 50,
  MAX_SHELLS: 2000,
  MULT: 2,
} as const;

/** Mirrors the bot's WAR_EFFORT_CLOSE_PCT: the point where the window shuts.
 *
 * 0.85 -> 0.70 (ADR-0098). At 85% a wall was already inside its sprint band,
 * so committing Scrap to it was close to risk free and the "bet" was a
 * formality. 70% sits inside real uncertainty: three seasons of stalls all
 * began at 81% or above. The name is kept as SPRINT_ARM_PCT only because
 * callers import it; the sprint itself still arms at 85% bot-side. */
export const SPRINT_ARM_PCT = 0.7;

export type WarEffortStatus = "committed" | "won" | "lost";

/** Public, per-mainframe aggregate. No wallets, no dollars. */
export type WarEffortTotal = {
  domain: string;
  /** Scrap riding on this wall right now (open commitments only). */
  committed: number;
  /** How many pilots have declared for it. */
  pilots: number;
  /** Resolved counts, for the after-the-fact story. */
  won: number;
  lost: number;
};

/** One of the caller's OWN commitments. */
export type MyCommitment = {
  domain: string;
  shells: number;
  status: WarEffortStatus;
  createdAt: string | null;
  resolvedAt: string | null;
};

type Db = ReturnType<typeof s6Db>;

/** A mainframe's own decal key (mirrors modules/season5 warEffortDecal). */
export function warEffortDecal(domain: string): string {
  const slug = String(domain || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `breach-${slug}`;
}

/**
 * Is the commitment window open on this mainframe? The web copy of the bot's
 * rule, used only to grey out a button: the BOT re-checks it on every commit,
 * so a stale read here can never let a commitment through.
 */
export function windowOpen(
  target: { status: string; progress: number; domain: string },
  sprintDomains: string[],
): boolean {
  if (target.status !== "live") return false;
  if (target.progress >= SPRINT_ARM_PCT) return false;
  return !sprintDomains.includes(String(target.domain).toLowerCase());
}

/** Public totals per mainframe. Real world only (is_test rows never show). */
export async function warEffortTotals(db?: Db): Promise<Map<string, WarEffortTotal>> {
  const out = new Map<string, WarEffortTotal>();
  try {
    const client = db || s6Db();
    const { data } = await client
      .from(WAR_EFFORT_TABLE)
      .select("domain, shells, status")
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .limit(20000);
    for (const r of data || []) {
      const domain = String(r.domain).toLowerCase();
      const agg = out.get(domain) || { domain, committed: 0, pilots: 0, won: 0, lost: 0 };
      const status = String(r.status) as WarEffortStatus;
      if (status === "committed") {
        agg.committed += Number(r.shells) || 0;
        agg.pilots += 1;
      } else if (status === "won") agg.won += 1;
      else if (status === "lost") agg.lost += 1;
      out.set(domain, agg);
    }
  } catch {
    // The table lands with SQL 039. Before that migration every surface just
    // shows no commitments rather than erroring.
    return out;
  }
  return out;
}

/** The caller's OWN commitments. Never anyone else's. */
export async function myCommitments(db: Db, wallet: string): Promise<MyCommitment[]> {
  try {
    const { data } = await db
      .from(WAR_EFFORT_TABLE)
      .select("domain, shells, status, created_at, resolved_at")
      .eq("season_key", SEASON_KEY)
      .eq("wallet", String(wallet).toLowerCase())
      .limit(200);
    return (data || []).map((r) => ({
      domain: String(r.domain).toLowerCase(),
      shells: Math.round(Number(r.shells) || 0),
      status: String(r.status) as WarEffortStatus,
      createdAt: r.created_at ? String(r.created_at) : null,
      resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
    }));
  } catch {
    return [];
  }
}
