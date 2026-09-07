/**
 * Launch Wars Season 5, /s5 OpenGraph image (mirrors the S4 approach):
 * season name + the live pool line + breach count from the snapshot.
 * next/og ImageResponse; the snapshot never throws, so this renders pre-season.
 */
import { headers } from "next/headers";
import { getSeasonSnapshot, poolLine } from "@/lib/s6/data";

export const runtime = "nodejs";
// Rendered per request, never at build: the copy is live season data. Next
// 14.2's metadata-image route loader does not forward segment config (only
// sitemap re-exports it), so the real opt-out is the headers() call below;
// the config line documents intent for Next versions that do forward it.
export const dynamic = "force-dynamic";
export const alt = "Launch Wars Season 5: Uprising";
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
    ? "Season 5 is being prepared"
    : `${snap.totals.bonded} of ${snap.totals.total} ${t.target.plural} ${t.bondedWord}`;

  const hostHdr = headers().get("host") ?? "launchwars.xyz";
  const proto = hostHdr.includes("localhost") ? "http" : "https";
  const host = headers().get("host") ?? "launchwars.xyz";
  const base = `${proto}://${host}`;
  const pct = snap.empty ? 0 : Math.round((100 * snap.totals.bonded) / Math.max(1, snap.totals.total));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${base}/s6-art/front/wash.jpg`}
          alt=""
          width={1200}
          height={630}
          style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            background: "linear-gradient(180deg, rgba(7,9,13,0.55) 0%, rgba(7,9,13,0.25) 45%, rgba(7,9,13,0.9) 100%)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", padding: "0 64px 48px", position: "relative" }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 8, color: "#ffd28a", marginBottom: 6 }}>
            LAUNCH WARS S6 · UPRISING vs THE WARDEN
          </div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: "#f0f0eb", marginBottom: 10 }}>
            THE FRONT IS LIVE
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#8fe2ff", marginBottom: 18 }}>
            {snap.empty
              ? "The war for THE GRID begins Aug 17"
              : `${snap.totals.bonded} of ${snap.totals.total} ${t.target.plural} ${t.bondedWord} · ${poolLine(snap)}`}
          </div>
          <div
            style={{
              display: "flex",
              width: 1072,
              height: 16,
              borderRadius: 8,
              background: "rgba(255,255,255,0.14)",
            }}
          >
            <div
              style={{
                display: "flex",
                width: Math.max(16, Math.round(1072 * (pct / 100))),
                height: 16,
                borderRadius: 8,
                background: "linear-gradient(90deg, #e0662e, #f0b340)",
              }}
            />
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#c9d1d9", marginTop: 14 }}>
            Watch free · Play free · Hold a domain from $5 · launchwars.xyz
          </div>
        </div>
      </div>
    ),
    size,
  );
}
