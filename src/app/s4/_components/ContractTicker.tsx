/**
 * THE CONTRACT TICKER (Mike 2026-07-18: "Countdowns very obvious everywhere.
 * It should shill these contracts... the sheer shilling").
 *
 * A fixed strip under the global nav on EVERY /s4 page: each live contract with
 * its % and a ticking DD HH:MM:SS clock to the end of its bonding window.
 * Under 24h the chip pulses crimson. Bonded contracts show CLOSED in green:
 * the countdown fiction IS the season fiction (a hit contract with an expiry;
 * only CLOSED contracts pay).
 *
 * Copy rules still hold inside the urgency: "closes/expires", never "fails/
 * dies"; no dollars, no math. Data from /api/s4/contracts (60s cache), clock
 * ticks locally every second, list refreshes every 5 minutes.
 */
"use client";

import { useEffect, useState } from "react";

export const S4_TICKER_HEIGHT = 38;

type Contract = { domain: string; status: string; pct: number; expiresAt: string | null; lockedUsd?: number };

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function clock(msLeft: number): string {
  if (msLeft <= 0) return "00:00:00";
  const s = Math.floor(msLeft / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}D ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function ContractTicker() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await (await fetch("/api/s4/contracts")).json();
        if (alive && r?.ok) setContracts(r.contracts || []);
      } catch {
        /* keep the last list */
      }
    };
    void load();
    const listId = setInterval(load, 5 * 60 * 1000);
    const tickId = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(listId);
      clearInterval(tickId);
    };
  }, []);

  if (!contracts.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 52, // directly under S4TopNav
        left: 0,
        right: 0,
        zIndex: 999,
        height: S4_TICKER_HEIGHT,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 10px",
        overflowX: "auto",
        scrollbarWidth: "none",
        background: "rgba(10,7,9,0.92)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: "1px solid #2a1520",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        whiteSpace: "nowrap",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html:
            "@keyframes s4tickpulse{0%,100%{box-shadow:0 0 0 0 rgba(227,61,78,0.45)}50%{box-shadow:0 0 10px 2px rgba(227,61,78,0.55)}}",
        }}
      />
      {contracts.map((c) => {
        const isLive = c.status === "live";
        const isFailed = c.status === "failed";
        const msLeft = isLive && c.expiresAt ? new Date(c.expiresAt).getTime() - now : 0;
        const urgent = isLive && msLeft > 0 && msLeft < 24 * 3600 * 1000;
        if (isFailed) {
          // The window won: the money is gone and everyone should see it go.
          return (
            <a
              key={c.domain}
              href="/s4/board"
              style={{
                display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0,
                padding: "5px 11px", borderRadius: 8, textDecoration: "none",
                fontSize: 11.5, letterSpacing: "0.04em",
                border: "1px solid #62371f66", background: "rgba(98,55,31,0.12)",
                color: "#8b95ad", opacity: 0.85,
              }}
            >
              <b style={{ color: "#a8794f", textTransform: "uppercase", textDecoration: "line-through" }}>{c.domain}</b>
              <span style={{ color: "#a8794f", fontWeight: 800 }}>⌛ EXPIRED</span>
            </a>
          );
        }
        return (
          <a
            key={c.domain}
            href="/s4/board"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              flexShrink: 0,
              padding: "5px 11px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 11.5,
              letterSpacing: "0.04em",
              border: `1px solid ${isLive ? (urgent ? "#e33d4e" : "#f0b34055") : "#34d39944"}`,
              background: isLive ? (urgent ? "rgba(227,61,78,0.14)" : "rgba(240,179,64,0.07)") : "rgba(52,211,153,0.08)",
              color: "#e8ecf5",
              animation: urgent ? "s4tickpulse 1.6s ease-in-out infinite" : undefined,
            }}
          >
            <b style={{ color: isLive ? "#f0b340" : "#34d399", textTransform: "uppercase" }}>{c.domain}</b>
            {isLive ? (
              <>
                <span style={{ color: "#8b95ad" }}>{c.pct}%</span>
                {Number(c.lockedUsd) > 0 && (
                  <span style={{ color: urgent ? "#ff6b7d" : "#f0b340", fontWeight: 800 }}>🔒 ${Math.round(Number(c.lockedUsd)).toLocaleString()}</span>
                )}
                <span style={{ color: urgent ? "#ff6b7d" : "#e8ecf5", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  ⏳ {clock(msLeft)}
                </span>
                <span style={{ color: urgent ? "#ff6b7d" : "#f0b340", fontWeight: 800 }}>CLOSE IT →</span>
              </>
            ) : (
              <span style={{ color: "#34d399", fontWeight: 800 }}>
                ✓ CLOSED{Number(c.lockedUsd) > 0 ? ` · $${Math.round(Number(c.lockedUsd)).toLocaleString()} UNLOCKED` : ""}
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}
