/**
 * /bots/garage: the Garage screen (screens doc 3). The client owns two
 * canvases and reads the clock, so it is a client component under a
 * Suspense boundary (the Build route's shape, ./build/page.tsx).
 */
import { Suspense } from "react";
import GarageClient from "./GarageClient";

export const metadata = {
  title: "Garage | Clanker Cup",
};

export default function GaragePage() {
  return (
    <Suspense fallback={null}>
      <GarageClient />
    </Suspense>
  );
}
