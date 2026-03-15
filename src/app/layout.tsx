import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Web3Guides — Crypto Education Network",
    template: "%s | Web3Guides",
  },
  description:
    "A network of expert crypto education resources covering Ethereum, Bitcoin, DeFi, Solana, staking, Layer 2, security, tax, legal, and more.",
  keywords: ["crypto", "web3", "blockchain", "DeFi", "Bitcoin", "Ethereum"],
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_ROOT_DOMAIN
      ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
      : "http://localhost:3000"
  ),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head />
      <body className="antialiased">{children}</body>
    </html>
  );
}
