"use client";

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { DinerWalletConnect } from './DinerWalletConnect';
import { useAccount } from 'wagmi';
import { DinerAccessContext } from './DinerAccess';
import { GameEmblem } from './GameEmblem';
import { betaWallet, BETA_RESET_NOTICE, BETA_SAVE_NOTICE } from './beta-access';
import css from './wallet-entry.module.css';

const DinerClient = dynamic(() => import('./DinerClient'), {
  ssr: false,
  loading: () => <p className={css.loading}>Opening your diner…</p>,
});

/** Connection-only beta. This never establishes or restores a server session. */
export default function BetaEntry() {
  const { address, isConnected } = useAccount();
  const wallet = betaWallet(address, isConnected);
  const [enteredWallet, setEnteredWallet] = useState<string | null>(null);
  useEffect(() => { setEnteredWallet(null); }, [wallet]);

  if (wallet && enteredWallet === wallet) {
    return <DinerAccessContext.Provider value={{ mode: 'beta', wallet }}>
      <DinerClient key={`beta:${wallet}`} />
    </DinerAccessContext.Provider>;
  }

  return <main className={css.page}>
    <section className={css.card} aria-labelledby="beta-title">
      <GameEmblem kind="cook" size={100} />
      <p className={css.eyebrow}>Domain Kitchen · Open beta</p>
      <h1 id="beta-title">Your little diner is waiting</h1>
      <p>Connect a wallet and come play. Everyone is welcome.</p>
      <div className={css.promise}>
        <strong>Just connect. That&apos;s it.</strong>
        <span>No signature, transaction or gas fee. We never request permission to spend your assets.</span>
      </div>
      <div className={css.betaNotice}>
        <strong>A fresh start at launch</strong>
        <p>{BETA_RESET_NOTICE}</p>
      </div>
      <div className={css.actions}>
        <DinerWalletConnect />
        {wallet && <button onClick={() => setEnteredWallet(wallet)}>Play beta</button>}
      </div>
      <p className={css.small}>{BETA_SAVE_NOTICE}</p>
      <p className={css.small}>Cloud saves, friend visits and token rewards are not available in this beta.</p>
    </section>
  </main>;
}
