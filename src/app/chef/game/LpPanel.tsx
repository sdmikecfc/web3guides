"use client";

/**
 * The LIVE POSITION card (M5): connect a wallet and the game reads your real
 * liquidity at this market instead of using the demo slider.
 *
 * Teaching surface, per the v3 ruling — this is where a player learns what
 * "in range" means and what a tight versus wide range is, in the game's own
 * words. Trading volume stays a link out to the Doma app: the game never
 * pretends to be an exchange.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { LpRead } from "./_chain/useLpPositions";
import type { CloudSave } from "./_chain/useCloudSave";
import type { MarketDef } from "./_engine/items";

const FONT = 'ui-rounded, "Segoe UI", system-ui, sans-serif';

const card: React.CSSProperties = {
  position: "absolute",
  left: 12,
  top: 12,
  width: 250,
  background: "rgba(27,19,16,0.93)",
  border: "1px solid #4a3626",
  borderRadius: 14,
  color: "#f3e9d2",
  fontFamily: FONT,
  fontSize: 12,
  padding: "10px 12px",
  zIndex: 6,
  backdropFilter: "blur(3px)",
};

const DOMA_APP = "https://app.doma.xyz";

export function LpPanel({
  market,
  read,
  live,
  cloud,
  onUseLive,
  collapsed,
  onToggle,
}: {
  market: MarketDef;
  read: LpRead;
  live: boolean;
  cloud: CloudSave;
  onUseLive: (on: boolean) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { status, positions, totalUsd, priceUsd } = read;
  const inRange = positions.filter((p) => p.inRange).length;

  return (
    <div style={card}>
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          marginBottom: collapsed ? 0 : 7,
        }}
      >
        <span style={{ fontWeight: 800, letterSpacing: "0.04em" }}>
          🔗 YOUR POSITION
          {live && <span style={{ color: "#6fe3a0", marginLeft: 6 }}>LIVE</span>}
        </span>
        <span style={{ opacity: 0.7 }}>{collapsed ? "▸" : "▾"}</span>
      </div>

      {!collapsed && (
        <>
          <div style={{ opacity: 0.72, lineHeight: 1.35, marginBottom: 7 }}>
            {market.label}
            {priceUsd > 0 && (
              <span style={{ opacity: 0.8 }}> · ${priceUsd < 0.01 ? priceUsd.toFixed(5) : priceUsd.toFixed(4)}</span>
            )}
          </div>

          <div style={{ marginBottom: 8 }}>
            <ConnectButton showBalance={false} accountStatus="address" chainStatus="none" />
          </div>

          {status === "unconfigured" && (
            <div style={{ opacity: 0.65, lineHeight: 1.4 }}>
              This market is not wired to the chain yet. Your restaurant runs on the practice
              dials below.
            </div>
          )}

          {status === "loading" && <div style={{ opacity: 0.65 }}>Reading your position…</div>}

          {status === "error" && (
            <div style={{ color: "#ff9a9a", lineHeight: 1.4 }}>
              Could not reach the chain just now. Your restaurant keeps running on the practice
              dials.
            </div>
          )}

          {status === "idle" && (
            <div style={{ opacity: 0.65, lineHeight: 1.4 }}>
              Connect a wallet and your real liquidity here becomes your restaurant.
            </div>
          )}

          {status === "ready" && positions.length === 0 && (
            <div style={{ opacity: 0.7, lineHeight: 1.4 }}>
              No liquidity here yet. Add some at the Doma app and it shows up on this card.
            </div>
          )}

          {status === "ready" && positions.length > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ opacity: 0.75 }}>Parked here</span>
                <span style={{ fontWeight: 800, color: "#e8a13d" }}>${totalUsd.toFixed(2)}</span>
              </div>
              <div style={{ opacity: 0.65, marginBottom: 6 }}>
                {inRange} of {positions.length} earning right now
              </div>
              {positions.slice(0, 4).map((p) => (
                <div
                  key={p.tokenId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 0",
                    borderTop: "1px solid rgba(74,54,38,0.6)",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ color: p.inRange ? "#6fe3a0" : "#e0a552" }}>
                      {p.inRange ? "● Selling" : "○ Off the street"}
                    </span>
                    <span style={{ opacity: 0.55 }}> · {p.width}</span>
                  </span>
                  <span style={{ fontWeight: 700 }}>${p.usd.toFixed(2)}</span>
                </div>
              ))}
              <div
                style={{
                  marginTop: 7,
                  paddingTop: 7,
                  borderTop: "1px solid rgba(74,54,38,0.6)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={live}
                    onChange={(e) => onUseLive(e.target.checked)}
                    style={{ accentColor: "#e8a13d" }}
                  />
                  <span>Run my restaurant on this</span>
                </label>
              </div>
              <div style={{ opacity: 0.55, marginTop: 5, lineHeight: 1.35 }}>
                A position only earns while it is in range. Tighter ranges earn more per dollar,
                and go quiet sooner when the price moves.
              </div>
            </>
          )}

          {/* saves: optional, and never a gate on playing (M6) */}
          <div style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid rgba(74,54,38,0.6)" }}>
            {cloud.status === "on" ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#6fe3a0", fontWeight: 700 }}>
                  ✓ Saving to your wallet
                </span>
                <button
                  onClick={cloud.signOut}
                  style={{
                    padding: "4px 9px",
                    borderRadius: 999,
                    border: "1px solid #4a3626",
                    background: "#1f150f",
                    color: "#f3e9d2",
                    fontFamily: FONT,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Stop
                </button>
              </div>
            ) : (
              <>
                <div style={{ opacity: 0.7, lineHeight: 1.35, marginBottom: 6 }}>
                  Your restaurant is saved in this browser. Sign once and it follows you to any
                  device.
                </div>
                <button
                  onClick={cloud.signIn}
                  disabled={cloud.status === "signing"}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid #e8a13d",
                    background: "#2a1c14",
                    color: "#f3e9d2",
                    fontFamily: FONT,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: cloud.status === "signing" ? "default" : "pointer",
                  }}
                >
                  {cloud.status === "signing" ? "Check your wallet…" : "Save to my wallet"}
                </button>
                {cloud.error && (
                  <div style={{ marginTop: 5, color: "#ff9a9a", lineHeight: 1.35 }}>{cloud.error}</div>
                )}
              </>
            )}
          </div>

          <a
            href={DOMA_APP}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              marginTop: 9,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #e8a13d",
              color: "#f3e9d2",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Trade or add liquidity ↗
          </a>
        </>
      )}
    </div>
  );
}
