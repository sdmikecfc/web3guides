/**
 * S6 UPRISING, the personal HQ registry (client-safe).
 *
 * HOTSPOTS lists every destination the HQ scene (src/app/s6/hq/HqScene.tsx)
 * offers: the command bar under the stage renders all ten, and four of them
 * (tank / pilot / maptable / workbench) also get in-scene hit-regions
 * positioned on the baked plate. One tap opens the destination: a route push
 * or a minimal panel overlay. The LEARN line pulls from the EDUCATION
 * registry below: honest, in-world onboarding copy. No em-dashes anywhere.
 * Never promise "win $X".
 */

export type HotspotKey =
  | "tank"
  | "pilot"
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
 * THE PLATE: both stages render /s6-art/hq/camp-portrait.webp, a baked 3:4
 * painting (the hero tank under the covered bay, the kneeling mechanic by the
 * fire, the corkboard right, the crates left). The in-scene hit-regions are
 * positioned on that painting as CSS percentages in HqScene.tsx
 * (.s6hq-obj--*); this registry only says what each station is and where it
 * opens.
 */
export const HOTSPOTS: Hotspot[] = [
  {
    key: "tank",
    label: "Your Tank",
    flavor: "Your tank, your pick. Change it any time.",
    learn: "why-hold",
    opens: { kind: "panel" },
  },
  {
    key: "pilot",
    label: "Your Pilot",
    flavor: "Every column needs a face. This one is yours.",
    opens: { kind: "panel" },
  },
  {
    key: "arcade",
    label: "The Arcade Cabinet",
    flavor: "Four field exercises. Small Signal, big bragging rights.",
    opens: { kind: "route", href: "/s6/play" },
  },
  {
    key: "radio",
    label: "Field Radio",
    flavor: "Chatter from the front. Dispatches, battle reports, the odd song.",
    learn: "breach-pays",
    opens: { kind: "panel" },
  },
  {
    key: "maptable",
    label: "The Map Table",
    flavor: "Every mainframe on the front, pinned and tracked.",
    learn: "bonding",
    opens: { kind: "route", href: "/s6" },
  },
  {
    key: "workbench",
    label: "Workbench",
    flavor: "Armor, Engine, Smoke, Optics, Caliber. Spend Scrap, feel it in every game.",
    opens: { kind: "panel" },
  },
  {
    key: "bookshelf",
    label: "Field Manuals",
    flavor: "Everything a new pilot should know, in plain words.",
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
    label: "Footlocker",
    flavor: "Decals, camo swatches, keepsakes. Win days in the arcade to fill it.",
    opens: { kind: "panel" },
  },
  {
    key: "door",
    label: "The Door",
    flavor: "Step out to the war board and see how the Column stands.",
    opens: { kind: "route", href: "/s6/board" },
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
    body: "Every mainframe on the front is a real internet domain that has been turned into a token on Doma. Owning a piece of the token means owning a piece of the domain's onchain value. That is the ground this war is fought on.",
  },
  {
    key: "bonding",
    title: "What does breached mean?",
    body: "Each mainframe has a funding bar called a bonding curve. When enough buying fills that bar, the domain graduates onchain. We call that moment the liberation, and it is the whole point of the uprising.",
  },
  {
    key: "fdv",
    title: "What is FDV?",
    body: "FDV is the fully diluted value, the price of one token multiplied by all tokens that will ever exist. Bigger mainframes need a bigger raise to breach. That is why the pricey ones unlock a bigger slice of the pool.",
  },
  {
    key: "how-to-buy",
    title: "How do I buy?",
    body: "Tap any mainframe on the map and buy right there in the app: pick $1, $5 or $25 or type your own amount, approve once, and the token is in your wallet seconds later. You pay in USDC.e on the Doma chain, and holding $5 or more is what puts you in the cash split. Never share your seed phrase with anyone, including us.",
  },
  {
    key: "breach-pays",
    title: "How do payouts work?",
    body: "Every mainframe is worth a slice of the season pool, and it pays that slice to its OWN holders based on how far it got. LIBERATED pays the slice in full, a wall that reaches 60 percent pays 60 percent of it, and what it never earned is never paid to anyone. Your cut of a mainframe's slice is set by the Signal you earned holding it. Nothing here is guaranteed money, so never spend what you cannot hold.",
  },
  {
    key: "siwe-safety",
    title: "Is signing in safe?",
    body: "Joining asks for one wallet signature. It is a plain text message: no transaction, no gas, no approvals, and nothing in your wallet can move from it. If any prompt ever asks for more than a signature, close it and report it on the radio.",
  },
  {
    key: "why-hold",
    title: "Why hold instead of flip?",
    body: "Signal are just points. More points, bigger share of the cash pool at season end. Holding a mainframe from $5 earns Signal every single day, and Signal decide your share when mainframes breach. Selling early stops the drip and weakens the uprising. The Column wins by staying on the field.",
  },
];

export const EDUCATION_BY_KEY: Record<string, EducationEntry> = Object.fromEntries(
  EDUCATION.map((e) => [e.key, e]),
);
