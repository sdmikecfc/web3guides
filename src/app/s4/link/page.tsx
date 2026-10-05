/**
 * Season 4 /s4/link — connect a wallet-first player to Discord.
 * Server shell + the client LinkForm; the proven S3 flow (/stars/link) ported
 * with neutral theme words. The /s4 link command name renames at theme time
 * (the bot re-registers the slash command; this copy references the stable
 * admin-facing name until then).
 */
import { DEFAULT_THEME } from "@/lib/s4/theme";
import { Eyebrow, PageShell, UI } from "../_components/ui";
import { LinkForm } from "./form";

export const metadata = {
  title: `Link Discord · ${DEFAULT_THEME.seasonName}`,
  description: "Connect your wallet to your Discord so the season knows you.",
};

export default function S4LinkPage() {
  return (
    <PageShell>
      <div style={{ width: "100%", maxWidth: 440, margin: "0 auto" }}>
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
          Link your Discord
        </h1>
        <p style={{ textAlign: "center", color: UI.muted, fontSize: 15, margin: "0 0 28px" }}>
          One {DEFAULT_THEME.player.singular}, one wallet, one Discord. Connect them so{" "}
          <b>/s4 me</b> knows you.
        </p>
        <LinkForm />
      </div>
    </PageShell>
  );
}
