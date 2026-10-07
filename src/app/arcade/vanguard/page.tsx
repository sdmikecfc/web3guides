/**
 * LAUNCH WARS ARCADE route for "vanguard" (S5). Mounts the season's EXISTING
 * game component unchanged: under /arcade its shell banks through
 * /api/arcade/* onto the arcade board (see src/lib/arcade/mode.ts). A static
 * route per game, so each game stays its own bundle.
 */
import Game from "@/app/s5/games/vanguard/Client";

export const metadata = {
  title: { absolute: "Vanguard | Launch Wars Arcade" },
};

export default function ArcadeVanguardPage() {
  return <Game />;
}
