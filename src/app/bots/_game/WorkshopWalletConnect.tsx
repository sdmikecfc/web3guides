"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { WalletProviders } from "./ModelKombatWalletProviders";
import { signInErrorMessage, signInToWorkshop, type SignInStage } from "@/lib/bots/workshop8/wallet-sign-in";
import css from './entry.module.css';

type Props = { onConnected(token: string, wallet: string): void };
const stageLabels: Record<SignInStage, string> = {
  preparing: "Preparing sign-in…", signing: "Confirm in your wallet…", saving: "Saving your sign-in…",
};

function SignIn({ onConnected }: Props) {
  const { address, status } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const [stage, setStage] = useState<SignInStage | null>(null);
  const [error, setError] = useState("");
  const [continueAfterConnect, setContinueAfterConnect] = useState(false);
  const request = useRef<AbortController | null>(null);
  const currentAddress = useRef(address);
  currentAddress.current = address;

  useEffect(() => () => request.current?.abort(), []);

  const sign = useCallback(async () => {
    if (!address || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setContinueAfterConnect(false);
    setError("");
    try {
      const session = await signInToWorkshop({
        address, origin: location.origin, signal: controller.signal,
        signMessage: message => signMessageAsync({ message }),
        isCurrentWallet: () => currentAddress.current?.toLowerCase() === address.toLowerCase(),
        onStage: setStage,
      });
      onConnected(session.token, session.wallet);
    } catch (failure) {
      if (!controller.signal.aborted) setError(signInErrorMessage(failure));
    } finally {
      if (!controller.signal.aborted) setStage(null);
      if (request.current === controller) request.current = null;
    }
  }, [address, onConnected, signMessageAsync]);

  // Continue only after this Connect button was pressed. Restoring a previous
  // wallet connection never opens a signature prompt by itself.
  useEffect(() => {
    if (continueAfterConnect && address && status === "connected") void sign();
  }, [address, status, continueAfterConnect, sign]);

  function connect() {
    if (address) { void sign(); return; }
    setError("");
    setContinueAfterConnect(true);
    openConnectModal?.();
  }

  return <div>
    <p>Choose the wallet you use on Doma. Sign a free message to prove it’s yours.</p>
    <button className={css.primary} type="button" disabled={stage !== null || (!address && !openConnectModal)} onClick={connect}>
      {stage ? stageLabels[stage] : error ? "Try sign-in again" : address ? "Sign in with this wallet" : "Connect wallet"}
    </button>
    {address && <p>Wallet {address.slice(0, 6)}…{address.slice(-4)} · No payment or token approval.</p>}
    {address && !stage && openAccountModal && <button className={css.textButton} type="button" onClick={openAccountModal}>Change wallet</button>}
    {stage && <p role="status" aria-live="polite">{stageLabels[stage]}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
/** Loaded only after the player explicitly opens Connect. */
export default function WorkshopWalletConnect(props: Props) {
  return <WalletProviders appName="Model Kombat" accent="#a6cebf" accentForeground="#10231f"><SignIn {...props} /></WalletProviders>;
}
