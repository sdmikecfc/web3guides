import type { Metadata } from "next";
import GameClient from "./game/GameClient";

/**
 * chef.web3guides.com opens straight into the game.
 *
 * One permanent restaurant and a resumable food-truck adventure share the
 * same entry point. Retired demo and academy routes stay retired.
 *
 * Still noindexed while the game settles.
 */
export const metadata: Metadata = {
  title: "Domain Kitchen",
  description: "Build a restaurant to call home, cook through a food-truck adventure, and bring new equipment back. Play free on desktop or phone.",
  robots: { index: false, follow: false },
};

export default function ChefPage() {
  return <GameClient />;
}
