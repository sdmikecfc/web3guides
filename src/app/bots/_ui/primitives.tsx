"use client";

/**
 * BATTLE BOTS UI PRIMITIVES (week 1).
 *
 * Copied from src/app/chef/game/_ui/primitives.tsx (the Domain Kitchen
 * primitives) per the reuse law and restyled to the money layer (M): the
 * Sheet, the Panel, the two Buttons, the DockButton, the ChipTab, the
 * CoinChip and the useCountUp behind it. Presentation only: no game state,
 * no fixtures, no data fetching. A primitive that knew about a Build would
 * be a component, not a primitive.
 *
 * One difference from DK: the Sheet is `position: fixed`, not absolute. DK
 * sits inside one relative game container; these pages scroll.
 */

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, M, R, S, SHADOW, TAP, Z } from "./tokens";
import { IconClose, IconCoin } from "./icons";
import css from "./ui.module.css";

/* ────────────────────────────────────────────────────────────────────────
   Sheet: THE modal. Bottom-anchored on every form factor.
   ──────────────────────────────────────────────────────────────────────── */

export interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** wallet transactions sit above everything, including the coach */
  elevated?: boolean;
  /** optional right-hand slot in the title row (tabs, a count, a badge) */
  action?: ReactNode;
  /** 480 by default (DK); the parts sheet on a phone wants the full width */
  width?: number;
}

/**
 * Anchored to the bottom on desktop too, deliberately (DK). One sheet that
 * keeps the bay visible above it reads as a game on a laptop. The 480px cap
 * is what stops it looking like a stretched phone at 1440.
 */
export function Sheet({ title, onClose, children, elevated, action, width = 480 }: SheetProps) {
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
    <div style={{ position: "fixed", inset: 0, zIndex: z, fontFamily: FONT_BODY }}>
      <div
        className={css.scrim}
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: M.overlay }}
      />
      <div
        className={css.sheet}
        role="dialog"
        aria-label={title}
        style={{
          position: "absolute",
          /**
           * Centred with auto margins, NOT translateX(-50%). The `rise`
           * keyframe animates `transform`, and an animation's transform
           * replaces the inline one outright (DK lesson).
           */
          left: 0,
          right: 0,
          marginInline: "auto",
          bottom: 0,
          width: `min(${width}px, 100vw - 16px)`,
          maxHeight: "76dvh",
          display: "flex",
          flexDirection: "column",
          background: M.surface,
          border: `1px solid ${M.border}`,
          borderBottom: "none",
          borderRadius: `${R.sheet}px ${R.sheet}px 0 0`,
          boxShadow: SHADOW.card,
          // the phone home bar
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* grab handle: the universal "this is a sheet, it came from below" tell */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: S.sm }}>
          <div style={{ width: 38, height: 4, borderRadius: R.pill, background: M.border }} />
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
              fontFamily: FONT_DISPLAY,
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: 0.2,
              color: M.text,
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
              width: TAP,
              height: TAP,
              display: "grid",
              placeItems: "center",
              borderRadius: R.pill,
              background: M.surface2,
              border: `1px solid ${M.border}`,
              color: M.muted,
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
            scrollbarColor: `${M.border} transparent`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Panel: the surface card (the readout, the tray).
   ──────────────────────────────────────────────────────────────────────── */

export function Panel({
  children,
  style,
  title,
  aside,
}: {
  children: ReactNode;
  style?: CSSProperties;
  /** Syne 12, letterspaced, muted: the one header voice per panel */
  title?: string;
  /** right of the header: a mono count, a chip */
  aside?: ReactNode;
}) {
  return (
    <div
      style={{
        background: `linear-gradient(140deg, #3a3026, ${M.surface})`,
        boxShadow: "inset 0 1px 0 #f9e9bd0d, 0 8px 24px #0000001a",
        border: `1px solid ${M.border}`,
        borderRadius: R.card,
        padding: "18px 20px",
        fontFamily: FONT_BODY,
        color: M.text,
        ...style,
      }}
    >
      {title ? (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: M.muted,
            }}
          >
            {title}
          </span>
          {aside}
        </div>
      ) : null}
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
  variant?: "primary" | "quiet" | "sell";
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
  const sell = variant === "sell";
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
        fontFamily: FONT_BODY,
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: 0.2,
        cursor: disabled ? "default" : "pointer",
        border: `1px solid ${primary && !disabled ? M.accent : sell ? M.sell : M.border}`,
        background: disabled
          ? M.surface2
          : primary
            ? M.accent
            : M.surface2,
        color: disabled ? M.muted : primary ? "#292719" : sell ? M.sell : M.text,
        boxShadow: primary && !disabled ? SHADOW.primary : undefined,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/**
 * The bottom dock button. Icon over label (DK).
 *
 * The label is not decoration: it carries the ESL audience, and the
 * screenshot harness clicks by textContent, so "Shop" and "Board" are its
 * only handles on this dock.
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
  /** a quiet accent dot, e.g. an unread paper. Absence shows nothing. */
  badge?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={css.press}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
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
        fontFamily: FONT_BODY,
        background: active ? M.surface2 : "transparent",
        border: `1px solid ${active ? M.accent : "transparent"}`,
        color: active ? M.text : M.muted,
      }}
    >
      {icon}
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3 }}>{label}</span>
      {badge && (
        <span
          style={{
            position: "absolute",
            top: 7,
            right: 12,
            width: 7,
            height: 7,
            borderRadius: R.pill,
            background: M.accent,
          }}
        />
      )}
    </button>
  );
}

/** Pill tab, for the slot filter row and the name tables. */
export function ChipTab({
  children,
  active,
  onClick,
  title,
  square,
}: {
  children: ReactNode;
  active?: boolean;
  onClick: () => void;
  title?: string;
  /** 34x34 icon chip (the tray filter row: seven of them plus 3px gaps fit
   * the 262px well inside the 280px tray) instead of a text pill */
  square?: boolean;
}) {
  return (
    <button
      /* a text chip is a thumb target on a phone (ui.module.css tap44). The
         square icon chip is not: it lives in the desktop tray only. */
      className={square ? css.press : `${css.press} ${css.tap44}`}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      style={{
        padding: square ? 0 : "7px 13px",
        width: square ? 34 : undefined,
        height: square ? 34 : undefined,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: square ? R.inner : R.pill,
        fontFamily: FONT_BODY,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
        border: `1px solid ${active ? M.accent : M.border}`,
        background: active ? M.surface2 : "transparent",
        color: active ? M.text : M.muted,
      }}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   HUD readouts
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Interpolates toward the real value instead of snapping (DK).
 *
 * A number that jumps 60 -> 64 reads as a data refresh. A number that runs
 * up reads as a change the player made. 420ms is short enough that the
 * displayed value is never meaningfully behind the truth.
 */
export function useCountUp(value: number, ms = 420): number {
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
 * The persistent coin counter (DK). Mono, tabular, with the drawn coin.
 * A currency you cannot see is a currency you do not play for.
 */
export function CoinChip({
  coins,
  onClick,
  ariaLabel,
}: {
  coins: number;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const shown = useCountUp(coins);
  const [pop, setPop] = useState(0);
  const prev = useRef(coins);
  useEffect(() => {
    if (coins > prev.current) setPop((n) => n + 1);
    prev.current = coins;
  }, [coins]);

  return (
    <button
      className={`${css.press} ${css.tap44}`}
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 36,
        padding: "0 12px 0 9px",
        borderRadius: R.pill,
        background: M.panel,
        border: `1px solid ${M.border}`,
        fontFamily: FONT_MONO,
        color: M.text,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span key={pop} className={pop ? css.coinPop : undefined} style={{ display: "grid", color: M.warn }}>
        <IconCoin size={18} />
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: 0.2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {shown.toLocaleString("en-US")}
      </span>
    </button>
  );
}

/** A quiet hairline chip: the wallet name, a count. */
export function NameChip({ children, ariaLabel }: { children: ReactNode; ariaLabel?: string }) {
  return (
    <span
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 36,
        padding: "0 12px",
        borderRadius: R.pill,
        background: M.panel,
        border: `1px solid ${M.border}`,
        fontFamily: FONT_BODY,
        fontSize: 12.5,
        fontWeight: 600,
        color: M.text,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** A 7px tier dot. The standing tier law: a dot and a label, never a pill. */
export function Dot({ color, size = 7, pulse }: { color: string; size?: number; pulse?: boolean }) {
  return (
    <span
      aria-hidden
      className={pulse ? css.coinPop : undefined}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: R.pill,
        background: color,
        flex: "0 0 auto",
      }}
    />
  );
}

export { css as uiCss };
