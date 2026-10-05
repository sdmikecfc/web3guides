import { notFound } from "next/navigation";
import RoomReview from "./RoomReview";
import LoadingCheck from "./LoadingCheck";

export const dynamic = "force-dynamic";
export const metadata = { title: "Room review | Model Kombat", robots: { index: false, follow: false } };
export default function RoomReviewPage({ searchParams }: { searchParams: { loadingCheck?: string } }) {
  const enabled = process.env.BOTS_ROOM_PREVIEW === "1" || process.env.BOTS_ROOM_PREVIEW !== "0" && (process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview");
  if (!enabled) notFound();
  if (searchParams.loadingCheck === "1") { if (process.env.NODE_ENV !== "development") notFound(); return <LoadingCheck />; }
  return <RoomReview />;
}
