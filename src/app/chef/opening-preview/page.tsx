import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GameClient from "../game/GameClient";

export const metadata: Metadata = {
  title: "Domain Kitchen · Opening preview",
  robots: { index: false, follow: false },
};

/** Development-only onboarding review, isolated from player saves and accounts. */
export default function OpeningPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <GameClient openingPreview />;
}
