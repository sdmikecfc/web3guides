/**
 * DOMA GAMING — the studio home, served at domagaming.com (middleware rewrites
 * that apex's "/" to this route; every other path falls through, so
 * domagaming.com/bots is the robot game on its own domain).
 *
 * Engineering: server component only, no client JS, no data reads. It must
 * render if every database on earth is down, because it is the front door.
 *
 * Metadata note: the root layout's metadataBase points at web3guides.com, so
 * every URL here is absolute on purpose. It also declares its own openGraph
 * AND twitter images, because the root layout sets twitter.images site-wide
 * and a segment that overrides only openGraph still unfurls the wrong card on
 * X. That exact bug is documented in src/app/s7/twitter-image.tsx.
 *
 * Copy law: plain words, no idioms, no em-dashes, and never a money figure or
 * a promise of winnings on a player surface.
 */

import type { Metadata } from "next";
import s from "./studio.module.css";

export const runtime = "nodejs";
export const dynamic = "force-static";

const SITE = "https://domagaming.com";

/**
 * PROVISIONAL. "Battle Bots" is a live television trademark and this name is
 * being replaced. It is deliberately a single constant so the rename is one
 * line here, plus src/lib/bots/strings.ts `wordmark` and the copy-check
 * allowances in scripts/bots-copy-check.ts. Do not inline the string below.
 */
const ROBOT_GAME = "Battle Bots";

type Game = {
  name: string;
  line: string;
  art: string;
  alt: string;
  href?: string;
  cta?: string;
  status: "live" | "soon";
};

const GAMES: Game[] = [
  {
    name: ROBOT_GAME,
    line: "Build a robot out of parts you find in the junkyard, then watch it fight. Free to play, and anyone can watch.",
    art: "/studio-art/bots.webp",
    alt: "Two clay toy robots fighting in a lit ring while a crowd cheers",
    href: "/bots",
    cta: "Play now",
    status: "live",
  },
  {
    name: "Launch Wars",
    line: "A season long war for the map. Pick a class, level it up, and play four games that all feed one board.",
    art: "/studio-art/launchwars.webp",
    alt: "A painted fantasy war map with keeps and a front line",
    href: "https://launchwars.xyz/s7",
    cta: "Enter the season",
    status: "live",
  },
  {
    name: "Domain Kitchen",
    line: "Run a restaurant on Doma. Cook, serve, upgrade the place, and climb the board.",
    art: "/studio-art/kitchen.webp",
    alt: "A small chrome diner with a glowing sign and a chef on the roof",
    status: "soon",
  },
];

export const metadata: Metadata = {
  title: { absolute: "Doma Gaming" },
  description:
    "Games built on Doma. Build a robot and watch it fight, fight a season long war for the map, or run a restaurant.",
  alternates: { canonical: SITE },
  openGraph: {
    title: "Doma Gaming",
    description: "Games built on Doma.",
    url: SITE,
    siteName: "Doma Gaming",
    images: [{ url: `${SITE}/studio-art/bots.webp`, width: 1600, height: 700 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Doma Gaming",
    description: "Games built on Doma.",
    images: [`${SITE}/studio-art/bots.webp`],
  },
};

function Card({ game }: { game: Game }) {
  const live = game.status === "live";
  const inner = (
    <>
      <div className={`${s.art} ${live ? "" : s.artQuiet}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={game.art} alt={game.alt} width={1600} height={700} loading="lazy" />
        <div className={s.scrim} />
      </div>
      <span className={s.chip}>
        <span className={`${s.dot} ${live ? "" : s.dotSoon}`} />
        {live ? "Live now" : "Coming soon"}
      </span>
      <div className={s.body}>
        <h2 className={s.name}>{game.name}</h2>
        <p className={s.line}>{game.line}</p>
        {game.cta ? <span className={s.cta}>{game.cta}</span> : null}
      </div>
    </>
  );

  if (!game.href) {
    return <div className={`${s.card} ${s.cardQuiet}`}>{inner}</div>;
  }
  const external = game.href.startsWith("http");
  return (
    <a
      className={s.card}
      href={game.href}
      {...(external ? { rel: "noopener" } : {})}
      aria-label={`${game.name}. ${game.cta}.`}
    >
      {inner}
    </a>
  );
}

export default function StudioPage() {
  return (
    <main className={s.page}>
      <div className={s.wrap}>
        <div className={s.mastheadRow}>
          <h1 className={s.wordmark}>Doma Gaming</h1>
          <span className={s.byline}>Games built on Doma</span>
        </div>
        <p className={s.lede}>
          Small games you can play in a browser with nothing but a wallet. No download, no sign up,
          and you can watch any of them without joining.
        </p>

        <div className={s.rule} />

        <div className={s.cards}>
          {GAMES.map((g) => (
            <Card key={g.name} game={g} />
          ))}
        </div>

        <div className={s.foot}>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/disclaimer">Disclaimer</a>
          <span>The people who make these games pay the prizes. Nothing here is promised.</span>
        </div>
      </div>
    </main>
  );
}
