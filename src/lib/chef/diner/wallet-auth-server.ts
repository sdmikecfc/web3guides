import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DinerAuthorityError } from "./authority";
import { createDinerWalletChallenge, DINER_WALLET_RULES, dinerWalletOrigin, dinerWalletProof, verifiedDinerSessionId, verifyDinerWalletProof, type DinerWalletChallenge } from "./wallet-auth";

function approvedOrigin(origin: string | null) { return dinerWalletOrigin(origin, { appUrl: process.env.DINER_PREVIEW_APP_URL, extraOrigins: process.env.DINER_WALLET_ORIGINS, nodeEnv: process.env.NODE_ENV }); }
function unavailable(message = "Wallet sign-in is unavailable. Please request a new sign-in message."): never { throw new DinerAuthorityError("wallet_session_unavailable", message, 503); }

export const DINER_WALLET_RATE_RULES = Object.freeze({ windowMs: 300_000, requesterLimit: 6, originLimit: 120, globalLimit: 300, intervalMs: 10_000, cleanupBatch: 128, maxRows: 2048 });
type RequestSource = Pick<Request, "headers" | "url">;
interface RequesterConfig { vercel?: string; nodeEnv?: string; secret?: string }
function requesterUnavailable(): never { throw new DinerAuthorityError("wallet_requester_unavailable", "Wallet sign-in needs a trusted request source. Please try again when the account service is ready.", 503); }
function loopback(hostname: string) { return hostname === "localhost" || hostname.endsWith(".localhost") || /^127(?:\.\d{1,3}){3}$/.test(hostname) || hostname === "[::1]"; }
function ipNetwork(ip: string): string {
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6 || ip.includes("%")) return requesterUnavailable();
  const [left, right] = new URL(`http://[${ip}]`).hostname.slice(1, -1).split("::"), head = left ? left.split(":") : [], tail = right ? right.split(":") : [];
  const groups = [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail].map(part => parseInt(part, 16));
  if (groups.slice(0, 5).every(part => part === 0) && groups[5] === 65535) return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join(".");
  // IPv6 privacy addresses on the same /64 share one resource budget.
  return `${groups.slice(0, 4).map(part => part.toString(16)).join(":")}/64`;
}

/** Trust the platform-owned Vercel header only on Vercel. Generic forwarded
 * headers, request bodies, cookies and wallet addresses cannot choose a bucket.
 * https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for */
export function dinerWalletRequester(request: RequestSource | undefined, origin: string, config: RequesterConfig = { vercel: process.env.VERCEL, nodeEnv: process.env.NODE_ENV, secret: process.env.DINER_WALLET_RATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY }): { requesterHash: string; originHash: string } {
  if (!request || !config.secret || config.secret.length < 32) return requesterUnavailable();
  let source: string;
  if (config.vercel === "1") {
    const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
    if (!ip || ip.length > 45 || ip.includes(",")) return requesterUnavailable();
    source = ipNetwork(ip);
  } else {
    let local = false;
    try { local = config.nodeEnv === "development" && loopback(new URL(origin).hostname) && loopback(new URL(request.url).hostname); } catch { /* Fail closed on malformed request URLs. */ }
    if (!local) return requesterUnavailable();
    // A shared development bucket avoids pretending browser headers reveal a
    // trusted peer address when Next's local Request does not expose the socket.
    source = "local-development";
  }
  const hash = (label: string, value: string) => createHmac("sha256", config.secret!).update(`diner-wallet-rate:v1:${label}:${value}`).digest("hex");
  return { requesterHash: hash("requester", source), originHash: hash("origin", origin) };
}

export async function issueDinerWalletChallenge(db: SupabaseClient, body: unknown, origin: string | null, now = Date.now(), request?: RequestSource) {
  const challenge = createDinerWalletChallenge(body, approvedOrigin(origin), randomBytes(16).toString("hex"), now);
  const requester = dinerWalletRequester(request, challenge.origin);
  const result = await db.rpc("diner_preview_wallet_issue", {
    p_nonce: challenge.nonce, p_wallet: challenge.wallet, p_chain_id: challenge.chainId, p_origin: challenge.origin,
    p_message: challenge.message, p_issued_at_ms: challenge.issuedAt, p_expires_at_ms: challenge.expiresAt,
    p_requester_hash: requester.requesterHash, p_origin_hash: requester.originHash,
  });
  if (result.error) unavailable("Wallet sign-in storage has not been prepared or could not be reached.");
  if (!result.data?.ok) {
    if (result.data?.code === "wallet_rate_limited") throw new DinerAuthorityError("wallet_rate_limited", "Please wait before requesting another wallet sign-in message.", 429, Number(result.data.retryAfterMs) || 10_000);
    unavailable();
  }
  return { message: challenge.message, nonce: challenge.nonce, expiresAt: challenge.expiresAt };
}

/** The caller must first verify the bearer with auth.getUser(token). The registry
 * prevents anonymous or direct Supabase Web3 sessions bypassing our nonce flow. */
async function registeredDinerWalletSession(db: SupabaseClient, token: string, playerId: string, now: number, allowRevoked = false): Promise<{ wallet: string }> {
  const sessionId = verifiedDinerSessionId(token, playerId, now);
  const result = await db.from("diner_preview_wallet_sessions").select("wallet,player_id,revoked_at").eq("session_id", sessionId).eq("player_id", playerId).maybeSingle();
  if (result.error) unavailable("Wallet session storage has not been prepared or could not be reached.");
  if (!result.data || result.data.player_id !== playerId || !allowRevoked && result.data.revoked_at !== null || typeof result.data.wallet !== "string" || !/^0x[0-9a-f]{40}$/.test(result.data.wallet)) throw new DinerAuthorityError("wallet_session_required", "Connect and sign in with your wallet to continue.", 401);
  return { wallet: result.data.wallet };
}

export async function requireDinerWalletSession(db: SupabaseClient, token: string, playerId: string, now = Date.now()): Promise<{ wallet: string }> {
  return registeredDinerWalletSession(db, token, playerId, now);
}

/** Revoke only the verified bearer session. Other devices remain signed in;
 * refreshed JWTs retain session_id and therefore cannot bypass revocation. */
export async function revokeDinerWalletSession(db: SupabaseClient, auth: SupabaseClient, token: string, now = Date.now()): Promise<void> {
  if (!token || token.length > DINER_WALLET_RULES.maxTokenBytes) throw new DinerAuthorityError("wallet_session_required", "Sign in with your wallet to manage this session.", 401);
  const checked = await auth.auth.getUser(token);
  if (checked.error || !checked.data.user?.id || checked.data.user.is_anonymous) throw new DinerAuthorityError("session_expired", "This wallet session has expired.", 401);
  const playerId = checked.data.user.id;
  await registeredDinerWalletSession(db, token, playerId, now, true);
  const result = await db.rpc("diner_preview_wallet_revoke", { p_session: verifiedDinerSessionId(token, playerId, now), p_player: playerId });
  if (result.error) unavailable("Your session could not be signed out. Please retry.");
  if (!result.data?.ok) throw new DinerAuthorityError("wallet_session_required", "This wallet session is unavailable.", 401);
}

export async function verifyDinerWalletChallenge(db: SupabaseClient, auth: SupabaseClient, body: unknown, origin: string | null, now = Date.now()) {
  const allowedOrigin = approvedOrigin(origin), proof = dinerWalletProof(body);
  const lookup = await db.from("diner_preview_wallet_challenges").select("nonce,wallet,chain_id,origin,message,issued_at_ms,expires_at_ms,consumed_at").eq("nonce", proof.nonce).maybeSingle();
  if (lookup.error) unavailable("Wallet sign-in storage has not been prepared or could not be reached.");
  if (!lookup.data || lookup.data.consumed_at !== null) throw new DinerAuthorityError("wallet_challenge_used", "That sign-in message is unavailable or already used. Request a new one.", 401);
  const row = lookup.data;
  const challenge: DinerWalletChallenge = { nonce: row.nonce, wallet: row.wallet, chainId: Number(row.chain_id), origin: row.origin, message: row.message, issuedAt: Number(row.issued_at_ms), expiresAt: Number(row.expires_at_ms) };
  await verifyDinerWalletProof(challenge, proof, allowedOrigin, now);
  // Burn before asking the identity provider to issue a session. Concurrent
  // requests cannot use the same proof, even when the provider is unavailable.
  const burned = await db.rpc("diner_preview_wallet_burn", { p_nonce: proof.nonce, p_wallet: challenge.wallet, p_origin: allowedOrigin, p_message: proof.message });
  if (burned.error) unavailable();
  if (!burned.data?.ok) throw new DinerAuthorityError("wallet_challenge_used", "That sign-in message expired or was already used. Request a new one.", 401);
  const signed = await auth.auth.signInWithWeb3({ chain: "ethereum", message: proof.message, signature: proof.signature });
  const session = signed.data?.session;
  if (signed.error || !session || !signed.data.user || session.user.id !== signed.data.user.id || session.user.is_anonymous) unavailable();
  // Extract the session ID only after the provider verifies this access token.
  const checked = await auth.auth.getUser(session.access_token);
  if (checked.error || !checked.data.user || checked.data.user.id !== session.user.id || checked.data.user.is_anonymous) unavailable();
  const sessionId = verifiedDinerSessionId(session.access_token, checked.data.user.id, now);
  const registered = await db.rpc("diner_preview_wallet_register", { p_session: sessionId, p_player: checked.data.user.id, p_nonce: proof.nonce });
  if (registered.error || !registered.data?.ok || registered.data.wallet !== challenge.wallet) unavailable();
  return { accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at, playerId: checked.data.user.id, wallet: challenge.wallet };
}
