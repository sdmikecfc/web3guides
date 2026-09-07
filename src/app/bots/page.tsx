import { Suspense } from "react";
import { workshopEnabled } from "@/lib/bots/rollout";
import GameShell from "./_game/GameShell";
import LegacyLanding from "./LegacyLanding";

export default function BotsPage() {
  return <Suspense fallback={null}>{workshopEnabled() ? <GameShell /> : <LegacyLanding />}</Suspense>;
}
