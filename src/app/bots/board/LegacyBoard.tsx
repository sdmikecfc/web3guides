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
import { botsDb, isProduction } from "../_server/db";
import { displayName, type PlayerRow } from "../_server/players";
import { BoardTable, type BoardBot, type BoardRow } from "./BoardTable";
import { BOT_COLS, PART_COLS, engineBuildOf, earnedOf, lookOf, socketPaintsOf, paintOf, type BotRow, type PartRow } from "../_server/bots";
import { CROWN_CARD_KIND, dedupeHats, marksOf } from "@/lib/bots/look";
import { SAMPLE_ROWS } from "./sample";


export const metadata: Metadata = {
  title: "Leaders | Clanker Cup",
  description: "Every player on Sprocket Row, best fight points first. Player names only.",
};

/** the first this many garages; the rest arrive with paging in week 4 */
const LIMIT = 50;

/** One batch for the visible public toys. No wallet or inventory is serialized.
 * If any appearance source is unavailable, the existing portrait remains. */
async function withBoardArt(db: ReturnType<typeof botsDb>, rows: BoardRow[], bots: readonly BotRow[]): Promise<BoardRow[]> {
  const visible = new Set(rows.flatMap(row => row.bots.slice(0, 5).map(bot => bot.id)));
  const selected = bots.filter(bot => visible.has(bot.id) && bot.listed === true && !bot.recycled_at);
  if (selected.length === 0) return rows;
  const ids = selected.map(bot => bot.id);
  const wallets = Array.from(new Set(selected.map(bot => bot.wallet.toLowerCase())));
  try {
    const [partsRead, hatsRead, crownsRead] = await Promise.all([
      db.from("battle_bots_part_instances").select(PART_COLS).in("bot_id", ids).is("recycled_at", null).limit(2000),
      db.from("battle_bots_hats").select("wallet, kind, color").in("wallet", wallets).order("id", { ascending: true }).limit(10000),
      db.from("battle_bots_cards").select("wallet, bot_id").in("wallet", wallets).eq("kind", CROWN_CARD_KIND).limit(10000),
    ]);
    if (partsRead.error) return rows;
    // Match the portrait route: older databases may lack optional reward tables.
    let hatsData: { wallet: string; kind: string; color?: string | null }[] = hatsRead.error ? [] : hatsRead.data ?? [];
    if (hatsRead.error && (hatsRead.error.code === "42703" || /column .*color/i.test(hatsRead.error.message ?? ""))) {
      const legacyHats = await db.from("battle_bots_hats").select("wallet, kind").in("wallet", wallets).order("id", { ascending: true }).limit(10000);
      hatsData = legacyHats.error ? [] : legacyHats.data ?? [];
    }
    const crownsData = crownsRead.error ? [] : crownsRead.data ?? [];
    // A truncated source cannot prove a full look, so do not partially dress it.
    if ((partsRead.data?.length ?? 0) >= 2000 || hatsData.length >= 10000 || crownsData.length >= 10000) return rows;
    const partsByBot = new Map<number, PartRow[]>();
    for (const part of (partsRead.data ?? []) as PartRow[]) {
      if (part.bot_id == null) continue;
      const list = partsByBot.get(part.bot_id) ?? [];
      list.push(part);
      partsByBot.set(part.bot_id, list);
    }
    const hats = hatsData;
    const crowns = crownsData as { wallet: string; bot_id: number | null }[];
    const art = new Map<number, NonNullable<BoardBot["art"]>>();
    for (const bot of selected) {
      const wallet = bot.wallet.toLowerCase();
      const parts = (partsByBot.get(bot.id) ?? []).filter(part => part.wallet.toLowerCase() === wallet);
      const build = engineBuildOf(bot, parts);
      if (!build) continue;
      const wonHats = dedupeHats(hats.filter(hat => hat.wallet.toLowerCase() === wallet).slice(0, 200));
      const crown = crowns.some(card => card.bot_id === bot.id && card.wallet.toLowerCase() === wallet);
      const earned = earnedOf(bot, parts, wonHats, crown);
      const look = {
        paints: socketPaintsOf(bot, parts),
        look: lookOf(bot, parts, wonHats, crown),
        marks: marksOf(earned.wins, earned.repairs, earned.level, earned.champion),
        wins: earned.wins,
      };
      art.set(bot.id, { build, look, paint: paintOf(bot) });
    }
    return rows.map(row => ({ ...row, bots: row.bots.map(bot => art.has(bot.id) ? { ...bot, art: art.get(bot.id)! } : bot) }));
  } catch {
    return rows;
  }
}

/** A row is published only when BOTH exclusion flags are explicitly false. */
function isPlayable(p: PlayerRow): boolean {
  return p.is_operator === false && p.is_test === false;
}

/**
 * THE PLAYERS ON THE BOARD, and the exclusion FAILS CLOSED: a row is asked
 * for only when both flags are explicitly false, so a null or a missing
 * column hides a garage instead of publishing it.
 *
 * `test` opens that gate, and it is opened in ONE place and only outside
 * production (the caller checks isProduction before it ever asks). Every
 * wallet on a development box is a smoke wallet, so the real board correctly
 * renders "nobody is on the list yet" there and the table itself cannot be
 * looked at. In production this second query is never made.
 */
async function loadPlayers(db: ReturnType<typeof botsDb>, test: boolean): Promise<PlayerRow[]> {
  let q = db
    .from("battle_bots_players")
    .select("id, wallet, wallet_name, enlisted_at, coins, battle_points, is_operator, is_test, review_status")
    .eq("is_operator", false);
  if (!test) q = q.eq("is_test", false);
  const { data, error } = await q.order("battle_points", { ascending: false }).limit(LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data || []) as PlayerRow[];
  return test ? rows.filter((p) => p.is_operator === false) : rows.filter(isPlayable);
}

async function loadBoard(): Promise<{ rows: BoardRow[]; unavailable: boolean; sample?: boolean }> {
  try {
    const db = botsDb();
    let players = await loadPlayers(db, false);
    // outside production only: a development database has no real garages,
    // so without this the table can never be seen on the box it is built on
    if (players.length === 0 && !isProduction()) players = await loadPlayers(db, true);
    // still nothing outside production: a development database can have no
    // garages at all, and then this page is a blank card that shows neither
    // the table nor whether it works. Fall back to the sample rows the
    // preview route draws. PRODUCTION NEVER DOES THIS: a real board with no
    // players keeps its honest empty state, so invented rows can never be
    // shown as if somebody had played.
    if (players.length === 0 && !isProduction()) return { rows: SAMPLE_ROWS, unavailable: false, sample: true };
    if (players.length === 0) return { rows: [], unavailable: false };

    const wallets = players.map((p) => p.wallet);
    const { data: botData, error: botErr } = await db
      .from("battle_bots_bots")
      // `id` is new here and it is the whole board change: a portrait is
      // asked for by ID and never by look, so the picture on this page comes
      // from the same rows the garage draws from and cannot be faked.
      .select(BOT_COLS)
      .in("wallet", wallets)
      .is("recycled_at", null)
      .limit(2000);
    if (botErr) throw new Error(botErr.message);

    const byWallet = new Map<string, BotRow[]>();
    for (const b of (botData || []) as BotRow[]) {
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
    return { rows: await withBoardArt(db, rows, (botData ?? []) as BotRow[]), unavailable: false };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[bots board]", e instanceof Error ? e.message : e);
    // The prelaunch presentation remains usable without a local database.
    // Production keeps its honest unavailable state.
    if (!isProduction()) return { rows: SAMPLE_ROWS, unavailable: false, sample: true };
    return { rows: [], unavailable: true };
  }
}

export default async function BoardPage() {
  const { rows, unavailable, sample } = await loadBoard();
  return (
    <PageShell>
      <BoardTable rows={rows} unavailable={unavailable} sample={sample} />
    </PageShell>
  );
}
