/**
 * /api/og — Dynamic article banner image generator.
 * Uses Next.js ImageResponse (edge runtime). No external services or credits.
 *
 * Query params:
 *   sub  = subdomain key (eth, btc, sol, …) — used to resolve accent color + emoji
 *   t    = article title (full; this route does the smart truncation)
 */

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getSubdomainConfig } from "@/lib/subdomains";

export const runtime = "edge";

const W = 1200;
const H = 420;

/** Smart truncation: strip subtitle after colon, or truncate at word boundary */
function bannerText(title: string): string {
  const colon = title.indexOf(":");
  if (colon > 12 && colon < 60) return title.slice(0, colon).trim();
  if (title.length <= 52) return title;
  const cut = title.slice(0, 52).replace(/\s+\S*$/, "");
  return cut + "...";
}

/** Hex → r,g,b tuple */
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sub   = searchParams.get("sub") ?? "eth";
  const title = searchParams.get("t")   ?? "Web3 Guide";

  const cfg     = getSubdomainConfig(sub);
  const accent  = cfg?.accentHex ?? "#4f46e5";
  const emoji   = cfg?.emoji     ?? "📖";
  const label   = (cfg?.label    ?? sub).toUpperCase();
  const display = bannerText(title);

  const [r, g, b] = hexRgb(accent);

  const fontSize = display.length > 42 ? 52 : display.length > 28 ? 64 : 76;

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: `linear-gradient(140deg, #0d0d1f 0%, #111827 100%)`,
        }}
      >
        {/* Glow blob — top left (solid semi-transparent circle, satori-safe) */}
        <div
          style={{
            position: "absolute",
            top: -140,
            left: -100,
            width: 480,
            height: 480,
            borderRadius: "50%",
            background: `rgba(${r},${g},${b},0.22)`,
            display: "flex",
          }}
        />

        {/* Glow blob — bottom right */}
        <div
          style={{
            position: "absolute",
            bottom: -160,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: `rgba(${r},${g},${b},0.18)`,
            display: "flex",
          }}
        />

        {/* Decorative ring top-right: outer circle */}
        <div
          style={{
            position: "absolute",
            top: 28,
            right: 78,
            width: 184,
            height: 184,
            borderRadius: "50%",
            background: `rgba(${r},${g},${b},0.12)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* inner cutout to fake a ring */}
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: "50%",
              background: "#0d0d1f",
              display: "flex",
            }}
          />
        </div>

        {/* Smaller ring */}
        <div
          style={{
            position: "absolute",
            top: 62,
            right: 112,
            width: 116,
            height: 116,
            borderRadius: "50%",
            background: `rgba(${r},${g},${b},0.08)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 98,
              height: 98,
              borderRadius: "50%",
              background: "#0d0d1f",
              display: "flex",
            }}
          />
        </div>

        {/* Thin accent line left edge */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 4,
            height: H,
            background: `linear-gradient(to bottom, ${accent}, transparent)`,
            display: "flex",
          }}
        />

        {/* Content layer */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "40px 72px 36px 60px",
            width: "100%",
            height: "100%",
            position: "relative",
          }}
        >
          {/* Top: subdomain badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: `rgba(${r},${g},${b},0.18)`,
                border: `1px solid rgba(${r},${g},${b},0.35)`,
                borderRadius: 8,
                padding: "6px 16px",
              }}
            >
              {/* No emoji — satori edge has no emoji font, causes silent failures */}
              <div style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: accent,
                display: "flex",
              }} />
              <span
                style={{
                  fontSize: 13,
                  letterSpacing: 3,
                  color: accent,
                  fontFamily: "monospace",
                  fontWeight: 700,
                }}
              >
                {label}
              </span>
            </div>
          </div>

          {/* Center: title */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              maxWidth: "78%",
            }}
          >
            <div
              style={{
                fontSize,
                fontWeight: 800,
                color: "#ffffff",
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
                fontFamily: "sans-serif",
              }}
            >
              {display}
            </div>
          </div>

          {/* Bottom: branding */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 11, color: "#fff", fontWeight: 900 }}>W</span>
            </div>
            <span
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.35)",
                fontFamily: "monospace",
                letterSpacing: 1,
              }}
            >
              web3guides.com
            </span>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H }
  );

  // Twitter/X requires a publicly cacheable image — without this header it often fails to load
  imageResponse.headers.set(
    "Cache-Control",
    "public, immutable, no-transform, max-age=86400"
  );
  return imageResponse;
}
