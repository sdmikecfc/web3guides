import type { Metadata } from "next";
import localFont from "next/font/local";
import { Cinzel } from "next/font/google";
import "../seas.css";

/**
 * CONQUER THE SEAS · The Shipyard gallery — /seas/ships
 * Served at seas.web3guides.com/ships via the middleware host rewrite.
 * A public, shareable showroom of the ten vessels so the community can see every
 * ship without owning one. Pure showcase: no DB, no interactivity. Each ship has
 * a small battle rig (stacks on fittings, battle odds only) — never Glory/cash.
 *
 * Static PNG assets under /seas-art/ are excluded from the host rewrite (see
 * middleware matcher), so the plain /seas-art/* paths resolve on the subdomain.
 * Internal page links use /seas/* which the rewrite serves verbatim.
 */

const aktiv = localFont({
  src: [
    { path: "../fonts/AktivGrotesk_Rg.ttf", weight: "400", style: "normal" },
    { path: "../fonts/AktivGrotesk_Md.ttf", weight: "500", style: "normal" },
    { path: "../fonts/AktivGrotesk_SBd.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-aktiv",
  display: "swap",
});
const aktivCd = localFont({
  src: [{ path: "../fonts/AktivGroteskCd_Md.ttf", weight: "500", style: "normal" }],
  variable: "--font-aktiv-cd",
  display: "swap",
});
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

export const metadata: Metadata = {
  title: { absolute: "The Shipyard · Conquer the Seas" },
  description:
    "Every ship in Launch Wars Season 2. Earn doubloons in the daily games and christen any of these ten vessels. Each carries a small battle rig that stacks on your fittings; it never affects your Glory or cash share.",
  openGraph: {
    title: "The Shipyard · Conquer the Seas",
    description: "All ten vessels of Launch Wars Season 2. Earn doubloons in-game and sail any of them.",
    type: "website",
    images: ["/api/launch-wars/og/seas-ships"],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Shipyard · Conquer the Seas",
    description: "All ten vessels of Launch Wars Season 2.",
    images: ["/api/launch-wars/og/seas-ships"],
  },
};

const DISCORD_URL = "https://discord.gg/doma";

// Keys + prices + rigs MUST match the bot's SHIP_SKINS (the `rig` battle bonus)
// and the /seas-art/ship-<key>.png assets. Ordered by price (cheapest first),
// the same as the shipyard menu. `rig` is the on-top-of-fittings battle bonus;
// `kind` is its one-word identity.
const SHIPS: { key: string; name: string; price: number; blurb: string; rig: string; kind: string }[] = [
  { key: "sovereign", name: "The Sovereign", price: 600, blurb: "A royal first-rate man-o-war, white and gold.", rig: "+1 cannon, +1 hull", kind: "Balanced warship" },
  { key: "seawolf", name: "The Sea Wolf", price: 700, blurb: "A Viking longship with a snarling dragon prow.", rig: "+1 cannon, +1 sail", kind: "Fast raider" },
  { key: "crimsonmarauder", name: "The Crimson Marauder", price: 750, blurb: "A blood-red privateer, lean and deadly.", rig: "+2 cannon", kind: "Glass cannon" },
  { key: "corsair", name: "The Scarlet Corsair", price: 800, blurb: "A fast Barbary raider on triangular sails.", rig: "+2 sail", kind: "Untouchable" },
  { key: "gildedlion", name: "The Gilded Lion", price: 900, blurb: "A gold-leafed royal treasure flagship.", rig: "+1 hull, +1 spyglass", kind: "Regal all-rounder" },
  { key: "blackreaver", name: "The Black Reaver", price: 900, blurb: "A cursed black galleon lit by green fire.", rig: "+2 spyglass", kind: "Cursed aim" },
  { key: "jadeserpent", name: "The Jade Serpent", price: 1000, blurb: "An eastern war junk with crimson dragon sails.", rig: "+1 cannon, +1 spyglass", kind: "Precise striker" },
  { key: "drownedwraith", name: "The Drowned Wraith", price: 1200, blurb: "A ghost ship risen from the deep.", rig: "+2 sail, +1 repair", kind: "Slippery revenant" },
  { key: "bonecrusher", name: "The Bonecrusher", price: 1200, blurb: "A nightmare built from giant bones.", rig: "+3 hull", kind: "Juggernaut" },
  { key: "tempest", name: "The Tempest", price: 1500, blurb: "A storm-warship wreathed in blue lightning.", rig: "+2 cannon, +1 spyglass", kind: "Storm flagship" },
];

export default function ShipsGalleryPage() {
  return (
    <main
      className={`seas-root ${aktiv.variable} ${aktivCd.variable} ${cinzel.variable}`}
      style={{ minHeight: "100vh", paddingBottom: 80 }}
    >
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "20px clamp(20px, 5vw, 56px)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <a href="/seas" style={{ display: "flex", flexDirection: "column", textDecoration: "none", lineHeight: 1.1 }}>
          <span style={{ fontFamily: "var(--font-condensed)", fontSize: 18, fontWeight: 600, letterSpacing: "0.14em", color: "var(--fg-1)" }}>
            LAUNCH WARS
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--lw-gold)", letterSpacing: "0.04em" }}>
            Season 2 · Conquer the Seas
          </span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/seas/map" style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-2)", textDecoration: "none" }}>
            🗺️ The map
          </a>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--surface-0)",
              background: "var(--lw-gold)",
              padding: "9px 16px",
              borderRadius: "var(--radius-full)",
              textDecoration: "none",
            }}
          >
            Join the Discord
          </a>
        </div>
      </nav>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header style={{ padding: "clamp(36px, 6vw, 64px) clamp(20px, 5vw, 56px) 8px" }}>
        <p
          style={{
            fontFamily: "var(--font-condensed)",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--lw-gold)",
            margin: 0,
          }}
        >
          The Shipyard
        </p>
        <h1
          style={{
            fontFamily: "var(--font-display-serif)",
            fontSize: "clamp(34px, 6vw, 60px)",
            fontWeight: 700,
            color: "var(--fg-1)",
            margin: "10px 0 0",
            lineHeight: 1.04,
          }}
        >
          Sail the fleet&apos;s finest
        </h1>
        <p
          style={{
            fontSize: "clamp(15px, 2.2vw, 19px)",
            fontWeight: 400,
            color: "var(--fg-3)",
            maxWidth: 720,
            margin: "16px 0 0",
            lineHeight: 1.5,
          }}
        >
          Ten vessels to command. Earn doubloons in the daily games, then christen any of them in
          Discord with <code style={{ color: "var(--lw-gold-bright)", fontFamily: "var(--font-condensed)" }}>!seas shipyard</code>.
          Each ship carries a small battle rig that stacks on top of your fittings. The rig only
          changes battle odds, never your Glory or your cash share.
        </p>
      </header>

      {/* ── Ship grid ─────────────────────────────────────────────────────── */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
          gap: "clamp(14px, 2vw, 22px)",
          padding: "24px clamp(20px, 5vw, 56px) 0",
        }}
      >
        {SHIPS.map((s) => (
          <article
            key={s.key}
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              background: "rgba(248,253,255,0.03)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 188,
                background:
                  "radial-gradient(120% 120% at 50% 18%, rgba(240,180,92,0.12) 0%, rgba(0,15,22,0) 60%), linear-gradient(180deg, #00141d 0%, #00080d 100%)",
                borderBottom: "1px solid var(--border-default)",
              }}
            >
              {/* Plain img: static asset, no rewrite, with graceful object-fit. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/seas-art/ship-${s.key}.png`}
                alt={s.name}
                width={300}
                height={150}
                style={{ width: "82%", height: "78%", objectFit: "contain" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "18px 20px 22px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <h2
                  style={{
                    fontFamily: "var(--font-display-serif)",
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--fg-1)",
                    margin: 0,
                    lineHeight: 1.1,
                  }}
                >
                  {s.name}
                </h2>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--lw-gold-bright)",
                    background: "var(--lw-gold-soft)",
                    border: "1px solid var(--lw-gold-border)",
                    borderRadius: "var(--radius-full)",
                    padding: "4px 11px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.price.toLocaleString("en-US")} doubloons
                </span>
              </div>
              <p style={{ fontSize: 14.5, fontWeight: 400, color: "var(--fg-3)", margin: 0, lineHeight: 1.45 }}>{s.blurb}</p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                  paddingTop: 10,
                  borderTop: "1px solid var(--border-default)",
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--lw-gold)",
                  }}
                >
                  Rig
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--fg-2)" }}>{s.rig}</span>
                <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 400, color: "var(--fg-4)" }}>{s.kind}</span>
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* ── Footer CTA ────────────────────────────────────────────────────── */}
      <footer style={{ padding: "clamp(32px, 5vw, 56px) clamp(20px, 5vw, 56px) 0" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "clamp(20px, 3vw, 30px)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--lw-gold-border)",
            background: "var(--lw-gold-soft)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 640 }}>
            <p style={{ fontFamily: "var(--font-display-serif)", fontSize: 22, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>
              Doubloons buy ships. Glory wins the cash.
            </p>
            <p style={{ fontSize: 15, fontWeight: 400, color: "var(--fg-2)", margin: 0, lineHeight: 1.5 }}>
              Doubloons are the in-game coins you earn playing. A ship&apos;s rig gives a small battle edge
              on top of your fittings, paint is looks only, and spending doubloons never lowers your Glory
              or your prize share. Play free for glory, hold your fleet token to win cash.
            </p>
          </div>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--surface-0)",
              background: "var(--lw-gold)",
              padding: "12px 22px",
              borderRadius: "var(--radius-full)",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Open the Shipyard in Discord
          </a>
        </div>
      </footer>
    </main>
  );
}
