"use client";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

// Do not import or initialise wallet connectors just to enter the workshop.
const ClassicBotsProviders=dynamic(()=>import("./ClassicBotsProviders"),{ssr:false});
export default function BotsRouteProviders({children}:{children:ReactNode}) {
  const pathname=usePathname();
  if(['/bots/workshop','/bots/start','/bots/leaderboard','/bots/pit'].includes(pathname.replace(/\/$/,"")))return <>{children}</>;
  return <ClassicBotsProviders>{children}</ClassicBotsProviders>;
}
