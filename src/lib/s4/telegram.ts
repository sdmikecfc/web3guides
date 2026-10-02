/**
 * Telegram Mini App `initData` verification (ADR-0030 security backbone).
 *
 * Server-only. Telegram signs the WebApp `initData` with a key derived from the
 * bot token; we recompute that HMAC and compare, then check freshness. This is
 * the ONLY trust anchor for a Telegram user: never trust a client-claimed
 * Telegram id / wallet without passing through here. After a good verify, mint
 * our OWN short-lived session token rather than re-trusting stale initData.
 *
 * Strategy B (ADR-0030): no EVM wallet activity ever happens inside Telegram, so
 * this file plus the wallet<->telegram_id binding is the whole Telegram trust
 * surface. Wallet ownership is proven on the WEB (SIWE), not here.
 *
 * Docs: https://core.telegram.org/bots/webapps  (section: Validating data)
 */
import "server-only";
import crypto from "node:crypto";

export type TgUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
};

export type TgInitData =
  | { ok: true; user: TgUser | null; authDate: number; startParam: string | null; raw: URLSearchParams }
  | { ok: false; error: string };

/**
 * Verify a Telegram WebApp `initData` string against the bot token.
 * @param initData raw query string from `Telegram.WebApp.initData`
 * @param botToken the bot token (server env only; never shipped to the client)
 * @param maxAgeSec reject initData older than this (replay guard); default 1 day
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 86400,
): TgInitData {
  if (!initData || !botToken) return { ok: false, error: "missing initData or bot token" };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: "unparseable initData" };
  }

  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "no hash" };

  // The data-check-string: every field EXCEPT `hash`, as "key=value", sorted by
  // key, joined by newlines.
  const pairs: string[] = [];
  params.forEach((v, k) => {
    if (k !== "hash") pairs.push(`${k}=${v}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  // secret = HMAC_SHA256(key="WebAppData", message=bot_token).
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  // Constant-time compare (guard against a malformed hex hash too).
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(computed, "hex");
    b = Buffer.from(hash, "hex");
  } catch {
    return { ok: false, error: "bad hash" };
  }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "bad hash" };
  }

  // Freshness (replay guard).
  const authDate = Number(params.get("auth_date") || 0);
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, error: "no auth_date" };
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > maxAgeSec) return { ok: false, error: "stale initData" };

  // Parse the user JSON (present on most launches; absent for some entry points).
  // The HMAC already proved the payload is authentic, so bad JSON just yields a
  // null user rather than a failure.
  let user: TgUser | null = null;
  const userRaw = params.get("user");
  if (userRaw) {
    try {
      const u = JSON.parse(userRaw) as unknown;
      if (u && typeof u === "object" && typeof (u as TgUser).id === "number") user = u as TgUser;
    } catch {
      /* user stays null */
    }
  }

  return { ok: true, user, authDate, startParam: params.get("start_param"), raw: params };
}
