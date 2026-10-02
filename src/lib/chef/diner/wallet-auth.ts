import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { DinerAuthorityError } from "./authority";

export const DINER_WALLET_STATEMENT = "Sign in to Domain Kitchen. This is a message signature only: no transaction, no gas fee, and no permission to spend your assets.";
export const DINER_WALLET_RULES = Object.freeze({ challengeTtlMs: 5 * 60_000, maxChainId: 2_147_483_647, maxMessageBytes: 2_048, maxTokenBytes: 8_192 });
export interface DinerWalletOriginConfig { appUrl?: string; extraOrigins?: string; nodeEnv?: string }
export interface DinerWalletChallenge {
  nonce: string; wallet: string; chainId: number; origin: string; message: string; issuedAt: number; expiresAt: number;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE = /^[0-9a-f]{32}$/;
function invalid(message = "Request a new wallet sign-in message."): never { throw new DinerAuthorityError("wallet_challenge_invalid", message, 400); }
function plainObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }

function configuredOrigin(value: string, development: boolean): string | null {
  try {
    const url = new URL(value), hostname = url.hostname.toLowerCase();
    const local = hostname === "localhost" || hostname.endsWith(".localhost") || /^127(?:\.\d{1,3}){3}$/.test(hostname) || ["[::1]", "0.0.0.0"].includes(hostname);
    if (url.username || url.password || !["https:", "http:"].includes(url.protocol) || local && !development || url.protocol === "http:" && !local) return null;
    return url.origin;
  } catch { return null; }
}

/** Origins come from deployment configuration, never Host or forwarded headers. */
export function dinerWalletOrigin(origin: unknown, config: DinerWalletOriginConfig): string {
  const development = config.nodeEnv === "development";
  const primary = config.appUrl && configuredOrigin(config.appUrl, development);
  if (!primary) throw new DinerAuthorityError("wallet_configuration_required", "Wallet sign-in needs an approved application URL.", 503);
  const configured = [config.appUrl!, ...(config.extraOrigins ?? "").split(",").map(value => value.trim()).filter(Boolean)];
  const allowed = configured.map(value => configuredOrigin(value, development));
  if (allowed.some(value => !value)) throw new DinerAuthorityError("wallet_configuration_required", "Wallet sign-in has an invalid approved origin.", 503);
  if (typeof origin !== "string" || origin.length > 512 || !allowed.includes(origin)) throw new DinerAuthorityError("wallet_origin_invalid", "Open Domain Kitchen from its approved address to connect your wallet.", 403);
  return origin;
}

export function dinerWalletAccount(value: unknown): { wallet: string; chainId: number } {
  if (!plainObject(value) || typeof value.address !== "string" || value.address.length !== 42 || !isAddress(value.address, { strict: true })) invalid("Choose a valid Ethereum wallet address.");
  if (!Number.isSafeInteger(value.chainId) || (value.chainId as number) < 1 || (value.chainId as number) > DINER_WALLET_RULES.maxChainId) invalid("Choose a supported Ethereum chain identifier.");
  return { wallet: value.address.toLowerCase(), chainId: value.chainId as number };
}

export function dinerWalletMessage(challenge: Omit<DinerWalletChallenge, "message">): string {
  return `${new URL(challenge.origin).host} wants you to sign in with your Ethereum account:\n${getAddress(challenge.wallet)}\n\n${DINER_WALLET_STATEMENT}\n\nURI: ${challenge.origin}/chef/diner-preview\nVersion: 1\nChain ID: ${challenge.chainId}\nNonce: ${challenge.nonce}\nIssued At: ${new Date(challenge.issuedAt).toISOString()}\nExpiration Time: ${new Date(challenge.expiresAt).toISOString()}`;
}

export function createDinerWalletChallenge(value: unknown, origin: string, nonce: string, now: number): DinerWalletChallenge {
  if (!NONCE.test(nonce) || !Number.isSafeInteger(now) || now < 0) invalid();
  const challenge = { ...dinerWalletAccount(value), origin, nonce, issuedAt: now, expiresAt: now + DINER_WALLET_RULES.challengeTtlMs };
  return { ...challenge, message: dinerWalletMessage(challenge) };
}

export function dinerWalletProof(value: unknown): { nonce: string; message: string; signature: Hex } {
  if (!plainObject(value) || typeof value.nonce !== "string" || !NONCE.test(value.nonce) || typeof value.message !== "string" || value.message.length > DINER_WALLET_RULES.maxMessageBytes || typeof value.signature !== "string" || !/^0x(?:[0-9a-f]{128}|[0-9a-f]{130})$/i.test(value.signature)) invalid();
  return { nonce: value.nonce, message: value.message, signature: value.signature as Hex };
}

export function validateDinerWalletChallenge(challenge: DinerWalletChallenge, proof: ReturnType<typeof dinerWalletProof>, origin: string, now: number): void {
  if (!Number.isSafeInteger(challenge.issuedAt) || !Number.isSafeInteger(challenge.expiresAt) || challenge.expiresAt !== challenge.issuedAt + DINER_WALLET_RULES.challengeTtlMs || !NONCE.test(challenge.nonce) || challenge.nonce !== proof.nonce || challenge.origin !== origin || challenge.message !== proof.message || challenge.message !== dinerWalletMessage(challenge)) invalid();
  dinerWalletAccount({ address: challenge.wallet, chainId: challenge.chainId });
  if (now < challenge.issuedAt || now >= challenge.expiresAt) throw new DinerAuthorityError("wallet_challenge_expired", "That sign-in message expired. Request a new one.", 401);
}

export async function verifyDinerWalletProof(challenge: DinerWalletChallenge, proof: ReturnType<typeof dinerWalletProof>, origin: string, now: number): Promise<void> {
  validateDinerWalletChallenge(challenge, proof, origin, now);
  let verified = false;
  try { verified = await verifyMessage({ address: getAddress(challenge.wallet), message: proof.message, signature: proof.signature }); } catch { /* Malformed signatures are failed proofs. */ }
  if (!verified) throw new DinerAuthorityError("wallet_signature_invalid", "The signature does not match this wallet sign-in message.", 401);
}

/** This decodes claims, it does NOT verify a JWT. Call only after auth.getUser(token). */
export function verifiedDinerSessionId(token: string, playerId: string, now: number): string {
  try {
    if (token.length > DINER_WALLET_RULES.maxTokenBytes || !UUID.test(playerId)) throw new Error();
    const pieces = token.split(".");
    if (pieces.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(pieces[1])) throw new Error();
    const payload: unknown = JSON.parse(Buffer.from(pieces[1], "base64url").toString("utf8"));
    if (!plainObject(payload) || payload.sub !== playerId || typeof payload.session_id !== "string" || !UUID.test(payload.session_id) || !Number.isSafeInteger(payload.exp) || (payload.exp as number) * 1000 <= now || payload.is_anonymous === true) throw new Error();
    return payload.session_id.toLowerCase();
  } catch { throw new DinerAuthorityError("wallet_session_required", "Connect and sign in with your wallet to continue.", 401); }
}
