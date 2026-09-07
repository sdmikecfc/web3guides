/**
 * S5 IRON SIEGE: the pick-first identity roster (ADR-0066).
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
  /** Shells price to unlock (0 = free starter pick). */
  shellsPrice: number;
  /** One-line in-world blurb for the loadout panel. No em-dashes. */
  blurb: string;
};

/** Shells price per tier (tier 1 free; tuned vs Shells income in the econ sim). */
export const TANK_TIER_PRICES: Record<Tank["tier"], number> = {
  1: 0,
  2: 300,
  3: 800,
  4: 1500,
  5: 3000,
};

export const TANK_ROSTER: Tank[] = [
  // Tier 1 (Scout class) — free picks
  { key: "stuart", name: "M3 Stuart", tier: 1, ratings: { fp: 3, spd: 8, man: 8, arm: 3 }, shellsPrice: 0, blurb: "Light, quick and honest. The recruiting poster of scout tanks." },
  { key: "panzer2", name: "Panzer II", tier: 1, ratings: { fp: 2, spd: 7, man: 8, arm: 2 }, shellsPrice: 0, blurb: "A 20mm autocannon on roller skates. Blink and it is behind you." },
  { key: "bt7", name: "BT-7", tier: 1, ratings: { fp: 3, spd: 9, man: 7, arm: 2 }, shellsPrice: 0, blurb: "The fastest thing on tracks. Armor optional, courage standard." },
  { key: "chaffee", name: "M24 Chaffee", tier: 1, ratings: { fp: 4, spd: 8, man: 8, arm: 3 }, shellsPrice: 0, blurb: "A real 75 on a scout chassis. The polite way to say ambush." },
  // Tier 2 (Cavalry class)
  { key: "sherman", name: "M4 Sherman", tier: 2, ratings: { fp: 5, spd: 6, man: 6, arm: 5 }, shellsPrice: 300, blurb: "Reliable everywhere, dramatic nowhere. The workhorse of workhorses." },
  { key: "t34", name: "T-34/76", tier: 2, ratings: { fp: 6, spd: 7, man: 6, arm: 5 }, shellsPrice: 300, blurb: "Sloped armor and a shrug. The tank that changed the argument." },
  { key: "cromwell", name: "Cromwell", tier: 2, ratings: { fp: 5, spd: 9, man: 7, arm: 4 }, shellsPrice: 300, blurb: "British in a hurry. Arrives early, leaves before the reply." },
  { key: "panzer4", name: "Panzer IV H", tier: 2, ratings: { fp: 6, spd: 5, man: 5, arm: 5 }, shellsPrice: 300, blurb: "The old soldier of the war. Upgunned, uparmored, unimpressed." },
  // Tier 3 (Battle class)
  { key: "panther", name: "Panther", tier: 3, ratings: { fp: 7, spd: 6, man: 6, arm: 7 }, shellsPrice: 800, blurb: "The long 75 asks a question most plates cannot answer." },
  { key: "t3485", name: "T-34-85", tier: 3, ratings: { fp: 7, spd: 7, man: 6, arm: 5 }, shellsPrice: 800, blurb: "The classic, upgunned. Numbers and a bigger hammer." },
  { key: "hellcat", name: "M18 Hellcat", tier: 3, ratings: { fp: 6, spd: 10, man: 8, arm: 2 }, shellsPrice: 800, blurb: "No armor, all throttle. Shoot first because there is no second." },
  { key: "comet", name: "Comet", tier: 3, ratings: { fp: 7, spd: 7, man: 6, arm: 5 }, shellsPrice: 800, blurb: "Britain finally puts the right gun on the right tank." },
  // Tier 4 (Siege class)
  { key: "tiger", name: "Tiger I", tier: 4, ratings: { fp: 8, spd: 4, man: 4, arm: 8 }, shellsPrice: 1500, blurb: "The 88 needs no introduction and accepts no argument." },
  { key: "is2", name: "IS-2", tier: 4, ratings: { fp: 9, spd: 4, man: 4, arm: 8 }, shellsPrice: 1500, blurb: "A 122mm opinion delivered once, loudly." },
  { key: "pershing", name: "M26 Pershing", tier: 4, ratings: { fp: 7, spd: 5, man: 5, arm: 7 }, shellsPrice: 1500, blurb: "America finally sends a heavyweight to the argument." },
  { key: "jagdpanther", name: "Jagdpanther", tier: 4, ratings: { fp: 9, spd: 6, man: 5, arm: 7 }, shellsPrice: 1500, blurb: "No turret, no warning. The long 88 in a low silhouette." },
  // Tier 5 (Super-Heavy class)
  { key: "tiger2", name: "Tiger II", tier: 5, ratings: { fp: 9, spd: 3, man: 3, arm: 9 }, shellsPrice: 3000, blurb: "The King. Slow as a verdict and about as final." },
  { key: "is3", name: "IS-3", tier: 5, ratings: { fp: 9, spd: 4, man: 4, arm: 9 }, shellsPrice: 3000, blurb: "The pike nose that made the parade go quiet." },
  { key: "centurion", name: "Centurion Mk 3", tier: 5, ratings: { fp: 8, spd: 5, man: 5, arm: 8 }, shellsPrice: 3000, blurb: "Arrived late to the war and stayed for fifty years." },
  { key: "superpershing", name: "Super Pershing", tier: 5, ratings: { fp: 9, spd: 4, man: 4, arm: 8 }, shellsPrice: 3000, blurb: "A Pershing wearing a Panther's plate. Borrowed, never returned." },
];

const TANK_BY_KEY = new Map(TANK_ROSTER.map((t) => [t.key, t]));

/** The enlist default (a free Tier 1 pick until the commander chooses). */
export const DEFAULT_TANK_KEY = "stuart";

export function tankByKey(key: unknown): Tank | null {
  return typeof key === "string" ? TANK_BY_KEY.get(key) || null : null;
}

/** Average rating 1..10 (the bot's modest raid-power term reads this). */
export function tankPower(t: Tank): number {
  const r = t.ratings;
  return Math.round(((r.fp + r.spd + r.man + r.arm) / 4) * 10) / 10;
}

// ── The commander cast (free pick, swap anytime; outfits are week-1 drops) ──
export type Commander = {
  key: string;
  name: string;
  gender: "f" | "m";
  /** Archetype label on the HQ nameplate. */
  role: string;
  blurb: string;
  /** Earned, never free-picked: fielding it is gated on hq.commanders_owned
   * (today: bigmike, the daily arcade top's prize). Absent = free cast. */
  prize?: true;
};

export const COMMANDERS: Commander[] = [
  { key: "wrench", name: "Wrench", gender: "f", role: "Chief Mechanic", blurb: "If it rolls, she built it. If it does not, stand back." },
  { key: "vega", name: "Vega", gender: "f", role: "Gunnery Officer", blurb: "Counts her misses on one finger. It is for pointing." },
  { key: "havoc", name: "Havoc", gender: "f", role: "Assault Lead", blurb: "Reads a minefield the way you read a menu." },
  { key: "compass", name: "Compass", gender: "f", role: "Recon Scout", blurb: "Has already been where you are going. Twice." },
  { key: "diesel", name: "Diesel", gender: "m", role: "Gunner", blurb: "Big, calm and permanently smudged. The gun listens to him." },
  { key: "granite", name: "Granite", gender: "m", role: "Commander", blurb: "Old enough to know better, armored enough not to care." },
  { key: "jackal", name: "Jackal", gender: "m", role: "Driver", blurb: "Treats the throttle as a moral position." },
  { key: "forge", name: "Forge", gender: "m", role: "Engineer", blurb: "Welds under fire and calls the sparks fireworks." },
  // The daily arcade top's prize (with the parade-gold camo). In the cast so
  // every surface can resolve his name and portrait, but never a free pick.
  { key: "bigmike", name: "Big Mike", gender: "m", role: "The Boss", blurb: "The front's most famous amphibian. Rides with whoever won the day.", prize: true },
];

const COMMANDER_BY_KEY = new Map(COMMANDERS.map((c) => [c.key, c]));
/** The commander a brand-new visitor meets in the camp before they pick one.
 * FORGE (Mike, 2026-07-27: "the initial character needs to be a guy, maybe
 * the character forge"). Every player still picks freely; this is only the
 * face on the first screen. */
export const DEFAULT_COMMANDER_KEY = "forge";

export function commanderByKey(key: unknown): Commander | null {
  return typeof key === "string" ? COMMANDER_BY_KEY.get(key) || null : null;
}
