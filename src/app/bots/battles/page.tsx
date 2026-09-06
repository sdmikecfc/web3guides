/**
 * /bots/battles: the Battles page (screens doc 4.1). The client reads the
 * query string (?bot=) and the clock, so it is a client component under a
 * Suspense boundary (the Garage route's shape, ../garage/page.tsx).
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import BattlesClient from "./BattlesClient";

export const metadata: Metadata = {
  title: "Fights | Clanker Cup",
  description: "Pick your robot, fight a game robot or another player, and watch every fight again.",
};

export default function BattlesPage() {
  return (
    <Suspense fallback={null}>
      <BattlesClient />
    </Suspense>
  );
}
