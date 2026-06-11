/**
 * Client form for the wallet-link flow.
 *
 * Builds the SIWE message as a plain EIP-4361 string template (no library
 * dependency at render time — the `siwe@3` parser is strict enough to throw
 * during SSR of preview text). The exact same template runs on the server
 * verify endpoint, so what users sign is byte-equivalent to what we verify.
 */

"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";

const C = {
  violet:      "#7c6aff",
  violetLight: "#a78bfa",
  white:       "#f8fafc",
  muted:       "#7a89b8",
  amber:       "#f0b340",
  green:       "#34d399",
  rose:        "#f87171",
  card:        "rgba(13,17,32,0.7)",
};

interface Props {
  code: string;
  discordId: string;
  displayName: string;
  nonce: string;
}

/**
 * EIP-4361 SIWE message template. The exact format the user signs and the
 * server verifies. NO library involved — pure string template so SSR can't
 * throw on render.
 *
 * Format reference: https://eips.ethereum.org/EIPS/eip-4361
 */
function buildSiweMessage(opts: {
  domain: string;
  address: string;
  uri: string;
  statement: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}): string {
  return (
    `${opts.domain} wants you to sign in with your Ethereum account:\n` +
    `${opts.address}\n` +
    `\n` +
    `${opts.statement}\n` +
    `\n` +
    `URI: ${opts.uri}\n` +
    `Version: 1\n` +
    `Chain ID: 1\n` +
    `Nonce: ${opts.nonce}\n` +
    `Issued At: ${opts.issuedAt}\n` +
    `Expiration Time: ${opts.expirationTime}`
  );
}

export function LinkForm({ code, discordId, displayName, nonce }: Props) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Static preview values — actual sign uses fresh now() + the real connected
  // address. The preview is intentionally generic so it renders identically on
  // server (SSR) and client (no hydration mismatch).
  const previewDomain     = "web3guides.com";
  const previewAddress    = address || "0x0000000000000000000000000000000000000000";
  const previewIssuedAt   = "<filled at sign-time>";
  const previewExpiration = "<5 minutes after issued at>";
  const previewMessage    = buildSiweMessage({
    domain:         previewDomain,
    address:        previewAddress,
    uri:            "https://web3guides.com/wallet/link",
    statement:
      `Link this wallet to Discord user @${displayName} (id ${discordId}) on Doma Reporter. ` +
      `This is a signature only — no transaction, no gas, no approvals. Nothing on this wallet moves.`,
    nonce,
    issuedAt:       previewIssuedAt,
    expirationTime: previewExpiration,
  });

  async function handleSignAndLink() {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const issuedAt = new Date();
      const expiration = new Date(issuedAt.getTime() + 5 * 60 * 1000);
      const domain = typeof window !== "undefined" ? window.location.host : "web3guides.com";
      const uri    = typeof window !== "undefined"
        ? `${window.location.origin}/wallet/link`
        : "https://web3guides.com/wallet/link";

      const message = buildSiweMessage({
        domain,
        address,
        uri,
        statement:
          `Link this wallet to Discord user @${displayName} (id ${discordId}) on Doma Reporter. ` +
          `This is a signature only — no transaction, no gas, no approvals. Nothing on this wallet moves.`,
        nonce,
        issuedAt:       issuedAt.toISOString(),
        expirationTime: expiration.toISOString(),
      });

      const signature = await signMessageAsync({ message });

      const resp = await fetch("/api/wallet/verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ code, message, signature, address }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.ok) {
        setError(result.error || `Verification failed (HTTP ${resp.status}).`);
        setSubmitting(false);
        return;
      }
      router.push(`/wallet/linked?address=${encodeURIComponent(address)}&name=${encodeURIComponent(displayName)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/reject|deny|user denied|user rejected/i.test(msg)) {
        setError("Signature cancelled. Nothing happened. Try again whenever you're ready.");
      } else {
        setError(`Signing failed: ${msg}`);
      }
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Step 1: Connect wallet */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.violet}33`,
          borderRadius: 12,
          padding: "18px 20px",
        }}
      >
        <div style={{ fontSize: 12, color: C.violetLight, letterSpacing: 3, fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>
          Step 1 · Connect wallet
        </div>
        <ConnectButton showBalance={false} accountStatus="address" />
      </div>

      {/* Step 2: Pre-sign preview */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.violet}33`,
          borderRadius: 12,
          padding: "18px 20px",
        }}
      >
        <div style={{ fontSize: 12, color: C.violetLight, letterSpacing: 3, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>
          Step 2 · Review what you'll sign
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
          Your wallet will pop up showing this exact text (with a fresh timestamp filled in). <b style={{ color: C.green }}>No transaction, no gas, no approvals.</b>
        </div>
        <pre
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            color: C.white,
            background: "rgba(0,0,0,0.35)",
            border: `1px solid ${C.violet}22`,
            borderRadius: 6,
            padding: "12px 14px",
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.5,
          }}
        >
          {previewMessage}
        </pre>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
          🔧 <b>Note:</b> "Chain ID 1" appears because SIWE identity proofs use Ethereum mainnet as the
          standard reference. Your wallet works the same on every EVM chain (including Doma) — no chain
          switching needed.
        </div>
      </div>

      {/* Step 3: Sign & link */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.violet}33`,
          borderRadius: 12,
          padding: "18px 20px",
        }}
      >
        <div style={{ fontSize: 12, color: C.violetLight, letterSpacing: 3, fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>
          Step 3 · Sign & link
        </div>
        <button
          onClick={handleSignAndLink}
          disabled={!isConnected || submitting}
          style={{
            width: "100%",
            padding: "14px 18px",
            background: !isConnected || submitting ? "rgba(124,106,255,0.2)" : C.violet,
            color: C.white,
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 700,
            cursor: !isConnected || submitting ? "not-allowed" : "pointer",
            transition: "background 0.15s ease",
          }}
        >
          {!isConnected ? "Connect a wallet to continue" : submitting ? "Waiting for signature…" : "Sign message & link wallet"}
        </button>

        {error && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "rgba(248,113,113,0.08)",
              border: `1px solid ${C.rose}55`,
              borderRadius: 6,
              fontSize: 13,
              color: C.rose,
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
