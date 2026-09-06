/**
 * OPEN A PLAY SESSION FROM ANYWHERE, not just from inside a game.
 *
 * The bug this exists to kill (Mike, 2026-08-04, signed in and deployed and
 * still stuck): the garage showed "Enlist to field" on every tank, and that
 * button linked to /s7/join. But /s7/join ENLISTS A WALLET INTO THE SEASON. It
 * has never minted a play-session token. The ONLY code in the whole app that
 * mints one lived inside the arcade game shell.
 *
 * So the loop was closed with no exit: the garage says you are not signed in,
 * sends you to a page that cannot sign you in, and you come back to the same
 * message. The only way through was to guess that you had to go play an arcade
 * game first. Nothing said so. Compounding it, the session TTL is 12h, so even
 * a player who found the path was locked out again the next day.
 *
 * This hook is the SAME mint the game shell performs, lifted so any surface can
 * call it. The message template is imported rather than copied: the server
 * verifies the exact posted bytes, so a second, drifting copy of it would be a
 * silent auth break waiting to happen.
 */
"use client";

import { useCallback, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { buildPlaySessionMessage, writeSessionToken } from "@/lib/s7/games";

export type PlaySessionState = {
  /** Kick off connect-if-needed, sign, mint. Resolves to the token, or null. */
  open: () => Promise<string | null>;
  /** True while a signature or the mint request is in flight. */
  busy: boolean;
  /** Human-readable failure, already softened for a cancelled signature. */
  error: string | null;
  /** True when a wallet is connected, so callers can word the button. */
  connected: boolean;
};

export function usePlaySession(): PlaySessionState {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (): Promise<string | null> => {
    setError(null);
    // No wallet yet: open RainbowKit and stop. Connecting is its own step and
    // the user has to come back and press again; chaining a signature onto an
    // async modal is how you get a popup nobody expected.
    if (!isConnected || !address) {
      if (openConnectModal) openConnectModal();
      else setError("Connect a wallet first.");
      return null;
    }
    setBusy(true);
    try {
      const issuedAt = new Date().toISOString();
      const nonce = crypto.randomUUID().replace(/-/g, "");
      const domain = window.location.host;
      const uri = `${window.location.origin}/s7/hq`;
      const message = buildPlaySessionMessage(address, nonce, issuedAt, domain, uri);
      const signature = await signMessageAsync({ message });
      const resp = await fetch("/api/s7/game-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, message, signature }),
      });
      const r = await resp.json();
      if (!resp.ok || !r?.ok || !r?.token) {
        setError(r?.error || "Could not start a session.");
        setBusy(false);
        return null;
      }
      writeSessionToken(String(r.token));
      setBusy(false);
      return String(r.token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/reject|deny|user denied|user rejected/i.test(msg) ? "Signature cancelled." : `Sign failed: ${msg}`);
      setBusy(false);
      return null;
    }
  }, [address, isConnected, openConnectModal, signMessageAsync]);

  return { open, busy, error, connected: Boolean(isConnected && address) };
}
