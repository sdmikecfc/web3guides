/**
 * STARFALL — the Salvage Shipyard (spend Salvage on ship components + paint).
 * Reuses the games' wallet session (sf_game_token). Server is authoritative on every
 * price; this page only renders the catalog from /api/stars/shop and posts buys.
 * "Salvage buys looks. Starlight wins cash." — upgrades are earned by play, never money.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useStarSession, SessionGate } from "../games/shared";

const GOLD = "#f0b340";
const CREW_ACCENT: Record<string, string> = { vanguard: "#f0b340", nebula: "#7c6aff", pulsar: "#5eead4" };
const RANK_NAMES = [
  "Recruit", "Cadet", "Ensign", "Pilot",
  "Lieutenant", "Wing Commander", "Squadron Leader", "Captain",
  "Commodore", "Vice Admiral", "Admiral", "Fleet Admiral",
];

interface Comp {
  key: string;
  name: string;
  emoji: string;
  effect: string;
  level: number;
  max: number;
  maxed: boolean;
  nextCost: number | null;
}
interface Paint {
  key: string;
  name: string;
  hex: string | null;
  price: number;
  owned: boolean;
  equipped: boolean;
}
interface ShopData {
  ok: boolean;
  rank: number;
  crew: string | null;
  balance: number;
  components: Comp[];
  paints: Paint[];
  error?: string;
}

const panel: React.CSSProperties = {
  background: "rgba(13,17,32,0.72)",
  border: "1px solid #1c2236",
  borderRadius: 14,
  padding: 16,
};

function Pips({ level, max, accent }: { level: number; max: number; accent: string }) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: i < level ? accent : "#262d44",
            boxShadow: i < level ? `0 0 6px ${accent}99` : "none",
          }}
        />
      ))}
    </div>
  );
}

function ShopInner({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [data, setData] = useState<ShopData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/stars/shop?t=${encodeURIComponent(token)}`);
      const j: ShopData = await r.json();
      if (!j.ok) {
        // a stale/expired token must bounce back to the sign-in gate, not a dead Retry
        if (r.status === 401 || /session expired|sign in/i.test(j.error || "")) return onExpired();
        return setErr(j.error || "Could not load the shipyard.");
      }
      setData(j);
      setErr(null);
    } catch {
      setErr("Network hiccup. Try again.");
    }
  }, [token, onExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const buy = async (action: "upgrade" | "paint", key: string) => {
    setBusy(`${action}:${key}`);
    setFlash(null);
    try {
      const r = await fetch("/api/stars/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, action, key }),
      });
      const j = await r.json();
      if (!j.ok) {
        if (r.status === 401 || /session expired|sign in/i.test(j.error || "")) return onExpired();
        setFlash({ ok: false, msg: j.error || "That didn't go through." });
      } else {
        setData((d) =>
          d
            ? {
                ...d,
                balance: typeof j.balance === "number" ? j.balance : d.balance,
                components: j.components ?? d.components,
                paints: j.paints ?? d.paints,
              }
            : d,
        );
        setFlash({ ok: true, msg: action === "upgrade" ? `${key[0].toUpperCase()}${key.slice(1)} upgraded.` : "Paint equipped." });
      }
    } catch {
      setFlash({ ok: false, msg: "Network hiccup." });
    }
    setBusy(null);
  };

  if (err) {
    const noPilot = /no pilot/i.test(err);
    return (
      <div style={{ ...panel, textAlign: "center", maxWidth: 420, margin: "0 auto" }}>
        <p style={{ color: "#aeb6c8", fontSize: 14, lineHeight: 1.6, margin: "0 0 14px" }}>
          {noPilot ? "Enlist a pilot first, then come back to outfit your ship." : err}
        </p>
        {noPilot ? (
          <Link href="/join" style={btn(true)}>Enlist</Link>
        ) : (
          <button onClick={() => void load()} style={btn(true)}>Retry</button>
        )}
      </div>
    );
  }
  if (!data) return <p style={{ textAlign: "center", color: "#7a89b8", fontSize: 14 }}>Loading the shipyard…</p>;

  const equippedPaint = data.paints.find((p) => p.equipped);
  const accent = equippedPaint?.hex || CREW_ACCENT[data.crew || ""] || GOLD;
  const rank = Math.max(1, Math.min(12, data.rank || 1));
  const hull = `/stars-art/hull-${String(rank).padStart(2, "0")}.png`;
  const rankName = RANK_NAMES[rank - 1] || "Pilot";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Balance + the one-line rule */}
      <div style={{ ...panel, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#7a89b8", textTransform: "uppercase", fontWeight: 700 }}>Salvage</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>◇ {data.balance.toLocaleString()}</div>
        </div>
        <div style={{ fontSize: 12, color: "#8b95ad", textAlign: "right", maxWidth: 180, lineHeight: 1.5 }}>
          Salvage buys looks. <b style={{ color: GOLD }}>Starlight</b> wins cash. Earn Salvage by playing.
        </div>
      </div>

      {/* Ship card */}
      <div style={{ ...panel, position: "relative", overflow: "hidden", paddingTop: 18 }}>
        <div
          style={{
            position: "absolute", inset: 0,
            background: `radial-gradient(420px 200px at 50% 38%, ${accent}22 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hull}
            alt={rankName}
            onError={(e) => { (e.currentTarget.style.display = "none"); }}
            style={{ width: "100%", maxWidth: 320, height: 150, objectFit: "contain", filter: `drop-shadow(0 6px 18px ${accent}55)` }}
          />
          <div style={{ marginTop: 6, fontSize: 19, fontWeight: 800, color: "#fff" }}>{rankName}</div>
          <div style={{ fontSize: 12.5, color: "#8b95ad", marginTop: 2 }}>
            Rank {rank} / 12{data.crew ? ` · ${data.crew[0].toUpperCase()}${data.crew.slice(1)}` : ""}
          </div>
          <div style={{ marginTop: 8, height: 2, width: 64, margin: "8px auto 0", background: accent, borderRadius: 2, opacity: 0.8 }} />
        </div>
      </div>

      {flash && (
        <div style={{ fontSize: 13.5, color: flash.ok ? "#86f0c4" : "#f8b37a", textAlign: "center" }}>{flash.msg}</div>
      )}

      {/* Components */}
      <div style={{ fontSize: 12, letterSpacing: 2, color: "#7a89b8", textTransform: "uppercase", fontWeight: 700, margin: "2px 2px -2px" }}>
        Upgrades
      </div>
      {data.components.map((c) => {
        const afford = c.nextCost != null && data.balance >= c.nextCost;
        const id = `upgrade:${c.key}`;
        return (
          <div key={c.key} style={{ ...panel, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 26, width: 30, textAlign: "center" }}>{c.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#e8ecf5" }}>{c.name}</span>
                <Pips level={c.level} max={c.max} accent={accent} />
              </div>
              <div style={{ fontSize: 12, color: "#8b95ad", marginTop: 3, lineHeight: 1.4 }}>{c.effect}</div>
            </div>
            <button
              onClick={() => !c.maxed && afford && buy("upgrade", c.key)}
              disabled={c.maxed || !afford || busy === id}
              style={btn(!c.maxed && afford && busy !== id, c.maxed)}
            >
              {c.maxed ? "Maxed" : busy === id ? "…" : afford ? `◇ ${c.nextCost!.toLocaleString()}` : `Need ◇ ${(c.nextCost! - data.balance).toLocaleString()}`}
            </button>
          </div>
        );
      })}

      {/* Paint */}
      <div style={{ fontSize: 12, letterSpacing: 2, color: "#7a89b8", textTransform: "uppercase", fontWeight: 700, margin: "6px 2px -2px" }}>
        Paint
      </div>
      <div style={{ ...panel, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {data.paints.map((p) => {
          const swatch = p.hex || CREW_ACCENT[data.crew || ""] || GOLD;
          const id = `paint:${p.key}`;
          const label = p.equipped ? "On" : p.owned ? "Equip" : `◇ ${p.price}`;
          return (
            <button
              key={p.key}
              onClick={() => !p.equipped && busy !== id && buy("paint", p.key)}
              disabled={p.equipped || busy === id}
              title={p.name}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                background: "transparent", border: "none", cursor: p.equipped ? "default" : "pointer", padding: 2,
              }}
            >
              <span
                style={{
                  width: 38, height: 38, borderRadius: "50%", background: swatch,
                  border: p.equipped ? `2px solid #fff` : `2px solid ${swatch}66`,
                  boxShadow: p.equipped ? `0 0 10px ${swatch}` : "none",
                }}
              />
              <span style={{ fontSize: 11, color: p.equipped ? "#fff" : "#9aa6c2", fontWeight: 600 }}>
                {busy === id ? "…" : label}
              </span>
            </button>
          );
        })}
      </div>

      <p style={{ color: "#5b6478", fontSize: 12, textAlign: "center", lineHeight: 1.55, marginTop: 4 }}>
        Upgrades show on your ship and boost battles and raids. Earned by playing, never bought with money. Your held position only ever earns Starlight.
      </p>
    </div>
  );
}

function btn(active: boolean, muted = false): React.CSSProperties {
  return {
    padding: "9px 14px",
    borderRadius: 9,
    border: "none",
    fontSize: 13.5,
    fontWeight: 700,
    whiteSpace: "nowrap",
    textDecoration: "none",
    cursor: active ? "pointer" : "default",
    background: muted ? "rgba(134,240,196,0.14)" : active ? GOLD : "rgba(240,179,64,0.18)",
    color: muted ? "#86f0c4" : active ? "#1a1205" : "#aeb6c8",
  };
}

export default function ShopPage() {
  const session = useStarSession();
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "radial-gradient(900px 500px at 50% -10%, #131a2e 0%, #060912 60%)",
        color: "#e8ecf5",
        padding: "28px 16px 64px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Link href="/games" style={{ color: "#cdd4e4", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>‹ Arcade</Link>
          <span style={{ fontSize: 12, letterSpacing: 2, color: GOLD, textTransform: "uppercase", fontWeight: 700 }}>Shipyard</span>
        </div>
        <SessionGate session={session}>{session.token && <ShopInner token={session.token} onExpired={session.reset} />}</SessionGate>
      </div>
    </main>
  );
}
