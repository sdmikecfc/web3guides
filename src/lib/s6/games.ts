/**
 * Season 6 (UPRISING) game registry + economy mirrors. The one const to edit
 * when a real game ships. Client-safe (no secrets, no server imports): the play
 * page, /api/s6/run-start, /api/s6/score and /api/s6/claim-guest all read this.
 *
 * Mirrors the proven S5 pattern (src/lib/s5/games.ts): game keys are defined
 * ONCE here, never duplicated across routes. Constant NAMES that other files
 * import (GAME_MEDALS_FIRST_RUN, SHELLS_PER_RUN, ...) keep their S5 spellings
 * VERBATIM for clone safety, the same rule that keeps the SQL RPC signatures
 * identical; only display words change (Signal, Scrap).
 */

export const SEASON_KEY = "s6";

/** Combined Signal cap per wallet per UTC day across ALL games. Games are a
 * SMALL Signal source; holding is the main engine. The bot module MIRRORS
 * this value (modules/season6 ECONOMY). */
export const GAME_DAILY_POINTS_CAP = 40;

/** THE FLAT-SIGNAL LAW (carried from the S5 2026-08-03 economy redesign).
 * Everything that is not holding shares one 40 a day ceiling, STRUCTURAL
 * rather than queried: the arcade pays 10 for the first scored run of the day
 * per game, the raid pays at most 20, a post pays 10. S6 launches with THREE
 * games (30/day arcade max); THE CORE lands week 2 and brings the arcade back
 * to the 40 ceiling exactly. 40 sits below the 50/day a $5 holder earns, so
 * holding leads at every tier by construction (the S3 lesson #11 guard). */
export const GAME_MEDALS_FIRST_RUN = 10;

/** Flat Signal for one banked run (no per-game credit formulas). */
export const POINTS_PER_RUN = GAME_MEDALS_FIRST_RUN;

/**
 * THE GRID REACTS (assault-sprint bonus, the S5 "front reacts" rule reskinned).
 * While ANY mainframe is inside its 48h assault sprint (the bot's 85% tripwire,
 * config row s6_sprint_state), a banked run pays POINTS_PER_RUN + this bonus.
 * A TIMING lever, never an inflation lever: applied SERVER-SIDE only; the
 * client never claims it. */
export const SPRINT_RUN_BONUS_POINTS = 5;

/**
 * SCRAP FOR A BANKED RUN (constant name kept from S5 for clone safety).
 * Deliberately SMALL against holding, which stays the real engine. Paid on the
 * SAME schedule as Signal: only when a run actually banks, and only for the
 * first scored run of the day per game. */
export const SHELLS_PER_RUN = 15;

/** The ONE place the season pool total lives on the web (client-safe). The
 * bot's ECONOMY.PRIZE_POOL_USD (doma-reporter modules/season6) is the SOURCE
 * OF TRUTH; this is its mirror and MUST equal it. Change the bot first, then
 * this in the same deploy.
 *
 * S6 ENVELOPE (Mike, 2026-08-12: "$500 a week, $1000 a season", not up for
 * debate) AND ITS SHAPE, REWRITTEN 2026-08-16 (Mike, after seeing S5 settle):
 *
 *   "take the pot, split it amongst the domains BUT they earn the percentage
 *    bonded instead of everything vs nothing... The bounties are trash, they
 *    get pennies and it doesn't excite anyone... let's do $1000 next season,
 *    split amongst the domains, paid out by percent bonded"
 *
 * ONE POT OF $1,000, DIVIDED INTO PER-MAINFRAME SLICES. A mainframe pays its
 * OWN slice to its OWN holders, scaled by the percent it actually reached:
 * liberated pays the slice in full, 60% pays 60% of it, 0% pays nothing and
 * that money is never paid out. Bounties are DELETED - the whole envelope is
 * the one pot, so there is no second number to explain and no mid-season
 * envelope to re-split.
 *
 * Why this shape, from five seasons of evidence:
 *   - S4 paid bonded-only: five walls died at 83-90% and paid $0. Trust killer.
 *   - S5 paid the full pool regardless: 2 of 10 liberated still cost the full
 *     $700. Mike: "we are paying more for less."
 *   - Percent-bonded is the middle both seasons were reaching for, and it puts
 *     the money where the player can SEE it: one mainframe, one slice, one
 *     percent. */
export const POOL_FULL_USD = 1000;

/**
 * SLICE FLOOR AND CAP (Mike, 2026-08-16: "By difficulty, floor + cap").
 *
 * Slices weight by bonding difficulty - the ADR-0026 rule Mike asked for in S4
 * ("so people don't just bond the cheapest") - but bounded at both ends,
 * because unbounded weighting failed empirically two seasons running: every
 * mainframe needing <= $3.2k has been liberated and every one needing >= $3.5k
 * stalled at 81-96%, so pure weighting parks a quarter of the pot on walls the
 * community provably cannot finish, while the cheap ones that DO fall pay
 * pennies (S5: hotcommerce liberated and its slice was $17).
 *
 * The floor makes every mainframe worth showing up for; the cap stops one
 * uncloseable backdrop from hoarding the season. Slices are normalized to sum
 * to exactly POOL_FULL_USD after clamping.
 */
export const SLICE_MIN_USD = 75;
export const SLICE_MAX_USD = 150;

/* WHY 75/150 AND NOT A WIDER BAND (measured on S5's real slate, 2026-08-16).
 * At 50/200 a mainframe that LIBERATED paid its holders $50 while
 * applications.com sitting at 23% paid $46 - finishing was worth nothing over
 * stalling, which is the exact failure this rewrite exists to kill. The slice
 * spread must stay NARROWER than the outcome multiplier or difficulty
 * weighting eats the reward for winning. At 75/150: liberated pays $75, the
 * best unfinished wall pays $43. Difficulty still counts, finishing wins. */

/** BOUNTIES ARE DELETED (Mike, 2026-08-16: "The bounties are trash, they get
 * pennies and it doesn't excite anyone. They didn't even mention the one that
 * didn't pay out"). Kept as explicit zeroes rather than removed so that any
 * surface still importing them renders nothing instead of silently inflating a
 * total, and so the next season's author reads the decision. */
export const BOUNTY_TOTAL_USD = 0;
export const BOUNTY_HOLD_CHECK_H = 48;
/** Honors pay NO CASH (ADR-0098). Five finale titles, never beside a dollar. */
export const HONORS_TOTAL_USD = 0;
/** What the season is worth, in one number. It IS the pool now. */
export const SEASON_MONEY_USD = POOL_FULL_USD;

/** Storage key the play-session token is carried under. */
export const SESSION_STORAGE_KEY = "s6_game_token";

/**
 * THE PLAY SESSION MUST SURVIVE A CLOSED TAB (ADR-0109, learned the hard way
 * in S5: sessionStorage died with the tab and 6 players out of 53 had ever
 * managed to pick a tank). localStorage survives the tab and is shared across
 * tabs; the read falls back to sessionStorage so nobody is logged out by a
 * deploy.
 *
 * THE TRADE-OFF, STATED: a bearer token in localStorage persists across
 * browser sessions, so an XSS bug would have longer to find it. Accepted
 * because the token authorises PLAY only: it cannot move money, cannot touch a
 * wallet, and cannot outlive the server-side `expires_at` on
 * launch_wars_s6_game_sessions, which stays the real boundary.
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
  seasonName = "Uprising",
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
 * /api/s6/claim-guest banks it once against a real wallet. */
export const GUEST_STORAGE_KEY = "s6_guest";

// ── Hold economy display mirrors (the bot's ECONOMY is authoritative; these
// exist so web surfaces show the SAME numbers). Carried VERBATIM from the
// S5-proven ADR-0098 math: linear rate, no knee, dynamic breadth ceiling. ────
/** Daily hold earn per $1 held (mirrors bot ECONOMY.HOLD_RATE). */
export const HOLD_RATE_PER_USD_DAY = 10;
/** Freshness mirrors (bot ECONOMY.FRESH_BONUS / FRESH_WINDOW_DAYS): a NEWLY
 * listed mainframe pays up to x(1 + FRESH_BONUS) hold Signal per $ on launch
 * day, easing linearly to x1 over FRESH_WINDOW_DAYS. Display only on the web;
 * the bot's accrual does the math. */
export const FRESH_BONUS = 1.0;
export const FRESH_WINDOW_DAYS = 10;
/** The knee stayed dead (S5, 2026-08-03: wallet-splitting paid 2.4x, a sybil
 * exploit not a balance dial). Linear to the cap: 10 Signal per dollar per
 * day, the sentence a player can repeat. Kept as 0-effect constants so nothing
 * that imports them breaks mid-deploy. */
export const SOFT_KNEE_USD = 0;
export const SOFT_RATE_FACTOR = 1;
export const HOLD_CAP_USD = 100; // BASE ceiling
export const HOLD_CAP_PER_DOMAIN = 10; // +$10 ceiling per distinct mainframe held $5+
export const HOLD_CAP_MAX = 150; // dynamic ceiling cap
/** Dynamic ceiling: $100 base + $10 per mainframe held $5+, capped at $150. */
export function holdCap(domainsEntered: number): number {
  return Math.min(HOLD_CAP_USD + HOLD_CAP_PER_DOMAIN * Math.max(0, domainsEntered || 0), HOLD_CAP_MAX);
}
/** Daily hold BASE (before tier + freshness): LINEAR to the dynamic ceiling.
 * $5 = 50/day, $25 = 250/day, $100 = 1000/day (mirrors the bot's s6HoldBase). */
export function holdBaseDaily(heldUsd: number, domainsEntered = 0): number {
  const cap = holdCap(domainsEntered);
  const h = Math.max(0, heldUsd || 0);
  return HOLD_RATE_PER_USD_DAY * Math.min(h, cap);
}

/** Breadth tiers (S4 grammar, S6 names): each distinct mainframe held $5+
 * past the first = +5% daily hold, capped Tier 5. */
export const TIER_STEP_PCT = 5;
export const TIER_MAX = 5;
export const TIER_NAMES = ["Lone Pilot", "Cell", "Network", "Movement", "Full Uprising"];

/** Mech classes by dollars held (the rig you pilot grows with conviction).
 * KEYS keep their S5 spellings for clone safety; only the display names are
 * S6. Highest `min` at or under heldUsd wins; under $5 renders as Recon too. */
export const HULL_CLASSES = [
  { min: 5, key: "scout", name: "Recon" },
  { min: 25, key: "cavalry", name: "Skirmisher" },
  { min: 50, key: "battle", name: "Assault" },
  { min: 100, key: "siege", name: "Breaker" },
  { min: 150, key: "superheavy", name: "Colossus" },
] as const;
export type HullKey = (typeof HULL_CLASSES)[number]["key"];

// ── Persistent character stats (S4 ADR-0004 keys, S6 display names) ─────────
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
 * non-numeric, negative, or over range clamps safely (S4/S5-proven). */
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
   * raise it to punish speed (the S5 fast-win lesson). */
  floorMs: number;
  /** FAST-WIN EXEMPTION, absolute (ADR-0120: a fraction of an unreachable
   * clamp is meaningless): a run under the floor banks only if it scored at
   * least this. Idle runs score ~0; these bars prove real play. */
  fastWinScore: number;
  attempts: number; // scored runs per UTC day (best-of-N)
};

/** THE RETIREMENT GRACE WINDOW (S5 rule, carried whole): a retired key keeps
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
  // Empty: S6 has no retirements yet. Add entries only at a cutover, with the
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
  // THE SLATE IS MIKE'S ANCHORS (2026-08-12, ADR-0118), and per ADR-0120
  // every game is ENDLESS: scores never cap, content cycles authored sets
  // under authored escalation until the run dies. maxScore is a far-off
  // sanity clamp (harness asserts >= 5x oracle); ratePerSec/burst mirror
  // each sim's rate() and are the real validity bound. comingSoon stays
  // true until the client ships, so run-start rejects the key pre-launch.
  //
  // IRONJAW - Super Punch-Out!! remake: behind-the-shoulder mech boxing.
  // Tap-zone verbs, authored tell state machines, the daily 3-bout ladder,
  // then endless TITLE DEFENSES (stable cycles, harder each visit, KO
  // values plateau at 1000 so the rate stays bounded).
  { key: "ironjaw", name: "Iron Jaw", comingSoon: false, maxScore: 400000, ratePerSec: 85, burst: 1300, floorMs: 60000, fastWinScore: 400, attempts: 3 },
  // STRAIN - Carrion-style virus turned STEALTH (Mike's spec verbatim): the
  // machines patrol behind sight cones, cameras sweep the chokepoints, three
  // seconds in anything's sight trips the alarm and the warden hunts you for
  // that floor. Reach one unseen and it corrupts whatever its tier; let it
  // clock you and your size decides. Five walled chambers, then THE WARDEN.
  // Escape pays once at door five; then the DEEP NETWORK cycles with chase
  // speed escalating per chamber AND per lap until the purge is inescapable.
  // burst raised 600 -> 1800 with the 2026-08-14 rebuild: the warden's head
  // (1200) can land in the same second as the fifth door (120) and the
  // escape bonus (300), which the old burst did not honestly cover.
  // rate raised 85 -> 145 with the 2026-08-15 stealth rebuild: the quiet
  // corrupt kills at ANY tier, so the same approach that used to buy a T2
  // now buys a T5, and unaware prey does not run. The sim's rate() carries
  // the derivation and the harness asserts the two agree.
  { key: "strain", name: "Strain", comingSoon: false, maxScore: 400000, ratePerSec: 145, burst: 1800, floorMs: 60000, fastWinScore: 500, attempts: 3 },
  // STOPCLOCK - SUPERHOT remake, top-down: time flows only while you move
  // or shoot; finite ammo; punch when dry; rooms cycle endless with fire
  // cadence, bullet speed and rusher speed tightening per lap until you are
  // shot. floorMs measures WALL time and frozen thinking is wall time.
  // rate raised 95 -> 240 with the 2026-08-14 redesign: the basic shot became
  // UNLIMITED (priced in the time surge, not in ammo), so the old ammo-bound
  // ceiling no longer bounds the honest run. The sim's rate() carries the
  // derivation and the harness asserts the two agree.
  { key: "stopclock", name: "Stopclock", comingSoon: false, maxScore: 400000, ratePerSec: 240, burst: 900, floorMs: 60000, fastWinScore: 450, attempts: 3 },
  // RIOT - the belt-scroll brawler (ADR-0124): 3 authored levels + bosses,
  // then the endless arena with one uncapped escalation term (enemy damage
  // per lap) so death is mathematical. comingSoon stays TRUE until its
  // Client ships (run-start rejects the key pre-launch - the documented
  // pre-registration pattern); the ship gate flips it. rate mirrors the
  // sim's rate(): pipe-cycle point-blank is unsustainable, honest cadence
  // ~1 kill/1.1s x 100-180 pts + fight/boss chunks; burst = the L3 boss
  // 800 + a pipe double kill + a wave bonus that cannot coincide with it.
  { key: "riot", name: "Riot", comingSoon: false, maxScore: 400000, ratePerSec: 160, burst: 1500, floorMs: 60000, fastWinScore: 500, attempts: 3 },
  // THE CORE (week 2, ADR-0116): ships mid-season and is REGISTERED HERE
  // ONLY WHEN ITS CLIENT SHIPS (the S5 theme-SQL lesson: a key the web
  // cannot serve advertises a game that does not exist).
];

export const GAME_RULES: Record<string, GameSlot> = Object.fromEntries(
  GAMES.map((g) => [g.key, g]),
);
