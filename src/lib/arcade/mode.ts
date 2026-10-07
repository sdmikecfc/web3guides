/**
 * LAUNCH WARS ARCADE - "am I in the arcade?" (2026-09-21).
 *
 * The off-season arcade (src/app/arcade) mounts the EXISTING season game
 * components unchanged and banks their scores through /api/arcade/* onto fresh
 * boards. The season shells learn they are in the arcade from the URL, not
 * from a React provider, because half the seams are module-level functions a
 * context can never reach (startRun, submitScore, the token and guest-store
 * helpers in lib/sN/games.ts, track()).
 *
 * THE LAW OF THIS FILE: outside /arcade every helper returns exactly the value
 * the season passed in, so season behaviour is byte-identical. Pure module, no
 * React and no Next imports, because lib/sN/games.ts is imported by server
 * routes too. The render-path hook lives in ./useArcade.
 *
 * Every game route is /arcade/<game> on every host (launchwars.xyz passes the
 * /arcade prefix through untouched, see src/middleware.ts), so the browser
 * pathname is the same string the server rendered.
 */

export const ARCADE_PREFIX = "/arcade";
export const ARCADE_API_BASE = "/api/arcade";
/** ONE token for all sixteen games: a player signs once, not once per season. */
export const ARCADE_TOKEN_KEY = "arcade_game_token";
/** The arcade's own season_key inside the shared S7 session/nonce/score tables. */
export const ARCADE_SEASON_KEY = "arcade";
export const ARCADE_NAME = "Launch Wars Arcade";

export function isArcadePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === ARCADE_PREFIX || pathname.startsWith(`${ARCADE_PREFIX}/`);
}

/** For call sites that only ever run in the browser (fetches, storage reads in
 * effects and callbacks). Always false on the server. */
export function arcadeNow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return isArcadePath(window.location.pathname);
  } catch {
    return false;
  }
}

/** "/api/s7" in a season, "/api/arcade" in the arcade. */
export function apiBase(seasonBase: string): string {
  return arcadeNow() ? ARCADE_API_BASE : seasonBase;
}

/** The season's own token key in a season, the ONE arcade key in the arcade. */
export function tokenKey(seasonTokenKey: string): string {
  return arcadeNow() ? ARCADE_TOKEN_KEY : seasonTokenKey;
}

/** Namespaces a localStorage key (guest store, daily flag, personal best) so
 * arcade play never reads or writes a season's browser state. */
export function lsKey(key: string): string {
  return arcadeNow() ? `arcade:${key}` : key;
}

/** Copy-result text built by a game says launchwars.xyz/sN/games/<game>; in the
 * arcade it should send a friend to the arcade route instead. */
export function arcadeShareText(text: string): string {
  if (!arcadeNow()) return text;
  return text.replace(/\/s[4-7]\/games\//g, `${ARCADE_PREFIX}/`);
}
