/**
 * LAUNCH WARS ARCADE route for "riot" (S6). Mounts the season's EXISTING
 * game component unchanged: under /arcade its shell banks through
 * /api/arcade/* onto the arcade board (see src/lib/arcade/mode.ts). A static
 * route per game, so each game stays its own bundle.
 */
import Game from "@/app/s6/games/riot/Client";

export const metadata = {
  title: { absolute: "Riot | Launch Wars Arcade" },
};

export default function ArcadeRiotPage() {
  return <Game />;
}
