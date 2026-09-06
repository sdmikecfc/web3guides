/**
 * /s4/me — the CHARACTER PAGE (Mike 2026-07-15: "a Character page with their
 * current Gold, the shop with the upgrades, a way to pick your character from a
 * grid, and a preview of your current character").
 *
 * Opens a play session (connect + one signature, reusing the games' useS4Session
 * so a token from a game works here too), then:
 *  - PREVIEW: your current character big, name, team, Gold, gender toggle.
 *  - SHOP: buy gear levels with Gold (POST /api/s4/upgrade) — each level is a new
 *    look and more power in the games. Server-priced, spend fail-closed.
 *  - GRID: pick your character from the looks you own (tap to wear), plus a
 *    preview of what your next gear level unlocks.
 * Every look renders its real art with a silhouette onError fallback.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useS4Session, SessionGate } from "../games/_shared/shared";

const GOLD = "#f0b340";
const DISCORD_HINT = "Upgrades bank forever. Your look shows on the map, your card, and every share.";

type ShopRow = { key: string; name: string; blurb: string; level: number; max: number; nextPrice: number | null };
type LookTile = { key: string; art: string; isCurrent: boolean; isWorn: boolean };
type UnlockTile = { stat: string; statName: string; toLevel: number; key: string; art: string };
type ModelState = {
  ok: true;
  team: { key: string; name: string; accent: string } | null;
  gender: "f" | "m";
  gold: number;
  stats: { botox: number; drugs: number; ozempic: number; aura: number };
  shop: ShopRow[];
  currentKey: string;
  wornKey: string | null;
  looks: LookTile[];
  next: UnlockTile[];
};

const SILHOUETTE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 140'><rect width='100' height='140' fill='%230d1120'/><circle cx='50' cy='52' r='22' fill='%232a3350'/><path d='M18 130c0-22 14-38 32-38s32 16 32 38z' fill='%232a3350'/></svg>`,
  );

function Portrait({ src, alt, size }: { src: string; alt: string; size: number }) {
  const failed = useRef(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={Math.round(size * 1.4)}
      onError={(e) => {
        if (failed.current) return;
        failed.current = true;
        (e.currentTarget as HTMLImageElement).src = SILHOUETTE;
      }}
      style={{ width: size, height: Math.round(size * 1.4), objectFit: "cover", display: "block", borderRadius: 10 }}
    />
  );
}

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

export function MeForm() {
  const session = useS4Session();
  return (
    <SessionGate session={session}>
      <Character token={session.token || ""} onExpire={session.reset} />
    </SessionGate>
  );
}

function Character({ token, onExpire }: { token: string; onExpire: () => void }) {
  const [state, setState] = useState<ModelState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/s4/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      const r = await resp.json();
      if (resp.status === 401) return onExpire();
      if (!resp.ok || !r.ok) setError(r.error || "Could not load your agent.");
      else setState(r as ModelState);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, onExpire]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (url: string, payload: Record<string, unknown>, okMsg?: (s: ModelState) => string) => {
      setSaving(true);
      setError(null);
      setMsg(null);
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: token, ...payload }),
        });
        const r = await resp.json();
        if (resp.status === 401) return onExpire();
        if (!resp.ok || !r.ok) setError(r.error || "That did not go through.");
        else {
          setState(r as ModelState);
          if (okMsg) setMsg(okMsg(r as ModelState));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [token, onExpire],
  );

  const wear = (look: string) => post("/api/s4/wear", { look });
  const setGender = (gender: "f" | "m") => post("/api/s4/wear", { gender });
  const upgrade = (stat: string, name: string) =>
    post("/api/s4/upgrade", { stat }, (s) => `${name} upgraded. ${s.gold.toLocaleString()} Gold left.`);

  if (loading && !state) {
    return <div style={{ ...card, textAlign: "center", color: "#aeb6c8" }}>Loading your character…</div>;
  }
  if (!state) {
    return (
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ color: "#f87171", fontSize: 14, lineHeight: 1.6 }}>{error || "Could not load your character."}</div>
        <button onClick={() => void load()} style={ghostBtn} disabled={loading}>
          Try again
        </button>
      </div>
    );
  }

  const accent = state.team?.accent || GOLD;
  const shownKey = state.wornKey || state.currentKey;
  const shown = state.looks.find((l) => l.key === shownKey) || state.looks[0];
  const pinned = !!state.wornKey && state.wornKey !== state.currentKey;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Preview + identity + Gold + gender ─────────────────────────────── */}
      <div style={{ ...card, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        {shown ? <Portrait src={shown.art} alt="Your character" size={140} /> : null}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={eyebrow}>Your character</div>
          {state.team ? (
            <div
              style={{
                display: "inline-block",
                fontSize: 13,
                fontWeight: 700,
                color: accent,
                border: `1px solid ${accent}55`,
                borderRadius: 999,
                padding: "3px 12px",
                marginBottom: 10,
              }}
            >
              {state.team.name}
            </div>
          ) : null}
          <div style={{ fontSize: 22, fontWeight: 800, color: "#e8ecf5", fontFamily: "monospace" }}>{shownKey}</div>
          {/* Gold balance */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              background: `${GOLD}14`,
              border: `1px solid ${GOLD}55`,
              borderRadius: 999,
              padding: "6px 14px",
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: GOLD, display: "inline-block" }} />
            <b style={{ color: GOLD, fontSize: 15 }}>{state.gold.toLocaleString()} Gold</b>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <span style={{ fontSize: 12, color: "#7a89b8" }}>Render</span>
            <button onClick={() => setGender("f")} disabled={saving} style={toggleBtn(state.gender === "f")}>
              Women
            </button>
            <button onClick={() => setGender("m")} disabled={saving} style={toggleBtn(state.gender === "m")}>
              Men
            </button>
          </div>
        </div>
      </div>

      {/* ── Shop: upgrade your fighter ─────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={eyebrow}>Upgrade your fighter</div>
          <span style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}>{state.gold.toLocaleString()} Gold</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {state.shop.map((s) => {
            const maxed = s.nextPrice === null;
            const afford = s.nextPrice !== null && state.gold >= s.nextPrice;
            const pct = Math.round((s.level / s.max) * 100);
            return (
              <div
                key={s.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 10,
                  border: "1px solid #ffffff12",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <b style={{ color: "#e8ecf5", fontSize: 15 }}>{s.name}</b>
                    <span style={{ fontSize: 12, color: "#7a89b8", fontFamily: "monospace" }}>
                      {s.level}/{s.max}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#7a89b8", margin: "2px 0 6px" }}>
                    {s.blurb}
                    {s.key === "aura" ? (
                      <span style={{ color: "#8b7a4a" }}> · changes your weapon, not your look</span>
                    ) : null}
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: "#ffffff12", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: accent }} />
                  </div>
                </div>
                <button
                  onClick={() => (afford ? upgrade(s.key, s.name) : undefined)}
                  disabled={saving || maxed || !afford}
                  style={{
                    flexShrink: 0,
                    padding: "10px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    cursor: saving || maxed || !afford ? "not-allowed" : "pointer",
                    background: maxed ? "transparent" : afford ? GOLD : "rgba(240,179,64,0.18)",
                    color: maxed ? "#7a89b8" : afford ? "#1a1205" : "#aeb6c8",
                    border: maxed ? "1px solid #ffffff22" : "none",
                  }}
                >
                  {maxed ? "MAX" : `Upgrade · ${s.nextPrice!.toLocaleString()}`}
                </button>
              </div>
            );
          })}
        </div>
        {msg ? <div style={{ fontSize: 13, color: "#34d399", marginTop: 12 }}>{msg}</div> : null}
        {error ? <div style={{ fontSize: 13, color: "#f87171", marginTop: 12, lineHeight: 1.5 }}>{error}</div> : null}
      </div>

      {/* ── Grid: pick your character ──────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ ...eyebrow, marginBottom: 0 }}>Pick your look ({state.looks.length})</div>
          {pinned ? (
            <button onClick={() => wear("reset")} disabled={saving} style={linkBtn}>
              Wear current build
            </button>
          ) : null}
        </div>
        <p style={{ fontSize: 12.5, color: "#7a89b8", margin: "0 0 12px", lineHeight: 1.55 }}>
          New looks unlock as you raise <b style={{ color: "#e8ecf5" }}>Armor</b>,{" "}
          <b style={{ color: "#e8ecf5" }}>Ride</b>, and <b style={{ color: "#e8ecf5" }}>Gadgets</b>. Weapon upgrades your
          weapon, not your look.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 10 }}>
          {state.looks.map((l) => {
            const isWorn = l.key === shownKey;
            return (
              <button
                key={l.key}
                onClick={() => (isWorn ? undefined : wear(l.key))}
                disabled={saving || isWorn}
                title={l.isCurrent ? "Your current gear build" : `Wear ${l.key}`}
                style={{
                  padding: 6,
                  background: isWorn ? `${accent}18` : "rgba(255,255,255,0.03)",
                  border: `2px solid ${isWorn ? accent : "transparent"}`,
                  borderRadius: 12,
                  cursor: isWorn ? "default" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Portrait src={l.art} alt={l.key} size={80} />
                <div style={{ fontSize: 11, fontFamily: "monospace", color: isWorn ? accent : "#aeb6c8" }}>
                  {isWorn ? "★ " : ""}
                  {l.key}
                </div>
              </button>
            );
          })}
        </div>

        {state.next.length ? (
          <>
            <div style={{ ...eyebrow, margin: "18px 0 10px" }}>Unlock next</div>
            <p style={{ fontSize: 12.5, color: "#7a89b8", margin: "0 0 12px", lineHeight: 1.5 }}>
              Raise a gear stat above to unlock these looks.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
              {state.next.map((u) => (
                <div
                  key={u.key}
                  style={{
                    padding: 6,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px dashed #ffffff22",
                    borderRadius: 12,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 5,
                    opacity: 0.72,
                  }}
                >
                  <div style={{ filter: "grayscale(0.5)" }}>
                    <Portrait src={u.art} alt={u.key} size={80} />
                  </div>
                  <div style={{ fontSize: 11.5, color: "#cdd4e4", textAlign: "center", lineHeight: 1.3 }}>
                    Raise <b style={{ color: GOLD }}>{u.statName}</b> to {u.toLevel}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <p style={{ fontSize: 12, color: "#7a89b8", textAlign: "center", margin: 0, lineHeight: 1.6 }}>
        {DISCORD_HINT}
      </p>
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
const linkBtn: React.CSSProperties = {
  background: "transparent",
  color: GOLD,
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
};
function toggleBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? GOLD : "transparent",
    color: active ? "#1a1205" : "#aeb6c8",
    border: `1px solid ${active ? GOLD : "#ffffff26"}`,
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };
}
