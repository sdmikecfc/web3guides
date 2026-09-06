/**
 * BATTLE BOTS PLAY SESSION: how every mutating route knows the wallet.
 *
 * The FLOW is the S7 one (src/app/api/s7/game-session/route.ts mints a
 * token after one SIWE signature; src/app/api/s7/run-start/route.ts and
 * /score read it back from the body's `t` and refuse an expired one). The
 * DIFFERENCE: the battle_bots_ schema (doma-reporter/sql/battle_bots_001_init.sql)
 * has no session table, so the token here is STATELESS: an HMAC-signed
 * envelope over { wallet, isTest, exp } with the server-only secret from
 * db.ts sessionSecret(). Nothing to store, nothing to sweep, and a token
 * cannot outlive its `exp` (12 hours, the S7 SESSION_TTL_MS: sign rarely).
 *
 * The token is carried in the body as `t` (POST) or in the Authorization
 * header as `Bearer <t>` (GET), never in a query string.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "./db";

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PREFIX = "bb1";

export interface BotsSession {
  /** lowercase 0x... */
  wallet: string;
  isTest: boolean;
  /** ms since the epoch */
  exp: number;
}

const b64u = (s: string | Buffer): string => Buffer.from(s).toString("base64url");
const sign = (payload: string): string => createHmac("sha256", sessionSecret()).update(payload).digest("base64url");

export function mintSession(wallet: string, isTest: boolean, nowMs: number = Date.now()): string {
  const body: BotsSession = { wallet: wallet.toLowerCase(), isTest: !!isTest, exp: nowMs + SESSION_TTL_MS };
  const payload = b64u(JSON.stringify(body));
  return `${PREFIX}.${payload}.${sign(payload)}`;
}

export function verifySession(token: string | null | undefined, nowMs: number = Date.now()): BotsSession | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, payload, sig] = parts;
  if (!/^[A-Za-z0-9_-]{8,}$/.test(payload) || !/^[A-Za-z0-9_-]{8,}$/.test(sig)) return null;
  const want = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let body: BotsSession;
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as BotsSession;
  } catch {
    return null;
  }
  if (!body || typeof body.wallet !== "string" || !/^0x[0-9a-f]{40}$/.test(body.wallet)) return null;
  if (typeof body.exp !== "number" || body.exp < nowMs) return null;
  return { wallet: body.wallet, isTest: !!body.isTest, exp: body.exp };
}

/** The token from the body (`t`) or the Authorization header. */
export function tokenFromRequest(req: Request, body?: { t?: unknown } | null): string | null {
  const t = body && typeof body.t === "string" ? body.t : null;
  if (t) return t;
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (m) return m[1];
  const x = req.headers.get("x-bots-session");
  return x || null;
}

export function sessionFromRequest(req: Request, body?: { t?: unknown } | null): BotsSession | null {
  return verifySession(tokenFromRequest(req, body));
}
