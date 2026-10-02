/**
 * /s4/tg-link — the Telegram wallet-bind page (ADR-0030 Phase 1).
 *
 * Opened in the SYSTEM browser from the Telegram Mini App (or a bot DM) with a
 * one-time ?code. The player connects their wallet and signs; POST /api/s4/tg-bind
 * binds that wallet to the Telegram account that minted the code. Server shell +
 * the client TgLinkForm (scoped wallet context via layout). Strategy B: this is
 * the ONLY place wallet + SIWE happen for Telegram users; the Mini App itself
 * never touches a wallet.
 */
import { DEFAULT_THEME } from "@/lib/s4/theme";
import { Eyebrow, PageShell, UI } from "../_components/ui";
import { TgLinkForm } from "./form";

export const metadata = {
  title: `Link your wallet · ${DEFAULT_THEME.seasonName}`,
  description: "Link your wallet to your Telegram in seconds. One signature, no gas.",
};

export default async function S4TgLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const code = (await searchParams)?.code || "";
  return (
    <PageShell>
      <div style={{ width: "100%", maxWidth: 460, margin: "0 auto" }}>
        <div style={{ textAlign: "center" }}>
          <Eyebrow>{DEFAULT_THEME.seasonName}</Eyebrow>
        </div>
        <h1
          style={{
            textAlign: "center",
            fontSize: 34,
            fontWeight: 800,
            margin: "0 0 6px",
            background: "linear-gradient(180deg, #ffffff 0%, #9fb0d0 140%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Link your wallet
        </h1>
        <p style={{ textAlign: "center", color: UI.muted, fontSize: 15, margin: "0 0 28px", lineHeight: 1.6 }}>
          Bind your wallet to your Telegram so your {DEFAULT_THEME.player.singular} follows you everywhere. One
          signature, no gas, then head back to Telegram and play.
        </p>
        <TgLinkForm code={code} />
      </div>
    </PageShell>
  );
}
