import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const rootDomain =
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `https://${rootDomain}/sitemap.xml`,
  };
}
