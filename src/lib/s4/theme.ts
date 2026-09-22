/**
 * Launch Wars Season 4 — THEME: the ONE place every player-visible word lives.
 *
 * The S4 backbone is deliberately neutral ("Season 4", "targets", "teams",
 * "Points"). Theme day writes a JSON override into the `s4_theme` row of
 * launch_wars_boss_config and every surface reskins with ZERO logic change.
 *
 * RULES (S3 leakage lessons):
 * - No themed word may appear anywhere outside this object. S3 hardcoded its
 *   accent + status labels + season strings in every file; S4 has one source.
 * - Team KEYS (alpha/beta/gamma) are stable forever; only names/accents reskin.
 * - This file is client-safe (pure consts, no secrets, no server imports).
 */

export type ThemeTeam = { key: string; name: string; accent: string };
export type WordPair = { singular: string; plural: string };

export type Theme = {
  seasonName: string;
  target: WordPair; // S3 "star", S2 "isle"
  team: WordPair; // S3 "crew", S2 "fleet"
  player: WordPair; // S3 "pilot"
  points: string; // S3 "Starlight"
  playCurrency: string; // S3 "Salvage" (cosmetics only)
  bondedWord: string; // S3 "LIT/terraformed"
  /** Labels for the non-bonded statuses (bonded renders as bondedWord). */
  statusWord: { pending: string; live: string; failed: string };
  teams: ThemeTeam[];
  pitch: string;
};

// THE HIT LIST (ADR-0019 assassin eras + ADR-0020 naming). These defaults
// MATCH the s4_theme config (sql/s4_theme_hit_list.sql) on purpose: client
// components (the games) cannot read the server config, so the compile-time
// defaults ARE their theme. If a name changes in the config, change it here
// too — one seam, documented.
export const DEFAULT_THEME: Theme = {
  seasonName: "Launch Wars S4: The Hit List",
  target: { singular: "contract", plural: "contracts" },
  team: { singular: "team", plural: "teams" },
  player: { singular: "agent", plural: "agents" },
  points: "Bounty",
  playCurrency: "Gold",
  bondedWord: "CLOSED",
  statusWord: { pending: "Sealed", live: "Active", failed: "Void" },
  teams: [
    { key: "alpha", name: "🤠 The Frontier", accent: "#f0b340" },
    { key: "beta", name: "💠 The Singularity", accent: "#c44dff" },
    { key: "gamma", name: "🕴️ The Agency", accent: "#4dd8e6" },
  ],
  pitch:
    "Buy and hold any featured domain, from $5. Holding earns Bounty every day, and every contract that closes unlocks more of the $500 pool for everyone. The top teams by Bounty split the pool, and your cut is your share of your team. Only closed contracts pay.",
};

export type TargetStatus = "pending" | "live" | "bonded" | "failed";

/** The single place a status becomes a player-visible label. */
export function statusLabel(theme: Theme, status: TargetStatus): string {
  if (status === "bonded") return theme.bondedWord;
  return theme.statusWord[status];
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v : fallback;
}

function pair(v: unknown, fallback: WordPair): WordPair {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fallback;
  const o = v as Record<string, unknown>;
  return {
    singular: str(o.singular, fallback.singular),
    plural: str(o.plural, fallback.plural),
  };
}

/**
 * Merge a parsed `s4_theme` JSON override onto DEFAULT_THEME. Tolerant of
 * anything: missing keys, wrong types, garbage input all fall back to the
 * default, field by field. Teams merge PER KEY (keys never change; a theme may
 * only rename/recolor alpha/beta/gamma).
 */
export function mergeTheme(overrides: unknown): Theme {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return DEFAULT_THEME;
  }
  const o = overrides as Record<string, unknown>;

  const teamOverrides = new Map<string, Record<string, unknown>>();
  if (Array.isArray(o.teams)) {
    for (const t of o.teams) {
      if (t && typeof t === "object" && !Array.isArray(t)) {
        const rec = t as Record<string, unknown>;
        if (typeof rec.key === "string") teamOverrides.set(rec.key, rec);
      }
    }
  }
  const teams: ThemeTeam[] = DEFAULT_THEME.teams.map((d) => {
    const ov = teamOverrides.get(d.key);
    return ov
      ? { key: d.key, name: str(ov.name, d.name), accent: str(ov.accent, d.accent) }
      : d;
  });

  const sw =
    o.statusWord && typeof o.statusWord === "object" && !Array.isArray(o.statusWord)
      ? (o.statusWord as Record<string, unknown>)
      : {};

  return {
    seasonName: str(o.seasonName, DEFAULT_THEME.seasonName),
    target: pair(o.target, DEFAULT_THEME.target),
    team: pair(o.team, DEFAULT_THEME.team),
    player: pair(o.player, DEFAULT_THEME.player),
    points: str(o.points, DEFAULT_THEME.points),
    playCurrency: str(o.playCurrency, DEFAULT_THEME.playCurrency),
    bondedWord: str(o.bondedWord, DEFAULT_THEME.bondedWord),
    statusWord: {
      pending: str(sw.pending, DEFAULT_THEME.statusWord.pending),
      live: str(sw.live, DEFAULT_THEME.statusWord.live),
      failed: str(sw.failed, DEFAULT_THEME.statusWord.failed),
    },
    teams,
    pitch: str(o.pitch, DEFAULT_THEME.pitch),
  };
}
