/**
 * LAUNCH WARS ARCADE route for "riviera" (S4). Mounts the season's EXISTING game
 * component unchanged: under /arcade its shell banks through /api/arcade/*
 * onto the arcade board and skips the Telegram path (see
 * src/lib/arcade/mode.ts and src/app/s4/games/_shared/shared.tsx). S4 games
 * are single client files, so the route module itself is the component.
 */
import Game from "@/app/s4/games/riviera/page";

export const metadata = {
  title: { absolute: "Stampede | Launch Wars Arcade" },
};

export default function ArcadeRivieraPage() {
  return <Game />;
}
