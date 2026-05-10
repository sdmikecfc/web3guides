"use client";

import { useEffect, useState } from "react";

export function Countdown({ to, label = "Lock in" }: { to: string | number | Date; label?: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null); // null on server-render — hides SSR mismatch

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const display = (() => {
    if (now === null) return "—";
    const diff = Math.max(0, target - now);
    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    const mins = Math.floor((diff % 3_600_000) / 60_000);
    const secs = Math.floor((diff % 60_000) / 1000);
    const hms = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return days > 0 ? `${days}d ${hms}` : hms;
  })();

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface/60 px-3 py-1.5 backdrop-blur-md">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className="font-mono text-[12px] tabular-nums text-text" suppressHydrationWarning>
        {display}
      </span>
    </div>
  );
}
