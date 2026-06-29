/**
 * Scopes wagmi + RainbowKit to the /stars/games tree (games need a wallet session).
 */
import { WalletProviders } from "@/app/wallet/providers";

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
