import type { ParsedSection } from "@/lib/parseArticleSections";

interface Props {
  section: ParsedSection;
  accentHex: string;
  index: number; // which infographic this is (0, 1, 2) — drives layout variation
}

// ─── type detection ────────────────────────────────────────────────────────────
type InfographicType = "keypoints" | "stats" | "process" | "concepts";

function detectType(section: ParsedSection): InfographicType {
  const h = section.heading.toLowerCase();
  if (section.stats.length >= 2) return "stats";
  if (/how|step|guide|process|start|begin|set up|create|install|connect|transfer/i.test(h) && section.bullets.length >= 2)
    return "process";
  if (section.bullets.length >= 2) return "keypoints";
  if (section.concepts.length >= 3) return "concepts";
  return "keypoints";
}

// ─── colour helpers ───────────────────────────────────────────────────────────
function hexWithAlpha(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── main export ───────────────────────────────────────────────────────────────
export function SectionInfographic({ section, accentHex, index }: Props) {
  const type = detectType(section);
  const shade = hexWithAlpha(accentHex, 0.08);
  const border = hexWithAlpha(accentHex, 0.2);

  switch (type) {
    case "stats":
      return <StatsGrid section={section} accentHex={accentHex} shade={shade} border={border} />;
    case "process":
      return <ProcessFlow section={section} accentHex={accentHex} shade={shade} border={border} index={index} />;
    case "concepts":
      return <ConceptGrid section={section} accentHex={accentHex} shade={shade} border={border} />;
    default:
      return <KeyPointsCard section={section} accentHex={accentHex} shade={shade} border={border} index={index} />;
  }
}

// ─── KEYPOINTS CARD ───────────────────────────────────────────────────────────
function KeyPointsCard({
  section, accentHex, border, index,
}: { section: ParsedSection; accentHex: string; shade: string; border: string; index: number }) {
  const points = section.bullets.slice(0, 5);
  if (points.length === 0) return null;

  // Alternate between dark and light variants
  const isDark = index % 2 === 0;
  const bg = isDark
    ? "linear-gradient(135deg, #0f172a 0%, #1a2744 100%)"
    : `linear-gradient(135deg, #fff 0%, #f8faff 100%)`;
  const headingColor = isDark ? "#e2e8f0" : "#1a1a1a";
  const labelColor = isDark ? accentHex : accentHex;
  const textColor = isDark ? "#cbd5e1" : "#374151";
  const numBg = isDark ? hexWithAlpha(accentHex, 0.18) : hexWithAlpha(accentHex, 0.1);
  const divider = isDark ? "rgba(255,255,255,0.07)" : "#f1f5f9";

  return (
    <div style={{
      borderRadius: 20,
      background: bg,
      border: `1px solid ${isDark ? hexWithAlpha(accentHex, 0.25) : border}`,
      overflow: "hidden",
      boxShadow: isDark
        ? `0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)`
        : `0 4px 24px rgba(0,0,0,0.06)`,
    }}>
      {/* Accent bar */}
      <div style={{ height: 3, background: `linear-gradient(to right, ${accentHex}, ${hexWithAlpha(accentHex, 0.3)})` }} />

      {/* Header */}
      <div style={{
        padding: "18px 24px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `1px solid ${divider}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <polygon points="9,1 17,5 17,13 9,17 1,13 1,5" stroke={accentHex} strokeWidth="1.5" fill={hexWithAlpha(accentHex, 0.12)} />
            <circle cx="9" cy="9" r="2" fill={accentHex} />
          </svg>
          <span style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: "0.65rem",
            letterSpacing: 2.5,
            textTransform: "uppercase",
            color: headingColor,
            fontWeight: 700,
          }}>
            Key Points
          </span>
        </div>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "0.6rem",
          color: labelColor,
          background: numBg,
          padding: "3px 10px",
          borderRadius: 20,
        }}>
          {points.length} insights
        </span>
      </div>

      {/* Points */}
      <div style={{ padding: "8px 0" }}>
        {points.map((point, i) => (
          <div key={i} style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: "12px 24px",
            borderBottom: i < points.length - 1 ? `1px solid ${divider}` : "none",
          }}>
            <span style={{
              flexShrink: 0,
              width: 26,
              height: 26,
              borderRadius: 8,
              background: numBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Space Mono', monospace",
              fontSize: "0.65rem",
              fontWeight: 700,
              color: accentHex,
              marginTop: 1,
            }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <p style={{
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: textColor,
            }}>
              {point}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STATS GRID ───────────────────────────────────────────────────────────────
function StatsGrid({
  section, accentHex, border,
}: { section: ParsedSection; accentHex: string; shade: string; border: string }) {
  const stats = section.stats.slice(0, 4);
  if (stats.length === 0) return null;

  return (
    <div style={{
      borderRadius: 20,
      background: "#fff",
      border: `1px solid ${border}`,
      padding: "20px 24px 24px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: accentHex }} />
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "0.62rem",
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#9ca3af",
        }}>
          By the numbers
        </span>
      </div>

      {/* Stat cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(stats.length, 2)}, 1fr)`,
        gap: 12,
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            borderRadius: 14,
            background: `linear-gradient(135deg, ${hexWithAlpha(accentHex, 0.06)} 0%, ${hexWithAlpha(accentHex, 0.02)} 100%)`,
            border: `1px solid ${hexWithAlpha(accentHex, 0.15)}`,
            padding: "18px 20px",
            textAlign: "center",
          }}>
            <div style={{
              fontFamily: "'Bungee', cursive",
              fontWeight: 400,
              fontSize: "clamp(1.4rem, 3vw, 2rem)",
              color: accentHex,
              lineHeight: 1.1,
              marginBottom: 6,
              letterSpacing: "-0.02em",
            }}>
              {s.value}
            </div>
            <div style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "0.75rem",
              color: "#6b7280",
              lineHeight: 1.4,
              textTransform: "capitalize",
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PROCESS FLOW ─────────────────────────────────────────────────────────────
function ProcessFlow({
  section, accentHex, border, index,
}: { section: ParsedSection; accentHex: string; shade: string; border: string; index: number }) {
  const steps = section.bullets.slice(0, 5);
  if (steps.length === 0) return null;

  const isDark = index % 2 === 1;
  const bg = isDark
    ? "linear-gradient(135deg, #0f172a 0%, #1a2744 100%)"
    : "#fff";
  const textColor = isDark ? "#cbd5e1" : "#374151";
  const labelColor = isDark ? "#94a3b8" : "#9ca3af";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "#f1f5f9";

  return (
    <div style={{
      borderRadius: 20,
      background: bg,
      border: `1px solid ${isDark ? hexWithAlpha(accentHex, 0.25) : border}`,
      overflow: "hidden",
      boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.35)" : "0 4px 24px rgba(0,0,0,0.06)",
    }}>
      <div style={{ height: 3, background: `linear-gradient(to right, ${accentHex}, ${hexWithAlpha(accentHex, 0.3)})` }} />

      <div style={{ padding: "18px 24px 10px", borderBottom: `1px solid ${divider}`, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8h9M8 5l3 3-3 3" stroke={accentHex} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: "0.62rem",
            letterSpacing: 2,
            textTransform: "uppercase",
            color: isDark ? "#e2e8f0" : "#374151",
            fontWeight: 700,
          }}>
            Step-by-Step
          </span>
        </div>
      </div>

      <div style={{ padding: "8px 0 16px" }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative" }}>
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div style={{
                position: "absolute",
                left: 35,
                top: 38,
                width: 2,
                height: "calc(100% - 14px)",
                background: `linear-gradient(to bottom, ${hexWithAlpha(accentHex, 0.4)}, ${hexWithAlpha(accentHex, 0.1)})`,
              }} />
            )}
            <div style={{ padding: "10px 24px 10px", display: "flex", alignItems: "flex-start", gap: 14, width: "100%" }}>
              {/* Step circle */}
              <div style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: accentHex,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.65rem",
                fontWeight: 700,
                color: "#fff",
                boxShadow: `0 0 0 3px ${hexWithAlpha(accentHex, 0.15)}`,
                zIndex: 1,
                position: "relative",
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, paddingTop: 4 }}>
                <p style={{
                  margin: 0,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "0.875rem",
                  lineHeight: 1.55,
                  color: textColor,
                }}>
                  {step}
                </p>
                <span style={{
                  display: "block",
                  marginTop: 2,
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "0.58rem",
                  color: labelColor,
                  letterSpacing: 1,
                }}>
                  Step {i + 1} of {steps.length}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CONCEPT GRID ─────────────────────────────────────────────────────────────
function ConceptGrid({
  section, accentHex, shade, border,
}: { section: ParsedSection; accentHex: string; shade: string; border: string }) {
  const items = section.concepts.slice(0, 8);
  // Fall back to first words of bullets if concepts are sparse
  const fallback = section.bullets.slice(0, 4).map((b) => b.split(" ").slice(0, 3).join(" "));
  const display = items.length >= 3 ? items : [...items, ...fallback].slice(0, 6);
  if (display.length === 0) return null;

  return (
    <div style={{
      borderRadius: 20,
      background: "#fff",
      border: `1px solid ${border}`,
      padding: "20px 24px 22px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke={accentHex} strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2" fill={accentHex} />
          <line x1="8" y1="2" x2="8" y2="4" stroke={accentHex} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="12" x2="8" y2="14" stroke={accentHex} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="2" y1="8" x2="4" y2="8" stroke={accentHex} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="8" x2="14" y2="8" stroke={accentHex} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "0.62rem",
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#9ca3af",
        }}>
          Core Concepts
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {display.map((concept, i) => (
          <span key={i} style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 50,
            background: shade,
            border: `1px solid ${border}`,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "0.82rem",
            fontWeight: 600,
            color: accentHex,
            letterSpacing: 0.2,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: accentHex, display: "inline-block", flexShrink: 0,
            }} />
            {concept}
          </span>
        ))}
      </div>
    </div>
  );
}
