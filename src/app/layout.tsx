import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Web3Guides — Free Crypto & Web3 Education",
    template: "%s | Web3Guides",
  },
  description: "Free guides on Ethereum, Bitcoin, DeFi, Solana, Layer 2, staking, crypto security, tax, and more. No signup required — pick a topic and go deep.",
  keywords: ["crypto guides", "web3 education", "ethereum guide", "bitcoin tutorial", "defi explained", "solana", "crypto tax", "layer 2", "crypto security", "blockchain learning"],
  authors: [{ name: "Web3Guides" }],
  creator: "Web3Guides",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://web3guides.com",
    siteName: "Web3Guides",
    title: "Web3Guides — Free Crypto & Web3 Education",
    description: "Free guides on Ethereum, Bitcoin, DeFi, Solana, Layer 2, staking, crypto security, and crypto tax. No signup required.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Web3Guides — Free Crypto Education" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Web3Guides — Free Crypto & Web3 Education",
    description: "Free guides on Ethereum, Bitcoin, DeFi, Solana, Layer 2, staking, crypto security, and tax.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%237c6aff'/><text y='.9em' font-size='70' x='15'>W3</text></svg>" },
    ],
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_ROOT_DOMAIN
      ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
      : "http://localhost:3000"
  ),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head />
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
