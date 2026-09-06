/**
 * BATTLE BOTS MORNING PAPER (engine doc section 6, screens doc 3): on the
 * first visit each day, a digest of what happened since the player last
 * read it: defences (who challenged the ghost and how it went), repairs
 * that finished, and today's shelf. Plain words, wallet names only.
 *
 * LAST SEEN lives in the ledger: reading the paper writes a zero-coin
 * bb_grant with reason paper:<day> (idempotent, one row per wallet per
 * day, moves nothing), and "since" is the created_at of the newest such
 * row BEFORE today. The battle_bots_players table carries no last_seen
 * column (battle_bots_001_init.sql), and the ledger is the one place a
 * per-wallet mark can land without a schema change. A first-ever read
 * looks back seven days.
 */
import "server-only";
import { STRINGS, fill } from "@/lib/bots/strings";
import { marksOf, sameHat, type HatWon } from "@/lib/bots/look";
import { hatName, markNews } from "@/lib/bots/shelf";
import { loadBots, nameTextOf } from "./bots";
import { type BotsDb, dayKey } from "./db";
import type { BattleRow } from "./fights";
import { grant } from "./grants";
import { displayName, loadPlayer } from "./players";
import type { BotsSession } from "./session";
import { todayShop } from "./shop";
import type { PaperLineView, PaperView } from "./types";

const LOOKBACK_DAYS = 7;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function paperView(db: BotsDb, sess: BotsSession): Promise<PaperView> {
  const nowMs = Date.now();
  const day = dayKey(nowMs);
  const wallet = sess.wallet;
  const player = await loadPlayer(db, wallet);
  const name = player ? displayName(player) : "";
  const isTest = !!player?.is_test;

  // the two newest paper marks: today's (if any) and the one before it
  const { data: marks } = await db
    .from("battle_bots_ledger")
    .select("reason, created_at")
    .eq("wallet", wallet)
    .like("reason", "paper:%")
    .order("created_at", { ascending: false })
    .limit(2);
  const list = ((marks || []) as { reason: string; created_at: string }[]).filter((m) => m.reason !== `paper:${day}`);
  const since = list[0]?.created_at ?? new Date(nowMs - LOOKBACK_DAYS * 86400000).toISOString();

  // mark today read (0 coins, 0 points: a bookkeeping row, moves nothing)
  await grant(db, { wallet, walletName: name || null, coins: 0, points: 0, reason: `paper:${day}`, meta: { since }, isTest });

  const lines: PaperLineView[] = [];
  const bots = await loadBots(db, wallet);
  const botName = new Map(bots.map((b) => [b.id, nameTextOf(b)]));

  // defences since last read
  const { data: rows } = await db
    .from("battle_bots_battles")
    .select("id, mode, status, defender_bot_id, stake, result, created_at")
    .eq("mode", "pvp")
    .eq("status", "resolved")
    .eq("defender_wallet", wallet)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  for (const r of (rows || []) as Pick<BattleRow, "id" | "defender_bot_id" | "stake" | "result">[]) {
    const res = r.result;
    if (!res) continue;
    const mine = botName.get(r.defender_bot_id ?? -1) ?? res.names[1];
    const them = `${res.names[0]} (${res.walletNames[0]})`;
    const text =
      res.winner === 1
        ? `${mine} beat ${them}. You got ${r.stake} coins, and 3 fight points for winning.`
        : `${mine} lost to ${them}. ${capital(res.finisher)}. Your robot is fine. It was only a saved copy that fought.`;
    lines.push({ text, link: { kind: "watch", id: String(r.id) } });
  }

  // ── a mark gained while they were away ──────────────────────────────────
  // The chest stars and the stitched patches appear on the robot overnight,
  // and until now nothing announced them: a change nobody mentions is a
  // change a player has to spot. Both counts are DERIVED, never stored: the
  // fights this robot finished since the paper was last read are counted off
  // the battle rows, the ladder is walked twice with look.ts marksOf (once at
  // the record it had then, once at the record it has now), and the
  // difference is the news. Nothing here can announce a star the row does not
  // carry, and nothing caps: past the last drawn step the win count itself is
  // what the line prints.
  const moved = await fightsSince(db, wallet, since);
  for (const b of bots) {
    const d = moved.get(b.id);
    if (!d || (d.wins === 0 && d.losses === 0)) continue;
    const before = marksOf(Math.max(0, b.wins - d.wins), Math.max(0, b.losses - d.losses), b.level, false);
    const now = marksOf(b.wins, b.losses, b.level, false);
    for (const text of markNews(nameTextOf(b), b.wins, before, now)) lines.push({ text, link: null });
    // A HAT IS THE ONE THING ON THE LADDER NOBODY CAN WORK TOWARDS, so the
    // paper says which one turned up. It is read off the fight's own result
    // JSON, never off the hat table, so a line here means a fight gave it out.
    for (const h of d.hats) {
      lines.push({ text: fill(STRINGS.en.news.hat, { name: nameTextOf(b), hat: hatName(h) }), link: null });
    }
  }

  // repairs that finished since last read
  for (const b of bots) {
    if (!b.broken_until) continue;
    const t = Date.parse(b.broken_until);
    if (Number.isFinite(t) && t <= nowMs && b.broken_until >= since) {
      lines.push({ text: `${nameTextOf(b)} is fixed and ready to fight.`, link: null });
    }
  }

  // today's parts
  const shop = todayShop(nowMs);
  const t2 = shop.listings.filter((l) => l.card.tier >= 2).length;
  lines.push({ text: `There are ${shop.listings.length} parts to buy today. ${t2} of them are 2 stars or better.`, link: { kind: "shop" } });

  if (lines.length === 1) lines.unshift({ text: STRINGS.en.garage.quietNight, link: null });

  const d = new Date(nowMs);
  return {
    ok: true,
    date: `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
    since,
    lines,
  };
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/* ── a mark gained since the paper was last read ─────────────────────────── */

interface Moved {
  wins: number;
  losses: number;
  /** hats these fights handed this robot's owner. It comes off the battle
   *  row's own result JSON, which the paper is already reading, so the news
   *  costs no extra query and can never announce a hat no fight gave out. */
  hats: HatWon[];
}

/**
 * THE FIGHTS EACH OF THIS WALLET'S ROBOTS FINISHED SINCE `since`.
 *
 * Practice is left out because practice does not move a record: the fight
 * route returns before recordFight on a practice bout (_server/fights.ts), so
 * counting one here would announce a star that no row carries. Both sides are
 * read, because a robot's record moves whether it went out to fight or was
 * challenged at home.
 */
async function fightsSince(db: BotsDb, wallet: string, since: string): Promise<Map<number, Moved>> {
  const out = new Map<number, Moved>();
  const add = (botId: number | null, won: boolean, hat?: HatWon | null) => {
    if (botId == null) return;
    const had = out.get(botId) ?? { wins: 0, losses: 0, hats: [] };
    if (won) had.wins += 1;
    else had.losses += 1;
    // only the CHALLENGER wins a hat, so a defended fight never passes one
    if (hat && !had.hats.some((h) => sameHat(h, hat))) had.hats.push(hat);
    out.set(botId, had);
  };
  const cols = "id, mode, challenger_bot_id, defender_bot_id, result, created_at";
  const [mine, theirs] = await Promise.all([
    db
      .from("battle_bots_battles")
      .select(cols)
      .eq("status", "resolved")
      .neq("mode", "spar")
      .eq("challenger_wallet", wallet)
      .gte("created_at", since)
      .limit(200),
    db
      .from("battle_bots_battles")
      .select(cols)
      .eq("status", "resolved")
      .neq("mode", "spar")
      .eq("defender_wallet", wallet)
      .gte("created_at", since)
      .limit(200),
  ]);
  type Row = Pick<BattleRow, "challenger_bot_id" | "defender_bot_id" | "result">;
  for (const r of (mine.data || []) as Row[]) {
    if (!r.result) continue;
    add(r.challenger_bot_id, r.result.winner === 0, r.result.rewards?.hat ?? null);
  }
  for (const r of (theirs.data || []) as Row[]) {
    if (!r.result) continue;
    add(r.defender_bot_id, r.result.winner === 1);
  }
  return out;
}
