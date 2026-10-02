/**
 * SEASON 6 · UPRISING - STOPCLOCK route (key "stopclock"). English chrome
 * for now; the localized pack wires through Client's strings prop when the
 * S6 strings rewrite lands (day-4), exactly like the S5 pages do.
 *
 * Rules, scoring and the rate-envelope math are documented in ./sim; the
 * replay baseline lives in ./tape.ts.
 */
import Client from "./Client";

export const metadata = {
  title: "Stopclock | Launch Wars S6: Uprising",
  description:
    "Time moves only when you move. Unlimited fire priced in time, double damage rockets, and machine rooms that never end, only get faster.",
};

export default function StopclockPage() {
  return <Client />;
}
