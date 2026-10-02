/**
 * Shared game typography and surface. The connected workshop has no wallet
 * provider. Existing wallet routes lazily load their original providers/nav.
 */

import localFont from "next/font/local";
import BotsRouteProviders from "./_components/BotsRouteProviders";
import { M } from "./_ui/tokens";

export const metadata = {
  title: "Model Kombat",
  description: "Build your robot, enter the ring, and compete in the Doma trading challenge.",
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
const toyFont = localFont({
  src: "../../../public/bots-art/fonts/Baloo2-Variable.ttf",
  weight: "400 800",
  style: "normal",
  variable: "--font-bots-toy",
  display: "swap",
});

export default function BotsLayout({ children }: { children: React.ReactNode }) {
  return (
    <BotsRouteProviders>
      <div className={toyFont.variable} style={{ background: M.ground, minHeight: "100dvh", fontFamily: "var(--font-bots-toy), ui-rounded, Arial, sans-serif" }}>
        {children}
      </div>
    </BotsRouteProviders>
  );
}
