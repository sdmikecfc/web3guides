/**
 * Season 4 /s4/join — the WALLET-FIRST sign-up page (Mike 2026-07-15: "you can
 * sign up on the website and link your Discord later"). Server shell + the
 * client JoinForm; the proven S3 /stars/join flow ported onto the s4 tables.
 * This is where the landing "Sign up" button leads.
 */
import { DEFAULT_THEME } from "@/lib/s4/theme";
import { Eyebrow, PageShell, UI } from "../_components/ui";
import { JoinForm } from "./form";

export const metadata = {
  title: `Sign up · ${DEFAULT_THEME.seasonName}`,
  description: "Sign up with your wallet in seconds. Link your Discord later.",
};

export default function S4JoinPage() {
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
          Sign up
        </h1>
        <p style={{ textAlign: "center", color: UI.muted, fontSize: 15, margin: "0 0 28px", lineHeight: 1.6 }}>
          Your wallet is your {DEFAULT_THEME.player.singular}. Enlist in seconds, hold a{" "}
          {DEFAULT_THEME.target.singular} from $5, and link your Discord whenever. No Discord account needed to start.
        </p>
        <JoinForm />
        <p style={{ textAlign: "center", color: UI.faint, fontSize: 13, margin: "22px 0 0", lineHeight: 1.6 }}>
          Already have a code from <b>/assassin link</b> in Discord?{" "}
          <a href="/s4/link" style={{ color: UI.warn, fontWeight: 600 }}>
            Link your wallet
          </a>{" "}
          instead.
        </p>
      </div>
    </PageShell>
  );
}
