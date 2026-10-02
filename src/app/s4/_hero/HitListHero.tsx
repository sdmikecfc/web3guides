/**
 * THE HIT LIST hero — faithful React port of Mike's Claude Design export
 * (public/Launch Wars S4_ Doma Assassins/The Hit List v1 (dossier).dc.html,
 * the variant the screenshots/lower.png sign-off shows). Night-city dossier
 * scene: skyline with lit windows, rain on glass, crimson cinematic wash, a
 * classified case-file header strip, the giant condensed THE HIT LIST title
 * over a red-string evidence board, three fanned dossier cards (one per
 * team), the live bounty ledger (pool / contracts / countdown), and both
 * CTAs. The comic variant (The Hit List.dc.html) contributed the era chips
 * (EST. 1887 / 2087 / NOW) and the footer barcode bug.
 *
 * Client component. Live numbers arrive as props from the server snapshot
 * (lib/s4/data.ts) so the ledger is honest pre-season: 0 of 5 contracts,
 * $0 of $500, and the countdown card disappears when no season dates exist.
 *
 * ART: /s4-art/ is empty until the CMO art gate clears. Every image goes
 * through the proven hydration-safe missing-art pattern (ref checks
 * complete && naturalWidth === 0 at mount, plus onError) and falls back to a
 * premium vector treatment, so the hero looks intentional with zero images:
 * - dossier cards fall back to a redacted "NO PHOTO ON FILE" subject panel
 *   (bust silhouette + reticle), which IS the classified fiction;
 * - ArtSlot (exported, reused by the landing sections) falls back to the
 *   team-colored full-body silhouette.
 *
 * All animation is behind prefers-reduced-motion: no-preference, exactly like
 * the design export. No backticks inside the CSS template literal. <style>
 * uses dangerouslySetInnerHTML (server HTML-escapes quotes in style text
 * children = hydration mismatch).
 */
"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { DEFAULT_THEME } from "@/lib/s4/theme";
import type { HeroStrings } from "@/lib/s4/strings";

export const CRIMSON = "#e33d4e";
export const TEAM_GOLD = DEFAULT_THEME.teams[0].accent; // #f0b340 alpha
export const TEAM_VIOLET = DEFAULT_THEME.teams[1].accent; // #c44dff beta
export const TEAM_ICE = DEFAULT_THEME.teams[2].accent; // #4dd8e6 gamma

const INK = "#07080c";

// ── missing-art fallbacks ────────────────────────────────────────────────────

/**
 * Tasteful team-colored full-body silhouette shown while a transparent PNG is
 * absent (contain-fit slots: landing team cards, gallery). Dark figure with an
 * accent rim glow, anchored to the bottom of its slot. Verbatim the proven
 * BeachHero pattern.
 */
function Silhouette({ accent }: { accent: string }) {
  const uid = useId();
  const gid = "s4hl-fig-" + uid.replace(/[^a-zA-Z0-9-]/g, "");
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
            <stop offset="34%" stopColor="#131018" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#0a0810" stopOpacity="1" />
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
 * Image slot with graceful absence (contain fit, bottom anchored). Renders the
 * PNG when it exists; when the request 404s it swaps to the team-colored
 * Silhouette. The ref check catches a 404 that resolved BEFORE hydration
 * (onError never fires for those — the event is gone by the time React
 * attaches it), the proven S3/S4 pattern.
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

/**
 * The redacted-subject panel behind a missing dossier photo: accent bloom,
 * scanlines, halftone corner, a bust silhouette inside a dashed reticle, and
 * the mono NO PHOTO ON FILE tag. Looks like classified fiction, not a 404.
 */
function DossierRedacted({ accent }: { accent: string }) {
  const uid = useId();
  const gid = "s4hl-bust-" + uid.replace(/[^a-zA-Z0-9-]/g, "");
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background:
          "radial-gradient(130% 92% at 50% 108%, " +
          accent +
          "2e 0%, rgba(10,11,16,0) 58%), linear-gradient(180deg, #10121a 0%, #0b0d13 55%, #08090e 100%)",
      }}
    >
      {/* scanlines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "repeating-linear-gradient(0deg, transparent 0 3px, rgba(244,246,251,.028) 3px 4px)",
        }}
      />
      {/* halftone corner */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "58%",
          height: "58%",
          clipPath: "polygon(0 0,100% 0,0 100%)",
          backgroundImage: "radial-gradient(" + accent + " 1.4px, transparent 1.7px)",
          backgroundSize: "7px 7px",
          opacity: 0.22,
        }}
      />
      {/* bust silhouette + reticle */}
      <svg viewBox="0 0 200 260" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
            <stop offset="45%" stopColor="#161320" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#0b0912" stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx="100"
          cy="118"
          r="62"
          fill="none"
          stroke={accent}
          strokeOpacity="0.4"
          strokeWidth="1.4"
          strokeDasharray="5 7"
        />
        <line x1="100" y1="42" x2="100" y2="62" stroke={accent} strokeOpacity="0.4" strokeWidth="1.4" />
        <line x1="30" y1="118" x2="50" y2="118" stroke={accent} strokeOpacity="0.4" strokeWidth="1.4" />
        <line x1="150" y1="118" x2="170" y2="118" stroke={accent} strokeOpacity="0.4" strokeWidth="1.4" />
        <g style={{ filter: "drop-shadow(0 0 18px " + accent + "44)" }}>
          <circle cx="100" cy="104" r="30" fill={"url(#" + gid + ")"} />
          <path
            d="M100 138 C68 142 46 162 38 202 L34 260 L166 260 L162 202 C154 162 132 142 100 138 Z"
            fill={"url(#" + gid + ")"}
          />
        </g>
      </svg>
      {/* tag */}
      <div
        style={{
          position: "absolute",
          top: "8%",
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: F_MONO,
          fontSize: 9,
          letterSpacing: "0.26em",
          color: accent,
          opacity: 0.85,
        }}
      >
        NO PHOTO ON FILE
      </div>
    </div>
  );
}

/** Dossier card photo: cover fit with the redacted-subject fallback. */
function DossierPhoto({ src, accent, alt = "" }: { src: string; accent: string; alt?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <DossierRedacted accent={accent} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      ref={(el) => {
        if (el && el.complete && el.naturalWidth === 0) setMissing(true);
      }}
      onError={() => setMissing(true)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "top center",
        display: "block",
      }}
    />
  );
}

// ── typography ───────────────────────────────────────────────────────────────

const F_CD = "'Aktiv Grotesk Cd', 'Arial Narrow', sans-serif";
const F_RG = "'Aktiv Grotesk', system-ui, -apple-system, sans-serif";
const F_MONO = "ui-monospace, Menlo, Consolas, monospace";

// ── scene constants (verbatim heights/flexes from the design export) ─────────

const SKYLINE: Array<{ f: number; h: number; win: string; body: string }> = [
  { f: 1.2, h: 38, win: "rgba(240,179,64,.05)", body: "#0d1019" },
  { f: 0.8, h: 62, win: "rgba(196,77,255,.045)", body: "#0e1119" },
  { f: 1.0, h: 48, win: "rgba(77,216,230,.05)", body: "#0d1019" },
  { f: 0.7, h: 78, win: "rgba(196,77,255,.055)", body: "#0f1220" },
  { f: 1.1, h: 34, win: "rgba(240,179,64,.045)", body: "#0d1019" },
  { f: 0.9, h: 90, win: "rgba(77,216,230,.06)", body: "#101426" },
  { f: 1.0, h: 52, win: "rgba(240,179,64,.04)", body: "#0d1019" },
  { f: 0.75, h: 70, win: "rgba(196,77,255,.05)", body: "#0e1119" },
  { f: 1.3, h: 40, win: "rgba(240,179,64,.045)", body: "#0d1019" },
  { f: 0.65, h: 84, win: "rgba(77,216,230,.055)", body: "#0f1324" },
  { f: 1.0, h: 44, win: "rgba(240,179,64,.04)", body: "#0d1019" },
  { f: 0.85, h: 66, win: "rgba(196,77,255,.05)", body: "#0e1220" },
  { f: 1.15, h: 36, win: "rgba(240,179,64,.045)", body: "#0d1019" },
  { f: 0.7, h: 74, win: "rgba(77,216,230,.055)", body: "#0f1220" },
];

/** Red-string evidence board behind the title (positions from the export). */
const STRINGS: Array<React.CSSProperties> = [
  { top: "20%", left: "12%", width: "34%", background: "linear-gradient(90deg,rgba(227,61,78,.35),rgba(227,61,78,.12))", transform: "rotate(9deg)" },
  { top: "58%", left: "24%", width: "44%", background: "linear-gradient(90deg,rgba(227,61,78,.1),rgba(227,61,78,.32))", transform: "rotate(-6deg)" },
  { top: "34%", left: "58%", width: "30%", background: "rgba(227,61,78,.22)", transform: "rotate(16deg)" },
  { top: "70%", left: "8%", width: "26%", background: "rgba(227,61,78,.18)", transform: "rotate(-14deg)" },
];

const BOARD_PHOTOS: Array<React.CSSProperties> = [
  { top: "8%", left: "9%", width: 74, height: 92, transform: "rotate(-7deg)" },
  { top: "2%", left: "44%", width: 66, height: 82, transform: "rotate(5deg)" },
  { top: "12%", right: "11%", width: 70, height: 88, transform: "rotate(8deg)" },
  { bottom: "2%", left: "26%", width: 64, height: 80, transform: "rotate(-4deg)" },
  { bottom: "6%", right: "24%", width: 68, height: 84, transform: "rotate(6deg)" },
];

const PINS: Array<React.CSSProperties> = [
  { top: "8%", left: "9%" },
  { top: "2%", left: "44%" },
  { top: "12%", right: "11%" },
];

/** Era identity per stable team key (comic variant's EST. chips + classes). */
const ERAS: Record<string, { est: string; cls: string; sub: string; fileNo: string }> = {
  alpha: { est: "EST. 1887", cls: "THE COWGIRL", sub: "WILD WEST · DEAD OR ALIVE", fileNo: "01" },
  beta: { est: "EST. 2087", cls: "THE MACHINE", sub: "FUTURE TECH · UNIT 77", fileNo: "02" },
  gamma: { est: "EST. NOW", cls: "THE SUIT", sub: "PRESENT DAY · CLEAN WORK", fileNo: "03" },
};

// ── countdown ────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Design-export ticker format: 11d 23h 59m 47s. */
function fmtTicker(ms: number): string {
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return d + "d " + pad2(h) + "h " + pad2(m) + "m " + pad2(s) + "s";
}

// ── ledger atoms ─────────────────────────────────────────────────────────────

function LedgerCoin({ glyph }: { glyph: string }) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: "radial-gradient(circle at 35% 30%, #ff6373, #b81f30 70%)",
        border: "1px solid rgba(255,120,132,.5)",
        boxShadow: "0 0 12px rgba(227,61,78,.5)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <span style={{ fontFamily: F_CD, fontWeight: 900, fontSize: 11, color: "#3a0810" }}>{glyph}</span>
    </div>
  );
}

const ledgerCardStyle: React.CSSProperties = {
  position: "relative",
  padding: "16px 18px",
  borderRadius: 16,
  border: "1px solid rgba(244,246,251,.1)",
  background: "linear-gradient(180deg, rgba(244,246,251,.04), rgba(244,246,251,.015))",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

const ledgerLabelStyle: React.CSSProperties = {
  fontFamily: F_MONO,
  fontSize: 10,
  letterSpacing: "0.18em",
  color: "rgba(244,246,251,.55)",
};

const ledgerValueStyle: React.CSSProperties = {
  marginTop: 10,
  fontFamily: F_CD,
  fontWeight: 900,
  fontSize: 30,
  lineHeight: 1,
  color: "#fff",
};

// ── the hero ─────────────────────────────────────────────────────────────────

export type HitListHeroProps = {
  bonded: number;
  totalTargets: number; // display denominator (5 pre-season)
  unlockedUsd: number;
  fullUsd: number;
  launchAt: string | null;
  endAt: string | null;
  serverNowMs: number;
  /** Wallet-first web sign-up route (/s4/join). Was discordUrl (a raw invite);
   *  Mike 2026-07-15: sign up on the web, link Discord later. */
  startUrl: string;
  /** Resolved (plain-string) copy for the active locale (lib/s4/strings). */
  strings: HeroStrings;
};

export function HitListHero({
  bonded,
  totalTargets,
  unlockedUsd,
  fullUsd,
  launchAt,
  endAt,
  serverNowMs,
  startUrl,
  strings,
}: HitListHeroProps) {
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
  let cd: { label: string; value: string; sub: string } | null = null;
  if (Number.isFinite(launchMs) && nowMs < launchMs) {
    cd = { label: strings.cdBriefingLabel, value: fmtTicker(launchMs - nowMs), sub: "CONTRACTS UNSEAL AT ZERO" };
  } else if (Number.isFinite(endMs) && nowMs < endMs) {
    cd = { label: strings.cdEndLabel, value: fmtTicker(endMs - nowMs), sub: "CONTRACTS LOCK AT ZERO" };
  } else if (Number.isFinite(endMs)) {
    cd = { label: strings.cdDoneLabel, value: strings.cdDoneValue, sub: "CONTRACTS LOCKED" };
  }

  const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const pct = fullUsd > 0 ? Math.max(0, Math.min(100, Math.round((unlockedUsd / fullUsd) * 100))) : 0;
  const pipCount = Math.max(1, Math.min(10, totalTargets));
  const teams = DEFAULT_THEME.teams;

  return (
    <section
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100dvh",
        overflow: "hidden",
        background: INK,
        isolation: "isolate",
        fontFamily: F_RG,
        color: "#f4f6fb",
        // Top padding clears the fixed global S4TopNav (52px) on every size.
        padding: "clamp(102px, 10vw, 114px) clamp(16px, 4vw, 56px) clamp(40px, 6vw, 64px)", // clears nav + contract ticker
      }}
    >
      {/* dangerouslySetInnerHTML, NOT a text child: React HTML-escapes text
          children on the server (quotes become entities), which both corrupts
          the CSS and causes a hydration mismatch. */}
      <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />

      {/* ── ATMOSPHERE ──────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: "radial-gradient(120% 80% at 50% -10%, #10121b 0%, #0a0b11 45%, #07080c 100%)",
        }}
      />
      {/* night skyline */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "46%",
          zIndex: 0,
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          opacity: 0.55,
          pointerEvents: "none",
        }}
      >
        {SKYLINE.map((b, i) => (
          <div
            key={i}
            style={{
              flex: b.f,
              height: b.h + "%",
              background: "linear-gradient(" + b.body + ", #070810)",
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent 0 13px, " + b.win + " 13px 15px)",
              borderTop: i === 0 ? "1px solid rgba(244,246,251,.04)" : undefined,
            }}
          />
        ))}
      </div>
      {/* searchlight sweep over the skyline */}
      <div
        className="s4hl-sweep"
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "30%",
          height: "56%",
          zIndex: 0,
          pointerEvents: "none",
          background: "linear-gradient(to top, rgba(240,179,64,.10), rgba(240,179,64,.02) 62%, transparent 80%)",
          clipPath: "polygon(42% 100%, 58% 100%, 96% 0, 4% 0)",
          mixBlendMode: "screen",
          opacity: 0.7,
        }}
      />
      {/* crimson cinematic wash + team side washes */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(60% 45% at 50% 30%, rgba(227,61,78,.16) 0%, rgba(227,61,78,0) 70%), radial-gradient(50% 40% at 12% 60%, rgba(240,179,64,.08) 0%, transparent 70%), radial-gradient(50% 40% at 88% 62%, rgba(196,77,255,.09) 0%, transparent 70%), radial-gradient(46% 34% at 62% 88%, rgba(77,216,230,.06) 0%, transparent 70%)",
        }}
      />
      {/* rain on glass */}
      <div
        className="s4hl-rain"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          opacity: 0.6,
          backgroundImage:
            "repeating-linear-gradient(101deg, transparent 0 3px, rgba(210,230,255,.05) 3px 4px, transparent 4px 11px), repeating-linear-gradient(99deg, transparent 0 7px, rgba(210,230,255,.03) 7px 8px, transparent 8px 22px)",
          backgroundSize: "auto 620px, auto 900px",
        }}
      />
      {/* top + bottom vignette */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: "linear-gradient(#07080c 0%, transparent 14%, transparent 82%, #07080c 100%)",
        }}
      />

      {/* ── CONTENT ─────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto" }}>
        {/* (1) CLASSIFIED FILE HEADER STRIP */}
        <div style={{ position: "relative", marginTop: 14 }}>
          {/* Classified strip. The folder-tab nav that used to sit here (CASE
              FILE / TARGETS / PAYOUTS) moved to the global S4TopNav — Mike
              2026-07-15: the two stacked tab bars read as duplicate chrome on the
              home page. This is now a clean, fully-rounded header strip. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              padding: "12px 16px",
              border: "1px solid rgba(244,246,251,.1)",
              borderRadius: 10,
              background: "rgba(10,12,18,.72)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontFamily: F_MONO,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  color: "#f4f6fb",
                }}
              >
                <span
                  className="s4hl-blink"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: CRIMSON,
                    boxShadow: "0 0 10px " + CRIMSON,
                  }}
                />
                LAUNCH WARS <span style={{ color: "rgba(244,246,251,.4)" }}>//</span> SEASON 4
              </span>
              <span className="s4hl-file-meta" style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: "0.14em", color: "rgba(244,246,251,.4)" }}>
                FILE №: LW-S4-0041
              </span>
              <span className="s4hl-file-meta" style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: "0.14em", color: "rgba(244,246,251,.4)" }}>
                CLEARANCE: EYES ONLY
              </span>
            </div>
            <div
              style={{
                fontFamily: F_CD,
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: "0.26em",
                color: CRIMSON,
                border: "2px solid rgba(227,61,78,.8)",
                borderRadius: 4,
                padding: "4px 12px 3px",
                transform: "rotate(-4deg)",
                boxShadow: "0 0 18px rgba(227,61,78,.25)",
                textShadow: "0 0 12px rgba(227,61,78,.4)",
              }}
            >
              CLASSIFIED
            </div>
          </div>
        </div>

        {/* (2) TITLE + string board */}
        <div style={{ position: "relative", marginTop: "clamp(36px, 6vw, 72px)" }}>
          <div className="s4hl-board" aria-hidden="true" style={{ position: "absolute", inset: "-30px -10px -20px", zIndex: 0, pointerEvents: "none" }}>
            {STRINGS.map((s, i) => (
              <div key={"s" + i} style={{ position: "absolute", height: 1, ...s }} />
            ))}
            {BOARD_PHOTOS.map((p, i) => (
              <div
                key={"p" + i}
                style={{
                  position: "absolute",
                  background: "rgba(244,246,251,.035)",
                  border: "1px solid rgba(244,246,251,.07)",
                  ...p,
                }}
              />
            ))}
            {PINS.map((p, i) => (
              <div
                key={"n" + i}
                style={{
                  position: "absolute",
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: CRIMSON,
                  boxShadow: "0 0 8px rgba(227,61,78,.6)",
                  ...p,
                }}
              />
            ))}
          </div>

          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <div
              style={{
                fontFamily: F_MONO,
                fontSize: "clamp(10px, 1.4vw, 13px)",
                letterSpacing: "0.4em",
                color: TEAM_ICE,
                marginBottom: "clamp(10px, 1.5vw, 18px)",
              }}
            >
              S4 DOSSIER · EYES ONLY
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: F_CD,
                fontWeight: 900,
                fontSize: "clamp(52px, 15vw, 200px)",
                lineHeight: 0.86,
                letterSpacing: "-0.01em",
                textTransform: "uppercase",
                color: "#f7f9fc",
                textShadow: "0 8px 40px rgba(0,0,0,.6)",
                whiteSpace: "nowrap",
              }}
            >
              THE&nbsp;HIT&nbsp;LIST
            </h1>
            {/* red slash underline */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: "clamp(6px, 1vw, 14px)" }}>
              <div
                style={{
                  width: "min(70%, 760px)",
                  height: "clamp(8px, 1vw, 14px)",
                  background:
                    "linear-gradient(90deg, rgba(227,61,78,0), #e33d4e 18%, #ff5a6a 60%, #e33d4e 90%, rgba(227,61,78,0))",
                  transform: "skewX(-24deg)",
                  boxShadow: "0 0 24px rgba(227,61,78,.5)",
                }}
              />
            </div>
            {/* barcode under the final word */}
            <div className="s4hl-barcode" style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <div style={{ textAlign: "right", width: "min(46%, 340px)" }}>
                <div
                  style={{
                    height: 34,
                    backgroundImage:
                      "repeating-linear-gradient(90deg, #f4f6fb 0 2px, transparent 2px 4px, #f4f6fb 4px 5px, transparent 5px 9px, #f4f6fb 9px 12px, transparent 12px 14px)",
                    opacity: 0.82,
                  }}
                />
                <div style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: "0.24em", color: "rgba(244,246,251,.5)", marginTop: 5 }}>
                  LW-S4 · 0041 · 77 · HIT
                </div>
              </div>
            </div>
          </div>

          {/* (3) TAGLINE */}
          <p
            style={{
              position: "relative",
              zIndex: 1,
              textAlign: "center",
              margin: "clamp(24px, 4vw, 40px) auto 0",
              maxWidth: 680,
              fontSize: "clamp(16px, 2.1vw, 22px)",
              fontWeight: 500,
              lineHeight: 1.4,
              color: "rgba(244,246,251,.82)",
            }}
          >
            {strings.tagline1a} <span style={{ color: TEAM_GOLD }}>{strings.tagline1b}</span>
          </p>
          <p
            style={{
              position: "relative",
              zIndex: 1,
              textAlign: "center",
              margin: "clamp(10px, 1.6vw, 16px) auto 0",
              maxWidth: 620,
              fontSize: "clamp(13px, 1.5vw, 16px)",
              fontWeight: 400,
              lineHeight: 1.6,
              color: "rgba(244,246,251,.6)",
            }}
          >
            {strings.taglineSub}
          </p>
        </div>

        {/* (4) THREE FANNED DOSSIER CARDS (mobile: horizontal swipe row) */}
        <div className="s4hl-fan">
          {teams.map((team, i) => {
            const era = ERAS[team.key] || ERAS.alpha;
            const pos = i === 0 ? "s4hl-card-l" : i === 1 ? "s4hl-card-c" : "s4hl-card-r";
            return (
              <div
                key={team.key}
                className={"s4hl-card " + pos}
                style={{
                  position: "relative",
                  flex: "0 0 auto",
                  aspectRatio: "3 / 4.35",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "#0c0e14",
                  border: "1.5px solid " + team.accent + "99",
                  boxShadow: "0 24px 60px rgba(0,0,0,.7), 0 0 34px " + team.accent + "2e",
                  scrollSnapAlign: "center",
                }}
              >
                <DossierPhoto src={"/s4-art/hero/dossier-" + team.key + ".png"} accent={team.accent} alt={team.name} />
                {/* top strip */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "9px 11px",
                    fontFamily: F_MONO,
                    fontSize: 9,
                    letterSpacing: "0.16em",
                    color: team.accent,
                    background: "linear-gradient(rgba(0,0,0,.63), transparent)",
                    pointerEvents: "none",
                  }}
                >
                  <span>TEAM {pad2(i + 1)}</span>
                  <span>◆ {era.est}</span>
                </div>
                {/* nameplate */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: "26px 13px 15px",
                    background: "linear-gradient(transparent, rgba(4,5,8,.92))",
                    pointerEvents: "none",
                  }}
                >
                  <div style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: "0.2em", color: team.accent }}>
                    DOSSIER · {era.fileNo}
                  </div>
                  <div
                    style={{
                      fontFamily: F_CD,
                      fontWeight: 900,
                      fontSize: "clamp(22px, 2.8vw, 30px)",
                      letterSpacing: "0.01em",
                      lineHeight: 1,
                      marginTop: 3,
                      color: "#fff",
                      textTransform: "uppercase",
                    }}
                  >
                    {team.name}
                  </div>
                  <div style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: "0.12em", color: "rgba(244,246,251,.55)", marginTop: 4 }}>
                    {era.cls} · {era.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* (5) BOUNTY LEDGER STRIP */}
        <div className="s4hl-ledger" style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: "clamp(20px, 3vw, 36px)" }}>
          {/* prize pool */}
          <div className="s4hl-ledger-card" style={{ ...ledgerCardStyle, flex: "1 1 260px", maxWidth: 380 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LedgerCoin glyph="$" />
              <span style={ledgerLabelStyle}>{strings.ledgerPoolLabel}</span>
            </div>
            <div style={ledgerValueStyle}>
              {usd(unlockedUsd)}
              <span style={{ fontSize: 16, color: "rgba(244,246,251,.45)" }}> {strings.ledgerOf} {usd(fullUsd)}</span>
            </div>
            <div style={{ marginTop: 11, height: 7, borderRadius: 99, background: "rgba(244,246,251,.08)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: 99,
                  background: "linear-gradient(90deg, #e33d4e, #f0b340)",
                  boxShadow: "0 0 10px rgba(227,61,78,.6)",
                  width: pct + "%",
                }}
              />
            </div>
          </div>

          {/* contracts */}
          <div className="s4hl-ledger-card" style={{ ...ledgerCardStyle, flex: "1 1 220px", maxWidth: 320 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LedgerCoin glyph="✕" />
              <span style={ledgerLabelStyle}>{DEFAULT_THEME.target.plural.toUpperCase()}</span>
            </div>
            <div style={ledgerValueStyle}>
              {bonded} of {totalTargets}{" "}
              <span style={{ fontSize: 15, letterSpacing: "0.14em", color: CRIMSON }}>{DEFAULT_THEME.bondedWord}</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 9 }}>
              {Array.from({ length: pipCount }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: "1px solid rgba(227,61,78,.55)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {i < bonded ? (
                    <div style={{ width: 9, height: 9, borderRadius: "50%", background: CRIMSON, boxShadow: "0 0 8px " + CRIMSON }} />
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* countdown (hidden until season dates exist) */}
          {cd ? (
            <div className="s4hl-ledger-card" style={{ ...ledgerCardStyle, flex: "1 1 220px", maxWidth: 320 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <LedgerCoin glyph="◷" />
                <span style={ledgerLabelStyle}>{cd.label}</span>
              </div>
              <div style={{ ...ledgerValueStyle, fontVariantNumeric: "tabular-nums" }}>{cd.value}</div>
              <div style={{ marginTop: 11, fontFamily: F_MONO, fontSize: 10, letterSpacing: "0.14em", color: "rgba(77,216,230,.75)" }}>
                {cd.sub}
              </div>
            </div>
          ) : null}
        </div>

        {/* (6) CTAs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: "clamp(28px, 4vw, 44px)" }}>
          <a
            className="s4hl-cta-primary"
            href={startUrl}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              fontFamily: F_CD,
              fontWeight: 900,
              fontSize: 16,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#fff",
              background: CRIMSON,
              padding: "15px 30px",
              borderRadius: 10,
              textDecoration: "none",
            }}
          >
            {strings.ctaJoin} <span style={{ fontSize: 15 }}>→</span>
          </a>
          {/* Above-the-fold path into the arcade hub (the game shelf was hard to
              find from the landing). Primary-style gold, distinct from the
              crimson JOIN so both strong actions read clearly. */}
          <Link
            className="s4hl-cta-play"
            href="/s4/play"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              fontFamily: F_CD,
              fontWeight: 900,
              fontSize: 16,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: INK,
              background: TEAM_GOLD,
              padding: "15px 30px",
              borderRadius: 10,
              textDecoration: "none",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 13 }}>
              ▶
            </span>{" "}
            {strings.ctaPlay}
          </Link>
          <Link
            className="s4hl-cta-ghost"
            href="/s4/map"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              fontFamily: F_CD,
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#f4f6fb",
              background: "transparent",
              padding: "15px 28px",
              borderRadius: 10,
              border: "1.5px solid rgba(244,246,251,.3)",
              textDecoration: "none",
            }}
          >
            {strings.ctaView}
          </Link>
        </div>

        {/* footer bug (borrowed from the comic variant) */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: "clamp(24px, 3vw, 36px)" }}>
          <div
            aria-hidden="true"
            style={{
              height: 26,
              width: 70,
              backgroundImage:
                "repeating-linear-gradient(90deg, #f4f6fb 0 2px, transparent 2px 4px, #f4f6fb 4px 5px, transparent 5px 9px)",
              opacity: 0.7,
            }}
          />
          <span style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: "0.18em", color: "rgba(244,246,251,.4)" }}>
            LAUNCH WARS · S4 · THE HIT LIST · 0041
          </span>
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
@font-face { font-family:'Aktiv Grotesk'; font-weight:700; font-style:normal; font-display:swap; src:url('/s4-art/fonts/AktivGrotesk_Bd.ttf') format('truetype'); }
@font-face { font-family:'Aktiv Grotesk Cd'; font-weight:800; font-style:normal; font-display:swap; src:url('/s4-art/fonts/AktivGroteskCd_XBd.ttf') format('truetype'); }
@font-face { font-family:'Aktiv Grotesk Cd'; font-weight:900; font-style:normal; font-display:swap; src:url('/s4-art/fonts/AktivGroteskCd_Blk.ttf') format('truetype'); }

@keyframes s4hlRain { to { background-position: 0 620px, 0 900px; } }
@keyframes s4hlBlink { 0%, 100% { opacity: 1; } 50% { opacity: .2; } }
@keyframes s4hlSweep { 0% { transform: translateX(-40%) skewX(0deg); } 50% { transform: translateX(260%) skewX(6deg); } 100% { transform: translateX(-40%) skewX(0deg); } }

@media (prefers-reduced-motion: no-preference) {
  .s4hl-rain  { animation: s4hlRain 5.5s linear infinite; }
  .s4hl-blink { animation: s4hlBlink 1.6s ease-in-out infinite; }
  .s4hl-sweep { animation: s4hlSweep 26s ease-in-out infinite; }
}

/* fanned dossier row: desktop = overlapped fan, centered */
.s4hl-fan {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0;
  overflow-x: auto;
  padding: clamp(40px, 6vw, 72px) 8px clamp(20px, 3vw, 32px);
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
.s4hl-fan::-webkit-scrollbar { display: none; }
.s4hl-card   { width: clamp(200px, 23vw, 296px); }
.s4hl-card-l { transform: rotate(-7deg) translateY(26px); margin-right: -26px; z-index: 1; }
.s4hl-card-c { transform: translateY(-10px); width: clamp(210px, 24vw, 312px); z-index: 3; }
.s4hl-card-r { transform: rotate(7deg) translateY(26px); margin-left: -26px; z-index: 1; }

.s4hl-cta-primary {
  box-shadow: 0 10px 30px rgba(227,61,78,.4), inset 0 1px 0 rgba(255,255,255,.2);
  transition: transform .18s ease, box-shadow .18s ease;
}
.s4hl-cta-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 40px rgba(227,61,78,.55), inset 0 1px 0 rgba(255,255,255,.25);
}
.s4hl-cta-ghost { transition: border-color .18s ease, background .18s ease, color .18s ease; }
.s4hl-cta-ghost:hover { border-color: #4dd8e6 !important; background: rgba(77,216,230,.08) !important; color: #f4f6fb; }

.s4hl-cta-play {
  box-shadow: 0 10px 30px rgba(240,179,64,.34), inset 0 1px 0 rgba(255,255,255,.28);
  transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
}
.s4hl-cta-play:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 40px rgba(240,179,64,.5), inset 0 1px 0 rgba(255,255,255,.32);
  filter: brightness(1.04);
}

/* folder-tab links: same box as before, but the ::after overlay extends the
   clickable area past 40px tall, and hover/active warms to a subtle gold */
.s4hl-tab { position: relative; transition: color .18s ease, background .18s ease, border-color .18s ease; }
.s4hl-tab::after { content: ''; position: absolute; left: -3px; right: -3px; top: -10px; bottom: -12px; }
.s4hl-tab:hover, .s4hl-tab:active { color: #f0b340; background: rgba(240,179,64,.09); border-color: rgba(240,179,64,.3); }

/* ── mobile: text always clear of imagery; the girls become a swipe row ── */
@media (max-width: 860px) {
  .s4hl-board { display: none; }             /* string board off: title stays crisp */
  .s4hl-fan { justify-content: flex-start; gap: 14px; padding-top: 28px; scroll-snap-type: x mandatory; }
  .s4hl-card, .s4hl-card-c { width: min(64vw, 250px); }
  .s4hl-card-l, .s4hl-card-c, .s4hl-card-r { transform: none; margin: 0; }
  .s4hl-barcode { justify-content: center !important; }
  .s4hl-barcode > div { text-align: center !important; }
}
@media (max-width: 640px) {
  .s4hl-file-meta { display: none; }         /* header strip stays one clean line */
  .s4hl-ledger-card { flex: 1 1 100% !important; max-width: none !important; }
}
`;
