/**
 * Season 4 /s4/profile — your RECORD (Mike 2026-07-15 nav): Bounty, standing,
 * holdings, and a Link Discord prompt. The web personnel file. Server shell +
 * the client ProfileForm (wallet session via the /s4 root layout's providers).
 */
import { DEFAULT_THEME } from "@/lib/s4/theme";
import { Eyebrow, PageShell, UI } from "../_components/ui";
import { ProfileForm } from "./form";

export const metadata = {
  title: `Profile · ${DEFAULT_THEME.seasonName}`,
  description: "Your record: Bounty, standing, and holdings. Link your Discord to post, duel, and claim.",
};

export default function S4ProfilePage() {
  return (
    <PageShell>
      <div style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}>
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
          Your record
        </h1>
        <p style={{ textAlign: "center", color: UI.muted, fontSize: 15, margin: "0 0 26px", lineHeight: 1.6 }}>
          Your {DEFAULT_THEME.points}, your {DEFAULT_THEME.team.singular} standing, and what you are holding. Link your
          Discord to post, duel, and claim your rewards.
        </p>
        <ProfileForm />
      </div>
    </PageShell>
  );
}
