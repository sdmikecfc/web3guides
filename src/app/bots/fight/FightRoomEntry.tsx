import GameShell from "../_game/GameShell";
import FightClient, { ServerFight, type FightClientProps } from "./FightClient";

/** The original route parses its own stored version and identity before entering the room. */
export function LocalFightRoom(props: FightClientProps) {
  return process.env.BOTS_SEASON_V1 === "1" ? <GameShell initialFight={props} /> : <FightClient {...props} />;
}
export function SavedFightRoom({ id }: { id: string }) {
  return process.env.BOTS_SEASON_V1 === "1" ? <GameShell initialReplay={id} /> : <ServerFight id={id} />;
}
