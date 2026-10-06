"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, connectorsForWallets, darkTheme, type Wallet, type WalletList } from "@rainbow-me/rainbowkit";
import { braveWallet, coinbaseWallet, injectedWallet, metaMaskWallet, okxWallet, phantomWallet, rabbyWallet, rainbowWallet, trustWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { defineChain, type EIP1193Provider } from "viem";
import { WagmiProvider, createConfig, createConnector, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

type BrowserProvider = EIP1193Provider & { providers?: BrowserProvider[]; isMetaMask?: true } & Record<string, unknown>;
type CreateWallet = WalletList[number]["wallets"][number];

export function validWalletConnectProjectId(value: string | undefined) {
  const id = value?.trim();
  return id && /^[a-f\d]{32}$/i.test(id) && !/^0+$/.test(id) ? id : undefined;
}

function browserProviders(): BrowserProvider[] {
  const ethereum = typeof window === "undefined" ? undefined
    : (window as Window & { ethereum?: BrowserProvider }).ethereum;
  if (!ethereum) return [];
  const providers: BrowserProvider[] = Array.isArray(ethereum.providers) && ethereum.providers.length ? ethereum.providers : [ethereum];
  return providers.filter(provider => typeof provider?.request === "function");
}

// Legacy providers often also claim isMetaMask. EIP-6963 wallets are discovered
// separately by wagmi, so these flags only select the older injected path.
const otherWalletFlags = [
  "isBraveWallet", "isCoinbaseWallet", "isPhantom", "isRabby", "isRainbow",
  "isOkxWallet", "isOKExWallet", "isTrust", "isTrustWallet", "isBackpack",
  "isApexWallet", "isAvalanche", "isBifrost", "isBitKeep", "isBitski",
  "isBinance", "isBlockWallet", "isDawn", "isEnkrypt", "isExodus", "isFrame",
  "isFrontier", "isGamestop", "isHyperPay", "isImToken", "isKuCoinWallet",
  "isMathWallet", "isNestWallet", "isOneInchIOSWallet", "isOneInchAndroidWallet",
  "isOpera", "isZilPay", "isPortal", "isxPortal", "isStatus", "isTalisman",
  "isTally", "isTokenPocket", "isTokenary", "isCTRL", "isZeal", "isCoin98",
  "isMEWwallet", "isSafeheron", "isSafePal", "isWigwam", "isZerion",
  "isUniswapWallet", "__seif",
];
const metaMaskProvider = () => browserProviders().find(provider =>
  provider.isMetaMask && !otherWalletFlags.some(flag => provider[flag]));

function isMobileBrowser() {
  return typeof navigator !== "undefined" && (
    /android|iPhone|iPod|iPad/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

const modelKombatMetaMaskWallet: CreateWallet = options => {
  const installed = Boolean(metaMaskProvider());
  // RainbowKit's desktop MetaMask factory constructs WalletConnect immediately.
  // Without a project ID, show its extension install flow instead of broken QR.
  // The official mobile factory uses MetaMask's SDK and does not require WC.
  if (!installed && (validWalletConnectProjectId(options.projectId) || isMobileBrowser())) {
    return metaMaskWallet(options);
  }
  return {
    id: "metaMask",
    name: "MetaMask",
    rdns: "io.metamask",
    iconUrl: "/wallet-icons/metamask.svg",
    iconBackground: "#fff",
    iconAccent: "#f6851a",
    installed,
    downloadUrls: { browserExtension: "https://metamask.io/download/" },
    extension: {
      instructions: {
        learnMoreUrl: "https://metamask.io/faqs/",
        steps: [
          { step: "install", title: "wallet_connectors.metamask.extension.step1.title", description: "wallet_connectors.metamask.extension.step1.description" },
          { step: "create", title: "wallet_connectors.metamask.extension.step2.title", description: "wallet_connectors.metamask.extension.step2.description" },
          { step: "refresh", title: "wallet_connectors.metamask.extension.step3.title", description: "wallet_connectors.metamask.extension.step3.description" },
        ],
      },
    },
    createConnector: walletDetails => createConnector(config => ({
      ...injected({ target: () => {
        const provider = metaMaskProvider();
        return provider ? { id: "metaMask", name: "MetaMask", provider } : undefined;
      } })(config),
      ...walletDetails,
    })),
  };
};

const installedBrowserWallet = (): Wallet => ({
  ...injectedWallet(),
  hidden: () => browserProviders().length === 0,
});

const modelKombatBraveWallet = (): Wallet => ({
  ...braveWallet(),
  // Brave ships its wallet in the browser. Give non-Brave users a working
  // browser download choice; the upstream wallet has no download URLs.
  downloadUrls: { browserExtension: "https://brave.com/download/", desktop: "https://brave.com/download/", mobile: "https://brave.com/download/" },
});

/** Shared by the workshop and classic MK routes, independent of other games. */
export function modelKombatWalletList(projectId?: string): WalletList {
  return [{
    groupName: "Wallets",
    wallets: [installedBrowserWallet, modelKombatMetaMaskWallet, rabbyWallet, coinbaseWallet, modelKombatBraveWallet, phantomWallet,
      ...(validWalletConnectProjectId(projectId) ? [rainbowWallet, walletConnectWallet, trustWallet, okxWallet] : [])],
  }];
}

const doma = defineChain({
  id: 97477,
  name: "Doma",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.doma.xyz"] } },
  blockExplorers: { default: { name: "Doma Explorer", url: "https://explorer.doma.xyz" } },
});
const projectId = validWalletConnectProjectId(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);

const createWalletConfig = (appName: string) => createConfig({
  chains: [mainnet, doma],
  connectors: connectorsForWallets(modelKombatWalletList(projectId), { appName, projectId: projectId ?? "" }),
  transports: { [mainnet.id]: http(), [doma.id]: http("https://rpc.doma.xyz") },
  ssr: true,
  multiInjectedProviderDiscovery: true,
});
const walletConfigs = new Map<string, ReturnType<typeof createWalletConfig>>();
function walletConfigFor(appName: string) {
  let config = walletConfigs.get(appName);
  if (!config) {
    config = createWalletConfig(appName);
    walletConfigs.set(appName, config);
  }
  return config;
}

export function WalletProviders({ children, appName = "Model Kombat", accent = "#7c6aff", accentForeground = "#f8fafc" }: {
  children: ReactNode;
  appName?: string;
  accent?: string;
  accentForeground?: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [walletConfig] = useState(() => walletConfigFor(appName));
  return <WagmiProvider config={walletConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider modalSize="compact" appInfo={{ appName }} theme={darkTheme({ accentColor: accent, accentColorForeground: accentForeground, borderRadius: "medium" })}>
        {children}
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>;
}
