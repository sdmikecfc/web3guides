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
      <p>In Brave, <strong>Connect Brave Wallet</strong> uses Brave&apos;s own wallet. Open the browser&apos;s wallet panel if its approval prompt is hidden. Your separate MetaMask app is a different wallet connection.</p>
      <ol><li>For MetaMask, use the button below to open the game in its built-in browser.</li><li>Tap <strong>Connect MetaMask</strong> and approve sharing your address.</li><li>Tap <strong>Play beta</strong>. Stay in that browser to play.</li></ol>
      <a className={css.walletLink} href={METAMASK_GAME_LINK}>Open game in MetaMask</a>
      <p>If MetaMask only opens its home screen, select its browser tab and enter <strong>domainkitchen.xyz</strong>. Unlock the app first if it is locked.</p>
    </section>
    <section className={css.helpSection}><h2>Playing on your computer</h2><p>Use a browser with your wallet extension installed and unlocked, then tap its named connection button, such as <strong>Connect MetaMask</strong>. If you have just installed it, reload the game.</p></section>
    <section className={css.helpSection}><h2>Don&apos;t have a wallet yet?</h2><p>Install one from its official website, such as <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">MetaMask</a>. Create it in the wallet app. Never enter your recovery phrase or private key into Domain Kitchen.</p></section>
    <div className={css.betaNotice}><strong>About beta saves</strong><p>Your diner is saved on this device, in the browser you play in, under your connected wallet. Switching from Safari to MetaMask won&apos;t transfer a Safari save. All beta progress will reset at official launch.</p></div>
    <Link className={css.walletLink} href="/chef/diner-preview">Back to my diner</Link>
  </article></main>;
}
