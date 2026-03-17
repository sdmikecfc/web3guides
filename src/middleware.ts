import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { VALID_SUBDOMAINS } from "@/lib/subdomains";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
    return NextResponse.next();
  }

  // ── Rewrite  eth.web3guides.com/foo  →  /eth/foo ─────────────────────────
  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `/${subdomain}${pathname === "/" ? "" : pathname}`;

  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|otf|css|js|map)).*)",
  ],
};
