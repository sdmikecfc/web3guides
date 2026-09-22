"use client";

/**
 * Cloud saves for Domain Kitchen (M6).
 *
 * The rule that keeps onboarding kind (ADR-0048: never add a hurdle): you can
 * play with no wallet at all, and your restaurant is kept in this browser.
 * Signing in with the wallet you already connected upgrades that to a save
 * that follows you between devices. Nothing is gated behind it.
 *
 * The token is a bearer for SAVING ONLY. It lives in localStorage like the
 * S5 play token and is posted in the request body, never a query string.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { DkSave } from "../_engine/save";

const TOKEN_KEY = "dk_token_v1";
const WALLET_KEY = "dk_token_wallet";

export type CloudStatus = "off" | "signing" | "on" | "error";

export interface CloudSave {
  status: CloudStatus;
  wallet: string | null;
  error: string;
  /** ask the player to sign, then mint a session */
  signIn: () => Promise<void>;
  signOut: () => void;
  /** load whatever the server holds for this wallet */
  load: () => Promise<DkSave | null>;
  /** store a save; returns false if the server refused */
  store: (save: DkSave) => Promise<boolean>;
  /** cheers this kitchen received today, filled by the last load (M8c) */
  cheersRef: { current: number };
}

function readToken(): { token: string; wallet: string } | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const wallet = localStorage.getItem(WALLET_KEY);
    if (token && wallet) return { token, wallet };
  } catch {}
  return null;
}

export function useCloudSave(): CloudSave {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [status, setStatus] = useState<CloudStatus>("off");
  const [wallet, setWallet] = useState<string | null>(null);
  const [error, setError] = useState("");
  const tokenRef = useRef<string | null>(null);
  /** cheers this kitchen received today, filled by the last load (M8c) */
  const cheersRef = useRef(0);

  // an existing token counts, but only for the wallet that is connected now
  useEffect(() => {
    const held = readToken();
    if (!held) return;
    if (isConnected && address && held.wallet !== address.toLowerCase()) return;
    tokenRef.current = held.token;
    setWallet(held.wallet);
    setStatus("on");
  }, [address, isConnected]);

  const signIn = useCallback(async () => {
    if (!address) {
      setError("Connect a wallet first.");
      setStatus("error");
      return;
    }
    setStatus("signing");
    setError("");
    try {
      const domain = typeof window !== "undefined" ? window.location.host : "web3guides.com";
      const issued = new Date().toISOString();
      // the plain EIP-4361-shaped message verifyOwnership expects
      const message =
        `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n` +
        `Save your Domain Kitchen restaurant to this wallet.\n\nIssued At: ${issued}`;
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/chef/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, message, signature }),
      });
      const j = (await res.json()) as { ok?: boolean; token?: string; wallet?: string; error?: string };
      if (!j.ok || !j.token || !j.wallet) {
        setError(j.error || "Could not start a session.");
        setStatus("error");
        return;
      }
      tokenRef.current = j.token;
      try {
        localStorage.setItem(TOKEN_KEY, j.token);
        localStorage.setItem(WALLET_KEY, j.wallet);
      } catch {}
      setWallet(j.wallet);
      setStatus("on");
    } catch {
      // a rejected signature is a normal thing to do, not an error state
      setError("Signature cancelled.");
      setStatus("off");
    }
  }, [address, signMessageAsync]);

  const signOut = useCallback(() => {
    tokenRef.current = null;
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(WALLET_KEY);
    } catch {}
    setWallet(null);
    setStatus("off");
  }, []);

  const load = useCallback(async (): Promise<DkSave | null> => {
    const t = tokenRef.current;
    if (!t) return null;
    try {
      const res = await fetch("/api/chef/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        save?: DkSave | null;
        cheersToday?: number;
      };
      // the load response also carries today's cheer count (M8c); parked on a
      // ref rather than returned, so the load signature stays "a save or null"
      cheersRef.current = Math.max(0, Math.floor(j.cheersToday ?? 0));
      return j.ok ? j.save ?? null : null;
    } catch {
      return null;
    }
  }, []);

  const store = useCallback(async (save: DkSave): Promise<boolean> => {
    const t = tokenRef.current;
    if (!t) return false;
    try {
      const res = await fetch("/api/chef/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t, state: save }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) {
        // an expired session should ask for a signature again, not nag
        if (res.status === 401) {
          tokenRef.current = null;
          setStatus("off");
        }
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  return { status, wallet, error, signIn, signOut, load, store, cheersRef };
}
