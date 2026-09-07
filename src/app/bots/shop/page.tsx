import { Suspense } from "react";
import { redirect } from "next/navigation";
import { workshopEnabled } from "@/lib/bots/rollout";
import ShopClient from "./ShopClient";

export const metadata = { title: "Parts | Clanker Cup" };
export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (workshopEnabled()) {
    const bay = typeof searchParams.bay === "string" && /^[1-5]$/.test(searchParams.bay) ? searchParams.bay : null;
    redirect("/bots?view=parts" + (bay ? "&bay=" + bay : ""));
  }
  return <Suspense fallback={null}><ShopClient /></Suspense>;
}
