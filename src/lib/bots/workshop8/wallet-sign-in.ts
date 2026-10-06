import { SiweMessage } from "siwe";
import type { Address, Hex } from "viem";

export const WORKSHOP_SIGN_IN_STATEMENT = "Sign in to save your Model Kombat garage. No payment or token approval.";
export type SignInStage = "preparing" | "signing" | "saving";

class SignInError extends Error {}

/** Never display wallet/parser exceptions: they can include signed payloads. */
export function signInErrorMessage(error: unknown): string {
  if (error instanceof SignInError) return error.message;
  let cause: unknown = error;
  for (let depth = 0; cause && typeof cause === "object" && depth < 6; depth++) {
    const detail = cause as { code?: unknown; name?: unknown; cause?: unknown };
    if (detail.code === 4001 || detail.code === "ACTION_REJECTED" || detail.name === "UserRejectedRequestError") {
      return "Signature cancelled. Try again when you’re ready. No payment was made.";
    }
    cause = detail.cause;
  }
  return "Sign-in didn’t finish. Check your connection and try again.";
}

export function workshopSignInMessage(address: Address, origin: string, nonce: unknown): string {
  // The signed challenge must exactly match the stored nonce. Never sanitize it.
  if (typeof nonce !== "string" || !/^[A-Za-z0-9]{16,128}$/.test(nonce)) {
    throw new SignInError("We couldn’t start sign-in. Please try again.");
  }
  const site = new URL(origin);
  return new SiweMessage({
    domain: site.host, address, statement: WORKSHOP_SIGN_IN_STATEMENT,
    uri: site.origin, version: "1", chainId: 1, nonce, issuedAt: new Date().toISOString(),
  }).prepareMessage();
}

async function result(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 429) throw new SignInError("Too many sign-in attempts. Wait five minutes, then try again.");
  if (response.status === 401) throw new SignInError("Your sign-in expired or your wallet changed. Please try again.");
  if (!response.ok) throw new SignInError("Sign-in is unavailable right now. Please try again shortly.");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !("ok" in value) || value.ok !== true) {
    throw new SignInError("Sign-in didn’t finish. Please try again.");
  }
  return value as Record<string, unknown>;
}

export async function signInToWorkshop({ address, origin, signMessage, fetcher = fetch, signal, isCurrentWallet = () => true, onStage }: {
  address: Address;
  origin: string;
  signMessage(message: string): Promise<Hex>;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  isCurrentWallet?(): boolean;
  onStage?(stage: SignInStage): void;
}): Promise<{ token: string; wallet: string }> {
  const checkWallet = () => {
    if (signal?.aborted) throw new DOMException("Sign-in closed", "AbortError");
    if (!isCurrentWallet()) throw new SignInError("Your wallet changed. Sign in again with the wallet you want to use.");
  };
  onStage?.("preparing");
  const challenge = await result(await fetcher("/api/bots/enlist/nonce", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }), signal,
  }));
  checkWallet();
  const message = workshopSignInMessage(address, origin, challenge.nonce);
  onStage?.("signing");
  const signature = await signMessage(message);
  checkWallet();
  onStage?.("saving");
  const signedIn = await result(await fetcher("/api/bots/workshop/auth", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, message, signature }), signal,
  }));
  checkWallet();
  if (typeof signedIn.token !== "string" || !signedIn.token || typeof signedIn.wallet !== "string" || signedIn.wallet.toLowerCase() !== address.toLowerCase()) {
    throw new SignInError("Sign-in didn’t finish. Please try again.");
  }
  return { token: signedIn.token, wallet: signedIn.wallet };
}
