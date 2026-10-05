/**
 * BATTLE BOTS ENLIST NONCES: a signature is good once, for five minutes, for
 * one wallet.
 *
 * WHAT WAS WRONG. The enlist route verified a signature with
 * src/lib/stars/server.ts verifyOwnership, which checks the ECDSA, the domain
 * and a 5 minute freshness window, and never looks at the Nonce line at all.
 * The nonce was invented by the browser, so it proved nothing: anyone holding
 * a copy of one message and one signature could post it again inside the
 * freshness window and be handed a play session for that wallet.
 *
 * WHAT IS TRUE NOW. The server issues the nonce (POST /api/bots/enlist/nonce),
 * binds it to one wallet, and the enlist BURNS it. The burn is one atomic
 * UPDATE ... WHERE nonce = $1 AND used_at IS NULL, so two requests replaying
 * one captured signature cannot both win: the second updates zero rows.
 * Single use is the database's, not this file's.
 *
 * The store is `battle_bots_enlist_nonces`
 * (doma-reporter/sql/battle_bots_007_identity.sql). THAT FILE IS NOT APPLIED
 * YET. Until an operator runs it:
 *   - in production this module THROWS, loudly, naming the file. A gate that
 *     silently degrades to no gate is worse than no gate.
 *   - outside production it falls back to a process-local Map so a dev server
 *     and scripts/bots-api-smoke.ts can drive the real route logic (issue,
 *     bind to a wallet, expire, burn, refuse a reuse). The fallback is
 *     per-process and dies with the server, which is exactly why it is not
 *     allowed to be the production answer.
 * The same shape ships twice already in this game for the `color` column
 * (_server/players.ts, api/bots/shop/buy) with one difference: those degrade,
 * this one refuses.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { isProduction, nowIso, refuse, type BotsDb } from "@/app/bots/_server/db";
import { STRINGS } from "@/lib/bots/strings";

const t = STRINGS.en.enlist;

const TABLE = "battle_bots_enlist_nonces";
/** The doc's number: "nonce, 5-minute TTL". */
export const NONCE_TTL_MS = 5 * 60 * 1000;
/** Unspent, unexpired nonces one wallet may hold at once. A player needs 1.
 * This stops a script turning the issue route into a row factory. */
export const MAX_OPEN_NONCES = 10;

export interface IssuedNonce {
  nonce: string;
  expiresAtIso: string;
}

interface NonceRow {
  nonce: string;
  wallet: string;
  expires_at: string;
  used_at: string | null;
  is_test: boolean;
}

/* ── the missing-table fallback (dev only) ─────────────────────────────── */

/**
 * The dev fallback hangs off globalThis, not off this module.
 *
 * WHY, and it is worth reading because it is the fallback's whole weakness in
 * one sentence: Next's dev server recompiles a route when anything in its
 * import graph changes and gives it a FRESH module instance, so a plain
 * module-level Map loses every nonce mid-run. It was caught here exactly that
 * way: the smoke script issued a nonce, an edit landed between the two
 * requests, the enlist route recompiled and answered "we could not find your
 * sign in request" for a nonce that had just been issued. The store lives one
 * level up so a recompile keeps it.
 *
 * That fix makes the fallback usable in dev. It does NOT make it usable in
 * production: a process-local Map still dies with the process and is not
 * shared between serverless instances, which is why fallbackOrThrow() refuses
 * outright there. Run battle_bots_007_identity.sql.
 */
const memory: Map<string, NonceRow> =
  ((globalThis as { __botsNonceMemory?: Map<string, NonceRow> }).__botsNonceMemory ??=
    new Map<string, NonceRow>());
let useMemory = false;

function isMissingTable(message: string): boolean {
  return /PGRST205|Could not find the table|relation .*battle_bots_enlist_nonces.* does not exist/i.test(message);
}

/** A missing store is a REFUSAL in production and a dev fallback anywhere
 * else. Returns true when the caller should use the Map. */
function fallbackOrThrow(message: string): boolean {
  if (!isMissingTable(message)) return false;
  if (isProduction()) {
    throw new Error(
      `${TABLE} does not exist: run doma-reporter/sql/battle_bots_007_identity.sql before enlisting anyone. ` +
        "Refusing to enlist without a nonce store.",
    );
  }
  if (!useMemory) {
    // eslint-disable-next-line no-console
    console.warn(`[bots] ${TABLE} is missing: using the dev-only in-memory nonce store. Run battle_bots_007_identity.sql.`);
    useMemory = true;
  }
  return true;
}

/** Which store answered, for the smoke report and the lane report. */
export function nonceStoreKind(): "table" | "memory" {
  return useMemory ? "memory" : "table";
}

/* ── issue ─────────────────────────────────────────────────────────────── */

function newNonce(): string {
  // 32 bytes, the size modules/wallet/index.js newAuthCode uses
  return randomBytes(32).toString("base64url");
}

export async function issueNonce(
  db: BotsDb,
  wallet: string,
  isTest: boolean,
  ttlMs: number = NONCE_TTL_MS,
  nowMs: number = Date.now(),
): Promise<IssuedNonce> {
  const w = wallet.toLowerCase();
  const nonce = newNonce();
  const expiresAtIso = new Date(nowMs + ttlMs).toISOString();
  const row: NonceRow = { nonce, wallet: w, expires_at: expiresAtIso, used_at: null, is_test: !!isTest };

  if (!useMemory) {
    const { count, error: countErr } = await db
      .from(TABLE)
      .select("nonce", { count: "exact", head: true })
      .eq("wallet", w)
      .is("used_at", null)
      .gt("expires_at", new Date(nowMs).toISOString());
    if (countErr && !fallbackOrThrow(countErr.message || "")) throw new Error(`nonce count: ${countErr.message}`);
    if (!useMemory) {
      if ((count || 0) >= MAX_OPEN_NONCES) return refuse(429, t.tooManyTries);
      const { error } = await db.from(TABLE).insert({
        nonce,
        wallet: w,
        issued_at: nowIso(),
        expires_at: expiresAtIso,
        is_test: !!isTest,
      });
      if (error && !fallbackOrThrow(error.message || "")) throw new Error(`nonce issue: ${error.message}`);
      if (!useMemory) return { nonce, expiresAtIso };
    }
  }

  // dev fallback
  let open = 0;
  // forEach, not for..of: this repo's tsconfig sets no `target`, so it
  // compiles at ES5 and iterating a Map needs downlevelIteration there.
  memory.forEach((r) => {
    if (r.wallet === w && !r.used_at && Date.parse(r.expires_at) > nowMs) open += 1;
  });
  if (open >= MAX_OPEN_NONCES) return refuse(429, t.tooManyTries);
  memory.set(nonce, row);
  return { nonce, expiresAtIso };
}

/* ── burn ──────────────────────────────────────────────────────────────── */

/**
 * Spend a nonce, or refuse in plain words. Refuses when the nonce is unknown,
 * already spent, out of time, or was issued for a different wallet. Never
 * says which wallet.
 */
export async function burnNonce(
  db: BotsDb,
  wallet: string,
  nonce: unknown,
  nowMs: number = Date.now(),
): Promise<void> {
  const w = wallet.toLowerCase();
  const n = typeof nonce === "string" ? nonce.trim() : "";
  if (!n || n.length < 16 || n.length > 128 || !/^[A-Za-z0-9_-]+$/.test(n)) return refuse(400, t.nonceMissing);
  const nowIsoStr = new Date(nowMs).toISOString();

  if (!useMemory) {
    const { data, error } = await db
      .from(TABLE)
      .update({ used_at: nowIsoStr, used_by: w })
      .eq("nonce", n)
      .is("used_at", null)
      .gt("expires_at", nowIsoStr)
      .select("nonce, wallet, expires_at, used_at, is_test");
    if (error && !fallbackOrThrow(error.message || "")) throw new Error(`nonce burn: ${error.message}`);
    if (!useMemory) {
      const hit = (data || [])[0] as NonceRow | undefined;
      if (hit) {
        // bound to ONE wallet: a nonce issued for somebody else is not yours,
        // even though it is now spent (spending it is the right outcome: a
        // nonce that has been posted anywhere is not fresh any more).
        if (String(hit.wallet).toLowerCase() !== w) return refuse(401, t.nonceWrongWallet);
        return;
      }
      const { data: was } = await db.from(TABLE).select("used_at, expires_at").eq("nonce", n).maybeSingle();
      if (!was) return refuse(401, t.nonceMissing);
      if (was.used_at) return refuse(401, t.nonceUsed);
      return refuse(401, t.nonceExpired);
    }
  }

  // dev fallback: the same four answers, same order
  const row = memory.get(n);
  if (!row) return refuse(401, t.nonceMissing);
  if (row.used_at) return refuse(401, t.nonceUsed);
  if (Date.parse(row.expires_at) <= nowMs) return refuse(401, t.nonceExpired);
  row.used_at = nowIsoStr;
  if (row.wallet !== w) return refuse(401, t.nonceWrongWallet);
}

/* ── the message binding ───────────────────────────────────────────────── */

/** The `Nonce:` line of the EIP-4361 message the wallet actually signed
 * (the src/app/api/wallet/verify/route.ts parseSiwe idiom, one line of it).
 * Without this the nonce is decoration: the server would be checking a value
 * in the JSON body that the signature never covered. */
export function nonceInMessage(message: string): string | null {
  const m = /^Nonce:\s*(\S+)\s*$/m.exec(String(message || ""));
  return m ? m[1] : null;
}

/** Dev-only nonce TTL override, the `x-bots-day` header idiom: it lets
 * scripts/bots-api-smoke.ts drive the EXPIRED branch of burnNonce in
 * milliseconds instead of waiting five minutes. Ignored in production. */
export function requestNonceTtlMs(req: Request): number {
  if (isProduction()) return NONCE_TTL_MS;
  const v = req.headers.get("x-bots-nonce-ttl");
  const n = v && /^\d{1,7}$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n <= NONCE_TTL_MS ? n : NONCE_TTL_MS;
}
