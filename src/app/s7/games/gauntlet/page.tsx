/**
 * SEASON 7 · REALMFALL - THE GAUNTLET route (key "gauntlet"). The scored
 * season surface: shell.tsx wires the sim through RunShell (sessions, nonce,
 * banking). Rules, scoring and the rate-envelope math are documented in
 * ./sim; the replay baseline lives in ./tape.ts; free play stays on /dev/s7g.
 */
import GauntletShell from "./shell";

export const metadata = {
  title: "The Gauntlet | Launch Wars S7: Realmfall",
  description:
    "An endless dungeon climb against the undead legion. Pick a door, fight the room with your cards, draft one more, go deeper. Death is the only exit.",
};

export default function GauntletPage() {
  return <GauntletShell />;
}
