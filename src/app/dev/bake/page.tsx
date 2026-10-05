/**
 * DEV-ONLY route shell for the bake rig. The rig itself is a client component
 * full of three.js and WebGL; this wrapper keeps it off the server render and
 * out of production entirely (notFound before the client bundle is even
 * referenced). Reached by URL only — nothing links here.
 */
import { notFound } from "next/navigation";
import dynamicImport from "next/dynamic";

export const dynamic = "force-dynamic";

const BakeClient = dynamicImport(() => import("./BakeClient"), { ssr: false });

export default function BakePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BakeClient />;
}
