/**
 * Shared wallet providers. Surfaces can opt into wallet-browser connections
 * without starting an app-to-app MetaMask SDK session. WalletConnect is only
 * offered when a non-placeholder project ID is configured.
 */

"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme, connectorsForWallets, type Wallet, type WalletList } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  rainbowWallet,
  coinbaseWallet,
  walletConnectWallet,
  injectedWallet,
  rabbyWallet,
  braveWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, createConfig, createConnector, http, type CreateConnectorFn } from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet } from "wagmi/chains";
import { defineChain, type EIP1193Provider } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useState } from "react";

const configuredProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const wcProjectId = configuredProjectId && /^[a-f\d]{32}$/i.test(configuredProjectId) && !/^0+$/.test(configuredProjectId)
  ? configuredProjectId
  : undefined;

type ConnectionMode = "default" | "wallet-browser";
type CreateWallet = WalletList[number]["wallets"][number];
type BrowserProvider = EIP1193Provider & {
  providers?: BrowserProvider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isPhantom?: boolean;
  isBraveWallet?: boolean;
};

function browserProviders(): BrowserProvider[] {
  const provider = typeof window === "undefined" ? undefined
    : (window as Window & { ethereum?: BrowserProvider }).ethereum;
  if (!provider) return [];
  const candidates: BrowserProvider[] = Array.isArray(provider.providers) && provider.providers.length ? provider.providers : [provider];
  return candidates.filter(wallet => typeof wallet?.request === "function");
}

/** Detect older wallet browsers that inject after the initial configuration.
 * The factory is passed to wagmi's public connect API only after a user click;
 * it does not add an unavailable entry to RainbowKit or replace the config.
 */
export function useLegacyBrowserWalletConnector() {
  const [connector, setConnector] = useState<CreateConnectorFn | null>(null);
  useEffect(() => {
    const detect = () => {
      setConnector((current: CreateConnectorFn | null) => browserProviders().length === 0 ? null : current ?? injected({
        target: () => {
          const provider: EIP1193Provider | undefined = browserProviders()[0];
          return provider ? { id: "injected", name: "Browser Wallet", provider } : undefined;
        },
      }));
    };
    detect();
    window.addEventListener("ethereum#initialized", detect);
    window.addEventListener("focus", detect);
    const delayedDetection = window.setTimeout(detect, 1000);
    return () => {
      window.removeEventListener("ethereum#initialized", detect);
      window.removeEventListener("focus", detect);
      window.clearTimeout(delayedDetection);
    };
  }, []);
  return connector;
}

const browserMetaMaskWallet = (): Wallet => {
  const provider = browserProviders().find(wallet => wallet.isMetaMask && !wallet.isBraveWallet && !wallet.isRabby && !wallet.isCoinbaseWallet && !wallet.isPhantom);
  return {
    ...injectedWallet(),
    id: "metaMask",
    name: "MetaMask",
    iconUrl: "/wallet-icons/metamask.svg",
    rdns: "io.metamask",
    iconBackground: "#f6851a",
    installed: Boolean(provider),
    hidden: () => !provider,
    createConnector: walletDetails => createConnector(config => ({
      ...injected({ target: "metaMask" })(config),
      ...walletDetails,
    })),
  };
};

const installedRabbyWallet = (): Wallet => {
  const wallet = rabbyWallet();
  return { ...wallet, hidden: () => !wallet.installed };
};

const installedBraveWallet = (): Wallet => {
  const wallet = braveWallet();
  return { ...wallet, hidden: () => !wallet.installed };
};

const installedBrowserWallet = (): Wallet => ({
  ...injectedWallet(),
  // RainbowKit's injectedWallet has no built-in hidden predicate. EIP-6963
  // wallets are discovered separately by wagmi, including late announcements.
  hidden: () => browserProviders().length === 0,
});

// Match RainbowKit's mobile detection to preserve its existing SDK handoff
// on other surfaces. Desktop without a project ID uses an injected connector.
function isMobileBrowser() {
  return typeof navigator !== "undefined" && (
    /android|iPhone|iPod|iPad/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

const defaultMetaMaskWallet: CreateWallet = options =>
  wcProjectId || isMobileBrowser() ? metaMaskWallet(options) : browserMetaMaskWallet();

const connectorsForApp = (appName: string, connectionMode: ConnectionMode) => connectorsForWallets(
  [
    {
      groupName: "Wallets",
      wallets: [
        ...(connectionMode === "wallet-browser"
          ? [browserMetaMaskWallet, installedBraveWallet, installedRabbyWallet, installedBrowserWallet]
          : [installedBrowserWallet, defaultMetaMaskWallet, rabbyWallet, coinbaseWallet]),
        ...(wcProjectId ? [rainbowWallet, walletConnectWallet] : []),
      ],
    },
  ],
  {
    appName,
    // Injected wallets do not consume this value. Never create a remote
    // WalletConnect connector with a made-up project ID.
    projectId: wcProjectId ?? "",
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

const createWalletConfig = (appName: string, connectionMode: ConnectionMode) => createConfig({
  chains:     [mainnet, doma],
  connectors: connectorsForApp(appName, connectionMode),
  transports: { [mainnet.id]: http(), [doma.id]: http("https://rpc.doma.xyz") },
  ssr:        true,
  multiInjectedProviderDiscovery: true,
});
const defaultAppName = "Doma Reporter — wallet linking";
const walletConfigs = new Map<string, ReturnType<typeof createWalletConfig>>();

function walletConfigFor(appName: string, connectionMode: ConnectionMode) {
  const key = JSON.stringify([appName, connectionMode]);
  let config = walletConfigs.get(key);
  if (!config) {
    config = createWalletConfig(appName, connectionMode);
    walletConfigs.set(key, config);
  }
  return config;
}

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
  appName = defaultAppName,
  connectionMode = "default",
  learnMoreUrl,
}: {
  children: ReactNode;
  accent?: string;
  accentForeground?: string;
  appName?: string;
  connectionMode?: ConnectionMode;
  learnMoreUrl?: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [walletConfig] = useState(() => walletConfigFor(appName, connectionMode));

  return (
    <WagmiProvider config={walletConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider appInfo={{ appName, ...(learnMoreUrl ? { learnMoreUrl } : {}) }} theme={darkTheme({
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
