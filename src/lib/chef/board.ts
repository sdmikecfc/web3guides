import "server-only";

/**
 * The public spotlight board (ADR-0111: ladders public, payout math private).
 *
 * Reads only the two denormalised columns the save route already maintains —
 * best_quality and seats — so a board query never cracks open a JSONB blob,
 * and never reads anyone's layout, coins or pantry. Nothing about money
 * appears here: a restaurant is listed by how well it is RUN.
 *
 * Identity is a shortened wallet, deliberately. Free-text restaurant names on
 * a public board would need moderation this game does not have yet, and a
 * 150k-member community is the wrong place to discover that.
 */

import { dkDb, DK_GAME_KEY } from "./server";
import { serviceTier } from "@/app/chef/game/_engine/campaign";

export interface BoardRow {
  rank: number;
  /** 0x1234…abcd — never a name, never a full address in the UI copy */
  handle: string;
  tier: string;
  topTier: boolean;
  quality: number;
  seats: number;
}

/** Shorten a wallet the way every other board in this repo does. */
function handleOf(wallet: string): string {
  const w = String(wallet || "");
  return w.length > 10 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
}

export async function topRooms(limit = 25): Promise<BoardRow[]> {
  try {
    const db = dkDb();
    const { data, error } = await db
      .from("domain_kitchen_players")
      .select("wallet, best_quality, seats")
      .eq("game_key", DK_GAME_KEY)
      .eq("is_test", false)
      .gt("best_quality", 0)
      .order("best_quality", { ascending: false })
      .order("seats", { ascending: false })
      .limit(Math.max(1, Math.min(100, limit)));
    if (error || !data) return [];
    return data.map((r, i) => {
      const quality = Math.round(Number(r.best_quality) || 0);
      const tier = serviceTier(quality);
      return {
        rank: i + 1,
        handle: handleOf(String(r.wallet)),
        tier: tier.name,
        topTier: quality >= 80,
        quality,
        seats: Number(r.seats) || 0,
      };
    });
  } catch {
    // a board that cannot load is a quiet empty board, never a broken page
    return [];
  }
}
