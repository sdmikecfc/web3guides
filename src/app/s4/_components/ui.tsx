/**
 * Season 4 shared UI atoms (server-safe: no hooks, no client JS).
 *
 * LAYOUT tokens (colors, spacing, chrome) live here once. Every player-visible
 * WORD comes from the Theme (src/lib/s4/theme.ts) — never hardcode one here.
 * Status COLORS are data-viz semantics (green = bonded, amber = live), not
 * theme identity; they stay stable across reskins.
 */
import type { Theme, TargetStatus } from "@/lib/s4/theme";
import { statusLabel } from "@/lib/s4/theme";

export const UI = {
  bg: "#070a12",
  bgGlow: "radial-gradient(1000px 500px at 50% -10%, #10182b 0%, #070a12 60%)",
  panel: "rgba(13,17,32,0.66)",
  border: "#1c2236",
  text: "#e8ecf5",
  muted: "#aeb6c8",
  faint: "#8b95ad",
  good: "#34d399",
  warn: "#f0b340",
  bad: "#f87171",
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export const STATUS_COLOR: Record<TargetStatus, string> = {
  pending: UI.faint,
  live: UI.warn,
  bonded: UI.good,
  failed: UI.bad,
};

export function PageShell({ children }: { children: React.ReactNode }) {
  // The persistent section nav now lives in the /s4 ROOT layout (S4TopNav, a
  // fixed bar on EVERY page). Top padding here clears that 52px bar.
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: UI.bgGlow,
        color: UI.text,
        fontFamily: UI.sans,
        padding: "114px 20px 72px", // 52 nav + 38 contract ticker + breathing room
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>{children}</div>
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

export function StatusChip({ theme, status }: { theme: Theme; status: TargetStatus }) {
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
      {statusLabel(theme, status)}
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

/** The shared pool banner: renders the ONE pool line computed in lib/s4/data.ts. */
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
