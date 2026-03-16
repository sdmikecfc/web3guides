import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Web3Guides — Crypto Education Network",
    template: "%s | Web3Guides",
  },
  description: "A network of expert crypto education resources covering Ethereum, Bitcoin, DeFi, Solana, staking, Layer 2, security, tax, legal, and more.",
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
        <div className="bg-canvas" aria-hidden="true" />
        <div className="bg-orb"    aria-hidden="true" />
        <div className="bg-stars"  aria-hidden="true" />
        <div className="bg-grid"   aria-hidden="true" />
        <div className="bg-vignette" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
