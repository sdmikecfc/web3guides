/**
 * Conquer the Seas — duties index (unlisted; players arrive via the personal
 * links the bot DMs from !seas play). Kept minimal on purpose: this page
 * carries no token, so it only points people back to the bot.
 */

const GAMES = [
  { key: "channel-run", icon: "🚣", name: "The Channel Run", desc: "Steer, dodge, shoot. 90 seconds." },
  { key: "gunnery", icon: "🎯", name: "Gunnery Drill", desc: "45 seconds of cannon fire." },
  { key: "powder-hold", icon: "💣", name: "The Powder Hold", desc: "Drop and merge cannonballs. No timer." },
  { key: "heading", icon: "🧭", name: "The Heading", desc: "Plot the shortest course. Same sea for everyone." },
];

export default function GamesIndex() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000f16",
        color: "#f8fdff",
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
      }}
    >
      <p style={{ color: "#f0b45c", letterSpacing: "0.2em", fontSize: 12, textTransform: "uppercase" }}>
        Conquer the Seas · Daily duties
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "min(440px, 100%)" }}>
        {GAMES.map((g) => (
          <a
            key={g.key}
            href={`/seas/games/${g.key}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              border: "1px solid rgba(248,253,255,0.10)",
              borderRadius: 12,
              textDecoration: "none",
              color: "#f8fdff",
            }}
          >
            <span style={{ fontSize: 22 }}>{g.icon}</span>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <strong>{g.name}</strong>
              <span style={{ color: "rgba(248,253,255,0.64)", fontSize: 13 }}>{g.desc}</span>
            </span>
          </a>
        ))}
      </div>
      <p style={{ color: "rgba(248,253,255,0.64)", fontSize: 13, textAlign: "center", maxWidth: 380 }}>
        To bank scores, use your personal links. Type <strong>!seas play</strong> in the Doma Discord and check
        your DMs.
      </p>
    </main>
  );
}
