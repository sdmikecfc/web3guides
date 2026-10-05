"use client";

/**
 * Telegram Mini App shell (Phase 0, ADR-0030). Opened inside Telegram's webview
 * via the bot Menu Button. Reads the injected `Telegram.WebApp`, verifies its
 * `initData` server-side (/api/s4/tg-verify), and routes the player into the
 * reused web surfaces. No wallet, no chain, no crypto is named here (copy rule):
 * just the prize, the teams, and Play.
 */
import { useEffect, useState } from "react";
import { DEFAULT_THEME } from "@/lib/s4/theme";

type VerifyResp =
  | { ok: true; telegramId: number | null; username: string | null; firstName: string | null }
  | { ok: false; error: string };

type Phase = "loading" | "outside" | "done";

// Minimal shape of the injected Telegram WebApp object we touch.
type TgWebApp = { initData?: string; ready?: () => void; expand?: () => void };

export function TgApp() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [resp, setResp] = useState<VerifyResp | null>(null);

  useEffect(() => {
    const tg: TgWebApp | undefined =
      typeof window !== "undefined"
        ? (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp
        : undefined;
    if (!tg || !tg.initData) {
      setPhase("outside");
      return;
    }
    try {
      tg.ready?.();
      tg.expand?.();
    } catch {
      /* older client: ignore */
    }
    fetch("/api/s4/tg-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData }),
    })
      .then((r) => r.json())
      .then((j: VerifyResp) => {
        setResp(j);
        setPhase("done");
      })
      .catch(() => {
        setResp({ ok: false, error: "network" });
        setPhase("done");
      });
  }, []);

  const who = resp && resp.ok ? (resp.username ? "@" + resp.username : resp.firstName || "agent") : null;

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#07080c",
        color: "#e8ecf5",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 22px",
        textAlign: "center",
        gap: 16,
      }}
    >
      <p style={{ letterSpacing: ".28em", fontSize: 11, textTransform: "uppercase", color: "#f0b340", margin: 0 }}>
        {DEFAULT_THEME.seasonName}
      </p>
      <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0, lineHeight: 1.1 }}>The Hit List</h1>

      {phase === "loading" && <p style={{ color: "#aeb6c8", fontSize: 15 }}>Checking you in...</p>}

      {phase === "outside" && (
        <p style={{ color: "#aeb6c8", fontSize: 15, maxWidth: 320, lineHeight: 1.6 }}>
          Open this from inside Telegram to play. Tap the bot&apos;s menu button.
        </p>
      )}

      {phase === "done" && resp?.ok && (
        <>
          <p style={{ color: "#34d399", fontSize: 15, margin: 0 }}>
            Signed in as <b>{who}</b>.
          </p>
          <p style={{ color: "#aeb6c8", fontSize: 14.5, maxWidth: 340, lineHeight: 1.6, margin: 0 }}>
            Three teams, five contracts, a <b style={{ color: "#f0b340" }}>$500</b> prize pool. Play the arcade and
            climb the board.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 300, marginTop: 6 }}>
            <a href="/s4/play" style={btn("#f0b340", "#1a1205", false)}>
              Play the arcade
            </a>
            <a href="/s4/board" style={btn("transparent", "#e8ecf5", true)}>
              See the board
            </a>
            <a href="/s4/map" style={btn("transparent", "#e8ecf5", true)}>
              The hit list map
            </a>
          </div>
          <p style={{ color: "#7a89b8", fontSize: 12, marginTop: 4, lineHeight: 1.5, maxWidth: 320 }}>
            Link up next to earn on the board.
          </p>
        </>
      )}

      {phase === "done" && resp && !resp.ok && (
        <p style={{ color: "#f87171", fontSize: 14, maxWidth: 320, lineHeight: 1.6 }}>
          Could not verify this session ({resp.error}). Try reopening from the bot menu.
        </p>
      )}
    </main>
  );
}

function btn(bg: string, color: string, outline: boolean): React.CSSProperties {
  return {
    display: "block",
    padding: "13px 18px",
    borderRadius: 12,
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 15,
    background: bg,
    color,
    border: outline ? "1px solid #ffffff26" : "none",
  };
}
