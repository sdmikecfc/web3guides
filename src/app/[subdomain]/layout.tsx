import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSubdomainConfig } from "@/lib/subdomains";
import SubdomainHeader from "@/components/SubdomainHeader";
import SubdomainFooter from "@/components/SubdomainFooter";

interface Props {
  children: React.ReactNode;
  params: { subdomain: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cfg = getSubdomainConfig(params.subdomain);
  if (!cfg) return {};
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";
  const color = cfg.accentHex.replace("#", "%23");
  return {
    title: { default: `${cfg.label} Guides`, template: `%s | ${cfg.label} · Web3Guides` },
    description: cfg.description,
    metadataBase: new URL(`https://${cfg.key}.${rootDomain}`),
    icons: {
      icon: [
        { url: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='${color}'/><text y='.9em' font-size='65' x='10'>${cfg.emoji}</text></svg>` },
      ],
    },
    openGraph: {
      siteName: "Web3Guides",
      title: `${cfg.label} Guides`,
      description: cfg.description,
    },
    twitter: { card: "summary_large_image" },
  };
}

export default function SubdomainLayout({ children, params }: Props) {
  const cfg = getSubdomainConfig(params.subdomain);
  if (!cfg) notFound();

  return (
    <div
      className="min-h-screen flex flex-col page-content"
      style={{
        "--subdomain-accent": cfg.accentHex,
        "--subdomain-glow":   cfg.glowHex,
        "--subdomain-a":      cfg.accentHex,
        "--subdomain-b":      cfg.gradientFrom,
      } as React.CSSProperties}
    >
      <SubdomainHeader subdomain={cfg} />
      <main className="flex-1">{children}</main>
      <SubdomainFooter subdomain={cfg} />
    </div>
  );
}
