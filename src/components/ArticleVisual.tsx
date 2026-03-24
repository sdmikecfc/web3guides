/**
 * ArticleVisual — renders structured visual data authored by the AI alongside each article.
 * Each visual is placed after a specific ## section by matching after_section to the heading.
 *
 * Types: stats | comparison | steps | callout | checklist
 */

import type { ArticleVisual } from "@/types";

interface Props {
  visual: ArticleVisual;
  accentHex: string;
}

export function ArticleVisualBlock({ visual, accentHex }: Props) {
  switch (visual.type) {
    case "stats":      return <StatsGrid      visual={visual} accentHex={accentHex} />;
    case "comparison": return <ComparisonCard visual={visual} accentHex={accentHex} />;
    case "steps":      return <StepsFlow      visual={visual} accentHex={accentHex} />;
    case "callout":    return <CalloutBox     visual={visual} accentHex={accentHex} />;
    case "checklist":  return <ChecklistCard  visual={visual} accentHex={accentHex} />;
    default:           return null;
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function alpha(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const FONT_MONO  = "'Space Mono', monospace";
const FONT_BODY  = "'DM Sans', sans-serif";
const FONT_TITLE = "'Bungee', cursive";

// ─── STATS GRID ───────────────────────────────────────────────────────────────
// 4 large numbers in a 2×2 card grid

function StatsGrid({ visual, accentHex }: { visual: Extract<ArticleVisual, { type: "stats" }>; accentHex: string }) {
  const items = visual.items.slice(0, 4);
  if (items.length === 0) return null;

  return (
    <div style={{
      borderRadius: 20,
      border: `1px solid ${alpha(accentHex, 0.18)}`,
      background: "#fff",
      padding: "20px 22px 24px",
      boxShadow: "0 2px 20px rgba(0,0,0,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: accentHex }} />
        <span style={{ fontFamily: FONT_MONO, fontSize: "0.6rem", letterSpacing: 2, textTransform: "uppercase", color: "#9ca3af" }}>
          By the numbers
        </span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 12,
      }}>
        {items.map((item, i) => (
          <div key={i} style={{
            borderRadius: 14,
            padding: "18px 16px",
            background: `linear-gradient(135deg, ${alpha(accentHex, 0.07)} 0%, ${alpha(accentHex, 0.02)} 100%)`,
            border: `1px solid ${alpha(accentHex, 0.12)}`,
            textAlign: "center",
          }}>
            <div style={{
              fontFamily: FONT_TITLE,
              fontWeight: 400,
              fontSize: "clamp(1.4rem, 2.5vw, 2rem)",
              color: accentHex,
              lineHeight: 1.1,
              marginBottom: 6,
              letterSpacing: "-0.01em",
            }}>
              {item.value}
            </div>
            <div style={{
              fontFamily: FONT_BODY,
              fontSize: "0.73rem",
              color: "#6b7280",
              lineHeight: 1.4,
            }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── COMPARISON CARD ──────────────────────────────────────────────────────────
// Side-by-side two-column comparison

function ComparisonCard({ visual, accentHex }: { visual: Extract<ArticleVisual, { type: "comparison" }>; accentHex: string }) {
  const { left, right } = visual;

  if (!left || !right) return null;

  return (
    <div style={{
      borderRadius: 20,
      border: `1px solid #e5e7eb`,
      background: "#fff",
      overflow: "hidden",
      boxShadow: "0 2px 20px rgba(0,0,0,0.05)",
    }}>
      {/* Header row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr" }}>
        <div style={{
          padding: "14px 20px",
          background: alpha(accentHex, 0.06),
          borderBottom: `1px solid ${alpha(accentHex, 0.15)}`,
        }}>
          <span style={{ fontFamily: FONT_TITLE, fontWeight: 400, fontSize: "0.95rem", color: accentHex }}>
            {left.label}
          </span>
        </div>
        <div style={{ background: "#e5e7eb" }} />
        <div style={{
          padding: "14px 20px",
          background: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
        }}>
          <span style={{ fontFamily: FONT_TITLE, fontWeight: 400, fontSize: "0.95rem", color: "#374151" }}>
            {right.label}
          </span>
        </div>
      </div>

      {/* Points rows */}
      {Array.from({ length: Math.max(left.points.length, right.points.length) }).map((_, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr" }}>
          <div style={{
            padding: "11px 20px",
            borderBottom: i < Math.max(left.points.length, right.points.length) - 1 ? `1px solid ${alpha(accentHex, 0.08)}` : "none",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}>
            {left.points[i] ? (
              <>
                <span style={{ color: accentHex, flexShrink: 0, marginTop: 1, fontSize: "0.8rem" }}>✓</span>
                <span style={{ fontFamily: FONT_BODY, fontSize: "0.82rem", color: "#374151", lineHeight: 1.45 }}>
                  {left.points[i]}
                </span>
              </>
            ) : null}
          </div>
          <div style={{ background: "#e5e7eb" }} />
          <div style={{
            padding: "11px 20px",
            borderBottom: i < Math.max(left.points.length, right.points.length) - 1 ? "1px solid #f3f4f6" : "none",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}>
            {right.points[i] ? (
              <>
                <span style={{ color: "#9ca3af", flexShrink: 0, marginTop: 1, fontSize: "0.8rem" }}>✓</span>
                <span style={{ fontFamily: FONT_BODY, fontSize: "0.82rem", color: "#374151", lineHeight: 1.45 }}>
                  {right.points[i]}
                </span>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── STEPS FLOW ───────────────────────────────────────────────────────────────
// Numbered vertical process flow with connecting line

function StepsFlow({ visual, accentHex }: { visual: Extract<ArticleVisual, { type: "steps" }>; accentHex: string }) {
  const items = visual.items.slice(0, 6);
  if (items.length === 0) return null;

  return (
    <div style={{
      borderRadius: 20,
      border: `1px solid ${alpha(accentHex, 0.18)}`,
      background: "#fff",
      padding: "20px 22px 24px",
      boxShadow: "0 2px 20px rgba(0,0,0,0.05)",
    }}>
      {visual.heading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: accentHex }} />
          <span style={{ fontFamily: FONT_MONO, fontSize: "0.6rem", letterSpacing: 2, textTransform: "uppercase", color: "#9ca3af" }}>
            {visual.heading}
          </span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 16, position: "relative" }}>
            {/* Step number + connecting line */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: accentHex,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONT_MONO,
                fontSize: "0.7rem",
                fontWeight: 700,
                flexShrink: 0,
                zIndex: 1,
              }}>
                {i + 1}
              </div>
              {i < items.length - 1 && (
                <div style={{
                  width: 2,
                  flex: 1,
                  minHeight: 20,
                  background: alpha(accentHex, 0.2),
                  margin: "4px 0",
                }} />
              )}
            </div>

            {/* Step content */}
            <div style={{ paddingBottom: i < items.length - 1 ? 20 : 0, paddingTop: 4 }}>
              <div style={{
                fontFamily: FONT_BODY,
                fontSize: "0.9rem",
                fontWeight: 700,
                color: "#1a1a1a",
                marginBottom: 4,
                lineHeight: 1.3,
              }}>
                {item.step}
              </div>
              <div style={{
                fontFamily: FONT_BODY,
                fontSize: "0.82rem",
                color: "#6b7280",
                lineHeight: 1.5,
              }}>
                {item.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CALLOUT BOX ─────────────────────────────────────────────────────────────
// Highlighted box for warnings, insights, and tips

const CALLOUT_STYLES = {
  warning: {
    bg: "#fffbeb",
    border: "#f59e0b40",
    icon: "⚠",
    iconColor: "#d97706",
    headingColor: "#92400e",
  },
  insight: {
    bg: "#f0f9ff",
    border: "#0ea5e940",
    icon: "◆",
    iconColor: "#0284c7",
    headingColor: "#0c4a6e",
  },
  tip: {
    bg: "#f0fdf4",
    border: "#22c55e40",
    icon: "→",
    iconColor: "#16a34a",
    headingColor: "#14532d",
  },
};

function CalloutBox({ visual }: { visual: Extract<ArticleVisual, { type: "callout" }> }) {
  const s = CALLOUT_STYLES[visual.variant] ?? CALLOUT_STYLES.insight;

  return (
    <div style={{
      borderRadius: 16,
      border: `1px solid ${s.border}`,
      background: s.bg,
      padding: "18px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{
          fontSize: "1.1rem",
          color: s.iconColor,
          flexShrink: 0,
          marginTop: 1,
          fontFamily: FONT_MONO,
        }}>
          {s.icon}
        </span>
        <div>
          <div style={{
            fontFamily: FONT_BODY,
            fontWeight: 700,
            fontSize: "0.9rem",
            color: s.headingColor,
            marginBottom: 6,
          }}>
            {visual.heading}
          </div>
          <div style={{
            fontFamily: FONT_BODY,
            fontSize: "0.85rem",
            color: "#374151",
            lineHeight: 1.6,
          }}>
            {visual.body}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CHECKLIST CARD ──────────────────────────────────────────────────────────
// Visual tick-list for pre/post action items

function ChecklistCard({ visual, accentHex }: { visual: Extract<ArticleVisual, { type: "checklist" }>; accentHex: string }) {
  const items = visual.items.slice(0, 7);
  if (items.length === 0) return null;

  return (
    <div style={{
      borderRadius: 20,
      border: `1px solid ${alpha(accentHex, 0.18)}`,
      background: "#fff",
      padding: "20px 22px",
      boxShadow: "0 2px 20px rgba(0,0,0,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: accentHex }} />
        <span style={{ fontFamily: FONT_MONO, fontSize: "0.6rem", letterSpacing: 2, textTransform: "uppercase", color: "#9ca3af" }}>
          {visual.heading}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              border: `2px solid ${accentHex}`,
              background: alpha(accentHex, 0.08),
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}>
              <span style={{ color: accentHex, fontSize: "0.65rem", fontWeight: 700 }}>✓</span>
            </div>
            <span style={{
              fontFamily: FONT_BODY,
              fontSize: "0.85rem",
              color: "#374151",
              lineHeight: 1.5,
            }}>
              {item}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
