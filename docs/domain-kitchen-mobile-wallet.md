# Domain Kitchen beta: mobile wallet entry

The beta requires a connected wallet and keeps its save in that browser. It does not request a signature, send a transaction, or establish a verified server account.

On mobile Safari/Chrome without an injected wallet, **Open game in MetaMask** opens `https://domainkitchen.xyz` in the wallet browser using MetaMask's dapp deep link. The player taps **Connect wallet**, approves address access, and selects **Play beta** there. Other wallet browsers can open the same game address. If an operating system opens only the wallet home screen, the entry offers instructions for entering the address in its browser tab.

The `/chef` provider uses the `wallet-browser` profile. It does not start the older MetaMask SDK app-to-app pairing flow. It supports installed wallets, EIP-6963 discovery and late legacy injection. It offers WalletConnect choices only when a real, nonzero `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is configured. A project ID is not required for wallet-browser play.

Wallet education and recovery now live at `/chef/wallet-help`; RainbowKit's help link points there too. The page explains that browser changes do not transfer beta saves and all beta data resets at launch. No SQL migration is needed for this connection-only flow.

## Verification

Run `node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-diner-mobile-wallet-check.mts` and the existing `scripts/dk-diner-beta-access-check.mts` through the same runner. The mobile tests exercise real RainbowKit/wagmi logic with controlled EIP-1193 providers; they do not contact a wallet or request signing.

Before considering device behavior verified, check on a physical iPhone and Android: Safari/Chrome → open game in MetaMask → connect → Play beta → reload → same save; also test a declined connection and retry. Desktop browser review and automated provider tests cannot prove an operating system's app-link handoff.

Git pushes update the repository only. Production waits for the owner's own `vercel --prod`.
