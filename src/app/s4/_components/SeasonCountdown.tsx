/**
 * Season 4 countdown (client) — the NavCountdown-style timer S3 shipped
 * without. Reads the season window from the snapshot (config key s4_season in
 * launch_wars_boss_config, JSON {launchAt,endAt}); renders nothing until that
 * config exists. Anchored to the SERVER timestamp so hydration never drifts
 * (the S3 nowMs lesson).
 */
"use client";

import { useEffect, useState } from "react";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

export function SeasonCountdown({
  launchAt,
  endAt,
  serverNowMs,
}: {
  launchAt: string | null;
  endAt: string | null;
  serverNowMs: number;
}) {
  // First render (server AND client) uses the server clock, so the markup
  // matches at hydration; after mount we tick on the client clock corrected by
  // the initial offset.
  const [nowMs, setNowMs] = useState(serverNowMs);
  useEffect(() => {
    const offset = serverNowMs - Date.now();
    const id = setInterval(() => setNowMs(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [serverNowMs]);

  const launchMs = launchAt ? new Date(launchAt).getTime() : NaN;
  const endMs = endAt ? new Date(endAt).getTime() : NaN;

  let label: string | null = null;
  if (Number.isFinite(launchMs) && nowMs < launchMs) {
    label = `Season opens in ${fmt(launchMs - nowMs)}`;
  } else if (Number.isFinite(endMs) && nowMs < endMs) {
    label = `Season ends in ${fmt(endMs - nowMs)}`;
  } else if (Number.isFinite(endMs)) {
    label = "Season complete";
  }
  if (!label) return null;

  return (
    <p
      style={{
        margin: "14px 0 0",
        textAlign: "center",
        fontSize: 13,
        letterSpacing: "0.06em",
        color: "#8b95ad",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {label}
    </p>
  );
}
