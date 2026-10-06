"use client";
import type { ReactNode } from "react";
import { WalletProviders } from "../_game/ModelKombatWalletProviders";
import { BotsTopNav } from "./BotsTopNav";
import { M } from "../_ui/tokens";

/** Existing wallet game only. Never mounted by the wallet-free workshop. */
export default function ClassicBotsProviders({children}:{children:ReactNode}) {
  return <WalletProviders accent={M.accent} accentForeground="#ffffff"><BotsTopNav/>{children}</WalletProviders>;
}
