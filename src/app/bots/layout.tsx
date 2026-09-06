/**
 * The /bots tree layout: ONE WalletProviders for the whole tree (the S7 and
 * chef root-layout pattern, src/app/chef/layout.tsx), so the wallet connects
 * once and survives client-side nav. BotsTopNav is a FIXED overlay, never in
 * a page's layout flow, so it cannot break the bay canvas.
 */

import { Baloo_2 } from "next/font/google";
import { WalletProviders } from "@/app/wallet/providers";
import { BotsTopNav } from "./_components/BotsTopNav";
import { M } from "./_ui/tokens";

export const metadata = {
  title: "Battle Bots",
  description: "Build a robot. Watch it fight.",
};

/**
 * THE TOY FONT.
 *
 * Baloo 2 is the clay layer's one voice: bot name plates, the Morning Paper
 * masthead, crew speech chips, the KNOCKOUT word. Declared HERE exactly as
 * chef/layout.tsx declares `--font-dk`, because a variable put on one page
 * leaves every other page rendering the fallback (chef caught its boot
 * screen in a SERIF that way). `display: "swap"` means the fallback covers
 * the load window rather than blocking first paint. tokens.ts keeps the
 * fallback inside the var() for the same reason.
 */
const toyFont = Baloo_2({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-bots-toy",
  display: "swap",
});

export default function BotsLayout({ children }: { children: React.ReactNode }) {
  // the site accent on the connect button: the money layer IS the site
  return (
    <WalletProviders accent={M.accent} accentForeground="#ffffff">
      <div className={toyFont.variable} style={{ background: M.ground, minHeight: "100dvh" }}>
        <BotsTopNav />
        {children}
      </div>
    </WalletProviders>
  );
}
