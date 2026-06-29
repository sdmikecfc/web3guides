/**
 * STARFALL mini-games — shared client harness.
 * A wallet-signed play session (cached in sessionStorage), the run-start/score
 * fetch helpers, and a connect+sign gate. Every game imports this; the canvas is
 * the only per-game code. Mirrors S2's games/shared but wallet-keyed.
 */
"use client";

import { useCallback, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const TOKEN_KEY = "sf_game_token";
const GOLD = "#f0b340";

function buildMessage(address: string, issuedAt: string, domain: string, uri: string) {
  return (
    `${domain} wants you to sign in with your Ethereum account:\n` +
    `${address}\n\n` +
    `Open a Starfall play session (Launch Wars Season 3). Signature only, no transaction, no gas, no approvals.\n\n` +
    `URI: ${uri}\n` +
    `Version: 1\n` +
    `Chain ID: 1\n` +
    `Issued At: ${issuedAt}`
  );
}

export function useStarSession() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(TOKEN_KEY) : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSession = useCallback(async () => {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const issuedAt = new Date().toISOString();
      const domain = window.location.host;
      const uri = `${window.location.origin}/games`;
      const message = buildMessage(address, issuedAt, domain, uri);
      const signature = await signMessageAsync({ message });
      const resp = await fetch("/api/stars/game-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, message, signature }),
      });
      const r = await resp.json();
      if (!resp.ok || !r.ok) {
        setError(r.error || "Could not start a session.");
        setBusy(false);
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, r.token);
      setToken(r.token);
      setBusy(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/reject|deny|user denied|user rejected/i.test(msg) ? "Signature cancelled." : `Sign failed: ${msg}`);
      setBusy(false);
    }
  }, [address, signMessageAsync]);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  return { address, isConnected, token, busy, error, openSession, reset };
}

export type RunStartResult = { ok: boolean; nonce?: string; error?: string };
export type ScoreResult = {
  ok: boolean;
  stardust?: number;
  starlight?: number;
  best?: number;
  improved?: boolean;
  attemptsLeft?: number;
  already?: boolean;
  error?: string;
};

export async function startRun(token: string, game: string): Promise<RunStartResult> {
  const r = await fetch("/api/stars/run-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ t: token, game }),
  });
  return r.json();
}

export async function submitScore(
  token: string,
  game: string,
  score: number,
  nonce: string,
  meta?: Record<string, unknown>,
): Promise<ScoreResult> {
  const r = await fetch("/api/stars/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ t: token, game, score, nonce, meta }),
  });
  return r.json();
}

const cardStyle: React.CSSProperties = {
  background: "rgba(13,17,32,0.72)",
  border: `1px solid ${GOLD}33`,
  borderRadius: 14,
  padding: "20px 22px",
};

/** Connect + sign gate. Renders children once a session token exists. */
export function SessionGate({
  session,
  children,
}: {
  session: ReturnType<typeof useStarSession>;
  children: React.ReactNode;
}) {
  if (session.token) return <>{children}</>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 420, margin: "0 auto" }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: GOLD, letterSpacing: 3, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
          Connect to play
        </div>
        <ConnectButton showBalance={false} accountStatus="address" />
        <p style={{ fontSize: 13, color: "#7a89b8", margin: "12px 0 0", lineHeight: 1.55 }}>
          Sign once (no gas) to open a 12-hour play session. Scores earn <b style={{ color: "#e8ecf5" }}>Salvage</b>{" "}
          and a little <b style={{ color: GOLD }}>Starlight</b> for your crew.
        </p>
        <button
          onClick={session.openSession}
          disabled={!session.isConnected || session.busy}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "13px 18px",
            background: !session.isConnected || session.busy ? "rgba(240,179,64,0.25)" : GOLD,
            color: !session.isConnected || session.busy ? "#aeb6c8" : "#1a1205",
            border: "none",
            borderRadius: 9,
            fontSize: 15,
            fontWeight: 700,
            cursor: !session.isConnected || session.busy ? "not-allowed" : "pointer",
          }}
        >
          {!session.isConnected ? "Connect a wallet" : session.busy ? "Waiting for signature…" : "Sign & start playing"}
        </button>
        {session.error && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#f87171", lineHeight: 1.5 }}>{session.error}</div>
        )}
      </div>
    </div>
  );
}
