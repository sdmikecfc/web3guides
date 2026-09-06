/**
 * /bots/board: THE BOARD (screens doc 1, row 8).
 *
 * WHY THIS EXISTS NOW. The Board tab has been in the nav on every screen,
 * desktop words and phone dock alike, since week 1, and until today it went
 * to a 404 (found 2026-09-04). The full board is week-4 work: the Bloomberg
 * table with Trading Score, ROI, strategies and a Visit link into a Bot
 * Profile. Two of those three numbers come from the trading tracker and the
 * Visit link needs the profile route, and neither exists yet. So this is the
 * board built only from rows the game already writes: rank, wallet name,
 * tier dots and battle points, with the trading columns marked plainly as
 * not tracked yet. Week 4 fills them in and adds Visit; nothing here has to
 * be undone first.
 *
 * READ ONLY, AND A SERVER COMPONENT. Two selects, no writes, no session, no
 * client JavaScript. It reads the same tables the routes read through the
 * same service client; it adds no API surface.
 *
 * THE LAWS IT KEEPS:
 *  - Wallet NAMES only. The address never leaves this file (players.ts
 *    displayName derives the name; nothing renders `wallet`).
 *  - No dollar figure, and no "win $" anywhere.
 *  - Operator and test wallets earn nothing and are not on the board, and
 *    the exclusion FAILS CLOSED: a row is shown only when both flags are
 *    explicitly false, so a null or a missing column hides the row instead
 *    of publishing it.
 *  - Scores never cap: the column prints what the ledger holds.
 *  - A database that is down renders a plain line, never a 500 and never a
 *    404. A broken tab is the defect this page exists to fix.
 */
import type { Metadata } from "next";
import { PageShell } from "../_components/PageShell";
import { botsDb } from "../_server/db";
import { displayName, type PlayerRow } from "../_server/players";
import { BoardTable, type BoardRow } from "./BoardTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaders | Battle Bots",
  description: "Every player on Sprocket Row, best fight points first. Player names only.",
};

/** the first this many garages; the rest arrive with paging in week 4 */
const LIMIT = 50;

interface BotLite {
  /** the row id, which is the ONLY thing a portrait needs (server truth) */
  id: number;
  wallet: string;
  tier: number | null;
  total: number | null;
  wins: number | null;
  losses: number | null;
}

/** A row is published only when BOTH exclusion flags are explicitly false. */
function isPlayable(p: PlayerRow): boolean {
  return p.is_operator === false && p.is_test === false;
}

async function loadBoard(): Promise<{ rows: BoardRow[]; unavailable: boolean }> {
  try {
    const db = botsDb();
    const { data: playerData, error: playerErr } = await db
      .from("battle_bots_players")
      .select("id, wallet, wallet_name, enlisted_at, coins, battle_points, is_operator, is_test, review_status")
      .eq("is_operator", false)
      .eq("is_test", false)
      .order("battle_points", { ascending: false })
      .limit(LIMIT);
    if (playerErr) throw new Error(playerErr.message);
    const players = ((playerData || []) as PlayerRow[]).filter(isPlayable);
    if (players.length === 0) return { rows: [], unavailable: false };

    const wallets = players.map((p) => p.wallet);
    const { data: botData, error: botErr } = await db
      .from("battle_bots_bots")
      // `id` is new here and it is the whole board change: a portrait is
      // asked for by ID and never by look, so the picture on this page comes
      // from the same rows the garage draws from and cannot be faked.
      .select("id, wallet, tier, total, wins, losses")
      .in("wallet", wallets)
      .is("recycled_at", null)
      .limit(2000);
    if (botErr) throw new Error(botErr.message);

    const byWallet = new Map<string, BotLite[]>();
    for (const b of (botData || []) as BotLite[]) {
      const list = byWallet.get(b.wallet) || [];
      list.push(b);
      byWallet.set(b.wallet, list);
    }

    // the ranked list: battle points first, then the garage name, so two
    // wallets on the same points always land in the same order
    const scored = players
      .map((p) => {
        const bots = (byWallet.get(p.wallet) || []).filter((b) => Number(b.total) > 0);
        return {
          name: displayName(p),
          battlePoints: Number(p.battle_points) || 0,
          // best robot first, so the five that fit are the five worth seeing.
          // A tie on tier is broken by size, then by the id, so the row is
          // the same every time it is drawn.
          bots: bots
            .map((b) => ({ id: b.id, tier: Math.round(Number(b.tier) || 1), total: Number(b.total) || 0 }))
            .sort((a, b) => b.tier - a.tier || b.total - a.total || a.id - b.id)
            .map(({ id, tier }) => ({ id, tier })),
          wins: bots.reduce((n, b) => n + (Number(b.wins) || 0), 0),
          losses: bots.reduce((n, b) => n + (Number(b.losses) || 0), 0),
        };
      })
      .sort((a, b) => b.battlePoints - a.battlePoints || a.name.localeCompare(b.name));

    // standard competition ranking: equal points share a rank
    const rows: BoardRow[] = [];
    let rank = 0;
    let lastPoints = Number.NaN;
    scored.forEach((s, i) => {
      if (s.battlePoints !== lastPoints) {
        rank = i + 1;
        lastPoints = s.battlePoints;
      }
      rows.push({ rank, ...s });
    });
    return { rows, unavailable: false };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[bots board]", e instanceof Error ? e.message : e);
    return { rows: [], unavailable: true };
  }
}

export default async function BoardPage() {
  const { rows, unavailable } = await loadBoard();
  return (
    <PageShell>
      <BoardTable rows={rows} unavailable={unavailable} />
    </PageShell>
  );
}
