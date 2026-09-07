/**
 * Season 4 /s4/join — WALLET-FIRST enlist form (Mike 2026-07-15).
 * Connect wallet -> sign a one-line ownership message (no gas) -> POST
 * /api/s4/join -> auto-assigned to the smallest team. You link Discord LATER;
 * no Discord account is needed to start. Ported from the proven S3 /stars/join
 * form; SIWE message carries the required Nonce line (Rabby shows the trusted
 * sign-in panel instead of an "unknown signature" caution).
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
    `Enlist in ${TH.seasonName} on Doma. Signature only, no transaction, no gas, no approvals. Nothing on this wallet moves.\n\n` +
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

type Enlisted = { teamName: string; accent: string; welcomeBack: boolean; linked: boolean };

export function JoinForm() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlisted, setEnlisted] = useState<Enlisted | null>(null);

  async function postJoin(payload: Record<string, unknown>) {
    const resp = await fetch("/api/s4/join", {
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
      // 1) Try a no-signature enlist. A wallet already in this season is
      //    recognized instantly, no popup.
      let { resp, result } = await postJoin({ address });

      // 2) Brand-new wallet -> the server asks for one ownership signature (no gas).
      if (result?.needsSignature) {
        const issuedAt = new Date().toISOString();
        const nonce = crypto.randomUUID().replace(/-/g, ""); // SIWE-required nonce (Rabby)
        const domain = typeof window !== "undefined" ? window.location.host : "assassin.web3guides.com";
        const uri =
          typeof window !== "undefined" ? `${window.location.origin}/s4/join` : "https://assassin.web3guides.com/s4/join";
        const message = buildMessage({ domain, address, uri, nonce, issuedAt });
        const signature = await signMessageAsync({ message });
        ({ resp, result } = await postJoin({ address, message, signature }));
      }

      if (!resp.ok || !result.ok) {
        setError(result.error || `Enlist failed (HTTP ${resp.status}).`);
        setSubmitting(false);
        return;
      }
      setEnlisted({
        teamName: typeof result.teamName === "string" ? result.teamName : "your team",
        accent: typeof result.accent === "string" ? result.accent : GOLD,
        welcomeBack: !!result.welcomeBack,
        linked: !!result.linked,
      });
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
  if (enlisted) {
    const accent = enlisted.accent;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ ...cardStyle, borderColor: `${accent}55`, textAlign: "center" }}>
          <div style={labelStyle}>{enlisted.welcomeBack ? "Welcome back" : "You're in"}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: accent, margin: "6px 0 10px" }}>
            You run with {enlisted.teamName}
          </div>
          <p style={{ fontSize: 14, color: "#aeb6c8", lineHeight: 1.6, margin: 0 }}>
            Your wallet is your {TH.player.singular}. You can switch {TH.team.plural} free for 24 hours from Discord;
            your progress carries. Smaller {TH.team.plural} split the prize fewer ways.
          </p>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Next</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#cdd4e4", fontSize: 14, lineHeight: 1.7 }}>
            <li>
              Hold a featured {TH.target.singular} from <b style={{ color: "#34d399" }}>$5</b>. Holding earns{" "}
              {TH.points} every day, and closing {TH.target.plural} pays the top {TH.team.plural} at season end.
            </li>
            <li>
              {enlisted.linked ? (
                <>Your Discord is linked. Post, duel and claim from there.</>
              ) : (
                <>
                  Link your Discord anytime to post, duel and claim. Run <b>/assassin link</b> in Discord for a code,
                  then connect it. Not required to start earning.
                </>
              )}
            </li>
          </ul>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="/s4/map" style={primaryBtn(accent)}>
            See the {TH.target.plural}
          </a>
          <a href="/s4/me" style={ghostBtn()}>
            Your agent
          </a>
          <a href="/s4/play" style={ghostBtn()}>
            Play the arcade
          </a>
          {!enlisted.linked && (
            <a href="/s4/link" style={ghostBtn()}>
              Link Discord
            </a>
          )}
        </div>
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
          Your wallet is your {TH.player.singular}. You can link Discord later, no Discord account needed to start.
        </p>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Step 2 · Enlist</div>
        <p style={{ fontSize: 13, color: "#7a89b8", marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
          If you played a past season, you are recognized instantly. A brand-new wallet signs one short message to
          prove it is yours. <b style={{ color: "#34d399" }}>No transaction, no gas, no approvals.</b> We auto-assign
          you to the {TH.team.singular} that needs you most.
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
function ghostBtn(): React.CSSProperties {
  return {
    background: "transparent",
    color: "#e8ecf5",
    fontWeight: 600,
    padding: "12px 22px",
    borderRadius: 10,
    textDecoration: "none",
    fontSize: 15,
    border: "1px solid #ffffff26",
  };
}
