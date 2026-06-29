/**
 * STARFALL (Launch Wars S3) — the Salvage shop catalog + pricing (shared server/client).
 *
 * "Salvage buys looks, Starlight wins cash." Salvage (the player-facing name for the
 * 'stardust' currency) is EARNED BY PLAYING and spends on ship COMPONENTS + cosmetic
 * PAINT. It can never buy cash-prize weight (that is Starlight, from holding) — so the
 * shop is fair: time/skill, not money, and a maxed ship wins battles + flex, not cash.
 *
 * Pricing is grounded in the proven S2 fit-shop economy (FIT_PRICES base × (level+1),
 * max level 5): the first upgrade is same-day-reachable (~150) for early momentum, a
 * single component maxes in ~a week of play, a full build is a season-long chase. The
 * server is authoritative on every cost — the client only renders these.
 */

export type ComponentKey = "guns" | "engines" | "shields" | "plating";

export const FIT_MAX_LEVEL = 5;

export interface ShopComponent {
  key: ComponentKey;
  name: string;
  emoji: string;
  base: number; // Salvage; cost to go level L -> L+1 is base * (L + 1)
  effect: string;
}

// 4 components (the guide's HULL-LADDER Axis 2). Mapped 1:1 from S2 fittings so the
// magnitudes are the proven ones: cannons->guns, sails->engines, spyglass->shields,
// pumps->plating. Effects wire into battles/raids as those integrate (fast-follow).
export const COMPONENTS: ShopComponent[] = [
  { key: "guns", name: "Guns", emoji: "🔫", base: 150, effect: "More damage in battles and raids." },
  { key: "engines", name: "Engines", emoji: "🚀", base: 120, effect: "More speed and a better dodge." },
  { key: "shields", name: "Shields", emoji: "🛡️", base: 100, effect: "Block more incoming fire." },
  { key: "plating", name: "Plating", emoji: "🧱", base: 100, effect: "More hull and faster repair." },
];

/** Salvage to upgrade a component from `level` to `level + 1` (S2-grounded). */
export function upgradeCost(base: number, level: number): number {
  return base * (level + 1);
}

/** Total Salvage spent to reach `level` from 0 (for "maxed" / progress display). */
export function totalSpentToLevel(base: number, level: number): number {
  let sum = 0;
  for (let l = 0; l < level; l++) sum += upgradeCost(base, l);
  return sum;
}

export type PaintKey = "crew" | "ember" | "ion" | "void" | "gold";

export interface ShopPaint {
  key: PaintKey;
  name: string;
  hex: string | null; // null = use the pilot's crew accent
  price: number; // Salvage; 0 = free (owned by default)
}

// Day-1 cosmetics are PAINT (a hull accent on the ship card) — pure CSS, no art
// dependency, so the cosmetic spend works before the gpt-image-2 hull catalog lands.
// Full hull skins (Star-Citizen art) are the mid-week follow-up, keyed on ship.skin.
export const PAINTS: ShopPaint[] = [
  { key: "crew", name: "Crew Colors", hex: null, price: 0 },
  { key: "ember", name: "Ember", hex: "#ff7a3c", price: 300 },
  { key: "ion", name: "Ion", hex: "#5e8bff", price: 300 },
  { key: "void", name: "Void", hex: "#9b4dff", price: 400 },
  { key: "gold", name: "Gold", hex: "#f0b340", price: 600 },
];

export const COMPONENT_KEYS = new Set<string>(COMPONENTS.map((c) => c.key));
export const PAINT_KEYS = new Set<string>(PAINTS.map((p) => p.key));

/** The component levels + cosmetics stored on launch_wars_s3_pilots.ship (JSONB). */
export interface ShipState {
  guns?: number;
  engines?: number;
  shields?: number;
  plating?: number;
  paint?: PaintKey;
  paints?: PaintKey[]; // owned paints (crew is always implicitly owned)
  skin?: string; // reserved for mid-week hull skins
}

export const lvl = (ship: ShipState | null | undefined, key: ComponentKey): number =>
  Math.max(0, Math.min(FIT_MAX_LEVEL, Math.round(Number(ship?.[key]) || 0)));
