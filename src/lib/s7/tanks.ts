/**
 * S7 REALMFALL: the pick-first identity roster (ADR-0066).
 *
 * TANKS: 20 real late-WWII machines, 4 per tier (Mike, 2026-07-22). Identity is a CHOICE, never
 * holding-bound: any Tier 1 tank is a free pick at enlist; higher tiers unlock
 * with SHELLS (play-earned) or achievements. Ratings are normalized 1..10 from
 * public specs (gun penetration class, top road speed, power-to-weight, armor
 * scheme) and render Top-Trumps style on the HQ card; their average feeds a
 * MODEST raid-power term bot-side. Insignia-free renders; era-coherent.
 *
 * COMMANDERS: an 8-strong cast (4 women, 4 men), free pick, swap anytime.
 *
 * Client-safe: constants + pure helpers only. No IO, no secrets.
 */

export type TankRatings = {
  /** Firepower 1..10 (gun class + penetration). */
  fp: number;
  /** Speed 1..10 (top road speed). */
  spd: number;
  /** Maneuverability 1..10 (power-to-weight + agility). */
  man: number;
  /** Armor 1..10 (protection scheme). */
  arm: number;
};

export type Tank = {
  key: string;
  name: string;
  /** Tier 1..5; tier names come from HULL_CLASSES in games.ts (Scout..Super-Heavy). */
  tier: 1 | 2 | 3 | 4 | 5;
  ratings: TankRatings;
  /** Gold price to unlock (0 = free starter pick). */
  shellsPrice: number;
  /** One-line in-world blurb for the loadout panel. No em-dashes. */
  blurb: string;
};

/** Gold price per tier (tier 1 free; tuned vs Gold income in the econ sim). */
export const TANK_TIER_PRICES: Record<Tank["tier"], number> = {
  1: 0,
  2: 300,
  3: 800,
  4: 1500,
  5: 3000,
};

export const TANK_ROSTER: Tank[] = [
  // Tier 1 (Skirmish class) - free picks
  { key: "scout", name: "Scout", tier: 1, ratings: { fp: 3, spd: 8, man: 8, arm: 3 }, shellsPrice: 0, blurb: "Searchlight, claw and a coil of tow cable. First in, last doubted." },
  { key: "hornet", name: "Hornet", tier: 1, ratings: { fp: 2, spd: 9, man: 8, arm: 2 }, shellsPrice: 0, blurb: "The smallest rig in the yard. Blink and it is behind you." },
  { key: "recon", name: "Recon", tier: 1, ratings: { fp: 3, spd: 8, man: 7, arm: 2 }, shellsPrice: 0, blurb: "One big eye and a radio. Has already told everyone where you are." },
  { key: "hound", name: "Hound", tier: 1, ratings: { fp: 4, spd: 8, man: 8, arm: 3 }, shellsPrice: 0, blurb: "Four legs, one cannon, zero patience. Fetches trouble." },
  // Tier 2 (Line class)
  { key: "badger", name: "Badger", tier: 2, ratings: { fp: 5, spd: 6, man: 6, arm: 5 }, shellsPrice: 300, blurb: "A drill for an arm and mud for a paint job. Digs in, then through." },
  { key: "sentry", name: "Sentry", tier: 2, ratings: { fp: 5, spd: 5, man: 6, arm: 6 }, shellsPrice: 300, blurb: "Watchtower lamp and a riot shield. The line holds where it stands." },
  { key: "viper", name: "Viper", tier: 2, ratings: { fp: 6, spd: 8, man: 7, arm: 3 }, shellsPrice: 300, blurb: "A hooked lash and a low stance. Strikes once, correctly." },
  { key: "howler", name: "Howler", tier: 2, ratings: { fp: 6, spd: 5, man: 5, arm: 5 }, shellsPrice: 300, blurb: "The horn array is not a weapon. The morale it brings is." },
  // Tier 3 (Battle class)
  { key: "lancer", name: "Lancer", tier: 3, ratings: { fp: 7, spd: 7, man: 6, arm: 5 }, shellsPrice: 800, blurb: "Tall legs, long lance. Asks its question from two fields away." },
  { key: "spectre", name: "Spectre", tier: 3, ratings: { fp: 6, spd: 10, man: 8, arm: 2 }, shellsPrice: 800, blurb: "Smoke-dark plates and one amber slit. You will not hear the answer." },
  { key: "ram", name: "Ram", tier: 3, ratings: { fp: 7, spd: 6, man: 5, arm: 7 }, shellsPrice: 800, blurb: "A battering head and braced pistons. Doors are a suggestion." },
  { key: "champion", name: "Champion", tier: 3, ratings: { fp: 7, spd: 7, man: 7, arm: 5 }, shellsPrice: 800, blurb: "Laurels on the shoulder, a blade for an arm. Earned, not issued." },
  // Tier 4 (Siege class)
  { key: "brawler", name: "Brawler", tier: 4, ratings: { fp: 8, spd: 4, man: 5, arm: 8 }, shellsPrice: 1500, blurb: "Two piston fists and a boiler heart. Negotiates in dents." },
  { key: "mortar", name: "Mortar", tier: 4, ratings: { fp: 9, spd: 4, man: 4, arm: 7 }, shellsPrice: 1500, blurb: "A 300mm opinion delivered over the wall, twice a minute." },
  { key: "anvil", name: "Anvil", tier: 4, ratings: { fp: 8, spd: 4, man: 4, arm: 8 }, shellsPrice: 1500, blurb: "Twin mortar racks on shoulders built like a bench vise." },
  { key: "bulwark", name: "Bulwark", tier: 4, ratings: { fp: 7, spd: 3, man: 4, arm: 9 }, shellsPrice: 1500, blurb: "A walking vault door. The shield arm has never lost an argument." },
  // Tier 5 (Colossus class)
  { key: "juggernaut", name: "Juggernaut", tier: 5, ratings: { fp: 9, spd: 3, man: 3, arm: 9 }, shellsPrice: 3000, blurb: "A walking bunker with a tiny head and no reverse gear." },
  { key: "atlas", name: "Atlas", tier: 5, ratings: { fp: 9, spd: 4, man: 4, arm: 8 }, shellsPrice: 3000, blurb: "Crane arm, wrecking fist, chains for jewelry. The yard king." },
  { key: "colossus", name: "Colossus", tier: 5, ratings: { fp: 8, spd: 3, man: 3, arm: 9 }, shellsPrice: 3000, blurb: "Twice as tall as the rest. A cathedral that walks." },
  { key: "paladin", name: "Paladin", tier: 5, ratings: { fp: 9, spd: 5, man: 5, arm: 8 }, shellsPrice: 3000, blurb: "Polished brass, banner poles, a pile-driver lance. The parade leads here." },
];

const TANK_BY_KEY = new Map(TANK_ROSTER.map((t) => [t.key, t]));

/** The enlist default (a free Tier 1 pick until the adventurer chooses). */
export const DEFAULT_TANK_KEY = "scout";

export function tankByKey(key: unknown): Tank | null {
  return typeof key === "string" ? TANK_BY_KEY.get(key) || null : null;
}

/** Average rating 1..10 (the bot's modest raid-power term reads this). */
export function tankPower(t: Tank): number {
  const r = t.ratings;
  return Math.round(((r.fp + r.spd + r.man + r.arm) / 4) * 10) / 10;
}

// ── The adventurer cast (free pick, swap anytime; outfits are week-1 drops) ──
export type Adventurer = {
  key: string;
  name: string;
  gender: "f" | "m";
  /** Archetype label on the HQ nameplate. */
  role: string;
  blurb: string;
  /** Earned, never free-picked: fielding it is gated on hq.adventurers_owned
   * (today: bigmike, the daily arcade top's prize). Absent = free cast. */
  prize?: true;
};

export const COMMANDERS: Adventurer[] = [
  { key: "wrench", name: "Wren", gender: "f", role: "Forgemaster", blurb: "If it was forged, she made it. If it broke, stand back." },
  { key: "vega", name: "Vega", gender: "f", role: "Master Archer", blurb: "Counts her misses on one finger. It is for pointing." },
  { key: "havoc", name: "Havoc", gender: "f", role: "Vanguard", blurb: "First through every breach, and loud about it." },
  { key: "compass", name: "Compass", gender: "f", role: "Pathfinder", blurb: "Has already been where you are going. Twice." },
  { key: "diesel", name: "Cinder", gender: "m", role: "Siege Master", blurb: "Big, calm and permanently soot-stained. The engines listen to him." },
  { key: "granite", name: "Granite", gender: "m", role: "Old Guard", blurb: "Old enough to know better, armoured enough not to care." },
  { key: "jackal", name: "Jackal", gender: "m", role: "Outrider", blurb: "Treats a full gallop as a moral position." },
  { key: "forge", name: "Forge", gender: "m", role: "Runesmith", blurb: "Works with live runes and calls the sparks fireworks." },
  // The daily arcade top's prize (with the parade-gold camo). In the cast so
  // every surface can resolve his name and portrait, but never a free pick.
  { key: "bigmike", name: "Big Mike", gender: "m", role: "The Boss", blurb: "The realm's most famous amphibian. Rides with whoever won the day.", prize: true },
];

const COMMANDER_BY_KEY = new Map(COMMANDERS.map((c) => [c.key, c]));
/** The adventurer a brand-new visitor meets in the camp before they pick one.
 * FORGE (Mike, 2026-07-27: "the initial character needs to be a guy, maybe
 * the character forge"). Every player still picks freely; this is only the
 * face on the first screen. */
export const DEFAULT_COMMANDER_KEY = "forge";

export function adventurerByKey(key: unknown): Adventurer | null {
  return typeof key === "string" ? COMMANDER_BY_KEY.get(key) || null : null;
}
