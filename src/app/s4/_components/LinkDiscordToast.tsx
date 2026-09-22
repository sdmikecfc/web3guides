/**
 * A gentle, temporary reminder for web-first players to link Discord (Mike
 * 2026-07-15: "a little side temporary notification that reminds them to link
 * discord by going to discord.gg/doma -> #mini-games").
 *
 * Shows a few seconds after a wallet connects (they are engaged, likely web-
 * first), auto-hides, and reappears next connect UNTIL they tap the ✕ (then it
 * is remembered off via localStorage). Never blocks anything; bottom, dismissable.
 */
"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

const HIDE_KEY = "s4_hide_link_toast";

export function LinkDiscordToast() {
  const { isConnected } = useAccount();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !isConnected) return;
    try {
      if (localStorage.getItem(HIDE_KEY)) return;
    } catch {
      /* ignore */
    }
    const showId = setTimeout(() => setShow(true), 1500); // ease in after connect
    const hideId = setTimeout(() => setShow(false), 15000); // temporary
    return () => {
      clearTimeout(showId);
      clearTimeout(hideId);
    };
  }, [isConnected]);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 1001,
        maxWidth: 440,
        margin: "0 auto",
        background: "rgba(13,17,32,0.96)",
        border: "1px solid #f0b34055",
        borderRadius: 12,
        padding: "12px 14px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        boxShadow: "0 8px 30px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ flex: 1, fontSize: 13, color: "#e8ecf5", lineHeight: 1.55 }}>
        Playing on the web? <b style={{ fontWeight: 600 }}>Link your Discord</b> to post, duel, and claim your rewards.{" "}
        <a
          href="https://discord.gg/doma"
          target="_blank"
          rel="noreferrer"
          style={{ color: "#f0b340", fontWeight: 600 }}
        >
          discord.gg/doma
        </a>{" "}
        → <b style={{ fontWeight: 600 }}>#mini-games</b>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: "#7a89b8",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: 2,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}
