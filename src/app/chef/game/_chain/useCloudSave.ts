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
import type { KitchenCommand, NeighborStatus } from "@/lib/chef/authority";

export const AUTHORITY_ENABLED = process.env.NEXT_PUBLIC_DK_AUTHORITY_ENABLED === "true";
export interface KitchenSnapshot {
  ok: boolean; error?: string; code?: string; retryAfterMs?: number; save: DkSave; revision: number; serverTime: number;
  authority: { currentQuality: number; verifiedBestQuality: number; dailyClaimed: boolean; socialRemaining: number; maintenance?: DkSave["maintenance"]; eligibleMarkets?: string[]; canImportGuestDesign?: boolean; truckClock?: { lastAt: number; creditMs: number; creditTicks: number; pausedForAbsence: boolean } | null };
  neighbors: { handle: string; name: string; status: NeighborStatus; parcelAvailable?: boolean; helpAvailable?: boolean }[];
  discover?: { handle: string; name: string }[];
  featured: string[];
  ingredientOffers?: { id: string; cost: number; quantity: number; purchased?: boolean }[];
}

const TOKEN_KEY = "dk_token_v1";
const WALLET_KEY = "dk_token_wallet";
const PENDING_KEY = "dk_pending_command_v1";
interface PendingCommand { wallet: string; id: string; revision: number; command: KitchenCommand }

export type CloudStatus = "off" | "signing" | "on" | "error";

export interface CloudSave {
  pendingCommand: () => KitchenCommand | null;
  authorityRef: { current: KitchenSnapshot | null };
  command: (command: KitchenCommand) => Promise<KitchenSnapshot | null>;
  social: () => Promise<KitchenSnapshot | null>;
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

export function useCloudSave(disabled = false): CloudSave {
  const disabledRef = useRef(disabled); disabledRef.current = disabled;
  const { address, isConnected } = useAccount();
  const addressRef = useRef(address); addressRef.current = address;
  const { signMessageAsync } = useSignMessage();
  const [status, setStatus] = useState<CloudStatus>("off");
  const [wallet, setWallet] = useState<string | null>(null);
  const [error, setError] = useState("");
  const tokenRef = useRef<string | null>(null);
  const walletRef = useRef<string | null>(null);
  /** cheers this kitchen received today, filled by the last load (M8c) */
  const cheersRef = useRef(0);
  const authorityRef = useRef<KitchenSnapshot | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const pendingRef = useRef<PendingCommand | null>(null);
  const settleQueued = useRef(false);

  const rememberPending = useCallback((pending: PendingCommand | null) => {
    if (disabledRef.current) return;
    pendingRef.current = pending;
    try { if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); else localStorage.removeItem(PENDING_KEY); } catch {}
  }, []);

  const command = useCallback((action: KitchenCommand): Promise<KitchenSnapshot | null> => {
    if (disabledRef.current) return Promise.resolve(null);
    const queuedWallet = walletRef.current;
    const queuedToken = tokenRef.current;
    const requested = structuredClone(action);
    if (requested.type === "settle" && settleQueued.current) return Promise.resolve(null);
    if (requested.type === "settle") settleQueued.current = true;
    const work = async (): Promise<KitchenSnapshot | null> => {
      const t = tokenRef.current;
      if (disabledRef.current || !t || t !== queuedToken || !queuedWallet || queuedWallet !== walletRef.current || !AUTHORITY_ENABLED) return null;
      const send = async (pending: PendingCommand): Promise<KitchenSnapshot | null> => {
        for (let attempt = 0; attempt < 2; attempt++) {
          if(disabledRef.current||t!==tokenRef.current||queuedWallet!==walletRef.current)return null;
          try {
            const res = await fetch("/api/chef/command", { method: "POST", headers: {"content-type":"application/json"}, signal: AbortSignal.timeout(12_000), body: JSON.stringify({t,id:pending.id,revision:pending.revision,command:pending.command}) });
            const j = await res.json() as KitchenSnapshot;
            if (disabledRef.current || t !== tokenRef.current || queuedWallet !== walletRef.current) return null;
            if (j.save && (!authorityRef.current || j.revision >= authorityRef.current.revision)) authorityRef.current = j;
            if (res.ok && j.ok) { rememberPending(null); setError(""); return j; }
            if(j.code==="truck_time_credit"){
              // This tape has not been committed. Keep its exact ID/content;
              // a lifecycle receipt or network delay may put prediction ahead
              // of the server by more than a fixed quarter-second retry.
              if(attempt===0){
                const delay=Number.isFinite(j.retryAfterMs)?Math.max(50,Math.min(5_000,j.retryAfterMs!+50)):250;
                await new Promise(resolve=>setTimeout(resolve,delay));continue;
              }
              setError("The truck clock is catching up. Retry to confirm the same actions.");return null;
            }
            if (res.status === 401) {
              tokenRef.current = null; setStatus("error"); setError("Your save session expired. Sign in again to confirm the pending action.");
              return null;
            }
            // These responses conclusively rejected the action. A revision conflict
            // is shown for review, never replayed automatically onto another layout.
            if (res.status < 500) {
              rememberPending(null); setError(j.error || "Your kitchen could not save that change.");
              return j.save ? j : null;
            }
          } catch { /* A timeout can happen after commit; keep exactly the same ID. */ }
        }
        if(disabledRef.current||t!==tokenRef.current||queuedWallet!==walletRef.current)return null;
        setError("Your connection paused. The next action will confirm your pending change first.");
        return null;
      };
      const outstanding = pendingRef.current;
      if (outstanding?.wallet === queuedWallet) {
        const result = await send(outstanding);
        if (!result?.ok || JSON.stringify(outstanding.command) === JSON.stringify(requested)) return result;
      }
      if (disabledRef.current || t !== tokenRef.current || queuedWallet !== walletRef.current) return null;
      const pending: PendingCommand = { wallet: queuedWallet, id: crypto.randomUUID(), revision: authorityRef.current?.revision ?? 0, command: requested };
      rememberPending(pending);
      return send(pending);
    };
    const next = queueRef.current.then(work,work);
    queueRef.current = next.finally(() => { if (requested.type === "settle") settleQueued.current = false; });
    return next;
  }, [rememberPending]);

  const social = useCallback(async (): Promise<KitchenSnapshot | null> => {
    const t = tokenRef.current;
    if (disabledRef.current || !t || !AUTHORITY_ENABLED) return null;
    try {
      const res = await fetch("/api/chef/social", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({t})});
      const j=await res.json() as KitchenSnapshot;
      if(disabledRef.current||t!==tokenRef.current)return null;
      if(!res.ok||!j.ok) {setError(j.error||"Your neighborhood could not load.");return null;}
      // Discovery is read-only and must not roll a newer command revision backwards.
      if(!authorityRef.current||j.revision>=authorityRef.current.revision) authorityRef.current=j;
      return j;
    } catch {setError("Your neighborhood is temporarily unavailable.");return null;}
  }, []);

  // an existing token counts, but only for the wallet that is connected now
  useEffect(() => {
    if (disabled) {
      tokenRef.current=null;walletRef.current=null;authorityRef.current=null;pendingRef.current=null;cheersRef.current=0;
      setWallet(null);setStatus("off");setError("");return;
    }
    const held = readToken();
    if (!held || (isConnected && address && held.wallet !== address.toLowerCase())) {
      tokenRef.current=null;walletRef.current=null;authorityRef.current=null;pendingRef.current=null;
      setWallet(null);setStatus("off");return;
    }
    if (walletRef.current !== held.wallet) authorityRef.current = null;
    tokenRef.current = held.token;
    walletRef.current = held.wallet;
    try { const pending=JSON.parse(localStorage.getItem(PENDING_KEY)??"null") as PendingCommand|null; pendingRef.current=pending?.wallet===held.wallet ? pending : null; } catch {pendingRef.current=null;}
    setWallet(held.wallet);
    setStatus("on");
  }, [address, isConnected, disabled]);

  const signIn = useCallback(async () => {
    if (disabledRef.current) return;
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
      if (disabledRef.current) return;
      const res = await fetch("/api/chef/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, message, signature }),
      });
      const j = (await res.json()) as { ok?: boolean; token?: string; wallet?: string; error?: string };
      if(disabledRef.current)return;
      if(addressRef.current?.toLowerCase()!==address.toLowerCase()){setStatus("off");return;}
      if (!j.ok || !j.token || !j.wallet) {
        setError(j.error || "Could not start a session.");
        setStatus("error");
        return;
      }
      tokenRef.current = j.token;
      if(walletRef.current!==j.wallet) {authorityRef.current=null;pendingRef.current=null;}
      walletRef.current = j.wallet;
      try { const pending=JSON.parse(localStorage.getItem(PENDING_KEY)??"null") as PendingCommand|null; pendingRef.current=pending?.wallet===j.wallet ? pending : null; } catch {pendingRef.current=null;}
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
    if (disabledRef.current) return;
    tokenRef.current = null;
    walletRef.current = null;
    authorityRef.current = null;
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(WALLET_KEY);
    } catch {}
    setWallet(null);
    setStatus("off");
  }, []);

  const load = useCallback(async (): Promise<DkSave | null> => {
    const t = tokenRef.current;
    if (disabledRef.current || !t) return null;
    try {
      const res = await fetch(AUTHORITY_ENABLED ? "/api/chef/command" : "/api/chef/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        save?: DkSave | null;
        cheersToday?: number;
      };
      if(disabledRef.current||t!==tokenRef.current)return null;
      if(res.status===401){tokenRef.current=null;setStatus("error");setError("Your save session expired. Sign in again to load your restaurant.");return null;}
      if(AUTHORITY_ENABLED && j.ok) {
        const incoming=j as KitchenSnapshot;
        if(!authorityRef.current||incoming.revision>=authorityRef.current.revision)authorityRef.current=incoming;
        else return authorityRef.current.save;
      }
      if(!j.ok)setError("Your connected restaurant could not load. Please retry before making changes.");
      // the load response also carries today's cheer count (M8c); parked on a
      // ref rather than returned, so the load signature stays "a save or null"
      cheersRef.current = Math.max(0, Math.floor(j.cheersToday ?? 0));
      return j.ok ? j.save ?? null : null;
    } catch {
      return null;
    }
  }, []);

  const store = useCallback(async (save: DkSave): Promise<boolean> => {
    if (disabledRef.current || AUTHORITY_ENABLED) return false;
    const t = tokenRef.current;
    if (!t) return false;
    try {
      const res = await fetch("/api/chef/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t, state: save }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (disabledRef.current) return false;
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

  return { status: disabled ? "off" : status, wallet: disabled ? null : wallet, error: disabled ? "" : error, signIn, signOut, load, store, cheersRef, authorityRef, command, social, pendingCommand: () => disabledRef.current ? null : pendingRef.current?.command ?? null };
}
