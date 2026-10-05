/**
 * BATTLE BOTS SERVER: the service-role client and the small server-only
 * helpers every /api/bots route shares. Server-only by law (the "server-only"
 * import, exactly as src/lib/s7/server.ts does it); never import from a
 * client component.
 *
 *  - botsDb() is src/lib/supabase/server.ts createServiceClient(), the SAME
 *    client s7Db() returns (src/lib/s7/server.ts): service role, RLS
 *    bypassed, fetch pinned to cache: "no-store" so a read is never served
 *    from Next's fetch cache.
 *  - fightSalt() is the FIGHT_SALT the seed law needs (engine doc section
 *    7): seed = fnv1a(fightId + "|" + FIGHT_SALT). Read from BB_FIGHT_SALT;
 *    in production a missing salt REFUSES to run (a breaker), and only when
 *    NODE_ENV !== "production" does a dev default stand in.
 *  - dayKey() is the UTC day idiom from src/app/api/s7/score/route.ts.
 *  - devTestFlag() honours the `x-bots-test: 1` header ONLY outside
 *    production, so the smoke script can mark its wallets is_test.
 *  - Refusal / refuse() / failResponse(): a refusal carries an HTTP status
 *    and a plain-words message; anything else is a 500 with the message
 *    kept out of production responses.
 */
import "server-only";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export function botsDb() {
  return createServiceClient();
}
export type BotsDb = ReturnType<typeof botsDb>;

export const isProduction = (): boolean => process.env.NODE_ENV === "production";

function secretFromEnv(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v && v.length >= 8) return v;
  if (isProduction()) throw new Error(`${name} is not set; refusing to run in production without it`);
  return devDefault;
}

/** The server-only salt behind every fight seed. */
export function fightSalt(): string {
  return secretFromEnv("BB_FIGHT_SALT", "dev");
}

/** Signs the collectible card payloads (battle_bots_cards.signature). */
export function cardSecret(): string {
  return secretFromEnv("BB_CARD_SECRET", "bots-dev-card-secret");
}

/** Signs the play-session tokens (session.ts). Falls back to the card
 * secret so one env var is enough on a small deploy. */
export function sessionSecret(): string {
  const v = process.env.BB_SESSION_SECRET;
  if (v && v.length >= 8) return v;
  return secretFromEnv("BB_CARD_SECRET", "bots-dev-session-secret");
}

/** "2026-09-03": the UTC day key (src/app/api/s7/score/route.ts dayKey). */
export function dayKey(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Whole days since the epoch for a day key (the bossForDate rotation idiom
 * in src/lib/s7/raid.ts dayNumber). */
export function dayNumber(day: string): number {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : 0;
}

export const nowIso = (): string => new Date().toISOString();

/** `x-bots-test: 1` marks a wallet is_test. Honoured only when
 * NODE_ENV !== "production" (the dev-only guard idiom in
 * src/app/api/s7/dev-layout/route.ts). */
export function devTestFlag(req: Request): boolean {
  if (isProduction()) return false;
  const v = req.headers.get("x-bots-test");
  return v === "1" || v === "true";
}

/** `x-bots-day: YYYY-MM-DD` moves the UTC day key the counters, the shop
 * and the per-day rules read, so the smoke script can play several days
 * in one run. Honoured only when NODE_ENV !== "production"; in production
 * the day is always the clock's. */
export function requestDay(req: Request, nowMs: number = Date.now()): string {
  if (!isProduction()) {
    const v = req.headers.get("x-bots-day");
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`))) return v;
  }
  return dayKey(nowMs);
}

/** A refusal: an HTTP status and a plain-words reason the player can read. */
export class Refusal extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function refuse(status: number, message: string): never {
  throw new Refusal(status, message);
}

export function failResponse(e: unknown): NextResponse {
  if (e instanceof Refusal) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  const msg = e instanceof Error ? e.message : String(e);
  // eslint-disable-next-line no-console
  console.error("[bots api]", msg);
  return NextResponse.json({ ok: false, error: isProduction() ? "Something went wrong. Try again." : msg }, { status: 500 });
}

/** Parse a JSON body, refusing a broken one the way every s7 route does. */
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return refuse(400, "Bad request.");
  }
}

/** A whole number in a range, or a refusal. */
export function intIn(v: unknown, lo: number, hi: number, what: string): number {
  const n = typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < lo || n > hi) return refuse(400, `${what} must be a whole number from ${lo} to ${hi}.`);
  return n;
}
