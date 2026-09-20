import { NextResponse } from "next/server";
import { dinerAuthClient } from "@/lib/chef/diner/server";
import { DinerAuthorityError } from "@/lib/chef/diner/authority";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Supabase anonymous accounts require no wallet. Enable anonymous auth, CAPTCHA
 * and abuse limits in the isolated staging project before exposing this route. */
export async function POST(req: Request) {
  try {
    const auth = dinerAuthClient(), raw = await req.text();
    if (raw.length > 8192) return NextResponse.json({ ok: false, error: "Session request too large." }, { status: 413 });
    const body = raw ? JSON.parse(raw) : {};
    const result = typeof body.refreshToken === "string" && body.refreshToken.length <= 4096
      ? await auth.auth.refreshSession({ refresh_token: body.refreshToken })
      : await auth.auth.signInAnonymously({ options: typeof body.captchaToken === "string" ? { captchaToken: body.captchaToken.slice(0, 4096) } : {} });
    if (result.error || !result.data.session) return NextResponse.json({ ok: false, code: "session_unavailable", error: "The preview account service could not start this session." }, { status: 503 });
    const session = result.data.session;
    return NextResponse.json({ ok: true, accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at, playerId: session.user.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ ok: false, code: error instanceof DinerAuthorityError ? error.code : "session_unavailable", error: error instanceof DinerAuthorityError ? error.message : "The preview account service is unavailable." }, { status: error instanceof DinerAuthorityError ? error.status : 503, headers: { "Cache-Control": "no-store" } }); }
}
