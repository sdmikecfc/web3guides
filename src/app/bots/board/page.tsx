import { redirect } from "next/navigation";
import { workshopEnabled } from "@/lib/bots/rollout";
import LegacyBoard from "./LegacyBoard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Leaders | Model Kombat" };
export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (workshopEnabled()) {
    const bay = typeof searchParams.bay === "string" && /^[1-5]$/.test(searchParams.bay) ? searchParams.bay : null;
    redirect("/bots?panel=campaign" + (bay ? "&bay=" + bay : ""));
  }
  return <LegacyBoard />;
}
