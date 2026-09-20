import { NextResponse } from "next/server";
import { DinerAuthorityError } from "@/lib/chef/diner/authority";
import { dinerAuthClient, dinerPlayer } from "@/lib/chef/diner/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
/** Supabase's documented anonymous-account upgrade uses updateUser({email}).
 * The installed SDK requires a refresh-token session for updateUser, so the
 * server uses that exact authenticated PUT /auth/v1/user endpoint instead.
 * Secure email change and confirmations MUST be enabled in staging/production.
 */
export async function GET(req: Request) {
  try {
    await dinerPlayer(req); const token = req.headers.get("authorization")!.slice(7), user = await dinerAuthClient().auth.getUser(token);
    if (user.error || !user.data.user) throw new DinerAuthorityError("session_expired", "Reconnect to view your account.", 401);
    return respond({ ok: true, email: user.data.user.email ?? null, verified: !!user.data.user.email_confirmed_at && !user.data.user.is_anonymous });
  } catch (error) { return respond({ ok: false, error: error instanceof DinerAuthorityError ? error.message : "The account service is unavailable." }, error instanceof DinerAuthorityError ? error.status : 503); }
}
export async function POST(req: Request) {
  try {
    const player = await dinerPlayer(req), raw = await req.text(); if (raw.length > 2048) throw new DinerAuthorityError("input_too_large", "That account request is too large.", 413);
    let body; try { body = JSON.parse(raw); } catch { throw new DinerAuthorityError("invalid_json", "Enter an email address."); }
    if (!body || Object.keys(body).some(key => !["email", "token"].includes(key)) || typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new DinerAuthorityError("invalid_email", "Enter a valid email address.");
    if (body.token !== undefined) {
      if (typeof body.token !== "string" || !/^\d{6,8}$/.test(body.token)) throw new DinerAuthorityError("invalid_code", "Enter the verification code from your email.");
      const verified = await dinerAuthClient().auth.verifyOtp({ email: body.email, token: body.token, type: "email_change" });
      if (verified.error || verified.data.user?.id !== player || !verified.data.user.email_confirmed_at) throw new DinerAuthorityError("verification_failed", "That verification code could not confirm this account.");
      const session = verified.data.session;
      return respond({ ok: true, verified: true, ...(session ? { accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at, playerId: player } : {}) });
    }
    const endpoint = new URL("/auth/v1/user", process.env.NEXT_PUBLIC_SUPABASE_URL!);
    if (process.env.DINER_PREVIEW_APP_URL) { const redirect = new URL("/chef/diner-preview", process.env.DINER_PREVIEW_APP_URL); if (redirect.protocol !== "https:" && redirect.hostname !== "localhost") throw new DinerAuthorityError("account_unavailable", "The verified return address is not configured.", 503); endpoint.searchParams.set("redirect_to", redirect.toString()); }
    const result = await fetch(endpoint, { method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: req.headers.get("authorization")! }, body: JSON.stringify({ email: body.email }) });
    if (!result.ok) throw new DinerAuthorityError("verification_unavailable", "A verification email could not be sent. Please retry shortly.", result.status === 429 ? 429 : 400);
    // Sending a message is not proof of verification; only a fresh Auth user
    // response or verified OTP can report a permanent confirmed identity.
    return respond({ ok: true, verificationPending: true });
  } catch (error) { return respond({ ok: false, code: error instanceof DinerAuthorityError ? error.code : "account_unavailable", error: error instanceof DinerAuthorityError ? error.message : "The account service is unavailable." }, error instanceof DinerAuthorityError ? error.status : 503); }
}
