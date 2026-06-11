/**
 * Scoped layout for /wallet/* routes. Loads the wagmi/RainbowKit providers
 * only on these routes — the rest of the site doesn't pay the bundle cost.
 */

import { WalletProviders } from "./providers";

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
