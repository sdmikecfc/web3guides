/**
 * STARFALL sector map — stars.web3guides.com/map.
 * Server component: reads the live snapshot (service-role) and renders the
 * painted sector. force-dynamic so a star flipping pending -> live -> bonded,
 * or a new pilot joining a crew, shows on the next load. Falls back to an
 * all-standby snapshot if the read is unavailable, so the map never blanks.
 */
import { getSectorSnapshot, type Sector } from "@/lib/stars/map";
import { STARS } from "@/lib/stars/stars";
import { SectorMap } from "./SectorMap";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sector Map — Starfall",
  description: "Five stars, three crews, one singularity. Watch the sector light up.",
};

const FALLBACK: Sector = {
  stars: STARS.map((s) => ({
    domain: s.domain,
    name: s.name,
    size: s.size,
    pos: s.pos,
    card: s.card,
    tag: s.tag,
    relist: s.relist,
    status: "pending",
    progress: 0,
    launchAt: s.launchAt,
    launched: false,
  })),
  crews: [
    { key: "vanguard", name: "Vanguard", accent: "#f0b340", pilots: 0, starlight: 0, roster: [] },
    { key: "nebula", name: "Nebula", accent: "#7c6aff", pilots: 0, starlight: 0, roster: [] },
    { key: "pulsar", name: "Pulsar", accent: "#5eead4", pilots: 0, starlight: 0, roster: [] },
  ],
  totals: { lit: 0, live: 0, total: STARS.length, pilots: 0 },
  nowMs: 0,
};

export default async function StarsMapPage() {
  let sector: Sector;
  try {
    sector = await getSectorSnapshot();
  } catch {
    sector = { ...FALLBACK, nowMs: Date.now() };
  }
  return <SectorMap sector={sector} />;
}
