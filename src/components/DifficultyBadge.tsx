import type { Difficulty } from "@/types";
import { cn } from "@/lib/utils";

const CONFIG: Record<
  Difficulty,
  { label: string; classes: string; dot: string }
> = {
  beginner: {
    label: "Beginner",
    classes:
      "bg-[#00291e] text-[#00e5a0] border border-[#004d36]",
    dot: "bg-[#00e5a0]",
  },
  intermediate: {
    label: "Intermediate",
    classes:
      "bg-[#2d1505] text-[#ff7c35] border border-[#4d2510]",
    dot: "bg-[#ff7c35]",
  },
  advanced: {
    label: "Advanced",
    classes:
      "bg-[#2d0a0a] text-[#ff4545] border border-[#4d0f0f]",
    dot: "bg-[#ff4545]",
  },
};

interface Props {
  difficulty: Difficulty;
  /** Render as a small dot-only badge */
  compact?: boolean;
}

export default function DifficultyBadge({ difficulty, compact = false }: Props) {
  const cfg = CONFIG[difficulty] ?? CONFIG.beginner;

  if (compact) {
    return (
      <span
        title={cfg.label}
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          cfg.classes
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider",
        cfg.classes
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
