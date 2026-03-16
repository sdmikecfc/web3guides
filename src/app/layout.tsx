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
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Inline background prevents white flash before CSS loads
    <html lang="en" className="dark" style={{ background: "#080C10", colorScheme: "dark" }}>
      <head />
      <body className="antialiased" style={{ background: "#080C10" }}>
        {children}
      </body>
    </html>
  );
}
