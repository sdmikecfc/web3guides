/**
 * Launch Wars Season 4 — LOCKDOWN teaser (web3guides.com/s4).
 *
 * The Beach Party theme was killed by the CMO on 2026-07-14 (ADR-0019) and the
 * previous landing was a live brand liability. Until the new theme ships, /s4
 * serves this theme-safe "dossier sealed" teaser and src/middleware.ts
 * (S4_LOCKDOWN) redirects every /s4 subroute here. No theme imports, no
 * /s4-art references (that folder is deleted from public/; archived in
 * Documents/Doma/archive/s4-beach-party-2026-07-14).
 *
 * When the new theme is ready: restore a themed landing, flip S4_LOCKDOWN off.
 */
import Landing from "./landing";

const SHOW_FULL_LANDING = true; // GO-LIVE 2026-07-14: CMO approved, art placed

// ISR: the season snapshot is cached 60s in lib/s4/data (unstable_cache), so we
// revalidate the page on the same cadence. The route is now cached + prefetchable
// (instant tab-to-tab nav) yet refreshes every 60s — far fresher than the hourly
// holdings source. Replaces the old force-dynamic + noStore pair.
export const revalidate = 60;

export const metadata = {
  title: "Launch Wars Season 4 | Web3Guides",
  description: "Season 4 is being prepared. Briefing soon.",
};

const T = {
  bg: "#07080c",
  panel: "rgba(15,16,22,0.72)",
  border: "#1d1f2a",
  text: "#e8ecf5",
  muted: "#aeb6c8",
  faint: "#79808f",
  accent: "#e33d4e",
  sans: "'Aktiv Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, 'Cascadia Code', 'Segoe UI Mono', Consolas, monospace",
} as const;

const DISCORD_URL = "https://discord.gg/doma";

function Redacted({ width }: { width: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width,
        height: "0.9em",
        background: "#23252f",
        borderRadius: 3,
        verticalAlign: "middle",
      }}
    />
  );
}

export default function S4Teaser() {
  if (SHOW_FULL_LANDING) return <Landing />;
  return (
    <main
      style={{
        background: T.bg,
        color: T.text,
        fontFamily: T.sans,
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 20px",
      }}
    >
      <div style={{ maxWidth: 560, width: "100%" }}>
        <p
          style={{
            fontFamily: T.mono,
            fontSize: 12,
            letterSpacing: "0.34em",
            color: T.faint,
            textTransform: "uppercase",
            margin: "0 0 14px",
          }}
        >
          Launch Wars
        </p>
        <h1
          style={{
            fontSize: "clamp(34px, 9vw, 56px)",
            fontWeight: 800,
            lineHeight: 1.05,
            margin: "0 0 22px",
          }}
        >
          Season 4
        </h1>

        <div
          style={{
            background: T.panel,
            border: `1px solid ${T.border}`,
            borderLeft: `3px solid ${T.accent}`,
            borderRadius: 14,
            padding: "22px 24px",
            marginBottom: 26,
          }}
        >
          <p
            style={{
              fontFamily: T.mono,
              fontSize: 12,
              letterSpacing: "0.22em",
              color: T.accent,
              textTransform: "uppercase",
              margin: "0 0 14px",
              fontWeight: 700,
            }}
          >
            Dossier sealed
          </p>
          <p style={{ fontSize: 15, color: T.muted, lineHeight: 2, margin: 0 }}>
            Theme: <Redacted width={120} />
            <br />
            Teams: <Redacted width={86} /> <Redacted width={64} /> <Redacted width={98} />
            <br />
            Targets: <Redacted width={72} /> domains. Bonded domains pay the players.
            <br />
            Status: being prepared.
          </p>
        </div>

        <a
          href={DISCORD_URL}
          style={{
            display: "inline-block",
            background: T.accent,
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            padding: "13px 28px",
            borderRadius: 12,
            textDecoration: "none",
          }}
        >
          Wait for the briefing in Discord
        </a>
        <p style={{ fontSize: 13, color: T.faint, marginTop: 18, lineHeight: 1.6 }}>
          Season 3 has ended. Rewards are being settled. Season 4 opens soon.
        </p>
      </div>
    </main>
  );
}
