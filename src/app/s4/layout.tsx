/**
 * Season 4 ROOT layout (Mike 2026-07-15: "nav bar across all pages, no hunting;
 * one wallet connect across all games and pages").
 *
 * ONE WalletProviders for the whole /s4 tree, so the wallet connects ONCE and
 * stays connected across every page and game (the provider mounts here and never
 * unmounts during client-side nav). This REPLACES the per-page WalletProviders
 * (the old join/link/me/games/tg-link layouts, now removed) — a single provider,
 * no double-wrapping. Trade-off: the landing/board/map now load the wallet JS
 * too; accepted for the persistent connection + a global Connect button.
 *
 * S4TopNav is a FIXED overlay (never in a page's layout flow) so it cannot break
 * the full-screen games or the map. LinkDiscordToast is a gentle, dismissable
 * reminder for web-first players to link Discord.
 *
 * TELEGRAM (Phase 2, ADR-0030): the WebApp SDK script is injected here so the
 * whole /s4 tree can run as a Mini App. It is inert on plain web (it only sets
 * window.Telegram; TelegramProvider treats an EMPTY initData as "not Telegram"),
 * so nothing changes for web players. `afterInteractive` because beforeInteractive
 * is root-layout-only in the App Router; TelegramProvider polls for the SDK, so a
 * late-landing script cannot flash the wrong gate.
 */
import Script from "next/script";
import { WalletProviders } from "@/app/wallet/providers";
import { S4TopNav } from "./_components/S4TopNav";
import { ContractTicker } from "./_components/ContractTicker";
import { LinkDiscordToast } from "./_components/LinkDiscordToast";
import { TelegramProvider } from "./_components/TelegramProvider";

export default function S4Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <TelegramProvider>
        <WalletProviders>
          <S4TopNav />
          <ContractTicker />
          {children}
          <LinkDiscordToast />
        </WalletProviders>
      </TelegramProvider>
    </>
  );
}
