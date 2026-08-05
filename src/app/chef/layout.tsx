/**
 * The /chef tree layout (ADR-0101): ONE WalletProviders for the whole tree,
 * the S5 root-layout pattern, so the wallet connects once and survives
 * client-side nav. The M4 LP flows depend on this being here; the demo pages
 * simply pass through it unchanged.
 */

import { WalletProviders } from "@/app/wallet/providers";

export default function ChefLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WalletProviders>{children}</WalletProviders>;
}
