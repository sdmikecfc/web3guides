import "server-only";
import { NextResponse } from "next/server";
import { failResponse, sessionSecret } from "@/app/bots/_server/db";

class SignInConfigurationError extends Error {}

/** Check before issuing a nonce or changing a garage. A successful signature
 * must never be followed by a missing session key at the very last step. */
export function requireSignInConfiguration(): void {
  try {
    sessionSecret();
  } catch {
    throw new SignInConfigurationError("Set BB_SESSION_SECRET (or the existing BB_CARD_SECRET) in the server environment before enabling wallet sign-in.");
  }
}

/** Keep configuration details in server logs, with a useful player-facing error. */
export function signInFailure(error: unknown): NextResponse {
  if (error instanceof SignInConfigurationError) {
    console.error("[bots sign-in configuration]", error.message);
    return NextResponse.json({
      ok: false,
      code: "SIGN_IN_NOT_CONFIGURED",
      error: "Wallet sign-in is not ready on this site yet. Your practice garage is safe.",
      retryable: false,
    }, { status: 503 });
  }
  const response = failResponse(error);
  if (response.status < 500) return response;
  return NextResponse.json({
    ok: false,
    code: "SIGN_IN_UNAVAILABLE",
    error: "Wallet sign-in is unavailable right now. Your practice garage is safe. Please try again shortly.",
    retryable: true,
  }, { status: 503 });
}
