/**
 * Season 4 /s4/link — bind a wallet-first player to a Discord account.
 * In Discord run /s4 link to get a one-time code, then here: connect the
 * wallet, enter the code, sign one ownership message (no gas) -> POST
 * /api/s4/link-discord. Port of the proven S3 form (/stars/link/form.tsx).
 * The sign-message season string is parameterized from the theme const (the
 * S3 builder hardcoded "Launch Wars Season 3"). Team names/accents come back
 * from the API (theme-resolved server-side); nothing themed is hardcoded here.
 */
"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { DEFAULT_THEME } from "@/lib/s4/theme";

const ACCENT = "#9fb0d0";
const BORDER = "#1c2236";
const TEXT = "#e8ecf5";
const MUTED = "#aeb6c8";
const FAINT = "#7a89b8";

// EIP-4361 (Sign-In-With-Ethereum): the Nonce line is REQUIRED. Without it
// Rabby can not parse this as a SIWE login and falls back to its generic
// "unknown signature" caution; with it, Rabby shows the trusted green
// "Sign in with {domain}" panel. The server (api/s4/link-discord ->
// verifyOwnership) verifies the exact posted bytes and never parses the nonce,
// so this is display-only: it does not touch sign-up or the game.
function buildMessage(o: { domain: string; address: string; uri: string; nonce: string; issuedAt: string; code: string }) {
  return (
    `${o.domain} wants you to sign in with your Ethereum account:\n` +
    `${o.address}\n\n` +
    `Link this wallet to your Discord for ${DEFAULT_THEME.seasonName}. Signature only, no transaction, no gas, no approvals. Code: ${o.code}\n\n` +
    `URI: ${o.uri}\n` +
    `Version: 1\n` +
    `Chain ID: 1\n` +
    `Nonce: ${o.nonce}\n` +
    `Issued At: ${o.issuedAt}`
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(13,17,32,0.7)",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: "18px 20px",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: ACCENT,
  letterSpacing: 3,
  fontWeight: 700,
  marginBottom: 10,
  textTransform: "uppercase",
};

type Linked = { teamName: string | null; accent: string; enlisted: boolean };

export function LinkForm() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<Linked | null>(null);

  const codeOk = /^[A-Za-z0-9]{4,10}$/.test(code.trim());

  async function handleLink() {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    if (!codeOk) {
      setError("Enter the code from /s4 link in Discord.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const issuedAt = new Date().toISOString();
      const nonce = crypto.randomUUID().replace(/-/g, ""); // SIWE-required nonce (Rabby)
      const domain = typeof window !== "undefined" ? window.location.host : "web3guides.com";
      const uri =
        typeof window !== "undefined" ? `${window.location.origin}/s4/link` : "https://web3guides.com/s4/link";
      const message = buildMessage({ domain, address, uri, nonce, issuedAt, code: code.trim().toUpperCase() });
      const signature = await signMessageAsync({ message });

      const resp = await fetch("/api/s4/link-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, code: code.trim().toUpperCase(), message, signature }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.ok) {
        setError(result.error || `Link failed (HTTP ${resp.status}).`);
        setSubmitting(false);
        return;
      }
      setLinked({
        teamName: result.teamName ?? null,
        accent: typeof result.accent === "string" ? result.accent : ACCENT,
        enlisted: !!result.enlisted,
      });
      setSubmitting(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /reject|deny|user denied|user rejected/i.test(msg)
          ? "Signature cancelled. Nothing happened. Link whenever you are ready."
          : `Signing failed: ${msg}`,
      );
      setSubmitting(false);
    }
  }

  // ── Linked ────────────────────────────────────────────────────────────────
  if (linked) {
    const teamWord = DEFAULT_THEME.team.singular;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ ...cardStyle, borderColor: `${linked.accent}55`, textAlign: "center" }}>
          <div style={labelStyle}>{linked.enlisted ? "Enlisted and linked" : "Linked"}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: linked.accent, margin: "6px 0 10px" }}>
            You are on {linked.teamName || `your ${teamWord}`}
          </div>
          <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            {linked.enlisted ? `We assigned you to the ${teamWord} that needed you most. ` : ""}
            Your wallet and Discord are now one {DEFAULT_THEME.player.singular}. Use{" "}
            <b style={{ color: TEXT }}>/s4 me</b> in the Doma Discord to see your {teamWord} and{" "}
            {DEFAULT_THEME.points}.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <a href="/s4/board" style={primaryBtn(linked.accent)}>
            See the Status Board
          </a>
        </div>
      </div>
    );
  }

  // ── Connect + link ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={cardStyle}>
        <div style={labelStyle}>Step 1 · Get your code</div>
        <p style={{ fontSize: 13, color: FAINT, margin: 0, lineHeight: 1.5 }}>
          In the Doma Discord, run <b style={{ color: TEXT }}>/s4 link</b>. The bot replies (only you
          can see it) with a one-time code that is good for 15 minutes.
        </p>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Step 2 · Connect wallet</div>
        <ConnectButton showBalance={false} accountStatus="address" />
        <p style={{ fontSize: 12.5, color: "#f8b37a", marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
          Connect the <b style={{ color: "#fff" }}>same wallet you hold and play with</b>. A different
          wallet starts a separate {DEFAULT_THEME.player.singular} on a separate {DEFAULT_THEME.team.singular}.
        </p>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Step 3 · Enter code and link</div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={10}
          spellCheck={false}
          autoComplete="off"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            marginBottom: 12,
            background: "rgba(5,7,15,0.7)",
            border: `1px solid ${codeOk ? "#34d39955" : BORDER}`,
            borderRadius: 8,
            color: "#fff",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 4,
            textAlign: "center",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        />
        <button
          onClick={handleLink}
          disabled={!isConnected || !codeOk || submitting}
          style={{
            width: "100%",
            padding: "14px 18px",
            background: !isConnected || !codeOk || submitting ? "rgba(159,176,208,0.25)" : ACCENT,
            color: !isConnected || !codeOk || submitting ? MUTED : "#0b0f1a",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 700,
            cursor: !isConnected || !codeOk || submitting ? "not-allowed" : "pointer",
          }}
        >
          {!isConnected
            ? "Connect a wallet to link"
            : submitting
              ? "Waiting for signature..."
              : "Sign and link Discord"}
        </button>
        <p style={{ fontSize: 12, color: FAINT, marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
          <b style={{ color: "#34d399" }}>No transaction, no gas, no approvals.</b> The signature only
          proves the wallet is yours.
        </p>
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

function primaryBtn(accent: string): React.CSSProperties {
  return {
    background: accent,
    color: "#0b0f1a",
    fontWeight: 700,
    padding: "12px 24px",
    borderRadius: 10,
    textDecoration: "none",
    fontSize: 15,
  };
}
