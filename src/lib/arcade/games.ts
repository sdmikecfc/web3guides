/**
 * LAUNCH WARS ARCADE - the sixteen-game registry (S4 through S7).
 *
 * RULES ARE IMPORTED, NEVER RETYPED. Each season's own registry stays the one
 * owner of its games' validity numbers (maxScore clamp, floor, fast-win bar,
 * rate envelope); this file only normalises the three season shapes into one
 * so /api/arcade/score can run a single anti-forge chain:
 *
 *   S4      floor + clamp                     (time-boxed games, no envelope)
 *   S5      floor with fastWinFrac + clamp    (finite, count-bound ceilings)
 *   S6, S7  floor with fastWinScore + clamp + ratePerSec x elapsed + burst
 *
 * Game keys are unique across all four seasons (checked below at module load),
 * so the arcade uses one flat key namespace: /arcade/<key>, game = <key>.
 *
 * Pure module: safe in server routes and client components alike.
 */
import { GAMES as S4_GAMES } from "@/lib/s4/games";
import { GAMES as S5_GAMES } from "@/lib/s5/games";
import { GAMES as S6_GAMES } from "@/lib/s6/games";
import { GAMES as S7_GAMES } from "@/lib/s7/games";

export type ArcadeSeason = "s7" | "s6" | "s5" | "s4";

export type ArcadeRules = {
  /** Far-off sanity clamp (S6/S7) or the real ceiling x1.1 (S5) or a loose
   * anti-forge bound (S4). The score is clamped to it, never rejected. */
  maxScore: number;
  /** A run younger than this cannot bank... */
  floorMs: number;
  /** ...unless it scored at least this much (0 = no exemption). */
  fastWinScore: number;
  /** The rate envelope. null = the season never had one (S4, S5). */
  ratePerSec: number | null;
  burst: number;
};

export type ArcadeGame = {
  key: string;
  name: string;
  season: ArcadeSeason;
  /** Card art under public/. */
  art: string;
  accent: string;
  rules: ArcadeRules;
};

export type ArcadeShelf = {
  season: ArcadeSeason;
  /** "Season 7" */
  label: string;
  /** "Realmfall" */
  title: string;
  /** True for the season nobody has played yet. */
  isNew: boolean;
};

/** Newest first: the page lists shelves in this order. */
export const ARCADE_SHELVES: ArcadeShelf[] = [
  { season: "s7", label: "Season 7", title: "Realmfall", isNew: true },
  { season: "s6", label: "Season 6", title: "Uprising", isNew: false },
  { season: "s5", label: "Season 5", title: "Iron Siege", isNew: false },
  { season: "s4", label: "Season 4", title: "The Hit List", isNew: false },
];

// Each value mirrors that game's accent on its own season arcade page, so a
// card can never drift from the arena it opens.
const ACCENTS: Record<string, string> = {
  gauntlet: "#c9a227",
  horde: "#e07030",
  crypt: "#3f6adf",
  ascent: "#f0b340",
  ironjaw: "#e0662e",
  strain: "#34d399",
  stopclock: "#7dd3fc",
  riot: "#e8a33d",
  armorclash: "#e0662e",
  warpath: "#34d399",
  warhawks: "#7dd3fc",
  vanguard: "#f0b340",
  riviera: "#f0b340",
  highnoon: "#e33d4e",
  getaway: "#4dd8e6",
  extraction: "#c44dff",
};

const accentOf = (key: string) => ACCENTS[key] ?? "#9aa7b4";

export const ARCADE_GAMES: ArcadeGame[] = [
  ...S7_GAMES.filter((g) => !g.comingSoon).map(
    (g): ArcadeGame => ({
      key: g.key,
      name: g.name,
      season: "s7",
      art: `/s7-art/games/${g.key}/card.webp`,
      accent: accentOf(g.key),
      rules: {
        maxScore: g.maxScore,
        floorMs: g.floorMs,
        fastWinScore: g.fastWinScore,
        ratePerSec: g.ratePerSec,
        burst: g.burst,
      },
    }),
  ),
  ...S6_GAMES.filter((g) => !g.comingSoon).map(
    (g): ArcadeGame => ({
      key: g.key,
      name: g.name,
      season: "s6",
      art: `/s6-art/games/${g.key}/card.webp`,
      accent: accentOf(g.key),
      rules: {
        maxScore: g.maxScore,
        floorMs: g.floorMs,
        fastWinScore: g.fastWinScore,
        ratePerSec: g.ratePerSec,
        burst: g.burst,
      },
    }),
  ),
  ...S5_GAMES.filter((g) => !g.comingSoon).map(
    (g): ArcadeGame => ({
      key: g.key,
      name: g.name,
      season: "s5",
      art: `/s5-art/games/${g.key}/card.webp`,
      accent: accentOf(g.key),
      rules: {
        maxScore: g.maxScore,
        floorMs: g.floorMs,
        // S5's exemption is a FRACTION of its real ceiling (idle runs score
        // 0-84 against ceilings of 2000-9724, so it cannot launder an AFK run)
        fastWinScore: Math.round(g.maxScore * (g.fastWinFrac ?? 0)),
        ratePerSec: null,
        burst: 0,
      },
    }),
  ),
  ...S4_GAMES.filter((g) => !g.comingSoon).map(
    (g): ArcadeGame => ({
      key: g.key,
      name: g.name,
      season: "s4",
      art: `/s4-art/games/${g.key}/capsule.png`,
      accent: accentOf(g.key),
      rules: {
        maxScore: g.maxScore,
        floorMs: g.floorMs,
        fastWinScore: 0,
        ratePerSec: null,
        burst: 0,
      },
    }),
  ),
];

export const ARCADE_RULES: Record<string, ArcadeGame> = (() => {
  const out: Record<string, ArcadeGame> = {};
  for (const g of ARCADE_GAMES) {
    // A BREAKER, not a silent overwrite: two seasons sharing a key would put
    // two different games on one board.
    if (out[g.key]) throw new Error(`arcade: duplicate game key "${g.key}"`);
    out[g.key] = g;
  }
  return out;
})();

export function arcadeHref(key: string): string {
  return `/arcade/${key}`;
}
