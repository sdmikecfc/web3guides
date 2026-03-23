import { NextResponse } from "next/server";
import { getAllRecentGuides } from "@/lib/guides";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  const guides = await getAllRecentGuides(50);

  const items = guides
    .map((g) => {
      const url = `https://${g.subdomain}.${ROOT}/guides/${g.slug}`;
      return `
    <item>
      <title><![CDATA[${g.title}]]></title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description><![CDATA[${g.summary ?? ""}]]></description>
      <pubDate>${new Date(g.published_at).toUTCString()}</pubDate>
      <category>${g.subdomain}</category>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Web3Guides — Free Crypto &amp; Web3 Education</title>
    <link>https://${ROOT}</link>
    <description>Free guides on Ethereum, Bitcoin, DeFi, Solana, Layer 2, staking, crypto security, tax, and more.</description>
    <language>en-gb</language>
    <atom:link href="https://${ROOT}/api/rss" rel="self" type="application/rss+xml"/>
    <image>
      <url>https://${ROOT}/og-image.png</url>
      <title>Web3Guides</title>
      <link>https://${ROOT}</link>
    </image>
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
