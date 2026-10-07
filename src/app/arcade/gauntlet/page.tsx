/**
 * LAUNCH WARS ARCADE route for "gauntlet" (S7). Mounts the season's EXISTING
 * game component unchanged: under /arcade its shell banks through
 * /api/arcade/* onto the arcade board (see src/lib/arcade/mode.ts). A static
 * route per game, so each game stays its own bundle.
 */
import Game from "@/app/s7/games/gauntlet/shell";

export const metadata = {
  title: { absolute: "The Gauntlet | Launch Wars Arcade" },
};

export default function ArcadeGauntletPage() {
  return <Game />;
}
