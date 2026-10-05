/**
 * /s4/tg-link — CONSUME a Telegram bind code in the system browser (ADR-0030).
 * Connect wallet -> sign one ownership message (no gas) -> POST /api/s4/tg-bind
 * -> the wallet is bound to the Telegram account that opened this link. Ported
 * from /s4/join + /s4/link; the SIWE message carries the required Nonce line so
 * Rabby shows the trusted sign-in panel, not an "unknown signature" caution.
 *
 * This page runs on the WEB (never inside Telegram), so the normal wallet flow
 * applies. After binding, the player returns to Telegram and plays with no
 * further pop-ups (the Mini App runs on initData alone).
 */
"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { DEFAULT_THEME } from "@/lib/s4/theme";

const GOLD = "#f0b340";
const TH = DEFAULT_THEME;

function buildMessage(o: { domain: string; address: string; uri: string; nonce: string; issuedAt: string }) {
  return (
    `${o.domain} wants you to sign in with your Ethereum account:\n` +
    `${o.address}\n\n` +
    `Link your Telegram to ${TH.seasonName} on Doma. Signature only, no transaction, no gas, no approvals. Nothing on this wallet moves.\n\n` +
    `URI: ${o.uri}\n` +
    `Version: 1\n` +
    `Chain ID: 1\n` +
    `Nonce: ${o.nonce}\n` +
    `Issued At: ${o.issuedAt}`
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(13,17,32,0.7)",
  border: `1px solid ${GOLD}33`,
  borderRadius: 12,
  padding: "18px 20px",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: GOLD,
  letterSpacing: 3,
  fontWeight: 700,
  marginBottom: 10,
  textTransform: "uppercase",
};

type Linked = { teamName: string; accent: string; already: boolean; enlisted: boolean };

export function TgLinkForm({ code }: { code: string }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<Linked | null>(null);

  // No code in the URL -> nothing to consume. Tell them to start from Telegram.
  if (!code) {
    return (
      <div style={{ ...cardStyle, textAlign: "center" }}>
        <div style={labelStyle}>Missing link</div>
        <p style={{ fontSize: 14, color: "#aeb6c8", lineHeight: 1.6, margin: 0 }}>
          This page opens from Telegram. Open the game in Telegram and tap Link Wallet to get a fresh link.
        </p>
      </div>
    );
  }

  async function handleLink() {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const issuedAt = new Date().toISOString();
      const nonce = crypto.randomUUID().replace(/-/g, ""); // SIWE-required nonce (Rabby)
      const domain = typeof window !== "undefined" ? window.location.host : "assassin.web3guides.com";
      const uri =
        typeof window !== "undefined"
          ? `${window.location.origin}/s4/tg-link`
          : "https://assassin.web3guides.com/s4/tg-link";
      const message = buildMessage({ domain, address, uri, nonce, issuedAt });
      const signature = await signMessageAsync({ message });
      const resp = await fetch("/api/s4/tg-bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, code, message, signature }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.ok) {
        setError(result.error || `Link failed (HTTP ${resp.status}).`);
        setSubmitting(false);
        return;
      }
      setLinked({
        teamName: typeof result.teamName === "string" ? result.teamName : "your team",
        accent: typeof result.accent === "string" ? result.accent : GOLD,
        already: !!result.already,
        enlisted: !!result.enlisted,
      });
      setSubmitting(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /reject|deny|user denied|user rejected/i.test(msg)
          ? "Signature cancelled. Nothing happened. Link whenever you're ready."
          : `Signing failed: ${msg}`,
      );
      setSubmitting(false);
    }
  }

  // ── Linked ──────────────────────────────────────────────────────────────────
  if (linked) {
    const accent = linked.accent;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ ...cardStyle, borderColor: `${accent}55`, textAlign: "center" }}>
          <div style={labelStyle}>{linked.already ? "Already linked" : "Telegram linked"}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: accent, margin: "6px 0 10px" }}>
            You run with {linked.teamName}
          </div>
          <p style={{ fontSize: 14, color: "#aeb6c8", lineHeight: 1.6, margin: 0 }}>
            Your wallet is now tied to your Telegram. Head back to Telegram and play. No more pop-ups, your progress
            follows your wallet everywhere.
          </p>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Next</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#cdd4e4", fontSize: 14, lineHeight: 1.7 }}>
            <li>
              Reopen the game in Telegram. You are in as {linked.teamName}
              {linked.enlisted ? " (just enlisted)" : ""}.
            </li>
            <li>
              Hold a featured {TH.target.singular} from <b style={{ color: "#34d399" }}>$5</b> to start earning{" "}
              {TH.points} every day.
            </li>
          </ul>
        </div>
      </div>
    );
  }

  // ── Connect + link ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={cardStyle}>
        <div style={labelStyle}>Step 1 · Connect wallet</div>
        <ConnectButton showBalance={false} accountStatus="address" />
        <p style={{ fontSize: 12, color: "#7a89b8", marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
          Connect the wallet you want tied to your Telegram. Your wallet is your {TH.player.singular}.
        </p>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Step 2 · Sign to link</div>
        <p style={{ fontSize: 13, color: "#7a89b8", marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
          Sign one short message to prove the wallet is yours and bind it to the Telegram account that opened this link.{" "}
          <b style={{ color: "#34d399" }}>No transaction, no gas, no approvals.</b>
        </p>
        <button
          onClick={handleLink}
          disabled={!isConnected || submitting}
          style={{
            width: "100%",
            padding: "14px 18px",
            background: !isConnected || submitting ? "rgba(240,179,64,0.25)" : GOLD,
            color: !isConnected || submitting ? "#aeb6c8" : "#1a1205",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 700,
            cursor: !isConnected || submitting ? "not-allowed" : "pointer",
          }}
        >
          {!isConnected ? "Connect a wallet to link" : submitting ? "Waiting for signature…" : "Sign & link Telegram"}
        </button>
        {error && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "rgba(248,113,113,0.08)",
              border: "1px solid #f8717155",
              borderRadius: 6,
              fontSize: 13,
              color: "#f87171",
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
