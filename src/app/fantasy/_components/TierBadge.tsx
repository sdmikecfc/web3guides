import { TIER_META, type Tier } from "../_data/tokens";

export function TierBadge({ tier, size = "sm" }: { tier: Tier; size?: "sm" | "md" | "dot" }) {
  const meta = TIER_META[tier];

  if (size === "dot") {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: meta.dot, boxShadow: `0 0 8px ${meta.dot}55` }}
        aria-label={meta.label}
      />
    );
  }

  const sizing =
    size === "md"
      ? "px-2.5 py-1 text-[11px]"
      : "px-2 py-[3px] text-[10px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono font-medium tracking-[0.06em] uppercase ${sizing}`}
      style={{
        background: `${meta.tone}14`,
        color: meta.tone,
        border: `1px solid ${meta.tone}33`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: meta.dot }}
      />
      {meta.label}
    </span>
  );
}
