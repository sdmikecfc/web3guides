/**
 * S4 character model resolution (ADR-0015: combo-grid character model).
 *
 * Every (botox, drugs, ozempic) stat combination is a DIFFERENT pre-generated
 * girl: 5 x 5 x 5 = 125 masters named `cast-grid-b{b}d{d}o{o}.png`, with a
 * mirror male set `cast-gridm-b{b}d{d}o{o}.png` chosen by `skin.gender`
 * ('m' = male, anything else female; a pure render toggle). Aura is a
 * weapon overlay, never part of the model key. Collection mechanic: every
 * combo a player's stats have ever reached lives in `skin.owned_models`, and
 * `skin.worn` may pin the render to any owned combo.
 *
 * RENDER RULE (the ADR-0015 contract, mirrored by the bot in
 * doma-reporter/modules/season4): worn-if-owned, else the current build.
 *
 * Client-safe: pure functions over already-fetched data, no secrets, no IO.
 * Tolerant of junk input everywhere; never throws.
 *
 * See: Documents/Doma/adr/0015-combo-grid-character-model.md
 */

import { clampStats } from "./games";

/** A combo key like `b2d1o3`: Botox, Drugs, Ozempic levels, 0-4 each. */
export type ModelKey = string;

/** The resolved render: which character, and where their art lives. */
export type ResolvedModel = {
  /** The combo key being rendered (worn-if-owned, else the current build). */
  key: ModelKey;
  /** Web path to the character art for that key. */
  art: string;
  /**
   * Render gender (S4 gender toggle): "m" only when `skin.gender` is exactly
   * "m"; anything else (absent, junk) is "f", the default. Pure render
   * toggle: the key and unlocked combos are gender-agnostic.
   */
  gender?: "f" | "m";
};

const MODEL_KEY_RE = /^b[0-4]d[0-4]o[0-4]$/;

/**
 * The team-flavored bases stay as the (0,0,0) starters per team (ADR-0015:
 * the grid pool itself is team-agnostic). Team KEYS are the stable
 * alpha/beta/gamma backbone; the file names carry the era-class flavor
 * (ADR-0019/0020: Frontier cowgirl / Velvet Service spy / Agency barcode).
 */
const TEAM_BASE: Record<string, string> = {
  alpha: "frontier",
  beta: "singularity",
  gamma: "agency",
};

/** True when `v` is a well-formed combo key (`b0d0o0` .. `b4d4o4`). */
export function isModelKey(v: unknown): v is ModelKey {
  return typeof v === "string" && MODEL_KEY_RE.test(v);
}

/**
 * The combo key for a stats source (a skin JSONB value, a PlayerStats object,
 * or any junk). Levels clamp through clampStats (ADR-0004 ranges), so the
 * result is always a valid key; junk input resolves to `b0d0o0`.
 */
export function modelKey(stats: unknown): ModelKey {
  const s = clampStats(stats);
  return `b${s.botox}d${s.drugs}o${s.ozempic}`;
}

/**
 * The web art path for one combo key + gender (ADR-0015/0020 render rule). The
 * single source of the file convention, shared by resolveModel (the map/board)
 * and the character picker (/s4/me). `/s4-art/cast-grid-{key}.png` (male:
 * `cast-gridm-{key}.png`) for every grid cell, EXCEPT the zero build `b0d0o0`
 * with a teamKey: the team-flavored starter base (`cast-{teamBase}-1.png`,
 * male `-m1`). Callers that render this in an <img> should keep a silhouette
 * onError fallback (a not-yet-generated combo, e.g. a deep male build).
 */
export function artForModelKey(key: ModelKey, gender: "f" | "m" = "f", teamKey?: string | null): string {
  const base = typeof teamKey === "string" ? TEAM_BASE[teamKey.toLowerCase().trim()] : undefined;
  if (key === "b0d0o0" && base) {
    return gender === "m" ? `/s4-art/cast-${base}-m1.png` : `/s4-art/cast-${base}-1.png`;
  }
  return gender === "m" ? `/s4-art/cast-gridm-${key}.png` : `/s4-art/cast-grid-${key}.png`;
}

/** The Botox/Drugs/Ozempic levels (0-4) encoded in a combo key; junk -> zeros. */
export function parseModelKey(key: string): { botox: number; drugs: number; ozempic: number } {
  const m = /^b([0-4])d([0-4])o([0-4])$/.exec(String(key || ""));
  if (!m) return { botox: 0, drugs: 0, ozempic: 0 };
  return { botox: Number(m[1]), drugs: Number(m[2]), ozempic: Number(m[3]) };
}

/** Which model dimension key a stat is (aura is a weapon overlay, never a dimension). */
export type ModelDim = "botox" | "drugs" | "ozempic";

/**
 * The looks one more level of each gear stat would unlock from the CURRENT
 * build, for the picker's "next unlocks" preview (drives enhancement in the
 * shop). Skips a dimension already at max (4) and any neighbor the player
 * already owns via another path. Aura is excluded (not a model dimension).
 */
export function nextUnlocks(
  stats: { botox: number; drugs: number; ozempic: number },
  gender: "f" | "m",
  ownedKeys: string[],
): Array<{ stat: ModelDim; toLevel: number; key: ModelKey; art: string }> {
  const owned = new Set(ownedKeys);
  const dims: ModelDim[] = ["botox", "drugs", "ozempic"];
  const out: Array<{ stat: ModelDim; toLevel: number; key: ModelKey; art: string }> = [];
  for (const d of dims) {
    const cur = Math.max(0, Math.min(4, Math.floor(stats[d] || 0)));
    if (cur >= 4) continue;
    const next = { ...stats, [d]: cur + 1 };
    const key = `b${next.botox}d${next.drugs}o${next.ozempic}`;
    if (!isModelKey(key) || owned.has(key)) continue;
    out.push({ stat: d, toLevel: cur + 1, key, art: artForModelKey(key, gender) });
  }
  return out;
}

/**
 * Which character to draw for a player, per the ADR-0015 render rule.
 *
 * - key: `skin.worn` when it is a string listed in `skin.owned_models`
 *   (junk entries in either are ignored); otherwise the current build's
 *   combo key derived from the skin's top-level stat levels.
 * - gender: `skin.gender === "m"` renders the male art set; anything else
 *   (absent, junk) renders female, the default. Pure render toggle: it
 *   never changes the key or which combos are owned.
 * - art: resolved through artForModelKey (see above).
 *
 * Tolerant of junk: a missing/garbled skin resolves to the zero build.
 */
export function resolveModel(skin: unknown, teamKey?: string | null): ResolvedModel {
  const src =
    skin && typeof skin === "object" && !Array.isArray(skin)
      ? (skin as Record<string, unknown>)
      : {};
  const owned = Array.isArray(src.owned_models)
    ? src.owned_models.filter(isModelKey)
    : [];
  const worn = src.worn;
  const key: ModelKey =
    isModelKey(worn) && owned.includes(worn) ? worn : modelKey(src);
  const gender: "f" | "m" = src.gender === "m" ? "m" : "f";
  return { key, art: artForModelKey(key, gender, teamKey), gender };
}
