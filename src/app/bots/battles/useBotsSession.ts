/**
 * OPEN A BATTLE BOTS PLAY SESSION FROM ANY SURFACE.
 *
 * The src/app/s7/_components/usePlaySession.ts hook, ported: connect if
 * needed (RainbowKit's modal, and STOP there: chaining a signature onto an
 * async modal is how a popup nobody expected appears), then ASK THE SERVER
 * FOR A NONCE, then ONE signature, then POST /api/bots/enlist
 * { address, message, signature }, which enlists a new wallet (the starter
 * coins and cards, once) or recognises a returning one, and mints the
 * session token either way. The token goes to localStorage (./session.ts)
 * and comes back as `token` here.
 *
 * WHY THE NONCE ROUND TRIP (2026-09-05). The Nonce line used to be invented
 * here with crypto.randomUUID and checked by nobody, so it proved nothing:
 * one captured message and signature could be posted again inside the five
 * minute freshness window. The server now issues it, binds it to this
 * wallet, and spends it once (src/app/api/bots/enlist/nonce-store.ts).
 *
 * The nonce round trip asks the player for nothing and refuses nobody. It
 * used to run a Discord identity gate first, and that gate is gone (Mike,
 * 2026-09-04: three steps, open the site, connect the wallet, play).
 *
 * ONE PRESS, NOT TWO (the three steps). The rule above still holds: nothing
 * chains a signature onto the connect modal, because a popup nobody expected
 * is how you lose a player. What is remembered instead is the PRESS. A player
 * who pressed a button that says it will start a session has already asked
 * for the signature, so when the wallet finishes connecting the hook picks
 * that intent back up and asks once. A player who connected some other way is
 * never asked anything. The intent is dropped the moment it is used, and on
 * any refusal, so it can never fire twice or fire later on its own.
 *
 * A wallet switch signs the old session out: a token for wallet A must
 * never ride along under wallet B's connect button.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { buildEnlistMessage, clearBotsSession, decodeBotsSession, readBotsSession, writeBotsPlayerName, writeBotsSession } from "./session";

export interface BotsSessionState {
  /** true once the stored token has been read (after mount); before that
   * `token` is "" on the server and the first client render alike */
  ready: boolean;
  /** the play-session token, "" when signed out */
  token: string;
  /** Kick off connect-if-needed, sign, enlist. Resolves to the token, or null. */
  open: () => Promise<string | null>;
  /** true while a signature or the enlist request is in flight */
  busy: boolean;
  /** plain words, already softened for a cancelled signature */
  error: string | null;
  /** a wallet is connected, so callers can word the button */
  connected: boolean;
  /** the player pressed Play and the wallet is still connecting: the button
   * stays in its "working" state across the modal instead of flicking back */
  pending: boolean;
  /** what the enlist answered, for the first render after a sign-in */
  last: { walletName: string; coins: number; joined: boolean } | null;
  signOut: () => void;
}

export function useBotsSession(): BotsSessionState {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();
  // read after mount so the server and the first client render agree
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<BotsSessionState["last"]>(null);
  // the remembered press, in a ref so the effect below reads the live value
  // and does not re-run just because it changed
  const wantsRef = useRef(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setToken(readBotsSession());
    setReady(true);
  }, []);

  // a different wallet than the token's: sign out
  useEffect(() => {
    if (!token || !address) return;
    const claims = decodeBotsSession(token);
    if (claims && claims.wallet !== address.toLowerCase()) {
      clearBotsSession();
      setToken("");
      setLast(null);
    }
  }, [token, address]);

  const signOut = useCallback(() => {
    clearBotsSession();
    setToken("");
    setLast(null);
  }, []);

  /** the sign-and-enlist half: everything after a wallet is connected. */
  const run = useCallback(
    async (addr: string): Promise<string | null> => {
      setBusy(true);
      try {
        // 1) the server's nonce. It asks for nothing and refuses nobody: the
        //    only thing between a connected wallet and a play session is the
        //    one signature below.
        const nonceResp = await fetch("/api/bots/enlist/nonce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr }),
        });
        const n = (await nonceResp.json().catch(() => null)) as
          | { ok?: boolean; nonce?: string; error?: string }
          | null;
        if (!nonceResp.ok || !n?.ok || !n?.nonce) {
          setError(n?.error || "Could not sign you in. Try again.");
          setBusy(false);
          return null;
        }

        // 2) one signature over a message carrying THAT nonce
        const issuedAt = new Date().toISOString();
        const domain = window.location.host;
        const uri = `${window.location.origin}/bots`;
        const message = buildEnlistMessage(addr, n.nonce, issuedAt, domain, uri);
        const signature = await signMessageAsync({ message });
        const resp = await fetch("/api/bots/enlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr, message, signature }),
        });
        const r = (await resp.json().catch(() => null)) as
          | { ok?: boolean; token?: string; error?: string; walletName?: string; coins?: number; joined?: boolean }
          | null;
        if (!resp.ok || !r?.ok || !r?.token) {
          setError(r?.error || "Could not sign you in. Try again.");
          setBusy(false);
          return null;
        }
        writeBotsSession(String(r.token));
        writeBotsPlayerName(String(r.walletName || ""));
        setToken(String(r.token));
        setLast({ walletName: String(r.walletName || ""), coins: Number(r.coins) || 0, joined: !!r.joined });
        setBusy(false);
        return String(r.token);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // a raw library error used to reach the player, in words nobody wrote
        setError(/reject|deny|user denied|user rejected/i.test(msg) ? "You said no in your wallet. Press Play to try again." : "Signing did not work. Try again.");
        setBusy(false);
        return null;
      }
    },
    [signMessageAsync],
  );

  const open = useCallback(async (): Promise<string | null> => {
    setError(null);
    if (!isConnected || !address) {
      // remember the press, open the modal, and STOP. The effect below picks
      // the press back up the moment a wallet is actually connected.
      wantsRef.current = true;
      setPending(true);
      if (openConnectModal) openConnectModal();
      else {
        wantsRef.current = false;
        setPending(false);
        setError("Connect a wallet first.");
      }
      return null;
    }
    return run(address);
  }, [address, isConnected, openConnectModal, run]);

  // the remembered press, spent once: a wallet finished connecting and the
  // player had already asked to play, so ask for the one signature now
  useEffect(() => {
    if (!wantsRef.current || !isConnected || !address || token) return;
    wantsRef.current = false;
    setPending(false);
    void run(address);
  }, [isConnected, address, token, run]);

  return { ready, token, open, busy, error, pending, connected: Boolean(isConnected && address), last, signOut };
}
