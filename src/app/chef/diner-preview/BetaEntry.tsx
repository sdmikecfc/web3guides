"use client";

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { DinerWalletConnect } from './DinerWalletConnect';
import { useAccount } from 'wagmi';
import { DinerAccessContext } from './DinerAccess';
import { betaWallet, BETA_RESET_NOTICE, BETA_SAVE_NOTICE } from './beta-access';
import css from './welcome.module.css';
import type { DomainId } from '@/lib/chef/diner/domain-worlds';
const WelcomeRestaurant=dynamic(()=>import('./WelcomeRestaurant'),{ssr:false,loading:()=> <div className={css.loading}>Setting the tables…</div>});

const DinerClient = dynamic(() => import('./DinerClient'), {
  ssr: false,
  loading: () => <p className={css.loading}>Opening your diner…</p>,
});

/** Connection-only beta. This never establishes or restores a server session. */
export default function BetaEntry({collectionDomain}:{collectionDomain?:DomainId}={}) {
  const { address, isConnected } = useAccount();
  const wallet = betaWallet(address, isConnected);
  const [enteredWallet, setEnteredWallet] = useState<string | null>(null);
  useEffect(() => { setEnteredWallet(null); }, [wallet]);

  if (wallet && enteredWallet === wallet) {
    return <DinerAccessContext.Provider value={{ mode: 'beta', wallet }}>
      <DinerClient key={`beta:${wallet}`} collectionDomain={collectionDomain}/>
    </DinerAccessContext.Provider>;
  }

  return <main className={css.page}>
    <header className={css.header}><div className={css.brand}><img src="/chef/kitchen-icon.svg" alt="" width="34" height="34"/>DOMAIN KITCHEN</div><span className={css.beta}>OPEN BETA</span></header>
    <section className={css.main} aria-labelledby="beta-title">
      <div className={css.copy}>
        <span className={css.eyebrow}>A little place. Entirely yours.</span>
        <h1 id="beta-title">Good food.<br/><em>Your kind of place.</em></h1>
        <p className={css.intro}>Take your food truck on an adventure. Discover recipes and equipment, then come home to make your restaurant your own.</p>
        <div className={css.loop}><span>Cook on the road</span><b>→</b><span>Discover</span><b>→</b><span>Decorate</span></div>
        <div className={css.actions}><DinerWalletConnect compact/>{wallet&&<button onClick={()=>setEnteredWallet(wallet)}>Open my restaurant →</button>}</div>
        <p className={css.connectNote}>Connect a wallet to play for free. No signature, transaction or permission to spend your assets.</p>
        <p className={css.reset}><strong>Beta means a fresh start at launch.</strong><br/>{BETA_RESET_NOTICE}</p>
        <details className={css.details}><summary>How your beta progress is saved</summary><p>{BETA_SAVE_NOTICE}</p><p>Cloud saves, friend visits and token rewards are not available in this beta.</p></details>
      </div>
      <div className={css.room} role="img" aria-label="A small furnished starter restaurant, ready to make your own"><div className={css.canvas} aria-hidden="true" ref={node=>node?.setAttribute('inert','')}><WelcomeRestaurant/></div><span className={css.roomCaption}>Start small. Make it yours.</span></div>
    </section>
    <footer className={css.footer}><span>No rush. Your restaurant will be waiting.</span><a href="/chef/wallet-help">Connection help ↗</a></footer>
  </main>;
}
