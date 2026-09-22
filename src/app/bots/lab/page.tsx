import { notFound } from "next/navigation";
import LabClient from "./LabClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Combat Lab | Model Kombat", robots: { index: false, follow: false } };
export default function CombatLabPage() {
  const enabled = process.env.BOTS_COMBAT_LAB === "1" || process.env.BOTS_COMBAT_LAB !== "0" && (process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview");
  if (!enabled) notFound();
  return <LabClient />;
}
