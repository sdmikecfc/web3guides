/**
 * Season 5 /s5/join, the WALLET-FIRST enlist page (the proven S4 /s4/join
 * flow ported onto the s5 tables, one team). Server shell + client JoinForm.
 */
import Link from "next/link";
import { DEFAULT_THEME } from "@/lib/s6/theme";
import { dict, getLocale } from "@/lib/s6/i18n";
import { Eyebrow, PageShell, UI } from "../_components/ui";
import { JoinForm } from "./form";

export const revalidate = 60;

export const metadata = {
  title: `Enlist · ${DEFAULT_THEME.seasonName}`,
  description: "Enlist with your wallet in seconds. Link your Discord later.",
};

export default function S5JoinPage() {
  const d = dict(getLocale());
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
            background: "linear-gradient(180deg, #ffffff 0%, #9aa7b4 140%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            // forced-colors drops the gradient; without this the heading is
            // invisible in Windows High Contrast Mode (2026-07-27 audit).
            forcedColorAdjust: "none",
          }}
        >
          {d.join.title}
        </h1>
        <p style={{ textAlign: "center", color: UI.muted, fontSize: 15, margin: "0 0 28px", lineHeight: 1.6 }}>
          {d.join.subtitle}
        </p>
        <JoinForm />
        {/* Enlisting is a choice, not a gate: the way back to the camp is on
            the page BEFORE anyone signs anything, not only after. */}
        <p style={{ textAlign: "center", marginTop: 26, fontSize: 13 }}>
          <Link href="/s6" style={{ color: UI.muted }}>
            {d.common.back}
          </Link>
          <span style={{ color: UI.faint, margin: "0 10px" }}>·</span>
          <Link href="/s6/how-to-play" style={{ color: UI.muted }}>
            {d.links.howToPlay}
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
