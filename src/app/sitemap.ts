import type { MetadataRoute } from "next";
import { getAllRecentGuides } from "@/lib/guides";
import { VALID_SUBDOMAINS } from "@/lib/subdomains";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const guides = await getAllRecentGuides(1000);

  // Root domain static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: `https://${ROOT}`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `https://${ROOT}/search`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.5 },
    { url: `https://${ROOT}/tools/tax-calculator`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `https://${ROOT}/tools/staking-calculator`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `https://${ROOT}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `https://${ROOT}/disclaimer`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
    { url: `https://${ROOT}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
    { url: `https://${ROOT}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
  ];

  // Subdomain homepages
  const subdomainRoutes: MetadataRoute.Sitemap = VALID_SUBDOMAINS.map((key) => ({
    url: `https://${key}.${ROOT}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  // Individual guide pages — flagship articles get higher priority
  const guideRoutes: MetadataRoute.Sitemap = guides.map((g) => {
    const isFlagship =
      (g.read_time_minutes ?? 0) >= 15 ||
      (g.tags ?? []).includes("flagship");
    return {
      url: `https://${g.subdomain}.${ROOT}/guides/${g.slug}`,
      lastModified: new Date(g.published_at),
      changeFrequency: "weekly" as const,
      priority: isFlagship ? 0.9 : 0.6,
    };
  });

  return [...staticPages, ...subdomainRoutes, ...guideRoutes];
}
