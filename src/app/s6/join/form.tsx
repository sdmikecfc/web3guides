/**
 * Season 5 /s5/join, WALLET-FIRST enlist form (port of the proven S4 form).
 * Connect wallet -> sign a one-line ownership message (no gas) -> POST
 * /api/s6/join -> everyone lands on The Iron Column. Discord links later.
 * The SIWE message carries the required Nonce line (Rabby shows the trusted
 * sign-in panel instead of an "unknown signature" caution). No em-dashes.
 */
"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { DEFAULT_THEME } from "@/lib/s6/theme";
import { STRINGS, fill, type S6Dict } from "@/lib/s6/strings";
import { clientLocale } from "@/lib/s6/locale";
import { track, rememberRef, storedRef } from "@/lib/s6/track";

const STEEL = "#9aa7b4";
const TH = DEFAULT_THEME;

/** Render a dict template with ONE {ph} placeholder replaced by a styled node
 * (word order stays natural per language; a template without the placeholder
 * just renders whole). */
function withNode(tpl: string, ph: string, node: React.ReactNode): React.ReactNode {
  const parts = tpl.split(`{${ph}}`);
  if (parts.length < 2) return tpl;
  return (
    <>
      {parts[0]}
      {node}
      {parts[1]}
    </>
  );
}

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
  background: "rgba(18,22,27,0.72)",
  border: `1px solid ${STEEL}33`,
  borderRadius: 12,
  padding: "18px 20px",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: STEEL,
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
  const [d, setD] = useState<S6Dict>(STRINGS.en);
  useEffect(() => {
    const loc = clientLocale();
    if (loc !== "en") setD(STRINGS[loc]);
  }, []);

  // A join page opened straight from an invite link (?ref=CODE) must remember
  // the code even when the visitor never touched the landing page.
  useEffect(() => {
    rememberRef();
  }, []);

  async function postJoin(payload: Record<string, unknown>) {
    // First-touch referral attribution (ADR-0068 §3): the server uses it only
    // at row creation, resolves it to a real player, and ignores garbage.
    const ref = storedRef();
    const resp = await fetch("/api/s6/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ref ? { ...payload, ref } : payload),
    });
    return { resp, result: await resp.json() };
  }

  async function handleEnlist() {
    if (!address) {
      setError(d.join.connectFirst);
      return;
    }
    setError(null);
    setSubmitting(true);
    track("connect_start");
    try {
      // 1) Try a no-signature enlist. A wallet already in this season is
      //    recognized instantly, no popup.
      let { resp, result } = await postJoin({ address });

      // 2) Brand-new wallet -> one ownership signature (no gas).
      if (result?.needsSignature) {
        const issuedAt = new Date().toISOString();
        const nonce = crypto.randomUUID().replace(/-/g, ""); // SIWE-required nonce (Rabby)
        const domain = typeof window !== "undefined" ? window.location.host : "launchwars.xyz";
        const uri =
          typeof window !== "undefined" ? `${window.location.origin}/s6/join` : "https://launchwars.xyz/s6/join";
        const message = buildMessage({ domain, address, uri, nonce, issuedAt });
        const signature = await signMessageAsync({ message });
        track("siwe_ok");
        track("join_signed");
        ({ resp, result } = await postJoin({ address, message, signature }));
      }

      if (!resp.ok || !result.ok) {
        setError(result.error || fill(d.join.enlistFailed, { status: resp.status }));
        setSubmitting(false);
        return;
      }
      track("join_done");
      setEnlisted({
        teamName: typeof result.teamName === "string" ? result.teamName : "The Iron Column",
        accent: typeof result.accent === "string" ? result.accent : STEEL,
        welcomeBack: !!result.welcomeBack,
        linked: !!result.linked,
      });
      setSubmitting(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /reject|deny|user denied|user rejected/i.test(msg)
          ? d.join.cancelled
          : fill(d.join.signingFailed, { msg }),
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
          <div style={labelStyle}>{enlisted.welcomeBack ? d.join.welcomeBack : d.join.enlistedTitle}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: accent, margin: "6px 0 10px" }}>
            {fill(d.join.fightWith, { team: enlisted.teamName })}
          </div>
          <p style={{ fontSize: 14, color: "#aab4bd", lineHeight: 1.6, margin: 0 }}>
            {d.join.enlistedNote}
          </p>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>{d.join.nextLabel}</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#cdd4dc", fontSize: 14, lineHeight: 1.7 }}>
            <li>{withNode(d.join.next1, "amt", <b style={{ color: "#34d399" }}>$5</b>)}</li>
            {/* The success screen used to name "$5" twice and never say where
                the money comes from (2026-07-27 audit, F2/decision point 2).
                The wizard is the answer and now has a door right here. */}
            <li>{d.join.next2Fund}</li>
            <li>{enlisted.linked ? d.join.next2Linked : d.join.next2Unlinked}</li>
          </ul>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="/s6" style={primaryBtn(accent)}>
            {d.join.seeMap}
          </a>
          <a href="/s6/hq#wizard" style={ghostBtn()} data-testid="join-fund">
            {d.join.fundCta}
          </a>
          <a href="/s6" style={ghostBtn()}>
            {d.links.hq}
          </a>
          <a href="/s6/play" style={ghostBtn()}>
            {d.join.playArcade}
          </a>
        </div>
      </div>
    );
  }

  // ── Connect + enlist ────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={cardStyle}>
        <h2 style={{ ...labelStyle, margin: 0, marginBottom: 10 }}>{d.join.step1}</h2>
        <ConnectButton showBalance={false} accountStatus="address" />
        <p style={{ fontSize: 12, color: "#87919b", marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
          {d.join.step1Note}
        </p>
      </div>
      <div style={cardStyle}>
        <h2 style={{ ...labelStyle, margin: 0, marginBottom: 10 }}>{d.join.step2}</h2>
        <p style={{ fontSize: 13, color: "#87919b", marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
          {d.join.step2Note} <b style={{ color: "#34d399" }}>{d.join.step2Safety}</b>{" "}
          {fill(d.join.step2Team, { team: TH.teams[0].name })}
        </p>
        <button
          onClick={handleEnlist}
          disabled={!isConnected || submitting}
          style={{
            width: "100%",
            padding: "14px 18px",
            background: !isConnected || submitting ? "rgba(154,167,180,0.25)" : STEEL,
            color: !isConnected || submitting ? "#aab4bd" : "#0b0d10",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 700,
            cursor: !isConnected || submitting ? "not-allowed" : "pointer",
          }}
        >
          {!isConnected ? d.join.buttonConnect : submitting ? d.join.buttonWaiting : d.join.buttonSign}
        </button>
        {error && (
          <div
            role="alert"
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
    color: "#0b0d10",
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
    color: "#e9edf1",
    fontWeight: 600,
    padding: "12px 22px",
    borderRadius: 10,
    textDecoration: "none",
    fontSize: 15,
    border: "1px solid #ffffff26",
  };
}
