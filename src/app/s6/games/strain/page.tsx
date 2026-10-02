/**
 * SEASON 6 · UPRISING - STRAIN route (key "strain"). English chrome for now;
 * the localized pack wires through Client's strings prop when the S6 strings
 * rewrite lands (day-4), exactly like the S5 pages do.
 *
 * Rules, scoring and the rate-envelope math are documented in ./sim; the
 * replay baseline lives in ./tape.ts.
 */
import Client from "./Client";

export const metadata = {
  title: "Strain | Launch Wars S6: Uprising",
  description:
    "You are the virus. Eat robots your size, outgrow the hunters, break the tier-locked doors through five walled chambers, then eat the Warden. The network underneath has no floor.",
};

export default function StrainPage() {
  return <Client />;
}
