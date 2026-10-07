/**
 * LAUNCH WARS ARCADE root layout. launchwars.xyz "/" serves this tree while no
 * season is live (src/middleware.ts), and /arcade/<game> mounts each season's
 * EXISTING game component, banking through /api/arcade/* onto fresh boards.
 *
 * ONE WalletProviders for the whole tree (the S4 ADR the season layouts
 * follow): the wallet connects once and stays connected across the landing
 * page and all sixteen games. ArcadeTopNav is a FIXED 52px overlay; the season
 * game shells already pad their own <main> to clear a nav of that height.
 *
 * METADATA: the root layout's metadataBase points at web3guides.com and sets
 * twitter.images site-wide, so this segment states absolute launchwars.xyz
 * URLs for BOTH openGraph and twitter (the bug documented in
 * src/app/s7/twitter-image.tsx, fixed here the way src/app/studio does it).
 */
import type { Metadata } from "next";
import { WalletProviders } from "@/app/wallet/providers";
import { ArcadeTopNav } from "./_components/ArcadeTopNav";

const SITE = "https://launchwars.xyz";
const CARD = `${SITE}/studio-art/launchwars.webp`;
const DESCRIPTION =
  "No season is live right now, so the arcade is open. Play the games from every Launch Wars season. Every board is new and everyone starts at 0.";

export const metadata: Metadata = {
  title: { absolute: "Launch Wars Arcade" },
  description: DESCRIPTION,
  alternates: { canonical: SITE },
  openGraph: {
    title: "Launch Wars Arcade",
    description: DESCRIPTION,
    url: SITE,
    siteName: "Launch Wars",
    images: [{ url: CARD, width: 1600, height: 700 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Launch Wars Arcade",
    description: DESCRIPTION,
    images: [CARD],
  },
};

const GROUND_CSS = `
.arc-ground {
  min-height: 100dvh;
  background:
    radial-gradient(1200px 620px at 50% -6%, rgba(224,102,46,0.12) 0%, rgba(224,102,46,0) 62%),
    radial-gradient(900px 560px at 10% 30%, rgba(154,167,180,0.10) 0%, rgba(154,167,180,0) 70%),
    radial-gradient(900px 560px at 90% 26%, rgba(154,167,180,0.08) 0%, rgba(154,167,180,0) 70%),
    linear-gradient(180deg, #151a20 0%, #0f1318 42%, #0b0e12 100%);
  background-attachment: fixed;
}
@media (prefers-reduced-motion: reduce) { .arc-ground { background-attachment: scroll; } }
.arc-skip{position:absolute;left:-9999px;top:0;z-index:2000;
  background:#e0662e;color:#0b0d10;font-weight:800;font-size:14px;
  padding:12px 18px;border-radius:0 0 8px 0;text-decoration:none;}
.arc-skip:focus{left:0;outline:2px solid #0b0d10;outline-offset:-4px;}
`;

export default function ArcadeLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProviders>
      <style dangerouslySetInnerHTML={{ __html: GROUND_CSS }} />
      <a className="arc-skip" href="#arcade-content">
        Skip to content
      </a>
      <ArcadeTopNav />
      {/* The skip link lands here on every arcade route: the mounted season games
          carry their own main ids (s7-content and so on), so the id lives on the wrapper. */}
      <div id="arcade-content" className="arc-ground">
        {children}
      </div>
    </WalletProviders>
  );
}
