/**
 * Season 7 (REALMFALL) game registry + economy mirrors. The one const to edit
 * when a real game ships. Client-safe (no secrets, no server imports): the play
 * page, /api/s7/run-start, /api/s7/score and /api/s7/claim-guest all read this.
 *
 * Mirrors the proven S7 pattern (src/lib/s7/games.ts): game keys are defined
 * ONCE here, never duplicated across routes. Constant NAMES that other files
 * import (GAME_MEDALS_FIRST_RUN, SHELLS_PER_RUN, ...) keep their S7 spellings
 * VERBATIM for clone safety, the same rule that keeps the SQL RPC signatures
 * identical; only display words change (Valor, Gold).
 */

export const SEASON_KEY = "s7";

/** Combined Valor cap per wallet per UTC day across ALL games. Games are a
 * SMALL Valor source; holding is the main engine. The bot module MIRRORS
 * this value (modules/season6 ECONOMY). */
export const GAME_DAILY_POINTS_CAP = 40;

/** THE FLAT-SIGNAL LAW (carried from the S7 2026-08-03 economy redesign).
 * Everything that is not holding shares one 40 a day ceiling, STRUCTURAL
 * rather than queried: the arcade pays 10 for the first scored run of the day
 * per game, the raid pays at most 20, a post pays 10. S7 launches with THREE
 * games (30/day arcade max); THE CORE lands week 2 and brings the arcade back
 * to the 40 ceiling exactly. 40 sits below the 50/day a $5 holder earns, so
 * holding leads at every tier by construction (the S3 lesson #11 guard). */
export const GAME_MEDALS_FIRST_RUN = 10;

/** Flat Valor for one banked run (no per-game credit formulas). */
export const POINTS_PER_RUN = GAME_MEDALS_FIRST_RUN;

/**
 * THE GRID REACTS (assault-sprint bonus, the S7 "front reacts" rule reskinned).
 * While ANY keep is inside its 48h assault sprint (the bot's 85% tripwire,
 * config row s7_sprint_state), a banked run pays POINTS_PER_RUN + this bonus.
 * A TIMING lever, never an inflation lever: applied SERVER-SIDE only; the
 * client never claims it. */
export const SPRINT_RUN_BONUS_POINTS = 5;

/**
 * SCRAP FOR A BANKED RUN (constant name kept from S7 for clone safety).
 * Deliberately SMALL against holding, which stays the real engine. Paid on the
 * SAME schedule as Valor: only when a run actually banks, and only for the
 * first scored run of the day per game. */
export const SHELLS_PER_RUN = 15;

/** The ONE place the season pool total lives on the web (client-safe). The
 * bot's ECONOMY.PRIZE_POOL_USD (doma-reporter modules/season6) is the SOURCE
 * OF TRUTH; this is its mirror and MUST equal it. Change the bot first, then
 * this in the same deploy.
 *
 * S7 ENVELOPE (Mike, 2026-08-12: "$500 a week, $1000 a season", not up for
 * debate) AND ITS SHAPE, REWRITTEN 2026-08-16 (Mike, after seeing S7 settle):
 *
 *   "take the pot, split it amongst the domains BUT they earn the percentage
 *    bonded instead of everything vs nothing... The bounties are trash, they
 *    get pennies and it doesn't excite anyone... let's do $1000 next season,
 *    split amongst the domains, paid out by percent bonded"
 *
 * ONE POT OF $1,000, DIVIDED INTO PER-KEEP SLICES. A keep UNLOCKS its own
 * slice, scaled by the percent it actually reached: reclaimed unlocks the
 * slice in full, 60% unlocks 60% of it, 0% unlocks nothing and that money is
 * never paid out. Bounties are DELETED - the whole envelope is the one pot, so
 * there is no second number to explain and no mid-season envelope to re-split.
 *
 * HOW THE UNLOCKED MONEY IS SPLIT, S7 ONLY (ADR-0139, 2026-09-01, supersedes
 * the per-keep distribution half of ADR-0126): a keep does NOT pay its own
 * holders. Every unlocked dollar from every keep joins ONE pot, and each
 * qualified holder takes the share of that pot that their hold Valor is of all
 * qualified hold Valor. Which keep the Valor came from decides nothing.
 * S2-S6 stay per-keep forever; do not carry this back. The slice sizing below
 * is UNTOUCHED by that change - it still decides how much money unlocks.
 *
 * Why this SLICE shape, from five seasons of evidence:
 *   - S4 paid bonded-only: five walls died at 83-90% and paid $0. Trust killer.
 *   - S7 paid the full pool regardless: 2 of 10 reclaimed still cost the full
 *     $700. Mike: "we are paying more for less."
 *   - Percent-bonded is the middle both seasons were reaching for, and it puts
 *     the money where the player can SEE it: one keep, one slice, one
 *     percent. */
export const POOL_FULL_USD = 1000;

/**
 * SLICE FLOOR AND CAP (Mike, 2026-08-16: "By difficulty, floor + cap").
 *
 * Slices weight by bonding difficulty - the ADR-0026 rule Mike asked for in S4
 * ("so people don't just bond the cheapest") - but bounded at both ends,
 * because unbounded weighting failed empirically two seasons running: every
 * keep needing <= $3.2k has been reclaimed and every one needing >= $3.5k
 * stalled at 81-96%, so pure weighting parks a quarter of the pot on walls the
 * community provably cannot finish, while the cheap ones that DO fall pay
 * pennies (S7: hotcommerce reclaimed and its slice was $17).
 *
 * The floor makes every keep worth showing up for; the cap stops one
 * uncloseable backdrop from hoarding the season. Slices are normalized to sum
 * to exactly POOL_FULL_USD after clamping.
 */
export const SLICE_MIN_USD = 75;
export const SLICE_MAX_USD = 150;

/* WHY 75/150 AND NOT A WIDER BAND (measured on S7's real slate, 2026-08-16).
 * At 50/200 a keep that RECLAIMED unlocked $50 while applications.com sitting
 * at 23% unlocked $46 - finishing was worth nothing over stalling, which is
 * the exact failure this rewrite exists to kill. The slice spread must stay
 * NARROWER than the outcome multiplier or difficulty weighting eats the reward
 * for winning. At 75/150: reclaimed unlocks $75, the best unfinished wall
 * unlocks $43. Difficulty still counts, finishing wins.
 * Still true under ADR-0139: the band decides how much money REACHES the pot,
 * which is the only thing the slice was ever sizing. */

/** BOUNTIES ARE DELETED (Mike, 2026-08-16: "The bounties are trash, they get
 * pennies and it doesn't excite anyone. They didn't even mention the one that
 * didn't pay out"). Kept as explicit zeroes rather than removed so that any
 * surface still importing them renders nothing instead of silently inflating a
 * total, and so the next season's author reads the decision. */
export const BOUNTY_TOTAL_USD = 0;
export const BOUNTY_HOLD_CHECK_H = 48;
/** Honors pay NO CASH (ADR-0098). Five finale titles, never beside a dollar. */
export const HONORS_TOTAL_USD = 0;

/** THE ARCADE PRIZE (ADR-0135, Mike 2026-08-31). Up to $100 of pool money the
 * keeps never unlock pays the arcade at settlement: $25 to the season's best
 * banked score in each of the four games (ties to the earliest banked run;
 * any signed-in wallet, NO holder qualification). Funded ONLY from money that
 * never unlocked, so the slice sum and every holder's math never move.
 * ADR-0139 narrowed the source and did not shrink it: unlocked money can no
 * longer strand on a keep with no qualified holders (it joins the one pot), so
 * never-unlocked money is now the ONLY source. It was already the larger of
 * the two (S6: $424.50 never unlocked vs $0.00 stranded), so the $100 ceiling
 * is unaffected. The bot's ECONOMY block mirrors these two numbers; change
 * both sides together (the preflight economy gate compares them). */
export const GAME_LEADER_PRIZE_USD = 25;
export const GAME_LEADER_POOL_MAX_USD = 100;

/** What the season is worth, in one number. It IS the pool now (the arcade
 * prize is a carve-out of the pool's unearned money, not an addition). */
export const SEASON_MONEY_USD = POOL_FULL_USD;

/** Storage key the play-session token is carried under. */
export const SESSION_STORAGE_KEY = "s7_game_token";

/**
 * THE PLAY SESSION MUST SURVIVE A CLOSED TAB (ADR-0109, learned the hard way
 * in S7: sessionStorage died with the tab and 6 players out of 53 had ever
 * managed to pick a tank). localStorage survives the tab and is shared across
 * tabs; the read falls back to sessionStorage so nobody is logged out by a
 * deploy.
 *
 * THE TRADE-OFF, STATED: a bearer token in localStorage persists across
 * browser sessions, so an XSS bug would have longer to find it. Accepted
 * because the token authorises PLAY only: it cannot move money, cannot touch a
 * wallet, and cannot outlive the server-side `expires_at` on
 * launch_wars_s7_game_sessions, which stays the real boundary.
 */
export function readSessionToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY) || "";
  } catch {
    return ""; // storage blocked (private mode, embedded webview): stay a guest
  }
}

export function writeSessionToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, token);
    sessionStorage.setItem(SESSION_STORAGE_KEY, token); // keep the old readers working
  } catch {
    /* storage blocked: the session lives for this page only */
  }
}

/**
 * THE EIP-4361 MESSAGE THE PLAY SESSION IS MINTED FROM.
 *
 * Lives here, not in the game shell, because the hangar opens sessions too and
 * the server verifies the EXACT posted bytes (freshness + domain allowlist in
 * lib/stars/server). Two copies of this template that drift by one character
 * is an auth break with no error message, so there is one.
 *
 * Rabby and friends only show the trusted SIWE panel when the Nonce line
 * exists; do not "tidy" the shape.
 */
export function buildPlaySessionMessage(
  address: string,
  nonce: string,
  issuedAt: string,
  domain: string,
  uri: string,
  seasonName = "Realmfall",
): string {
  return (
    `${domain} wants you to sign in with your Ethereum account:\n` +
    `${address}\n\n` +
    `Open a ${seasonName} play session. Signature only, no transaction, no gas, no approvals.\n\n` +
    `URI: ${uri}\n` +
    `Version: 1\n` +
    `Chain ID: 1\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${issuedAt}`
  );
}

export function clearSessionToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
/** localStorage key guest (pre-join) arcade progress is parked under until
 * /api/s7/claim-guest banks it once against a real wallet. */
export const GUEST_STORAGE_KEY = "s7_guest";

// ── Hold economy display mirrors (the bot's ECONOMY is authoritative; these
// exist so web surfaces show the SAME numbers). Carried VERBATIM from the
// S7-proven ADR-0098 math: linear rate, no knee, dynamic breadth ceiling. ────
/** Daily hold earn per $1 held (mirrors bot ECONOMY.HOLD_RATE). */
export const HOLD_RATE_PER_USD_DAY = 10;
/** Freshness mirrors (bot ECONOMY.FRESH_BONUS / FRESH_WINDOW_DAYS): a NEWLY
 * listed keep pays up to x(1 + FRESH_BONUS) hold Valor per $ on launch
 * day, easing linearly to x1 over FRESH_WINDOW_DAYS. Display only on the web;
 * the bot's accrual does the math. */
export const FRESH_BONUS = 1.0;
export const FRESH_WINDOW_DAYS = 10;
/** The knee stayed dead (S7, 2026-08-03: wallet-splitting paid 2.4x, a sybil
 * exploit not a balance dial). Linear to the cap: 10 Valor per dollar per
 * day, the sentence a player can repeat. Kept as 0-effect constants so nothing
 * that imports them breaks mid-deploy. */
export const SOFT_KNEE_USD = 0;
export const SOFT_RATE_FACTOR = 1;
export const HOLD_CAP_USD = 100; // BASE ceiling
export const HOLD_CAP_PER_DOMAIN = 10; // +$10 ceiling per distinct keep held $5+
export const HOLD_CAP_MAX = 150; // dynamic ceiling cap
/** Dynamic ceiling: $100 base + $10 per keep held $5+, capped at $150. */
export function holdCap(domainsEntered: number): number {
  return Math.min(HOLD_CAP_USD + HOLD_CAP_PER_DOMAIN * Math.max(0, domainsEntered || 0), HOLD_CAP_MAX);
}
/** Daily hold BASE (before tier + freshness): LINEAR to the dynamic ceiling.
 * $5 = 50/day, $25 = 250/day, $100 = 1000/day (mirrors the bot's s7HoldBase). */
export function holdBaseDaily(heldUsd: number, domainsEntered = 0): number {
  const cap = holdCap(domainsEntered);
  const h = Math.max(0, heldUsd || 0);
  return HOLD_RATE_PER_USD_DAY * Math.min(h, cap);
}

/** Breadth tiers (S4 grammar, S7 names): each distinct keep held $5+
 * past the first = +5% daily hold, capped Tier 5. */
export const TIER_STEP_PCT = 5;
export const TIER_MAX = 5;
export const TIER_NAMES = ["Lone Adventurer", "Cell", "Network", "Movement", "Full Realmfall"];

/** Hero classes by dollars held (the rig you adventurer grows with conviction).
 * KEYS keep their S7 spellings for clone safety; only the display names are
 * S7. Highest `min` at or under heldUsd wins; under $5 renders as Recon too. */
export const HULL_CLASSES = [
  { min: 5, key: "scout", name: "Recon" },
  { min: 25, key: "cavalry", name: "Skirmisher" },
  { min: 50, key: "battle", name: "Assault" },
  { min: 100, key: "siege", name: "Breaker" },
  { min: 150, key: "superheavy", name: "Colossus" },
] as const;
export type HullKey = (typeof HULL_CLASSES)[number]["key"];

// ── Persistent character stats (S4 ADR-0004 keys, S7 display names) ─────────
// The internal keys stay botox/drugs/ozempic/aura/optics forever (stable
// backbone); the theme only renames what players see.
export type StatKey = "botox" | "drugs" | "ozempic" | "aura" | "optics";
export type PlayerStats = Record<StatKey, number>;

export const ZERO_STATS: PlayerStats = { botox: 0, drugs: 0, ozempic: 0, aura: 0, optics: 0 };

const STAT_MAX: PlayerStats = { botox: 4, drugs: 4, ozempic: 4, aura: 30, optics: 4 };

export const STAT_LABELS: Record<StatKey, { name: string; blurb: string; max: number }> = {
  botox: { name: "Plating", blurb: "take less damage", max: 4 },
  drugs: { name: "Reactor", blurb: "move faster", max: 4 },
  ozempic: { name: "Cloak", blurb: "dodge more", max: 4 },
  aura: { name: "Payload", blurb: "hit harder", max: 30 },
  optics: { name: "Sensors", blurb: "see first", max: 4 },
};

// ── Stat pricing (MIRRORS the bot's ECONOMY block; the server is the price
// authority on both surfaces, the client only displays). Index n = the price
// of level n+1 for the 0..4 stats; Payload walks its own step curve. ─────────
export const STAT_LEVEL_PRICES = [100, 220, 380, 600] as const;
export const AURA_STEP_BASE = 40;
export const AURA_STEP_PER_LEVEL = 20;

/** Price of the NEXT level from `level`, or null when maxed. */
export function statNextPrice(stat: StatKey, level: number): number | null {
  const max = STAT_LABELS[stat].max;
  if (level >= max) return null;
  if (stat === "aura") return AURA_STEP_BASE + AURA_STEP_PER_LEVEL * level;
  return STAT_LEVEL_PRICES[level] ?? null;
}

/** Read the stat levels out of an hq JSONB value. Anything missing,
 * non-numeric, negative, or over range clamps safely (S4/S7-proven). */
export function clampStats(raw: unknown): PlayerStats {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const read = (k: StatKey): number => {
    const n = Number(src[k]);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(STAT_MAX[k], Math.floor(n)));
  };
  return {
    botox: read("botox"),
    drugs: read("drugs"),
    ozempic: read("ozempic"),
    aura: read("aura"),
    optics: read("optics"),
  };
}

// ── The game slate ──────────────────────────────────────────────────────────
export type GameSlot = {
  key: string; // stable across theme
  name: string;
  comingSoon: boolean; // true until the game's client ships (run-start rejects it)
  /** SANITY CLAMP ONLY (ADR-0120: scores never cap). Pinned far above the
   * measured oracle (>=5x); a posted score above it is provably forged.
   * NEVER a reachable design bound - validity is the rate envelope below. */
  maxScore: number;
  /** THE VALIDITY ENVELOPE (mirrors the sim's rate() exactly; the harness
   * asserts agreement): a legit score fits ratePerSec x simSeconds + burst.
   * The score route enforces it with the run's duration. */
  ratePerSec: number;
  burst: number;
  /** Minimum believable play time for one run, in ms. ANTI-CHEAT ONLY. The
   * guard that actually matters is the server-issued run nonce plus the
   * rate envelope; the floor only stops an instant nonce replay. Do not
   * raise it to punish speed (the S7 fast-win lesson). */
  floorMs: number;
  /** FAST-WIN EXEMPTION, absolute (ADR-0120: a fraction of an unreachable
   * clamp is meaningless): a run under the floor banks only if it scored at
   * least this. Idle runs score ~0; these bars prove real play. */
  fastWinScore: number;
  attempts: number; // scored runs per UTC day (best-of-N)
};

/** THE RETIREMENT GRACE WINDOW (S7 rule, carried whole): a retired key keeps
 * exactly one privilege for a few hours after its cutover: its score can still
 * be BANKED (run-start already rejects it, so no new runs enter the window).
 * Entries are dead weight after `until` and are deleted on the next deploy. */
export type RetiredRule = {
  maxScore: number;
  ratePerSec: number;
  burst: number;
  floorMs: number;
  attempts: number;
  fastWinScore: number;
  until: number;
};

export const RETIRED_GRACE_MS = 6 * 60 * 60 * 1000;

export const RETIRED_RULES: Record<string, RetiredRule> = {
  // Empty: S7 has no retirements yet. Add entries only at a cutover, with the
  // retired game's own final numbers copied verbatim, and delete after `until`.
};

/** A live game's rules, or a retired game's rules while its grace window is
 * open. Banking paths use this; run-start deliberately does NOT (a retired
 * game cannot be started, only finished). Returns null for anything else. */
export function bankableRules(
  game: string,
): { maxScore: number; ratePerSec: number; burst: number; floorMs: number; attempts: number; fastWinScore: number } | null {
  const live = GAME_RULES[game];
  if (live) return live;
  const retired = RETIRED_RULES[game];
  if (retired && Date.now() < retired.until) return retired;
  return null;
}

// CEILINGS vs UPGRADE STATS (ADR-0070 rule, carried whole): every stat
// modifier in every sim is deliberately CEILING-NEUTRAL. A modifier may change
// reach, survival or reaction time, but must never touch an enemy/target
// COUNT, a point value, a spawn/fire schedule, or the run length. The harness
// asserts each sim's exported ceiling() agrees with maxScore below.
export const GAMES: GameSlot[] = [
  // ── THE S7 SLATE (hand-written; merge_s7_games.py preserves this block) ──
  // maxScore = the ADR-0120 sanity clamp (>= 5x measured oracle, never a
  // reachable bound); rate mirrors each sim's rate() exactly (harness gate e).
  {
    key: "gauntlet",
    name: "The Gauntlet",
    comingSoon: false, // wired 2026-08-25: route page + RunShell shell.tsx live
    maxScore: 2_000_000,
    ratePerSec: 1600,
    burst: 3300,
    floorMs: 30_000,
    fastWinScore: 0,
    attempts: 3,
  },
  {
    key: "horde",
    name: "Hordebreaker",
    comingSoon: false, // season shell + route wired 2026-08-25 (shell.tsx + page.tsx)
    maxScore: 4_000_000,
    ratePerSec: 2200,
    burst: 3500,
    floorMs: 30_000,
    fastWinScore: 0,
    attempts: 3,
  },
  {
    key: "crypt",
    name: "The Crypt",
    comingSoon: false, // season shell wired 2026-08-25 (games/crypt/shell.tsx)
    // rate re-derived 2026-08-30 for the duel rework: damage lands only in
    // punish windows, so the kill pace dropped ~3x (the honest envelope is
    // in crypt/sim.ts rate()'s docstring). maxScore stays: live clamp.
    maxScore: 2_500_000,
    ratePerSec: 650,
    burst: 3200,
    floorMs: 30_000,
    fastWinScore: 0,
    attempts: 3,
  },
  {
    key: "ascent",
    name: "The Spire",
    // Planned as the week-2 drop; Mike pulled it into the LAUNCH slate
    // (2026-08-28: "are all 4 games done? finish them"). Numbers are the
    // ones scripts/s7-ascent-check.ts derives and gate (e) mirrors.
    comingSoon: false,
    maxScore: 250_000,
    ratePerSec: 240,
    burst: 400,
    floorMs: 30_000,
    fastWinScore: 0,
    attempts: 3,
  },
];

export const GAME_RULES: Record<string, GameSlot> = Object.fromEntries(
  GAMES.map((g) => [g.key, g]),
);
