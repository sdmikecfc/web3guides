/**
 * STARFALL /join — wallet-first enlist form.
 * Connect wallet -> sign a one-line ownership message (no gas) -> POST
 * /api/stars/join -> auto-assigned to the smallest crew. Reuses the proven
 * EIP-4361 string template + wagmi sign pattern from the wallet-link form.
 */
"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const GOLD = "#f0b340";
const CREWS: Record<string, { name: string; accent: string }> = {
  vanguard: { name: "Vanguard", accent: "#f0b340" },
  nebula: { name: "Nebula", accent: "#7c6aff" },
  pulsar: { name: "Pulsar", accent: "#5eead4" },
};

function buildMessage(o: { domain: string; address: string; uri: string; issuedAt: string }) {
  return (
    `${o.domain} wants you to sign in with your Ethereum account:\n` +
    `${o.address}\n\n` +
    `Enlist in Starfall (Launch Wars Season 3) on Doma. This is a signature only, no transaction, no gas, no approvals. Nothing on this wallet moves.\n\n` +
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

export function JoinForm() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crew, setCrew] = useState<string | null>(null);
  const [welcomeBack, setWelcomeBack] = useState(false);

  // Capture an invite ref CODE (/join?ref=K7M2QF) once, so it survives the wallet-connect detour.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = new URLSearchParams(window.location.search).get("ref");
    if (r && /^[A-Za-z0-9]{4,12}$/.test(r)) {
      try {
        window.localStorage.setItem("sf_ref", r.toUpperCase());
      } catch {
        /* private mode; ref just won't persist */
      }
    }
  }, []);

  function inviteRef(): string | undefined {
    if (typeof window === "undefined") return undefined;
    try {
      return window.localStorage.getItem("sf_ref") || undefined;
    } catch {
      return undefined;
    }
  }

  async function postJoin(payload: Record<string, unknown>) {
    const resp = await fetch("/api/stars/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { resp, result: await resp.json() };
  }

  async function handleEnlist() {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const ref = inviteRef();
      // 1) Try a no-signature enlist. A wallet you linked in a past season is
      //    recognized instantly — no popup. (Fix for "I already connected this.")
      let { resp, result } = await postJoin({ address, ref });

      // 2) Brand-new wallet → the server asks for one ownership signature (no gas).
      if (result?.needsSignature) {
        const issuedAt = new Date().toISOString();
        const domain = typeof window !== "undefined" ? window.location.host : "stars.web3guides.com";
        const uri =
          typeof window !== "undefined"
            ? `${window.location.origin}/join`
            : "https://stars.web3guides.com/join";
        const message = buildMessage({ domain, address, uri, issuedAt });
        const signature = await signMessageAsync({ message });
        ({ resp, result } = await postJoin({ address, message, signature, ref }));
      }

      if (!resp.ok || !result.ok) {
        setError(result.error || `Enlist failed (HTTP ${resp.status}).`);
        setSubmitting(false);
        return;
      }
      setWelcomeBack(!!result.welcomeBack);
      setCrew(result.pilot?.crew ?? null);
      setSubmitting(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /reject|deny|user denied|user rejected/i.test(msg)
          ? "Signature cancelled. Nothing happened. Enlist whenever you're ready."
          : `Signing failed: ${msg}`,
      );
      setSubmitting(false);
    }
  }

  // ── Enlisted ──────────────────────────────────────────────────────────────
  if (crew) {
    const c = CREWS[crew] || { name: crew, accent: GOLD };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ ...cardStyle, borderColor: `${c.accent}55`, textAlign: "center" }}>
          <div style={labelStyle}>{welcomeBack ? "Welcome back" : "Enlisted"}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: c.accent, margin: "6px 0 10px" }}>
            You fly with {c.name}
          </div>
          <p style={{ fontSize: 14, color: "#aeb6c8", lineHeight: 1.6, margin: 0 }}>
            You can switch crews free for the next 24 hours from your profile, your progress carries.
            Smaller crews split the prize fewer ways, so this is a strong place to be.
          </p>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>The deal</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#cdd4e4", fontSize: 14, lineHeight: 1.7 }}>
            <li>Only launched stars pay. Help light all five.</li>
            <li>The top crews split the prize. Your cut grows with how much you fuel your crew.</li>
            <li>Big stars need a crowd, smoothie most of all. Small stars light with just a few.</li>
          </ul>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="/map" style={primaryBtn(c.accent)}>See the Sector</a>
        </div>
        <p style={{ fontSize: 12, color: "#5b6478", textAlign: "center", margin: 0 }}>
          Fueling a star (your first $5 buy) opens when the stars list, from 2026-06-29.
        </p>
      </div>
    );
  }

  // ── Connect + enlist ────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={cardStyle}>
        <div style={labelStyle}>Step 1 · Connect wallet</div>
        <ConnectButton showBalance={false} accountStatus="address" />
        <p style={{ fontSize: 12, color: "#7a89b8", marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
          Your wallet is your pilot. You can link Discord later, no Discord account needed to start.
        </p>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Step 2 · Enlist</div>
        <p style={{ fontSize: 13, color: "#7a89b8", marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
          If you played a past season, you’re recognized instantly. A brand-new wallet signs one short
          message to prove it’s yours.{" "}
          <b style={{ color: "#34d399" }}>No transaction, no gas, no approvals.</b> We auto-assign you to
          the crew that needs you most.
        </p>
        <button
          onClick={handleEnlist}
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
          {!isConnected ? "Connect a wallet to enlist" : submitting ? "Waiting for signature…" : "Sign & enlist"}
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
