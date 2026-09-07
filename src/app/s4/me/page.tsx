/**
 * Season 4 /s4/me — the VISUAL character picker (Mike 2026-07-15: the models
 * were text-only to pick; see them and choose them here). Your agent big, your
 * owned looks as art (tap to wear), the looks your next gear level unlocks
 * (preview), and the gender toggle. Server shell + the client MeForm.
 *
 * The picker reads/writes through /api/s4/me + /api/s4/wear, gated by the same
 * play-session token the games use. Reused inside the Telegram Mini App (Phase
 * 2): the shell there mints the token via /api/s4/tg-session, no signature.
 */
import { DEFAULT_THEME } from "@/lib/s4/theme";
import { Eyebrow, PageShell, UI } from "../_components/ui";
import { MeForm } from "./form";

export const metadata = {
  title: `Your agent · ${DEFAULT_THEME.seasonName}`,
  description: "See your looks and choose your character. Tap to wear, preview what your next gear unlocks.",
};

export default function S4MePage() {
  return (
    <PageShell>
      <div style={{ width: "100%", maxWidth: 720, margin: "0 auto" }}>
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
          Your agent
        </h1>
        <p style={{ textAlign: "center", color: UI.muted, fontSize: 15, margin: "0 0 28px", lineHeight: 1.6 }}>
          See your looks and pick your character. Tap any look you own to wear it, and preview the ones your next gear
          level unlocks. Your choice shows on the map, your card, and every share.
        </p>
        <MeForm />
      </div>
    </PageShell>
  );
}
