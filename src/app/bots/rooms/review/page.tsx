import { notFound } from "next/navigation";
import RoomReview from "./RoomReview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Room review | Model Kombat", robots: { index: false, follow: false } };
export default function RoomReviewPage() {
  const enabled = process.env.BOTS_ROOM_PREVIEW === "1" || process.env.BOTS_ROOM_PREVIEW !== "0" && (process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview");
  if (!enabled) notFound();
  return <RoomReview />;
}
