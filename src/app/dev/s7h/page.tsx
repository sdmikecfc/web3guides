/**
 * DEV-ONLY free-play page for the S7 HORDE client. The season shell wires
 * the real surface later; this page exists so the renderer can be exercised
 * against any loadout/seed without a session. Same guard idiom as /dev/s7g:
 * notFound before the client bundle is even referenced in production, reached
 * by URL only, nothing links here.
 */
import { notFound } from "next/navigation";
import dynamicImport from "next/dynamic";

export const dynamic = "force-dynamic";

const DevClient = dynamicImport(() => import("./DevClient"), { ssr: false });

export default function HordeDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevClient />;
}
