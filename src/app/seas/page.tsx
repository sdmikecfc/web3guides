import type { Metadata } from "next";
import localFont from "next/font/local";
import { Cinzel } from "next/font/google";
import SeaCanvas from "./SeaCanvas";
import NavCountdown from "./NavCountdown";
import "./seas.css";

/**
 * LAUNCH WARS · SEASON 2 · CONQUER THE SEAS — /seas
 * Served at seas.web3guides.com via the middleware host rewrite.
 * Season 2 teaser + primer surface. Fully static v1: the live map and
 * game surfaces arrive as season drops. Does not touch /launch-wars.
 *
 * NOTE: this page is reachable on the seas subdomain, so every internal
 * cross-link must be ABSOLUTE (a relative /launch-wars would rewrite to
 * /seas/launch-wars and 404).
 */

const aktiv = localFont({
  src: [
    { path: "./fonts/AktivGrotesk_Rg.ttf", weight: "400", style: "normal" },
    { path: "./fonts/AktivGrotesk_Md.ttf", weight: "500", style: "normal" },
    { path: "./fonts/AktivGrotesk_SBd.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-aktiv",
  display: "swap",
});
const aktivCd = localFont({
  src: [{ path: "./fonts/AktivGroteskCd_Md.ttf", weight: "500", style: "normal" }],
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
  title: { absolute: "Launch Wars · Season 2 · Conquer the Seas" },
  description:
    "Five fleets at war over one ocean of treasure. Launch Wars Season 2 runs June 16 to 29 on Doma. Pick your flag, fight with your crew, and win a share of real prizes. Free to start.",
  openGraph: {
    title: "Launch Wars · Season 2 · Conquer the Seas",
    description:
      "Five fleets at war over one ocean of treasure. June 16 to 29. Pick your flag, fight with your crew, and win a share of real prizes.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Launch Wars · Season 2 · Conquer the Seas",
    description:
      "Five fleets at war over one ocean of treasure. June 16 to 29. Free to start.",
  },
};

const DISCORD_URL = "https://discord.gg/doma";
const MAIN_SITE = "https://web3guides.com";

// Ordered by the raise each fleet still needs to bond (biggest gap first), so a
// crowd lands on the fleet that needs the most help. Ties broken by sail day.
// recertify.ai (failed to bond) and bottoken.com (now the standalone Pillage raid
// target) are not joinable, so they are not shown here.
const FLEETS = [
  { day: "Tue · Jun 16", domain: "realityapps.com", raise: "about $2.5k to bond", hint: "Big waters. This one needs an armada." },
  { day: "Thu · Jun 18", domain: "Warriors.xyz", raise: "about $500 to bond", hint: "Quick to bond. A raiding party can take it." },
  { day: "Sun · Jun 21", domain: "Rackets.xyz", raise: "about $125 to bond", hint: "Tiny gap. A few hands bond it fast." },
];

const DROPS = [
  { date: "Jun 16", what: "The season opens. Every game and a daily battle, every day." },
  { date: "Jun 17 to 21", what: "A new fleet sets sail almost every day. Five founder windows." },
  { date: "Jun 23", what: "The Kraken Armada arrives. Week 2 world bosses." },
  { date: "Jun 29", what: "The seas settle. Final standings frozen, prizes follow." },
];

export default function SeasPage() {
  return (
    <main className={`seas-root ${aktiv.variable} ${aktivCd.variable} ${cinzel.variable}`}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="hero">
        <SeaCanvas />
        <div className="hero-grade" />
        <div className="hero-vignette" />

        <nav className="nav">
          <a className="nav-brand" href="#">
            <span className="nav-wordmark">LAUNCH WARS</span>
            <span className="nav-chip">Season 2 · Conquer the Seas</span>
          </a>
          <div className="nav-right">
            <NavCountdown />
            <a className="nav-map-link" href="/seas/map">
              🗺️ The map
            </a>
            <a className="btn btn-nav" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
              Join the Discord
            </a>
          </div>
        </nav>

        <div className="hero-content">
          <div className="hero-copy">
            <p className="eyebrow">Season 2 · June 16 to 29</p>
            <h1 className="headline">Conquer the seas</h1>
            <p className="subline">
              Five fleets at war over one ocean of treasure. Pick your flag, fight with your crew,
              and win a share of real prizes.
            </p>
            <div className="hero-cta">
              <a className="btn btn-primary" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
                Join the Discord
              </a>
              <p className="cta-note">Play free for glory. Hold your fleet token to grow a real ship and win a cash share.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── The fleets ───────────────────────────────────────────────────── */}
      <section className="seas-section">
        <p className="section-eyebrow">The fleets</p>
        <h2 className="section-title">Five flags. One a day.</h2>
        <p className="section-sub">
          A new fleet sets sail almost every day of week one. Joining a fleet on its sail day opens
          the founder window: founders earn a 1.25x bonus on everything, all season. The fleets are
          listed by the raise each still needs, so the one at the top is where your crew counts most.
        </p>
        <div className="fleet-grid">
          {FLEETS.map((f, i) => (
            <div className="fleet-card" key={f.domain}>
              {i === 0 && (
                <span
                  style={{
                    alignSelf: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--gold, #f0b45c)",
                  }}
                >
                  ⚓ Needs the most help
                </span>
              )}
              <img
                className="fleet-crest"
                src={`/seas-art/crest-${f.domain.toLowerCase()}.png`}
                alt={`${f.domain} fleet crest`}
                width={80}
                height={80}
                loading="lazy"
              />
              <span className="fleet-day">{f.day}</span>
              <span className="fleet-domain">{f.domain}</span>
              <span className="fleet-hint" style={{ color: "var(--gold, #f0b45c)", fontWeight: 600 }}>
                {f.raise}
              </span>
              <span className="fleet-hint">{f.hint}</span>
            </div>
          ))}
        </div>
        <p className="fleet-note">
          Crowds split the loot. A small crew on the right ship earns more per sailor. Spread out.
        </p>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="seas-section">
        <p className="section-eyebrow">How it works</p>
        <h2 className="section-title">Hold earns Glory. Play and post earn more.</h2>
        <div className="how-grid">
          <div className="how-card">
            <div className="how-icon">⛵</div>
            <div className="how-name">Hold</div>
            <p className="how-text">
              Hold your fleet&rsquo;s token. Holding earns Glory every day, up to $100 held, and grows
              your ship: $5 Sloop up to $100 Flagship. A bigger ship means more HP in the Naval Battle.
            </p>
          </div>
          <div className="how-card">
            <div className="how-icon">💰</div>
            <div className="how-name">Doubloons</div>
            <p className="how-text">
              Play daily duties and the Naval Battle to earn doubloons. Spend them on cannons,
              sails and gear. Play buys fittings. Money cannot.
            </p>
          </div>
          <div className="how-card">
            <div className="how-icon">⭐</div>
            <div className="how-name">Glory</div>
            <p className="how-text">
              Playing and posting earn more Glory. Your Glory plus what you hold sets your share of the
              real prize pool. Cash never rides on a single game result.
            </p>
          </div>
          <div className="how-card">
            <div className="how-icon">📣</div>
            <div className="how-name">Posts</div>
            <p className="how-text">
              Post about your fleet on X and drop the link in #content-share. The bot credits it and
              DMs you Glory, and a post that pops keeps earning for a day. Make content, grow your share.
            </p>
          </div>
        </div>
      </section>

      {/* ── Prizes ───────────────────────────────────────────────────────── */}
      <section className="seas-section">
        <div className="prize-band">
          <p className="prize-headline">$1,000 in week one. $1,000 more in week two.</p>
          <p className="prize-text">
            The top three fleets split the cash. Play daily and hold from start to finish and your
            share of the pot grows. A smaller crew that places can out-earn a crowded one.
          </p>
          <p className="prize-text">
            Free captains play for glory and bragging rights. To share the cash pot, link a wallet
            and put in at least $5. Your call, your wallet.
          </p>
        </div>
      </section>

      {/* ── The log ──────────────────────────────────────────────────────── */}
      <section className="seas-section">
        <p className="section-eyebrow">The log</p>
        <h2 className="section-title">What drops when</h2>
        <div className="log-row">
          {DROPS.map((d) => (
            <div className="log-chip" key={d.date}>
              <span className="log-date">{d.date}</span>
              <span className="log-what">{d.what}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Get started ──────────────────────────────────────────────────── */}
      <section className="seas-section">
        <p className="section-eyebrow">Get started</p>
        <h2 className="section-title">Three commands in Discord</h2>
        <p className="section-sub">
          Once you are in the Discord, type these in the games channel. Play free for glory. Hold at
          least $5 of your fleet token to grow a real ship and win a cash share.
        </p>
        <div className="how-grid">
          <div className="how-card">
            <div className="how-name"><code>!seas quest</code></div>
            <p className="how-text">Your 3-step first voyage. Earns 75 doubloons.</p>
          </div>
          <div className="how-card">
            <div className="how-name"><code>!seas play</code></div>
            <p className="how-text">Your daily games, sent to your DMs.</p>
          </div>
          <div className="how-card">
            <div className="how-name"><code>!seas fleets</code></div>
            <p className="how-text">Pick a flag to fly. The top one needs you most.</p>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="cta-band">
        <h2 className="cta-title">Five flags. One ocean. June 16.</h2>
        <a className="btn btn-primary" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
          Join the Discord
        </a>
        <p className="cta-note">
          Play free for glory. Hold your fleet token to win cash. By playing you agree to the{" "}
          <a href="/seas/rules" style={{ color: "inherit", textDecoration: "underline" }}>
            Official Rules
          </a>
          .
        </p>
      </section>

      {/* ── Season 1 + footer ───────────────────────────────────────────── */}
      <div className="s1-strip">
        <span>
          Season 1 is settling now. One payday covers Season 1 and the World Bosses about a week
          after the boss event ends.
        </span>
        <a href={`${MAIN_SITE}/launch-wars`}>See Season 1 →</a>
      </div>
      <footer className="seas-footer">
        <span>Launch Wars runs on Doma. Powered by the community.</span>
        <span>
          <a href={MAIN_SITE}>web3guides.com</a>
          {"  ·  "}
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
            Discord
          </a>
          {"  ·  "}
          <a href="/seas/rules">Official Rules</a>
        </span>
      </footer>
    </main>
  );
}
