import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSubdomainConfig } from "@/lib/subdomains";
import SubdomainHeader from "@/components/SubdomainHeader";
import SubdomainFooter from "@/components/SubdomainFooter";
import DomaAnnouncementBar from "@/components/DomaAnnouncementBar";

interface Props {
  children: React.ReactNode;
  params: { subdomain: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cfg = getSubdomainConfig(params.subdomain);
  if (!cfg) return {};

  const rootDomain =
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";

  return {
    title: {
      default: `${cfg.label} Guides — Web3Guides`,
      template: `%s | ${cfg.label} · Web3Guides`,
    },
    description: cfg.description,
    metadataBase: new URL(`https://${cfg.key}.${rootDomain}`),
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      shortcut: "/favicon.svg",
    },
    openGraph: {
      siteName: "Web3Guides",
      title: `${cfg.emoji} ${cfg.label} Guides — Web3Guides`,
      description: cfg.description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${cfg.label} Guides — Web3Guides`,
      description: cfg.description,
    },
  };
}

export default function SubdomainLayout({ children, params }: Props) {
  const cfg = getSubdomainConfig(params.subdomain);
  if (!cfg) notFound();

  return (
    <div
      className="relative min-h-screen flex flex-col"
      style={
        {
          "--subdomain-accent": cfg.accentHex,
          "--subdomain-glow": cfg.glowHex,
          "--subdomain-gradient-from": cfg.gradientFrom,
          "--subdomain-gradient-to": cfg.gradientTo,
          background: "#080C10",
        } as React.CSSProperties
      }
    >
      {/* Animated scan-line background — always visible */}
      <div className="scan-bg" aria-hidden="true" />

      {/* Radial glow from subdomain accent color */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `radial-gradient(ellipse 80% 40% at 50% -10%, ${cfg.glowHex.replace("0.15", "0.12")}, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      {/* Page structure */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <SubdomainHeader subdomain={cfg} />

        {/* Doma Protocol announcement bar — appears on every subdomain page */}
        <DomaAnnouncementBar />

        <main className="flex-1">{children}</main>
        <SubdomainFooter subdomain={cfg} />
      </div>
    </div>
  );
}
