/**
 * Launch Wars Season 4 — /s4 OpenGraph image (an S2 nicety S3 shipped without).
 * Simple, live: season name + the pool line + bonded count from the snapshot.
 * next/og ImageResponse; the snapshot never throws, so this renders pre-season.
 */
import { headers } from "next/headers";
import { getSeasonSnapshot, poolLine } from "@/lib/s4/data";

export const runtime = "nodejs";
// Rendered per request, never at build: the copy is live season data. Next
// 14.2's metadata-image route loader does not forward segment config (only
// sitemap re-exports it), so the real opt-out is the headers() call below;
// the config line documents intent for Next versions that do forward it.
export const dynamic = "force-dynamic";
export const alt = "Launch Wars Season 4";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  // Dynamic-API bail-out BEFORE next/og loads: the build-time prerender both
  // freezes live data and trips @vercel/og's node bundle on Windows
  // (fileURLToPath(import.meta.url) = Invalid URL in the static-export
  // worker), so next/og is imported lazily once the bail-out has fired.
  headers();
  const { ImageResponse } = await import("next/og");
  const snap = await getSeasonSnapshot();
  const t = snap.theme;
  const sub = snap.empty
    ? "Season 4 is being prepared"
    : `${snap.totals.bonded} of ${snap.totals.total} ${t.target.plural} ${t.bondedWord}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #10182b 0%, #070a12 70%)",
          color: "#e8ecf5",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 26,
            letterSpacing: 10,
            textTransform: "uppercase",
            color: "#8b95ad",
            marginBottom: 18,
          }}
        >
          Launch Wars
        </div>
        <div style={{ fontSize: 84, fontWeight: 800, marginBottom: 26, textAlign: "center" }}>
          {t.seasonName}
        </div>
        <div style={{ fontSize: 34, color: "#34d399", marginBottom: 14, textAlign: "center" }}>
          {snap.empty ? sub : poolLine(snap)}
        </div>
        {!snap.empty ? (
          <div style={{ fontSize: 28, color: "#aeb6c8", textAlign: "center" }}>{sub}</div>
        ) : null}
      </div>
    ),
    size,
  );
}
