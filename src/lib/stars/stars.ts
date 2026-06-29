/**
 * STARFALL (Launch Wars S3) — shared sector metadata (client-safe, no secrets).
 *
 * The 5 stars (domains) and the 3 crews, with the staggered Doma launch schedule,
 * scenic map coordinates, and the on-chain-status -> painted-art mapping. This
 * MIRRORS the bot's STARS / CREWS arrays (doma-reporter/modules/starfall) so the
 * web and the bot agree on the schedule and the crew accents. Keep them in sync.
 */

export type StarSize = "giant" | "mid";
export type StarStatus = "pending" | "live" | "bonded" | "failed";

export type StarMeta = {
  domain: string;
  name: string; // short display label ("Smoothie")
  launchAt: string; // ISO; the staggered Doma listing schedule (authoritative gate)
  size: StarSize; // smoothie is the giant (biggest bond gap); the rest are mid
  pos: { x: number; y: number }; // normalized 0..1 position inside the sector box
  card: "above" | "below"; // which side the label sits — push OUTWARD from center
  tag?: string; // small flavor badge ("Priority", "Lists first", "Relist")
  relist?: boolean; // frenchfries: watch the V2 contract, not the dead v1
};

// Objectives scattered around the singularity — deliberately ORGANIC (varied radius
// + angle), NOT an even pentagon. The black hole owns the center; the 3 crew fleets
// stage in the open gaps (left, right, bottom — see FLEET_ANCHORS in SectorMap), so
// the planets cluster up + to the sides and leave those lanes clear for ships. Cards
// push OUTWARD (upper planets label above, lower planets label below).
export const STARS: StarMeta[] = [
  { domain: "smoothie.com",   name: "Smoothie",     launchAt: "2026-07-01T10:00:00Z", size: "giant", pos: { x: 0.45, y: 0.13 }, card: "below", tag: "Priority" },
  { domain: "braking.io",     name: "Braking",      launchAt: "2026-06-29T10:00:00Z", size: "mid",   pos: { x: 0.17, y: 0.26 }, card: "above", tag: "Lists first" },
  { domain: "frenchfries.ai", name: "French Fries", launchAt: "2026-07-04T10:00:00Z", size: "mid",   pos: { x: 0.84, y: 0.31 }, card: "above", tag: "Relist", relist: true },
  { domain: "uncage.xyz",     name: "Uncage",       launchAt: "2026-06-30T10:00:00Z", size: "mid",   pos: { x: 0.30, y: 0.66 }, card: "below" },
  { domain: "cosmo.xyz",      name: "Cosmo",        launchAt: "2026-07-02T10:00:00Z", size: "mid",   pos: { x: 0.71, y: 0.71 }, card: "below" },
];

export const CREWS = [
  { key: "vanguard", name: "Vanguard", accent: "#f0b340" },
  { key: "nebula",   name: "Nebula",   accent: "#7c6aff" },
  { key: "pulsar",   name: "Pulsar",   accent: "#5eead4" },
] as const;

export type CrewKey = (typeof CREWS)[number]["key"];

/** Art basename for a domain: smoothie.com -> "smoothie", frenchfries.ai -> "frenchfries". */
export function artKey(domain: string): string {
  return domain.split(".")[0];
}

/** On-chain status -> painted planet state art (dormant | awakening | ignited). */
export function planetState(status: StarStatus): "dormant" | "awakening" | "ignited" {
  if (status === "bonded") return "ignited";
  if (status === "live") return "awakening";
  return "dormant"; // pending or failed both render the dormant plate
}

/** Public path to the keyed planet PNG for a domain in its current state. */
export function planetArt(domain: string, status: StarStatus): string {
  return `/stars-art/${artKey(domain)}-${planetState(status)}.png`;
}
