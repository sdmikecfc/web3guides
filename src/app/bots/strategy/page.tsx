/**
 * /bots/strategy: SET UP YOUR STRATEGY (screens doc 1 row 2, 7 row 0:30).
 * Two cards: the one button to Doma auto trading (a new tab) and the MCP
 * door (the URL and the three-line prompt, each with Copy), plus the status
 * dot that polls GET /api/bots/me every 30 seconds when that route exists.
 * Never on the critical path: the garage keeps working without a strategy.
 *
 * Server page in the garage's shape (garage/page.tsx): the metadata lives
 * here, the screen is the client component.
 */
import type { Metadata } from "next";
import StrategyClient from "./StrategyClient";

export const metadata: Metadata = {
  title: "Auto trading | Clanker Cup",
};

export default function StrategyPage() {
  return <StrategyClient />;
}
