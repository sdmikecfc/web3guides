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
// BATTLEFIELD LAYOUT (Mike 2026-07-08): crews mass in the LEFT column, the planets hold a
// TIGHT RING around the black hole in the center, the alien invasion looms on the RIGHT.
// Planet ring ~radius .17 around the singularity (~0.50, 0.44); smoothie (priority) crowns it.
export const STARS: StarMeta[] = [
  { domain: "smoothie.com",   name: "Smoothie",     launchAt: "2026-07-01T10:00:00Z", size: "giant", pos: { x: 0.50, y: 0.15 }, card: "below", tag: "Priority" },
  { domain: "earmarking.xyz", name: "Earmarking",   launchAt: "2026-06-29T10:00:00Z", size: "mid",   pos: { x: 0.33, y: 0.30 }, card: "above", tag: "Just launched" },
  { domain: "frenchfries.ai", name: "French Fries", launchAt: "2026-07-04T10:00:00Z", size: "mid",   pos: { x: 0.67, y: 0.30 }, card: "above", tag: "Relist", relist: true },
  { domain: "uncage.xyz",     name: "Uncage",       launchAt: "2026-06-30T10:00:00Z", size: "mid",   pos: { x: 0.36, y: 0.64 }, card: "below" },
  { domain: "cosmo.xyz",      name: "Cosmo",        launchAt: "2026-07-02T10:00:00Z", size: "mid",   pos: { x: 0.64, y: 0.64 }, card: "below" },
];

export const CREWS = [
  { key: "vanguard", name: "Vanguard", accent: "#f0b340" },
  { key: "nebula",   name: "Nebula",   accent: "#7c6aff" },
  { key: "pulsar",   name: "Pulsar",   accent: "#5eead4" },
] as const;

// ── W2 ALIEN INVASION (bosses-style) — MIRRORS the bot's ALIENS array ─────────
// 4 enemy domains, NOT stars: separate bounty event, never part of the crew pool.
// Positions per Mike: Scout between Earmarking and Smoothie, Broodship between
// Smoothie and French Fries, the Mothership half-emerged from the BLACK HOLE at
// the center; the Hive holds the right flank. Art: /stars-art/alien-<key>.png
// (vector fallback until the plates land). Keep in sync with the bot.
export type AlienMeta = {
  domain: string;
  key: string; // art basename: alien-<key>.png
  name: string;
  bounty: number;
  launchAt: string;
  pos: { x: number; y: number };
  size: number; // sprite scale relative to a mid planet (1 = same)
};

// The invasion column: RIGHT side, stacked in arrival order, the Mothership rising
// hugest from the bottom. The ominous crimson glow band behind them lives in SectorMap.
export const ALIENS: AlienMeta[] = [
  { domain: "cresting.xyz",         key: "scout",      name: "The Scout",      bounty: 50,  launchAt: "2026-07-07T10:00:00Z", pos: { x: 0.885, y: 0.14 }, size: 0.55 },
  { domain: "goldspiders.com",      key: "broodship",  name: "The Broodship",  bounty: 150, launchAt: "2026-07-08T10:00:00Z", pos: { x: 0.885, y: 0.37 }, size: 0.7 },
  { domain: "millionpixelgrid.com", key: "hive",       name: "The Hive",       bounty: 300, launchAt: "2026-07-09T10:00:00Z", pos: { x: 0.885, y: 0.61 }, size: 0.85 },
  { domain: "gradai.com",           key: "mothership", name: "The Mothership", bounty: 250, launchAt: "2026-07-10T10:00:00Z", pos: { x: 0.875, y: 0.86 }, size: 1.05 },
];

export type CrewKey = (typeof CREWS)[number]["key"];

/** Art basename for a domain: smoothie.com -> "smoothie", frenchfries.ai -> "frenchfries". */
export function artKey(domain: string): string {
  return domain.split(".")[0];
}

/** On-chain status -> painted planet state art (legacy 3-stage; kept for back-compat). */
export function planetState(status: StarStatus): "dormant" | "awakening" | "ignited" {
  if (status === "bonded") return "ignited";
  if (status === "live") return "awakening";
  return "dormant"; // pending or failed both render the dormant plate
}

export type PlanetStage = "dormant" | "kindling" | "awakening" | "blazing" | "ignited";

/**
 * 5-stage terraform art, driven by the LIVE bond percentage (so 1% reads differently
 * from 60%). pending/failed = dormant; bonded = ignited; a live star ramps
 * kindling -> awakening -> blazing -> ignited across its 0..1 bond progress.
 */
export function planetStage(status: StarStatus, progress = 0): PlanetStage {
  if (status === "bonded") return "ignited";
  if (status === "live") {
    const p = Math.max(0, Math.min(1, progress));
    if (p < 0.33) return "kindling";
    if (p < 0.66) return "awakening";
    if (p < 0.95) return "blazing";
    return "ignited";
  }
  return "dormant"; // pending or failed
}

/** Public path to the keyed planet PNG for a domain at its current state + bond progress. */
export function planetArt(domain: string, status: StarStatus, progress = 0): string {
  return `/stars-art/${artKey(domain)}-${planetStage(status, progress)}.png`;
}
