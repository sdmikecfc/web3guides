'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useConnect } from 'wagmi';
import { useLegacyBrowserWalletConnector } from '@/app/wallet/providers';
import { GAME_ADDRESS, isMobileWalletBrowser, METAMASK_GAME_LINK, WALLET_HELP_PATH } from './wallet-browser';
import css from './wallet-entry.module.css';

/** Phone browsers need a wallet browser or a configured remote connector. */
export function DinerWalletConnect() {
  const { isConnected } = useAccount();
  const { connectors, connectAsync, isPending, error } = useConnect();
  const legacyConnector = useLegacyBrowserWalletConnector();
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => setMobile(isMobileWalletBrowser(navigator)), []);
  // SSR and the first browser render must agree, even when an extension has
  // already injected a provider before React hydrates.
  if (mobile === null) return <div className={css.walletConnect}><p className={css.small} role="status">Looking for your wallet…</p></div>;
  const hasConfiguredInjectedWallet = connectors.some(connector => connector.type === 'injected');
  const hasInjectedWallet = hasConfiguredInjectedWallet || Boolean(legacyConnector);
  const needsWalletBrowser = mobile === true && !hasInjectedWallet && !isConnected;

  return <div className={css.walletConnect}>
    {needsWalletBrowser && <>
      <a className={css.walletLink} href={METAMASK_GAME_LINK}>Open game in MetaMask</a>
      <p className={css.small}>Then tap <strong>Connect wallet</strong> inside MetaMask and approve the connection. Keep playing there.</p>
      <details className={css.walletHelp}>
        <summary>App opened, but the game didn&apos;t?</summary>
        <p>Open MetaMask&apos;s browser tab and enter <strong>domainkitchen.xyz</strong>. Other wallets with a built-in browser work the same way.</p>
        <p>Your beta diner saves in the browser you play in. Use that same browser when you return.</p>
      </details>
    </>}
    {!isConnected && !hasConfiguredInjectedWallet && legacyConnector
      ? <button className={css.walletLink} disabled={isPending} onClick={() => { void connectAsync({ connector: legacyConnector }).catch(() => {}); }}>{isPending ? 'Check your wallet…' : 'Connect wallet'}</button>
      : (isConnected || connectors.length > 0) && <ConnectButton label={needsWalletBrowser ? 'Other wallets' : 'Connect wallet'} showBalance={false} chainStatus="none" accountStatus="address" />}
    {error && <p className={css.error} role="alert">The wallet didn&apos;t connect. Unlock it and try again. If you declined the request, you can safely retry.</p>}
    {mobile === false && !isConnected && !hasInjectedWallet && connectors.length === 0 && <>
      <p className={css.small}>No wallet extension was found in this browser.</p>
      <a className={css.walletLink} href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">Get MetaMask</a>
      <p className={css.small}>Already have a wallet on your phone? Open <strong>{GAME_ADDRESS.replace('https://', '')}</strong> in its built-in browser.</p>
    </>}
    <Link className={css.helpLink} href={WALLET_HELP_PATH}>What is a wallet? · Connection help</Link>
  </div>;
}
