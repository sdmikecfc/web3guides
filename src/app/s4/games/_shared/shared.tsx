/**
 * Season 4 mini-games — shared client harness.
 * A wallet-signed play session (cached in sessionStorage under the ONE key in
 * lib/s4/games), the run-start/score fetch helpers, and a connect+sign gate.
 * Every S4 game imports this; the canvas is the only per-game code.
 * Port of the proven S3 harness (src/app/stars/games/shared.tsx) with the S4
 * upgrades: s4 endpoints, theme-parameterized words, run-start stat payload.
 *
 * THEME WORDS (why DEFAULT_THEME and not the live s4_theme config): these are
 * client components, and the s4_theme override row is a server-only read
 * (service role). So the harness renders the DEFAULT_THEME fields — never a
 * hardcoded themed string. On theme day the theme ships in code anyway (the
 * games ARE the theme), so DEFAULT_THEME carries the same words the server
 * config announces ("Simps" / "Sponsorships" for Doma Beach Party); until
 * then the neutral fallbacks render. Nothing here needs edits on theme day
 * beyond the DEFAULT_THEME/config write itself.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { DEFAULT_THEME } from "@/lib/s4/theme";
import { SESSION_STORAGE_KEY, type PlayerStats } from "@/lib/s4/games";
import { useTelegram, openExternal } from "@/app/s4/_components/TelegramProvider";

/** The one theme object every game surface reads its words from. */
export const THEME = DEFAULT_THEME;

/** The one accent for all S4 game chrome (buttons, titles, highlights). */
export const ACCENT = "#f0b340";

// EIP-4361 requires the Nonce line; without it Rabby shows an "unknown
// signature" caution instead of the trusted SIWE sign-in panel. The server
// (api/s4/game-session) verifies the exact posted bytes and never parses the
// nonce, so this is display-only and does not affect the session.
function buildMessage(address: string, nonce: string, issuedAt: string, domain: string, uri: string) {
  return (
    `${domain} wants you to sign in with your Ethereum account:\n` +
    `${address}\n\n` +
    `Open a ${THEME.seasonName} play session. Signature only, no transaction, no gas, no approvals.\n\n` +
    `URI: ${uri}\n` +
    `Version: 1\n` +
    `Chain ID: 1\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${issuedAt}`
  );
}

export function useS4Session() {
  const tg = useTelegram();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(SESSION_STORAGE_KEY) : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Telegram only: the one-time web link the player must finish first. */
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const tgTried = useRef(false);

  /** Telegram: re-ask for a session (after the player finishes the web link). */
  const retrySession = useCallback(() => {
    tgTried.current = false;
    setError(null);
    setLinkUrl(null);
    setRetryNonce((n) => n + 1);
  }, []);

  // TELEGRAM (Phase 2, Strategy B): the session opens ITSELF from the signed
  // initData. No wallet, no signature, no pop-up ever inside the Mini App. The
  // server verifies the initData HMAC and resolves the wallet the player already
  // bound on the web; if they never did, it hands back a one-time link instead.
  // Guarded by a ref so this fires once per mount, not once per render.
  useEffect(() => {
    if (!tg.ready || !tg.isTelegram || token || tgTried.current) return;
    tgTried.current = true;
    let alive = true;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const resp = await fetch("/api/s4/tg-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: tg.initData }),
        });
        const r = await resp.json();
        if (!alive) return;
        if (r?.needsLink && r?.url) setLinkUrl(String(r.url));
        else if (resp.ok && r?.ok && r?.token) {
          sessionStorage.setItem(SESSION_STORAGE_KEY, String(r.token));
          setToken(String(r.token));
        } else setError(r?.error || "Could not start a session.");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tg.ready, tg.isTelegram, tg.initData, token, retryNonce]);

  // The link is finished OUT on the web, so the player leaves and comes back.
  // Re-check the moment the Mini App is visible again, otherwise they would sit
  // on the setup prompt until they closed and reopened it.
  useEffect(() => {
    if (!tg.isTelegram || !linkUrl) return;
    const recheck = () => {
      if (document.visibilityState === "visible") retrySession();
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [tg.isTelegram, linkUrl, retrySession]);

  const openSession = useCallback(async () => {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const issuedAt = new Date().toISOString();
      const nonce = crypto.randomUUID().replace(/-/g, ""); // SIWE-required nonce (Rabby)
      const domain = window.location.host;
      const uri = `${window.location.origin}/s4/play`;
      const message = buildMessage(address, nonce, issuedAt, domain, uri);
      const signature = await signMessageAsync({ message });
      const resp = await fetch("/api/s4/game-session", {
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
      sessionStorage.setItem(SESSION_STORAGE_KEY, r.token);
      setToken(r.token);
      setBusy(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/reject|deny|user denied|user rejected/i.test(msg) ? "Signature cancelled." : `Sign failed: ${msg}`);
      setBusy(false);
    }
  }, [address, signMessageAsync]);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_STORAGE_KEY);
    tgTried.current = false; // let Telegram re-open a session after an expiry
    setToken(null);
  }, []);

  return {
    address,
    isConnected,
    token,
    busy,
    error,
    openSession,
    reset,
    // Telegram (Phase 2). `tgReady` = we have decided in/out; gate on it so the
    // web connect UI never flashes at a Mini App player.
    isTelegram: tg.isTelegram,
    tgReady: tg.ready,
    linkUrl,
    retrySession,
    webApp: tg.webApp,
  };
}

export type RunStartResult = {
  ok: boolean;
  nonce?: string;
  /** Persistent character baseline (ADR-0004), zeros for a fresh wallet. */
  stats?: PlayerStats;
  error?: string;
};
export type ScoreResult = {
  ok: boolean;
  credits?: number;
  points?: number;
  best?: number;
  improved?: boolean;
  attemptsLeft?: number;
  dailyPointsLeft?: number;
  already?: boolean;
  error?: string;
};

export async function startRun(token: string, game: string): Promise<RunStartResult> {
  const r = await fetch("/api/s4/run-start", {
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
  const r = await fetch("/api/s4/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ t: token, game, score, nonce, meta }),
  });
  return r.json();
}

const cardStyle: React.CSSProperties = {
  background: "rgba(13,17,32,0.72)",
  border: `1px solid ${ACCENT}33`,
  borderRadius: 14,
  padding: "20px 22px",
};

const gateShell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  maxWidth: 420,
  margin: "0 auto",
};
const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  color: ACCENT,
  letterSpacing: 3,
  fontWeight: 700,
  textTransform: "uppercase",
  marginBottom: 10,
};

/** Connect + sign gate. Renders children once a session token exists. */
export function SessionGate({
  session,
  children,
}: {
  session: ReturnType<typeof useS4Session>;
  children: React.ReactNode;
}) {
  if (session.token) return <>{children}</>;

  // Still deciding in/out of Telegram. Stay neutral so a Mini App player never
  // sees the wallet connect UI flash before the Telegram path takes over.
  if (!session.tgReady) {
    return (
      <div style={gateShell}>
        <div style={{ ...cardStyle, textAlign: "center", color: "#aeb6c8", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  // TELEGRAM (Phase 2, Strategy B): no wallet and no signature in here, ever.
  // Either the session is opening itself from initData, or the player still owes
  // the one-time link, which can only be finished out on the web. Copy stays off
  // wallets and chains on purpose: inside Telegram this is just a game.
  if (session.isTelegram) {
    const link = session.linkUrl;
    return (
      <div style={gateShell}>
        <div style={cardStyle}>
          {link ? (
            <>
              <div style={eyebrowStyle}>One-time setup</div>
              <p style={{ fontSize: 14, color: "#cdd4e4", margin: "0 0 14px", lineHeight: 1.6 }}>
                Finish a quick setup in your browser, then come back here to play. It takes about a minute and you only
                do it once.
              </p>
              <button
                onClick={() => openExternal(session.webApp, link)}
                style={{
                  width: "100%",
                  padding: "13px 18px",
                  background: ACCENT,
                  color: "#1a1205",
                  border: "none",
                  borderRadius: 9,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Open setup
              </button>
              {/* The return trip usually re-checks itself on focus; this is the
                  manual way out if that event never lands. */}
              <button
                onClick={session.retrySession}
                style={{
                  marginTop: 10,
                  width: "100%",
                  padding: "11px 18px",
                  background: "transparent",
                  color: "#aeb6c8",
                  border: "1px solid #ffffff26",
                  borderRadius: 9,
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                I finished setup
              </button>
            </>
          ) : session.error ? (
            <>
              <div style={{ fontSize: 13.5, color: "#f87171", lineHeight: 1.55 }}>{session.error}</div>
              <button
                onClick={() => window.location.reload()}
                style={{
                  marginTop: 12,
                  width: "100%",
                  padding: "12px 18px",
                  background: "transparent",
                  color: "#e8ecf5",
                  border: "1px solid #ffffff26",
                  borderRadius: 9,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
            </>
          ) : (
            <div style={{ textAlign: "center", color: "#aeb6c8", fontSize: 14 }}>Starting your session…</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={gateShell}>
      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: ACCENT, letterSpacing: 3, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
          Connect to play
        </div>
        <ConnectButton showBalance={false} accountStatus="address" />
        <p style={{ fontSize: 13, color: "#7a89b8", margin: "12px 0 0", lineHeight: 1.55 }}>
          Sign once (no gas) to open a 12 hour play session. Scores earn{" "}
          <b style={{ color: "#e8ecf5" }}>{THEME.playCurrency}</b> plus a little{" "}
          <b style={{ color: ACCENT }}>{THEME.points}</b> for your {THEME.team.singular}.
        </p>
        <button
          onClick={session.openSession}
          disabled={!session.isConnected || session.busy}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "13px 18px",
            background: !session.isConnected || session.busy ? "rgba(240,179,64,0.25)" : ACCENT,
            color: !session.isConnected || session.busy ? "#aeb6c8" : "#1a1205",
            border: "none",
            borderRadius: 9,
            fontSize: 15,
            fontWeight: 700,
            cursor: !session.isConnected || session.busy ? "not-allowed" : "pointer",
          }}
        >
          {!session.isConnected ? "Connect a wallet" : session.busy ? "Waiting for signature…" : "Sign and start playing"}
        </button>
        {session.error && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#f87171", lineHeight: 1.5 }}>{session.error}</div>
        )}
      </div>
    </div>
  );
}
