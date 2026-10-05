/**
 * STARFALL sector map — stars.web3guides.com/map.
 * Server component: reads the live snapshot (service-role) and renders the
 * painted sector. force-dynamic so a star flipping pending -> live -> bonded,
 * or a new pilot joining a crew, shows on the next load. Falls back to an
 * all-standby snapshot if the read is unavailable, so the map never blanks.
 */
import { getSectorSnapshot, type Sector } from "@/lib/stars/map";
import { STARS, ALIENS } from "@/lib/stars/stars";
import { SectorMap } from "./SectorMap";

export const dynamic = "force-dynamic";
// force-dynamic governs RENDERING, not the fetch Data Cache. Without this, the
// service-role reads inside getSectorSnapshot (stars, crews, and the s3_aliens
// state k/v) get stored in Next's Data Cache and served stale, which froze the
// map on an old alien snapshot (Broodship stuck "approaching" after it had
// resolved on-chain). Force every read in this route to hit the DB live.
export const fetchCache = "force-no-store";

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
  aliens: ALIENS.map((a) => ({ ...a, arrived: false, hpPct: null, killed: false, preBonded: false, expired: false, attackers: 0 })),
  totals: { lit: 0, live: 0, total: STARS.length, pilots: 0 },
  nowMs: 0,
};

// DEV-ONLY preview mock (gated to non-production; ?demo never renders live). Lets us verify the
// swarm, planet stages, badges, the season-end chip, and the tapped-ship card without prod data.
function demoRoster(crew: string, n: number, topSl: number) {
  const names = ["Nova", "Vega", "Orion", "Lyra", "Atlas", "Cygnus", "Rigel", "Sol", "Mira", "Pavo", "Juno", "Halo", "Zenith", "Astra", "Comet", "Pulse", "Quasar"];
  return Array.from({ length: n }, (_, i) => {
    const starlight = Math.round(topSl * Math.pow(0.86, i));
    const rank = Math.max(1, Math.min(12, Math.round(starlight / 30) + 1));
    return { name: `${names[i % names.length]}${i >= names.length ? i : ""}`, rank, starlight, legendary: crew === "vanguard" && i === 0 ? "star-lighter" : null };
  });
}
function demoSector(): Sector {
  const meta = (d: string) => STARS.find((s) => s.domain === d)!;
  const star = (d: string, status: Sector["stars"][number]["status"], progress: number) => {
    const m = meta(d);
    return { domain: m.domain, name: m.name, size: m.size, pos: m.pos, card: m.card, tag: m.tag, relist: m.relist, status, progress, launchAt: m.launchAt, launched: status !== "pending" };
  };
  return {
    stars: [star("smoothie.com", "pending", 0), star("earmarking.xyz", "bonded", 1), star("frenchfries.ai", "live", 0.8), star("uncage.xyz", "live", 0.45), star("cosmo.xyz", "live", 0.18)],
    crews: [
      { key: "nebula", name: "Nebula", accent: "#7c6aff", pilots: 17, starlight: 1376, roster: demoRoster("nebula", 17, 237) },
      { key: "vanguard", name: "Vanguard", accent: "#f0b340", pilots: 17, starlight: 1269, roster: demoRoster("vanguard", 17, 210) },
      { key: "pulsar", name: "Pulsar", accent: "#5eead4", pilots: 16, starlight: 1179, roster: demoRoster("pulsar", 16, 194) },
    ],
    // Demo aliens: one live mid-fight, one destroyed-with-split, one incoming, one approaching —
    // every render state visible at stars.localhost:3000/map?demo=1.
    aliens: ALIENS.map((a, i) => ({
      ...a,
      arrived: i < 3,
      hpPct: i === 0 ? 62 : i === 2 ? 88 : null,
      killed: i === 1,
      preBonded: false,
      expired: false,
      attackers: i === 1 ? 9 : 0,
    })),
    totals: { lit: 1, live: 3, total: 5, pilots: 50 },
    nowMs: Date.now(),
  };
}

export default async function StarsMapPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  if (process.env.NODE_ENV !== "production" && (await searchParams)?.demo) {
    return <SectorMap sector={demoSector()} />;
  }
  let sector: Sector;
  try {
    sector = await getSectorSnapshot();
  } catch {
    sector = { ...FALLBACK, nowMs: Date.now() };
  }
  return <SectorMap sector={sector} />;
}
