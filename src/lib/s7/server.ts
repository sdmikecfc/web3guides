/**
 * Launch Wars Season 5 (REALMFALL), server helpers (service-role; never import
 * in client code). Season-namespaced clone of the proven S4 pattern
 * (src/lib/s4/server.ts). Theme-agnostic: no player-visible words here.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

// The proven wallet-ownership check (viem verifyMessage + freshness + domain
// allowlist, tanks.web3guides.com included) is battle-tested across S3/S4
// production. Re-export it rather than duplicating crypto code.
export { verifyOwnership } from "@/lib/stars/server";

export const SEASON_KEY = "s7";

/**
 * S7 is a ONE-TEAM season: everyone fights for the "front" (The Guild).
 * The key is stable forever; the theme only reskins the name/accent.
 */
export const TEAM_KEYS = ["front"] as const;
export type TeamKey = (typeof TEAM_KEYS)[number];

export function s7Db() {
  return createServiceClient();
}

/**
 * Team assignment: one team, so every player lands on "front". Kept async with
 * the S4 signature so the join route stays a drop-in port (and a future
 * multi-team season only changes this function).
 */
export async function smallestTeam(_db: ReturnType<typeof s7Db>): Promise<TeamKey> {
  return "front";
}

/**
 * Scoring gate (the S4 audit rule): Valor/Gold may only be minted while the
 * season is LIVE. Blocks real-session runs when s7_enabled is off or the phase
 * has moved to settling/settled. Test sessions bypass so staff can rehearse.
 * FAILS CLOSED for real sessions on any read error.
 */
export async function scoringOpen(db: ReturnType<typeof s7Db>): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("launch_wars_boss_config")
      .select("key, value")
      .in("key", ["s7_enabled", "s7_phase"]);
    if (error) return false;
    const map = new Map((data || []).map((r) => [String(r.key), String(r.value)]));
    if (map.get("s7_enabled") !== "true") return false;
    const phase = map.get("s7_phase") || "live";
    return phase === "live";
  } catch {
    return false;
  }
}
