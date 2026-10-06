import type { Metadata } from "next";
import GameClient from "./GameClient";

/** Alternate entry to the same restaurant and food-truck game as /chef. */

export const metadata: Metadata = {
  title: "Domain Kitchen",
  description: "Build a restaurant to call home, cook through a food-truck adventure, and bring new equipment back. Play free on desktop or phone.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <GameClient />;
}
