/**
 * SEASON 7 FRONT DOOR (/s7): THE FRONT battlefield (ADR-0121). Server shell:
 * pulls the season snapshot + top-40 adventurers, degrades to DEMO data when the
 * 041 migration has not run or no targets are seeded (empty flag), so the
 * page always renders a full battle for flavor tests and pre-season previews.
 */
import { getSeasonSnapshotStrict, paidPeakPct, targetWeightUsd } from "@/lib/s7/data";
import { GAMES, POOL_FULL_USD } from "@/lib/s7/games";
import { getMapBases } from "@/lib/s7/roster";
import { STRINGS } from "@/lib/s7/strings";
import { poolLine } from "@/lib/s7/data";
import Battlefield, { type LiteTarget, type BoardRow } from "./front/Battlefield";
import { OnboardStrip } from "./_components/OnboardStrip";
import { TodayStrip } from "./_components/TodayStrip";
import { SlateTable, type SlateRow } from "./_components/SlateTable";
import type { NamedSpawn } from "./front/sim";

export const revalidate = 60;

export const metadata = {
  title: "The Front | Launch Wars S7: Realmfall",
  description:
    "The live war for the realm: the front advances as keeps are reclaimed from The Lich. Hold a featured domain from $5 and push the line.",
};

// Slices sit inside the [SLICE_MIN_USD, SLICE_MAX_USD] band and securedUsd is
// always slice x peakPct, so the demo battle obeys the same arithmetic the live
// snapshot does: a fort card in demo can never show a pair that settlement
// would not produce.
const DEMO_TARGETS: LiteTarget[] = [
  { domain: "forge.keep", name: "The Forge", status: "bonded", peakPct: 100, sliceUsd: 85, securedUsd: 85, raiseUsd: 500 },
  { domain: "haven.realm", name: "Haven", status: "bonded", peakPct: 100, sliceUsd: 85, securedUsd: 85, raiseUsd: 500 },
  { domain: "raven.watch", name: "Ravenwatch", status: "live", peakPct: 62, sliceUsd: 105, securedUsd: 65.1, raiseUsd: 700 },
  { domain: "vault.crypt", name: "The Vault", status: "pending", peakPct: 0, sliceUsd: 75, securedUsd: 0, raiseUsd: 300 },
  { domain: "hexline.ai", name: "Hexline", status: "pending", peakPct: 0, sliceUsd: 75, securedUsd: 0, raiseUsd: 400 },
  { domain: "lich.throne", name: "The Lich Throne", status: "pending", peakPct: 0, sliceUsd: 120, securedUsd: 0, raiseUsd: 800 },
  { domain: "valor.fields", name: "Valor Fields", status: "pending", peakPct: 0, sliceUsd: 75, securedUsd: 0, raiseUsd: 250 },
  { domain: "ember.vale", name: "Embervale", status: "pending", peakPct: 0, sliceUsd: 75, securedUsd: 0, raiseUsd: 350 },
  { domain: "stone.march", name: "Stonemarch", status: "pending", peakPct: 0, sliceUsd: 90, securedUsd: 0, raiseUsd: 600 },
  { domain: "realm.crown", name: "The Crown", status: "pending", peakPct: 0, sliceUsd: 150, securedUsd: 0, raiseUsd: 1600 },
];

// Demo NAMES render as labels on the battlefield, so they wear the season:
// machine callsigns (Volt, Redline, Piston) read as last season's fiction.
// The tankKey values stay - they are the sim's hull pool keys, and the scene
// maps them to guild units by battlefield role.
// cls = chosen class: those rows fight as their class figure on the map.
// Four rows deliberately carry NO cls (Bram/Sable/Corvin/Nova) so the demo
// also proves the fallback path: no class picked = guild hull art, as before.
const DEMO_NAMED: NamedSpawn[] = [
  { name: "Big Mike", tankKey: "paladin", cls: "barbarian" },
  { name: "Sam", tankKey: "atlas", cls: "monk" },
  { name: "Wren", tankKey: "badger", cls: "wizard" },
  { name: "Aldric", tankKey: "lancer", cls: "cleric" },
  { name: "Ember", tankKey: "viper", cls: "ranger" },
  { name: "Rowan", tankKey: "hornet", cls: "wizard" },
  { name: "Thane", tankKey: "bulwark", cls: "barbarian" },
  { name: "Bram", tankKey: "brawler" },
  { name: "Juno", tankKey: "spectre", cls: "bard" },
  { name: "Sable", tankKey: "ram" },
  { name: "Corvin", tankKey: "anvil" },
  { name: "Nova", tankKey: "champion" },
];

// TOP ADVENTURERS demo rows (same law as DEMO_TARGETS: pre-season flavor only,
// wiped on a read failure). Names wear the season; Valor descends; classes mix
// so the accent dots read as a party, not a uniform.
const DEMO_BOARD: BoardRow[] = [
  { rank: 1, name: "Big Mike", points: 4200, cls: "barbarian" },
  { rank: 2, name: "Wren", points: 3100, cls: "wizard" },
  { rank: 3, name: "Aldric", points: 2650, cls: "cleric" },
  { rank: 4, name: "Ember", points: 1900, cls: "ranger" },
  { rank: 5, name: "Juno", points: 1200, cls: "bard" },
];

export default async function S7FrontPage() {
  let targets: LiteTarget[] = DEMO_TARGETS;
  let named: NamedSpawn[] = DEMO_NAMED;
  // the front's compact TOP ADVENTURERS widget: top 5 by Valor, minified to
  // the public fields only (rank/name/points/class - never wallet, never USD)
  let board: BoardRow[] = DEMO_BOARD;
  // derived, not typed: every money figure on the season traces to one constant
  let poolLineText = `$${POOL_FULL_USD.toLocaleString("en-US")} season pool · a slice for every keep, split by difficulty, paid out by the percent it reaches`;
  let demo = true;
  // Season window endAt (TodayStrip settlement countdown); null = pre-arming, hidden.
  let endAt: string | null = null;
  // THE SLATE (community request 2026-08-19): the plain schedule table. Built
  // from the SAME snapshot the map draws, so the two can never disagree.
  let slate: SlateRow[] = [];

  // A read failure must never be dressed up as a season. getSeasonSnapshot
  // now THROWS when the targets read fails (rather than returning an empty
  // season), so a transient blip can be retried instead of being cached as
  // demo data in two layers at once.
  let readFailed = false;
  const snapWithRetry = async () => {
    try {
      return await getSeasonSnapshotStrict();
    } catch {
      await new Promise((r) => setTimeout(r, 250));
      return await getSeasonSnapshotStrict(); // one retry; a second throw is real
    }
  };

  try {
    const snap = await snapWithRetry();
    if (!snap.empty && snap.targets.length > 0) {
      targets = snap.targets.map((t) => ({
        domain: t.domain,
        name: t.name,
        status: t.status,
        peakPct: paidPeakPct(t),
        securedUsd: t.securedUsd,
        // the SLICE, so the fort card can show worth and earned as a pair
        sliceUsd: t.poolShare,
        raiseUsd: targetWeightUsd(t),
      }));
      slate = snap.targets.map((t) => ({
        domain: t.domain,
        name: t.name,
        status: t.status,
        peakPct: paidPeakPct(t),
        progressPct: Math.round((Number(t.progress) || 0) * 100),
        sliceUsd: Number(t.poolShare) || 0,
        launchAt: t.launchAt,
      }));
      poolLineText = poolLine(snap, STRINGS.en);
      board = snap.topAdventurers
        .slice(0, 5)
        .map((a) => ({ rank: a.rank, name: a.name, points: a.points, cls: a.cls }));
      demo = false;
      endAt = snap.season.endAt;
      try {
        const bases = await getMapBases();
        if (bases.length > 0) {
          named = bases.map((b) => ({ name: b.name, tankKey: b.tankKey, camo: undefined, cls: b.cls }));
        }
      } catch {
        named = [];
      }
    }
  } catch {
    // Both attempts failed. Show the honest "being prepared" front, never a
    // fabricated slate: players seeing invented domain names on the live site
    // is strictly worse than briefly seeing nothing (Mike, 2026-08-20).
    readFailed = true;
  }

  // DEMO IS FOR PRE-SEASON ONLY. If the read failed, drop the sample slate so
  // nothing fake reaches a player, and let the surfaces render their empty
  // state. Next will re-render on the next request rather than serving this.
  if (readFailed) {
    targets = [];
    named = [];
    slate = [];
    board = []; // empty board = the widget renders nothing at all
    demo = false;
  }

  const reclaimed = targets.filter((t) => t.status === "bonded").length;
  // today's free game rotates with the map's PLAY marker (same UTC-day index).
  // Computed ONCE here; the hero CTA, the sticky bar and the onboarding strip
  // all receive this href so the day-index formula has a single source.
  // Derived from the registry, never hand-listed: the old literal pair here
  // omitted ascent, so The Spire could never come up as today's game.
  const liveGames = GAMES.filter((g) => !g.comingSoon);
  const GAME_KEYS = liveGames.map((g) => g.key);
  const GAME_NAMES: Record<string, string> = Object.fromEntries(
    liveGames.map((g) => [g.key, g.name]),
  );
  const todayKey = GAME_KEYS[Math.floor(Date.now() / 86400000) % GAME_KEYS.length];
  // CRO 2026-08-17: the CTA enters the REAL daily run, not ?practice=1. Guest
  // scores bank there and the enlist panel shows; practice was a conversion
  // dead end and made the onboarding strip's banking promise false.
  const playHref = `/s7/games/${todayKey}`;
  const playGameName = GAME_NAMES[todayKey];
  return (
    <main className="s7-home">
      {/* THE BACKDROP (second pass 2026-08-17, Mike: "The background is black
          and boring"). The war board's house pattern reused: a fixed adventurer
          plate under a heavy left-biased scrim, plus the house radial glow so
          the black lifts everywhere. Havoc holds the homepage (Vega already
          holds the board). It sits at z-index 0 UNDER the content column; the
          battlefield canvas keeps its own opaque ground, so the plate only
          ever dresses the chrome above and the sections below, never the map. */}
      <div aria-hidden className="s7-home-backdrop" />
      <div className="s7-home-content">
        <Battlefield
          targets={targets}
          named={named}
          board={board}
          reclaimed={reclaimed}
          total={targets.length}
          poolLineText={poolLineText}
          demo={demo}
          playHref={playHref}
          playGameName={playGameName}
        />
        {/* the glowing seam between the war (map + feed) and the funnel */}
        <div className="s7-home-divider" aria-hidden />
        <TodayStrip gameKey={todayKey} gameName={playGameName} playHref={playHref} endAt={endAt} />
        {slate.length > 0 ? <SlateTable rows={slate} /> : null}
        <OnboardStrip playHref={playHref} targets={targets} demo={demo} />
      </div>
      <style dangerouslySetInnerHTML={{ __html: HOME_CSS }} />
    </main>
  );
}

/**
 * Page dressing only (the sections carry their own component CSS). One rhythm:
 * 1120px content column (PageShell wide), 30px between major sections, cards
 * pad 18px. The scrim follows board/page.tsx's proven values, one notch
 * heavier because body text (not a leaderboard table) sits over this one.
 */
const HOME_CSS = `
.s7-home{position:relative;min-height:100dvh;background:radial-gradient(1000px 500px at 50% -10%, #171c22 0%, #0b0d10 60%);}
.s7-home-backdrop{position:fixed;inset:0;z-index:0;pointer-events:none;
  background-image:
    linear-gradient(100deg, rgba(8,10,13,.97) 0%, rgba(8,10,13,.94) 42%, rgba(8,10,13,.68) 72%, rgba(8,10,13,.84) 100%),
    url("/s7-art/pilot/havoc.png");
  background-size:cover, auto 78%;
  background-position:center, right -40px bottom;
  background-repeat:no-repeat, no-repeat;}
/* faint console scanlines so the flats are never a dead void; alpha kept
   below noticeable (EPL meets Bloomberg, not a CRT cosplay) */
.s7-home-backdrop::after{content:"";position:absolute;inset:0;
  background-image:repeating-linear-gradient(0deg, rgba(255,255,255,.015) 0 1px, transparent 1px 3px);}
/* the board's mobile law: under 900px the column is the whole screen, so the
   adventurer fades to a suggestion instead of standing under the words */
@media (max-width:900px){.s7-home-backdrop{opacity:.26;background-position:center, right -170px bottom;}}
.s7-home-content{position:relative;z-index:1;}
.s7-home-divider{height:1px;max-width:1120px;margin:30px auto 0;
  background:linear-gradient(90deg, transparent, rgba(240,179,64,.5) 18%, rgba(240,179,64,.5) 82%, transparent);
  box-shadow:0 0 14px rgba(224,102,46,.35);}
`;
