/**
 * Season 5 shared UI atoms (server-safe: no hooks, no client JS). The S5
 * bunker palette: gunmetal, steel, ember. Every player-visible WORD comes from
 * the Theme (src/lib/s5/theme.ts); never hardcode one here. Status COLORS are
 * data-viz semantics (green = breached, amber = under siege), stable across
 * reskins.
 */
import type { Theme, TargetStatus } from "@/lib/s5/theme";
import { statusLabel } from "@/lib/s5/theme";

export const UI = {
  bg: "#0b0d10",
  bgGlow: "radial-gradient(1000px 500px at 50% -10%, #171c22 0%, #0b0d10 60%)",
  panel: "rgba(18,22,27,0.72)",
  border: "#232a32",
  text: "#e9edf1",
  muted: "#aab4bd",
  faint: "#87919b",
  good: "#34d399",
  warn: "#f0b340",
  bad: "#f87171",
  steel: "#9aa7b4", // The Iron Column accent
  ember: "#e0662e",
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export const STATUS_COLOR: Record<TargetStatus, string> = {
  pending: UI.faint,
  live: UI.warn,
  bonded: UI.good,
  failed: UI.bad,
};

export const S5_NAV_HEIGHT = 52;

export function PageShell({
  children,
  backdrop,
  scrim,
  wide,
}: {
  children: React.ReactNode;
  /** A painted layer for pages that have one. It MUST be rendered here, inside
   * main: main paints UI.bgGlow across the whole viewport, so a backdrop the
   * page hangs behind it at z-index -1 is invisible, which is exactly what
   * happened to the arcade and the war board on 2026-08-01. Both looked
   * untouched because their new artwork was underneath an opaque gradient. */
  backdrop?: React.CSSProperties;
  /** A second layer painted ON TOP of the backdrop and still UNDER the content.
   * It exists because a blurred photo is not a scrim: wherever the plate is
   * pale, text on top of it is unreadable, and a page cannot be judged by its
   * best pixel. It has to be rendered here for the same reason the backdrop
   * does -- a fixed, positioned element added inside the content wrapper paints
   * ABOVE every static block in it, so a scrim the page adds for itself veils
   * its own headline and leaves only the positioned bits (the card artwork)
   * bright. That is what it did on 2026-08-02. */
  scrim?: React.CSSProperties;
  /** 1120 instead of 920. For pages whose content is a grid rather than a
   * column of prose: four game cards in a 920px well are four small cards. */
  wide?: boolean;
}) {
  // Top padding clears the fixed 52px S5TopNav.
  return (
    <main
      id="s5-content"
      style={{
        minHeight: "100dvh",
        background: UI.bgGlow,
        color: UI.text,
        fontFamily: UI.sans,
        padding: "84px 20px 72px",
      }}
    >
      {backdrop ? (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          {/* Stable class names so a page can add a media query for its own
              plate. Inline styles cannot express a breakpoint, and a figure
              that stands politely beside the text on a desktop stands directly
              BEHIND it on a phone. */}
          <div className="s5-backdrop-art" style={{ position: "absolute", inset: 0, ...backdrop }} />
          {scrim ? (
            <div className="s5-backdrop-scrim" style={{ position: "absolute", inset: 0, ...scrim }} />
          ) : null}
        </div>
      ) : null}
      <div style={{ position: "relative", zIndex: 1, maxWidth: wide ? 1120 : 920, margin: "0 auto" }}>
        {children}
      </div>
    </main>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        letterSpacing: "0.32em",
        fontSize: 11,
        color: UI.faint,
        margin: "0 0 10px",
        textTransform: "uppercase",
        fontWeight: 700,
      }}
    >
      {children}
    </p>
  );
}

export function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: UI.panel,
        border: `1px solid ${UI.border}`,
        borderRadius: 14,
        padding: "18px 20px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StatusChip({
  theme,
  status,
  label,
}: {
  theme: Theme;
  status: TargetStatus;
  /** Localized label override (ko/zh); omitted = the Theme's en word, so the
   * operator theme override keeps working untouched in English. */
  label?: string;
}) {
  const color = STATUS_COLOR[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${color}55`,
        background: `${color}14`,
        color,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {label ?? statusLabel(theme, status)}
    </span>
  );
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      style={{
        width: "100%",
        height: 8,
        borderRadius: 999,
        background: "rgba(255,255,255,0.06)",
        border: `1px solid ${UI.border}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 999,
        }}
      />
    </div>
  );
}

/** The shared pool banner: renders the ONE pool line computed in lib/s5/data.ts. */
export function PoolBanner({ line }: { line: string }) {
  return (
    <Panel
      style={{
        textAlign: "center",
        padding: "14px 18px",
        borderColor: `${UI.good}33`,
      }}
    >
      <span style={{ fontSize: 14.5, color: UI.text, fontWeight: 600 }}>{line}</span>
    </Panel>
  );
}
