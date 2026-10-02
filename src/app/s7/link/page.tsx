/**
 * Season 5 /s7/link — connect a wallet-first commander to Discord.
 *
 * BUILT 2026-08-03, hours into the season, because it was missing. The bot's
 * `/siege link` has always replied with a one-time code and the instruction to
 * finish at `${homeUrl}/link`; on the tanks subdomain that rewrites to
 * /s7/link, which did not exist. Every player who ran the command on launch day
 * hit a 404. Server shell + the client LinkForm, ported from the proven S4 flow.
 */
import { DEFAULT_THEME } from "@/lib/s7/theme";
import { Eyebrow, PageShell, UI } from "../_components/ui";
import { LinkForm } from "./form";

export const metadata = {
  title: `Link Discord · ${DEFAULT_THEME.seasonName}`,
  description: "Connect your wallet to your Discord so the season knows you.",
};

export default function S7LinkPage() {
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
          One adventurer, one wallet, one Discord. Connect them so <b>/resist me</b> knows you.
        </p>
        <LinkForm />
      </div>
    </PageShell>
  );
}
