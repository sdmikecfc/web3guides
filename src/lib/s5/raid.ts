/**
 * S5 RAID schedule + odds, pure client-safe logic (no IO, no secrets, no
 * imports). This is a WEB MIRROR of the bot's boss scheduler: the bot rolls
 * the raid at 14:00 UTC against the roster in the s5_battle_roster config row;
 * this module only PREDICTS the same boss + an estimated win chance so the
 * public strip can rally reinforcements. Nothing here mints or pays anything.
 *
 * Join-first rule: a commander who enlists before 14:00 UTC fights TODAY, so
 * the strip always talks about the NEXT resolve date (today before 14:00,
 * tomorrow after).
 *
 * Odds: a lookup of Monte Carlo results at difficulty 1.0, scaled by
 * (1/difficulty)^1.6 and clamped 3..99. Always labelled "estimated".
 * Copy rules: no em-dashes, never "win $X".
 */

export const RESOLVE_HOUR_UTC = 14;
export const SEASON_URL = "https://tanks.web3guides.com/?ref=rally";

export type RaidBoss = { key: string; name: string; difficulty: number };

/** The cast. Difficulty scales the odds curve; 1.0 = the Monte Carlo baseline. */
export const RAID_BOSSES: Record<string, RaidBoss> = {
  quartermaster: { key: "quartermaster", name: "THE QUARTERMASTER", difficulty: 0.55 },
  landship: { key: "landship", name: "THE LANDSHIP", difficulty: 0.95 },
  "foundry-beast": { key: "foundry-beast", name: "THE FOUNDRY BEAST", difficulty: 1.0 },
  "rail-colossus": { key: "rail-colossus", name: "THE RAIL COLOSSUS", difficulty: 1.05 },
  behemoth: { key: "behemoth", name: "THE BEHEMOTH", difficulty: 1.35 },
  siegebreaker: { key: "siegebreaker", name: "THE SIEGEBREAKER", difficulty: 1.25 },
};

const DAY_MS = 86_400_000;

function utcDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** UTC day number (days since epoch) for a "YYYY-MM-DD" string; NaN-safe -1. */
function dayNumber(dateStr: string): number {
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / DAY_MS) : -1;
}

/** The next resolve date (join-first rule): today if now is before 14:00 UTC,
 * else tomorrow. Returns "YYYY-MM-DD". */
export function resolveDateUtc(nowMs: number): string {
  const d = new Date(nowMs);
  return d.getUTCHours() < RESOLVE_HOUR_UTC ? utcDateStr(nowMs) : utcDateStr(nowMs + DAY_MS);
}

/** The season's FIRST resolve date (the tutorial raid day), from launchAt. */
function firstResolveDate(launchAt: string | null): string | null {
  if (!launchAt) return null;
  const t = Date.parse(launchAt);
  if (!Number.isFinite(t)) return null;
  return new Date(t).getUTCHours() < RESOLVE_HOUR_UTC ? utcDateStr(t) : utcDateStr(t + DAY_MS);
}

export type SeasonWindowLike = { launchAt: string | null; endAt: string | null };

/**
 * Which boss rolls on one resolve date (mirrors the bot's pure scheduler):
 *   1. season day 1                -> the Quartermaster (0.55, the tutorial)
 *   2. the last 2 season days      -> the Siegebreaker (1.25, the finale)
 *   3. Fri / Sat / Sun             -> the Behemoth (1.35, the weekend wall)
 *   4. other weekdays              -> Landship 0.95 / Foundry Beast 1.0 /
 *                                     Rail Colossus 1.05, rotating by day.
 */
export function bossForDate(dateStr: string, season: SeasonWindowLike): RaidBoss {
  const n = dayNumber(dateStr);
  const d1 = firstResolveDate(season?.launchAt ?? null);
  if (d1 && dateStr === d1) return RAID_BOSSES.quartermaster;
  if (season?.endAt) {
    const endN = dayNumber(utcDateStr(Date.parse(season.endAt) || 0));
    if (endN > 0 && (n === endN || n === endN - 1)) return RAID_BOSSES.siegebreaker;
  }
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  if (dow === 5 || dow === 6 || dow === 0) return RAID_BOSSES.behemoth;
  const rotation = [RAID_BOSSES.landship, RAID_BOSSES["foundry-beast"], RAID_BOSSES["rail-colossus"]];
  return rotation[((n % 3) + 3) % 3];
}

// ── Odds (the Monte Carlo lookup at difficulty 1.0, then the scale) ─────────
const ODDS_TABLE: Array<[number, number]> = [
  [5, 65],
  [8, 65],
  [12, 78],
  [15, 84],
  [20, 89],
  [25, 93],
];

/** Baseline win % at difficulty 1.0 for one roster size (linear between the
 * simulated points; a ramp below 5; flat 93 above 25). */
function baseOdds(rosterCount: number): number {
  const n = Math.max(0, Math.floor(Number(rosterCount) || 0));
  if (n <= 0) return 0;
  if (n <= ODDS_TABLE[0][0]) return (ODDS_TABLE[0][1] * n) / ODDS_TABLE[0][0];
  const last = ODDS_TABLE[ODDS_TABLE.length - 1];
  if (n >= last[0]) return last[1];
  for (let i = 1; i < ODDS_TABLE.length; i++) {
    const [x1, y1] = ODDS_TABLE[i - 1];
    const [x2, y2] = ODDS_TABLE[i];
    if (n <= x2) return y1 + ((y2 - y1) * (n - x1)) / (x2 - x1);
  }
  return last[1];
}

/**
 * THE FRONT REACTS: web mirror of the bot's RAID_SPRINT_WEAKEN. While a siege
 * sprint is running the war machine rolls out with less armor, so the odds
 * strip must predict the SAME fight the bot will run.
 *
 * Why a difficulty cut is the exact mirror of an HP cut: the bot builds boss
 * HP as RAID_HP_BASE x roster x difficulty, so scaling HP by (1 - weaken) is
 * arithmetically identical to scaling difficulty by (1 - weaken). Keep this
 * value equal to RAID_SPRINT_WEAKEN in modules/season5/index.js. (The bot also
 * floors boss HP at 200, which only ever binds on a tiny roster; the estimate
 * ignores that floor and is labelled an estimate everywhere it shows.)
 */
export const RAID_SPRINT_WEAKEN = 0.2;

/** The difficulty actually fought today. Bounded by construction: the factor
 * is a fixed 0.8, never data-driven, so a sprint can never zero the boss. */
export function effectiveDifficulty(difficulty: number, sprintActive: boolean): number {
  const d = Number(difficulty);
  const base = Number.isFinite(d) && d > 0 ? d : 1;
  return sprintActive ? base * (1 - RAID_SPRINT_WEAKEN) : base;
}

/** ESTIMATED win % for a roster against one boss: clamp(base * (1/d)^1.6, 3, 99). */
export function oddsPct(rosterCount: number, difficulty: number): number {
  const d = Number(difficulty);
  const scale = Math.pow(1.0 / (Number.isFinite(d) && d > 0 ? d : 1), 1.6);
  const scaled = baseOdds(rosterCount) * scale;
  return Math.round(Math.max(3, Math.min(99, scaled)));
}

// ── Roster + copy helpers (shared by the API route and the strip) ───────────

/** Roster count out of the s5_battle_roster config value (JSON
 * {date, wallets:[]}), counted ONLY when its date is the given resolve date. */
export function rosterCountForDate(raw: unknown, dateStr: string): number {
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!o || typeof o !== "object" || Array.isArray(o)) return 0;
    const rec = o as { date?: unknown; wallets?: unknown };
    if (String(rec.date || "") !== dateStr) return 0;
    if (!Array.isArray(rec.wallets)) return 0;
    return rec.wallets.filter((w) => typeof w === "string" && w.length > 0).length;
  } catch {
    return 0;
  }
}

export function commandersWord(n: number): string {
  return n === 1 ? "commander" : "commanders";
}

/** The strip's one line of copy. */
export function stripLine(boss: RaidBoss, count: number, odds: number): string {
  return `🚨 ${boss.name} rolls at 14:00 UTC · ${count} ${commandersWord(count)} enlisted · estimated odds ${odds}%. Every commander raises them.`;
}

/** The CALL FOR REINFORCEMENTS tweet body (no em-dashes, no money promises). */
export function tweetText(boss: RaidBoss, count: number, odds: number): string {
  return `🚨 ${boss.name} rolls at 14:00 UTC. ${count} ${commandersWord(count)} enlisted, estimated odds ${odds}%. Enlist before 14:00 UTC. ${SEASON_URL}`;
}

/** Yesterday's-result tweet copy (growth plan B10). ENGLISH on purpose, like
 * tweetText: a public X broadcast. The LOSS copy is the call to arms (the
 * ADR-0068 loss-card idea): a defeat is the game's built-in recruitment
 * moment. Both carry the game link, so the artifact-only credit rule pays
 * them. No em-dashes, never a dollar figure. */
export function resultTweetText(bossName: string, won: boolean): string {
  return won
    ? `⚔️ THE COLUMN BROUGHT DOWN ${bossName.toUpperCase()}. Daily co-op raid in Launch Wars IRON SIEGE: free browser tank games, real domain sieges. Fly tomorrow's sortie: ${SEASON_URL}`
    : `🩸 ${bossName.toUpperCase()} HELD THE WALL. The Column needs more gunners for tomorrow's raid. Joining is free and every extra player raises the odds: ${SEASON_URL}`;
}

/** The result share intent href (URL-encoded). */
export function resultIntentUrl(bossName: string, won: boolean): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(resultTweetText(bossName, won))}`;
}

/** The full tweet-intent href (URL-encoded). */
export function tweetIntentUrl(boss: RaidBoss, count: number, odds: number): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText(boss, count, odds))}`;
}
