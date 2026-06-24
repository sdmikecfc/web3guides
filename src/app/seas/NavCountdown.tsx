"use client";

import { useEffect, useState } from "react";

/** Subtle nav countdown to the Season 2 opening (Jun 15 2026, 10:00 UTC). */
const TARGET = Date.UTC(2026, 5, 15, 10, 0, 0);
const SEASON_END = Date.UTC(2026, 5, 30, 0, 0, 0); // season runs to June 29

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function label(now: number): string {
  const d = TARGET - now;
  if (d > 0) {
    const days = Math.floor(d / 86400000);
    const hrs = Math.floor((d % 86400000) / 3600000);
    const min = Math.floor((d % 3600000) / 60000);
    return `Season 2 begins in ${days}d ${pad(hrs)}h ${pad(min)}m`;
  }
  if (now < SEASON_END) return "Season 2 is live · ends June 29";
  return "Season 2 has ended";
}

export default function NavCountdown() {
  // Server renders the static line; the client swaps in the live countdown
  // after mount so there is no hydration mismatch.
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setText(label(Date.now()));
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="nav-count" suppressHydrationWarning>
      {text ?? (
        <>
          Season 2 begins <strong>June 15</strong>
        </>
      )}
    </span>
  );
}
