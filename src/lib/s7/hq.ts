/**
 * S7 REALMFALL, the personal HQ registry (client-safe).
 *
 * HOTSPOTS lists every destination the HQ scene (src/app/s7/hq/HqScene.tsx)
 * offers: the command bar under the stage renders all ten, and four of them
 * (tank / adventurer / maptable / workbench) also get in-scene hit-regions
 * positioned on the baked plate. One tap opens the destination: a route push
 * or a minimal panel overlay. The LEARN line pulls from the EDUCATION
 * registry below: honest, in-world onboarding copy. No em-dashes anywhere.
 * Never promise "win $X".
 */

export type HotspotKey =
  | "tank"
  | "adventurer"
  | "arcade"
  | "radio"
  | "maptable"
  | "workbench"
  | "bookshelf"
  | "trophyshelf"
  | "footlocker"
  | "door";

export type EducationKey =
  | "domain-token"
  | "bonding"
  | "fdv"
  | "how-to-buy"
  | "breach-pays"
  | "siwe-safety"
  | "why-hold";

export type Hotspot = {
  key: HotspotKey;
  label: string;
  flavor: string;
  /** Education entry the nameplate's LEARN line teases (opens in the panel). */
  learn?: EducationKey;
  /** What the second tap does: push a route, or open the named panel overlay. */
  opens: { kind: "route"; href: string } | { kind: "panel" };
};

/**
 * THE PLATE: both stages render /s7-art/hq/camp-portrait.webp, a baked 3:4
 * painting (the weapon racks under the tent, the campfire and cook pot,
 * the banner wall right, the crates left). The in-scene hit-regions are
 * positioned on that painting as CSS percentages in HqScene.tsx
 * (.s7hq-obj--*); this registry only says what each station is and where it
 * opens.
 */
export const HOTSPOTS: Hotspot[] = [
  {
    key: "tank",
    label: "The Class Hall",
    flavor: "Six classes, your pick. Switch any time, and each one keeps its own level.",
    learn: "why-hold",
    opens: { kind: "panel" },
  },
  {
    key: "adventurer",
    label: "Your Adventurer",
    flavor: "Every hero needs a face. This one is yours.",
    opens: { kind: "panel" },
  },
  {
    key: "arcade",
    label: "The Arcade Cabinet",
    flavor: "The arcade games. Small Valor, big bragging rights.",
    opens: { kind: "route", href: "/s7/play" },
  },
  {
    key: "radio",
    label: "The Herald",
    flavor: "Chatter from the front. Dispatches, battle reports, the odd song.",
    learn: "breach-pays",
    opens: { kind: "panel" },
  },
  {
    key: "maptable",
    label: "The Map Table",
    flavor: "Every keep on the front, pinned and tracked.",
    learn: "bonding",
    opens: { kind: "route", href: "/s7" },
  },
  {
    key: "workbench",
    label: "The Armory",
    flavor: "Weapon, Armor, Trinket. Spend Gold, feel it in every game.",
    opens: { kind: "panel" },
  },
  {
    key: "bookshelf",
    label: "The Library",
    flavor: "Everything a new adventurer should know, in plain words.",
    learn: "domain-token",
    opens: { kind: "panel" },
  },
  {
    key: "trophyshelf",
    label: "Trophy Shelf",
    flavor: "Relics from past campaigns. Earned, never bought.",
    opens: { kind: "panel" },
  },
  {
    key: "footlocker",
    label: "The Chest",
    flavor: "Banners, charms and keepsakes. Win days in the arcade to fill it.",
    opens: { kind: "panel" },
  },
  {
    key: "door",
    label: "The Door",
    flavor: "Step out to the war board and see how the Guild stands.",
    opens: { kind: "route", href: "/s7/board" },
  },
];

export const HOTSPOT_BY_KEY: Record<string, Hotspot> = Object.fromEntries(
  HOTSPOTS.map((h) => [h.key, h]),
);

export type EducationEntry = {
  key: EducationKey;
  title: string;
  body: string;
};

/**
 * In-world onboarding copy. Rules: 2 to 3 short sentences, plain words, honest
 * (never "win $X", never financial advice), no em-dashes.
 */
export const EDUCATION: EducationEntry[] = [
  {
    key: "domain-token",
    title: "What is a domain token?",
    body: "Every keep on the front is a real internet domain that has been turned into a token on Doma. Owning a piece of the token means owning a piece of the domain's onchain value. That is the ground this war is fought on.",
  },
  {
    key: "bonding",
    title: "What does reclaimed mean?",
    body: "Each keep has a funding bar called a bonding curve. When enough buying fills that bar, the domain graduates onchain. We call that moment the reclaiming, and it is the whole point of the crusade.",
  },
  {
    key: "fdv",
    title: "What is FDV?",
    body: "FDV is the fully diluted value, the price of one token multiplied by all tokens that will ever exist. Bigger keeps need a bigger raise to be reclaimed, so the pool is split among the domains by difficulty: the harder the raise, the bigger the slice.",
  },
  {
    key: "how-to-buy",
    title: "How do I buy?",
    body: "Tap any keep on the map and buy right there in the app: pick $1, $5 or $25 or type your own amount, approve once, and the token is in your wallet seconds later. You pay in USDC.e on the Doma chain, and holding $5 or more is what puts you in the season cash split. Never share your seed phrase with anyone, including us.",
  },
  {
    key: "breach-pays",
    title: "How do payouts work?",
    body: "Every keep is worth a slice of the season pool, sized by difficulty, and it unlocks that slice by how far it got. RECLAIMED unlocks the slice in full, a wall that reaches 60 percent unlocks 60 percent of it, and what no keep reached stays locked and is never paid. Up to $100 of that locked money pays the arcade prize instead; the rest stays unpaid. All the unlocked money is one pot, and your cut is the share of it that your Valor is of everyone's Valor. Nothing here is guaranteed money, so never spend what you cannot hold.",
  },
  {
    key: "siwe-safety",
    title: "Is signing in safe?",
    body: "Joining asks for one wallet signature. It is a plain text message: no transaction, no gas, no approvals, and nothing in your wallet can move from it. If any prompt ever asks for more than a signature, close it and tell The Herald.",
  },
  {
    key: "why-hold",
    title: "Why hold instead of flip?",
    body: "Valor are just points. More points, bigger share of the pot the keeps unlock. Holding a keep from $5 earns Valor every single day, and every Valor counts the same no matter which keep you earned it on. Selling early stops the drip and weakens the crusade. The Guild wins by staying on the field.",
  },
];

export const EDUCATION_BY_KEY: Record<string, EducationEntry> = Object.fromEntries(
  EDUCATION.map((e) => [e.key, e]),
);
