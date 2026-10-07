/**
 * LAUNCH WARS ARCADE route for "armorclash" (S5). Mounts the season's EXISTING
 * game component unchanged: under /arcade its shell banks through
 * /api/arcade/* onto the arcade board (see src/lib/arcade/mode.ts). A static
 * route per game, so each game stays its own bundle.
 */
import Game from "@/app/s5/games/armorclash/Client";

export const metadata = {
  title: { absolute: "Armor Clash | Launch Wars Arcade" },
};

export default function ArcadeArmorclashPage() {
  return <Game />;
}
