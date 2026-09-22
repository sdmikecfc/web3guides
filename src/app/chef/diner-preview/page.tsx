import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BetaEntry from "./BetaEntry";

export const metadata: Metadata = {
  title: "Domain Kitchen · Open beta",
  description: "Your little diner. A whole road of possibilities.",
  robots: { index: false, follow: false },
};

export default function DinerPreviewPage() {
  if (process.env.NODE_ENV !== "development" && process.env.DINER_PREVIEW_ENABLED === "false") notFound();
  return <BetaEntry />;
}
