"use client";

/**
 * DOMAIN KITCHEN UI PRIMITIVES (M11).
 *
 * One shell per job. Before this file the game had THREE modal
 * implementations (Chrome.tsx's Modal, and hand-rolled copies in Academy.tsx
 * and AddLiquidityModal.tsx) and THREE card shells (DialsPanel's cardBase,
 * LpPanel's card, Coach's inline one). They had already drifted: different
 * backdrop alphas, different radii, different max-heights, different scrollbar
 * treatment. Every one of those is now a call into something here.
 *
 * These are presentation only. No game state, no sim access, no data fetching
 * — a primitive that knew about WorldState would be a component, not a
 * primitive, and would stop being reusable the moment the sim changed.
 */

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { C, FONT, R, S, SHADOW, T, TAP, Z } from "./tokens";
import { IconClose, IconCoin, IconStar } from "./icons";
import css from "./ui.module.css";

/* ────────────────────────────────────────────────────────────────────────
   Sheet — THE modal. Bottom-anchored on every form factor.
   ──────────────────────────────────────────────────────────────────────── */

export interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** wallet transactions sit above everything, including the coach */
  elevated?: boolean;
  /** optional right-hand slot in the title row (tabs, a count, a badge) */
  action?: ReactNode;
}

/**
 * Anchored to the bottom on desktop too, deliberately.
 *
 * A centred desktop dialog and a phone bottom-sheet would be two code paths,
 * two animations and two sets of bugs. One sheet that keeps the room visible
 * above it reads as a mobile game on a laptop, which is the stated target.
 * The 480px cap is what stops it looking like a stretched phone at 1440.
 */
export function Sheet({ title, onClose, children, elevated, action }: SheetProps) {
  // Escape closes. Registered per-sheet because only one is ever open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const z = elevated ? Z.tx : Z.sheet;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: z, fontFamily: FONT }}>
      <div
        className={css.scrim}
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: C.overlay }}
      />
      <div
        className={css.sheet}
        style={{
          position: "absolute",
          /**
           * Centred with auto margins, NOT translateX(-50%). The `rise`
           * keyframe animates `transform`, and an animation's transform
           * replaces the inline one outright, so a transform-centred sheet
           * loses its centering the instant it opens and sits half off the
           * right edge of a phone.
           */
          left: 0,
          right: 0,
          marginInline: "auto",
          bottom: 0,
          width: "min(480px, 100vw - 16px)",
          maxHeight: "76dvh",
          display: "flex",
          flexDirection: "column",
          background: C.panelSolid,
          border: `1px solid ${C.line}`,
          borderBottom: "none",
          borderRadius: `${R.sheet}px ${R.sheet}px 0 0`,
          boxShadow: SHADOW.card,
          // the phone home bar
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* grab handle: the universal "this is a sheet, it came from below" tell */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: S.sm }}>
          <div style={{ width: 38, height: 4, borderRadius: R.pill, background: C.line }} />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: S.sm,
            padding: `${S.sm}px ${S.md}px ${S.sm}px ${S.lg}px`,
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: 0.2,
              color: C.cream,
            }}
          >
            {title}
          </div>
          {action}
          <button
            className={css.press}
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              borderRadius: R.pill,
              background: C.btnQuiet,
              border: `1px solid ${C.line}`,
              color: C.creamDim,
              cursor: "pointer",
            }}
          >
            <IconClose size={17} />
          </button>
        </div>

        <div
          style={{
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: `0 ${S.lg}px ${S.lg}px`,
            scrollbarWidth: "thin",
            scrollbarColor: `${C.line} transparent`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Panel — the floating card, for the few things that stay on the room.
   ──────────────────────────────────────────────────────────────────────── */

export function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.line}`,
        borderRadius: R.card,
        boxShadow: SHADOW.card,
        backdropFilter: "blur(6px)",
        fontFamily: FONT,
        color: C.cream,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Buttons
   ──────────────────────────────────────────────────────────────────────── */

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "quiet";
  disabled?: boolean;
  full?: boolean;
  style?: CSSProperties;
  title?: string;
}

export function Button({
  children,
  onClick,
  variant = "quiet",
  disabled,
  full,
  style,
  title,
}: ButtonProps) {
  const primary = variant === "primary";
  return (
    <button
      className={disabled ? undefined : css.press}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      style={{
        minHeight: TAP,
        padding: `10px ${S.lg}px`,
        width: full ? "100%" : undefined,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: S.sm,
        borderRadius: R.inner,
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: 0.2,
        cursor: disabled ? "default" : "pointer",
        border: `1px solid ${primary && !disabled ? C.amberDeep : C.line}`,
        background: disabled
          ? C.wellDisabled
          : primary
            ? `linear-gradient(180deg, ${C.amber}, ${C.amberDeep})`
            : C.btnQuiet,
        color: disabled ? C.muted : primary ? C.ink : C.cream,
        boxShadow: primary && !disabled ? SHADOW.primary : undefined,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/**
 * The bottom dock button. Icon over label.
 *
 * The label is not decoration: it carries the ESL audience, and dk-shot.mjs
 * clicks by textContent, so "Shop" and "Money" are the screenshot harness's
 * only handles on this HUD.
 */
export function DockButton({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  /** a quiet amber dot, e.g. a live campaign. Absence shows nothing. */
  badge?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={css.press}
      onClick={onClick}
      style={{
        position: "relative",
        width: 62,
        minHeight: 58,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        borderRadius: R.card,
        cursor: "pointer",
        fontFamily: FONT,
        background: active ? C.wellActive : "transparent",
        border: `1px solid ${active ? C.amber : "transparent"}`,
        color: active ? C.amber : C.creamDim,
      }}
    >
      {icon}
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3 }}>{label}</span>
      {badge && (
        <span
          style={{
            position: "absolute",
            top: 7,
            right: 12,
            width: 7,
            height: 7,
            borderRadius: R.pill,
            background: C.amber,
            boxShadow: `0 0 6px ${C.amber}`,
          }}
        />
      )}
    </button>
  );
}

/** Pill tab, for shop categories / crew tabs / menu tabs. */
export function ChipTab({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={css.press}
      onClick={onClick}
      style={{
        padding: "7px 13px",
        borderRadius: R.pill,
        fontFamily: FONT,
        fontSize: 12.5,
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
        border: `1px solid ${active ? C.amber : C.line}`,
        background: active ? C.wellActive : "transparent",
        color: active ? C.amber : C.creamDim,
      }}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Bars
   ──────────────────────────────────────────────────────────────────────── */

export interface Segment {
  value: number;
  color: string;
}

/**
 * Single or segmented. Segmented mode carries the quality breakdown
 * (baseline / hands / upkeep / dishes), which is the clearest teaching
 * surface in the game and must not lose its colour coding.
 */
export function ProgressBar({
  segments,
  max = 100,
  height = 8,
}: {
  segments: Segment[];
  max?: number;
  height?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height,
        borderRadius: R.pill,
        overflow: "hidden",
        background: C.track,
      }}
    >
      {segments.map((s, i) => (
        <div
          key={i}
          className={css.barFill}
          style={{
            width: `${Math.max(0, Math.min(100, (s.value / max) * 100))}%`,
            background: s.color,
          }}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   HUD readouts
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Interpolates toward the real value instead of snapping.
 *
 * Coins arrive in lumps (a serve pays, a day bonus lands), and a number that
 * jumps 0 -> 25 reads as a data refresh. A number that runs up reads as a
 * reward. Duration is short enough that the displayed value is never
 * meaningfully behind the truth when a player goes to spend.
 */
function useCountUp(value: number, ms = 420): number {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (value === shown) return;
    fromRef.current = shown;
    startRef.current = 0;
    cancelAnimationFrame(rafRef.current);
    const step = (t: number) => {
      if (!startRef.current) startRef.current = t;
      const k = Math.min(1, (t - startRef.current) / ms);
      // ease-out so it lands softly rather than stopping dead
      const eased = 1 - (1 - k) * (1 - k);
      setShown(Math.round(fromRef.current + (value - fromRef.current) * eased));
      if (k < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // `shown` is deliberately not a dep: including it restarts the tween every frame
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms]);

  return shown;
}

/**
 * The persistent coin counter — the game's first one.
 *
 * Coins previously appeared in exactly one place, the shop panel's header
 * string, so a player who closed the shop had no idea what they had. A
 * currency you cannot see is a currency you do not play for.
 */
export function CoinChip({ coins, onClick }: { coins: number; onClick?: () => void }) {
  const shown = useCountUp(coins);
  const [pop, setPop] = useState(0);
  const prev = useRef(coins);
  useEffect(() => {
    if (coins > prev.current) setPop((n) => n + 1);
    prev.current = coins;
  }, [coins]);

  return (
    <button
      className={css.press}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 38,
        padding: "0 14px 0 10px",
        borderRadius: R.pill,
        background: C.panel,
        border: `1px solid ${C.line}`,
        boxShadow: SHADOW.card,
        backdropFilter: "blur(6px)",
        fontFamily: FONT,
        color: C.amber,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span key={pop} className={pop ? css.coinPop : undefined} style={{ display: "grid" }}>
        <IconCoin size={19} />
      </span>
      <span
        style={{
          fontSize: 15.5,
          fontWeight: 800,
          letterSpacing: 0.3,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {shown.toLocaleString()}
      </span>
    </button>
  );
}

/** Service quality + the hour, always visible. Taps through to the detail. */
export function StatPill({
  quality,
  tier,
  clock,
  badge,
  onClick,
}: {
  quality: number;
  tier: string;
  clock: string;
  /** a quiet amber dot, e.g. daily goals still open. Absence shows nothing. */
  badge?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={css.press}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 38,
        padding: "0 13px 0 10px",
        borderRadius: R.pill,
        background: C.panel,
        border: `1px solid ${C.line}`,
        boxShadow: SHADOW.card,
        backdropFilter: "blur(6px)",
        fontFamily: FONT,
        color: C.cream,
        cursor: onClick ? "pointer" : "default",
        position: "relative",
      }}
    >
      <span style={{ display: "grid", color: C.amber }}>
        <IconStar size={17} />
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
        {Math.round(quality)}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, whiteSpace: "nowrap" }}>
        {tier}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.creamDim, whiteSpace: "nowrap" }}>
        {clock}
      </span>
          {badge && (
        <span
          style={{
            position: "absolute",
            top: 4,
            right: 6,
            width: 7,
            height: 7,
            borderRadius: R.pill,
            background: C.amber,
          }}
        />
      )}
    </button>
  );
}

/** Small muted label chip. Used for the PRACTICE badge on the demo dials. */
export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "amber" }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: R.pill,
        fontFamily: FONT,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        border: `1px solid ${tone === "amber" ? C.amber : C.line}`,
        color: tone === "amber" ? C.amber : C.muted,
      }}
    >
      {children}
    </span>
  );
}

export { css as uiCss, T as motion };
