/**
 * SEASON 7 · REALMFALL - THE SPIRE route (key "ascent"). Pulled forward
 * from the week-2 drop into the launch slate (Mike, 2026-08-28). The
 * free-play dev harness lives on in ./Client for tuning; this route is the
 * real season shell, exactly like the other three games.
 */
import AscentShell from "./shell";

export const metadata = {
  title: "The Spire | Launch Wars S7: Realmfall",
  description:
    "Climb one tower against a three minute timer. Hold to charge, aim, let go. One wrong jump drops you back down, and the top is further than anyone can reach.",
};

export default function AscentPage() {
  return <AscentShell />;
}
