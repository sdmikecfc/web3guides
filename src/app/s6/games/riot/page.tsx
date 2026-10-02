/**
 * SEASON 6 · UPRISING - RIOT route (key "riot"). English chrome for now; the
 * localized pack wires through Client's strings prop exactly like the S5
 * pages do.
 *
 * Rules, scoring and the rate-envelope math are documented in ./sim; the
 * authored levels + equal-ceiling law in ./levels; the replay baseline lands
 * in ./tape.ts at the ship gate.
 */
import Client from "./Client";

export const metadata = {
  title: "Riot | Launch Wars S6: Uprising",
  description:
    "A belt-scrolling brawl through the Warden's machine army. Three stages, three bosses, weapons ripped from their hands, and an arena after the last boss that never ends, only gets faster.",
};

export default function RiotPage() {
  return <Client />;
}
