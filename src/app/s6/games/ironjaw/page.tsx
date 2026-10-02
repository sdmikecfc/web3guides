/**
 * SEASON 6 · UPRISING - IRON JAW route (key "ironjaw"). English chrome for
 * now; the localized pack wires through Client's strings prop when the S6
 * strings rewrite lands (day-4), exactly like the S5 pages do.
 *
 * Rules, scoring and the rate-envelope math are documented in ./sim; the
 * replay baseline lives in ./tape.ts.
 */
import Client from "./Client";

export const metadata = {
  title: "Iron Jaw | Launch Wars S6: Uprising",
  description:
    "Behind-the-shoulder mech boxing against the Warden's champions. Read the tell, dodge, punish. Three bouts take the belt, then the title defenses never stop.",
};

export default function IronjawPage() {
  return <Client />;
}
