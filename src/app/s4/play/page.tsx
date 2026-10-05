/**
 * Launch Wars Season 4 — the arcade hub (web3guides.com/s4/play).
 *
 * A STEAM-LIBRARY presentation: a featured hero banner over a grid of cover-art
 * tiles (GameLibrary.tsx). This file stays a SERVER component and owns the
 * data: it reads the registry (src/lib/s4/games.ts) — still the one source of
 * the slate — maps each game to a serializable card (display name from the
 * registry, plus a local blurb + accent for presentation), and routes every
 * card to /s4/games/<key>. Wiring a game stays a registry edit; this page just
 * renders whatever the registry lists.
 *
 * The anti-cheat chain (/api/s4/game-session -> run-start -> score) lives behind
 * each game page; the wallet play-session shell is games/layout.tsx, not here.
 */
import Link from "next/link";
import { getSeasonSnapshot } from "@/lib/s4/data";
import { DEFAULT_THEME } from "@/lib/s4/theme";
import { GAMES, GAME_DAILY_POINTS_CAP } from "@/lib/s4/games";
import { Eyebrow, PageShell, UI } from "../_components/ui";
import { GameLibrary, type LibraryCard } from "./GameLibrary";

// ISR (see /s4/page.tsx): cached + prefetchable, refreshed every 60s.
export const revalidate = 60;

export const metadata = {
  title: `Games · ${DEFAULT_THEME.seasonName}`,
  description: "The Season 4 arcade: four games, live with the theme.",
};

// Per-game PRESENTATION only (the display name always comes from the registry).
// Keys are the stable registry keys. Accents use each S4 palette color once so
// the shelf reads as four distinct games: gold / crimson / ice / violet.
const BLURBS: Record<string, string> = {
  riviera: "Frontier horseback shootout",
  highnoon: "Noon-time survivors standoff",
  getaway: "GTA-style city escape",
  extraction: "Neon night-bike chain run",
};
const ACCENTS: Record<string, string> = {
  riviera: "#f0b340", // gold
  highnoon: "#e33d4e", // crimson
  getaway: "#4dd8e6", // ice
  extraction: "#c44dff", // violet
};
const FALLBACK_ACCENT = "#e33d4e";

export default async function S4Play() {
  const snap = await getSeasonSnapshot();
  const t = snap.theme;

  const cards: LibraryCard[] = GAMES.map((g) => ({
    key: g.key,
    name: g.name,
    blurb: BLURBS[g.key] ?? "",
    accent: ACCENTS[g.key] ?? FALLBACK_ACCENT,
    comingSoon: g.comingSoon,
  }));

  return (
    <PageShell>
      <header style={{ marginBottom: 24 }}>
        <Eyebrow>{t.seasonName}</Eyebrow>
        <h1 style={{ fontSize: "clamp(28px, 6vw, 44px)", fontWeight: 800, margin: "0 0 8px", color: UI.text }}>
          The Arcade
        </h1>
        <p style={{ fontSize: 14.5, color: UI.muted, margin: 0, maxWidth: 640, lineHeight: 1.65 }}>
          Four jobs. Each pays {t.playCurrency} plus a little {t.points}, capped at{" "}
          {GAME_DAILY_POINTS_CAP} {t.points} a day across all games. Holding is the main engine: the
          arcade is the fun on top.
        </p>
      </header>

      <GameLibrary cards={cards} />

      <p style={{ textAlign: "center", fontSize: 13, color: UI.faint, marginTop: 30 }}>
        {/* inline-block padding + negative margin: 44px tap targets, zero layout shift */}
        <Link
          href="/s4"
          style={{ color: UI.muted, display: "inline-block", padding: "13px 10px", margin: "-13px -10px" }}
        >
          Season home
        </Link>
        {" · "}
        <Link
          href="/s4/me"
          style={{ color: UI.muted, display: "inline-block", padding: "13px 10px", margin: "-13px -10px" }}
        >
          Your agent
        </Link>
        {" · "}
        <Link
          href="/s4/board"
          style={{ color: UI.muted, display: "inline-block", padding: "13px 10px", margin: "-13px -10px" }}
        >
          Status Board
        </Link>
      </p>
    </PageShell>
  );
}
