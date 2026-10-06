import type { Metadata } from 'next';
import Link from 'next/link';
import { GameEmblem } from '../diner-preview/GameEmblem';
import { METAMASK_GAME_LINK } from '../diner-preview/wallet-browser';
import css from '../diner-preview/wallet-entry.module.css';

export const metadata: Metadata = { title: 'Wallet help · Domain Kitchen' };

export default function WalletHelpPage() {
  return <main className={css.page}><article className={`${css.card} ${css.helpCard}`}>
    <GameEmblem kind="cook" size={76}/>
    <p className={css.eyebrow}>A little help getting in</p>
    <h1>Your wallet is your player ID</h1>
    <p>A wallet app gives you an address that Domain Kitchen uses to recognise you. You don&apos;t need to buy crypto or put money in it to play this beta.</p>
    <div className={css.promise}><strong>Connection only.</strong><span>Approve sharing your wallet address. We don&apos;t request a signature, payment, gas fee or permission to spend your assets.</span></div>
    <section className={css.helpSection}><h2>Playing on your phone</h2>
      <ol><li>Tap <strong>Choose wallet</strong> and select the wallet you use.</li><li>Approve sharing your address in the wallet, then return to the game.</li><li>Tap <strong>Play beta</strong>.</li></ol>
      <p>MetaMask, Coinbase Wallet, Rabby, Brave and Phantom are supported. Use the Ethereum account in multichain wallets. The chooser shows additional WalletConnect options when phone pairing is available.</p>
      <p>In Brave, the direct <strong>Connect Brave Wallet</strong> button uses Brave&apos;s own wallet. Open its wallet panel if the approval prompt is hidden. Your separate MetaMask app is a different connection.</p>
      <p>If an app handoff stalls, open the game in your wallet&apos;s built-in browser instead:</p>
      <a className={css.walletLink} href={METAMASK_GAME_LINK}>Open game in MetaMask</a>
      <p>If MetaMask only opens its home screen, select its browser tab and enter <strong>domainkitchen.xyz</strong>. Unlock the app first if it is locked.</p>
    </section>
    <section className={css.helpSection}><h2>Playing on your computer</h2><p>Tap <strong>Choose wallet</strong> to see the available options. Installed extensions also have a direct connection button. If you have just installed an extension, reload the game.</p></section>
    <section className={css.helpSection}><h2>Don&apos;t have a wallet yet?</h2><p>Install one from its official website, such as <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">MetaMask</a>. Create it in the wallet app. Never enter your recovery phrase or private key into Domain Kitchen.</p></section>
    <div className={css.betaNotice}><strong>About beta saves</strong><p>Your diner is saved on this device, in the browser you play in, under your connected wallet. Switching from Safari to MetaMask won&apos;t transfer a Safari save. All beta progress will reset at official launch.</p></div>
    <Link className={css.walletLink} href="/chef/diner-preview">Back to my diner</Link>
  </article></main>;
}
