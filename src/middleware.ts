import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { VALID_SUBDOMAINS } from "@/lib/subdomains";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") ?? "";

  // ── Determine root domain ────────────────────────────────────────────────
  const rootDomain =
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";
  const devRoot =
    process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ?? "localhost:3000";

  // Strip port from hostname for comparison
  const hostWithoutPort = hostname.replace(/:\d+$/, "");
  const rootWithoutPort = (
    process.env.NODE_ENV === "development" ? devRoot : rootDomain
  ).replace(/:\d+$/, "");

  // ── Extract subdomain ────────────────────────────────────────────────────
  // e.g. "eth.web3guides.com" → "eth"
  //      "eth.localhost"      → "eth"  (local dev)
  let subdomain: string | null = null;

  if (hostWithoutPort.endsWith(`.${rootWithoutPort}`)) {
    subdomain = hostWithoutPort.slice(
      0,
      hostWithoutPort.length - rootWithoutPort.length - 1
    );
  }

  // ── Validate subdomain ───────────────────────────────────────────────────
  if (!subdomain || !VALID_SUBDOMAINS.includes(subdomain as never)) {
    // Either the apex domain or an unknown subdomain — serve normally
    return NextResponse.next();
  }

  // ── Rewrite to /[subdomain]/… ────────────────────────────────────────────
  // eth.web3guides.com/           → /eth
  // eth.web3guides.com/guides/foo → /eth/guides/foo
  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `/${subdomain}${pathname === "/" ? "" : pathname}`;

  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  /*
   * Match everything EXCEPT:
   *  - Next.js internals (_next/static, _next/image)
   *  - Public files (favicon, robots, etc.)
   *  - API routes (handled separately)
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|otf|css|js|map)).*)",
  ],
};
