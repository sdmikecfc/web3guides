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
import { defineChain } from "viem";
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

/**
 * Doma chain, added 2026-07-27 for the S5 in-app buy.
 *
 * Mainnet alone was correct while the only wallet action was the enlist
 * SIGNATURE (no transaction, and the SIWE message states Chain ID 1). The
 * bonding-curve buy is a real transaction on Doma, so the chain has to be in
 * the config or wagmi hands back an undefined public client and a write would
 * be aimed at the wrong network. Params match docs.doma.xyz and the
 * DOMA_CHAIN constant this repo already ships in lib/s5/funding.ts.
 *
 * Additive: mainnet stays first, so connection and the enlist flow are
 * untouched. Nothing switches chains unless the buy panel asks.
 */
const doma = defineChain({
  id: 97477,
  name: "Doma",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.doma.xyz"] } },
  blockExplorers: { default: { name: "Doma Explorer", url: "https://explorer.doma.xyz" } },
});

const wagmiConfig = createConfig({
  chains:     [mainnet, doma],
  connectors,
  transports: { [mainnet.id]: http(), [doma.id]: http("https://rpc.doma.xyz") },
  ssr:        true,
});

/**
 * `accent` lets one surface restyle the connect button without touching the
 * others. This provider is shared by /chef, /s4 and /s5, and each has its own
 * palette: the default violet is correct for the seasons, but it was the only
 * off-palette colour on the Domain Kitchen screen and it sat top-left, first
 * thing you see. Scoped override rather than a global change.
 */
export function WalletProviders({
  children,
  accent = "#7c6aff",
  accentForeground = "#f8fafc",
}: {
  children: ReactNode;
  accent?: string;
  accentForeground?: string;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor:           accent,
          accentColorForeground: accentForeground,
          borderRadius:          "medium",
        })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
