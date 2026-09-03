/**
 * /bots landing PLACEHOLDER (week 1). The real landing (screens doc 1) is the
 * pit replaying in a lit frame with Connect wallet and Watch a fight; that
 * waits for the fight viewer. This holds the route, the headline and the two
 * doors so nothing 404s while the bay is being built.
 */
import Link from "next/link";
import { PageShell } from "./_components/PageShell";
import { FONT_DISPLAY, FONT_MONO, M, R, TAP } from "./_ui/tokens";
import { STRINGS } from "@/lib/bots/strings";

export default function BotsLanding() {
  const t = STRINGS.en;
  const door = (primary: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    minHeight: TAP,
    padding: "10px 18px",
    borderRadius: R.inner,
    border: `1px solid ${primary ? M.accent : M.border}`,
    background: primary ? M.accent : M.surface2,
    color: primary ? "#ffffff" : M.text,
    fontWeight: 700,
    fontSize: 14,
    textDecoration: "none",
  });
  return (
    <PageShell>
      <p
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11,
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          color: M.muted,
          margin: "24px 0 10px",
        }}
      >
        {t.nav.wordmark}
      </p>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 40, lineHeight: 1.1, margin: "0 0 12px", color: M.text }}>
        {t.landing.headline}
      </h1>
      <p style={{ fontSize: 16, color: M.lore, margin: "0 0 24px" }}>{t.landing.sub}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Link href="/bots/garage" style={door(true)}>
          {t.ui.landingGarage}
        </Link>
        <Link href="/bots/battles" style={door(false)}>
          {t.landing.watch}
        </Link>
      </div>
    </PageShell>
  );
}
