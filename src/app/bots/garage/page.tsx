import { Suspense } from "react";
import { redirect } from "next/navigation";
import { workshopEnabled } from "@/lib/bots/rollout";
import GarageClient from "./GarageClient";

export const metadata = { title: "Garage | Model Kombat" };
export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (workshopEnabled()) {
    const bay = typeof searchParams.bay === "string" && /^[1-5]$/.test(searchParams.bay) ? searchParams.bay : null;
    redirect("/bots" + (bay ? "?bay=" + bay : ""));
  }
  return <Suspense fallback={null}><GarageClient /></Suspense>;
}
