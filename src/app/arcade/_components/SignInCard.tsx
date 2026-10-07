/**
 * SIGN IN FROM THE LANDING PAGE. The same mint every game shell performs in the
 * arcade (one gasless signature -> /api/arcade/game-session -> a 12 hour
 * token), lifted here so a player can sign BEFORE picking a game. The token is
 * written under the ONE arcade key, so all sixteen games find it.
 *
 * The message template is IMPORTED (lib/s7/games buildPlaySessionMessage): the
 * server verifies the exact posted bytes, and its first line is what the
 * domain allowlist reads. A second, drifting copy would be a silent auth
 * break.
 *
 * This component uses ARCADE_TOKEN_KEY directly and never lib/arcade/mode's
 * tokenKey(): on launchwars.xyz this page is served at "/", where the path
 * based arcade detection is (correctly) false.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { buildPlaySessionMessage } from "@/lib/s7/games";
import { ARCADE_API_BASE, ARCADE_NAME, ARCADE_TOKEN_KEY } from "@/lib/arcade/mode";

export type SignInStrings = {
  signTitle: string;
  signBody: string;
  signGuest: string;
  signButton: string;
  signBusy: string;
  signDone: string;
  signCancelled: string;
  signFailed: string;
  connect: string;
};

function readToken(): string {
  try {
    return localStorage.getItem(ARCADE_TOKEN_KEY) || sessionStorage.getItem(ARCADE_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function writeToken(token: string): void {
  try {
    localStorage.setItem(ARCADE_TOKEN_KEY, token);
    sessionStorage.setItem(ARCADE_TOKEN_KEY, token);
  } catch {
    /* storage blocked: the game shells will ask again */
  }
}

export function SignInCard({ strings: T, accent = "#e0662e" }: { strings: SignInStrings; accent?: string }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  // Read AFTER mount so the server render and the first client render agree.
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSignedIn(Boolean(readToken()));
  }, []);

  const signIn = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const issuedAt = new Date().toISOString();
      const nonce = crypto.randomUUID().replace(/-/g, "");
      const message = buildPlaySessionMessage(
        address,
        nonce,
        issuedAt,
        window.location.host,
        `${window.location.origin}/arcade`,
        ARCADE_NAME,
      );
      const signature = await signMessageAsync({ message });
      const resp = await fetch(`${ARCADE_API_BASE}/game-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, message, signature }),
      });
      const r = await resp.json().catch(() => ({ ok: false }));
      if (!resp.ok || !r.ok || !r.token) {
        setError(typeof r.error === "string" && r.error ? r.error : T.signFailed);
      } else {
        writeToken(String(r.token));
        setSignedIn(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/reject|deny|denied|cancel/i.test(msg) ? T.signCancelled : T.signFailed);
    } finally {
      setBusy(false);
    }
  }, [address, signMessageAsync, T.signCancelled, T.signFailed]);

  return (
    <div
      style={{
        background: "rgba(18,22,27,0.72)",
        border: `1px solid ${signedIn ? "#34d39955" : "#232a32"}`,
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#e9edf1" }}>{T.signTitle}</div>
        <div role="status" aria-live="polite" style={{ fontSize: 13.5, color: "#aab4bd", marginTop: 5, lineHeight: 1.5 }}>
          {signedIn ? T.signDone : `${T.signBody} ${T.signGuest}`}
        </div>
        {error ? <div style={{ fontSize: 13, color: "#f0b340", marginTop: 6 }}>{error}</div> : null}
      </div>
      <div style={{ flexShrink: 0 }}>
        {!isConnected ? (
          <ConnectButton showBalance={false} chainStatus="none" label={T.connect} />
        ) : signedIn ? (
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 999,
              border: "1px solid #34d39955",
              background: "#34d39914",
              color: "#34d399",
              fontSize: 20,
              fontWeight: 800,
            }}
          >
            ✓
          </span>
        ) : (
          <button
            type="button"
            onClick={signIn}
            disabled={busy}
            style={{
              appearance: "none",
              cursor: busy ? "default" : "pointer",
              minHeight: 44,
              padding: "12px 24px",
              borderRadius: 11,
              border: "none",
              background: accent,
              color: "#0b0d10",
              fontSize: 15,
              fontWeight: 800,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? T.signBusy : T.signButton}
          </button>
        )}
      </div>
    </div>
  );
}
