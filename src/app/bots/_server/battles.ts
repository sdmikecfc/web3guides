/**
 * BATTLE BOTS BATTLES PAGE SHELVES (screens doc 4.1, engine doc section 6):
 * the PvE ladder for the caller's selected bot, the PvP defenders (listed,
 * whole, not in the shop, not the caller's), Live (fights created in the
 * last 90 s), Featured today (biggest upset by gap, longest, fastest KO)
 * and Recent (the last 50 public fights). Sparring never appears.
 *
 * Every name on a shelf is the name stored in the fight row at the bell
 * (wallet names, never addresses), so a shelf needs no joins.
 */
import "server-only";
import { HOUSE_ROSTER, houseTarget, type Difficulty } from "../_engine/catalog";
import { botTier, type Tier } from "../_engine/parts";
import { DIFFICULTIES, PVE, gapWords, housePercent, weightClassIndex, weightClassOf } from "../_engine/rewards";
import { botView, defencesLeft, inShop, loadBots, loadCrownBotIds, loadHats, loadParts, nameTextOf, paintOf, type BotRow } from "./bots";
import { type BotsDb, dayKey, isProduction } from "./db";
import { fightSummary, houseShapeFor, type BattleRow } from "./fights";
import { coinsOf, displayName, loadPlayer, walletNames } from "./players";
import type { BotsSession } from "./session";
import type { BattlesView, BotView, DefenderRow, FightSummary, PveLadderRow } from "./types";

export const LIVE_WINDOW_MS = 90 * 1000;
export const RECENT_LIMIT = 50;

/** One line of lore per house bot card (screens doc 4.1), plain words. */
export const HOUSE_LORE: Readonly<Record<Difficulty, string>> = {
  easy: "Built from bits nobody wanted.",
  medium: "Works all day and fights all night.",
  hard: "Too big for the door, so they cut the door.",
};

const SUMMARY_COLS =
  "id, mode, difficulty, challenger_wallet, challenger_bot_id, defender_wallet, defender_bot_id, stake, class_gap, seed, status, winner_wallet, result, result_hash, coins_paid, points_paid, day_key, is_test, created_at, resolved_at";

function publicRows(db: BotsDb) {
  let q = db.from("battle_bots_battles").select(SUMMARY_COLS).eq("status", "resolved").in("mode", ["pve", "pvp"]);
  if (isProduction()) q = q.eq("is_test", false);
  return q;
}

async function rowsSince(db: BotsDb, sinceIso: string, limit: number): Promise<BattleRow[]> {
  const { data, error } = await publicRows(db).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`battles read: ${error.message}`);
  return (data || []) as BattleRow[];
}

function pveLadder(selected: { total: number } | null, day: string): PveLadderRow[] {
  return DIFFICULTIES.map((d) => {
    const shape = houseShapeFor(d, day);
    const houseTotal = selected ? houseTarget(d, selected.total) : null;
    return {
      difficulty: d,
      title: HOUSE_ROSTER[d].title,
      shapeId: shape.id,
      shapeName: shape.name,
      feel: shape.feel,
      lore: HOUSE_LORE[d],
      houseTotal,
      tier: houseTotal == null ? null : botTier(houseTotal),
      coinsWin: PVE[d].win,
      coinsLose: PVE[d].lose,
      points: PVE[d].points,
      dropPercent: PVE[d].drop,
    };
  });
}

async function defenders(db: BotsDb, me: string | null, mine: { total: number } | null, day: string, nowMs: number): Promise<DefenderRow[]> {
  let q = db
    .from("battle_bots_bots")
    .select("id, wallet, slot, name, build, total, tier, weight_class, level, xp, wins, losses, broken_until, attacks_day_key, attacks_today, defenses_today, listed, recycled_at, is_test, created_at")
    .eq("listed", true)
    .is("recycled_at", null)
    .gte("total", 5)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (isProduction()) q = q.eq("is_test", false);
  if (me) q = q.neq("wallet", me);
  const { data, error } = await q;
  if (error) throw new Error(`defenders read: ${error.message}`);
  const rows = ((data || []) as BotRow[]).filter((b) => !inShop(b, nowMs));
  const names = await walletNames(db, rows.map((b) => b.wallet));
  let challenged = new Set<number>();
  if (me) {
    const { data: today } = await db.from("battle_bots_battles").select("defender_bot_id").eq("mode", "pvp").eq("challenger_wallet", me).eq("day_key", day).neq("status", "declined");
    challenged = new Set(((today || []) as { defender_bot_id: number | null }[]).map((r) => r.defender_bot_id ?? -1));
  }
  const myClass = mine ? weightClassIndex(mine.total) : null;
  const out: DefenderRow[] = rows.map((b) => {
    const gap = myClass == null ? null : weightClassIndex(b.total) - myClass;
    return {
      botId: b.id,
      name: nameTextOf(b),
      walletName: names.get(b.wallet) ?? "Unknown",
      paint: paintOf(b),
      tier: botTier(b.total) as Tier,
      total: b.total,
      weightClass: weightClassOf(b.total),
      wins: b.wins,
      losses: b.losses,
      classGap: gap,
      gapWords: gap == null ? null : gapWords(gap),
      housePercent: gap == null ? 0 : housePercent(gap),
      defencesLeft: defencesLeft(b, day),
      challengedToday: challenged.has(b.id),
    };
  });
  // nearest class first, then the better record
  out.sort((a, b) => {
    const ga = a.classGap == null ? 0 : Math.abs(a.classGap);
    const gb = b.classGap == null ? 0 : Math.abs(b.classGap);
    if (ga !== gb) return ga - gb;
    return b.wins - b.losses - (a.wins - a.losses);
  });
  return out;
}

export async function battlesView(db: BotsDb, sess: BotsSession | null, wantBotId: number | null): Promise<BattlesView> {
  const nowMs = Date.now();
  const day = dayKey(nowMs);

  let me: BattlesView["me"] = null;
  let selected: BotView | null = null;
  if (sess) {
    const player = await loadPlayer(db, sess.wallet);
    if (player) {
      const bots = await loadBots(db, sess.wallet);
      const parts = await loadParts(db, sess.wallet);
      // the hats won and the crowns held: a look is derived from rows
      const [hats, crowns] = await Promise.all([loadHats(db, sess.wallet), loadCrownBotIds(db, sess.wallet)]);
      const views = bots.map((b) => botView(b, parts, day, nowMs, { hats, crowns }));
      const ready = views.filter((v) => v.complete);
      selected =
        (wantBotId != null ? ready.find((v) => v.id === wantBotId) : undefined) ??
        ready.find((v) => !v.inShop && v.attacksLeft > 0) ??
        ready[0] ??
        null;
      me = { bots: views, selected: selected ? selected.id : null, coins: coinsOf(player), walletName: displayName(player) };
    }
  }

  const [live, recent, today] = await Promise.all([
    rowsSince(db, new Date(nowMs - LIVE_WINDOW_MS).toISOString(), 20),
    (async () => {
      const { data, error } = await publicRows(db).order("created_at", { ascending: false }).limit(RECENT_LIMIT);
      if (error) throw new Error(`recent read: ${error.message}`);
      return (data || []) as BattleRow[];
    })(),
    (async () => {
      const { data, error } = await publicRows(db).eq("day_key", day).order("created_at", { ascending: false }).limit(500);
      if (error) throw new Error(`featured read: ${error.message}`);
      return (data || []) as BattleRow[];
    })(),
  ]);

  const sums = (rows: BattleRow[]): FightSummary[] => rows.map(fightSummary).filter((s): s is FightSummary => !!s);
  const todaySums = sums(today);
  let upset: FightSummary | null = null;
  let longest: FightSummary | null = null;
  let fastestKo: FightSummary | null = null;
  for (const s of todaySums) {
    if (s.upset > 0 && (!upset || s.upset > upset.upset)) upset = s;
    if (!longest || s.frames > longest.frames) longest = s;
    if (s.end === "ko" && (!fastestKo || s.frames < fastestKo.frames)) fastestKo = s;
  }

  return {
    ok: true,
    day,
    me,
    pve: pveLadder(selected, day),
    defenders: await defenders(db, sess ? sess.wallet : null, selected, day, nowMs),
    live: sums(live),
    featured: { upset, longest, fastestKo },
    recent: sums(recent),
  };
}
