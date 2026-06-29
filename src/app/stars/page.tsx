/**
 * STARFALL (Launch Wars S3) landing — stars.web3guides.com root.
 * The WebGL black-hole hero (StarfallHero) over the fold, then the new-user
 * explainer below it: what the game is, how you win, what sizes your reward, the
 * two currencies, how to start, and the five stars. Copy is the locked contract
 * (bond-to-win, never "win $1,000"), mission-control voice, ESL-plain, no em-dashes.
 */
import Link from "next/link";
import { StarfallHero } from "./_hero/StarfallHero";

export const metadata = {
  title: "Starfall: Launch Wars Season 3",
  description: "Five stars. Three crews. Light them all.",
};

const GOLD = "#f0b340";
const BORDER = "#1c2236";
const PANEL = "rgba(13,17,32,0.66)";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ letterSpacing: "0.32em", fontSize: 12, color: GOLD, margin: "0 0 10px", textTransform: "uppercase", fontWeight: 700 }}>
      {children}
    </p>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{title}</div>
      <p style={{ fontSize: 14, color: "#aeb6c8", lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}

const sectionStyle: React.CSSProperties = { maxWidth: 920, margin: "0 auto", padding: "0 20px 64px" };
const h2Style: React.CSSProperties = { fontSize: "clamp(24px, 5vw, 34px)", fontWeight: 800, color: "#fff", margin: "0 0 18px", lineHeight: 1.15 };

export default function StarfallLanding() {
  return (
    <main style={{ background: "#050912", color: "#e8ecf5", fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <StarfallHero>
        <p style={{ letterSpacing: "0.35em", fontSize: 12, color: GOLD, margin: 0, textTransform: "uppercase" }}>
          Launch Wars · Season 3
        </p>
        <h1
          style={{
            fontSize: "clamp(32px, 11vw, 132px)",
            fontWeight: 800,
            margin: "10px 0 6px",
            background: `linear-gradient(180deg, #ffffff 0%, ${GOLD} 130%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            lineHeight: 1,
          }}
        >
          STARFALL
        </h1>
        <p style={{ fontSize: "clamp(16px, 4vw, 22px)", color: "#cdd4e4", margin: "0 0 34px" }}>
          Five stars. Three crews. Light them all.
        </p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/join" style={{ background: GOLD, color: "#1a1205", fontWeight: 700, padding: "14px 30px", borderRadius: 12, textDecoration: "none", fontSize: 17 }}>
            Join the Game
          </Link>
          <Link href="/map" style={{ background: "rgba(13,17,32,0.6)", color: "#e8ecf5", fontWeight: 600, padding: "14px 30px", borderRadius: 12, textDecoration: "none", fontSize: 17, border: `1px solid ${BORDER}` }}>
            See the Map
          </Link>
        </div>
        <p style={{ marginTop: 38, fontSize: 13, color: "#8b95ad" }}>Opens 2026-06-29 09:00 UTC.</p>
      </StarfallHero>

      {/* ── The mission ─────────────────────────────────────────────────────── */}
      <section style={{ ...sectionStyle, paddingTop: 64 }}>
        <Eyebrow>How Starfall works</Eyebrow>
        <h2 style={h2Style}>Five dark stars. Light them all.</h2>
        <p style={{ fontSize: "clamp(15px, 2.5vw, 18px)", color: "#c2cadb", lineHeight: 1.7, maxWidth: 720, margin: 0 }}>
          Five real domains are listing on Doma this week. In the game they are five dark stars. Buy and hold the
          star tokens to make <b style={{ color: GOLD }}>Starlight</b>, the fuel. Fill your crew’s <b style={{ color: "#fff" }}>Starforge</b> and
          your flagship pulls free of the black hole. Light all five and every crew is clear.
        </p>
      </section>

      {/* ── How you win (the contract) ──────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>How you win</h2>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Card title="Only launched stars pay" body="A star pays only once it bonds (graduates on Doma). Help light all five. The prize pool grows with each star that lights, so helping a laggard helps everyone." />
          <Card title="The top crews split the prize" body="The three crews race to charge their Starforge. The top crews split the prize at season end. No single crew or player takes the whole pot." />
          <Card title="Fuel where you are needed" body="Big stars need a crowd, smoothie most of all. Small stars light with a few. A crowded crew splits its share more ways, so a smaller crew can pay more each." />
        </div>
        <p style={{ fontSize: 13.5, color: "#8b95ad", marginTop: 14 }}>Pays only if your stars light.</p>
      </section>

      {/* ── What sizes your reward ──────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>What sizes your reward</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
          {[
            ["Holding is the cash engine.", "Hold the star tokens and you earn Starlight every day, up to a daily cap so no whale runs away with it. This is the part that wins cash."],
            ["Posting is the next biggest lever.", "Post about a star or your crew on X and drop the link in #content-share. You earn Starlight that grows with how much the post pops, gated on holding."],
            ["Playing earns Salvage.", "The arcade pays Salvage for your ship plus a little Starlight, all gated on holding, so you buy in first."],
            ["Bonding scales the pool.", "The prize grows as more stars light. The whole sector wins when you help a behind star ignite."],
            ["Everyone starts fair.", "A five dollar pilot earns full Starlight per dollar from day one. You never need a second wallet or a big bag."],
          ].map(([t, b]) => (
            <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ color: GOLD, fontSize: 18, lineHeight: 1.5 }}>◆</span>
              <p style={{ fontSize: 15, color: "#c2cadb", lineHeight: 1.6, margin: 0 }}>
                <b style={{ color: "#fff" }}>{t}</b> {b}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Share to earn (the posts pillar) ────────────────────────────────── */}
      <section style={sectionStyle}>
        <Eyebrow>Sharing is priority number two</Eyebrow>
        <h2 style={h2Style}>Share to earn Starlight</h2>
        <p style={{ fontSize: "clamp(15px, 2.5vw, 18px)", color: "#c2cadb", lineHeight: 1.7, maxWidth: 720, margin: "0 0 18px" }}>
          Right after holding, posting is the fastest way to climb. The bot reads your post and pays you Starlight
          automatically, and the more it pops, the more it earns. Just like Season 1.
        </p>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Card title="1. Post on X" body="Post about Starfall, one of the five stars (like smoothie.com), or your crew. Naming one of those is what makes it qualify." />
          <Card title="2. Drop the link in #content-share" body="Paste your X link in the #content-share channel on Discord. No command needed, the bot picks it up and credits your pilot." />
          <Card title="3. Earn by engagement" body="The more likes, reposts, and replies your post gets, the more Starlight it pays, up to a daily and season cap." />
        </div>
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 20px", marginTop: 14 }}>
          <p style={{ fontSize: 14, color: "#aeb6c8", lineHeight: 1.6, margin: 0 }}>
            <b style={{ color: "#fff" }}>You need a linked Discord to earn from posts</b>, because #content-share lives in Discord.
            Holding and playing do not need it. Linking takes a wallet signature plus a one-time code from the bot.
          </p>
        </div>
      </section>

      {/* ── Two currencies ──────────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>Two currencies, kept simple</h2>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Card title="✦ Starlight wins the cash" body="Earned by holding the star tokens (plus a little from playing and posting). It is your score and your crew’s fuel. Starlight is what the prize is paid on." />
          <Card title="◇ Salvage upgrades your ship" body="Earned by playing the arcade. Buys ship upgrades and paint. It is fair because it is earned by play, not money. It can never buy cash power." />
        </div>
        <p style={{ fontSize: 14.5, color: "#cdd4e4", marginTop: 14, fontWeight: 600 }}>
          Starlight from holding wins the cash. Salvage from playing upgrades your ship.
        </p>
      </section>

      {/* ── Start in three steps ────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>Start in three steps</h2>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Card title="1. Connect your wallet" body="Your wallet is your pilot, no Discord needed to start. You are placed on the smallest crew to keep things fair (switch free in your first 24 hours)." />
          <Card title="2. Fuel a star from $5" body="Buy and hold any of the five star tokens. That is how you start making Starlight and charging your crew’s Starforge." />
          <Card title="3. Play and hold" body="Play the arcade for Salvage, post to spread the word, and keep holding. Climb the ranks and help light all five stars." />
        </div>
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 20px", marginTop: 14 }}>
          <p style={{ fontSize: 14, color: "#aeb6c8", lineHeight: 1.6, margin: 0 }}>
            <b style={{ color: "#fff" }}>Link Discord for the social bonus.</b> Your wallet is your pilot, so you can buy, hold, and play
            without it. Link Discord to earn Starlight from your posts (that is where #content-share lives), plus the community and
            role rewards. It is secure: it needs both a wallet signature and a one-time code from the bot.
          </p>
        </div>
      </section>

      {/* ── The five stars ──────────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>The five stars</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          {[
            ["smoothie.com", "the priority, biggest gap"],
            ["braking.io", "lists first"],
            ["uncage.xyz", ""],
            ["cosmo.xyz", ""],
            ["frenchfries.ai", ""],
          ].map(([d, tag]) => (
            <span key={d} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 999, padding: "8px 16px", fontSize: 14, color: "#e8ecf5" }}>
              <b>{d}</b>{tag ? <span style={{ color: "#8b95ad" }}> · {tag}</span> : null}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 14, color: "#aeb6c8", lineHeight: 1.6, maxWidth: 720, margin: "0 0 28px" }}>
          They list across the play week. Some sign late and flip from launching soon to live. See live status, bond
          progress, and the crew race on the map.
        </p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link href="/join" style={{ background: GOLD, color: "#1a1205", fontWeight: 700, padding: "14px 30px", borderRadius: 12, textDecoration: "none", fontSize: 17 }}>
            Join the Game
          </Link>
          <Link href="/map" style={{ background: "rgba(13,17,32,0.6)", color: "#e8ecf5", fontWeight: 600, padding: "14px 30px", borderRadius: 12, textDecoration: "none", fontSize: 17, border: `1px solid ${BORDER}` }}>
            See the Map
          </Link>
        </div>
      </section>
    </main>
  );
}
