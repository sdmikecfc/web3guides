/**
 * BATTLE BOTS PLAY SESSION, the client side: where the token lives and the
 * EIP-4361 message it is minted from. No hooks, no React, so the fight
 * page's loader and the battles page share it.
 *
 * Mirrors src/lib/s7/games.ts (SESSION_STORAGE_KEY, readSessionToken,
 * writeSessionToken, buildPlaySessionMessage):
 *  - localStorage, so the session survives a closed tab (ADR-0109; the
 *    token authorises PLAY only and can never move money);
 *  - ONE message template, because the server verifies the exact posted
 *    bytes (lib/stars/server verifyOwnership: 5 minute freshness plus the
 *    domain allowlist) and two copies that drift by a character are an
 *    auth break with no error message;
 *  - the key "bots.session" is the one src/app/bots/strategy/StrategyClient.tsx
 *    proposed; that file carries its own copy of the string today and should
 *    import this one when its lane touches it next.
 *
 * The token is stateless (an HMAC envelope over { wallet, isTest, exp },
 * src/app/bots/_server/session.ts), so an expired one is dropped HERE
 * before a request is ever made with it.
 */

export const BOTS_SESSION_KEY = "bots.session";
/** The player's own name, stored beside the token so the top bar can say
 * whose garage this is without a request. Never an address, never coins:
 * coins change on every purchase and a stale number in a bar that is on
 * every screen is a lie on every screen. */
export const BOTS_PLAYER_KEY = "bots.player";
const PREFIX = "bb1";

export interface BotsSessionClaims {
  /** lowercase 0x... */
  wallet: string;
  isTest: boolean;
  /** ms since the epoch */
  exp: number;
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

/** The claims inside a token, read WITHOUT verifying it (only the server
 * holds the secret): enough to know whose session it is and when it ends. */
export function decodeBotsSession(token: string): BotsSessionClaims | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  try {
    const body = JSON.parse(fromBase64Url(parts[1])) as Partial<BotsSessionClaims>;
    if (!body || typeof body.wallet !== "string" || typeof body.exp !== "number") return null;
    return { wallet: body.wallet.toLowerCase(), isTest: !!body.isTest, exp: body.exp };
  } catch {
    return null;
  }
}

/** The stored token, or "" when there is none or it has run out. */
export function readBotsSession(nowMs: number = Date.now()): string {
  if (typeof window === "undefined") return "";
  try {
    const t = localStorage.getItem(BOTS_SESSION_KEY) || "";
    if (!t) return "";
    const claims = decodeBotsSession(t);
    if (!claims || claims.exp <= nowMs) {
      localStorage.removeItem(BOTS_SESSION_KEY);
      return "";
    }
    return t;
  } catch {
    return ""; // storage blocked (private mode, embedded webview): stay signed out
  }
}

export function writeBotsSession(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BOTS_SESSION_KEY, token);
  } catch {
    /* storage blocked: the session lives for this page only */
  }
}

export function clearBotsSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOTS_SESSION_KEY);
    localStorage.removeItem(BOTS_PLAYER_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The signed in player's name, or "" when nobody is signed in. Reading the
 * token first means a run out session can never leave a name on screen. */
export function readBotsPlayerName(nowMs: number = Date.now()): string {
  if (typeof window === "undefined") return "";
  if (!readBotsSession(nowMs)) return "";
  try {
    return localStorage.getItem(BOTS_PLAYER_KEY) || "";
  } catch {
    return "";
  }
}

export function writeBotsPlayerName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    if (name) localStorage.setItem(BOTS_PLAYER_KEY, name);
  } catch {
    /* storage blocked: the bar shows the sign in door instead */
  }
}

/** `Authorization: Bearer <t>`, the header every GET route reads
 * (_server/session.ts tokenFromRequest); nothing when signed out. */
export function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * THE EIP-4361 MESSAGE THE ENLIST SIGNS. The s7 template
 * (src/lib/s7/games.ts buildPlaySessionMessage) with the game's own line.
 * Rabby and friends only show the trusted SIWE panel when the Nonce line
 * exists; do not "tidy" the shape.
 */
export function buildEnlistMessage(address: string, nonce: string, issuedAt: string, domain: string, uri: string): string {
  return (
    `${domain} wants you to sign in with your Ethereum account:\n` +
    `${address}\n\n` +
    `Sign in to play Model Kombat. This only proves it is you. It moves no money and costs nothing.\n\n` +
    `URI: ${uri}\n` +
    `Version: 1\n` +
    `Chain ID: 1\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${issuedAt}`
  );
}
