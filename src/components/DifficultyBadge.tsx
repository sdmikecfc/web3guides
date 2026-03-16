import type { Difficulty } from "@/types";

const CONFIG: Record<Difficulty, { label: string; bg: string; color: string; dot: string }> = {
  beginner: {
    label: "Easy",
    bg: "rgba(16,185,129,0.12)",
    color: "#059669",
    dot: "#10b981",
  },
  intermediate: {
    label: "Medium",
    bg: "rgba(255,107,53,0.12)",
    color: "#ea580c",
    dot: "#ff6b35",
  },
  advanced: {
    label: "Advanced",
    bg: "rgba(99,102,241,0.12)",
    color: "#4f46e5",
    dot: "#6366f1",
  },
};

interface Props {
  difficulty: Difficulty;
  compact?: boolean;
}

export default function DifficultyBadge({ difficulty, compact = false }: Props) {
  const cfg = CONFIG[difficulty] ?? CONFIG.beginner;

  if (compact) {
    return (
      <span title={cfg.label} style={{ display: "inline-flex", width: 20, height: 20, borderRadius: "50%", background: cfg.bg, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "block" }} />
      </span>
    );
  }

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      borderRadius: 50,
      padding: "3px 10px",
      fontFamily: "'Space Mono', monospace",
      fontSize: "0.7rem",
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: "uppercase" as const,
      background: cfg.bg,
      color: cfg.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
      {cfg.label}
    </span>
  );
}
