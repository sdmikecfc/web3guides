import { notFound } from "next/navigation";
import ReferenceCapture from "./ReferenceCapture";
export const dynamic = "force-dynamic";
export const metadata = { title: "Trailer reference | Model Kombat", robots: { index: false, follow: false } };
export default function Page() {
  if (process.env.NODE_ENV === "production" && process.env.BOTS_ROOM_PREVIEW !== "1") notFound();
  return <ReferenceCapture />;
}
