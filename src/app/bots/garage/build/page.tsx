/**
 * /bots/garage/build?bay=1..5: the Build screen (screens doc 2). The client
 * reads the bay number from the query, so it sits under a Suspense boundary
 * (Next 14 requires one around useSearchParams for the static shell).
 */
import { Suspense } from "react";
import BuildClient from "./BuildClient";

export const metadata = {
  title: "Build | Clanker Cup",
};

export default function BuildPage() {
  return (
    <Suspense fallback={null}>
      <BuildClient />
    </Suspense>
  );
}
