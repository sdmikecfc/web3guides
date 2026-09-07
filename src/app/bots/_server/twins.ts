/**
 * HOW MANY ROBOTS LOOK LIKE THIS ONE.
 *
 * The line under a robot's own page reads "Only yours looks like this." or
 * "3 other robots look like this one." (src/lib/bots/look.ts twinWords). It is
 * a COUNT OF ROBOTS, never a score, never capped, and never a rank: nobody is
 * above or below anybody in it, and a robot that shares its look with forty
 * others is not worse than one that shares it with none.
 *
 * WHY IT IS A CENSUS AND NOT A STORED COLUMN. A robot's look is its four
 * found colours plus the face, the sticker in its place, and the hat, and the
 * colours change the moment a part comes off. A stored key would need writing
 * from four different routes (save, sell a part, sell a robot, win a hat) and
 * the first one anybody forgot would leave a wrong number on a page that
 * claims to be exact. Every key here is derived, right now, from the same
 * rows every other surface reads.
 *
 * WHAT IT COSTS. Two reads: the live bots, and the parts that are ON a bot.
 * At the size this game is now that is a few hundred rows. It is cached in
 * the process for a minute, because five robots on one screen must not be
 * five censuses, and it is shared by every wallet asking in that minute.
 *
 * IT STOPS RATHER THAN LIES. If either read comes back at the row cap, the
 * census cannot see every robot, so it cannot honestly say "only yours", and
 * it answers null. Null is not zero: the caller prints no line at all. The
 * same is true when the read fails outright, because a decoration must never
 * be the reason a garage does not open.
 */
import "server-only";
import { EVERY_HAT, lookKey } from "@/lib/bots/look";
import { BOT_COLS, PART_COLS, type BotRow, type PartRow, lookOf, socketPaintsOf } from "./bots";
import type { BotsDb } from "./db";

/** How many live robots the census will look at before it gives up. */
export const BOT_CAP = 4000;
/** and how many parts sitting on those robots (five cards fill seven sockets) */
export const PART_CAP = BOT_CAP * 5;
const CACHE_MS = 60_000;

/**
 * THE ONE KEY, used for every robot in the census AND for the caller's own,
 * so a robot always matches itself.
 *
 * EVERY hat there is is passed in as "the hats this wallet won". Whose wallet won
 * which hat is not part of what a robot LOOKS like, and reading every
 * wallet's hat rows would be a second census; the save route has already
 * refused a hat nobody won, so a hat on a stored look is a won hat. The
 * crown is left out because lookKey does not carry marks: two robots with the
 * same parts and the same face look the same even when one has won more.
 */
export function censusKey(b: BotRow, parts: readonly PartRow[]): string {
  return lookKey(lookOf(b, parts, EVERY_HAT, false), socketPaintsOf(b, parts));
}

interface Census {
  at: number;
  /** look key to how many live robots wear it */
  counts: Map<string, number>;
}

/** One entry per is_test bucket: a test robot is counted against test robots,
 * because a smoke run must never move a real player's number. */
const cache = new Map<string, Census>();

async function takeCensus(db: BotsDb, isTest: boolean): Promise<Census | null> {
  const { data: botData, error: botErr } = await db
    .from("battle_bots_bots")
    .select(BOT_COLS)
    .is("recycled_at", null)
    .eq("is_test", isTest)
    .order("id", { ascending: true })
    .limit(BOT_CAP + 1);
  if (botErr) {
    // eslint-disable-next-line no-console
    console.error("[bots twins] census bots read failed:", botErr.message);
    return null;
  }
  const bots = (botData || []) as BotRow[];
  if (bots.length > BOT_CAP) {
    // eslint-disable-next-line no-console
    console.error("[bots twins] more than", BOT_CAP, "robots: no look count is given rather than a wrong one");
    return null;
  }

  const { data: partData, error: partErr } = await db
    .from("battle_bots_part_instances")
    .select(PART_COLS)
    .not("bot_id", "is", null)
    .is("recycled_at", null)
    .eq("is_test", isTest)
    .order("id", { ascending: true })
    .limit(PART_CAP + 1);
  if (partErr) {
    // eslint-disable-next-line no-console
    console.error("[bots twins] census parts read failed:", partErr.message);
    return null;
  }
  const parts = (partData || []) as PartRow[];
  if (parts.length > PART_CAP) {
    // eslint-disable-next-line no-console
    console.error("[bots twins] more than", PART_CAP, "fitted parts: no look count is given rather than a wrong one");
    return null;
  }

  const byBot = new Map<number, PartRow[]>();
  for (const p of parts) {
    if (p.bot_id == null) continue;
    const list = byBot.get(p.bot_id);
    if (list) list.push(p);
    else byBot.set(p.bot_id, [p]);
  }

  const counts = new Map<string, number>();
  for (const b of bots) {
    const key = censusKey(b, byBot.get(b.id) ?? []);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { at: Date.now(), counts };
}

async function census(db: BotsDb, isTest: boolean): Promise<Census | null> {
  const bucket = isTest ? "test" : "live";
  const had = cache.get(bucket);
  if (had && Date.now() - had.at < CACHE_MS) return had;
  const fresh = await takeCensus(db, isTest);
  if (fresh) cache.set(bucket, fresh);
  else cache.delete(bucket);
  return fresh;
}

/**
 * How many OTHER live robots wear each of these robots' looks, by bot id.
 *
 * A robot counts itself in the census, so its own row is taken back off: what
 * the player is told is how many OTHER robots share the look. A robot whose
 * look changed inside the cache minute is not in the census under its new key
 * yet and answers 0, which reads "Only yours looks like this." and is the
 * true answer for a look nobody has worn before.
 *
 * A null answer means the census could not be taken. The caller prints no
 * line: no claim is better than a wrong one.
 */
export async function twinCounts(
  db: BotsDb,
  bots: readonly BotRow[],
  parts: readonly PartRow[],
  isTest: boolean,
): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  const c = await census(db, isTest);
  for (const b of bots) {
    if (!c) {
      out.set(b.id, null);
      continue;
    }
    const mine = parts.filter((p) => p.bot_id === b.id);
    const n = c.counts.get(censusKey(b, mine)) ?? 0;
    out.set(b.id, Math.max(0, n - 1));
  }
  return out;
}

/** Dev and gate only: forget the cached census so a check can watch it move. */
export function forgetCensus(): void {
  cache.clear();
}
