import { Suspense } from "react";
import GameShell from "../_game/GameShell";

export const metadata = { title: "Your first robot | Model Kombat" };
/** Existing onboarding remains resumable during a workshop rollout pause.
 * The server switch separately prevents creating new live onboarding. */
export default function WelcomePage() {
  return <Suspense fallback={null}><GameShell /></Suspense>;
}
