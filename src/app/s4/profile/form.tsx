/**
 * /s4/profile — the client record view. Opens a play session (reusing the games'
 * useS4Session), loads /api/s4/profile, and shows Bounty, team standing,
 * holdings, and a Link Discord prompt when the wallet has no Discord bound yet.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useS4Session, SessionGate } from "../games/_shared/shared";
import { DEFAULT_THEME } from "@/lib/s4/theme";

const GOLD = "#f0b340";
const TH = DEFAULT_THEME;

type Holding = { domain: string; held: number };
type ProfileState = {
  ok: true;
  enlisted: boolean;
  name: string;
  points: number;
  rank: number;
  team: { key: string; name: string; accent: string } | null;
  teamStanding: number;
  teamCount: number;
  heldTotal: number;
  holdings: Holding[];
  discordLinked: boolean;
  contractsClosed: number;
  contractsTotal: number;
};

const card: React.CSSProperties = {
  background: "rgba(13,17,32,0.72)",
  border: `1px solid ${GOLD}33`,
  borderRadius: 14,
  padding: "18px 20px",
};
const eyebrow: React.CSSProperties = {
  fontSize: 12,
  color: GOLD,
  letterSpacing: 3,
  fontWeight: 700,
  textTransform: "uppercase",
  marginBottom: 12,
};

export function ProfileForm() {
  const session = useS4Session();
  return (
    <SessionGate session={session}>
      <Record token={session.token || ""} onExpire={session.reset} />
    </SessionGate>
  );
}

function Record({ token, onExpire }: { token: string; onExpire: () => void }) {
  const [state, setState] = useState<ProfileState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/s4/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      const r = await resp.json();
      if (resp.status === 401) return onExpire();
      if (!resp.ok || !r.ok) setError(r.error || "Could not load your record.");
      else setState(r as ProfileState);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, onExpire]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !state) {
    return <div style={{ ...card, textAlign: "center", color: "#aeb6c8" }}>Loading your record…</div>;
  }
  if (!state) {
    return (
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ color: "#f87171", fontSize: 14, lineHeight: 1.6 }}>{error || "Could not load your record."}</div>
        <button onClick={() => void load()} style={ghostBtn} disabled={loading}>
          Try again
        </button>
      </div>
    );
  }

  const usd = (n: number) => `$${n.toLocaleString()}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* The beautiful shareable card (renders on Vercel; degrades to nothing if
          it fails, so the record below always shows). */}
      <CardImage token={token} />

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Metric label={TH.points} value={state.points.toLocaleString()} color={GOLD} />
        <Metric
          label="Standing"
          value={state.teamStanding ? `#${state.teamStanding} of ${state.teamCount}` : "Unranked"}
          color="#e8ecf5"
        />
        <Metric label="Held" value={usd(state.heldTotal)} color="#34d399" />
      </div>

      {/* Holdings */}
      <div style={card}>
        <div style={eyebrow}>What you are holding</div>
        {state.holdings.length ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {state.holdings.map((h) => (
              <div
                key={h.domain}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "9px 2px",
                  borderBottom: "1px solid #ffffff10",
                  fontSize: 14,
                }}
              >
                <span style={{ color: "#e8ecf5" }}>{h.domain}</span>
                <span style={{ color: "#34d399", fontFamily: "monospace" }}>{usd(h.held)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 14, color: "#aeb6c8", margin: 0, lineHeight: 1.6 }}>
            Not holding a {TH.target.singular} yet. Buy any live one from <b style={{ color: "#34d399" }}>$5</b> and hold
            to earn {TH.points} every day.{" "}
            <a href="/s4/map" style={{ color: GOLD, fontWeight: 600 }}>
              See the {TH.target.plural}
            </a>
          </p>
        )}
      </div>

      {/* Link Discord */}
      {state.discordLinked ? (
        <div style={{ ...card, borderColor: "#34d39944", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#34d399", fontSize: 18 }}>✓</span>
          <span style={{ fontSize: 14, color: "#cdd4e4" }}>
            Your Discord is linked. Post, duel, and claim from the server.
          </span>
        </div>
      ) : (
        <div style={{ ...card, borderColor: `${GOLD}55` }}>
          <div style={eyebrow}>Link your Discord</div>
          <p style={{ fontSize: 14, color: "#cdd4e4", margin: "0 0 14px", lineHeight: 1.6 }}>
            Playing on the web is enough to earn {TH.points}. Link your Discord to also post, duel, and claim your
            rewards. Run <b style={{ color: "#e8ecf5", fontFamily: "monospace" }}>/assassin link</b> in Discord for a
            one-time code, then redeem it here.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/s4/link" style={primaryBtn}>
              Redeem a link code
            </a>
            <a href="https://discord.gg/doma" target="_blank" rel="noreferrer" style={ghostLink}>
              Open Discord
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function CardImage({ token }: { token: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let obj: string | null = null;
    (async () => {
      try {
        const resp = await fetch("/api/s4/card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: token }),
        });
        if (!resp.ok) {
          if (alive) setFailed(true);
          return;
        }
        obj = URL.createObjectURL(await resp.blob());
        if (alive) setUrl(obj);
        else URL.revokeObjectURL(obj);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [token]);

  async function share() {
    if (!url) return;
    try {
      const file = new File([await (await fetch(url)).blob()], "hitlist-agent.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch {
      /* fall through to opening the image */
    }
    window.open(url, "_blank");
  }

  if (failed) return null;
  if (!url) return <div style={{ ...card, textAlign: "center", color: "#aeb6c8" }}>Rendering your card…</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Your personnel card" style={{ width: "100%", borderRadius: 14, border: `1px solid ${GOLD}33`, display: "block" }} />
      <div style={{ display: "flex", gap: 10 }}>
        <a href={url} download="hitlist-agent.png" style={{ ...primaryBtn, flex: 1, textAlign: "center" }}>
          Download card
        </a>
        <button onClick={share} style={{ ...ghostLink, flex: 1, cursor: "pointer" }}>
          Share
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "14px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#7a89b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  marginTop: 12,
  background: "transparent",
  color: "#e8ecf5",
  border: "1px solid #ffffff26",
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  background: GOLD,
  color: "#1a1205",
  fontWeight: 700,
  padding: "11px 18px",
  borderRadius: 9,
  textDecoration: "none",
  fontSize: 14,
};
const ghostLink: React.CSSProperties = {
  background: "transparent",
  color: "#e8ecf5",
  fontWeight: 600,
  padding: "11px 16px",
  borderRadius: 9,
  textDecoration: "none",
  fontSize: 14,
  border: "1px solid #ffffff26",
};
