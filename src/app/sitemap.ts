import type { MetadataRoute } from "next";
import { getAllRecentGuides } from "@/lib/guides";
import { VALID_SUBDOMAINS } from "@/lib/subdomains";

const rootDomain =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const guides = await getAllRecentGuides(500);

  // Subdomain homepages
  const subdomainRoutes: MetadataRoute.Sitemap = VALID_SUBDOMAINS.map((key) => ({
    url: `https://${key}.${rootDomain}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // Individual guide pages
  const guideRoutes: MetadataRoute.Sitemap = guides.map((guide) => ({
    url: `https://${guide.subdomain}.${rootDomain}/guides/${guide.slug}`,
    lastModified: new Date(guide.published_at),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [
    {
      url: `https://${rootDomain}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...subdomainRoutes,
    ...guideRoutes,
  ];
}
