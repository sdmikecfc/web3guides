import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const rootDomain =
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";

  return {
    rules: [
      // AI crawlers — explicitly allowed so content is cited by LLMs
      { userAgent: "GPTBot",             allow: "/" },
      { userAgent: "ChatGPT-User",       allow: "/" },
      { userAgent: "Google-Extended",    allow: "/" },
      { userAgent: "ClaudeBot",          allow: "/" },
      { userAgent: "PerplexityBot",      allow: "/" },
      { userAgent: "Applebot-Extended",  allow: "/" },
      { userAgent: "Amazonbot",          allow: "/" },
      { userAgent: "anthropic-ai",       allow: "/" },
      { userAgent: "cohere-ai",          allow: "/" },
      // All other crawlers
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/"],
      },
    ],
    sitemap: `https://${rootDomain}/sitemap.xml`,
  };
}
