/**
 * Wallet-link success page. Lands here after /api/wallet/verify returns OK.
 * URL params carry the address + display name so we don't have to re-query.
 */

const C = {
  bgFrom:      "#070b1a",
  bgMid:       "#0a0e27",
  bgTo:        "#1a0b3d",
  violet:      "#7c6aff",
  violetLight: "#a78bfa",
  white:       "#f8fafc",
  muted:       "#7a89b8",
  amber:       "#f0b340",
  green:       "#34d399",
};

export const dynamic = "force-dynamic";

export default function LinkedPage({
  searchParams,
}: {
  searchParams: { address?: string; name?: string };
}) {
  const address = searchParams.address || "";
  const name    = searchParams.name    || "";
  const short   = address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgMid} 50%, ${C.bgTo} 100%)`,
        color: C.white,
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "48px 16px 64px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ maxWidth: 560, width: "100%" }}>
        <div
          style={{
            background: "rgba(13,17,32,0.7)",
            border: `1px solid ${C.green}55`,
            borderRadius: 14,
            padding: "32px 28px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 3,
              background: C.green,
            }}
          />
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 900,
              margin: 0,
              marginBottom: 8,
              color: C.green,
            }}
          >
            Wallet linked
          </h1>
          <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.6, marginBottom: 20 }}>
            Your wallet is now mapped to your Discord identity. You're eligible for game payouts and
            trade-tracked leaderboards.
          </p>

          {address && (
            <div
              style={{
                background: "rgba(0,0,0,0.35)",
                border: `1px solid ${C.violet}33`,
                borderRadius: 8,
                padding: "14px 18px",
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: 2, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
                Linked address
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontFamily: "ui-monospace, monospace",
                  color: C.white,
                  wordBreak: "break-all",
                }}
              >
                {address}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
                ({short})
              </div>
            </div>
          )}

          {name && (
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Linked to Discord: <b style={{ color: C.violetLight }}>@{name}</b>
            </div>
          )}

          <div
            style={{
              padding: "14px 18px",
              background: "rgba(124,106,255,0.06)",
              border: `1px solid ${C.violet}33`,
              borderRadius: 8,
              fontSize: 13,
              color: C.muted,
              lineHeight: 1.6,
            }}
          >
            <b style={{ color: C.violetLight }}>What now?</b><br />
            You can close this tab. To verify the link in Discord, DM the bot{" "}
            <code style={{ color: C.white }}>!wallet status</code>. To remove the link,{" "}
            <code style={{ color: C.white }}>!wallet unlink</code> (pure DB op — no on-chain action).
          </div>
        </div>
      </div>
    </main>
  );
}
