import { NextResponse } from "next/server";
import { getGuidesBySubdomain } from "@/lib/guides";
import { getSubdomainConfig } from "@/lib/subdomains";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";

export async function GET(
  _req: Request,
  { params }: { params: { subdomain: string } }
) {
  const cfg = getSubdomainConfig(params.subdomain);
  if (!cfg) {
    return new NextResponse("Not found", { status: 404 });
  }

  const guides = await getGuidesBySubdomain(params.subdomain, { limit: 30 });
  const base = `https://${params.subdomain}.${ROOT}`;
  const feedUrl = `https://${ROOT}/api/rss/${params.subdomain}`;

  const items = guides
    .map((g) => {
      const url = `${base}/guides/${g.slug}`;
      return `
    <item>
      <title><![CDATA[${g.title}]]></title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description><![CDATA[${g.summary ?? ""}]]></description>
      <pubDate>${new Date(g.published_at).toUTCString()}</pubDate>
      <category>${params.subdomain}</category>
      ${(g.tags ?? []).map((t) => `<category>${t}</category>`).join("")}
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Web3Guides — ${cfg.label} Guides</title>
    <link>${base}</link>
    <description>Free ${cfg.label} guides on web3guides.com. Learn ${cfg.label} from beginner to advanced.</description>
    <language>en-gb</language>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
    },
  });
}
