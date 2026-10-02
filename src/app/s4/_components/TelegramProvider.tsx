/**
 * Telegram Mini App runtime for the /s4 shell (Phase 2, ADR-0030).
 *
 * The WebApp SDK (loaded by the /s4 layout) attaches window.Telegram.WebApp when
 * the page is opened INSIDE Telegram. This provider is the one place that:
 *   - decides whether we are in Telegram at all (a non-empty initData is the ONLY
 *     honest signal; window.Telegram exists on plain web too once the script runs),
 *   - calls ready() + expand() so the Mini App fills the sheet,
 *   - hands initData down to useS4Session, which trades it for a play session via
 *     /api/s4/tg-session (Strategy B: no wallet, no signature ever in Telegram).
 *
 * `ready` means "we have finished deciding", NOT "we are in Telegram". Consumers
 * gate on it so the web connect+sign UI never flashes for a Telegram user while
 * the SDK script is still landing.
 *
 * initData is treated as an opaque credential: it is only ever POSTed to our own
 * API, which verifies its HMAC server-side (lib/s4/telegram). Never trust any
 * field of initDataUnsafe on the client.
 */
"use client";

import { createContext, useContext, useEffect, useState } from "react";

type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  close?: () => void;
  colorScheme?: "light" | "dark";
  platform?: string;
  version?: string;
};

type TelegramState = {
  /** True once we have decided whether this is Telegram (in or out). */
  ready: boolean;
  /** True ONLY inside Telegram (verified later, server-side, from initData). */
  isTelegram: boolean;
  /** Opaque signed launch payload. Send to our API; never parse for trust. */
  initData: string;
  webApp: TelegramWebApp | null;
};

const EMPTY: TelegramState = { ready: false, isTelegram: false, initData: "", webApp: null };
const TelegramContext = createContext<TelegramState>(EMPTY);

export function useTelegram(): TelegramState {
  return useContext(TelegramContext);
}

/**
 * Open a URL OUTSIDE the Mini App webview (the system browser). Used for the
 * one-time account link, which must happen on the web where the wallet lives.
 * Falls back to a normal navigation when we are not in Telegram.
 */
export function openExternal(webApp: TelegramWebApp | null, url: string) {
  try {
    if (webApp?.openLink) {
      webApp.openLink(url);
      return;
    }
  } catch {
    /* fall through to a plain open */
  }
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TelegramState>(EMPTY);

  useEffect(() => {
    let alive = true;
    let tries = 0;
    // The SDK is injected with afterInteractive, so it can land after hydration.
    // Poll briefly, then settle as "not Telegram" rather than hanging the gate.
    const settle = (s: TelegramState) => {
      if (alive) setState(s);
    };
    const tick = () => {
      if (!alive) return;
      const webApp = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp || null;
      const initData = String(webApp?.initData || "");
      if (initData) {
        try {
          webApp?.ready?.();
          webApp?.expand?.();
        } catch {
          /* a Telegram client too old for these is still playable */
        }
        settle({ ready: true, isTelegram: true, initData, webApp });
        return;
      }
      // window.Telegram with an EMPTY initData = the script loaded on plain web.
      if (webApp || tries++ > 40) {
        settle({ ready: true, isTelegram: false, initData: "", webApp: null });
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
    return () => {
      alive = false;
    };
  }, []);

  return <TelegramContext.Provider value={state}>{children}</TelegramContext.Provider>;
}
