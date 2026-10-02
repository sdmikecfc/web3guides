/**
 * THE SEASON CONFIG CONTRACT (ADR-0110 / ADR-0129) - the one file per season.
 *
 * A season is a TENANT of the engine: everything that varies between seasons
 * lives in a `SeasonConfig` under src/seasons/<key>/season.config.ts, and the
 * engine (src/season/*) renders whichever config it is handed. Nothing in the
 * engine may contain a season word, key, date, dollar figure, or art path -
 * the residue gate greps for exactly that.
 *
 * DERIVATION OVER STORAGE: table names, config keys, the grant RPC, and route
 * paths are all DERIVED from `key` by the helpers below, so a season cannot
 * half-rename itself (the S6 module still reading `s5_theme` five copies deep
 * is the failure this kills). Frozen seasons (S2-S6) never migrate onto this;
 * their irregularities stay theirs.
 *
 * THE SHADOW-TOKEN LAW (SEASON_KIT sect. 7): every token the bot or web reads
 * from a theme row MUST be declared here with a real value, even when the SQL
 * overrides it. A missing token silently speaks the previous season's words.
 */

export interface SeasonTheme {
  seasonName: string; // "Launch Wars S7: Realmfall"
  target: { singular: string; plural: string };
  team: { singular: string; plural: string };
  player: { singular: string; plural: string };
  points: string;
  playCurrency: string;
  bondedWord: string;
  statusWord: { pending: string; live: string; failed: string };
  teams: { key: string; name: string; accent: string }[];
  pitch: string;
  phrase: string; // the season line ("The realm remembers.")
  emoji: { points: string; currency: string; flash: string };
}

export interface SeasonMoney {
  /** MIRRORED BY THE BOT - the preflight economy-agreement gate reads both
   * sides and fails on drift. One pot, per-domain slices (ADR-0126). */
  poolFullUsd: number;
  sliceMinUsd: number;
  sliceMaxUsd: number;
}

export interface SeasonWindow {
  /** ISO strings; THE ONLY PLACE dates may exist (the "Aug 17" inheritance
   * bug shipped because strings.ts carried its own copy). Display strings
   * derive at render time in the viewer's locale. */
  launchAt: string;
  endAt: string;
}

export interface SeasonConfig {
  key: string;          // "s7" - drives every derived name below
  name: string;         // formal display name
  title: string;        // logo word ("REALMFALL")
  host: string;         // canonical host, copy-facing
  basePath: string;     // "/s7" - the season's route root on the host
  window: SeasonWindow;
  money: SeasonMoney;
  theme: SeasonTheme;
  /** The PREVIOUS season's nouns: the derived banned-vocab preflight gate
   * (the S6 preflight hardcoded S5 words and went stale - panel law). */
  bannedVocab: string[];
  artRoot: string;      // "/s7-art"
  /** Where the world PLATE physically lives (S6 read /s5-art/world; making
   * it config turns a live cross-season dependency into a declared one). */
  worldArtRoot: string;
  gameKeys: string[];
  /** Season roster axis: S7 = the six classes; earlier seasons had vehicles. */
  rosterKeys: string[];
}

// ── derivations: one key, every name ────────────────────────────────────────
export const seasonTable = (c: SeasonConfig, t: string) => `launch_wars_${c.key}_${t}`;
export const seasonConfigKey = (c: SeasonConfig, k: string) => `${c.key}_${k}`;
export const seasonGrantRpc = (c: SeasonConfig) => `${c.key}_grant`;
export const seasonPath = (c: SeasonConfig, p = "") => `${c.basePath}${p}`;
export const seasonArt = (c: SeasonConfig, p: string) => `${c.artRoot}/${p.replace(/^\//, "")}`;

/** Every table the engine touches, asserted at preflight so a missing
 * migration is a named failure, not a silent empty render. */
export const SEASON_TABLES = [
  "targets", "players", "ledger", "holdings", "settlement", "trades", "classes",
] as const;
