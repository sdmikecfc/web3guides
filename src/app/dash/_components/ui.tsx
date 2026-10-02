/**
 * Ambassador dashboard UI atoms — server-safe (no hooks, no client JS), and
 * deliberately SELF-CONTAINED: copied from the s6 kit rather than imported,
 * because seasons get retired/reskinned and this dashboard must not break when
 * a season tree does. EPL-meets-Bloomberg: dark panels, mono tabular numerals.
 */

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
  accent: "#7c6aff", // Doma violet
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export const NUM: React.CSSProperties = {
  fontFamily: UI.mono,
  fontVariantNumeric: "tabular-nums",
};

export function PageShell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: UI.bgGlow,
        color: UI.text,
        fontFamily: UI.sans,
        padding: "48px 20px 72px",
      }}
    >
      <div style={{ position: "relative", zIndex: 1, maxWidth: wide ? 1180 : 920, margin: "0 auto" }}>
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

export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
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

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Panel style={{ padding: "14px 18px", minWidth: 0 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: UI.faint, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ ...NUM, fontSize: 24, fontWeight: 700, marginTop: 6, color: UI.text }}>{value}</div>
      {sub ? <div style={{ fontSize: 11.5, color: UI.muted, marginTop: 2 }}>{sub}</div> : null}
    </Panel>
  );
}

export function ScorePill({ score, color }: { score: number; color?: string }) {
  const c = color ?? (score >= 66 ? UI.good : score >= 33 ? UI.warn : UI.faint);
  return (
    <span
      style={{
        ...NUM,
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        border: `1px solid ${c}55`,
        background: `${c}14`,
        color: c,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {score.toFixed(1)}
    </span>
  );
}

export function Avatar({ url, name, size = 34 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: "50%", border: `1px solid ${UI.border}`, flexShrink: 0 }}
      />
    );
  }
  // deterministic gradient fallback hashed from the name (fantasy board idiom)
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        border: `1px solid ${UI.border}`,
        background: `linear-gradient(135deg, hsl(${h} 55% 35%), hsl(${(h + 60) % 360} 55% 22%))`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        fontWeight: 700,
        color: "#fff",
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function TabNav({ active }: { active: "board" | "rules" }) {
  const tab = (href: string, label: string, is: boolean) => (
    <a
      key={href}
      href={href}
      style={{
        padding: "7px 16px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        textDecoration: "none",
        letterSpacing: "0.02em",
        color: is ? UI.bg : UI.muted,
        background: is ? UI.accent : "transparent",
        border: `1px solid ${is ? UI.accent : UI.border}`,
      }}
    >
      {label}
    </a>
  );
  return (
    <nav style={{ display: "flex", gap: 8, margin: "0 0 22px" }}>
      {tab("/dash", "Board", active === "board")}
      {tab("/dash/rules", "Rules & scoring", active === "rules")}
    </nav>
  );
}

/**
 * Cycle pool progress — cohort volume vs the unlock ladder (ADR-0127).
 * Violet fill on the Doma ground; amber ticks mark every $50k rung.
 */
export function PoolProgress({
  cohortCycleUsd,
  poolUsd,
  poolUnlockedUsd,
  targetUsd,
  stepUsd,
}: {
  cohortCycleUsd: number;
  poolUsd: number;
  poolUnlockedUsd: number;
  targetUsd: number;
  stepUsd: number;
}) {
  const pct = Math.max(0, Math.min(100, (cohortCycleUsd / targetUsd) * 100));
  const rungs = Math.floor(targetUsd / stepUsd);
  return (
    <Panel style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: UI.faint, fontWeight: 700 }}>
          Cycle pool unlock
        </div>
        <div style={{ ...NUM, fontSize: 13, color: UI.muted }}>
          {fmtUsd(cohortCycleUsd)} of {fmtUsd(targetUsd)} cohort volume
        </div>
      </div>
      <div
        style={{
          position: "relative",
          height: 14,
          marginTop: 10,
          borderRadius: 999,
          background: `${UI.border}66`,
          border: `1px solid ${UI.border}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${UI.accent}cc, ${UI.accent})`,
            borderRadius: 999,
          }}
        />
        {Array.from({ length: rungs - 1 }, (_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${((i + 1) / rungs) * 100}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: `${UI.warn}55`,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
        <span style={{ ...NUM, fontSize: 14, fontWeight: 800, color: UI.accent }}>
          {fmtUsd(poolUnlockedUsd)} unlocked
        </span>
        <span style={{ ...NUM, fontSize: 12.5, color: UI.faint }}>
          of a {fmtUsd(poolUsd)} pool · {fmtUsd(stepUsd)} volume unlocks {fmtUsd((poolUsd / targetUsd) * stepUsd)}
        </span>
      </div>
    </Panel>
  );
}

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function fmtInt(n: number): string {
  return Number(n || 0).toLocaleString("en-US");
}
