import { NextResponse } from "next/server";
import { DinerAuthorityError } from "@/lib/chef/diner/authority";
import { dinerAuthClient } from "@/lib/chef/diner/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
/** Recovery proves ownership of an existing verified email; it never imports a
 * browser checkpoint or creates a replacement identity for an unknown email. */
export async function POST(req: Request) {
  try {
    const auth = dinerAuthClient(), raw = await req.text(); if (raw.length > 6144) throw new DinerAuthorityError("input_too_large", "That recovery request is too large.", 413);
    let body; try { body = JSON.parse(raw); } catch { throw new DinerAuthorityError("invalid_json", "Enter your verified email address."); }
    if (!body || Object.keys(body).some(key => !["email", "token", "captchaToken"].includes(key)) || typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new DinerAuthorityError("invalid_email", "Enter your verified email address.");
    if (body.token === undefined) {
      const options = { shouldCreateUser: false, ...(typeof body.captchaToken === "string" ? { captchaToken: body.captchaToken.slice(0, 4096) } : {}), ...(process.env.DINER_PREVIEW_APP_URL ? { emailRedirectTo: new URL("/chef/diner-preview", process.env.DINER_PREVIEW_APP_URL).toString() } : {}) };
      const sent = await auth.auth.signInWithOtp({ email: body.email, options });
      if (sent.error?.status === 429) throw new DinerAuthorityError("try_later", "Please wait before requesting another code.", 429);
      // Do not disclose whether an address has a diner account.
      return respond({ ok: true, verificationPending: true });
    }
    if (typeof body.token !== "string" || !/^\d{6,8}$/.test(body.token)) throw new DinerAuthorityError("invalid_code", "Enter the code sent to your email.");
    const verified = await auth.auth.verifyOtp({ email: body.email, token: body.token, type: "email" }), session = verified.data.session;
    if (verified.error || !session || !session.user.email_confirmed_at || session.user.is_anonymous) throw new DinerAuthorityError("verification_failed", "That code could not reopen your diner.");
    return respond({ ok: true, accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at, playerId: session.user.id });
  } catch (error) { return respond({ ok: false, code: error instanceof DinerAuthorityError ? error.code : "account_unavailable", error: error instanceof DinerAuthorityError ? error.message : "The account service is unavailable." }, error instanceof DinerAuthorityError ? error.status : 503); }
}
