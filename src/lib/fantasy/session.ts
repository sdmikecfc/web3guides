/**
 * Fantasy League session — HttpOnly cookie carrying a signed JWT.
 *
 * The Discord magic-link click hands us a one-time code; we exchange it
 * server-side for this session. After that, the cookie alone authenticates
 * subsequent visits — no URL secrets, no localStorage.
 */

import { cookies } from "next/headers";
import crypto from "node:crypto";

const COOKIE_NAME = "fantasy_session";
// 10 days — matches a full round (3 days draft + 7 days scoring). Users
// who enter on draft-open stay signed in through resolution. Existing
// shorter cookies keep their own exp until they expire naturally.
const SESSION_TTL_SECONDS = 10 * 24 * 60 * 60;

function getSecret(): string {
  const secret = process.env.FANTASY_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("FANTASY_SESSION_SECRET must be set (>= 32 chars)");
  }
  return secret;
}

/** Base64URL encode (no padding) — the JWT spec variant. */
function b64u(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64uDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export interface SessionPayload {
  sub: string;       // discord_id
  iat: number;       // issued (unix seconds)
  exp: number;       // expires (unix seconds)
}

/** Mint a JWT (HS256). Stays compatible with Node's standard library only. */
export function signSession(discordId: string, ttlSeconds: number = SESSION_TTL_SECONDS): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sub: String(discordId), iat: now, exp: now + ttlSeconds };

  const h = b64u(JSON.stringify(header));
  const p = b64u(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = b64u(crypto.createHmac("sha256", getSecret()).update(data).digest());
  return `${data}.${sig}`;
}

/** Verify + decode. Returns null on any failure (expired / tampered / malformed). */
export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = b64u(crypto.createHmac("sha256", getSecret()).update(data).digest());
  // constant-time compare
  if (expected.length !== s.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;

  try {
    const payload = JSON.parse(b64uDecode(p).toString("utf8")) as SessionPayload;
    if (!payload?.sub || !payload?.exp) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Set the session cookie on the current server response. */
export function setSessionCookie(discordId: string) {
  const token = signSession(discordId);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Clear the session cookie. */
export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

/** Read the session from the incoming request cookies. */
export function readSession(): SessionPayload | null {
  const c = cookies().get(COOKIE_NAME);
  return verifySession(c?.value);
}
