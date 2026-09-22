/**
 * Launch Wars Season 5 (IRON SIEGE) THEME: the ONE place every player-visible
 * word lives. Mirrors src/lib/s4/theme.ts exactly (the proven one-seam rule):
 * no themed word may appear anywhere outside this object; the s5_theme config
 * row in launch_wars_boss_config may override any of it with zero logic change.
 *
 * S5 twist: ONE team. Everyone fights for The Iron Column; the season is the
 * players against the strongholds, not team against team. The team KEY "front"
 * is stable forever; only the name/accent may reskin.
 *
 * Client-safe (pure consts, no secrets, no server imports).
 */

export type ThemeTeam = { key: string; name: string; accent: string };
export type WordPair = { singular: string; plural: string };

export type Theme = {
  seasonName: string;
  target: WordPair; // stronghold
  team: WordPair; // column
  player: WordPair; // commander
  points: string; // Medals
  playCurrency: string; // Shells (cosmetics/arcade only, never prize weight)
  bondedWord: string; // BREACHED
  /** Labels for the non-bonded statuses (bonded renders as bondedWord). */
  statusWord: { pending: string; live: string; failed: string };
  teams: ThemeTeam[];
  pitch: string;
};

export const DEFAULT_THEME: Theme = {
  seasonName: "Launch Wars S5: Iron Siege",
  target: { singular: "stronghold", plural: "strongholds" },
  team: { singular: "column", plural: "columns" },
  player: { singular: "commander", plural: "commanders" },
  points: "Medals",
  playCurrency: "Shells",
  bondedWord: "BREACHED",
  statusWord: { pending: "SCOUTED", live: "UNDER SIEGE", failed: "UNBROKEN" },
  teams: [{ key: "front", name: "The Iron Column", accent: "#9aa7b4" }],
  // ADR-0098 rewrote this: no top-10 pot, no 90% window, and a wall's share is
  // NOT its own holders' money. Deliberately carries no dollar figure, because
  // it renders raw (no fill()) and the pool total lives in games.ts.
  pitch:
    "Buy and hold any listed stronghold, from $5. Every dollar you hold earns Medals every day, and at season end the pool splits by Medals among qualified holders. When a wall breaches it also pays a posted bounty: half to the Founders who bought in its first 24 hours, half to everyone who bought after, both counted by what you still hold 2 days later.",
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
 * Merge a parsed `s5_theme` JSON override onto DEFAULT_THEME. Tolerant of
 * anything: missing keys, wrong types, garbage input all fall back to the
 * default, field by field. Teams merge PER KEY (keys never change; a theme may
 * only rename/recolor "front").
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
