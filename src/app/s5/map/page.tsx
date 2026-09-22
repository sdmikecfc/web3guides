/**
 * Season 5 MAP (/s5/map): THE SIEGE MAP. The scaffold table is retired; this
 * server page reads the SAME season snapshot (60s unstable_cache in
 * lib/s5/data, so revalidate 60 keeps the route cached and prefetchable,
 * NEVER force-dynamic, the S4 guide rule) and hands fully-computed node data
 * to the client SiegeMap renderer: the code-drawn battlefield, the 11
 * stronghold nodes on the advance line, the war-chest strip, the sprint
 * banner, and the per-node dossier card (which still carries the existing
 * WAR EFFORT declare control, so nothing the scaffold shipped regresses).
 *
 * Every dollar and every peak percent is computed HERE (lib/s5/data seams:
 * poolShare/securedUsd/paidPeakPct) and passed down as plain JSON; the client
 * only draws. Copy comes from the s5 dict (cookie locale, en byte-for-byte
 * default); en status words stay THEME words so operator overrides work.
 *
 * ?preview=1 is DEV-ONLY (the S4 map ?demo pattern): only touch searchParams
 * off-production, because awaiting it opts the route into dynamic rendering,
 * which would defeat the ISR cache. In production the param is never read and
 * the TEST-ONLY sample data in ./preview can never render.
 */
import { getSeasonSnapshot, paidPeakPct, poolLine, type Snapshot } from "@/lib/s5/data";
import { DEFAULT_THEME } from "@/lib/s5/theme";
import { dict, getLocale } from "@/lib/s5/i18n";
import { FRESH_WINDOW_DAYS } from "@/lib/s5/games";
import { WAR_EFFORT, warEffortTotals, windowOpen, type WarEffortTotal } from "@/lib/s5/warEffort";
import { SiegeMap, type SiegeNode } from "./SiegeMap";
import { previewSnapshot, previewWarEffort } from "./preview";

export const revalidate = 60;

export const metadata = {
  title: `The Siege Map · ${DEFAULT_THEME.seasonName}`,
  description:
    "The battlefield: every stronghold on the front in listing order, siege progress, peaks secured, and what each breach pays.",
};

const FRESH_WINDOW_MS = FRESH_WINDOW_DAYS * 86400000;

/** Flatten the snapshot + war-effort aggregates into plain client-safe nodes.
 * All money/peak numbers come straight off the lib/s5/data seams. */
function toNodes(snap: Snapshot, we: Map<string, WarEffortTotal>): SiegeNode[] {
  const sprintDomains = snap.sprint.domains.map((x) => x.toLowerCase());
  return snap.targets.map((t) => {
    const launchMs = t.launchAt ? Date.parse(t.launchAt) : NaN;
    const agg = we.get(t.domain);
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
      // Same clause as the world map's toTargets: `launched` is only a clock,
      // and a wall past its hour with no token deployed has nothing to buy, so
      // calling it "newly listed" contradicts its own buy panel.
      fresh:
        t.status === "live" &&
        t.launched &&
        !!t.tokenAddress &&
        Number.isFinite(launchMs) &&
        snap.nowMs - launchMs < FRESH_WINDOW_MS,
      sprint: sprintDomains.includes(t.domain),
      weOpen: windowOpen(t, sprintDomains),
      weCommitted: agg?.committed || 0,
      weCommanders: agg?.commanders || 0,
    };
  });
}

export default async function S5MapPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const locale = getLocale();
  const d = dict(locale);
  const localized = locale !== "en";

  // DEV-ONLY preview (see the header comment): the TEST-ONLY sample front.
  if (process.env.NODE_ENV !== "production") {
    const preview = (await searchParams)?.preview;
    if (preview) {
      const snap = previewSnapshot();
      return (
        <SiegeMap
          nodes={toNodes(snap, previewWarEffort())}
          empty={snap.empty}
          pool={snap.pool}
          poolLineText={poolLine(snap, d)}
          sprint={{ active: snap.sprint.active, domains: snap.sprint.domains }}
          serverNowMs={snap.nowMs}
          theme={snap.theme}
          d={d}
          localized={localized}
          preview
          weMin={WAR_EFFORT.MIN_SHELLS}
          weMax={WAR_EFFORT.MAX_SHELLS}
          weMult={WAR_EFFORT.MULT}
          commanders={snap.topCommanders}
        />
      );
    }
  }

  const snap = await getSeasonSnapshot();
  const we = await warEffortTotals();
  return (
    <SiegeMap
      nodes={toNodes(snap, we)}
      empty={snap.empty}
      pool={snap.pool}
      poolLineText={poolLine(snap, d)}
      sprint={{ active: snap.sprint.active, domains: snap.sprint.domains }}
      serverNowMs={snap.nowMs}
      theme={snap.theme}
      d={d}
      localized={localized}
      weMin={WAR_EFFORT.MIN_SHELLS}
      weMax={WAR_EFFORT.MAX_SHELLS}
      weMult={WAR_EFFORT.MULT}
      commanders={snap.topCommanders}
    />
  );
}
