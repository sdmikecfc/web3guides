/**
 * THE MUSTER (/s5/explore) — go and look at everyone else's rig.
 *
 * Server shell. Reads the roster (its own 60s cache, deliberately NOT folded
 * into the season snapshot every page awaits) plus the snapshot's target list,
 * which is only needed to map a domain to its listing index so a camp can be
 * planted at the right stronghold.
 *
 * Every row that crosses to the client is public-safe by construction: no
 * wallet, no dollar figure. See the header of lib/s5/roster.ts.
 *
 * ISR 60, no cookie read, no force-dynamic.
 */
import { getSeasonSnapshot } from "@/lib/s5/data";
import { getMapBases } from "@/lib/s5/roster";
import { DEFAULT_THEME } from "@/lib/s5/theme";
import { ExploreMap } from "./ExploreMap";

export const revalidate = 60;

export const metadata = {
  title: `The Muster · ${DEFAULT_THEME.seasonName}`,
  description:
    "Every commander on the front: where they camp, what they drive, and how their machine is tuned.",
};

export default async function S5ExplorePage() {
  const [snap, bases] = await Promise.all([getSeasonSnapshot(), getMapBases()]);

  // domain -> listing index, so ExploreMap can resolve a camp's stronghold slot
  // without importing the server-only snapshot type.
  const domainIndex: Record<string, number> = {};
  snap.targets.forEach((t, i) => {
    domainIndex[t.domain.toLowerCase()] = i;
  });

  return (
    <ExploreMap
      bases={bases}
      domainIndex={domainIndex}
      totalCommanders={snap.topCommanders.length > bases.length ? snap.topCommanders.length : bases.length}
    />
  );
}
