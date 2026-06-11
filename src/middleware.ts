import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { VALID_SUBDOMAINS } from "@/lib/subdomains";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Referral capture (Launch Wars, Session 7) ────────────────────────────
  // A visitor arriving via web3guides.com/launch-wars?ref=CODE gets an httpOnly
  // lw_ref cookie. The wallet-link verify route (/api/wallet/verify) later reads
  // it and attributes the referral to the wallet the visitor SIWE-signs with —
  // the bridge between the marketing page and their Discord identity, with no
  // OAuth or bot permissions. Format-validated; only set on /launch-wars.
  const refRaw = request.nextUrl.searchParams.get("ref");
  const refCode =
    refRaw && /^[A-Za-z0-9]{4,16}$/.test(refRaw) ? refRaw.toUpperCase() : null;
  const withRef = (res: NextResponse): NextResponse => {
    if (refCode && pathname.startsWith("/launch-wars")) {
      res.cookies.set("lw_ref", refCode, {
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });
    }
    return res;
  };

  // Use x-forwarded-host on Vercel, fallback to host header
  const hostname =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "";

  // Strip port so "eth.localhost:3000" → "eth.localhost"
  const hostClean = hostname.split(":")[0];

  // ── Try to extract a subdomain from the hostname ─────────────────────────
  // Strategy: split on "." and check if the first segment is a valid subdomain.
  // This works for:
  //   eth.web3guides.com        → ["eth", "web3guides", "com"]
  //   eth.localhost             → ["eth", "localhost"]
  //   eth.myapp.vercel.app      → ["eth", "myapp", "vercel", "app"]
  //   localhost / web3guides.com → no subdomain
  const parts = hostClean.split(".");

  // Need at least 2 parts and the first must be a valid subdomain key
  const potentialSubdomain = parts.length >= 2 ? parts[0] : null;

  // Also ensure we're not on the raw apex (e.g. "web3guides.com" has parts
  // ["web3guides","com"] — "web3guides" is NOT in VALID_SUBDOMAINS, so safe)
  const subdomain =
    potentialSubdomain &&
    VALID_SUBDOMAINS.includes(potentialSubdomain as never)
      ? potentialSubdomain
      : null;

  if (!subdomain) {
    return withRef(NextResponse.next());
  }

  // ── Rewrite  eth.web3guides.com/foo  →  /eth/foo ─────────────────────────
  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `/${subdomain}${pathname === "/" ? "" : pathname}`;

  return withRef(NextResponse.rewrite(rewriteUrl));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/.*|go/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|otf|css|js|map)).*)",
  ],
};
