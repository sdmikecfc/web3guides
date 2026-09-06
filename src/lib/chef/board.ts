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
  /** 0x1234…abcd — never a full address in the UI copy */
  handle: string;
  /** the player's own restaurant name, "" until they set one (CUTE+VIRAL) */
  name: string;
  tier: string;
  topTier: boolean;
  quality: number;
  seats: number;
}

/** Shorten a wallet the way every other board in this repo does. */
export function handleOf(wallet: string): string {
  const w = String(wallet || "");
  return w.length > 10 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
}

/**
 * Resolve a displayed handle back to the wallet it came from (M8c).
 *
 * The Cheer button sends the HANDLE, not the address. The board deliberately
 * never puts a full wallet on the page, and passing one as a client-component
 * prop would have put it in the RSC payload -- inside a <script>, which is
 * exactly where dk-board-check's leak scan used to stop looking. Resolving
 * server-side means the browser is only ever told what it already displays.
 *
 * Refuses an ambiguous handle rather than guessing. Two wallets sharing ten
 * hex characters is vanishingly unlikely and cheering the wrong kitchen on a
 * collision would be worse than refusing.
 */
export async function walletForHandle(handle: string): Promise<string | null> {
  const rooms = await topRooms(100);
  const hit = rooms.filter((r) => r.handle === handle);
  if (hit.length !== 1) return null;
  try {
    const db = dkDb();
    const { data } = await db
      .from("domain_kitchen_players")
      .select("wallet")
      .eq("game_key", DK_GAME_KEY)
      .eq("is_test", false)
      .gt("best_quality", 0);
    const match = (data ?? []).filter((r) => handleOf(String(r.wallet)) === handle);
    if (match.length !== 1) return null;
    const w = String(match[0].wallet || "").toLowerCase();
    return /^0x[a-f0-9]{40}$/.test(w) ? w : null;
  } catch {
    return null;
  }
}

export async function topRooms(limit = 25): Promise<BoardRow[]> {
  try {
    const db = dkDb();
    const { data, error } = await db
      .from("domain_kitchen_players")
      // state->>name: the room name lives inside the save blob, and JSONB
      // path selection means the board can show it with NO new column and NO
      // migration. Sanitized on write and re-capped here anyway.
      .select("wallet, best_quality, seats, name:state->>name")
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
      const rawName = typeof (r as { name?: unknown }).name === "string" ? String((r as { name?: unknown }).name) : "";
      return {
        rank: i + 1,
        handle: handleOf(String(r.wallet)),
        name: rawName.slice(0, 24),
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
