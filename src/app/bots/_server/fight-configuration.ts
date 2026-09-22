import "server-only";
import { cardSecret, fightSalt, refuse } from "./db";

/** Validate every signing dependency before a fight spends an attack or holds coins. */
export function requireFightConfiguration(mode: "spar" | "pve" | "pvp"): string {
  try {
    const salt = fightSalt();
    if (mode === "pvp") cardSecret();
    return salt;
  } catch (error) {
    console.error("[bots fight configuration]", error instanceof Error ? error.message : "Missing fight signing configuration");
    return refuse(503, "The arena is not ready on this site yet. Your robot, coins and daily fights are safe.");
  }
}
