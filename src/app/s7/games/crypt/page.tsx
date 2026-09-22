/**
 * SEASON 7 · REALMFALL - THE CRYPT route (key "crypt"). English chrome for
 * now; the localized pack wires through the shell's strings prop when the S7
 * strings pass lands, exactly like the S6 pages do.
 *
 * Rules, scoring and the rate-envelope math are documented in ./sim; the
 * free-play dev client stays at /dev/s7c (./Client.tsx, untouched).
 */
import CryptShell from "./shell";

export const metadata = {
  title: "The Crypt | Launch Wars S7: Realmfall",
  description:
    "A grid-stepped dungeon crawl through the undead legion. Turn, step, swing on a visible d20, sidestep the wind-up, and descend. Death is the only exit.",
};

export default function CryptPage() {
  return <CryptShell />;
}
