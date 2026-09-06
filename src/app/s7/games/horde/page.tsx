/**
 * SEASON 7 · REALMFALL - HORDE route (key "horde"). English chrome for now;
 * the localized pack wires through the shell's strings prop exactly like the
 * S6 pages do.
 *
 * Rules, scoring and the rate-envelope math are documented in ./sim; the
 * authored chunks + wave books in ./content; the replay baseline in ./tape.
 * Free play stays at /dev/s7h on ./Client (untouched by this route).
 */
import HordeShell from "./shell";

export const metadata = {
  title: "Hordebreaker | Launch Wars S7: Realmfall",
  description:
    "A top-down crawl against the undead legion. Walk with your pointer, swing on hold, spend mana on your class skill, and clear room after room. Death is the only end, and depth is the score.",
};

export default function HordePage() {
  return <HordeShell />;
}
