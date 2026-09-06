/**
 * S5 IRON SIEGE, the personal HQ registry (client-safe).
 *
 * HOTSPOTS lists every destination the HQ scene (src/app/s5/hq/HqScene.tsx)
 * offers: the command bar under the stage renders all ten, and four of them
 * (tank / commander / maptable / workbench) also get in-scene hit-regions
 * positioned on the baked plate. One tap opens the destination: a route push
 * or a minimal panel overlay. The LEARN line pulls from the EDUCATION
 * registry below: honest, in-world onboarding copy. No em-dashes anywhere.
 * Never promise "win $X".
 */

export type HotspotKey =
  | "tank"
  | "commander"
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
 * THE PLATE: both stages render /s5-art/hq/camp-portrait.webp, a baked 3:4
 * painting (the hero tank under the covered bay, the kneeling mechanic by the
 * fire, the corkboard right, the crates left). The in-scene hit-regions are
 * positioned on that painting as CSS percentages in HqScene.tsx
 * (.s5hq-obj--*); this registry only says what each station is and where it
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
    key: "commander",
    label: "Your Commander",
    flavor: "Every column needs a face. This one is yours.",
    opens: { kind: "panel" },
  },
  {
    key: "arcade",
    label: "The Arcade Cabinet",
    flavor: "Four field exercises. Small Medals, big bragging rights.",
    opens: { kind: "route", href: "/s5/play" },
  },
  {
    key: "radio",
    label: "Field Radio",
    flavor: "Chatter from the front. Dispatches, siege reports, the odd song.",
    learn: "breach-pays",
    opens: { kind: "panel" },
  },
  {
    key: "maptable",
    label: "The Map Table",
    flavor: "Every stronghold on the front, pinned and tracked.",
    learn: "bonding",
    opens: { kind: "route", href: "/s5/map" },
  },
  {
    key: "workbench",
    label: "Workbench",
    flavor: "Armor, Engine, Smoke, Optics, Caliber. Spend Shells, feel it in every game.",
    opens: { kind: "panel" },
  },
  {
    key: "bookshelf",
    label: "Field Manuals",
    flavor: "Everything a new commander should know, in plain words.",
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
    opens: { kind: "route", href: "/s5/board" },
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
    body: "Every stronghold on the front is a real internet domain that has been turned into a token on Doma. Owning a piece of the token means owning a piece of the domain's onchain value. That is the ground this war is fought on.",
  },
  {
    key: "bonding",
    title: "What does breached mean?",
    body: "Each stronghold has a funding bar called a bonding curve. When enough buying fills that bar, the domain graduates onchain. We call that moment the breach, and it is the whole point of the siege.",
  },
  {
    key: "fdv",
    title: "What is FDV?",
    body: "FDV is the fully diluted value, the price of one token multiplied by all tokens that will ever exist. Bigger strongholds need a bigger raise to breach. That is why the pricey ones unlock a bigger slice of the pool.",
  },
  {
    key: "how-to-buy",
    title: "How do I buy?",
    body: "Tap any stronghold on the map and buy right there in the app: pick $1, $5 or $25 or type your own amount, approve once, and the token is in your wallet seconds later. You pay in USDC.e on the Doma chain, and holding $5 or more is what puts you in the cash split. Never share your seed phrase with anyone, including us.",
  },
  {
    key: "breach-pays",
    title: "How do payouts work?",
    body: "Every stronghold pays into the season pool: its full share when it gets BREACHED, or its peak siege percent if the wall never falls. At season end the pool splits by Medals among qualified holders, and whatever the walls keep goes to the garrisons, the commanders still holding a wall that already breached. Nothing here is guaranteed money, so never spend what you cannot hold.",
  },
  {
    key: "siwe-safety",
    title: "Is signing in safe?",
    body: "Joining asks for one wallet signature. It is a plain text message: no transaction, no gas, no approvals, and nothing in your wallet can move from it. If any prompt ever asks for more than a signature, close it and report it on the radio.",
  },
  {
    key: "why-hold",
    title: "Why hold instead of flip?",
    body: "Medals are just points. More points, bigger share of the cash pool at season end. Holding a stronghold from $5 earns Medals every single day, and Medals decide your share when strongholds breach. Selling early stops the drip and weakens the siege. The Column wins by staying on the field.",
  },
];

export const EDUCATION_BY_KEY: Record<string, EducationEntry> = Object.fromEntries(
  EDUCATION.map((e) => [e.key, e]),
);
