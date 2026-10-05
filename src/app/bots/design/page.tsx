import { notFound } from "next/navigation";
import { DesignClient } from "./DesignClient";

export default function DesignReviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignClient />;
}
