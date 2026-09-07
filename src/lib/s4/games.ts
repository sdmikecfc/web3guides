/**
 * Season 4 game registry — THE one const to edit when a real game ships with
 * the theme. Wiring a game later = flip comingSoon to false (and tune rules)
 * here; the play page, /api/s4/run-start, and /api/s4/score all read this.
 *
 * S3 duplicated game keys in TWO places (the score route's GAMES map + the
 * run-start Set) — S4 defines them ONCE here. Client-safe (no secrets).
 */

/**
 * Combined Points cap per wallet per UTC day across ALL games. Games are a
 * SMALL Points source (guide lesson #11: holding leads for small holders).
 * The bot module (modules/season4 ECONOMY const) MIRRORS this value — if you
 * change it here, change it there in the same deploy.
 */
export const GAME_DAILY_POINTS_CAP = 40;

/** The ONE place the season pool total lives (client-safe: the map and any
 * client component read it from here, since data.ts is server-only). */
export const POOL_FULL_USD = 1000; // Week 1 $500 + Week 2 wave $500 (Mike 2026-07-20). Deploy together with the bot's PRIZE_POOL_USD bump, AFTER the new wave is ingested.

/** sessionStorage key the game pages carry the play-session token under (S3: sf_game_token). */
export const SESSION_STORAGE_KEY = "s4_game_token";

// ── Economy display constants (client-safe; the bot's ECONOMY is authoritative,
// these exist so web surfaces show the SAME numbers, ADR-0025) ───────────────
/** Daily hold earn per $1 held = 50 Bounty per $5/day for the FIRST $25 (mirrors bot ECONOMY.HOLD_RATE — change together). */
export const HOLD_RATE_PER_USD_DAY = 10;
// Soft cap (ADR-0028): full rate on the first $25 held, a reduced rate above it
// up to $100, nothing beyond. Big holders earn more (bond pull) with diminishing
// returns — no runaway. Mirrors the bot's s4HoldBase EXACTLY.
export const SOFT_KNEE_USD = 25;
export const SOFT_RATE_FACTOR = 0.25;
export const HOLD_CAP_USD = 100; // BASE ceiling
export const HOLD_CAP_PER_DOMAIN = 10; // +$10 ceiling per distinct contract held $5+
export const HOLD_CAP_MAX = 150; // dynamic ceiling cap (Mike 2026-07-15)
/** Dynamic ceiling: $100 base + $10 per contract held $5+, capped at $150. Spreading raises it. */
export function holdCap(domainsEntered: number): number {
  return Math.min(HOLD_CAP_USD + HOLD_CAP_PER_DOMAIN * Math.max(0, domainsEntered || 0), HOLD_CAP_MAX);
}
/** Daily hold BASE (before tier + freshness): full rate to $25, quarter rate to the dynamic ceiling. */
export function holdBaseDaily(heldUsd: number, domainsEntered = 0): number {
  const cap = holdCap(domainsEntered);
  const h = Math.max(0, heldUsd || 0);
  const full = Math.min(h, SOFT_KNEE_USD);
  const soft = Math.min(Math.max(0, h - SOFT_KNEE_USD), cap - SOFT_KNEE_USD);
  return HOLD_RATE_PER_USD_DAY * (full + SOFT_RATE_FACTOR * soft);
}
/** Breadth tiers: each distinct contract held $5+ past the first = +5% daily hold, capped Tier 5 (x1.20). */
export const TIER_STEP_PCT = 5;
export const TIER_MAX = 5;
export const TIER_NAMES = ["Contractor", "Operative", "Specialist", "Cleaner", "Kingpin"];

// Freshness (ADR-0028): a domain listed FEWER days pays MORE per $ held, so
// holders spread to new domains instead of camping the oldest. Launch day pays
// x(1+FRESH_BONUS), easing linearly to x1 over FRESH_WINDOW_DAYS. Mirrors the
// bot's s4Freshness EXACTLY. Used by the map contract card to show each
// contract's live per-$5 rate. Pass a server-provided nowMs (never Date.now in
// a server component's render path) so SSR and the client agree.
export const FRESH_BONUS = 1.0;
export const FRESH_WINDOW_DAYS = 10;
export function freshnessMult(launchAt: string | null, nowMs: number): number {
  if (!launchAt) return 1;
  const ms = new Date(launchAt).getTime();
  if (!Number.isFinite(ms) || ms > nowMs) return 1;
  const days = (nowMs - ms) / 86400000;
  const frac = Math.max(0, Math.min(1, (FRESH_WINDOW_DAYS - days) / FRESH_WINDOW_DAYS));
  return 1 + FRESH_BONUS * frac;
}

export type GameSlot = {
  key: string; // stable across theme; the theme renames only the display name
  name: string;
  comingSoon: boolean;
  // Server-side anti-forge + reward rules (S3-proven shapes). maxScore is only
  // an anti-forge ceiling; score passes through so leaderboards separate skill.
  maxScore: number;
  toCredits: (score: number) => number;
  creditsCap: number;
  pointsCap: number; // per-game per-day Points ceiling (also bounded by the combined cap)
  attempts: number; // scored runs per UTC day (best-of-N; improvements pay the delta)
  floorMs: number; // minimum believable play time for one run
};

export const GAMES: GameSlot[] = [
  {
    // STAMPEDE — 60s frontier horseback shootout (src/app/s4/games/riviera;
    // key "riviera" is the stable internal id, the game was re-themed from the
    // speedboat on launch day per Mike). Score = saloon window chains + towers
    // + wagons + pickups; verified full run banked 15,419, inside the old
    // 14,000-16,800 band, so every rule below stays honest. DNF-safe
    // bucked-off runs can land near ~20s, so floorMs stays UNDER that (18s).
    key: "riviera",
    name: "Stampede",
    comingSoon: false,
    maxScore: 25000,
    toCredits: (s) => Math.round(s / 220),
    creditsCap: 110,
    pointsCap: 10,
    attempts: 3,
    floorMs: 18000,
  },
  {
    // HIGH NOON — 75s frontier survivors-like (src/app/s4/games/highnoon).
    // Score = survival + weighted outlaw KOs + boss beats; a measured strong
    // full run lands ~7,200 and a ~50s death banked ~3,700, so maxScore 9000
    // is a pure anti-forge ceiling and the credits cap binds around 6,600.
    key: "highnoon",
    name: "High Noon",
    comingSoon: false,
    maxScore: 9000,
    toCredits: (s) => Math.round(s / 55),
    creditsCap: 120,
    pointsCap: 10,
    attempts: 3,
    floorMs: 20000,
  },
  {
    // THE GETAWAY — pursuit-driving escape vs a 70s DNF clock
    // (src/app/s4/games/getaway). Score = 7 checkpoints + chasers dropped +
    // near misses + the escape gate; strong run ~9,000-14,000. Sim par escape
    // is 47-63s, so floorMs 30s sits safely under the earliest legit finish.
    key: "getaway",
    name: "The Getaway",
    comingSoon: false,
    maxScore: 16000,
    toCredits: (s) => Math.round(s / 140),
    creditsCap: 115,
    pointsCap: 10,
    attempts: 3,
    floorMs: 30000,
  },
  {
    // EXTRACTION — 60s three.js cyberpunk chain-brawler bike run
    // (src/app/s4/games/extraction). Score = distance + riders chained + near
    // misses + threaded roadblocks + boost strips + the buzzer bonus; strong
    // run ~9,000-13,000. A 3rd crash ends the run early but still banks;
    // floorMs matches the 30s fallback the page shipped with.
    key: "extraction",
    name: "Extraction",
    comingSoon: false,
    maxScore: 18000,
    toCredits: (s) => Math.round(s / 150),
    creditsCap: 120,
    pointsCap: 10,
    attempts: 3,
    floorMs: 30000,
  },
];

export const GAME_RULES: Record<string, GameSlot> = Object.fromEntries(
  GAMES.map((g) => [g.key, g]),
);

/**
 * Points earned for a run, before the combined daily cap. Same shape as S3
 * (Points ~= 20% of the play currency, per-game capped): games stay a minor
 * Points pillar, the play currency is the main game reward.
 */
export function pointsForCredits(credits: number, cap: number): number {
  return Math.min(cap, Math.round(credits * 0.2));
}

// ─── Character stats → in-game synergy (ADR-0004) ───────────────────────────
//
// Persistent character stats live in launch_wars_s4_players.skin JSONB as
// TOP-LEVEL keys: { botox: 0-4, drugs: 0-4, ozempic: 0-4, aura: 0-30 }.
// /api/s4/run-start reads them and returns them with the run nonce, so a game
// starts with the player's baseline. The bot side (modules/season4) must write
// the same top-level keys when it updates a character sheet.
//
// ECONOMY GUARDRAIL (non-negotiable): every effect below is BOUNDED per game
// (≤ ~30% total advantage per stat class) and only makes reaching the EXISTING
// server caps (maxScore / creditsCap / pointsCap / GAME_DAILY_POINTS_CAP)
// easier. Stats never raise any cap and never mint anything by themselves.

export type StatKey = "botox" | "drugs" | "ozempic" | "aura";
export type PlayerStats = Record<StatKey, number>;

export const ZERO_STATS: PlayerStats = { botox: 0, drugs: 0, ozempic: 0, aura: 0 };

const STAT_MAX: PlayerStats = { botox: 4, drugs: 4, ozempic: 4, aura: 30 };

/**
 * Player-visible gear-stat names (ADR-0020: Armor / Ride / Gadgets / Weapon;
 * the internal keys + combo keys stay b/d/o). Client-safe display map mirroring
 * the bot's STATS (modules/season4: name + blurb) so the web character picker
 * labels the stats exactly as Discord does. Aura = Weapon is a 0-30 weapon
 * ladder, an overlay, never a model dimension. If the live s4_theme ever renames
 * these, change here too (same one-seam rule the games follow for DEFAULT_THEME).
 */
export const STAT_LABELS: Record<StatKey, { name: string; blurb: string; max: number }> = {
  botox: { name: "Armor", blurb: "take less damage", max: 4 },
  drugs: { name: "Ride", blurb: "move faster", max: 4 },
  ozempic: { name: "Gadgets", blurb: "dodge more", max: 4 },
  aura: { name: "Weapon", blurb: "hit harder", max: 30 },
};

// Stat-ladder Gold prices. MIRROR the bot's ECONOMY (modules/season4 index.js:
// STAT_LEVEL_PRICES / AURA_STEP_BASE / AURA_STEP_PER_LEVEL) — change together.
// STAT_LEVEL_PRICES[n] = the price of level n+1 for the 0-4 stats; aura climbs on
// a curve. The web upgrade route recomputes price SERVER-SIDE from this (never
// trusts a client-sent price); the character page reads it only for display.
export const STAT_LEVEL_PRICES = [100, 220, 380, 600];
export const AURA_STEP_BASE = 40;
export const AURA_STEP_PER_LEVEL = 20;

/** Gold price of the NEXT level of a stat, or null when already maxed. */
export function statNextPrice(key: StatKey, level: number): number | null {
  const max = STAT_MAX[key];
  const lv = Math.max(0, Math.min(max, Math.floor(level || 0)));
  if (lv >= max) return null;
  if (key === "aura") return AURA_STEP_BASE + AURA_STEP_PER_LEVEL * lv;
  return STAT_LEVEL_PRICES[lv] ?? null;
}

/** Read {botox,drugs,ozempic,aura} out of a skin JSONB value. Anything missing,
 *  non-numeric, negative, or over the ADR-0004 ranges clamps safely. */
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
  return { botox: read("botox"), drugs: read("drugs"), ozempic: read("ozempic"), aura: read("aura") };
}

/**
 * Per-game stat multipliers — THE one place gameplay synergy numbers live.
 * A game imports its own entry; nothing else may define stat math.
 * Display names come from the theme (botox=Armor, drugs=Ride, ozempic=Gadgets,
 * aura=Weapon); the keys below stay stable across themes.
 */
export const STAT_EFFECTS = {
  // riviera (Riviera Run): botox = hit knock resistance (less throttle lost per
  // hit), drugs = boat + scroll speed, ozempic = evasion (chance an enemy shot
  // whiffs), aura = the passenger's gun damage plus the weapon ladder
  // [1, 5, 10, 20, 30] = Pocket Pistol / Silenced SMG / Twin Uzis / Golden Gun
  // / Minigun (ladder sets the STARTING gun level, never the max).
  riviera: {
    botox: { perLevel: 0.06, cap: 0.24 },
    drugs: { perLevel: 0.04, cap: 0.16 },
    ozempic: { perLevel: 0.05, cap: 0.2 },
    aura: { damagePerLevel: 0.008, damageCap: 0.24, weaponTiers: [1, 5, 10, 20, 30] },
  },
  // highnoon (High Noon): botox = damage resistance, drugs = move speed,
  // ozempic = dodge chance, aura = damage plus the weapon ladder
  // [1, 5, 10, 20, 30] = Knife Fan / Six-Shooter / Katana Spin / Golden Deagle
  // / Briefcase Minigun. In-run level-up picks stack ON this baseline; the
  // page hard-bounds the stacked totals with its own RUN_CAPS.
  highnoon: {
    botox: { perLevel: 0.06, cap: 0.24 },
    drugs: { perLevel: 0.04, cap: 0.16 },
    ozempic: { perLevel: 0.05, cap: 0.2 },
    aura: { damagePerLevel: 0.01, damageCap: 0.25, weaponTiers: [1, 5, 10, 20, 30] },
  },
  // getaway (The Getaway): botox = PIT resistance (a chaser nudge costs less
  // speed + less heading jolt), drugs = top speed, ozempic = handling/turn
  // rate, aura = gadget potency (smoke/oil drop radius).
  getaway: {
    botox: { perLevel: 0.06, cap: 0.24 },
    drugs: { perLevel: 0.03, cap: 0.12 },
    ozempic: { perLevel: 0.05, cap: 0.2 },
    aura: { gadgetPerLevel: 0.008, gadgetCap: 0.24 },
  },
  // extraction (Extraction): botox = shove/crash resistance (enemy shoves +
  // crashes cost less speed/knockback), drugs = top speed, ozempic = evasion
  // (slimmer collision hitbox), aura = chain power (longer reach + wider swing
  // arc) plus the COSMETIC ride ladder [1, 5, 10, 20, 30] = Courier / Tuned /
  // Race-Spec / Phantom / Oni-Class (chain + exhaust color and the HUD label
  // only, no gameplay effect).
  extraction: {
    botox: { perLevel: 0.06, cap: 0.24 },
    drugs: { perLevel: 0.03, cap: 0.12 },
    ozempic: { perLevel: 0.05, cap: 0.2 },
    aura: { chainPerLevel: 0.008, chainCap: 0.24, rideTiers: [1, 5, 10, 20, 30] },
  },
} as const;
