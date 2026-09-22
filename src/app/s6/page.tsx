/**
 * SEASON 6 FRONT DOOR (/s6): THE FRONT battlefield (ADR-0121). Server shell:
 * pulls the season snapshot + top-40 pilots, degrades to DEMO data when the
 * 041 migration has not run or no targets are seeded (empty flag), so the
 * page always renders a full battle for flavor tests and pre-season previews.
 */
import { getSeasonSnapshotStrict, paidPeakPct, targetWeightUsd } from "@/lib/s6/data";
import { POOL_FULL_USD } from "@/lib/s6/games";
import { getMapBases } from "@/lib/s6/roster";
import { STRINGS } from "@/lib/s6/strings";
import { poolLine } from "@/lib/s6/data";
import Battlefield, { type LiteTarget } from "./front/Battlefield";
import { OnboardStrip } from "./_components/OnboardStrip";
import { TodayStrip } from "./_components/TodayStrip";
import { SlateTable, type SlateRow } from "./_components/SlateTable";
import type { NamedSpawn } from "./front/sim";

export const revalidate = 60;

export const metadata = {
  title: "The Front | Launch Wars S6: Uprising",
  description:
    "The live war for THE GRID: the front advances as mainframes are liberated from The Warden. Hold a featured domain from $5 and push the line.",
};

// Slices sit inside the [SLICE_MIN_USD, SLICE_MAX_USD] band and securedUsd is
// always slice x peakPct, so the demo battle obeys the same arithmetic the live
// snapshot does: a fort card in demo can never show a pair that settlement
// would not produce.
const DEMO_TARGETS: LiteTarget[] = [
  { domain: "forge.core", name: "Forge Core", status: "bonded", peakPct: 100, sliceUsd: 85, securedUsd: 85, raiseUsd: 500 },
  { domain: "haven.net", name: "Haven Net", status: "bonded", peakPct: 100, sliceUsd: 85, securedUsd: 85, raiseUsd: 500 },
  { domain: "relay.grid", name: "Relay Grid", status: "live", peakPct: 62, sliceUsd: 105, securedUsd: 65.1, raiseUsd: 700 },
  { domain: "vault.zero", name: "Vault Zero", status: "pending", peakPct: 0, sliceUsd: 75, securedUsd: 0, raiseUsd: 300 },
  { domain: "hexline.ai", name: "Hexline", status: "pending", peakPct: 0, sliceUsd: 75, securedUsd: 0, raiseUsd: 400 },
  { domain: "warden.node", name: "Warden Node", status: "pending", peakPct: 0, sliceUsd: 120, securedUsd: 0, raiseUsd: 800 },
  { domain: "signal.zone", name: "Signal Zone", status: "pending", peakPct: 0, sliceUsd: 75, securedUsd: 0, raiseUsd: 250 },
  { domain: "uplink.city", name: "Uplink City", status: "pending", peakPct: 0, sliceUsd: 75, securedUsd: 0, raiseUsd: 350 },
  { domain: "chrome.land", name: "Chrome Land", status: "pending", peakPct: 0, sliceUsd: 90, securedUsd: 0, raiseUsd: 600 },
  { domain: "core.systems", name: "The Core", status: "pending", peakPct: 0, sliceUsd: 150, securedUsd: 0, raiseUsd: 1600 },
];

const DEMO_NAMED: NamedSpawn[] = [
  { name: "Big Mike", tankKey: "paladin" },
  { name: "Sam", tankKey: "atlas" },
  { name: "Patch", tankKey: "badger" },
  { name: "Volt", tankKey: "lancer" },
  { name: "Ember", tankKey: "viper" },
  { name: "Redline", tankKey: "hornet" },
  { name: "Anchor", tankKey: "bulwark" },
  { name: "Havoc", tankKey: "brawler" },
  { name: "Juno", tankKey: "spectre" },
  { name: "Piston", tankKey: "ram" },
  { name: "Gears", tankKey: "anvil" },
  { name: "Nova", tankKey: "champion" },
];

export default async function S6FrontPage() {
  let targets: LiteTarget[] = DEMO_TARGETS;
  let named: NamedSpawn[] = DEMO_NAMED;
  // derived, not typed: every money figure on the season traces to one constant
  let poolLineText = `$${POOL_FULL_USD.toLocaleString("en-US")} season pool · a slice for every mainframe, paid out by the percent it reaches`;
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
      demo = false;
      endAt = snap.season.endAt;
      try {
        const bases = await getMapBases();
        if (bases.length > 0) {
          named = bases.map((b) => ({ name: b.name, tankKey: b.tankKey, camo: undefined }));
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
    demo = false;
  }

  const liberated = targets.filter((t) => t.status === "bonded").length;
  // today's free game rotates with the map's PLAY marker (same UTC-day index).
  // Computed ONCE here; the hero CTA, the sticky bar and the onboarding strip
  // all receive this href so the day-index formula has a single source.
  const GAME_KEYS = ["ironjaw", "strain", "stopclock", "riot"];
  const GAME_NAMES: Record<string, string> = {
    ironjaw: "Iron Jaw",
    strain: "Strain",
    stopclock: "Stopclock",
    riot: "Riot",
  };
  const todayKey = GAME_KEYS[Math.floor(Date.now() / 86400000) % GAME_KEYS.length];
  // CRO 2026-08-17: the CTA enters the REAL daily run, not ?practice=1. Guest
  // scores bank there and the enlist panel shows; practice was a conversion
  // dead end and made the onboarding strip's banking promise false.
  const playHref = `/s6/games/${todayKey}`;
  const playGameName = GAME_NAMES[todayKey];
  return (
    <main className="s6-home">
      {/* THE BACKDROP (second pass 2026-08-17, Mike: "The background is black
          and boring"). The war board's house pattern reused: a fixed pilot
          plate under a heavy left-biased scrim, plus the house radial glow so
          the black lifts everywhere. Havoc holds the homepage (Vega already
          holds the board). It sits at z-index 0 UNDER the content column; the
          battlefield canvas keeps its own opaque ground, so the plate only
          ever dresses the chrome above and the sections below, never the map. */}
      <div aria-hidden className="s6-home-backdrop" />
      <div className="s6-home-content">
        <Battlefield
          targets={targets}
          named={named}
          liberated={liberated}
          total={targets.length}
          poolLineText={poolLineText}
          demo={demo}
          playHref={playHref}
          playGameName={playGameName}
        />
        {/* the glowing seam between the war (map + feed) and the funnel */}
        <div className="s6-home-divider" aria-hidden />
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
.s6-home{position:relative;min-height:100dvh;background:radial-gradient(1000px 500px at 50% -10%, #171c22 0%, #0b0d10 60%);}
.s6-home-backdrop{position:fixed;inset:0;z-index:0;pointer-events:none;
  background-image:
    linear-gradient(100deg, rgba(8,10,13,.97) 0%, rgba(8,10,13,.94) 42%, rgba(8,10,13,.68) 72%, rgba(8,10,13,.84) 100%),
    url(/s6-art/pilot/havoc.png);
  background-size:cover, auto 78%;
  background-position:center, right -40px bottom;
  background-repeat:no-repeat, no-repeat;}
/* faint console scanlines so the flats are never a dead void; alpha kept
   below noticeable (EPL meets Bloomberg, not a CRT cosplay) */
.s6-home-backdrop::after{content:"";position:absolute;inset:0;
  background-image:repeating-linear-gradient(0deg, rgba(255,255,255,.015) 0 1px, transparent 1px 3px);}
/* the board's mobile law: under 900px the column is the whole screen, so the
   pilot fades to a suggestion instead of standing under the words */
@media (max-width:900px){.s6-home-backdrop{opacity:.26;background-position:center, right -170px bottom;}}
.s6-home-content{position:relative;z-index:1;}
.s6-home-divider{height:1px;max-width:1120px;margin:30px auto 0;
  background:linear-gradient(90deg, transparent, rgba(240,179,64,.5) 18%, rgba(240,179,64,.5) 82%, transparent);
  box-shadow:0 0 14px rgba(224,102,46,.35);}
`;
