import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReviewClient from "./ReviewClient";

export const metadata: Metadata = {
  title: "Domain Kitchen · Art inspection",
  robots: { index: false, follow: false },
};

export default function ArtReviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ReviewClient />;
}
