export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="glass rounded-xl px-5 py-4 transition-colors hover:border-white/15">
      <div className="flex items-center gap-2">
        {accent && (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}77` }}
          />
        )}
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {label}
        </div>
      </div>
      <div className="mt-1.5 font-display text-[22px] font-bold text-text leading-tight tabular-nums">
        {value}
      </div>
      {hint && (
        <div className="mt-1 font-mono text-[11px] text-muted/80">{hint}</div>
      )}
    </div>
  );
}
