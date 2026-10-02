/**
 * DOMA BEACH PARTY hero — faithful React port of Mike's Claude Design export
 * (public/Launch Wars S4_ Doma Beach Party/Doma Beach Party Hero.dc.html).
 * Sunset-over-the-infinity-pool scene: layered sky/sun/ocean/pool gradients,
 * palm silhouettes, bokeh + sparkles, the chrome-gradient display title with a
 * shine sweep, three team-colored character slots over intertwining blooms, a
 * glassy live data strip (bonded / unlocked / countdown), and both CTAs.
 *
 * Client component. Live numbers arrive as props from the server snapshot
 * (lib/s4/data.ts) so the strip is honest pre-season: 0/5, $0 of $1,000, and
 * the countdown cell disappears entirely when no season dates exist.
 *
 * ART: the three girl PNGs (/s4-art/hero/hero-{gold,pink,aqua}.png) do not
 * exist yet. ArtSlot uses the proven hydration-safe missing-art pattern (ref
 * checks complete && naturalWidth === 0 at mount, plus onError) and falls back
 * to a team-colored silhouette, so the hero looks intentional today and
 * upgrades automatically the moment the art lands. ArtSlot is exported and
 * reused by the landing sections (team cards, cast gallery).
 *
 * All animation is behind prefers-reduced-motion: no-preference, exactly like
 * the design export. No backticks inside the CSS template literal.
 */
"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

export const TEAM_GOLD = "#f0b340";
export const TEAM_PINK = "#ff7eb6";
export const TEAM_AQUA = "#4dd8e6";

// ── missing-art fallback ─────────────────────────────────────────────────────

/**
 * Tasteful team-colored silhouette shown while a transparent PNG is absent.
 * Dark figure with an accent rim glow, anchored to the bottom of its slot.
 */
function Silhouette({ accent }: { accent: string }) {
  const uid = useId();
  const gid = "s4bh-fig-" + uid.replace(/[^a-zA-Z0-9-]/g, "");
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <svg
        viewBox="0 0 200 420"
        style={{
          height: "92%",
          maxWidth: "100%",
          display: "block",
          filter: "drop-shadow(0 0 26px " + accent + "55) drop-shadow(0 0 8px " + accent + "33)",
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.42" />
            <stop offset="34%" stopColor="#141022" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#0a0714" stopOpacity="1" />
          </linearGradient>
        </defs>
        {/* hair bun + head */}
        <circle cx="121" cy="33" r="11" fill={"url(#" + gid + ")"} />
        <circle cx="100" cy="52" r="24" fill={"url(#" + gid + ")"} />
        {/* figure */}
        <path
          d="M100 82 C82 86 72 100 70 118 C68 138 78 152 80 170 C82 190 72 208 68 232 C64 258 72 286 76 312 C79 336 72 366 68 398 L90 398 C92 370 96 344 98 322 L102 322 C104 344 108 370 110 398 L132 398 C128 366 121 336 124 312 C128 286 136 258 132 232 C128 208 118 190 120 170 C122 152 132 138 130 118 C128 100 118 86 100 82 Z"
          fill={"url(#" + gid + ")"}
        />
      </svg>
    </div>
  );
}

/**
 * Image slot with graceful absence. Renders the PNG when it exists; when the
 * request 404s it swaps to the team-colored Silhouette. The ref check catches
 * a 404 that resolved BEFORE hydration (onError never fires for those — the
 * event is gone by the time React attaches it), the proven S3/S4 pattern.
 */
export function ArtSlot({
  src,
  accent,
  alt = "",
  imgStyle,
}: {
  src: string;
  accent: string;
  alt?: string;
  imgStyle?: React.CSSProperties;
}) {
  const [missing, setMissing] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {missing ? (
        <Silhouette accent={accent} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          ref={(el) => {
            if (el && el.complete && el.naturalWidth === 0) setMissing(true);
          }}
          onError={() => setMissing(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "bottom center",
            display: "block",
            ...imgStyle,
          }}
        />
      )}
    </div>
  );
}

// ── scene constants (verbatim from the design export) ───────────────────────

const BOKEH = [
  { top: "20%", left: "13%", size: 74, bg: "radial-gradient(circle, rgba(255,206,140,.55), rgba(255,206,140,0) 70%)", dur: "13s", delay: "0s" },
  { top: "30%", left: "82%", size: 58, bg: "radial-gradient(circle, rgba(77,216,230,.5), rgba(77,216,230,0) 70%)", dur: "15s", delay: "2.4s" },
  { top: "44%", left: "30%", size: 40, bg: "radial-gradient(circle, rgba(255,126,182,.55), rgba(255,126,182,0) 70%)", dur: "11s", delay: "1.1s" },
  { top: "38%", left: "68%", size: 92, bg: "radial-gradient(circle, rgba(255,232,190,.4), rgba(255,232,190,0) 70%)", dur: "17s", delay: "3.2s" },
  { top: "58%", left: "18%", size: 48, bg: "radial-gradient(circle, rgba(240,179,64,.5), rgba(240,179,64,0) 70%)", dur: "12s", delay: "4s" },
  { top: "52%", left: "88%", size: 34, bg: "radial-gradient(circle, rgba(255,255,255,.55), rgba(255,255,255,0) 70%)", dur: "10s", delay: ".6s" },
  { top: "26%", left: "50%", size: 30, bg: "radial-gradient(circle, rgba(255,255,255,.5), rgba(255,255,255,0) 70%)", dur: "9s", delay: "2s" },
  { top: "64%", left: "60%", size: 64, bg: "radial-gradient(circle, rgba(77,216,230,.4), rgba(77,216,230,0) 70%)", dur: "16s", delay: "5s" },
  { top: "48%", left: "46%", size: 22, bg: "radial-gradient(circle, rgba(255,180,120,.6), rgba(255,180,120,0) 70%)", dur: "8s", delay: "1.7s" },
];

const SPARKLES = [
  { top: "54%", left: "50%", size: 26, dir: "180deg", dur: "5s", delay: "0s" },
  { top: "40%", left: "24%", size: 20, dir: "150deg", dur: "4.4s", delay: "1.3s" },
  { top: "44%", left: "76%", size: 20, dir: "210deg", dur: "5.6s", delay: "2.6s" },
  { top: "31%", left: "58%", size: 15, dir: "160deg", dur: "3.8s", delay: ".8s" },
  { top: "61%", left: "40%", size: 17, dir: "200deg", dur: "4.9s", delay: "3.4s" },
];

const PALM_PATHS = [
  "M96,460 C90,360 86,282 108,196 C112,178 121,170 131,166 L139,178 C123,186 118,202 116,242 C114,302 116,382 118,460 Z",
  "M129,168 C121,120 119,84 127,50 C137,86 139,124 135,170 Z",
  "M129,168 C151,120 181,96 216,84 C183,104 157,130 137,172 Z",
  "M129,170 C161,166 193,176 218,198 C187,186 155,182 131,178 Z",
  "M131,174 C159,192 181,222 191,258 C169,225 145,199 127,180 Z",
  "M129,168 C105,124 74,102 38,90 C74,110 100,134 133,172 Z",
  "M129,170 C97,168 64,180 39,204 C72,190 105,184 131,176 Z",
  "M131,174 C102,196 82,226 74,262 C94,226 116,199 133,180 Z",
];

function Palm({ fill, flip }: { fill: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 220 460"
      height="100%"
      style={{
        display: "block",
        transform: flip ? "scaleX(-1)" : undefined,
        filter: "drop-shadow(0 0 20px rgba(0,0,0,.35))",
      }}
    >
      <g fill={fill}>
        {PALM_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Palm art slot: loads the generated PNG silhouette and falls back to the
 * original vector <Palm> via the same hydration-safe missing-art pattern as
 * ArtSlot (ref check for pre-hydration 404s + onError). The sway animation
 * classes live on the wrapper divs, so both the img and the SVG fallback sway.
 */
function PalmArt({ src, fill, flip }: { src: string; fill: string; flip?: boolean }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <Palm fill={fill} flip={flip} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      ref={(el) => {
        if (el && el.complete && el.naturalWidth === 0) setMissing(true);
      }}
      onError={() => setMissing(true)}
      style={{
        height: "100%",
        width: "auto",
        display: "block",
        filter: "drop-shadow(0 0 20px rgba(0,0,0,.35))",
      }}
    />
  );
}

function Flamingo() {
  return (
    <svg viewBox="0 0 300 220" width="100%" style={{ display: "block" }}>
      <ellipse cx="152" cy="182" rx="112" ry="22" fill="rgba(0,0,0,.22)" />
      <ellipse cx="150" cy="150" rx="120" ry="56" fill="#ff92b3" />
      <ellipse cx="150" cy="145" rx="120" ry="50" fill="#ffa9c2" />
      <ellipse cx="150" cy="151" rx="70" ry="29" fill="#0c2233" />
      <ellipse cx="150" cy="149" rx="70" ry="27" fill="#0e2a3e" />
      <ellipse cx="120" cy="132" rx="66" ry="15" fill="rgba(255,255,255,.32)" />
      <path d="M96,150 C84,110 90,72 116,56 C104,82 106,116 120,150 Z" fill="#ff92b3" />
      <path d="M96,150 C86,116 90,86 108,66 C101,90 104,120 116,150 Z" fill="#ffa9c2" />
      <circle cx="118" cy="52" r="16" fill="#ff92b3" />
      <circle cx="118" cy="50" r="13" fill="#ffb0c8" />
      <path d="M105,50 L84,58 L106,64 Z" fill="#ffce5b" />
      <path d="M84,58 L92,60 L90,55 Z" fill="#1a1420" />
      <circle cx="122" cy="49" r="2.6" fill="#241018" />
    </svg>
  );
}

// ── countdown ────────────────────────────────────────────────────────────────

function fmtShort(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}

// ── typography helpers ───────────────────────────────────────────────────────

const F_EX = "'Aktiv Grotesk Ex', sans-serif";
const F_CD = "'Aktiv Grotesk Cd', sans-serif";
const F_RG = "'Aktiv Grotesk', system-ui, -apple-system, sans-serif";

const dataValStyle: React.CSSProperties = {
  fontFamily: F_CD,
  fontWeight: 700,
  fontSize: "clamp(15px, 1.5vw, 19px)",
  letterSpacing: "0.01em",
  fontVariantNumeric: "tabular-nums",
};

const dataLabelStyle: React.CSSProperties = {
  fontFamily: F_CD,
  fontWeight: 500,
  fontSize: "clamp(10px, 1vw, 12px)",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: "rgba(248,253,255,.62)",
};

function DataDot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: "0 0 10px " + color,
        flexShrink: 0,
      }}
    />
  );
}

// ── the hero ─────────────────────────────────────────────────────────────────

export type BeachHeroProps = {
  bonded: number;
  totalTargets: number; // display denominator (5 pre-season)
  unlockedUsd: number;
  fullUsd: number;
  launchAt: string | null;
  endAt: string | null;
  serverNowMs: number;
  discordUrl: string;
};

export function BeachHero({
  bonded,
  totalTargets,
  unlockedUsd,
  fullUsd,
  launchAt,
  endAt,
  serverNowMs,
  discordUrl,
}: BeachHeroProps) {
  // Server clock first (so hydration markup matches), then client ticks with
  // the initial offset — the proven SeasonCountdown approach.
  const [nowMs, setNowMs] = useState(serverNowMs);
  useEffect(() => {
    const offset = serverNowMs - Date.now();
    const id = setInterval(() => setNowMs(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [serverNowMs]);

  const launchMs = launchAt ? new Date(launchAt).getTime() : NaN;
  const endMs = endAt ? new Date(endAt).getTime() : NaN;
  let cd: { label: string; value: string } | null = null;
  if (Number.isFinite(launchMs) && nowMs < launchMs) {
    cd = { label: "Season opens", value: fmtShort(launchMs - nowMs) };
  } else if (Number.isFinite(endMs) && nowMs < endMs) {
    cd = { label: "Season ends", value: fmtShort(endMs - nowMs) };
  } else if (Number.isFinite(endMs)) {
    cd = { label: "Season", value: "Complete" };
  }

  const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

  return (
    <section
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100dvh",
        overflow: "hidden",
        background: "#060912",
        isolation: "isolate",
        fontFamily: F_RG,
      }}
    >
      {/* dangerouslySetInnerHTML, NOT a text child: React HTML-escapes text
          children on the server (quotes become entities), which both corrupts
          the CSS and causes a hydration mismatch. */}
      <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />

      {/* SKY */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background:
            "linear-gradient(180deg, #080a1e 0%, #1a123c 15%, #3a1a56 29%, #6c2a5e 43%, #b23f56 55%, #ec6a45 63%, #ffa85a 68%, #ffce85 72%, #7a3a52 80%, #1b1428 90%, #0a0716 100%)",
        }}
      />

      {/* SUN */}
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          left: "50%",
          top: "60%",
          width: "min(820px, 78vw)",
          height: "min(820px, 78vw)",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, #fff6da 0%, #ffe6ac 16%, #ffbf6e 32%, rgba(255,150,82,.55) 48%, rgba(255,120,90,.16) 66%, rgba(255,110,100,0) 78%)",
          pointerEvents: "none",
        }}
      />

      {/* OCEAN */}
      <div
        style={{
          position: "absolute",
          zIndex: 3,
          left: 0,
          right: 0,
          top: "63%",
          height: "22%",
          background:
            "linear-gradient(180deg, #ffd28c 0%, #ff9f5f 12%, #d8636e 38%, #8a3a68 70%, #3f2050 100%)",
        }}
      />
      {/* sun glitter column on ocean */}
      <div
        className="s4bh-glint"
        style={{
          position: "absolute",
          zIndex: 4,
          left: "50%",
          top: "63%",
          width: "min(320px, 34vw)",
          height: "22%",
          transform: "translateX(-50%)",
          background:
            "linear-gradient(180deg, rgba(255,244,214,.85) 0%, rgba(255,206,140,.45) 45%, rgba(255,180,120,.05) 100%)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 30%, #000 70%, transparent)",
          maskImage: "linear-gradient(90deg, transparent, #000 30%, #000 70%, transparent)",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
      {/* ocean shimmer bands */}
      <div
        className="s4bh-ocean-sh"
        style={{
          position: "absolute",
          zIndex: 4,
          left: 0,
          right: 0,
          top: "64%",
          height: "20%",
          background:
            "repeating-linear-gradient(0deg, rgba(255,244,220,0) 0 5px, rgba(255,244,220,.14) 5px 6px)",
          backgroundSize: "100% 12px",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* INFINITY POOL FOREGROUND */}
      <div
        style={{
          position: "absolute",
          zIndex: 5,
          left: 0,
          right: 0,
          top: "82%",
          bottom: 0,
          background: "linear-gradient(180deg, #123049 0%, #0b2135 45%, #071320 100%)",
        }}
      />
      {/* reflected warm streak on pool */}
      <div
        className="s4bh-glint"
        style={{
          position: "absolute",
          zIndex: 6,
          left: "50%",
          top: "82%",
          width: "min(360px, 40vw)",
          bottom: 0,
          transform: "translateX(-50%)",
          background:
            "linear-gradient(180deg, rgba(255,190,120,.5) 0%, rgba(255,150,110,.12) 60%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 40%, #000 60%, transparent)",
          maskImage: "linear-gradient(90deg, transparent, #000 40%, #000 60%, transparent)",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
      {/* infinity edge glow line */}
      <div
        style={{
          position: "absolute",
          zIndex: 6,
          left: 0,
          right: 0,
          top: "81.4%",
          height: 2,
          background:
            "linear-gradient(90deg, transparent 4%, rgba(120,226,255,.55) 30%, rgba(255,224,164,.85) 50%, rgba(120,226,255,.55) 70%, transparent 96%)",
          boxShadow: "0 0 22px rgba(120,220,255,.5), 0 0 40px rgba(255,200,140,.3)",
          pointerEvents: "none",
        }}
      />

      {/* PALMS */}
      <div
        className="s4bh-palm-l"
        style={{
          position: "absolute",
          zIndex: 7,
          bottom: -16,
          left: -34,
          height: "clamp(340px, 58vh, 650px)",
          transformOrigin: "bottom center",
          pointerEvents: "none",
        }}
      >
        <PalmArt src="/s4-art/hero/palm-left.png" fill="#100918" />
      </div>
      <div
        className="s4bh-palm-r"
        style={{
          position: "absolute",
          zIndex: 7,
          bottom: -22,
          right: -44,
          height: "clamp(300px, 52vh, 600px)",
          transformOrigin: "bottom center",
          pointerEvents: "none",
        }}
      >
        <PalmArt src="/s4-art/hero/palm-right.png" fill="#0d0715" flip />
      </div>

      {/* BOKEH + SPARKLES */}
      <div style={{ position: "absolute", inset: 0, zIndex: 8, pointerEvents: "none", overflow: "hidden" }}>
        {BOKEH.map((b, i) => (
          <div
            key={i}
            className="s4bh-bokeh"
            style={
              {
                top: b.top,
                left: b.left,
                width: b.size,
                height: b.size,
                background: b.bg,
                "--dur": b.dur,
                "--delay": b.delay,
              } as React.CSSProperties
            }
          />
        ))}
        {SPARKLES.map((s, i) => (
          <div
            key={i}
            className="s4bh-spark"
            style={
              {
                top: s.top,
                left: s.left,
                width: s.size,
                height: s.size,
                "--dir": s.dir,
                "--dur": s.dur,
                "--delay": s.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* VIGNETTE (glow-out-of-darkness) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 9,
          pointerEvents: "none",
          background:
            "radial-gradient(118% 86% at 50% 44%, transparent 40%, rgba(6,9,18,.42) 74%, rgba(6,9,18,.78) 100%), linear-gradient(180deg, rgba(6,9,18,.72) 0%, rgba(6,9,18,.1) 15%, rgba(6,9,18,0) 40%, rgba(6,9,18,0) 68%, rgba(6,9,18,.72) 86%, rgba(6,9,18,.96) 100%)",
        }}
      />

      {/* DIAGONAL LIGHT-RAY SWEEP (subtle, behind the girls — gacha splash) */}
      <div
        className="s4bh-rays"
        aria-hidden="true"
        style={{
          position: "absolute",
          zIndex: 10,
          left: "50%",
          top: "-6%",
          width: "min(1500px, 140vw)",
          height: "112%",
          transform: "translateX(-50%)",
          background:
            "repeating-linear-gradient(112deg, rgba(255,224,170,0) 0 90px, rgba(255,224,170,.06) 90px 150px, rgba(255,150,190,.045) 150px 210px, rgba(255,224,170,0) 210px 300px)",
          WebkitMaskImage: "radial-gradient(68% 62% at 50% 46%, #000 28%, transparent 76%)",
          maskImage: "radial-gradient(68% 62% at 50% 46%, #000 28%, transparent 76%)",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* S4 SEASON BADGE CHIP */}
      <div
        className="s4bh-badge"
        style={{
          position: "absolute",
          zIndex: 45,
          top: "max(16px, env(safe-area-inset-top, 0px))",
          left: 16,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 14px",
          borderRadius: 999,
          background: "linear-gradient(180deg, rgba(255,228,164,.16), rgba(240,179,64,.09))",
          border: "1px solid rgba(240,179,64,.45)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: "0 4px 18px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.14)",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: F_EX,
            fontWeight: 900,
            fontSize: 14,
            letterSpacing: "0.06em",
            background: "linear-gradient(180deg, #ffe4a4 0%, #f0b340 70%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 1px 6px rgba(240,179,64,.4))",
          }}
        >
          S4
        </span>
        <span
          style={{
            fontFamily: F_CD,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,215,160,.85)",
          }}
        >
          Season
        </span>
      </div>

      {/* TITLE BLOCK — desktop: pinned LOW so the chrome title overlaps the
          girls' lower half (gacha splash); the ≤860px media query sends it
          back to the top of the hero (mobile layout unchanged). */}
      <div
        className="s4bh-title"
        style={{
          position: "absolute",
          zIndex: 30,
          bottom: "26%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(1120px, 92%)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontFamily: F_CD,
            fontWeight: 700,
            fontSize: "clamp(11px, 1.4vw, 15px)",
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            color: "#ffd7a0",
            textShadow: "0 1px 14px rgba(255,140,90,.5)",
            marginBottom: "clamp(10px, 1.6vh, 20px)",
          }}
        >
          Launch&nbsp;Wars&nbsp;&nbsp;&middot;&nbsp;&nbsp;Season&nbsp;4
        </div>

        <div style={{ position: "relative", display: "inline-block" }}>
          <h1
            style={{
              margin: 0,
              fontFamily: F_EX,
              fontWeight: 900,
              fontSize: "clamp(46px, 9vw, 138px)",
              lineHeight: 0.9,
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
              background: "linear-gradient(96deg, #ff4f9d 0%, #ff86ae 26%, #ffd07f 66%, #f0b340 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter:
                "drop-shadow(0 4px 26px rgba(255,90,150,.35)) drop-shadow(0 10px 30px rgba(0,0,0,.65)) drop-shadow(0 2px 8px rgba(0,0,0,.55))",
            }}
          >
            Doma&nbsp;Beach
            <br />
            Party
          </h1>
          <div
            className="s4bh-shine"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              fontFamily: F_EX,
              fontWeight: 900,
              fontSize: "clamp(46px, 9vw, 138px)",
              lineHeight: 0.9,
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
              background:
                "linear-gradient(100deg, transparent 40%, rgba(255,255,255,.9) 49%, rgba(255,255,255,.9) 51%, transparent 60%)",
              backgroundSize: "260% 100%",
              backgroundPosition: "230% 0",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Doma&nbsp;Beach
            <br />
            Party
          </div>
        </div>

        <p
          style={{
            fontFamily: F_RG,
            fontWeight: 400,
            fontSize: "clamp(15px, 1.9vw, 22px)",
            color: "rgba(248,253,255,.85)",
            margin: "clamp(14px, 2vh, 26px) 0 0",
            letterSpacing: "0.01em",
            textShadow: "0 2px 18px rgba(0,0,0,.75), 0 1px 4px rgba(0,0,0,.6)",
          }}
        >
          Three teams. Five domains. One endless summer.
        </p>
        <p
          style={{
            fontFamily: F_RG,
            fontWeight: 400,
            fontSize: "clamp(13px, 1.4vw, 16px)",
            color: "rgba(248,253,255,.66)",
            margin: "clamp(8px, 1.2vh, 14px) auto 0",
            maxWidth: 620,
            lineHeight: 1.55,
            textShadow: "0 2px 16px rgba(0,0,0,.8), 0 1px 4px rgba(0,0,0,.6)",
          }}
        >
          Hold a domain from $5, earn Simps every day, and help every cabana bond. Bonded domains
          pay everyone.
        </p>
      </div>

      {/* CHARACTER GLOWS (intertwining team blooms) */}
      <div
        className="s4bh-glow s4bh-glow-side"
        style={
          {
            position: "absolute",
            zIndex: 12,
            left: "30%",
            top: "66%",
            width: "clamp(320px, 34vw, 540px)",
            height: "clamp(320px, 34vw, 540px)",
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(circle, rgba(240,179,64,.85) 0%, rgba(240,179,64,.3) 32%, rgba(240,179,64,0) 64%)",
            mixBlendMode: "screen",
            filter: "blur(24px)",
            pointerEvents: "none",
            opacity: 0.82,
            "--dur": "8s",
            "--delay": "0s",
          } as React.CSSProperties
        }
      />
      <div
        className="s4bh-glow s4bh-glow-side"
        style={
          {
            position: "absolute",
            zIndex: 12,
            left: "70%",
            top: "66%",
            width: "clamp(320px, 34vw, 540px)",
            height: "clamp(320px, 34vw, 540px)",
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(circle, rgba(77,216,230,.85) 0%, rgba(77,216,230,.28) 32%, rgba(77,216,230,0) 64%)",
            mixBlendMode: "screen",
            filter: "blur(24px)",
            pointerEvents: "none",
            opacity: 0.82,
            "--dur": "10s",
            "--delay": "1.5s",
          } as React.CSSProperties
        }
      />
      <div
        className="s4bh-glow s4bh-glow-center"
        style={
          {
            position: "absolute",
            zIndex: 12,
            left: "50%",
            top: "63%",
            width: "clamp(380px, 40vw, 620px)",
            height: "clamp(380px, 40vw, 620px)",
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(circle, rgba(255,126,182,.9) 0%, rgba(255,126,182,.32) 32%, rgba(255,126,182,0) 64%)",
            mixBlendMode: "screen",
            filter: "blur(26px)",
            pointerEvents: "none",
            opacity: 0.82,
            "--dur": "9s",
            "--delay": ".7s",
          } as React.CSSProperties
        }
      />

      {/* CHARACTERS (left GOLD / center PINK / right AQUA) — gacha splash:
          the center girl is the biggest, the side girls are pulled inward and
          tucked behind her shoulders (lower z), all three overlapping. */}
      <div
        className="s4bh-girl-side"
        style={{
          position: "absolute",
          zIndex: 21,
          bottom: "1%",
          left: "30%",
          transform: "translateX(-50%)",
          width: "clamp(280px, 30vw, 470px)",
          height: "clamp(400px, 74vh, 840px)",
        }}
      >
        <ArtSlot
          src="/s4-art/hero/hero-gold.png"
          accent={TEAM_GOLD}
          imgStyle={{ filter: "drop-shadow(0 0 30px rgba(240,179,64,.35))" }}
        />
      </div>
      <div
        className="s4bh-girl-side"
        style={{
          position: "absolute",
          zIndex: 21,
          bottom: "1%",
          left: "70%",
          transform: "translateX(-50%)",
          width: "clamp(280px, 30vw, 470px)",
          height: "clamp(400px, 74vh, 840px)",
        }}
      >
        <ArtSlot
          src="/s4-art/hero/hero-aqua.png"
          accent={TEAM_AQUA}
          imgStyle={{ filter: "drop-shadow(0 0 30px rgba(77,216,230,.35))" }}
        />
      </div>
      <div
        className="s4bh-girl-center"
        style={{
          position: "absolute",
          zIndex: 23,
          bottom: "2%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "clamp(330px, 42vw, 600px)",
          height: "clamp(460px, 88vh, 980px)",
        }}
      >
        <ArtSlot
          src="/s4-art/hero/hero-pink.png"
          accent={TEAM_PINK}
          imgStyle={{ filter: "drop-shadow(0 0 32px rgba(255,126,182,.38))" }}
        />
      </div>

      {/* FLAMINGO FLOAT */}
      <div
        className="s4bh-float s4bh-flam"
        style={{
          position: "absolute",
          zIndex: 26,
          bottom: "1.5%",
          left: "9%",
          width: "clamp(150px, 17vw, 242px)",
          pointerEvents: "none",
          filter: "drop-shadow(0 12px 22px rgba(0,0,0,.4))",
        }}
      >
        <Flamingo />
      </div>

      {/* DATA STRIP + CTAS */}
      <div
        className="s4bh-bottom"
        style={{
          position: "absolute",
          zIndex: 40,
          bottom: "4.5%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(1000px, 92%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "clamp(18px, 2.6vh, 28px)",
        }}
      >
        <div
          className="s4bh-data"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: "clamp(16px, 2.4vw, 32px)",
            padding: "14px clamp(20px, 2.8vw, 36px)",
            borderRadius: 16,
            background: "rgba(248,253,255,.05)",
            border: "1px solid rgba(248,253,255,.13)",
            backdropFilter: "blur(16px) saturate(1.3)",
            WebkitBackdropFilter: "blur(16px) saturate(1.3)",
            boxShadow: "0 10px 34px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.09)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <DataDot color={TEAM_GOLD} />
            <span style={{ ...dataValStyle, color: "#ffd27a" }}>
              {bonded}/{totalTargets}
            </span>
            <span style={dataLabelStyle}>Domains bonded</span>
          </div>
          <span className="s4bh-data-div" style={{ width: 1, height: 26, background: "rgba(248,253,255,.16)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <DataDot color="#3de3a4" />
            <span style={{ ...dataValStyle, color: "#7bf0c4" }}>
              {usd(unlockedUsd)} / {usd(fullUsd)}
            </span>
            <span style={dataLabelStyle}>Unlocked</span>
          </div>
          {cd ? (
            <>
              <span
                className="s4bh-data-div"
                style={{ width: 1, height: 26, background: "rgba(248,253,255,.16)" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <DataDot color={TEAM_AQUA} />
                <span style={dataLabelStyle}>{cd.label}</span>
                <span style={{ ...dataValStyle, color: "#8fe9f2" }}>{cd.value}</span>
              </div>
            </>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 14 }}>
          <a
            className="s4bh-cta s4bh-cta-primary"
            href={discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: F_RG,
              fontWeight: 600,
              fontSize: "clamp(15px, 1.4vw, 17px)",
              letterSpacing: "0.01em",
              color: "#3a2200",
              background: "linear-gradient(180deg, #ffe4a4 0%, #f0b340 54%, #e19c28 100%)",
              border: "none",
              padding: "15px 34px",
              borderRadius: 12,
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Join the party
          </a>
          <Link
            className="s4bh-cta-ghost"
            href="/s4/map"
            style={{
              fontFamily: F_RG,
              fontWeight: 500,
              fontSize: "clamp(15px, 1.4vw, 17px)",
              color: "#F8FDFF",
              background: "rgba(248,253,255,.06)",
              border: "1px solid rgba(248,253,255,.28)",
              padding: "15px 30px",
              borderRadius: 12,
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-block",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          >
            See the beach
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── hero CSS (fonts, keyframes, motion gating, breakpoints) ─────────────────
// GOTCHA: no backticks anywhere inside this template literal, comments included.

const HERO_CSS = `
@font-face { font-family:'Aktiv Grotesk'; font-weight:400; font-style:normal; font-display:swap; src:url('/s4-art/fonts/AktivGrotesk_Rg.ttf') format('truetype'); }
@font-face { font-family:'Aktiv Grotesk'; font-weight:500; font-style:normal; font-display:swap; src:url('/s4-art/fonts/AktivGrotesk_Md.ttf') format('truetype'); }
@font-face { font-family:'Aktiv Grotesk Ex'; font-weight:700; font-style:normal; font-display:swap; src:url('/s4-art/fonts/AktivGroteskEx_Bd.ttf') format('truetype'); }
@font-face { font-family:'Aktiv Grotesk Ex'; font-weight:900; font-style:normal; font-display:swap; src:url('/s4-art/fonts/AktivGroteskEx_Blk.ttf') format('truetype'); }
@font-face { font-family:'Aktiv Grotesk Cd'; font-weight:500; font-style:normal; font-display:swap; src:url('/s4-art/fonts/AktivGroteskCd_Md.ttf') format('truetype'); }
@font-face { font-family:'Aktiv Grotesk Cd'; font-weight:700; font-style:normal; font-display:swap; src:url('/s4-art/fonts/AktivGroteskCd_Bd.ttf') format('truetype'); }

@keyframes s4bhShine { 0% { background-position:230% 0; } 100% { background-position:-130% 0; } }
@keyframes s4bhShimmer { 0% { background-position:0 0; opacity:.35; } 50% { opacity:.8; } 100% { background-position:120px 0; opacity:.35; } }
@keyframes s4bhGlint { 0%,100% { opacity:.3; transform:translateX(-50%) scaleY(.9); } 50% { opacity:.9; transform:translateX(-50%) scaleY(1.06); } }
@keyframes s4bhSway  { 0%,100% { transform:rotate(-1.5deg); } 50% { transform:rotate(1.6deg); } }
@keyframes s4bhSwayR { 0%,100% { transform:rotate(1.5deg); } 50% { transform:rotate(-1.6deg); } }
@keyframes s4bhBokeh { 0% { transform:translate(0,0); opacity:0; } 14% { opacity:.75; } 82% { opacity:.6; } 100% { transform:translate(16px,-46px); opacity:0; } }
@keyframes s4bhFloat { 0%,100% { transform:translateY(0) rotate(-1.2deg); } 50% { transform:translateY(-12px) rotate(1.2deg); } }
@keyframes s4bhPulse { 0%,100% { box-shadow:0 8px 24px rgba(240,179,64,.34), 0 0 0 rgba(240,179,64,0), inset 0 1px 0 rgba(255,255,255,.65); } 50% { box-shadow:0 12px 40px rgba(240,179,64,.6), 0 0 26px rgba(240,179,64,.32), inset 0 1px 0 rgba(255,255,255,.75); } }
@keyframes s4bhTwinkle { 0%,100% { opacity:.18; transform:scale(.7); } 50% { opacity:1; transform:scale(1.1); } }
@keyframes s4bhBreathe { 0%,100% { opacity:.72; transform:translate(-50%,-50%) scale(.98); } 50% { opacity:1; transform:translate(-50%,-50%) scale(1.03); } }

.s4bh-bokeh { position:absolute; border-radius:50%; filter:blur(7px); pointer-events:none; opacity:.5; }
.s4bh-spark { position:absolute; border-radius:50%; pointer-events:none; background:radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(255,236,190,.5) 40%, rgba(255,236,190,0) 70%); opacity:.4; }
.s4bh-spark::before, .s4bh-spark::after { content:""; position:absolute; left:50%; top:50%; background:linear-gradient(var(--dir), transparent, rgba(255,255,255,.85), transparent); }
.s4bh-spark::before { width:1.5px; height:340%; transform:translate(-50%,-50%); }
.s4bh-spark::after  { height:1.5px; width:340%;  transform:translate(-50%,-50%); }

.s4bh-cta-primary { box-shadow:0 8px 24px rgba(240,179,64,.34), inset 0 1px 0 rgba(255,255,255,.65); transition:filter .18s ease, transform .18s ease; }
.s4bh-cta-primary:hover { filter:brightness(1.06); transform:translateY(-1px); }
.s4bh-cta-ghost { transition:background .18s ease, border-color .18s ease; }
.s4bh-cta-ghost:hover { background:rgba(248,253,255,.13) !important; border-color:rgba(248,253,255,.5) !important; }

@media (prefers-reduced-motion: no-preference) {
  .s4bh-shine    { animation: s4bhShine 6s ease-in-out 1.2s infinite; }
  .s4bh-ocean-sh { animation: s4bhShimmer 7s linear infinite; }
  .s4bh-glint    { animation: s4bhGlint 4.5s ease-in-out infinite; }
  .s4bh-palm-l   { animation: s4bhSway  9s ease-in-out infinite; }
  .s4bh-palm-r   { animation: s4bhSwayR 11s ease-in-out infinite; }
  .s4bh-bokeh    { animation: s4bhBokeh var(--dur,14s) ease-in-out var(--delay,0s) infinite; opacity:0; }
  .s4bh-spark    { animation: s4bhTwinkle var(--dur,5s) ease-in-out var(--delay,0s) infinite; }
  .s4bh-float    { animation: s4bhFloat 6.5s ease-in-out infinite; }
  .s4bh-cta      { animation: s4bhPulse 3.4s ease-in-out infinite; }
  .s4bh-glow     { animation: s4bhBreathe var(--dur,9s) ease-in-out var(--delay,0s) infinite; }
}

@media (max-width: 860px) {
  .s4bh-girl-side { display:none !important; }
  .s4bh-glow-side { display:none !important; }
  /* Mobile keeps the proven layout: text stack back at the TOP of the hero
     (the desktop gacha position pins it low over the girls' legs). */
  .s4bh-title { top:6.5% !important; bottom:auto !important; }
  .s4bh-rays { opacity:.55; }
  /* Narrow layout: the text stack owns the top of the hero; the center girl
     drops DOWN and BEHIND it (below the title block's z-index 11), shrinks to
     40vh anchored to the hero's bottom edge, and fades slightly so copy and
     the data strip never fight her. */
  .s4bh-girl-center {
    z-index:10 !important;
    bottom:0 !important;
    height:40vh !important;
    max-height:40vh !important;
    width:min(74vw, 330px) !important;
    opacity:.9;
  }
  /* dark gradient over her lower half so the data strip + CTAs pop */
  .s4bh-girl-center::after {
    content:"";
    position:absolute;
    left:-14%;
    right:-14%;
    bottom:0;
    height:58%;
    background:linear-gradient(180deg, rgba(6,9,18,0) 0%, rgba(6,9,18,.55) 55%, rgba(6,9,18,.92) 100%);
    pointer-events:none;
  }
  .s4bh-glow-center { z-index:8 !important; top:78% !important; opacity:.55 !important; }
  .s4bh-flam { width:112px !important; bottom:0.5% !important; left:4% !important; opacity:.85; }
  /* safe bottom padding: keep the CTAs clear of the flamingo + browser chrome */
  .s4bh-bottom { bottom:max(4.5%, calc(20px + env(safe-area-inset-bottom, 0px))) !important; }
}
@media (max-width: 600px) {
  .s4bh-data { flex-direction:column !important; align-items:stretch !important; gap:12px !important; }
  .s4bh-data-div { display:none !important; }
  .s4bh-palm-l, .s4bh-palm-r { opacity:.55; }
}
`;
