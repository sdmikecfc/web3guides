/**
 * The /chef tree layout (ADR-0101): ONE WalletProviders for the whole tree,
 * the S5 root-layout pattern, so the wallet connects once and survives
 * client-side nav. The M4 LP flows depend on this being here; the demo pages
 * simply pass through it unchanged.
 */

import { Baloo_2 } from "next/font/google";
import { WalletProviders } from "@/app/wallet/providers";

/**
 * THE GAME FONT (M11).
 *
 * The chrome asked for `ui-rounded` in nine separate places. That keyword only
 * resolves on Apple platforms, so every Windows and Android player fell through
 * to plain Segoe UI and never saw a rounded face at all — a large part of why
 * the interface read as a document rather than a game.
 *
 * Declared HERE, not on a page, because the game has two entry points:
 * `/chef` (what chef.web3guides.com actually opens) and `/chef/game`. Putting
 * the variable on one page left the other rendering in the browser default,
 * which is how the boot screen was caught rendering in a SERIF. The layout
 * covers both, and covers BootShell too — it is the dynamic-import fallback,
 * so it paints before GameStage exists.
 *
 * `display: "swap"` means the Segoe fallback covers the load window rather
 * than blocking the boot screen.
 */
const dkFont = Baloo_2({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-dk",
  display: "swap",
});

export default function ChefLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // the kitchen's amber, so the connect button stops being the one
  // off-palette element on an otherwise warm screen (ADR-0112 house look)
  return (
    <WalletProviders accent="#e8a13d" accentForeground="#1b1310">
      <div className={dkFont.variable}>{children}</div>
    </WalletProviders>
  );
}
