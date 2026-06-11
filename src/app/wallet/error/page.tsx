/**
 * Wallet-link error page. Shown when the magic link is invalid/expired/used,
 * or when the verify step fails in a non-recoverable way.
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
  rose:        "#f87171",
};

export const dynamic = "force-dynamic";

const REASONS: Record<string, { title: string; body: string }> = {
  invalid:  { title: "Invalid link",   body: "That link doesn't look right. Make sure you copied the full URL from your DM." },
  unknown:  { title: "Link not found", body: "We couldn't find that link in our records. It may have been revoked." },
  used:     { title: "Already used",   body: "This link has already been used. If you didn't link yet, run `!wallet link` again in #mini-games for a fresh one." },
  expired:  { title: "Link expired",   body: "Magic links are good for 24 hours. Run `!wallet link` in #mini-games for a fresh one." },
  verify:   { title: "Verification failed", body: "The signature didn't verify. Try again with the same wallet — or use `!wallet link` for a fresh attempt." },
};

export default function WalletErrorPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const reason = searchParams.reason || "invalid";
  const info = REASONS[reason] || REASONS.invalid;

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
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div
          style={{
            background: "rgba(13,17,32,0.7)",
            border: `1px solid ${C.rose}44`,
            borderRadius: 14,
            padding: "32px 28px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 3,
              background: C.rose,
            }}
          />
          <div style={{ fontSize: 12, color: C.amber, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
            🔗 Doma Reporter · wallet linking
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, marginBottom: 12 }}>
            {info.title}
          </h1>
          <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.6, margin: 0 }}>
            {info.body}
          </p>
        </div>
      </div>
    </main>
  );
}
