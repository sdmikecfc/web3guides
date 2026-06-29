/**
 * Scopes the wagmi + RainbowKit context to /stars/join only (reuses the proven
 * wallet provider config; ~80KB gzipped on this route, zero elsewhere — the
 * /stars landing stays light).
 */
import { WalletProviders } from "@/app/wallet/providers";

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
