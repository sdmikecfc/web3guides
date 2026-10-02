/**
 * S5 tank model resolution (the Iron Siege counterpart of s4/model.ts).
 *
 * PICK-FIRST (ADR-0066): a commander's tank is their CHOICE from the real-tank
 * roster (lib/s5/tanks.ts), never derived from dollars held. `hq.tank` holds
 * the fielded tank key, `hq.camo` the cosmetic camo, `hq.decals` the earned
 * sticker keys. Held dollars decide NOTHING here; holding's incentives live in
 * Medals, sprints and bounties. Art convention (15 renders x 5 camo recolors):
 *
 *   /s5-art/tank/tank-<tankKey>-c{j}.png     j = camo index 1..5
 *
 * Until the art lands, surfaces render a gradient silhouette fallback (the
 * HqScene TankRig does this via onError/absence).
 *
 * Client-safe: pure functions over already-fetched data, no secrets, no IO.
 * Tolerant of junk input everywhere; never throws.
 */

import { HULL_CLASSES, type HullKey } from "./games";
import {
  DEFAULT_COMMANDER_KEY,
  DEFAULT_TANK_KEY,
  TANK_ROSTER,
  commanderByKey,
  tankByKey,
  tankPower,
  type Tank,
  type TankRatings,
} from "./tanks";

export const CAMOS = ["olive", "desert", "winter", "night", "urban", "gold"] as const;
export type CamoKey = (typeof CAMOS)[number];

/**
 * THE CAMO LADDER (Mike, 2026-08-03): camo is EARNED, no longer a free-for-all
 * swap. Olive stays free for everyone; each game's daily best unlocks that
 * game's signature scheme forever; the day's overall arcade top (highest sum
 * of that day's per-game bests) unlocks PARADE GOLD and the Big Mike
 * commander. Ownership lives in hq.camos_owned (bot-swept, web-read);
 * /api/s5/hq rejects a swap to a camo the wallet has not earned.
 *
 * Cosmetics-only invariant (ADR-0067): these awards carry zero Medals, zero
 * cash and zero settlement weight.
 */
export const CAMO_LADDER: ReadonlyArray<{ camo: CamoKey; from: "free" | "game" | "top"; game?: string }> = [
  { camo: "olive", from: "free" },
  { camo: "desert", from: "game", game: "armorclash" },
  { camo: "winter", from: "game", game: "warpath" },
  { camo: "night", from: "game", game: "warhawks" },
  { camo: "urban", from: "game", game: "vanguard" },
  { camo: "gold", from: "top" },
];

/** The camos this hq owns (olive always; junk tolerated). */
export function ownedCamoKeys(hq: unknown): CamoKey[] {
  const src =
    hq && typeof hq === "object" && !Array.isArray(hq)
      ? (hq as Record<string, unknown>)
      : {};
  const owned = new Set<CamoKey>(["olive"]);
  if (Array.isArray(src.camos_owned)) {
    for (const k of src.camos_owned) {
      if (typeof k === "string" && (CAMOS as readonly string[]).includes(k)) owned.add(k as CamoKey);
    }
  }
  return CAMOS.filter((c) => owned.has(c));
}

/**
 * STAT MILESTONE TANKS (Mike's "new tanks from upgrading stats"). Taking a
 * stat to its final level unlocks that stat's signature tank free, straight
 * into hq.tanks_owned. Granted instantly by /api/s5/upgrade; the bot's daily
 * sweep re-checks levels so a Discord-side buy is caught up within a day.
 * Caliber is deliberately absent: its 30-step grind pays in raid damage.
 */
export const STAT_MILESTONE_TANKS: ReadonlyArray<{ stat: string; atLevel: number; tank: string }> = [
  { stat: "botox", atLevel: 4, tank: "tiger" },      // Armor maxed -> the armor icon
  { stat: "drugs", atLevel: 4, tank: "cromwell" },   // Engine maxed -> the sprinter
  { stat: "ozempic", atLevel: 4, tank: "hellcat" },  // Smoke maxed -> the ghost
  { stat: "optics", atLevel: 4, tank: "comet" },     // Optics maxed -> the marksman
];

/** Extra commanders beyond the free 8-strong cast (today: bigmike only). */
export const PRIZE_COMMANDERS = ["bigmike"] as const;

/** Commanders this hq may field: the free cast plus any earned prize keys. */
export function ownedCommanderKeys(hq: unknown): string[] {
  const src =
    hq && typeof hq === "object" && !Array.isArray(hq)
      ? (hq as Record<string, unknown>)
      : {};
  const extra: string[] = [];
  if (Array.isArray(src.commanders_owned)) {
    for (const k of src.commanders_owned) {
      if (typeof k === "string" && (PRIZE_COMMANDERS as readonly string[]).includes(k)) extra.push(k);
    }
  }
  return extra;
}

export type ResolvedTank = {
  /** The chosen tank's roster key (hq.tank, validated; defaults to the starter). */
  tankKey: string;
  /** Player-facing tank name ("M3 Stuart".."Centurion Mk 3"). */
  tankName: string;
  /** Tank tier 1..5. */
  tier: Tank["tier"];
  /** Real-spec ratings 1..10 for the HQ card (fp/spd/man/arm). */
  ratings: TankRatings;
  /** Average rating (the bot's modest raid term reads the same number). */
  power: number;
  /** Tier CLASS key (scout..superheavy), kept for stage layout + decal anchors. */
  hullKey: HullKey;
  /** Tier class name ("Scout".."Super-Heavy"). */
  hullName: string;
  /** The equipped camo (hq.camo, validated; default "olive"). */
  camo: CamoKey;
  /** Web path to the tank art for this tank + camo. */
  art: string;
  /** Earned decal keys from hq.decals (strings only, junk filtered). */
  decals: string[];
};

/** Decal anchor points per tier class, as fractions of the tank art box.
 * PLACEHOLDER coords until the tank art lands and anchors are eyeballed. */
export const DECAL_ANCHORS: Record<HullKey, Array<{ x: number; y: number }>> = {
  scout: [
    { x: 0.38, y: 0.52 },
    { x: 0.6, y: 0.44 },
  ],
  cavalry: [
    { x: 0.36, y: 0.5 },
    { x: 0.58, y: 0.42 },
    { x: 0.72, y: 0.56 },
  ],
  battle: [
    { x: 0.34, y: 0.5 },
    { x: 0.56, y: 0.4 },
    { x: 0.74, y: 0.54 },
  ],
  siege: [
    { x: 0.32, y: 0.52 },
    { x: 0.54, y: 0.4 },
    { x: 0.7, y: 0.48 },
    { x: 0.82, y: 0.6 },
  ],
  superheavy: [
    { x: 0.3, y: 0.52 },
    { x: 0.5, y: 0.38 },
    { x: 0.68, y: 0.46 },
    { x: 0.84, y: 0.58 },
  ],
};

/** Tier class (scout..superheavy) for a tank tier 1..5; used for stage layout
 * sizing + decal anchors. HULL_CLASSES doubles as the tier-name table. */
export function hullForTier(tier: number): (typeof HULL_CLASSES)[number] {
  const i = Math.max(1, Math.min(5, Math.floor(Number(tier) || 1))) - 1;
  return HULL_CLASSES[i] || HULL_CLASSES[0];
}

function isCamo(v: unknown): v is CamoKey {
  return typeof v === "string" && (CAMOS as readonly string[]).includes(v);
}

/**
 * Painted hero renders that exist today. Anything not listed here resolves to
 * the convention path below and degrades to the vector silhouette until its
 * render lands.
 */
const HERO_TANK_ART: Record<string, string> = {
  sherman: "/s5-art/tank/hero-sherman.webp",
};

/**
 * Roster tanks whose painted render is on disk today as
 * /s5-art/tank/<key>.webp. All 20 roster keys are covered since the is3 studio
 * render landed (2026-07-25); a key missing from this set falls through to the
 * convention path below and degrades to the vector silhouette.
 */
const TANK_ART_ON_DISK: ReadonlySet<string> = new Set([
  "stuart", "panzer2", "bt7", "chaffee",
  "sherman", "t34", "cromwell", "panzer4",
  "panther", "t3485", "hellcat", "comet",
  "tiger", "is2", "pershing", "jagdpanther",
  "tiger2", "centurion", "superpershing", "is3",
]);

/**
 * CAMO IS REAL NOW. Every render above also exists recoloured as
 * `<base>-<camo>.webp` for all five non-olive schemes, generated by a
 * saturation-gated HSV remap of the original (the grey studio backdrop sits
 * below the saturation floor, so it is untouched and every variant still
 * composites identically).
 *
 * Olive is deliberately NOT in this set: it is the untouched original file, so
 * the default costs no extra bytes and every tank is guaranteed to have it.
 * Mike found camo advertised as a free swap that changed nothing, which is
 * worse than not offering it.
 *
 * GOLD WAS MISSING FROM THIS SET UNTIL 2026-08-04, and it is the rarest prize
 * in the season: Parade Gold goes to whoever tops the whole arcade in a day.
 * All twenty gold renders (and all twenty gold map sprites) have been on disk
 * the entire time, and the MAP drew them correctly, so the one player who had
 * earned gold saw it on the board and olive in their own garage. Exactly the
 * bug the paragraph above was written about, hiding one word away from it.
 */
const CAMO_RECOLOURED: ReadonlySet<string> = new Set(["desert", "winter", "night", "urban", "gold"]);

/** The art path for one tank + camo (the single source of the file convention). */
export function tankArt(tankKey: string, camo: CamoKey): string {
  const base = HERO_TANK_ART[tankKey] ?? (TANK_ART_ON_DISK.has(tankKey) ? `/s5-art/tank/${tankKey}.webp` : "");
  if (base) return CAMO_RECOLOURED.has(camo) ? base.replace(/\.webp$/, `-${camo}.webp`) : base;
  const cj = CAMOS.indexOf(camo) + 1 || 1;
  return `/s5-art/tank/tank-${tankKey}-c${cj}.png`;
}

/** The tank the CAMP shows a guest in its bay: the marketing HERO. Chosen as
 * the best-looking render in the roster (the Panther's sleek sloped hull), NOT
 * the enlist starter and NOT the mid-tier Sherman. Every roster cutout is on
 * disk now, so this is a pure presentation pick and easy to swap. */
export const HERO_TANK_KEY = "panther";

/**
 * PER-TANK BAKED CAMP PLATES (the "different tanks" hero, ADR-0077 direction).
 * Each entry is a 3:4 camp painting with THAT tank baked under the bay, built
 * from the original Panther portrait via the 2-ref recipe so the mechanic and
 * composition stay pixel-consistent. This is an EXISTS-MAP: only keys whose
 * plate file is on disk today are listed, so no render path can 404. The
 * Panther keeps the original portrait AND the only paid seedance loop; every
 * other plate is animated by the HqCanvas particle weather instead (see
 * CampBackdrop). Roster keys without a plate yet (is2, pershing, jagdpanther,
 * tiger2, centurion, superpershing) fall back to the Panther entry.
 */
/**
 * PER-COMMANDER SCENE GRADE.
 *
 * The commander is a studio cutout standing in a painted, graded camp, so she
 * has to be pulled into the plate's key or she reads as pasted on. A SINGLE
 * global filter cannot do that: the eight cast members do not start from the
 * same place. Measured raw, wrench sits at 0.673 saturation while granite sits
 * at 0.266, and forge's value is 0.157 against wrench's 0.529. One filter tuned
 * on wrench crushed the men into mud (diesel landed at 0.62x the plate's
 * saturation and 0.68x its brightness, i.e. darker and duller than the scene
 * behind him). Only 18 of 112 commander/plate pairings were in a sane band.
 *
 * These pairs are SOLVED, not eyeballed: for each commander, the saturate and
 * brightness that land them at ~1.30x the plate's local saturation and ~1.05x
 * its value, sampled from the exact region of each plate where they stand and
 * averaged across all 14 plates. Slightly above the plate on both axes is
 * deliberate: they are the lit subject, not part of the backdrop.
 *
 * Regenerate with `python gen-cmdr-combos.py` (it also renders the contact
 * sheet). Re-solve if the cutouts or the plates are ever re-rendered.
 */
export const COMMANDER_GRADE: Record<string, { sat: number; bri: number }> = {
  wrench: { sat: 0.43, bri: 0.61 },
  vega: { sat: 1.09, bri: 0.65 },
  havoc: { sat: 0.82, bri: 0.74 },
  compass: { sat: 0.86, bri: 0.88 },
  diesel: { sat: 1.29, bri: 1.32 },
  forge: { sat: 0.83, bri: 1.76 },
  granite: { sat: 1.72, bri: 1.01 },
  jackal: { sat: 0.87, bri: 1.37 },
};

/** Falls back to a neutral pass so an unknown commander is never mis-graded. */
export function commanderGrade(ck: string): { sat: number; bri: number } {
  return COMMANDER_GRADE[ck] || { sat: 1, bri: 1 };
}

export const CAMP_PLATES: Record<string, { plate: string; loop?: string }> = {
  panther: {
    plate: "/s5-art/hq/camp-portrait.webp",
    loop: "/s5-art/hq/camp-portrait-loop.mp4",
  },
  stuart: { plate: "/s5-art/hq/plates/camp-stuart.webp" },
  panzer2: { plate: "/s5-art/hq/plates/camp-panzer2.webp" },
  bt7: { plate: "/s5-art/hq/plates/camp-bt7.webp" },
  chaffee: { plate: "/s5-art/hq/plates/camp-chaffee.webp" },
  sherman: { plate: "/s5-art/hq/plates/camp-sherman.webp" },
  t34: { plate: "/s5-art/hq/plates/camp-t34.webp" },
  cromwell: { plate: "/s5-art/hq/plates/camp-cromwell.webp" },
  panzer4: { plate: "/s5-art/hq/plates/camp-panzer4.webp" },
  t3485: { plate: "/s5-art/hq/plates/camp-t3485.webp" },
  hellcat: { plate: "/s5-art/hq/plates/camp-hellcat.webp" },
  comet: { plate: "/s5-art/hq/plates/camp-comet.webp" },
  tiger: { plate: "/s5-art/hq/plates/camp-tiger.webp" },
  is3: { plate: "/s5-art/hq/plates/camp-is3.webp" },
};

/** The camp plate (and optional living loop) for one fielded tank key. Any
 * key without its own baked plate resolves to the Panther entry, so a guest,
 * a junk key, and a not-yet-painted tank all get the original hero scene
 * (zero regression). */
export function campPlateFor(tankKey: string): { plate: string; loop?: string } {
  return CAMP_PLATES[tankKey] || CAMP_PLATES[HERO_TANK_KEY];
}

/**
 * Commanders with a landed idle-loop clip at /s5-art/commander/anim/<key>.mp4
 * (plain h264 so it plays everywhere including iOS Safari). ALL EIGHT are
 * animated now (the men's clips landed 2026-07-25); the static PNG stays the
 * poster + reduced-motion + failure fallback. Exists-map, same rule as
 * CAMP_PLATES: list a key only when its clip is on disk.
 */
export const IDLE_COMMANDER_KEYS: ReadonlySet<string> = new Set([
  "wrench", "vega", "havoc", "compass",
  "diesel", "granite", "jackal", "forge",
]);

/** Every tier-1 tank key (free starter picks, owned by everyone). */
export const FREE_TANK_KEYS: string[] = TANK_ROSTER.filter((t) => t.tier === 1).map((t) => t.key);

/**
 * The tank keys a player OWNS: every tier-1 tank plus whatever the unlock
 * route appended to hq.tanks_owned (junk filtered against the roster).
 * Order: roster order, so the garage renders stably.
 */
export function ownedTankKeys(hq: unknown): string[] {
  const src =
    hq && typeof hq === "object" && !Array.isArray(hq)
      ? (hq as Record<string, unknown>)
      : {};
  const owned = new Set<string>(FREE_TANK_KEYS);
  if (Array.isArray(src.tanks_owned)) {
    for (const k of src.tanks_owned) {
      if (typeof k === "string" && tankByKey(k)) owned.add(k);
    }
  }
  return TANK_ROSTER.filter((t) => owned.has(t.key)).map((t) => t.key);
}

/** The commander key from hq.commander (validated; defaults to the cast lead). */
export function resolveCommanderKey(hq: unknown): string {
  const src =
    hq && typeof hq === "object" && !Array.isArray(hq)
      ? (hq as Record<string, unknown>)
      : {};
  return commanderByKey(src.commander) ? String(src.commander) : DEFAULT_COMMANDER_KEY;
}

/**
 * Which tank to draw for a commander. `hq` is the player's hq JSONB value
 * (junk-tolerant). The second argument is accepted for call-site
 * compatibility but IGNORED by design: held dollars never pick the tank
 * (ADR-0066). A missing/garbled hq resolves to the starter tank, olive camo,
 * no decals.
 */
export function resolveTank(hq: unknown, _heldUsd?: number): ResolvedTank {
  const src =
    hq && typeof hq === "object" && !Array.isArray(hq)
      ? (hq as Record<string, unknown>)
      : {};
  const tank = tankByKey(src.tank) || tankByKey(DEFAULT_TANK_KEY) || TANK_ROSTER[0];
  const hull = hullForTier(tank.tier);
  const camo: CamoKey = isCamo(src.camo) ? src.camo : "olive";
  const decals = Array.isArray(src.decals)
    ? src.decals.filter((d): d is string => typeof d === "string" && d.length > 0 && d.length <= 40)
    : [];
  return {
    tankKey: tank.key,
    tankName: tank.name,
    tier: tank.tier,
    ratings: tank.ratings,
    power: tankPower(tank),
    hullKey: hull.key,
    hullName: hull.name,
    camo,
    art: tankArt(tank.key, camo),
    decals,
  };
}
