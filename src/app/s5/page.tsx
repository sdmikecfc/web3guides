/**
 * THE WORLD MAP (/s5) — server shell.
 *
 * THIS IS THE FRONT DOOR. The art landed, so the swap happened as planned:
 * this body moved here from /s5/world, and the old season landing is preserved
 * at /s5/landing. /s5/world now redirects here so no existing link breaks.
 *
 * ISR DISCIPLINE, and the trap it avoids: this page does NOT call getLocale().
 * getLocale() reads cookies, which silently opts a route into dynamic
 * rendering — that is why /s5/map is dynamically rendered today despite
 * carrying `revalidate = 60`. This route is destined to be the season's
 * highest-traffic page, so it follows the /s5 landing pattern instead: English
 * renders here, and WorldMap applies the cookie locale on mount.
 *
 * All money and every peak percent is computed HERE, off the lib/s5/data seams
 * (paidPeakPct, poolShare, securedUsd), and handed down as plain JSON. The
 * client only draws.
 */
import { getSeasonSnapshot, paidPeakPct, poolLine, type Snapshot } from "@/lib/s5/data";
import { DEFAULT_THEME } from "@/lib/s5/theme";
import { FRESH_WINDOW_DAYS } from "@/lib/s5/games";
// From the directive-free engine module, NOT from WorldCanvas: a "use client"
// module's function exports are not callable on the server. See its docstring.
import { dayPhaseFor } from "@/lib/world/types";
import { WorldMap, type WorldTarget } from "./world/WorldMap";

export const revalidate = 60;

const SHARE_TITLE = `${DEFAULT_THEME.seasonName} · the front`;
const SHARE_DESC =
  "A free tank game played on real internet domains. Hold one from $5, play the arcade, and share the season's $1,000.";

export const metadata = {
  title: `The World Map · ${DEFAULT_THEME.seasonName}`,
  description:
    "The whole front on one board: your camp, every stronghold under siege, the field exercises, and the war board.",
  // Same reason as the board's: without these, the most-pasted link in the game
  // carries the site-wide crypto-education headline.
  openGraph: { title: SHARE_TITLE, description: SHARE_DESC, type: "website" as const },
  twitter: { card: "summary_large_image" as const, title: SHARE_TITLE, description: SHARE_DESC },
};

const FRESH_WINDOW_MS = FRESH_WINDOW_DAYS * 86400000;

/** Flatten the snapshot into the client's plain-JSON shape. Mirrors toNodes()
 * in ../map/page.tsx; when that is extracted to lib/s5/nodes.ts both pages
 * will share one function. */
function toTargets(snap: Snapshot): WorldTarget[] {
  const sprintDomains = snap.sprint.domains.map((x) => x.toLowerCase());
  return snap.targets.map((t) => {
    const launchMs = t.launchAt ? Date.parse(t.launchAt) : NaN;
    return {
      domain: t.domain,
      name: t.name,
      status: t.status,
      progress: t.progress,
      peakPct: paidPeakPct(t),
      securedUsd: t.securedUsd,
      poolShare: t.poolShare,
      bondingFdv: t.bondingFdv,
      initialFdv: t.initialFdv,
      bountyUsd: t.bountyUsd,
      launchAt: t.launchAt,
      launched: t.launched,
      bondedAt: t.bondedAt,
      // FRESHNESS NEEDS A TOKEN TO BE TRUE OF. `launched` only means the
      // listing TIME has passed; a wall can be past its hour with no token
      // deployed yet, and hotcommerce was in exactly that state on launch day.
      // Without this clause the card said "newly listed, pays double Medals per
      // dollar" directly above "there is nothing to buy until it lists". No
      // real bonus is ever hidden by this: freshness pays on dollars held, and
      // there is nowhere to put a dollar until the token exists.
      fresh:
        t.status === "live" &&
        t.launched &&
        !!t.tokenAddress &&
        Number.isFinite(launchMs) &&
        snap.nowMs - launchMs < FRESH_WINDOW_MS,
      sprint: sprintDomains.includes(t.domain),
    };
  });
}

export default async function S5WorldPage() {
  const snap = await getSeasonSnapshot();
  const line = snap.empty
    ? `${DEFAULT_THEME.seasonName} is being prepared. The front opens soon.`
    : poolLine(snap);

  return (
    <WorldMap
      targets={toTargets(snap)}
      poolLineText={line}
      pool={snap.pool}
      serverNowMs={snap.nowMs}
      theme={snap.theme}
      empty={snap.empty}
      // The war board, read off the SAME snapshot the forts come from. No new
      // endpoint and no client fetch: the card opens already populated.
      standings={snap.topCommanders.slice(0, 12).map((c) => ({
        rank: c.rank, name: c.name, points: c.points, handle: c.handle,
      }))}
      gameBoards={snap.gameBoards.map((g) => ({
        key: g.key, name: g.name,
        rows: g.rows.slice(0, 5).map((r) => ({ rank: r.rank, name: r.name, score: r.score })),
      }))}
      totalPlayers={snap.totals.players}
      // THE PEOPLE, not just the war. Both prior seasons put every player on
      // the board and it was locked twice in S4 ("the standings don't show the
      // individuals like S3, people love this"). The world map shipped without
      // them; this puts them back.
      commanders={snap.topCommanders.map((c) => ({
        rank: c.rank, name: c.name, handle: c.handle,
        tankKey: c.tankKey, camo: c.camo, commanderKey: c.commanderKey, domain: c.domain,
      }))}
      // Computed here, never on the client: Date.now() at render would break
      // hydration AND give every commander a different sky.
      phase={dayPhaseFor(snap.nowMs)}
    />
  );
}
