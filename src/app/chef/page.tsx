import type { Metadata } from "next";
import GameClient from "./game/GameClient";

/**
 * chef.web3guides.com opens straight into the game.
 *
 * The demo-era surfaces (/chef/demo, /chef/academy, /chef/rush) were RETIRED
 * on 2026-08-04: they taught pre-ADR-0103 rules under the pre-ADR-0100 name,
 * and a page that teaches the wrong game is worse than no page. The Academy
 * lives inside the game now (game/_engine/academy.ts), and the always-on
 * world replaced the standalone Dinner Rush (ADR-0102).
 *
 * Still noindexed while the game settles.
 */
export const metadata: Metadata = {
  title: "Domain Kitchen",
  description: "Your restaurant on Doma. Park a position, trade, and cook.",
  robots: { index: false, follow: false },
};

export default function ChefPage() {
  return <GameClient />;
}
