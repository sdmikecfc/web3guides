import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DinerClient from "./DinerClient";

export const metadata: Metadata = {
  title: "Domain Kitchen · The diner preview",
  description: "Your little diner. A whole road of possibilities.",
  robots: { index: false, follow: false },
};

export default function DinerPreviewPage() {
  if (process.env.NODE_ENV !== "development" && process.env.DINER_PREVIEW_ENABLED !== "true") notFound();
  return <DinerClient />;
}
