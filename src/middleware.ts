import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { VALID_SUBDOMAINS } from "@/lib/subdomains";

// ── Season 4 LOCKDOWN (ADR-0019) ──────────────────────────────────────────
// Was the beach-kill teaser gate. GO-LIVE 2026-07-14: CMO approved the HIT
// LIST art, all surfaces built + placed, season launches 14:00 UTC. Flip back
// to true only for an emergency takedown (all /s4 subroutes then redirect to
// the sealed-dossier teaser).
const S4_LOCKDOWN = false;
const s4Locked = (pathname: string): boolean =>
  S4_LOCKDOWN &&
  pathname.startsWith("/s4/") &&
  !pathname.startsWith("/s4/opengraph-image");

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Ambassador dashboard gate (/dash) — HTTP Basic Auth, team-only ───────
  // Sits BEFORE all host branches so it wins on every host. Basic auth is
  // deliberate: browser-native prompt, zero UI code, and the gate lives
  // entirely in middleware so the /dash pages never read cookies()/headers()
  // — reading them in a page would silently opt it into dynamic rendering and
  // kill the 24h ISR contract. Credentials in env (rotate any time); unset
  // env = 404 for everyone (fails closed, hides existence). NOTE the match:
  // "/dash" and "/dash/*" only — "/dashboard" shares the prefix but fails
  // both tests (no "/" at position 5), so the affiliate dashboard is untouched.
  if (pathname === "/dash" || pathname.startsWith("/dash/")) {
    const user = process.env.DASH_USER;
    const pass = process.env.DASH_PASS;
    if (!user || !pass) return new NextResponse("Not found", { status: 404 });
    const expected = "Basic " + btoa(`${user}:${pass}`);
    if (request.headers.get("authorization") === expected) {
      return NextResponse.next();
    }
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="dash", charset="UTF-8"' },
    });
  }

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

  // ── THE LEGAL PAGES BELONG TO EVERY HOST ─────────────────────────────────
  // Every season host below rewrites the WHOLE path into its own tree, so
  // uprising.web3guides.com/privacy asked for /s6/privacy, which does not
  // exist, and 404'd. The pages themselves were fine; they were simply
  // unreachable from the only domain a player is ever given. This guard runs
  // BEFORE the host branches and lets these three fall through to the shared
  // app tree on any host. Additive: it changes nothing on web3guides.com,
  // where they already resolved, and it touches no season route.
  const LEGAL_PATHS = ["/privacy", "/terms", "/disclaimer"];
  if (LEGAL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return withRef(NextResponse.next());
  }

  // ── Season 2: seas.web3guides.com serves the Conquer the Seas surface ────
  // Explicit host branch, deliberately separate from VALID_SUBDOMAINS so the
  // guide-site machinery (and its static params/sitemaps) is untouched.
  // Covers seas.localhost in dev too.
  if (hostClean === "seas.web3guides.com" || hostClean.startsWith("seas.")) {
    const seasUrl = request.nextUrl.clone();
    seasUrl.pathname = pathname.startsWith("/seas")
      ? pathname
      : `/seas${pathname === "/" ? "" : pathname}`;
    return withRef(NextResponse.rewrite(seasUrl));
  }

  // ── Season 3: stars.web3guides.com serves the Starfall (SPACE) surface ────
  // Same explicit-host pattern as seas; the /stars app tree is self-contained.
  // Covers stars.localhost in dev too.
  if (hostClean === "stars.web3guides.com" || hostClean.startsWith("stars.")) {
    const starsUrl = request.nextUrl.clone();
    starsUrl.pathname = pathname.startsWith("/stars")
      ? pathname
      : `/stars${pathname === "/" ? "" : pathname}`;
    return withRef(NextResponse.rewrite(starsUrl));
  }

  // ── Season 4: beach.web3guides.com serves the Doma Beach Party surface ────
  // Same explicit-host pattern as seas/stars; the /s4 app tree is self-contained.
  // Covers beach.localhost in dev too. Note the target is /s4 (the neutral
  // backbone path), not /beach: the theme is a skin, the routes stay neutral.
  // beach. is the dead S4 subdomain (ADR-0019), assassin. the live one; both
  // serve the /s4 tree so the theme swap needs no route change.
  if (
    hostClean === "beach.web3guides.com" ||
    hostClean.startsWith("beach.") ||
    hostClean === "assassin.web3guides.com" ||
    hostClean.startsWith("assassin.")
  ) {
    const s4Url = request.nextUrl.clone();
    s4Url.pathname = pathname.startsWith("/s4")
      ? pathname
      : `/s4${pathname === "/" ? "" : pathname}`;
    if (s4Locked(s4Url.pathname)) {
      // lockdown: collapse every subroute to the host root (serves the teaser)
      const rootUrl = request.nextUrl.clone();
      rootUrl.pathname = "/";
      return NextResponse.redirect(rootUrl);
    }
    return withRef(NextResponse.rewrite(s4Url));
  }

  // ── Season 5: tanks.web3guides.com serves the Iron Siege surface ─────────
  // Same explicit-host pattern as seas/stars/beach; the /s5 app tree is
  // self-contained. Covers tanks.localhost in dev too. Target is /s5 (the
  // neutral backbone path), not /tanks: the theme is a skin, routes stay neutral.
  if (hostClean === "tanks.web3guides.com" || hostClean.startsWith("tanks.")) {
    const s5Url = request.nextUrl.clone();
    s5Url.pathname = pathname.startsWith("/s5")
      ? pathname
      : `/s5${pathname === "/" ? "" : pathname}`;
    return withRef(NextResponse.rewrite(s5Url));
  }

  // ── Season 6: uprising.web3guides.com serves THE FRONT (ADR-0117/0122) ───
  // Same explicit-host pattern as seas/stars/beach/tanks; the /s6 app tree is
  // self-contained. Covers uprising.localhost in dev too. Target is /s6 (the
  // neutral backbone path): the theme is a skin, routes stay neutral.
  // CANONICAL SINCE 2026-08-17 (Mike: "launchwars.xyz is the address now"):
  // uprising.* 308s to launchwars.xyz so every old shared link lands on the
  // one brand. Path carries over; /s6 prefixes are stripped because the new
  // host re-adds them in its own branch below. localhost keeps the rewrite so
  // uprising.localhost dev flows still work offline.
  if (hostClean === "uprising.web3guides.com" || hostClean.startsWith("uprising.")) {
    if (hostClean.endsWith(".localhost") || hostClean === "uprising.localhost") {
      const s6Url = request.nextUrl.clone();
      s6Url.pathname = pathname.startsWith("/s6")
        ? pathname
        : `/s6${pathname === "/" ? "" : pathname}`;
      return withRef(NextResponse.rewrite(s6Url));
    }
    const canon = request.nextUrl.clone();
    canon.protocol = "https:";
    canon.host = "launchwars.xyz";
    canon.port = "";
    canon.pathname = pathname.startsWith("/s6") ? pathname.slice(3) || "/" : pathname;
    return NextResponse.redirect(canon, 308);
  }

  // WHICH SEASON launchwars.xyz/ SERVES. This is the ONE line that flips the
  // domain over on launch day: change "/s6" to "/s7" at 16:00Z on Aug 31,
  // after S6 settles, then deploy. Explicit /s6 and /s7 paths keep working on
  // either side of the flip, so old shared links never break.
  const LAUNCHWARS_ROOT_SEASON = "/s6";

  // launchwars.xyz - the season's own domain (Mike, 2026-08-17). Serves the
  // SAME /s6 tree as uprising.*; the legal-paths guard above already lets
  // /privacy, /terms and /disclaimer through on it. REMEMBER THE SCAFFOLD LAW:
  // this host is also in ALLOWED_DOMAINS (lib/stars/server.ts) - the SIWE
  // allowlist that sign-in loops without, three seasons running.
  if (hostClean === "launchwars.xyz" || hostClean === "www.launchwars.xyz" || hostClean.endsWith(".launchwars.xyz")) {
    const seasonUrl = request.nextUrl.clone();
    // An EXPLICIT season prefix passes through untouched, so launchwars.xyz/s7
    // reaches the S7 tree while the root still serves the live season. Without
    // this, /s7 was rewritten to /s6/s7 and 404ed (found 2026-08-25, the day
    // S7 shipped: Mike had named launchwars.xyz/s7 as the link).
    seasonUrl.pathname =
      pathname.startsWith("/s6") || pathname.startsWith("/s7")
        ? pathname
        : `${LAUNCHWARS_ROOT_SEASON}${pathname === "/" ? "" : pathname}`;
    return withRef(NextResponse.rewrite(seasonUrl));
  }

  // /resist = the S6 hub alias (ADR-0117): a human-typeable door on the main
  // host that lands on the season front door. Redirect (not rewrite) so the
  // address bar settles on the canonical /s6 tree.
  if (pathname === "/resist" || pathname.startsWith("/resist/")) {
    const resistUrl = request.nextUrl.clone();
    resistUrl.pathname = `/s6${pathname.slice("/resist".length) || ""}`;
    return withRef(NextResponse.redirect(resistUrl, 308));
  }

  // ── DOMAIN KITCHEN: chef.web3guides.com serves the /chef surface ─────────
  // Same explicit-host pattern as seas/stars/beach (ADR-0047: web home =
  // chef.web3guides.com). Covers chef.localhost in dev too.
  if (hostClean === "chef.web3guides.com" || hostClean.startsWith("chef.")) {
    const chefUrl = request.nextUrl.clone();
    chefUrl.pathname = pathname.startsWith("/chef")
      ? pathname
      : `/chef${pathname === "/" ? "" : pathname}`;
    return withRef(NextResponse.rewrite(chefUrl));
  }

  // lockdown for direct web3guides.com/s4/* access (see S4_LOCKDOWN above)
  if (s4Locked(pathname)) {
    const teaserUrl = request.nextUrl.clone();
    teaserUrl.pathname = "/s4";
    return NextResponse.redirect(teaserUrl);
  }

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
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/.*|go/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|otf|css|js|map|mp4|webm)).*)",
  ],
};
