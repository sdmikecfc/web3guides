import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAffiliateBySlug } from "@/lib/affiliates";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;

  // 1. Look up the destination — DB first, fall back to static config
  let destinationUrl: string | null = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("affiliate_links")
      .select("destination_url, active")
      .eq("slug", slug)
      .single();

    if (data?.active) {
      destinationUrl = data.destination_url;
    }
  } catch {
    // Supabase unavailable — fall through to static config
  }

  // Static config fallback (works even if DB is down)
  if (!destinationUrl) {
    const staticLink = getAffiliateBySlug(slug);
    if (staticLink) destinationUrl = staticLink.destination_url;
  }

  if (!destinationUrl) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // 2. Log the click (fire-and-forget — never block the redirect)
  try {
    const supabase = await createClient();
    const referer = req.headers.get("referer") ?? "";
    const userAgent = req.headers.get("user-agent") ?? "";

    // Extract subdomain from referer if present
    const subdomainMatch = referer.match(/^https?:\/\/([^.]+)\.web3guides\.com/);
    const subdomain = subdomainMatch ? subdomainMatch[1] : null;

    // Extract the path from the referer
    const referrerPath = (() => {
      try { return new URL(referer).pathname; }
      catch { return referer || null; }
    })();

    await supabase.from("affiliate_clicks").insert({
      slug,
      referrer_path: referrerPath,
      subdomain,
      user_agent: userAgent.slice(0, 512),
    });
  } catch {
    // Never fail a redirect because of logging
  }

  // 3. Redirect with a no-cache header so browsers always re-hit this route
  return NextResponse.redirect(destinationUrl, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
