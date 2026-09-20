import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicDinerView from "../../PublicDinerView";
export const metadata: Metadata = { title: "A little diner · Domain Kitchen preview", description: "Visit a neighbour's personal diner.", robots: { index: false, follow: false } };
export default async function PublicDinerPage({ params }: { params: Promise<{ handle: string }> }) {
  if (process.env.NODE_ENV !== "development" && process.env.DINER_PREVIEW_ENABLED !== "true") notFound();
  const { handle } = await params; if (!/^diner-[a-f0-9]{16}$/.test(handle)) notFound();
  return <PublicDinerView handle={handle}/>;
}
