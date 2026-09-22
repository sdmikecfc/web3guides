import type { Metadata } from "next";
import GameClient from "./GameClient";

/**
 * Domain Kitchen — the real engine build (ADR-0101), M0: preloader + the
 * ref_B trattoria on the iso grid. Unlinked and noindexed while under
 * construction; the /chef demo stays the public surface until this replaces it.
 */

export const metadata: Metadata = {
  title: "Domain Kitchen",
  description: "Your restaurant on Doma. Park a position, trade, and cook.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <GameClient />;
}
