/**
 * STARFALL /link — bind a wallet-first pilot to a Discord account.
 * In Discord run /stars link to get a one-time code, then here: connect the wallet,
 * enter the code, sign one ownership message (no gas) -> POST /api/stars/link-discord.
 * Same EIP-4361 string + wagmi sign pattern as the enlist form.
 */
"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const GOLD = "#f0b340";
const CREWS: Record<string, { name: string; accent: string }> = {
  vanguard: { name: "Vanguard", accent: "#f0b340" },
  nebula: { name: "Nebula", accent: "#7c6aff" },
  pulsar: { name: "Pulsar", accent: "#5eead4" },
};

function buildMessage(o: { domain: string; address: string; uri: string; issuedAt: string; code: string }) {
  return (
    `${o.domain} wants you to sign in with your Ethereum account:\n` +
    `${o.address}\n\n` +
    `Link this wallet to your Discord for Starfall (Launch Wars Season 3). Signature only, no transaction, no gas, no approvals. Code: ${o.code}\n\n` +
    `URI: ${o.uri}\n` +
    `Version: 1\n` +
    `Chain ID: 1\n` +
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

export function LinkForm() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<{ crew: string | null; enlisted: boolean } | null>(null);

  const codeOk = /^[A-Za-z0-9]{4,10}$/.test(code.trim());

  async function handleLink() {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    if (!codeOk) {
      setError("Enter the code from /stars link in Discord.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const issuedAt = new Date().toISOString();
      const domain = typeof window !== "undefined" ? window.location.host : "stars.web3guides.com";
      const uri =
        typeof window !== "undefined" ? `${window.location.origin}/link` : "https://stars.web3guides.com/link";
      const message = buildMessage({ domain, address, uri, issuedAt, code: code.trim().toUpperCase() });
      const signature = await signMessageAsync({ message });

      const resp = await fetch("/api/stars/link-discord", {
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
      setLinked({ crew: result.crew ?? null, enlisted: !!result.enlisted });
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

  // ── Linked ────────────────────────────────────────────────────────────────
  if (linked) {
    const c = (linked.crew && CREWS[linked.crew]) || { name: linked.crew || "your crew", accent: GOLD };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ ...cardStyle, borderColor: `${c.accent}55`, textAlign: "center" }}>
          <div style={labelStyle}>{linked.enlisted ? "Enlisted & linked" : "Linked"}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: c.accent, margin: "6px 0 10px" }}>
            You fly with {c.name}
          </div>
          <p style={{ fontSize: 14, color: "#aeb6c8", lineHeight: 1.6, margin: 0 }}>
            {linked.enlisted
              ? "We assigned you to the crew that needed you most. "
              : ""}
            Your wallet and Discord are now one pilot. Use <b style={{ color: "#e8ecf5" }}>/stars me</b> in the
            Doma Discord to see your crew, rank, and Starlight.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <a href="/map" style={primaryBtn(c.accent)}>
            See the Sector
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
        <p style={{ fontSize: 13, color: "#7a89b8", margin: 0, lineHeight: 1.5 }}>
          In the Doma Discord, run <b style={{ color: "#e8ecf5" }}>/stars link</b>. The bot replies (only you
          can see it) with a one-time code that’s good for 15 minutes.
        </p>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Step 2 · Connect wallet</div>
        <ConnectButton showBalance={false} accountStatus="address" />
        <p style={{ fontSize: 12.5, color: "#f8b37a", marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
          ⚠️ Connect the <b style={{ color: "#fff" }}>same wallet you enlisted and play with</b> at{" "}
          <b style={{ color: "#e8ecf5" }}>/join</b>. A different wallet starts a separate pilot on a separate crew.
        </p>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Step 3 · Enter code &amp; link</div>
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
            border: `1px solid ${codeOk ? "#34d39955" : "#1c2236"}`,
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
            background: !isConnected || !codeOk || submitting ? "rgba(240,179,64,0.25)" : GOLD,
            color: !isConnected || !codeOk || submitting ? "#aeb6c8" : "#1a1205",
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
              ? "Waiting for signature…"
              : "Sign & link Discord"}
        </button>
        <p style={{ fontSize: 12, color: "#7a89b8", marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
          <b style={{ color: "#34d399" }}>No transaction, no gas, no approvals.</b> The signature only proves
          the wallet is yours.
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
    color: "#1a1205",
    fontWeight: 700,
    padding: "12px 24px",
    borderRadius: 10,
    textDecoration: "none",
    fontSize: 15,
  };
}
