/**
 * Launch Wars Season 4 — server helpers (service-role; never import in client).
 * Season-namespaced clone of the proven S3 pattern (src/lib/stars/server.ts).
 * Everything here is theme-agnostic: no player-visible words, stable team keys.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

// The proven wallet-ownership check (viem verifyMessage + freshness + domain
// allowlist) is battle-tested in S3 production. Re-export it rather than
// duplicating crypto code. Origin: src/lib/stars/server.ts (verifyOwnership).
export { verifyOwnership } from "@/lib/stars/server";

export const SEASON_KEY = "s4";

/**
 * Team KEYS are stable forever (the theme only reskins names/accents; see
 * src/lib/s4/theme.ts). All DB rows key on these.
 */
export const TEAM_KEYS = ["alpha", "beta", "gamma"] as const;
export type TeamKey = (typeof TEAM_KEYS)[number];

export function s4Db() {
  return createServiceClient();
}

/**
 * Auto-balance default: the team with the fewest real players (anti-bandwagon;
 * same policy as S3's smallestCrew). Counts launch_wars_s4_players by team_key,
 * is_test=false. On a read error every count is 0 and alpha wins, which is
 * still a safe assignment.
 */
export async function smallestTeam(db: ReturnType<typeof s4Db>): Promise<TeamKey> {
  let best: TeamKey = TEAM_KEYS[0];
  let bestCount = Infinity;
  for (const team of TEAM_KEYS) {
    const { count } = await db
      .from("launch_wars_s4_players")
      .select("id", { count: "exact", head: true })
      .eq("season_key", SEASON_KEY)
      .eq("team_key", team)
      .eq("is_test", false);
    const c = count ?? 0;
    if (c < bestCount) {
      bestCount = c;
      best = team;
    }
  }
  return best;
}

/**
 * Scoring gate (audit 2026-07-12): Points/Credits may only be minted while the
 * season is LIVE. Blocks real-session runs when s4_enabled is off or the phase
 * has moved to settling/settled (the settlement freeze reads these tables).
 * Test sessions bypass so staff can rehearse while inert. FAILS CLOSED for
 * real sessions on any read error: a blocked run retries, a minted Point during
 * the freeze corrupts real-dollar payout weights.
 */
export async function scoringOpen(db: ReturnType<typeof s4Db>): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("launch_wars_boss_config")
      .select("key, value")
      .in("key", ["s4_enabled", "s4_phase"]);
    if (error) return false;
    const map = new Map((data || []).map((r) => [String(r.key), String(r.value)]));
    if (map.get("s4_enabled") !== "true") return false;
    const phase = map.get("s4_phase") || "live";
    return phase === "live";
  } catch {
    return false;
  }
}
