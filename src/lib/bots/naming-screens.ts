/**
 * BATTLE BOTS SCREEN WORDS: the copy the four player screens need that
 * src/lib/bots/naming.ts does not carry.
 *
 * WHY THIS IS A SEPARATE FILE. naming.ts owns the convention itself (brand,
 * model number, part, colour), the stat vocabulary and the house names, and
 * another lane is actively rewriting it. Everything that file already says
 * is imported from it and never restated here: this file holds only the four
 * things a screen needs and the convention has no opinion about.
 *
 *   1. "Can I use it yet." A shop card that says "Needs bot level 10" tells
 *      a player a rule but not their own position in it. Every line here
 *      states the gap in whole numbers, so the answer is one read.
 *   2. What an empty row means when the player themself emptied it with a
 *      filter, and the button that undoes it.
 *   3. The one word that marks the stat a part leads on.
 *   4. The house ladder's sizing line, which needs the player's own bot.
 *
 * COPY LAWS: plain words for a global audience whose first language is often
 * not English; short sentences; whole numbers; no algebra; no gaming jargon;
 * no idioms; no abbreviations; no em-dashes; never a dollar figure and never
 * a wallet address.
 *
 * MERGE NOTE: these belong inside naming.ts once that file settles. Nothing
 * here contradicts it, and nothing here is a second word for something it
 * already names.
 */

import type { StatName } from "@/app/bots/_engine/parts";
import type { StatKey } from "./fixtures";

/** Replace {name} placeholders. Same shape as strings.ts and naming.ts. */
export function fillWords(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * The screens key stats by StatKey ("attackSpeed", which is what the icon
 * table and the readout order use); the engine and naming.ts key them by
 * StatName ("attack speed"). Eight of the nine words are identical and only
 * attack speed differs, which is exactly why this bridge is one table and
 * not a second vocabulary. Nothing here invents a word.
 */
export const STAT_NAME_OF: Readonly<Record<StatKey, StatName>> = {
  speed: "speed",
  strength: "strength",
  dodge: "dodge",
  damage: "damage",
  block: "block",
  health: "health",
  luck: "luck",
  accuracy: "accuracy",
  attackSpeed: "attack speed",
};

export const SCREEN_WORDS = {
  /* 1. can I use it yet ─────────────────────────────────────────────────── */
  /** was "Needs bot level 10", which never said how far off you were */
  needLevel: "You need level {n}. You are level {have}. Win fights to go up.",
  /** was "You need {n} more coins." kept, because it already reads */
  needCoins: "You need {n} more coins.",
  /** was the bare button state "Bought today" with nothing said about where it went */
  boughtToday: "You bought this today. It is with your parts.",
  /** the buying rule, said once at the foot of the page */
  oncePerDay: "You can buy each part once a day.",

  /* 2. an empty shelf ───────────────────────────────────────────────────── */
  /** was "Nothing in this row today." even when the player's own filter did it */
  emptyFiltered: "No parts here match what you picked.",
  emptyToday: "No parts in this row today.",
  clearFilters: "Show everything again",

  /* 3. the stat a part leads on ─────────────────────────────────────────── */
  /** sits in front of the part's own leading stat, which is read off the
   * part's three numbers and so can never point at a strength it lacks */
  bestAt: "Best at",

  /* 4. the house ladder ─────────────────────────────────────────────────── */
  /** was "Tier 3 . about 47 points against Rusty Piston 7" */
  houseSized: "Sized to match {bot}. About size {n}.",
  housePick: "Pick your robot first. Then this one is sized to match it.",
  /** was "Spar" with the rule hidden in a hover title */
  sparNote: "A practice fight is free. Nothing is won and nothing breaks.",

  /* the junkyard's colour calendar ──────────────────────────────────────── */
  /** every one of these said "Tier 4", a rank word the model number replaced */
  t4Calendar: "THE 4 STAR PART, DAY BY DAY",
  t4Today: "Today's 4 star part is {name}, in {color}.",
  t4Tomorrow: "Tomorrow: 4 star {slot}.",
  t4Weapon: "Today's 4 star part is a weapon, so it has no colour.",
  t4Week: "This week's 4 star colour: {color}",
  colorOf: "{stars} today: {color}",
  /** was "no color" in lower case, which read like a value had gone missing */
  noColor: "No colour",
  /** the filter chip that turns the brand filter off */
  allBrands: "All makers",

  /* odds and ends the screens print ─────────────────────────────────────── */
  /** the one word for three numbers added up. Was "{n} pts", then
   * "{n} build points": three words for one number, in three files. */
  points: "Size {n}",
  /** the count beside a shop row, was a bare "3 / 8" */
  rowCount: "{shown} of {count} parts",
  rowCountOne: "{shown} of 1 part",
  /** the robot's own quality, was the "TIER 3" badge on the build readout */
  botClass: "{n} stars",
  botClassOne: "1 star",
  botNotReady: "Not ready",
  botEmptySlots: "{n} parts missing",
} as const;
