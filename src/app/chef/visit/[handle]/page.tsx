import type { Metadata } from "next";
import VisitClient from "./VisitClient";

export const metadata: Metadata = {
  title: "Visiting a kitchen | Domain Kitchen",
  robots: { index: false, follow: false },
};

export default function Page({ params }: { params: { handle: string } }) {
  return <VisitClient handle={params.handle} />;
}
