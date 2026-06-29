/**
 * Scopes wagmi + RainbowKit to the /stars/shop tree (the shop needs a wallet session,
 * same as the games — it reuses the sf_game_token).
 */
import { WalletProviders } from "@/app/wallet/providers";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
