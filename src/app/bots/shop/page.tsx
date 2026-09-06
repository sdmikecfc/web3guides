/**
 * /bots/shop: the Junkyard, and today's shipment (screens doc 3.3,
 * economy doc section 3, ADR-0141). The client reads `?slot=` (the Build
 * tray's "Buy more parts" keeps its filter), so it sits under a Suspense
 * boundary (Next 14 requires one around useSearchParams for the static
 * shell; the Build route's shape).
 */
import { Suspense } from "react";
import ShopClient from "./ShopClient";

export const metadata = {
  title: "Parts | Clanker Cup",
};

export default function ShopPage() {
  return (
    <Suspense fallback={null}>
      <ShopClient />
    </Suspense>
  );
}
