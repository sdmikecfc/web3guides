/**
 * Wallet-link providers — wraps the /wallet/* route tree with the wagmi +
 * RainbowKit + react-query context needed for wallet connection and signing.
 *
 * Loaded only on /wallet/* routes (scoped via the layout below). Adds ~80KB
 * gzipped to those pages but zero impact elsewhere on the site.
 *
 * NOTE on WalletConnect: we build the config manually (instead of using
 * RainbowKit's getDefaultConfig helper) because that helper requires a real
 * WalletConnect projectId at module-init time and throws if it gets a
 * placeholder. Building our own config lets us conditionally include
 * WalletConnect only when a real NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
 * Without one, users still get injected wallets (MetaMask, Rabby, Coinbase)
 * which covers desktop perfectly. Mobile-via-QR needs the projectId.
 */

"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme, connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  rainbowWallet,
  coinbaseWallet,
  walletConnectWallet,
  injectedWallet,
  rabbyWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// Build wallet list. Always include injected/Coinbase/Rabby/MetaMask.
// Only add WalletConnect-dependent wallets (Rainbow, WC modal) when we
// actually have a projectId — otherwise WalletConnect's SDK throws on init.
const baseWallets = [injectedWallet, metaMaskWallet, rabbyWallet, coinbaseWallet];
const wcWallets = wcProjectId ? [rainbowWallet, walletConnectWallet] : [];

const connectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      wallets: [...baseWallets, ...wcWallets],
    },
  ],
  {
    appName: "Doma Reporter — wallet linking",
    projectId: wcProjectId || "00000000000000000000000000000000",
  }
);

const wagmiConfig = createConfig({
  chains:     [mainnet],
  connectors,
  transports: { [mainnet.id]: http() },
  ssr:        true,
});

export function WalletProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor:           "#7c6aff",
          accentColorForeground: "#f8fafc",
          borderRadius:          "medium",
        })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
