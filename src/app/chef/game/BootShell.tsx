"use client";

/**
 * The Domain Kitchen boot screen: shown while the engine chunk downloads and
 * the preloader counts real assets (ADR-0101 requires a real loading bar).
 * DOM only — it must render before Pixi exists. Player copy: 6th grade, no
 * em-dashes, never "win $X".
 */

/**
 * Loading tips. These state the CURRENT rules: liquidity and trading pay you
 * coins (ADR-0103), coins buy permanent things, and quality is the one thing
 * money never touches. The old "your stake sets how many tables you have"
 * line was true before the earn-and-spend change and is now simply wrong.
 */
export const BOOT_TIPS = [
  "Tip: Your position pays you coins every hour. Coins buy tables, stoves and staff.",
  "Tip: What you build stays yours. Taking your money out never un-builds the room.",
  "Tip: Quality comes from your hands, a tidy room and better dishes. Never from coins.",
  "Tip: Liquidity only earns while it is in range. Tap your position card to see.",
  "Tip: Ingredients arrive every morning. Save the right ones to upgrade a dish.",
  "Tip: A bench by the door keeps guests waiting instead of walking out.",
];

export function BootShell({
  progress,
  tip,
  error,
}: {
  progress: number;
  tip: string;
  error?: string;
}) {
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        background:
          "radial-gradient(120% 90% at 50% 0%, #2a1c14 0%, #1b1310 55%, #140e0b 100%)",
        color: "#f3e9d2",
        fontFamily: 'ui-rounded, "Segoe UI", system-ui, sans-serif',
        textAlign: "center",
        padding: 24,
        zIndex: 10,
      }}
    >
      <div style={{ fontSize: 40, lineHeight: 1 }}>🍳</div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "0.06em",
        }}
      >
        DOMAIN KITCHEN
      </div>
      {error ? (
        <>
          <div style={{ fontSize: 15, opacity: 0.9, maxWidth: 420 }}>
            The kitchen could not open. Check your connection and try again.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 6,
              padding: "10px 22px",
              borderRadius: 999,
              border: "1px solid #e8a13d",
              background: "#2a1c14",
              color: "#f3e9d2",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </>
      ) : (
        <>
          <div
            style={{
              width: "min(360px, 76vw)",
              height: 14,
              borderRadius: 999,
              background: "#31241b",
              border: "1px solid #4a3626",
              overflow: "hidden",
            }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct * 100)}
          >
            <div
              style={{
                width: `${Math.round(pct * 100)}%`,
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg, #d97b29, #e8a13d)",
                transition: "width 160ms ease",
              }}
            />
          </div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            {Math.round(pct * 100)}%
          </div>
          <div style={{ fontSize: 14, opacity: 0.85, maxWidth: 420 }}>{tip}</div>
        </>
      )}
    </div>
  );
}
