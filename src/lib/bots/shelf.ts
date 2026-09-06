/**
 * WHAT A ROBOT EARNED, as a list of rows a screen can draw.
 *
 * WHY THIS FILE EXISTS. A robot wears eight things it was never able to buy:
 * the chest stars, the stitched patches, the cuff bands, the sparkly eyes,
 * the winking face, the star eyes, a hat and the gold crown. Every one of
 * them is already decided somewhere: the ladder numbers and the one line that
 * says how each is earned live in ./look.ts, and the words a player reads
 * live in ./strings.ts. What was missing was the JOIN, so a screen had to
 * write out "wins >= 1" for itself and would have quietly disagreed with the
 * drawing the first time a ladder step moved.
 *
 * SO NOTHING IS DECIDED HERE. Every earned test reads a LookMarks that
 * ./look.ts computed with earnedMarks(), or a LookEarned field the server
 * filled from rows. Every earn sentence is the row's own, imported. This file
 * only puts a name beside a rule and says whether it happened yet.
 *
 * THE SERVER IS THE TRUTH (the ninth law). Nothing in here reads
 * localStorage, and nothing takes a count from the client: the LookEarned
 * handed in comes off a route that built it from the wallet's own rows
 * (_server/bots.ts earnedOf, from wins, lost fights, level, part rows, hat
 * rows and card rows). Handed nothing, every row is locked, which is the
 * honest answer for a page that has not been able to ask.
 *
 * NOTHING ON THIS LIST STOPS. The chest star row is drawn to six steps and
 * the plate then prints the win count; the patches are drawn to three and the
 * rest are counted in words. Both of those live in look.ts and are said in
 * the summary line above the list (markWords), which is why no row here
 * prints a count of its own: a number said twice is a number that can
 * disagree with itself.
 */

import {
  FACE_INDEX,
  HAT_EARN,
  HAT_INDEX,
  MARK_EARN,
  NOTHING_EARNED,
  earnedMarks,
  markWords,
  type HatWon,
  type LookEarned,
  type LookMarks,
} from "./look";
import { STRINGS, fill } from "./strings";

const t = STRINGS.en;

export type ShelfId =
  | "star"
  | "patch"
  | "cuff"
  | "sparkle"
  | "wink"
  | "starEyes"
  | "hat"
  | "crown";

export interface ShelfRow {
  id: ShelfId;
  /** the row's name, two or three words */
  name: string;
  /** the one line that says how it is earned, from the row's own table */
  earn: string;
  /** the server's rows say this robot has it */
  earned: boolean;
}

/**
 * THE LIST, in the order a robot earns it: the two things that happen in a
 * robot's first fight, then the two the level brings, then the two faces a
 * collection opens, then the two nobody can plan for.
 */
export function shelfRows(earned: LookEarned | null | undefined, marks?: LookMarks): ShelfRow[] {
  const e = earned ?? NOTHING_EARNED;
  const m = marks ?? earnedMarks(e);
  const hats: readonly HatWon[] = e.hats ?? [];
  return [
    { id: "star", name: t.earned.star, earn: MARK_EARN.star, earned: m.stars > 0 || m.goldStar },
    { id: "patch", name: t.earned.patch, earn: MARK_EARN.patch, earned: m.patches > 0 },
    { id: "cuff", name: t.earned.cuff, earn: MARK_EARN.cuff, earned: m.cuffs > 0 },
    { id: "sparkle", name: t.earned.sparkle, earn: MARK_EARN.sparkle, earned: m.sparkle },
    { id: "wink", name: t.earned.wink, earn: FACE_INDEX.wink.earn, earned: !!e.colourMatch },
    { id: "starEyes", name: t.earned.starEyes, earn: FACE_INDEX.stars.earn, earned: !!e.fourStar },
    { id: "hat", name: t.earned.hat, earn: HAT_EARN, earned: hats.length > 0 },
    { id: "crown", name: t.earned.crown, earn: MARK_EARN.crown, earned: m.crown },
  ];
}

/**
 * The one line above the list: what the robot has right now, in words.
 *
 * It is markWords() and nothing else, so the sentence that keeps counting
 * after the drawing runs out ("3 patches and 4 more") is the SAME sentence
 * everywhere. Empty means nothing has been earned yet, and the caller prints
 * the one line that says so rather than a row of zeroes.
 */
export function shelfSummary(marks: LookMarks, wins: number): string {
  return markWords(marks, wins).join(" ");
}

/** The one line for a robot with nothing on the list yet. */
export function shelfNothing(name: string): string {
  return fill(t.earned.nothing, { name });
}

/**
 * ONE HAT, IN WORDS: "blue bow", "yellow propeller".
 *
 * The colour goes first and both words are the plain ones a seven year old
 * already has (strings.ts paintName says "blue", never "sky"). A hat that
 * never recorded a colour is named by its kind alone, which is the true
 * answer for it: it has no colour of its own and wears the head's.
 *
 * THE COLOUR IS PART OF THE NAME because it is part of the hat. Six kinds in
 * eight colours is 48 hats, and a player who has won two bows has to be able
 * to tell which one they are putting on.
 */
export function hatName(h: HatWon): string {
  const kind = HAT_INDEX[h.kind]?.name;
  if (!kind) return "";
  return h.color ? fill(t.look.hatName, { color: t.paintName[h.color], kind: kind.toLowerCase() }) : kind;
}

/** The hats this robot's owner has won, by name, for the hat row. */
export function hatNames(hats: readonly HatWon[]): string[] {
  return hats.map(hatName).filter((n) => !!n);
}

/* ── what changed on the ladder, in words ────────────────────────────────── */

/**
 * THE STEPS A LADDER HAS ACTUALLY REACHED, drawn ones and counted ones both.
 *
 * A chest draws six stars and a body draws three patches, and after that the
 * ladder keeps climbing in a number. Anything comparing two moments of a
 * robot's life has to count what was reached and not what was drawn, or a
 * robot on its fortieth win would stop being told it had gained anything.
 */
export const starSteps = (m: LookMarks): number => m.stars + (m.goldStar ? 1 : 0) + m.starsBeyond;
export const patchCount = (m: LookMarks): number => m.patches + m.patchesBeyond;

/**
 * THE LINE OR TWO A ROBOT EARNED SINCE SOMEBODY LAST LOOKED.
 *
 * The Morning Paper is where a player finds out what happened while they were
 * away, and a star that appeared on a robot's chest overnight is exactly
 * that. Both moments are walked by look.ts (marksOf), so this only subtracts;
 * it cannot announce a step the ladder does not have.
 *
 * `wins` is the robot's win count NOW, because the sentence prints it: past
 * the last drawn star the number is the only place the count can live, which
 * is the same reason the plate prints it on the robot itself.
 */
export function markNews(name: string, wins: number, before: LookMarks, now: LookMarks): string[] {
  const out: string[] = [];
  const n = Math.max(0, Math.floor(Number(wins) || 0));
  const stars = starSteps(now) - starSteps(before);
  if (stars > 0) {
    if (now.goldStar && !before.goldStar) out.push(fill(t.news.goldStar, { name, n }));
    // one win is not "1 wins": the first step on the ladder is the robot's
    // first fight, so it gets the sentence that says so
    else if (stars === 1 && n === 1) out.push(fill(t.news.firstStar, { name }));
    else if (stars === 1) out.push(fill(t.news.star, { name, n }));
    else out.push(fill(t.news.stars, { name, x: stars, n }));
  }
  const patches = patchCount(now) - patchCount(before);
  if (patches === 1) out.push(fill(t.news.patch, { name }));
  else if (patches > 1) out.push(fill(t.news.patches, { name, n: patches }));
  return out;
}
