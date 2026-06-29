/**
 * STARFALL arcade hub — stars.web3guides.com/games.
 * Lists the mini-games. Live ones link to their canvas; the rest are flagged "Soon".
 * Each game opens a wallet play session (see games/shared) and earns Salvage + a
 * little Starlight for the crew.
 */
import Link from "next/link";

export const metadata = {
  title: "Arcade — Starfall",
  description: "Fly the Starfall mini-games. Earn Salvage and a little Starlight for your crew.",
};

const GOLD = "#f0b340";
const VOID = "#080b14";

const GAMES = [
  { slug: "rally", name: "Rover Rally", tag: "Live", accent: "#f0b340", blurb: "Drift a rover through 3 laps of an alien world. Ramps, boosts, hazards, rival rovers." },
  { slug: "trench", name: "Trench Run", tag: "Live", accent: "#7c6aff", blurb: "Thread the gap in every barrier at full burn." },
  { slug: "slingshot", name: "Gravity Slingshot", tag: "Live", accent: "#5eead4", blurb: "Pull back and slingshot a missile past a planet into the rival ship." },
  { slug: "raid", name: "Asteroid Raid", tag: "Live", accent: "#86f0c4", blurb: "Blast up a narrowing asteroid canyon. Shoot raiders, grab gun upgrades, shoot fuel cells to keep flying." },
] as const;

export default function GamesHub() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: `radial-gradient(1000px 520px at 50% -10%, #131a2e 0%, ${VOID} 60%)`,
        color: "#e8ecf5",
        padding: "48px 20px 64px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#cdd4e4", textDecoration: "none", fontSize: 14, fontWeight: 600, opacity: 0.85 }}>
          ‹ Starfall
        </Link>
        <p style={{ letterSpacing: "0.3em", fontSize: 11, color: GOLD, textTransform: "uppercase", margin: "18px 0 4px" }}>
          Launch Wars · Season 3
        </p>
        <h1
          style={{
            fontSize: 38,
            fontWeight: 800,
            margin: "0 0 8px",
            background: `linear-gradient(180deg,#fff 0%,${GOLD} 140%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Arcade
        </h1>
        <p style={{ color: "#aeb6c8", fontSize: 15, margin: "0 0 28px", lineHeight: 1.6 }}>
          Fly for <b style={{ color: "#e8ecf5" }}>Salvage</b> (upgrades + cosmetics) and a little{" "}
          <b style={{ color: GOLD }}>Starlight</b> for your crew. Best of 3 runs a day per game counts.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {GAMES.map((g) => {
            const live = g.tag === "Live";
            const card = (
              <div
                style={{
                  position: "relative",
                  height: "100%",
                  background: "rgba(13,17,32,0.72)",
                  border: `1px solid ${g.accent}${live ? "55" : "22"}`,
                  borderRadius: 16,
                  padding: "20px 20px 22px",
                  opacity: live ? 1 : 0.66,
                  transition: "transform .15s",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 14,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: live ? "#1a1205" : "#aeb6c8",
                    background: live ? g.accent : "rgba(255,255,255,0.08)",
                    borderRadius: 999,
                    padding: "3px 9px",
                  }}
                >
                  {g.tag}
                </span>
                <div style={{ fontSize: 21, fontWeight: 800, color: g.accent, marginBottom: 8 }}>{g.name}</div>
                <p style={{ fontSize: 13.5, color: "#aeb6c8", lineHeight: 1.55, margin: 0 }}>{g.blurb}</p>
                {live && (
                  <div style={{ marginTop: 16, fontSize: 14, fontWeight: 700, color: "#fff" }}>Play ›</div>
                )}
              </div>
            );
            return live ? (
              <Link key={g.slug} href={`/games/${g.slug}`} style={{ textDecoration: "none" }}>
                {card}
              </Link>
            ) : (
              <div key={g.slug}>{card}</div>
            );
          })}
        </div>

        <p style={{ color: "#5b6478", fontSize: 12.5, marginTop: 28, lineHeight: 1.6 }}>
          Games open once a star lists. You’ll connect your wallet and sign once (no gas) to start a play session.
        </p>
      </div>
    </main>
  );
}
