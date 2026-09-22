/**
 * Season 5 (IRON SIEGE) game registry + economy mirrors. The one const to edit
 * when a real game ships. Client-safe (no secrets, no server imports): the play
 * page, /api/s5/run-start, /api/s5/score and /api/s5/claim-guest all read this.
 *
 * Mirrors the proven S4 pattern (src/lib/s4/games.ts): game keys are defined
 * ONCE here, never duplicated across routes.
 */

export const SEASON_KEY = "s5";

/** Combined Medals cap per wallet per UTC day across ALL games. Games are a
 * SMALL Medals source; holding is the main engine. The bot module must MIRROR
 * this value when the s5 Discord side ships. */
export const GAME_DAILY_POINTS_CAP = 40;

/** THE FLAT-MEDAL LAW (2026-08-03 economy redesign, mirrors the bot's
 * ECONOMY.FLAT_MEDAL_DAILY_CAP). Everything that is not holding shares one
 * 40 a day ceiling, and it is STRUCTURAL rather than queried: the arcade pays
 * 10 for the first scored run of the day, the raid pays at most 20, a post
 * pays 10, and 10 + 20 + 10 = 40 exactly. No shared counter, no cross-repo
 * query, no race.
 *
 * Why: S3's lesson #11 (the small-holder inversion) was still live. A $5
 * holder earned 50 a day from holding but could stack ~86 a day from the raid,
 * the arcade and a good post, so the game paid MORE for not bonding anything.
 * 40 sits below 50, so holding leads at every tier by construction. */
export const GAME_MEDALS_FIRST_RUN = 10;

/** Flat Medals for one banked run (S5 simplification: no per-game credit
 * formulas yet; 4 games x 10 = the 40/day combined cap exactly). */
export const POINTS_PER_RUN = GAME_MEDALS_FIRST_RUN;

/**
 * THE FRONT REACTS (siege-sprint bonus). While ANY stronghold is inside its
 * 48h siege sprint (the bot's 85% tripwire, config row s5_sprint_state), a
 * banked run pays POINTS_PER_RUN + this bonus.
 *
 * A TIMING lever, never an inflation lever: the arcade pays for the FIRST
 * scored run of the day only, so a sprint makes that one run worth 15 instead
 * of 10 and the day's arcade total still cannot pass 15. Applied SERVER-SIDE
 * only; the client never claims it. */
export const SPRINT_RUN_BONUS_POINTS = 5;

/**
 * SHELLS FOR A BANKED RUN.
 *
 * The arcade used to pay ZERO play currency, while three separate routes told
 * the player to "earn more by playing" (vault-buy, tank-unlock, war-effort).
 * Every Shell in the season came from the bot's daily sweep, which pays only
 * for HOLDING -- so a browser-only commander could play all four games every
 * day forever and never afford a single tank, decal or upgrade. The shop was
 * unreachable for exactly the people the free arcade exists to recruit.
 *
 * Deliberately SMALL against holding, which stays the real engine: four games
 * a day is ~60 Shells, so the first tank unlock (300) is about five days of
 * pure play. It buys a progression loop for non-spenders, not a bypass.
 *
 * Paid on the SAME schedule as Medals -- only when a run actually banks, and
 * only for a first scored run of the day per game. A later attempt that
 * improves your best SCORE does not pay again, exactly like Medals.
 */
export const SHELLS_PER_RUN = 15;

/** The ONE place the season pool total lives on the web (client-safe, same
 * seam as S4's POOL_FULL_USD). The bot's ECONOMY.PRIZE_POOL_USD (doma-reporter
 * modules/season5/index.js:127) is the SOURCE OF TRUTH; this is its mirror and
 * MUST equal it ($700 base pool, ADR-0061/ADR-0076; bounties and honors sit
 * outside this number). Change the bot first, then this in the same deploy. */
export const POOL_FULL_USD = 700;

/** The other two envelopes, which sit OUTSIDE the pool and are why players who
 * only ever see $700 think the season is smaller than it is (Mike, 2026-08-01).
 * Same source of truth as above: the bot's ECONOMY comment states the strict
 * envelope 700 + 200 + 100 = $1,000 a season. Breach bounties live per-wall in
 * targets.bounty_usd and RE-SPLIT when a new stronghold lands (the total never
 * grows), so a surface should prefer the live sum and fall back to this. */
/** THE BOUNTY HOLD CHECK, in hours (mirrors the bot ECONOMY.BOUNTY_HOLD_CHECK_H).
 * A wallet cash basis on a breached wall is min(what it bought in its window,
 * what it STILL HOLDS this long after the breach), which is the whole
 * anti-dump rule. The wall card counts down to it. */
export const BOUNTY_HOLD_CHECK_H = 48;

export const BOUNTY_TOTAL_USD = 300;
/** Honors pay NO CASH since the 2026-08-03 redesign. A 14-day season cannot
 * carry a weekly award ("it is only two weeks, so weekly named honors is
 * weird" - Mike), so the $100 moved into the breach bounties and honors became
 * five FINALE TITLES: Siegemaster, Wallbreaker, Founder of the Siege, Iron
 * Guard, Raid Marshal. Kept at 0 so SEASON_MONEY_USD still reads from one
 * place and every surface keeps compiling. */
export const HONORS_TOTAL_USD = 0;
/** What the season is actually worth, in one number. */
export const SEASON_MONEY_USD = POOL_FULL_USD + BOUNTY_TOTAL_USD + HONORS_TOTAL_USD;

/** Storage key the play-session token is carried under. */
export const SESSION_STORAGE_KEY = "s5_game_token";

/**
 * THE PLAY SESSION MUST SURVIVE A CLOSED TAB.
 *
 * This token used to live in sessionStorage, which is per-tab and is destroyed
 * the moment the tab closes. It is only ever WRITTEN on a game page (after the
 * wallet signature), so anyone who reached the HQ any other way was a guest:
 * every tank read "Enlist to field", the vault could not be bought from, and
 * saving a loadout was impossible. Since almost everybody arrives from a
 * Discord link, which opens a NEW TAB, that was very nearly everybody. Measured
 * on the live season: 6 players out of 53 had ever managed to pick a tank.
 *
 * localStorage fixes both halves at once (survives the tab, shared across tabs).
 *
 * THE TRADE-OFF, STATED: a bearer token in localStorage persists across
 * browser sessions, so an XSS bug would have longer to find it. Accepted here
 * because the token authorises PLAY only. It cannot move money, cannot touch a
 * wallet, and cannot outlive the server-side `expires_at` on
 * launch_wars_s5_game_sessions, which stays the real boundary.
 *
 * The read falls back to sessionStorage so nobody signed in RIGHT NOW is logged
 * out by the deploy that ships this.
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
 * Lives here, not in the game shell, because the garage now opens sessions too
 * and the server verifies the EXACT posted bytes (freshness + domain allowlist
 * in lib/stars/server). Two copies of this template that drift by one character
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
  seasonName = "Iron Siege",
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
 * /api/s5/claim-guest banks it once against a real wallet. */
export const GUEST_STORAGE_KEY = "s5_guest";

// ── Hold economy display mirrors (the bot's ECONOMY is authoritative; these
// exist so web surfaces show the SAME numbers). Copied VERBATIM from the
// proven S4 math (src/lib/s4/games.ts, ADR-0025/0028) ────────────────────────
/** Daily hold earn per $1 held for the FIRST $25 (mirrors bot ECONOMY.HOLD_RATE). */
export const HOLD_RATE_PER_USD_DAY = 10;
/** Freshness mirrors (bot ECONOMY.FRESH_BONUS / FRESH_WINDOW_DAYS): a NEWLY
 * listed stronghold pays up to x(1 + FRESH_BONUS) hold Medals per $ on launch
 * day, easing linearly to x1 over FRESH_WINDOW_DAYS. Display only on the web
 * (the map's fresh-listing note); the bot's s5Freshness does the accrual. */
export const FRESH_BONUS = 1.0;
export const FRESH_WINDOW_DAYS = 10;
/** THE KNEE IS GONE (2026-08-03). Full rate to $25 then quarter rate above
 * paid wallet-SPLITTING 2.4x ($100 in one wallet = 437/day; the same $100 as
 * four $25 wallets = 1,050/day), which is a sybil exploit rather than a
 * balance dial. The rate is linear to the cap now: 10 Medals per dollar per
 * day, which is also the sentence a player can repeat. Kept as 0-effect
 * constants so nothing that imports them breaks mid-deploy. */
export const SOFT_KNEE_USD = 0;
export const SOFT_RATE_FACTOR = 1;
export const HOLD_CAP_USD = 100; // BASE ceiling
export const HOLD_CAP_PER_DOMAIN = 10; // +$10 ceiling per distinct stronghold held $5+
export const HOLD_CAP_MAX = 150; // dynamic ceiling cap
/** Dynamic ceiling: $100 base + $10 per stronghold held $5+, capped at $150. */
export function holdCap(domainsEntered: number): number {
  return Math.min(HOLD_CAP_USD + HOLD_CAP_PER_DOMAIN * Math.max(0, domainsEntered || 0), HOLD_CAP_MAX);
}
/** Daily hold BASE (before tier + freshness): LINEAR to the dynamic ceiling
 * since ADR-0098. The old "full rate to $25, quarter rate above" doc line
 * survived the code change by a few minutes; it describes nothing this
 * function does. */
export function holdBaseDaily(heldUsd: number, domainsEntered = 0): number {
  // LINEAR to the dynamic cap (mirrors the bot's s5HoldBase). $5 = 50/day,
  // $25 = 250/day, $100 = 1000/day. See the SOFT_KNEE_USD note above for why
  // the knee was removed.
  const cap = holdCap(domainsEntered);
  const h = Math.max(0, heldUsd || 0);
  return HOLD_RATE_PER_USD_DAY * Math.min(h, cap);
}

/** Breadth tiers (S4 grammar, S5 names): each distinct stronghold held $5+
 * past the first = +5% daily hold, capped Tier 5. */
export const TIER_STEP_PCT = 5;
export const TIER_MAX = 5;
export const TIER_NAMES = ["Lone Tank", "Platoon", "Company", "Battalion", "Armored Division"];

/** Hull classes by dollars held (the tank you command grows with conviction).
 * Highest `min` at or under heldUsd wins; under $5 renders as Scout too. */
export const HULL_CLASSES = [
  { min: 5, key: "scout", name: "Scout" },
  { min: 25, key: "cavalry", name: "Cavalry" },
  { min: 50, key: "battle", name: "Battle" },
  { min: 100, key: "siege", name: "Siege" },
  { min: 150, key: "superheavy", name: "Super-Heavy" },
] as const;
export type HullKey = (typeof HULL_CLASSES)[number]["key"];

// ── Persistent character stats (S4 ADR-0004 keys, S5 display names) ─────────
// The first four internal keys stay botox/drugs/ozempic/aura forever (stable
// S4 backbone); the theme only renames what players see. S5 adds a FIFTH stat,
// OPTICS (ADR-0070), which has no legacy constraint so its key is literal.
// Engine is the one stat with NO visual upgrade ladder: it pays off in raid
// power and game feel, never in a render.
export type StatKey = "botox" | "drugs" | "ozempic" | "aura" | "optics";
export type PlayerStats = Record<StatKey, number>;

export const ZERO_STATS: PlayerStats = { botox: 0, drugs: 0, ozempic: 0, aura: 0, optics: 0 };

const STAT_MAX: PlayerStats = { botox: 4, drugs: 4, ozempic: 4, aura: 30, optics: 4 };

export const STAT_LABELS: Record<StatKey, { name: string; blurb: string; max: number }> = {
  botox: { name: "Armor", blurb: "take less damage", max: 4 },
  drugs: { name: "Engine", blurb: "move faster", max: 4 },
  ozempic: { name: "Smoke", blurb: "dodge more", max: 4 },
  aura: { name: "Caliber", blurb: "hit harder", max: 30 },
  optics: { name: "Optics", blurb: "see first", max: 4 },
};

// ── Stat pricing (MIRRORS the bot's ECONOMY block; the server is the price
// authority on both surfaces, the client only displays). Index n = the price
// of level n+1 for the 0..4 stats; Caliber walks its own step curve. ─────────
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

/** Read {botox,drugs,ozempic,aura} out of an hq JSONB value. Anything missing,
 * non-numeric, negative, or over range clamps safely (S4-proven). */
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
    optics: read("optics"), // reads 0 until the bot shop sells it: safe by default
  };
}

// ── The game slate ──────────────────────────────────────────────────────────
export type GameSlot = {
  key: string; // stable across theme
  name: string;
  comingSoon: boolean; // all four launch games are live; true only marks a future unshipped slot
  maxScore: number; // anti-forge ceiling only (per-game derivation in the comments below)
  /** Minimum believable play time for one run, in ms. ANTI-CHEAT ONLY.
   * Held at 10s across every game since 2026-08-03. It was 45-75s, which
   * rejected legitimate FAST WINS: Armor Clash is a three minute board and a
   * player who razes the HQ early finishes in well under a minute, and was
   * told "too fast" and paid nothing. The guard that actually matters is the
   * server-issued run nonce plus the maxScore clamp; the floor only stops an
   * instant nonce replay, which 10s does as well as 60. Do not raise it to
   * punish speed. */
  floorMs: number;
  /** FAST-WIN EXEMPTION, as a fraction of maxScore.
   *
   * floorMs alone cannot tell a fast WIN from an AFK death: both are short. On
   * launch day a player razed the Armor Clash HQ inside a minute, which is the
   * best outcome that board allows, and the 60s floor answered "too fast" and
   * paid nothing. Dropping the floor instead would have let an idle run bank
   * the daily Medals (the harness AFK probe proves an untouched run dies at
   * 15-31s scoring ~0), so the discriminator has to be SCORE.
   *
   * A run under the floor banks only if it scored at least this fraction of the
   * game's ceiling. Idle runs score 0-84 against ceilings of 2000-9724, so the
   * gap is enormous and this can never launder an AFK run. */
  fastWinFrac: number;
  attempts: number; // scored runs per UTC day (best-of-N)
};

/** THE RETIREMENT GRACE WINDOW.
 *
 * Retiring a key by DELETING it (the rule below) has one sharp edge: the
 * instant the deploy lands, a player who is thirty seconds into a run on the
 * old key gets a 400 when they try to bank it, and a guest loses every parked
 * score they have not claimed. Three waves shipped before this was noticed
 * because they all deployed mid-day into a nearly empty arcade; the WAVE 4
 * cutover deploys at a UTC midnight boundary on purpose, so somebody WILL be
 * mid-run.
 *
 * So a retired key keeps exactly one privilege for a few hours: its score can
 * still be BANKED. It can never be STARTED again (run-start still rejects on
 * the unknown key, so no new runs enter the window) and the old maxScore still
 * clamps, so the anti-forge bound is unchanged. Entries are dead weight after
 * `until` and should be deleted on the next deploy after the window closes.
 *
 * `until` is epoch ms. Set it to the deploy time plus GRACE_MS. */
export type RetiredRule = { maxScore: number; floorMs: number; attempts: number; until: number };

export const RETIRED_GRACE_MS = 6 * 60 * 60 * 1000;

export const RETIRED_RULES: Record<string, RetiredRule> = {
  // WAVE 5 (2026-08-01): BREAKTHROUGH -> VANGUARD. Mike played it and called
  // it: "Looks like shit, plays like shit, every checkpoint has a multiplier so
  // it's easy... Verdict: Replace." Its final numbers, verbatim, so a run that
  // is mid-air when the deploy lands can still bank. DELETE after `until`.
  //
  // `until` is 2026-08-04T00:00Z, not deploy+6h. The 6h rule assumes you know
  // when the deploy is, and this one is gated on Mike playing five games rather
  // than on a clock; a grace that expired before the cutover would protect
  // nobody. A grace that outlives the cutover costs nothing, because the route
  // is gone and no new run can start. Delete the entry on the next deploy.
  breakthrough: { maxScore: 2900, floorMs: 30000, attempts: 3, until: 1785801600000 },
  // Empty between retirement waves. WAVE 4's entries (tankbuster/holdline/
  // warbirds/descent) were deleted 2026-08-01, their 2026-07-30T06:00Z grace
  // long past. Add entries only at a cutover, with the retired game's own
  // final numbers copied verbatim, and delete them again after `until`.
};

/** A live game's rules, or a retired game's rules while its grace window is
 * open. Banking paths use this; run-start deliberately does NOT (a retired
 * game cannot be started, only finished). Returns null for anything else. */
export function bankableRules(
  game: string,
): { maxScore: number; floorMs: number; attempts: number; fastWinFrac?: number } | null {
  const live = GAME_RULES[game];
  if (live) return live;
  const retired = RETIRED_RULES[game];
  if (retired && Date.now() < retired.until) return retired;
  return null;
}

// CEILINGS vs UPGRADE STATS (ADR-0070): every stat modifier in every sim is
// deliberately CEILING-NEUTRAL, so none of the maxScore values below moved when
// the stats were wired in. The rule each sim is built to: a modifier may change
// reach, survival or reaction time, but must never touch an enemy/target COUNT,
// a point value, a spawn/fire schedule, or the run length. Recheck the per-game
// arithmetic here whenever a modifier is added or rebalanced.
export const GAMES: GameSlot[] = [
  // THREE RETIREMENT WAVES, ONE RULE: a retired game's key is DELETED here,
  // never left flagged. A stale client's run-start then rejects cleanly, and day
  // rows never mix incomparable score scales. Each replacement inherits the slot
  // and the slot's tile accent (src/app/s5/play/page.tsx ACCENTS).
  //   WAVE 1, the ADR-0075 cutover: the two ORIGINAL launch slots, an artillery
  //   slingshot and a top-down bank-shot duel, were retired whole. The
  //   fixed-screen formats regressed the franchise arc and their score scales
  //   were incomparable with what replaced them. Spearhead (slot 1) and Iron
  //   Aces (slot 2) took those slots.
  //   WAVE 2, the round-2 slate change (Mike 2026-07-25): Spearhead and Iron
  //   Aces were retired the same way, on play feel rather than scale. Mike on
  //   Spearhead: "probably the worst game you have ever built"; on Iron Aces:
  //   it "feels like too much of the other games", i.e. a third top-down tank
  //   fight next to Gunner's Run and Hold the Line. WARBIRDS took slot 1 (now
  //   rebuilt VERTICAL, the first game in the slate that is not a tank) and
  //   Escort Dash took slot 2 (the chase, S4 Getaway energy armored) along with
  //   slot 2's gold accent.
  //   WAVE 3, the round-3 slate change (Mike 2026-07-25): Escort Dash was
  //   retired on REDUNDANCY, not on execution. Mike played it: "fun game but
  //   too fast of controls and too slow of initial enemy deployment. It is fun
  //   but its just weird and too similar to hold the line", and two top-down
  //   vehicle-defence games in one slate is the redundancy that killed it.
  //   DESCENT took slot 2 and kept the gold accent. All four live games are
  //   gated green by scripts/s5-harness.ts, which carries exactly these keys.
  // tankbuster (displayed as GUNNER'S RUN; the key is the stable registry
  // spine) maxScore: count-bound ceiling, mirrored by the sim's exported
  // ceiling() from the SAME constant tables (the harness asserts they agree).
  // Soldiers (5+6+7 squads x4) 72 x5 = 360, AT teams 12 x25 = 300, snipers
  // 12 x40 = 480, roadblocks 4 x30 = 120, convoy trucks (1+2+2 convoys x3)
  // 15 x15 = 225, fuel dumps 7 x25 = 175, road mines (2+3+4) 9 x20 = 180,
  // the one gunship 100, district bonuses 50+75+100 = 225 => 2165 for a
  // literally perfect extraction (round 1 was 1290/1420 before the
  // convoy/dump/gunship layers; round 2 was 1790/1970 before road mines;
  // round 3-4 held at 1970/2167; ROUND 5, the difficulty/threat pass, bumped
  // AT teams and snipers from 9 each to 12 each - the two districts' worth of
  // extra "decision" targets that make forced prioritisation possible - and
  // moved nothing else scoring: SPEED_BY_D, the wider spawn bands, the
  // infantry weave/runner, the sniper duck-back and the AMBUSH PAIRS are all
  // ceiling-neutral by construction, see sim.ts's own ROUND-5 doc comment).
  // 2382 = ceiling + ~10% margin. (Historic: a 75s floor once assumed a death
  // before 75s never
  // banks; extraction itself is a bit over two minutes of driving.
  // THE ROUND-3 INTERACTION LAYER IS DELIBERATELY ABSENT FROM THIS TABLE:
  // junction route signs pay 0, supply caches (REPAIR / OVERDRIVE / AP ROUNDS)
  // pay 0, and no branch adds or removes a scoring body, so which route the
  // player picks cannot move the ceiling by a single point.
  // AT MAX STATS: still 2165. The counts, the flat point values, the route
  // length and SPEED_BY_D are all untouched; Armor/Smoke only buy survival,
  // and Engine (traverse + a quicker rubble-clear, timing only), Caliber (AT
  // damage + blast radius) and Optics (glint length) only make the same 2165
  // easier to approach, never larger.
  // WAVE 4 (Mike 2026-07-28): Gunner'''s Run retired for ARMOR CLASH, the
  // card battler. Mike, with a Clash Royale screenshot: "Different tanks,
  // refilling mana, tanks cost different amounts and have different skills.
  // Random enemies, get harder for 3 rounds until they have almost 1.5x your
  // mana regen." The first non-driving game the franchise has shipped, and
  // portrait-native: the sim owns the whole 360x480 canvas, card strip included.
  // ceiling(), from the same fixed tables the run generates from:
  //   kills 634 (the three rounds hold 11 + 13 + 15 enemy tanks, priced by the
  //     VICTIM tier) + tower damage and razes 1164 (per round: two smalls at
  //     260hp/5 + 40 each, plus an HQ at 420hp/5 + 120) + round wins 450
  //     (100/150/200) + clock 540 (2 per whole second left, 3 rounds x 90s)
  //   = 2788. Kills made by YOUR TOWERS pay nothing, which is what stops a
  //   turtle from scoring, and the clock and kill terms actively fight each
  //   other (razing the HQ early cancels unspawned enemies), so the total is
  //   unreachable in practice. 3050 = ceiling x 1.09.
  // ONE THREE-MINUTE BATTLE (Mike 2026-08-01: "the rounds are too short. It
  // should be one 3 minute round with double resources for the last minute").
  // The three round rosters merged into a single 39-enemy schedule, enemy
  // resupply ramps per MINUTE (1.1x / 1.4x / 1.7x), and past 120s BOTH bars
  // double. Razing their HQ ends it (WIN_PTS 450 + clock); running the clock
  // out is judged on structures razed vs lost (TIEBREAK_PTS 150), which is
  // mutually exclusive with the HQ win so the ceiling counts one of them.
  // MEASURED ceiling(): kills 634 (the same 39 enemies) + towers 356 (one
  // board now, not three: 2*(220/5 + 40) + (340/5 + 120)) + win 450 + clock
  // 360 (180s x 2) = 1800. 2000 sits inside the harness band (1800, 2016].
  // MEASURED after the batch: the oracle now fights the full battle and takes
  // the HQ at 166.7s for 1362 (it scored 578 before the mortar fix, when a
  // mortar pit could never fire at all), so GAME_SKILL_TARGET.armorclash moved
  // 950 -> 1350 to price Medals against the game as it actually plays.
  { key: "armorclash", name: "Armor Clash", comingSoon: false, maxScore: 2000, floorMs: 60000, attempts: 3, fastWinFrac: 0.2 },
  // holdline maxScore: count-bound ceiling, computed by ceiling() in the sim
  // from the SAME constants the game runs on (so it cannot drift). There is no
  // shot clock: waves escalate until the convoy dies, and RUN_MAX_WAVES 15
  // (the relief column) is what makes the total finite. Every kill is worth
  // its SPAWN wave's multiplier 1 + 0.12(k-1), never the current wave, so
  // hoarding kills for a later wave is impossible and the counts bind the
  // total. THE VARIETY & ARC PASS (2026-07-26, Mike: "just not good enough"
  // on a slate that was 12 parts presentation and 2 parts mechanics) rewrote
  // waveComp into WAVE_SPEC: all fifteen waves are now hand-authored, not
  // just 11-15, each with its own composition, spawn PATTERN (rhythm/shape)
  // and flank/shift targeting (see sim.ts), and cut the dead time between
  // waves (WAVE_BREAK 1.8->1.2) and the supply-drop interval (25->17s: the
  // core verb is "choosing where to be", and one forced choice every 25s was
  // sparse). Full derivation lives on ceiling()'s own docstring in sim.ts -
  // summary:
  //   kills 4283 + survival 1104 + drops 720 + relief 250 = 6357
  // which assumes a perfect run that also stalls every wave to its full 26s
  // timeout to farm crates (the two goals fight each other, so 6357 is
  // unreachable in practice: the live max-stat oracle scores 2222, wave 11).
  // 6993 = ceiling + ~10% margin.
  // AT MAX STATS: still 6357, re-asserted from ceiling() itself (it takes no
  // stats argument). Armor (hull hp + a shorter track-out), Smoke (i-frames)
  // and Engine (hull speed + traverse, never TURRET_SLEW) buy survival and
  // reach only; Optics is a pure readout of which bank spawns next; Caliber
  // raises shell damage to 1.35 and shell reach to 1.15, which only ever roll
  // a cleared wave on SOONER: a SHORTER run sees FEWER crates, never more.
  // The power-up crates (spread/double/speed/range, every other drop) obey
  // the same clear-bound-safe argument: fire density and reach only, a
  // crate's kind never changes its flat DROP_POINTS, and the drop schedule
  // stays time-based. The FINAL ASSAULT gate's two picks (IRON HULL +18% max
  // hull, HOT SHELLS +25% shell damage) are the same family: survival or
  // clear-speed only, never a count/value/wave. Flank/shift targeting (the
  // VARIETY & ARC pass) is the same family again: it only ever changes WHICH
  // truck a fixed-count spawn walks toward or re-aims at, never a count, a
  // value or a wave. Counts, point values, waveMult, TRUCK_BONUS,
  // DROP_POINTS, RELIEF_BONUS and RUN_MAX_WAVES are all untouched by any of it.
  // (Historic, floor now 10s.) The VARIETY & ARC pass's headless pacing puts the
  // mid-skill tape at wave 7 (~171s) and the max-stat oracle at wave 11
  // (~253s), so the 60s floor only catches runs that fold early; idle
  // collapses at ~24s for 0.
  // WAVE 4 (Mike 2026-07-28): Hold the Line became WARPATH. Same world, same
  // hull, a different job: three friendly tanks fight alongside you, the
  // turret tracks the nearest enemy by itself and the TAP is now purely the
  // trigger, and the run ends on the SIEGEBREAKER rather than a relief column.
  // Mike'''s brief: "friendly tanks and enemy tanks, auto aim to closest enemy
  // but manual fire ... dont get destroyed and destroy the enemy boss tank."
  // Crates deliberately pay ZERO (the boss phase has no wave timeout, so the
  // run has no hard length bound and any timed income would unbound the
  // ceiling; the tankbuster supply-cache precedent). maxScore is set from the
  // measured ceiling() below once the harness prints it.
  // THE CONVOY IS GONE (2026-08-01). Mike: "The friendly vehicles are trucks
  // that slide sideways and do not shoot? I am confused what the purpose is."
  // TRUCKS went to 0, so every enemy on the field now hunts the player (the
  // engage loop already treated target -1 as "the player"), the survival term
  // zeroed itself, and the enemy fire cadence + speed ramp were steepened
  // because a lone tank could otherwise orbit a wave forever.
  // MEASURED ceiling(): kills 1256 (nine waves of waveComp x waveMult) +
  // survival 0 (no squad to hold) + crates 0 + SIEGEBREAKER 520 (400 for the
  // kill, 40 per armor plate) + relief 250 = 2026. 2200 sits inside the
  // harness band (2026, 2269]. The oracle scores 291 on the solo game, so
  // GAME_SKILL_TARGET.warpath moved 700 -> 300 to keep Medals honest.
  { key: "warpath", name: "Warpath", comingSoon: false, maxScore: 2500, floorMs: 60000, attempts: 3, fastWinFrac: 0.2 },
  // warbirds (VERTICAL REBUILD, Mike 2026-07-25: "I wanted a VERTICAL scroller
  // not horizontal, similar to asteroid raid game before but SLOWER, BOMB
  // DROPPING FOR MASSIVE POINTS and WW2 style"). Top-down vertical sortie down
  // a walled corridor, leg 3 opening into a real landing STRIP guarded by a
  // FLAGSHIP BASE (the B+ pass, 2026-07-26) rather than an instant win.
  // DENSITY + GROWTH PASS (2026-07-26): the fire rate, the three legs'
  // identity and the enemy roster all moved (see sim.ts's header + mission
  // tables); SCROLL and every leg's length did NOT — the run is still the
  // same ~176s, just far busier inside it. New this pass: a FLANK fighter
  // kind (a lateral pass, not a dive/climb), a leg-2 ACE (a tougher named
  // climber), two announced mid-run upgrades (GUNS HOT at leg 2, TWIN RACK
  // — a paired bomb salvo — at leg 3), and a strip escort. maxScore:
  // count-bound ceiling from the sim's own tables, computed by ceiling() in
  // the sim so it cannot drift.
  //   GUN points  (air only): fighters 34 x20  =  680
  //     (29 across the 3 legs + 3 FLANK debuting leg 2 + 2 escorting the strip)
  //   BOMB points (ground only): AA nests 17 x70 = 1190 + tanks 17 x90 = 1530
  //                              + bases 7 x260 = 1820 + flagship 1 x450 = 450
  //                              => 4990
  //   leg bonuses 150+220+300 = 670 (up with the harder legs) + landing 400
  //   CEILING 6740 for a perfect sortie. 7414 = ceiling + 10%, harness-gated.
  // The split IS the design: 4990 of the 5670 target points (88.0%, same
  // shape as before the pass) can only be taken off the bomb rack, so
  // strafing is how you survive and bombing is how you score. Balloons are
  // obstacles worth 0 and cannot move the ceiling, and no stat, combo or the
  // paused intro LOADOUT pick touches a count, a value, SCROLL or the bomb
  // at all — GUNS HOT and TWIN RACK are the same shape (cadence/reach only:
  // see sim.ts's dropBomb and gun-trigger comments).
  // (Historic, floor now 10s.) An idle plane's uncommanded torque roll walks it into the
  // left ridge line at ~8.7s and the run is over at ~11s for 0 points
  // (unchanged: DRIFT/LANE_PAD/ROLL never moved). A full sortie (3 legs +
  // the strip) is still ~176.4s of flying (SCROLL 68 px/s down a 640px view
  // = 0.106 screens/s, vs the retired horizontal build's 96 px/s across a
  // 480px view = 0.200, per Mike's "SLOWER"). The harness oracle now means
  // roughly a quarter of the (larger) ceiling, tuned DOWN once already from
  // a first pass that folded it in leg 2 to chase fire alone — see
  // CLIMBERS_PER_LEG's own doc in sim.ts — so the anti-forge cap still has
  // real headroom above even an omniscient run.
  // WAVE 4, the bullet-hell/cartoon slate change (Mike 2026-07-28, after
  // playing the launch build): "warbirds controls are trash the game itself is
  // just trash as well ... needs to be auto shoot with bombs dropped when
  // tapped ... more focus on air obstacles but tanks are good points." The
  // rework kept the sim's skeleton and replaced what it fires: a general
  // pattern emitter (aimed fans, rings, spirals), a new ground TURRET family,
  // ~70% more air bodies, and two new scoring verbs. A NEW KEY is mandatory
  // rather than cosmetic: the ceiling moves 6740 -> 9090, and day rows must
  // never mix incomparable score scales (the rule at the top of this block).
  // warhawks ceiling(), from the same tables the run generates from:
  //   fighters (12+22+28 divers/climbers + 0+2+3 flankers + 2 strip escort)
  //     69 x 20 = 1380; AA (8+5+7) 20 x 70 = 1400; tanks (4+4+8) 16 x 90 =
  //     1440; TURRETS (1+3+4) 8 x 110 = 880; bases (1+2+4) 7 x 260 = 1820;
  //     flagship 450; leg bonuses 150+220+300 = 670; landing 400;
  //     GRAZE cap 50 x 2 = 100; CHAIN cap 10 x 30 = 300  =>  8840.
  // THE LEG-1 CORRECTION: the first cut of this pass put the whole density
  // increase on all three legs at once, which made the OPENING leg the hardest
  // thing a new player meets and folded the headless oracle inside it. Leg 1
  // now teaches (12 fighters, no flankers, one turret, a 2-bullet dive fan)
  // and legs 2-3 carry the storm. Escalation is the design, not raw volume.
  // Both new bonuses are flat and hard-capped ON PURPOSE: a percentage bonus
  // on a 6,100-point bomb economy would have to be priced here at full rate
  // and would push maxScore far above anything reachable, which is the same as
  // having no anti-forge bound at all. Bombs still carry 5,990 of the 7,370
  // target points (81%): the air game got denser, not richer.
  // 9724 = ceiling x 1.10, inside the harness (ceiling, ceiling x 1.12] band.
  { key: "warhawks", name: "Warhawks", comingSoon: false, maxScore: 9724, floorMs: 60000, attempts: 3, fastWinFrac: 0.2 },
  // descent (round-3 slate, Mike 2026-07-25): a Descent-style 6DOF tunnel raid
  // that took slot 2 at the round-3 cutover (see WAVE 3 above). A claustrophobic
  // tunnel crawl is the furthest thing from another top-down vehicle defence,
  // which is the whole reason it won the slot. The sim owns the 3D maths
  // (position, orientation, collision) so it stays headless-provable; the page
  // projects polygons to 2D canvas, which is why the three.js ban (ADR-0075)
  // does not bite.
  // THEME: built as a WW2 BUNKER COMPLEX raid (concrete corridors, rail
  // tunnels, blast doors, a generator hall) rather than literal outer space, so
  // it sits inside IRON SIEGE. The art folder and the Client's copy carry the
  // whole skin; the sim is theme-free, so a re-skin to a literal "space tank"
  // needs no sim edit.
  // maxScore: count-bound ceiling, computed by ceiling() in the sim from the
  // SAME tables the game runs on (the harness asserts they agree). Turrets
  // 10 x30 = 300 + drones 10 x25 = 250 + the one heavy 150 + chambers cleared
  // 11 x40 = 440 (every chamber but the entrance is armed exactly once) +
  // the breaker 120 + the generator 350 + the ESCAPE 500 => 2110 for a
  // literally perfect raid. 2320 = ceiling + ~10% margin. The unit counts are
  // FIXED constants, not seeded: the seed moves the shape of the complex and
  // where content sits, never how much of it there is, so the ceiling is one
  // number for every daily.
  // AT MAX STATS: still 2110. Engine (yaw/pitch and the afterburner), Armor
  // (the 4th plate + i-frames), Smoke (i-frames), Caliber (shot damage and a
  // small splash past the threshold) and Optics (telegraph lead + the objective
  // bearing) buy handling, survival, reaction time and navigation; none of them
  // touches a COUNT, a point value, the alert clock (MISSION_T) or the collapse
  // clock (COLLAPSE_T), and killing faster spawns nothing.
  // VARIETY PASS (2026-07-26): chamber archetypes (CROSSFIRE/FLOODED/DARK/
  // GATED, redistributing the same 10 fixed turrets + 10 fixed drones),
  // hunting drones that path after you post-breach, a 3-tier alert cadence,
  // in-run capability tiers (handling/boost) and corridor repair caches all
  // still hold 2110/2320 exactly: every one of them is a redistribution, a
  // rate, a behaviour or a hull-hit refund, never a new count or point value.
  // See sim.ts's own header for the full breakdown.
  // (Historic, floor now 10s.) An idle run needs no AFK-only rule to fail. With no thumb
  // the tank flies dead straight (there is no brake), meets masonry head-on and
  // grinds, and sustained contact breaches the hull: the harness measures the
  // idle run dead at 9.2s for 0 points. A good raid is ~2.5-3.5 minutes.
  // WAVE 4 (Mike 2026-07-28): Descent retired for ROLL OUT, a side-view hill
  // tank. Mike played Descent and called it: "probably the worst controls, the
  // auto forward makes it impossible to explore, the lack of a reverse was
  // terrible", then picked the replacement himself - "the side scroller with
  // the tank. You roll back and forth to help your angles." The barrel sits at
  // a FIXED angle above the hull, so the slope you park on IS your aim.
  // The one game in the slate that is not portrait: it passes aspect 16/10 and
  // pins its world at 480x300 through RunShell's worldSize.
  // ceiling(), from the same WAVE_SPEC the run generates from: kills 705 (ten
  // hand-authored waves) + wave clears 375 (15 + 5 per wave) + perfect-wave
  // bonuses 120 (10 x 12) = 1200. No time bonus and no accuracy multiplier
  // exist on purpose, so every point traces to a fixed count. 1320 = x1.10.
  // BREAKTHROUGH (Mike, 2026-07-29): "Research the game Count Masters: Stickman
  // Games. Let's make a clone of it... build that with little soldiers."
  // Replaces ROLL OUT, which he rejected outright ("I hate the whole thing").
  //
  // A crowd runner. Steering is the only verb. The road carries a FIXED roster
  // -- 6 gate pairs, 6 straggler clusters of 9, 7 obstacles, enemy columns of
  // 10/16/26/40, one gun position -- and the pace is constant by law, so the
  // roster is what ceiling() sums:
  //   stragglers 54 x2 = 108
  //   enemy soldiers 404 x3 = 1212
  //   gates 6 x10 = 60
  //   the redoubt = 200
  //   the tally, CROWD_CAP 600 x1 = 600   <- the biggest single term on
  //     purpose: the game is about ARRIVING with an army.
  //   total 2180
  // The crowd cap is load-bearing twice over: multiply gates compound, so
  // without it both the tally and the per-frame draw cost run away. It was
  // RAISED 300 -> 600 after measuring that EVERY strategy peaked at exactly
  // 300, which made the game's one decision worth 1%. A cap has to sit above
  // what a good line reaches, not on top of it.
  // 2398 = ceiling x1.10.
  // floorMs 40000, NOT the usual 60000: the road was halved to ~56s (the
  // reference runs 30-60s levels and 108s of the same four station types was
  // the "too long and slow" report), so a 60s floor would mean a COMPLETE run
  // could never bank. 40s is still far longer than a faked run.
  // VANGUARD (Mike 2026-08-01): "We take The Getaway from Season 4. We reskin
  // it to make you drive a tank that can shoot only forward. Enemies are trucks
  // with mounted machine guns that shoot at you. Barricades are randomly added
  // on the streets. Still have the goal to get to the check points."
  // Rebuilt rather than ported: the donor rolled rng throughout its step, had
  // three unbounded scoring bodies and no death condition, none of which can
  // pass this harness. See the sim header.
  // MEASURED ceiling(): rallies 900 (6 x 150) + final 400 + trucks 600
  // (10 x 60) + breaches 320 (8 x 40) + time 200 (hard cap) = 2420.
  // 2660 sits inside the harness band (2420, 2710].
  { key: "vanguard", name: "Vanguard", comingSoon: false, maxScore: 2660, floorMs: 45000, attempts: 3, fastWinFrac: 0.2 },
];

export const GAME_RULES: Record<string, GameSlot> = Object.fromEntries(
  GAMES.map((g) => [g.key, g]),
);
