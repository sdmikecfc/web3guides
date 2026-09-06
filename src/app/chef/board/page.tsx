import type { Metadata } from "next";
import Link from "next/link";
import { topRooms } from "@/lib/chef/board";
import { SERVICE_TIERS } from "../game/_engine/campaign";
import { CheerButton } from "./CheerButton";

/**
 * THE BEST TABLES IN TOWN — the public spotlight (ADR-0111).
 *
 * The ladder and where people stand on it are public; the payout math is not,
 * and no dollar figure appears anywhere on this page. A restaurant earns its
 * place here by being well RUN — hands, upkeep and dishes — which is the one
 * thing coins can never buy.
 */

export const metadata: Metadata = {
  title: "Domain Kitchen: the best tables in town",
  description: "The best-run restaurants on Doma.",
  robots: { index: false, follow: false },
};

// the board is a read of two columns; a minute of staleness is fine
export const revalidate = 60;

const FONT = 'ui-rounded, "Segoe UI", system-ui, sans-serif';

export default async function BoardPage() {
  const rows = await topRooms(25);

  return (
    <main
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(120% 90% at 50% 0%, #2a1c14 0%, #1b1310 55%, #140e0b 100%)",
        color: "#f3e9d2",
        fontFamily: FONT,
        padding: "28px 18px 60px",
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ fontSize: 34, lineHeight: 1 }}>🍳</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.04em", margin: "10px 0 4px" }}>
          THE BEST TABLES IN TOWN
        </h1>
        <p style={{ opacity: 0.75, lineHeight: 1.45, margin: "0 0 18px", maxWidth: 520 }}>
          Every restaurant here earned its place by being well run. Service comes from your hands,
          a tidy room and better dishes. It is the one thing coins cannot buy.
        </p>

        <Link
          href="/chef"
          style={{
            display: "inline-block",
            marginBottom: 22,
            padding: "8px 16px",
            borderRadius: 999,
            border: "1px solid #e8a13d",
            color: "#f3e9d2",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          ← Back to your kitchen
        </Link>

        {rows.length === 0 ? (
          <div
            style={{
              border: "1px solid #4a3626",
              borderRadius: 14,
              padding: "18px 16px",
              background: "rgba(27,19,16,0.6)",
              lineHeight: 1.5,
              opacity: 0.85,
            }}
          >
            No rooms on the board yet. Open your kitchen, keep it tidy, and yours can be the first.
          </div>
        ) : (
          <div
            style={{
              border: "1px solid #4a3626",
              borderRadius: 14,
              overflow: "hidden",
              background: "rgba(27,19,16,0.6)",
            }}
          >
            {rows.map((r) => (
              <div
                key={r.rank}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 14px",
                  borderTop: r.rank === 1 ? "none" : "1px solid rgba(74,54,38,0.7)",
                  background: r.topTier ? "rgba(232,161,61,0.07)" : "transparent",
                }}
              >
                <span
                  style={{
                    width: 26,
                    textAlign: "right",
                    opacity: 0.6,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {r.rank}
                </span>
                <Link
                  href={`/chef/visit/${r.handle}`}
                  style={{ flex: 1, minWidth: 0, color: "inherit", textDecoration: "none" }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {r.topTier && <span style={{ color: "#e8a13d" }}>★ </span>}
                    {r.name || r.handle}
                  </span>
                  <span style={{ display: "block", opacity: 0.62, fontSize: 12, marginTop: 2 }}>
                    {r.tier} · {r.seats} seat{r.seats === 1 ? "" : "s"} · tap to visit
                  </span>
                </Link>
                <span style={{ fontWeight: 800, color: r.topTier ? "#e8a13d" : "#f3e9d2" }}>
                  {r.quality}
                </span>
                <CheerButton handle={r.handle} />
              </div>
            ))}
          </div>
        )}

        <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.04em", margin: "26px 0 8px" }}>
          THE LADDER
        </h2>
        <div style={{ display: "grid", gap: 6 }}>
          {[...SERVICE_TIERS].reverse().map((t) => (
            <div
              key={t.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                padding: "9px 12px",
                border: "1px solid rgba(74,54,38,0.7)",
                borderRadius: 10,
                background: "rgba(27,19,16,0.5)",
              }}
            >
              <span style={{ fontWeight: 700 }}>{t.name}</span>
              <span style={{ opacity: 0.6, textAlign: "right" }}>{t.blurb}</span>
            </div>
          ))}
        </div>
        <p style={{ opacity: 0.55, lineHeight: 1.5, marginTop: 16, fontSize: 12 }}>
          Rooms appear here once they have been saved to a wallet. Scores are shown as a service
          record, never as money.
        </p>
      </div>
    </main>
  );
}
