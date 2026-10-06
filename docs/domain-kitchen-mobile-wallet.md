# Domain Kitchen beta: mobile wallet entry

The beta requires a connected wallet and keeps its save in that browser. It does not request a signature, send a transaction, or establish a verified server account.

**Choose wallet** opens the full RainbowKit chooser used by Launch Wars. Domain Kitchen's expanded profile includes MetaMask, Coinbase Wallet, Rabby, Brave Wallet and Phantom's Ethereum wallet, alongside automatically discovered installed wallets. Brave is shown when its browser wallet is available. Uninstalled extension wallets offer installation guidance instead of a dead direct-connect button.

The `/chef` provider uses the `expanded` profile; Launch Wars and other surfaces keep their existing default profile. External mobile MetaMask uses RainbowKit's SDK connection path, while an installed MetaMask browser uses direct injection. EIP-6963 discovery and late legacy injection remain supported.

A valid, nonzero, 32-hex-character `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` enables Trust Wallet, OKX Wallet, Rainbow and generic WalletConnect pairing. Configure the project's own ID at build time and allow the deployed origins in its project settings. The local checkout did not contain this setting at the September 28 review; QR pairing was not verified. Never use a placeholder or someone else's ID. Wallet-browser play does not require one.

Actually installed wallets also have direct game-owned shortcuts. These call wagmi `connectAsync` without RainbowKit's pre-connection chain lookup. Brave exposes `isMetaMask` for compatibility: detect `isBraveWallet` first and offer **Connect Brave Wallet**, never a MetaMask connector for that provider. The external **Open game in MetaMask** link remains in the mobile troubleshooting disclosure, even when Brave has injected its own wallet. It opens a separate wallet browser; it does not pair MetaMask with the Brave tab. Connection rejection is visible, repeated taps cannot start duplicate requests, and a delayed prompt gets recovery guidance after 12 seconds. Direct-button icons are local SVGs from the installed RainbowKit package.

Wallet education and recovery now live at `/chef/wallet-help`; RainbowKit's help link points there too. The page explains that browser changes do not transfer beta saves and all beta data resets at launch. No SQL migration is needed for this connection-only flow.

## Verification

Run `node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-diner-mobile-wallet-check.mts` and the existing `scripts/dk-diner-beta-access-check.mts` through the same runner. The mobile tests exercise real RainbowKit/wagmi logic with controlled EIP-1193 providers; they do not contact a wallet or request signing.

Also run `scripts/dk-diner-mobile-wallet-brave-check.mts` with the same runner. It covers the rendered gate, a plain Brave provider with both compatibility flags, mobile EIP-6963 discovery, approval before chain queries, rejection/retry, duplicate taps, delayed feedback, the shipped MetaMask icon, the expanded catalogue without dead direct buttons, and Phantom's provider selection alongside MetaMask. The two wallet suites passed 19 groups on September 28, without network calls, signatures or transactions. They cannot verify a physical phone's app handoff.

Before considering device behavior verified, check on a physical iPhone and Android: Choose wallet → select MetaMask or Coinbase → approve → return → Play beta; also test the built-in wallet-browser fallback, declined connections, retry and reload with the same save. With a configured WalletConnect project, verify its QR and mobile-app paths too. Desktop review and automated providers cannot prove an operating system's app handoff.

September 28 release check: the nine beta-access/save-isolation groups also passed (28 groups total). Browser review confirmed the full chooser and its working local help page. Full TypeScript checking and the isolated Next.js production build passed. Build log: `D:/Temp/dk-wallet-release-check-20260928.log`; chooser capture: `D:/Temp/domain-kitchen-wallet-chooser-20260928.png`. The D: dependency copy needed missing files restored from the intact source installation. Existing optional `pino-pretty` and Browserslist warnings remain. No real wallet was connected during browser review; automatic approval review blocked that action because it could request account access.

Git pushes update the repository only. Production waits for the owner's own `vercel --prod`.
