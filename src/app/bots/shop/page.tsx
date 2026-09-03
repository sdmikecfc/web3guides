/**
 * /bots/shop: today's shelf (screens doc 1 row 5, economy doc section 3).
 * The client reads `?slot=` (the Build tray's "Buy more parts" keeps its
 * filter), so it sits under a Suspense boundary (Next 14 requires one around
 * useSearchParams for the static shell; the Build route's shape).
 */
import { Suspense } from "react";
import ShopClient from "./ShopClient";

export const metadata = {
  title: "Shop | Battle Bots",
};

export default function ShopPage() {
  return (
    <Suspense fallback={null}>
      <ShopClient />
    </Suspense>
  );
}
