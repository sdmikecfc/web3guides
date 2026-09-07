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

import { FONT } from "./_ui/tokens";

/**
 * No longer absolutely positioned. This card and the dials card were both
 * pinned to left:12 independently, one from the top and one from the bottom,
 * so on a short viewport they simply grew into each other: at 1280x800 this
 * one covered the dials header completely. They are siblings in a flex column
 * now (see GameStage), which makes overlap impossible rather than unlikely.
 */
const card: React.CSSProperties = {
  width: 250,
  flexShrink: 0,
  background: "rgba(27,19,16,0.94)",
  border: "1px solid #4a3626",
  borderRadius: 14,
  color: "#f3e9d2",
  fontFamily: FONT,
  fontSize: 12,
  padding: "10px 12px",
  backdropFilter: "blur(6px)",
  boxShadow: "0 10px 28px rgba(8,4,2,0.5), inset 0 1px 0 rgba(255,240,214,0.07)",
  maxHeight: "60%",
  overflowY: "auto",
  overscrollBehavior: "contain",
  pointerEvents: "auto",
};

const DOMA_APP = "https://app.doma.xyz";

/**
 * WHERE THE BUTTONS GO (M10).
 *
 * `tradeLink` is a real DEEP link to this market's own page, not the bare
 * root the card used to send people to. That root link was the
 * highest-intent click in the whole product and it dropped a player who had
 * just spent twenty minutes learning about ONE pool onto a generic homepage
 * to go and find it again.
 *
 * `JOIN_LINK` is the sign-up path, and it carries the referral code the rest
 * of the site uses. The game used to drop it entirely, so every conversion it
 * drove was unattributed. It is a `/join/` PATH, not a query parameter, so it
 * cannot be bolted onto a deep link — which is fine, because the person who
 * needs it is the person with no wallet, and the person who needs the deep
 * link already has one. Different people, different button.
 *
 * Do not invent a combined URL. Doma was asked for link parameters and said
 * no (see src/lib/s5/launchpad.ts).
 */
const JOIN_LINK = "https://app.doma.xyz/join/4urmvv4ouvvsu";
const tradeLink = (domain: string) =>
  `${DOMA_APP}/domain/${encodeURIComponent(String(domain || "").toLowerCase())}`;

/**
 * THE TWO BUTTONS (M10). Mike: "raw in your face 'Trade or LP this token right
 * now', easy easy easy. An 8 year old who has tried crypto games before should
 * understand."
 *
 * So: two verbs, a plain line each, and no undefined nouns. This block is
 * always visible when a wallet is connected — it is not tucked behind a
 * disclosure, because the whole point is that it cannot be missed.
 *
 * Order is deliberate. TRADE first, because it is genuinely the easier thing
 * (one tap, one token) AND because you cannot add liquidity until you hold
 * some of the token, so trading is the honest first step rather than a
 * lesser one.
 */
function ActionBlock({
  market,
  connected,
  onAddLiquidity,
}: {
  market: MarketDef;
  connected: boolean;
  onAddLiquidity?: () => void;
}) {
  const btn = (primary: boolean): React.CSSProperties => ({
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    marginTop: 6,
    padding: "9px 12px",
    borderRadius: 10,
    border: `1px solid ${primary ? "#e8a13d" : "#4a3626"}`,
    background: primary ? "#e8a13d" : "#2a1c14",
    color: primary ? "#1b1310" : "#f3e9d2",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: 800,
    textAlign: "center",
    textDecoration: "none",
    cursor: "pointer",
    // a phone is the common case and 44px is Apple's minimum target
    minHeight: 42,
  });
  const note: React.CSSProperties = { opacity: 0.62, marginTop: 3, lineHeight: 1.35 };

  // No wallet yet: the only useful button is the one that gets them one, and
  // it is the link that carries our referral code.
  if (!connected) {
    return (
      <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(74,54,38,0.6)" }}>
        <a href={JOIN_LINK} target="_blank" rel="noopener noreferrer" style={btn(true)}>
          Get set up on Doma ↗
        </a>
        <div style={note}>
          Sign in with Google, add a few dollars by card. Takes a minute, and
          you keep everything in your own wallet.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(74,54,38,0.6)" }}>
      <a
        href={tradeLink(market.id)}
        target="_blank"
        rel="noopener noreferrer"
        style={btn(true)}
      >
        Buy {market.label} ↗
      </a>
      <div style={note}>
        Every trade here pays your kitchen coins. It is also the first step to
        the button below.
      </div>
      <button onClick={onAddLiquidity} style={btn(false)}>
        Put money to work
      </button>
      <div style={note}>
        Lends your {market.label} and dollars to the market so other people can
        trade. You keep them, and they pay your kitchen every hour.
      </div>
    </div>
  );
}

export function LpPanel({
  market,
  read,
  live,
  cloud,
  onUseLive,
  collapsed,
  onToggle,
  fullWidth,
  onAddLiquidity,
  bare,
}: {
  market: MarketDef;
  read: LpRead;
  live: boolean;
  cloud: CloudSave;
  onUseLive: (on: boolean) => void;
  collapsed: boolean;
  /** narrow layout: stretch instead of a fixed 250px card */
  fullWidth?: boolean;
  onToggle: () => void;
  /** opens the in-game add-liquidity flow (M10) */
  onAddLiquidity?: () => void;
  /** inside a Sheet (M11): the Sheet brings the title and card chrome */
  bare?: boolean;
}) {
  const { status, positions, totalUsd, priceUsd } = read;
  const inRange = positions.filter((p) => p.inRange).length;
  const open = bare || !collapsed;

  return (
    <div
      style={
        bare
          ? { fontFamily: FONT, fontSize: 12, color: "#f3e9d2", marginBottom: 10 }
          : fullWidth
          ? { ...card, width: "auto", alignSelf: "stretch", maxHeight: "58vh" }
          : card
      }
    >
      {bare && live && (
        <div style={{ color: "#6fe3a0", fontWeight: 800, fontSize: 11, marginBottom: 4 }}>LIVE</div>
      )}
      {!bare && (
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
          {/* NOT "YOUR POSITION" (M10). That was the least legible string in
              the game and it sat in 800-weight caps at the top of the most
              important card, while "position" was never defined anywhere in
              Domain Kitchen. This says what the card is for instead. */}
          🔗 YOUR MONEY HERE
          {live && <span style={{ color: "#6fe3a0", marginLeft: 6 }}>LIVE</span>}
        </span>
        <span style={{ opacity: 0.7 }}>{collapsed ? "▸" : "▾"}</span>
      </div>
      )}

      {open && (
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
              This market is not connected yet. Your restaurant runs on the practice
              dials below.
            </div>
          )}

          {status === "loading" && <div style={{ opacity: 0.65 }}>Looking at your money…</div>}

          {status === "error" && (
            <div style={{ color: "#ff9a9a", lineHeight: 1.4 }}>
              Could not reach the market just now. Your restaurant keeps running on the practice
              dials.
            </div>
          )}

          {status === "idle" && (
            <div style={{ opacity: 0.65, lineHeight: 1.4 }}>
              Connect a wallet and the real money you have working at this
              market starts running your restaurant.
            </div>
          )}

          {status === "ready" && positions.length === 0 && (
            <div style={{ opacity: 0.7, lineHeight: 1.4 }}>
              Nothing of yours is working here yet. Put some money to work below
              and it shows up on this card.
            </div>
          )}

          {status === "ready" && positions.length > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                {/* "Parked here" was a coinage nobody had been taught */}
                <span style={{ opacity: 0.75 }}>Working here</span>
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
                Your money only earns while the price is inside the band you
                chose. A narrow band earns more per dollar and falls quiet
                sooner when the price moves away.
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

          <ActionBlock market={market} connected={read.status !== "idle"} onAddLiquidity={onAddLiquidity} />
        </>
      )}
    </div>
  );
}
