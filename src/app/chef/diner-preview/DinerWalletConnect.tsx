'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useConnect } from 'wagmi';
import { useLegacyBrowserWalletConnector } from '@/app/wallet/providers';
import { GAME_ADDRESS, isMobileWalletBrowser, METAMASK_GAME_LINK, WALLET_HELP_PATH } from './wallet-browser';
import css from './wallet-entry.module.css';

function WalletIcon({ name, icon }: { name: string; icon?: string }) {
  const asset = /brave/i.test(name) ? 'brave' : /metamask/i.test(name) ? 'metamask' : /rabby/i.test(name) ? 'rabby' : null;
  const src = asset ? `/wallet-icons/${asset}.svg` : icon;
  // Provider icons are images, never injected markup.
  return src ? <img className={css.walletIcon} src={src} alt="" width={28} height={28}/>
    : <svg className={css.walletIcon} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8V5l14-3v3M21 11h-6v5h6"/><circle cx="17" cy="13.5" r=".6"/></svg>;
}

function connectionError(error: Error) {
  const code = (error as Error & { code?: number; cause?: { code?: number } }).cause?.code ?? (error as Error & { code?: number }).code;
  if (code === 4001 || /reject|denied/i.test(error.message)) return 'Connection declined. Nothing was changed. Tap your wallet to try again.';
  if (code === -32002) return 'Your wallet already has a connection request. Open its wallet panel to approve or dismiss it, then retry.';
  return 'Your wallet could not connect. Unlock it and try again. Connection help below has other ways to open the game.';
}

/** Own the installed-wallet action: RainbowKit's phone chooser excludes some
 * EIP-6963 wallets and can swallow errors before an account request is sent. */
export function DinerWalletConnect() {
  const { isConnected } = useAccount();
  const { connectors, connectAsync, isPending, error } = useConnect();
  const legacyConnector = useLegacyBrowserWalletConnector();
  const [mobile, setMobile] = useState<boolean | null>(null);
  const [requestedWallet, setRequestedWallet] = useState<string | null>(null);
  const [slowRequest, setSlowRequest] = useState(false);
  const connecting = useRef(false);
  useEffect(() => setMobile(isMobileWalletBrowser(navigator)), []);
  useEffect(() => {
    setSlowRequest(false);
    if (!isPending) return;
    const timer = window.setTimeout(() => setSlowRequest(true), 12000);
    return () => window.clearTimeout(timer);
  }, [isPending]);

  const connect = async (connector: Parameters<typeof connectAsync>[0]['connector'], name: string) => {
    if (connecting.current || isPending) return;
    connecting.current = true;
    setRequestedWallet(name);
    try { await connectAsync({ connector }); }
    catch { /* useConnect exposes the error in this component, including retry. */ }
    finally { connecting.current = false; setRequestedWallet(null); }
  };
  // SSR and the first browser render must agree, even when an extension has
  // already injected a provider before React hydrates.
  if (mobile === null) return <div className={css.walletConnect}><p className={css.small} role="status">Looking for your wallet…</p></div>;
  const injectedWallets = connectors.filter(connector => connector.type === 'injected');
  const namedWallets = injectedWallets.filter(connector => connector.id !== 'injected');
  // A generic browser entry is the same provider as the named entry. Do not
  // offer two buttons for it, or send MetaMask requests to Brave's provider.
  const availableWallets = [...new Map((namedWallets.length ? namedWallets : injectedWallets).map(connector => [connector.name, connector])).values()];
  const hasInjectedWallet = availableWallets.length > 0 || Boolean(legacyConnector);
  const hasRemoteWallet = connectors.some(connector => connector.type !== 'injected');
  const pending = isPending || requestedWallet !== null;

  return <div className={css.walletConnect}>
    {isConnected ? <ConnectButton showBalance={false} chainStatus="none" accountStatus="address"/> : <>
      {availableWallets.map(connector => <button key={connector.uid} type="button" className={css.walletLink} disabled={pending}
        onClick={() => { void connect(connector, connector.name); }}>
        <WalletIcon name={connector.name} icon={connector.icon}/><span>Connect {connector.name}</span>
      </button>)}
      {availableWallets.length === 0 && legacyConnector && <button type="button" className={css.walletLink} disabled={pending}
        onClick={() => { void connect(legacyConnector, 'your browser wallet'); }}>
        <WalletIcon name="Browser Wallet"/><span>Connect wallet</span>
      </button>}
      {pending && <p className={css.small} role="status">Check {requestedWallet ?? 'your wallet'} for the connection request.</p>}
      {slowRequest && <p className={css.notice} role="status">No prompt yet? Open your browser&apos;s wallet panel and unlock it. Connection help below has other ways to open the game.</p>}
      {error && <p className={css.error} role="alert">{connectionError(error)}</p>}
    </>}
    {mobile && !isConnected && <>
      <a className={css.walletLink} href={METAMASK_GAME_LINK}><WalletIcon name="MetaMask"/><span>Open game in MetaMask</span></a>
      <p className={css.small}>Using the MetaMask app? This opens the game in its browser. Connect there, then tap <strong>Play beta</strong>.</p>
      <details className={css.walletHelp}>
        <summary>App opened, but the game didn&apos;t?</summary>
        <p>Open MetaMask&apos;s browser tab and enter <strong>domainkitchen.xyz</strong>. Other wallets with a built-in browser work the same way.</p>
        <p>Your beta diner saves in the browser you play in. Use that same browser when you return.</p>
      </details>
    </>}
    {!isConnected && hasRemoteWallet && <ConnectButton label="Other wallets" showBalance={false} chainStatus="none" accountStatus="address"/>}
    {mobile === false && !isConnected && !hasInjectedWallet && !hasRemoteWallet && <>
      <p className={css.small}>No wallet extension was found in this browser.</p>
      <a className={css.walletLink} href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">Get MetaMask</a>
      <p className={css.small}>Already have a wallet on your phone? Open <strong>{GAME_ADDRESS.replace('https://', '')}</strong> in its built-in browser.</p>
    </>}
    <Link className={css.helpLink} href={WALLET_HELP_PATH}>What is a wallet? · Connection help</Link>
  </div>;
}
