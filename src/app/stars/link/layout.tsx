/**
 * Scopes the wagmi + RainbowKit context to /stars/link only (same proven provider
 * as /stars/join; the /stars landing + map stay light).
 */
import { WalletProviders } from "@/app/wallet/providers";

export default function LinkLayout({ children }: { children: React.ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
